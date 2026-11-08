import { DEFAULT_SETTINGS, validSave, type Settings } from './data';

export type ProductionIntent='new'|'continue';
export const SAVE_KEY='100gate.chapter1.save.v1';
export const SETTINGS_KEY='100gate.settings.v1';
export const TOKEN_KEY='100gate.save-token.v1';

export function readLocal(key:string):unknown{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
export function writeLocal(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export function readSave(){const raw=readLocal(SAVE_KEY);return validSave(raw)?raw:undefined;}

export function canWriteGameSave(intent:ProductionIntent|undefined,free:boolean,ready:boolean){
  return ready&&(!intent||intent==='continue'||free);
}

export function readSettings():Settings{
  const stored=readLocal(SETTINGS_KEY), settings={...DEFAULT_SETTINGS};
  if(!stored||typeof stored!=='object')return settings;
  const s=stored as Partial<Settings>;
  if(s.language==='ru'||s.language==='en')settings.language=s.language;
  if(s.quality==='low'||s.quality==='medium'||s.quality==='high')settings.quality=s.quality;
  if(typeof s.volume==='number'&&Number.isFinite(s.volume))settings.volume=Math.max(0,Math.min(1,s.volume));
  if(typeof s.sensitivity==='number'&&Number.isFinite(s.sensitivity))settings.sensitivity=Math.max(.2,Math.min(2,s.sensitivity));
  if(typeof s.headBob==='boolean')settings.headBob=s.headBob;
  if(typeof s.cameraMotion==='number'&&Number.isFinite(s.cameraMotion))settings.cameraMotion=Math.max(0,Math.min(1,s.cameraMotion));
  if(s.weather==='rain'||s.weather==='snow')settings.weather=s.weather;
  for(const key of ['shadows','ambientEffects','grain','vignette','kitchenSoftness','mute','invertY','reducedFlicker','subtitles','highContrast'] as const)
    if(typeof s[key]==='boolean')settings[key]=s[key];
  for(const [key,min,max] of [
    ['renderScale',.60,1.15],['brightness',.75,1.3],['ambienceVolume',0,1],['sfxVolume',0,1],['uiVolume',0,1],
    ['subtitleScale',.9,1.4],['uiScale',.9,1.2],
  ] as const){
    const n=s[key];if(typeof n==='number'&&Number.isFinite(n))settings[key]=Math.max(min,Math.min(max,n));
  }
  if(s.fpsCap===0||s.fpsCap===30||s.fpsCap===60)settings.fpsCap=s.fpsCap;
  return settings;
}
