import type {DoorStates} from './map';

export type ItemId='lighter'|'torch'|'technicalKey'|'archiveKey'|'plan'|'memo'|'vhs'|'file'|'battery'|'exitKey';
export type PowerLine='lights'|'locks'|'cctv';
export type CameraId='reception'|'corridor'|'archive';
export type TapeId='shift'|'future';
export type Panel='pause'|'settings'|'credits'|'inventory'|'journal'|'breaker'|'cctv'|'document'|'new-confirm'|'keypad';
export type Mode='title'|'play'|'complete'|'loading'|'error';
export interface Save {
  version:1;x:number;z:number;items:ItemId[];doors:DoorStates;
  dutyRead:boolean;diagramRead:boolean;power:boolean;breaker:PowerLine[];
  archiveClue:boolean;archiveIndex:boolean;finished:boolean;
  anomaly:boolean;
  /** the knife switch has been thrown by hand (J): with all three lines on, this is what lets the current through */
  fed:boolean;
  /** charge of the camera's battery, percent */
  charge:number;
  /** The torch burns in the hand; `lit` = it has been lit at least once (the first quest). */
  lightOn:boolean;lit:boolean;
  /** Props put down by hand: world pose [x,y,z,qx,qy,qz,qw]; a dropped torch remembers if it was burning. */
  props?:Partial<Record<'torch',number[]>>;torchLit?:boolean;
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
/** what a paper thing is, for the two-handed first-person inspect view (size, grip and look of the sheet) */
export type PaperKind='document'|'note'|'map'|'letter'|'page'|'clipping';
export type DocumentView={title:string;text:string;/** pinned to a wall: the camera moves up to it, nothing is taken in the hand */wall?:boolean;/** held up in both hands; defaults to a document */kind?:PaperKind};
export type UIAction=
  |{type:'torch'}|{type:'drop'}|{type:'skip-intro'}
  |{type:'touch';move?:{x:number;z:number};look?:{dx:number;dy:number};sprint?:boolean;crouch?:boolean}
  |{type:'start'|'continue'|'retry'|'resume'|'title'|'fullscreen'|'close'|'interact'|'archive-evidence'|'cctv-play'|'cctv-zoom'|'reset-breaker'}
  |{type:'cctv-step';delta:number}|{type:'cctv-seek';time:number}
  |{type:'cctv-camera';camera:CameraId}|{type:'cctv-tape';tape:TapeId}
  |{type:'panel';panel:Panel}|{type:'settings';patch:Partial<Settings>}
  |{type:'breaker';line:PowerLine}|{type:'keypad';code:string};
