import {DEFAULTS,type CameraId,type DocumentView,type ItemId,type Panel,type PowerLine,type Save,type Settings,type TapeId} from './contracts';
import {canStand,START,type ObjectId} from './map';

export const SAVE_KEY='100gate.isometric.save.v1';
export const SETTINGS_KEY='100gate.isometric.settings.v1';
export const ITEMS:Record<ItemId,{name:string;description:string;kind:'key'|'paper'|'media'}>={
  lighter:{name:'Зажигалка',description:'Тяжёлая металлическая зажигалка из ящика стола. Колёсико стёрто, но искра ещё есть.',kind:'key'},
  torch:{name:'Факел',description:'Деревянное древко с обмотанной ветошью головкой. F — поджечь зажигалкой, G — положить.',kind:'key'},
  technicalKey:{name:'Ключ от щитовой',description:'Латунный ключ с биркой «Щ». Его приклеили под столом дежурного.',kind:'key'},
  archiveKey:{name:'Ключ от архива',description:'Плоский ключ в бумажном конверте. На конверте — «Не оставлять в журнале».',kind:'key'},
  plan:{name:'План здания',description:'Коридор связывает приёмную, щитовую, операторскую и архив. Школа №7 отмечена за северным выходом.',kind:'paper'},
  memo:{name:'Записка дежурного',description:'Освещение — первым. Затем замки. Камеры подключать последними, после щелчка реле замков.',kind:'paper'},
  vhs:{name:'VHS · ночная смена',description:'Запись с камер за смену. Вручную отмеченные кадры сохраняются в журнале.',kind:'media'},
  file:{name:'Дело о районе №0',description:'Сектор Б, ячейка 4. В акте о закрытии района числится школа №7. Три подписи совпадают с фамилиями пропавших сотрудников.',kind:'paper'},
};
export const QUESTS=[
  {id:'light',title:'Найти свет',description:'Зажигалка лежит в ящике стола. Факел стоит у стены приёмной.'},
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
  return QUESTS[!s.lit&&!s.dutyRead?0:!s.dutyRead?1:!s.items.includes('technicalKey')?2:!s.power?3:!s.archiveClue?4:
    !s.items.includes('archiveKey')?5:!s.doors.archive?6:!s.items.includes('file')?7:!s.finished?8:9]!;
}

export const newSave=():Save=>({version:1,...START,items:[],doors:{technical:false,surveillance:false,archive:false,reception:false},
  dutyRead:false,diagramRead:false,power:false,breaker:[],archiveClue:false,archiveIndex:false,anomaly:false,finished:false,
  lightOn:false,lit:false});
const order:readonly PowerLine[]=['lights','locks','cctv'];
const has=(s:Save,id:ItemId)=>s.items.includes(id);
const item=(s:Save,id:ItemId):Save=>has(s,id)?s:{...s,items:[...s.items,id]};
type Outcome={state:Save;message?:string;panel?:Panel;document?:DocumentView};
const msg=(state:Save,message:string):Outcome=>({state,message});
const doc=(state:Save,title:string,text:string):Outcome=>({state,panel:'document',document:{title,text}});
const found=(state:Save,id:ItemId):Outcome=>msg(item(state,id),has(state,id)?'Уже в инвентаре.':'Найдено: '+ITEMS[id].name);

/** Can F light the torch right now: the torch and the lighter are in the pockets and the torch is not burning. */
export const canIgnite=(s:Save)=>has(s,'torch')&&has(s,'lighter')&&!s.lightOn;
/** F: the answer for the cases where nothing is lit (the animated lighting itself is applied by the world at the moment the flame catches). */
export function lightTorch(s:Save):Outcome{
  if(!has(s,'torch'))return msg(s,'У тебя нет факела.');
  if(s.lightOn)return msg(s,'Факел уже горит.');
  if(!has(s,'lighter'))return msg(s,'Нечем поджечь факел. Нужна зажигалка.');
  return msg({...s,lightOn:true,lit:true},'Факел разгорелся.');
}

export function act(s:Save,id:ObjectId):Outcome {
  switch(id){
    case 'torch':{
      if(has(s,'torch'))return msg(s,'Уже в руке.');
      if(s.props?.torch){
        // Picked back up from where it was put down: it burns as it did.
        const {torch:_,...props}=s.props;
        return msg({...item(s,'torch'),props,lightOn:!!s.torchLit&&has(s,'lighter'),torchLit:undefined},'Факел снова в руке.');
      }
      return msg(item(s,'torch'),has(s,'lighter')?'Факел. F — поджечь зажигалкой, G — положить.':'Факел потух. Нужно чем-то его поджечь.');
    }
    case 'dutyLog':return doc({...s,dutyRead:true},'Журнал дежурств · 18 ноября',
      '21:48. После просадки горит только аварийное освещение. Ключ от щитовой приклеил под столешницей, слева.\n\n22:16. Дежурный с архива не явился. Камеру в коридоре оставить включённой.');
    case 'underDesk':return s.dutyRead?found(s,'technicalKey'):msg(s,'Снизу ничего не видно. Возможно, в журнале есть подсказка.');
    case 'drawer':return has(s,'lighter')?doc(s,'Ящик стола','Пустые бланки, обрывок ленты и три канцелярские кнопки. Замок ящика давно сломан.'):
      msg(item(s,'lighter'),'В ящике нашлась зажигалка. Теперь нужен факел.');
    case 'phone':return doc(s,'Внутренняя линия','В трубке тихо. На наклейке: «07 — школа». Рядом от руки дописано: «Не перезванивать после 23:00».');
    case 'buildingPlan':return doc(item(s,'plan'),'План здания',ITEMS.plan.description);
    case 'archiveCache':return s.archiveClue?found(s,'archiveKey'):msg(s,'Секции пронумерованы. Без номера искать придётся всю ночь.');
    case 'receptionDoor':{
      // An ordinary unlocked door: it opens and closes, but never onto the player standing in the doorway.
      const doors={...s.doors,reception:!s.doors.reception};
      if(!doors.reception&&!canStand(s.x,s.z,doors))return msg(s,'Мешаешь двери закрыться.');
      return msg({...s,doors},doors.reception?'Дверь приёмной открыта.':'Дверь приёмной закрыта.');
    }
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

/** The torch leaves the hand and lies where physics put it; a burning one keeps burning on the floor. */
export function dropTorch(s:Save,pose:number[]):Outcome{
  if(!has(s,'torch'))return {state:s};
  return msg({...s,items:s.items.filter(i=>i!=='torch'),lightOn:false,torchLit:s.lightOn,props:{...s.props,torch:pose}},
    s.lightOn?'Факел положен, он продолжает гореть.':'Факел положен.');
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
    !s.doors||!['technical','surveillance','archive','reception'].every(k=>typeof s.doors[k as keyof typeof s.doors]==='boolean')||
    ![s.dutyRead,s.diagramRead,s.power,s.archiveClue,s.archiveIndex,s.anomaly,s.finished].every(v=>typeof v==='boolean')||
    !Array.isArray(s.breaker)||s.breaker.length>3||!s.breaker.every((line,i)=>line===order[i])||
    typeof s.lightOn!=='boolean'||typeof s.lit!=='boolean'||
    s.power!==(s.breaker.length===3)||!canStand(s.x,s.z,s.doors))return false;
  return !(s.lightOn&&!has(s,'torch')||s.lit&&!has(s,'lighter')||s.lightOn&&!s.lit||has(s,'technicalKey')&&!s.dutyRead||s.doors.technical&&!has(s,'technicalKey')||
    s.diagramRead&&!s.doors.technical||s.breaker.length>0&&!s.diagramRead||s.doors.surveillance&&!s.power||
    (s.archiveClue||s.anomaly||has(s,'vhs'))&&!s.doors.surveillance||has(s,'archiveKey')&&!s.archiveClue||
    s.doors.archive&&!has(s,'archiveKey')||s.archiveIndex&&!s.doors.archive||
    has(s,'file')&&(!s.doors.archive||!s.anomaly||!s.archiveIndex)||s.finished&&!has(s,'file'));
}
function read(key:string):unknown{try{return JSON.parse(localStorage.getItem(key)??'null');}catch{return null;}}
/** Saves from the flashlight days lose the flashlight and its batteries; the light starts again from the lighter and the torch. */
export function upgradeSave(value:unknown):unknown{
  if(!value||typeof value!=='object')return value;
  let v=value as Record<string,unknown>;
  if(!('lit' in v)){
    const {charge:_c,spare:_s,taken:_t,flashlightLit:_f,props,...rest}=v as Record<string,unknown>;
    const p={...(props as Record<string,unknown>|undefined)};delete p.flashlight;
    v={...rest,items:Array.isArray(rest.items)?(rest.items as string[]).filter(i=>i!=='flashlight'):[],lightOn:false,lit:false,...(Object.keys(p).length?{props:p}:{})};
  }
  // Saves from before the reception got a real door: that doorway was always open.
  const d=v.doors as Record<string,unknown>|undefined;
  if(d&&typeof d==='object'&&typeof d.reception!=='boolean')v={...v,doors:{...d,reception:true}};
  return v;
}
export function getSave(){const value=upgradeSave(read(SAVE_KEY));return validSave(value)?value:null;}
export function write(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export function sanitizeSettings(value:unknown):Settings{
  const p=value as Partial<Settings>|null;
  const view:Settings['view']='fps';
  if(!p||typeof p!=='object')return {...DEFAULTS,view};
  const n=(key:'scale'|'volume'|'ambience'|'effects'|'ui'|'textScale'|'sensitivity',min:number,max:number)=>
    typeof p[key]==='number'&&Number.isFinite(p[key])?Math.min(max,Math.max(min,p[key]!)):DEFAULTS[key];
  const flag=(key:'shadows'|'ambient'|'motion'|'reducedFlicker'|'hints')=>typeof p[key]==='boolean'?p[key]!:DEFAULTS[key];
  const codes=Object.keys(DEFAULTS.keys) as (keyof Settings['keys'])[];
  const keys={...DEFAULTS.keys};
  for(const key of codes){
    const code=p.keys?.[key];
    if(typeof code==='string'&&/^(Key[A-Z]|Arrow(Up|Down|Left|Right)|Digit[0-9]|Shift(Left|Right)|Control(Left|Right)|Space)$/.test(code)&&
       !['KeyJ','Tab','Escape'].includes(code))keys[key]=code;
  }
  return {quality:p.quality==='low'||p.quality==='high'?p.quality:'medium',scale:n('scale',.55,1.25),shadows:flag('shadows'),
    ambient:flag('ambient'),motion:flag('motion'),reducedFlicker:flag('reducedFlicker'),hints:flag('hints'),
    view /* first person only: an old saved 'iso' choice is ignored */,sensitivity:n('sensitivity',.3,2.5),volume:n('volume',0,1),ambience:n('ambience',0,1),effects:n('effects',0,1),ui:n('ui',0,1),textScale:n('textScale',.8,1.5),
    keys:new Set(Object.values(keys)).size===codes.length?keys:DEFAULTS.keys};
}
export const readSettings=()=>sanitizeSettings(read(SETTINGS_KEY));
