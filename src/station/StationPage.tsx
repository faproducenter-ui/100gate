import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {StationWorld} from './world';
import {LoadingController} from '../boot/loading';
import {LoadingScreen} from '../boot/screen';
import {ITEM_INFO,ITEM_NAMES,LOCKS,SPOTS,STATION_SAVE,aimSpot,carryOver,newStationSave,readStation,tryCode,useSpot,type Doc,type LockId,type Outcome,type StationSave} from './state';
import {getSave,readSettings,sanitizeSettings,SETTINGS_KEY,write} from '../iso/state';
import {ActionButton,CamOverlay,InventoryCloth,Modal,Options} from '../iso/Interface';
import type {Settings,UIAction} from '../iso/contracts';
import '../iso/interface.css';
import {IsoSound} from '../iso/sound';
import './station.css';

const LOOK_RAD=.0021;
/** On the step of the house by the road, just out of the administration's exit door, facing the station (east). */
const START={x:-17.2,y:4.4,yaw:-Math.PI/2};

/** The same panels as in the administration: pause, its settings, the bag on Tab; plus the street's code locks. */
type Panel=LockId|'pause'|'settings'|'inventory';
type View={mode:'loading'|'play'|'error';status:string;hint:string;notice:string;doc?:Doc;panel?:Panel;code:string;locked:boolean;charge:number;dead:boolean;settings:Settings;items:string[]};

export default function StationPage(){
  const canvas=useRef<HTMLCanvasElement>(null);
  const api=useRef<{code:(d:string)=>void;closeDoc:()=>void;restart:()=>void;act:(a:UIAction)=>void}>({code:()=>{},closeDoc:()=>{},restart:()=>{},act:()=>{}});
  const [view,setView]=useState<View>({mode:'loading',status:'',hint:'',notice:'',code:'',locked:false,charge:100,dead:false,settings:readSettings(),items:[]});

  useEffect(()=>{
    const surface=canvas.current!;
    let settings=readSettings();
    const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
    const sound=new IsoSound();
    let world:StationWorld|undefined,disposed=false,raf=0,prev=performance.now();
    // the hero comes out of the administration with what he had there: the torch (burning or not), the lighter, the battery, the camcorder's charge
    let save:StationSave=carryOver(readStation(localStorage.getItem(STATION_SAVE))??newStationSave(START.x,START.y,START.yaw),getSave());
    const restart=()=>{
      const fresh=carryOver(newStationSave(START.x,START.y,START.yaw),getSave());
      try{localStorage.setItem(STATION_SAVE,JSON.stringify({...fresh,charge:100}));}catch{/* */}
      location.reload();
    };
    let v:View={mode:'loading',status:'',hint:'',notice:'',code:'',locked:false,charge:100,dead:false,settings,items:[]};
    let kneel=0;
    let yaw=save.yaw,pitch=-.04,vx=0,vy=0,crouch=0,walked=0,bobT=0,noticeUntil=0,clock=0,saveClock=0;
    let aimed:string|undefined,floorY=0,running=false;
    const keys=new Set<string>();
    const emit=(patch:Partial<View>={})=>{v={...v,items:save.items,...patch};setView(v);};
    const persist=()=>{try{localStorage.setItem(STATION_SAVE,JSON.stringify({...save,yaw}));}catch{/* storage unavailable */}};
    const inform=(s:string)=>{noticeUntil=clock+5;emit({notice:s});};
    const paused=()=>v.mode!=='play'||!!v.doc||!!v.panel;
    const apply=(o:Outcome)=>{
      save=o.save;
      if(o.got)sound.jingle(1,settings);
      if(o.door&&world){const open=world.toggleDoor(o.door);sound.cue('door',settings);if(!open)inform('');}
      if(o.notice)inform(o.notice);
      if(o.doc){emit({doc:o.doc});unlock();}
      if(o.panel){emit({panel:o.panel,code:''});unlock();}
      persist();
    };
    const unlock=()=>{try{if(document.pointerLockElement===surface)document.exitPointerLock();}catch{/* */}};
    const lock=()=>{try{void Promise.resolve(surface.requestPointerLock?.()).catch(()=>{});}catch{/* */}};
    api.current={
      code:d=>{
        const lock=v.panel;
        if(!lock||lock==='pause'||lock==='settings'||lock==='inventory')return;
        if(d==='back'){emit({code:v.code.slice(0,-1)});return;}
        if(d==='close'){emit({panel:undefined,code:''});if(!coarse)lock2();return;}
        const len=LOCKS[lock].code.length,code=(v.code+d).slice(0,len);emit({code});sound.cue('ui',settings);
        if(code.length===len){const o=tryCode(save,lock,code);emit({panel:undefined,code:''});apply(o);if(o.save.open?.includes(lock))sound.cue('switch',settings);if(!o.doc&&!coarse)lock2();}
      },
      closeDoc:()=>{emit({doc:undefined});if(!coarse)lock();},
      restart,
      act:a=>{
        void sound.unlock().catch(()=>{});
        if(a.type!=='settings')sound.cue('ui',settings);
        switch(a.type){
          case 'resume':emit({panel:undefined});if(!coarse)lock();break;
          case 'close':{const back=v.panel==='settings'?'pause':undefined;emit({panel:back});if(!back&&!coarse)lock();break;}
          case 'panel':
            if(a.panel==='settings'&&v.panel==='pause')emit({panel:'settings'});
            else if(a.panel==='inventory'||a.panel==='pause'){if(!v.panel){emit({panel:a.panel});unlock();}else if(v.panel===a.panel){emit({panel:undefined});if(!coarse)lock();}}
            break;
          case 'settings':settings=sanitizeSettings({...settings,...a.patch});write(SETTINGS_KEY,settings);keys.clear();emit({settings});break;
          case 'title':persist();location.href=import.meta.env.BASE_URL;break;
          case 'fullscreen':
            if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});
            else void surface.parentElement?.requestFullscreen?.().catch(()=>{});
            break;
          default:break;
        }
      },
    };
    const use=()=>{if(!aimed||paused())return;apply(useSpot(save,aimed,save));};
    const lock2=()=>lock();
    const has=(i:string)=>save.items.includes(i);
    /** F: the hands light the torch with the lighter, as indoors. */
    const ignite=()=>{
      if(!has('torch'))return inform('У тебя нет факела.');
      if(save.lit)return inform('Факел уже горит.');
      if(!has('lighter'))return inform('Нечем поджечь факел. Нужна зажигалка.');
      world?.ignite(()=>{save={...save,lit:true};sound.cue('switch',settings);inform('Факел разгорелся.');persist();});
    };
    /** B: a fresh battery into the camcorder. */
    const swapBattery=()=>{
      if(!has('battery'))return inform('Запасной батареи нет.');
      if(save.charge>85)return inform('Батарея в камере ещё хорошая.');
      save={...save,items:save.items.filter(i=>i!=='battery'),charge:100};sound.batterySwap(settings);inform('Батарея заменена. Заряд 100%.');emit({charge:100});persist();
    };
    const keydown=(e:KeyboardEvent)=>{
      if(e.ctrlKey||e.metaKey||e.altKey)return;
      if(e.code==='Tab'&&(v.panel==='inventory'||(!v.panel&&!v.doc&&v.mode==='play'&&!v.dead))){e.preventDefault();if(!e.repeat)api.current.act({type:'panel',panel:'inventory'});return;}
      if(v.panel==='pause'||v.panel==='settings'||v.panel==='inventory'){
        if(e.code==='Escape'){e.preventDefault();if(!e.repeat)api.current.act(v.panel==='pause'?{type:'resume'}:{type:'close'});}
        return;
      }
      if(v.panel){
        if(/^(Digit|Numpad)\d$/.test(e.code)){e.preventDefault();api.current.code(e.code.slice(-1));}
        else if(e.code==='Backspace'){e.preventDefault();api.current.code('back');}
        else if(e.code==='Escape'){e.preventDefault();api.current.code('close');}
        return;
      }
      if(v.doc&&(e.code==='Escape'||e.code===settings.keys.interact)){e.preventDefault();if(!e.repeat)api.current.closeDoc();return;}
      if(e.code==='Escape'&&v.mode==='play'){e.preventDefault();if(!e.repeat)api.current.act({type:'panel',panel:'pause'});return;}
      if(paused())return;
      if(e.code===settings.keys.interact){e.preventDefault();if(!e.repeat)use();return;}
      if(e.code===settings.keys.light){e.preventDefault();if(!e.repeat)ignite();return;}
      if(e.code==='KeyB'){e.preventDefault();if(!e.repeat)swapBattery();return;}
      if(Object.values(settings.keys).includes(e.code)){e.preventDefault();keys.add(e.code);}
    };
    const keyup=(e:KeyboardEvent)=>keys.delete(e.code);
    const mouse=(e:MouseEvent)=>{
      if(document.pointerLockElement!==surface||paused())return;
      const k=LOOK_RAD*settings.sensitivity;yaw-=e.movementX*k;pitch=Math.min(1.45,Math.max(-1.45,pitch-e.movementY*k));
    };
    const lockChange=()=>{
      const l=document.pointerLockElement===surface;emit({locked:l});
      // losing the mouse mid-play pauses, but only once the player had it (the first click takes it)
      if(!l&&had&&v.mode==='play'&&!v.doc&&!v.panel&&!v.dead)emit({panel:'pause'});
      if(l)had=true;
    };
    let had=false;
    const click=()=>{void sound.unlock().catch(()=>{});if(v.mode==='play'&&!paused()){if(document.pointerLockElement!==surface&&!coarse)lock();else use();}};
    const blur=()=>{keys.clear();persist();};
    surface.addEventListener('click',click);
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
    document.addEventListener('mousemove',mouse);document.addEventListener('pointerlockchange',lockChange);

    const step=(dt:number)=>{
      clock+=dt;
      if(v.notice&&clock>noticeUntil)emit({notice:''});
      if(!world)return;
      const w=world,g=w.walk;
      if(!paused()&&!v.dead&&save.charge>0){
        const before=Math.ceil(save.charge);save={...save,charge:Math.max(0,save.charge-dt*.1)};
        if(Math.ceil(save.charge)!==before)emit({charge:save.charge});
        if(save.charge<=0){sound.batteryDead(settings);emit({dead:true,charge:0});unlock();}
      }
      if(!paused()&&!v.dead){
        const k=settings.keys,ax=Number(keys.has(k.right))-Number(keys.has(k.left)),az=Number(keys.has(k.down))-Number(keys.has(k.up));
        crouch+=((keys.has(k.crouch)?1:0)-crouch)*(1-Math.exp(-dt*9));
        // Blender ground plane: looking along yaw means direction (-sin yaw, cos yaw)
        const fx=-Math.sin(yaw),fy=Math.cos(yaw),rx=Math.cos(yaw),ry=Math.sin(yaw);
        let wx=-az*fx+ax*rx,wy=-az*fy+ax*ry;const m=Math.hypot(wx,wy);
        if(m>1){wx/=m;wy/=m;}
        const run=keys.has(k.sprint)&&az<0&&crouch<.3;running=run;
        const top=run?2.6:crouch>.5?.85:1.4;
        const blend=1-Math.exp(-dt*(m>.05?5.5:7));
        vx+=(wx*top-vx)*blend;vy+=(wy*top-vy)*blend;
        const p=g.move(save,vx*dt,vy*dt),moved=Math.hypot(p.x-save.x,p.y-save.y);
        if(dt>0&&moved<Math.hypot(vx,vy)*dt*.98){vx=(p.x-save.x)/dt;vy=(p.y-save.y)/dt;}
        if(moved>1e-7){save={...save,x:p.x,y:p.y};walked+=moved;bobT+=moved*(run?1.9:2.3);}
        const stride=run?1.05:crouch>.5?.6:.74;
        if(walked>stride){walked-=stride;sound.cue('step',settings,run?1.4:crouch>.5?.45:1);}
        const a=aimSpot(save,{x:fx,y:fy})?.id;
        if(a!==aimed){aimed=a;emit({hint:a?(aimSpotLabel(a)):''});}
        saveClock+=dt;if(saveClock>2){saveClock=0;persist();}
      }
      const floor=g.floor(save.x,save.y)??0;
      floorY+=(floor-floorY)*(1-Math.exp(-dt*12));
      sound.mix(settings,{paused:paused(),power:false,menu:v.mode!=='play'});
      w.resize(surface.clientWidth,surface.clientHeight,settings);
      const kw=v.panel==='inventory'?1:0;kneel+=(kw-kneel)*Math.min(1,dt*(kw?4.5:5.5));if(Math.abs(kw-kneel)<.004)kneel=kw;
      w.render({kneel,dt,time:clock,x:save.x,y:save.y,floor:floorY,yaw,pitch,speed:paused()?0:Math.hypot(vx,vy),sprint:running,crouch,
        torch:has('torch'),lit:save.lit,charge:save.charge,settings});
      if(firstFrame){firstFrame=false;requestAnimationFrame(()=>{if(disposed)return;boot.done('frame');bootScreen?.finish();});}
    };
    const loop=(now:number)=>{
      const dt=Math.min(.06,(now-prev)/1000);
      if(now-prev>=1000/(coarse||settings.quality==='low'?30:60)-2.5){prev=now;if(!document.hidden)step(dt);}
      raf=requestAnimationFrame(loop);
    };
    const bootScreen=LoadingScreen.attach();
    let firstFrame=false,attempt=0,boot=new LoadingController();
    const load=()=>{
      const id=++attempt;
      const ctl=boot=new LoadingController();
      ctl.plan([
        {id:'data',label:'Загрузка карты',weight:.5},
        {id:'models',label:'Загрузка моделей',weight:6},
        {id:'walk',label:'Загрузка карты проходимости',weight:.5},
        {id:'viewmodel',label:'Загрузка рук и факела',weight:1,optional:true},
        {id:'world',label:'Сборка локации',weight:1.5},
        {id:'shaders',label:'Компиляция шейдеров',weight:1},
        {id:'frame',label:'Первый кадр',weight:.3},
      ]);
      bootScreen?.bind(ctl);
      let made:StationWorld|undefined;
      void StationWorld.create(surface,ctl).then(async w=>{
        made=w;
        if(disposed||id!==attempt){w.dispose();return;}
        for(const [door,open] of Object.entries(save.doors))if(open)w.toggleDoor(door);
        const safe=w.walk.nearestStand(save.x,save.y)??w.walk.nearestStand(START.x,START.y);
        if(safe)save={...save,...safe};
        floorY=w.walk.floor(save.x,save.y)??0;
        await w.warmup(ctl);
        if(disposed||id!==attempt){w.dispose();return;}
        world=w;ctl.start('frame');firstFrame=true;
        emit({mode:'play',status:'',charge:save.charge,dead:save.charge<=0});
      }).catch(e=>{
        if(disposed||id!==attempt)return;
        made?.dispose();
        emit({mode:'error',status:e instanceof Error?e.message:'Не удалось загрузить локацию'});
        const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
        bootScreen?.error(offline?'Нет соединения с интернетом. Проверьте сеть и попробуйте ещё раз.':'Не удалось загрузить локацию. Попробуйте ещё раз.',load);
      });
    };
    load();
    raf=requestAnimationFrame(loop);
    if(import.meta.env.DEV){
      const dbg=window as unknown as Record<string,unknown>;
      dbg.stationState=()=>({save,yaw,pitch,aimed,view:v});
      dbg.stationTeleport=(x:number,y:number,ny?:number,np?:number)=>{save={...save,x,y};if(ny!==undefined)yaw=ny;if(np!==undefined)pitch=np;};
      dbg.stationWorld=()=>world;
    }
    return ()=>{
      disposed=true;cancelAnimationFrame(raf);persist();world?.dispose();sound.dispose();unlock();
      surface.removeEventListener('click',click);
      window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);
      document.removeEventListener('mousemove',mouse);document.removeEventListener('pointerlockchange',lockChange);
    };
  },[]);

  const a=api.current;
  const coarseUI=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
  return <main className="station-app">
    <canvas ref={canvas} className="station-canvas" aria-label="Заправка во Флориде"/>
    {view.mode==='play'&&<>
      <div className="iso-ui" style={{['--iso-text' as string]:view.settings.textScale}} data-motion={view.settings.motion?'on':'off'} data-flicker={view.settings.reducedFlicker?'reduced':'normal'}>
        <div className="iso-hud" data-view="fps">
          <CamOverlay charge={view.charge}/>
          {!view.panel&&!view.doc&&<div className="iso-crosshair" data-active={!!view.hint} aria-hidden="true"/>}
          {!coarseUI&&!view.locked&&!view.panel&&!view.doc&&!view.dead&&<p className="iso-lockhint" role="status">Нажмите на экран, чтобы управлять камерой мышью</p>}
        </div>
        {view.panel==='inventory'&&<InventoryCloth items={view.items.map(id=>({id,name:ITEM_NAMES[id]??id,description:ITEM_INFO[id]??''}))} charge={view.charge} close={()=>a.act({type:'close'})}/>}
        {view.panel==='pause'&&<Modal key="pause" title="Пауза" testId="iso-pause" onClose={()=>a.act({type:'resume'})}>
          <div className="iso-modal-actions">
            <ActionButton act={a.act} action={{type:'resume'}}>Продолжить</ActionButton>
            <ActionButton act={a.act} action={{type:'panel',panel:'settings'}}>Настройки</ActionButton>
            <ActionButton act={a.act} action={{type:'title'}}>В главное меню</ActionButton>
          </div>
        </Modal>}
        {view.panel==='settings'&&<Modal key="settings" title="Настройки" testId="iso-settings" variant="iso-settings-shell" onClose={()=>a.act({type:'close'})}>
          <Options settings={view.settings} act={a.act}/>
        </Modal>}
      </div>
      {view.dead&&<div className="iso-dead" role="alert"><div className="iso-dead-noise"/><p><b>ЗАРЯД НА КАМЕРЕ РАЗРЯЖЕН</b><span>Без записи здесь нечем смотреть.</span></p>
        <div className="iso-dead-actions"><button type="button" onClick={()=>a.restart()}>Начать заново</button><a href={import.meta.env.BASE_URL}><button type="button">В меню</button></a></div></div>}
      {view.hint&&!view.doc&&!view.panel&&<p className="station-hint">[E] {view.hint}</p>}
      {view.notice&&<p className="station-notice" role="status">{view.notice}</p>}
      {view.doc&&<div className="station-doc" role="dialog" aria-label={view.doc.title} onClick={()=>a.closeDoc()}>
        <article><h2>{view.doc.title}</h2>{view.doc.text.split('\n').map((l,i)=><p key={i}>{l}</p>)}<small>[E] закрыть</small></article>
      </div>}
      {view.panel&&view.panel!=='pause'&&view.panel!=='settings'&&view.panel!=='inventory'&&<div className="station-doc" role="dialog" aria-label={LOCKS[view.panel].title} data-testid="station-keypad">
        <article className="station-safe"><h2>{LOCKS[view.panel].title}</h2><p className="station-code">{view.code.padEnd(LOCKS[view.panel].code.length,'·')}</p>
          <p className="station-lock-hint">{LOCKS[view.panel].hint}</p>
          <div className="station-pad">{['1','2','3','4','5','6','7','8','9','back','0','close'].map(d=>
            <button key={d} type="button" onClick={()=>a.code(d)}>{d==='back'?'←':d==='close'?'✕':d}</button>)}</div>
        </article>
      </div>}
    </>}
  </main>;
}

const aimSpotLabel=(id:string)=>SPOTS.find(s=>s.id===id)?.label??id;
