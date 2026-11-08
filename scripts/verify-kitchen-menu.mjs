import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {extname,resolve,sep} from 'node:path';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {testBrowser} from './browser.mjs';

const live=process.env.STORY_PRODUCTION_URL;
if(live)assert.equal(live,'https://100gate.online/');
const out='outputs/menu-kitchen/'+(live?'live':'browser');
await mkdir(out,{recursive:true});
const root=resolve('.pages-publish/story-production-build');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.glb':'model/gltf-binary','.wav':'audio/wav','.mp3':'audio/mpeg','.svg':'image/svg+xml'};
const server=live?undefined:createServer(async(req,res)=>{
  try{
    const path=resolve(root,new URL(req.url,'http://local').pathname.slice(1)||'index.html');
    if(!path.startsWith(root+sep))throw Error('Outside build');
    const bytes=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream','Content-Length':bytes.length});res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=live??`http://127.0.0.1:${server.address().port}/`;
const b=await testBrowser();
const report={url,errors:[],missing:[],scenarios:[],passed:false};
const prefs='100gate.settings.v1',slot='100gate.chapter1.save.v1';

async function newPage(name,options={}){
  const ctx=await b.newContext(options),page=await ctx.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)report.missing.push(r.url());});
  await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(/\/api\/save\/?$/.test(u.pathname))return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Headers':'authorization, content-type'}});
    if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    if(live&&u.origin===new URL(url).origin&&u.pathname==='/'&&req.isNavigationRequest()){
      const response=await route.fetch();
      const body=(await response.text()).replace(/<script\b[^>]*\bsrc=["']https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js[^"']*["'][^>]*><\/script>/gi,'');
      return route.fulfill({response,body});
    }
    return route.continue();
  });
  const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));
  const shot=part=>page.screenshot({path:`${out}/${name}-${part}.png`,timeout:60000});
  return {ctx,page,shot,requests};
}
try{
  const viewport={width:1280,height:720};
  const {ctx,page,shot,requests}=await newPage('desktop',{viewport,recordVideo:{dir:out,size:{width:960,height:540}}});
  try{
    await page.addInitScript(()=>{
      const Audio=window.AudioContext;
      window.__menuAudio=[];
      window.AudioContext=class extends Audio{constructor(...args){super(...args);window.__menuAudio.push(this);}};
    });
    await page.goto(url);
    const menu=page.getByTestId('kitchen-menu');
    const dim=page.getByTestId('kitchen-dim');
    await menu.waitFor();
    assert.equal(await menu.getAttribute('data-background'),'ready');
    await dim.waitFor({state:'attached'});
    assert(!requests.some(s=>s.endsWith('.glb')),'Menu fetched the game before a start action');
    assert(await page.getByTestId('continue-story-home').isDisabled());
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),slot),null);
    assert.equal(await page.evaluate(()=>window.__menuAudio.length),0);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.km-content')).opacity==='1');
    await shot('title');
    await page.getByTestId('kitchen-sound').click();
    await page.waitForFunction(()=>window.__menuAudio[0]?.state==='running');
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid=kitchen-dim]')?.style.opacity)>0,undefined,{timeout:32000});
    await shot('lamp-dip');
    await page.getByTestId('kitchen-settings').click();
    await page.getByTestId('setting-quality').selectOption('medium');
    await page.getByTestId('setting-fpsCap').selectOption('30');
    await page.getByTestId('settings-tab-audio').click();
    await page.getByTestId('setting-mute').check();
    await page.getByTestId('settings-tab-controls').click();
    await page.getByTestId('setting-invertY').check();
    await page.getByTestId('settings-tab-access').click();
    await page.getByTestId('setting-reducedFlicker').check();
    await shot('settings');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(),0);
    const changed=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),prefs);
    assert(changed.invertY&&changed.reducedFlicker&&changed.mute&&changed.fpsCap===30&&changed.quality==='medium');
    await page.reload();await menu.waitFor();await dim.waitFor({state:'attached'});
    await page.getByTestId('kitchen-settings').click();await page.getByTestId('settings-tab-access').click();
    assert(await page.getByTestId('setting-reducedFlicker').isChecked());
    await page.getByTestId('settings-reset').click();
    assert(!(await page.getByTestId('setting-reducedFlicker').isChecked()));
    await page.getByTestId('settings-tab-graphics').click();
    await page.getByTestId('setting-quality').selectOption('low');
    await page.getByTestId('settings-done').click();
    await page.getByTestId('kitchen-credits').click();assert(await page.getByRole('dialog').getByRole('link').count()>=2);
    await page.keyboard.press('Escape');
    await page.getByTestId('start-story-home').click();
    await page.getByTestId('story-subtitle').or(page.getByRole('alert')).first().waitFor({timeout:90000});
    assert(await page.getByTestId('story-subtitle').isVisible(),await page.getByRole('alert').allTextContents());
    await page.waitForFunction(()=>window.__menuAudio.some(c=>c.state==='closed')&&window.__menuAudio.filter(c=>c.state==='running').length===1);
    await page.getByTestId('story-home-pause').click();
    await page.getByRole('button',{name:'В главное меню'}).click();
    await menu.waitFor();await page.waitForFunction(()=>window.__menuAudio.every(c=>c.state==='closed'));
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),slot),null);
    report.scenarios.push('desktop, lamp dip, gesture audio, setting persistence/reset, credits, new game, return and cleanup');
  }finally{
    const video=page.video();await ctx.close();if(video)await copyFile(await video.path(),out+'/100gate-menu.webm');
  }
  const mobile=await newPage('landscape',{viewport:{width:844,height:390},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  try{
    await mobile.page.goto(url);const menu=mobile.page.getByTestId('kitchen-menu');await menu.waitFor();
    assert.equal(await menu.getAttribute('data-background'),'ready');
    const controls=await mobile.page.getByTestId('kitchen-credits').boundingBox();
    assert(controls&&controls.y+controls.height<390,'Menu does not fit the landscape viewport');
    await mobile.shot('title');
    await mobile.page.getByTestId('kitchen-settings').tap();await mobile.page.getByTestId('settings-tab-controls').tap();
    assert(await mobile.page.getByTestId('setting-invertY').isVisible());await mobile.shot('settings');
    report.scenarios.push('mobile landscape, reduced motion and touch settings');
  }finally{await mobile.ctx.close();}
  if(!live){
    const retry=await newPage('retry',{viewport:{width:800,height:450}});
    try{
      let attempts=0;
      await retry.page.route('**/assets/menu/kitchen.webp?*',async route=>{
        if(++attempts===1)return route.abort();
        return route.continue();
      });
      await retry.page.goto(url);
      const menu=retry.page.getByTestId('kitchen-menu');
      await menu.waitFor();assert.equal(await menu.getAttribute('data-background'),'error');
      const expected=report.errors.filter(e=>e.includes('ERR_FAILED'));
      assert.equal(expected.length,1);
      report.errors.splice(report.errors.indexOf(expected[0]),1);
      await retry.page.getByRole('button',{name:'Повторить'}).click();
      await retry.page.waitForFunction(()=>document.querySelector('[data-testid=kitchen-menu]')?.getAttribute('data-background')==='ready');
      assert.equal(attempts,2);
      report.scenarios.push('failed first image, usable fallback and real retry');
    }finally{await retry.ctx.close();}
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);
  report.passed=true;console.log('PASS kitchen menu on '+url);
}catch(error){report.failure=String(error);throw error;}
finally{
  await b.close();if(server)await new Promise(resolve=>server.close(resolve));
  await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
}
