/** Exercise the production root with real player input. Never sends save API requests. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { testBrowser } from './browser.mjs';

const publicUrl=process.env.STORY_PRODUCTION_URL;
if(publicUrl)assert.equal(publicUrl,'https://100gate.online/','Only the production root is supported');
const expectedSource=process.env.STORY_PRODUCTION_SOURCE;
if(expectedSource)assert.match(expectedSource,/^[0-9a-f]{7,40}$/);
const root=resolve('.pages-publish/story-production-build');
const out=publicUrl?'outputs/story-intro/production-live-smoke':'outputs/story-intro/production-build-smoke';
const saveKey='100gate.chapter1.save.v1';
const savedStory={version:1,flags:['free','introCompleteV2'],items:['knife','flashlight','bag'],
  read:['atticNote'],doors:[],moved:[],position:[0,3.6,2.8],yaw:0,pitch:-.23,room:0,
  updatedAt:'2024-01-01T00:00:00.000Z'};
const finalPaths=['home/story-home.glb','gait/story-hero-walk-mocap.glb','vehicle/story-sedan.glb',
  'egress/egress-L.glb','egress/egress-R.glb','sleeves/story-upright-escape.glb',
  'dialogue/story-hero-home-face.glb','dialogue/story-partner-home-face.glb','stop/story-hero-stops.json'];
const expectedAssets=[...finalPaths.map(p=>'/assets/story-final/'+p),
  ...['audio/night-city-223093.mp3','street/story-street.glb','grocery/story-grocery-bag.glb','hero/story-hero-walk.glb'].map(p=>'/assets/story-intro/'+p)];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.glb':'model/gltf-binary','.mp3':'audio/mpeg','.wav':'audio/wav','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.webm':'video/webm','.woff2':'font/woff2'};

const server=publicUrl?undefined:createServer(async (req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    const path=resolve(root,decodeURIComponent(url.pathname).slice(1)||'index.html');
    if(!path.startsWith(root+sep))throw new Error('outside production build');
    const bytes=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream','Content-Length':bytes.length});
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404);res.end();}
});
if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=publicUrl??`http://127.0.0.1:${server.address().port}/`;
const report={url,scenarios:{},passed:false};
await mkdir(out,{recursive:true});

async function runScenario(browser,name,seed,run){
  const ctx=await browser.newContext({viewport:{width:800,height:450},serviceWorkers:'block'});
  const page=await ctx.newPage();
  const info=report.scenarios[name]={errors:[],missing:[],unexpected:[],assets:[],saveApiBlocked:[],cdnTelemetry:[]};
  const origin=new URL(url).origin;
  page.on('pageerror',e=>info.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')info.errors.push(m.text());});
  page.on('response',r=>{
    const path=new URL(r.url()).pathname;
    if(r.status()>=400)info.missing.push(r.url());
    if(r.ok()&&path.startsWith('/assets/'))info.assets.push(path);
  });
  await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    // Do not forward a single cloud-save operation during a synthetic run.
    // Never record test/user tokens, headers or payloads in the QA artifact.
    if(/\/api\/save\/?$/.test(u.pathname)){
      info.saveApiBlocked.push(req.method());
      const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, content-type',
        'Access-Control-Allow-Methods':'GET,PUT,OPTIONS','Vary':'Origin'};
      return route.fulfill({status:req.method()==='GET'?200:204,headers,
        ...(req.method()==='GET'?{json:null}:{})});
    }
    if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    if(publicUrl&&u.origin===origin&&u.pathname==='/'&&req.isNavigationRequest()){
      const response=await route.fetch({maxRedirects:0});
      const html=(await response.text()).replace(/<script\b[^>]*\bsrc=["'](https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js[^"']*)["'][^>]*><\/script>/gi,
        (_tag,src)=>{info.cdnTelemetry.push(src);return '';});
      return route.fulfill({response,body:html});
    }
    if(u.origin===origin&&!u.pathname.startsWith('/api/'))return route.continue();
    info.unexpected.push(u.origin+u.pathname);
    return route.abort();
  });
  await page.addInitScript(({key,seed})=>{
    if(!sessionStorage.getItem('100gate.qa.seeded')){
      if(seed)localStorage.setItem(key,JSON.stringify(seed));
      localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low',language:'ru'}));
      sessionStorage.setItem('100gate.qa.seeded','1');
    }
    // Observe the actual running game audio context without recording media.
    const Native=window.AudioContext;
    window.__qaAudioStates=[];
    if(Native)window.AudioContext=class extends Native{
      constructor(...args){super(...args);window.__qaAudioStates.push(this);}
    };
  },{key:saveKey,seed});
  const save=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)??'null'),saveKey);
  const hasGameDebug=()=>page.evaluate(()=>['__storyHomeTest','__episodeTest','advanceTime','render_game_to_text'].some(k=>k in window));
  const show=shot=>page.screenshot({path:`${out}/${name}-${shot}.png`,timeout:120000});
  const playing=page.locator('.episode[data-mode="playing"] .ep-reticle');
  try{
    await page.goto(url,{timeout:60000});
    assert.equal(page.url(),url,'Browser must stay on /, no preview subtree, redirects, or debug flags');
    const fresh=page.getByTestId('start-story-home');
    await fresh.waitFor({timeout:120000});
    const continueGame=page.getByTestId('continue-story-home');
    assert.deepEqual(await save(),seed,'Menu load must not change existing save or create a new one');
    assert.equal(await hasGameDebug(),false);
    await show('title');
    assert(!info.assets.some(path=>path.startsWith('/assets/story-final/')||path.startsWith('/assets/story-intro/')),
      'A player must be able to use the root menu before the cinematic assets load');
    await run({page,info,save,show,fresh,continueGame,playing});
    assert.equal(await hasGameDebug(),false,'No debug controls after game runtime starts');
    assert.deepEqual(info.errors,[]);
    assert.deepEqual(info.missing,[]);
    assert.deepEqual(info.unexpected,[]);
    info.passed=true;
  }catch(e){
    info.failure=String(e);
    if(!page.isClosed()){
      info.body=(await page.locator('body').innerText({timeout:4000}).catch(()=>'' )).slice(0,1500);
      await show('failure').catch(()=>{});
    }
    throw e;
  }finally{await ctx.close();}
}

let browser;
try{
  browser=await testBrowser();
  await runScenario(browser,'fresh',null,async ({page,info,save,show,fresh,continueGame,playing})=>{
    if(await continueGame.count())assert(await continueGame.isDisabled(),'Continue must not start a nonexistent save');
    await fresh.click();
    const skip=page.getByTestId('story-skip');
    await skip.waitFor({timeout:120000});
    await page.getByTestId('story-subtitle').waitFor({timeout:45000});
    await page.waitForFunction(()=>window.__qaAudioStates.some(c=>c.state==='running'),undefined,{timeout:15000});
    info.audioRunning=true;
    await show('dialogue');
    await skip.click();
    const hold=page.getByTestId('story-hold');
    const reach=hold.getByText('Удерживайте R, чтобы дотянуться');
    const cut=hold.getByText('Удерживайте R, чтобы разрезать верёвку');
    await reach.waitFor({timeout:120000});
    await show('reach');
    await page.keyboard.down('KeyR');await reach.waitFor({state:'hidden',timeout:50000});await page.keyboard.up('KeyR');
    await cut.waitFor({timeout:50000});
    await page.keyboard.down('KeyR');await cut.waitFor({state:'hidden',timeout:75000});await page.keyboard.up('KeyR');
    await playing.waitFor({timeout:90000});
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)??'null')?.flags?.includes('free'),saveKey,{timeout:30000});
    const before=await save();
    assert.equal(before.version,1);
    await page.keyboard.down('KeyW');await page.waitForTimeout(1100);await page.keyboard.up('KeyW');
    await page.keyboard.press('Escape');
    await page.locator('.episode[data-mode="paused"]').waitFor({timeout:15000});
    const after=await save();
    assert(after.flags.includes('free'));
    info.walkMeters=Math.hypot(after.position[0]-before.position[0],after.position[2]-before.position[2]);
    assert(info.walkMeters>.04,
      'Real movement must update the ordinary persisted gameplay position');
    await page.keyboard.press('Escape');
    await playing.waitFor({timeout:15000});
    await show('free');
    for(const path of expectedAssets)assert(info.assets.includes(path),`Final release asset was not loaded: ${path}`);
    assert(info.assets.every(p=>!p.includes('/story-preview/')&&!p.includes('/outputs/')));
  });
  await runScenario(browser,'continue',savedStory,async ({page,info,save,show,fresh,continueGame,playing})=>{
    await fresh.click();
    await page.getByRole('heading',{name:'Начать сначала?'}).waitFor();
    assert.deepEqual(await save(),savedStory,'Showing confirmation must not change the existing save');
    await page.getByRole('button',{name:'Отмена',exact:true}).click();
    assert.deepEqual(await save(),savedStory,'Cancel must preserve all fields');
    await continueGame.click({timeout:20000});
    await playing.waitFor({timeout:120000});
    assert.equal(await page.getByTestId('story-hold').count(),0);
    assert.equal(await page.getByTestId('story-subtitle').count(),0);
    await page.keyboard.press('Escape');
    await page.locator('.episode[data-mode="paused"]').waitFor({timeout:15000});
    const after=await save();
    for(const key of ['flags','items','read'])assert.deepEqual(after[key],savedStory[key],`Continue must preserve ${key}`);
    info.preservedFields=['flags','items','read'];
    await show('restored');
  });
  if(publicUrl){
    const response=await fetch(new URL('/release.json',url),{cache:'no-store',signal:AbortSignal.timeout(20000)});
    assert(response.ok,'Published root marker was not readable');
    const release=await response.json();
    assert.equal(release.kind,'story-production');
    assert.match(release.source,/^[0-9a-f]{40}$/);
    if(expectedSource)assert(release.source.startsWith(expectedSource),'Published source differs from the expected revision');
    if(typeof release.entry==='string')assert(report.scenarios.fresh.assets.includes(new URL(release.entry,url).pathname),
      'The browser must execute the entry bundle named in the live marker');
    report.release={source:release.source,entry:release.entry,kind:release.kind};
  }
  report.passed=true;
  console.log(`PASS ${url} · final production assets, live audio, real escape/walk/pause, saved progress preserved`);
}catch(e){report.failure=String(e);throw e;}
finally{
  await browser?.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
}
