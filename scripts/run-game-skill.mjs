import {registerHooks,createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const skill=process.env.WEB_GAME_SKILL??resolve(process.env.USERPROFILE,'.agents/skills/develop-web-game/scripts/web_game_playwright_client.js');
const require=createRequire(import.meta.url);
const playwrightURL=pathToFileURL(require.resolve('playwright').replace(/index\.js$/,'index.mjs')).href;
registerHooks({resolve(specifier,context,next){
 if(specifier==='playwright')return {url:playwrightURL,shortCircuit:true};
 return next(specifier,context);
}});
const launch=chromium.launch.bind(chromium);
chromium.launch=async options=>{
 const browser=await launch(options),newPage=browser.newPage.bind(browser);
 browser.newPage=async options=>{
  const page=await newPage({...options,viewport:{width:1280,height:720}});
  await page.addInitScript(()=>{
   if(location.hostname==='127.0.0.1')localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'low'}));
  });
  const click=page.click.bind(page);
  page.click=(selector,options)=>click(selector,{...options,timeout:90000});
  return page;
 };
 return browser;
};
const out=resolve('../../outputs/refinement-2026-11-05/skill-client');await mkdir(out,{recursive:true});
process.argv=[process.execPath,skill,'--url','http://127.0.0.1:3000/','--click-selector','[data-testid="start"]','--actions-json',JSON.stringify({steps:[{buttons:[],frames:12}]}),'--iterations','1','--pause-ms','250','--screenshot-dir',out,...process.argv.slice(2)];
await import(pathToFileURL(skill).href);
