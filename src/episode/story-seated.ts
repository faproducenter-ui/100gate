import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {STORY_BEATS, STORY_SECONDS, type StoryBeat, type StoryIntroFlow} from './story-intro-flow';
import {disposeSet} from './story-home-preview';
import {storyAsset} from './release';

const awake=STORY_BEATS.indexOf('AWAKE_BOUND');
export function seatedSeconds(beat:StoryBeat, seconds:number){
  const end=STORY_BEATS.indexOf(beat);
  return Math.round((STORY_BEATS.slice(awake,end).reduce((sum,b)=>sum+STORY_SECONDS[b],0)+seconds)*1e9)/1e9;
}
export class BladeDraw {
  private last?:number;
  private draw=0;
  get distance(){return this.draw;}
  get verified(){return this.draw>=.10;}
  reset(){this.last=undefined;this.draw=0;}
  add(x:number,y:number,z:number){
    if(Math.abs(x-.010)>.006||Math.abs(z)>.006||y<.078||y>.166){
      this.last=undefined;return;
    }
    if(this.last!==undefined){
      const travel=Math.abs(y-this.last);
      if(travel<=.018)this.draw+=travel;
    }
    this.last=y;
  }
}

export class StorySeated {
  readonly root:T.Group;
  readonly chair:T.Object3D;
  readonly knife:T.Object3D;
  private readonly contact:T.Object3D;
  private readonly eye:T.PerspectiveCamera;
  private readonly mixer:T.AnimationMixer;
  private readonly body:T.SkinnedMesh[]=[];
  private readonly headMaterials=new Set<T.Material>();
  private readonly cut=new BladeDraw();
  private readonly temp=new T.Vector3();
  private readonly euler=new T.Euler(0,0,0,'YXZ');
  private readonly pose=new T.Quaternion();
  private seconds=0;

  static async load(){
    const sleeveStudy=import.meta.env.DEV&&new URLSearchParams(location.search).get('quality-sleeves')==='1';
    const asset=await new GLTFLoader().loadAsync(sleeveStudy?
      `${import.meta.env.BASE_URL}outputs/quality-overhaul/sleeves/story-upright-escape.glb?v=sleeves-2`:
      storyAsset('escape/story-upright-escape.glb'));
    try{return new StorySeated(asset.scene,asset.animations);}
    catch(e){disposeSet(asset.scene);throw e;}
  }
  private constructor(root:T.Group,animations:T.AnimationClip[]){
    this.root=root;root.name='100gate story · upright escape';
    root.position.set(0,3.6,2.8);root.rotation.y=Math.PI;
    const get=(name:string)=>{
      const o=root.getObjectByName('StoryEscape_'+name);if(!o)throw Error('Upright escape missing '+name);return o;
    };
    this.knife=get('Knife');this.chair=get('Chair');this.contact=get('RightCutContact');
    const eye=get('Eye');if(!(eye instanceof T.PerspectiveCamera))throw Error('Missing native escape eye');
    this.eye=eye;
    root.traverse(o=>{
      if(o instanceof T.Mesh){
        o.castShadow=o.receiveShadow=true;
        for(const m of Array.isArray(o.material)?o.material:[o.material]){
          if(m.name.startsWith('StoryEscape_FPHead_'))this.headMaterials.add(m);
        }
      }
      if(o instanceof T.SkinnedMesh){
        o.frustumCulled=false;if(o.skeleton.bones.some(b=>b.name==='pelvis'))this.body.push(o);
      }
    });
    const clip=animations[0];
    if(animations.length!==1||!clip||clip.duration<23.19||this.body.length<5)throw Error('Incomplete upright native escape');
    this.mixer=new T.AnimationMixer(root);this.mixer.clipAction(clip).setLoop(T.LoopOnce,1).play();
    this.sample(0);
  }
  private sample(seconds:number){
    this.seconds=seconds;this.mixer.setTime(Math.min(23.2,seconds));this.root.updateMatrixWorld(true);
  }
  begin(flow:StoryIntroFlow){this.cut.reset();this.setBodyVisible(true);const s=flow.checkpoint();this.sample(seatedSeconds(s.beat,s.seconds));}
  advance(flow:StoryIntroFlow,dt:number,hold:boolean){
    const initial=flow.checkpoint();
    if(initial.beat!=='RIGHT_CUT'){
      flow.advance(dt,{hold});
      const next=flow.checkpoint();
      if(next.beat!==initial.beat||next.seconds!==initial.seconds)this.sample(seatedSeconds(next.beat,next.seconds));
      return;
    }
    // Render FPS is not a contact sampler. Use evenly bounded substeps in the
    // authored time domain, including when one render arrives late.
    let left=dt;
    if(dt===0){flow.advance(0,{hold});return;}
    while(left>1e-8&&flow.checkpoint().beat!=='FREE'){
      const step=Math.min(left,1/60);left-=step;
      const before=flow.checkpoint();
      flow.advance(step,{hold,cutVerified:this.cut.verified});
      const after=flow.checkpoint();
      if(before.beat===after.beat&&before.seconds===after.seconds)break;
      this.sample(seatedSeconds(after.beat,after.seconds));
      if(after.beat==='RIGHT_CUT'&&after.seconds>=1.16&&after.seconds<=3.83){
        const p=this.knife.worldToLocal(this.contact.getWorldPosition(this.temp));
        this.cut.add(p.x,p.y,p.z);
      }
    }
  }
  follow(camera:T.PerspectiveCamera,motion:number){
    // One short rear insert lets the player actually see both chair hitches.
    // A first-person eye cannot show behind the shoulder without going through
    // the neck. This is a cut between shots, never a body-facing camera sweep.
    const rear=this.seconds>=3.6&&this.seconds<7.85;
    for(const m of this.headMaterials)m.colorWrite=m.depthWrite=rear;
    if(rear){
      camera.position.set(-.88,4.60,4.12);
      camera.lookAt(-.025,4.30,2.90);
    }else{
      this.eye.getWorldPosition(camera.position);this.eye.getWorldQuaternion(this.pose);
      this.euler.setFromQuaternion(this.pose,'YXZ');this.euler.z*=motion;
      camera.quaternion.setFromEuler(this.euler);
    }
    const fov=rear?52:72;
    if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
  }
  setBodyVisible(visible:boolean){for(const o of this.body)o.visible=visible;}
  snapshot(){return {seconds:this.seconds,cutDraw:this.cut.distance,cutVerified:this.cut.verified,
    eye:this.eye.getWorldPosition(new T.Vector3()).toArray(),
    knife:this.knife.getWorldPosition(new T.Vector3()).toArray(),chairRotation:this.chair.quaternion.toArray()};}
  dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.root);this.root.removeFromParent();disposeSet(this.root);}
}
