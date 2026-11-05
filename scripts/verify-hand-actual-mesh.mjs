import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL??'http://127.0.0.1:5182';
const out='outputs/hand-mesh-rework';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(base+'/__hand_actual_mesh__',r=>r.fulfill({contentType:'text/html',
  body:'<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0}</style></head><body></body></html>'}));
 await page.goto(base+'/__hand_actual_mesh__');
 const data=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const {RoomEnvironment}=await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
  const asset=await new GLTFLoader().loadAsync('/outputs/hand-mesh-rework/hand-static.glb');
  const scene=new T.Scene();scene.background=new T.Color(0x343842);scene.add(asset.scene);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(1200,900);renderer.toneMapping=T.AgXToneMapping;
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);
  scene.environment=env.texture;scene.environmentIntensity=.65;pmrem.dispose();room.dispose();
  scene.add(new T.HemisphereLight(0xd5e5f5,0x544e47,.5));
  const key=new T.DirectionalLight(0xffe5ca,2);key.position.set(2.1,3,3);scene.add(key);
  document.body.appendChild(renderer.domElement);
  scene.updateMatrixWorld(true);
  let body,knife;
  asset.scene.traverse(o=>{
    if(o.isSkinnedMesh&&o.name.endsWith('_body_glb'))body=o;
    if(o.name.startsWith('Cinematic_field_knife'))knife=o;
  });
  if(!body||!knife)throw new Error('Missing original body or actual knife hierarchy');
  body.skeleton.update();
  const inv=new T.Matrix4().copy(knife.matrixWorld).invert();
  const authoring=p=>[p.x,-p.z,p.y]; // glTF local Y-up -> Blender local Z-up.
  const p=new T.Vector3(),hand={positions:[],triangles:[],labels:[]};
  const geometry=body.geometry,indices=geometry.getIndex(),joints=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight');
  for(let i=0;i<geometry.getAttribute('position').count;i++){
    body.getVertexPosition(i,p).applyMatrix4(body.matrixWorld).applyMatrix4(inv);
    hand.positions.push(authoring(p));
    let largest=-1,bone=-1;
    for(let j=0;j<4;j++){const w=weights.getComponent(i,j);if(w>largest){largest=w;bone=joints.getComponent(i,j);}}
    const name=body.skeleton.bones[bone]?.name??'';
    const match=name.match(/^(thumb|index|middle|ring|pinky)_\d\d_r$/);
    hand.labels.push(match?match[1]:name==='hand_r'?'palm':null);
  }
  for(let i=0;i<(indices?.count??geometry.getAttribute('position').count);i+=3)
    hand.triangles.push([0,1,2].map(j=>indices?indices.getX(i+j):i+j));
  const parts=[];
  for(const child of knife.children){
    const part={name:child.name,positions:[],triangles:[]};
    child.traverse(o=>{
      if(!o.isMesh)return;
      const g=o.geometry,position=g.getAttribute('position'),ix=g.getIndex(),offset=part.positions.length;
      for(let i=0;i<position.count;i++){
        p.fromBufferAttribute(position,i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        part.positions.push(authoring(p));
      }
      for(let i=0;i<(ix?.count??position.count);i+=3)
        part.triangles.push([0,1,2].map(j=>offset+(ix?ix.getX(i+j):i+j)));
    });
    if(part.positions.length)parts.push(part);
  }
  window.__handActualReview={render(name){
    const camera=asset.cameras.find(c=>c.name.startsWith('Grip')&&c.name.includes(name));
    if(!camera)throw new Error('Missing inspection camera '+name);
    renderer.render(scene,camera);
  }};
  return {basis:'metres; Blender knife-local Z length; converted from actual glTF geometry',hand,parts,clips:asset.animations.length};
 });
 assert.equal(data.clips,0,'Static gate must not export an unaccepted animation');
 for(const view of ['Palm','Dorsal','Left','Right','Top','Butt']){
   await page.evaluate(name=>window.__handActualReview.render(name),view);
   await page.screenshot({path:out+'/static-three-'+view.toLowerCase()+'.png'});
 }
 assert.deepEqual(errors,[]);
 await writeFile(out+'/three-actual-static.json',JSON.stringify(data));
 await writeFile(out+'/static-browser-console.json',JSON.stringify(errors));
 console.log('Actual runtime skin and all knife primitives dumped; six views captured. No visual acceptance implied.');
}finally{await browser.close();}
