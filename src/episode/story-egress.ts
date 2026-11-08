import * as T from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {StoryActor} from './story-actor';

export class StoryEgress {
  readonly actor:StoryActor;
  private readonly rig:T.Object3D;
  private readonly end:T.Vector3;
  private readonly endQ:T.Quaternion;
  private readonly stance:{p:T.Vector3;q:T.Quaternion}[];
  private readonly walk:T.AnimationClip;
  private readonly evaluator:T.AnimationAction;
  private readonly mixer:T.AnimationMixer;
  private readonly duration:number;
  private route?:T.CatmullRomCurve3;
  private phase='seated';
  private t=0;
  constructor(asset:GLTF,walk:T.AnimationClip,private readonly model:T.Group,private readonly side:'L'|'R'){
    this.actor=new StoryActor(asset,'Unknown '+side,.9);
    const rig=asset.scene.getObjectByName('SedanEgress_'+side);
    if(!rig||rig.parent!==asset.scene)throw Error('Unmatched egress hierarchy '+side);
    this.rig=rig;model.add(asset.scene);
    this.duration=asset.animations[0]!.duration;
    if(Math.abs(this.duration-2.2)>.04)throw Error('Invalid authored egress duration');
    asset.scene.traverse(o=>{
      if(o instanceof T.Mesh&&o.name.toLowerCase().includes('sweater')){
        for(const m of Array.isArray(o.material)?o.material:[o.material])
          if(m instanceof T.MeshStandardMaterial)m.color.multiplyScalar(side==='L'?.27:.18);
      }
    });
    this.actor.sample(this.duration);
    this.end=rig.position.clone();this.endQ=rig.quaternion.clone();
    this.stance=this.actor.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone()}));
    const names=new Set(this.actor.bones.map(b=>b.name));
    this.walk=new T.AnimationClip('Approach after egress',walk.duration,
      walk.tracks.filter(track=>names.has(track.name.split('.')[0]??'')).map(track=>track.clone()));
    this.mixer=new T.AnimationMixer(asset.scene);
    this.evaluator=this.mixer.clipAction(this.walk).setLoop(T.LoopOnce,1);
  }
  sample(abduction:boolean,seconds:number){
    this.actor.asset.scene.visible=abduction;
    if(!abduction)return;
    const clipStart=this.side==='L'?2.7:2.88;
    this.t=Math.max(0,seconds-clipStart);
    this.phase=seconds<clipStart?'seated':this.t<this.duration?'egress':'approach';
    if(this.t<=this.duration){
      if(this.evaluator.isScheduled())this.evaluator.stop();
      this.actor.sample(this.t);return;
    }
    const u=this.t-this.duration;
    const near=this.side==='L';
    if(!this.route){
      const start=this.model.localToWorld(this.end.clone());
      this.route=new T.CatmullRomCurve3(near?
        [start,start.clone().add(new T.Vector3(0,0,-.47)),new T.Vector3(-2.77,start.y,-.53),new T.Vector3(-3.26,start.y+.10,-1.11)]:
        [start,start.clone().add(new T.Vector3(0,0,.42)),new T.Vector3(-4.10,start.y,3.95),
         new T.Vector3(-4.28,start.y,2.15),new T.Vector3(-4.25,start.y+.03,.10)]);
    }
    const curve=this.route;
    // Short weight transfer before the moving stride; route stays behind
    // the open leaf and rounds the tail on the far side.
    const speed=curve.getLength()/(8.64-clipStart-this.duration-.19);
    const dist=Math.min(curve.getLength(),u<.38?speed*u*u/(2*.38):speed*(u-.19));
    const d=dist/curve.getLength();
    const pos=curve.getPointAt(d),dir=curve.getTangentAt(d).normalize();
    const local=this.model.worldToLocal(pos.clone());
    const look=this.model.worldToLocal(pos.add(dir)).sub(local);
    const facing=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.atan2(look.x,look.z));
    const weight=T.MathUtils.smoothstep(u,0,.38);
    // The final egress stance is compressed; the in-place gait bind origin
    // returns to road level as the new supporting leg takes the weight.
    local.y-=this.end.y*weight;
    // Reset the secondary evaluator for deterministic forward/backward scrubs.
    // It writes a fresh locomotion pose before the stance blend each time.
    this.evaluator.stop().reset().play();
    this.mixer.setTime(dist%this.walk.duration);
    for(const [i,b] of this.actor.bones.entries()){
      const prior=this.stance[i]!;
      b.position.lerp(prior.p,1-weight);b.quaternion.slerp(prior.q,1-weight);
    }
    this.rig.position.copy(local);this.rig.quaternion.copy(this.endQ).slerp(facing,weight);
    this.actor.asset.scene.updateMatrixWorld(true);
  }
  snapshot(){
    return {...this.actor.snapshot(),phase:this.phase,clipSeconds:this.t,
      root:this.rig.getWorldPosition(new T.Vector3()).toArray()};
  }
  dispose(){this.evaluator.stop();this.mixer.uncacheRoot(this.actor.asset.scene);this.actor.dispose();}
}
