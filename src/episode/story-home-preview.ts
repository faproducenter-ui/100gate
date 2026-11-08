import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STORY_BEATS, STORY_SECONDS, StoryIntroFlow } from './story-intro-flow';
import { StoryActor } from './story-actor';
import type { StoryStreet } from './story-street';
import {StoryAudio} from './story-audio';
import type {Foley} from './audio';
import {finalStoryAsset, storyAsset, STORY_PRODUCTION} from './release';
import {egressStudy,FINAL_ABDUCTION_SECONDS} from './story-final-options';
import {dialogueFace} from './story-face';

const apartmentCandidate = STORY_PRODUCTION||(import.meta.env.DEV && new URLSearchParams(location.search).get('quality-pass')==='1');
const faceCandidate=STORY_PRODUCTION||(import.meta.env.DEV&&new URLSearchParams(location.search).get('quality-face')==='1');
const faceReviewCamera=import.meta.env.DEV&&new URLSearchParams(location.search).get('quality-face-camera')==='1';
const faceUrl=(file:string)=>finalStoryAsset('dialogue/'+file);
const setUrl = apartmentCandidate
  ? finalStoryAsset('home/story-home.glb')
  : storyAsset('home/story-home.glb');
const ease = T.MathUtils.smoothstep;

export function disposeSet(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
  const textures = new Set<T.Texture>(), bitmaps = new Set<ImageBitmap>();
  const skeletons = new Set<T.Skeleton>();
  root.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    if(o instanceof T.SkinnedMesh)skeletons.add(o.skeleton);
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) {
    for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value);
    m.dispose();
  }
  for (const t of textures) {
    if (typeof ImageBitmap !== 'undefined' && t.image instanceof ImageBitmap) bitmaps.add(t.image);
    t.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
  for(const skeleton of skeletons)skeleton.dispose();
}

/** Native cast/scene performance. Runtime activation stays gated until escape passes. */
export class StoryHomePreview {
  private readonly scene = new T.Scene();
  private readonly camera = new T.PerspectiveCamera(61, 1, .045, 28);
  readonly flow = new StoryIntroFlow(egressStudy?FINAL_ABDUCTION_SECONDS:undefined);
  private readonly door: T.Object3D;
  private readonly opening: number;
  private readonly restRotation: number;
  private readonly dialogue: T.PerspectiveCamera;
  private readonly exitCamera: T.PerspectiveCamera;
  private readonly light: T.SpotLight;
  private readonly actors: StoryActor[] = [];
  private street?:StoryStreet;
  private audio?:StoryAudio;
  private homeFinished=false;
  startAudio(foley:Foley){this.audio?.dispose();this.audio=new StoryAudio(foley);void this.audio.load();}
  syncAudio(){
    const {beat,seconds}=this.flow.checkpoint();
    this.audio?.sample(beat,seconds,beat==='BLACKOUT'?1:beat==='ABDUCTION'?ease(seconds,5.1,6):0);
  }

  static async load() {
    const loader=new GLTFLoader();
    const results=await Promise.allSettled([setUrl,
      faceCandidate?faceUrl('story-hero-home-face.glb'):storyAsset('hero/story-hero-home.glb'),
      faceCandidate?faceUrl('story-partner-home-face.glb'):storyAsset('partner/story-partner-home.glb'),
    ].map(url=>loader.loadAsync(url)));
    if(results.some(r=>r.status==='rejected')){
      for(const r of results)if(r.status==='fulfilled')disposeSet(r.value.scene);
      throw new Error('Story cast failed to load; no empty-scene fallback. '+results.filter(r=>r.status==='rejected').map(r=>r.reason).join('; '));
    }
    const assets=results.map(r=>{if(r.status!=='fulfilled')throw Error('Unreachable asset state');return r.value;});
    try {
      const view=new StoryHomePreview(assets[0]!.scene);
      for(let i=1;i<assets.length;i++){
        const actor=new StoryActor(assets[i]!,i===1?'Alexei':'Partner');
        if(faceCandidate&&!actor.setFace(dialogueFace(i===1?'Alexei':'Partner',0)))throw Error('Missing native facial shapes '+actor.role);
        view.actors.push(actor);view.scene.add(assets[i]!.scene);
      }
      const {StoryStreet}=await import('./story-street');
      view.street=await StoryStreet.load();
      view.sample();
      return view;
    } catch (error) { for(const asset of assets)disposeSet(asset.scene); throw error; }
  }

  private constructor(private readonly set: T.Group) {
    const find = (name: string) => {
      const node = set.getObjectByName('StoryHome_' + name);
      if (!node) throw new Error('Story apartment missing ' + name);
      return node;
    };
    this.door = find('DoorHinge');
    if (find('DoorLeaf').parent !== this.door) throw new Error('Story apartment door is not parented to its hinge');
    const opening: unknown = this.door.userData.opensByRadiansLocalZ;
    if (typeof opening !== 'number' || !Number.isFinite(opening) || opening < 1.3 || opening > 1.57) {
      throw new Error('Story apartment has an invalid hinge opening');
    }
    this.opening = opening;
    this.restRotation = this.door.rotation.y;
    const dialogue = find('Dialogue');
    if (!(dialogue instanceof T.PerspectiveCamera)) throw new Error('Story apartment needs its authored dialogue camera');
    this.dialogue = dialogue;
    const exit=find('ExitView');
    if(!(exit instanceof T.PerspectiveCamera))throw new Error('Missing authored door shot');
    this.exitCamera=exit;
    find('Partner'); find('Entry');
    set.traverse(o => {
      if (o instanceof T.Mesh) {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        const remoteCity=apartmentCandidate&&materials.every(m=>m.name.startsWith('City | '));
        o.receiveShadow = !remoteCity;
        o.castShadow = !remoteCity && materials.every(m => !m.transparent);
      }
    });
    this.scene.background = new T.Color(0x151927);
    this.scene.add(set, new T.HemisphereLight(0xc9cddd, 0x664332, .43));
    this.light = new T.SpotLight(0xffba76, 15, 8, 1.08, .88, 2);
    this.light.position.set(-2.33, 1.45, -1.80);
    this.light.target.position.set(-.7, .25, -.75);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.normalBias = .017;
    this.scene.add(this.light, this.light.target);
    const point = (color: number, power: number, pos: [number, number, number]) => {
      const light = new T.PointLight(color, power, 6, 2);
      light.position.set(...pos);
      this.scene.add(light);
    };
    point(0xa4b9e8, 3, [-.08, 1.65, -2.03]);
    point(0xffbb74, 5, [-2.34, 1.49, -1.82]);
    point(0xffdfbb, 5, [.78, 2.55, .92]);
    point(0xdce6ff, 3, [3.7, 2.32, -1.16]);
  }

  restart() { this.homeFinished=false;this.flow.restore(undefined);this.sample(); }
  snapshot() {
    const { beat, seconds } = this.flow.snapshot();
    const t=beat==='DIALOGUE'?seconds:STORY_SECONDS.DIALOGUE+seconds;
    const subtitle=beat!=='DIALOGUE'?'': t<.7?'':t<3.5?'Алексей: Схожу в магазин. Скоро вернусь.':t<6.1?'Девушка: Хорошо. До скорого.':t<8.1?'Алексей: До скорого.':'';
    const street=STORY_BEATS.indexOf(beat)>=STORY_BEATS.indexOf('WALK_TO_SHOP');
    return { beat, seconds, ended: beat === 'AWAKE_BOUND', door: this.door.rotation.y - this.restRotation,
      subtitle,actors:this.actors.map(a=>a.snapshot()),street:street?this.street?.snapshot():undefined,
      clock:STORY_BEATS.indexOf(beat)>=STORY_BEATS.indexOf('RETURN_2316')?'23:16':'22:42',
      black:street?this.street?.snapshot().black??0:0 };
  }
  advance(dt: number) {
    const { beat, seconds } = this.flow.checkpoint();
    if(beat==='AWAKE_BOUND')return;
    const untilBound=STORY_BEATS.slice(STORY_BEATS.indexOf(beat),STORY_BEATS.indexOf('AWAKE_BOUND'))
      .reduce((sum,b)=>sum+this.flow.duration(b),0)-seconds;
    this.flow.advance(Math.min(dt,untilBound));
    this.sample();
  }
  private sample(){
    const {beat,seconds}=this.flow.snapshot();
    const onStreet=STORY_BEATS.indexOf(beat)>=STORY_BEATS.indexOf('WALK_TO_SHOP');
    const t=beat==='DIALOGUE'?seconds:beat==='HOME_EXIT'?STORY_SECONDS.DIALOGUE+seconds:19;
    if(!this.homeFinished){
      for(const [i,actor] of this.actors.entries()){
        actor.sample(t);
        if(faceCandidate)actor.setFace(dialogueFace(i===0?'Alexei':'Partner',t));
      }
      this.door.rotation.y=this.restRotation+this.opening*ease(t,14.3,16.35)*(1-ease(t,18.4,19));
      this.scene.updateMatrixWorld(true);
      this.homeFinished=onStreet;
    }
    if(onStreet)this.street?.sample(beat==='AWAKE_BOUND'?'BLACKOUT':beat,seconds);
  }
  render(renderer: T.WebGLRenderer, aspect: number) {
    const { beat,seconds } = this.flow.checkpoint();
    if(STORY_BEATS.indexOf(beat)>=STORY_BEATS.indexOf('WALK_TO_SHOP')){
      this.street?.render(renderer,aspect);return;
    }
    const dialogue = beat === 'DIALOGUE';
    this.camera.aspect = aspect;
    this.camera.fov = dialogue ? this.dialogue.fov : this.exitCamera.fov;
    this.camera.updateProjectionMatrix();
    if (dialogue) {
      if(faceReviewCamera){
        const isPartner=seconds>3.5&&seconds<6.2;
        const aim=this.actors[isPartner?1:0]!.headPoint(new T.Vector3());aim.y+=.050;
        this.camera.fov=38;
        this.camera.position.copy(aim).add(new T.Vector3(isPartner?-.73:.73,.026,.55));
        this.camera.lookAt(aim);
      }else if(seconds>3.5&&seconds<6.2){
        this.camera.fov=45;this.camera.position.set(-1.65,1.52,1.10);this.camera.lookAt(.45,1.32,-.56);
      }else if(seconds>6.2&&seconds<8.2){
        this.camera.fov=45;this.camera.position.set(1.53,1.54,1.23);this.camera.lookAt(-.88,1.38,-.49);
      }else{
        this.dialogue.getWorldPosition(this.camera.position);this.dialogue.getWorldQuaternion(this.camera.quaternion);
      }
    } else if(seconds<4.15) {
      const p=this.actors[0]!.snapshot().hips;
      this.camera.position.set(.04,1.51,2.05);this.camera.fov=57;
      this.camera.lookAt(p[0]!,1.18,p[2]!);
    }else{this.exitCamera.getWorldPosition(this.camera.position);this.exitCamera.getWorldQuaternion(this.camera.quaternion);}
    this.camera.updateProjectionMatrix();
    renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.light.shadow.dispose();
    this.audio?.dispose();
    this.street?.dispose();
    for(const actor of this.actors)actor.dispose();
    disposeSet(this.scene);
    this.scene.clear();
  }
}
