/** Real native-mesh motion QA. This asset contains ONLY idle + chair struggle. */
import {testBrowser} from './browser.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL??'http://127.0.0.1:5182',out='outputs/cinematic-intro/bound-performance';
async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,no)=>{timer=setTimeout(()=>no(Error('Capture timed out; browser may be occluded or the encoder stalled')),ms);})]);}finally{clearTimeout(timer);}}
await mkdir(out,{recursive:true});const browser=await testBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(base+'/__bound_performance__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;background:#252831}#label{position:absolute;left:15px;top:12px;color:white;background:#171a20c0;padding:8px;font:16px sans-serif}</style></head><body><div id="label"></div></body></html>'}));
 await page.goto(base+'/__bound_performance__');
 const setup=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const {RoomEnvironment}=await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
  const asset=await new GLTFLoader().loadAsync('/outputs/cinematic-intro/bound-chair-performance-partial.glb');
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,720);renderer.toneMapping=T.AgXToneMapping;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;document.body.appendChild(renderer.domElement);
  const scene=new T.Scene();scene.background=new T.Color(0x343842);
  const room=new RoomEnvironment(),gen=new T.PMREMGenerator(renderer),env=gen.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.65;room.dispose();gen.dispose();
  scene.add(new T.HemisphereLight(0xd5e5f5,0x544e47,.5));
  const key=new T.DirectionalLight(0xffe5ca,2);key.position.set(-2,3,3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:12});key.shadow.bias=-.0001;scene.add(key);
  const fill=new T.DirectionalLight(0xdce5f3,.6);fill.position.set(2,2,-3);scene.add(fill);scene.add(asset.scene);
  const names=[],skins=[];let rig;asset.scene.traverse(o=>{names.push(o.name);if(o.userData.cinematicPartial)rig=o;if(o.isMesh){o.castShadow=o.receiveShadow=true;}if(o.isSkinnedMesh){o.frustumCulled=false;skins.push(o);}});
  if(!rig)throw Error('Missing partial/native actor contract');
  const ropeMeshes=[];asset.scene.traverse(o=>{if(o.isMesh&&o.name.includes('intact_wrist-to-chair_rope'))ropeMeshes.push(o);});
  if(ropeMeshes.length!==2)throw Error('Both actual restraint meshes must be present, got '+ropeMeshes.length);
  if(names.some(n=>n.startsWith('SOURCE')||n.startsWith('REFERENCE')||n.startsWith('ART_FIT')))throw Error('Authoring helper leaked into export');
  if(asset.animations.length!==1)throw Error('Expected one synchronised scene clip, got '+asset.animations.length);
  const clip=asset.animations[0],mixer=new T.AnimationMixer(asset.scene),action=mixer.clipAction(clip);action.play();
  const bone=n=>asset.scene.getObjectByName(n),chair=bone('old-chair');
  if(!chair||!bone('hand_r')||!bone('hand_l'))throw Error('Native bones or chair missing');
  mixer.setTime(0);asset.scene.updateMatrixWorld(true);
  for(const [side,sign,name] of [['r',-1,'Wrist right side'],['l',1,'Wrist left side']]){const target=bone('hand_'+side).getWorldPosition(new T.Vector3());target.y-=.035;const cam=new T.PerspectiveCamera(42,1280/720,.01,20);cam.name='Cine_'+name.replaceAll(' ','_');cam.position.copy(target).add(new T.Vector3(sign*.34,.06,-.06));cam.lookAt(target);asset.cameras.push(cam);scene.add(cam);}
  const v=new T.Vector3();let recordingCanvas,recordingContext,capture;
  function render(time,view){mixer.setTime(Math.min(clip.duration-1e-6,Math.max(0,time)));asset.scene.updateMatrixWorld(true);for(const o of skins)o.skeleton.update();
   const cam=asset.cameras.find(c=>c.name.startsWith('Cine')&&c.name.endsWith(view.replaceAll(' ','_')));if(!cam)throw Error('No camera '+view);cam.aspect=1280/720;cam.updateProjectionMatrix();renderer.render(scene,cam);
   document.querySelector('#label').textContent=`NATIVE SKELETAL QA · ONLY idle + struggle · ${view} · ${time.toFixed(2)} s — НЕ полное вступление`;
   if(recordingContext){recordingContext.drawImage(renderer.domElement,0,0);recordingContext.fillStyle='#171a20dc';recordingContext.fillRect(10,10,1020,40);recordingContext.fillStyle='white';recordingContext.font='17px sans-serif';recordingContext.fillText(`ONLY BoundChairIdle + ChairStruggle | ${view} | ${time.toFixed(2)}s | NOT complete intro`,22,36);if(capture)capture.track.requestFrame();}
  }
  function sample(time){render(time,'Side');const inverse=chair.matrixWorld.clone().invert();
   const wrists={};for(const side of ['r','l'])wrists[side]=bone('hand_'+side).getWorldPosition(v).applyMatrix4(inverse).toArray();
   const head=bone('head').getWorldPosition(v).applyMatrix4(inverse).toArray();
   const wristDeviationDegrees={};
   for(const side of ['r','l']){const wrist=bone('hand_'+side).getWorldPosition(new T.Vector3()),forearm=wrist.clone().sub(bone('lowerarm_'+side).getWorldPosition(new T.Vector3())).normalize();const forward=new T.Vector3();for(const digit of ['index','middle','ring','pinky'])forward.add(bone(digit+'_01_'+side).getWorldPosition(new T.Vector3()));forward.multiplyScalar(.25).sub(wrist).normalize();wristDeviationDegrees[side]=T.MathUtils.radToDeg(Math.acos(T.MathUtils.clamp(forward.dot(forearm),-1,1)));}
   let min=Infinity;const p=chair.geometry.getAttribute('position');for(let i=0;i<p.count;i++)min=Math.min(min,v.fromBufferAttribute(p,i).applyMatrix4(chair.matrixWorld).y);
   return {time,wrists,head,wristDeviationDegrees,chairMinY:min,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
  }
  window.__boundQA={render,sample,dump(time){render(time,'Side');const meshes=[];asset.scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,p=g.getAttribute('position'),ix=g.getIndex(),positions=[],triangles=[];for(let i=0;i<p.count;i++){o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);positions.push([v.x,-v.z,v.y]);}for(let i=0;i<(ix?.count??p.count);i+=3)triangles.push([0,1,2].map(j=>ix?ix.getX(i+j):i+j));meshes.push({name:o.name,positions,triangles});});return {meshes};},startRecord(){
   const mime='video/webm;codecs=vp8';if(!MediaRecorder.isTypeSupported(mime))throw Error('VP8 unavailable');
   recordingCanvas=document.createElement('canvas');recordingCanvas.width=1280;recordingCanvas.height=720;recordingContext=recordingCanvas.getContext('2d');
   for(const view of ['Front','Side','Back','First person'])render(0,view);
   render(0,'Front');
   // Explicit frames avoid requestAnimationFrame suspension when Blender or
   // Codex covers the headed Chromium window. Time remains real wall time.
   const stream=recordingCanvas.captureStream(0),track=stream.getVideoTracks()[0],chunks=[];
   if(typeof track.requestFrame!=='function')throw Error('Manual canvas capture unavailable');
   const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6500000});
   const done=new Promise((ok,no)=>{recorder.onstop=ok;recorder.onerror=e=>no(Error(e.error?.message??'Encoder failed'));});
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   capture={stream,track,recorder,chunks,done,mime,start:performance.now()};recorder.start(1000);track.requestFrame();
  },async stopRecord(){
   const state=capture,wallSeconds=(performance.now()-capture.start)/1000;state.track.requestFrame();state.recorder.stop();await state.done;
   for(const track of state.stream.getTracks())track.stop();capture=undefined;
   const bytes=new Uint8Array(await new Blob(state.chunks,{type:state.mime}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   return {base64:btoa(binary),wallSeconds,postCaptureProcessingMs:performance.now()-state.start-wallSeconds*1000};
  }};
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  render(0,'Side');return {clip:clip.name,duration:clip.duration,tracks:clip.tracks.length,skinMeshes:skins.length,ropeMeshes:ropeMeshes.length,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),phases:rig.userData.authoredPhases,missing:rig.userData.missingPhases};
 });
 assert(Math.abs(setup.duration-12)<.1);assert(setup.tracks>30);assert.equal(setup.skinMeshes,5);
 console.log('Native fragment import:',setup);
 if(process.argv.includes('--record')&&/swiftshader/i.test(setup.gpu))throw Error('Software rasterizer is unsuitable for motion review. Use TEST_HARDWARE_GL=1 and TEST_HEADED=1.');
 const samples=[];for(let i=0;i<=48;i++)samples.push(await page.evaluate(t=>window.__boundQA.sample(t),i/4));
 const first=samples[0];let wristDrift=0,headMotion=0,minFloor=Infinity;
 for(const s of samples){for(const side of ['r','l'])wristDrift=Math.max(wristDrift,Math.hypot(...s.wrists[side].map((v,i)=>v-first.wrists[side][i])));headMotion=Math.max(headMotion,Math.hypot(...s.head.map((v,i)=>v-first.head[i])));minFloor=Math.min(minFloor,s.chairMinY);}
 assert(wristDrift<.002,'Bound wrist slipped relative to chair: '+wristDrift);assert(headMotion>.005,'Only a rigid pendulum, no body performance');assert(minFloor>-.0002,'Chair crosses floor');
 const maxWristDeviationDegrees=Math.max(...samples.flatMap(s=>Object.values(s.wristDeviationDegrees)));
 assert(maxWristDeviationDegrees<25,'Extreme native wrist deviation: '+maxWristDeviationDegrees);
 for(const [view,time] of [['Front',0],['Side',6],['Back',8],['Bound wrists',8],['Shoulder back',8],['First person',8],['Wrist right side',8],['Wrist left side',8]]){
  await page.evaluate(({view,time})=>window.__boundQA.render(time,view),{view,time});await page.screenshot({path:out+'/'+view.toLowerCase().replaceAll(' ','-')+'.png'});
 }
 if(process.argv.includes('--geometry'))for(const time of [0,2,4,6,8,12])await writeFile(out+'/runtime-frame-'+(1+time*24)+'.json',JSON.stringify(await page.evaluate(t=>window.__boundQA.dump(t),time)));
 if(process.argv.includes('--record')){
  console.log('Starting manually requested, actual 1x capture');
  const video=await bounded((async()=>{
   await page.evaluate(()=>window.__boundQA.startRecord());
   const start=performance.now(),ticks=[],views=['Front','Side','Back','First person'];
   while(true){const elapsed=(performance.now()-start)/1000;if(elapsed>=48)break;ticks.push(elapsed);const index=Math.min(3,Math.floor(elapsed/12));
    await page.evaluate(({time,view})=>window.__boundQA.render(time,view),{time:elapsed-index*12,view:views[index]});
    await new Promise(ok=>setTimeout(ok,Math.max(0,1000/24-((performance.now()-start)/1000-elapsed)*1000)));
   }
   await page.evaluate(()=>window.__boundQA.render(12,'First person'));await new Promise(ok=>setTimeout(ok,150));
   const captured=await page.evaluate(()=>window.__boundQA.stopRecord());
   return {...captured,segments:views.map((view,i)=>({view,start:i*12,end:(i+1)*12})),renderedFrames:ticks.length,maxRenderGapSeconds:Math.max(...ticks.slice(1).map((t,i)=>t-ticks[i]))};
  })(),90000);
  await writeFile(out+'/bound-idle-struggle-ONLY.webm',Buffer.from(video.base64,'base64'));await writeFile(out+'/recording-clock.json',JSON.stringify({wallSeconds:video.wallSeconds,postCaptureProcessingMs:video.postCaptureProcessingMs,segments:video.segments,renderedFrames:video.renderedFrames,maxRenderGapSeconds:video.maxRenderGapSeconds,partial:true},null,2));
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/report.json',JSON.stringify({partial:true,setup,wristDriftMm:wristDrift*1000,headMotionMm:headMotion*1000,maxWristDeviationDegrees,chairMinFloorMm:minFloor*1000,samples,errors},null,2));
 console.log('PASS native idle/struggle fragment ONLY; NOT full intro or gameplay integration.',JSON.stringify({wristDriftMm:wristDrift*1000,headMotionMm:headMotion*1000}));
}finally{await browser.close();}
