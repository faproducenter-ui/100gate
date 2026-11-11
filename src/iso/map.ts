export type RoomId='reception'|'technical'|'surveillance'|'archive'|'corridor';
export type DoorId='technical'|'surveillance'|'archive';
export type DoorStates=Record<DoorId,boolean>;
export type Point={x:number;z:number};
type Bounds={name:string;minX:number;maxX:number;minZ:number;maxZ:number};
export const ROOMS:Record<RoomId,Bounds>={
  reception:{name:'Приёмная',minX:-5,maxX:0,minZ:0,maxZ:5},
  technical:{name:'Электрощитовая',minX:-5,maxX:0,minZ:-5,maxZ:-1.25},
  corridor:{name:'Коридор',minX:0,maxX:2.4,minZ:-5,maxZ:5},
  surveillance:{name:'Операторская',minX:2.4,maxX:7.5,minZ:0,maxZ:5},
  archive:{name:'Архив',minX:2.4,maxX:7.5,minZ:-5,maxZ:-1.25},
};
export const DOORS:Record<DoorId,Point&{room:RoomId;half:number}>={
  technical:{x:0,z:-3.25,half:.625,room:'technical'},
  surveillance:{x:2.4,z:2.15,half:.625,room:'surveillance'},
  archive:{x:2.4,z:-3.25,half:.625,room:'archive'},
};
export const RECEPTION_PORTAL={x:0,z:2.15,half:.625};
export const START={x:-1.75,z:3.6};

type Interactable=Point&{room:RoomId;label:string};
export const OBJECTS={
  flashlight:{room:'reception',x:-4.25,z:.95,label:'Фонарь'},
  battery1:{room:'reception',x:-.60,z:3.90,label:'Батарейки'},
  battery2:{room:'corridor',x:1.60,z:-.90,label:'Батарейки'},
  battery3:{room:'technical',x:-1.20,z:-2.40,label:'Батарейки'},
  battery4:{room:'surveillance',x:3.40,z:1.60,label:'Батарейки'},
  battery5:{room:'archive',x:5.00,z:-2.20,label:'Батарейки'},
  dutyLog:{room:'reception',x:-3.35,z:1.38,label:'Журнал дежурств'},
  underDesk:{room:'reception',x:-4.31,z:1.45,label:'Под столешницей'},
  drawer:{room:'reception',x:-2.86,z:1.02,label:'Ящик стола'},
  phone:{room:'reception',x:-3.87,z:.97,label:'Телефон'},
  buildingPlan:{room:'reception',x:-.84,z:.5,label:'План здания'},
  archiveCache:{room:'reception',x:-4.13,z:3.94,label:'Картотека'},
  technicalDoor:{room:'corridor',x:.18,z:-3.25,label:'Дверь щитовой'},
  powerDiagram:{room:'technical',x:-2.35,z:-4.42,label:'Схема питания'},
  breaker:{room:'technical',x:-3.80,z:-3.98,label:'Электрощит'},
  surveillanceDoor:{room:'corridor',x:2.22,z:2.15,label:'Дверь операторской'},
  terminal:{room:'surveillance',x:4.85,z:1.60,label:'Терминал наблюдения'},
  vhs:{room:'surveillance',x:6.67,z:3.32,label:'Кассета VHS'},
  archiveDoor:{room:'corridor',x:2.22,z:-3.25,label:'Дверь архива'},
  archiveIndex:{room:'archive',x:3.75,z:-2.04,label:'Указатель стеллажей'},
  fileZero:{room:'archive',x:6.69,z:-3.30,label:'Стеллаж Б · секция 4'},
} satisfies Record<string,Interactable>;
export type ObjectId=keyof typeof OBJECTS;
export const BATTERIES=['battery1','battery2','battery3','battery4','battery5'] as const satisfies readonly ObjectId[];
export const FURNITURE:readonly (Point&{room:RoomId;w:number;d:number;kind:string})[]=[
  {room:'reception',kind:'desk',x:-3.66,z:.91,w:1.88,d:.78},
  {room:'reception',kind:'chair',x:-2.24,z:.55,w:.55,d:.50},
  // The open reception door leaf standing against the wall beside the doorway.
  {room:'reception',kind:'doorLeaf',x:-.12,z:.91,w:.07,d:1.23},
  {room:'reception',kind:'fileCabinet',x:-4.53,z:3.94,w:.55,d:1.21},
  {room:'reception',kind:'shelf',x:-.86,z:4.51,w:1.14,d:.53},
  {room:'reception',kind:'waiting',x:-3.21,z:4.55,w:1.45,d:.56},
  {room:'technical',kind:'toolBench',x:-2.55,z:-1.75,w:1.72,d:.53},
  {room:'technical',kind:'locker',x:-4.59,z:-2.11,w:.51,d:.9},
  {room:'technical',kind:'panel',x:-3.80,z:-4.70,w:.98,d:.24},
  {room:'surveillance',kind:'console',x:4.99,z:.99,w:2.82,d:.85},
  {room:'surveillance',kind:'chair',x:5.68,z:2.15,w:.55,d:.50},
  {room:'surveillance',kind:'tapeCabinet',x:7.05,z:3.32,w:.51,d:1.15},
  {room:'archive',kind:'archiveDesk',x:3.75,z:-1.62,w:1.30,d:.54},
  {room:'archive',kind:'archiveShelf',x:5.00,z:-4.51,w:3.1,d:.56},
  {room:'archive',kind:'archiveShelfSide',x:7.06,z:-3.27,w:.55,d:1.76},
];

const roomEntries=Object.entries(ROOMS) as [RoomId,Bounds][];
export const roomAt=(x:number,z:number):RoomId|undefined=>roomEntries.find(([,r])=>
  x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ)?.[0];

function floorAt(x:number,z:number,doors:DoorStates) {
  if(!roomAt(x,z))return false;
  for(const [id,p] of Object.entries({...DOORS,reception:RECEPTION_PORTAL})){
    if(Math.abs(x-p.x)>.13)continue;
    // The whole dividing wall only has one opening per room.
    const isRoomBand=id==='technical'||id==='archive'?z<-1.25:z>=0;
    if(isRoomBand&&((p.x===0&&(id==='technical'||id==='reception'))||
      (p.x===2.4&&(id==='surveillance'||id==='archive')))){
      if(Math.abs(z-p.z)>=p.half||!(id==='reception'||doors[id as DoorId]))return false;
    }
  }
  for(const [key,door] of Object.entries(DOORS) as [DoorId,typeof DOORS[DoorId]][]){
    if(!doors[key])continue;
    const sweep=(x-door.x)*(key==='technical'?-1:1);
    if(sweep>=0&&sweep<door.half*2&&Math.abs(z-(door.z-door.half))<.047)return false;
  }
  return !FURNITURE.some(f=>Math.abs(x-f.x)<f.w/2 && Math.abs(z-f.z)<f.d/2);
}
export const PLAYER_RADIUS=.22;
const footprint=Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4)*PLAYER_RADIUS,Math.sin(i*Math.PI/4)*PLAYER_RADIUS] as const);
export function canStand(x:number,z:number,doors:DoorStates) {
  return floorAt(x,z,doors)&&footprint.every(([dx,dz])=>floorAt(x+dx,z+dz,doors));
}

/** Substep even if the caller supplies a large delta; sweep axes independently
 * so the walking circle can slide around a jamb without tunnelling. */
export function movePlayer(p:Point,dx:number,dz:number,doors:DoorStates):Point {
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
  let {x,z}=p;
  for(let i=0;i<steps;i++){
    const nx=x+dx/steps,nz=z+dz/steps;
    if(canStand(nx,z,doors))x=nx;
    if(canStand(x,nz,doors))z=nz;
  }
  return {x,z};
}

export const doorFor:Partial<Record<ObjectId,DoorId>>={
  technicalDoor:'technical',surveillanceDoor:'surveillance',archiveDoor:'archive',
};
export const withinReach=(id:ObjectId,p:Point,extra=0)=> {
  const o=OBJECTS[id],room=roomAt(p.x,p.z);
  const door=doorFor[id];
  return (room===o.room||(door!==undefined&&room===door))&&Math.hypot(p.x-o.x,p.z-o.z)<(door?1.15:1.20)+extra;
};
