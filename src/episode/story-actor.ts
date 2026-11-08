import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

/** An authored skeletal performance on a real MPFB mesh, never a rigid puppet. */
export class StoryActor {
  private readonly mixer: T.AnimationMixer;
  private readonly head: T.Bone;
  private readonly wrist: T.Bone;
  private readonly hips: T.Bone;
  private readonly rightFoot: T.Bone;
  private readonly leftFoot: T.Bone;
  private readonly clip: T.AnimationClip;
  private active:T.AnimationAction;
  readonly skins: T.SkinnedMesh[] = [];
  readonly bones: T.Bone[] = [];
  private faceState?:Readonly<Record<string,number>>;
  constructor(readonly asset: GLTF, readonly role: string, minDuration=8) {
    asset.scene.traverse(o => {
      if (o instanceof T.SkinnedMesh) {
        this.skins.push(o);o.castShadow=o.receiveShadow=true;
        // Skinned bounds from the bind pose are invalid for an authored root path.
        o.frustumCulled=false;
      }
      if (o instanceof T.Bone) this.bones.push(o);
    });
    if (this.skins.length < 2 || this.bones.length < 53) throw Error('Incomplete native human for '+role);
    const bone=(name:string)=>{
      const b=this.bones.find(b=>b.name===name);if(!b)throw Error(role+' missing '+name);return b;
    };
    this.head=bone('head');this.wrist=bone('hand_l');this.hips=bone('pelvis');
    this.rightFoot=bone('foot_r');this.leftFoot=bone('foot_l');
    const clip=asset.animations[0];
    if(!clip||clip.duration<minDuration||!clip.tracks.some(t=>t.name.includes('head.quaternion'))) {
      throw Error('Missing actual native performance for '+role);
    }
    this.clip=clip;this.mixer=new T.AnimationMixer(asset.scene);
    this.active=this.mixer.clipAction(clip).setLoop(T.LoopOnce,1).play();
  }
  sample(seconds:number,clip=this.clip){
    if(this.active.getClip()!==clip){
      this.active.stop();
      this.active=this.mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1).play();
    }
    this.mixer.setTime(T.MathUtils.clamp(seconds,0,clip.duration-1e-5));
    this.asset.scene.updateMatrixWorld(true);
  }
  setFace(weights:Readonly<Record<string,number>>){
    let matched=0;
    for(const s of this.skins){
      const values=s.morphTargetInfluences,targets=s.morphTargetDictionary;
      if(!values||!targets)continue;
      for(const [name,value] of Object.entries(weights)){
        const index=targets[name];
        if(index!==undefined){values[index]=T.MathUtils.clamp(value,0,1);matched++;}
      }
    }
    if(matched)this.faceState=weights;
    return matched;
  }
  headPoint(out:T.Vector3){return this.head.getWorldPosition(out);}
  snapshot(){
    const world=(b:T.Bone)=>b.getWorldPosition(new T.Vector3()).toArray();
    return {role:this.role,skins:this.skins.length,bones:this.bones.length,
      fingerBones:this.bones.filter(b=>/^(index|middle|ring|pinky|thumb)_/.test(b.name)).length,
      pose:[...this.head.quaternion.toArray(),...this.wrist.quaternion.toArray()],
      feet:[world(this.leftFoot),world(this.rightFoot)],hips:world(this.hips),face:this.faceState,
      triangles:this.skins.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0),
    };
  }
  dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.asset.scene);}
}
