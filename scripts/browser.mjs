import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
export function testBrowser(){
  let executablePath=process.env.CHROMIUM_PATH;
  if(!executablePath&&!existsSync(chromium.executablePath())&&process.env.LOCALAPPDATA){
    const root=join(process.env.LOCALAPPDATA,'ms-playwright');
    if(existsSync(root)){const dirs=readdirSync(root).filter(n=>/^chromium-\d+$/.test(n)).sort().reverse();for(const d of dirs){const p=join(root,d,'chrome-win64','chrome.exe');if(existsSync(p)){executablePath=p;break;}}}
  }
  return chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
}
