import {useEffect,useRef,useState} from 'react';
import {IsoInterface} from './Interface';
import {IsoWorld} from './world';
import {IsoSound} from './sound';
import {OBJECTS,doorFor,movePlayer,roomAt,withinReach,type ObjectId,type Point} from './map';
import {act,activeQuest,canIgnite,dropTorch,cctvDuration,getSave,lightTorch,isEvidence,newSave,pressLine,readSettings,recordEvidence,sanitizeSettings,SAVE_KEY,SETTINGS_KEY,write} from './state';
import type {CCTVView,DocumentView,Mode,Panel,Save,UIAction} from './contracts';

const startCCTV=():CCTVView=>({camera:'reception',tape:'shift',time:0,duration:24,playing:false,availableFuture:false,evidence:false,zoom:false});
const YAW=.69;
const ids=Object.keys(OBJECTS) as ObjectId[];
const START_YAW=-2.52; // facing the reception desk from the start position
const LOOK_RAD=.0021;

export default function IsoPage(){
  const canvas=useRef<HTMLCanvasElement>(null);
  const dispatch=useRef<(action:UIAction)=>void>(()=>{});
  const click=useRef<(event:{clientX:number;clientY:number})=>void>(()=>{});
  const activateAudio=useRef<()=>void>(()=>{});
  const [view,setView]=useState(()=>({mode:'loading' as Mode,panel:null as Panel|null,state:newSave(),settings:readSettings(),
    saved:!!getSave(),hint:'',notice:'',loading:'Администрация',cctv:startCCTV(),document:undefined as DocumentView|undefined,fp:{locked:false,stamina:1},markers:[] as {id:string;label:string;x:number;y:number;aimed:boolean}[]}));

  useEffect(()=>{
    const surface=canvas.current!;
    let world:IsoWorld|undefined,disposed=false,attempt=0,raf=0,previous=performance.now(),manual=false;
    const lifetime=new AbortController();
    let settings=readSettings(),mode:Mode='loading',panel:Panel|null=null,back:Panel|null=null,active=getSave(),state=active??newSave();
    let clock=0,noticeUntil=0,notice='',loading='Администрация',target:ObjectId|null=null,documentView:DocumentView|undefined;
    const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
    let markers:{id:ObjectId;x:number;y:number}[]=[],markClock=0,perf=coarse?1:0;
    let cctv=startCCTV(),saveClock=0,uiClock=0,walked=0,drawer=false;
    let direction:Point={x:0,z:1},speed=0;
    // First person: look angles, smoothed velocity, stance and stamina.
    let yaw=START_YAW,pitch=-.06,crouch=0,stamina=1,tired=false,vx=0,vz=0,locked=false,kick=1,press=1,sprinting=false,ignoreUnlock=false;
    const fpOn=()=>settings.view==='fps';
    // Touch controls: joystick vector, look drag accumulated between frames, run/crouch toggles.
    let tmx=0,tmz=0,tlx=0,tly=0,tsprint=false,tcrouch=false;
    const portraitBlocked=()=>coarse&&innerHeight>innerWidth;
    const unlockPointer=()=>{try{if(document.pointerLockElement===surface){ignoreUnlock=true;document.exitPointerLock();}}catch{/* not locked */}};
    const keys=new Set<string>(),sound=new IsoSound();
    const emit=()=>setView({mode,panel,state,settings,saved:!!active,hint:target?OBJECTS[target].label:'',notice,loading,
      cctv:{...cctv,availableFuture:state.items.includes('file'),evidence:isEvidence(cctv.camera,cctv.tape,cctv.time)},document:documentView,fp:{locked:locked||coarse,stamina},
      markers:markers.map(m=>({id:m.id,label:OBJECTS[m.id].label,x:m.x,y:m.y,aimed:m.id===target}))});
    const inform=(s:string)=>{notice=s;noticeUntil=clock+5.6;};
    const persist=()=>{
      if(mode!=='play'&&mode!=='complete')return;
      if(write(SAVE_KEY,state))active=state;
      else if(notice!=='Сохранение на устройстве недоступно.')inform('Сохранение на устройстве недоступно.');
    };
    const setPanel=(p:Panel|null)=>{
      panel=p;keys.clear();speed=0;vx=vz=0;
      if(p!==null)unlockPointer();
      if(p!=='document')drawer=false;
      if(p!=='cctv')cctv={...cctv,playing:false};
    };
    const apply=(result:ReturnType<typeof act>)=>{
      const changed=result.state!==state;
      state=result.state;
      if(result.message)inform(result.message);
      if(result.document)documentView=result.document;
      if(result.panel){
        if(result.panel==='cctv')cctv=startCCTV();
        setPanel(result.panel);
      }
      if(state.finished){mode='complete';setPanel(null);}
      if(changed)persist();
    };
    const use=(id:ObjectId|null)=>{
      if(!id||mode!=='play'||panel||!withinReach(id,state,fpOn()?.7:0))return;
      // Hand-held props are taken by the hand: reach, close the fingers, and only then does it count as picked up.
      if(id==='torch'&&world&&!state.items.includes('torch')){
        if(world.handPhase==='idle'&&!world.busy)world.beginPickup(()=>{commit('torch');sound.cue('ui',settings);});
        return;
      }
      // The lighter is taken out of the desk drawer by hand: the drawer slides open and the fingers close on it before it counts as found.
      if(id==='drawer'&&world&&!state.items.includes('lighter')){
        // The torch may already be in the right hand: the drawer is opened and the lighter taken with the other one.
        if((world.handPhase==='idle'||world.handPhase==='holding')&&!world.busy&&!world.beginLighter(()=>{commit('drawer');sound.cue('ui',settings);}))commit('drawer');
        return;
      }
      commit(id);
    };
    const drop=()=>{
      if(mode!=='play'||panel||!world||!state.items.includes('torch')||world.busy)return;
      world.beginDrop(pose=>{apply(dropTorch(state,pose));persist();emit();});
    };
    const commit=(id:ObjectId)=>{
      const before=state,after=act(state,id);
      kick=0;
      const door=doorFor[id];
      const kind=door&&after.state.doors[door]&&!before.doors[door]?'door':
        after.state.items.length>before.items.length?'pick-up':after.document?'examine':'interact';
      world?.actorAction(kind,OBJECTS[id]);
      sound.cue(kind==='door'?'door':id==='phone'?'phone':'ui',settings);
      const gotKey=(['technicalKey','archiveKey'] as const).some(k=>after.state.items.includes(k)&&!before.items.includes(k));
      if(gotKey)sound.jingle(1,settings);
      apply(after);drawer=id==='drawer'&&after.panel==='document';emit();
    };
    const flash=()=>{
      if(mode!=='play'||panel)return;
      if(!world)return;
      // F lights the torch with the lighter: the hands do it, and the torch counts as burning from the moment the flame catches.
      if(canIgnite(state)){
        if(!world.busy&&world.handPhase==='holding')world.beginIgnite(()=>{sound.cue('switch',settings);apply(lightTorch(state));persist();emit();});
        return;
      }
      apply(lightTorch(state));emit();
    };
    const start=(restore:boolean)=>{
      if(!world)return;
      state=restore&&active?active:newSave();
      if(coarse){try{void surface.parentElement?.requestFullscreen?.().catch(()=>{});void (screen.orientation as unknown as {lock?:(o:string)=>Promise<void>}).lock?.('landscape').catch(()=>{});}catch{/* optional */}}
      yaw=START_YAW;pitch=-.06;vx=vz=0;stamina=1;tired=false;
      world.syncPickups(state);
      world.onPropSettled=(id,pose)=>{if(!state.items.includes(id)){state={...state,props:{...state.props,[id]:pose}};persist();}};
      mode=state.finished?'complete':'play';target=null;notice='';setPanel(null);persist();emit();
    };
    async function load(){
      const id=++attempt;
      mode='loading';loading='Подготовка локации';emit();
      try{
        const next=await IsoWorld.create(surface,status=>{
          if(!disposed&&id===attempt){loading=status;emit();}
        },lifetime.signal);
        if(disposed||id!==attempt){next.dispose();return;}
        world?.dispose();world=next;world.onKeyClink=l=>sound.jingle(l,settings);mode='title';loading='';emit();
      }catch(error){
        if(disposed||id!==attempt)return;
        mode='error';loading=error instanceof Error?error.message:'Не удалось загрузить локацию';emit();
      }
    }
    const canMenu=()=>mode==='title'||mode==='play'||mode==='complete';
    dispatch.current=a=>{
      if(canMenu())void sound.unlock().catch(()=>{});
      if(a.type!=='interact'&&a.type!=='breaker')sound.cue('ui',settings);
      switch(a.type){
        case 'retry':if(mode==='error')void load();break;
        case 'start':
          if(mode==='title'){
            if(active&&panel!=='new-confirm')setPanel('new-confirm');else start(false);
          }
          break;
        case 'continue':if(mode==='title'&&active)start(true);break;
        case 'title':
          persist();mode='title';setPanel(null);notice='';target=null;break;
        case 'panel':
          if(a.panel==='pause'||a.panel==='inventory'||a.panel==='journal'){
            if(mode==='play'&&(panel===null||panel===a.panel))setPanel(panel===a.panel?null:a.panel);
          }else if(a.panel==='settings'||a.panel==='credits'){
            if(mode==='title'||panel==='pause'){back=panel;setPanel(a.panel);}
          }
          break;
        case 'resume':if(mode==='play')setPanel(null);break;
        case 'close':{const p=panel==='settings'||panel==='credits'?back:null;back=null;setPanel(p);break;}
        case 'settings':
          settings=sanitizeSettings({...settings,...a.patch});
          write(SETTINGS_KEY,settings);keys.clear();
          if(settings.view!=='fps')unlockPointer();
          break;
        case 'interact':use(target);return;
        case 'torch':flash();return;
        case 'drop':drop();return;
        case 'touch':
          if(a.move){tmx=a.move.x;tmz=a.move.z;}
          if(a.look){tlx+=a.look.dx;tly+=a.look.dy;}
          if(a.sprint!==undefined)tsprint=a.sprint;
          if(a.crouch!==undefined)tcrouch=a.crouch;
          return;
        case 'breaker':if(panel==='breaker'){sound.cue('switch',settings);apply(pressLine(state,a.line));}break;
        case 'reset-breaker':if(panel==='breaker'&&!state.power){state={...state,breaker:[]};persist();}break;
        case 'cctv-camera':if(panel==='cctv')cctv={...cctv,camera:a.camera};break;
        case 'cctv-tape':
          if(panel==='cctv'&&(a.tape==='shift'||state.items.includes('file'))){
            sound.cue('tape',settings);
            cctv={...cctv,tape:a.tape,time:0,duration:cctvDuration(a.tape),playing:false,
              camera:a.tape==='future'?'archive':'reception'};
          }
          break;
        case 'cctv-seek':if(panel==='cctv'&&Number.isFinite(a.time))cctv={...cctv,time:Math.min(cctv.duration,Math.max(0,a.time)),playing:false};break;
        case 'cctv-step':if(panel==='cctv')cctv={...cctv,time:Math.min(cctv.duration,Math.max(0,cctv.time+a.delta)),playing:false};break;
        case 'cctv-play':if(panel==='cctv')cctv={...cctv,time:cctv.time===cctv.duration?0:cctv.time,playing:!cctv.playing};break;
        case 'cctv-zoom':if(panel==='cctv')cctv={...cctv,zoom:!cctv.zoom};break;
        case 'archive-evidence':
          if(panel==='cctv'){
            sound.cue('tape',settings);cctv={...cctv,playing:false};
            apply(recordEvidence(state,cctv.camera,cctv.tape,cctv.time));
          }
          break;
        case 'fullscreen':
          if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});
          else void surface.parentElement?.requestFullscreen?.().catch(()=>{});
          break;
      }
      emit();
    };
    const unlock=()=>void sound.unlock().catch(()=>{});
    activateAudio.current=unlock;
    click.current=event=>{
      if(!canMenu())return;
      unlock();
      if(mode!=='play'||panel)return;
      if(fpOn()){
        if(coarse)return;
        if(document.pointerLockElement!==surface){try{void Promise.resolve(surface.requestPointerLock?.()).catch(()=>{});}catch{/* unsupported */}}
        else use(target);
        return;
      }
      use(world?.select(event,state)??null);
    };
    const keydown=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
      if(e.code==='Escape'){
        if(e.repeat)return;
        if(panel){e.preventDefault();dispatch.current({type:'close'});}
        else if(mode==='play'){e.preventDefault();dispatch.current({type:'panel',panel:'pause'});}
        return;
      }
      if(panel==='document'&&fpOn()&&e.code===settings.keys.interact){e.preventDefault();if(!e.repeat)dispatch.current({type:'close'});return;}
      if(panel||mode!=='play'||(e.target instanceof HTMLInputElement))return;
      if(e.code===settings.keys.light){e.preventDefault();if(!e.repeat)flash();return;}
      if(e.code==='KeyG'){e.preventDefault();if(!e.repeat)drop();return;}
      if(fpOn()&&e.code.startsWith('Arrow')){e.preventDefault();keys.add(e.code);return;}
      if(e.code==='Tab'||e.code==='KeyJ'||e.code===settings.keys.interact){
        e.preventDefault();if(e.repeat)return;
        if(e.code===settings.keys.interact)use(target);
        else dispatch.current({type:'panel',panel:e.code==='Tab'?'inventory':'journal'});
        return;
      }
      if(Object.values(settings.keys).includes(e.code)){e.preventDefault();keys.add(e.code);}
    };
    const keyup=(e:KeyboardEvent)=>{keys.delete(e.code);};
    const blur=()=>{keys.clear();speed=0;vx=vz=0;persist();};
    const mouse=(e:MouseEvent)=>{
      if(document.pointerLockElement!==surface||mode!=='play'||panel||!fpOn())return;
      const k=LOOK_RAD*settings.sensitivity;
      yaw-=e.movementX*k;
      pitch=Math.min(1.45,Math.max(-1.45,pitch-e.movementY*k));
    };
    const lockChange=()=>{
      locked=document.pointerLockElement===surface;
      if(!locked&&!ignoreUnlock&&mode==='play'&&!panel&&fpOn())dispatch.current({type:'panel',panel:'pause'});
      if(!locked)ignoreUnlock=false;
      emit();
    };
    const visibility=()=>{if(document.hidden)blur();};
    const available=(id:ObjectId)=>{
      if(id==='underDesk'&&(!state.dutyRead||state.items.includes('technicalKey')))return false;
      if(id==='vhs'&&state.items.includes('vhs'))return false;
      return !(id==='torch'&&state.items.includes('torch'));
    };
    const pick=()=>{
      let best=Infinity;let next:ObjectId|null=null;
      for(const id of ids){
        if(!withinReach(id,state)||!available(id))continue;
        const o=OBJECTS[id],dx=o.x-state.x,dz=o.z-state.z,len=Math.hypot(dx,dz);
        const facing=len<.025?1:(dx*direction.x+dz*direction.z)/len;
        const score=len-.31*facing-(id==='underDesk'?.23:0);
        if(score<best){best=score;next=id;}
      }
      return next;
    };
    const step=(dt:number,draw=true)=>{
      const gameplay=mode==='play'&&!panel&&!portraitBlocked();
      clock+=dt;
      if(gameplay&&world){
        const k=settings.keys,ax=Number(keys.has(k.right))-Number(keys.has(k.left)),az=Number(keys.has(k.down))-Number(keys.has(k.up));
        const mx=Math.max(-1,Math.min(1,ax+tmx)),mz=Math.max(-1,Math.min(1,az+tmz));
        press=Math.min(1,press+dt/.34);kick=Math.min(1,kick+dt/.6);
        if(fpOn()){
          // --- first person: look, stance, stamina, smoothed velocity and sliding collision ---
          yaw-=tlx*.0042*settings.sensitivity;pitch=Math.min(1.45,Math.max(-1.45,pitch-tly*.0042*settings.sensitivity));tlx=tly=0;
          yaw+=(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*1.9*dt*settings.sensitivity;
          pitch=Math.min(1.45,Math.max(-1.45,pitch+(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*1.4*dt*settings.sensitivity));
          crouch+=((keys.has(k.crouch)||tcrouch?1:0)-crouch)*(1-Math.exp(-dt*9));
          const sin=Math.sin(yaw),cos=Math.cos(yaw);
          let wx=-mz*sin-mx*cos,wz=-mz*cos+mx*sin;
          const m=Math.hypot(wx,wz),moving=m>.08;
          if(moving){const mag=Math.min(1,m);wx=wx/m*mag;wz=wz/m*mag;}else{wx=wz=0;}
          const wantsRun=(keys.has(k.sprint)||tsprint)&&moving&&mz<0&&crouch<.3&&!tired&&stamina>0;
          if(wantsRun){stamina=Math.max(0,stamina-dt*.2);if(stamina<=0)tired=true;}
          else{stamina=Math.min(1,stamina+dt*(moving?.1:.18));if(tired&&stamina>.3)tired=false;}
          const top=(wantsRun?2.7:crouch>.5?.85:1.4)*(mz>0?.7:1)*(mx&&!mz?.88:1);
          // A body has mass: a walk builds up over ~.4 s, a run over ~.6 s, and a stop takes a step or so.
          const speeding=Math.hypot(wx*top,wz*top)>Math.hypot(vx,vz);
          const rate=!moving?6.5:speeding?(wantsRun?3.2:5):7;
          const blend=1-Math.exp(-dt*rate);
          vx+=(wx*top-vx)*blend;vz+=(wz*top-vz)*blend;
          const p=movePlayer(state,vx*dt,vz*dt,world.walkableDoors);
          const moved=Math.hypot(p.x-state.x,p.z-state.z);
          speed=moved/Math.max(dt,1e-6);
          // A wall stops the matching velocity component so you do not keep "pushing" into it.
          if(dt>0&&moved<Math.hypot(vx,vz)*dt*.98){vx=(p.x-state.x)/dt;vz=(p.z-state.z)/dt;}
          if(moved>1e-8){state={...state,...p};walked+=moved;}
          direction={x:sin,z:cos};
          sprinting=wantsRun&&speed>1.8;
          const half=sprinting?1.05:crouch>.5?.6:.74;
          if(walked>half){
            walked-=half;
            sound.cue('step',settings,sprinting?1.45:crouch>.5?.45:1);
          }
        }else if(ax||az){
          const m=Math.hypot(ax,az);
          direction={x:(ax*Math.cos(YAW)+az*Math.sin(YAW))/m,z:(-ax*Math.sin(YAW)+az*Math.cos(YAW))/m};
          const max=keys.has(k.sprint)?2.9:1.3;
          const p=movePlayer(state,direction.x*max*dt,direction.z*max*dt,world.walkableDoors);
          const distance=Math.hypot(p.x-state.x,p.z-state.z);
          speed=distance/Math.max(dt,1e-6);
          if(distance>1e-8){state={...state,...p};walked+=distance;}
          const half=speed>2.15?1.1:.625;
          if(walked>half){walked-=half;sound.cue('step',settings);}
        }else speed=0;
        const near=fpOn()?(world.aimTarget(state,available)??null):pick();if(near!==target){target=near;emit();}
        if(fpOn()){
          markClock+=dt;
          if(markClock>.07){markClock=0;markers=world.markers(state,available).map(({id,x,y})=>({id,x,y}));emit();}
        }else if(markers.length){markers=[];emit();}
        saveClock+=dt;
        if(saveClock>1.25&&active!==state){saveClock=0;persist();}
      }else speed=0;
      if(panel==='cctv'&&cctv.playing){
        const t=Math.min(cctv.duration,cctv.time+dt);
        cctv={...cctv,time:t,playing:t<cctv.duration};uiClock+=dt;
        if(uiClock>=.075){uiClock=0;emit();}
      }
      if(notice&&clock>noticeUntil){notice='';emit();}
      const menu=mode==='title',paused=document.hidden||!!panel||mode==='complete';
      world?.animateDoors(state,paused?0:dt);
      if(!draw)return;
      sound.mix(settings,{paused,power:state.power,menu});
      if(!document.hidden&&(mode==='title'||mode==='play'||mode==='complete')){
        world?.render({state,settings,menu,paused,cctv:panel==='cctv'?cctv:null,time:clock,dt,perf,reading:panel==='document'&&fpOn(),
          direction,speed,target:panel?null:target,drawer,look:{yaw,pitch},crouch,sprint:sprinting,press,kick});
      }
    };
    // Heat: a phone or a laptop must not run flat out. Frames are paced (60 at most, 30 on phones and on the low setting), and a governor trades the
    // size of the low-resolution picture for speed when the frame time stays high, and gives it back when there is room.
    let govAcc=0,govN=0,govHold=0;
    const loop=(now:number)=>{
      const target=mode==='title'?30:(coarse||settings.quality==='low')?30:60;
      const minFrame=1000/target-2.5;
      if(!manual&&now-previous>=minFrame){
        const ms=now-previous;
        const dt=Math.min(.06,ms/1000);previous=now;
        if(mode==='play'&&!document.hidden){
          govAcc+=Math.min(ms,100);govN++;govHold=Math.max(0,govHold-ms);
          if(govN>=45){
            const avg=govAcc/govN,slow=avg>1000/target*1.28;
            if(slow&&perf<3&&govHold<=0){perf++;govHold=4000;}
            else if(!slow&&avg<1000/target*1.08&&perf>0&&govHold<=0){perf--;govHold=9000;}
            govAcc=0;govN=0;
          }
        }
        step(dt);
      }
      raf=requestAnimationFrame(loop);
    };
    // The page is a game, not a document: no text selection or copy menu on a long press, no pinch or double-tap zoom, no context menu.
    const block=(e:Event)=>{e.preventDefault();};
    const multi=(e:TouchEvent)=>{if(e.touches.length>1)e.preventDefault();};
    for(const type of ['contextmenu','selectstart','gesturestart','gesturechange','gestureend','dblclick','dragstart'])document.addEventListener(type,block,{passive:false});
    document.addEventListener('touchmove',multi,{passive:false});
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);
    window.addEventListener('blur',blur);window.addEventListener('pagehide',blur);
    document.addEventListener('mousemove',mouse);document.addEventListener('pointerlockchange',lockChange);
    document.addEventListener('visibilitychange',visibility);
    if(import.meta.env.DEV){
      const debug=window as unknown as Record<string,unknown>;
      debug.render_game_to_text=()=>JSON.stringify({mode,panel,room:roomAt(state.x,state.z),state,target,
        objective:activeQuest(state).id,cctv,render:world?.diagnostics()});
      debug.isoProjectTarget=(id:ObjectId)=>world?.projectTarget(id);
      debug.isoWorld=()=>world;
      debug.isoLook=(y:number,p:number)=>{yaw=y;pitch=p;};
      debug.isoSetState=(patch:Partial<Save>)=>{state={...state,...patch};emit();};
      debug.advanceTime=(ms:number)=>{
        if(!Number.isFinite(ms)||ms<0||ms>3000)throw RangeError('Expected 0..3000ms');
        manual=true;
        const frame=Math.min(ms/1000,1/60);
        for(let remain=ms/1000-frame;remain>1e-9;remain-=1/60)step(Math.min(remain,1/60),false);
        step(frame);
        emit();
      };
    }
    void load();raf=requestAnimationFrame(loop);
    return ()=>{
      disposed=true;lifetime.abort();cancelAnimationFrame(raf);world?.dispose();sound.dispose();
      for(const type of ['contextmenu','selectstart','gesturestart','gesturechange','gestureend','dblclick','dragstart'])document.removeEventListener(type,block);
      document.removeEventListener('touchmove',multi);
      window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);
      window.removeEventListener('blur',blur);window.removeEventListener('pagehide',blur);
      document.removeEventListener('mousemove',mouse);document.removeEventListener('pointerlockchange',lockChange);unlockPointer();
      document.removeEventListener('visibilitychange',visibility);
      if(import.meta.env.DEV){
        const debug=window as unknown as Record<string,unknown>;
        delete debug.render_game_to_text;delete debug.advanceTime;delete debug.isoProjectTarget;delete debug.isoSetState;delete debug.isoWorld;delete debug.isoLook;
      }
    };
  },[]);

  return <main className="iso-app" data-testid="iso-app" onPointerDownCapture={()=>activateAudio.current()}>
    <canvas ref={canvas} className="iso-world-canvas" aria-label="Изометрическая сцена 100GATE" onPointerDown={event=>click.current(event)}/>
    <IsoInterface {...view} onAction={action=>dispatch.current(action)}/>
  </main>;
}
