import * as T from 'three';
import {buildEnvironment} from './environment';
import {loadActor} from './actor';
import {FpRig} from './fps';
import {Flame,fireFlicker} from './flame';
import {AnalogPass} from './analog';
import {KeyProp} from './keys';
import {scanned} from './env-materials';
import {boxProjectUV} from './env-kit';
import {createPhysics,type Physics} from './physics';
import {HandController,Pickup} from './interaction';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Intro,loadTrailerAssets} from './intro';
import {DOORS,OBJECTS,ROOMS,doorFor,doorSwing,movedProps,roomAt,withinReach,type DoorId,type DoorStates,type ObjectId,type Point} from './map';
import type {CameraId,CCTVView,Save,Settings} from './contracts';

type Cast=Awaited<ReturnType<typeof loadActor>>;
type Decor={key?:T.Object3D;book?:T.Object3D;viewmodel?:{scene:T.Object3D;animations:T.AnimationClip[]};doorKit?:T.Object3D};
async function loadDecor():Promise<Decor>{
  const gltf=async(path:string)=>{
    try{return await new GLTFLoader().loadAsync(import.meta.env.BASE_URL+path);}catch{return undefined;}
  };
  const [key,book,viewmodel,doorKit]=await Promise.all([gltf('assets/iso/key-tag.glb'),gltf('assets/iso/antique-book.glb'),gltf('assets/iso/viewmodel-8.glb'),gltf('assets/iso/door-kit.glb')]);
  return {key:key?.scene,book:book?.scene,viewmodel:viewmodel&&{scene:viewmodel.scene,animations:viewmodel.animations},doorKit:doorKit?.scene};
}
type Frame={state:Save;settings:Settings;menu:boolean;paused:boolean;cctv:CCTVView|null;time:number;dt:number;
  direction:Point;speed:number;target:ObjectId|null;drawer:boolean;perf?:number;reading?:boolean;
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
  private readonly env:ReturnType<typeof buildEnvironment>;
  // --- hand interaction and prop physics ---
  private readonly hand=new HandController();
  private torchPickup!:Pickup;
  private readonly torchHome=new T.Matrix4();
  private readonly doorSync:(()=>void)[]=[];
  private fovMatch=0;
  private dropAt?:T.Matrix4;
  private grabAt?:T.Matrix4;
  private dropWorld?:T.Vector3;
  private settleTimer=0;
  /** A free prop came to rest: its world pose [x,y,z,qx,qy,qz,qw] (for the save). */
  onPropSettled?:(id:'torch',pose:number[])=>void;
  private readonly doorSpin:Record<DoorId,number>={technical:0,surveillance:0,archive:0,reception:0};
  private readonly cast:Cast;
  private readonly echoes:Record<'hero'|'staff'|'shadow',Cast>;
  private readonly drawerRest:number;
  private readonly shiftEnvelope:T.Mesh;
  private readonly shippingSlip:T.Mesh;
  private readonly lamp:T.PointLight;
  private deskKey?:KeyProp;
  private cabinetKey?:KeyProp;
  private slotTarget?:T.Object3D;
  private hookTarget?:T.Object3D;
  /** Called when the hanging keys clink: loudness 0..1 already scaled by distance to the listener. */
  onKeyClink?:(loudness:number)=>void;
  private listener={x:0,z:0};
  private readonly fps:FpRig;
  private fpActive=false;
  private readonly hemi:T.HemisphereLight;
  private readonly sun:T.DirectionalLight;
  private readonly fire:T.PointLight;
  private torchProp:T.Object3D;
  private torchFlame?:Flame;
  private readonly analog=new AnalogPass();
  private lowHeight=480;
  private lastAim?:ObjectId;
  private intro?:Intro;
  private paperW=0;
  /** Where the grip frame of the right hand is while a sheet is read (camera space): the sheet fills the lower middle of the view. */
  readonly paperPose=new T.Matrix4().compose(new T.Vector3(0,-.1,-.4),new T.Quaternion().setFromEuler(new T.Euler(-.25,0,0)),new T.Vector3(1,1,1));
  private readonly fogFx=new T.FogExp2(0x03070a,.16);
  private readonly darkBg=new T.Color(0x020506);
  private readonly lightBg=new T.Color(0x121615);
  private readonly torchHeads:T.MeshStandardMaterial[]=[];
  private lighterProp?:T.Object3D;
  private darkness=1;
  private readonly poweredLevels:number[];
  private readonly mark:T.Mesh;
  private readonly originalVisible=new Map<T.Object3D,boolean>();
  private readonly angles:Record<DoorId,number>={technical:0,surveillance:0,archive:0,reception:0};
  private room?:string;
  private lastFeed=-1;
  private frameSettings?:string;
  private lastWidth=0;
  private lastHeight=0;

  static async create(canvas:HTMLCanvasElement,onProgress:(text:string)=>void,signal:AbortSignal){
    onProgress('Персонаж · загрузка модели');
    const actor=await loadActor();
    onProgress('Предметы · ключи и книга');
    const decor=await loadDecor();
    onProgress('Физика предметов');
    const physics=await createPhysics().catch(()=>undefined);
    try{signal.throwIfAborted();onProgress('Администрация · материалы и свет');return new IsoWorld(canvas,actor,decor,physics);}
    catch(error){actor.dispose();throw error;}
  }
  private constructor(private readonly canvas:HTMLCanvasElement,actor:Cast,decor:Decor,private readonly physics?:Physics){
    this.env=buildEnvironment({modelFrames:!!decor.doorKit});
    if(decor.doorKit)this.fitDoorKit(decor.doorKit);
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
    this.fire=new T.PointLight(0xff9a40,0,11,1.7);
    this.scene.add(this.fire);
    // The torch stands against the reception's west wall, foot on the floor; its grip point is the model's origin. It is the very model the hand holds in the viewmodel,
    // so handing it over between world and hand never changes its shape or size.
    const held=decor.viewmodel?.scene.getObjectByName('Torch');
    this.torchProp=new T.Group();
    if(held){
      const mesh=held.clone(true);mesh.position.set(0,0,0);
      mesh.traverse(o=>{
        if(!(o instanceof T.Mesh))return;
        o.castShadow=o.receiveShadow=true;o.frustumCulled=true;
        const mats=Array.isArray(o.material)?o.material:[o.material];
        const cloned=mats.map(m=>{const c=(m as T.MeshStandardMaterial).clone();if(c.name==='Torch_head')this.torchHeads.push(c);return c;});
        o.material=Array.isArray(o.material)?cloned:cloned[0]!;
      });
      this.torchProp.add(mesh);
    }else{
      const stick=new T.Mesh(new T.CylinderGeometry(.022,.026,.95,10),new T.MeshStandardMaterial({color:0x6b4a2a,roughness:.9}));
      stick.rotation.z=-Math.PI/2;stick.position.x=.195;this.torchProp.add(stick);
    }
    this.placeTorchHome();
    this.scene.add(this.torchProp);
    this.torchFlame=new Flame(.34,0,16);
    const flameAt=new T.Object3D();flameAt.position.set(.64,.0,0);flameAt.add(this.torchFlame.root);this.torchProp.add(flameAt);
    // The lighter lies in the desk drawer and rides with it.
    const lit=decor.viewmodel?.scene.getObjectByName('prop_lighter_r');
    if(lit&&this.env.drawer){
      const g=lit.clone(true);g.position.set(0,0,0);g.quaternion.identity();g.scale.set(1,1,1);
      g.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=o.receiveShadow=true;}});
      const holder=new T.Group();holder.add(g);holder.rotation.set(0,.5,Math.PI/2);holder.position.set(.045,-.0505,-.15);
      this.env.drawer.add(holder);this.lighterProp=holder;
    }
    if(decor.key){
      // Key on the hook under the reception desk; the archive key lies on the filing cabinet once its place is known.
      // Technical-room key: left lying on the reception desk top, in plain sight (dropped onto the surface below).
      this.deskKey=new KeyProp(decor.key,'flat');this.deskKey.root.position.set(-4.40,1.2,1.12);this.deskKey.root.rotation.set(0,-.6,0);
      this.cabinetKey=new KeyProp(decor.key,'flat');this.cabinetKey.root.position.set(-4.43,1.128,3.70);this.cabinetKey.root.rotation.set(0,.9,0);
      this.scene.add(this.deskKey.root,this.cabinetKey.root);
      this.hookTarget=this.env.targets.underDesk;this.slotTarget=this.env.targets.archiveCache;
    }
    if(decor.book){
      // Open antique book left on the top plank of the reception shelf; dusty, because nobody has read it for years.
      const book=decor.book.clone(true);
      book.traverse(o=>{
        if(!(o instanceof T.Mesh))return;
        o.castShadow=o.receiveShadow=true;
        const mat=(o.material as T.MeshStandardMaterial).clone();
        mat.color.lerp(new T.Color(0x9b968a),.42);mat.roughness=1;mat.metalness*=.5;mat.envMapIntensity=.4;
        o.material=mat;
      });
      book.updateMatrixWorld(true);
      const frame=book.getObjectByName('Book_open')??book,size=new T.Box3().setFromObject(frame).getSize(new T.Vector3());
      const scale=.33/Math.max(size.x,size.z);
      book.scale.multiplyScalar(scale);book.rotation.y=.35;book.updateMatrixWorld(true);
      const lowest=new T.Box3().setFromObject(frame);
      book.position.set(-1.06,.727-lowest.min.y,4.5);
      this.scene.add(book);
      this.env.root.updateMatrixWorld(true);this.restOn(book,.95);
    }
    // Loose props rest on whatever is really under them (floor, desk top, shelf plank), never in the air.
    this.env.root.updateMatrixWorld(true);
    if(this.cabinetKey)this.restOn(this.cabinetKey.root,1.9);
    if(this.deskKey)this.restOn(this.deskKey.root,1.4);
    // Physics: the building is static collision, door leaves are kinematic boxes, loose props are rigid bodies.
    this.torchHome.copy(this.torchProp.matrixWorld);
    this.torchPickup=new Pickup({id:'torch',mass:.6,grip:'torch'},this.torchProp);
    if(this.physics){
      const skip=new Set<T.Object3D>([...Object.values(this.env.doors),this.env.drawer]);
      this.physics.addStatic(this.env.root,skip);
      const span=2*DOORS.technical.half-.021;
      for(const g of Object.values(this.env.doors))
        this.doorSync.push(this.physics.addKinematicBox(g,new T.Vector3(0,1.081,span/2),new T.Vector3(.033,1.065,span/2)));
    }
    // Aim the crosshair at the real props, not at invisible anchors.
    this.env.targets.torch=this.torchProp;
    this.listener={x:0,z:0};
    this.cast=actor;
    this.fps=new FpRig(this.scene,decor.viewmodel);
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
  /** The torch at its home: foot on the floor, head leaning on the west wall (grip point = the prop's origin). */
  private placeTorchHome(){
    const t=.17,axis=new T.Vector3(-Math.sin(t),Math.cos(t),0);
    this.torchProp.quaternion.setFromUnitVectors(new T.Vector3(1,0,0),axis);
    this.torchProp.position.set(OBJECTS.torch.x,.28*Math.cos(t),OBJECTS.torch.z);
    this.torchProp.updateMatrixWorld(true);
  }
  /** Interactable things near the player that are on screen in first person: where they appear (0..1, after the CRT bulge of the analog pass) and how far they are. */
  markers(p:Point,ok:(id:ObjectId)=>boolean=()=>true){
    const cam=this.fps.camera,out:{id:ObjectId;x:number;y:number;dist:number}[]=[];
    cam.updateMatrixWorld(true);
    const box=new T.Box3(),c=new T.Vector3(),v=new T.Vector3();
    for(const [key,obj] of Object.entries(this.env.targets)){
      const id=key as ObjectId;
      if(!obj||!obj.visible||!withinReach(id,p,.7)||!ok(id))continue;
      box.setFromObject(obj);
      if(box.isEmpty())continue;
      box.getCenter(c);
      v.copy(c).project(cam);
      if(v.z>1||v.z<-1||Math.abs(v.x)>1.05||Math.abs(v.y)>1.05)continue;
      // the analog pass bulges the picture toward its edges: put the marker where the point is really drawn
      let ux=v.x,uy=v.y;
      for(let i=0;i<2;i++){const r2=ux*ux+uy*uy,k2=1+.07*r2;ux=v.x/k2;uy=v.y/k2;}
      out.push({id,x:(ux+1)/2,y:(1-uy)/2,dist:Math.hypot(c.x-p.x,c.z-p.z)});
    }
    return out;
  }
  /** The interactable under the crosshair in first person, within arm's reach. */
  aimTarget(p:Point,ok:(id:ObjectId)=>boolean=()=>true):ObjectId|undefined{
    const cam=this.fps.camera;
    const options=Object.entries(this.env.targets).filter(([key])=>withinReach(key as ObjectId,p,.7)&&ok(key as ObjectId));
    this.cursor.set(0,0);
    this.clickRay.setFromCamera(this.cursor,cam);
    this.clickRay.far=2.7;
    // A door is aimed at by its whole leaf, not only by the small handle point that marks it.
    const solid=(id:string,o:T.Object3D)=>{const d=doorFor[id as ObjectId];return (d&&this.env.doors[d])||o;};
    const hit=this.clickRay.intersectObjects(options.map(([id,o])=>solid(id,o!)),true)[0];
    this.clickRay.far=Infinity;
    if(hit){
      let node:T.Object3D|null=hit.object;
      while(node){const n=node;const id=options.find(([k,o])=>solid(k,o!)===n)?.[0];if(id)return id as ObjectId;node=node.parent;}
    }
    // Anything else gets a forgiving cone around the crosshair, measured to the middle of the object (not its origin, which can sit on the floor),
    // wider the closer you stand and wider still for the object that was already aimed at, so a prompt does not flicker away at arm's length.
    let best=Infinity,id:ObjectId|undefined;
    const box=new T.Box3(),c=new T.Vector3(),fwd=cam.getWorldDirection(new T.Vector3());
    for(const [key,target] of options){
      box.setFromObject(target!);
      if(box.isEmpty())target!.getWorldPosition(c);else box.getCenter(c);
      const dist=c.distanceTo(cam.position),v=c.clone().project(cam);
      if(v.z>1||c.clone().sub(cam.position).dot(fwd)<=0)continue;     // beyond the far plane, or behind the camera (it projects mirrored)
      const d=Math.hypot(v.x*cam.aspect,v.y),limit=(.13+Math.max(0,1.6-dist)*.1)*(key===this.lastAim?1.5:1);
      if(d<limit&&d<best){best=d;id=key as ObjectId;}
    }
    this.lastAim=id;
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
  /**
   * A heavy wooden leaf on three hinges: pushed, it gathers speed, swings a little past the target and
   * settles (hinge friction); at the wall stop it knocks back softly instead of passing through.
   */
  animateDoors(state:Save,dt:number){
    const h=Math.min(dt,.05),steps=Math.max(1,Math.ceil(h/.008)),s=h/steps;
    for(const [id,g] of Object.entries(this.env.doors) as [DoorId,T.Group][]){
      const sign=doorSwing(id),goal=state.doors[id]?sign*Math.PI/2:0,stop=Math.PI/2+.1;
      let a=this.angles[id],w=this.doorSpin[id];
      for(let i=0;i<steps;i++){
        w+=(38*(goal-a)-7.4*w)*s;
        a+=w*s;
        if(Math.abs(a)>stop){a=Math.sign(a)*stop;w*=-.25;}
        if(sign*a<-.004&&!state.doors[id]){a=0;w*=-.15;}   // the frame stop: a shut door cannot swing the other way
      }
      this.angles[id]=a;this.doorSpin[id]=w;
      g.rotation.y=a;
    }
  }
  /** Replace the box-built doors and frames with the Blender door kit (panelled leaves, hardware, casings). */
  private fitDoorKit(kit:T.Object3D){
    const leaf=kit.getObjectByName('DoorLeaf'),glazed=kit.getObjectByName('DoorLeafGlazed'),frame=kit.getObjectByName('DoorFrame');
    // The kit's painted-wood parts get the scanned wood; the vertex colours (hand grime, kicked bottom) stay.
    const woods={DoorWood:scanned('Door oak','fine_grained_wood',0xb89878,.62,.9),DoorPanel:scanned('Door panel oak','fine_grained_wood',0x9a7a5e,.68,.9)};
    for(const m of Object.values(woods))m.vertexColors=true;
    kit.traverse(o=>{
      if(!(o instanceof T.Mesh))return;
      const wood=woods[(o.material as T.Material).name as keyof typeof woods];
      if(!wood)return;
      boxProjectUV(o.geometry,.9);o.material=wood;
    });
    const prep=(o:T.Object3D)=>{const c=o.clone(true);c.position.set(0,0,0);c.rotation.set(0,0,0);
      c.traverse(m=>{if(m instanceof T.Mesh){m.castShadow=true;m.receiveShadow=true;}});return c;};
    const swap=(g:T.Object3D,model:T.Object3D|undefined)=>{
      if(!model)return;
      const old:T.Object3D[]=[];
      g.traverse(c=>{if(c!==g&&c instanceof T.Mesh)old.push(c);});
      for(const c of old)c.removeFromParent();
      g.add(prep(model));
    };
    for(const [id,g] of Object.entries(this.env.doors) as [DoorId,T.Group][])swap(g,id==='surveillance'?glazed:leaf);
    if(frame)for(const p of this.env.portals){const f=prep(frame);f.position.set(p.x,0,p.z);this.env.root.add(f);}
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
      const cap={low:1,medium:1,high:1.25}[settings.quality];
      this.renderer.setPixelRatio(Math.max(.55,Math.min(devicePixelRatio,cap)*settings.scale));
      this.renderer.setSize(w,h,false);
      this.analog.resize(w,h,this.lowHeight);
      this.renderer.shadowMap.enabled=settings.shadows&&settings.quality!=='low';
      this.titleCamera.aspect=this.securityCamera.aspect=w/h;
      this.fps.setAspect(w/h);
      const half=Math.max(3.68,4.05/(w/h));
      Object.assign(this.gameCamera,{left:-half*w/h,right:half*w/h,top:half,bottom:-half});
      this.gameCamera.updateProjectionMatrix();
    }
    return true;
  }
  /** The opening sequence at time t (seconds): its own scene through the same analog pass. */
  renderIntro(t:number,settings:Settings,time:number){
    if(!this.resize(settings))return;
    if(!this.intro){this.analog.render(this.renderer,()=>{},time,1,0,0);return;}   // the models are still arriving: black
    const {fade,flash}=this.intro.update(t,this.lastWidth/Math.max(1,this.lastHeight));
    this.renderer.toneMappingExposure=1.25;
    this.analog.render(this.renderer,()=>this.renderer.render(this.intro!.scene,this.intro!.camera),time,1,fade,flash);
  }
  /** Loads the road, the car and the backpack for the opening (about 22 MB, only when a new game starts). */
  async prepareIntro(){
    if(this.intro||this.introLoading)return;
    this.introLoading=true;
    try{this.intro=new Intro(await loadTrailerAssets());}finally{this.introLoading=false;}
  }
  get introReady(){return !!this.intro;}
  private introLoading=false;
  endIntro(){this.intro?.dispose();this.intro=undefined;}
  render(frame:Frame){
    if(!this.resize(frame.settings))return;
    const {state,settings,time,dt,menu,cctv}=frame;
    this.restoreOcclusion();
    const fp=settings.view==='fps'&&!menu&&!cctv;
    this.fpActive=fp;
    {const heights=settings.quality==='low'?[360,320,288,240]:[480,420,360,288],hgt=heights[Math.min(3,frame.perf??0)]!;
      if(hgt!==this.lowHeight){this.lowHeight=hgt;this.analog.resize(this.lastWidth,this.lastHeight,hgt);}}
    for(const o of this.env.fpOnly)o.visible=fp;
    for(const o of this.env.isoOnly)o.visible=!fp;
    if(fp){
      // Hand interaction: where the hand reaches (the prop, or the spot it is put down) and how the fingers close.
      const reading=!!frame.reading;
      this.paperW=T.MathUtils.damp(this.paperW,reading?1:0,reading?5.5:7,dt);
      const hf=this.hand.update(frame.paused&&!reading?0:dt);
      const active=hf.phase==='reaching'||hf.phase==='releasing';
      this.fovMatch=T.MathUtils.damp(this.fovMatch,active?1:0,9,dt);
      const eyeCam=this.fps.camera;
      let target:T.Matrix4|undefined;
      if(hf.phase==='reaching'&&!hf.carrying&&hf.item){
        target=eyeCam.matrixWorldInverse.clone().multiply(hf.item.object.matrixWorld);
        // A round handle can be taken either way up: pick the roll that keeps the wrist closest to its holding pose.
        // Take it from the side facing the eye: the hand comes down onto it, it does not reach round behind it.
        const flipped=target.clone().multiply(new T.Matrix4().makeRotationX(Math.PI));
        if(this.fps.vm.handDistanceFor(flipped)<this.fps.vm.handDistanceFor(target))target=flipped;
        // where it was taken from, kept in the world so the arm brings it back from that very spot
        this.grabAt=eyeCam.matrixWorld.clone().multiply(target);
      }else if(hf.phase==='reaching'&&this.grabAt)target=eyeCam.matrixWorldInverse.clone().multiply(this.grabAt);
      else if(hf.phase==='releasing'&&this.dropAt)target=this.dropAt;
      if(hf.phase==='holding'||hf.phase==='idle')this.grabAt=undefined;
      const paperUp=this.paperW>.01;
      if(paperUp)target=this.paperPose;
      this.fps.vm.setPaper(this.paperW);
      this.fps.vm.setHand({reach:paperUp?this.paperW:hf.reach,grip:paperUp?.35+.2*this.paperW:hf.grip,carrying:paperUp?false:hf.carrying,target,up:new T.Vector3(0,1,0).transformDirection(eyeCam.matrixWorldInverse),fovMatch:this.fovMatch,mainFov:eyeCam.fov});
      const armShown=paperUp||active||this.fps.vm.igniting||this.fps.vm.lighterPlaying?1:hf.phase==='holding'?1:0;
      // Bending over: the body leans toward what the hand goes for, so the arm can reach it naturally.
      let bend:{x:number;y:number;z:number}|undefined;
      const goalWorld=hf.phase==='reaching'?(this.grabAt?new T.Vector3().setFromMatrixPosition(this.grabAt):hf.item?.object.position):
        hf.phase==='releasing'&&this.dropWorld?this.dropWorld:undefined;
      if(goalWorld&&hf.reach>0){
        const eye=new T.Vector3(state.x,1.64-.39*frame.crouch,state.z),d=goalWorld.clone().sub(eye),dist=d.length();
        const amount=Math.min(1.15,Math.max(0,dist-.33))*hf.reach;   // up to a deep squat for things on the floor
        d.setLength(amount);bend={x:d.x,y:d.y*1.1,z:d.z};
      }
      this.fps.update({x:state.x,z:state.z,yaw:frame.look.yaw,pitch:frame.look.pitch,speed:frame.speed,sprint:frame.sprint,
        crouch:frame.crouch,dt:frame.paused&&!reading?0:dt,time,hasLight:state.items.includes('torch'),lightOn:state.lightOn,
        press:frame.press,kick:frame.kick,armShown,bend});
      this.cast.setCrouch(frame.crouch);
      const cam=this.fps.camera;
      this.cast.setFirstPerson({yaw:frame.look.yaw,eye:cam.position.clone(),forward:new T.Vector3(0,0,-1).applyQuaternion(cam.quaternion),
        right:new T.Vector3(1,0,0).applyQuaternion(cam.quaternion),up:new T.Vector3(0,1,0).applyQuaternion(cam.quaternion)});
    }else{this.cast.setFirstPerson(null);this.cast.setCrouch(0);}
    const drawerOpen=frame.drawer||this.fps.vm.lighterPlaying;
    if(this.env.drawer)this.env.drawer.position.z=T.MathUtils.damp(this.env.drawer.position.z,this.drawerRest+(drawerOpen?.15:0),11,dt);
    if(this.lighterProp)this.lighterProp.visible=!state.items.includes('lighter');
    this.cast.root.visible=!menu&&!cctv&&!fp;   // first person: no body, no legs, no arms of the actor, only the camera and what is held
    this.cast.update(frame.paused?0:dt,state.x,state.z,frame.direction.x,frame.direction.z,frame.speed);
    for(const [i,l] of this.env.powerLights.entries()){
      const value=this.poweredLevels[i]!;
      l.intensity=(state.power?value:value*.07)*(fp?.3:1);
    }
    // In play the house is a dark, half-lit place: the torch has to do the work.
    this.renderer.toneMappingExposure=fp?.86:1.13;
    this.scene.fog=fp?this.fogFx:null;this.scene.background=fp?this.darkBg:this.lightBg;
    const interval=time%34;
    const flicker=settings.reducedFlicker?1:1-.64*Math.exp(-((interval-8.7)**2)/.19)-.78*Math.exp(-((interval-23.4)**2)/.075);
    this.lamp.intensity=menu?25*flicker:(state.power?3.6:1.0)*flicker;
    const lit=menu||state.power,has=state.items.includes('torch');
    this.darkness=T.MathUtils.damp(this.darkness,lit?1:.3,3,dt);
    const fill=fp?.1:1;
    this.hemi.intensity=1.05*this.darkness*fill;this.sun.intensity=1.55*this.darkness*fill;
    const pick=this.torchPickup;
    this.torchProp.visible=!pick.held;   // in the hand it is drawn by the viewmodel
    if(this.physics){
      this.physics.movePlayer(state.x,state.z,this.fps.camera.position.y);
      for(const sync of this.doorSync)sync();
      this.physics.step(frame.paused||menu?0:dt);
      if(pick.body&&!pick.held){
        this.physics.pull(pick.body,this.torchProp);
        const at=this.torchProp.position;
        if(state.props?.torch||movedProps.torch)movedProps.torch={x:at.x,z:at.z};
        // Report the resting pose once the body has gone to sleep (or after a few quiet seconds).
        this.settleTimer=pick.body.isSleeping()||pick.body.linvel().y**2+pick.body.linvel().x**2+pick.body.linvel().z**2<1e-4?this.settleTimer+dt:0;
        if(this.settleTimer>.4&&this.settleTimer-dt<=.4&&state.props?.torch)this.onPropSettled?.('torch',this.poseOf(this.torchProp));
      }
    }
    this.cast.setGear({flashlight:false,on:false,armHidden:fp&&this.fps.vm.shownNow});
    this.listener={x:state.x,z:state.z};
    if(this.deskKey&&this.cabinetKey){
      const hangVisible=!state.items.includes('technicalKey'),lieVisible=state.archiveClue&&!state.items.includes('archiveKey');
      this.deskKey.root.visible=hangVisible;this.cabinetKey.root.visible=lieVisible;
      if(hangVisible){
        const d=Math.hypot(state.x-this.deskKey.root.position.x,state.z-this.deskKey.root.position.z);
        const stir=Math.max(0,1-d/1.7)*Math.min(1,frame.speed/2.4);
        this.deskKey.update(frame.paused?0:dt,stir,l=>this.onKeyClink?.(l*Math.max(.15,1-d/7)));
      }
      this.env.targets.underDesk=hangVisible?this.deskKey.root:this.hookTarget;
      this.env.targets.archiveCache=lieVisible?this.cabinetKey.root:this.slotTarget;
    }
    // A burning torch: in the hand (the flame bone of the viewmodel), or lying / standing lit wherever it was put down.
    const lyingLit=!pick.held&&!!state.props?.torch&&!!state.torchLit;
    const handFlame=fp&&state.items.includes('torch')?this.fps.flamePose():undefined;
    const flick=fireFlicker(time);
    this.fire.color.setHSL(.075+.012*(fireFlicker(time,3)-1),1,.6);
    const shadows=settings.shadows&&settings.quality==='high';
    if(this.fire.castShadow!==shadows)this.fire.castShadow=shadows;
    if(this.torchFlame){
      this.torchFlame.root.parent!.visible=lyingLit&&!menu&&!cctv;
      if(lyingLit)this.torchFlame.update(time,1);
    }
    let burn=0;
    if(!menu&&!cctv){
      if(handFlame){
        this.fire.position.copy(handFlame.position);burn=(fp?15:30)*handFlame.level*flick;
      }else if(lyingLit){
        const tip=this.torchProp.localToWorld(new T.Vector3(.66,.05,0));
        this.fire.position.copy(tip);burn=15*flick;
      }else if(state.lightOn&&state.items.includes('torch')&&!fp){
        this.fire.position.set(state.x+frame.direction.x*.3,1.3,state.z+frame.direction.z*.3);burn=28*flick;
      }
    }
    this.fire.intensity=burn;
    // The wrapped head is charred dark when the torch is out and glows when it burns.
    for(const m of this.torchHeads){const k=lyingLit?1:0;m.color.setScalar(.12+.88*k);m.emissive.setRGB(1,.42,.12);m.emissiveIntensity=k*.9;}
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
      this.analog.render(this.renderer,()=>this.renderer.render(this.scene,this.titleCamera),time,.55);
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
      this.analog.render(this.renderer,()=>{this.renderer.render(this.scene,this.fps.camera);this.fps.vm.draw(this.renderer);},time,1);
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
  // ---------------- hand interaction API (used by the page) ----------------
  /** Is the hand free to take something / is it holding the torch. */
  get handPhase(){return this.hand.phase;}
  /**
   * Reach for the torch: the arm moves onto it, the fingers open and close round the shaft, and only
   * then (`attach`) does the prop leave physics and become the one in the hand.
   */
  beginPickup(attach:()=>void){
    const p=this.torchPickup;
    const handOver=()=>{
      if(p.body&&this.physics){this.physics.remove(p.body);p.body=undefined;}
      delete movedProps.torch;attach();
    };
    if(!this.fpActive||!this.fps.vm.ready){p.held=true;handOver();this.hand.hold(p);return true;}
    const started=this.hand.reachFor(p,handOver);
    if(started)this.fps.vm.startPickup();   // the authored take-from-the-table motion
    return started;
  }
  /** Put the torch down: the hand moves forward and down, the fingers open, physics takes over. */
  beginDrop(release:(pose:number[])=>void){
    if(this.hand.phase!=='holding'||!this.fpActive)return false;
    const held=this.fps.vm.heldMatrix();if(!held)return false;
    // Lower and a little forward of where it is held, in camera space.
    this.dropAt=new T.Matrix4().makeTranslation(.03,-.17,-.2).multiply(held);
    this.dropWorld=new T.Vector3().setFromMatrixPosition(this.fps.camera.matrixWorld.clone().multiply(this.dropAt));
    const p=this.torchPickup;
    return this.hand.release(()=>{
      const inHand=this.fps.vm.heldMatrix()??held;
      const cam=this.fps.camera;cam.updateMatrixWorld(true);
      const world=cam.matrixWorld.clone().multiply(inHand);
      const pos=new T.Vector3(),quat=new T.Quaternion(),scl=new T.Vector3();world.decompose(pos,quat,scl);
      // Never spawn it inside a wall: keep it on the eye's side of anything between eye and hand.
      const eye=cam.getWorldPosition(new T.Vector3()),dir=pos.clone().sub(eye),len=dir.length();
      const hit=new T.Raycaster(eye,dir.normalize(),0,len+.05).intersectObject(this.env.root,true)[0];
      if(hit)pos.copy(eye).addScaledVector(dir,Math.max(.05,hit.distance-.06));
      this.torchProp.position.copy(pos);this.torchProp.quaternion.copy(quat);this.torchProp.updateMatrixWorld(true);
      this.torchProp.visible=true;
      if(this.physics){
        p.body=this.physics.addDynamic(this.torchProp,p.def.mass);
        const fwd=new T.Vector3(0,0,-1).applyQuaternion(cam.quaternion);fwd.y=0;fwd.normalize();
        p.body.setLinvel({x:fwd.x*.55,y:-.25,z:fwd.z*.55},true);
        p.body.setAngvel({x:(Math.random()-.5)*1.5,y:(Math.random()-.5)*1.2,z:(Math.random()-.5)*1.5},true);
      }
      movedProps.torch={x:pos.x,z:pos.z};this.settleTimer=0;this.dropAt=undefined;
      release(this.poseOf(this.torchProp));
    });
  }
  /** Bring props and hand in line with a loaded or fresh save. */
  syncPickups(state:Save){
    const p=this.torchPickup;if(!p)return;
    if(state.items.includes('torch')){
      if(p.body&&this.physics)this.physics.remove(p.body);
      p.body=undefined;this.hand.hold(p);delete movedProps.torch;return;
    }
    this.hand.reset();p.held=false;
    const pose=state.props?.torch;
    if(p.body&&this.physics){this.physics.remove(p.body);p.body=undefined;}
    if(pose&&pose.length===7){
      this.torchProp.position.set(pose[0]!,pose[1]!,pose[2]!);this.torchProp.quaternion.set(pose[3]!,pose[4]!,pose[5]!,pose[6]!);
      movedProps.torch={x:pose[0]!,z:pose[2]!};
      this.torchProp.updateMatrixWorld(true);
      if(this.physics)p.body=this.physics.addDynamic(this.torchProp,p.def.mass);
    }else{
      // Untouched: it stands against the wall, held there (no body: a rigid body would just fall over).
      this.placeTorchHome();delete movedProps.torch;
    }
    this.torchProp.updateMatrixWorld(true);
  }
  /** F: light the torch. onFlame runs when the flame catches (the state changes then, not before). */
  beginIgnite(onFlame:()=>void){
    if(!this.fpActive||!this.fps.vm.ready){onFlame();return true;}
    return this.fps.vm.startIgnite(onFlame);
  }
  /** Take the lighter out of the desk drawer: the drawer slides open, the hand takes the lighter; onTaken runs as the fingers close on it. */
  beginLighter(onTaken:()=>void){
    if(!this.fpActive||!this.fps.vm.ready){onTaken();return true;}
    return this.fps.vm.startLighter(onTaken);
  }
  get busy(){return this.fps.vm.igniting||this.fps.vm.lighterPlaying||this.fps.vm.pickupPlaying;}
  private poseOf(o:T.Object3D){
    const r=(n:number)=>Math.round(n*1e4)/1e4;
    return [o.position.x,o.position.y,o.position.z,o.quaternion.x,o.quaternion.y,o.quaternion.z,o.quaternion.w].map(r);
  }
  /** Drop a prop straight down onto the first upward-facing surface below `fromY` at its footprint. */
  private restOn(obj:T.Object3D,fromY:number){
    obj.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(obj);
    if(box.isEmpty())return;
    const c=box.getCenter(new T.Vector3());
    const ray=new T.Raycaster(new T.Vector3(c.x,fromY,c.z),new T.Vector3(0,-1,0),0,fromY+1);
    const n=new T.Vector3();
    for(const hit of ray.intersectObject(this.env.root,true)){
      if(!hit.face)continue;
      n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if(n.y<.7)continue;
      obj.position.y+=hit.point.y+.0015-box.min.y;
      obj.updateMatrixWorld(true);
      return;
    }
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
