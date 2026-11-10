/** Browser-driven chapter QA on a private local origin; no save or state injection. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {testBrowser} from './browser.mjs';
import {OBJECTS,movePlayer,withinReach} from '../src/iso/map.ts';

const origin=new URL(process.env.GAME_URL??'http://127.0.0.1:5189/');
assert(['127.0.0.1','localhost'].includes(origin.hostname));
const out='outputs/isometric/review';
await mkdir(out,{recursive:true});
const browser=await testBrowser(),errors=[],completed=[],navigation=[];
let endingReached=false,saveVerified=false;
const page=await browser.newPage({viewport:{width:768,height:432}});
let phase='chapter';
let alarm;
function guard(name,ms){
  clearTimeout(alarm);phase=name;
  alarm=setTimeout(()=>{console.error('Browser QA deadline:',phase);void browser.close();},ms);
}
guard('chapter',Number(process.env.ISO_QA_BUDGET_MS??85000));
const spec={e:'KeyD',w:'KeyA',n:'KeyW',s:'KeyS'},yaw=.69,interval=150,substeps=9;
const choices=[];
for(const [horizontal,ax] of [['w',-1],['',0],['e',1]])for(const [vertical,az] of [['n',-1],['',0],['s',1]]){
  if(!ax&&!az)continue;
  const m=Math.hypot(ax,az),speed=1.85*interval/1000;
  choices.push({keys:[spec[horizontal],spec[vertical]].filter(Boolean),
    dx:(ax*Math.cos(yaw)+az*Math.sin(yaw))/m*speed,dz:(-ax*Math.sin(yaw)+az*Math.cos(yaw))/m*speed});
}
function route(start,id,doors){
  const obj=OBJECTS[id],q=.125,seen=new Set(),heap=[{...start,path:[],rank:0,cost:0}];
  for(let iter=0;heap.length&&iter<15000;iter++){
    heap.sort((a,b)=>b.rank-a.rank);
    const next=heap.pop();
    const key=Math.round(next.x/q)+','+Math.round(next.z/q);
    if(seen.has(key))continue;seen.add(key);
    if(withinReach(id,next)&&Math.hypot(next.x-obj.x,next.z-obj.z)<1.02)return next.path;
    for(const [i,dir] of choices.entries()){
      let p=next;
      for(let frame=0;frame<substeps;frame++)p=movePlayer(p,dir.dx/substeps,dir.dz/substeps,doors);
      if(Math.hypot(p.x-next.x,p.z-next.z)<.01)continue;
      const cost=next.cost+1;
      heap.push({...p,cost,path:[...next.path,i],rank:cost+2.5*Math.hypot(p.x-obj.x,p.z-obj.z)});
    }
  }
  throw Error('No walkable route to '+id);
}
const snapshot=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const tick=ms=>page.evaluate(t=>window.advanceTime(t),ms);
async function use(id,expected){
  let s=await snapshot();
  const path=route(s.state,id,s.state.doors);
  // Combine adjacent equal inputs; the actual game still substeps each walk.
  const moves=path.reduce((a,i)=>{if(a.at(-1)?.i===i)a.at(-1).n++;else a.push({i,n:1});return a;},[]);
  for(const {i,n} of moves){
    const keys=choices[i].keys;
    for(const key of keys)await page.keyboard.down(key);
    for(let pending=n*interval;pending>0;pending-=2800)await tick(Math.min(pending,2800));
    for(const key of keys)await page.keyboard.up(key);
  }
  s=await snapshot();
  assert(withinReach(id,s.state),id+' is not reachable from '+JSON.stringify(s.state));
  if(s.target===id)await page.keyboard.press('KeyE');
  else {
    const p=await page.evaluate(id=>window.isoProjectTarget(id),id);
    assert(p,id+' has no geometry target');
    await page.mouse.click(p.x,p.y);
  }
  s=await snapshot();
  assert(expected(s),id+' did not produce its expected result: '+JSON.stringify(s));
  completed.push(id);console.log(id,s.room,s.objective);
  return s;
}
const press=testId=>page.getByTestId(testId).click({timeout:3000});
const close=()=>page.keyboard.press('Escape');
const shot=async name=>{if(process.env.ISO_QA_SHOTS==='1'){await tick(0);await page.screenshot({path:out+'/'+name+'.png',timeout:12000});}};
const readSave=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('100gate.isometric.save.v1')));
async function resume(label,saved,mode){
  const t=performance.now();
  await page.reload({waitUntil:'domcontentloaded',timeout:10000});
  const dom=Math.round(performance.now()-t);
  await page.getByTestId('iso-continue').waitFor({timeout:12000});
  const ready=Math.round(performance.now()-t);
  await tick(0);await press('iso-continue');
  const state=await snapshot();
  assert.equal(state.mode,mode);
  assert.deepEqual(state.state,saved);
  assert.deepEqual(await readSave(),saved);
  navigation.push({label,domMs:dom,readyMs:ready,restoredMs:Math.round(performance.now()-t),room:state.room,
    objective:state.objective,position:[saved.x,saved.z],items:saved.items,doors:saved.doors,breaker:saved.breaker,
    archiveClue:saved.archiveClue,anomaly:saved.anomaly,finished:saved.finished});
}
const seek=async time=>{
  const slider=page.getByTestId('iso-cctv-seek');
  await slider.fill(String(time));assert(Math.abs((await snapshot()).cctv.time-time)<.1);
};
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+': '+r.url());});
try{
  await page.addInitScript(()=>{
    localStorage.setItem('100gate.isometric.settings.v1',JSON.stringify({quality:'low',scale:.55,shadows:false,motion:false}));
    localStorage.setItem('100gate.chapter1.save.v1','{"room":2,"version":3}');
  });
  await page.goto(origin.href,{waitUntil:'domcontentloaded',timeout:10000});
  await page.getByTestId('iso-start').waitFor({timeout:13000});await tick(0);await shot('menu');
  assert.equal(await page.getByTestId('iso-continue').count(),0,'Legacy FPS save must not enable Continue');
  await press('iso-start');await tick(0);await shot('reception');
  await use('dutyLog',s=>s.state.dutyRead);await close();
  await use('underDesk',s=>s.state.items.includes('technicalKey'));
  await use('technicalDoor',s=>s.state.doors.technical);await tick(550);
  await use('powerDiagram',s=>s.state.diagramRead);await close();await shot('technical-off');
  await use('breaker',s=>s.panel==='breaker');
  await press('iso-breaker-cctv');assert.deepEqual((await snapshot()).state.breaker,[]);
  for(const line of ['lights','locks','cctv'])await press('iso-breaker-'+line);
  assert((await snapshot()).state.power);await close();await shot('technical-on');
  await use('surveillanceDoor',s=>s.state.doors.surveillance);await tick(550);
  await use('terminal',s=>s.panel==='cctv');await seek(13);await press('iso-cctv-evidence');
  assert((await snapshot()).state.archiveClue);
  await press('iso-cctv-camera-corridor');await seek(19);await press('iso-cctv-evidence');
  assert((await snapshot()).state.anomaly);await close();await shot('surveillance');
  await use('archiveCache',s=>s.state.items.includes('archiveKey'));
  await use('archiveDoor',s=>s.state.doors.archive);await tick(550);
  await use('archiveIndex',s=>s.state.archiveIndex);await close();await shot('archive');
  await use('fileZero',s=>s.state.items.includes('file'));await close();
  await close();await page.getByText('В главное меню',{exact:true}).click();
  const checkpoint=await readSave();assert(checkpoint.items.includes('file')&&!checkpoint.finished);
  guard('in-progress reload',23000);await resume('archive checkpoint',checkpoint,'play');
  guard('ending',45000);await tick(550);
  await use('terminal',s=>s.panel==='cctv');await press('iso-cctv-future');await seek(7.8);await shot('future-feed');
  await press('iso-cctv-evidence');assert.equal((await snapshot()).mode,'complete');
  endingReached=true;
  const saved=await readSave();
  assert(saved.finished);saveVerified=true;assert.deepEqual(errors,[]);
  guard('completed reload',23000);await resume('completed chapter',saved,'complete');
  assert.equal(await page.evaluate(()=>localStorage.getItem('100gate.chapter1.save.v1')),'{"room":2,"version":3}');
  assert.deepEqual(errors,[]);
  await writeFile(out+'/chapter.json',JSON.stringify({passed:true,endingReached,saveVerified,completed,navigation,errors},null,2));
}catch(error){
  await writeFile(out+'/chapter.json',JSON.stringify({passed:false,phase,endingReached,saveVerified,completed,navigation,errors,failure:String(error)},null,2));
  throw error;
}finally{clearTimeout(alarm);await browser.close();}
