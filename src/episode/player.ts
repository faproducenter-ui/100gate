import * as T from 'three';
import { disc, makeProp, material, piece, soft, weave } from './props';
import type { PropId } from './pack';

const UP=new T.Vector3(0,1,0);
const midpoint=new T.Vector3(), delta=new T.Vector3(), hip=new T.Vector3(), knee=new T.Vector3(), ankle=new T.Vector3(), bend=new T.Vector3();
function connect(mesh:T.Object3D,a:T.Vector3,b:T.Vector3){
  delta.subVectors(b,a);const length=Math.max(.0001,delta.length());
  mesh.position.copy(midpoint.addVectors(a,b).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(UP,delta.multiplyScalar(1/length));mesh.scale.y=length;
}
function cylinder(g:T.Group,mat:T.Material,top:number,bottom:number){
  return piece(g,new T.CylinderGeometry(top,bottom,1,12,1),mat);
}
function fingers(g:T.Group,skin:T.Material,sleeve:T.Material,side:number){
  const palm=soft(g,skin,0,.019,0,.064,.074,.037,.014);
  for(let i=0;i<4;i++){
    const finger=piece(g,new T.CapsuleGeometry(.009-i*.0006,.035-i*.002,3,6),skin,(i-1.5)*.016,.054,-.006);
    finger.rotation.x=-.7;finger.rotation.z=(i-1.5)*-.075;
  }
  const thumb=piece(g,new T.CapsuleGeometry(.011,.032,3,8),skin,-side*.035,.023,.009);thumb.rotation.set(.38,0,side*.57);
  disc(g,sleeve,.041,.043,0,-.03,0,12);palm.rotation.y=side*.06;
}
export interface PlayerPose {
  position:T.Vector3;yaw:number;pitch:number;dt:number;elapsed:number;dx:number;dz:number;
  grounded:boolean;crouch:boolean;free:boolean;tipped:boolean;running:boolean;hold:number;activity:string;
  held?:PropId;using:number;reach:number;water:number;
}
export class PlayerRig {
  readonly body=new T.Group();readonly view=new T.Group();
  private gear=new Map<PropId,T.Group>();private propSocket=new T.Group();private coils=new T.Group();
  private legs:ReturnType<PlayerRig['leg']>[];private arms:ReturnType<PlayerRig['arm']>[];
  private shirt=material(0x949581,.92);private denim=material(0x747d81,.93);private rubber=material(0x282a28,.86);
  private leather=material(0x514137,.68);private lace=material(0x837660,.86);private skin=material(0x9e7258,.76);
  private pelvis:T.Mesh;private hem:T.Mesh;private phase=0;private blend=0;private height=.91;private localX=0;private localZ=-1;private footfall=0;
  private handA=new T.Vector3();private handB=new T.Vector3();
  constructor(scene:T.Scene,camera:T.Camera){
    this.shirt.map=weave('#657066','#bbaf8b37');this.shirt.bumpMap=this.shirt.map;this.shirt.bumpScale=.013;
    this.denim.map=weave('#657782','#d1d2bc43');this.denim.bumpMap=this.denim.map;this.denim.bumpScale=.012;
    this.skin.map=weave('#b99987','#d9b39714');this.skin.bumpMap=this.skin.map;this.skin.bumpScale=.004;
    this.leather.bumpMap=this.shirt.map;this.leather.bumpScale=.006;
    this.body.name='Alexei · physical body';this.body.userData.player=true;
    this.view.name='Alexei · hands and held object';this.view.userData.player=true;
    this.pelvis=soft(this.body,this.denim,0,.93,.16,.338,.205,.2,.074);
    this.hem=soft(this.body,this.shirt,0,1.09,.178,.39,.218,.218,.077);
    this.legs=[this.leg(-1),this.leg(1)];
    const rope=material(0x8c7752,1);rope.bumpMap=this.shirt.map;rope.bumpScale=.008;
    this.arms=[this.arm(-1),this.arm(1)];
    this.arms.forEach(a=>a.wrist.add(this.rope(rope)));
    for(let i=0;i<3;i++){
      const band=piece(this.coils,new T.TorusGeometry(.083,.005,5,28),rope,0,-.35+i*.009,-.37);
      band.scale.x=1.6;band.rotation.x=1.15;
    }
    this.view.add(this.coils,this.propSocket);
    this.body.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
    scene.add(this.body);camera.add(this.view);this.setVisible(false);
  }
  setVisible(visible:boolean){this.body.visible=this.view.visible=visible;}
  registerModel(id:PropId,model:T.Group){model.visible=false;this.gear.set(id,model);this.propSocket.add(model);}
  private rope(mat:T.Material){
    const g=new T.Group();g.name='wrist-ropes';
    for(let i=0;i<5;i++)piece(g,new T.TorusGeometry(.044,.005,6,20),mat,0,-.047+i*.01,0).rotation.x=Math.PI/2+i*.018;
    return g;
  }
  private leg(side:number){
    const thigh=cylinder(this.body,this.denim,.075,.105),shin=cylinder(this.body,this.denim,.059,.082);
    const joint=piece(this.body,new T.SphereGeometry(.080,12,8),this.denim);
    const shoe=new T.Group();shoe.name=side<0?'left-boot':'right-boot';this.body.add(shoe);
    soft(shoe,this.rubber,0,.025,-.052,.136,.046,.285,.022);
    soft(shoe,this.leather,0,.075,-.081,.126,.089,.215,.037);
    soft(shoe,this.leather,0,.112,.036,.117,.151,.105,.034);
    soft(shoe,this.rubber,0,.056,-.16,.125,.032,.056,.015);
    for(let i=0;i<5;i++){
      soft(shoe,this.lace,0,.126+i*.006,-.064+i*.015,.064,.007,.008,.003).rotation.z=i%2?.11:-.11;
      for(const x of [-.031,.031])disc(shoe,this.rubber,.007,.003,x,.122+i*.006,-.064+i*.015,8);
    }
    for(let i=0;i<6;i++)soft(shoe,this.leather,0,.016,-.154+i*.043,.129,.017,.021,.005);
    return {side,thigh,shin,joint,shoe};
  }
  private arm(side:number){
    const wrist=new T.Group();this.view.add(wrist);fingers(wrist,this.skin,this.shirt,side);
    const sleeve=cylinder(this.view,this.shirt,.037,.071);
    return {side,wrist,sleeve};
  }
  private item(id?:PropId){
    for(const [key,g] of this.gear)g.visible=key===id;
    if(!id)return;
    if(!this.gear.has(id)){const g=makeProp(id);this.gear.set(id,g);this.propSocket.add(g);}
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
    this.height=T.MathUtils.damp(this.height,p.free?(p.crouch?.56:.91):.53,16,p.dt);
    const waist=p.free?.16:.10;
    if(!p.free)this.body.position.set(p.tipped?.2:0,3.6,p.tipped?2.16:2.82);
    this.pelvis.position.set(0,this.height+.023,waist);
    this.hem.position.set(0,this.height+.15,waist+.058);
    for(const l of this.legs){
      const stridePhase=(this.phase+(l.side<0?0:.5))%1;
      const strideLength=stride*.54;
      const stance=stridePhase<.61;
      const swing=T.MathUtils.clamp((stridePhase-.61)/.39,0,1);
      const offset=(stance?(.5-stridePhase/.61):(T.MathUtils.smoothstep(swing,0,1)-.5))*strideLength*this.blend;
      const lift=(stance?0:Math.sin(swing*Math.PI))*(p.running?.155:.112)*this.blend;
      const airborne=p.free&&!p.grounded;
      l.shoe.position.set(l.side*.116+this.localX*offset,p.free?lift+(airborne?.12:0):.015,p.free?-.145+this.localZ*offset+(airborne?(l.side<0?-.08:.18):0):-.34);
      l.shoe.rotation.set(airborne?-.25:stance?0:Math.sin(swing*Math.PI)*.23,l.side*-.085,0);
      hip.set(l.side*.093,this.height,waist);
      ankle.copy(l.shoe.position).add(new T.Vector3(0,.14,.035));
      // Solve the knee against a two-segment leg, keeping the boot position independent of bob.
      delta.subVectors(ankle,hip);const length=Math.max(.01,delta.length());delta.multiplyScalar(1/length);
      const along=Math.min(length*.5,.401);
      bend.set(0,0,-1).addScaledVector(delta,delta.z).normalize();
      knee.copy(hip).addScaledVector(delta,along).addScaledVector(bend,Math.sqrt(Math.max(.004,.417**2-along*along)));
      if(!p.free)knee.z-=.06;
      l.joint.position.copy(knee);connect(l.thigh,hip,knee);connect(l.shin,knee,ankle);
    }
    const id=p.activity==='cut'?'knife':p.held, prop=this.item(id);
    const busy=p.hold>0&&p.activity!=='cut'&&p.activity!=='tip';
    const useLift=Math.sin(Math.PI*T.MathUtils.clamp(p.using,0,1));
    const reach=p.reach>0?Math.sin(Math.PI*T.MathUtils.clamp(p.reach,0,1)):0;
    const sway=Math.sin(this.phase*Math.PI*2)*this.blend*(p.running?.027:.015);
    this.coils.visible=!p.free;
    for(const a of this.arms){
      const s=a.side,active=s>0&&Boolean(id);
      const inspect=active&&id!=='flashlight';
      let x=s*(p.free?(busy?.15:inspect?.155:.25):.108),y=p.free?(busy?-.195:active?-.286:-.357):-.347,z=p.free?(busy?-.52:active?-.43:-.53):-.396;
      if(p.activity==='cut'&&s>0){x=.05+Math.sin(p.elapsed*15)*.065;y=-.31;z=-.38;}
      else if(p.free){y+=s*sway+reach*.07+useLift*.16;z+=s*sway*.7-reach*.12+useLift*.16;}
      a.wrist.position.set(x,y,z);
      a.wrist.rotation.set(active?-.60:busy?-1:-.38,active?-.27:s*.1,s*.14);
      a.wrist.getObjectByName('wrist-ropes')!.visible=!p.free;
      this.handA.set(s*.34,-.63,-.19);this.handB.copy(a.wrist.position).add(new T.Vector3(0,-.034,.017));connect(a.sleeve,this.handA,this.handB);
      if(s>0){
        this.propSocket.position.copy(a.wrist.position).add(new T.Vector3(id==='flashlight'?.018:-.014,id==='flashlight'?.036:.068,id==='flashlight'?-.053:-.025));
        this.propSocket.rotation.set(id==='flashlight'?.03:id==='compass'?-.37:.02-useLift*.5,-.07,.13+useLift*.35);
      }
    }
    const needle=prop?.getObjectByName('needle');if(needle)needle.rotation.z=-p.yaw;
    const water=prop?.getObjectByName('water-level');if(water){water.visible=p.water>0;water.scale.y=p.water/3;water.position.y=-.083+.065*p.water/3;}
    if(stepped)this.footfall=p.elapsed;
    return stepped;
  }
  state(){return {body:this.body.visible,hands:this.view.visible,feet:this.legs.map(l=>l.shoe.position.toArray()),footfall:this.footfall,held:[...this.gear].find(([,p])=>p.visible)?.[0]??null};}
}
