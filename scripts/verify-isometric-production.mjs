/** Real-input smoke test against the built package or the live 100gate root.
 * GAME_URL=http://127.0.0.1:5190/ node scripts/verify-isometric-production.mjs
 * Live: GAME_URL=https://100gate.online/ ISO_EXPECT_SOURCE=<commit> ISO_EXPECT_ENTRY=<entry>
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {testBrowser} from './browser.mjs';

const base=new URL(process.env.GAME_URL??'http://127.0.0.1:5190/');
const live=base.hostname==='100gate.online';
assert(['100gate.online','127.0.0.1','localhost','[::1]'].includes(base.hostname),'Unsupported production smoke host');
assert(['https:','http:'].includes(base.protocol)&&!base.username&&!base.password&&base.pathname==='/'&&!base.search&&!base.hash,
  'Use the site root, without credentials or query');
if(live)assert(base.protocol==='https:'&&!base.port,'The live site must be the production HTTPS origin');

const revision=/^[0-9a-f]{40}$/;
const entryPattern=/^assets\/index-[a-z0-9_-]{8,}\.js$/i;
const expectedSource=process.env.ISO_EXPECT_SOURCE;
const expectedEntry=process.env.ISO_EXPECT_ENTRY;
if(expectedSource)assert(revision.test(expectedSource),'Expected a full 40-character source commit');
if(expectedEntry)assert(entryPattern.test(expectedEntry),'Expected a built Vite entry');
const markerRequired=live||process.env.ISO_REQUIRE_RELEASE==='1';
const out='outputs/isometric/review/'+(live?'production-live':'production-local');
const SAVE='100gate.isometric.save.v1',SETTINGS='100gate.isometric.settings.v1',LEGACY='100gate.chapter1.save.v1';
const old=JSON.stringify({version:1,flags:[],items:[],read:[],doors:[],moved:[],position:[0,3.6,2.8],
  yaw:0,pitch:-.23,room:0,updatedAt:'2026-11-01T00:00:00.000Z'});
const actorPath='/assets/iso/alexei-3.glb';
const budget=Number(process.env.ISO_PROD_TIMEOUT_MS??12000);
assert(Number.isFinite(budget)&&budget>=1000&&budget<=60000,'Invalid browser stage timeout');
const report={url:base.href,passed:false,stages:[],requests:[],errors:[]};
let browser,page,phase='release';
await mkdir(out,{recursive:true});

const pathOf=url=>new URL(url).pathname;
const own=url=>new URL(url).origin===base.origin;
const at=(stage,start)=>report.stages.push({stage,ms:Math.round(performance.now()-start)});
const mark=async(name,fn)=>{
  phase=name;const start=performance.now();const data=await fn();at(name,start);return data;
};
const item=id=>page.getByTestId(id);
const ready=id=>item(id).waitFor({state:'visible',timeout:budget});
const press=id=>item(id).click({timeout:budget});
const getRaw=key=>page.evaluate(key=>localStorage.getItem(key),key);
const read=async key=>JSON.parse(await getRaw(key));
const shot=name=>process.env.ISO_PROD_SHOTS==='1'
  ?page.screenshot({path:out+'/'+name+'.png',timeout:budget}):Promise.resolve();
const rootCheck=async response=>{
  assert(response?.ok()&&response.url()===base.href,'Main document failed or redirected');
  const html=await response.text();
  const entries=[...html.matchAll(/<script\b[^>]*\bsrc="\.\/(assets\/index-[a-z0-9_-]{8,}\.js)"[^>]*>/gi)];
  assert.equal(entries.length,1,'Expected exactly one relative hashed build entry');
  const entry=entries[0][1];
  if(report.entry)assert.equal(entry,report.entry,'Entry changed during reload');
  report.entry=entry;
  if(expectedEntry)assert.equal(entry,expectedEntry);
  if(report.release)assert.equal(entry,report.release.entry,'HTML entry and release marker differ');
};
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
const hold=async key=>{
  await page.keyboard.down(key);
  try{await frames();await page.waitForTimeout(420);}
  finally{await page.keyboard.up(key);}
};
const pauseAndExit=async()=>{
  await page.keyboard.press('Escape');
  await ready('iso-pause');
  await item('iso-pause').getByRole('button',{name:'В главное меню',exact:true}).click({timeout:budget});
  await ready('iso-continue');
};

try{
  if(markerRequired)await mark('release',async()=>{
    const marker=await fetch(new URL('release.json',base),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(budget)});
    assert(marker.ok,'Production release marker failed: '+marker.status);
    report.release=await marker.json();
    assert.equal(report.release.kind,'isometric-production');
    assert(revision.test(report.release.source)&&revision.test(report.release.previousPagesCommit),'Malformed source or rollback SHA');
    assert(/^[0-9a-f]{64}$/.test(report.release.buildSha256)&&entryPattern.test(report.release.entry),'Malformed release build signature');
    if(expectedSource)assert.equal(report.release.source,expectedSource,'Unexpected live source commit');
    if(expectedEntry)assert.equal(report.release.entry,expectedEntry);
  });

  browser=await testBrowser();
  page=await browser.newPage({viewport:{width:768,height:432}});
  page.setDefaultTimeout(budget);
  page.on('pageerror',error=>report.errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  page.on('response',response=>{
    if(!own(response.url()))return;
    const path=pathOf(response.url());
    if(response.status()>=400)report.errors.push(response.status()+': '+path);
    if(path===actorPath||/^\/assets\/index-.*\.js$/.test(path)){
      report.requests.push({path,status:response.status(),type:response.headers()['content-type']??''});
    }
  });
  page.on('requestfailed',request=>{
    const failure=request.failure()?.errorText;
    if(own(request.url())&&!failure?.includes('ERR_ABORTED'))report.errors.push('Failed '+pathOf(request.url())+': '+failure);
  });
  await page.addInitScript(({key,value})=>{
    if(localStorage.getItem(key)===null)localStorage.setItem(key,value);
  },{key:LEGACY,value:old});

  await mark('first title',async()=>{
    const dom=performance.now();
    await rootCheck(await page.goto(base.href,{waitUntil:'domcontentloaded',timeout:budget}));
    at('first document',dom);
    await ready('iso-start');
    assert.equal(await item('iso-continue').count(),0,'Legacy FPS save must not enable Continue');
    assert.equal(await getRaw(SAVE),null,'Title must not create a new-game save');
    assert.equal(await getRaw(LEGACY),old);
    assert(report.requests.some(r=>r.path==='/'+report.entry&&r.status===200&&/javascript/.test(r.type)),
      'Built JS entry did not load');
    assert(report.requests.some(r=>r.path===actorPath&&r.status===200&&!/text\/html/i.test(r.type)),
      'GLB did not load from the production path');
    assert.deepEqual(await page.evaluate(()=>[typeof window.render_game_to_text,typeof window.advanceTime,
      typeof window.isoProjectTarget,typeof window.__storyHomeTest]),Array(4).fill('undefined'),'Production includes debug hooks');
    await shot('title');
  });

  await mark('menu settings',async()=>{
    await press('iso-title-settings');
    await ready('iso-settings');
    await item('iso-settings').getByLabel('Качество',{exact:true}).selectOption('low');
    await item('iso-settings').getByLabel('Меньше мерцания',{exact:true}).check();
    await item('iso-settings').getByLabel('Тени',{exact:true}).uncheck();
    report.settings=await read(SETTINGS);
    assert.equal(report.settings.quality,'low');
    assert.equal(report.settings.reducedFlicker,true);
    assert.equal(report.settings.shadows,false);
    await page.keyboard.press('Escape');
    await ready('iso-start');
  });

  const checkpoint=await mark('new game, walk and pause',async()=>{
    await press('iso-start');
    await ready('iso-hud');
    const initial=await read(SAVE);
    assert(initial?.version===1&&Number.isFinite(initial.x)&&Number.isFinite(initial.z)&&!initial.finished);
    await hold('KeyW');
    await page.keyboard.press('Escape');
    await ready('iso-pause');
    await page.keyboard.press('Escape');
    await ready('iso-hud');
    await shot('play');
    await pauseAndExit();
    const saved=await read(SAVE);
    assert(Math.hypot(saved.x-initial.x,saved.z-initial.z)>.025,'W input did not move the actor');
    assert.equal(await getRaw(LEGACY),old);
    report.walk={start:[initial.x,initial.z],end:[saved.x,saved.z]};
    return saved;
  });

  await mark('reload and restore exact checkpoint',async()=>{
    const dom=performance.now();
    await rootCheck(await page.reload({waitUntil:'domcontentloaded',timeout:budget}));
    at('reloaded document',dom);
    await ready('iso-continue');
    assert.deepEqual(await read(SAVE),checkpoint);
    await press('iso-title-settings');
    await ready('iso-settings');
    assert.equal(await item('iso-settings').getByLabel('Качество',{exact:true}).inputValue(),'low');
    assert(await item('iso-settings').getByLabel('Меньше мерцания',{exact:true}).isChecked());
    assert(!(await item('iso-settings').getByLabel('Тени',{exact:true}).isChecked()));
    await page.keyboard.press('Escape');
    await press('iso-continue');
    await ready('iso-hud');
    assert.deepEqual(await read(SAVE),checkpoint,'Continue did not start from the saved state');
    await page.keyboard.press('Escape');
    await ready('iso-pause');
    await hold('KeyD');
    await item('iso-pause').getByRole('button',{name:'В главное меню',exact:true}).click({timeout:budget});
    await ready('iso-continue');
    assert.deepEqual(await read(SAVE),checkpoint,'Pause accepted movement or Continue did not restore the exact save');
    assert.equal(await getRaw(LEGACY),old,'The legacy save was modified');
  });
  assert.deepEqual(report.errors,[],'Browser console or same-origin asset failures');
  report.passed=true;
  console.log(JSON.stringify(report,null,2));
}catch(error){
  report.failure={phase,message:String(error)};
  throw error;
}finally{
  await browser?.close();
  await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
}
