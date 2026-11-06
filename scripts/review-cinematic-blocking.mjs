/** Static visual/contact gates, not a claimed intro animation. */
import {testBrowser} from './browser.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL??'http://127.0.0.1:5182',out='outputs/cinematic-intro';
const browser=await testBrowser();
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(base+'/__cinematic_blocking__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0}#label{position:absolute;left:20px;top:15px;color:white;background:#252b32cc;padding:8px;font:18px sans-serif}</style></head><body><div id="label"></div></body></html>'}));
 await page.goto(base+'/__cinematic_blocking__');
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),{RoomEnvironment}=await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
  const scene=new T.Scene();scene.background=new T.Color(0x343842);const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,900);renderer.toneMapping=T.AgXToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;document.body.appendChild(renderer.domElement);
  const room=new RoomEnvironment(),gen=new T.PMREMGenerator(renderer),env=gen.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.65;room.dispose();gen.dispose();
  scene.add(new T.HemisphereLight(0xd5e5f5,0x544e47,.5));
  const key=new T.DirectionalLight(0xffe5ca,2);key.position.set(-2,3,3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:12});key.shadow.bias=-.0001;scene.add(key);
  const fill=new T.DirectionalLight(0xdce5f3,.6);fill.position.set(2,2,-3);scene.add(fill);
  let asset;
  window.__blocking={async load(name){if(asset)scene.remove(asset.scene);asset=await new GLTFLoader().loadAsync('/outputs/cinematic-intro/blocking-'+name+'.glb');assertStatic();scene.add(asset.scene);asset.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.userData.reviewMaterial=o.material;}});scene.updateMatrixWorld(true);return dump();},material(mode){asset.scene.traverse(o=>{if(!o.isMesh)return;if(mode==='clay'){o.userData.clayMaterial??=new T.MeshStandardMaterial({color:0xbcbcbc,roughness:.8});o.material=o.userData.clayMaterial;}else{o.material=o.userData.reviewMaterial;}});},render(name){const cam=asset.cameras.find(c=>c.name.startsWith('Cine')&&c.name.endsWith(name.replaceAll(' ','_')));if(!cam)throw Error('Camera missing '+name+'; '+asset.cameras.map(c=>c.name));cam.aspect=4/3;cam.updateProjectionMatrix();renderer.render(scene,cam);}};
  function assertStatic(){if(asset.animations.length)throw Error('Static blocking must not masquerade as motion');}
  function dump(){
   const meshes=[],p=new T.Vector3();
   asset.scene.traverse(o=>{
    if(!o.isMesh)return;const g=o.geometry,ix=g.getIndex(),positions=[],triangles=[];if(o.isSkinnedMesh)o.skeleton.update();
    for(let i=0;i<g.getAttribute('position').count;i++){o.getVertexPosition(i,p).applyMatrix4(o.matrixWorld);positions.push([p.x,-p.z,p.y]);}
    for(let i=0;i<(ix?.count??positions.length);i+=3)triangles.push([0,1,2].map(j=>ix?ix.getX(i+j):i+j));
    meshes.push({name:o.name,positions,triangles});
   });return {meshes};
  }
 });
 const pairs=JSON.parse(process.env.CINEMATIC_VIEWS??'null')??{bound:['Front','Side','Back','Bound wrists','First person'],ground:['Ground','Ground side','Top','Back','First person'],grip:['Ground','Ground side','Top','Grip close','Grip reverse','First person'],stand:['Front','Side','Back','First person']};
 for(const [pose,views] of Object.entries(pairs)){
  const data=await page.evaluate(pose=>window.__blocking.load(pose),pose);await writeFile(out+'/runtime-'+pose+'-meshes.json',JSON.stringify(data));
  for(const view of views){await page.evaluate(({pose,view})=>{window.__blocking.render(view);document.querySelector('#label').textContent=`STATIC BLOCKING · ${pose} · ${view} — не готовая анимация`;},{pose,view});await page.screenshot({path:out+'/'+pose+'-'+view.toLowerCase().replaceAll(' ','-')+'.png'});
   if(process.env.CINEMATIC_CLAY==='1'){await page.evaluate(view=>{window.__blocking.material('clay');window.__blocking.render(view);},view);await page.screenshot({path:out+'/'+pose+'-'+view.toLowerCase().replaceAll(' ','-')+'-clay.png'});await page.evaluate(()=>window.__blocking.material('original'));}
  }
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/blocking-browser-errors.json',JSON.stringify(errors));console.log('Four static gates rendered. Inspect screenshots and actual contact geometry before motion.');
}finally{await browser.close();}
