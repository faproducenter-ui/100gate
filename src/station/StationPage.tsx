import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {StationWorld} from './world';
import {LOCKS,SPOTS,STATION_SAVE,aimSpot,newStationSave,readStation,tryCode,useSpot,type Doc,type LockId,type Outcome,type StationSave} from './state';
import {readSettings} from '../iso/state';
import {IsoSound} from '../iso/sound';
import './station.css';

const LOOK_RAD=.0021,EYE=1.62,CROUCH_EYE=1.02;
/** On the step of the house by the road, just out of the administration's exit door, facing the station (east). */
const START={x:-17.2,y:4.4,yaw:-Math.PI/2};

type View={mode:'loading'|'ready'|'play'|'error';status:string;hint:string;notice:string;doc?:Doc;panel?:LockId|'pause';code:string;locked:boolean;torch:boolean};

export default function StationPage(){
  const canvas=useRef<HTMLCanvasElement>(null);
  const api=useRef<{code:(d:string)=>void;closeDoc:()=>void;resume:()=>void;start:()=>void}>({code:()=>{},closeDoc:()=>{},resume:()=>{},start:()=>{}});
  const [view,setView]=useState<View>({mode:'loading',status:'Заправка',hint:'',notice:'',code:'',locked:false,torch:false});

  useEffect(()=>{
    const surface=canvas.current!;
    const settings=readSettings();
    const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
    const sound=new IsoSound();
    let world:StationWorld|undefined,disposed=false,raf=0,prev=performance.now();
    let save:StationSave=readStation(localStorage.getItem(STATION_SAVE))??newStationSave(START.x,START.y,START.yaw);
    let v:View={mode:'loading',status:'Заправка',hint:'',notice:'',code:'',locked:false,torch:false};
    let yaw=save.yaw,pitch=-.04,vx=0,vy=0,crouch=0,walked=0,bobT=0,noticeUntil=0,clock=0,saveClock=0;
    let aimed:string|undefined;
    const keys=new Set<string>();
    const emit=(patch:Partial<View>={})=>{v={...v,...patch};setView(v);};
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
        if(!lock||lock==='pause')return;
        if(d==='back'){emit({code:v.code.slice(0,-1)});return;}
        if(d==='close'){emit({panel:undefined,code:''});if(!coarse)lock2();return;}
        const len=LOCKS[lock].code.length,code=(v.code+d).slice(0,len);emit({code});sound.cue('ui',settings);
        if(code.length===len){const o=tryCode(save,lock,code);emit({panel:undefined,code:''});apply(o);if(o.save.open?.includes(lock))sound.cue('switch',settings);if(!o.doc&&!coarse)lock2();}
      },
      closeDoc:()=>{emit({doc:undefined});if(!coarse)lock();},
      resume:()=>{emit({panel:undefined});if(!coarse)lock();},
      start:()=>{void sound.unlock().catch(()=>{});emit({mode:'play'});if(!coarse)lock();},
    };
    const use=()=>{if(!aimed||paused())return;apply(useSpot(save,aimed,save));};
    const lock2=()=>lock();
    const keydown=(e:KeyboardEvent)=>{
      if(e.ctrlKey||e.metaKey||e.altKey)return;
      if(v.panel&&v.panel!=='pause'){
        if(/^(Digit|Numpad)\d$/.test(e.code)){e.preventDefault();api.current.code(e.code.slice(-1));}
        else if(e.code==='Backspace'){e.preventDefault();api.current.code('back');}
        else if(e.code==='Escape'){e.preventDefault();api.current.code('close');}
        return;
      }
      if(v.doc&&(e.code==='Escape'||e.code===settings.keys.interact)){e.preventDefault();if(!e.repeat)api.current.closeDoc();return;}
      if(e.code==='Escape'&&v.mode==='play'){e.preventDefault();if(v.panel==='pause')api.current.resume();else{emit({panel:'pause'});unlock();}return;}
      if(paused())return;
      if(e.code===settings.keys.interact){e.preventDefault();if(!e.repeat)use();return;}
      if(e.code===settings.keys.light){e.preventDefault();if(!e.repeat){emit({torch:!v.torch});sound.cue('switch',settings,.6);}return;}
      if(Object.values(settings.keys).includes(e.code)){e.preventDefault();keys.add(e.code);}
    };
    const keyup=(e:KeyboardEvent)=>keys.delete(e.code);
    const mouse=(e:MouseEvent)=>{
      if(document.pointerLockElement!==surface||paused())return;
      const k=LOOK_RAD*settings.sensitivity;yaw-=e.movementX*k;pitch=Math.min(1.45,Math.max(-1.45,pitch-e.movementY*k));
    };
    const lockChange=()=>{
      const l=document.pointerLockElement===surface;emit({locked:l});
      if(!l&&v.mode==='play'&&!v.doc&&!v.panel)emit({panel:'pause'});
    };
    const click=()=>{if(v.mode==='play'&&!paused()){if(document.pointerLockElement!==surface&&!coarse)lock();else use();}};
    const blur=()=>{keys.clear();persist();};
    surface.addEventListener('click',click);
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
    document.addEventListener('mousemove',mouse);document.addEventListener('pointerlockchange',lockChange);

    const step=(dt:number)=>{
      clock+=dt;
      if(v.notice&&clock>noticeUntil)emit({notice:''});
      if(!world)return;
      const w=world,g=w.walk;
      if(!paused()){
        const k=settings.keys,ax=Number(keys.has(k.right))-Number(keys.has(k.left)),az=Number(keys.has(k.down))-Number(keys.has(k.up));
        crouch+=((keys.has(k.crouch)?1:0)-crouch)*(1-Math.exp(-dt*9));
        // Blender ground plane: looking along yaw means direction (-sin yaw, cos yaw)
        const fx=-Math.sin(yaw),fy=Math.cos(yaw),rx=Math.cos(yaw),ry=Math.sin(yaw);
        let wx=-az*fx+ax*rx,wy=-az*fy+ax*ry;const m=Math.hypot(wx,wy);
        if(m>1){wx/=m;wy/=m;}
        const run=keys.has(k.sprint)&&az<0&&crouch<.3;
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
      eyeY+=(floor+T.MathUtils.lerp(EYE,CROUCH_EYE,crouch)-eyeY)*(1-Math.exp(-dt*12));
      const speed=Math.hypot(vx,vy),bob=settings.motion?Math.sin(bobT*Math.PI)*.025*Math.min(1,speed/1.4):0;
      sound.mix(settings,{paused:paused(),power:false,menu:v.mode!=='play'});
      w.resize(surface.clientWidth,surface.clientHeight,settings);
      w.render({dt,eye:new T.Vector3(save.x,eyeY,-save.y),yaw,pitch,torch:v.torch,bob,settings});
    };
    let eyeY=EYE;
    const loop=(now:number)=>{
      const dt=Math.min(.06,(now-prev)/1000);
      if(now-prev>=1000/(coarse||settings.quality==='low'?30:60)-2.5){prev=now;if(!document.hidden)step(dt);}
      raf=requestAnimationFrame(loop);
    };
    void StationWorld.create(surface,status=>{if(!disposed)emit({status});}).then(w=>{
      if(disposed){w.dispose();return;}
      world=w;
      for(const [door,open] of Object.entries(save.doors))if(open)w.toggleDoor(door);
      const safe=w.walk.nearestStand(save.x,save.y)??w.walk.nearestStand(START.x,START.y);
      if(safe)save={...save,...safe};
      eyeY=(w.walk.floor(save.x,save.y)??0)+EYE;
      emit({mode:'ready',status:''});
    }).catch(e=>{if(!disposed)emit({mode:'error',status:e instanceof Error?e.message:'Не удалось загрузить локацию'});});
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
  return <main className="station-app">
    <canvas ref={canvas} className="station-canvas" aria-label="Заправка во Флориде"/>
    {view.mode==='loading'&&<div className="station-screen" role="status"><p className="station-mark">100<span>GATE</span></p><p>{view.status||'Загрузка…'}</p></div>}
    {view.mode==='error'&&<div className="station-screen" role="alert"><p>{view.status}</p><button type="button" onClick={()=>location.reload()}>Повторить</button></div>}
    {view.mode==='ready'&&<div className="station-screen station-title">
      <p className="station-chapter">Снаружи</p><h1>Заправка «Круглосуточно»</h1><p className="station-date">4 декабря 2001 · 3:47</p>
      <button type="button" onClick={()=>a.start()}>Выйти на улицу</button>
      <p className="station-keys">WASD — идти · Shift — бег · C — присесть · E — взаимодействовать · F — фонарик · Esc — пауза</p>
    </div>}
    {view.mode==='play'&&<>
      <div className="station-cross" aria-hidden/>
      {view.hint&&!view.doc&&!view.panel&&<p className="station-hint">[E] {view.hint}</p>}
      {view.notice&&<p className="station-notice" role="status">{view.notice}</p>}
      {view.doc&&<div className="station-doc" role="dialog" aria-label={view.doc.title} onClick={()=>a.closeDoc()}>
        <article><h2>{view.doc.title}</h2>{view.doc.text.split('\n').map((l,i)=><p key={i}>{l}</p>)}<small>[E] закрыть</small></article>
      </div>}
      {view.panel&&view.panel!=='pause'&&<div className="station-doc" role="dialog" aria-label={LOCKS[view.panel].title} data-testid="station-keypad">
        <article className="station-safe"><h2>{LOCKS[view.panel].title}</h2><p className="station-code">{view.code.padEnd(LOCKS[view.panel].code.length,'·')}</p>
          <p className="station-lock-hint">{LOCKS[view.panel].hint}</p>
          <div className="station-pad">{['1','2','3','4','5','6','7','8','9','back','0','close'].map(d=>
            <button key={d} type="button" onClick={()=>a.code(d)}>{d==='back'?'←':d==='close'?'✕':d}</button>)}</div>
        </article>
      </div>}
      {view.panel==='pause'&&<div className="station-screen station-title"><h1>Пауза</h1>
        <button type="button" onClick={()=>a.resume()}>Продолжить</button>
        <a className="station-link" href={import.meta.env.BASE_URL}>В главное меню</a></div>}
    </>}
  </main>;
}

const aimSpotLabel=(id:string)=>SPOTS.find(s=>s.id===id)?.label??id;
