/** Run the packaged player path with real input, without test globals. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve,sep,extname } from 'node:path';
import { testBrowser } from './browser.mjs';

const dest=process.env.STORY_PREVIEW_URL;
if(dest)assert.equal(dest,'https://100gate.online/story-preview/');
const prefix='/story-preview/';
const root=resolve('.pages-publish/story-preview-build');
const out=dest?'outputs/story-intro/published-smoke':'outputs/story-intro/packaged-smoke';
await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server=dest?undefined:createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(!url.pathname.startsWith(prefix))throw Error('outside scoped preview');
    const path=resolve(root,url.pathname.slice(prefix.length)||'index.html');
    if(!path.startsWith(root+sep))throw Error('outside build');
    const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=dest??`http://127.0.0.1:${server.address().port}${prefix}`;
let browser;
const report={url,errors:[],unexpected:[],missing:[],storyAssets:[],passed:false};
try{
  browser=await testBrowser();
  const page=await browser.newPage({viewport:{width:960,height:540}});
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  page.on('response',r=>{
    if(r.status()>=400)report.missing.push(r.url());
    const path=new URL(r.url()).pathname;
    if(path.startsWith(prefix+'assets/story-intro/')&&r.ok())report.storyAssets.push(path);
  });
  await page.route('**/*',route=>{
    const req=new URL(route.request().url()),base=new URL(url);
    if(req.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:''});
    if(req.origin===base.origin&&req.pathname.startsWith(prefix)&&!req.pathname.includes('/api/'))return route.continue();
    report.unexpected.push(req.origin+req.pathname);return route.abort();
  });
  await page.addInitScript(()=>{
    localStorage.setItem('100gate.chapter1.save.v1','publication-smoke-do-not-touch');
    localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'}));
  });
  await page.goto(url,{timeout:60000});
  try{await page.getByTestId('start-story-home').click({timeout:90000});}
  catch(e){await page.screenshot({path:out+'/load-failure.png'});report.body=(await page.locator('body').innerText()).slice(0,1500);throw e;}
  await page.getByTestId('story-skip').click();
  const hold=page.getByTestId('story-hold');
  await hold.getByText('Удерживайте R, чтобы дотянуться').waitFor({timeout:120000});
  await page.screenshot({path:out+'/knife.png'});
  await page.keyboard.down('KeyR');await hold.waitFor({state:'hidden',timeout:35000});await page.keyboard.up('KeyR');
  await hold.getByText('Удерживайте R, чтобы разрезать верёвку').waitFor({timeout:35000});
  await page.keyboard.down('KeyR');await hold.waitFor({state:'hidden',timeout:55000});await page.keyboard.up('KeyR');
  await page.locator('.ep-reticle').waitFor({timeout:65000});
  const saved=await page.evaluate(()=>({
    save:localStorage.getItem('100gate.chapter1.save.v1'),
    debug:typeof window.__storyHomeTest!=='undefined'||typeof window.advanceTime!=='undefined',
  }));
  assert.deepEqual(saved,{save:'publication-smoke-do-not-touch',debug:false});
  assert.equal(new Set(report.storyAssets).size,8);
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);assert.deepEqual(report.missing,[]);
  await page.screenshot({path:out+'/free.png'});
  report.passed=true;console.log('PASS: '+url+' · packaged models + real R escape + normal play; save isolated');
}catch(e){report.failure=String(e);throw e;}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await writeFile(out+'/report.json',JSON.stringify(report,null,2));}
