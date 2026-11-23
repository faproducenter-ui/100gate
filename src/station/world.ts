import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {loadWalk,type WalkGrid,type WalkInfo} from './walk';
import type {Settings} from '../iso/contracts';
import {FpRig} from '../iso/fps';
import {AnalogPass} from '../iso/analog';
import {fireFlicker} from '../iso/flame';
import {byteFraction,paintOpportunity,type LoadingController} from '../boot/loading';

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
/** gap: the doorway cut through the baked walk grid while open (Blender x0,x1,y0,y1); the bake saw the shut leaf as wall. */
export const DOORS:Record<string,{leaves:string[];angle:number[];label:string;locked?:string;gap?:number[];/** the leaf was exported ajar: turned by this much it is shut */rest?:number}>={
  shop:{leaves:['Door_L','Door_R'],angle:[1.55,-1.55],label:'Решётчатая дверь',locked:'shopKey'},
  motel1:{leaves:['Motel_Door1_Leaf'],angle:[1.45],label:'Дверь номера 1',gap:[19.35,20.25,-20.3,-19.3]},
  motel2:{leaves:['Motel_Door2_Leaf'],angle:[1.45],label:'Дверь номера 2',locked:'code',gap:[19.35,20.25,-16.5,-15.5]},
  motel3:{leaves:['Motel_Door3_Leaf'],angle:[1.45],label:'Дверь номера 3',gap:[19.35,20.25,-12.7,-11.7]},
  shed:{leaves:['ShedA_ShedDoor_Leaf'],angle:[-1.5],rest:.95,gap:[-22.42,-21.98,10.8,11.62],label:'Дверь сарая',locked:'shedKey'},
  gate:{leaves:['Gate_L','Gate_R'],angle:[1.4,-1.4],label:'Ворота',locked:'gateKey'},
};
export type DoorId=keyof typeof DOORS;

function rng(seed:number){return ()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};}

export class StationWorld{
  readonly renderer:T.WebGLRenderer;
  readonly scene=new T.Scene();
  /** The same first-person rig as inside the administration: the hero's arms, the torch in the hand, head bob and breathing. */
  readonly fps:FpRig;
  get camera(){return this.fps.camera;}
  /** the camcorder's picture: low resolution, grain, scan lines (as indoors) */
  private readonly analog=new AnalogPass();
  /** the torch's fire (follows the flame of the torch in the hand) */
  private readonly fire=new T.PointLight(0xff9a40,0,14,1.5);
  private readonly lights:{light:T.Light;base:number;flicker?:number[];phase:number}[]=[];
  private readonly flickerMats:{mat:T.MeshStandardMaterial;base:number;src?:number}[]=[];
  private readonly screenMats:T.MeshStandardMaterial[]=[];
  private readonly doorNodes=new Map<string,{node:T.Object3D;base:T.Quaternion}>();
  readonly doorOpen:Record<string,number>={};
  readonly doorWant:Record<string,number>={};
  private readonly pineChunks:T.InstancedMesh[]=[];
  private time=0;
  private width=0;private height=0;

  private constructor(canvas:HTMLCanvasElement,readonly data:StationData,readonly walk:WalkGrid,gltf:T.Object3D,viewmodel?:{scene:T.Object3D;animations:T.AnimationClip[]}){
    this.fps=new FpRig(this.scene,viewmodel);
    this.fps.camera.far=420;this.fps.camera.updateProjectionMatrix();
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.35;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.scene.background=new T.Color(0x04070e);
    this.scene.fog=new T.FogExp2(0x060a12,.011);
    this.fire.castShadow=false;this.scene.add(this.fire);
    this.analog.setExposure(1.9);   // the renderer's own exposure (1.35) does not reach a render target; the analog pass tone-maps instead
    this.buildWorld(gltf);
    this.buildLights();
    this.buildSky();
  }

  /** Each step reports to the loading controller as the task of the same id (see the plan in StationPage). */
  static async create(canvas:HTMLCanvasElement,boot:LoadingController){
    const base=import.meta.env.BASE_URL+ASSET_DIR;
    const data=await boot.track('data',async()=>{
      const res=await fetch(base+`station-${STATION_VERSION}.json`);
      if(!res.ok)throw Error(`station data: HTTP ${res.status}`);
      return await res.json() as StationData;
    });
    const draco=new DRACOLoader();draco.setDecoderPath(import.meta.env.BASE_URL+'assets/iso/draco/');
    const loader=new GLTFLoader();loader.setDRACOLoader(draco);loader.setMeshoptDecoder(MeshoptDecoder);
    try{
      const [gltf,walk,vm]=await Promise.all([
        boot.track('models',()=>loader.loadAsync(base+`station-${STATION_VERSION}.glb`,e=>boot.progress('models',byteFraction(e)*.97))),
        boot.track('walk',()=>loadWalk(base+data.walk.file,data.walk)),
        boot.track('viewmodel',()=>loader.loadAsync(base+'viewmodel-9.glb',e=>boot.progress('viewmodel',byteFraction(e)*.97))).catch(()=>undefined)]);
      return await boot.track('world',async()=>{await paintOpportunity();return new StationWorld(canvas,data,walk,gltf.scene,vm&&{scene:vm.scene,animations:vm.animations});});
    }finally{draco.dispose();}
  }
  /** Compile the shaders of the opening view before the first frame, so it does not stall or show half-built materials. */
  warmup(boot:LoadingController){return boot.track('shaders',()=>this.renderer.compileAsync(this.scene,this.camera));}

  /**
   * The motel's front had a second, solid siding wall laid over the one with the door openings (house_build.py, wall 'Wd'
   * built with its openings switched off), so every doorway was a wall: the room behind an open door looked black and the
   * player walked through siding. That box (x 19.75..19.85, the block's full 11.4 m) is dropped from the merged siding mesh.
   * Room 3's bake also left a one-cell line across the floor in line with the door; it is opened.
   */
  private openMotelDoorways(root:T.Object3D){
    const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
    root.traverse(o=>{
      if(!(o instanceof T.Mesh)||(o.name||o.parent?.name)!=='S_H_SidingB'||!o.geometry.index)return;
      const g=o.geometry,p=g.attributes.position as T.BufferAttribute,idx=g.index!,keep:number[]=[];
      for(let t=0;t<idx.count;t+=3){
        const i=[idx.getX(t),idx.getX(t+1),idx.getX(t+2)] as const;
        a.fromBufferAttribute(p,i[0]).applyMatrix4(o.matrixWorld);b.fromBufferAttribute(p,i[1]).applyMatrix4(o.matrixWorld);c.fromBufferAttribute(p,i[2]).applyMatrix4(o.matrixWorld);
        const stray=Math.min(a.x,b.x,c.x)>19.7&&Math.max(a.x,b.x,c.x)<19.9&&Math.max(a.z,b.z,c.z)-Math.min(a.z,b.z,c.z)>10;
        if(!stray)keep.push(...i);
      }
      if(keep.length<idx.count)g.setIndex(keep);
    });
    this.walk.openDoorway('motel3:floor',{x0:20.2,x1:21.85,y0:-12.32,y1:-12.08});
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
      if(d.rest)node?.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),d.rest));
      if(node)this.doorNodes.set(leaf,{node,base:node.quaternion.clone()});
    }
    root.updateMatrixWorld(true);   // the door rectangles are measured from world boxes
    for(const id of Object.keys(DOORS)){this.doorOpen[id]=0;this.doorWant[id]=0;this.setDoorBlocker(id,true);}
    // The shed's plank walls sit under its roof and are thinner than a grid cell, so the bake did not see them:
    // they are added here (corners from art/gas-station.blend, the shed is turned about 12 degrees), the doorway left open.
    const shed:[number,number][]=[[-22.26,10.66],[-22.3,10.2],[-19.95,9.8],[-19.65,11.8],[-21.95,12.2],[-22.06,11.76]];
    for(let i=0;i<shed.length-1;i++)this.walk.addWall('shedwall'+i,...shed[i]!,...shed[i+1]!,i===0||i===4?.06:.1);
    this.openMotelDoorways(root);
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
  private readonly kneelTmp=new T.PerspectiveCamera();

  private readonly doorRects=new Map<string,{x0:number;x1:number;y0:number;y1:number}>();
  private setDoorBlocker(id:string,closed:boolean){
    if(!closed){
      this.walk.blockers.delete(id);
      // the bake saw the closed leaf as wall: the open doorway is cut through it
      const r=this.doorRects.get(id);
      const gap=DOORS[id]!.gap;
      if(gap)this.walk.openDoorway(id,{x0:gap[0]!,x1:gap[1]!,y0:gap[2]!,y1:gap[3]!});
      else if(r)this.walk.openDoorway(id,{x0:r.x0-.06,x1:r.x1+.06,y0:r.y0-.06,y1:r.y1+.06});
      return;
    }
    this.walk.openings.delete(id);
    let r=this.doorRects.get(id);
    if(!r){
      const box=new T.Box3();
      for(const leaf of DOORS[id]!.leaves){const n=this.doorNodes.get(leaf)?.node;if(n)box.expandByObject(n);}
      if(box.isEmpty())return;
      // three box -> Blender ground rectangle, padded to the wall thickness (measured once, with the leaf shut)
      r={x0:box.min.x-.05,x1:box.max.x+.05,y0:-box.max.z-.12,y1:-box.min.z+.12};this.doorRects.set(id,r);
    }
    this.walk.blockers.set(id,r);
  }
  /** The leaf standing open is a thin obstacle where it now stands. */
  private setOpenLeafBlocker(id:string){
    const box=new T.Box3();
    for(const leaf of DOORS[id]!.leaves){const n=this.doorNodes.get(leaf)?.node;if(n){n.updateWorldMatrix(true,true);box.expandByObject(n);}}
    if(box.isEmpty())return;
    this.walk.blockers.set(id+':leaf',{x0:box.min.x-.03,x1:box.max.x+.03,y0:-box.max.z-.03,y1:-box.min.z+.03});
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
      if(next===1)this.setOpenLeafBlocker(id);else this.walk.blockers.delete(id+':leaf');
    }
  }
  /** World position of a named node (three coordinates). */
  nodePos(name:string){const n=this.scene.getObjectByName(name);return n?n.getWorldPosition(new T.Vector3()):undefined;}

  resize(w:number,h:number,settings:Settings){
    const cap=settings.quality==='low'?1:settings.quality==='medium'?1.5:2;
    this.renderer.setPixelRatio(Math.max(.55,Math.min(devicePixelRatio,cap)*settings.scale));
    if(w!==this.width||h!==this.height){this.width=w;this.height=h;this.renderer.setSize(w,h,false);this.fps.setAspect(w/h);this.analog.resize(w,h,settings.quality==='low'?360:480);}
    this.renderer.shadowMap.enabled=settings.shadows&&settings.quality!=='low';
  }

  /** One frame. x,y: Blender ground position; yaw as the station page keeps it (looking along (-sin yaw, cos yaw)). */
  render(f:{dt:number;time:number;x:number;y:number;floor:number;yaw:number;pitch:number;speed:number;sprint:boolean;crouch:number;
    torch:boolean;lit:boolean;charge:number;settings:Settings;/** 0..1: down on one knee over the opened bag (Tab), as indoors */kneel?:number}){
    this.time+=f.dt;
    this.animateDoors(f.dt);
    // the iso rig: yaw 0 faces three +Z; Blender (x,y) -> three (x,-y); its eye height is above the floor it stands on
    this.fps.update({x:f.x,z:-f.y,yaw:f.yaw+Math.PI,pitch:f.pitch,speed:f.speed,sprint:f.sprint,crouch:f.crouch,dt:f.dt,time:f.time,
      hasLight:f.torch,lightOn:f.lit,press:1,kick:1,bend:{x:0,y:f.floor,z:0}});
    const cam=this.camera;
    const kneel=f.kneel??0;
    if(kneel>.001){
      // the same pose as the administration's bag: the eye drops to knee height and looks at the floor just ahead
      const dir=cam.getWorldDirection(new T.Vector3());dir.y=0;if(dir.lengthSq()<1e-4)dir.set(0,0,-1);dir.normalize();
      const pos=new T.Vector3(cam.position.x,f.floor+.82,cam.position.z).addScaledVector(dir,.1);
      const look=pos.clone().addScaledVector(dir,.55).add(new T.Vector3(0,-.62,0)),e=kneel*kneel*(3-2*kneel);
      this.kneelTmp.position.copy(pos);this.kneelTmp.lookAt(look);
      cam.position.lerp(pos,e);cam.quaternion.slerp(this.kneelTmp.quaternion,e);
      cam.fov=T.MathUtils.lerp(cam.fov,62,e);cam.updateProjectionMatrix();cam.updateMatrixWorld(true);
    }
    this.sky.position.copy(cam.position);
    const flame=f.torch&&f.lit?this.fps.flamePose():undefined,flick=fireFlicker(this.time);
    this.fire.color.setHSL(.075+.012*(fireFlicker(this.time,3)-1),1,.6);
    if(flame){this.fire.position.copy(flame.position);this.fire.intensity=30*flame.level*flick;}else this.fire.intensity=0;
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
    // the camcorder's battery running down: noisier, then flickering, and dark at the end (as indoors)
    const low=T.MathUtils.clamp((24-f.charge)/24,0,1),dying=f.charge<=0?0:1-low*(.45*Math.max(0,Math.sin(this.time*13)*Math.sin(this.time*5.1+1)));
    this.analog.render(this.renderer,()=>{this.renderer.render(this.scene,cam);this.fps.vm.draw(this.renderer);},this.time,1+low*.9,dying,0);
  }
  /** F with the torch and the lighter: the hands light it; onFlame when it catches. */
  ignite(onFlame:()=>void){if(!this.fps.vm.ready||!this.fps.vm.startIgnite(onFlame))onFlame();}
  dispose(){
    this.fps.dispose();
    this.renderer.dispose();
    this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points){o.geometry.dispose();}});
  }
}
