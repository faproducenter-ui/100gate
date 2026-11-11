import * as T from 'three';
import {buildEnvironment} from './environment';
import {loadActor} from './actor';
import {FpRig} from './fps';
import {BATTERIES,DOORS,OBJECTS,ROOMS,roomAt,withinReach,type DoorId,type DoorStates,type ObjectId,type Point} from './map';
import type {CameraId,CCTVView,Save,Settings} from './contracts';

type Cast=Awaited<ReturnType<typeof loadActor>>;
type Frame={state:Save;settings:Settings;menu:boolean;paused:boolean;cctv:CCTVView|null;time:number;dt:number;
  direction:Point;speed:number;target:ObjectId|null;drawer:boolean;
  look:{yaw:number;pitch:number};crouch:number;sprint:boolean;press:number;kick:number};
const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const smooth=T.MathUtils.smoothstep;
const cameraPos:Record<CameraId,[T.Vector3,T.Vector3]>={
  reception:[V(-.42,2.43,4.78),V(-3.82,.80,2.55)],
  corridor:[V(.46,2.45,4.54),V(1.3,.75,-2.45)],
  archive:[V(2.82,2.48,-1.55),V(6.25,1,-3.9)],
};
function tapeProp(w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('CCTV texture unavailable');
  draw(ctx);const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  return new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map,roughness:.89,side:T.DoubleSide}));
}
const clockScreen=()=>new T.ShaderMaterial({
  uniforms:{feed:{value:null},time:{value:0},noise:{value:0},enabled:{value:.8}},
  vertexShader:`varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`
    varying vec2 v;uniform sampler2D feed;uniform float time,noise,enabled;
    float grain(vec2 p){return fract(sin(dot(p,vec2(27.17,83.43)))*43758.54);}
    void main(){
      float roll=fract(v.y+time*.31),tear=step(.91,roll)*noise;
      vec2 uv=clamp(v+vec2(tear*.12*(grain(vec2(floor(time*32.),floor(v.y*80.)))-.5),0.),0.,1.);
      vec3 c=texture2D(feed,uv).rgb;
      float lum=dot(c,vec3(.299,.587,.114));
      float line=.90+.1*sin(v.y*540.+time*12.);
      float speck=(grain(gl_FragCoord.xy+floor(time*44.))-.5)*noise*.35;
      vec3 outColor=vec3(.23,.63,.51)*(lum*1.5+.026+speck)*line*enabled;
      gl_FragColor=vec4(outColor,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

export class IsoWorld {
  private readonly renderer:T.WebGLRenderer;
  private readonly scene=new T.Scene();
  private readonly gameCamera=new T.OrthographicCamera(-5,5,3.75,-3.75,.05,70);
  private readonly titleCamera=new T.PerspectiveCamera(51,1,.045,45);
  private readonly securityCamera=new T.PerspectiveCamera(60,1,.055,45);
  private readonly monitorCamera=new T.PerspectiveCamera(69,1.23,.065,45);
  private readonly observer=T.MathUtils.degToRad(48);
  private readonly aim=V(0,.5,0);
  private readonly activeRay=new T.Raycaster();
  private readonly clickRay=new T.Raycaster();
  private readonly cursor=new T.Vector2();
  private readonly feed=new T.WebGLRenderTarget(256,208,{depthBuffer:true});
  private readonly crt=clockScreen();
  private readonly oldScreens:T.Material[]=[];
  private readonly env=buildEnvironment();
  private readonly cast:Cast;
  private readonly echoes:Record<'hero'|'staff'|'shadow',Cast>;
  private readonly drawerRest:number;
  private readonly shiftEnvelope:T.Mesh;
  private readonly shippingSlip:T.Mesh;
  private readonly lamp:T.PointLight;
  private readonly fps:FpRig;
  private fpActive=false;
  private readonly hemi:T.HemisphereLight;
  private readonly sun:T.DirectionalLight;
  private readonly beam:T.SpotLight;
  private readonly glow:T.PointLight;
  private flashlightProp:T.Object3D;
  private readonly batteryProps=new Map<ObjectId,T.Object3D>();
  private darkness=1;
  private readonly poweredLevels:number[];
  private readonly mark:T.Mesh;
  private readonly originalVisible=new Map<T.Object3D,boolean>();
  private readonly angles:Record<DoorId,number>={technical:0,surveillance:0,archive:0};
  private room?:string;
  private lastFeed=-1;
  private frameSettings?:string;
  private lastWidth=0;
  private lastHeight=0;

  static async create(canvas:HTMLCanvasElement,onProgress:(text:string)=>void,signal:AbortSignal){
    onProgress('Персонаж · загрузка модели');
    const actor=await loadActor();
    try{signal.throwIfAborted();onProgress('Администрация · материалы и свет');return new IsoWorld(canvas,actor);}
    catch(error){actor.dispose();throw error;}
  }
  private constructor(private readonly canvas:HTMLCanvasElement,actor:Cast){
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.13;
    this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.scene.background=new T.Color(0x121615);
    this.scene.add(this.env.root);
    this.hemi=new T.HemisphereLight(0xc9d9cf,0x524333,1.05);this.scene.add(this.hemi);
    const sun=this.sun=new T.DirectionalLight(0xced9db,1.55);
    sun.position.set(-3,8,6);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-10,right:10,top:9,bottom:-9,near:.2,far:27});
    sun.shadow.normalBias=.016;sun.shadow.bias=-.00011;sun.shadow.radius=2;
    this.scene.add(sun,sun.target);
    this.beam=new T.SpotLight(0xfff0d2,0,9,.62,.6,1.6);
    this.glow=new T.PointLight(0xffe2b0,0,2.6,2);
    this.scene.add(this.beam,this.beam.target,this.glow);
    const steel=new T.MeshStandardMaterial({color:0x2f3438,metalness:.7,roughness:.4});
    const lens=new T.MeshStandardMaterial({color:0xfff0c0,emissive:0xffd890,emissiveIntensity:.5});
    this.flashlightProp=new T.Group();
    const body=new T.Mesh(new T.CylinderGeometry(.028,.034,.19,12),steel),head=new T.Mesh(new T.CylinderGeometry(.048,.032,.06,12),steel),
      face=new T.Mesh(new T.CircleGeometry(.042,12),lens);
    body.rotation.z=head.rotation.z=Math.PI/2;head.position.x=.12;face.rotation.y=Math.PI/2;face.position.x=.151;
    this.flashlightProp.add(body,head,face);
    const model=actor.makeFlashlight();
    if(model){this.flashlightProp=model;model.position.set(OBJECTS.flashlight.x,.845,OBJECTS.flashlight.z);model.rotation.set(0,.5,.115);}
    else{this.flashlightProp.position.set(OBJECTS.flashlight.x,.86,OBJECTS.flashlight.z);this.flashlightProp.rotation.y=.5;}
    this.scene.add(this.flashlightProp);
    const cell=new T.MeshStandardMaterial({color:0xb08a2e,roughness:.5,metalness:.3});
    for(const id of BATTERIES){
      const g=new T.Group();
      for(const dz of [-.022,.022]){
        const b=new T.Mesh(new T.CylinderGeometry(.016,.016,.09,10),cell);b.rotation.z=Math.PI/2;b.position.z=dz;g.add(b);
      }
      g.position.set(OBJECTS[id].x,.025,OBJECTS[id].z);g.rotation.y=OBJECTS[id].x;
      this.batteryProps.set(id,g);this.scene.add(g);
    }
    // Aim the crosshair at the real props, not at invisible anchors.
    this.env.targets.flashlight=this.flashlightProp;
    for(const [id,prop] of this.batteryProps)this.env.targets[id]=prop;
    this.cast=actor;
    this.fps=new FpRig(this.scene,actor.makeFlashlight());
    this.scene.add(actor.root);
    this.echoes={hero:actor.createEcho('hero'),staff:actor.createEcho('staff'),shadow:actor.createEcho('shadow')};
    for(const echo of Object.values(this.echoes)){echo.root.visible=false;this.scene.add(echo.root);}
    this.drawerRest=this.env.drawer?.position.z??0;
    this.shiftEnvelope=tapeProp(.20,.107,g=>{
      g.fillStyle='#c2b297';g.fillRect(0,0,256,128);g.strokeStyle='#716857';g.lineWidth=5;
      g.beginPath();g.moveTo(0,8);g.lineTo(128,77);g.lineTo(256,8);g.stroke();
    });
    this.shiftEnvelope.position.set(-4.26,1.065,3.91);this.shiftEnvelope.rotation.y=Math.PI/2;
    this.shippingSlip=tapeProp(.46,.23,g=>{
      g.fillStyle='#c4bfa4';g.fillRect(0,0,256,128);g.fillStyle='#242e2a';g.font='bold 17px monospace';
      g.fillText('АРХИВ / СЕКЦИЯ',15,29);g.font='bold 68px monospace';g.fillText('Б–4',16,100);
    });
    this.shippingSlip.position.set(1.77,1.43,-.80);this.shippingSlip.rotation.y=-.4;
    this.scene.add(this.shiftEnvelope,this.shippingSlip);
    this.poweredLevels=this.env.powerLights.map(l=>l.intensity);
    this.lamp=this.env.lamp??new T.PointLight(0xffc982,21,7,2);
    if(!this.env.lamp){this.lamp.position.set(5.06,2.42,1.55);this.scene.add(this.lamp);}
    this.crt.uniforms.feed!.value=this.feed.texture;
    for(const screen of this.env.screens){
      if(!Array.isArray(screen.material))this.oldScreens.push(screen.material);
      screen.material=this.crt;
    }
    const ring=new T.RingGeometry(.24,.27,34);
    this.mark=new T.Mesh(ring,new T.MeshBasicMaterial({color:0xdfc393,transparent:true,opacity:.57,depthWrite:false,side:T.DoubleSide}));
    this.mark.rotation.x=-Math.PI/2;this.mark.visible=false;this.scene.add(this.mark);
  }
  pressFlashlight(){this.cast.pressFlashlight();}
  /** The interactable under the crosshair in first person, within arm's reach. */
  aimTarget(p:Point,ok:(id:ObjectId)=>boolean=()=>true):ObjectId|undefined{
    const cam=this.fps.camera;
    const options=Object.entries(this.env.targets).filter(([key])=>withinReach(key as ObjectId,p,.7)&&ok(key as ObjectId));
    this.cursor.set(0,0);
    this.clickRay.setFromCamera(this.cursor,cam);
    this.clickRay.far=2.7;
    const hit=this.clickRay.intersectObjects(options.map(([,o])=>o!),true)[0];
    this.clickRay.far=Infinity;
    if(hit){
      let node:T.Object3D|null=hit.object;
      while(node){const id=options.find(([,target])=>target===node)?.[0];if(id)return id as ObjectId;node=node.parent;}
    }
    // Small props (batteries, keys) get a forgiving cone around the crosshair.
    let best=.13,id:ObjectId|undefined;
    for(const [key,target] of options){
      const v=target!.getWorldPosition(new T.Vector3()).project(cam);
      if(v.z>1)continue;
      const d=Math.hypot(v.x*cam.aspect,v.y);
      if(d<best){best=d;id=key as ObjectId;}
    }
    return id;
  }
  get firstPerson(){return this.fpActive;}
  actorAction(kind:'interact'|'pick-up'|'door'|'fear'|'examine',point?:Point){
    this.cast.react?.(kind,point?.x,point?.z);
  }
  private restoreOcclusion(){
    for(const [object,visible] of this.originalVisible)object.visible=visible;
    this.originalVisible.clear();
  }
  private hideOcclusion(state:Point){
    const origin=this.gameCamera.position,aim=V(state.x,1.10,state.z);
    const dir=aim.sub(origin);const distance=dir.length();dir.normalize();
    this.activeRay.set(origin,dir);this.activeRay.far=distance-.22;
    for(const hit of this.activeRay.intersectObjects(this.env.occluders,false)){
      const o=hit.object;
      if(!this.originalVisible.has(o)){this.originalVisible.set(o,o.visible);o.visible=false;}
    }
  }
  select(event:{clientX:number;clientY:number},p:Point):ObjectId|undefined{
    const box=this.canvas.getBoundingClientRect();
    const options=Object.entries(this.env.targets).filter(([key])=>withinReach(key as ObjectId,p));
    this.cursor.set((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2);
    this.clickRay.setFromCamera(this.cursor,this.gameCamera);
    const hit=this.clickRay.intersectObjects(options.map(([,o])=>o!),true)[0];
    if(hit){
      let node:T.Object3D|null=hit.object;
      while(node){const id=options.find(([,target])=>target===node)?.[0];if(id)return id as ObjectId;node=node.parent;}
    }
    // Very small props still have a practical screen-space click target.
    let best=.125,id:ObjectId|undefined;
    for(const [key,target] of options){
      const v=target!.getWorldPosition(new T.Vector3()).project(this.gameCamera);
      const d=Math.hypot((v.x-this.cursor.x)*box.width/box.height,v.y-this.cursor.y);
      if(d<best){best=d;id=key as ObjectId;}
    }
    return id;
  }
  get walkableDoors():DoorStates{
    return Object.fromEntries(Object.entries(this.angles).map(([k,a])=>[k,Math.abs(a)>1.31])) as DoorStates;
  }
  animateDoors(state:Save,dt:number){
    for(const [id,g] of Object.entries(this.env.doors) as [DoorId,T.Group][]){
      const angle=state.doors[id]?(id==='technical'?-1:1)*Math.PI/2:0;
      this.angles[id]=T.MathUtils.damp(this.angles[id],angle,13,dt);
      g.rotation.y=this.angles[id];
    }
  }
  projectTarget(id:ObjectId){
    const target=this.env.targets[id];
    if(!target)return undefined;
    const p=target.getWorldPosition(new T.Vector3()).project(this.gameCamera),box=this.canvas.getBoundingClientRect();
    return {x:box.left+(p.x+1)*box.width/2,y:box.top+(1-p.y)*box.height/2};
  }
  private resize(settings:Settings){
    const w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    if(!w||!h)return false;
    const key=[settings.quality,settings.scale,settings.shadows].join(':');
    if(w!==this.lastWidth||h!==this.lastHeight||key!==this.frameSettings){
      this.frameSettings=key;this.lastWidth=w;this.lastHeight=h;
      const cap={low:1,medium:1.35,high:1.8}[settings.quality];
      this.renderer.setPixelRatio(Math.max(.55,Math.min(devicePixelRatio,cap)*settings.scale));
      this.renderer.setSize(w,h,false);
      this.renderer.shadowMap.enabled=settings.shadows&&settings.quality!=='low';
      this.titleCamera.aspect=this.securityCamera.aspect=w/h;
      this.fps.setAspect(w/h);
      const half=Math.max(3.68,4.05/(w/h));
      Object.assign(this.gameCamera,{left:-half*w/h,right:half*w/h,top:half,bottom:-half});
      this.gameCamera.updateProjectionMatrix();
    }
    return true;
  }
  render(frame:Frame){
    if(!this.resize(frame.settings))return;
    const {state,settings,time,dt,menu,cctv}=frame;
    this.restoreOcclusion();
    const fp=settings.view==='fps'&&!menu&&!cctv;
    this.fpActive=fp;
    for(const o of this.env.fpOnly)o.visible=fp;
    for(const o of this.env.isoOnly)o.visible=!fp;
    if(fp){
      this.fps.update({x:state.x,z:state.z,yaw:frame.look.yaw,pitch:frame.look.pitch,speed:frame.speed,sprint:frame.sprint,
        crouch:frame.crouch,dt:frame.paused?0:dt,time,hasLight:state.items.includes('flashlight'),lightOn:state.lightOn&&state.charge>0,
        press:frame.press,kick:frame.kick});
    }
    if(this.env.drawer)this.env.drawer.position.z=T.MathUtils.damp(this.env.drawer.position.z,this.drawerRest+(frame.drawer?.15:0),11,dt);
    this.cast.root.visible=!menu&&!cctv&&!fp;
    this.cast.update(frame.paused?0:dt,state.x,state.z,frame.direction.x,frame.direction.z,frame.speed);
    for(const [i,l] of this.env.powerLights.entries()){
      const value=this.poweredLevels[i]!;
      l.intensity=state.power?value:value*.07;
    }
    const interval=time%34;
    const flicker=settings.reducedFlicker?1:1-.64*Math.exp(-((interval-8.7)**2)/.19)-.78*Math.exp(-((interval-23.4)**2)/.075);
    this.lamp.intensity=menu?25*flicker:state.power?12:4;
    const lit=menu||state.power,has=state.items.includes('flashlight');
    this.darkness=T.MathUtils.damp(this.darkness,lit?1:.3,3,dt);
    this.hemi.intensity=1.05*this.darkness;this.sun.intensity=1.55*this.darkness;
    this.flashlightProp.visible=!has;
    this.cast.setGear({flashlight:has,on:state.lightOn&&state.charge>0});
    for(const [id,prop] of this.batteryProps)prop.visible=!state.taken.includes(id);
    const on=!menu&&!cctv&&state.lightOn&&state.charge>0&&has;
    const weak=state.charge<15?.72+.28*Math.sin(time*37)*Math.sin(time*11.3):1;
    const shadows=settings.shadows&&settings.quality!=='low';
    if(this.beam.castShadow!==shadows)this.beam.castShadow=shadows;
    this.beam.intensity=on?(fp?26:60)*weak:0;this.glow.intensity=on?(fp?.7:3)*weak:0;this.beam.angle=fp?.5:.62;
    if(on){
      const {x,z}=state,d=frame.direction,lens=fp?this.fps.beamPose():this.cast.flashlightPose();
      if(lens){
        this.beam.position.copy(lens.position);
        this.beam.target.position.copy(lens.position).addScaledVector(lens.direction,3);
        this.glow.position.copy(lens.position).addScaledVector(lens.direction,-.1);
      }else{
        this.beam.position.set(x+d.x*.15,1.05,z+d.z*.15);
        this.beam.target.position.set(x+d.x*3,.2,z+d.z*3);
        this.glow.position.set(x,.9,z);
      }
      this.beam.target.updateMatrixWorld();
    }
    this.crt.uniforms.time!.value=time;
    this.crt.uniforms.enabled!.value=menu||state.power?1:.045;
    this.crt.uniforms.noise!.value=settings.ambient?(settings.reducedFlicker?.07:interval%11>10.1?.66:.16):0;
    this.mark.visible=false;
    this.shiftEnvelope.visible=this.shippingSlip.visible=false;
    for(const echo of Object.values(this.echoes))echo.root.visible=false;
    this.scene.updateMatrixWorld(true);
    if((menu||state.power)&&!cctv&&time-this.lastFeed>=.13&&!frame.paused)this.refreshFeed(time);
    if(menu){
      const drift=settings.motion?Math.sin(time*.119):0;
      this.titleCamera.position.set(6.60+drift*.18,1.64+drift*.048,3.62+drift*.20);
      // Keep the monitors at screen-right, with negative space for the menu.
      this.titleCamera.lookAt(4.18,1.04,1.06);
      this.titleCamera.updateProjectionMatrix();
      const culled=Object.keys(ROOMS).filter(k=>k!=='surveillance').flatMap(k=>this.env.root.getObjectByName(k)??[]);
      culled.forEach(o=>{o.visible=false;});
      this.renderer.render(this.scene,this.titleCamera);
      culled.forEach(o=>{o.visible=true;});
      return;
    }
    if(cctv){
      const [eye,focus]=cameraPos[cctv.camera];
      this.securityCamera.position.copy(eye);this.securityCamera.lookAt(focus);
      this.securityCamera.fov=cctv.zoom?43:60;this.securityCamera.updateProjectionMatrix();
      this.stageFootage(cctv);
      this.renderer.render(this.scene,this.securityCamera);
      for(const echo of Object.values(this.echoes))echo.root.visible=false;
      return;
    }
    if(fp){
      this.mark.visible=false;
      this.renderer.render(this.scene,this.fps.camera);
      return;
    }
    const id=roomAt(state.x,state.z)??'corridor',r=ROOMS[id];
    const tx=(r.minX+r.maxX)*.40+state.x*.20,tz=(r.minZ+r.maxZ)*.40+state.z*.20;
    if(!this.room||!settings.motion)this.aim.set(tx,.55,tz);
    else {this.aim.x=T.MathUtils.damp(this.aim.x,tx,6,dt);this.aim.z=T.MathUtils.damp(this.aim.z,tz,6,dt);}
    this.room=id;
    const yaw=.69;
    this.gameCamera.position.set(this.aim.x+12*Math.sin(yaw),this.aim.y+12*Math.tan(this.observer),this.aim.z+12*Math.cos(yaw));
    this.gameCamera.lookAt(this.aim);this.gameCamera.updateMatrixWorld();
    if(frame.target&&settings.hints){
      const o=OBJECTS[frame.target];this.mark.position.set(o.x,.024,o.z);this.mark.visible=true;
    }
    this.hideOcclusion(state);
    this.renderer.render(this.scene,this.gameCamera);
  }
  private refreshFeed(t:number){
    const which=Math.floor(t/13)%3,camera=(['corridor','archive','reception'] as const)[which]!;
    const [eye,focus]=cameraPos[camera];
    this.monitorCamera.position.copy(eye);this.monitorCamera.lookAt(focus);this.monitorCamera.updateMatrixWorld();
    const cast=this.cast.root.visible;this.cast.root.visible=false;
    this.env.screens.forEach(s=>s.visible=false);
    const auto=this.renderer.shadowMap.autoUpdate;this.renderer.shadowMap.autoUpdate=false;
    this.renderer.setRenderTarget(this.feed);
    this.renderer.render(this.scene,this.monitorCamera);
    this.renderer.setRenderTarget(null);this.renderer.shadowMap.autoUpdate=auto;
    this.env.screens.forEach(s=>s.visible=true);this.cast.root.visible=cast;this.lastFeed=t;
  }
  private stageFootage(c:CCTVView){
    let pose:Parameters<Cast['poseTape']>[0],echo:Cast;
    const t=c.time;
    if(c.tape==='shift'&&c.camera==='reception'&&c.time>=8&&c.time<17){
      const a=smooth(t,8,12),b=smooth(t,15,17);
      pose={x:-.65-3.25*a+2.3*b,z:2.15+1.75*a-.8*b,time:t,distance:3.70*a+2.44*b,
        yaw:-1.11+2.98*smooth(t,14.65,15.30),walk:smooth(t,8,8.35)*(1-smooth(t,11.45,12))+smooth(t,15,15.4)*(1-smooth(t,16.65,17)),
        action:{kind:'interact',t:t-11.98,x:-4.38,z:3.94}};
      this.shiftEnvelope.visible=t>=12.28&&t<=15.75;
      echo=this.echoes.staff;
    }else if(c.tape==='shift'&&c.camera==='corridor'&&c.time>=18&&c.time<21){
      pose={x:1.45,z:-4.06+(t-18)*.085,time:t,yaw:0,distance:0,walk:0};
      this.shippingSlip.visible=true;
      echo=this.echoes.shadow;
    }else if(c.tape==='future'&&c.camera==='archive'&&c.time>=2&&c.time<9){
      const a=smooth(t,2,6);
      pose={x:3.25+3*a,z:-3.17,time:t,yaw:Math.PI/2,distance:3*a,
        walk:smooth(t,2,2.5)*(1-smooth(t,5.5,6)),action:{kind:'examine',t:t-6,x:6.69,z:-3.30}};
      echo=this.echoes.hero;
      if(t>=7.4){
        const shadow=this.echoes.shadow;shadow.root.visible=true;
        shadow.poseTape({x:3.4,z:-4.02,time:t,yaw:Math.PI/2,distance:0,walk:0});
      }
    }else return;
    echo.root.visible=true;
    echo.poseTape(pose);
  }
  diagnostics(){const r=this.renderer.info.render;return {calls:r.calls,triangles:r.triangles,scale:this.renderer.getPixelRatio()};}
  dispose(){
    this.restoreOcclusion();this.cast.root.removeFromParent();
    for(const echo of Object.values(this.echoes))echo.dispose();
    this.cast.dispose();
    const geometry=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(this.oldScreens),textures=new Set<T.Texture>();
    this.scene.traverse(o=>{if(o instanceof T.Mesh){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    for(const mat of materials){for(const value of Object.values(mat))if(value instanceof T.Texture)textures.add(value);mat.dispose();}
    for(const tex of textures)tex.dispose();for(const geo of geometry)geo.dispose();
    this.feed.dispose();this.renderer.dispose();this.scene.clear();
  }
}
