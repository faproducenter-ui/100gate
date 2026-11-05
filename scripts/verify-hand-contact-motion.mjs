/** Real Three.js skin validation and normal-speed, continuous 360° close-up. */
import {testBrowser} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='outputs/hand-mesh-rework',base=process.env.GAME_URL??'http://127.0.0.1:5182';
await mkdir(out,{recursive:true});
const browser=await testBrowser();
try{
 const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(base+'/__hand_contact_motion__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;background:#343842}#label{position:absolute;top:18px;left:20px;color:#fff;font:16px sans-serif}</style></head><body><div id="label"></div></body></html>'}));
 await page.goto(base+'/__hand_contact_motion__');
 const info=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const {RoomEnvironment}=await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
  const asset=await new GLTFLoader().loadAsync('/outputs/hand-mesh-rework/hand-contact-motion.glb');
  const scene=new T.Scene();scene.background=new T.Color(0x343842);scene.add(asset.scene);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1024,768);renderer.toneMapping=T.AgXToneMapping;
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.65;pmrem.dispose();room.dispose();
  scene.add(new T.HemisphereLight(0xd5e5f5,0x544e47,.5));const key=new T.DirectionalLight(0xffe5ca,2);key.position.set(2.1,3,3);scene.add(key);document.body.appendChild(renderer.domElement);
  const mixer=new T.AnimationMixer(asset.scene);
  if(asset.animations.length!==1)throw new Error('Arm and knife must be a single scene clip: '+asset.animations.map(c=>c.name));
  const clip=asset.animations[0],action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
  let body,knife,handBone;asset.scene.traverse(o=>{if(o.isSkinnedMesh&&o.name.endsWith('_body_glb'))body=o;if(o.name.startsWith('Cinematic_field_knife'))knife=o;if(o.isBone&&o.name==='hand_r')handBone=o;});
  if(!body||!knife||!handBone)throw new Error('Missing original skeleton/knife');
  const camera=new T.PerspectiveCamera(42,4/3,.004,100),p=new T.Vector3();
  const overlay=new T.Scene(),ortho=new T.OrthographicCamera(-512,512,384,-384,.1,10);ortho.position.z=1;
  const titleCanvas=document.createElement('canvas');titleCanvas.width=1024;titleCanvas.height=76;
  const titleTexture=new T.CanvasTexture(titleCanvas),title=new T.Sprite(new T.SpriteMaterial({map:titleTexture,depthTest:false,depthWrite:false}));
  title.scale.set(1024,76,1);title.position.set(0,346,0);overlay.add(title);
  let lastTitle='';
  function caption(text){if(text===lastTitle)return;lastTitle=text;const c=titleCanvas.getContext('2d');c.clearRect(0,0,1024,76);c.fillStyle='rgba(20,23,29,.80)';c.fillRect(0,0,1024,76);c.fillStyle='#fff';c.font='20px sans-serif';c.fillText(text,20,31);c.fillStyle='#c2cad4';c.font='15px sans-serif';c.fillText('100gate · исходная MakeHuman/MPFB-модель · скелетные пальцы · диагностическая сцена',20,57);titleTexture.needsUpdate=true;}
  const authoring=p=>[p.x,-p.z,p.y];
  function setTime(t){action.paused=false;action.enabled=true;mixer.setTime(t);scene.updateMatrixWorld(true);body.skeleton.update();}
  function view(name,orbit=null){
   // Directions specified in the same authoring knife basis as Blender.
   const dirs={Palm:[.1,1,.12],Dorsal:[.1,-1,.12],Left:[-1,.08,.12],Right:[1,.08,.12],Top:[.12,.05,1],Butt:[.12,.05,-1]};
   const d=orbit===null?dirs[name]:[Math.sin(orbit),Math.cos(orbit),.20];
   const center=new T.Vector3(-.012,.028,0).applyMatrix4(knife.matrixWorld);
   const direction=new T.Vector3(d[0],d[2],-d[1]).normalize().transformDirection(knife.matrixWorld);
   camera.position.copy(center).addScaledVector(direction,.405);
   camera.up.set(0,1,0);camera.lookAt(center);renderer.render(scene,camera);
   renderer.autoClear=false;renderer.clearDepth();renderer.render(overlay,ortho);renderer.autoClear=true;
  }
  const g=body.geometry,ix=g.getIndex(),joints=g.getAttribute('skinIndex'),weights=g.getAttribute('skinWeight');
  const triangles=[],labels=[],weld=[],identities=new Map(),pos=g.getAttribute('position');
  for(let i=0;i<(ix?.count??g.getAttribute('position').count);i+=3)triangles.push([0,1,2].map(j=>ix?ix.getX(i+j):i+j));
  for(let i=0;i<g.getAttribute('position').count;i++){
   const influences=Array.from({length:4},(_,j)=>[joints.getComponent(i,j),weights.getComponent(i,j)]).filter(v=>v[1]>0).sort((a,b)=>a[0]-b[0]);
   const identity=JSON.stringify([pos.getX(i),pos.getY(i),pos.getZ(i),influences]);
   if(!identities.has(identity))identities.set(identity,i);weld.push(identities.get(identity));
   let largest=-1,bone=-1;for(let j=0;j<4;j++){const w=weights.getComponent(i,j);if(w>largest){largest=w;bone=joints.getComponent(i,j);}}
   const name=body.skeleton.bones[bone]?.name??'',match=name.match(/^(thumb|index|middle|ring|pinky)_\d\d_r$/);labels.push(match?match[1]:name==='hand_r'?'palm':null);
  }
  setTime(10);
  const parts=[],inv=new T.Matrix4().copy(knife.matrixWorld).invert();
  for(const child of knife.children){
   const part={name:child.name,positions:[],triangles:[]};child.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,pos=g.getAttribute('position'),ix=g.getIndex(),offset=part.positions.length;
    for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);part.positions.push(authoring(p));}
    for(let i=0;i<(ix?.count??pos.count);i+=3)part.triangles.push([0,1,2].map(j=>offset+(ix?ix.getX(i+j):i+j)));
   });if(part.positions.length)parts.push(part);
  }
  function sample(t,positions=true){
   setTime(t);const inv=new T.Matrix4().copy(knife.matrixWorld).invert(),points=[];
   if(positions)for(let i=0;i<g.getAttribute('position').count;i++){body.getVertexPosition(i,p).applyMatrix4(body.matrixWorld).applyMatrix4(inv);points.push(authoring(p));}
   return {time:t,positions:points,knifeWorld:knife.matrixWorld.toArray(),socket:new T.Matrix4().copy(handBone.matrixWorld).invert().multiply(knife.matrixWorld).toArray()};
  }
  window.__contact={setTime,view,sample,async record(){
   const stream=renderer.domElement.captureStream(30),mime='video/webm;codecs=vp8';
   if(!MediaRecorder.isTypeSupported(mime))throw new Error('VP8 recorder unavailable');
   const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6500000}),chunks=[],times=[];
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const done=new Promise(resolve=>rec.onstop=resolve);
   caption('1× · Открытая кисть → Подход → Захват → Удержание');setTime(0);view('Palm');rec.start(1000);const start=performance.now();
   await new Promise(resolve=>{function tick(now){const elapsed=(now-start)/1000;times.push(elapsed);
    if(elapsed<12){setTime(elapsed);view('Palm');}
    else if(elapsed<30){caption('Полный хват · Непрерывный оборот камеры на 360° · 18 секунд');setTime(12);view('Palm',(elapsed-12)/18*Math.PI*2);}
    else if(elapsed<36){caption('Повтор 1× · Тыльная сторона · 5,5 секунды закрытия');setTime(3.5+Math.min(5.5,elapsed-30));view('Dorsal');}
    else if(elapsed<42){caption('Повтор 1× · Сверху · 5,5 секунды закрытия');setTime(3.5+Math.min(5.5,elapsed-36));view('Top');}
    else if(elapsed<48){caption('Повтор 1× · Левая сторона · 5,5 секунды закрытия');setTime(3.5+Math.min(5.5,elapsed-42));view('Left');}
    else if(elapsed<54){caption('Повтор 1× · Правая сторона · 5,5 секунды закрытия');setTime(3.5+Math.min(5.5,elapsed-48));view('Right');}
    else if(elapsed<60){caption('Повтор 1× · Ладонь · 5,5 секунды закрытия');setTime(3.5+Math.min(5.5,elapsed-54));view('Palm');}
    else{resolve();return;}requestAnimationFrame(tick);}requestAnimationFrame(tick);});
   rec.stop();await done;stream.getTracks().forEach(t=>t.stop());
   const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());
   let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   const gaps=times.slice(1).map((t,i)=>(t-times[i])*1000).sort((a,b)=>a-b);
   return {base64:btoa(binary),wallSeconds:times.at(-1),renderedFrames:times.length,
    medianFrameGapMs:gaps[Math.floor(gaps.length*.5)],p95FrameGapMs:gaps[Math.floor(gaps.length*.95)],
    maxFrameGapMs:Math.max(...times.slice(1).map((t,i)=>(t-times[i])*1000)),timeline:'0–12s 1x sequence;12–30s continuous 360 orbit;30–36 dorsal;36–42 top;42–48 left;48–54 right;54–60 palm; each replay 1x, 5.5s finger curl'};
  }};
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  setTime(0);view('Palm');return {parts,triangles,labels,weld,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),clip:clip.name,duration:clip.duration,tracks:clip.tracks.map(t=>t.name)};
 });
 assert(Math.abs(info.duration-12)<.01);
 // Independently sample every source frame's prop hierarchy, plus mesh samples
 // at contact/curl transitions. These fast diagnostic jumps are NOT recorded.
 const hierarchy=await page.evaluate(()=>Array.from({length:289},(_,f)=>window.__contact.sample(f/24,false)));
 const fixed=hierarchy[0].knifeWorld,socket=hierarchy[240].socket;
 const error=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
 assert(Math.max(...hierarchy.slice(0,241).map(f=>error(f.knifeWorld,fixed)))<1e-6,'knife moved before full grip');
 assert(Math.max(...hierarchy.slice(240).map(f=>error(f.socket,socket)))<2e-6,'knife slips after attachment');
 await writeFile(out+'/motion-hierarchy.json',JSON.stringify(hierarchy));
 const times=[0,1,2,3,3.5,4,4.5,4.875,5,5.5,6,6.25,6.5,7,7.5,7.625,8,8.5,9,10,11,12];
 for(const t of times){const sample=await page.evaluate(t=>window.__contact.sample(t),t);await writeFile(out+`/runtime-frame-${Math.round(t*24)}.json`,JSON.stringify(sample));}
 await writeFile(out+'/motion-runtime-topology.json',JSON.stringify(info));
 for(const pct of [0,25,50,75,100]){
  const t=3.5+5.5*pct/100;
  for(const view of ['Palm','Dorsal','Left','Right','Top']){
   await page.evaluate(({t,view,pct})=>{window.__contact.setTime(t);window.__contact.view(view);document.querySelector('#label').textContent=`${pct}% · ${view} · ${t.toFixed(3)} s`;},{t,view,pct});
   await page.screenshot({path:out+`/close-${pct}-${view.toLowerCase()}.png`});
  }
 }
 if(process.env.GATE_RECORD!=='0'){
  const movie=await page.evaluate(()=>window.__contact.record());
  await writeFile(out+'/hand-contact-slow-360.webm',Buffer.from(movie.base64,'base64'));delete movie.base64;
  await writeFile(out+'/movie-timing.json',JSON.stringify(movie,null,2));console.log('Recorded normal-speed 360 study',movie);
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/motion-browser-console.json',JSON.stringify(errors));
 console.log('Actual Three.js samples and 25 checkpoint views saved. Visual inspection still required.');
}finally{await browser.close();}
