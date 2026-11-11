import {DEFAULTS,type CameraId,type DocumentView,type ItemId,type Panel,type PowerLine,type Save,type Settings,type TapeId} from './contracts';
import {BATTERIES,canStand,START,type ObjectId} from './map';

export const SAVE_KEY='100gate.isometric.save.v1';
export const SETTINGS_KEY='100gate.isometric.settings.v1';
export const ITEMS:Record<ItemId,{name:string;description:string;kind:'key'|'paper'|'media'}>={
  flashlight:{name:'Фонарь',description:'Тяжёлый ручной фонарь дежурного. F — включить или выключить. Заряд садится, пока он горит; запасные батарейки меняются сами.',kind:'key'},
  technicalKey:{name:'Ключ от щитовой',description:'Латунный ключ с биркой «Щ». Его приклеили под столом дежурного.',kind:'key'},
  archiveKey:{name:'Ключ от архива',description:'Плоский ключ в бумажном конверте. На конверте — «Не оставлять в журнале».',kind:'key'},
  plan:{name:'План здания',description:'Коридор связывает приёмную, щитовую, операторскую и архив. Школа №7 отмечена за северным выходом.',kind:'paper'},
  memo:{name:'Записка дежурного',description:'Освещение — первым. Затем замки. Камеры подключать последними, после щелчка реле замков.',kind:'paper'},
  vhs:{name:'VHS · ночная смена',description:'Запись с камер за смену. Вручную отмеченные кадры сохраняются в журнале.',kind:'media'},
  file:{name:'Дело о районе №0',description:'Сектор Б, ячейка 4. В акте о закрытии района числится школа №7. Три подписи совпадают с фамилиями пропавших сотрудников.',kind:'paper'},
};
export const QUESTS=[
  {id:'reception',title:'Осмотреть приёмную',description:'Изучи журнал дежурств на столе.'},
  {id:'technical-key',title:'Найти ключ от щитовой',description:'Дежурный оставил его под столешницей.'},
  {id:'power',title:'Восстановить электропитание',description:'Открой щитовую. Изучи схему перед переключением линий.'},
  {id:'footage',title:'Изучить записи камер',description:'Проверь запись приёмной. Поставь на паузу и отметь кадр, где сотрудник прячет ключ.'},
  {id:'archive-key',title:'Найти ключ от архива',description:'Проверь картотеку в приёмной, которую было видно на записи.'},
  {id:'archive',title:'Открыть архив',description:'Используй ключ на двери архива.'},
  {id:'file',title:'Найти документы о районе №0',description:'Изучи указатель стеллажей и пометку в коридорной записи.'},
  {id:'future',title:'Вернуться к терминалу',description:'Проверь новую запись архива. Отметь аномальный кадр.'},
  {id:'school',title:'Найти путь к школе №7',description:'Глава «Администрация» завершена.'},
] as const;
export function activeQuest(s:Save){
  return QUESTS[!s.dutyRead?0:!s.items.includes('technicalKey')?1:!s.power?2:!s.archiveClue?3:
    !s.items.includes('archiveKey')?4:!s.doors.archive?5:!s.items.includes('file')?6:!s.finished?7:8]!;
}

export const newSave=():Save=>({version:1,...START,items:[],doors:{technical:false,surveillance:false,archive:false},
  dutyRead:false,diagramRead:false,power:false,breaker:[],archiveClue:false,archiveIndex:false,anomaly:false,finished:false,
  lightOn:false,charge:100,spare:0,taken:[]});
const order:readonly PowerLine[]=['lights','locks','cctv'];
const has=(s:Save,id:ItemId)=>s.items.includes(id);
const item=(s:Save,id:ItemId):Save=>has(s,id)?s:{...s,items:[...s.items,id]};
type Outcome={state:Save;message?:string;panel?:Panel;document?:DocumentView};
const msg=(state:Save,message:string):Outcome=>({state,message});
const doc=(state:Save,title:string,text:string):Outcome=>({state,panel:'document',document:{title,text}});
const found=(state:Save,id:ItemId):Outcome=>msg(item(state,id),has(state,id)?'Уже в инвентаре.':'Найдено: '+ITEMS[id].name);

export const BATTERY_SECONDS=180;
const swapBattery=(s:Save):Save=>s.charge<=0&&s.spare>0?{...s,charge:100,spare:s.spare-1}:s;
export function toggleLight(s:Save):Outcome{
  if(!has(s,'flashlight'))return msg(s,'У тебя нет фонаря.');
  if(s.lightOn)return msg({...s,lightOn:false},'Фонарь выключен.');
  const n=swapBattery(s);
  return n.charge<=0?msg(s,'Фонарь разряжен. Нужны батарейки.'):msg({...n,lightOn:true},n===s?'Фонарь включён.':'Поставил новые батарейки.');
}
/** Drain only while the beam is on; swap a spare battery automatically when empty. */
export function drainLight(s:Save,dt:number):Outcome{
  if(!s.lightOn||!has(s,'flashlight')||dt<=0)return {state:s};
  const charge=Math.max(0,s.charge-dt*100/BATTERY_SECONDS);
  if(charge>0)return charge<=20&&s.charge>20?msg({...s,charge},'Фонарь садится. Поищи батарейки.'):{state:{...s,charge}};
  if(s.spare>0)return msg({...s,charge:100,spare:s.spare-1},'Поставил новые батарейки.');
  return msg({...s,charge:0,lightOn:false},'Фонарь погас. Нужны батарейки.');
}
function takeBattery(s:Save,id:string):Outcome{
  if(s.taken.includes(id))return msg(s,'Здесь больше ничего нет.');
  let n:Save={...s,taken:[...s.taken,id],spare:s.spare+1};
  const empty=has(n,'flashlight')&&n.charge<=0;
  if(empty)n={...swapBattery(n),lightOn:true};
  return msg(n,empty?'Батарейки найдены. Фонарь снова горит.':'Найдены батарейки.');
}

export function act(s:Save,id:ObjectId):Outcome {
  switch(id){
    case 'flashlight':return has(s,'flashlight')?msg(s,'Уже в инвентаре.'):msg({...item(s,'flashlight'),lightOn:true},'Найден фонарь. F — включить или выключить.');
    case 'battery1':case 'battery2':case 'battery3':case 'battery4':case 'battery5':return takeBattery(s,id);
    case 'dutyLog':return doc({...s,dutyRead:true},'Журнал дежурств · 18 ноября',
      '21:48. После просадки горит только аварийное освещение. Ключ от щитовой приклеил под столешницей, слева.\n\n22:16. Дежурный с архива не явился. Камеру в коридоре оставить включённой.');
    case 'underDesk':return s.dutyRead?found(s,'technicalKey'):msg(s,'Снизу ничего не видно. Возможно, в журнале есть подсказка.');
    case 'drawer':return doc(s,'Ящик стола','Пустые бланки, обрывок ленты и три канцелярские кнопки. Замок ящика давно сломан.');
    case 'phone':return doc(s,'Внутренняя линия','В трубке тихо. На наклейке: «07 — школа». Рядом от руки дописано: «Не перезванивать после 23:00».');
    case 'buildingPlan':return doc(item(s,'plan'),'План здания',ITEMS.plan.description);
    case 'archiveCache':return s.archiveClue?found(s,'archiveKey'):msg(s,'Секции пронумерованы. Без номера искать придётся всю ночь.');
    case 'technicalDoor':return s.doors.technical?msg(s,'Щитовая открыта.'):
      has(s,'technicalKey')?msg({...s,doors:{...s.doors,technical:true}},'Дверь щитовой открыта.'):msg(s,'Нужен ключ от щитовой.');
    case 'powerDiagram':return s.doors.technical?doc(item({...s,diagramRead:true},'memo'),'Схема питания',ITEMS.memo.description):msg(s,'Щитовая заперта.');
    case 'breaker':return s.doors.technical?{state:s,panel:'breaker'}:msg(s,'Щитовая заперта.');
    case 'surveillanceDoor':return s.power?msg({...s,doors:{...s.doors,surveillance:true}},'Замок операторской открыт.'):msg(s,'Электронный замок обесточен.');
    case 'terminal':return s.power&&s.doors.surveillance?{state:s,panel:'cctv'}:msg(s,'Нет сигнала.');
    case 'vhs':return s.doors.surveillance?found(s,'vhs'):msg(s,'Операторская заперта.');
    case 'archiveDoor':return has(s,'archiveKey')?msg({...s,doors:{...s.doors,archive:true}},'Архив открыт.'):msg(s,'Нужен ключ от архива.');
    case 'archiveIndex':return s.doors.archive?doc({...s,archiveIndex:true},'Указатель стеллажей','Секция А — ведомости. Секция Б — районные объекты. Номер ячейки указан на накладной из коридора.'):msg(s,'Архив заперт.');
    case 'fileZero':return !s.doors.archive||!s.anomaly||!s.archiveIndex?msg(s,'Нужны указатель стеллажей и пометка из записи коридора.'):
      doc(item(s,'file'),'Акт №0 / 7',ITEMS.file.description+'\n\nНа обороте: «Запись не стирать. Если время не сходится — проверить камеру архива».');
  }
}

export function pressLine(s:Save,line:PowerLine):Outcome{
  if(!s.doors.technical||s.power)return {state:s};
  if(!s.diagramRead)return msg(s,'Сначала изучи схему питания.');
  if(order[s.breaker.length]!==line)return msg({...s,breaker:[]},'Защита отключила линии. Последовательность сброшена.');
  const breaker=[...s.breaker,line],power=breaker.length===order.length;
  return msg({...s,breaker,power},power?'Питание восстановлено. Электронные замки и камеры работают.':'Линия подключена.');
}

export const cctvDuration=(t:TapeId)=>t==='shift'?24:13;
export function isEvidence(camera:CameraId,tape:TapeId,t:number){
  return tape==='shift'?
    camera==='reception'&&t>=12&&t<=15||camera==='corridor'&&t>=18&&t<=20.5:
    camera==='archive'&&t>=6&&t<=8.5;
}
export function recordEvidence(s:Save,camera:CameraId,tape:TapeId,t:number):Outcome{
  if(!s.power||!s.doors.surveillance||!isEvidence(camera,tape,t))return msg(s,'На этом кадре ничего примечательного.');
  if(tape==='future'){
    if(!has(s,'file'))return msg(s,'Запись недоступна.');
    return msg({...s,finished:true},'Камера показывает завтрашнюю дату. Следующая точка — школа №7.');
  }
  if(camera==='reception')return msg(item({...s,archiveClue:true},'vhs'),'Кадр отмечен: конверт оставлен в верхней секции картотеки приёмной.');
  return msg({...s,anomaly:true},'Кадр отмечен: на накладной «Б–4». В конце коридора кто-то стоит.');
}

export function validSave(value:unknown):value is Save{
  if(!value||typeof value!=='object')return false;
  const s=value as Save;
  if(s.version!==1||!Number.isFinite(s.x)||!Number.isFinite(s.z)||
    !Array.isArray(s.items)||new Set(s.items).size!==s.items.length||!s.items.every(i=>Object.hasOwn(ITEMS,i))||
    !s.doors||!['technical','surveillance','archive'].every(k=>typeof s.doors[k as keyof typeof s.doors]==='boolean')||
    ![s.dutyRead,s.diagramRead,s.power,s.archiveClue,s.archiveIndex,s.anomaly,s.finished].every(v=>typeof v==='boolean')||
    !Array.isArray(s.breaker)||s.breaker.length>3||!s.breaker.every((line,i)=>line===order[i])||
    typeof s.lightOn!=='boolean'||!Number.isFinite(s.charge)||s.charge<0||s.charge>100||!Number.isInteger(s.spare)||s.spare<0||
    !Array.isArray(s.taken)||new Set(s.taken).size!==s.taken.length||!s.taken.every(t=>(BATTERIES as readonly string[]).includes(t))||s.spare>s.taken.length||
    s.power!==(s.breaker.length===3)||!canStand(s.x,s.z,s.doors))return false;
  return !(s.lightOn&&!has(s,'flashlight')||has(s,'technicalKey')&&!s.dutyRead||s.doors.technical&&!has(s,'technicalKey')||
    s.diagramRead&&!s.doors.technical||s.breaker.length>0&&!s.diagramRead||s.doors.surveillance&&!s.power||
    (s.archiveClue||s.anomaly||has(s,'vhs'))&&!s.doors.surveillance||has(s,'archiveKey')&&!s.archiveClue||
    s.doors.archive&&!has(s,'archiveKey')||s.archiveIndex&&!s.doors.archive||
    has(s,'file')&&(!s.doors.archive||!s.anomaly||!s.archiveIndex)||s.finished&&!has(s,'file'));
}
function read(key:string):unknown{try{return JSON.parse(localStorage.getItem(key)??'null');}catch{return null;}}
/** Saves from before the flashlight existed get default light fields. */
export function upgradeSave(value:unknown):unknown{
  if(!value||typeof value!=='object'||'charge' in value)return value;
  return {...value,lightOn:false,charge:100,spare:0,taken:[]};
}
export function getSave(){const value=upgradeSave(read(SAVE_KEY));return validSave(value)?value:null;}
export function write(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export function sanitizeSettings(value:unknown):Settings{
  const p=value as Partial<Settings>|null;
  if(!p||typeof p!=='object')return DEFAULTS;
  const n=(key:'scale'|'volume'|'ambience'|'effects'|'ui'|'textScale',min:number,max:number)=>
    typeof p[key]==='number'&&Number.isFinite(p[key])?Math.min(max,Math.max(min,p[key]!)):DEFAULTS[key];
  const flag=(key:'shadows'|'ambient'|'motion'|'reducedFlicker'|'hints')=>typeof p[key]==='boolean'?p[key]!:DEFAULTS[key];
  const codes=Object.keys(DEFAULTS.keys) as (keyof Settings['keys'])[];
  const keys={...DEFAULTS.keys};
  for(const key of codes){
    const code=p.keys?.[key];
    if(typeof code==='string'&&/^(Key[A-Z]|Arrow(Up|Down|Left|Right)|Digit[0-9]|Shift(Left|Right)|Space)$/.test(code)&&
       !['KeyJ','Tab','Escape'].includes(code))keys[key]=code;
  }
  return {quality:p.quality==='low'||p.quality==='high'?p.quality:'medium',scale:n('scale',.55,1.25),shadows:flag('shadows'),
    ambient:flag('ambient'),motion:flag('motion'),reducedFlicker:flag('reducedFlicker'),hints:flag('hints'),
    volume:n('volume',0,1),ambience:n('ambience',0,1),effects:n('effects',0,1),ui:n('ui',0,1),textScale:n('textScale',.8,1.5),
    keys:new Set(Object.values(keys)).size===codes.length?keys:DEFAULTS.keys};
}
export const readSettings=()=>sanitizeSettings(read(SETTINGS_KEY));
