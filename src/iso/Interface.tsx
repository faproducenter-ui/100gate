import {useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode} from 'react';
import {Archive, ArrowLeft, ArrowRight, BookOpen, Check, Circle, FileText, KeyRound, Lightbulb,
  LockKeyhole, Map as MapIcon, Maximize, Pause, Play, Power, RotateCcw, ScanLine, StepBack,
  StepForward, Video, X, ZoomIn, ZoomOut} from 'lucide-react';
import type {CCTVView, Panel, PowerLine, Save, Settings, UIAction} from './contracts';
import {activeQuest, ITEMS, QUESTS} from './state';
import './interface.css';

export interface IsoInterfaceProps {
  mode:'title'|'play'|'complete'|'loading'|'error';
  panel:Panel|null;
  saved:boolean;
  state:Save;
  settings:Settings;
  hint:string;
  notice:string;
  loading:string;
  cctv:CCTVView;
  document?:{title:string; text:string};
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
  up:'Вперёд',down:'Назад',left:'Влево',right:'Вправо',interact:'Взаимодействие',sprint:'Ускорение',
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
function Modal({title,children,onClose,variant='',testId}:{
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

function ActionButton({children,action,act,testId,className='',disabled=false}:{
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

function Hud({state,settings,hint,notice,act}:{state:Save;settings:Settings;hint:string;notice:string;act:Act}){
  const quest=activeQuest(state);
  return <div className="iso-hud" data-testid="iso-hud">
    <div className="iso-objective">
      <span className="iso-label">Текущая задача</span>
      <strong data-testid="iso-objective">{quest?.title??'Найти путь к школе №7'}</strong>
    </div>
    <nav className="iso-hud-actions" aria-label="Управление игрой">
      <button type="button" className="iso-icon" title="Инвентарь · Tab" aria-label="Инвентарь" data-testid="iso-inventory-open"
        onClick={()=>act({type:'panel',panel:'inventory'})}><Archive/><span>{state.items.length}</span></button>
      <button type="button" className="iso-icon" title="Журнал · J" aria-label="Журнал" data-testid="iso-journal-open"
        onClick={()=>act({type:'panel',panel:'journal'})}><BookOpen/></button>
      <button type="button" className="iso-icon" title="Пауза · Esc" aria-label="Пауза" data-testid="iso-pause-open"
        onClick={()=>act({type:'panel',panel:'pause'})}><Pause/></button>
    </nav>
    <div className="iso-hud-bottom">
      {notice&&<p className="iso-notice" role="status">{notice}</p>}
      {hint&&settings.hints&&<button className="iso-interact" data-testid="iso-interact" onClick={()=>act({type:'interact'})}
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

function Options({settings,act}:{settings:Settings;act:Act}){
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
      <p className="iso-controls-note">Tab — инвентарь · J — журнал · Esc — пауза</p>
    </fieldset>
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

function CCTV({view,act,notice}:{view:CCTVView;act:Act;notice:string}){
  const camera=cameraLabels[view.camera];
  const duration=Math.max(0,view.duration);
  const time=Math.max(0,Math.min(duration,view.time));
  return <Modal title="Видеонаблюдение" variant="iso-cctv-shell" testId="iso-cctv" onClose={()=>act(closeAction)}>
    <div className="iso-cctv-frame" data-testid="iso-cctv-frame">
      <div className="iso-cctv-label"><ScanLine/><span>CAM {camera.number}</span><strong>{camera.name}</strong></div>
      <div className="iso-cctv-signal"><i aria-hidden="true"/>{view.playing?'ВОСПРОИЗВЕДЕНИЕ':'ПАУЗА'}</div>
      {notice&&<p className="iso-cctv-notice" role="status">{notice}</p>}
    </div>
    <div className="iso-cctv-deck">
      <div className="iso-cctv-select">
        <div role="group" aria-label="Камеры">{cameraIds.map(id=>
          <button type="button" key={id} data-testid={`iso-cctv-camera-${id}`} aria-pressed={id===view.camera}
            aria-label={`Камера ${cameraLabels[id].number}: ${cameraLabels[id].name}`}
            onClick={()=>act({type:'cctv-camera',camera:id})}>{cameraLabels[id].number} <span>{cameraLabels[id].name}</span></button>,
        )}</div>
        <div role="group" aria-label="Записи">
          <button type="button" data-testid="iso-cctv-shift" aria-pressed={view.tape==='shift'}
            onClick={()=>act({type:'cctv-tape',tape:'shift'})}>Архив смены</button>
          <button type="button" data-testid="iso-cctv-future" aria-pressed={view.tape==='future'} disabled={!view.availableFuture}
            onClick={()=>act({type:'cctv-tape',tape:'future'})}>Новая запись</button>
        </div>
      </div>
      <div className="iso-cctv-transport">
        <div className="iso-cctv-keys">
          <button type="button" className="iso-icon" aria-label="Предыдущий кадр" data-testid="iso-cctv-step-back"
            onClick={()=>act({type:'cctv-step',delta:-1/12})}><StepBack/></button>
          <button type="button" className="iso-icon" aria-label={view.playing?'Пауза записи':'Воспроизвести запись'}
            data-testid="iso-cctv-play" onClick={()=>act({type:'cctv-play'})}>{view.playing?<Pause/>:<Play/>}</button>
          <button type="button" className="iso-icon" aria-label="Следующий кадр" data-testid="iso-cctv-step-forward"
            onClick={()=>act({type:'cctv-step',delta:1/12})}><StepForward/></button>
        </div>
        <label className="iso-cctv-time">
          <span>{clock(time)}</span>
          <input data-testid="iso-cctv-seek" type="range" aria-label="Время записи" min={0} max={duration}
            step={.05} value={time} onChange={e=>act({type:'cctv-seek',time:e.currentTarget.valueAsNumber})}/>
          <span>{clock(duration)}</span>
        </label>
        <button type="button" className="iso-icon" aria-pressed={view.zoom} aria-label={view.zoom?'Уменьшить кадр':'Приблизить кадр'}
          data-testid="iso-cctv-zoom" onClick={()=>act({type:'cctv-zoom'})}>{view.zoom?<ZoomOut/>:<ZoomIn/>}</button>
      </div>
      {view.evidence&&<ActionButton act={act} action={{type:'archive-evidence'}} testId="iso-cctv-evidence" className="iso-evidence">
        <Check/>Отметить кадр</ActionButton>}
    </div>
  </Modal>;
}

export function IsoInterface({mode,panel,saved,state,settings,hint,notice,loading,cctv,document, onAction:act}:IsoInterfaceProps){
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
    case 'inventory':modal=<Modal key="inventory" title="Инвентарь" testId="iso-inventory" variant="iso-notebook-shell" onClose={close}>
      <Inventory state={state}/>
    </Modal>;break;
    case 'journal':modal=<Modal key="journal" title="Журнал" testId="iso-journal" variant="iso-notebook-shell" onClose={close}>
      <Journal state={state}/>
    </Modal>;break;
    case 'breaker':modal=<Modal key="breaker" title="Электрощит" testId="iso-breaker" variant="iso-breaker-shell" onClose={close}>
      <Breaker state={state} notice={notice} act={act}/>
    </Modal>;break;
    case 'cctv':modal=<CCTV view={cctv} act={act} notice={notice}/>;break;
    case 'document':if(document)modal=<Modal key="document" title={document.title} testId="iso-document" variant="iso-document-shell" onClose={close}>
      <article>{document.text}</article>
    </Modal>;break;
    case 'credits':modal=<Modal key="credits" title="Авторы" testId="iso-credits" onClose={close}>
      <div className="iso-credits-copy"><strong>100GATE</strong><p>Проект faproducenter-ui.</p>
        <p>Персонаж: MakeHuman / MPFB (CC0). Окружение и звуковое оформление: 100GATE.</p>
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
    {mode==='title'&&<Title saved={saved} act={act} covered={!!panel}/>}
    {mode==='play'&&!panel&&<Hud state={state} settings={settings} hint={hint} notice={notice} act={act}/>}
    {mode==='loading'&&<div className="iso-screen-state" role="status" data-testid="iso-loading">
      <p className="iso-wordmark" aria-label="100GATE">100<span>GATE</span></p>
      <p>{loading||'Загрузка администрации…'}</p>
    </div>}
    {mode==='error'&&<Modal key="error" title="Не удалось открыть игру" testId="iso-error">
      <p className="iso-dialog-copy" role="alert">{loading||'Попробуйте загрузить игру ещё раз.'}</p>
      <div className="iso-modal-actions"><ActionButton act={act} action={{type:'retry'}} testId="iso-retry"><RotateCcw/>Повторить</ActionButton></div>
    </Modal>}
    {mode==='complete'&&!panel&&<Modal key="complete" title="Глава завершена" testId="iso-complete">
      <p className="iso-dialog-copy">Следующая задача: найти путь к школе №7.</p>
      <div className="iso-modal-actions"><ActionButton act={act} action={{type:'title'}}>В главное меню<ArrowRight/></ActionButton></div>
    </Modal>}
    {modal}
  </div>;
}
