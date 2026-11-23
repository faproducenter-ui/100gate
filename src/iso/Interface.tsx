import {useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode} from 'react';
import {Archive, ArrowLeft, ArrowRight, BookOpen, Check, Circle, FileText, KeyRound, Flame, Lightbulb,
  LockKeyhole, Map as MapIcon, Maximize, Pause, Play, Power, RotateCcw, ScanLine, StepBack,
  StepForward, Video, X, ZoomIn, ZoomOut} from 'lucide-react';
import type {CCTVView, Panel, PowerLine, Save, Settings, UIAction} from './contracts';
import {activeQuest, ITEMS, QUESTS} from './state';
import './interface.css';

/** The camera's own display: the red REC dot, a running timecode and the corner marks of a viewfinder. */
export function CamOverlay({charge}:{charge:number}){
  const [t,setT]=useState(0);
  useEffect(()=>{const id=window.setInterval(()=>setT(x=>x+1),1000);return()=>window.clearInterval(id);},[]);
  const p=(n:number)=>String(n).padStart(2,'0');
  return <div className="iso-cam" aria-hidden="true">
    <span className="iso-cam-rec"><i/>REC</span>
    <span className="iso-cam-time">{p(Math.floor(t/3600))}:{p(Math.floor(t/60)%60)}:{p(t%60)}</span>
    <span className="iso-cam-mode">SP · AF</span>
    <span className="iso-cam-bat" data-low={charge<=24} data-crit={charge<=10}><i style={{['--w' as string]:Math.max(0,Math.min(100,charge))+'%'}}/><em>{Math.round(charge)}%</em></span>
    <b className="tl"/><b className="tr"/><b className="bl"/><b className="br"/>
  </div>;
}

export interface IsoInterfaceProps {
  mode:'title'|'play'|'complete'|'loading'|'error';
  panel:Panel|null;
  saved:boolean;
  state:Save;
  settings:Settings;
  hint:string;
  /** Interactable things in view (first person): they glow, and the aimed one shows its key and name. */
  markers?:{id:string;label:string;x:number;y:number;aimed:boolean}[];
  notice:string;
  /** The opening sequence is playing: no HUD, only a hint to skip it. */
  intro?:boolean;
  introPrompt?:string;
  /** the camera's battery is empty: the picture has died */
  dead?:boolean;
  loading:string;
  cctv:CCTVView;
  document?:{title:string; text:string; wall?:boolean};
  /** First-person state: pointer lock and sprint stamina (0..1). */
  fp?:{locked:boolean; stamina:number};
  onAction:(action:UIAction)=>void;
}

type Act=(action:UIAction)=>void;
const closeAction={type:'close'} as const;
const lineRows = [
  {line:'lights',label:'Освещение',number:'L1',Icon:Lightbulb},
  {line:'locks',label:'Электрозамки',number:'L2',Icon:LockKeyhole},
  {line:'cctv',label:'Видеонаблюдение',number:'L3',Icon:Video},
] as const satisfies ReadonlyArray<{line:PowerLine;label:string;number:string;Icon:typeof Lightbulb}>;

const cameraLabels = {
  reception:{name:'Приёмная',number:'01'},
  corridor:{name:'Коридор',number:'02'},
  archive:{name:'Архив',number:'03'},
} as const;
const cameraIds = Object.keys(cameraLabels) as Array<keyof typeof cameraLabels>;

const keyNames:Record<keyof Settings['keys'],string> = {
  up:'Вперёд',down:'Назад',left:'Влево',right:'Вправо',interact:'Взаимодействие',sprint:'Бег',crouch:'Присесть',light:'Фонарь',
};
const keyIds = Object.keys(keyNames) as Array<keyof Settings['keys']>;
const keyLabel=(code:string)=>code.replace(/^Key/,'').replace(/^Digit/,'')
  .replace(/^Shift(Left|Right)$/,'Shift').replace('ArrowUp','↑').replace('ArrowDown','↓')
  .replace('ArrowLeft','←').replace('ArrowRight','→').replace(/^Space$/,'Пробел');
const clock=(seconds:number)=>{
  const t=Math.max(0,Math.floor(seconds));
  return [Math.floor(t/60),t%60].map(n=>String(n).padStart(2,'0')).join(':');
};

/** The UI owns focus only. The scene's controller owns every world mutation. */
export function Modal({title,children,onClose,variant='',testId}:{
  title:string;children:ReactNode;onClose?:()=>void;variant?:string;testId:string;
}){
  const dialog=useRef<HTMLElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    const previous=window.document.activeElement;
    heading.current?.focus();
    return ()=>{if(previous instanceof HTMLElement && previous.isConnected)previous.focus();};
  },[]);
  const keyDown=(event:KeyboardEvent<HTMLElement>)=>{
    if(event.key!=='Tab')return;
    event.preventDefault();
    event.stopPropagation();
    const targets=Array.from(dialog.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
    )??[]);
    if(!targets.length)return;
    const index=targets.indexOf(window.document.activeElement as HTMLElement);
    const next=event.shiftKey?(index<1?targets.length-1:index-1):(index+1)%targets.length;
    targets[next]?.focus();
  };
  return <div className={`iso-overlay ${variant}`} onPointerDown={e=>e.stopPropagation()}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`${testId}-heading`}
      className="iso-dialog" data-testid={testId} onKeyDown={keyDown}>
      <header className="iso-dialog-head">
        <h2 id={`${testId}-heading`} ref={heading} tabIndex={-1}>{title}</h2>
        {onClose&&<button type="button" className="iso-icon" aria-label="Закрыть" onClick={onClose}><X/></button>}
      </header>
      {children}
    </section>
  </div>;
}

export function ActionButton({children,action,act,testId,className='',disabled=false}:{
  children:ReactNode;action:UIAction;act:Act;testId?:string;className?:string;disabled?:boolean;
}){
  return <button type="button" className={`iso-button ${className}`} data-testid={testId} disabled={disabled}
    onClick={()=>act(action)}>{children}</button>;
}

function Title({saved,act,covered}:{saved:boolean;act:Act;covered:boolean}){
  return <section className="iso-title" data-testid="iso-title" inert={covered}>
    <div className="iso-title-shade"/>
    <div className="iso-title-content">
      <h1 className="iso-wordmark" aria-label="100GATE">100<span>GATE</span></h1>
      <nav aria-label="Главное меню" className="iso-title-nav">
        {saved&&<ActionButton act={act} action={{type:'continue'}} testId="iso-continue">Продолжить<ArrowRight/></ActionButton>}
        <ActionButton act={act} action={{type:'start'}} testId="iso-start">Новая игра<ArrowRight/></ActionButton>
        <ActionButton act={act} action={{type:'panel',panel:'settings'}} testId="iso-title-settings">Настройки<ArrowRight/></ActionButton>
        <ActionButton act={act} action={{type:'panel',panel:'credits'}} testId="iso-credits-open">Авторы<ArrowRight/></ActionButton>
      </nav>
    </div>
  </section>;
}

const isTouch=()=>typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;

/** Landscape touch layer: left thumb moves (a stick appears where it lands), right thumb looks, and on the right a big contextual USE button
 * (it shows what is in front of you), light, put down, run and crouch. */
function TouchControls({act,light,hint,holding}:{act:Act;light:boolean;hint:string;holding:boolean}){
  const stick=useRef<{id:number;ox:number;oy:number}|null>(null),look=useRef<{id:number;x:number;y:number}|null>(null);
  const [knob,setKnob]=useState<{x:number;y:number;dx:number;dy:number}|null>(null);
  const [run,setRun]=useState(false),[crouch,setCrouch]=useState(false);
  const down=(e:React.PointerEvent)=>{
    if((e.target as HTMLElement).closest('button'))return;
    const half=e.currentTarget.getBoundingClientRect().width*.45;
    if(e.clientX<half&&!stick.current){stick.current={id:e.pointerId,ox:e.clientX,oy:e.clientY};setKnob({x:e.clientX,y:e.clientY,dx:0,dy:0});}
    else if(!look.current)look.current={id:e.pointerId,x:e.clientX,y:e.clientY};
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move=(e:React.PointerEvent)=>{
    const s=stick.current,l=look.current;
    if(s&&e.pointerId===s.id){
      const R=52;let dx=e.clientX-s.ox,dy=e.clientY-s.oy;const m=Math.hypot(dx,dy);
      if(m>R){dx*=R/m;dy*=R/m;}
      setKnob({x:s.ox,y:s.oy,dx,dy});act({type:'touch',move:{x:dx/R,z:dy/R}});
    }else if(l&&e.pointerId===l.id){
      act({type:'touch',look:{dx:e.clientX-l.x,dy:e.clientY-l.y}});l.x=e.clientX;l.y=e.clientY;
    }
  };
  const up=(e:React.PointerEvent)=>{
    if(stick.current?.id===e.pointerId){stick.current=null;setKnob(null);act({type:'touch',move:{x:0,z:0}});}
    if(look.current?.id===e.pointerId)look.current=null;
  };
  return <div className="iso-touch" data-testid="iso-touch" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    {knob&&<div className="iso-stick" style={{left:knob.x,top:knob.y}}><i style={{transform:`translate(${knob.dx}px,${knob.dy}px)`}}/></div>}
    <button type="button" className="iso-touch-use" data-show={!!hint} aria-label={hint||'Взаимодействовать'} onClick={()=>act({type:'interact'})}>
      <b>E</b><span>{hint||'—'}</span></button>
    <div className="iso-touch-buttons">
      {holding&&<button type="button" aria-label="Положить" onClick={()=>act({type:'drop'})}><ArrowLeft/></button>}
      <button type="button" aria-label="Свет" aria-pressed={light} onClick={()=>act({type:'torch'})}><Flame/></button>
      <button type="button" aria-label="Бег" aria-pressed={run} onClick={()=>{setRun(!run);act({type:'touch',sprint:!run});}}><ArrowRight/></button>
      <button type="button" aria-label="Присесть" aria-pressed={crouch} onClick={()=>{setCrouch(!crouch);act({type:'touch',crouch:!crouch});}}><StepBack/></button>
    </div>
  </div>;
}

function Hud({state,settings,hint,notice,act,fp,markers}:{state:Save;settings:Settings;hint:string;notice:string;act:Act;fp?:{locked:boolean;stamina:number};markers?:IsoInterfaceProps['markers']}){
  const quest=activeQuest(state);
  const first=settings.view==='fps';
  return <div className="iso-hud" data-testid="iso-hud" data-view={settings.view}>
    {first&&<CamOverlay charge={state.charge}/>}
    {first&&<div className="iso-crosshair" data-active={!!hint} aria-hidden="true"/>}
    {first&&isTouch()&&<TouchControls act={act} light={state.lightOn} hint={hint} holding={state.items.includes('torch')}/>}
    {first&&!isTouch()&&fp&&!fp.locked&&<p className="iso-lockhint" role="status">Нажмите на экран, чтобы управлять камерой мышью</p>}
    {first&&fp&&fp.stamina<.995&&<div className="iso-stamina" aria-label="Выносливость"><i style={{width:Math.round(fp.stamina*100)+'%'}}/></div>}
    {first&&!isTouch()&&settings.hints&&markers?.map(m=><div key={m.id} className="iso-mark" data-aimed={m.aimed} style={{left:(m.x*100)+'%',top:(m.y*100)+'%'}} aria-hidden="true">
      <i className="iso-mark-glow"/>
      {m.aimed&&<><b className="tl"/><b className="tr"/><b className="bl"/><b className="br"/>
        <span className="iso-mark-key">{keyLabel(settings.keys.interact)}</span><span className="iso-mark-name">{m.label}</span></>}
    </div>)}
    {(!first||isTouch())&&<div className="iso-objective">
      <span className="iso-label">Текущая задача</span>
      <strong data-testid="iso-objective">{quest?.title??'Найти путь к школе №7'}</strong>
    </div>}
    {(!first||isTouch())&&<nav className="iso-hud-actions" aria-label="Управление игрой">
      <button type="button" className="iso-icon" title="Инвентарь · Tab" aria-label="Инвентарь" data-testid="iso-inventory-open"
        onClick={()=>act({type:'panel',panel:'inventory'})}><Archive/><span>{state.items.length}</span></button>
      {state.items.includes('torch')&&<button type="button" className="iso-icon iso-light" title="Факел · F" aria-label="Факел"
        data-testid="iso-torch" aria-pressed={state.lightOn} onClick={()=>act({type:'torch'})}>
        <Flame/><span>{state.lightOn?'горит':state.items.includes('lighter')?'F':'—'}</span></button>}
      <button type="button" className="iso-icon" title="Журнал · J" aria-label="Журнал" data-testid="iso-journal-open"
        onClick={()=>act({type:'panel',panel:'journal'})}><BookOpen/></button>
      <button type="button" className="iso-icon" title="Пауза · Esc" aria-label="Пауза" data-testid="iso-pause-open"
        onClick={()=>act({type:'panel',panel:'pause'})}><Pause/></button>
    </nav>}
    <div className="iso-hud-bottom">
      {notice&&<p className="iso-notice" role="status">{notice}</p>}
      {hint&&settings.hints&&(!first||isTouch())&&<button className="iso-interact" data-testid="iso-interact" onClick={()=>act({type:'interact'})}
        type="button"><kbd>{keyLabel(settings.keys.interact)}</kbd><span>{hint}</span></button>}
    </div>
  </div>;
}

function Meter({label,value,min=0,max=1,step=.05,onChange}:{
  label:string;value:number;min?:number;max?:number;step?:number;onChange:(value:number)=>void;
}){
  return <label className="iso-setting iso-meter"><span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(e.currentTarget.valueAsNumber)}/>
    <output>{Math.round(value*100)}%</output>
  </label>;
}

function Toggle({label,on,onChange}:{label:string;on:boolean;onChange:(value:boolean)=>void}){
  return <label className="iso-setting iso-toggle">
    <span>{label}</span><input type="checkbox" checked={on} onChange={e=>onChange(e.currentTarget.checked)}/><i aria-hidden="true"/>
  </label>;
}

export function Options({settings,act}:{settings:Settings;act:Act}){
  const [capture,setCapture]=useState<keyof Settings['keys']|null>(null);
  const [bindingError,setBindingError]=useState('');
  const patch=(value:Partial<Settings>)=>act({type:'settings',patch:value});
  const bind=(event:KeyboardEvent<HTMLButtonElement>,key:keyof Settings['keys'])=>{
    if(capture!==key)return;
    event.preventDefault();
    event.stopPropagation();
    if(event.code==='Escape'||event.code==='Tab'){
      setCapture(null);setBindingError('');return;
    }
    const reserved=['KeyJ','AltLeft','AltRight','MetaLeft','MetaRight','ControlLeft','ControlRight'];
    if(reserved.includes(event.code)||!(/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right))$/).test(event.code)){
      setBindingError('Эта клавиша недоступна.');return;
    }
    const existing=keyIds.find(id=>id!==key&&settings.keys[id]===event.code);
    if(existing){setBindingError(`Клавиша уже используется: ${keyNames[existing]}.`);return;}
    patch({keys:{...settings.keys,[key]:event.code}});
    setCapture(null);setBindingError('');
  };
  return <div className="iso-options">
    <fieldset><legend>Графика</legend>
      <label className="iso-setting"><span>Качество</span><select aria-label="Качество" value={settings.quality}
        onChange={e=>patch({quality:e.currentTarget.value as Settings['quality']})}>
        <option value="low">Низкое</option><option value="medium">Среднее</option><option value="high">Высокое</option>
      </select></label>
      <Meter label="Разрешение сцены" value={settings.scale} min={.55} max={1.25} onChange={scale=>patch({scale})}/>
      <Meter label="Чувствительность мыши" value={settings.sensitivity} min={.3} max={2.5} onChange={sensitivity=>patch({sensitivity})}/>
      <Toggle label="Тени" on={settings.shadows} onChange={shadows=>patch({shadows})}/>
      <Toggle label="Эффекты окружения" on={settings.ambient} onChange={ambient=>patch({ambient})}/>
      <ActionButton act={act} action={{type:'fullscreen'}}><Maximize/>На весь экран</ActionButton>
    </fieldset>
    <fieldset><legend>Звук</legend>
      <Meter label="Общая громкость" value={settings.volume} onChange={volume=>patch({volume})}/>
      <Meter label="Атмосфера" value={settings.ambience} onChange={ambience=>patch({ambience})}/>
      <Meter label="Звуки игры" value={settings.effects} onChange={effects=>patch({effects})}/>
      <Meter label="Звуки интерфейса" value={settings.ui} onChange={ui=>patch({ui})}/>
    </fieldset>
    <fieldset><legend>Доступность</legend>
      <Toggle label="Меньше мерцания" on={settings.reducedFlicker} onChange={reducedFlicker=>patch({reducedFlicker})}/>
      <Toggle label="Плавное движение камеры" on={settings.motion} onChange={motion=>patch({motion})}/>
      <Toggle label="Подсказки взаимодействия" on={settings.hints} onChange={hints=>patch({hints})}/>
      <Meter label="Размер текста" value={settings.textScale} min={.8} max={1.5} onChange={textScale=>patch({textScale})}/>
    </fieldset>
    <fieldset><legend>Управление</legend>
      {keyIds.map(key=><div className="iso-setting" key={key}>
        <span>{keyNames[key]}</span>
        <button type="button" aria-label={`Клавиша: ${keyNames[key]}`} aria-pressed={capture===key}
          data-testid={`iso-key-${key}`} className="iso-key-bind" onClick={()=>{setCapture(capture===key?null:key);setBindingError('');}}
          onKeyDown={e=>bind(e,key)} onBlur={()=>{if(capture===key){setCapture(null);setBindingError('');}}}>
          {capture===key?'Нажмите клавишу':keyLabel(settings.keys[key])}
        </button>
      </div>)}
      {bindingError&&<p className="iso-option-error" role="status">{bindingError}</p>}
      <p className="iso-controls-note">Tab — инвентарь · J — журнал · F — поджечь факел · G — положить факел · Esc — пауза · Shift — бег · C — присесть</p>
    </fieldset>
  </div>;
}

/** Simple drawn glyphs for the things on the cloth: they lie on the canvas like the player's gear in front of them, not in a menu. */
function Glyph({id}:{id:string}){
  const common={fill:'none',stroke:'currentColor',strokeWidth:2.2,strokeLinecap:'round',strokeLinejoin:'round'} as const;
  // every key and card (the street's shop, shed and gate keys too) is drawn as a key
  switch(/Key$|keycard/.test(id)&&id!=='technicalKey'&&id!=='archiveKey'?'archiveKey':id){
    case 'torch':return <svg viewBox="0 0 64 64" aria-hidden="true"><path {...common} d="M20 56 L42 14"/><path {...common} d="M38 6 q10 2 12 12 q-8 4 -14 -2 z" fill="currentColor" opacity=".35"/><path {...common} d="M36 12 l12 6"/></svg>;
    case 'lighter':return <svg viewBox="0 0 64 64" aria-hidden="true"><rect {...common} x="22" y="22" width="20" height="34" rx="3"/><path {...common} d="M24 22 v-8 h16 v8"/><path {...common} d="M32 14 q-4 -8 2 -10 q2 6 -2 10"/></svg>;
    case 'battery':return <svg viewBox="0 0 64 64" aria-hidden="true"><rect {...common} x="20" y="14" width="24" height="42" rx="2"/><rect {...common} x="26" y="8" width="5" height="6"/><rect {...common} x="35" y="9" width="5" height="5"/><path {...common} d="M26 26 h12 M26 34 h12"/></svg>;
    case 'technicalKey':case 'archiveKey':return <svg viewBox="0 0 64 64" aria-hidden="true"><circle {...common} cx="20" cy="22" r="9"/><path {...common} d="M26 28 l24 24 m-8 -8 l6 -6 m-12 -2 l6 -6"/></svg>;
    case 'vhs':return <svg viewBox="0 0 64 64" aria-hidden="true"><rect {...common} x="8" y="18" width="48" height="30" rx="2"/><circle {...common} cx="22" cy="33" r="5"/><circle {...common} cx="42" cy="33" r="5"/><path {...common} d="M14 44 h36"/></svg>;
    case 'plan':return <svg viewBox="0 0 64 64" aria-hidden="true"><path {...common} d="M10 14 l14 -4 l16 6 l14 -4 v38 l-14 4 l-16 -6 l-14 4 z"/><path {...common} d="M24 10 v38 M40 16 v38"/></svg>;
    default:return <svg viewBox="0 0 64 64" aria-hidden="true"><path {...common} d="M16 8 h22 l10 10 v38 h-32 z"/><path {...common} d="M38 8 v10 h10 M22 28 h20 M22 36 h20 M22 44 h14"/></svg>;
  }
}

export type ClothItem={id:string;name:string;description:string};
/** The bag put down on the floor and opened (first person, Tab): shared by the administration and the street. */
export function InventoryCloth({items,charge,close}:{items:ClothItem[];charge:number;close:()=>void}){
  const [selection,select]=useState<string|null>(null);
  const item=items.find(i=>i.id===selection)??items[0];
  return <div className="iso-cloth-wrap" data-testid="iso-inventory" onClick={close}>
    <div className="iso-cloth" onClick={e=>e.stopPropagation()}>
      <div className="iso-cloth-surface">
        {items.length===0&&<p className="iso-cloth-empty">Пусто.</p>}
        {items.map((it,i)=><button type="button" key={it.id} className="iso-cloth-item" aria-pressed={it.id===item?.id} style={{['--i' as string]:i}} onClick={()=>select(it.id)}>
          <Glyph id={it.id}/><span>{it.name}</span></button>)}
      </div>
    </div>
    {item&&<div className="iso-cloth-note" onClick={e=>e.stopPropagation()}><b>{item.name}</b><span>{item.description}</span></div>}
    <p className="iso-focus-hint">[Tab] убрать · камера заряд: {Math.round(charge)}%</p>
  </div>;
}

function Inventory({state}:{state:Save}){
  const [selection,select]=useState<Save['items'][number]|null>(null);
  const selected=selection&&state.items.includes(selection)?selection:state.items[0];
  const item=selected?ITEMS[selected]:undefined;
  if(!item)return <p className="iso-empty">Инвентарь пуст.</p>;
  return <div className="iso-inventory">
    <ul aria-label="Предметы">{state.items.map(id=>{
      const row=ITEMS[id];
      const Icon=row.kind==='key'?KeyRound:id==='plan'?MapIcon:row.kind==='media'?Video:FileText;
      return <li key={id}><button type="button" aria-pressed={id===selected} onClick={()=>select(id)}>
        <Icon/><span>{row.name}</span>
      </button></li>;
    })}</ul>
    <div className="iso-item-detail"><h3>{item.name}</h3><p>{item.description}</p></div>
  </div>;
}

function Journal({state}:{state:Save}){
  const active=activeQuest(state);
  const currentIndex=active?QUESTS.findIndex(quest=>quest===active):QUESTS.length;
  return <ol className="iso-journal">
    {QUESTS.slice(0,currentIndex+1).map((quest,index)=><li key={quest.title} data-status={index<currentIndex?'done':'active'}>
      {index<currentIndex?<Check aria-label="Выполнено"/>:<Circle aria-label="Текущая задача"/>}<strong>{quest.title}</strong>
      {index===currentIndex&&<p>{quest.description}</p>}
    </li>)}
  </ol>;
}

function Breaker({state,notice,act}:{state:Save;notice:string;act:Act}){
  return <div className="iso-breaker">
    <div className="iso-breaker-header"><Power aria-hidden="true"/>
      <span>Ввод 220 В</span>
      <output role="status" className={state.power?'on':''}>{state.power?'Сеть под напряжением':'Питание отключено'}</output>
    </div>
    <div className="iso-breaker-bank">
      {lineRows.map(({line,label,number,Icon})=>{
        const on=state.breaker.includes(line);
        return <button type="button" aria-pressed={on} aria-label={label} key={line} data-testid={`iso-breaker-${line}`}
          disabled={state.power} onClick={()=>act({type:'breaker',line})}>
          <span className="iso-breaker-number">{number}<i className="iso-led" aria-hidden="true"/></span>
          <span className="iso-breaker-slot" aria-hidden="true"><i/></span>
          <span className="iso-breaker-name"><Icon/>{label}</span>
          <span className="iso-breaker-switch-state">{on?'ВКЛ':'ВЫКЛ'}</span>
        </button>;
      })}
    </div>
    <div className="iso-breaker-footer">
      <p className="iso-breaker-status" role="status">{notice||'Переключайте линии по схеме электроснабжения.'}</p>
      <ActionButton act={act} action={{type:'reset-breaker'}} testId="iso-breaker-reset" disabled={state.power}><RotateCcw/>Сброс</ActionButton>
    </div>
  </div>;
}

/** One key of the recorder: a hard plastic cap in a metal bezel, a lamp above it, a stamped label under it. */
function DeckKey({label,sub,lamp,pressed,disabled,onPress,testId,aria,wide,tone}:{
  label:ReactNode;sub?:string;lamp?:'green'|'red'|'amber'|null;pressed?:boolean;disabled?:boolean;onPress:()=>void;testId?:string;aria:string;wide?:boolean;tone?:'red';
}){
  return <button type="button" className={`cctv-key${wide?' wide':''}${tone?' '+tone:''}`} data-testid={testId} aria-label={aria}
    aria-pressed={pressed===undefined?undefined:pressed} disabled={disabled} onClick={onPress}>
    {lamp!==undefined&&<i className="cctv-lamp" data-lamp={lamp??'off'} aria-hidden="true"/>}
    <span className="cctv-cap">{label}</span>
    {sub&&<span className="cctv-sub">{sub}</span>}
  </button>;
}

/** The night guard's surveillance desk: an old monitor in its dusty housing and, under it, the camera switcher / tape recorder.
 *  The picture is drawn by the scene only inside the monitor's screen (data-cctv-screen); everything else is the equipment. */
function CCTV({view,act,notice}:{view:CCTVView;act:Act;notice:string}){
  const camera=cameraLabels[view.camera];
  const duration=Math.max(0,view.duration);
  const time=Math.max(0,Math.min(duration,view.time));
  // REW, FF and STOP are tape moves of the recorder: they go through the frame-step action (it clamps, pauses and clicks the key)
  const seek=(t:number)=>act({type:'cctv-step',delta:Math.max(0,Math.min(duration,t))-time});
  // the recorder's own clock: the night the tapes were made, plus the tape position
  const stamp=3*3600+47*60+(view.tape==='future'?1260:0)+Math.floor(time);
  const hms=[Math.floor(stamp/3600),Math.floor(stamp/60)%60,stamp%60].map(n=>String(n).padStart(2,'0')).join(':');
  return <Modal title="Видеонаблюдение" variant="iso-cctv-shell" testId="iso-cctv" onClose={()=>act(closeAction)}>
    <div className="cctv-rig">
      <div className="cctv-monitor">
        <div className="cctv-housing" aria-hidden="true"/>
        <div className="cctv-screen" data-cctv-screen data-testid="iso-cctv-frame">
          <div className="cctv-static" key={view.camera+view.tape} aria-hidden="true"/>
          <div className="cctv-osd cctv-osd-tl"><b>CAM {camera.number}</b><span>{camera.name}</span></div>
          <div className="cctv-osd cctv-osd-tr">{view.playing?<><i className="cctv-rec" aria-hidden="true"/>ВОСПР ▶</>:'ПАУЗА ❚❚'}</div>
          <div className="cctv-osd cctv-osd-bl"><span>04-12-2001</span><b>{hms}</b></div>
          <div className="cctv-osd cctv-osd-br">{view.tape==='future'?'КАССЕТА Б':'КАССЕТА А'}{view.zoom?' · ×2':''}</div>
          {notice&&<p className="cctv-notice" role="status">{notice}</p>}
          <i className="cctv-glass" aria-hidden="true"/>
        </div>
        <div className="cctv-chin" aria-hidden="true">
          <span className="cctv-brand">ВИДЕОКОНТРОЛЬ <b>ВК-4М</b></span>
          <span className="cctv-knobs"><i/><i/><i/></span>
          <span className="cctv-power"><i/>СЕТЬ</span>
        </div>
      </div>
      <div className="cctv-deck" role="group" aria-label="Пульт видеонаблюдения">
        <span className="cctv-screw" data-at="tl" aria-hidden="true"/><span className="cctv-screw" data-at="tr" aria-hidden="true"/>
        <section className="cctv-block cctv-cams" role="group" aria-label="Камеры">
          <h3>КОММУТАТОР</h3>
          <div className="cctv-row">{cameraIds.map(id=>
            <DeckKey key={id} testId={`iso-cctv-camera-${id}`} aria={`Камера ${cameraLabels[id].number}: ${cameraLabels[id].name}`}
              pressed={id===view.camera} lamp={id===view.camera?'green':null}
              label={<>CAM {cameraLabels[id].number}</>} sub={cameraLabels[id].name}
              onPress={()=>act({type:'cctv-camera',camera:id})}/>)}
          </div>
        </section>
        <section className="cctv-block cctv-transport" role="group" aria-label="Запись">
          <div className="cctv-counter">
            <span className="cctv-vfd" aria-hidden="true">{view.playing?'▶':'❚❚'}</span>
            <span className="cctv-vfd cctv-vfd-time">{clock(time)}<small>/{clock(duration)}</small></span>
            <input className="cctv-seek" data-testid="iso-cctv-seek" type="range" aria-label="Время записи" min={0} max={duration}
              step={.05} value={time} onChange={e=>act({type:'cctv-seek',time:e.currentTarget.valueAsNumber})}
              style={{'--p':`${duration?time/duration*100:0}%`} as CSSProperties}/>
          </div>
          <div className="cctv-row">
            <DeckKey aria="Перемотка назад" label="◀◀" sub="REW" onPress={()=>seek(time-2)} disabled={time<=0}/>
            <DeckKey testId="iso-cctv-step-back" aria="Предыдущий кадр" label="◀❙" sub="КАДР" onPress={()=>act({type:'cctv-step',delta:-1/12})}/>
            <DeckKey testId="iso-cctv-play" aria={view.playing?'Пауза записи':'Воспроизвести запись'} wide
              lamp={view.playing?'green':null} pressed={view.playing} label={view.playing?'❚❚':'▶'} sub={view.playing?'PAUSE':'PLAY'}
              onPress={()=>act({type:'cctv-play'})}/>
            <DeckKey aria="Стоп: к началу записи" label="■" sub="STOP" onPress={()=>seek(0)} disabled={!view.playing&&time<=0}/>
            <DeckKey testId="iso-cctv-step-forward" aria="Следующий кадр" label="❙▶" sub="КАДР" onPress={()=>act({type:'cctv-step',delta:1/12})}/>
            <DeckKey aria="Перемотка вперёд" label="▶▶" sub="FF" onPress={()=>seek(time+2)} disabled={time>=duration}/>
          </div>
        </section>
        <section className="cctv-block cctv-tapes" role="group" aria-label="Записи">
          <h3>КАССЕТА</h3>
          <div className="cctv-row">
            <DeckKey testId="iso-cctv-shift" aria="Архив смены" pressed={view.tape==='shift'} lamp={view.tape==='shift'?'amber':null}
              label="А" sub="АРХИВ СМЕНЫ" onPress={()=>act({type:'cctv-tape',tape:'shift'})}/>
            <DeckKey testId="iso-cctv-future" aria="Новая запись" pressed={view.tape==='future'} lamp={view.tape==='future'?'amber':null}
              label="Б" sub="НОВАЯ ЗАПИСЬ" disabled={!view.availableFuture} onPress={()=>act({type:'cctv-tape',tape:'future'})}/>
            <DeckKey testId="iso-cctv-zoom" aria={view.zoom?'Уменьшить кадр':'Приблизить кадр'} pressed={view.zoom} lamp={view.zoom?'green':null}
              label="×2" sub="ZOOM" onPress={()=>act({type:'cctv-zoom'})}/>
            <DeckKey testId="iso-cctv-evidence" tone="red" aria="Отметить кадр" lamp={view.evidence?'red':null} disabled={!view.evidence}
              label="●" sub="МЕТКА" onPress={()=>act({type:'archive-evidence'})}/>
          </div>
        </section>
      </div>
    </div>
  </Modal>;
}

/** The key box by the exit: a steel box on the wall with a four-digit keypad (typed or clicked). */
function Keypad({act,close,notice}:{act:(a:UIAction)=>void;close:()=>void;notice:string}){
  const [code,setCode]=useState('');
  const press=(d:string)=>{
    if(d==='back'){setCode(c=>c.slice(0,-1));return;}
    setCode(c=>{const n=(c+d).slice(0,4);if(n.length===4){window.setTimeout(()=>act({type:'keypad',code:n}),0);return '';}return n;});
  };
  useEffect(()=>{
    const key=(e:globalThis.KeyboardEvent)=>{
      if(/^(Digit|Numpad)\d$/.test(e.code)){e.preventDefault();press(e.code.slice(-1));}
      else if(e.code==='Backspace'){e.preventDefault();press('back');}
    };
    window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);
  },[]);
  return <div className="iso-keypad-wrap" role="dialog" aria-label="Ключница" data-testid="iso-keypad" onClick={e=>{if(e.target===e.currentTarget)close();}}>
    <div className="iso-keypad">
      <p className="iso-keypad-plate">КЛЮЧНИЦА · ВЫХОД</p>
      <p className="iso-keypad-screen" data-testid="iso-keypad-code">{code.padEnd(4,'_').split('').join(' ')}</p>
      <div className="iso-keypad-keys">
        {['1','2','3','4','5','6','7','8','9','back','0','close'].map(d=><button key={d} type="button" data-testid={'iso-keypad-'+d}
          onClick={()=>d==='close'?close():press(d)}>{d==='back'?'←':d==='close'?'✕':d}</button>)}
      </div>
      <p className="iso-keypad-notice">{notice||'Четыре цифры'}</p>
    </div>
  </div>;
}

export function IsoInterface({mode,panel,saved,state,settings,hint,markers,notice,intro,introPrompt,dead,loading,cctv,document,fp, onAction:act}:IsoInterfaceProps){
  const close=()=>act(closeAction);
  const zoom={'--iso-text':settings.textScale} as CSSProperties;
  let modal:ReactNode=null;
  switch(panel){
    case 'pause':modal=<Modal key="pause" title="Пауза" testId="iso-pause" onClose={()=>act({type:'resume'})}>
      <div className="iso-modal-actions">
        <ActionButton act={act} action={{type:'resume'}}>Продолжить<ArrowRight/></ActionButton>
        <ActionButton act={act} action={{type:'panel',panel:'settings'}}>Настройки</ActionButton>
        <ActionButton act={act} action={{type:'title'}}>В главное меню</ActionButton>
      </div>
    </Modal>;break;
    case 'settings':modal=<Modal key="settings" title="Настройки" testId="iso-settings" variant="iso-settings-shell" onClose={close}>
      <Options settings={settings} act={act}/>
    </Modal>;break;
    case 'inventory':if(settings.view==='fps')modal=<InventoryCloth items={state.items.map(id=>({id,name:ITEMS[id].name,description:ITEMS[id].description}))} charge={state.charge} close={close}/>;else modal=<Modal key="inventory" title="Инвентарь" testId="iso-inventory" variant="iso-notebook-shell" onClose={close}>
      <Inventory state={state}/>
    </Modal>;break;
    case 'journal':modal=<Modal key="journal" title="Журнал" testId="iso-journal" variant="iso-notebook-shell" onClose={close}>
      <Journal state={state}/>
    </Modal>;break;
    case 'breaker':if(settings.view==='fps')modal=null;else modal=<Modal key="breaker" title="Электрощит" testId="iso-breaker" variant="iso-breaker-shell" onClose={close}>
      <Breaker state={state} notice={notice} act={act}/>
    </Modal>;break;
    case 'cctv':modal=<CCTV view={cctv} act={act} notice={notice}/>;break;
    case 'keypad':modal=<Keypad act={act} close={close} notice={notice}/>;break;
    case 'document':if(document&&settings.view==='fps'&&document.wall)modal=null;else if(document&&settings.view==='fps')modal=<div className="iso-paper" role="dialog" aria-label={document.title} data-testid="iso-document" onClick={close}>
      <h2>{document.title}</h2><article>{document.text}</article><p className="iso-paper-key">[{keyLabel(settings.keys.interact)}] убрать</p></div>;
      else if(document)modal=<Modal key="document" title={document.title} testId="iso-document" variant="iso-document-shell" onClose={close}>
      <article>{document.text}</article>
    </Modal>;break;
    case 'credits':modal=<Modal key="credits" title="Авторы" testId="iso-credits" onClose={close}>
      <div className="iso-credits-copy"><strong>100GATE</strong><p>Проект faproducenter-ui.</p>
        <p>Персонаж: MakeHuman / MPFB (CC0). Окружение и звуковое оформление: 100GATE.</p>
        <p lang="en">Key with Tag by AxonFXDesigns (<a href="https://sketchfab.com/3d-models/key-with-tag-16ea3fbecc6346df9859f0e18406951b" target="_blank" rel="noreferrer">Sketchfab</a>), CC BY 4.0.
          Mountain road by Metazeon (<a href="https://sketchfab.com/3d-models/mountain-road-5a7164248a244671953ebde24a7a876b" target="_blank" rel="noreferrer">Sketchfab</a>), CC BY 4.0.
          Props: CCTV Camera by Smoggybeard, SFM Telephone by G=, Burned soviet fuse box by yaro.pro, 9V Battery by Da-Luna (Sketchfab), CC BY 4.0.
          Opening sounds: CC0 recordings from OpenGameArt (rain, engine, impact, glass, heartbeat, gravel steps, car doors).
          Abandoned House by AspectStudios (<a href="https://sketchfab.com/3d-models/abandoned-house-c876fa6c530f4946a5234666752803ce" target="_blank" rel="noreferrer">Sketchfab</a>), CC BY 4.0.
          Large Camping BackPack by Sebastian Webster (<a href="https://sketchfab.com/3d-models/large-camping-backpack-freegameready-a7086b50dae84706b81bb3ce14ad9094" target="_blank" rel="noreferrer">Sketchfab</a>), CC BY 4.0.
          Car Generic Hatchback GameReady with interior by Kinetic Vehicles (<a href="https://sketchfab.com/3d-models/car-generic-hatchback-gameready-with-interior-9d21deaa0174412283965baf323133a1" target="_blank" rel="noreferrer">Sketchfab</a>), Sketchfab Standard licence.
          Antique Book with Quill and Key by E.Dejnes (<a href="https://sketchfab.com/3d-models/antique-book-with-quill-and-key-6be47f12c73342ef9232e29f71e0fa76" target="_blank" rel="noreferrer">Sketchfab</a>), CC BY-NC 4.0.</p>
        <p lang="en">The data used in this project was obtained from <a href="https://mocap.cs.cmu.edu/" target="_blank" rel="noreferrer">mocap.cs.cmu.edu</a>.</p>
        <p>Three.js · Blender</p></div>
    </Modal>;break;
    case 'new-confirm':modal=<Modal key="confirm" title="Начать новую игру?" testId="iso-new-confirm" onClose={close}>
      <p className="iso-dialog-copy">Текущее сохранение этой версии будет заменено.</p>
      <div className="iso-modal-actions">
        <ActionButton act={act} action={closeAction}><ArrowLeft/>Отмена</ActionButton>
        <ActionButton act={act} action={{type:'start'}}>Новая игра<ArrowRight/></ActionButton>
      </div>
    </Modal>;break;
  }
  return <div className="iso-ui" style={zoom} data-motion={settings.motion?'on':'off'} data-flicker={settings.reducedFlicker?'reduced':'normal'}>
    <div className="iso-rotate" role="alert"><span>⟲</span><p>Поверните телефон горизонтально</p></div>
    {mode==='title'&&<Title saved={saved} act={act} covered={!!panel}/>}
    {mode==='play'&&intro&&!!introPrompt&&<p className="iso-intro-prompt" role="status">{introPrompt}</p>}
    {mode==='play'&&intro&&<button type="button" className="iso-intro-skip" onClick={()=>act({type:'skip-intro'})}>{isTouch()?'Пропустить':'[Пробел] пропустить'}</button>}
    {mode==='play'&&!panel&&!intro&&<Hud state={state} settings={settings} hint={hint} markers={markers} notice={notice} act={act} fp={fp}/>}
    {/* loading and a failed start are shown by the page's own loading screen (src/boot), which stays above the game until its first frame */}
    {mode==='complete'&&<div className="iso-leaving" role="status" data-testid="iso-leaving"><p>Снаружи</p></div>}
    {modal}
    {mode==='play'&&dead&&<div className="iso-dead" role="alert"><div className="iso-dead-noise"/><p><b>ЗАРЯД НА КАМЕРЕ РАЗРЯЖЕН</b><span>Вы проиграли. Без записи в этом здании нечем смотреть.</span></p><div className="iso-dead-actions"><button type="button" onClick={()=>act({type:'start'})}>Начать заново</button><button type="button" onClick={()=>act({type:'title'})}>В меню</button></div></div>}
    {panel==='breaker'&&settings.view==='fps'&&<p className="iso-focus-hint">Щёлкните по рычагам по порядку, как на схеме · [{keyLabel(settings.keys.interact)}] отойти</p>}
    {panel==='document'&&document?.wall&&settings.view==='fps'&&<div className="iso-wallnote" role="dialog" aria-label={document.title}><small>[{keyLabel(settings.keys.interact)}] отойти</small></div>}
  </div>;
}
