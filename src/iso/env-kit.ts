import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {random,type KitMaterials} from './env-materials';

const unitBox=new T.BoxGeometry(), unitPlane=new T.PlaneGeometry(), unitCylinder=new T.CylinderGeometry(1,1,1,12);
const rounded=new Map<string,T.BufferGeometry>();
export function box(parent:T.Object3D,m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number,r=0){
  let geometry:T.BufferGeometry=unitBox;
  const bevel=r>=.004;
  if(bevel){
    const key=[w,h,d,r].join(',');
    // A tiny edge that occupies less than a pixel at game scale needs one
    // bevel segment; use two on CRT housings and the larger rounded shapes.
    geometry=rounded.get(key)??new RoundedBoxGeometry(w,h,d,r>=.025?2:1,Math.min(r,w/2,h/2,d/2));
    rounded.set(key,geometry);
  }
  const mesh=new T.Mesh(geometry,m);mesh.position.set(x,y,z);
  if(!bevel)mesh.scale.set(w,h,d);
  mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
  return mesh;
}
export function plate(parent:T.Object3D,m:T.Material,x:number,y:number,z:number,w:number,h:number,horizontal=false){
  const mesh=new T.Mesh(unitPlane,m);mesh.position.set(x,y,z);mesh.scale.set(w,h,1);
  if(horizontal)mesh.rotation.x=-Math.PI/2;
  mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function cylinder(parent:T.Object3D,m:T.Material,x:number,y:number,z:number,r:number,h:number){
  const mesh=new T.Mesh(unitCylinder,m);mesh.position.set(x,y,z);mesh.scale.set(r,h,r);
  mesh.receiveShadow=mesh.castShadow=true;parent.add(mesh);return mesh;
}
export function curve(parent:T.Object3D,m:T.Material,points:number[][],r=.008,segments=20){
  const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p[0],p[1],p[2])));
  const mesh=new T.Mesh(new T.TubeGeometry(path,segments,r,5,false),m);
  mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function group(parent:T.Object3D,x:number,y:number,z:number,name?:string){
  const g=new T.Group();if(name)g.name=name;g.position.set(x,y,z);parent.add(g);return g;
}

/** Merge solid details within one static group, not the whole map: no lost culling across rooms. */
export function consolidate(parent:T.Group,keep=new Set<T.Object3D>()){
  parent.updateMatrixWorld(true);
  const inv=parent.matrixWorld.clone().invert();
  const by=new Map<T.Material,{source:T.Mesh;geometry:T.BufferGeometry}[]>();
  parent.traverse(o=>{
    if(!(o instanceof T.Mesh)||o instanceof T.InstancedMesh||Array.isArray(o.material)||
      o.material.transparent&&o.material.name!=='Soft contact occlusion')return;
    for(let p:T.Object3D|null=o;p&&p!==parent;p=p.parent)if(keep.has(p))return;
    const m=o.material,list=by.get(m)??[];
    list.push({source:o,geometry:(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone())
      .applyMatrix4(new T.Matrix4().multiplyMatrices(inv,o.matrixWorld))});
    by.set(m,list);
  });
  for(const [m,list] of by){
    if(list.length<2){list.forEach(x=>x.geometry.dispose());continue;}
    const geometry=mergeGeometries(list.map(x=>x.geometry),false);
    list.forEach(x=>x.geometry.dispose());
    if(!geometry)continue;
    const mesh=new T.Mesh(geometry,m);
    mesh.castShadow=list.some(x=>x.source.castShadow);mesh.receiveShadow=list.some(x=>x.source.receiveShadow);
    list.forEach(x=>x.source.removeFromParent());parent.add(mesh);
  }
}

export function desk(p:T.Object3D,m:KitMaterials,w:number,d:number,seed:number,h=.79){
  const rng=random(seed);
  box(p,m.wood,0,h,0,w,.065,d,.014);
  box(p,m.paleWood,0,h-.003,d/2+.001,w,.044,.016,.004);
  box(p,m.veneer,0,h-.19,-d*.42,w-.14,.27,.031);
  for(const x of [-1,1])for(const z of [-1,1]){
    box(p,m.veneer,x*(w/2-.095),h*.47,z*(d/2-.084),.058,h-.11,.061,.006);
    box(p,m.dark,x*(w/2-.095),.018,z*(d/2-.084),.062,.035,.065,.004);
  }
  for(let i=0;i<8;i++){
    const length=.035+rng()*.14;
    box(p,m.paleWood,(rng()-.5)*(w-length),h+.033,(rng()-.5)*d,length,.0009,.0035);
  }
}

export function chair(p:T.Object3D,m:KitMaterials,seed:number){
  const rng=random(seed);
  box(p,m.steel,0,.414,0,.44,.052,.43,.021);
  box(p,m.upholstery,0,.454,.005,.425,.069,.408,.041);
  for(const x of [-1,1])for(const z of [-1,1]){
    const a=box(p,m.steel,x*.179,.219,z*.162,.029,.425,.031,.005);
    a.rotation.x=z*.082;a.rotation.z=-x*.08;
    box(p,m.dark,x*.196,.025,z*.174,.048,.035,.043,.006);
  }
  for(const x of [-1,1]){
    const a=box(p,m.steel,x*.168,.623,-.193,.026,.382,.038,.006);a.rotation.x=-.13;
  }
  const b=box(p,m.upholstery,0,.784,-.229,.395,.232,.067,.028);b.rotation.x=-.13;
  box(p,m.paleWood,(rng()-.5)*.21,.493,.072,.056,.004,.018);
}

export function filing(p:T.Object3D,m:KitMaterials,w:number,d:number,height:number,n=4){
  box(p,m.greenSteel,0,height*.5,0,w,height,d,.026);
  box(p,m.dark,0,.033,0,w*.92,.066,d*.94,.01);
  const y0=.08,dy=(height-y0-.055)/n;
  for(let i=0;i<n;i++){
    const y=y0+(i+.5)*dy,z=d/2;
    box(p,m.dark,0,y,z+.002,w-.047,dy-.006,.018,.006);
    box(p,i===n-1?m.steel:m.greenSteel,0,y,z+.014,w-.061,dy-.018,.017,.005);
    box(p,m.silver,0,y-.045,z+.042,w*.21,.016,.020,.004);
    for(const s of [-1,1])box(p,m.silver,s*w*.092,y-.043,z+.028,.012,.017,.025,.003);
    box(p,m.dark,0,y+.052,z+.025,w*.24,.037,.009,.002);
    plate(p,m.label(['A-'+(22+i)],'#444033','#9f957b',128,48),0,y+.052,z+.030,w*.20,.026);
    const nick=box(p,m.rust,(i%2===0?-.1:.16)*w,y+dy*.29,z+.024,w*.10,.012,.0018);nick.rotation.z=(i%2-.5)*.12;
  }
}

export function cardboard(p:T.Object3D,m:KitMaterials,x:number,y:number,z:number,w:number,h:number,d:number,label?:string){
  const g=group(p,x,y,z);box(g,m.paper,0,h/2,0,w,h,d,.009);
  box(g,m.paleWood,0,h-.013,0,w+.019,.027,d+.019,.004);
  box(g,m.clay,0,h+.003,0,w*.19,.003,d+.013);
  box(g,m.clay,0,h-.042,d/2+.002,w*.19,.085,.003);
  box(g,m.veneer,-w*.31,h*.64,d/2+.005,w*.18,.028,.003,.001);
  if(label)plate(g,m.label([label],'#514937','#bcb198',128,56),w*.19,h*.45,d/2+.006,w*.46,.057);
  return g;
}

export function paperStack(p:T.Object3D,m:KitMaterials,x:number,y:number,z:number,seed:number,label?:string){
  const rng=random(seed),pile=group(p,x,y,z);
  const mats=[m.paper,m.sage,m.clay,m.blue,m.paper];
  const pages=2+Math.floor(rng()*5);
  for(let i=0;i<pages;i++){
    const g=group(pile,(rng()-.5)*.029,i*.006,(rng()-.5)*.031);
    g.rotation.y=(rng()-.5)*.35;
    box(g,mats[(i+seed)%mats.length]!,0,.001,0,.218+rng()*.052,.004,.277+rng()*.028,.001);
  }
  const note=label??(seed%2===0?'ВХОДЯЩИЕ':'ОПИСЬ');
  const top=plate(pile,m.label([note,'··  ─────  ··',' ────   ─── '],'#564f42','#b1a88e',128,156),0,pages*.006+.001,0,.205,.277,true);
  top.rotation.z=(rng()-.5)*.10;
  return pile;
}

export function shelf(p:T.Object3D,m:KitMaterials,w:number,d:number,height:number,seed:number){
  const rng=random(seed);
  for(const x of [-1,1])for(const z of [-1,1]){
    box(p,m.greenSteel,x*(w/2-.016),height/2,z*(d/2-.018),.032,height,.036,.003);
    box(p,m.dark,x*(w/2-.016),.021,z*(d/2-.018),.047,.039,.049,.003);
  }
  const unit=(height-.13)/5;
  for(let row=0;row<5;row++){
    const y=.08+row*unit;
    box(p,m.steel,0,y,0,w,.042,d,.007);
    box(p,m.greenSteel,0,y-.029,d/2-.007,w,.044,.020,.004);
    if(row===4&&seed%2===0)continue;
    for(let k=0;k<3;k++){
      const cell=w/3;
      const x=-w/2+cell*(k+.5),z=(rng()-.5)*.07;
      if(rng()>.44)cardboard(p,m,x,y+.024,z,cell*.84,Math.min(.247,unit*.74),d*.78,row===2&&k===1?'Н-07':undefined);
      else for(let i=0;i<4;i++){
        const h=unit*(.48+rng()*.34),xx=x+(i-1.5)*cell*.15;
        box(p,[m.clay,m.sage,m.blue,m.paper][(row+k+i)%4]!,xx,y+.023+h/2,z,.035,h,d*.62,.004);
        box(p,m.paper,xx,y+.055+h*.55,z+d*.313,.028,.046,.002);
      }
    }
  }
  const brace=box(p,m.steel,0,height*.49,-d/2,Math.hypot(w,height)*.86,.018,.022);brace.rotation.z=.62;
}

export function phone(p:T.Object3D,m:KitMaterials,x:number,y:number,z:number){
  const g=group(p,x,y,z,'Rotary telephone');g.rotation.y=.20;
  box(g,m.dark,0,.032,0,.23,.056,.196,.028);
  const top=box(g,m.greenSteel,0,.071,-.006,.22,.060,.186,.033);top.rotation.x=.13;
  cylinder(g,m.dark,.024,.109,.023,.069,.014);cylinder(g,m.silver,.024,.122,.023,.064,.008);
  for(let i=0;i<10;i++){
    const a=(i+.7)*Math.PI*.179;
    cylinder(g,m.dark,.024+Math.sin(a)*.047,.127,.023+Math.cos(a)*.047,.011,.006);
  }
  cylinder(g,m.paper,.024,.129,.023,.026,.008);
  const receiver=group(g,-.078,.138,-.007);receiver.rotation.y=.16;
  curve(receiver,m.dark,[[0,-.003,-.083],[.001,.024,-.047],[.001,.031,0],[.001,.024,.047],[0,-.003,.083]],.018);
  for(const a of [-1,1])box(receiver,m.dark,0,-.009,a*.082,.061,.032,.047,.013);
  curve(g,m.dark,[[-.103,.038,-.09],[-.15,.018,-.13],[-.19,.016,-.12],[-.22,.012,-.05],[-.21,.011,.017]],.005);
  return g;
}

function screenSurface(w:number,h:number){
  const geo=new T.PlaneGeometry(w,h,18,14);
  const a=geo.attributes.position;
  for(let i=0;i<a.count;i++){
    const x=a.getX(i),y=a.getY(i),u=x/(w/2),v=y/(h/2);
    const bevel=(Math.abs(u)*Math.abs(v))**8*.037;
    a.setXYZ(i,x*(1-bevel),y*(1-bevel),.024*(1-u*u*.54-v*v*.63));
  }
  geo.computeVertexNormals();return geo;
}
export function crt(p:T.Object3D,m:KitMaterials,x:number,y:number,z:number,angle:number,screens:T.Mesh[]){
  const g=group(p,x,y,z,'4:3 CRT with curved glass');g.rotation.y=angle;
  box(g,m.dark,0,.029,-.015,.35,.045,.29,.017);
  box(g,m.beige,0,.286,-.056,.525,.444,.39,.041);
  box(g,m.beige,0,.292,-.255,.412,.386,.111,.036);
  box(g,m.keys,0,.285,.148,.547,.461,.063,.033);
  box(g,m.dark,0,.300,.184,.466,.358,.029,.021);
  const screen=new T.Mesh(screenSurface(.433,.322),new T.MeshBasicMaterial({name:'CRT curved phosphor',color:0x1b2925}));
  screen.position.set(0,.301,.197);g.add(screen);screens.push(screen);
  for(let i=0;i<11;i++){
    box(g,m.dark,-.153+i*.029,.509,-.071,.010,.004,.106,.001);
    if(i<9)box(g,m.dark,.263,.36-i*.023,-.117,.005,.010,.096,.001);
  }
  for(let i=0;i<5;i++)box(g,m.steel,.118+i*.025,.077,.186,.016,.012,.007,.003);
  box(g,m.led,.230,.077,.188,.013,.010,.009,.003);
  plate(g,m.label(['ДОЗОР · 04'], '#41392b','#998970',128,44),-.149,.081,.187,.145,.025);
  curve(g,m.dark,[[.13,.16,-.302],[.15,.04,-.366],[.20,.015,-.38],[.31,.009,-.33],[.42,.004,-.39]],.008);
  return g;
}

export function keyboard(p:T.Object3D,m:KitMaterials,x:number,y:number,z:number,angle:number){
  const g=group(p,x,y,z,'Sculpted ABS keyboard');g.rotation.y=angle;
  box(g,m.beige,0,.023,0,.48,.036,.177,.016);
  box(g,m.dark,-.052,.043,0,.348,.012,.134,.005);
  const counts=[14,14,13,12,8],keys=new T.InstancedMesh(unitBox,m.keys,61);
  const o=new T.Object3D(),rng=random(613);
  let n=0;
  for(let row=0;row<5;row++)for(let col=0;col<counts[row]!;col++){
    const w=row===4&&col===3?.076:.019;
    o.position.set(-.208+col*.024+(row%3)*.004+(row===4&&col>3?.054:0),.053,-.054+row*.026);
    o.scale.set(w,.012,.018);o.updateMatrix();keys.setMatrixAt(n,o.matrix);
    keys.setColorAt(n++,new T.Color().setScalar(.79+rng()*.20));
  }
  keys.instanceMatrix.needsUpdate=true;keys.count=n;keys.receiveShadow=true;g.add(keys);
  for(let i=0;i<3;i++)box(g,m.led,.157+i*.024,.043,-.051,.012,.005,.007,.001);
  curve(g,m.dark,[[.13,.028,-.081],[.14,.022,-.119],[.166,.011,-.168],[.142,.010,-.22]],.0045);
  return g;
}

export function vcr(p:T.Object3D,m:KitMaterials,x:number,y:number,z:number){
  const g=group(p,x,y,z,'Cassette recorder and real tape slot');
  box(g,m.dark,0,.051,0,.51,.102,.33,.011);
  box(g,m.steel,0,.052,.169,.502,.089,.018,.004);
  box(g,m.dark,-.085,.056,.179,.288,.038,.006,.003);
  box(g,m.silver,-.085,.069,.183,.262,.008,.003);
  for(let i=0;i<5;i++)box(g,m.dark,.082+i*.031,.037,.185,.023,.017,.01,.003);
  box(g,m.led,.187,.067,.185,.044,.015,.011,.003);
  for(let i=0;i<7;i++)box(g,m.steel,-.18+i*.031,.103,-.104,.013,.002,.062);
  return g;
}

export function cassette(p:T.Object3D,m:KitMaterials,x:number,y:number,z:number,seed:number,label='VHS'){
  const g=group(p,x,y,z);g.rotation.y=(random(seed)()-.5)*.71;
  box(g,m.dark,0,.014,0,.190,.029,.105,.007);
  plate(g,m.label([label], '#4d3828','#ad9f84',128,52),0,.030,.021,.147,.034,true);
  for(const s of [-1,1]){
    cylinder(g,m.steel,s*.049,.030,-.022,.015,.003);cylinder(g,m.dark,s*.049,.033,-.022,.006,.003);
  }
  return g;
}
