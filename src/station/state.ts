/** Gas station game state and interactions. Pure: no three.js, no DOM. Positions are Blender ground coordinates.
 * The player comes out of the administration building (the house by the road) and works through the station:
 * pump note → glove box (shop key) → shop: calendar → safe (shed key, note), clock → register (car key, receipt)
 * → trunk (map) → shed (hex key, note about the gate key) → motel room 2, plate number on the code lock → gate key → gate. */
export const STATION_SAVE='100gate-station-v1';

export type LockId='safe'|'register'|'motel2';
/** Code locks: the code and what the keypad says on it. */
export const LOCKS:Record<LockId,{code:string;title:string;hint:string}>={
  safe:{code:'0412',title:'Сейф',hint:'Четыре цифры. На дверце: «ДД ММ».'},
  register:{code:'0347',title:'Касса · код кассира',hint:'«Код смены — время её закрытия».'},
  motel2:{code:'417',title:'Номер 2 · кодовый замок',hint:'Три цифры.'},
};
export const SAFE_CODE=LOCKS.safe.code;

export type StationSave={x:number;y:number;yaw:number;items:string[];safe:boolean;doors:Record<string,boolean>;read:string[];
  /** code locks already opened */open?:string[]};
export type Doc={title:string;text:string};
export type Spot={id:string;label:string;x:number;y:number;z:number;reach?:number};

export const ITEM_NAMES:Record<string,string>={
  shopKey:'Ключ от магазина',keycard:'Карта от решётки',shedKey:'Ключ от сарая',carKey:'Ключи от машины',
  hexKey:'Шестигранный ключ',gateKey:'Ключ от цепи на воротах',note:'Записка сменщика',map:'Карта округа',receipt:'Чек',
};

export const SPOTS:Spot[]=[
  {id:'house',label:'Дверь администрации',x:-18.3,y:4.4,z:1.1,reach:1.6},
  {id:'pump',label:'Колонка №2',x:1.58,y:-6.74,z:1.2,reach:1.6},
  {id:'glovebox',label:'Машина · бардачок',x:-1.2,y:-9.75,z:.9,reach:1.7},
  {id:'door:shop',label:'Решётчатая дверь',x:-1.88,y:-.87,z:1.2,reach:1.7},
  {id:'safe',label:'Сейф',x:-3.4,y:10.77,z:.7},
  {id:'calendar',label:'Календарь',x:-1.6,y:11.55,z:1.6},
  {id:'clock',label:'Часы',x:-.35,y:11.55,z:2.5,reach:2.2},
  {id:'register',label:'Касса',x:3.5,y:2.62,z:1.6},
  {id:'map',label:'Багажник',x:-3.38,y:-10.78,z:.75,reach:1.7},
  {id:'door:motel1',label:'Номер 1',x:19.8,y:-19.8,z:1,reach:1.5},
  {id:'door:motel2',label:'Номер 2',x:19.8,y:-16,z:1,reach:1.5},
  {id:'door:motel3',label:'Номер 3',x:19.8,y:-12.2,z:1,reach:1.5},
  {id:'gatekey',label:'Тумба под телевизором',x:22.6,y:-14.5,z:.6,reach:1.5},
  {id:'door:shed',label:'Дверь сарая',x:-22.18,y:11.21,z:1,reach:1.5},
  {id:'bench',label:'Верстак',x:-20.87,y:11.74,z:.9,reach:1.4},
  {id:'shednote',label:'Записка на двери сарая',x:-22.2,y:11.23,z:1.6,reach:1.4},
  {id:'door:gate',label:'Ворота',x:5,y:16,z:1,reach:1.8},
  {id:'manhole',label:'Люк',x:-15.2,y:-31,z:.1,reach:1.6},
];

export const DOCS:Record<string,Doc>={
  pump:{title:'Колонка №2',text:'К табло скотчем прилеплен листок:\n«Магазин закрыл. Ключ оставил в машине, в бардачке. Машина не заводится — не мучай её.\n— В.»'},
  calendar:{title:'Календарь',text:'Декабрь 2001. Четвёртое число обведено красным маркером. Ниже приписка от руки: «не забыть: сейф».'},
  clock:{title:'Часы',text:'Стрелки стоят на 3:47. Секундная дёргается на одном месте. Под часами табличка: «Смена закрыта в».'},
  note:{title:'Записка сменщика',text:'Колонки не трогай, пока не выставишь литры как в журнале: первая 12, вторая 04, третья 01.\nКлюч от сарая — в сейфе, теперь у тебя. Ключи от машины я запер в кассе.\nЕсли меня нет к утру, уходи по дороге за ворота. Не к лесу.\n— В.'},
  receipt:{title:'Чек из кассы',text:'ЧЕК №0347 · 04-12-01 03:47\nМОТЕЛЬ · НОМЕР 2 · ОПЛАЧЕНО\nГОСТЬ: машина у колонки (номер на бампере)\nКОД ДВЕРИ = ЦИФРЫ НОМЕРА'},
  map:{title:'Карта из багажника',text:'Карта округа, сложенная вчетверо. Красные крестики: сарай за домом («ключ — на верстаке»), мотель («№2 — хозяин») и люк на дороге к западу.\nЗа краем листа карандашом: «ворота → дорога к школе №7».'},
  shednote:{title:'Записка в сарае',text:'Цепь на воротах я повесил сам. Ключ от неё у того, кто заперся во втором номере мотеля, — хозяина машины у колонки. Он никому не открывает.\nДверь там на коде. Код — цифры с номера его машины.'},
  gate:{title:'Дорога',text:'Цепь со звоном падает на асфальт. За воротами — тёмная дорога через лес. На покосившемся указателе: «Школа №7 — 4 км».\n\nПродолжение следует.'},
};

export const newStationSave=(x:number,y:number,yaw:number):StationSave=>({x,y,yaw,items:[],safe:false,doors:{},read:[],open:[]});

export function readStation(raw:string|null):StationSave|undefined{
  if(!raw)return undefined;
  try{
    const s=JSON.parse(raw) as Partial<StationSave>;
    if(typeof s.x!=='number'||typeof s.y!=='number'||!Number.isFinite(s.x)||!Number.isFinite(s.y))return undefined;
    const strings=(a:unknown)=>Array.isArray(a)?a.filter((i):i is string=>typeof i==='string'):[];
    const open=strings(s.open);if(s.safe===true&&!open.includes('safe'))open.push('safe');
    return {x:s.x,y:s.y,yaw:Number.isFinite(s.yaw)?s.yaw!:0,items:strings(s.items),
      safe:s.safe===true,doors:typeof s.doors==='object'&&s.doors?s.doors:{},read:strings(s.read),open};
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

export type Outcome={save:StationSave;notice?:string;doc?:Doc;panel?:LockId;door?:string;/** a key or a paper was taken */got?:boolean};

const has=(s:StationSave,id:string)=>s.items.includes(id);
const opened=(s:StationSave,id:LockId)=>!!s.open?.includes(id);
const give=(s:StationSave,...ids:string[]):StationSave=>({...s,items:[...s.items,...ids.filter(i=>!s.items.includes(i))]});
const read=(s:StationSave,id:string):StationSave=>s.read.includes(id)?s:{...s,read:[...s.read,id]};
const swing=(s:StationSave,door:string):Outcome=>({save:{...s,doors:{...s.doors,[door]:!s.doors[door]}},door});
const named=(ids:string[])=>ids.map(i=>ITEM_NAMES[i]??i).join(', ');

/** What pressing "use" on a spot does. `from` is where the player stands (the shop door opens from inside without a key). */
export function useSpot(s:StationSave,id:string,from?:{x:number;y:number}):Outcome{
  if(id.startsWith('door:')){
    const door=id.slice(5);
    if(s.doors[door])return swing(s,door);
    if(door==='shop'){
      const inside=!!from&&from.y>-.87;
      if(!inside&&!has(s,'shopKey')&&!has(s,'keycard'))return {save:s,notice:'Решётка заперта на замок. Где-то должен быть ключ.'};
    }
    if(door==='motel2'&&!opened(s,'motel2'))return {save:s,panel:'motel2'};
    if(door==='shed'&&!has(s,'shedKey'))return {save:s,notice:'Сарай заперт на навесной замок.'};
    if(door==='gate'){
      if(!has(s,'gateKey'))return {save:s,notice:'Ворота заперты на цепь с замком.'};
      const o=swing(read(s,'gate'),door);return {...o,doc:DOCS.gate};
    }
    return swing(s,door);
  }
  switch(id){
    case 'house':return {save:s,notice:'Стальная дверь захлопнулась за спиной. Снаружи у неё нет ручки.'};
    case 'glovebox':{
      if(has(s,'shopKey'))return {save:s,notice:'Бардачок пуст. Ключа зажигания в замке нет.'};
      const n=give(s,'shopKey');
      return {save:n,got:true,notice:'В бардачке: '+named(['shopKey'])+'. Ключа зажигания нет.'};
    }
    case 'safe':
      if(opened(s,'safe'))return {save:s,doc:DOCS.note};
      return {save:s,panel:'safe'};
    case 'register':
      if(opened(s,'register'))return {save:s,doc:DOCS.receipt};
      return {save:s,panel:'register'};
    case 'map':
      if(!has(s,'carKey'))return {save:s,notice:'Багажник заперт. Нужны ключи от машины.'};
      return {save:read(give(s,'map'),'map'),doc:DOCS.map,got:!has(s,'map')};
    case 'bench':
      if(!s.doors.shed)return {save:s};
      if(has(s,'hexKey'))return {save:s,notice:'На верстаке остались только опилки.'};
      return {save:give(s,'hexKey'),got:true,notice:'На верстаке: '+named(['hexKey'])+'.'};
    case 'shednote':
      return {save:read(s,'shednote'),doc:DOCS.shednote};
    case 'gatekey':
      if(!s.doors.motel2)return {save:s};
      if(has(s,'gateKey'))return {save:s,notice:'Под телевизором пусто.'};
      return {save:give(s,'gateKey'),got:true,notice:'Под телевизором: '+named(['gateKey'])+'. Хозяина в номере нет.'};
    case 'manhole':
      if(!has(s,'hexKey'))return {save:s,notice:'Крышка прикипела. Нужен шестигранный ключ.'};
      return {save:s,notice:'Шестигранник поддевает крышку на ладонь. Внизу шумит вода. Спускаться пока нечем.'};
  }
  const doc=DOCS[id];
  if(doc)return {save:read(s,id),doc};
  return {save:s};
}

/** A code entered on a code lock. */
export function tryCode(s:StationSave,lock:LockId,code:string):Outcome{
  if(opened(s,lock))return {save:s};
  if(code!==LOCKS[lock].code)return {save:s,notice:lock==='safe'?'Сейф не открылся.':lock==='register'?'Касса пискнула: «НЕВЕРНЫЙ КОД».':'Замок мигнул красным.'};
  const open={...s,open:[...(s.open??[]),lock]};
  switch(lock){
    case 'safe':return {save:read(give({...open,safe:true},'shedKey','note'),'note'),doc:DOCS.note,got:true,notice:'Сейф открыт: '+named(['shedKey','note'])+'.'};
    case 'register':return {save:read(give(open,'carKey','receipt'),'receipt'),doc:DOCS.receipt,got:true,notice:'Ящик кассы выехал: '+named(['carKey','receipt'])+'.'};
    case 'motel2':return {...swing(open,'motel2'),notice:'Замок щёлкнул. Номер 2 открыт.'};
  }
}
/** The safe dial (kept for older callers). */
export const trySafe=(s:StationSave,code:string)=>tryCode(s,'safe',code);
