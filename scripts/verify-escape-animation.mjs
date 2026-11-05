import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const out=resolve('../../outputs/intro-animation');await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:false});
const report={errors:[],frames:{}};
try{
 const p=await b.newPage({viewport:{width:1280,height:720}});
 p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
 await p.route('**/api/save',r=>r.fulfill({status:200,json:{ok:true}}));
 await p.addInitScript(()=>localStorage.setItem('100gate.settings.v1',JSON.stringify({quality:'medium'})));
 const start=async()=>{await p.goto('http://127.0.0.1:3000/');await p.getByTestId('start').click({timeout:90000});await step(20);};
 const step=ms=>p.evaluate(ms=>window.advanceTime(ms),ms);
 const state=()=>p.evaluate(()=>({s:window.__episodeTest.state(),i:window.__episodeTest.introView()}));
 const shot=async n=>{const data=await state();report.frames[n]=data;await p.screenshot({path:resolve(out,n+'.png')});return data;};
 const held=()=>p.keyboard.down('KeyR'),up=()=>p.keyboard.up('KeyR');
 await start();const initial=await shot('01-bound');assert(initial.i.escape.hands.every(a=>a[2]>0),'wrists start behind the body');
 assert(initial.i.escape.bridge&&initial.i.escape.tethered);
 const side=await p.evaluate(()=>window.__episodeTest.renderBoundDetail());
 await writeFile(resolve(out,'01b-bound-side-detail.png'),Buffer.from(side.split(',')[1],'base64'));
 await p.keyboard.press('KeyE');assert(!(await state()).s.save.items.includes('knife'));
 await held();await step(1930);await shot('02-rock');await step(800);await up();
 const slip=await shot('03-slip');assert(slip.i.escape.hands[1][2]<slip.i.escape.hands[0][2]-.15);
 await step(500);await p.keyboard.press('KeyE');await step(435);
 const touch=await shot('04-palm-contact');assert(!touch.i.escape.attached&&!touch.s.save.items.includes('knife'));
 await step(115);const grip=await shot('05-closed-grip');assert(grip.i.escape.attached&&grip.i.escape.closure>.99);assert(grip.s.save.items.includes('knife'));
 assert(Math.hypot(...grip.i.escape.knife.map((v,i)=>v-touch.i.escape.knife[i]))<.012,'knife must not snap on the handoff');
 await step(470);await shot('05b-knife-raised');
 await held();await step(400);await up();await step(480);assert.equal((await state()).i.contacts.length,0);
 await held();await step(565);const approach=await shot('06a-knife-approach');assert(approach.i.escape.bridge&&approach.i.escape.tethered&&approach.i.sawTravel===0);
 await step(275);const contact=await shot('06-edge-contact');assert(contact.i.sawContactTime>0&&contact.i.escape.edgeDistance<.009);
 await step(420);const saw=await shot('06b-saw-travel');assert(saw.i.sawTravel>contact.i.sawTravel+.04&&saw.i.escape.bridge);
 await step(1480);const intact=await shot('06c-tension-before-break');assert(intact.i.escape.tethered&&!intact.i.escape.ropeDropped);
 await step(145);await up();const sever=await shot('07-sever');assert(sever.i.sawTravel>=.26&&sever.i.sawContactTime>=1.3);assert(!sever.i.escape.bridge&&sever.i.escape.ropeDropped);
 assert(!sever.s.save.flags.includes('free'),'movement stays gated during the stand-up');
 await step(290);await shot('08-loose-rope');await step(330);await shot('09-rise');await step(470);
 assert((await state()).s.save.flags.includes('free'));
 const before=(await state()).s.position;await p.keyboard.down('KeyW');await step(420);await p.keyboard.up('KeyW');
 const walk=await shot('10-walk');assert(walk.s.position[2]<before[2]-.5);
 await start();assert((await state()).s.save.flags.includes('free'),'finished intro persists and does not replay');
 assert.deepEqual(report.errors,[]);
 console.log('PASS intact restraints, grip, continuous bevel contact and saw travel, delayed break, rise, input and reload');
}catch(e){report.failure=String(e);throw e;}
finally{await b.close();await writeFile(resolve(out,'frames.json'),JSON.stringify(report,null,2));}
