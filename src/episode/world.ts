import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DOCUMENTS, type Save } from './data';
import { art } from './props';
import { chapterAsset } from './release';
import { createWeather } from './weather';

export interface Collider { minX: number; maxX: number; minZ: number; maxZ: number; bottom: number; top: number; disabled?: () => boolean; touches?: (x:number,z:number,radius:number)=>boolean; }
export interface Target {
  id: string; kind: 'item' | 'document' | 'door' | 'furniture' | 'switch' | 'inspect';
  title: [string, string]; root: T.Object3D; key?: string; open?: boolean; unlocked?: boolean;
  home?: T.Vector3; move?: T.Vector3; progress?: number; pivot?: T.Object3D; angle?: number; blockedBy?: string;
}
export const PLAYER_MODELS=['gear-flashlight','gear-brass-key','player-hand-open','player-hand-grip','player-boot','player-trouser','player-sleeve','player-torso'] as const;
export type PlayerModelId=typeof PLAYER_MODELS[number];
export interface House { targets: Target[]; colliders: Collider[]; roots: T.Object3D[]; dust: T.Points; lamp: T.PointLight; hatch: Target; glow: T.PointLight; weather:ReturnType<typeof createWeather>; model:(id:PlayerModelId)=>T.Group; }
export async function createHouse(scene: T.Scene, save: Save, progress: (n: number) => void): Promise<House> {
  const roots: T.Object3D[] = []; const targets: Target[] = []; const colliders: Collider[] = [];
  const loader = new T.TextureLoader();
  const load = async (name: string) => {
    const tex = await loader.loadAsync(chapterAsset(`textures/${name}`));
    tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.anisotropy = 8; return tex;
  };
  const names=['wood-color','wood-normal','wood-rough','plaster-diff','plaster-nor_gl','plaster-rough','linen-diff','linen-nor_gl','mud-diff','mud-nor_gl'];
  let done=0;
  const modelNames=['old-chair','writing-desk','hall-wardrobe','paper-note','canvas-satchel','yard-bench','yard-fir','yard-pine','wood-crate','workshop-exterior','coopers-barrel',...PLAYER_MODELS] as const;
  const gltf=new GLTFLoader();
  const mark=()=>progress(++done/(names.length+modelNames.length+1));
  const [maps,models] = await Promise.all([
    Promise.all(names.map(async f=>{const texture=await load(f+'.jpg');mark();return texture;})),
    Promise.all(modelNames.map(async name=>{const dir=name==='coopers-barrel'?'':'chapter1/';const asset=await gltf.loadAsync(chapterAsset(`assets/${dir}${name}.glb`));mark();return asset.scene;})),
  ]);
  for(const i of [0,3,6,8])maps[i].colorSpace=T.SRGBColorSpace;
  maps[8].repeat.set(44,44);maps[9].repeat.set(44,44);
  maps.slice(0,3).forEach(t=>t.repeat.set(2,4));
  const timberMaps = maps.map(t => { const c = t.clone(); c.repeat.set(.4, 1.8); return c; });
  const wood = new T.MeshStandardMaterial({ color: 0x827361, map: timberMaps[0], normalMap: timberMaps[1], roughnessMap: timberMaps[2], roughness: .95, normalScale: new T.Vector2(.45, .45) });
  const dark = wood.clone(); dark.color.set(0x493c30);
  const floor = new T.MeshStandardMaterial({ color: 0x908375, map: maps[0], normalMap: maps[1], roughnessMap: maps[2], normalScale: new T.Vector2(.6, .6), roughness: .98 });
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#777969'; ctx.fillRect(0, 0, 512, 512);
  let seed = 73; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 17000; i++) { const v = Math.floor(55 + rnd() * 100); ctx.fillStyle = `rgba(${v},${v},${v-10},${rnd()*.2})`; ctx.fillRect(rnd()*512,rnd()*512,rnd()*5, rnd()*5); }
  for (let i = 0; i < 40; i++) { ctx.strokeStyle = '#41433855'; ctx.beginPath(); let x = rnd()*512, y = rnd()*512; ctx.moveTo(x,y); for(let j=0;j<7;j++){ x+=(rnd()-.5)*15;y+=rnd()*15;ctx.lineTo(x,y);}ctx.stroke(); }
  const plasterTex = new T.CanvasTexture(canvas); plasterTex.wrapS = plasterTex.wrapT = T.RepeatWrapping; plasterTex.colorSpace = T.SRGBColorSpace;
  const plaster = new T.MeshStandardMaterial({ map:maps[3],normalMap:maps[4],normalScale:new T.Vector2(.58,.58),roughnessMap:maps[5],roughness:1,color:0x9c9b84 });
  const metal = new T.MeshStandardMaterial({ color: 0x555650, metalness: .7, roughness: .66 });
  const brass = new T.MeshStandardMaterial({ color: 0xb79555, metalness: .8, roughness: .34 });
  const black = new T.MeshStandardMaterial({ color: 0x151915, roughness: .88 });
  const fabric = new T.MeshStandardMaterial({ color:0x9d8b73,map:maps[6],normalMap:maps[7],normalScale:new T.Vector2(.52,.52),roughness:1,bumpMap:plasterTex,bumpScale:.012 });
  const ceramic = new T.MeshStandardMaterial({ color: 0x9caaa0, roughness: .48 });
  const model=(id:typeof modelNames[number])=>models[modelNames.indexOf(id)].clone(true);
  for(const root of models)root.traverse(o=>{
    if(!(o instanceof T.Mesh))return;
    o.castShadow=o.receiveShadow=true;
    if(!(o.material instanceof T.MeshStandardMaterial))return;
    if(/Heavy blue linen/i.test(o.material.name))o.material.color.setRGB(.24,.31,.38);
    if(/Waxed field jacket/i.test(o.material.name))o.material.color.multiplyScalar(.78);
    if(/Smoked oak|Exposed oak edges|Faded paint/.test(o.material.name)){
      o.material.map=wood.map;o.material.normalMap=wood.normalMap;o.material.roughnessMap=wood.roughnessMap;
      o.material.normalScale.set(.38,.38);o.material.color.lerp(new T.Color(0xd9c3a0),.35);
    }
    if(/Waxed canvas/.test(o.material.name)){
      o.material.map=fabric.map;o.material.normalMap=fabric.normalMap;o.material.normalScale.set(.48,.48);
      o.material.color.lerp(new T.Color(0xafa085),.33);
    }
  });
  function box(parent: T.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, mat: T.Material = wood) {
    const geo=new T.BoxGeometry(w,h,d);
    if(mat===plaster){const uv=geo.attributes.uv;const dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
      for(let i=0;i<uv.count;i++){const [u,v]=dims[Math.floor(i/4)];uv.setXY(i,uv.getX(i)*u*.63+(x+z)*.19,uv.getY(i)*v*.63+y*.12);}
    }
    const m = new T.Mesh(geo, mat); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function cylinder(parent: T.Object3D, x: number, y: number, z: number, r: number, h: number, mat: T.Material = metal, r2 = r) {
    const m = new T.Mesh(new T.CylinderGeometry(r, r2, h, 18), mat); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function group(x=0,y=0,z=0) { const g = new T.Group(); g.position.set(x,y,z); scene.add(g); roots.push(g); return g; }
  function collider(x: number,z: number,w: number,d: number,bottom=0,top=3, disabled?:()=>boolean) { colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,bottom,top,disabled}); }
  function wall(x: number,y: number,z: number,w: number,h: number,d: number, mat=plaster) { box(scene,x,y,z,w,h,d,mat); collider(x,z,w,d,y-h/2,y+h/2); }
  function label(parent:T.Object3D, content:string, x:number,y:number,z:number,w=.6,h=.3) {
    const c=document.createElement('canvas');c.width=512;c.height=256;const c2=c.getContext('2d')!;c2.fillStyle='#c4b891';c2.fillRect(0,0,512,256);c2.fillStyle='#333328';c2.font='30px Georgia';c2.textAlign='center';content.split('\n').forEach((line,i)=>c2.fillText(line,256,80+i*42));
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
    const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map:texture,roughness:1,side:T.DoubleSide}));m.position.set(x,y,z);parent.add(m);return m;
  }
  function register(target:Target) { targets.push(target); target.root.traverse(o=>{o.userData.target=target.id;}); return target; }
  function table(x:number,y:number,z:number, w=1.8,d=.85) {
    const g=group(x,y,z),desk=model('writing-desk');desk.scale.set(w/1.62,1,d/.85);g.add(desk);
    collider(x,z,w,d,y,y+.9);return g;
  }
  function chair(x:number,y:number,z:number, rot=0,movable=false,id='chair') {
    const g=group(x,y,z);g.rotation.y=rot;const mesh=model('old-chair');mesh.rotation.y=Math.PI;g.add(mesh);
    if(movable){const t=register({id,kind:'furniture',title:['Стул','Chair'],root:g,home:g.position.clone(),move:new T.Vector3(.95,0,.35)});colliders.push({get minX(){return g.position.x-.32},get maxX(){return g.position.x+.32},get minZ(){return g.position.z-.32},get maxZ(){return g.position.z+.32},bottom:y,top:y+1.3});if(save.moved.includes(id)){g.position.add(t.move!);t.progress=1;}}
    return g;
  }
  function cabinet(x:number,y:number,z:number,id:string,rot=0,movable=true) {
    const g=group(x,y,z);g.rotation.y=rot;g.add(model('hall-wardrobe'));
    const t=register({id,kind:'furniture',title:['Шкаф','Wardrobe'],root:g,home:g.position.clone(),move:new T.Vector3(1.9,0,0),progress:0});
    colliders.push({get minX(){return g.position.x-.83},get maxX(){return g.position.x+.83},get minZ(){return g.position.z-.45},get maxZ(){return g.position.z+.45},bottom:y,top:y+2.3});
    if(save.moved.includes(id)){g.position.add(t.move!);t.progress=1;}if(!movable)t.kind='inspect';return g;
  }
  function storyPaper(id:string,x:number,y:number,z:number) {
    const g=group(x,y,z);const page=model('paper-note');page.rotation.y=.13;page.scale.set(1.16,1,1.13);g.add(page);
    if(id!=='atticNote'&&DOCUMENTS[id]){
      const {title,body}=DOCUMENTS[id];
      const map=art(384,528,c=>{
        const base=c.createRadialGradient(188,210,58,193,265,315);base.addColorStop(0,'#dbd0af');base.addColorStop(.8,'#cbb991');base.addColorStop(1,'#8d7452');
        c.fillStyle=base;c.fillRect(0,0,384,528);
        for(let i=0;i<4400;i++){c.fillStyle=i%3?'#6f593212':'#fff5d028';c.fillRect((i*191)%384,(i*i*53)%528,1+i%4,1);}
        c.fillStyle='#26343b';c.font='italic 23px Georgia';c.fillText(title[0],35,59,316);
        c.strokeStyle='#9a785b77';c.beginPath();c.moveTo(34,75);c.lineTo(346,75);c.stroke();
        c.font='15px Georgia';let line='',offset=107;
        for(const w of body[0].split(/\s+/)){if(c.measureText(line+' '+w).width>306){c.fillText(line,37,offset);offset+=22;line=w;}else line+=(line?' ':'')+w;if(offset>441)break;}
        if(offset<=441)c.fillText(line,37,offset);
        c.fillStyle='#625043a0';c.fillRect(0,290,384,1);
      });
      map.flipY=false;const material=new T.MeshStandardMaterial({map,roughness:.95,side:T.DoubleSide});
      page.traverse(o=>{if(o instanceof T.Mesh)o.material=material;});
    }
    register({id,kind:'document',title:['Документ','Document'],root:g});return g;
  }
  function key(id:string,x:number,y:number,z:number,title:[string,string],blockedBy?:string) {
    const g=group(x,y,z);g.rotation.y=.66;
    const prop=model('gear-brass-key');prop.rotation.x=-Math.PI/2;prop.scale.setScalar(1.25);g.add(prop);
    // A tight invisible target around the small prop keeps aiming possible at normal play distance.
    const hit=new T.Mesh(new T.BoxGeometry(.137,.035,.187),new T.MeshBasicMaterial({visible:false}));
    hit.position.z=.014;g.add(hit);
    register({id,kind:'item',title,root:g,blockedBy});g.visible=!save.items.includes(id);return g;
  }
  function bottle(x:number,y:number,z:number) {const g=group(x,y,z);cylinder(g,0,.14,0,.065,.25,ceramic);cylinder(g,0,.3,0,.025,.1,metal);return g;}
  function door(id:string,x:number,z:number,side:number,keyId?:string,exit=false) {
    const g=group(x,0,z);g.rotation.y=side;
    for(const a of [-1,1])box(g,a*.77,1.28,0,.13,2.56,.25,dark);box(g,0,2.52,0,1.66,.15,.25,dark);
    const pivot=new T.Group();pivot.position.set(-.7,0,0);pivot.userData.openAngle=x>0?-1.65:1.65;g.add(pivot);box(pivot,.7,1.2,0,1.4,2.4,.095,dark);
    for(const y of [.55,1.7])box(pivot,.7,y,.055,1.13,.78,.025);
    cylinder(pivot,1.22,1.04,.1,.035,.14,brass).rotation.x=Math.PI/2;box(pivot,1.15,1.04,.16,.18,.025,.035,brass);
    const t=register({id,kind:'door',title:exit?['Входная дверь','Front door']:['Дверь','Door'],root:g,key:keyId,pivot,open:save.doors.includes(id),unlocked:!keyId||save.flags.includes(`unlock:${id}`),angle:0});
    // The rotating leaf keeps a thin oriented collider, even after it clears the doorway.
    const pivotX=x-.7*Math.cos(side),pivotZ=z+.7*Math.sin(side);
    colliders.push({minX:x-2,maxX:x+2,minZ:z-2,maxZ:z+2,bottom:0,top:2.4,
      touches:(px,pz,radius)=>{
        const a=side+(t.angle||0),dx=px-pivotX,dz=pz-pivotZ;
        const u=Math.cos(a)*dx-Math.sin(a)*dz,v=Math.sin(a)*dx+Math.cos(a)*dz;
        return Math.hypot(u-T.MathUtils.clamp(u,0,1.4),v-T.MathUtils.clamp(v,-.055,.055))<radius;
      }});
    return t;
  }
  // Attic: actual floor opening and a walkable, continuous staircase down to the landing.
  box(scene,-2,3.51,0,8,.18,10,floor);box(scene,5,3.51,0,2,.18,10,floor);box(scene,3,3.51,2,2,.18,6,floor);box(scene,3,3.51,-4.5,2,.18,1,floor);
  wall(-6,5.2,0,.2,3.4,10,wood);wall(6,5.2,0,.2,3.4,10,wood);wall(0,5.1,5,12,3,.2,wood);
  // Front gable divided around its moonlit window.
  wall(-3.65,5.3,-5,4.7,3.6,.2,wood);wall(3.65,5.3,-5,4.7,3.6,.2,wood);box(scene,0,3.95,-5,2.6,.7,.2,wood);box(scene,0,7.1,-5,2.6,1.8,.2,wood);
  const glass=new T.MeshPhysicalMaterial({color:0xb3ccce,transparent:true,opacity:.085,roughness:.2,metalness:.15,depthWrite:false});const pane=box(scene,0,5.5,-4.94,2.4,2.25,.015,glass);pane.castShadow=false;
  for(const x of [-1.25,0,1.25])box(scene,x,5.5,-4.96,.055,2.4,.08,dark);box(scene,0,5.5,-4.95,2.6,.06,.1,dark);
  for(const a of [-1,1]){const roof=box(scene,a*3,6.7,0,6.8,.15,10.4,dark);roof.rotation.z=-a*.4;}
  for(let z=-4.8;z<=5;z+=1.6){for(const a of [-1,1]){const beam=box(scene,a*2.8,6.58,z,6.5,.23,.23);beam.rotation.z=-a*.4;}box(scene,0,5.94,z,11.8,.23,.23,dark);}
  for(const x of [-5.2,5.2])for(const z of [-3,2.8]){box(scene,x,4.8,z,.2,2.4,.2,dark);}
  const hatchRoot=group(2,3.6,-1);const hatchPivot=new T.Group();hatchRoot.add(hatchPivot);box(hatchPivot,1,-.01,-1.5,1.95,.12,3,wood);box(hatchPivot,1,.07,-.4,.25,.03,.14,metal);
  const hatch=register({id:'hatch',kind:'door',title:['Люк чердака','Attic hatch'],root:hatchRoot,key:'hatchKey',pivot:hatchPivot,open:save.doors.includes('hatch'),unlocked:save.flags.includes('unlock:hatch'),angle:0});
  // The hatch lid is a real floor while shut; staircase becomes the floor when open.
  for(let i=0;i<18;i++){const z=-1-i/3;const y=3.6-i*.2;box(scene,3,y-.12,z,1.9,.2,.35,dark);}
  wall(1.97,1.6,-4,.1,3.2,6,wood);wall(4.03,1.6,-4,.1,3.2,6,wood);
  table(0,3.6,-3.8,2.6,1);storyPaper('atticNote',-.7,4.51,-3.7);
  const tin=group(.65,4.51,-3.75);box(tin,0,.04,0,.5,.08,.3,metal);key('hatchKey',.66,4.61,-3.7,['Ключ от люка','Hatch key']);
  const flashlight=group(-.05,4.56,-3.62),flashlightMesh=model('gear-flashlight');flashlightMesh.rotation.y=-.24;flashlight.add(flashlightMesh);
  register({id:'flashlight',kind:'item',title:['Фонарь','Flashlight'],root:flashlight});flashlight.visible=!save.items.includes('flashlight');
  const knife=group(.5,3.65,1.2);box(knife,0,0,0,.055,.025,.15,dark);const blade=box(knife,0,0,-.19,.06,.012,.24,metal);blade.rotation.y=.08;
  register({id:'knife',kind:'item',title:['Нож','Knife'],root:knife});knife.visible=!save.items.includes('knife');
  const boundChair=chair(0,3.6,2.9,Math.PI);boundChair.name='bound-chair';collider(0,2.9,.65,.65,3.6,4.9);
  const bag=model('canvas-satchel');bag.position.set(1.37,3.61,1.82);bag.rotation.y=-.64;scene.add(bag);register({id:'bag',kind:'item',title:['Сумка Алексея','Alexei’s bag'],root:bag});bag.visible=!save.items.includes('bag');
  // Rope coils on the chair and a fallen packing cloth.
  const rope=new T.MeshStandardMaterial({color:0x927951,roughness:1});for(let y=4.1;y<4.5;y+=.085){const r=new T.Mesh(new T.TorusGeometry(.35,.02,7,32),rope);r.rotation.x=Math.PI/2;r.position.set(0,y,2.9);scene.add(r);r.name='rope';if(save.flags.includes('free'))r.visible=false;}
  function crate(x:number,y:number,z:number,w:number,h:number,d:number,rot=0,stamp=false){
    const g=group(x,y,z);g.rotation.y=rot;
    const crateModel=model('wood-crate');crateModel.scale.set(w/.85,h/.48,d/.63);g.add(crateModel);
    if(stamp)label(g,'СОКОЛОВ',0,h*.59,d/2+.008,w*.36,h*.19);
    collider(x,z,w+.13,d+.13,y,y+h);
    return g;
  }
  crate(-4.98,3.6,-3.67,.91,.52,.66,.10,true);crate(-5.05,4.12,-3.67,.68,.37,.53,-.08);
  crate(-4.75,3.6,-2.76,.81,.48,.62,-.19);crate(-4.7,3.6,3.85,1.06,.57,.7,.13,true);
  crate(-3.65,3.6,4.12,.56,.36,.49,-.24);
  const barrel=(x:number,y:number,z:number,size=1,rot=0)=>{
    const g=model('coopers-barrel');g.position.set(x,y,z);g.scale.setScalar(size);g.rotation.y=rot;
    g.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(g);collider(x,z,.74*size,.74*size,y,y+.89*size);
  };
  barrel(-4.98,3.6,-.9,1,.4);
  const covered=group(4.8,3.6,2);box(covered,0,.55,0,1.2,1.1,1.6,fabric);box(covered,0,1.12,0,1.25,.07,1.65,fabric);
  collider(4.8,2,1.45,1.85,3.6,4.78);
  const clothGeo=new T.PlaneGeometry(1.85,2.25,32,32);clothGeo.rotateX(-Math.PI/2);const clothPos=clothGeo.attributes.position;for(let i=0;i<clothPos.count;i++){const x=clothPos.getX(i),z=clothPos.getZ(i);const drape=Math.max(0,Math.abs(x)-.55,Math.abs(z)-.78);clothPos.setY(i,1.18-drape*1.7+Math.sin(x*24+z*5)*.018+Math.sin(z*19)*.012);}clothGeo.computeVertexNormals();const clothMaterial=fabric.clone();clothMaterial.side=T.DoubleSide;const cloth=new T.Mesh(clothGeo,clothMaterial);cloth.castShadow=cloth.receiveShadow=true;covered.add(cloth);
  // Lower floor: central hall and eight distinct furnished rooms.
  box(scene,0,-.13,-21,14,.25,31,floor);box(scene,0,2.96,-22,14,.12,28,plaster);
  wall(-7,1.45,-21,.18,3,31);wall(7,1.45,-19,.18,3,26.5);wall(7,1.45,-35,.18,3,2.5);box(scene,7,2.7,-33,.18,.5,1.5);wall(0,1.45,-36,14,3,.18);wall(-2,1.45,-5.7,8,3,.18);wall(5,1.45,-5.7,2,3,.18);
  // Lower landing joins the staircase; no wall across the stair exit.
  for(let row=0;row<4;row++){
    const z=-15-row*6;
    for(const s of [-1,1]){
      for(const off of [-1.9,1.9])wall(s*1.45,1.45,z+off,.16,3,2.2);
      box(scene,s*1.45,2.73,z,.16,.48,1.6);
      const index=2+row*2+(s===1?1:0);
      door(`door${index}`,s*1.45,z,Math.PI/2,index===3?'studyKey':index===4?'bedroomKey':index===5?'veraKey':undefined);
      const plaque=group(s*1.55,2.13,z+.72);plaque.rotation.y=s===1?-Math.PI/2:Math.PI/2;label(plaque,`${String(index+1).padStart(2,'0')}`,0,0,0,.27,.16);
    }
  }
  for(const z of [-12,-18,-24,-30])for(const s of [-1,1])wall(s*4.25,1.45,z,5.5,3,.14);
  // Trim, ceiling beams, cracked skirting and wall lamps.
  for(const x of [-6.85,6.85,-1.55,1.55])box(scene,x,.13,-24,.08,.22,24,dark);
  for(let z=-13;z>-35;z-=5.5){box(scene,0,2.75,z,2.8,.18,.18,dark);const g=group(-1.25,1.9,z);box(g,0,0,0,.12,.3,.15,metal);box(g,.08,0,0,.15,.22,.18,new T.MeshStandardMaterial({color:0xd1a068,emissive:0xba753b,emissiveIntensity:.3}));}
  cabinet(-4.8,0,-17.4,'storeCabinet');storyPaper('storeNote',-3.4,.93,-13.5);table(-3.5,0,-13.5,1.6);key('studyKey',-4.8,.18,-17.35,['Ключ от кабинета','Study key'],'storeCabinet');
  barrel(-6.3,0,-12.88,1.09,.8);barrel(-6.35,0,-14.12,.91,2.2);barrel(-5.43,0,-12.73,.79,4.2);crate(-6.13,0,-15.2,.75,.43,.63,.14);
  table(4.7,0,-16.6,2.3,1.1);chair(4.6,0,-15.45,.2,true,'studyChair');storyPaper('fatherNote',4.1,.94,-16.4);key('bedroomKey',5.3,.94,-16.45,['Ключ от спальни','Bedroom key']);
  const spineMats=[0x3f594e,0x553f3a,0x566057,0x625441,0x415566].map(color=>new T.MeshStandardMaterial({color,roughness:.92}));
  const shelf=group(6.49,0,-15.1);shelf.rotation.y=-Math.PI/2;
  for(const x of [-.65,.65])box(shelf,x,.99,0,.065,1.99,.36,dark);
  for(let i=0;i<4;i++){
    box(shelf,0,.2+i*.51,0,1.35,.069,.36,wood);
    for(let j=0;j<(i%2?5:8);j++){const h=.19+rnd()*.18;box(shelf,-.55+j*.125,.238+i*.51+h/2,.024,.09,h,.245,spineMats[(i+j)%5]).rotation.z=(rnd()-.5)*.09;}
  }
  collider(6.49,-15.1,.42,1.4,0,2);
  cabinet(6.1,0,-13.1,'studyWardrobe',0,false);label(scene,'СОКОЛОВ\nСЕКТОР 01',5.3,1.8,-17.9,.8,.5);
  const bed=group(-4.5,0,-21.5);box(bed,0,.38,0,2,.4,2.7,dark);box(bed,0,.67,0,1.95,.2,2.6,fabric);box(bed,0,.88,-.95,1.45,.18,.45,ceramic);box(bed,0,.6,-1.4,2.1,1.2,.12,dark);collider(-4.5,-21.5,2.1,2.9,0,.85);
  table(-2.6,0,-19,1,.65);storyPaper('bedroomNote',-2.8,.94,-19);key('veraKey',-2.4,.95,-19,['Ключ с красной лентой','Red-ribbon key']);
  const smallBed=group(5.7,0,-21.2);box(smallBed,0,.4,0,1.3,.35,2.4,wood);box(smallBed,0,.65,0,1.25,.2,2.3,fabric);box(smallBed,0,.8,-.8,.8,.16,.4,ceramic);collider(5.7,-21.2,1.4,2.5,0,.8);
  table(3.2,0,-22.8,1.8);storyPaper('veraNote',2.9,.94,-22.7);key('exitKey',3.65,.95,-22.65,['Ключ от входной двери','Front door key']);
  const music=group(3.7,.94,-23);box(music,0,.08,0,.35,.16,.23,dark);box(music,0,.2,-.1,.35,.23,.025,wood);
  for(let i=0;i<6;i++){const p=label(scene,'ДОМ\n100 ДВЕРЕЙ',2+i*.67,1.5+(i%2)*.4,-23.88,.44,.5);p.rotation.z=(rnd()-.5)*.13;}
  // Bathroom with porcelain fixtures, medicine tray and a visibly modelled syringe.
  box(scene,-4.7,.55,-28.9,2,.85,.85,ceramic);box(scene,-4.7,.96,-28.9,1.6,.05,.55,black);cylinder(scene,-5.3,1.13,-28.9,.025,.3,metal);
  collider(-4.7,-28.9,2,.9,0,1.05);
  table(-2.6,0,-28.7,1.4);storyPaper('bathNote',-2.8,.94,-28.7);const fuse=group(-2.25,.96,-28.65);cylinder(fuse,0,0,0,.035,.16,ceramic).rotation.z=Math.PI/2;register({id:'fuse',kind:'item',title:['Предохранитель 10 А','10 A fuse'],root:fuse});fuse.visible=!save.items.includes('fuse');
  const syringe=group(-2.65,.95,-28.45);cylinder(syringe,0,0,0,.015,.15,ceramic).rotation.z=Math.PI/2;box(syringe,.13,0,0,.13,.004,.004,metal);register({id:'syringe',kind:'inspect',title:['Старый шприц — лучше не трогать','An old syringe — leave it alone'],root:syringe});
  for(let i=0;i<5;i++)bottle(-6.5+i*.25,.95,-28.9);
  // Kitchen counters and fuse box.
  for(let i=0;i<4;i++){const z=-25-i*.75;box(scene,6.25,.45,z,1.2,.9,.62,wood);box(scene,6.25,.94,z,1.3,.1,.65,ceramic);collider(6.25,z,1.3,.7,0,1.02);}
  for(const a of [-1,1])for(const b of [-1,1]){const ring=new T.Mesh(new T.TorusGeometry(.13,.018,8,24),black);ring.rotation.x=Math.PI/2;ring.position.set(6.25+a*.27,1.01,-25.1+b*.17);scene.add(ring);}
  table(3.6,0,-28.6);storyPaper('kitchenNote',3.5,.94,-28.6);chair(3.6,0,-27.7,0,true,'kitchenChair');
  const panel=group(6.78,1.5,-28.6);panel.rotation.y=-Math.PI/2;box(panel,0,0,0,.5,.65,.12,metal);label(panel,'10 A\nПИТАНИЕ',0,0,.08,.4,.45);register({id:'power',kind:'switch',title:['Электрощиток','Fuse box'],root:panel});
  // Dining room and security console behind a heavy wardrobe.
  table(-4.4,0,-32.5,2.3,1.25);for(const x of [-5.2,-3.6])chair(x,0,-31.5,0,true,`diningChair${x}`);
  for(let i=0;i<3;i++){const plate=cylinder(scene,-5.1+i*.6,.95,-32.5,.19,.025,ceramic);plate.rotation.y=rnd();}
  cabinet(-5.25,0,-35.4,'alarmCabinet');const alarm=group(-5.25,1.3,-35.85);box(alarm,0,0,0,.45,.55,.12,metal);label(alarm,'БЛОКИРОВКА\nСЕКТОР 01',0,0,.08,.4,.4);register({id:'alarm',kind:'switch',title:['Пульт сигнализации','Alarm control'],root:alarm,blockedBy:'alarmCabinet'});
  // Entrance hall; external doorway is a chapter boundary, not a fake continuation.
  cabinet(5.8,0,-35.4,'hallWardrobe',0,false);table(3.2,0,-35.3,1.5,.6);bottle(3.3,.95,-35.3);
  const exit=door('exit',6.85,-33,Math.PI/2,'exitKey',true);exit.title=['Выход из дома','Leave the house'];
  // Cut the outer-wall collider around the exit; replace the original continuous east wall collision.
  const weather=createWeather(scene,maps.slice(8,10),{workshop:model('workshop-exterior'),bench:model('yard-bench'),fir:model('yard-fir'),pine:model('yard-pine')});
  const lamp=new T.PointLight(0xffb36a,14,11,1.8);lamp.position.set(-2,5.3,0);scene.add(lamp);
  const moon=new T.SpotLight(0xa6cadb,160,24,.62,.55,1.3);moon.position.set(0,6,-4.7);moon.target.position.set(-1,3.6,3);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);moon.shadow.bias=-.0003;moon.shadow.normalBias=.025;scene.add(moon,moon.target);
  const moonFill=new T.PointLight(0x688b9d,10,11,1.6);moonFill.position.set(0,5.4,-3);scene.add(moonFill);
  for(let i=0;i<4;i++){const light=new T.PointLight(i%2?0x73939a:0xc79a64,6,11,1.8);light.position.set(0,2.2,-14-i*6);scene.add(light);}
  const glow=new T.PointLight(0xe2b279,0,15,1.7);glow.position.set(4,2,-27);scene.add(glow);
  // Dust motes: one GPU draw call; time animation updates only the point cloud transform.
  const positions=new Float32Array(1500);for(let i=0;i<500;i++){positions[i*3]=(rnd()-.5)*11;positions[i*3+1]=3.8+rnd()*2.8;positions[i*3+2]=(rnd()-.5)*9;}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
  const dustCanvas=globalThis.document.createElement('canvas');dustCanvas.width=dustCanvas.height=32;const dc=dustCanvas.getContext('2d')!;const dg=dc.createRadialGradient(16,16,0,16,16,16);dg.addColorStop(0,'#ffffff');dg.addColorStop(.3,'#ffffff77');dg.addColorStop(1,'#ffffff00');dc.fillStyle=dg;dc.fillRect(0,0,32,32);
  const dust=new T.Points(geometry,new T.PointsMaterial({color:0xe4d3b2,map:new T.CanvasTexture(dustCanvas),size:.012,transparent:true,opacity:.22,depthWrite:false}));scene.add(dust);
  for(const t of targets){if(t.kind==='door'&&t.open&&t.pivot){t.angle=t.id==='hatch'?Math.PI:Number(t.pivot.userData.openAngle);if(t.id==='hatch')t.pivot.rotation.x=t.angle;else t.pivot.rotation.y=t.angle;}}
  // Batch only static architectural meshes, by material and room. Targets, moving furniture,
  // transparent glass and authored props retain independent transforms and raycast IDs.
  const batches=new Map<string,T.Mesh<T.BufferGeometry,T.Material>[]>();
  for(const o of [...scene.children]){
    if(!(o instanceof T.Mesh)||Array.isArray(o.material)||o.material.transparent||!o.castShadow||o.name||o.userData.target)continue;
    if(!(o.geometry instanceof T.BoxGeometry))continue;
    const key=`${o.material.id}:${o.position.y>3?'attic':Math.floor((-o.position.z-5)/6)}`;
    if(!batches.has(key))batches.set(key,[]);batches.get(key)!.push(o);
  }
  for(const batch of batches.values()){
    if(batch.length<3)continue;
    const gs=batch.map(o=>{o.updateMatrix();return o.geometry.clone().applyMatrix4(o.matrix);});
    const combined=mergeGeometries(gs,false);gs.forEach(g=>g.dispose());
    if(!combined)continue;
    const mesh=new T.Mesh(combined,batch[0].material);mesh.castShadow=mesh.receiveShadow=true;
    scene.add(mesh);for(const o of batch){o.geometry.dispose();o.removeFromParent();}
  }
  progress(1);return {targets,colliders,roots,dust,lamp,hatch,glow,weather,model};
}
