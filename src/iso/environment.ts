import * as T from 'three';
import {DOORS,FURNITURE,OBJECTS,RECEPTION_PORTAL,ROOMS,type DoorId,type ObjectId,type RoomId} from './map';
import {materials,random,type KitMaterials} from './env-materials';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {box,cardboard,cassette,chair,consolidate,crt,curve,cylinder,desk,filing,group,keyboard,paperStack,phone,plate,shelf,vcr} from './env-kit';

type Rect=typeof ROOMS[RoomId];
type Furniture=typeof FURNITURE[number];
type Portal={z:number;half:number};
const FLOOR_TOP=0, WALL_H=2.66, WALL_D=.16, NEAR_H=.37;
const wallY=.955;
// First-person view needs closed rooms: the iso cutaway walls are completed, doorways get lintels and
// every room a ceiling. Those meshes are tagged so the isometric view can hide them (and vice versa).
let fpOnly:T.Mesh[]=[],isoOnly:T.Mesh[]=[];
const forFp=(m:T.Mesh)=>{fpOnly.push(m);return m;};
const forIso=(m:T.Mesh)=>{isoOnly.push(m);return m;};
const roomNames={
  reception:'01 · ПРИЁМНАЯ',technical:'02 · ЩИТОВАЯ',surveillance:'03 · ОПЕРАТОРСКАЯ',archive:'04 · АРХИВ',corridor:'АДМИНИСТРАЦИЯ',
};
const doorsByRoom={reception:RECEPTION_PORTAL,technical:DOORS.technical,archive:DOORS.archive,surveillance:DOORS.surveillance};

function flooring(p:T.Group,m:KitMaterials,r:Rect,id:RoomId,seed:number){
  const w=r.maxX-r.minX,d=r.maxZ-r.minZ,x=(r.maxX+r.minX)/2,z=(r.maxZ+r.minZ)/2;
  box(p,m.grout,x,-.152,z,w,.27,d,.011);
  const target=.59,nx=Math.round(w/target),nz=Math.round(d/target),dx=w/nx,dz=d/nz;
  const g=new T.BoxGeometry(1,1,1),tiles=new T.InstancedMesh(g,m.floor,nx*nz);
  tiles.name='Glazed tiles with recessed grout';tiles.receiveShadow=true;
  const inst=new T.Object3D(),rng=random(seed);
  const stone=new T.Color(id==='technical'?0x5e6259:id==='surveillance'?0x918777:0xaaa18e);
  const dark=new T.Color(id==='archive'?0x45484a:id==='technical'?0x50514b:0x373b3d);
  for(let row=0;row<nz;row++)for(let col=0;col<nx;col++){
    const px=r.minX+(col+.5)*dx,pz=r.minZ+(row+.5)*dz;
    const edge=Math.min(col,nx-1-col,row,nz-1-row);
    const isDark=id==='technical'?(row+col*2)%4===0:((row+col)%2===0);
    inst.position.set(px,FLOOR_TOP-.013+rng()*.0018,pz);
    inst.rotation.y=(rng()-.5)*.010;
    inst.scale.set(dx-.009,.025,dz-.009);inst.updateMatrix();
    const color=(isDark?dark:stone).clone().multiplyScalar(.83+rng()*.21-edge*.003);
    if(edge===0)color.multiplyScalar(.82+rng()*.12);
    const index=row*nx+col;
    tiles.setMatrixAt(index,inst.matrix);tiles.setColorAt(index,color);
  }
  p.add(tiles);
  // Walk-through wear accumulates on the traffic line, wall dirt under furniture.
  for(let i=0;i<10;i++){
    const px=r.minX+.36+rng()*(w-.72),pz=r.minZ+.31+rng()*(d-.62);
    if(i<5)plate(p,m.shadow,px,.0025,pz,.35+rng()*.59,.31+rng()*.52,true);
    if(id==='reception'||id==='archive'){
      const scrap=box(p,i%3===0?m.veneer:m.paper,px,.008,pz,.025+rng()*.093,.003,.026+rng()*.072,.001);
      scrap.rotation.y=rng()*Math.PI*2;
    }
  }
}

function wall(parent:T.Group,m:KitMaterials,axis:'x'|'z',constant:number,lo:number,hi:number,h:number,seed:number){
  if(hi-lo<.025)return;
  const g=group(parent,axis==='x'?constant:0,0,axis==='x'?0:constant);
  if(axis==='x')g.rotation.y=Math.PI/2;
  const cx=(lo+hi)/2*(axis==='x'?-1:1),w=hi-lo;
  const lower=Math.min(h,wallY),full=h>NEAR_H;
  box(g,m.paint,cx,lower*.5,0,w,lower,WALL_D);
  if(h>lower){
    box(g,m.plaster,cx,(lower+h)/2,0,w,h-lower,WALL_D);
    box(g,m.trim,cx,lower+.014,0,w,.035,WALL_D+.014,.004);
  }
  const cap=box(g,m.ceiling,cx,h-.025,0,w,.055,WALL_D+.017,.006);
  if(h<WALL_H)forIso(cap);
  // Cut ends read as exposed masonry instead of blank white faces.
  for(const end of [-1,1])forIso(box(g,m.ceiling,cx+end*(w/2+.002),h/2,0,.004,h,WALL_D+.004));
  if(h<WALL_H){
    // First person: finish the low cutaway wall up to the ceiling.
    if(h<wallY)forFp(box(g,m.paint,cx,(h+wallY)/2,0,w,wallY-h,WALL_D));
    const from=Math.max(h,wallY);
    forFp(box(g,m.plaster,cx,(from+WALL_H)/2,0,w,WALL_H-from,WALL_D));
    if(h<wallY)forFp(box(g,m.trim,cx,wallY+.014,0,w,.035,WALL_D+.014,.004));
  }
  for(const side of [-1,1]){
    box(g,m.trim,cx,.042,side*(WALL_D*.5+.005),w,.083,.023,.003);
    if(full)box(g,m.paint,cx,2.38,side*(WALL_D*.5+.001),w,.031,.016,.002);
  }
  if(!full)return;
  const rng=random(seed);
  for(let i=0;i<Math.round(w*7);i++){
    const x=cx+(rng()-.5)*(w-.035),y=.12+rng()*1.65,worn=y<wallY?m.plaster:m.trim;
    for(const side of [-1,1]){
      const flake=box(g,worn,x,y,side*(WALL_D*.5+.001),.008+rng()*.065,.008+rng()*.029,.002);
      flake.rotation.z=(rng()-.5)*.92;
    }
  }
}

function frame(parent:T.Group,m:KitMaterials,x:number,z:number,half:number,h=2.25){
  for(const side of [-1,1]){
    box(parent,m.veneer,x,h*.5,z+side*(half+.024),.215,h,.080,.008);
    box(parent,m.paleWood,x,h*.5,z+side*(half+.067),.223,h,.018,.003);
  }
  box(parent,m.veneer,x,h-.012,z,.217,.083,half*2+.105,.008);
  box(parent,m.steel,x,.007,z,.231,.013,half*2,.002);
  forFp(box(parent,m.plaster,x,(h+WALL_H)/2,z,WALL_D,WALL_H-h,half*2+.2));
}

function roomWalls(p:T.Group,m:KitMaterials,r:Rect,id:Exclude<RoomId,'corridor'>,seed:number){
  const onLeft=id==='reception'||id==='technical';
  const x=onLeft?r.maxX:r.minX,other=onLeft?r.minX:r.maxX;
  const portal:Portal=doorsByRoom[id];
  wall(p,m,'x',other,r.minZ,r.maxZ,onLeft?WALL_H:NEAR_H,seed+1);
  wall(p,m,'x',x,r.minZ,portal.z-portal.half,onLeft?NEAR_H:WALL_H,seed+2);
  wall(p,m,'x',x,portal.z+portal.half,r.maxZ,onLeft?NEAR_H:WALL_H,seed+3);
  wall(p,m,'z',r.minZ,r.minX,r.maxX,WALL_H,seed+4);
  wall(p,m,'z',r.maxZ,r.minX,r.maxX,NEAR_H,seed+5);
  frame(p,m,x,portal.z,portal.half);
}

function corridorWalls(p:T.Group,m:KitMaterials){
  const r=ROOMS.corridor;
  wall(p,m,'x',r.minX,-1.25,0,WALL_H,901);
  wall(p,m,'x',r.maxX,-1.25,0,NEAR_H,902);
  wall(p,m,'z',r.minZ,r.minX,r.maxX,WALL_H,903);
  wall(p,m,'z',r.maxZ,r.minX,r.maxX,NEAR_H,904);
  plate(p,m.label(['ЭТАЖ 01','АДМИНИСТРАЦИЯ'],'#7c744f','#282e2b'),1.15,1.70,-4.91,.82,.38);
  for(const z of [-3.73,2.58]){
    // Room-number plates sit flush on the wall face (walls are WALL_D thick, centred on x=0 / x=2.4).
    for(const x of [WALL_D/2+.004,2.4-WALL_D/2-.004]){
      const sign=plate(p,m.label([z<0?(x<1?'02':'04'):(x<1?'01':'03')],'#333c36','#a59971',128,64),x,1.44,z,.19,.1);
      sign.rotation.y=x<1?Math.PI/2:-Math.PI/2;
    }
  }
}

function realDoor(p:T.Group,m:KitMaterials,id:DoorId,spec:{x:number;z:number;half:number}=DOORS[id]){
  const {x,z,half}=spec;
  const door=group(p,x,0,z-half,id+' door hinge'),span=2*half-.021;
  box(door,m.wood,0,1.081,span/2,.066,2.13,span,.009);
  for(const side of [-1,1]){
    for(const y of [.24,1.98])box(door,m.paleWood,side*.036,y,span/2,.009,.028,span-.073,.002);
    for(const zz of [.075,span-.075])box(door,m.paleWood,side*.036,1.11,zz,.009,1.74,.026,.002);
    if(id==='surveillance'){
      box(door,m.veneer,side*.040,1.52,span/2,.015,.40,.38,.006);
      box(door,m.glass,side*.049,1.52,span/2,.006,.348,.325,.004);
      for(const zz of [-.096,0,.096])box(door,m.steel,side*.053,1.52,span/2+zz,.003,.342,.007);
    }
    box(door,m.dark,side*.042,1.008,span-.127,.019,.140,.056,.008);
    box(door,m.silver,side*.077,1.053,span-.167,.051,.023,.126,.006);
    box(door,m.dark,side*.056,1.003,span-.127,.011,.027,.022,.004);
  }
  for(const y of [.29,1.82])cylinder(door,m.steel,-.017,y,.005,.019,.115);
  const target=group(door,0,1.06,span-.18,'Handle');
  consolidate(door);
  return {door,target};
}

function roomWindow(p:T.Group,m:KitMaterials,x:number,z:number,w=1.44){
  // Dirty wired glass and a painted masonry reveal, not a light-emitting flat rectangle.
  box(p,m.veneer,x,1.64,z,w,1.12,.055,.012);
  box(p,m.glass,x,1.64,z+.035,w-.103,1.02,.017,.009);
  for(const dx of [-w/3,0,w/3])box(p,m.trim,x+dx,1.64,z+.054,.034,1.02,.027,.003);
  box(p,m.trim,x,1.66,z+.052,w-.083,.042,.027,.003);
  box(p,m.plaster,x,1.063,z+.069,w+.17,.068,.217,.008);
  const heater=group(p,x,.33,z+.079,'Cast radiator');
  for(let i=0;i<14;i++)box(heater,m.steel,(i-6.5)*.069,0,.015,.055,.46,.119,.012);
  box(heater,m.dark,0,-.144,.012,.99,.055,.082,.005);
  box(heater,m.steel,0,.137,.010,.99,.054,.08,.005);
  curve(heater,m.rust,[[-.51,.16,0],[-.57,.16,.005],[-.61,.13,.008],[-.61,-.28,.008]],.011);
}

function glazedWall(p:T.Group,m:KitMaterials,x:number,z:number,width:number){
  const rows=5,columns=Math.round(width/.177),w=width/columns,rng=random(459921);
  const patch=new T.InstancedMesh(new T.BoxGeometry(),m.floor,rows*columns);
  patch.name='Stained glazed wall tile';patch.receiveShadow=true;
  const tile=new T.Object3D(),base=new T.Color(0x868c7a);
  for(let y=0;y<rows;y++)for(let i=0;i<columns;i++){
    tile.position.set(x+(i-(columns-1)/2)*w,.115+y*.168,z);
    tile.scale.set(w-.007,.161,.017);tile.rotation.z=(rng()-.5)*.014;tile.updateMatrix();
    const n=y*columns+i;
    patch.setMatrixAt(n,tile.matrix);
    patch.setColorAt(n,base.clone().multiplyScalar((.79+.24*rng())*(y===0?.76:1)));
  }
  p.add(patch);
}

function fixture(p:T.Group,m:KitMaterials,x:number,y:number,z:number,w=.85){
  const g=group(p,x,y,z,'Hanging fixture');
  for(const dx of [-w*.35,w*.35])curve(g,m.dark,[[dx,.46,0],[dx,.18,.004],[dx,.013,0]],.004,4);
  box(g,m.greenSteel,0,0,0,w,.063,.24,.012);
  box(g,m.dark,0,-.031,0,w-.024,.023,.201,.010);
  box(g,m.lamp,0,-.046,0,w-.091,.027,.128,.010);
  return g;
}

function breaker(p:T.Group,m:KitMaterials){
  box(p,m.greenSteel,0,1.37,0,.96,.98,.24,.013);
  box(p,m.dark,0,1.37,.127,.89,.88,.019,.010);
  box(p,m.steel,0,1.38,.140,.79,.78,.013,.007);
  for(let i=0;i<3;i++){
    const x=(i-1)*.235;
    box(p,m.beige,x,1.383,.167,.14,.286,.057,.010);
    box(p,m.dark,x,1.381,.206,.071,.105,.042,.010);
    box(p,m.dark,x,1.36,.226,.075,.031,.045,.008);
    box(p,m.led,x,1.48,.208,.028,.018,.012,.004);
    plate(p,m.label(['0'+(i+1)],'#493b2e','#b7a482',64,40),x,1.261,.198,.071,.031);
    curve(p,[m.rust,m.dark,m.blue][i]!,[[x,1.25,.158],[x,.98,.142],[x*.71,.905,.138],[x*.53,.867,.144],[x*.49,.823,.126]],.008);
  }
  plate(p,m.label(['380 V','ВНИМАНИЕ'],'#5b351c','#b69d5d',128,80),0,1.700,.151,.316,.123);
  for(const x of [-.4,.4])for(const y of [1.04,1.73])cylinder(p,m.silver,x,y,.165,.013,.013).rotation.x=Math.PI/2;
  const open=group(p,-.46,1.37,0);open.rotation.y=-.56;
  box(open,m.greenSteel,-.241,0,.08,.48,.96,.051,.012);
  box(open,m.rust,-.416,-.172,.11,.091,.076,.004,.002);
  for(const y of [-.295,.295])box(open,m.silver,0,y,.096,.047,.043,.050,.004);
  for(const i of [0,1]){
    curve(p,m.steel,[[.24+i*.11,1.84,0],[.24+i*.11,2.15,0],[.24+i*.11,2.29,-.12],[.24+i*.11,2.43,-.18]],.038);
    curve(p,m.steel,[[.21+i*.11,.88,.004],[.21+i*.11,.31,-.009],[.31+i*.11,.20,-.038],[.77+i*.11,.20,-.11]],.030);
  }
}

function plans(p:T.Group,m:KitMaterials,x:number,y:number,z:number,mode:'diagram'|'building'){
  const g=group(p,x,y,z,mode==='diagram'?'Electrical handoff diagram':'Reception floor plan');
  box(g,m.veneer,0,0,0,.72,.55,.028,.006);
  const label=mode==='diagram'?m.label(['ПИТАНИЕ','─── П-01 ───','☉  →  КЛЮЧ  →  ◉'],'#534a37','#b6a584'):
    m.label(['ЭТАЖ 01',' ┌─┬─┐ ',' ├─┼─┤ ',' └─┴─┘ '],'#414b43','#b6a584');
  plate(g,label,0,0,.017,.674,.504);
  for(const dx of [-.31,.31])box(g,m.silver,dx,.232,.023,.011,.011,.011,.003);
  return g;
}

function alarmCamera(p:T.Group,m:KitMaterials,x:number,y:number,z:number,rot:number){
  const g=group(p,x,y,z,'Fixed surveillance camera');g.rotation.y=rot;
  box(g,m.silver,0,0,0,.048,.064,.085,.005);
  const body=group(g,0,-.013,.093);body.rotation.x=.23;
  box(body,m.beige,0,0,0,.141,.108,.232,.011);
  box(body,m.dark,0,.015,.117,.111,.077,.016,.009);
  const lens=cylinder(body,m.glass,0,.013,.132,.032,.014);lens.rotation.x=Math.PI/2;
  box(body,m.led,-.048,-.015,.133,.010,.010,.007,.003);
  curve(g,m.dark,[[.02,.04,.006],[.039,.02,-.024],[.046,-.013,-.062],[.04,-.034,-.082]],.006);
}

function typewriter(p:T.Group,m:KitMaterials,x:number,y:number,z:number){
  const g=group(p,x,y,z,'Mechanical typewriter');
  g.rotation.y=-.18;
  box(g,m.dark,0,.036,0,.35,.074,.256,.024);
  box(g,m.greenSteel,0,.093,-.040,.355,.089,.174,.024);
  box(g,m.steel,0,.129,-.108,.384,.036,.034,.010);
  for(let i=0;i<3;i++)for(let j=0;j<8;j++)cylinder(g,m.keys,(j-3.5)*.032,.09-i*.01,.04+i*.025,.011,.010);
  const sheet=plate(g,m.label(['СЕКЦИЯ Б','  ────   ─── '],'#5b4e3e','#c4b69c',128,88),0,.201,-.109,.173,.138);
  sheet.rotation.x=-.28;
}

export type AdminEnvironment={
  /** Meshes shown only in first person (ceilings, lintels, completed walls) and only in isometric view. */
  fpOnly:T.Mesh[]; isoOnly:T.Mesh[];
  root:T.Group; doors:Record<DoorId,T.Group>; targets:Partial<Record<ObjectId,T.Object3D>>;
  screens:T.Mesh[]; powerLights:T.PointLight[]; occluders:T.Mesh[]; lamp:T.PointLight; drawer:T.Group;
};

export function buildEnvironment():AdminEnvironment {
  fpOnly=[];isoOnly=[];
  const root=new T.Group();root.name='Municipal administration · floor 01';
  const m=materials(),doors={} as AdminEnvironment['doors'],targets:AdminEnvironment['targets']={};
  const screens:T.Mesh[]=[],powerLights:T.PointLight[]=[],occluders:T.Mesh[]=[];
  let deskDrawer:T.Group|undefined;
  const set=(id:ObjectId,o:T.Object3D)=>{targets[id]=o;o.userData.isoTarget=id;return o;};
  const anchor=(id:ObjectId,y:number,p:T.Group)=>{const v=OBJECTS[id];return set(id,group(p,v.x,y,v.z,id));};
  const rooms=Object.fromEntries(Object.keys(ROOMS).map(id=>[id,group(root,0,0,0,id)])) as Record<RoomId,T.Group>;
  for(const [i,id] of (Object.keys(ROOMS) as RoomId[]).entries()){
    const p=rooms[id],r=ROOMS[id];
    flooring(p,m,r,id,802+i*39);
    if(id==='corridor')corridorWalls(p,m);else {
      roomWalls(p,m,r,id,885+i*17);
      // The reception window is centred on the same wall, so its sign moves clear of the glass.
      plate(p,m.label([roomNames[id]],'#c1b79b','#404a40'),id==='reception'?-1.45:(r.minX+r.maxX)*.5,2.13,r.minZ+.085,1.02,.197);
      if(id==='reception')roomWindow(p,m,-3.53,r.minZ+.08,1.46);
      if(id==='surveillance'){
        glazedWall(p,m,4.95,r.minZ+.089,4.98);
        roomWindow(p,m,6.55,r.minZ+.08,1.28);
      }
      if(id==='archive')roomWindow(p,m,3.38,r.minZ+.08,1.0);
    }
  }
  for(const id of ['technical','surveillance','archive'] as const){
    const visual=realDoor(root,m,id);doors[id]=visual.door;
    set(id==='technical'?'technicalDoor':id==='surveillance'?'surveillanceDoor':'archiveDoor',visual.target);
  }
  // The reception doorway always stays open: its door leaf stands open against the reception wall.
  const parked=realDoor(root,m,'technical',{x:RECEPTION_PORTAL.x,z:RECEPTION_PORTAL.z,half:RECEPTION_PORTAL.half});
  parked.door.name='Reception door (open)';parked.door.rotation.y=Math.PI;parked.door.position.x=-WALL_D/2-.04;
  parked.target.removeFromParent();
  const live=new Set<T.Object3D>();
  const nearFurniture:T.Group[]=[];
  const floorFootprint=(f:Furniture)=>{
    const p=rooms[f.room];
    plate(p,m.shadow,f.x,.003,f.z,f.w*1.32,f.d*1.55,true);
    return group(p,f.x,0,f.z,f.kind);
  };
  for(const [i,f] of FURNITURE.entries()){
    const g=floorFootprint(f);
    switch(f.kind){
      case 'desk': {
        desk(g,m,f.w,f.d,43);
        const drawers=group(g,.68,0,.04);
        filing(drawers,m,.39,.60,.485,2);
        // The upper drawer is separate so the game can pull it along real rails.
        for(const side of [-1,1])box(drawers,m.veneer,side*.187,.599,0,.022,.237,.591,.005);
        box(drawers,m.veneer,0,.602,-.293,.36,.233,.022,.005);
        box(drawers,m.dark,0,.595,.266,.35,.193,.041,.005);
        deskDrawer=group(drawers,0,.599,.293,'Reception drawer · rail pivot');set('drawer',deskDrawer);live.add(deskDrawer);
        box(deskDrawer,m.wood,0,0,0,.357,.194,.029,.006);
        box(deskDrawer,m.silver,0,.002,.034,.092,.016,.036,.005);
        box(deskDrawer,m.veneer,0,-.070,-.147,.313,.023,.292,.004);
        for(const side of [-1,1])box(deskDrawer,m.paleWood,side*.147,-.027,-.146,.021,.069,.282,.003);
        box(deskDrawer,m.paleWood,0,-.027,-.277,.31,.071,.023,.004);
        paperStack(deskDrawer,m,-.016,-.054,-.126,53,'БЛАНК');
        const duty=paperStack(g,m,.31,.827,.265,18,'ЖУРНАЛ');
        set('dutyLog',duty);live.add(duty);
        const telephone=phone(g,m,-.211,.825,.069);set('phone',telephone);live.add(telephone);
        const hook=group(g,-.661,.727,.249,'Under-desk hook');set('underDesk',hook);
        curve(hook,m.silver,[[0,.008,0],[.010,-.005,.002],[.011,-.018,.009],[.004,-.026,.015]],.003,8);
        // The key itself is the physical "Key with Tag" prop (see keys.ts), hung on this hook by the world.
        paperStack(g,m,.54,.827,-.18,19,'ВХОДЯЩИЕ');
        break;
      }
      case 'chair':
        g.rotation.y=f.room==='reception'?.53:2.62;
        chair(g,m,88+i);
        break;
      case 'fileCabinet':
        g.rotation.y=Math.PI/2;filing(g,m,f.d,f.w,1.12,4);
        paperStack(g,m,-.19,1.122,.023,67);
        set('archiveCache',group(g,.012,.83,.326,'Index slot'));
        break;
      case 'shelf':
        shelf(g,m,f.w,f.d,.91,534);
        cardboard(g,m,.275,.727,.01,.35,.251,.34,'1989'); // rests on the top plank
        nearFurniture.push(g);
        break;
      case 'waiting':
        for(const x of [-.47,0,.47]){const seat=group(g,x,0,0);seat.rotation.y=Math.PI;chair(seat,m,23+i);}
        break;
      case 'toolBench':
        g.rotation.y=Math.PI;
        desk(g,m,f.w,f.d,54,.86);
        cardboard(g,m,.56,.897,.039,.38,.144,.29,'РЕЛЕ');
        for(let i=0;i<6;i++)box(g,m.steel,-.48+i*.10,.898,.14,.076,.011,.026,.004).rotation.y=i*.123;
        break;
      case 'locker':
        g.rotation.y=Math.PI/2;filing(g,m,f.d,f.w,1.66,3);
        break;
      case 'panel':
        breaker(g,m);set('breaker',group(g,0,1.38,.226,'Breaker toggles'));
        break;
      case 'console': {
        desk(g,m,f.w,f.d,75,.82);
        const consoleHeight=.855;
        crt(g,m,-.55,consoleHeight,-.10,.16,screens);
        crt(g,m,.186,consoleHeight,-.123,.31,screens);
        crt(g,m,.935,consoleHeight,-.106,-.13,screens);
        const console=keyboard(g,m,-.115,consoleHeight,.248,.09);set('terminal',console);live.add(console);
        vcr(g,m,-1.03,consoleHeight,.12);
        cassette(g,m,.88,consoleHeight,.253,73,'КАМ. 01');
        paperStack(g,m,.53,consoleHeight,.292,69,'ПОСТ №3');
        const mouse=box(g,m.beige,.24,consoleHeight+.018,.26,.069,.036,.109,.016);
        mouse.rotation.y=-.19;
        curve(g,m.dark,[[.22,consoleHeight+.016,.204],[.187,consoleHeight+.009,.170],[.201,consoleHeight+.009,.144],[.25,consoleHeight+.010,.114]],.0035);
        curve(g,m.dark,[[-.79,.781,-.33],[-.69,.555,-.382],[-.59,.226,-.34],[-.56,.025,-.347],[-.55,.014,-.071],[-.67,.012,.149]],.009);
        break;
      }
      case 'tapeCabinet': {
        g.rotation.y=-Math.PI/2;filing(g,m,f.d,f.w,.97,3);
        const tape=cassette(g,m,.03,.972,.037,10,'ПОСТ 03');
        set('vhs',tape);live.add(tape);
        break;
      }
      case 'archiveDesk':
        desk(g,m,f.w,f.d,101);
        typewriter(g,m,.36,.827,-.012);
        const order=paperStack(g,m,-.36,.827,.139,910,'ОПИСЬ');set('archiveIndex',order);live.add(order);
        const stand=group(g,.025,.828,-.135);
        cylinder(stand,m.dark,0,.018,0,.092,.028);
        curve(stand,m.steel,[[0,.025,0],[0,.12,-.034],[.024,.258,-.036],[.083,.274,.004]],.014);
        const shade=new T.Mesh(new T.ConeGeometry(.11,.111,16,1,true),m.greenSteel);
        shade.position.set(.087,.253,.032);shade.rotation.z=-.21;stand.add(shade);
        cylinder(stand,m.lamp,.093,.214,.038,.031,.018);
        break;
      case 'archiveShelf':
        shelf(g,m,f.w,f.d,1.98,530);
        break;
      case 'archiveShelfSide':
        g.rotation.y=-Math.PI/2;shelf(g,m,f.d,f.w,1.56,245);
        set('fileZero',group(g,0,1.025,.318,'Shelf B slot 4'));
        nearFurniture.push(g);
        break;
    }
  }
  const plan=plans(rooms.reception,m,-.84,1.48,.100,'building');set('buildingPlan',plan);live.add(plan);
  const diag=plans(rooms.technical,m,-2.35,1.52,-4.895,'diagram');set('powerDiagram',diag);live.add(diag);
  alarmCamera(rooms.reception,m,-.72,2.31,.135,-.25);
  alarmCamera(rooms.archive,m,2.78,2.29,-4.844,.50);
  alarmCamera(rooms.corridor,m,1.12,2.28,-4.84,.12);
  // The power lights illuminate real local surfaces. Menu has a separate warm bulb.
  const powered=(room:RoomId,x:number,y:number,z:number,color:number,intensity:number,w:number)=>{
    fixture(rooms[room],m,x,y,z,w);
    const l=new T.PointLight(color,intensity,6,2);l.position.set(x,y-.16,z);
    l.userData.fullPower=intensity;rooms[room].add(l);powerLights.push(l);return l;
  };
  powered('technical',-2.89,2.27,-3.14,0xc0d6c4,13,.61);
  powered('corridor',1.14,2.35,-1.21,0xbac6b4,18,.74);
  powered('reception',-3.40,2.40,1.25,0xffdfa2,22,.80);
  powered('archive',4.88,2.40,-3.18,0xd6c99f,18,.82);
  const menuLamp=powered('surveillance',4.77,2.23,1.19,0xf5c77e,16,.58);
  menuLamp.name='Operator warm practical';
  const screenSpill=new T.PointLight(0x7fa7a0,1.6,3.4,2);screenSpill.position.set(5.08,1.27,1.31);rooms.surveillance.add(screenSpill);
  const receptionSpill=new T.PointLight(0x9eb6be,4.5,5.5,2);receptionSpill.position.set(-3.55,1.91,.42);rooms.reception.add(receptionSpill);
  const apertureSpill=new T.PointLight(0x94a9b0,3,5.8,2);apertureSpill.position.set(6.55,1.84,.32);rooms.surveillance.add(apertureSpill);
  const ambientExit=new T.PointLight(0xc49558,4,4.4,2);ambientExit.position.set(1.17,1.93,4.69);rooms.corridor.add(ambientExit);
  for(const id of Object.keys(OBJECTS) as ObjectId[])if(!targets[id])anchor(id,.70,rooms[OBJECTS[id].room]);
  for(const s of screens)live.add(s);
  // Preserve ray targets and CRTs; per-room geometry batches retain culling.
  for(const o of Object.values(targets))if(o)live.add(o);
  for(const furniture of nearFurniture){
    consolidate(furniture,live);
    live.add(furniture);
    furniture.traverse(o=>{if(o instanceof T.Mesh)occluders.push(o);});
  }
  for(const id of Object.keys(rooms) as RoomId[]){
    const r=ROOMS[id];
    forFp(box(rooms[id],m.ceiling,(r.minX+r.maxX)/2,WALL_H+.03,(r.minZ+r.maxZ)/2,r.maxX-r.minX,.06,r.maxZ-r.minZ));
  }
  // Merge the view-specific meshes per material so they cost a handful of draw calls, not hundreds.
  const mergeTagged=(list:T.Mesh[])=>{
    root.updateMatrixWorld(true);
    const inv=root.matrixWorld.clone().invert(),by=new Map<T.Material,T.Mesh[]>();
    for(const mesh of list){const key=mesh.material as T.Material;by.set(key,[...(by.get(key)??[]),mesh]);}
    const merged:T.Mesh[]=[];
    for(const [mat,meshes] of by){
      const geos=meshes.map(o=>(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone())
        .applyMatrix4(new T.Matrix4().multiplyMatrices(inv,o.matrixWorld)));
      const geometry=mergeGeometries(geos,false);
      geos.forEach(g=>g.dispose());
      meshes.forEach(o=>o.removeFromParent());
      if(!geometry)continue;
      const mesh=new T.Mesh(geometry,mat);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);merged.push(mesh);
    }
    return merged;
  };
  const fpMerged=mergeTagged(fpOnly),isoMerged=mergeTagged(isoOnly);
  fpOnly=fpMerged;isoOnly=isoMerged;
  for(const o of [...fpOnly,...isoOnly]){o.visible=false;live.add(o);}
  for(const id of Object.keys(rooms) as RoomId[])consolidate(rooms[id],live);
  if(!deskDrawer)throw Error('The reception drawer has no mapped desk');
  return {fpOnly,isoOnly,root,doors,targets,screens,powerLights,occluders,lamp:menuLamp,drawer:deskDrawer};
}
