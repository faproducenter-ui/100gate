import * as T from 'three';

/** Local artwork: seeded grain and ceramic wear, shared by the four rooms. */
export function random(seed:number){
  return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
}

export function artTexture(w:number,h:number,paint:(g:CanvasRenderingContext2D)=>void,srgb=true){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const g=canvas.getContext('2d')!;
  paint(g);
  const texture=new T.CanvasTexture(canvas);
  texture.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;
  texture.anisotropy=4;
  return texture;
}

type Surface='ceramic'|'plaster'|'wood'|'metal'|'paper'|'plastic'|'cloth';
type Pass='color'|'normal'|'rough';
function surface(kind:Surface,pass:Pass) {
  const size=256;
  return artTexture(size,size,g=>{
    const rng=random(18483+kind.length*787);
    const grid=Array.from({length:64},rng);
    const field=(x:number,y:number)=>{
      const i=Math.floor(x/32),j=Math.floor(y/32);
      const at=(a:number,b:number)=>grid[((j+b)%8)*8+(i+a)%8]!;
      const u=(x%32)/32,v=(y%32)/32;
      const a=u*u*(3-2*u),b=v*v*(3-2*v);
      return (at(0,0)*(1-a)+at(1,0)*a)*(1-b)+(at(0,1)*(1-a)+at(1,1)*a)*b;
    };
    const bitmap=g.createImageData(size,size),heights=new Float32Array(size*size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const n=rng()-.5, cloud=field(x,y)-.5;
      const grain=Math.sin((y+cloud*3.7)*.62)*.55+Math.sin(y*2.81)*.14+Math.sin((y+cloud)*1.31)*.16;
      const pore=rng();
      const fine=kind==='wood'?cloud*14+grain*20+n*19:
        kind==='ceramic'?cloud*18+n*19-(pore<.013?21:0):
        kind==='plaster'?cloud*32+n*24-(pore<.019?33:0):
        kind==='metal'?cloud*30+n*15+Math.sin(y*1.9)*3:
        kind==='cloth'?cloud*9+Math.sin(x*2)*5+Math.sin(y*2)*6+n*9:cloud*17+n*17;
      heights[y*size+x]=fine;
    }
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const at=(y*size+x)*4,a=heights[y*size+x]!;
      if(pass==='normal'){
        const dx=(heights[y*size+((x+size-1)%size)]!-heights[y*size+((x+1)%size)]!)*.023;
        const dy=(heights[((y+1)%size)*size+x]!-heights[((y+size-1)%size)*size+x]!)*.023;
        const l=Math.hypot(dx,dy,1);
        bitmap.data[at]=128+dx/l*127;bitmap.data[at+1]=128+dy/l*127;bitmap.data[at+2]=128+127/l;
      }else{
        const value=pass==='rough'?233-a*.77:224+a;
        bitmap.data[at]=value;bitmap.data[at+1]=value;bitmap.data[at+2]=value;
      }
      bitmap.data[at+3]=255;
    }
    g.putImageData(bitmap,0,0);
    if(pass!=='color')return;
    if(kind==='wood'){
      // Small wormholes and long dark fibers that don't look like grayscale noise.
      for(let i=0;i<185;i++){
        const x=rng()*size,y=rng()*size,w=2+rng()*34;
        g.strokeStyle=i%5===0?'#f2f1ea55':'#3d2b1b26';g.lineWidth=i%11===0?1.3:.4;
        g.beginPath();g.moveTo(x,y);g.bezierCurveTo(x+w*.3,y+1,x+w*.7,y-1.2,x+w,y+.3);g.stroke();
      }
    }else if(kind==='ceramic'||kind==='metal'||kind==='plaster'){
      for(let i=0;i<95;i++){
        const x=rng()*size,y=rng()*size,w=rng()*8;
        g.strokeStyle=i%3===0?'#f8f1e649':'#30281725';g.lineWidth=.2+rng()*.7;
        g.beginPath();g.moveTo(x,y);g.lineTo(x+w,y+w*.23);g.stroke();
      }
    }
  },pass==='color');
}

export function materials(){
  const pair=(kind:Surface)=>[surface(kind,'color'),surface(kind,'normal'),surface(kind,'rough')] as const;
  const skins:Record<Surface,readonly [T.Texture,T.Texture,T.Texture]>={
    ceramic:pair('ceramic'),plaster:pair('plaster'),wood:pair('wood'),metal:pair('metal'),
    paper:pair('paper'),plastic:pair('plastic'),cloth:pair('cloth'),
  };
  const mat=(name:string,color:number,roughness:number,kind?:Surface,metalness=0)=>{
    const pair=kind?skins[kind]:undefined;
    const relief=kind==='plaster'?.35:kind==='wood'?.27:kind==='cloth'?.22:.17;
    return new T.MeshStandardMaterial({name,color,roughness,metalness,map:pair?.[0],normalMap:pair?.[1],
      normalScale:new T.Vector2(relief,relief),roughnessMap:pair?.[2]});
  };
  const labelCache=new Map<string,T.Material>();
  const label=(lines:string[],color='#282b24',background='#b3a58d',width=256,height=128)=>{
    const key=JSON.stringify([lines,color,background,width,height]);
    const prior=labelCache.get(key);if(prior)return prior;
    const m=new T.MeshStandardMaterial({name:lines.join(' '),roughness:.87,map:artTexture(width,height,g=>{
      g.fillStyle=background;g.fillRect(0,0,width,height);
      g.strokeStyle=color;g.globalAlpha=.51;g.lineWidth=2;g.strokeRect(5,5,width-10,height-10);
      g.globalAlpha=1;g.fillStyle=color;g.textAlign='center';g.textBaseline='middle';
      const spacing=(height-15)/Math.max(lines.length,1);
      g.font='600 '+Math.max(8,Math.floor(spacing*.64))+'px monospace';
      lines.forEach((line,i)=>g.fillText(line,width/2,7.5+spacing*(i+.5),width-23));
      const rng=random(988*width+height);
      for(let i=0;i<58;i++){g.globalAlpha=.08;g.fillRect(rng()*width,rng()*height,1+rng()*4,1+rng()*2);}
    })});
    labelCache.set(key,m);return m;
  };
  const shadowTex=artTexture(64,64,g=>{
    const grad=g.createRadialGradient(32,32,0,32,32,32);
    grad.addColorStop(0,'rgba(8,7,6,.57)');grad.addColorStop(.5,'rgba(8,7,6,.33)');grad.addColorStop(1,'rgba(8,7,6,0)');
    g.fillStyle=grad;g.fillRect(0,0,64,64);
  });
  const shadow=new T.MeshBasicMaterial({name:'Soft contact occlusion',map:shadowTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  return {
    label,shadow,
    plaster:mat('Chalk plaster',0xbab6a7,.93,'plaster'),
    paint:mat('Worn lower sage enamel',0x59675c,.68,'plaster'),
    trim:mat('Flaking skirting',0x40372d,.89,'wood'),
    ceiling:mat('Exposed wall cut',0x30302c,.95,'plaster'),
    grout:mat('Charcoal mineral grout',0x393631,.96,'plaster'),
    floor:mat('Glazed square stone',0xffffff,.71,'ceramic'),
    wood:mat('Worn oak veneer',0x745537,.66,'wood'),
    paleWood:mat('Scraped birch edges',0x8c714d,.73,'wood'),
    veneer:mat('Tobacco veneer',0x523c2c,.76,'wood'),
    rust:mat('Rust blooms',0x6b4330,.83,'metal',.23),
    steel:mat('Oiled grey steel',0x625f51,.57,'metal',.35),
    greenSteel:mat('Oxidized cabinet enamel',0x3c4742,.65,'metal',.34),
    dark:mat('Rubber and blackened steel',0x272824,.83,'plastic'),
    silver:mat('Tarnished alloy',0x999181,.45,'metal',.53),
    beige:mat('Yellowed ABS',0xb2a180,.64,'plastic'),
    keys:mat('Keycaps',0xcebb93,.59,'plastic'),
    clay:mat('Tobacco binder',0x83594d,.88,'paper'),
    paper:mat('Uncoated office stock',0xbfb49b,.94,'paper'),
    sage:mat('Olive binder',0x6b725c,.85,'paper'),
    blue:mat('Indigo archive cloth',0x475665,.86,'cloth'),
    upholstery:mat('Cracked green upholstery',0x495746,.82,'cloth'),
    tape:mat('PVC tape',0x333b3e,.42,'plastic'),
    led:new T.MeshStandardMaterial({name:'Recorded indicator',color:0x8d4233,emissive:0xaf1b0d,emissiveIntensity:.64,roughness:.43}),
    glass:new T.MeshStandardMaterial({name:'Toned frosted window',color:0x415258,roughness:.29,metalness:.08,emissive:0x172b31,emissiveIntensity:.48}),
    lamp:new T.MeshStandardMaterial({name:'Warm cloudy bulb',color:0xe2bc75,emissive:0xb78642,emissiveIntensity:.5,roughness:.42}),
  };
}
export type KitMaterials=ReturnType<typeof materials>;
