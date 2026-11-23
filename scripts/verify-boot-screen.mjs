// Checks the loading screen against a built game: cold cache on a slow network, a warm reload, smoothness of the bar,
// memory after the screen is gone, a failed file with retry, and the game inside an iframe.
// Usage: npx vite build && npx vite preview --port 4179, then  node scripts/verify-boot-screen.mjs [http://127.0.0.1:4179/]
import {chromium} from 'playwright';
const BASE=process.argv[2]??'http://127.0.0.1:4179/';
const OUT=process.env.SHOTS??'.';
const log=(...a)=>console.log(...a);

// Recorded from the first script on the page: every frame, the bar's drawn value, the percent text and the stage.
const recorder=()=>{
  const w=window;w.__boot={frames:[],removedAt:0,start:performance.now()};
  const tick=()=>{
    const b=document.getElementById('boot');
    if(!b){if(!w.__boot.removedAt)w.__boot.removedAt=performance.now()-w.__boot.start;return;}
    const f=b.querySelector('.boot-fill'),m=f&&getComputedStyle(f).transform.match(/matrix\(([^,]+)/);
    w.__boot.frames.push({t:performance.now()-w.__boot.start,bar:m?+m[1]:0,pct:b.querySelector('.boot-pct')?.textContent??'',stage:b.querySelector('.boot-stage')?.textContent??'',state:b.dataset.state??''});
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const summary=async page=>page.evaluate(()=>{
  const fr=window.__boot.frames,stages=[];let maxJump=0,back=0,lastPct=-1,example;
  for(let i=0;i<fr.length;i++){
    if(!stages.length||stages[stages.length-1]!==fr[i].stage)stages.push(fr[i].stage);
    if(i)maxJump=Math.max(maxJump,fr[i].bar-fr[i-1].bar);
    if(i&&fr[i].bar<fr[i-1].bar-1e-4){back++;example??=[fr[i-1],fr[i]];}
    const p=parseInt(fr[i].pct);if(!isNaN(p)){if(p<lastPct){back++;example??=[fr[i-1],fr[i]];}lastPct=p;}
  }
  return {example,frames:fr.length,removedAt:Math.round(window.__boot.removedAt),stages,maxJump:+maxJump.toFixed(3),backwards:back,lastPct:fr.at(-1)?.pct};
});
const waitGone=page=>page.waitForFunction(()=>!document.getElementById('boot'),null,{timeout:240000});

const browser=await chromium.launch();
let ok=true;const check=(name,pass,info='')=>{log(`${pass?'OK  ':'FAIL'} ${name} ${info}`);if(!pass)ok=false;};
try{
  // 1. empty cache, slow network (about a weak 4G: 4 Mbit/s, 150 ms)
  const ctx=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await ctx.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(recorder);
  const cdp=await ctx.newCDPSession(page);
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:4e6/8,uploadThroughput:1e6/8});
  const t0=Date.now();
  await page.goto(BASE,{waitUntil:'commit'});
  await page.waitForTimeout(2500);await page.screenshot({path:`${OUT}/boot-slow-early.png`});
  await waitGone(page);
  const slow=await summary(page);
  log('slow/cold:',JSON.stringify(slow),'wall',Date.now()-t0,'ms');
  check('slow: screen removed only after the menu exists',await page.locator('text=Новая игра').count()>0);
  check('slow: bar and percent never go backwards',slow.backwards===0);
  check('slow: no jump over 12% in one frame',slow.maxJump<=.12,`max ${slow.maxJump}`);
  check('slow: stages in real order',slow.stages.join('>').includes('Загрузка персонажа>Загрузка моделей'),slow.stages.join(' > '));
  check('slow: no JS errors',errors.length===0,errors.join(' | '));
  await page.screenshot({path:`${OUT}/boot-slow-menu.png`});

  // 2. warm reload (cache on, normal network)
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  const t1=Date.now();await page.reload({waitUntil:'commit'});await waitGone(page);
  const warm=await summary(page);log('warm:',JSON.stringify(warm),'wall',Date.now()-t1,'ms');
  check('warm: loads and hides',warm.removedAt>0);

  // 3. memory: heap after load, after GC; the screen and its listeners are gone
  await cdp.send('HeapProfiler.collectGarbage');
  const heap=await cdp.send('Runtime.getHeapUsage');
  const leftovers=await page.evaluate(()=>({boot:!!document.getElementById('boot'),bootNodes:document.querySelectorAll('[class^=boot]').length}));
  log('heap after GC MB',(heap.usedSize/1048576).toFixed(1));
  check('memory: no loading screen nodes left',!leftovers.boot&&leftovers.bootNodes===0);
  await ctx.close();

  // 4. a required file fails, then retry
  const ctx2=await browser.newContext({viewport:{width:1280,height:720}});const p2=await ctx2.newPage();const err2=[];
  p2.on('pageerror',e=>err2.push(e.message));
  await p2.route('**/alexei-10.glb',r=>r.abort('failed'));
  await p2.goto(BASE);
  await p2.locator('.boot-retry').waitFor({state:'visible',timeout:60000});
  const pctAtError=await p2.locator('.boot-pct').textContent();
  check('error: retry shown, no false 100%',pctAtError!=='100%',`at ${pctAtError}`);
  await p2.screenshot({path:`${OUT}/boot-error.png`});
  await p2.unroute('**/alexei-10.glb');
  const cdp2=await ctx2.newCDPSession(p2);
  await p2.click('.boot-retry');await waitGone(p2);
  await cdp2.send('HeapProfiler.collectGarbage');const heapA=await cdp2.send('Runtime.getHeapUsage');
  check('error: retry loads the game without a page reload',await p2.locator('text=Новая игра').count()>0);
  check('error: no uncaught JS errors',err2.length===0,err2.join(' | '));
  log('heap after a failed start + retry, after GC MB',(heapA.usedSize/1048576).toFixed(1));
  await ctx2.close();

  // 5. offline mid-start
  const ctx3=await browser.newContext();const p3=await ctx3.newPage();
  await p3.route('**/*.glb',r=>r.abort('internetdisconnected'));
  await p3.goto(BASE);await p3.locator('.boot-retry').waitFor({state:'visible',timeout:60000});
  check('network error: message shown',(await p3.locator('.boot-msg').textContent()).length>0,await p3.locator('.boot-msg').textContent());
  await ctx3.close();

  // 6. inside an iframe on another origin, at a nested path (as on game portals), phone landscape
  const ctx4=await browser.newContext({viewport:{width:812,height:375},isMobile:true,hasTouch:true});const p4=await ctx4.newPage();const err4=[];
  p4.on('pageerror',e=>err4.push(e.message));
  // the game is served from game.test/app/123/ (a nested folder on another origin), proxied to the local build
  await p4.route('http://game.test/app/123/**',async r=>{
    const path=new URL(r.request().url()).pathname.replace('/app/123/','');
    const res=await r.fetch({url:BASE+path});r.fulfill({response:res});
  });
  await p4.route('http://portal.test/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><body style="margin:0;background:#222"><iframe src="http://game.test/app/123/index.html?from=portal" style="border:0;width:100vw;height:100vh" allow="autoplay"></iframe></body>`}));
  await p4.goto('http://portal.test/game/');
  const frame=p4.frameLocator('iframe');
  await frame.locator('text=Новая игра').waitFor({timeout:120000});
  const inFrame=await p4.frames()[1].evaluate(()=>({boot:!!document.getElementById('boot'),scroll:document.documentElement.scrollWidth<=innerWidth}));
  check('iframe: game reaches the menu at a nested path',!inFrame.boot);
  check('iframe: no horizontal scroll',inFrame.scroll);
  check('iframe: no JS errors',err4.length===0,err4.join(' | '));
  await p4.screenshot({path:`${OUT}/boot-iframe-menu.png`});
  await ctx4.close();
}finally{await browser.close();}
log(ok?'ALL OK':'SOME CHECKS FAILED');process.exit(ok?0:1);
