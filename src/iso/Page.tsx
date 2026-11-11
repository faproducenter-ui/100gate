import {useEffect,useRef,useState} from 'react';
import {IsoInterface} from './Interface';
import {IsoWorld} from './world';
import {IsoSound} from './sound';
import {OBJECTS,doorFor,movePlayer,roomAt,withinReach,type ObjectId,type Point} from './map';
import {act,activeQuest,cctvDuration,drainLight,getSave,toggleLight,isEvidence,newSave,pressLine,readSettings,recordEvidence,sanitizeSettings,SAVE_KEY,SETTINGS_KEY,write} from './state';
import type {CCTVView,DocumentView,Mode,Panel,Save,UIAction} from './contracts';

const startCCTV=():CCTVView=>({camera:'reception',tape:'shift',time:0,duration:24,playing:false,availableFuture:false,evidence:false,zoom:false});
const YAW=.69;
const ids=Object.keys(OBJECTS) as ObjectId[];

export default function IsoPage(){
  const canvas=useRef<HTMLCanvasElement>(null);
  const dispatch=useRef<(action:UIAction)=>void>(()=>{});
  const click=useRef<(event:{clientX:number;clientY:number})=>void>(()=>{});
  const activateAudio=useRef<()=>void>(()=>{});
  const [view,setView]=useState(()=>({mode:'loading' as Mode,panel:null as Panel|null,state:newSave(),settings:readSettings(),
    saved:!!getSave(),hint:'',notice:'',loading:'Администрация',cctv:startCCTV(),document:undefined as DocumentView|undefined}));

  useEffect(()=>{
    const surface=canvas.current!;
    let world:IsoWorld|undefined,disposed=false,attempt=0,raf=0,previous=performance.now(),manual=false;
    const lifetime=new AbortController();
    let settings=readSettings(),mode:Mode='loading',panel:Panel|null=null,back:Panel|null=null,active=getSave(),state=active??newSave();
    let clock=0,noticeUntil=0,notice='',loading='Администрация',target:ObjectId|null=null,documentView:DocumentView|undefined;
    let cctv=startCCTV(),lightClock=0,saveClock=0,uiClock=0,walked=0,drawer=false;
    let direction:Point={x:0,z:1},speed=0;
    const keys=new Set<string>(),sound=new IsoSound();
    const emit=()=>setView({mode,panel,state,settings,saved:!!active,hint:target?OBJECTS[target].label:'',notice,loading,
      cctv:{...cctv,availableFuture:state.items.includes('file'),evidence:isEvidence(cctv.camera,cctv.tape,cctv.time)},document:documentView});
    const inform=(s:string)=>{notice=s;noticeUntil=clock+5.6;};
    const persist=()=>{
      if(mode!=='play'&&mode!=='complete')return;
      if(write(SAVE_KEY,state))active=state;
      else if(notice!=='Сохранение на устройстве недоступно.')inform('Сохранение на устройстве недоступно.');
    };
    const setPanel=(p:Panel|null)=>{
      panel=p;keys.clear();speed=0;
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
      if(!id||mode!=='play'||panel||!withinReach(id,state))return;
      const before=state,after=act(state,id);
      const door=doorFor[id];
      const kind=door&&after.state.doors[door]&&!before.doors[door]?'door':
        after.state.items.length>before.items.length||after.state.spare>before.spare?'pick-up':after.document?'examine':'interact';
      world?.actorAction(kind,OBJECTS[id]);
      sound.cue(kind==='door'?'door':id==='phone'?'phone':'ui',settings);
      apply(after);drawer=id==='drawer'&&after.panel==='document';emit();
    };
    const flash=()=>{
      if(mode!=='play'||panel)return;
      const r=toggleLight(state);
      if(r.state!==state){sound.cue('switch',settings);world?.pressFlashlight();persist();}
      apply(r);emit();
    };
    const start=(restore:boolean)=>{
      if(!world)return;
      state=restore&&active?active:newSave();
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
        world?.dispose();world=next;mode='title';loading='';emit();
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
          write(SETTINGS_KEY,settings);keys.clear();break;
        case 'interact':use(target);return;
        case 'flashlight':flash();return;
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
      if(mode==='play'&&!panel)use(world?.select(event,state)??null);
    };
    const keydown=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
      if(e.code==='Escape'){
        if(e.repeat)return;
        if(panel){e.preventDefault();dispatch.current({type:'close'});}
        else if(mode==='play'){e.preventDefault();dispatch.current({type:'panel',panel:'pause'});}
        return;
      }
      if(panel||mode!=='play'||(e.target instanceof HTMLInputElement))return;
      if(e.code==='KeyF'){e.preventDefault();if(!e.repeat)flash();return;}
      if(e.code==='Tab'||e.code==='KeyJ'||e.code===settings.keys.interact){
        e.preventDefault();if(e.repeat)return;
        if(e.code===settings.keys.interact)use(target);
        else dispatch.current({type:'panel',panel:e.code==='Tab'?'inventory':'journal'});
        return;
      }
      if(Object.values(settings.keys).includes(e.code)){e.preventDefault();keys.add(e.code);}
    };
    const keyup=(e:KeyboardEvent)=>{keys.delete(e.code);};
    const blur=()=>{keys.clear();speed=0;persist();};
    const visibility=()=>{if(document.hidden)blur();};
    const pick=()=>{
      let best=Infinity;let next:ObjectId|null=null;
      for(const id of ids){
        if(!withinReach(id,state))continue;
        if(id==='underDesk'&&(!state.dutyRead||state.items.includes('technicalKey')))continue;
        if(id==='vhs'&&state.items.includes('vhs'))continue;
        if(id==='flashlight'&&state.items.includes('flashlight'))continue;
        if(id.startsWith('battery')&&state.taken.includes(id))continue;
        const o=OBJECTS[id],dx=o.x-state.x,dz=o.z-state.z,len=Math.hypot(dx,dz);
        const facing=len<.025?1:(dx*direction.x+dz*direction.z)/len;
        const score=len-.31*facing-(id==='underDesk'?.23:0);
        if(score<best){best=score;next=id;}
      }
      return next;
    };
    const step=(dt:number,draw=true)=>{
      const gameplay=mode==='play'&&!panel;
      clock+=dt;
      if(gameplay&&world){
        const k=settings.keys,ax=Number(keys.has(k.right))-Number(keys.has(k.left)),az=Number(keys.has(k.down))-Number(keys.has(k.up));
        if(ax||az){
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
        if(state.lightOn){
          const before=state.charge;
          apply(drainLight(state,dt));
          lightClock+=dt;
          if(lightClock>.5||Math.ceil(before/5)!==Math.ceil(state.charge/5)){lightClock=0;emit();}
        }
        const near=pick();if(near!==target){target=near;emit();}
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
        world?.render({state,settings,menu,paused,cctv:panel==='cctv'?cctv:null,time:clock,dt,
          direction,speed,target:panel?null:target,drawer});
      }
    };
    const loop=(now:number)=>{
      // Slow title drift doesn't need 60 full environment/shadow redraws.
      const minFrame=mode==='title'?32:settings.quality==='low'?22:0;
      if(!manual&&now-previous>=minFrame){
        const dt=Math.min(.06,(now-previous)/1000);previous=now;
        step(dt);
      }
      raf=requestAnimationFrame(loop);
    };
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);
    window.addEventListener('blur',blur);window.addEventListener('pagehide',blur);
    document.addEventListener('visibilitychange',visibility);
    if(import.meta.env.DEV){
      const debug=window as unknown as Record<string,unknown>;
      debug.render_game_to_text=()=>JSON.stringify({mode,panel,room:roomAt(state.x,state.z),state,target,
        objective:activeQuest(state).id,cctv,render:world?.diagnostics()});
      debug.isoProjectTarget=(id:ObjectId)=>world?.projectTarget(id);
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
      window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);
      window.removeEventListener('blur',blur);window.removeEventListener('pagehide',blur);
      document.removeEventListener('visibilitychange',visibility);
      if(import.meta.env.DEV){
        const debug=window as unknown as Record<string,unknown>;
        delete debug.render_game_to_text;delete debug.advanceTime;delete debug.isoProjectTarget;delete debug.isoSetState;
      }
    };
  },[]);

  return <main className="iso-app" data-testid="iso-app" onPointerDownCapture={()=>activateAudio.current()}>
    <canvas ref={canvas} className="iso-world-canvas" aria-label="Изометрическая сцена 100GATE" onPointerDown={event=>click.current(event)}/>
    <IsoInterface {...view} onAction={action=>dispatch.current(action)}/>
  </main>;
}
