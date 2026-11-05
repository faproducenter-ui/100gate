/** One normal-speed WebM: complete hand clip, all hand views and full actor. */
import {testBrowser} from './browser.mjs';
import {mkdir,open,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const out='outputs/hand-character-review',base=process.env.GAME_URL??'http://127.0.0.1:5182';
await mkdir(out,{recursive:true});
const segments=[
 {mode:'actor',view:'Front',seconds:12,label:'Весь персонаж · Спереди · Полный клип 1×'},
 ...[['Palm','Ладонь'],['Dorsal','Тыльная сторона'],['Left','Слева'],['Right','Справа'],['Top','Сверху'],['Butt','Со стороны основания рукояти']].map(([view,label])=>({mode:'hand',view,seconds:12,label:`Кисть · ${label} · Полный клип 1×`})),
 {mode:'handOrbit',seconds:18,label:'Кисть · Непрерывный оборот камеры 360° · Полный хват'},
 {mode:'actorOrbit',seconds:24,label:'Весь персонаж · Непрерывный оборот камеры 360°'},
 ...[['Back','Сзади'],['Left','Слева'],['Right','Справа'],['Top','Сверху']].map(([view,label])=>({mode:'actor',view,seconds:12,label:`Весь персонаж · ${label} · Полный клип 1×`})),
];
let end=0;for(const segment of segments){segment.start=end;end+=segment.seconds;segment.end=end;}
const browser=await testBrowser();let file;
try{
 const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(base+'/__full_character_review__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><title>100gate — полный обзор персонажа и кисти</title><link rel="icon" href="data:,"><style>body{margin:0;background:#343842}</style></head><body></body></html>'}));
 await page.goto(base+'/__full_character_review__');
 const info=await page.evaluate(async segments=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const {RoomEnvironment}=await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
  const asset=await new GLTFLoader().loadAsync('/art/hand-knife-contact.glb');
  if(asset.animations.length!==1)throw Error('Expected the existing single skeletal study clip');
  const clip=asset.animations[0],scene=new T.Scene();scene.background=new T.Color(0x343842);scene.add(asset.scene);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,960);renderer.toneMapping=T.AgXToneMapping;document.body.appendChild(renderer.domElement);
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.65;pmrem.dispose();room.dispose();
  scene.add(new T.HemisphereLight(0xd5e5f5,0x544e47,.5));
  const key=new T.DirectionalLight(0xffe5ca,2);key.position.set(2.1,3,3);scene.add(key);
  // Neutral inspection fill reveals the back, without hiding any actor mesh.
  const fill=new T.DirectionalLight(0xdce5f3,.75);fill.position.set(-2,2,-3);scene.add(fill);
  const mixer=new T.AnimationMixer(asset.scene),action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
  let knife;const actor=[];
  asset.scene.traverse(o=>{if(o.name.startsWith('Cinematic_field_knife'))knife=o;if(o.isSkinnedMesh)actor.push(o);});
  if(!knife||actor.length!==5)throw Error('Full original actor/wardrobe or knife missing');
  function time(t){action.enabled=true;action.paused=false;mixer.setTime(t);scene.updateMatrixWorld(true);for(const mesh of actor)mesh.skeleton.update();}
  const actorBox=new T.Box3();
  for(const t of [0,6,12]){time(t);for(const mesh of actor)actorBox.union(new T.Box3().setFromObject(mesh,true));actorBox.union(new T.Box3().setFromObject(knife,true));}
  const sphere=actorBox.getBoundingSphere(new T.Sphere()),center=actorBox.getCenter(new T.Vector3());
  const camera=new T.PerspectiveCamera(42,4/3,.004,100);
  const actorDistance=sphere.radius/Math.sin(T.MathUtils.degToRad(camera.fov/2))*1.22;
  const overlay=new T.Scene(),ortho=new T.OrthographicCamera(-640,640,480,-480,.1,10);ortho.position.z=1;
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=88;
  const texture=new T.CanvasTexture(canvas),sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,depthWrite:false}));sprite.scale.set(1280,88,1);sprite.position.set(0,436,0);overlay.add(sprite);
  let text='';
  function caption(label){if(text===label)return;text=label;const c=canvas.getContext('2d');c.clearRect(0,0,1280,88);c.fillStyle='rgba(20,23,29,.83)';c.fillRect(0,0,1280,88);c.fillStyle='#fff';c.font='25px sans-serif';c.fillText(label,24,36);c.fillStyle='#cbd3de';c.font='18px sans-serif';c.fillText('100gate · Полный текущий клип захвата ножа · Исходный MPFB-персонаж · Диагностический обзор',24,66);texture.needsUpdate=true;}
  const handDirs={Palm:[.1,1,.12],Dorsal:[.1,-1,.12],Left:[-1,.08,.12],Right:[1,.08,.12],Top:[.12,.05,1],Butt:[.12,.05,-1]};
  const actorDirs={Front:[0,.12,1],Back:[0,.12,-1],Left:[-1,.12,0],Right:[1,.12,0],Top:[0,1,.18]};
  function frame(segment,local){
   const orbit=segment.mode.endsWith('Orbit');time(orbit?12:Math.min(clip.duration,local));caption(segment.label);
   let focus,direction,distance;
   if(segment.mode.startsWith('hand')){
    const angle=local/segment.seconds*Math.PI*2,d=orbit?[Math.sin(angle),Math.cos(angle),.20]:handDirs[segment.view];
    focus=new T.Vector3(-.012,.028,0).applyMatrix4(knife.matrixWorld);direction=new T.Vector3(d[0],d[2],-d[1]).normalize().transformDirection(knife.matrixWorld);distance=.405;
   }else{
    const angle=local/segment.seconds*Math.PI*2;focus=center;
    direction=new T.Vector3(...(orbit?[Math.sin(angle),.12,Math.cos(angle)]:actorDirs[segment.view])).normalize();distance=actorDistance;
   }
   camera.position.copy(focus).addScaledVector(direction,distance);camera.up.set(0,1,0);camera.lookAt(focus);
   renderer.render(scene,camera);renderer.autoClear=false;renderer.clearDepth();renderer.render(overlay,ortho);renderer.autoClear=true;
  }
  window.__fullReview={frame:(i,t)=>frame(segments[i],t),async record(){
   const mime='video/webm;codecs=vp8';if(!MediaRecorder.isTypeSupported(mime))throw Error('VP8 recording unavailable');
   const stream=renderer.domElement.captureStream(30),rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});let pending=Promise.resolve(),chunks=0;
   rec.ondataavailable=e=>{if(!e.data.size)return;pending=pending.then(async()=>{const bytes=new Uint8Array(await e.data.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));await window.__writeVideoChunk(btoa(s));chunks++;});};
   const stopped=new Promise((ok,no)=>{rec.onstop=ok;rec.onerror=e=>no(Error(e.error?.message??'Recording failed'));});
   const duration=segments.at(-1).end,clock=[];frame(segments[0],0);rec.start(1000);const start=performance.now();
   await new Promise(resolve=>{function tick(now){const elapsed=(now-start)/1000;clock.push(elapsed);if(elapsed>=duration){frame(segments.at(-1),segments.at(-1).seconds);resolve();return;}
    const segment=segments.find(s=>elapsed<s.end);frame(segment,elapsed-segment.start);requestAnimationFrame(tick);}requestAnimationFrame(tick);});
   rec.stop();await stopped;await pending;stream.getTracks().forEach(t=>t.stop());
   const gaps=clock.slice(1).map((t,i)=>(t-clock[i])*1000).sort((a,b)=>a-b);
   return {wallSeconds:clock.at(-1),renderedFrames:clock.length,chunks,medianFrameGapMs:gaps[Math.floor(gaps.length*.5)],p95FrameGapMs:gaps[Math.floor(gaps.length*.95)],maxFrameGapMs:gaps.at(-1)};
  }};
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');frame(segments[0],0);
  return {clip:clip.name,clipDuration:clip.duration,actorMeshes:actor.map(o=>o.name),actorBounds:{min:actorBox.min.toArray(),max:actorBox.max.toArray()},actorDistance,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
 },segments);
 assert.equal(info.clipDuration,12);
 for(let i=0;i<segments.length;i++){
  await page.evaluate(i=>window.__fullReview.frame(i,12),i);
  await page.screenshot({path:out+`/view-${String(i).padStart(2,'0')}.png`});
 }
 console.log('Framing previews ready:',out,info);
 file=await open(out+'/100gate-full-hand-character-review.webm','w');
 await page.exposeBinding('__writeVideoChunk',async(_source,base64)=>{await file.write(Buffer.from(base64,'base64'));});
 const timing=await page.evaluate(()=>window.__fullReview.record());await file.close();file=undefined;
 assert.deepEqual(errors,[]);assert(Math.abs(timing.wallSeconds-end)<.3);
 const sourceSha256=createHash('sha256').update(await readFile('art/hand-knife-contact.glb')).digest('hex');
 await writeFile(out+'/recording.json',JSON.stringify({source:'art/hand-knife-contact.glb',sourceSha256,segments,info,timing,errors,scope:'Entire current 12-second hand study, NOT an escape/rope intro.'},null,2));
 console.log('Recorded',timing,'duration target',end,'seconds');
}finally{if(file)await file.close();await browser.close();}
