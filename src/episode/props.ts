import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PropId } from './pack';

export const material = (color:number,roughness=.7,metalness=0) => new T.MeshStandardMaterial({color,roughness,metalness});
export function piece(g:T.Object3D,geo:T.BufferGeometry,mat:T.Material,x=0,y=0,z=0) {
  const o=new T.Mesh(geo,mat);o.position.set(x,y,z);g.add(o);return o;
}
export function soft(g:T.Object3D,mat:T.Material,x:number,y:number,z:number,w:number,h:number,d:number,r=.008) {
  return piece(g,new RoundedBoxGeometry(w,h,d,1,r),mat,x,y,z);
}
export function disc(g:T.Object3D,mat:T.Material,r:number,h:number,x=0,y=0,z=0,segments=20) {
  return piece(g,new T.CylinderGeometry(r,r,h,segments),mat,x,y,z);
}
export function art(w:number,h:number,draw:(c:CanvasRenderingContext2D)=>void) {
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d')!);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;
}
export function weave(color:string,thread:string) {
  const t=art(128,128,c=>{c.fillStyle=color;c.fillRect(0,0,128,128);
    for(let y=0;y<128;y+=2)for(let x=0;x<128;x+=2){c.fillStyle=(x+y)%4?thread:'#00000025';c.fillRect(x,y,(x+y)%4?2:1,(x+y)%4?1:2);}
    for(let i=0;i<180;i++){const v=Math.sin(i*93.73)*43758;c.fillStyle=i%2?'#eee2ca19':'#090b0c20';c.fillRect(((v%1+1)%1)*128,(i*73)%128,2,1);}
  });t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(2,3);return t;
}
function plate(g:T.Object3D,w:number,h:number,x:number,y:number,z:number,map:T.Texture,lit=true) {
  return piece(g,new T.PlaneGeometry(w,h),lit?new T.MeshStandardMaterial({map,roughness:.88,side:T.DoubleSide}):new T.MeshBasicMaterial({map,side:T.DoubleSide}),x,y,z);
}
export function makeProp(id:PropId) {
  const g=new T.Group();g.name=id;
  const dark=material(0x202524,.73),metal=material(0x758382,.35,.72),brass=material(0xb08845,.39,.65),paper=material(0xd2c9aa,.94);
  if(id==='bag'){
    const canvas=material(0xaaa28a,.97);canvas.map=weave('#817551','#a692683c');canvas.bumpMap=canvas.map;canvas.bumpScale=.008;
    const trim=material(0x4e3526,.67);
    soft(g,canvas,0,.125,0,.43,.25,.265,.045);
    soft(g,canvas,0,.175,.135,.389,.132,.052,.023).rotation.x=.08;
    for(const x of [-.122,.122]){
      soft(g,trim,x,.13,.163,.028,.148,.013);
      soft(g,brass,x,.115,.175,.043,.033,.014);
      soft(g,trim,x,.041,.136,.032,.043,.024);
    }
    const handle=piece(g,new T.TorusGeometry(.094,.012,6,20,Math.PI),trim,0,.241,0);
    handle.scale.y=.54;
    const tag=art(192,76,c=>{c.fillStyle='#baa984';c.fillRect(0,0,192,76);c.strokeStyle='#79694e';c.strokeRect(5,5,182,66);c.fillStyle='#473f34';c.font='bold 27px Georgia';c.textAlign='center';c.fillText('А. СОКОЛОВ',96,46);});
    plate(g,.103,.041,0,.176,.164,tag);
    return g;
  }
  if(id==='phone'){
    soft(g,dark,0,0,0,.078,.15,.015,.009);
    soft(g,metal,0,0,-.003,.075,.147,.008,.008);
    soft(g,dark,.04,.023,0,.004,.026,.007);
    const screen=art(180,360,c=>{
      const bg=c.createLinearGradient(0,0,170,360);bg.addColorStop(0,'#243d47');bg.addColorStop(1,'#111c24');c.fillStyle=bg;c.fillRect(0,0,180,360);
      c.textAlign='center';c.fillStyle='#c6d8d5';c.font='10px sans-serif';c.fillText('НЕТ СЕТИ  •  17%',90,21);c.font='48px sans-serif';c.fillText('03:17',90,107);
      c.fillStyle='#a7c3c31e';c.fillRect(10,147,160,75);c.fillStyle='#d7e3d6';c.font='bold 15px sans-serif';c.fillText('ВЕРА',90,170);c.font='11px sans-serif';c.fillText('Ищи мастерскую.',90,196);c.fillText('Смотри на компас.',90,210);c.fillRect(69,345,42,2);
    });
    plate(g,.064,.132,0,0,.008,screen,false);
    return g;
  }
  if(id==='compass'){
    const rim=material(0x947853,.43,.65),red=material(0xb53c33,.65),ivory=material(0xd2d6c6,.66);
    disc(g,rim,.047,.018).rotation.x=Math.PI/2;disc(g,dark,.042,.019).rotation.x=Math.PI/2;
    const face=art(256,256,c=>{c.fillStyle='#233133';c.fillRect(0,0,256,256);c.translate(128,128);c.strokeStyle='#c1ad7b';
      for(let i=0;i<36;i++){c.rotate(Math.PI/18);c.lineWidth=i%3===0?2.5:1;c.beginPath();c.moveTo(0,-118);c.lineTo(0,i%3===0?-98:-109);c.stroke();}
      c.fillStyle='#f5dba3';c.textAlign='center';c.font='bold 25px Georgia';for(const [i,label] of ['N','E','S','W'].entries()){const a=i*Math.PI/2;c.fillText(label,Math.sin(a)*82,-Math.cos(a)*82+8);}
    });piece(g,new T.CircleGeometry(.041,32),new T.MeshBasicMaterial({map:face}),0,0,.01);
    const needle=new T.Group();needle.name='needle';needle.position.z=.011;g.add(needle);
    for(const sign of [-1,1]){
      const geo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([-.006,0,0,.006,0,0,0,.032*sign,0],3));
      const mat=sign>0?red:ivory;mat.side=T.DoubleSide;geo.computeVertexNormals();piece(needle,geo,mat);
    }
    const pin=disc(g,brass,.004,.006,0,0,.013);pin.rotation.x=Math.PI/2;
    const loop=piece(g,new T.TorusGeometry(.009,.002,6,12),brass,0,.05,0);loop.rotation.z=.15;
    return g;
  }
  if(id==='book'||id==='notebook'||id==='sheet'){
    const isBook=id==='book',isSheet=id==='sheet',w=isSheet?.15:isBook?.13:.1,h=isSheet?.21:isBook?.19:.155,d=isSheet?.001:isBook?.022:.013;
    const cover=material(isBook?0x463429:0x4a5044,.93);
    if(!isSheet){
      soft(g,paper,0,0,0,w-.008,h-.008,d,.003);
      for(const side of [-1,1])soft(g,cover,0,0,side*(d/2+.001),w,h,.004,.002);
      soft(g,cover,-w/2+.004,0,0,.008,h,d+.005,.003);
      for(let i=0;i<5;i++)soft(g,material(0xa99e83,.98),w/2-.004,0,-d/2+.002+i*d/5,.001,h-.014,.0007,.0002);
    }
    const page=art(256,360,c=>{
      c.fillStyle=isSheet?'#c6bc9e':isBook?'#493728':'#646752';c.fillRect(0,0,256,360);
      for(let i=0;i<1200;i++){c.fillStyle=i%2?'#e0cfaa27':'#2c201d29';c.fillRect((i*187)%256,(i*i*71)%360,1+i%5,1);}
      if(isSheet){c.strokeStyle='#8e7f5d';c.lineWidth=1;for(let y=31;y<340;y+=18){c.beginPath();c.moveTo(23,y);c.lineTo(231,y);c.stroke();}}
      else {c.strokeStyle=isBook?'#ad915b':'#b2a883';c.lineWidth=2;c.strokeRect(12,13,232,334);}
      c.textAlign='center';c.fillStyle=isSheet?'#695944':'#e0c696';c.font='bold 20px Georgia';c.fillText(isSheet?'мастерская':isBook?'ОСТРОВ':'ПОЛЕВЫЕ',128,123);c.fillText(isSheet?'за домом':isBook?'СОКРОВИЩ':'ЗАПИСИ',128,153);
      if(!isSheet){c.font='16px Georgia';c.fillText(isBook?'Р. Л. Стивенсон':'А. Соколов',128,305);}
    });
    plate(g,isSheet?w:w-.012,isSheet?h:h-.013,0,0,isSheet?0:d/2+.0033,page);
    return g;
  }
  if(id==='pen'){
    disc(g,material(0x274e77,.37),.006,.12);
    disc(g,material(0x142e4d,.37),.0075,.046,0,.053);
    soft(g,metal,.008,.052,0,.004,.034,.004,.002);
    piece(g,new T.ConeGeometry(.0045,.015,12),metal,0,-.067,0).rotation.z=Math.PI;
    g.rotation.z=-.38;
    return g;
  }
  if(id==='candy'){
    const amber=material(0xb26b32,.32,.15),wrapper=material(0x91543b,.4,.52);
    soft(g,amber,0,0,0,.04,.023,.02,.009);
    for(const x of [-1,1])piece(g,new T.ConeGeometry(.014,.026,6),wrapper,x*.024,0,0).rotation.z=x*Math.PI/2;
    soft(g,wrapper,0,.009,0,.041,.008,.025,.003);
    return g;
  }
  if(id==='water'){
    const shell=new T.MeshPhysicalMaterial({color:0x9bc6c4,roughness:.25,transparent:true,opacity:.29,depthWrite:false,clearcoat:.7});
    const bottle=piece(g,new T.LatheGeometry([[0,-.09],[.028,-.09],[.036,-.08],[.036,.052],[.033,.068],[.017,.085],[.017,.105],[0,.105]].map(p=>new T.Vector2(...p)),24),shell);
    bottle.renderOrder=2;
    const water=disc(g,new T.MeshStandardMaterial({color:0x769d9d,roughness:.36,transparent:true,opacity:.68,depthWrite:false}),.031,.13,0,-.018);water.name='water-level';water.renderOrder=1;
    const label=art(192,64,c=>{c.fillStyle='#c0c8ae';c.fillRect(0,0,192,64);c.fillStyle='#365a55';c.fillRect(0,43,192,8);c.font='bold 20px sans-serif';c.textAlign='center';c.fillText('РОДНИК',96,30);});
    const band=new T.MeshStandardMaterial({map:label,roughness:.8});
    piece(g,new T.CylinderGeometry(.0364,.0364,.044,24,1,true),band,0,.009).rotation.y=Math.PI/2;
    const cap=disc(g,material(0x375e60,.64),.02,.027,0,.109,0,16);
    for(let i=0;i<16;i++){const a=i*Math.PI/8;soft(cap,dark,Math.cos(a)*.019,0,Math.sin(a)*.019,.0025,.017,.0025,.0008);}
    return g;
  }
  if(id==='flashlight'){
    disc(g,dark,.026,.158).rotation.x=Math.PI/2;
    disc(g,metal,.038,.043,0,0,-.083).rotation.x=Math.PI/2;
    for(const z of [-.06,-.049,.046,.058,.068])disc(g,metal,.027,.004,0,0,z).rotation.x=Math.PI/2;
    disc(g,material(0xb6cad1,.25,.45),.033,.004,0,0,-.106).rotation.x=Math.PI/2;
    soft(g,dark,0,.027,-.022,.024,.012,.02);
    return g;
  }
  if(id==='knife'){
    soft(g,material(0x483024,.8),0,-.024,0,.026,.092,.017,.006);
    const shape=new T.Shape().moveTo(-.013,.02).lineTo(-.015,.126).quadraticCurveTo(.003,.125,.019,.161).lineTo(.022,.023).closePath();
    piece(g,new T.ExtrudeGeometry(shape,{depth:.002,bevelEnabled:true,bevelSize:.002,bevelThickness:.001,bevelSegments:1,steps:1,curveSegments:8}),metal);
    for(const y of [-.05,-.014])disc(g,brass,.003,.018,0,y).rotation.x=Math.PI/2;
    return g;
  }
  if(id==='key'){
    piece(g,new T.TorusGeometry(.018,.004,6,16),brass,0,.015,0);
    soft(g,brass,0,-.023,0,.012,.049,.006,.002);
    for(const y of [-.032,-.044])soft(g,brass,.009,y,0,.017,.008,.006,.002);
    return g;
  }
  disc(g,paper,.014,.058);for(const y of [-.031,.031])disc(g,metal,.015,.012,0,y);
  return g;
}
