import * as T from 'three';
import { GLTFLoader,type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { StoryActor } from './story-actor';
import type { StoryBeat } from './story-intro-flow';
import { streetBlocking } from './story-street-motion';
import { disposeSet } from './story-home-preview';
import { storyAsset } from './release';

/** One compact authored set, original hero mesh, shared skinned actor geometry. */
export class StoryStreet {
  readonly scene=new T.Scene();
  private readonly camera=new T.PerspectiveCamera(52,1,.05,60);
  private readonly hero:StoryActor;
  private readonly unknowns:StoryActor[]=[];
  private readonly renderedUnknowns=new Set<number>();
  private readonly pivots:T.Object3D[];
  private readonly car:T.Object3D;
  private readonly carDoors:T.Object3D[];
  private readonly bagSocket=new T.Group();
  private readonly lights:T.SpotLight[]=[];
  private frame=streetBlocking('WALK_TO_SHOP',0);
  private readonly boneMatrix=new T.Matrix4();
  private beat:StoryBeat='WALK_TO_SHOP';
  private seconds=0;
  private constructor(private readonly assets:GLTF[]){
    const set=assets[0]!.scene,walk=assets[1]!;
    this.scene.background=new T.Color(0x070d17);this.scene.fog=new T.FogExp2(0x111926,.014);
    this.scene.add(set,new T.HemisphereLight(0x9cbce1,0x3b3228,.28));
    const get=(name:string)=>{const o=set.getObjectByName('StoryStreet_'+name);if(!o)throw Error('Missing street '+name);return o;};
    this.pivots=[get('ShopDoorHingeL'),get('ShopDoorHingeR')];
    this.car=get('Car');this.carDoors=[get('CarDoorHingeL'),get('CarDoorHingeR')];
    this.hero=new StoryActor(walk,'Alexei',.9);this.scene.add(walk.scene);
    for(let i=0;i<2;i++){
      const actor=new StoryActor({...walk,scene:clone(walk.scene) as T.Group},'Unknown '+(i+1),.9);
      actor.asset.scene.traverse(o=>{
        if(!(o instanceof T.Mesh))return;
        const variant=(m:T.Material)=>{
          const copy=m.clone();
          if(copy instanceof T.MeshStandardMaterial&&o.name.includes('sweater'))copy.color.set(i?0x292a2c:0x424543);
          return copy;
        };
        // A GLB primitive has one material and no geometry groups. Turning it
        // into a one-item material array silently makes Three draw zero groups.
        o.material=Array.isArray(o.material)?o.material.map(variant):variant(o.material);
      });
      this.unknowns.push(actor);this.scene.add(actor.asset.scene);
      for(const skin of actor.skins)skin.onAfterRender=()=>this.renderedUnknowns.add(i);
    }
    this.bagSocket.add(assets[2]!.scene);this.scene.add(this.bagSocket);
    set.traverse(o=>{if(o instanceof T.Mesh){
      o.receiveShadow=true;o.castShadow=!(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.transparent);
    }});
    const lamp=(x:number)=>{
      const light=new T.SpotLight(0xffdeb0,80,13,.91,.85,2);
      light.position.set(x,4.4,.24);light.target.position.set(x,.1,-1.4);
      light.castShadow=x===-1.5;light.shadow.mapSize.set(1024,1024);light.shadow.normalBias=.03;
      this.lights.push(light);this.scene.add(light,light.target);
    };
    [-9,-1.5,7.2].forEach(lamp);
    const fills:[number,number,number][]=[[2,-4.7,38],[2,-6,38],[-5,3,8]];
    for(const [x,z,power] of fills){
      const l=new T.PointLight(z<0?0xffe8be:0x9fb9ea,power,10,2);l.position.set(x,2.85,z);this.scene.add(l);
    }
    this.sample('WALK_TO_SHOP',0);
  }
  static async load(){
    const paths=['street/story-street.glb','hero/story-hero-walk.glb','grocery/story-grocery-bag.glb'];
    const results=await Promise.allSettled(paths.map(p=>new GLTFLoader().loadAsync(storyAsset(p))));
    if(results.some(r=>r.status==='rejected')){
      for(const r of results)if(r.status==='fulfilled')disposeSet(r.value.scene);
      throw Error('Street asset load failed, cannot show an empty fallback');
    }
    const assets=results.map(r=>{if(r.status!=='fulfilled')throw Error('Missing street asset');return r.value;});
    try{return new StoryStreet(assets);}catch(e){for(const a of assets)disposeSet(a.scene);throw e;}
  }
  sample(beat:StoryBeat,seconds:number){
    this.beat=beat;this.seconds=seconds;this.frame=streetBlocking(beat,seconds);
    const f=this.frame;
    this.hero.sample(f.hero.moving?f.hero.distance%1:0);
    this.hero.asset.scene.position.fromArray(f.hero.position);this.hero.asset.scene.rotation.y=f.hero.yaw;
    this.pivots[0]!.rotation.y=1.45*f.shopOpen;this.pivots[1]!.rotation.y=-1.45*f.shopOpen;
    this.car.position.x=f.carX;
    this.carDoors[0]!.rotation.y=-1.05*f.carOpen;this.carDoors[1]!.rotation.y=1.05*f.carOpen;
    for(let i=0;i<2;i++){
      const a=this.unknowns[i]!,p=f.unknowns[i]!;
      a.asset.scene.visible=p.visible;
      if(p.visible){a.sample(p.distance%1);a.asset.scene.position.fromArray(p.position);a.asset.scene.rotation.y=p.yaw;}
    }
    this.bagSocket.visible=f.groceries;
    this.scene.updateMatrixWorld(true);
    if(f.groceries){
      const hand=this.hero.bones.find(b=>b.name==='hand_r')!;
      hand.updateWorldMatrix(true,false);
      // Root pivot is the authored handle. Keep it at the same hand point; only
      // the carrier sways about the handle under gravity, never away from it.
      this.boneMatrix.copy(hand.matrixWorld);
      this.bagSocket.position.setFromMatrixPosition(this.boneMatrix);
      this.bagSocket.rotation.set(.035*Math.sin(f.hero.distance*6),0,.05*Math.sin(f.hero.distance*6+.8));
    }
  }
  snapshot(){return {beat:this.beat,seconds:this.seconds,hero:this.hero.snapshot(),shopOpen:this.frame.shopOpen,
    carX:this.frame.carX,carOpen:this.frame.carOpen,black:this.frame.black,groceries:this.frame.groceries,
    unknowns:this.unknowns.map((a,i)=>({visible:a.asset.scene.visible,rendered:this.renderedUnknowns.has(i),...a.snapshot()}))};}
  render(renderer:T.WebGLRenderer,aspect:number){
    const {position:p}=this.frame.hero;
    this.camera.aspect=aspect;this.camera.fov=48;this.camera.updateProjectionMatrix();
    if(['SHOP_ENTER','SHOP_EXIT','STORE_TRANSIT','RETURN_2316'].includes(this.beat)){
      this.camera.position.set(-1.0,1.8,-.15);this.camera.lookAt(2,1.20,-4.1);
    }else if(this.beat==='ABDUCTION'||this.beat==='BLACKOUT'){
      this.camera.position.set(-6.4,1.90,-.20);this.camera.lookAt(-2.3,1.1,-.65);
    }else{
      this.camera.position.set(p[0]-3.4,2.1,p[2]+5.4);this.camera.lookAt(p[0]+.4,1.25,p[2]-.6);
    }
    this.renderedUnknowns.clear();
    renderer.render(this.scene,this.camera);
  }
  dispose(){
    this.hero.dispose();for(const a of this.unknowns)a.dispose();
    for(const l of this.lights)l.shadow.dispose();
    disposeSet(this.scene);this.scene.clear();
  }
}
