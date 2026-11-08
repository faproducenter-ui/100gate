import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { material, piece } from './props';
import type { Settings } from './data';

const vertex=`
varying vec3 vWorld;
void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`;
const noise=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+1.0),u.x),u.y);}
`;
function random(seed:number){return ()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};}
export function createWeather(scene:T.Scene,mudMaps:T.Texture[],assets:{workshop:T.Object3D;bench:T.Object3D;fir:T.Object3D;pine:T.Object3D}){
  const exterior=new T.Group();exterior.name='Weather and exterior';exterior.userData.noInteraction=true;scene.add(exterior);
  const rand=random(714);
  const sky=new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:{uTime:{value:0},uFlash:{value:0},uSnow:{value:0}},
    vertexShader:vertex,fragmentShader:`
      varying vec3 vWorld;uniform float uTime,uFlash,uSnow;${noise}
      void main(){
        vec3 d=normalize(vWorld-vec3(0.,1.,-14.));
        float horizon=pow(1.-max(d.y,0.),2.3);
        vec3 color=mix(vec3(.018,.032,.058),vec3(.19,.27,.294),horizon);
        vec2 p=d.xz/(.47+max(d.y,0.))*3.6+vec2(uTime*.026,-uTime*.009);
        float clouds=noise2(p)*.52+noise2(p*2.03)*.26+noise2(p*4.17)*.14+noise2(p*8.2)*.08;
        vec3 moon=normalize(vec3(-.09,.22,-1.0));
        float md=max(dot(d,moon),0.);
        float haze=pow(md,27.)*.18;
        float orb=smoothstep(.99973,.99982,md);
        color=mix(color,color*.46+vec3(.025,.037,.042)+haze*.29,smoothstep(.35,.70,clouds));
        color+=vec3(.59,.76,.89)*(haze+orb*(1.-smoothstep(.4,.71,clouds))*.95);
        color=mix(color,color*.78+vec3(.035,.04,.046),uSnow*.75);
        color+=uFlash*vec3(.31,.41,.56);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const dome=piece(exterior,new T.SphereGeometry(77,28,16),sky,0,1,-14);dome.renderOrder=10;
  const grassFloor=material(0x3d4b39,.97);grassFloor.map=mudMaps[0];grassFloor.normalMap=mudMaps[1];grassFloor.normalScale.set(.35,.35);
  const ground=piece(exterior,new T.PlaneGeometry(97,100),grassFloor,5,-.13,-14);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;
  const roadMaterial=material(0x716956,.61);roadMaterial.map=mudMaps[0].clone();roadMaterial.normalMap=mudMaps[1].clone();
  roadMaterial.map.repeat.set(5,2);roadMaterial.normalMap.repeat.set(5,2);roadMaterial.normalScale.set(.7,.7);
  const road=new T.Shape();road.moveTo(7,-1.38);road.bezierCurveTo(14,-1.8,22,-.26,31,1.15);road.bezierCurveTo(38,2.2,43,2.3,48,2.4);road.lineTo(48,5.1);road.bezierCurveTo(36,4.55,26,3.74,18,2.0);road.bezierCurveTo(12,1.2,8,1.9,7,1.64);road.closePath();
  const roadGeo=new T.ShapeGeometry(road,16);const roadPos=roadGeo.attributes.position;const roadUV=roadGeo.attributes.uv;
  for(let i=0;i<roadUV.count;i++)roadUV.setXY(i,(roadPos.getX(i)-7)/41,roadPos.getY(i)/6);
  const lane=piece(exterior,roadGeo,roadMaterial,0,-.115,-33);lane.rotation.x=-Math.PI/2;lane.receiveShadow=true;
  const trackMat=material(0x4c473b,.84);trackMat.map=roadMaterial.map;trackMat.normalMap=roadMaterial.normalMap;
  const tracks:T.Mesh[]=[];
  for(const off of [-.83,.79]){
    const line=new T.Shape();line.moveTo(7,off-.11);line.quadraticCurveTo(18,off-.32,37,off+2.85);line.lineTo(37,off+3.1);line.quadraticCurveTo(18,off-.06,7,off+.14);
    const path=piece(exterior,new T.ShapeGeometry(line,24),trackMat,0,-.11,-33);path.rotation.x=-Math.PI/2;tracks.push(path);
  }
  const waterSimple=new T.ShaderMaterial({
    uniforms:{uTime:{value:0},uSnow:{value:0}},vertexShader:vertex,fragmentShader:`
    varying vec3 vWorld;uniform float uTime,uSnow;
    void main(){
      vec3 view=normalize(cameraPosition-vWorld);
      float ripple=sin(length(fract(vWorld.xz*.73)-.5)*90.-uTime*9.)*sin(vWorld.x*37.+vWorld.z*61.);
      float f=pow(1.-clamp(view.y+.012*ripple,0.,1.),3.);
      vec3 c=mix(vec3(.028,.032,.029),vec3(.215,.29,.33),f);
      c+=ripple*.013*(1.-uSnow);
      gl_FragColor=vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  function puddleGeom(r:number,s:number){
    const shape=new T.Shape();
    for(let i=0;i<=36;i++){const a=i/36*Math.PI*2,q=1+Math.sin(3*a+.9)*.11+Math.sin(7*a-.8)*.06;const x=Math.cos(a)*r*q,y=Math.sin(a)*s*q;if(i)shape.lineTo(x,y);else shape.moveTo(x,y);}
    return new T.ShapeGeometry(shape);
  }
  const mirrorGeo=puddleGeom(1.65,.37);
  const first=piece(exterior,mirrorGeo,waterSimple,12.45,-.098,-33.14);first.rotation.x=-Math.PI/2;
  const reflectorShader={
    uniforms:{color:{value:new T.Color()},tDiffuse:{value:null},textureMatrix:{value:new T.Matrix4()},uTime:{value:0}},
    vertexShader:`uniform mat4 textureMatrix;varying vec4 vUv;void main(){vUv=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
      uniform sampler2D tDiffuse;uniform float uTime;varying vec4 vUv;
      void main(){
        vec2 uv=vUv.xy/vUv.w;
        vec2 wave=vec2(sin(uv.y*175.+uTime*3.1),cos(uv.x*192.-uTime*3.6))*.0014;
        vec3 c=texture2D(tDiffuse,uv+wave).rgb*.73+vec3(.024,.041,.047);
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  };
  const mirror=new Reflector(mirrorGeo.clone(),{textureWidth:384,textureHeight:224,multisample:0,clipBias:.004,shader:reflectorShader});mirror.rotation.x=-Math.PI/2;mirror.position.copy(first.position);mirror.position.y+=.002;mirror.visible=false;exterior.add(mirror);
  const pools:T.Mesh[]=[];
  for(const [x,z,w,h] of [[9.2,-32.4,.84,.32],[15.85,-33.47,1.19,.33],[20,-33.28,1.44,.34],[25.9,-34.24,2,.31],[18.1,-34.6,.69,.16]]){
    const pool=piece(exterior,puddleGeom(w,h),waterSimple,x,-.103,z);pool.rotation.x=-Math.PI/2;pool.rotation.z=rand()*.29-.145;pools.push(pool);
  }
  // The distant grass, trees and rain stay outside the house; only the weather clock moves them.
  const grassGeo=new T.BufferGeometry(),blades:number[]=[];
  for(let i=0;i<6;i++){
    const a=i*2.4,co=Math.cos(a),si=Math.sin(a),h=.14+rand()*.15,w=.008+rand()*.010,bend=.04+rand()*.12,origin=(rand()-.5)*.09;
    function point(t:number,sign:number){const width=w*(1-t)*sign;return [co*(t*t*bend+origin)+si*width,h*t,si*(t*t*bend+origin)-co*width];}
    for(let j=0;j<4;j++){const p=j/4,q=(j+1)/4;blades.push(...point(p,-1),...point(p,1),...point(q,-1));if(j<3)blades.push(...point(p,1),...point(q,1),...point(q,-1));}
  }
  grassGeo.setAttribute('position',new T.Float32BufferAttribute(blades,3));
  const grassShader=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{uTime:{value:0},uSnow:{value:0}},vertexShader:`
    uniform float uTime;varying float vHeight,vDistance,vHue;
    void main(){
      vec4 root=instanceMatrix*vec4(0.,0.,0.,1.);vec4 p=instanceMatrix*vec4(position,1.);
      float sway=sin(uTime*2.2+root.x*.4+root.z*.27)+sin(uTime*4.2-root.z*.6)*.3;
      p.x+=position.y*position.y*sway*.93;p.z+=position.y*.063*sway;
      vec4 mv=modelViewMatrix*p;vHeight=position.y;vDistance=length(mv.xyz);vHue=sin(root.x*7.7+root.z*2.9)*.5+.5;gl_Position=projectionMatrix*mv;
    }`,fragmentShader:`
    uniform float uSnow;varying float vHeight,vDistance,vHue;
    void main(){
      vec3 c=mix(vec3(.012,.018,.013),mix(vec3(.050,.077,.044),vec3(.104,.117,.063),vHue),vHeight*3.2);
      c=mix(c,vec3(.37,.42,.44),uSnow*smoothstep(.14,.29,vHeight));
      c=mix(c,vec3(.075,.109,.118),1.-exp(-vDistance*.024));
      gl_FragColor=vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const grass=new T.InstancedMesh(grassGeo,grassShader,1650),dummy=new T.Object3D();exterior.add(grass);
  let used=0;
  for(let i=0;i<2500&&used<grass.instanceMatrix.count;i++){
    const x=7.2+rand()*35,z=-42+rand()*18,roadZ=-33-Math.max(0,x-18)*.115;
    if(Math.abs(z-roadZ)<1.85||Math.sin(x*1.3+z*.6)*Math.sin(z*.76)>.54)continue;
    dummy.position.set(x,-.124,z);dummy.rotation.set(0,rand()*Math.PI*2,0);const size=.56+rand()*.95;dummy.scale.set(size,size,size);dummy.updateMatrix();grass.setMatrixAt(used++,dummy.matrix);
  }
  grass.count=used;grass.instanceMatrix.needsUpdate=true;
  function grove(asset:T.Object3D,placements:number[][]){
    const group=new T.Group(),cloud:T.InstancedMesh[]=[];exterior.add(group);asset.updateMatrixWorld(true);
    const transforms=placements.map(([x,z,size])=>{dummy.position.set(x,-.12,z);dummy.rotation.set(0,rand()*Math.PI*2,0);dummy.scale.setScalar(size);dummy.updateMatrix();return dummy.matrix.clone();});
    asset.traverse(o=>{if(o instanceof T.Mesh){
      const mesh=new T.InstancedMesh(o.geometry,o.material,placements.length);
      mesh.receiveShadow=true;mesh.castShadow=true;
      transforms.forEach((m,i)=>mesh.setMatrixAt(i,m.clone().multiply(o.matrixWorld)));
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);cloud.push(mesh);
    }});
    return {group,cloud};
  }
  const north=[grove(assets.fir,[[-3.9,-10.6,1.23],[4.5,-12.5,1.42],[-8,-15,1.28]]),grove(assets.pine,[[1.9,-15.6,1.35],[8,-14.9,1.64]])];
  const yard=[grove(assets.fir,[[9.1,-38.4,1.08],[14,-27.4,1.3],[19,-40,1.3],[26,-27,1.12],[29,-40,1.34],[33,-29,1.29]]),
    grove(assets.pine,[[11.4,-41.4,1.42],[16.85,-37.6,1.19],[25,-34.3,1.45],[29,-29.1,1.54],[37,-38,1.46],[40,-44,1.39]])];
  // Rain and snow are shader-driven, with two bounded outdoor volumes, not individual game objects.
  const drops=new T.BufferGeometry(),pts:number[]=[],corners:number[]=[],region:number[]=[];
  for(let i=0;i<1800;i++){
    const xyz=[rand(),rand(),rand()];
    pts.push(...xyz,...xyz);corners.push(0,1);region.push(i%2,i%2);
  }
  drops.setAttribute('position',new T.Float32BufferAttribute(pts,3));drops.setAttribute('tip',new T.Float32BufferAttribute(corners,1));drops.setAttribute('region',new T.Float32BufferAttribute(region,1));
  const rainMat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0},uSnow:{value:0}},vertexShader:`
    uniform float uTime,uSnow;attribute float tip,region;varying float vAlpha;
    void main(){
      float phase=fract(position.y-uTime*mix(.97,.15,uSnow));
      float x=fract(position.x+uTime*.038)*mix(14.,29.,region)+mix(-7.,7.6,region);
      float z=position.z*mix(11.,19.,region)+mix(-16.,-43.,region);
      float y=phase*mix(7.,8.4,region)+mix(3.55,.02,region);
      vec3 p=vec3(x+tip*mix(.13,.017,uSnow),y+tip*mix(.25,.021,uSnow),z);
      vec4 mv=modelViewMatrix*vec4(p,1.);
      vAlpha=mix(.18,.57,uSnow)*(1.-smoothstep(2.,28.,length(mv.xyz)))*(.4+position.x*.6);
      gl_Position=projectionMatrix*mv;
    }`,fragmentShader:`varying float vAlpha;void main(){gl_FragColor=vec4(.54,.68,.74,vAlpha);}`});
  const rain=new T.LineSegments(drops,rainMat);rain.frustumCulled=false;exterior.add(rain);
  const {workshop,bench}=assets;
  workshop.name='Vera’s workshop';workshop.position.set(20,-.1,-33);exterior.add(workshop);
  bench.name='Bench on the verge';bench.position.set(14.65,-.12,-35.75);bench.rotation.y=1.15;exterior.add(bench);
  const outdoorLight=new T.PointLight(0xffc685,7,10,1.9);outdoorLight.position.set(18.1,1.59,-32.2);exterior.add(outdoorLight);
  const moon=new T.DirectionalLight(0xb7d6ed,1.4);moon.position.set(12,12,-43);moon.target.position.set(18,0,-32);
  moon.shadow.camera.left=moon.shadow.camera.bottom=-10;moon.shadow.camera.top=moon.shadow.camera.right=10;moon.shadow.camera.far=33;
  moon.shadow.mapSize.set(1024,1024);moon.shadow.normalBias=.025;moon.shadow.bias=-.00024;
  moon.shadow.autoUpdate=false;scene.add(moon,moon.target);
  const flash=new T.PointLight(0xc2ddff,0,27,1.45);flash.position.set(0,7,-6.2);scene.add(flash);
  let previousFlash=false,outdoorWasVisible=false;
  return {group:exterior,
    update(time:number,quality:Settings['quality'],camera:T.Camera,snow:boolean,particles=true,reducedFlicker=false){
      const visibleExterior=camera.position.x>5.4&&camera.position.z<-30;
      const far=visibleExterior||camera.position.y>3.8;
      exterior.visible=far;
      for(const o of [ground,lane,workshop,bench,outdoorLight,...tracks,...pools])o.visible=visibleExterior;
      for(const set of north)set.group.visible=far&&!visibleExterior;
      for(const set of yard){set.group.visible=visibleExterior;for(const o of set.cloud)o.count=quality==='low'?3:quality==='medium'?4:o.instanceMatrix.count;}
      const lightningTime=(time+5)%42,lightning=!snow&&!reducedFlicker&&lightningTime<.39;
      const pulse=lightning?Math.max(0,1-lightningTime*3)*(.62+.32*Math.sin(lightningTime*93)):0;
      const crack=lightning&&!previousFlash&&far;previousFlash=lightning;
      moon.intensity=visibleExterior?1.6+pulse*.8:0;
      moon.castShadow=visibleExterior&&quality==='high';
      if(moon.castShadow&&!outdoorWasVisible)moon.shadow.needsUpdate=true;
      outdoorWasVisible=moon.castShadow;
      flash.intensity=pulse*34;
      sky.uniforms.uTime.value=time;sky.uniforms.uFlash.value=pulse;sky.uniforms.uSnow.value=+snow;
      rain.visible=far&&particles;rainMat.uniforms.uTime.value=time;rainMat.uniforms.uSnow.value=+snow;
      drops.setDrawRange(0,quality==='low'?850:quality==='medium'?1900:3600);
      grass.visible=visibleExterior;grass.count=Math.min(used,quality==='low'?380:quality==='medium'?900:1650);grassShader.uniforms.uTime.value=time;grassShader.uniforms.uSnow.value=+snow;
      roadMaterial.color.setHex(snow?0x9eaaa2:0x716956);grassFloor.color.setHex(snow?0xb7c3ba:0x3d4b39);
      first.visible=visibleExterior&&quality!=='high';
      mirror.visible=visibleExterior&&quality==='high';
      waterSimple.uniforms.uTime.value=time;waterSimple.uniforms.uSnow.value=+snow;(mirror.material as T.ShaderMaterial).uniforms.uTime.value=time;
      return crack;
    },
    snapshot(){return {snow:sky.uniforms.uSnow.value===1,exterior:workshop.visible,reflection:mirror.visible,particles:rain.visible?drops.drawRange.count/2:0};},
    dispose(){mirror.dispose();},
  };
}
