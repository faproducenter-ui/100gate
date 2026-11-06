import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

export const INTRO_END=42;
export const INTRO_STAGES=[
  ['CHAIR_ROCKING',4],['CHAIR_FALL',11.65],['CHAIR_BREAK',12.5],
  ['LEFT_HAND_PARTIAL_RELEASE',13.1],['LEFT_HAND_KNIFE_PICKUP',16.5],
  ['LEFT_ROPE_CUT',22],['RIGHT_ROPE_CUT',26.5],['ROPE_REMOVAL',31],
  ['ROPE_DROP',34],['STAND_UP',36],['NORMAL_GAMEPLAY',42],
] as const;
export type IntroStage=typeof INTRO_STAGES[number][0];
export interface IntroCheckpoint {version:2;time:number;leftDraw?:number;rightDraw?:number;}

/** Simulation clock is independent of rendering, wall time and AnimationMixer. */
export class IntroFlow {
  time=0;pickupRequested=false;
  leftDraw=0;rightDraw=0;
  restore(time:number,leftDraw=0,rightDraw=0){this.time=T.MathUtils.clamp(Number.isFinite(time)?time:0,0,INTRO_END);this.pickupRequested=this.time>16.5;this.leftDraw=Number.isFinite(leftDraw)?T.MathUtils.clamp(leftDraw,0,2):0;this.rightDraw=Number.isFinite(rightDraw)?T.MathUtils.clamp(rightDraw,0,2):0;}
  get stage():IntroStage {for(let i=INTRO_STAGES.length-1;i>=0;i--)if(this.time>=INTRO_STAGES[i][1]-1e-6)return INTRO_STAGES[i][0];return 'CHAIR_ROCKING';}
  get waiting(){return Math.abs(this.time-16.5)<1e-6&&!this.pickupRequested;}
  requestPickup(){if(this.waiting)this.pickupRequested=true;}
  advance(dt:number,hold:boolean){
    if(!Number.isFinite(dt)||dt<0)throw Error('Invalid intro timestep');
    let left=dt;
    while(left>1e-8&&this.time<INTRO_END){
      const step=Math.min(left,1/120);left-=step;
      if(this.time<4)this.time=Math.min(4,this.time+step);
      else if(this.time<11.65){if(hold)this.time=Math.min(11.65,this.time+step);}
      else if(this.time<16.5)this.time=Math.min(16.5,this.time+step);
      else if(this.time<22){if(this.pickupRequested)this.time=Math.min(22,this.time+step);}
      else if(this.time<31){if(hold)this.time=Math.min(31,this.time+step);}
      else this.time=Math.min(INTRO_END,this.time+step);
    }
  }
  checkpoint():IntroCheckpoint{return {version:2,time:this.time,leftDraw:this.leftDraw,rightDraw:this.rightDraw};}
}

export class NativeIntro {
  readonly root=new T.Group();readonly flow=new IntroFlow();
  readonly mixer:T.AnimationMixer;readonly camera:T.PerspectiveCamera;
  readonly knife:T.Object3D;readonly chair:T.Object3D;readonly fragment:T.Object3D;
  private body:T.Mesh[]=[];
  private contacts:Record<'l'|'r',T.Object3D>;private previousContact?:{side:'l'|'r';z:number};
  private position=new T.Vector3();private rotation=new T.Quaternion();private euler=new T.Euler(0,0,0,'YXZ');
  private eyeFov?:number;
  constructor(scene:T.Scene,asset:GLTF){
    this.root.name='100gate native playable introduction';this.root.position.set(0,3.6,2.8);scene.add(this.root);this.root.add(asset.scene);
    const get=(name:string)=>{const o=asset.scene.getObjectByName(name);if(!o)throw Error('Native intro missing '+name);return o;};
    this.knife=get('Cinematic_field_knife');this.chair=get('old-chair');this.fragment=get('Left_rail_|_impact_fracture_fragment');
    this.contacts={l:get('LeftCutContact'),r:get('RightCutContact')};
    const eye=asset.cameras.find(c=>c.name.startsWith('Cine_·_First_person'));
    if(!(eye instanceof T.PerspectiveCamera))throw Error('Native intro eye camera missing');this.camera=eye;
    asset.scene.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;
      if(o.name.startsWith('Alexei_|_original_MakeHuman_body'))this.body.push(o);
    }});
    if(this.body.length!==5||asset.animations.length!==1||asset.animations[0].duration<41.9)throw Error('Incomplete native intro asset');
    this.mixer=new T.AnimationMixer(asset.scene);this.mixer.clipAction(asset.animations[0]).setLoop(T.LoopOnce,1).play();
    this.sample();
  }
  sample(){this.mixer.setTime(Math.min(INTRO_END-1e-5,this.flow.time));this.root.updateMatrixWorld(true);}
  measureCut(){
    const t=this.flow.time,side=t>=23&&t<=26.2?'l':t>=27.5&&t<=30.4?'r':undefined;
    if(!side){this.previousContact=undefined;return;}
    const p=this.knife.worldToLocal(this.contacts[side].getWorldPosition(new T.Vector3()));
    // glTF has converted the knife's authored Z-up local basis to Y-up.
    const contact=Math.abs(p.x-.010)<.006&&Math.abs(p.z)<.006&&p.y>=.075&&p.y<=.165;
    if(contact&&this.previousContact?.side===side){const draw=Math.abs(p.y-this.previousContact.z);if(side==='l')this.flow.leftDraw+=draw;else this.flow.rightDraw+=draw;}
    this.previousContact=contact?{side,z:p.y}:undefined;
  }
  follow(camera:T.PerspectiveCamera,motion:number){
    this.eyeFov??=camera.fov;
    const t=this.flow.time,close=T.MathUtils.smoothstep(t,16.5,18)*(1-T.MathUtils.smoothstep(t,34.4,36));
    const fov=T.MathUtils.lerp(this.eyeFov,35,close);
    if(Math.abs(camera.fov-fov)>.001){camera.fov=fov;camera.updateProjectionMatrix();}
    this.camera.getWorldPosition(this.position);this.camera.getWorldQuaternion(this.rotation);
    this.euler.setFromQuaternion(this.rotation,'YXZ');this.euler.z*=motion;
    camera.position.copy(this.position);camera.quaternion.setFromEuler(this.euler);
  }
  bodyVisible(v:boolean){for(const o of this.body)o.visible=v;}
  state(){return {stage:this.flow.stage,time:this.flow.time,waitingForKnife:this.flow.waiting,
    leftWrapped:this.flow.time<34,rightBound:this.flow.time<30.4,knifeAttached:this.flow.time>=19.4&&this.flow.time<31.9,
    ropeDropped:this.flow.time>=36,normal:this.flow.time>=42,leftDraw:this.flow.leftDraw,rightDraw:this.flow.rightDraw,
    contactLocal:{left:this.knife.worldToLocal(this.contacts.l.getWorldPosition(new T.Vector3())).toArray(),right:this.knife.worldToLocal(this.contacts.r.getWorldPosition(new T.Vector3())).toArray()}};}
}
