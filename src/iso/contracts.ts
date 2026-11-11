import type {DoorStates} from './map';

export type ItemId='flashlight'|'technicalKey'|'archiveKey'|'plan'|'memo'|'vhs'|'file';
export type PowerLine='lights'|'locks'|'cctv';
export type CameraId='reception'|'corridor'|'archive';
export type TapeId='shift'|'future';
export type Panel='pause'|'settings'|'credits'|'inventory'|'journal'|'breaker'|'cctv'|'document'|'new-confirm';
export type Mode='title'|'play'|'complete'|'loading'|'error';
export interface Save {
  version:1;x:number;z:number;items:ItemId[];doors:DoorStates;
  dutyRead:boolean;diagramRead:boolean;power:boolean;breaker:PowerLine[];
  archiveClue:boolean;archiveIndex:boolean;finished:boolean;
  anomaly:boolean;
  /** Optional side system: flashlight charge 0..100, spare batteries, picked-up battery ids. */
  lightOn:boolean;charge:number;spare:number;taken:string[];
}
export type Settings={
  quality:'low'|'medium'|'high';scale:number;shadows:boolean;ambient:boolean;motion:boolean;reducedFlicker:boolean;
  volume:number;ambience:number;effects:number;ui:number;textScale:number;hints:boolean;
  /** 'fps' = first person (default), 'iso' = the original isometric camera. */
  view:'fps'|'iso';sensitivity:number;
  keys:{up:string;down:string;left:string;right:string;interact:string;sprint:string;crouch:string;light:string};
};
export const DEFAULTS:Settings={
  quality:'medium',scale:1,shadows:true,ambient:true,motion:true,reducedFlicker:false,
  volume:.8,ambience:.55,effects:.65,ui:.6,textScale:1,hints:true,view:'fps',sensitivity:1,
  keys:{up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',interact:'KeyE',sprint:'ShiftLeft',crouch:'KeyC',light:'KeyF'},
};
export type CCTVView={camera:CameraId;tape:TapeId;time:number;duration:number;playing:boolean;
  availableFuture:boolean;evidence:boolean;zoom:boolean};
export type DocumentView={title:string;text:string};
export type UIAction=
  |{type:'flashlight'}
  |{type:'start'|'continue'|'retry'|'resume'|'title'|'fullscreen'|'close'|'interact'|'archive-evidence'|'cctv-play'|'cctv-zoom'|'reset-breaker'}
  |{type:'cctv-step';delta:number}|{type:'cctv-seek';time:number}
  |{type:'cctv-camera';camera:CameraId}|{type:'cctv-tape';tape:TapeId}
  |{type:'panel';panel:Panel}|{type:'settings';patch:Partial<Settings>}
  |{type:'breaker';line:PowerLine};
