import * as T from 'three';
import type { House, PlayerModelId } from './world';
import { material, weave } from './props';

export const INTRO_ORIGIN=new T.Vector3(0,3.6,2.8);
export const SLIP=.8, PICKUP=1, CUT=2.8, RISE=1;
export const GRIP_TIME=16/30;
export const SAW_START=75;
export const MIN_SAW_TRAVEL=.26;
const UP=new T.Vector3(0,1,0);
const RIGHT=new T.Vector3(1,0,0);
const clamp=(x:number)=>T.MathUtils.clamp(x,0,1);
export const ease=(x:number)=>T.MathUtils.smoothstep(x,0,1);
const scratch=new T.Vector3(),axis=new T.Vector3(),basis=new T.Vector3(),binormal=new T.Vector3();

/** Fixed topology; update the rope centreline, not GPU resources. */
class Strand extends T.Mesh<T.BufferGeometry,T.Material>{
  private points=new Float32Array(17*8*3);
  constructor(mat:T.Material){
    super(new T.BufferGeometry(),mat);const indices:number[]=[];
    for(let i=0;i<16;i++)for(let j=0;j<8;j++){
      const a=i*8+j,b=i*8+(j+1)%8;indices.push(a,b,a+8,b,b+8,a+8);
    }
    const uv=[];for(let i=0;i<=16;i++)for(let j=0;j<8;j++)uv.push(j/8,i/4);
    this.geometry.setIndex(indices);this.geometry.setAttribute('position',new T.BufferAttribute(this.points,3).setUsage(T.DynamicDrawUsage));
    this.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    this.frustumCulled=false;this.castShadow=this.receiveShadow=true;
  }
  shape(a:T.Vector3,b:T.Vector3,sag:number){
    for(let i=0;i<=16;i++){
      const t=i/16;scratch.lerpVectors(a,b,t);scratch.y-=4*sag*t*(1-t);
      axis.subVectors(b,a);axis.y-=4*sag*(1-2*t);axis.normalize();
      basis.crossVectors(axis,Math.abs(axis.y)>.92?RIGHT:UP).normalize();
      binormal.crossVectors(axis,basis);
      for(let j=0;j<8;j++){
        const u=j*Math.PI/4,r=.0038+Math.sin(t*56+u*3)*.00045,k=(i*8+j)*3;
        const c=Math.cos(u)*r,s=Math.sin(u)*r;
        this.points[k]=scratch.x+basis.x*c+binormal.x*s;this.points[k+1]=scratch.y+basis.y*c+binormal.y*s;this.points[k+2]=scratch.z+basis.z*c+binormal.z*s;
      }
    }
    this.geometry.attributes.position.needsUpdate=true;this.geometry.computeVertexNormals();
  }
}

/** One continuous jacket mesh per arm, with a rounded elbow and transported cross-section.
 * Retains the authored sleeve UV/material; there are no overlapping caps at the elbow. */
class JacketArm {
  readonly mesh:T.Mesh;
  private source:T.BufferAttribute;private normal:T.BufferAttribute;
  private a=new T.Vector3();private b=new T.Vector3();private centre=new T.Vector3();
  private tangent=new T.Vector3();private across=new T.Vector3();private plane=new T.Vector3();
  constructor(model:T.Group){
    const source=model.children.find(o=>o instanceof T.Mesh) as T.Mesh|undefined;
    if(!source)throw Error('Missing jacket sleeve mesh');
    this.source=source.geometry.getAttribute('position') as T.BufferAttribute;this.normal=source.geometry.getAttribute('normal') as T.BufferAttribute;
    this.mesh=new T.Mesh(source.geometry.clone(),source.material);this.mesh.frustumCulled=false;
  }
  shape(s:T.Vector3,e:T.Vector3,w:T.Vector3){
    this.a.lerpVectors(s,e,.72);this.b.lerpVectors(e,w,.28);
    this.plane.crossVectors(axis.subVectors(e,s),scratch.subVectors(w,e)).normalize();
    if(this.plane.lengthSq()<.01)this.plane.set(0,0,1);
    const p=this.mesh.geometry.attributes.position,n=this.mesh.geometry.attributes.normal;
    for(let i=0;i<p.count;i++){
      const u=clamp(this.source.getY(i)+.5);
      if(u<.36){this.centre.lerpVectors(s,this.a,u/.36);this.tangent.subVectors(e,s);}
      else if(u>.64){this.centre.lerpVectors(this.b,w,(u-.64)/.36);this.tangent.subVectors(w,e);}
      else{const t=(u-.36)/.28,h=1-t;this.centre.copy(this.a).multiplyScalar(h*h).addScaledVector(e,2*h*t).addScaledVector(this.b,t*t);
        this.tangent.subVectors(e,this.a).multiplyScalar(h).addScaledVector(scratch.subVectors(this.b,e),t);}
      this.tangent.normalize();this.across.crossVectors(this.tangent,this.plane).normalize();
      binormal.crossVectors(this.across,this.tangent);
      // The elbow keeps cloth volume; only the cuff narrows to the anatomical wrist.
      const r=T.MathUtils.lerp(1.09,.73,ease((u-.72)/.28));
      this.centre.addScaledVector(this.across,r*this.source.getX(i)).addScaledVector(binormal,r*this.source.getZ(i));
      p.setXYZ(i,this.centre.x,this.centre.y,this.centre.z);
      scratch.copy(this.across).multiplyScalar(this.normal.getX(i)).addScaledVector(this.tangent,this.normal.getY(i)).addScaledVector(binormal,this.normal.getZ(i)).normalize();
      n.setXYZ(i,scratch.x,scratch.y,scratch.z);
    }
    p.needsUpdate=n.needsUpdate=true;
  }
}

export interface EscapePose {slip:number;pickup:number;hasKnife:boolean;cut:number;rise:number;free:boolean;rock:number;chairAnchor:T.Vector3;}
export class EscapeRig {
  readonly root:T.Group;
  readonly knife:T.Object3D;
  private wrists:T.Object3D[];
  private hands:T.Mesh[]=[];
  private arms:JacketArm[]=[];
  private cuffs:T.Mesh[]=[];
  private strand:Strand;private tail:Strand;
  private anchor=new T.Vector3();private edgeProfile:T.Vector3[]=[];
  private sawPosition=new T.Vector3();private sawAxis=new T.Vector3();private sawRot=new T.Quaternion();
  private sawPoint=new T.Vector3();private ropePoint=new T.Vector3();private ropeLine=new T.Line3();
  private cutSite=new T.Vector3();private cutKnot=new T.Vector3();
  private liveAnchor=new T.Vector3();private recoil=new T.Vector3();
  private socket:T.Object3D;private edge:T.Object3D;
  private mixer:T.AnimationMixer;private action:T.AnimationAction;
  private floorPos=new T.Vector3();private floorRot=new T.Quaternion();
  private severPoint=new T.Vector3();
  private knotLocal=new T.Vector3();
  private knot=new T.Vector3();private ropeEnd=new T.Vector3();private bladePoint=new T.Vector3();
  private knifeAttached=false;private frame=1;private contactDistance=Infinity;private closure=0;
  private shoulder=new T.Vector3();private elbow=new T.Vector3();private line=new T.Vector3();private bend=new T.Vector3();

  constructor(scene:T.Scene,asset:House['intro'],model:(id:PlayerModelId)=>T.Group){
    this.root=asset.scene;this.root.position.copy(INTRO_ORIGIN);this.root.userData.player=true;
    const nodes=new Map<string,T.Object3D>();this.root.traverse(o=>{if(o.userData.escapeRole)nodes.set(o.userData.escapeRole,o);});
    const node=(role:string)=>{const o=nodes.get(role);if(!o)throw Error('Escape GLB missing '+role);return o;};
    this.wrists=[node('LeftWrist'),node('RightWrist')];
    this.socket=node('GripSocket');this.knife=node('EscapeKnife');this.edge=node('BladeEdge');
    // Blender SCENE export can omit static empty TRS. Store calibrated marker values explicitly in glTF extras.
    this.socket.position.fromArray(this.socket.userData.localPoint);this.socket.quaternion.fromArray(this.socket.userData.localRotation);
    this.edge.position.fromArray(this.edge.userData.localPoint);
    const edgeProfile=this.edge.userData.edgeProfile as number[];
    for(let i=0;i<edgeProfile.length;i+=3)this.edgeProfile.push(new T.Vector3().fromArray(edgeProfile,i));
    const anchorMarker=node('RopeAnchor');this.anchor.fromArray(anchorMarker.userData.localPoint);anchorMarker.position.copy(this.anchor);
    const knotMarker=node('RopeContact');this.knotLocal.fromArray(knotMarker.userData.localPoint);knotMarker.position.copy(this.knotLocal);
    const hand=node('IntroHand') as T.Mesh;
    const rope=material(0x756044,.96);rope.bumpMap=weave('#806747','#bc9e6966');rope.bumpScale=.003;
    for(let i=0;i<2;i++){
      const side=i?1:-1,w=this.wrists[i],h=i?hand:hand.clone();h.scale.x=side;w.add(h);this.hands.push(h);
      const points=[];
      for(let n=0;n<=90;n++){
        const t=n/90,a=t*Math.PI*6.2;
        points.push(new T.Vector3((.032-.002*t)*Math.cos(a),-.016+.029*t,-.006+(.020+.003*t)*Math.sin(a)));
      }
      const cuff=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),92,.0038,7,false),rope);this.cuffs.push(cuff);w.add(cuff);
      if(!i){
        const hitch=new T.CatmullRomCurve3([new T.Vector3(.029,.01,-.009),new T.Vector3(.041,.012,-.014),this.knotLocal.clone(),new T.Vector3(.037,.021,-.002),new T.Vector3(.03,.017,-.011)]);
        cuff.add(new T.Mesh(new T.TubeGeometry(hitch,18,.0042,7,false),rope));
      }
      const arm=new JacketArm(model('player-sleeve'));this.arms.push(arm);this.root.add(arm.mesh);
    }
    this.strand=new Strand(rope);this.tail=new Strand(rope);this.root.add(this.strand,this.tail);
    this.root.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=o.receiveShadow=true;});
    this.mixer=new T.AnimationMixer(this.root);
    const clip=new T.AnimationClip('Escape · Blender contact choreography',-1,asset.animations.flatMap(c=>c.tracks.filter(t=>this.wrists.some(w=>t.name.startsWith(w.name+'.')))));
    if(clip.tracks.length!==4||clip.duration<5.58||this.socket.position.length()<.06||this.edge.position.length()<.1)throw Error('Invalid escape animation or contact markers');
    this.action=this.mixer.clipAction(clip).setLoop(T.LoopOnce,1);this.action.clampWhenFinished=true;this.action.play();
    this.sample(139);this.severPoint.copy(this.knotLocal).applyQuaternion(this.wrists[0].quaternion).add(this.wrists[0].position);
    this.cutKnot.copy(this.severPoint);this.cutSite.copy(this.severPoint).lerp(this.anchor,.33);
    this.sample(38);this.floorPos.copy(this.socket.position).applyQuaternion(this.wrists[1].quaternion).add(this.wrists[1].position);
    this.floorRot.copy(this.wrists[1].quaternion).multiply(this.socket.quaternion);
    this.wrists[1].add(this.socket);scene.add(this.root);this.root.visible=false;
  }
  private sample(frame:number){this.frame=frame;this.action.paused=false;this.mixer.setTime(frame/30);}
  knifeForInventory(){const g=new T.Group(),k=this.knife.clone(true);k.position.copy(this.socket.position);k.quaternion.copy(this.socket.quaternion);g.add(k);return g;}
  setVisible(v:boolean){this.root.visible=v;}
  contactPan(camera:T.Camera){return T.MathUtils.clamp(camera.worldToLocal(this.edge.getWorldPosition(new T.Vector3())).x*2,-.65,.65);}
  private contact(){
    const [left,right]=this.wrists;
    this.sawPosition.copy(this.socket.position).applyQuaternion(right.quaternion).add(right.position);
    this.sawRot.copy(right.quaternion).multiply(this.socket.quaternion);
    this.sawAxis.copy(UP).applyQuaternion(this.sawRot);
    this.ropeLine.start.copy(this.knotLocal).applyQuaternion(left.quaternion).add(left.position);this.ropeLine.end.copy(this.anchor);
    let gap=Infinity;
    // Sample only the measured bevel, deliberately excluding the tip and the handle.
    for(let i=1;i<this.edgeProfile.length;i++)for(let j=0;j<=12;j++){
      this.sawPoint.lerpVectors(this.edgeProfile[i-1],this.edgeProfile[i],j/12).applyQuaternion(this.sawRot).add(this.sawPosition);
      this.ropeLine.closestPointToPoint(this.sawPoint,true,this.ropePoint);
      const d=this.sawPoint.distanceTo(this.ropePoint);
      if(d<gap){gap=d;this.bladePoint.copy(this.ropePoint);}
    }
    return gap;
  }
  sampleSaw(seconds:number){
    this.sample(55+seconds*30);
    return {gap:this.contact(),position:this.sawPosition,axis:this.sawAxis};
  }
  sever(){this.cutSite.copy(this.bladePoint);this.cutKnot.copy(this.ropeLine.start);}
  update(p:EscapePose){
    this.root.visible=true;
    const rise=p.rise>=0?clamp(p.rise):0;
    const moving=!p.free&&p.rise<1;
    const frame=p.rise>=0?139+30*rise:p.cut>0?55+30*p.cut:p.pickup>=0?25+30*clamp(p.pickup):p.hasKnife?55:1+30*clamp(p.slip/SLIP)*SLIP;
    this.sample(frame);
    // Rocking belongs to the body/chair, never to the look/camera axes.
    this.root.rotation.z=p.slip<0?p.rock:0;
    this.liveAnchor.copy(p.chairAnchor).sub(INTRO_ORIGIN).applyAxisAngle(new T.Vector3(0,0,1),-this.root.rotation.z);
    if(p.slip>=SLIP)this.liveAnchor.copy(this.anchor);
    const close=p.rise>=0?1-ease((rise-.35)/.35):p.pickup>=0?ease((p.pickup-13/30)/(.1)):p.hasKnife?1:0;
    this.closure=close;
    this.hands[0].morphTargetInfluences!.fill(p.slip<0?.30:.30*(1-ease(p.slip/SLIP)));
    const rightWeights=this.hands[1].morphTargetInfluences!;
    const starts=[38,39,38,38.3,38.5,38.7];
    for(let i=0;i<rightWeights.length;i++)rightWeights[i]=p.pickup>=0?ease((frame-starts[i])/(41-starts[i])):close;
    this.knifeAttached=p.hasKnife||p.pickup>=GRIP_TIME;
    const parent=this.knifeAttached?this.socket:this.root;
    if(this.knife.parent!==parent)parent.add(this.knife);
    if(this.knifeAttached){this.knife.position.set(0,0,0);this.knife.quaternion.identity();}
    else{
      this.knife.quaternion.copy(this.root.quaternion).invert();
      this.knife.position.copy(this.floorPos).applyQuaternion(this.knife.quaternion);
      this.knife.quaternion.multiply(this.floorRot);
    }
    this.knife.visible=moving&&(p.rise<0||rise<.56);
    const showArms=moving&&(p.rise<0||rise<.96);
    for(let i=0;i<2;i++){
      const side=i?1:-1,w=this.wrists[i],arm=this.arms[i];
      w.visible=arm.mesh.visible=showArms;
      if(!showArms)continue;
      this.cuffs[i].visible=showArms&&(i===0?p.rise<0||rise<.24:p.slip<.24);
      this.cuffs[i].scale.setScalar(i===0&&p.rise>=0?1+.28*ease(rise/.24):1);
      const sl=ease(Math.max(0,p.slip)/SLIP);
      const lean=p.pickup>=0?Math.sin(Math.PI*p.pickup)**2:0;
      this.shoulder.set(side*.19+.22*sl,.91-.12*sl+.63*rise-(i?.23:.09)*lean,.015-.57*sl-.23*rise-(i?.25:.1)*lean);
      // Two-segment pole solve; the wrist endpoint is authored, elbow bends out and down.
      this.line.subVectors(w.position,this.shoulder);const d=Math.max(.001,this.line.length());this.line.multiplyScalar(1/d);
      this.bend.set(side,-.72,.18).addScaledVector(this.line,-this.bend.dot(this.line)).normalize();
      this.elbow.copy(this.shoulder).lerp(w.position,.52).addScaledVector(this.bend,Math.sqrt(Math.max(.002,.31**2-(d*.52)**2)));
      this.shoulder.z+=.16;
      arm.shape(this.shoulder,this.elbow,w.position);
    }
    const [left,right]=this.wrists;
    this.knot.copy(this.knotLocal).applyQuaternion(left.quaternion).add(left.position);
    this.ropeEnd.set(-.034,.017,-.006).applyQuaternion(right.quaternion).add(right.position);
    const broken=this.broken=p.rise>=0||p.free;
    this.strand.visible=true;this.tail.visible=true;
    if(!broken){
      // One continuous lashing: left cuff → right cuff → chair. As the right wrist
      // slips through the loop the junction retracts; the left cuff never comes loose.
      const slip=ease((p.slip-.12)/.28);
      this.ropeEnd.lerp(this.knot,slip);
      this.strand.visible=slip<.985;
      if(this.strand.visible)this.strand.shape(this.knot,this.ropeEnd,.005*(1-slip));
      this.tail.shape(this.ropeEnd,this.liveAnchor,slip<.985?.009:.0012);
    }else{
      const drop=p.free?1:clamp(rise/.47)**2;
      this.recoil.subVectors(this.anchor,this.cutKnot).normalize().multiplyScalar(.068*ease(rise/.11)*(1-drop));
      this.knot.copy(this.cutKnot).lerp(scratch.set(.19,.014,-1.11),drop);
      this.ropeEnd.copy(this.cutSite).lerp(scratch.set(.39,.013,-1.03),drop).sub(this.recoil);
      this.strand.shape(this.knot,this.ropeEnd,.008*(1-drop)+.001);
      this.ropeEnd.copy(this.cutSite).lerp(scratch.set(.68,.013,-.72),drop).add(this.recoil);
      this.tail.shape(this.ropeEnd,this.anchor,.002+.065*drop);
    }
    this.root.updateMatrixWorld(true);
    this.contactDistance=p.cut>0&&!broken?this.contact():Infinity;
  }
  state(){return {frame:this.frame,attached:this.knifeAttached,closure:this.closure,edgeDistance:this.contactDistance,
    hands:this.wrists.map(w=>w.position.toArray()),knife:this.knife.getWorldPosition(new T.Vector3()).toArray(),
    bridge:!this.broken,ropeDropped:this.broken,tethered:this.cuffs[0].visible&&!this.broken};}
  private broken=false;
}
