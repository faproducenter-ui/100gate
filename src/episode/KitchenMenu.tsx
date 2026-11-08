import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {chapterAsset} from './release';
import {text,type Settings} from './data';
import {KitchenAudio} from './kitchen-audio';
import {kitchenLamp} from './menu-flicker';
import './kitchen-menu.css';

type Props={settings:Settings;hasSave:boolean;start:()=>void;resume:()=>void;settingsOpen:()=>void;creditsOpen:()=>void};
export default function KitchenMenu({settings,hasSave,start,resume,settingsOpen,creditsOpen}:Props){
  const t=(ru:string,en:string)=>text(settings.language,ru,en);
  const audio=useRef<KitchenAudio|null>(null);
  const [attempt,retry]=useState(0),[state,setState]=useState<'loading'|'ready'|'error'>('loading');
  const [pictures,setPictures]=useState<string[]>([]);
  const [phase,setPhase]=useState(0);
  const [active,setActive]=useState(()=>!document.hidden);
  const [motionPref,setMotionPref]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [sound,setSound]=useState(false);
  const reduced=settings.reducedFlicker||motionPref;

  useEffect(()=>{
    const abort=new AbortController(),owned:string[]=[];
    setState('loading');setPictures([]);
    const load=async(name:string)=>{
      const response=await fetch(chapterAsset('assets/menu/'+name),{signal:abort.signal,cache:attempt?'reload':'default'});
      if(!response.ok)throw Error('Kitchen image unavailable');
      const uri=URL.createObjectURL(await response.blob());
      if(abort.signal.aborted){URL.revokeObjectURL(uri);throw Error('Menu closed');}
      owned.push(uri);
      const img=new Image();img.src=uri;await img.decode();return uri;
    };
    void load('kitchen.webp').then(async first=>{
      if(abort.signal.aborted)return;
      setPictures([first]);setState('ready');
      try{const dim=await load('kitchen-dim.webp');if(!abort.signal.aborted)setPictures([first,dim]);}catch{/* a single still remains playable */}
    }).catch(()=>{if(!abort.signal.aborted)setState('error');});
    return()=>{abort.abort();for(const uri of owned)URL.revokeObjectURL(uri);};
  },[attempt]);

  useEffect(()=>{
    const a=new KitchenAudio();audio.current=a;
    const visible=()=>{setActive(!document.hidden);a.visibility(document.hidden);};
    const media=matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>setMotionPref(media.matches);
    document.addEventListener('visibilitychange',visible);media.addEventListener('change',motion);
    return()=>{document.removeEventListener('visibilitychange',visible);media.removeEventListener('change',motion);a.close();audio.current=null;};
  },[]);
  useEffect(()=>{audio.current?.apply(settings);},[settings]);
  useEffect(()=>{
    setPhase(0);
    if(!active||reduced||pictures.length<2)return;
    let jobs:ReturnType<typeof setTimeout>[]=[];
    const cycle=()=>{
      const {wait,frames}=kitchenLamp();
      jobs=frames.map(({at,level})=>setTimeout(()=>{
        setPhase(level);if(level>.39)audio.current?.spark();
      },wait+at));
      jobs.push(setTimeout(cycle,wait+(frames.at(-1)?.at??0)+100));
    };cycle();return()=>jobs.forEach(clearTimeout);
  },[active,reduced,pictures.length]);
  const choose=(action:()=>void)=>{audio.current?.unlock(settings);audio.current?.select();setSound(true);action();};
  if(state==='loading')return <section className="km-loading" data-testid="kitchen-loading" role="status">
    <p className="km-mark">100<span>GATE</span></p><progress aria-label={t('Загрузка изображения кухни','Loading the kitchen image')}/>
    <p>{t('Загрузка фоновой сцены','Loading the background scene')}</p>
  </section>;
  return <section data-testid="kitchen-menu" data-background={state} className="km-shell" style={{'--km-scale':settings.uiScale} as CSSProperties}>
    <div className="km-scene" aria-hidden="true" data-active={active&&!motionPref&&settings.cameraMotion>.05}
      data-soft={settings.kitchenSoftness} style={{filter:`brightness(${settings.brightness})`}}>
      {pictures[0]&&<img src={pictures[0]} alt="" draggable={false}/>}
      {pictures[1]&&<img data-testid="kitchen-dim" src={pictures[1]} alt="" draggable={false} style={{opacity:phase}}/>}
    </div>
    <div className={`km-shade${settings.highContrast?' km-contrast':''}${settings.vignette?' km-vignette':''}`}/>
    {settings.grain&&<div className="km-grain" aria-hidden="true"/>}
    <header className="km-top"><span>100GATE / 01</span><span>{t('ПСИХОЛОГИЧЕСКИЙ ХОРРОР','PSYCHOLOGICAL HORROR')}</span></header>
    <div className="km-content">
      <p className="km-index">{t('ГЛАВА I  /  ЗАБРОШЕННЫЙ ДОМ','CHAPTER I  /  THE ABANDONED HOUSE')}</p>
      <h1 className="km-mark">100<span>GATE</span></h1>
      <p className="km-tagline">{t('Дом, который помнит.','The house that remembers.')}</p>
      <nav className="km-nav" aria-label={t('Главное меню','Main menu')}>
        <button data-testid="continue-story-home" disabled={!hasSave} onClick={()=>choose(resume)}>{t('Продолжить','Continue')}</button>
        <button data-testid="start-story-home" onClick={()=>choose(start)}>{t('Новая игра','New game')}</button>
        <button data-testid="kitchen-settings" onClick={()=>choose(settingsOpen)}>{t('Настройки','Settings')}</button>
        <button data-testid="kitchen-credits" onClick={()=>choose(creditsOpen)}>{t('Авторы','Credits')}</button>
      </nav>
      {state==='error'&&<div className="km-fallback" role="alert">
        <p>{t('Не удалось загрузить фон. Игру можно запустить.','The background could not load. The game is still available.')}</p>
        <button onClick={()=>retry(a=>a+1)}>{t('Повторить','Retry')}</button>
      </div>}
    </div>
    <footer className="km-bottom"><span>{t('ДЕЛО № 100  /  23 ОКТЯБРЯ','CASE NO. 100  /  OCTOBER 23')}</span>
      {!sound&&<button data-testid="kitchen-sound" onClick={()=>choose(()=>{})}>{t('Включить звук','Enable sound')}</button>}</footer>
  </section>;
}
