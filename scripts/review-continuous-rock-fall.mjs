/** Real Three.js before/after, first-person and 0.25x reviews. No new game. */
import {testBrowser} from './browser.mjs';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL??'http://127.0.0.1:5182',out=process.env.REVIEW_OUT??'outputs/cinematic-intro/continuous-performance';
const assets={before:process.env.BEFORE_ASSET??'/art/intro-fall-native-wip.glb',after:process.env.AFTER_ASSET??'/outputs/cinematic-intro/intro-continuous-fall.glb'};
const postfall=process.argv.includes('--postfall');
assets.label=postfall?'left rail break + WRAPPED partial release; knife/cuts PENDING':'rocking -> fall';
await mkdir(out,{recursive:true});await rm(out+'/review.json',{force:true});
const browser=await testBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:780}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(base+'/__continuous_review__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;background:#343842}button{position:fixed;right:10px;top:10px;z-index:2}</style></head><body><button id="audio">Enable recorded Foley</button></body></html>'}));
 await page.goto(base+'/__continuous_review__');
 const setup=await page.evaluate(async(assets)=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const {RoomEnvironment}=await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
  const {cues}=await import('/src/episode/foley-cues.ts');
  const loader=new GLTFLoader(),before=await loader.loadAsync(assets.before),after=await loader.loadAsync(assets.after);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,720);renderer.toneMapping=T.AgXToneMapping;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=1440;document.body.append(canvas);const ctx=canvas.getContext('2d');
  const scene=new T.Scene();scene.background=new T.Color(0x343842);
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.65;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xd5e5f5,0x544e47,.5));
  const key=new T.DirectionalLight(0xffe5ca,2);key.position.set(-2,3,3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:12});key.shadow.bias=-.0001;scene.add(key);
  const fill=new T.DirectionalLight(0xdce5f3,.6);fill.position.set(2,2,-3);scene.add(fill);
  const states=[before,after].map(asset=>{
   scene.add(asset.scene);const skins=[];asset.scene.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;if(o.isSkinnedMesh){skins.push(o);o.frustumCulled=false;}});
   const mixer=new T.AnimationMixer(asset.scene);assertAsset(asset);mixer.clipAction(asset.animations[0]).play();
   mixer.setTime(0);asset.scene.updateMatrixWorld(true);
   const chair=asset.scene.getObjectByName('old-chair');return {asset,mixer,skins,chair,reference:chair.matrixWorld.clone().invert()};
  });
  function assertAsset(a){if(a.animations.length!==1)throw Error('Expected one scene animation');}
  const side=before.cameras.find(c=>c.name.endsWith('Fall_overview'));
  if(!side)throw Error('Missing identical comparison camera');side.aspect=1280/720;side.updateProjectionMatrix();
  const fp=after.cameras.find(c=>c.name.endsWith('First_person')),reduced=new T.PerspectiveCamera();
  const audio=new AudioContext(),destination=audio.createMediaStreamDestination(),master=audio.createGain();master.gain.value=.65;master.connect(audio.destination);master.connect(destination);
  const bank=await audio.decodeAudioData(await(await fetch('/assets/chapter1/foley-bank.wav')).arrayBuffer());
  const [impactOffset,impactLength]=cues.chairFall[0],wave=bank.getChannelData(0),windowSize=Math.round(bank.sampleRate*.01);let peak=0,peakAt=0;
  for(let i=0;i<impactLength*bank.sampleRate;i+=windowSize){let energy=0;for(let j=0;j<windowSize;j++){const v=wave[Math.floor(impactOffset*bank.sampleRate)+i+j]??0;energy+=v*v;}if(energy>peak){peak=energy;peakAt=i/bank.sampleRate;}}
  document.querySelector('#audio').onclick=()=>audio.resume();
  let capture,motion=1;const events=[];
  function sound(kind,time){const [offset,length]=cues[kind][0],source=audio.createBufferSource(),gain=audio.createGain();source.buffer=bank;gain.gain.value=kind==='chairFall'?.56:.25;source.connect(gain).connect(master);source.start(audio.currentTime,offset,length);events.push({kind,sourceTime:time,audioTime:audio.currentTime});}
  function evaluate(t){for(const s of states){s.mixer.setTime(Math.min(16.5-1e-6,t));s.asset.scene.updateMatrixWorld(true);for(const skin of s.skins)skin.skeleton.update();}}
  function draw(index,camera,y,label){states.forEach((s,i)=>s.asset.scene.visible=i===index);renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,y);ctx.fillStyle='#171a20ef';ctx.fillRect(10,y+10,1260,42);ctx.fillStyle='white';ctx.font='19px sans-serif';ctx.fillText(label,22,y+38);}
  function render(t,mode,rate=1){evaluate(t);
   if(mode==='compare'){if(canvas.height!==1440)canvas.height=1440;draw(0,side,0,`BEFORE | ${t.toFixed(2)} s | same camera | sound = AFTER`);draw(1,side,720,`AFTER | ${t.toFixed(2)} s | ${rate}x | ${assets.label}; NOT full escape`);}
   else{if(canvas.height!==720)canvas.height=720;let camera=side;
    if(mode==='fp'){fp.getWorldPosition(reduced.position);fp.getWorldQuaternion(reduced.quaternion);reduced.fov=fp.fov;reduced.aspect=1280/720;reduced.near=fp.near;reduced.far=fp.far;reduced.updateProjectionMatrix();if(motion<1){const e=new T.Euler().setFromQuaternion(reduced.quaternion,'YXZ');e.z*=motion;reduced.quaternion.setFromEuler(e);}camera=reduced;}
    draw(1,camera,0,`AFTER | ${mode==='fp'?'FIRST PERSON':'SIDE'} | ${t.toFixed(2)} s | ${rate}x | ${rate<1?'silent slow review':'recorded Foley'} | camera ${motion}`);
   }
   if(capture)capture.track.requestFrame();
  }
  function sample(t){evaluate(t);const s=states[1],d=s.chair.matrixWorld.clone().multiply(s.reference),p=new T.Vector3();fp.getWorldPosition(p);return {time:t,roll:T.MathUtils.radToDeg(Math.atan2(-d.elements[1],d.elements[0])),eye:p.toArray()};}
  function start(mode,start=4,rate=1){render(start,mode,rate);const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];if(rate===1)for(const a of destination.stream.getAudioTracks())stream.addTrack(a.clone());const chunks=[],recorder=new MediaRecorder(stream,{mimeType:rate===1?'video/webm;codecs=vp8,opus':'video/webm;codecs=vp8',videoBitsPerSecond:9000000});const done=new Promise((ok,no)=>{recorder.onstop=ok;recorder.onerror=e=>no(Error(e.error?.message??'Encoder failed'));});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};capture={stream,track,chunks,recorder,done,start:performance.now()};recorder.start(1000);track.requestFrame();}
  async function stop(){const c=capture,wallSeconds=(performance.now()-c.start)/1000;c.recorder.stop();await c.done;c.stream.getTracks().forEach(t=>t.stop());capture=undefined;const a=new Uint8Array(await new Blob(c.chunks,{type:'video/webm'}).arrayBuffer());let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return {base64:btoa(s),wallSeconds};}
  const sideOriginal={p:side.position.clone(),q:side.quaternion.clone(),fov:side.fov};
  window.__review={setView(kind){const poses={front:[[0,1,1.8],[0,.80,0]],side:[[1.5,.85,0],[0,.78,0]],waist:[[.75,.85,1.3],[0,.65,0]],rear:[[1.25,.75,-1.3],[.85,.22,-.22]]};if(kind==='original'){side.position.copy(sideOriginal.p);side.quaternion.copy(sideOriginal.q);side.fov=sideOriginal.fov;}else{const [p,t]=poses[kind];side.position.set(...p);side.lookAt(...t);side.fov=34;}side.updateProjectionMatrix();},render,sample,start,stop,sound,events,setMotion(v){motion=v;},camera(){return {eye:reduced.position.toArray(),q:reduced.quaternion.toArray()};},dump(t){evaluate(t);const meshes=[],v=new T.Vector3();after.scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,p=g.getAttribute('position'),ix=g.getIndex(),positions=[],triangles=[];for(let i=0;i<p.count;i++){o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);positions.push([v.x,-v.z,v.y]);}for(let i=0;i<(ix?.count??p.count);i+=3)triangles.push([0,1,2].map(j=>ix?ix.getX(i+j):i+j));meshes.push({name:o.name,positions,triangles});});return {meshes};}};
  render(11.8,'compare');const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {gpu:gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),beforeDuration:before.animations[0].duration,afterDuration:after.animations[0].duration,audioSampleRate:bank.sampleRate,impactCueStart:12.5-peakAt,impactPeakOffset:peakAt,comparisonWidth:1280,comparisonHeight:1440};
 },assets);
 assert(!/swiftshader/i.test(setup.gpu),'Use TEST_HARDWARE_GL=1 TEST_HEADED=1 TEST_CAPTURE=1');
 await page.click('#audio');await page.waitForTimeout(100);
 const samples=[];for(let t=10.95;t<=12.39;t+=1/96)samples.push(await page.evaluate(t=>window.__review.sample(t),t));
 const speeds=samples.slice(1).map((s,i)=>(s.roll-samples[i].roll)/(s.time-samples[i].time));assert(Math.min(...speeds)>3,'Last swing stops or reverses before impact');
 for(const t of [8.74,10.91,11.5,11.8,12.25,12.5,13.4,16.5]){await page.evaluate(t=>window.__review.render(t,'compare'),t);await page.screenshot({path:out+'/compare-'+t+'.png',fullPage:true});}
 await page.evaluate(()=>{window.__review.setMotion(1);window.__review.render(12.25,'fp');});const full=await page.evaluate(()=>window.__review.camera());
 await page.evaluate(()=>{window.__review.setMotion(.35);window.__review.render(12.25,'fp');});const reduced=await page.evaluate(()=>window.__review.camera());
 assert.deepEqual(full.eye,reduced.eye);assert(Math.hypot(...full.q.map((v,i)=>v-reduced.q[i]))>.01);await page.screenshot({path:out+'/reduced-motion.png',fullPage:true});await page.evaluate(()=>window.__review.setMotion(1));
 if(process.argv.includes('--geometry'))for(const t of [10.5,11.5,11.75,12.25,12.5,13.5,16.5])await writeFile(out+'/runtime-frame-'+(1+t*48)+'.json',JSON.stringify(await page.evaluate(t=>window.__review.dump(t),t)));
 const files=[];
 if(postfall){for(const kind of ['front','side','waist','rear'])for(const t of kind==='rear'?[12.3,12.6,13.4,15.4,16.5]:[0]){await page.evaluate(({kind,t})=>{window.__review.setView(kind);window.__review.render(t,'compare');},{kind,t});await page.screenshot({path:out+'/detail-'+kind+'-'+t+'.png',fullPage:true});}await page.evaluate(()=>window.__review.setView('original'));}
 if(!process.argv.includes('--screens-only'))for(const spec of [{name:'before-after-1x',mode:'compare',start:4,end:16.5,rate:1},{name:'first-person-1x',mode:'fp',start:4,end:16.5,rate:1},{name:'slow-quarter-side',mode:'side',start:9.5,end:15.5,rate:.25},{name:'slow-quarter-first-person',mode:'fp',start:9.5,end:15.5,rate:.25}]){
  if(postfall&&spec.name==='slow-quarter-side')await page.evaluate(()=>window.__review.setView('rear'));
  else await page.evaluate(()=>window.__review.setView('original'));
  await page.evaluate(s=>{window.__review.render(s.start,s.mode,s.rate);window.__review.start(s.mode,s.start,s.rate);},spec);
  const start=performance.now(),ticks=[],fired=new Set(),duration=(spec.end-spec.start)/spec.rate;
  while(true){const wall=(performance.now()-start)/1000;if(wall>=duration)break;const source=spec.start+wall*spec.rate;ticks.push(wall);
   await page.evaluate(({source,spec})=>window.__review.render(source,spec.mode,spec.rate),{source,spec});
   if(spec.rate===1)for(const [kind,t] of [['chair',4.65],['chair',5.35],['chair',6.75],['chair',8.11],['chair',9.48],['chair',10.91],['chairFall',setup.impactCueStart]]){if(source>=t&&!fired.has(t)){fired.add(t);await page.evaluate(({kind,t})=>window.__review.sound(kind,t),{kind,t});}}
   await new Promise(ok=>setTimeout(ok,Math.max(0,1000/24-((performance.now()-start)/1000-wall)*1000)));
  }
  await page.evaluate(s=>window.__review.render(s.end,s.mode,s.rate),spec);await new Promise(ok=>setTimeout(ok,100));const result=await page.evaluate(()=>window.__review.stop());
  const bytes=Buffer.from(result.base64,'base64');await writeFile(out+'/'+spec.name+'.webm',bytes);files.push({...spec,wallSeconds:result.wallSeconds,renderedFrames:ticks.length,maxFrameGapSeconds:Math.max(...ticks.slice(1).map((t,i)=>t-ticks[i])),sha256:createHash('sha256').update(bytes).digest('hex')});console.log('Recorded',spec.name,result.wallSeconds,'seconds');
 }
 assert.deepEqual(errors,[]);const trajectory=JSON.parse(await readFile('outputs/cinematic-intro/continuous-rock-fall-trajectory.json','utf8'));
 await writeFile(out+'/review.json',JSON.stringify({partial:true,scope:postfall?'Tailored sweater and left rail partial release ONLY; knife/cuts NOT authored':'Rocking-to-fall rework ONLY, not full escape/integration',assets,setup,lastSwingMinSpeedDegS:Math.min(...speeds),samples,files,events:await page.evaluate(()=>window.__review.events),reducedMotion:{full,reduced},trajectoryContinuity:trajectory.continuity,errors},null,2));
}finally{await browser.close();}
