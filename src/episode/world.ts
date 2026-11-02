import * as T from 'three';
import type { Save } from './data';

export interface Collider { minX: number; maxX: number; minZ: number; maxZ: number; bottom: number; top: number; disabled?: () => boolean; }
export interface Target {
  id: string; kind: 'item' | 'document' | 'door' | 'furniture' | 'switch' | 'inspect';
  title: [string, string]; root: T.Object3D; key?: string; open?: boolean; unlocked?: boolean;
  home?: T.Vector3; move?: T.Vector3; progress?: number; pivot?: T.Object3D; angle?: number; blockedBy?: string;
}
export interface House { targets: Target[]; colliders: Collider[]; roots: T.Object3D[]; dust: T.Points; lamp: T.PointLight; hatch: Target; glow: T.PointLight; }
export async function createHouse(scene: T.Scene, save: Save, progress: (n: number) => void): Promise<House> {
  const roots: T.Object3D[] = []; const targets: Target[] = []; const colliders: Collider[] = [];
  const loader = new T.TextureLoader();
  const load = async (name: string) => {
    const tex = await loader.loadAsync(`${import.meta.env.BASE_URL}textures/${name}`);
    tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.anisotropy = 8; return tex;
  };
  const maps = await Promise.all(['wood-color.jpg', 'wood-normal.jpg', 'wood-rough.jpg'].map(async (f, i) => { const t = await load(f); progress((i + 1) / 4); return t; }));
  maps[0].colorSpace = T.SRGBColorSpace; maps.forEach(t => t.repeat.set(2, 4));
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
  const plaster = new T.MeshStandardMaterial({ map: plasterTex, bumpMap: plasterTex, bumpScale: .03, roughness: 1, color: 0xb2a995 });
  const metal = new T.MeshStandardMaterial({ color: 0x555650, metalness: .7, roughness: .66 });
  const brass = new T.MeshStandardMaterial({ color: 0xb79555, metalness: .8, roughness: .34 });
  const black = new T.MeshStandardMaterial({ color: 0x151915, roughness: .88 });
  const fabric = new T.MeshStandardMaterial({ color: 0x62594a, roughness: 1, bumpMap: plasterTex, bumpScale: .025 });
  const paper = new T.MeshStandardMaterial({ color: 0xd2c6a3, roughness: .96, side: T.DoubleSide });
  const ceramic = new T.MeshStandardMaterial({ color: 0x9caaa0, roughness: .48 });
  function box(parent: T.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, mat: T.Material = wood) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
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
    const g=group(x,y,z);box(g,0,.83,0,w,.1,d);box(g,0,.65,0,w-.12,.23,d-.12,dark);
    for(const a of [-1,1])for(const b of [-1,1])box(g,a*(w/2-.1),.4,b*(d/2-.1),.09,.8,.09);
    collider(x,z,w,d,y,y+.9);return g;
  }
  function chair(x:number,y:number,z:number, rot=0,movable=false,id='chair') {
    const g=group(x,y,z);g.rotation.y=rot;box(g,0,.49,0,.51,.09,.51);
    for(const a of [-1,1])for(const b of [-1,1])box(g,a*.2,.24,b*.2,.055,.48,.055);
    for(const a of [-1,1])box(g,a*.22,.88,.21,.055,.8,.055);
    for(let i=0;i<3;i++)box(g,0,.72+i*.13,.22,.46,.08,.045);
    if(movable){const t=register({id,kind:'furniture',title:['Стул','Chair'],root:g,home:g.position.clone(),move:new T.Vector3(.95,0,.35)});colliders.push({get minX(){return g.position.x-.32},get maxX(){return g.position.x+.32},get minZ(){return g.position.z-.32},get maxZ(){return g.position.z+.32},bottom:y,top:y+1.3});if(save.moved.includes(id)){g.position.add(t.move!);t.progress=1;}}
    return g;
  }
  function cabinet(x:number,y:number,z:number,id:string,rot=0,movable=true) {
    const g=group(x,y,z);g.rotation.y=rot;box(g,0,1.05,0,1.55,2.1,.66,dark);
    for(const a of [-1,1]){box(g,a*.375,1.1,.355,.72,1.82,.055);box(g,a*.08,1.1,.4,.035,.18,.04,brass);}
    box(g,0,2.14,0,1.68,.11,.78);box(g,0,.1,0,1.62,.12,.75);
    const t=register({id,kind:'furniture',title:['Шкаф','Wardrobe'],root:g,home:g.position.clone(),move:new T.Vector3(1.9,0,0),progress:0});
    colliders.push({get minX(){return g.position.x-.83},get maxX(){return g.position.x+.83},get minZ(){return g.position.z-.45},get maxZ(){return g.position.z+.45},bottom:y,top:y+2.3});
    if(save.moved.includes(id)){g.position.add(t.move!);t.progress=1;}if(!movable)t.kind='inspect';return g;
  }
  function storyPaper(id:string,x:number,y:number,z:number) {
    const g=group(x,y,z);const page=box(g,0,0,0,.28,.008,.37,paper);page.rotation.y=.13;
    for(let i=0;i<9;i++)box(g,-.015,.005,-.12+i*.026,.19-rnd()*.05,.001,.002,black);
    register({id,kind:'document',title:['Документ','Document'],root:g});return g;
  }
  function key(id:string,x:number,y:number,z:number,title:[string,string],blockedBy?:string) {
    const g=group(x,y,z);const ring=new T.Mesh(new T.TorusGeometry(.05,.012,8,20),brass);ring.rotation.x=Math.PI/2;g.add(ring);
    box(g,.09,0,0,.14,.018,.018,brass);box(g,.14,0,.025,.025,.018,.055,brass);box(g,.1,0,.02,.018,.018,.04,brass);
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
    const across=Math.abs(Math.sin(side))>.5; collider(x,z,across?.14:1.4,across?1.4:.14,0,2.5,()=>!!t.open&&Math.abs(t.angle||0)>.9);
    return t;
  }
  // Attic: actual floor opening and a walkable, continuous staircase down to the landing.
  box(scene,-2,3.51,0,8,.18,10,floor);box(scene,5,3.51,0,2,.18,10,floor);box(scene,3,3.51,2,2,.18,6,floor);box(scene,3,3.51,-4.5,2,.18,1,floor);
  wall(-6,5.2,0,.2,3.4,10,wood);wall(6,5.2,0,.2,3.4,10,wood);wall(0,5.1,5,12,3,.2,wood);
  // Front gable divided around its moonlit window.
  wall(-3.65,5.3,-5,4.7,3.6,.2,wood);wall(3.65,5.3,-5,4.7,3.6,.2,wood);box(scene,0,3.95,-5,2.6,.7,.2,wood);box(scene,0,7.1,-5,2.6,1.8,.2,wood);
  const blue=new T.MeshBasicMaterial({color:0x779ba5});box(scene,0,5.5,-5.06,2.45,2.3,.025,blue);
  const glass=new T.MeshPhysicalMaterial({color:0xb3ccce,transparent:true,opacity:.13,roughness:.2,metalness:.15});box(scene,0,5.5,-4.94,2.4,2.25,.015,glass);
  for(let i=0;i<8;i++){const tree=new T.Group();tree.position.set(-1.15+i*.32,4.35,-5.015);box(tree,0,.6,0,.018,1.3,.008,black);for(let j=0;j<5;j++){const twig=box(tree,0,.3+j*.19,0,.28-j*.04,.014,.009,black);twig.rotation.z=(j%2?1:-1)*.4;}scene.add(tree);}
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
  const flashlight=group(-.05,4.56,-3.62);cylinder(flashlight,0,0,0,.065,.35,black).rotation.x=Math.PI/2;cylinder(flashlight,0,0,-.2,.11,.09,metal).rotation.x=Math.PI/2;
  register({id:'flashlight',kind:'item',title:['Фонарь','Flashlight'],root:flashlight});flashlight.visible=!save.items.includes('flashlight');
  const knife=group(.5,3.65,1.2);box(knife,0,0,0,.055,.025,.15,dark);const blade=box(knife,0,0,-.19,.06,.012,.24,metal);blade.rotation.y=.08;
  register({id:'knife',kind:'item',title:['Нож','Knife'],root:knife});knife.visible=!save.items.includes('knife');
  const boundChair=chair(0,3.6,2.9,Math.PI);boundChair.name='bound-chair';
  // Rope coils on the chair and a fallen packing cloth.
  const rope=new T.MeshStandardMaterial({color:0x927951,roughness:1});for(let y=4.1;y<4.5;y+=.085){const r=new T.Mesh(new T.TorusGeometry(.35,.02,7,32),rope);r.rotation.x=Math.PI/2;r.position.set(0,y,2.9);scene.add(r);r.name='rope';if(save.flags.includes('free'))r.visible=false;}
  for(let i=0;i<14;i++){const g=group(-5+rnd()*2,3.6,-3+rnd()*7);g.rotation.y=rnd()*.2;box(g,0,.2,0,.5+rnd()*.45,.4+rnd()*.3,.6,wood);}
  const covered=group(4.8,3.6,2);box(covered,0,.55,0,1.2,1.1,1.6,fabric);box(covered,0,1.12,0,1.25,.07,1.65,fabric);
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
  table(4.7,0,-16.6,2.3,1.1);chair(4.6,0,-15.45,.2,true,'studyChair');storyPaper('fatherNote',4.1,.94,-16.4);key('bedroomKey',5.3,.94,-16.45,['Ключ от спальни','Bedroom key']);
  for(let i=0;i<15;i++){const book=box(scene,6.62,.4+i*.14,-14.1,.38,.11,.8,i%3===0?dark:wood);book.rotation.y=(rnd()-.5)*.1;}
  cabinet(6.2,0,-17.3,'studyWardrobe',0,false);label(scene,'СОКОЛОВ\nСЕКТОР 01',5.3,1.8,-17.9,.8,.5);
  const bed=group(-4.5,0,-21.5);box(bed,0,.38,0,2,.4,2.7,dark);box(bed,0,.67,0,1.95,.2,2.6,fabric);box(bed,0,.88,-.95,1.45,.18,.45,ceramic);box(bed,0,.6,-1.4,2.1,1.2,.12,dark);collider(-4.5,-21.5,2.1,2.9,0,.85);
  table(-2.6,0,-19,1,.65);storyPaper('bedroomNote',-2.8,.94,-19);key('veraKey',-2.4,.95,-19,['Ключ с красной лентой','Red-ribbon key']);
  const smallBed=group(5.7,0,-21.2);box(smallBed,0,.4,0,1.3,.35,2.4,wood);box(smallBed,0,.65,0,1.25,.2,2.3,fabric);box(smallBed,0,.8,-.8,.8,.16,.4,ceramic);collider(5.7,-21.2,1.4,2.5,0,.8);
  table(3.2,0,-22.8,1.8);storyPaper('veraNote',2.9,.94,-22.7);key('exitKey',3.65,.95,-22.65,['Ключ от входной двери','Front door key']);
  const music=group(3.7,.94,-23);box(music,0,.08,0,.35,.16,.23,dark);box(music,0,.2,-.1,.35,.23,.025,wood);
  for(let i=0;i<6;i++){const p=label(scene,'ДОМ\n100 ДВЕРЕЙ',2+i*.67,1.5+(i%2)*.4,-23.88,.44,.5);p.rotation.z=(rnd()-.5)*.13;}
  // Bathroom with porcelain fixtures, medicine tray and a visibly modelled syringe.
  box(scene,-4.7,.55,-28.9,2,.85,.85,ceramic);box(scene,-4.7,.96,-28.9,1.6,.05,.55,black);cylinder(scene,-5.3,1.13,-28.9,.025,.3,metal);
  table(-2.6,0,-28.7,1.4);storyPaper('bathNote',-2.8,.94,-28.7);const fuse=group(-2.25,.96,-28.65);cylinder(fuse,0,0,0,.035,.16,ceramic).rotation.z=Math.PI/2;register({id:'fuse',kind:'item',title:['Предохранитель 10 А','10 A fuse'],root:fuse});fuse.visible=!save.items.includes('fuse');
  const syringe=group(-2.65,.95,-28.45);cylinder(syringe,0,0,0,.015,.15,ceramic).rotation.z=Math.PI/2;box(syringe,.13,0,0,.13,.004,.004,metal);register({id:'syringe',kind:'inspect',title:['Старый шприц — лучше не трогать','An old syringe — leave it alone'],root:syringe});
  for(let i=0;i<5;i++)bottle(-6.5+i*.25,.95,-28.9);
  // Kitchen counters and fuse box.
  for(let i=0;i<4;i++){box(scene,6.25,.45,-25+i*.65,1.2,.9,.62,wood);box(scene,6.25,.94,-25+i*.65,1.3,.1,.65,ceramic);}
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
  box(scene,7.3,1.1,-33, .05,2.2,1.5,new T.MeshBasicMaterial({color:0x9bb9bc}));
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
  progress(1);return {targets,colliders,roots,dust,lamp,hatch,glow};
}
