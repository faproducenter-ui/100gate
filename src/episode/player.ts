import * as T from 'three';
import { makeProp } from './props';
import type { PropId } from './pack';
import type { PlayerModelId } from './world';

const UP=new T.Vector3(0,1,0);
const midpoint=new T.Vector3(), delta=new T.Vector3(), hip=new T.Vector3(), knee=new T.Vector3(), ankle=new T.Vector3(), bend=new T.Vector3();
function connect(mesh:T.Object3D,a:T.Vector3,b:T.Vector3,overlap=0){
  delta.subVectors(b,a);const length=Math.max(.0001,delta.length());
  mesh.position.copy(midpoint.addVectors(a,b).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(UP,delta.multiplyScalar(1/length));mesh.scale.y=length+overlap;
}
export interface PlayerPose {
  position:T.Vector3;yaw:number;pitch:number;dt:number;elapsed:number;dx:number;dz:number;
  grounded:boolean;crouch:boolean;free:boolean;tipped:boolean;running:boolean;hold:number;activity:string;
  held?:PropId;using:number;reach:number;water:number;flashOn:boolean;shadows:boolean;
  introRise?:number;introSlide?:number;introRock?:number;
}
export class PlayerRig {
  readonly body=new T.Group();readonly view=new T.Group();
  private gear=new Map<PropId,T.Group>();private propSocket=new T.Group();
  private legs:ReturnType<PlayerRig['leg']>[];private arms:ReturnType<PlayerRig['arm']>[];
  private torso=new T.Group();private phase=0;private blend=0;private height=.91;private localX=0;private localZ=-1;private footfall=0;private authored=false;
  private emitter?:T.MeshStandardMaterial;
  private shadowRoot=new T.Group();private shadowArms:{side:number;upper:T.Group;lower:T.Group;hand:T.Group}[]=[];
  private shoulder=new T.Vector3();private elbow=new T.Vector3();private wristShadow=new T.Vector3();
  readonly lightSource=new T.Vector3();
  private handA=new T.Vector3();private handB=new T.Vector3();
  constructor(scene:T.Scene,camera:T.Camera){
    this.body.name='Alexei · physical body';this.body.userData.player=true;
    this.view.name='Alexei · hands and held object';this.view.userData.player=true;
    this.shadowRoot.name='Alexei · full shadow silhouette';this.body.add(this.torso,this.shadowRoot);
    this.legs=[this.leg(-1),this.leg(1)];
    this.arms=[this.arm(-1),this.arm(1)];
    this.view.add(this.propSocket);
    scene.add(this.body);camera.add(this.view);this.setVisible(false);
  }
  setVisible(visible:boolean){this.body.visible=this.view.visible=visible;}
  private prepareView(root:T.Object3D,order:number){
    const copies=new Map<T.Material,T.Material>();
    const copy=(mat:T.Material)=>{
      if(copies.has(mat))return copies.get(mat)!;
      const next=mat.clone();copies.set(mat,next);
      return next;
    };
    root.traverse(o=>{if(o instanceof T.Mesh){o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);o.renderOrder=order;o.castShadow=o.receiveShadow=false;}});
  }
  registerModel(id:PropId,model:T.Group){
    model.visible=false;this.gear.set(id,model);(id==='knife'?this.arms[1].wrist:this.propSocket).add(model);
    this.prepareView(model,34);
    model.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=o.receiveShadow=false;
      if(id==='flashlight'&&o.material instanceof T.MeshStandardMaterial&&/flashlight emitter/i.test(o.material.name)){
        this.emitter=o.material;
      }
    }});
  }
  loadBody(model:(id:PlayerModelId)=>T.Group){
    this.torso.add(model('player-torso'));
    for(const l of this.legs){
      l.thigh.add(model('player-trouser'));
      const shin=model('player-trouser');shin.scale.set(.76,1,.78);l.shin.add(shin);
      const boot=model('player-boot');boot.scale.x=l.side; l.shoe.add(boot);
    }
    for(const a of this.arms){
      const open=model('player-hand-open'),grip=model('player-hand-grip');
      open.scale.x=grip.scale.x=a.side; a.open.add(open);a.grip.add(grip);
      a.sleeve.add(model('player-sleeve'));
      this.prepareView(a.sleeve,30);this.prepareView(a.open,31);this.prepareView(a.grip,31);
      const upper=new T.Group(),lower=new T.Group(),hand=new T.Group();
      const shoulderSleeve=model('player-sleeve');shoulderSleeve.scale.set(1.22,1,1.22);upper.add(shoulderSleeve);
      lower.add(model('player-sleeve'));
      const silhouetteHand=model('player-hand-open');silhouetteHand.scale.set(a.side,1,1);hand.add(silhouetteHand);
      this.shadowRoot.add(upper,lower,hand);this.shadowArms.push({side:a.side,upper,lower,hand});
    }
    this.shadowRoot.add(model('player-upper-shadow'));
    this.body.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=o.receiveShadow=true;});
    // The head, chest and world-space arms are real casters, but must never hide the FPS camera.
    const invisible=new T.MeshBasicMaterial({colorWrite:false,depthWrite:false,depthTest:false});
    this.shadowRoot.traverse(o=>{if(o instanceof T.Mesh){o.material=invisible;o.castShadow=true;o.receiveShadow=false;}});
    this.view.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=o.receiveShadow=false;});
    this.authored=true;
  }
  private leg(side:number){
    const thigh=new T.Group(),shin=new T.Group(),shoe=new T.Group();
    shoe.name=side<0?'left-boot':'right-boot';this.body.add(thigh,shin,shoe);
    return {side,thigh,shin,shoe};
  }
  private arm(side:number){
    const wrist=new T.Group(),sleeve=new T.Group(),open=new T.Group(),grip=new T.Group();
    wrist.add(open,grip);this.view.add(wrist,sleeve);return {side,wrist,sleeve,open,grip};
  }
  private item(id?:PropId){
    for(const [key,g] of this.gear)g.visible=key===id;
    if(!id)return;
    if(!this.gear.has(id))this.registerModel(id,makeProp(id));
    this.gear.get(id)!.visible=true;
    return this.gear.get(id);
  }
  update(p:PlayerPose){
    this.setVisible(true);
    this.body.rotation.y=p.yaw;
    this.body.position.copy(p.position);
    const distance=Math.hypot(p.dx,p.dz),speed=distance/Math.max(.001,p.dt);
    const stride=p.running?1.42:p.crouch?.78:1.09;
    const oldBeat=Math.floor(this.phase*2);
    if(p.grounded&&p.free)this.phase=(this.phase+distance/stride)%1000;
    const stepped=p.free&&p.grounded&&distance>.0005&&Math.floor(this.phase*2)!==oldBeat;
    this.blend=T.MathUtils.damp(this.blend,p.grounded?Math.min(1,speed*1.5):0,12,p.dt);
    if(distance>.0002){
      this.localX=T.MathUtils.damp(this.localX,(Math.cos(p.yaw)*p.dx-Math.sin(p.yaw)*p.dz)/distance,20,p.dt);
      this.localZ=T.MathUtils.damp(this.localZ,(Math.sin(p.yaw)*p.dx+Math.cos(p.yaw)*p.dz)/distance,20,p.dt);
    }
    const rise=p.introRise??0,slide=p.introSlide??0;
    this.height=T.MathUtils.damp(this.height,p.free?(p.crouch?.56:.91):T.MathUtils.lerp(.53,.91,rise),16,p.dt);
    const waist=p.free?.16:T.MathUtils.lerp(.10,.16,rise);
    this.body.rotation.z=p.free?0:(p.introRock??0)*.34;
    if(!p.free){this.body.rotation.y=0;this.body.position.set(T.MathUtils.lerp(.20*slide,.5,rise),3.6,T.MathUtils.lerp(2.82-.66*slide,2,rise));}
    // Only the lap and boots are needed while tied up; the jacket must not intersect the tipped camera.
    this.torso.visible=p.free;
    this.torso.position.set(0,this.height+.027,waist+.031);
    this.shadowRoot.visible=p.free&&p.shadows;
    this.shadowRoot.position.set(0,this.height-.035,waist+.025);
    this.shadowRoot.scale.y=p.crouch?.80:1;
    for(const l of this.legs){
      const stridePhase=(this.phase+(l.side<0?0:.5))%1;
      const strideLength=stride*.54;
      const stance=stridePhase<.61;
      const swing=T.MathUtils.clamp((stridePhase-.61)/.39,0,1);
      const offset=(stance?(.5-stridePhase/.61):(T.MathUtils.smoothstep(swing,0,1)-.5))*strideLength*this.blend;
      const lift=(stance?0:Math.sin(swing*Math.PI))*(p.running?.155:.112)*this.blend;
      const airborne=p.free&&!p.grounded;
      l.shoe.position.set(l.side*(.116+.038*slide*(1-rise))+this.localX*offset,p.free?lift+(airborne?.12:0):.015,p.free?-.145+this.localZ*offset+(airborne?(l.side<0?-.08:.18):0):T.MathUtils.lerp(-.34-.12*slide,-.145,rise));
      l.shoe.rotation.set(airborne?-.25:stance?0:Math.sin(swing*Math.PI)*.23,l.side*-.085,0);
      hip.set(l.side*.093,this.height,waist);
      ankle.copy(l.shoe.position).add(new T.Vector3(0,.14,.035));
      // Solve the knee against a two-segment leg, keeping the boot position independent of bob.
      delta.subVectors(ankle,hip);const length=Math.max(.01,delta.length());delta.multiplyScalar(1/length);
      const along=Math.min(length*.5,.401);
      bend.set(0,0,-1).addScaledVector(delta,delta.z).normalize();
      knee.copy(hip).addScaledVector(delta,along).addScaledVector(bend,Math.sqrt(Math.max(.004,.417**2-along*along)));
      if(!p.free){knee.z-=.035*(1-rise);knee.y-=.085*slide*(1-rise);knee.x+=l.side*.022*slide*(1-rise);}
      connect(l.thigh,hip,knee,.042);connect(l.shin,knee,ankle,.037);
    }
    const id=p.free?p.held:undefined,prop=this.item(id);
    this.view.visible=p.free;
    const busy=p.hold>0&&p.free;
    const useLift=Math.sin(Math.PI*T.MathUtils.clamp(p.using,0,1));
    const reach=p.reach>0?Math.sin(Math.PI*T.MathUtils.clamp(p.reach,0,1)):0;
    const sway=Math.sin(this.phase*Math.PI*2)*this.blend*(p.running?.027:.015);
    if(p.free)for(const a of this.arms){
      const s=a.side,active=s>0&&Boolean(id),inspect=active&&id!=='flashlight';
      const x=s*(busy?.15:inspect?.155:.27);
      const y=(busy?-.195:active?-.286:-.426)+s*sway+reach*.07+useLift*.16;
      const z=(busy?-.52:active?-.43:-.53)+s*sway*.7-reach*.12+useLift*.16;
      a.wrist.position.set(x,y,z);
      a.wrist.rotation.set(active?-.60:busy?-1:-.48,active?-.27:s*.1,s*.14);
      a.grip.visible=active||busy;a.open.visible=!a.grip.visible;
      this.handA.set(s*.34,-.63,-.19);this.handB.copy(a.wrist.position).add(new T.Vector3(0,-.018,.013));connect(a.sleeve,this.handA,this.handB,.033);
      if(s>0){
        this.propSocket.position.copy(a.wrist.position).add(new T.Vector3(id==='flashlight'?.008:id==='key'?.026:-.014,id==='flashlight'?.039:.065,id==='flashlight'?-.052:-.028));
        this.propSocket.rotation.set(id==='flashlight'?(p.flashOn?.02:.22):id==='compass'?-.37:.02-useLift*.5,id==='flashlight'&&!p.flashOn?-.32:-.07,(id==='key'?-.19:.13)+useLift*.35);
        this.lightSource.set(0,0,-.165).applyEuler(this.propSocket.rotation).add(this.propSocket.position);
      }
    }
    if(this.shadowRoot.visible)for(const a of this.shadowArms){
      const s=a.side,holding=s>0&&Boolean(id),swing=s*sway*4.4;
      this.shoulder.set(s*.205,.407,.005);
      this.elbow.set(s*.24,holding?.25:.185,holding?-.09:.015+swing*.62);
      this.wristShadow.set(s*.245,holding?.30:-.033,holding?-.345:.024+swing);
      connect(a.upper,this.shoulder,this.elbow,.033);connect(a.lower,this.elbow,this.wristShadow,.035);
      a.hand.position.copy(this.wristShadow);a.hand.rotation.set(holding?1.15:-swing,0,Math.PI);
    }
    const needle=prop?.getObjectByName('needle');if(needle)needle.rotation.z=-p.yaw;
    const water=prop?.getObjectByName('water-level');if(water){water.visible=p.water>0;water.scale.y=p.water/3;water.position.y=-.083+.065*p.water/3;}
    if(this.emitter)this.emitter.emissiveIntensity=p.flashOn&&id==='flashlight'?2.7:.035;
    if(stepped)this.footfall=p.elapsed;
    return stepped;
  }
  state(){return {body:this.body.visible,hands:this.view.visible,authored:this.authored,shadowUpper:this.shadowRoot.visible,feet:this.legs.map(l=>l.shoe.position.toArray()),footfall:this.footfall,held:[...this.gear].find(([,p])=>p.visible)?.[0]??null};}
}
