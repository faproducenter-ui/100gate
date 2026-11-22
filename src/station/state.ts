/** Gas station (chapter 2) game state and interactions. Pure: no three.js, no DOM. Positions are Blender ground coordinates. */
export const STATION_SAVE='100gate-station-v1';
export const SAFE_CODE='0412';

export type StationSave={x:number;y:number;yaw:number;items:string[];safe:boolean;doors:Record<string,boolean>;read:string[]};
export type Doc={title:string;text:string};
export type Spot={id:string;label:string;x:number;y:number;z:number;reach?:number};

export const SPOTS:Spot[]=[
  {id:'door:shop',label:'Решётчатая дверь',x:-1.88,y:-.87,z:1.2,reach:1.7},
  {id:'safe',label:'Сейф',x:-3.4,y:10.77,z:.7},
  {id:'calendar',label:'Календарь',x:-1.6,y:11.55,z:1.6},
  {id:'clock',label:'Часы',x:-.35,y:11.55,z:2.5,reach:2.2},
  {id:'register',label:'Касса',x:3.5,y:2.62,z:1.6},
  {id:'map',label:'Багажник',x:-3.38,y:-10.78,z:.75,reach:1.7},
  {id:'door:motel1',label:'Номер 1',x:19.8,y:-19.8,z:1,reach:1.5},
  {id:'door:motel2',label:'Номер 2',x:19.8,y:-16,z:1,reach:1.5},
  {id:'door:motel3',label:'Номер 3',x:19.8,y:-12.2,z:1,reach:1.5},
  {id:'door:shed',label:'Дверь сарая',x:-22.18,y:11.21,z:1,reach:1.5},
  {id:'door:gate',label:'Ворота',x:5,y:16,z:1,reach:1.8},
  {id:'manhole',label:'Люк',x:-15.2,y:-31,z:.1,reach:1.6},
];

export const DOCS:Record<string,Doc>={
  calendar:{title:'Календарь',text:'Декабрь 2001. Четвёртое число обведено красным маркером. Ниже приписка от руки: «не забыть: сейф».'},
  clock:{title:'Часы',text:'Стрелки стоят на 3:47. Секундная дёргается на одном месте.'},
  register:{title:'Касса',text:'Экран мигает и гаснет. Сквозь помехи читается: «ОШИБКА 04-12 · СМЕНА НЕ ЗАКРЫТА».'},
  note:{title:'Записка сменщика',text:'Колонки не трогай, пока не выставишь литры как в журнале: первая 12, вторая 04, третья 01.\nКарта от решётки тут же.\nЕсли меня нет к утру, уходи по дороге к мотелю. Не к лесу.\n— В.'},
  map:{title:'Карта из багажника',text:'Карта округа, сложенная вчетверо. Красные крестики: дом у леса (подпись «генератор»), мотель («№3») и люк на дороге к западу.\nЗа краем листа карандашом: «рельсы → депо».'},
};

export const newStationSave=(x:number,y:number,yaw:number):StationSave=>({x,y,yaw,items:[],safe:false,doors:{},read:[]});

export function readStation(raw:string|null):StationSave|undefined{
  if(!raw)return undefined;
  try{
    const s=JSON.parse(raw) as Partial<StationSave>;
    if(typeof s.x!=='number'||typeof s.y!=='number'||!Number.isFinite(s.x)||!Number.isFinite(s.y))return undefined;
    return {x:s.x,y:s.y,yaw:Number.isFinite(s.yaw)?s.yaw!:0,items:Array.isArray(s.items)?s.items.filter(i=>typeof i==='string'):[],
      safe:s.safe===true,doors:typeof s.doors==='object'&&s.doors?s.doors:{},read:Array.isArray(s.read)?s.read.filter(i=>typeof i==='string'):[]};
  }catch{return undefined;}
}

/** The spot the player is facing within reach: closest in angle, then distance. dir is the look direction on the ground plane. */
export function aimSpot(p:{x:number;y:number},dir:{x:number;y:number},spots=SPOTS){
  let best:Spot|undefined,score=Infinity;
  for(const s of spots){
    const dx=s.x-p.x,dy=s.y-p.y,d=Math.hypot(dx,dy);
    if(d>(s.reach??1.35))continue;
    const cos=d<.05?1:(dx*dir.x+dy*dir.y)/d;
    if(cos<.72)continue;
    const sc=d*(1.6-cos);
    if(sc<score){score=sc;best=s;}
  }
  return best;
}

export type Outcome={save:StationSave;notice?:string;doc?:Doc;panel?:'safe';door?:string};

/** What pressing "use" on a spot does. */
export function useSpot(s:StationSave,id:string):Outcome{
  if(id.startsWith('door:')){
    const door=id.slice(5);
    if(door==='shop'&&!s.items.includes('keycard'))return {save:s,notice:'Заперто. Замок решётки открывается картой.'};
    if(door==='motel2')return {save:s,notice:'Номер 2 заперт изнутри.'};
    if(door==='gate')return {save:s,notice:'Ворота заперты на цепь.'};
    return {save:{...s,doors:{...s.doors,[door]:!s.doors[door]}},door};
  }
  if(id==='safe'){
    if(s.safe)return {save:s,doc:DOCS.note};
    return {save:s,panel:'safe'};
  }
  if(id==='manhole')return {save:s,notice:'Крышка прикипела. Нужен шестигранный ключ.'};
  const doc=DOCS[id];
  if(doc)return {save:s.read.includes(id)?s:{...s,read:[...s.read,id]},doc};
  return {save:s};
}

/** A code entered on the safe dial. */
export function trySafe(s:StationSave,code:string):Outcome{
  if(s.safe)return {save:s};
  if(code!==SAFE_CODE)return {save:s,notice:'Сейф не открылся.'};
  return {save:{...s,safe:true,items:[...s.items,'keycard','note'],read:[...s.read,'note']},doc:DOCS.note,notice:'Сейф открыт: карта от решётки и записка.'};
}
