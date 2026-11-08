import {useEffect,useRef,useState,type ReactNode} from 'react';
import {DEFAULT_SETTINGS,text,type Settings} from './data';
import {chapterAsset} from './release';

const tabs=['graphics','audio','controls','access'] as const;
type Props={settings:Settings;change:(patch:Partial<Settings>)=>void;close:()=>void;fullscreen:()=>void;restore:()=>void;cloud:string};
function Modal({children,title,close}:{children:ReactNode;title:string;close:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current;if(!dialog)return;
    dialog.showModal();return()=>dialog.close();
  },[]);
  return <dialog ref={ref} className="km-dialog" aria-label={title} onCancel={e=>{e.preventDefault();close();}}>
    <header><h2>{title}</h2><button autoFocus className="km-close" aria-label={title+' ×'} onClick={close}>×</button></header>
    {children}
  </dialog>;
}
export function KitchenCredits({settings,close}:{settings:Settings;close:()=>void}){
  const t=(ru:string,en:string)=>text(settings.language,ru,en);
  return <Modal title={t('Авторы','Credits')} close={close}><div className="km-options">
    <p>100GATE / faproducenter-ui</p>
    <p>{t('Захват движений: CMU Graphics Lab. Персонажи: MakeHuman Community. Автомобиль: Innerscene. Материалы кухни: Poly Haven и ассеты 100GATE.',
      'Motion capture: CMU Graphics Lab. Characters: MakeHuman Community. Sedan: Innerscene. Kitchen materials: Poly Haven and 100GATE assets.')}</p>
    <a href={chapterAsset('credits/STORY-QUALITY-OVERHAUL.json')} target="_blank" rel="noreferrer">{t('Источники и лицензии','Sources and licenses')}</a>
    <a href={chapterAsset('assets/menu/kitchen-sources.json')} target="_blank" rel="noreferrer">{t('Материалы кухни','Kitchen materials')}</a>
    <a href={chapterAsset('credits/STORY-CITY-AUDIO.json')} target="_blank" rel="noreferrer">{t('Лицензии звука','Audio credits')}</a>
  </div></Modal>;
}
export default function KitchenOptions({settings:s,change,close,fullscreen,restore,cloud}:Props){
  const t=(ru:string,en:string)=>text(s.language,ru,en);
  const [active,setActive]=useState<typeof tabs[number]>('graphics');
  const tabLabels={graphics:t('Графика','Graphics'),audio:t('Звук','Audio'),controls:t('Управление','Controls'),access:t('Доступность','Accessibility')};
  const slider=(key:'renderScale'|'brightness'|'volume'|'ambienceVolume'|'sfxVolume'|'uiVolume'|'sensitivity'|'cameraMotion'|'subtitleScale'|'uiScale',label:string,min=0,max=1)=>{
    const value=s[key];
    return <label className="km-option" key={key}><span>{label}<small>{key==='sensitivity'?value.toFixed(2):Math.round(value*100)+'%'}</small></span>
      <input data-testid={'setting-'+key} type="range" min={min} max={max} step=".05" value={value} onChange={e=>change({[key]:Number(e.target.value)})}/></label>;
  };
  const toggle=(key:'shadows'|'ambientEffects'|'grain'|'vignette'|'kitchenSoftness'|'mute'|'invertY'|'headBob'|'reducedFlicker'|'subtitles'|'highContrast',label:string)=>
    <label className="km-option km-toggle" key={key}><span>{label}</span><input data-testid={'setting-'+key} type="checkbox" checked={s[key]} onChange={e=>change({[key]:e.target.checked})}/></label>;
  return <Modal title={t('Настройки','Settings')} close={close}>
    <nav className="km-tabs" aria-label={t('Разделы настроек','Settings sections')}>
      {tabs.map(id=><button key={id} data-testid={'settings-tab-'+id} aria-pressed={id===active} onClick={()=>setActive(id)}>{tabLabels[id]}</button>)}
    </nav>
    <div className="km-options" key={active}>
      {active==='graphics'&&<>
        <label className="km-option"><span>{t('Качество','Quality')}</span><select data-testid="setting-quality" value={s.quality} onChange={e=>change({quality:e.target.value as Settings['quality']})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        {slider('renderScale',t('Масштаб рендера','Render scale'),.6,1.15)}
        {slider('brightness',t('Яркость','Brightness'),.75,1.3)}
        <label className="km-option"><span>{t('Ограничение кадров','Frame limit')}</span><select data-testid="setting-fpsCap" value={s.fpsCap} onChange={e=>change({fpsCap:Number(e.target.value) as Settings['fpsCap']})}><option value={0}>{t('Без ограничения','Unlimited')}</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select></label>
        {toggle('shadows',t('Динамические тени (Medium / High)','Dynamic shadows (Medium / High)'))}
        {toggle('ambientEffects',t('Частицы погоды','Weather particles'))}
        {toggle('kitchenSoftness',t('Мягкий фон меню','Soft menu backdrop'))}
        {toggle('grain',t('Зерно','Grain'))}{toggle('vignette',t('Виньетка','Vignette'))}
        <label className="km-option"><span>{t('Осадки','Precipitation')}</span><select value={s.weather} onChange={e=>change({weather:e.target.value as Settings['weather']})}><option value="rain">{t('Дождь','Rain')}</option><option value="snow">{t('Снег','Snow')}</option></select></label>
        <button onClick={fullscreen}>{t('Полный экран','Fullscreen')}</button>
      </>}
      {active==='audio'&&<>{slider('volume',t('Общая громкость','Master volume'))}
        {slider('ambienceVolume',t('Атмосфера','Ambience'))}{slider('sfxVolume',t('Игровые эффекты','Game effects'))}
        {slider('uiVolume',t('Интерфейс','Interface'))}{toggle('mute',t('Выключить весь звук','Mute all'))}
        <p>{t('Музыкальной дорожки и озвучки диалогов в этой версии нет.','There is no music track or dialogue voice-over in this version.')}</p></>}
      {active==='controls'&&<>{slider('sensitivity',t('Чувствительность обзора','Look sensitivity'),.2,2)}
        {toggle('invertY',t('Инвертировать вертикальный обзор','Invert vertical look'))}
        <dl className="km-bindings"><dt>WASD</dt><dd>{t('Ходить','Move')}</dd><dt>Ctrl / Shift / Space</dt><dd>{t('Бег / присесть / прыжок','Run / crouch / jump')}</dd><dt>E / G / F / R</dt><dd>{t('Поднять / открыть / изучить / удерживать','Take / open / examine / hold')}</dd><dt>T / H / Esc</dt><dd>{t('Фонарь / сумка / пауза','Flashlight / bag / pause')}</dd></dl></>}
      {active==='access'&&<>
        <label className="km-option"><span>{t('Язык','Language')}</span><select value={s.language} onChange={e=>change({language:e.target.value as Settings['language']})}><option value="ru">Русский</option><option value="en">English</option></select></label>
        {toggle('reducedFlicker',t('Уменьшить мерцание','Reduce flicker'))}
        {slider('cameraMotion',t('Движение камеры','Camera motion'))}{toggle('headBob',t('Покачивание при ходьбе','Walking head bob'))}
        {toggle('subtitles',t('Субтитры диалога','Dialogue subtitles'))}
        {slider('subtitleScale',t('Размер субтитров','Subtitle size'),.9,1.4)}
        {slider('uiScale',t('Размер меню','Menu size'),.9,1.2)}
        {toggle('highContrast',t('Контрастное меню и субтитры','High contrast menu and subtitles'))}
      </>}
    </div>
    <footer><small aria-live="polite">{cloud}</small><div><button onClick={restore}>{t('Восстановить копию','Restore backup')}</button>
      <button data-testid="settings-reset" onClick={()=>change(DEFAULT_SETTINGS)}>{t('Сбросить настройки','Reset settings')}</button>
      <button className="km-done" data-testid="settings-done" onClick={close}>{t('Готово','Done')}</button></div></footer>
  </Modal>;
}
