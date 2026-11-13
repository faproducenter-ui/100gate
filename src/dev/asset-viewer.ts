import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';

/** Dev-only viewer for the three trailer models: real size from Box3, and the scale that brings each to metres. */
const info=document.getElementById('info')!;
const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);document.body.appendChild(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color(0x20262b);
scene.add(new T.HemisphereLight(0xffffff,0x334455,2.2),new T.DirectionalLight(0xffffff,2));
const camera=new T.PerspectiveCamera(50,innerWidth/innerHeight,.05,2000);camera.position.set(6,4,9);
const controls=new OrbitControls(camera,renderer.domElement);
const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
/** target: which size (m) the longest-relevant axis should have */
const specs=[
  {name:'car',url:'/assets/trailer/car.glb',axis:'z' as const,target:4.0,x:0},
  {name:'backpack',url:'/assets/trailer/backpack.glb',axis:'y' as const,target:.65,x:4},
  {name:'road',url:'/assets/trailer/'+(new URLSearchParams(location.search).get('road')||'road')+'.glb',axis:'x' as const,target:0,x:-12},
];
const lines:string[]=[];const loaded:Record<string,T.Object3D>={};
for(const s of specs){
  const g=await loader.loadAsync(s.url),box=new T.Box3().setFromObject(g.scene),size=box.getSize(new T.Vector3());
  lines.push(`${s.name}: size ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}  min ${box.min.toArray().map(v=>v.toFixed(2))} max ${box.max.toArray().map(v=>v.toFixed(2))}`);
  const k=s.target?s.target/size[s.axis]:1;lines.push(`  scale to metres: x${k.toFixed(5)} (${s.axis} -> ${s.target||'?'} m)`);
  if(s.name!=='road'){g.scene.scale.setScalar(k);const b=new T.Box3().setFromObject(g.scene);g.scene.position.set(s.x-b.getCenter(new T.Vector3()).x,-b.min.y,-b.getCenter(new T.Vector3()).z);}
  else{g.scene.scale.setScalar(.02);g.scene.position.set(s.x,-3,-20);}
  loaded[s.name]=g.scene;scene.add(g.scene);
}
scene.add(new T.GridHelper(40,40,0x555555,0x333333));
info.textContent=lines.join('\n');
(window as unknown as {__viewer:unknown}).__viewer={lines,loaded,scene,T,camera,controls};
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
