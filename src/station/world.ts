import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {loadWalk,type WalkGrid,type WalkInfo} from './walk';
import type {Settings} from '../iso/contracts';

/** Data written by tools/gas-station/export_station.py. Positions are Blender coordinates (x east, y north, z up). */
type LightDef={name:string;type:'POINT'|'SPOT'|'SUN'|'AREA';pos:number[];color:number[];energy:number;dir?:number[];angle?:number;blend?:number;radius?:number;flicker?:number[]};
export type StationData={version:string;lights:LightDef[];products:Record<string,number[][]>;pines:number[][];kept:{name:string;pos:number[];dynamic:boolean}[];
  walk:WalkInfo&{file:string};spawn:{pos:number[];yaw:number}};

export const ASSET_DIR='assets/iso/';
export const STATION_VERSION='1';
/** Blender (x,y,z) -> three (x,z,-y). */
export const B2T=new T.Matrix4().set(1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1);
const T2B=B2T.clone().invert();
export const toThree=(x:number,y:number,z:number)=>new T.Vector3(x,z,-y);
const W2CD=1/(4*Math.PI);   // Blender watts -> candela for three's physical lights (same diffuse result as Cycles/EEVEE)

/** Hinged parts: which way they open (radians about the vertical axis) and whether they start locked. */
export const DOORS:Record<string,{leaves:string[];angle:number[];label:string;locked?:string}>={
  shop:{leaves:['Door_L','Door_R'],angle:[1.55,-1.55],label:'Решётчатая дверь',locked:'keycard'},
  motel1:{leaves:['Motel_Door1_Leaf'],angle:[1.45],label:'Дверь номера 1'},
  motel2:{leaves:['Motel_Door2_Leaf'],angle:[1.45],label:'Дверь номера 2',locked:'never'},
  motel3:{leaves:['Motel_Door3_Leaf'],angle:[1.45],label:'Дверь номера 3'},
  shed:{leaves:['ShedA_ShedDoor_Leaf'],angle:[1.5],label:'Дверь сарая'},
  gate:{leaves:['Gate_L','Gate_R'],angle:[1.4,-1.4],label:'Ворота',locked:'never'},
};
export type DoorId=keyof typeof DOORS;

function rng(seed:number){return ()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};}

export class StationWorld{
  readonly renderer:T.WebGLRenderer;
  readonly scene=new T.Scene();
  readonly camera=new T.PerspectiveCamera(70,1,.05,420);
  readonly torch=new T.SpotLight(0xfff1d8,0,26,.42,.55,2);
  private readonly lights:{light:T.Light;base:number;flicker?:number[];phase:number}[]=[];
  private readonly flickerMats:{mat:T.MeshStandardMaterial;base:number;src?:number}[]=[];
  private readonly screenMats:T.MeshStandardMaterial[]=[];
  private readonly doorNodes=new Map<string,{node:T.Object3D;base:T.Quaternion}>();
  readonly doorOpen:Record<string,number>={};
  readonly doorWant:Record<string,number>={};
  private readonly pineChunks:T.InstancedMesh[]=[];
  private time=0;
  private width=0;private height=0;

  private constructor(canvas:HTMLCanvasElement,readonly data:StationData,readonly walk:WalkGrid,gltf:T.Object3D){
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.35;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.scene.background=new T.Color(0x04070e);
    this.scene.fog=new T.FogExp2(0x060a12,.011);
    this.scene.add(this.camera);
    this.camera.add(this.torch,this.torch.target);this.torch.position.set(.18,-.22,0);this.torch.target.position.set(0,-.15,-4);
    this.buildWorld(gltf);
    this.buildLights();
    this.buildSky();
  }

  static async create(canvas:HTMLCanvasElement,onProgress:(t:string)=>void){
    const base=import.meta.env.BASE_URL+ASSET_DIR;
    onProgress('Карта заправки');
    const res=await fetch(base+`station-${STATION_VERSION}.json`);
    if(!res.ok)throw Error('Не удалось загрузить данные локации');
    const data=await res.json() as StationData;
    onProgress('Модели и текстуры');
    const draco=new DRACOLoader();draco.setDecoderPath(import.meta.env.BASE_URL+'assets/iso/draco/');
    const loader=new GLTFLoader();loader.setDRACOLoader(draco);
    const [gltf,walk]=await Promise.all([
      loader.loadAsync(base+`station-${STATION_VERSION}.glb`,e=>{if(e.total)onProgress(`Модели и текстуры ${Math.round(e.loaded/e.total*100)}%`);}),
      loadWalk(base+data.walk.file,data.walk)]);
    draco.dispose();
    onProgress('Свет');
    return new StationWorld(canvas,data,walk,gltf.scene);
  }

  private buildWorld(root:T.Object3D){
    const libs=new Map<string,T.Mesh>();let pine:T.Mesh|undefined;
    root.traverse(o=>{
      if(!(o instanceof T.Mesh))return;
      const name=o.name||o.parent?.name||'';
      if(name.startsWith('LIB_'))libs.set(name.slice(4),o);
      else if(name==='PINE')pine=o;
      const mats=Array.isArray(o.material)?o.material:[o.material];
      for(const m of mats){
        if(!(m instanceof T.MeshStandardMaterial))continue;
        if(m.name.includes('LampFlicker'))this.flickerMats.push({mat:m,base:m.emissiveIntensity||1});
        if(m.name.includes('ScreenBroken'))this.screenMats.push(m);
        if(m.alphaTest>0)m.side=T.DoubleSide;
      }
      const big=name.startsWith('S_W_Dirt')||name.startsWith('S_S_Mountain')||name.startsWith('S_W_Asphalt');
      o.receiveShadow=true;o.castShadow=!big;
    });
    for(const m of [...libs.values(),pine])m?.parent?.remove(m);
    this.scene.add(root);
    // doors keep their glTF pivot (the hinge)
    for(const d of Object.values(DOORS))for(const leaf of d.leaves){
      const node=root.getObjectByName(leaf);
      if(node)this.doorNodes.set(leaf,{node,base:node.quaternion.clone()});
    }
    for(const id of Object.keys(DOORS)){this.doorOpen[id]=0;this.doorWant[id]=0;this.setDoorBlocker(id,true);}
    // products on the shelves: one InstancedMesh per library mesh
    const m=new T.Matrix4();
    for(const [name,list] of Object.entries(this.data.products)){
      const src=libs.get(name);if(!src)continue;
      const im=new T.InstancedMesh(src.geometry,src.material,list.length);
      list.forEach((a,i)=>{m.fromArray(a);im.setMatrixAt(i,B2T.clone().multiply(m).multiply(T2B));});
      im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();im.castShadow=false;im.receiveShadow=true;
      this.scene.add(im);
    }
    // the forest: chunked so frustum culling drops what is behind the camera
    if(pine){
      const chunks=new Map<string,T.Matrix4[]>();
      for(const a of this.data.pines){
        m.fromArray(a);const t=B2T.clone().multiply(m).multiply(T2B),p=new T.Vector3().setFromMatrixPosition(t);
        const key=`${Math.floor(p.x/40)},${Math.floor(p.z/40)}`;
        let l=chunks.get(key);if(!l)chunks.set(key,l=[]);l.push(t);
      }
      for(const list of chunks.values()){
        const im=new T.InstancedMesh(pine.geometry,pine.material,list.length);
        list.forEach((t,i)=>im.setMatrixAt(i,t));im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();
        im.castShadow=false;im.receiveShadow=false;this.scene.add(im);this.pineChunks.push(im);
      }
    }
  }

  private buildLights(){
    this.scene.add(new T.HemisphereLight(0x2a3b5a,0x0d0a07,.55));
    const r=rng(7);
    for(const l of this.data.lights){
      const color=new T.Color(l.color[0],l.color[1],l.color[2]);
      const pos=toThree(l.pos[0]!,l.pos[1]!,l.pos[2]!);
      let light:T.Light;
      if(l.type==='SUN'){
        const d=new T.DirectionalLight(color,Math.min(l.energy,1.2)*.75);
        const dir=toThree(l.dir![0]!,l.dir![1]!,l.dir![2]!);
        d.position.copy(dir.clone().multiplyScalar(-60));d.target.position.set(0,0,0);this.scene.add(d.target);
        d.castShadow=true;d.shadow.mapSize.set(2048,2048);const c=d.shadow.camera;c.left=-45;c.right=45;c.top=45;c.bottom=-45;c.near=1;c.far=160;d.shadow.bias=-.0006;d.shadow.normalBias=.04;
        light=d;
      }else if(l.type==='SPOT'){
        const s=new T.SpotLight(color,l.energy*W2CD,0,(l.angle??1)/2,l.blend??.3,2);
        const dir=toThree(l.dir![0]!,l.dir![1]!,l.dir![2]!);
        s.position.copy(pos);s.target.position.copy(pos.clone().add(dir));this.scene.add(s.target);
        if(l.name==='ShopLamp_Spot'){s.castShadow=true;s.shadow.mapSize.set(1024,1024);s.shadow.bias=-.0004;s.shadow.camera.near=.2;}
        light=s;
      }else{
        const p=new T.PointLight(color,l.energy*W2CD,l.energy>200?30:14,2);p.position.copy(pos);light=p;
      }
      this.scene.add(light);
      this.lights.push({light,base:light.intensity,flicker:l.flicker,phase:r()*10});
      if(l.name==='ShopLamp_Spot')for(const f of this.flickerMats)f.src=this.lights.length-1;
    }
  }

  private buildSky(){
    const r=rng(3),n=2600,pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(let i=0;i<n;i++){
      const u=r(),v=r()*.95+.05,th=u*Math.PI*2,ph=Math.acos(v);   // upper hemisphere
      const R=360;pos.set([Math.sin(ph)*Math.cos(th)*R,Math.cos(ph)*R,Math.sin(ph)*Math.sin(th)*R],i*3);
      const b=.35+r()**3*.9,t=r();col.set([b*(.85+.15*t),b*.9,b*(1.05-.1*t)],i*3);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('color',new T.BufferAttribute(col,3));
    const stars=new T.Points(g,new T.PointsMaterial({size:1.6,sizeAttenuation:false,vertexColors:true,fog:false,depthWrite:false,transparent:true,opacity:.9}));
    stars.renderOrder=-2;stars.frustumCulled=false;this.scene.add(stars);this.sky=stars;
    // moon opposite to the moonlight's direction
    const sun=this.data.lights.find(l=>l.type==='SUN');
    const dir=sun?toThree(-sun.dir![0]!,-sun.dir![1]!,-sun.dir![2]!).normalize():new T.Vector3(.4,.6,-.6).normalize();
    const cv=document.createElement('canvas');cv.width=cv.height=128;const ctx=cv.getContext('2d')!;
    const grd=ctx.createRadialGradient(64,64,10,64,64,64);grd.addColorStop(0,'rgba(235,240,255,1)');grd.addColorStop(.28,'rgba(220,228,255,1)');grd.addColorStop(.33,'rgba(150,170,220,.35)');grd.addColorStop(1,'rgba(80,100,160,0)');
    ctx.fillStyle=grd;ctx.fillRect(0,0,128,128);
    const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;
    const moon=new T.Sprite(new T.SpriteMaterial({map:tex,fog:false,depthWrite:false,transparent:true}));
    moon.position.copy(dir.multiplyScalar(340));moon.scale.setScalar(40);moon.renderOrder=-1;this.sky.add(moon);
  }
  private sky!:T.Points;

  private setDoorBlocker(id:string,closed:boolean){
    if(!closed){this.walk.blockers.delete(id);return;}
    const box=new T.Box3();
    for(const leaf of DOORS[id]!.leaves){const n=this.doorNodes.get(leaf)?.node;if(n)box.expandByObject(n);}
    if(box.isEmpty())return;
    // three box -> Blender ground rectangle, padded to the wall thickness
    this.walk.blockers.set(id,{x0:box.min.x-.05,x1:box.max.x+.05,y0:-box.max.z-.12,y1:-box.min.z+.12});
  }
  toggleDoor(id:string){this.doorWant[id]=this.doorWant[id]?0:1;if(this.doorWant[id])this.setDoorBlocker(id,false);return !!this.doorWant[id];}
  /** Opening/closing motion; a door stays solid until it has swung mostly open, and becomes solid again when it closes. */
  private animateDoors(dt:number){
    const q=new T.Quaternion(),up=new T.Vector3(0,1,0);
    for(const [id,d] of Object.entries(DOORS)){
      const want=this.doorWant[id]!,cur=this.doorOpen[id]!;
      if(cur===want)continue;
      const next=want>cur?Math.min(want,cur+dt/1.4):Math.max(want,cur-dt/1.1);this.doorOpen[id]=next;
      const k=T.MathUtils.smootherstep(next,0,1);
      d.leaves.forEach((leaf,i)=>{const n=this.doorNodes.get(leaf);if(n){q.setFromAxisAngle(up,d.angle[i]!*k);n.node.quaternion.copy(n.base).premultiply(q);}});
      if(next===0)this.setDoorBlocker(id,true);
    }
  }
  /** World position of a named node (three coordinates). */
  nodePos(name:string){const n=this.scene.getObjectByName(name);return n?n.getWorldPosition(new T.Vector3()):undefined;}

  resize(w:number,h:number,settings:Settings){
    const cap=settings.quality==='low'?1:settings.quality==='medium'?1.5:2;
    this.renderer.setPixelRatio(Math.max(.55,Math.min(devicePixelRatio,cap)*settings.scale));
    if(w!==this.width||h!==this.height){this.width=w;this.height=h;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
    this.renderer.shadowMap.enabled=settings.shadows&&settings.quality!=='low';
  }

  render(f:{dt:number;eye:T.Vector3;yaw:number;pitch:number;torch:boolean;bob:number;settings:Settings}){
    this.time+=f.dt;
    this.animateDoors(f.dt);
    const cam=this.camera;
    cam.position.copy(f.eye);cam.position.y+=f.bob;
    cam.rotation.set(f.pitch,f.yaw,0,'YXZ');
    this.sky.position.copy(cam.position);
    this.torch.intensity+=((f.torch?38:0)-this.torch.intensity)*Math.min(1,f.dt*14);
    // flickering lights follow the pattern baked in Blender (24 fps), slightly jittered; reduced flicker keeps them steady
    const frame=Math.floor(this.time*24);
    for(const l of this.lights){
      if(!l.flicker)continue;
      const v=f.settings.reducedFlicker?1:l.flicker[(frame+Math.floor(l.phase*24))%l.flicker.length]!;
      l.light.intensity=l.base*v;
    }
    for(const fm of this.flickerMats){
      const src=fm.src!==undefined?this.lights[fm.src]:undefined;
      fm.mat.emissiveIntensity=fm.base*(src?src.light.intensity/Math.max(src.base,1e-6):1);
    }
    for(const s of this.screenMats){
      const t=this.time,n=Math.sin(t*37.1)*Math.sin(t*11.3+1.7);
      s.emissiveIntensity=f.settings.reducedFlicker?1:(n>.55?.15:.6+.5*Math.abs(Math.sin(t*3.1)));
    }
    this.renderer.render(this.scene,cam);
  }
  dispose(){
    this.renderer.dispose();
    this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points){o.geometry.dispose();}});
  }
}
