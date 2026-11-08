import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createHouse, doorTouches, type House, type Target } from './world';
import { Foley } from './audio';
import { DOCUMENTS, ROOMS, newSave, text, validSave, type Save, type Settings } from './data';
import { PACK, PORTIONS, remaining, type Consumable, type PackItem, type PropId } from './pack';
import { PlayerRig } from './player';
import { disposeComposer } from './lifetime';
import { HEAD_MARGIN } from './headroom';
import { EscapeRig, SLIP, PICKUP, CUT, RISE, GRIP_TIME, SAW_START, MIN_SAW_TRAVEL, ease } from './intro';
import { NativeIntro, INTRO_END } from './native-intro';
import type { StoryHomePreview } from './story-home-preview';
import type { StorySeated } from './story-seated';
import {SAVE_API as API, STORY_PRODUCTION, STORY_RELEASE} from './release';
import {canWriteGameSave,readSave,readSettings,writeLocal,SAVE_KEY,SETTINGS_KEY,TOKEN_KEY,type ProductionIntent} from './story-production-save';

export type Mode = 'loading' | 'title' | 'playing' | 'paused' | 'document' | 'bag' | 'ending' | 'error';
export interface View { mode: Mode; loading: number; room: number; objective: string; prompt: string; progress: number; message: string; document?: string; save: Save; settings: Settings; cloud: string; held?:PropId; error?: string; storyHome?: 'dialogue' | 'exit' | 'street' | 'seated' | 'end'; storySubtitle?:string; storyClock?:string; storyBlack?:number; storyWait?:boolean; storyCanSkip?:boolean; }
function roomReflections(renderer:T.WebGLRenderer){
  if(!renderer.extensions.has('EXT_color_buffer_float'))return;
  const width=128,height=64,data=new Float32Array(width*height*4);
  // A small linear HDR probe: soft blue window light and a broad warm interior bounce.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/width,v=y/height;
    const window=Math.exp(-(((u-.29)/.073)**2+((v-.47)/.126)**2))*2.8;
    const bounce=Math.exp(-(((u-.79)/.16)**2+((v-.43)/.19)**2))*.42;
    const i=(y*width+x)*4;
    data[i]=.042+window*.72+bounce;data[i+1]=.050+window*.87+bounce*.76;data[i+2]=.054+window+bounce*.52;data[i+3]=1;
  }
  const source=new T.DataTexture(data,width,height,T.RGBAFormat,T.FloatType);
  source.mapping=T.EquirectangularReflectionMapping;source.needsUpdate=true;
  const gen=new T.PMREMGenerator(renderer),target=gen.fromEquirectangular(source);
  source.dispose();gen.dispose();return target;
}
export class Episode {
  private readonly storyFullRequested:boolean;
  private readonly storyHomeRequested:boolean;
  private scene=new T.Scene(); private camera=new T.PerspectiveCamera(72,1,.055,100);
  private renderer:T.WebGLRenderer;private composer:EffectComposer;private bloom:UnrealBloomPass;private reflections?:T.WebGLRenderTarget;
  private house?:House;private audio:Foley;private keys=new Set<string>();private listeners:(()=>void)[]=[];
  private frame=0;private disposed=false;private last=0;private elapsed=0;private lastUI=0;private atmosphereTime=0;private redraw=true;
  private velocity=new T.Vector3();private position=new T.Vector3();private yaw=0;private pitch=-.23;private grounded=true;
  private target?:Target;private hold=0;private holdId='';private holdElapsed=0;private ray=new T.Raycaster();private flashlight:T.SpotLight;
  private chairBeat=-1;private stepSide=false;
  private escape?:EscapeRig;private escapeSlip=-1;private escapePickup=-1;private escapeCut=0;private escapeRise=-1;private escapeContacts:number[]=[];
  private nativeIntro?:NativeIntro;private nativeChairBox=new T.Box3();private nativeFragmentBox=new T.Box3();
  private escapeRisePitch=-.85;private escapeRiseYaw=0;
  private sawTravel=0;private sawContactTime=0;private sawLast=new T.Vector3();private sawDelta=new T.Vector3();
  private escapeAnchor=new T.Vector3();
  private player:PlayerRig;private flashOn=false;private held?:PropId;private itemUntil=0;private useUntil=0;private reachUntil=0;private carryAfter?:{id?:PropId;flash:boolean};
  private movement=new T.Vector2();private motionDebt=0;private actorHeight=1.68;
  private manualClock=false;private frameTimes:number[]=[];private expectedPointerUnlock=false;private pointerWasOwned=false;
  private holdRay=new T.Raycaster();private holdPoint=new T.Vector3();private holdDirection=new T.Vector3();private holdBounds=new T.Box3();
  private settings:Settings;private save:Save;private mode:Mode='loading';private loading=0;private document?:string;
  private message='';private messageUntil=0;private cloud='local';private cloudTimer:ReturnType<typeof setTimeout>|undefined;
  private savedPosition=new T.Vector3();private saveClock=0;private prePause:'playing'|'document'='playing';
  private mobile=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
  private touchAxes={x:0,z:0};
  private storyHome?: StoryHomePreview;
  private storyEscape?: StorySeated;
  private storyEscaping=false;
  private storyFree=false;
  private storySkipPending=false;
  constructor(private canvas:HTMLCanvasElement,private emit:(s:View)=>void,private readonly intent?:ProductionIntent){
    this.storyFullRequested=(STORY_PRODUCTION&&intent==='new')||STORY_RELEASE||(import.meta.env.DEV&&new URLSearchParams(location.search).get('story-intro')==='1');
    this.storyHomeRequested=this.storyFullRequested||(import.meta.env.DEV&&new URLSearchParams(location.search).get('story-home')==='1');
    this.audio=new Foley(!this.storyHomeRequested);
    this.save=(intent==='new'?undefined:readSave())??newSave();this.recoverPack();
    this.settings=readSettings();
    this.position.fromArray(this.save.position);this.yaw=this.save.yaw;this.pitch=this.save.pitch;
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.22;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.setClearColor(0x080e12);
    this.scene.fog=new T.FogExp2(0x182124,.018);this.camera.rotation.order='YXZ';this.scene.add(this.camera);
    this.scene.add(new T.HemisphereLight(0xa0b8c5,0x4a3626,.85));
    this.flashlight=new T.SpotLight(0xffe4bd,0,20,.43,.6,1.5);this.flashlight.position.set(.17,-.13,-.1);
    const aim=new T.Object3D();aim.position.set(0,0,-10);this.camera.add(this.flashlight,aim);this.flashlight.target=aim;
    this.flashlight.castShadow=true;this.flashlight.shadow.mapSize.set(1024,1024);this.flashlight.shadow.bias=-.0002;this.flashlight.shadow.normalBias=.025;
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom=new UnrealBloomPass(new T.Vector2(1280,720),.16,.5,.9);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
    this.player=new PlayerRig(this.scene,this.camera);this.applyQuality();this.resize();this.bind();this.notify();
    // Constructed from the actual Play/Continue click; acquire audio unlock
    // here rather than after asynchronous GLBs arrive.
    this.updateMix();
    if(intent){this.audio.start();this.audio.pause(true);}
    this.frame=requestAnimationFrame(this.tick);
    if((import.meta.env.DEV||STORY_RELEASE||STORY_PRODUCTION)&&this.storyHomeRequested)void this.initStoryHome();else void this.init();
  }
  private async initStoryHome(){
    if(!import.meta.env.DEV&&!STORY_RELEASE&&!STORY_PRODUCTION)return;
    try {
      const {StoryHomePreview}=await import('./story-home-preview');
      if(this.disposed)return;
      const preview=await StoryHomePreview.load((loaded,total)=>{
        if(!this.disposed){this.loading=loaded/total;this.notify();}
      });
      if(this.disposed){preview.dispose();return;}
      this.storyHome=preview;
      if(import.meta.env.DEV){
      const w=window as unknown as Record<string,unknown>;
      const snapshot=()=>({...preview.snapshot(),flow:preview.flow.snapshot(),escape:this.storyEscaping?this.storyEscape?.snapshot():undefined,
        free:this.storyFree,position:this.position.toArray(),items:[...this.save.items],mode:this.mode});
      w.__storyHomeTest=snapshot;
      w.render_game_to_text=()=>JSON.stringify(snapshot());
      w.advanceTime=(ms:number)=>{
        if(!Number.isFinite(ms)||ms<0||ms>10000)throw Error('advanceTime expects 0..10000ms');
        this.manualClock=true;
        if(this.storyFree){
          for(let dt=ms/1000;dt>1e-8;dt-=1/60)if(this.mode==='playing'){this.elapsed+=Math.min(dt,1/60);this.update(Math.min(dt,1/60));}
          this.renderer.render(this.scene,this.camera);
        }else this.stepStory(ms/1000,true);
        this.notify();
      };
      }
      this.mode='title';this.loading=1;this.notify();
      if(this.intent==='new')this.start();
    } catch(e) {
      if(!this.disposed){this.mode='error';this.message=String(e);this.notify();}
    }
  }
  private async prepareStoryEscape(){
    if((!import.meta.env.DEV&&!STORY_RELEASE&&!STORY_PRODUCTION)||!this.storyFullRequested||!this.storyHome)return;
    try{
      this.loading=0;
      const {StorySeated}=await import('./story-seated');
      if(this.disposed)return;
      const escape=await StorySeated.load();
      if(this.disposed){escape.dispose();return;}
      this.storyEscape=escape;
      this.house=await createHouse(this.scene,this.save,n=>{if(!this.disposed)this.loading=n;},{legacyIntro:false});
      if(this.disposed){this.releaseScene();return;}
      this.scene.add(escape.root);
      this.applyReflections();this.player.loadBody(this.house.model);this.player.setVisible(false);
      this.house.boundChair.visible=false;
      this.house.seatBounds.setFromObject(escape.chair,true);
      this.player.registerModel('flashlight',this.house.model('gear-flashlight'));
      this.player.registerModel('key',this.house.model('gear-brass-key'));
      const knifeTarget=this.house.targets.find(t=>t.id==='knife');
      if(knifeTarget){
        knifeTarget.root.visible=false;knifeTarget.root=escape.knife;
        knifeTarget.root.traverse(o=>{o.userData.target='knife';});
        knifeTarget.focus=knifeTarget.root.getObjectByName('Oval_walnut_scales');
      }
      const bag=this.house.targets.find(t=>t.id==='bag')?.root.clone(true) as T.Group|undefined;
      if(bag){bag.position.set(0,-.078,0);bag.rotation.set(.05,0,0);bag.scale.setScalar(.60);this.player.registerModel('bag',bag);}
      escape.follow(this.camera,this.settings.cameraMotion);
      await this.renderer.compileAsync(this.scene,this.camera);
      if(this.disposed)return;
      this.storyEscapeReady=true;this.notify();
    }catch(e){if(!this.disposed){this.mode='error';this.message=String(e);this.notify();}}
  }
  private storyEscapeReady=false;
  private storyEscapeStarted=false;
  skipStory(){
    if(!this.storyFullRequested||this.mode!=='playing'||!this.storyHome||this.storyFree)return;
    const f=this.storyHome.flow;
    if(f.snapshot().control!=='cinematic')return;
    f.skip(this.keys.has('KeyR'));
    if(f.checkpoint().beat!=='REACH')return;
    this.storySkipPending=true;this.redraw=true;this.notify();
  }
  private stepStory(dt:number,forceDraw=false){
    const preview=this.storyHome;if(!preview)return;
    const active=this.mode==='playing'&&(!this.manualClock||forceDraw);
    const escape=this.storyEscape,flow=preview.flow;
    if(active&&this.storyEscapeReady&&escape&&(this.storySkipPending||flow.checkpoint().beat==='AWAKE_BOUND')){
      if(!this.storyEscaping||this.storySkipPending){
        escape.begin(flow);this.storyEscaping=true;this.storySkipPending=false;
      }
    }
    if(this.storyEscaping&&escape){
      if(active){
        const prior=flow.checkpoint().beat;
        escape.advance(flow,dt,this.keys.has('KeyR'));
        preview.syncAudio();
        escape.follow(this.camera,this.settings.cameraMotion);
        const beat=flow.checkpoint().beat;
        if(prior!==beat){
          if(beat==='RIGHT_CUT')this.audio.play('keyPickup');
          if(beat==='SET_KNIFE_DOWN')this.audio.ropeContact(.15,true);
          if(beat==='STAND')this.audio.play('land');
        }
        if(beat==='FREE'){
          const pose=new T.Euler().setFromQuaternion(this.camera.quaternion,'YXZ');
          this.position.set(this.camera.position.x,3.6,this.camera.position.z);
          this.pitch=pose.x;this.yaw=pose.y;this.grounded=true;
          this.keys.clear();this.movement.set(0,0);this.velocity.set(0,0,0);this.motionDebt=0;
          this.addFlag('free');this.addFlag('introCompleteV3');
          escape.setBodyVisible(false);this.storyFree=true;
          this.player.setVisible(true);if(STORY_PRODUCTION)this.persist();
          this.toast(this.t('Руки свободны. Найди фонарь и ключ от люка.','Your hands are free. Find the flashlight and hatch key.'));
        }
      }
      if(active||forceDraw||this.redraw){this.renderer.render(this.scene,this.camera);this.redraw=false;}
      return;
    }
    if(active&&!this.storySkipPending){preview.advance(dt);preview.syncAudio();}
    if(active||forceDraw||this.redraw){preview.render(this.renderer,this.camera.aspect);this.redraw=false;}
  }
  private async init(){try{
    this.house=await createHouse(this.scene,this.save,n=>{if(!this.disposed){this.loading=n;this.notify();}});
    if(this.disposed){this.releaseScene();return;}
    if(!this.house.intro||!this.house.nativeIntro)throw Error('Missing legacy introduction assets');
    this.applyReflections();
    this.player.loadBody(this.house.model);
    this.escape=new EscapeRig(this.scene,this.house.intro,this.house.model);
    this.player.registerModel('knife',this.escape.knifeForInventory());
    this.escape.setVisible(false);
    this.nativeIntro=new NativeIntro(this.scene,this.house.nativeIntro);
    this.house.boundChair.visible=false;
    const knifeTarget=this.house.targets.find(t=>t.id==='knife');
    if(knifeTarget){
      knifeTarget.root.visible=false;knifeTarget.root=this.nativeIntro.knife;
      knifeTarget.root.traverse(o=>{o.userData.target='knife';});
      knifeTarget.focus=knifeTarget.root.getObjectByName('Oval_walnut_scales');
      knifeTarget.root.visible=!this.flag('free')||!this.has('knife');
    }
    const fragment=this.nativeFragmentBox;
    this.house.colliders.push({get minX(){return fragment.min.x;},get maxX(){return fragment.max.x;},get minZ(){return fragment.min.z;},get maxZ(){return fragment.max.z;},get bottom(){return fragment.min.y;},get top(){return fragment.max.y;}});
    this.restoreEscape();
    this.player.registerModel('flashlight',this.house.model('gear-flashlight'));
    this.player.registerModel('key',this.house.model('gear-brass-key'));
    const satchel=this.house.targets.find(t=>t.id==='bag')?.root.clone(true) as T.Group|undefined;
    if(satchel){satchel.position.set(0,-.078,0);satchel.rotation.set(.05,0,0);satchel.scale.setScalar(.60);this.player.registerModel('bag',satchel);}
    await this.warmNativeIntro();if(this.disposed)return;
    this.mode='title';this.loading=1;this.notify();
    // Probe is exposed only in local development and explicit automated verification builds.
    if(import.meta.env.DEV||import.meta.env.VITE_VERIFY==='1'){
      (window as unknown as Record<string,unknown>).__episodeTest={
        state:()=>({mode:this.mode,save:structuredClone(this.save),position:this.position.toArray(),yaw:this.yaw,pitch:this.pitch,grounded:this.grounded,actorHeight:this.actorHeight,target:this.target?.id,hold:this.hold,settings:{...this.settings},rig:this.player.state(),lamp:this.flashlight.intensity>0,weather:this.house?.weather.snapshot()}),
        foley:()=>this.audio.state(),
        interactionRay:()=>{this.camera.updateWorldMatrix(true,false);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(),this.camera);ray.far=2.7;return this.interactionHits(ray).slice(0,6).map(h=>({name:h.object.name,target:h.object.userData.target,point:h.point.toArray(),distance:h.distance}));},
        pose:(x:number,y:number,z:number,yaw=0,pitch=0)=>{this.position.set(x,y,z);this.yaw=yaw;this.pitch=pitch;this.velocity.set(0,0,0);this.movement.set(0,0);this.motionDebt=0;this.grounded=true;},
        diagnostics:()=>({render:{...this.renderer.info.render},memory:{...this.renderer.info.memory},frameTimes:[...this.frameTimes],motionDebt:this.motionDebt,manualClock:this.manualClock,elapsed:this.elapsed,verticalVelocity:this.velocity.y,keys:[...this.keys],nativeSolids:this.nativeIntro?{chair:{min:this.nativeChairBox.min.toArray(),max:this.nativeChairBox.max.toArray()},fragment:{min:this.nativeFragmentBox.min.toArray(),max:this.nativeFragmentBox.max.toArray()}}:undefined,
          overlappingDoors:this.position.y>=2.4?[]:this.house?.targets.filter(t=>t.doorShape&&doorTouches(t.doorShape,t.angle??0,this.position.x,this.position.z,.22)).map(t=>t.id)}),
        aim:(id:string)=>{const t=this.house?.targets.find(t=>t.id===id);if(t){t.root.updateWorldMatrix(true,true);const point=t.focus?t.focus.getWorldPosition(new T.Vector3()):new T.Box3().setFromObject(t.root).getCenter(new T.Vector3());this.camera.position.copy(this.position).add(new T.Vector3(0,1.68,0));const d=point.sub(this.camera.position);this.yaw=Math.atan2(-d.x,-d.z);this.pitch=Math.atan2(d.y,Math.hypot(d.x,d.z));}},
        targets:()=>this.house?.targets.map(t=>({id:t.id,kind:t.kind,pos:t.root.getWorldPosition(new T.Vector3()).toArray(),open:t.open,unlocked:t.unlocked})),
        hatchView:()=>{
          const t=this.house?.hatch,leaf=t?.pivot?.children.find(o=>o instanceof T.Mesh) as T.Mesh|undefined;
          if(!leaf)return;leaf.updateWorldMatrix(true,false);leaf.geometry.computeBoundingBox();
          return {angle:t?.angle,open:t?.open,matrix:leaf.matrixWorld.toArray(),min:leaf.geometry.boundingBox!.min.toArray(),max:leaf.geometry.boundingBox!.max.toArray()};
        },
        introView:()=>{
          if(this.nativeIntro)return {...this.nativeIntro.state(),eye:this.camera.position.toArray(),escape:this.nativeIntro.state()};
          const chair=this.scene.getObjectByName('bound-chair'),ray=new T.Raycaster();
          this.camera.updateWorldMatrix(true,false);chair?.updateWorldMatrix(true,true);ray.far=.82;
          let chairHits=0;
          if(chair)for(const x of [-.7,-.35,0,.35,.7])for(const y of [-.65,-.3,0,.3,.65]){
            ray.setFromCamera(new T.Vector2(x,y),this.camera);
            if(ray.intersectObject(chair,true).length)chairHits++;
          }
          return {chairHits,eye:this.camera.position.toArray(),escape:this.escape?.state(),slip:this.escapeSlip,pickup:this.escapePickup,cut:this.escapeCut,rise:this.escapeRise,contacts:[...this.escapeContacts],sawTravel:this.sawTravel,sawContactTime:this.sawContactTime};
        },
        renderBoundDetail:()=>{
          const inspection=this.camera.clone();inspection.position.set(.53,4.41,3.24);inspection.lookAt(0,4.28,2.91);
          this.renderer.render(this.scene,inspection);return this.canvas.toDataURL('image/png');
        },
        layoutCheck:()=>{
          this.scene.updateMatrixWorld(true);
          const keys=this.house?.targets.filter(t=>typeof t.root.userData.supportY==='number').map(t=>({
            id:t.id,gap:new T.Box3().setFromObject(t.root.children[0],true).min.y-Number(t.root.userData.supportY),
          }));
          const walls=this.scene.children.filter(o=>o instanceof T.Mesh&&o.visible&&!o.userData.noInteraction);
          const hit=(x:number,y:number,z:number,dx:number,dy:number,dz:number)=>
            new T.Raycaster(new T.Vector3(x,y,z),new T.Vector3(dx,dy,dz),0,1.45).intersectObjects(walls,false).length>0;
          return {keys,ceiling:hit(3,2,-6.8,0,1,0),west:hit(-6.45,1.4,-6.7,0,0,1),east:hit(6.45,1.4,-6.7,0,0,1)};
        },
      };
      const testWindow=window as unknown as Record<string,unknown>;
      testWindow.render_game_to_text=()=>JSON.stringify({
        coordinates:'metres; Y up; yaw=0 faces -Z',mode:this.mode,position:this.position.toArray(),grounded:this.grounded,
        objective:this.objective(),target:this.target?.id,hold:this.hold,flags:this.save.flags,items:this.save.items,
        intro:this.nativeIntro?.state(),
      });
      testWindow.advanceTime=(ms:number)=>{
        if(!Number.isFinite(ms)||ms<0||ms>10000)throw Error('advanceTime expects 0..10000 ms');
        this.manualClock=true;
        let left=ms/1000;
        while(left>1e-8){const dt=Math.min(left,1/60);if(this.mode==='playing'){this.elapsed+=dt;this.update(dt);}left-=dt;}
        if(this.settings.quality==='high')this.composer.render();else this.renderer.render(this.scene,this.camera);
        this.notify();
      };
    }
    if(this.intent==='continue')this.start();
  }catch(e){if(!this.disposed){this.mode='error';this.message=String(e);this.notify();}}}
  private t(ru:string,en:string){return text(this.settings.language,ru,en);}
  /** Compile/upload the new native skin and cinematic views under the existing
   * loading overlay, not as a multi-second freeze after the player presses R.
   * This samples ONLY the render adapter; no game clock, flags or save advance. */
  private async warmNativeIntro(){
    const intro=this.nativeIntro!;intro.root.visible=true;intro.bodyVisible(true);this.player.setVisible(true);
    await this.renderer.compileAsync(this.scene,this.camera);
    if(this.disposed)return;
    this.player.setVisible(false);
    for(const t of [0,22,29,INTRO_END-1e-5]){
      if(this.disposed)return;
      intro.mixer.setTime(t);intro.root.updateMatrixWorld(true);intro.follow(this.camera,this.settings.cameraMotion);
      this.renderer.render(this.scene,this.camera);
      await new Promise<void>(ok=>requestAnimationFrame(()=>ok()));
    }
    if(this.disposed)return;
    intro.sample();intro.bodyVisible(!this.flag('free'));intro.follow(this.camera,this.settings.cameraMotion);this.refreshNativeColliders();
  }
  private has(id:string){return this.save.items.includes(id);}
  private restoreEscape(){
    if(this.nativeIntro){
      const checkpoint=this.save.intro;
      const time=this.flag('free')?INTRO_END:checkpoint?.version===2&&Number.isFinite(checkpoint.time)?checkpoint.time:this.flag('chairTipped')?(this.has('knife')?22:16.5):0;
      this.nativeIntro.flow.restore(time,checkpoint?.leftDraw??(this.flag('intro:leftCut')?.2:0),checkpoint?.rightDraw??(this.flag('intro:rightCut')?.2:0));this.nativeIntro.sample();this.nativeIntro.bodyVisible(!this.flag('free'));this.refreshNativeColliders();
    }
    this.escapeSlip=this.flag('chairTipped')?SLIP:-1;
    this.escapePickup=-1;this.escapeCut=0;this.escapeRise=-1;this.escapeContacts=[];
    this.sawTravel=this.sawContactTime=0;
  }
  private flag(id:string){return this.save.flags.includes(id);}
  private addFlag(id:string){if(!this.flag(id))this.save.flags.push(id);}
  private recoverPack(){if(this.save.room>0&&this.flag('free')&&!this.has('bag'))this.save.items.push('bag');}
  private equip(id?:PropId,seconds=0){this.held=id;this.itemUntil=seconds?this.elapsed+seconds:0;this.useUntil=0;this.carryAfter=undefined;if(id!=='flashlight')this.flashOn=false;}
  private showItem(id:PropId,seconds=1.48){
    const before=this.carryAfter??{id:this.itemUntil?undefined:this.held,flash:this.flashOn};
    this.equip(id,seconds);this.carryAfter=before;
  }
  private toggleLight(){if(!this.has('flashlight'))return;if(this.held!=='flashlight'){this.equip('flashlight');this.flashOn=true;}else this.flashOn=!this.flashOn;this.audio.play('click');this.notify();}
  toggleBag(){
    if(this.mode==='bag'){this.mode='playing';this.keys.clear();this.requestLock();this.notify();return;}
    if(this.mode!=='playing')return;
    if(!this.flag('free')){this.toast(this.t('Сначала освободи руки.','Free your hands first.'));return;}
    if(!this.has('bag')){this.toast(this.t('Твоя сумка лежит на полу чердака рядом со стулом.','Your bag is on the attic floor beside the chair.'));return;}
    this.mode='bag';this.keys.clear();this.touchAxes={x:0,z:0};this.movement.set(0,0);this.hold=0;this.holdId='';
    this.releaseLock();
    this.audio.play('scrape');this.notify();
  }
  packEquip(id?:PackItem|'flashlight'|'knife'){
    if(this.mode!=='bag'||!this.has('bag'))return;
    if((id==='flashlight'||id==='knife')&&!this.has(id))return;
    if((id==='candy'||id==='water')&&!remaining(this.save.flags,id))return;
    this.equip(id);if(id==='flashlight')this.flashOn=true;
    this.toggleBag();
  }
  consume(id:Consumable){
    if(this.mode!=='bag'||!this.has('bag'))return;
    const left=remaining(this.save.flags,id);if(!left)return;
    this.addFlag(`pack:${id}:${PORTIONS[id]-left+1}`);
    this.equip(id,id==='candy'?1.05:1.35);this.useUntil=this.elapsed+.93;
    this.audio.consume(id);
    this.toggleBag();this.persist();
    this.toast(id==='candy'?this.t('Ты съел карамельку.','You ate a caramel.'):this.t('Ты сделал глоток воды.','You took a sip of water.'));
  }
  private bind(){
    const on=(target:EventTarget,event:string,handler:EventListener)=>{target.addEventListener(event,handler);this.listeners.push(()=>target.removeEventListener(event,handler));};
    on(window,'resize',()=>this.resize());
    on(window,'keydown',((e:KeyboardEvent)=>{
      if((e.target as HTMLElement)?.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;
      if(this.storyHomeRequested&&!this.storyFree){
        if(e.code==='KeyR'&&this.mode==='playing'){e.preventDefault();if(!e.repeat)this.keys.add(e.code);return;}
        if(!e.repeat&&e.code==='Escape'){
          if(this.mode==='playing')this.pause();else if(this.mode==='paused')this.resume();
        }
        return;
      }
      if(['Space','Tab','ControlLeft','ShiftLeft','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();
      if(e.repeat)return;this.keys.add(e.code);
      if(e.code==='Escape'){if(this.mode==='bag'){this.toggleBag();}else if(this.mode==='document'||this.mode==='playing'){this.pause();}else if(this.mode==='paused'){this.resume();}return;}
      if(e.code==='KeyH'){this.toggleBag();return;}
      if(this.mode==='document'){if(e.code==='KeyF')this.closeDocument();return;}
      if(this.mode!=='playing')return;
      if(e.code==='KeyT')this.toggleLight();
      if(e.code==='Space'&&this.flag('free')&&this.grounded&&!this.keys.has('ShiftLeft')){this.velocity.y=4.6;this.grounded=false;}
      if(e.code==='KeyE'||e.code==='KeyG'||e.code==='KeyF')this.act(e.code);
    }) as EventListener);
    on(window,'keyup',((e:KeyboardEvent)=>{if(e.code==='KeyR')this.releaseHold();else this.keys.delete(e.code);}) as EventListener);
    on(window,'mousemove',((e:MouseEvent)=>{if(document.pointerLockElement!==this.canvas||this.mode!=='playing')return;this.yaw-=e.movementX*.0019*this.settings.sensitivity;this.pitch=T.MathUtils.clamp(this.pitch-e.movementY*.0019*this.settings.sensitivity*(this.settings.invertY?-1:1),-1.42,1.42);}) as EventListener);
    on(document,'pointerlockchange',()=>{
      const owned=document.pointerLockElement===this.canvas,lost=this.pointerWasOwned&&!owned;
      this.pointerWasOwned=owned;
      if(owned){
        this.expectedPointerUnlock=false;
        // A request can complete after the user has already opened a menu.
        if(this.mode!=='playing')this.releaseLock();
      }else{
        const expected=this.expectedPointerUnlock;this.expectedPointerUnlock=false;
        // exitPointerLock is asynchronous; a menu's old exit must not undo a newer resume.
        // Several queued notifications may all observe the same unlocked DOM state.
        // Only a real owned -> unowned edge is a loss, not each notification.
        if(lost&&!expected&&this.mode==='playing')this.pause(false);
      }
    });
    on(window,'blur',()=>{this.keys.clear();if(this.mode==='playing')this.pause();});
    on(document,'visibilitychange',()=>{if(document.hidden&&this.mode==='playing')this.pause();});
    on(this.canvas,'click',()=>{if((!this.storyHomeRequested||this.storyFree)&&this.mode==='playing')this.requestLock();});
    on(window,'pagehide',()=>this.persist(false));
  }
  private releaseLock(){if(document.pointerLockElement===this.canvas){this.expectedPointerUnlock=true;document.exitPointerLock();}}
  private requestLock(){if(this.mobile)return;try{const r=this.canvas.requestPointerLock();if(r&&'catch' in r)void r.catch(()=>{this.toast(this.t('Нажми на экран, чтобы управлять взглядом','Click the scene to control the view'));});}catch{/* browser requires an additional user gesture */}}
  touchMove(x:number,z:number){this.touchAxes={x,z};}
  touchLook(x:number,y:number){if(this.mode!=='playing')return;this.yaw-=x*.004*this.settings.sensitivity;this.pitch=T.MathUtils.clamp(this.pitch-y*.004*this.settings.sensitivity*(this.settings.invertY?-1:1),-1.42,1.42);}
  private releaseHold(){
    this.keys.delete('KeyR');this.hold=0;this.holdId='';
    // A real release can occur between two animation frames. A fresh
    // press after it must work even if the renderer never sampled key-up.
    if(this.storyHomeRequested&&!this.storyFree)this.storyHome?.flow.advance(0,{hold:false});
  }
  touchButton(code:string,down:boolean){
    if(!down){if(code==='KeyR')this.releaseHold();else this.keys.delete(code);return;}
    if(this.storyHomeRequested&&!this.storyFree){if(this.mode==='playing'&&code==='KeyR')this.keys.add(code);return;}
    if(this.mode==='document'&&code==='KeyF'){this.closeDocument();return;}
    if(code==='KeyH'){this.toggleBag();return;}
    if(this.mode!=='playing')return;
    if(code==='ShiftLeft'){if(this.keys.has(code))this.keys.delete(code);else this.keys.add(code);return;}
    this.keys.add(code);
    if(code==='Space'&&this.flag('free')&&this.grounded&&!this.keys.has('ShiftLeft')){this.velocity.y=4.6;this.grounded=false;}
    if(code==='KeyT')this.toggleLight();
    if(['KeyE','KeyF','KeyG'].includes(code))this.act(code);
  }
  start(fresh=false){
    if(this.storyHomeRequested){
      if(this.mode!=='title'||!this.storyHome)return;
      this.storyHome.restart();this.storyEscaping=this.storyFree=this.storySkipPending=false;
      this.save=newSave();this.position.fromArray(this.save.position);this.yaw=0;this.pitch=-.23;
      this.keys.clear();this.equip();this.player.setVisible(false);
      if(this.house)for(const t of this.house.targets){
        if(t.kind==='item')t.root.visible=true;
        if(t.kind==='door'){t.open=false;t.unlocked=!t.key;t.angle=0;t.pivot?.rotation.set(0,0,0);}
        if(t.kind==='furniture'&&t.home){t.root.position.copy(t.home);t.progress=0;}
      }
      if(this.storyFullRequested){
        if(!this.storyEscapeStarted){this.storyEscapeStarted=true;void this.prepareStoryEscape();}
        this.updateMix();this.audio.start();
        this.storyHome.startAudio(this.audio);
      }
      this.mode='playing';this.redraw=true;this.notify();return;
    }
    if(!this.house||this.mode==='error')return;
    if(fresh){this.save=newSave();this.position.fromArray(this.save.position);this.yaw=0;this.pitch=-.23;this.velocity.set(0,0,0);this.movement.set(0,0);this.grounded=true;this.equip();
      this.restoreEscape();
      for(const t of this.house.targets){if(t.kind==='item')t.root.visible=true;if(t.kind==='door'){t.open=false;t.unlocked=!t.key;t.angle=0;t.pivot?.rotation.set(0,0,0);}if(t.kind==='furniture'&&t.home){t.root.position.copy(t.home);t.progress=0;}}
      this.scene.traverse(o=>{if(o.name==='rope')o.visible=true;});
    }
    if(this.flag('free')){this.camera.position.copy(this.position).add(new T.Vector3(0,1.68,0));if(!this.held&&this.has('flashlight'))this.equip('flashlight');}
    this.mode='playing';this.document=undefined;this.updateMix();this.audio.start();this.requestLock();this.persist();this.notify();
  }
  pause(unlock=true){if(this.mode!=='playing'&&this.mode!=='document')return;this.prePause=this.mode;this.mode='paused';this.keys.clear();this.touchAxes={x:0,z:0};this.movement.set(0,0);this.hold=0;this.holdId='';this.audio.pause(true);if(unlock)this.releaseLock();this.persist();this.notify();}
  resume(){if(this.mode!=='paused')return;this.mode=this.prePause;this.keys.clear();this.audio.pause(false);if((!this.storyHomeRequested||this.storyFree)&&this.mode==='playing')this.requestLock();this.notify();}
  title(){this.persist();this.mode='title';this.storyHome?.restart();this.storyEscaping=this.storyFree=this.storySkipPending=false;this.redraw=true;this.keys.clear();this.audio.pause(true);this.releaseLock();this.notify();}
  settingsChange(next:Partial<Settings>){this.settings={...this.settings,...next};writeLocal(SETTINGS_KEY,this.settings);this.updateMix();this.applyQuality();this.resize();this.notify();}
  private updateMix(){this.audio.setVolume(this.settings.mute?0:this.settings.volume);this.audio.setMix(this.settings.ambienceVolume,this.settings.sfxVolume);}
  private applyReflections(){
    if(this.settings.quality==='low'){this.scene.environment=null;return;}
    this.reflections??=roomReflections(this.renderer);
    if(this.reflections){this.scene.environment=this.reflections.texture;this.scene.environmentIntensity=.56;}
  }
  private applyQuality(){const q=this.settings.quality;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,q==='high'?1.75:q==='medium'?1.2:.70)*this.settings.renderScale);
    this.renderer.toneMappingExposure=1.22*this.settings.brightness;
    this.renderer.shadowMap.enabled=this.settings.shadows&&q!=='low';this.bloom.enabled=q==='high';
    this.flashlight.castShadow=this.settings.shadows&&q==='high';if(this.house)this.applyReflections();}
  private resize(){const w=window.innerWidth,h=window.innerHeight;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);this.composer.setSize(w,h);this.redraw=true;}
  private toast(message:string){this.message=message;this.messageUntil=this.elapsed+4.5;this.notify();}
  private objective(){
    if(this.nativeIntro&&!this.flag('free'))return this.nativeObjective();
    if(!this.flag('free')){
    if(!this.flag('chairTipped'))return this.t('Раскачай стул. Нож лежит на полу рядом с правой ногой.','Rock the chair. A knife lies beside your right foot.');
    if(this.escapeSlip<SLIP)return this.t('Освободи правую руку. Левая всё ещё в петле.','Slip the right hand out. The left is still caught in the loop.');
    if(this.escapeRise>=0&&!this.flag('free'))return this.t('Верёвка разрезана. Поднимись.','The rope is cut. Get up.');
    if(this.escapePickup>=0)return this.t('Возьми нож за рукоять.','Take the knife by the handle.');
    if(!this.has('knife'))return this.t('Посмотри вниз и подбери нож клавишей E.','Look down and take the knife with E.');
    if(!this.flag('free'))return this.t('Удерживай R, чтобы разрезать верёвки.','Hold R to cut the ropes.');
    }
    if(!this.house?.hatch.open)return this.t('Найди фонарь и ключ. Отопри люк клавишей E и открой клавишей G.','Find a flashlight and key. Unlock the hatch with E, then open it with G.');
    if(!this.has('studyKey'))return this.t('Исследуй дом. Запасной ключ от кабинета спрятан в кладовой.','Explore the house. A spare study key is hidden in the storeroom.');
    if(!this.has('bedroomKey'))return this.t('Открой кабинет отца и изучи оставленные документы.','Unlock Father’s study and examine his papers.');
    if(!this.has('veraKey'))return this.t('Найди семейную фотографию в спальне родителей.','Find the family photograph in the parents’ bedroom.');
    if(!this.has('exitKey'))return this.t('Обыщи комнату Веры. Её дневник объяснит, как выйти.','Search Vera’s room. Her diary explains how to leave.');
    if(!this.flag('power'))return this.t('Найди предохранитель в ванной и установи его в щиток на кухне.','Find the bathroom fuse and fit it in the kitchen fuse box.');
    if(!this.flag('alarm'))return this.t('Отодвинь шкаф в столовой и отключи сигнализацию.','Move the dining-room wardrobe and release the alarm.');
    return this.t('Отопри входную дверь ключом и выйди из дома.','Unlock the front door and leave the house.');
  }
  private prompt(){
    if(this.nativeIntro&&!this.flag('free')){
      const f=this.nativeIntro.flow;
      if(f.waiting)return this.t('E · Взять нож левой рукой','E · Take the knife with the left hand');
      if(f.time<11.65)return this.t('УДЕРЖИВАЙ R · Раскачать стул','HOLD R · Rock the chair');
      if(f.time>=22&&f.time<31)return this.t('УДЕРЖИВАЙ R · Резать натянутую верёвку','HOLD R · Cut the tensioned rope');
      return '';
    }
    if(!this.flag('free')&&!this.flag('chairTipped'))return this.t('УДЕРЖИВАЙ R · Раскачать стул','HOLD R · Rock the chair');
    if(!this.flag('free')){
      if(this.escapeSlip<SLIP||this.escapePickup>=0||this.escapeRise>=0)return '';
      return this.has('knife')?this.t('УДЕРЖИВАЙ R · Разрезать верёвки','HOLD R · Cut the ropes'):this.t('E · Подобрать нож у правой ноги','E · Take the knife by your right foot');
    }
    const t=this.target;if(!t)return '';
    const title=t.title[this.settings.language==='ru'?0:1];
    if(t.kind==='item')return `E · ${this.t('Подобрать','Take')} — ${title}`;
    if(t.kind==='document')return `F · ${this.t('Прочитать / осмотреть','Read / examine')}`;
    if(t.kind==='furniture')return (t.progress||0)>=1?this.t('Предмет уже отодвинут','Already moved'):this.t(`Зажми R чтобы подвинуть · ${title}`,`Hold R to move · ${title}`);
    if(t.kind==='door')return t.unlocked?`G · ${t.open?this.t('Закрыть','Close'):this.t('Открыть','Open')} — ${title}`:`E · ${this.t('Открыть ключом','Unlock with key')} — ${title}`;
    if(t.kind==='switch')return `E · ${title}`;return `F · ${title}`;
  }
  private act(code:string){
    if(!this.house)return;
    if(!this.flag('free')){
      if(this.nativeIntro){if(code==='KeyE')this.nativeIntro.flow.requestPickup();return;}
      if(code==='KeyE'&&this.escapeSlip>=SLIP&&this.escapePickup<0&&!this.has('knife'))this.escapePickup=0;
      return;
    }
    const t=this.target;if(!t)return;
    if(code==='KeyE'&&t.kind==='item'){this.take(t);return;}
    if(code==='KeyF'&&t.kind==='document'){
      this.document=t.id;this.mode='document';this.keys.clear();if(!this.save.read.includes(t.id))this.save.read.push(t.id);this.audio.play('paper');this.releaseLock();this.persist();this.notify();return;
    }
    if(code==='KeyF'&&t.kind==='inspect'){this.toast(t.title[this.settings.language==='ru'?0:1]);this.audio.play('paper');return;}
    if(t.kind==='door'){
      if(code==='KeyE'&&!t.unlocked){
        if(t.id==='exit'&&!this.flag('alarm')){this.toast(this.t('Дверь удерживает сигнализация. Сначала сними блокировку.','The alarm holds this door. Release it first.'));return;}
        if(t.key&&!this.has(t.key)){this.toast(this.t('Нужен подходящий ключ.','You need the matching key.'));this.audio.play('click');return;}
        t.unlocked=true;this.addFlag(`unlock:${t.id}`);if(t.key)this.showItem('key',.9);this.reachUntil=this.elapsed+.35;this.audio.play('key');this.toast(this.t('Замок открыт. G — открыть дверь рукой.','Unlocked. Press G to open the door.'));this.persist();
      }else if(code==='KeyG'){
        if(!t.unlocked){this.toast(this.t('Заперто. Используй ключ клавишей E.','Locked. Use the key with E.'));this.audio.play('click');return;}
        if(t.id==='hatch'&&t.open&&this.position.x>1.8&&this.position.x<4.2&&this.position.z<-1&&this.position.z>-7){this.toast(this.t('Нельзя закрыть люк, стоя на лестнице.','Step off the stairs before closing the hatch.'));return;}
        if(t.id==='exit'){this.revealExit(t);return;}
        if(this.doorSweepBlocked(t,t.open?0:Number(t.pivot?.userData.openAngle))){
          this.toast(this.t('Отойди от траектории двери.','Step out of the door’s path.'));return;
        }
        this.reachUntil=this.elapsed+.43;
        t.open=!t.open;
        // An obstructed closing hatch is still physically open. Persist closed only at rest,
        // otherwise reload can materialize the shut lid over a player saved on the stairs.
        if(t.id!=='hatch'||t.open)this.save.doors=t.open?[...new Set([...this.save.doors,t.id])]:this.save.doors.filter(id=>id!==t.id);
        this.audio.play('door');this.persist();
      }
    }
    if(code==='KeyE'&&t.kind==='switch'){
      if(t.id==='power'){if(!this.has('fuse')){this.toast(this.t('В щитке не хватает предохранителя на 10 А.','The fuse box needs a 10 A fuse.'));return;}this.addFlag('power');this.audio.play('click');this.toast(this.t('Питание восстановлено. Найди пульт в столовой.','Power restored. Find the dining-room alarm panel.'));}
      if(t.id==='alarm'){if(!this.flag('power')){this.toast(this.t('На пульт не подаётся питание. Проверь кухонный щиток.','The panel has no power. Check the kitchen fuse box.'));return;}this.addFlag('alarm');this.audio.play('key');this.toast(this.t('Блокировка входной двери снята.','Front door alarm released.'));}
      this.persist();
    }
    this.notify();
  }
  private revealExit(t:Target){
    t.open=true;this.addFlag('complete');
    const angle=Number(t.pivot?.userData.openAngle)||-1.65;if(t.pivot)t.pivot.rotation.y=angle;
    t.angle=angle;this.save.doors=[...new Set([...this.save.doors,t.id])];this.mode='ending';this.player.setVisible(false);
    this.camera.position.set(7.24,1.59,-33.13);this.camera.rotation.set(-.088,-Math.PI/2,0,'YXZ');this.flashlight.intensity=0;
    this.audio.play('door');this.audio.pause(true);this.releaseLock();this.persist();this.notify();
  }
  private closeDocument(){
    this.audio.play('paper');this.document=undefined;this.mode='playing';this.requestLock();this.notify();
  }
  private take(t:Target){
    if(!this.has(t.id))this.save.items.push(t.id);
    t.root.visible=false;this.audio.play(t.id==='bag'?'scrape':t.id.endsWith('Key')?'keyPickup':'click');
    if(t.id==='flashlight'){this.equip('flashlight');this.flashOn=true;}else if(t.id==='knife')this.equip('knife');else this.showItem(t.id==='bag'?'bag':t.id==='fuse'?'fuse':'key');
    this.reachUntil=this.elapsed+.36;this.target=undefined;this.persist();
    this.toast(t.id==='bag'?this.t('Сумка Алексея найдена. H — открыть.','Alexei’s bag recovered. H to open.'):this.t('Подобрано: ','Taken: ')+t.title[this.settings.language==='ru'?0:1]);
  }
  private floorAt(x:number,z:number):number|undefined{
    // Traversal follows the physical leaf, not its requested state (which can be blocked).
    if(x>2&&x<4&&z<=-1&&z>=-7&&((this.house?.hatch.angle??0)>.03||this.position.y<3.36))return Math.max(0,3.6*(z+7)/6);
    if(x>=-5.9&&x<=5.9&&z>=-4.9&&z<=4.9&&this.position.y>2.6)return 3.6;
    if(x>=-6.85&&x<=6.85&&z>=-35.85&&z<=-5.6)return 0;
    return undefined;
  }
  private blocked(x:number,z:number,feet:number,height:number){
    const floor=this.floorAt(x,z);if(floor===undefined)return true;
    const nextFeet=this.grounded&&floor>feet&&floor<=feet+.24?floor:feet;
    if(nextFeet+height+HEAD_MARGIN>this.house!.headroom.heightAt(x,z,nextFeet)+1e-5)return true;
    if(this.hatchTouches(x,nextFeet,z,height))return true;
    return this.house!.colliders.some(c=>!c.disabled?.()&&feet<c.top-.08&&feet+height>c.bottom+.12&&x+.22>c.minX&&x-.22<c.maxX&&z+.22>c.minZ&&z-.22<c.maxZ&&(!c.touches||c.touches(x,z,.22)));
  }
  private interactionHits(ray:T.Raycaster){
    return ray.intersectObjects(this.scene.children.filter(o=>o!==this.camera&&o.visible&&o.type!=='Points'&&!o.userData.player&&!o.userData.noInteraction),true)
      .filter(h=>{
        if(h.object.type==='Points')return false;
        let o:T.Object3D|null=h.object;
        while(o){if(!o.visible||o===this.camera||o.userData.player||o.userData.noInteraction)return false;o=o.parent;}
        return true;
      });
  }
  private canContinueHold(t:Target){
    this.camera.updateWorldMatrix(true,false);t.root.updateWorldMatrix(true,true);
    this.holdBounds.setFromObject(t.root,true).getCenter(this.holdPoint);
    this.holdPoint.y=T.MathUtils.clamp(this.camera.position.y,this.holdBounds.min.y+.02,this.holdBounds.max.y-.02);
    this.holdDirection.subVectors(this.holdPoint,this.camera.position);
    const distance=this.holdDirection.length();if(distance>3.8||distance<.01)return false;
    this.holdRay.set(this.camera.position,this.holdDirection.multiplyScalar(1/distance));this.holdRay.far=distance+.05;
    return this.interactionHits(this.holdRay)[0]?.object.userData.target===t.id;
  }
  private findTarget(){
    this.target=undefined;if(!this.house||!this.flag('free'))return;
    if(this.keys.has('KeyR')&&this.holdId){const held=this.house.targets.find(t=>t.id===this.holdId&&t.kind==='furniture');if(held&&this.canContinueHold(held)){this.target=held;return;}}
    this.camera.updateWorldMatrix(true,false);
    for(const t of this.house.targets)if(t.kind==='door'||t.kind==='furniture')t.root.updateWorldMatrix(false,true);
    this.ray.setFromCamera(new T.Vector2(0,0),this.camera);this.ray.far=2.7;
    const hits=this.interactionHits(this.ray);
    for(const h of hits){if(h.object.type==='Points')continue;let obj:T.Object3D|null=h.object;let visible=true, own=false;while(obj){if(!obj.visible)visible=false;if(obj===this.camera||obj.userData.player||obj.userData.noInteraction)own=true;obj=obj.parent;}if(!visible||own)continue;
      const id=h.object.userData.target as string|undefined;
      if(id){const t=this.house.targets.find(t=>t.id===id);if(t&&(!t.blockedBy||this.save.moved.includes(t.blockedBy)))this.target=t;}
      break;
    }
  }
  private updateHold(dt:number){
    let id='';let duration=2.3;
    if(!this.flag('free')&&!this.flag('chairTipped'))id='tip';else if(!this.flag('free')&&this.has('knife')&&this.escapePickup<0&&this.escapeRise<0){id='cut';duration=CUT;}else if(this.target?.kind==='furniture'&&(this.target.progress||0)<1){id=this.target.id;duration=3;}
    if(!id||!this.keys.has('KeyR')){this.hold=0;this.holdId='';return;}
    if(this.holdId!==id){this.hold=0;this.holdId=id;this.holdElapsed=0;this.chairBeat=-1;if(id==='cut'){this.escapeContacts=[];this.sawTravel=this.sawContactTime=0;}else if(id!=='tip')this.audio.play('scrape');}
    const previousTime=this.holdElapsed;
    this.holdElapsed+=dt;this.hold=Math.min(1,this.holdElapsed/duration);
    if(id==='tip'){
      const beat=Math.floor(this.hold*6.6+.46);
      if(beat!==this.chairBeat){this.chairBeat=beat;this.audio.rock(this.hold,beat%2===0?1:-1);}
    }
    if(id!=='tip'&&id!=='cut'){
      const t=this.target!;const previous=t.progress||0;const next=Math.max(previous,this.hold);const desired=t.home!.clone().addScaledVector(t.move!,next);
      // Never push a solid object into the player capsule.
      if(Math.hypot(desired.x-this.position.x,desired.z-this.position.z)>.95){t.progress=next;t.root.position.copy(desired);}else{this.hold=previous;this.toast(this.t('Отойди с пути шкафа.','Step out of the furniture’s path.'));return;}
    }
    if(id==='cut'){
      this.escapeCut=this.hold*CUT;
      const from=Math.max((SAW_START-55)/30,previousTime);
      const to=Math.min(CUT,this.holdElapsed);
      if(to>from){
        const start=this.escape!.sampleSaw(from);this.sawLast.copy(start.position);let priorGap=start.gap;
        const n=Math.ceil((to-from)*120);
        for(let i=1;i<=n;i++){
          const s=this.escape!.sampleSaw(T.MathUtils.lerp(from,to,i/n));
          if(s.gap<.009&&priorGap<.009){
            // Only a draw along the blade axis earns progress. Holding the tip
            // against the rope, or thrusting across it, cannot release the cuff.
            this.sawTravel+=Math.abs(this.sawDelta.subVectors(s.position,this.sawLast).dot(s.axis));
            this.sawContactTime+=(to-from)/n;
            if(this.sawTravel>=this.escapeContacts.length*.085){
              this.escapeContacts.push(s.gap);this.audio.ropeContact(this.escape!.contactPan(this.camera),false);
            }
          }
          this.sawLast.copy(s.position);priorGap=s.gap;
        }
      }
      if(this.hold>=1&&this.sawTravel>=MIN_SAW_TRAVEL&&this.sawContactTime>=1.3){
        this.escape!.sever();this.audio.ropeContact(this.escape!.contactPan(this.camera),true);
        this.escapeRise=0;this.escapeRisePitch=this.camera.rotation.x;this.escapeRiseYaw=this.camera.rotation.y;
      }
    }
    if(this.hold>=1){
      if(id==='tip'){this.addFlag('chairTipped');this.escapeSlip=0;this.audio.play('chairFall');}
      else if(id==='cut'){this.keys.delete('KeyR');}
      else{this.save.moved.push(id);this.audio.play('scrape');this.toast(this.t('Проход освобождён.','The way is clear.'));}
      this.hold=0;this.holdId='';this.persist();
    }
  }
  private updateEscape(dt:number,rock:number){
    if(this.escapeSlip>=0&&this.escapeSlip<SLIP)this.escapeSlip=Math.min(SLIP,this.escapeSlip+dt);
    if(this.escapePickup>=0){
      this.escapePickup+=dt;
      if(this.escapePickup>=GRIP_TIME&&!this.has('knife')){
        this.save.items.push('knife');this.audio.play('click');this.persist();
      }
      if(this.escapePickup>=PICKUP)this.escapePickup=-1;
    }
    if(this.escapeRise<0&&this.holdId!=='cut')this.escapeCut=Math.max(0,this.escapeCut-dt*6);
    if(this.escapeRise>=0)this.escapeRise=Math.min(RISE,this.escapeRise+dt);
    const chair=this.house!.boundChair;chair.updateMatrix();
    this.escapeAnchor.set(.24,.27,-.29).applyMatrix4(chair.matrix);
    this.escape!.update({slip:this.escapeSlip,pickup:this.escapePickup,hasKnife:this.has('knife'),cut:this.escapeCut,rise:this.escapeRise,free:this.flag('free'),rock,chairAnchor:this.escapeAnchor});
    if(this.escapeRise>=RISE&&!this.flag('free')){
      this.position.set(.5,3.6,2);this.pitch=-.27;this.yaw=this.escapeRiseYaw*.2;
      this.addFlag('free');this.equip();this.persist();
      this.toast(this.t('Руки свободны. Сумка лежит рядом со стулом.','Your hands are free. Your bag is beside the chair.'));
    }
  }
  private roomAt(){
    if(this.position.y>1.8&&this.position.z>-6)return 0;
    if(this.position.z>-12)return 1;
    if(Math.abs(this.position.x)<1.6)return this.save.room;
    const row=T.MathUtils.clamp(Math.floor((-this.position.z-12)/6),0,3);return 2+row*2+(this.position.x>0?1:0);
  }
  private nativeObjective(){
    const f=this.nativeIntro!.flow,t=f.time;
    if(t<11.65)return this.t('Раскачай стул: удерживай R.','Hold R to rock the chair.');
    if(t<16.5)return this.t('Левое крепление сломалось. На запястье ещё осталась петля.','The left rail broke. The wrist loop remains.');
    if(f.waiting)return this.t('Нож рядом. Нажми E, чтобы дотянуться левой рукой.','Press E to reach for the knife with the left hand.');
    if(t<22)return this.t('Возьми рукоять левой рукой.','Grasp the handle with the left hand.');
    if(t<26.5)return this.t('Удерживай R: разрежь внешнюю натянутую петлю слева.','Hold R: cut the external tensioned loop on the left.');
    if(t<31)return this.t('Удерживай R: освободи правую руку.','Hold R: release the right hand.');
    if(t<34)return this.t('Ослабь и сними витки с запястий.','Loosen and remove the wrist wraps.');
    if(t<36)return this.t('Сбрось верёвки на пол.','Drop the ropes onto the floor.');
    return this.t('Упрись ладонями и поднимись.','Brace with your palms and stand up.');
  }
  private refreshNativeColliders(){
    if(!this.nativeIntro||!this.house)return;
    this.nativeChairBox.setFromObject(this.nativeIntro.chair,true);
    this.nativeFragmentBox.setFromObject(this.nativeIntro.fragment,true);
    this.house.seatBounds.copy(this.nativeChairBox);
  }
  private updateNativeIntro(dt:number){
    const intro=this.nativeIntro!,before=intro.flow.time;
    intro.flow.advance(dt,this.keys.has('KeyR'));
    intro.sample();intro.measureCut();
    if(before<26.2&&intro.flow.time>=26.2&&intro.flow.leftDraw<.10)intro.flow.time=26.15;
    if(before<30.4&&intro.flow.time>=30.4&&intro.flow.rightDraw<.10)intro.flow.time=30.35;
    const t=intro.flow.time;intro.sample();intro.root.visible=true;intro.bodyVisible(true);
    this.escape?.setVisible(false);this.player.setVisible(false);this.flashlight.intensity=0;
    intro.follow(this.camera,this.settings.cameraMotion);this.refreshNativeColliders();
    this.hold=t<11.65?Math.max(0,(t-4)/7.65):t>=22&&t<31?(t-22)/9:0;
    const beat=Math.floor(Math.max(0,t-4)/.65);
    if(t<11.65&&t>4&&beat!==this.chairBeat){this.chairBeat=beat;this.audio.rock(this.hold,beat%2?1:-1);}
    for(const [at,flag] of [[12.5,'chairTipped'],[20.5,'intro:knifePickup'],[26.2,'intro:leftCut'],[30.4,'intro:rightCut'],[31.9,'intro:knifeSetDown'],[35.8,'intro:ropeDrop']] as const){
      if(t>=at&&!this.flag(flag)){
        this.addFlag(flag);
        if(flag==='chairTipped')this.audio.play('chairFall');
        else if(flag==='intro:knifePickup'){if(!this.has('knife'))this.save.items.push('knife');this.audio.play('keyPickup');}
        else if(flag==='intro:knifeSetDown'){this.save.items=this.save.items.filter(id=>id!=='knife');this.audio.play('click');}
        else if(flag==='intro:ropeDrop')this.audio.play('land');
        else this.audio.ropeContact(flag==='intro:leftCut'?-.25:.25,true);
        this.persist();
      }
    }
    if(t>=22&&t<31&&Math.floor(t*5)!==Math.floor(before*5)&&this.keys.has('KeyR'))this.audio.ropeContact(t<26.5?-.25:.25,false);
    if(Math.floor(t)!==Math.floor(before))this.persist(false);
    if(t>=INTRO_END){
      const e=new T.Euler().setFromQuaternion(this.camera.quaternion,'YXZ');
      this.position.set(this.camera.position.x,3.6,this.camera.position.z);this.pitch=e.x;this.yaw=e.y;
      this.velocity.set(0,0,0);this.motionDebt=0;this.grounded=true;
      this.addFlag('free');this.addFlag('introCompleteV2');intro.bodyVisible(false);this.equip();this.persist();
      this.toast(this.t('Руки свободны. Найди фонарь и ключ от люка.','Your hands are free. Find the flashlight and hatch key.'));
    }
  }
  private stepMotion(dt:number,crouch:boolean,run:boolean){
    let x=Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA'))+this.touchAxes.x,z=Number(this.keys.has('KeyW'))-Number(this.keys.has('KeyS'))+this.touchAxes.z;
    const len=Math.hypot(x,z);if(len>1){x/=len;z/=len;}
    const speed=crouch?1.25:run?4:2.35,drive=this.grounded?(len>0?17:24):5.5;
    this.movement.x=T.MathUtils.damp(this.movement.x,(Math.cos(this.yaw)*x-Math.sin(this.yaw)*z)*speed,drive,dt);
    this.movement.y=T.MathUtils.damp(this.movement.y,(-Math.sin(this.yaw)*x-Math.cos(this.yaw)*z)*speed,drive,dt);
    const dx=this.movement.x*dt,dz=this.movement.y*dt,height=crouch?1.04:1.68;
    // 120 Hz collision steps bound travel to 3.4 cm even when the rendered frame is slow.
    if(!this.blocked(this.position.x+dx,this.position.z,this.position.y,height))this.position.x+=dx;else this.movement.x=0;
    if(!this.blocked(this.position.x,this.position.z+dz,this.position.y,height))this.position.z+=dz;else this.movement.y=0;
    const oldFeet=this.position.y,floor=this.floorAt(this.position.x,this.position.z)??this.position.y;
    if(this.grounded&&floor<=this.position.y+.24&&floor>=this.position.y-.3){this.position.y=floor;this.velocity.y=0;}
    else{this.grounded=false;this.velocity.y-=12*dt;this.position.y+=this.velocity.y*dt;if(this.position.y<=floor){if(this.velocity.y<-2)this.audio.play('land');this.position.y=floor;this.velocity.y=0;this.grounded=true;}}
    const ceiling=this.house!.headroom.heightAt(this.position.x,this.position.z,this.position.y);
    if(this.position.y+height+HEAD_MARGIN>ceiling&&this.velocity.y>0){
      this.position.y=Math.max(floor,ceiling-height-HEAD_MARGIN);this.velocity.y=0;this.grounded=false;
    }
    if(this.hatchTouches(this.position.x,this.position.y,this.position.z,height)&&!this.hatchTouches(this.position.x,oldFeet,this.position.z,height)){
      this.position.y=oldFeet;this.velocity.y=0;this.grounded=false;
    }
    if(this.position.y<floor&&floor-this.position.y<.25)this.position.y=floor;
  }
  private hatchTouches(x:number,feet:number,z:number,height:number){
    const hatch=this.house!.hatch,angle=hatch.angle??0;
    // The shut lid supports a player above, but remains a solid ceiling for one below.
    return (angle>.03||feet<3.5)&&Boolean(hatch.hatchPanel?.touches(angle,x,feet,z,height+HEAD_MARGIN));
  }
  private doorSweepBlocked(t:Target,desired:number){
    if(t.hatchPanel)return t.hatchPanel.sweepTouches(t.angle??0,desired,this.position.x,this.position.y,this.position.z,Math.max(this.actorHeight,this.camera.position.y-this.position.y)+HEAD_MARGIN);
    if(!t.doorShape||this.position.y>=2.4)return false;
    const current=t.angle??0,steps=Math.max(1,Math.ceil(Math.abs(desired-current)/.06));
    for(let i=1;i<=steps;i++)if(doorTouches(t.doorShape,current+(desired-current)*i/steps,this.position.x,this.position.z,.245))return true;
    return false;
  }
  private update(dt:number){
    if(!this.house)return;
    if(this.nativeIntro&&!this.flag('free')){this.updateNativeIntro(dt);return;}
    if(this.nativeIntro){this.nativeIntro.root.visible=true;this.nativeIntro.bodyVisible(false);this.refreshNativeColliders();}
    if(this.holdId&&this.holdId!=='tip'&&this.holdId!=='cut'){
      const held=this.house.targets.find(t=>t.id===this.holdId);
      if(!held||!this.canContinueHold(held)){this.hold=0;this.holdId='';this.target=undefined;}
    }
    this.updateHold(dt);
    const chair=this.house.boundChair,tippedChair=this.flag('chairTipped');
    const chairRock=this.holdId==='tip'?Math.sin(this.hold*6.6*Math.PI)*(.03+this.hold*.21):0;
    chair.rotation.z=T.MathUtils.damp(chair.rotation.z,tippedChair?-Math.PI*.46:chairRock,tippedChair?15:32,dt);
    chair.position.x=T.MathUtils.damp(chair.position.x,tippedChair?.43:chairRock*.27,20,dt);
    chair.position.y=3.6;
    chair.updateMatrix();
    const seat=this.house.seatBounds.copy(this.house.seatLocal).applyMatrix4(chair.matrix),seatLift=3.6-seat.min.y;
    chair.position.y+=seatLift;seat.min.y+=seatLift;seat.max.y+=seatLift;
    if(!this.nativeIntro&&this.escape&&(!this.flag('free')||!this.escape.root.visible))this.updateEscape(dt,chairRock*.75);
    if(this.nativeIntro)this.refreshNativeColliders();
    if(this.storyFree&&this.storyEscape)this.house.seatBounds.setFromObject(this.storyEscape.chair,true);
    const beforeX=this.position.x,beforeZ=this.position.z;
    let crouch=false,run=false;
    if(this.flag('free')){
      const available=this.house.headroom.heightAt(this.position.x,this.position.z,this.position.y);
      crouch=this.keys.has('ShiftLeft')||this.position.y+1.68+HEAD_MARGIN>available+1e-5||this.hatchTouches(this.position.x,this.position.y,this.position.z,1.68);
      run=this.keys.has('ControlLeft')&&!crouch;
      const height=crouch?1.04:1.68;
      this.actorHeight=height;
      this.motionDebt=Math.min(.25,this.motionDebt+dt);
      while(this.motionDebt+1e-9>=1/120){this.stepMotion(1/120,crouch,run);this.motionDebt=Math.max(0,this.motionDebt-1/120);}
      const bob=this.settings.headBob&&this.grounded?Math.sin(this.elapsed*(run?19:13))*.018*this.settings.cameraMotion*Math.min(1,Math.hypot(this.position.x-beforeX,this.position.z-beforeZ)/dt):0;
      const targetY=this.position.y+height+bob;
      const safeEye=this.house.headroom.heightAt(this.position.x,this.position.z,this.position.y)-HEAD_MARGIN;
      this.camera.position.set(this.position.x,Math.min(safeEye,T.MathUtils.damp(this.camera.position.y,targetY,14,dt)),this.position.z);
      if(this.hatchTouches(this.position.x,this.position.y,this.position.z,this.camera.position.y-this.position.y))this.camera.position.y=Math.min(this.camera.position.y,this.position.y+height);
      const room=this.roomAt();if(room!==this.save.room){this.save.room=room;this.persist();}
      if(this.elapsed-this.saveClock>8&&this.position.distanceToSquared(this.savedPosition)>.2){this.persist();this.saveClock=this.elapsed;}
    }else{
      const slide=ease(Math.max(0,this.escapeSlip)/SLIP),rise=ease(Math.max(0,this.escapeRise)/RISE);
      const lean=this.escapePickup>=0?Math.sin(Math.PI*this.escapePickup)**2:0;
      this.camera.position.set(.20*slide+.30*rise+this.settings.cameraMotion*(chairRock*.11+.12*lean),4.77-.23*slide+.74*rise-this.settings.cameraMotion*.16*lean,2.8-.65*slide-.15*rise-this.settings.cameraMotion*.14*lean);
      this.camera.rotation.z=this.settings.cameraMotion*(chairRock*.68-.12*slide*(1-rise));
    }
    if(this.flag('free'))this.camera.rotation.z=T.MathUtils.damp(this.camera.rotation.z,0,8,dt);
    if(this.flag('free')){this.camera.rotation.y=this.yaw;this.camera.rotation.x=this.pitch;}
    else{
      const slide=ease(Math.max(0,this.escapeSlip)/SLIP),rise=ease(Math.max(0,this.escapeRise)/RISE);
      const cut=ease(this.escapeCut/.45),pick=this.escapePickup>=0?Math.sin(Math.PI*this.escapePickup):0;
      const look=T.MathUtils.lerp(T.MathUtils.clamp(this.pitch,-.68,.31),T.MathUtils.lerp((this.has('knife')&&this.escapePickup<0?-.63:-.89)-.14*pick,-.78,cut),slide*.95);
      const headTurn=T.MathUtils.clamp(Math.atan2(Math.sin(this.yaw),Math.cos(this.yaw)),-.46,.46);
      this.camera.rotation.y=this.escapeRise>=0?T.MathUtils.lerp(this.escapeRiseYaw,this.escapeRiseYaw*.2,rise):headTurn*(1-.9*slide)-(.30+.12*pick)*slide+.50*cut;
      const settling=ease(this.escapeRise/.34),lift=ease((this.escapeRise-.34)/.66);
      this.camera.rotation.x=this.escapeRise>=0?T.MathUtils.lerp(T.MathUtils.lerp(this.escapeRisePitch,-.94,settling),-.27,lift):look;
    }
    if(this.itemUntil&&this.elapsed>=this.itemUntil){const before=this.carryAfter;this.equip(before?.id);this.flashOn=before?.id==='flashlight'&&before.flash;}
    if(this.player.update({position:this.position,yaw:this.yaw,pitch:this.pitch,dt,elapsed:this.elapsed,dx:this.position.x-beforeX,dz:this.position.z-beforeZ,grounded:this.grounded,crouch,free:this.flag('free'),tipped:this.flag('chairTipped'),running:run,hold:this.hold,activity:this.holdId,held:this.held,using:this.useUntil>this.elapsed?1-(this.useUntil-this.elapsed)/.93:0,reach:this.reachUntil>this.elapsed?1-(this.reachUntil-this.elapsed)/.43:0,water:remaining(this.save.flags,'water'),flashOn:this.flashOn,shadows:this.settings.quality!=='low',introRise:ease(Math.max(0,this.escapeRise)/RISE),introSlide:ease(Math.max(0,this.escapeSlip)/SLIP),introRock:chairRock})){
      this.stepSide=!this.stepSide;this.audio.step(run,crouch,this.stepSide);
    }
    this.flashlight.position.copy(this.player.lightSource);
    this.flashlight.intensity=this.flashOn&&this.held==='flashlight'?43:0;
    this.house.glow.intensity=this.flag('power')?16:0;
    for(const t of this.house.targets){if(t.kind==='door'&&t.pivot){
      const desired=t.open?Number(t.pivot.userData.openAngle):0;
      const next=T.MathUtils.damp(t.angle||0,desired,4,dt);
      // A player can enter the sweep after pressing G; stop the moving leaf before contact.
      if(!this.doorSweepBlocked(t,next))t.angle=next;
      if(t.id==='hatch'&&!t.open&&(t.angle??0)<.001&&this.save.doors.includes('hatch')){
        t.angle=0;this.save.doors=this.save.doors.filter(id=>id!=='hatch');this.persist();
      }
      if(t.id==='hatch')t.pivot.rotation.z=t.angle??0;else t.pivot.rotation.y=t.angle??0;
    }}
    this.house.dust.rotation.y=Math.sin(this.elapsed*.025)*.03;this.house.lamp.intensity=9+Math.sin(this.elapsed*1.4)*.25;
    this.findTarget();
  }
  private tick=(now:number)=>{
    if(this.disposed)return;
    if(this.settings.fpsCap&&this.last&&now-this.last<1000/this.settings.fpsCap-1){this.frame=requestAnimationFrame(this.tick);return;}
    const raw=this.last?(now-this.last)/1000:.016,dt=Math.min(.25,Math.max(0,raw));this.last=now;
    if(this.storyHomeRequested&&!this.storyFree){
      if(this.storyHome){
        this.stepStory(dt);
        if(now-this.lastUI>100){this.lastUI=now;this.notify();}
      }
      this.frame=requestAnimationFrame(this.tick);return;
    }
    if(this.mode==='playing'&&!this.manualClock){this.frameTimes.push(raw*1000);if(this.frameTimes.length>180)this.frameTimes.shift();this.elapsed+=dt;this.update(dt);}else if(this.mode==='title'&&this.house){
      this.camera.position.set(-2.9,4.9,3.8);this.camera.rotation.set(-.1,.21+Math.sin(now*.00007)*.035,0,'YXZ');this.player.setVisible(false);this.escape?.setVisible(false);if(this.nativeIntro)this.nativeIntro.root.visible=false;this.flashlight.intensity=0;
    }
    if(this.house&&(this.mode==='title'||this.mode==='playing'||this.mode==='ending')){
      this.atmosphereTime+=dt;if(this.house.weather.update(this.atmosphereTime,this.settings.quality,this.camera,this.settings.weather==='snow',
        this.settings.ambientEffects,this.settings.reducedFlicker)&&this.mode==='playing')this.audio.play('thunder');
    }
    if(this.redraw||this.mode==='playing'||this.mode==='title'||this.mode==='ending'){
      if(this.settings.quality==='high')this.composer.render();else this.renderer.render(this.scene,this.camera);
      this.redraw=false;
    }
    if(now-this.lastUI>100){this.lastUI=now;this.notify();}
    this.frame=requestAnimationFrame(this.tick);
  };
  private token(){try{let token=localStorage.getItem(TOKEN_KEY);if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem(TOKEN_KEY,token);}return token;}catch{return null;}}
  private persist(remote=true){
    if(!this.house||(!STORY_PRODUCTION&&this.storyHomeRequested)||
      !canWriteGameSave(this.intent,this.storyFree,this.mode!=='loading'&&this.mode!=='error'))return;
    if(this.nativeIntro)this.save.intro=this.nativeIntro.flow.checkpoint();
    this.save.position=this.position.toArray() as [number,number,number];this.save.yaw=this.yaw;this.save.pitch=this.pitch;this.save.updatedAt=new Date().toISOString();this.savedPosition.copy(this.position);
    if(!writeLocal(SAVE_KEY,this.save)){this.cloud='unavailable';return;}if(!remote||!API)return;
    clearTimeout(this.cloudTimer);this.cloudTimer=setTimeout(()=>{void this.cloudSave();},800);
  }
  private async cloudSave(){const token=this.token();if(!token||!API)return;this.cloud='saving';this.notify();try{const response=await fetch(`${API}/api/save`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(this.save),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('save');this.cloud='saved';}catch{this.cloud='offline';}if(!this.disposed)this.notify();}
  async restoreCloud(){if(!API||(this.storyHomeRequested&&!(STORY_PRODUCTION&&this.storyFree))){this.cloud='local';this.notify();return;}const token=this.token();if(!token)return;
    try{const r=await fetch(`${API}/api/save`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});if(r.status===404){this.toast(this.t('Серверной копии пока нет.','No server backup yet.'));return;}if(!r.ok)throw Error();const s:unknown=await r.json();if(!validSave(s))throw Error();
      this.save=s;this.restoreEscape();this.escape?.setVisible(false);this.recoverPack();writeLocal(SAVE_KEY,s);this.position.fromArray(s.position);this.yaw=s.yaw;this.pitch=s.pitch;this.equip();this.movement.set(0,0);this.velocity.set(0,0,0);
      for(const t of this.house!.targets){if(t.kind==='item')t.root.visible=!s.items.includes(t.id);if(t.kind==='door'){t.open=s.doors.includes(t.id);t.unlocked=!t.key||s.flags.includes(`unlock:${t.id}`);}if(t.home){t.root.position.copy(t.home);if(s.moved.includes(t.id))t.root.position.add(t.move!);t.progress=s.moved.includes(t.id)?1:0;}}
      this.scene.traverse(o=>{if(o.name==='rope')o.visible=!s.flags.includes('free');});this.cloud='restored';this.notify();
    }catch{this.cloud='offline';this.notify();}
  }
  private notify(){if(this.disposed)return;
    const story=this.storyHome?.snapshot();
    const storyHome=this.storyHomeRequested&&!this.storyFree?(this.storyEscaping?'seated':story?.ended&&!this.storyFullRequested?'end':story?.street?'street':story?.beat==='HOME_EXIT'?'exit':'dialogue'):undefined;
    const beat=story?.beat;
    const holdText=beat==='REACH'?this.t('Удерживайте R, чтобы дотянуться','Hold R to reach the knife'):
      beat==='RIGHT_CUT'?this.t('Удерживайте R, чтобы разрезать верёвку','Hold R to cut the rope'):'';
    const storyWait=this.storyFullRequested&&!this.storyEscaping&&(this.storySkipPending||!!story?.ended);
    this.emit({mode:this.mode,loading:this.loading,room:this.save.room,objective:storyHome?'':this.objective(),
      prompt:this.mode!=='playing'?'':this.storyEscaping&&!this.storyFree?holdText:storyHome?'':this.prompt(),
      progress:holdText&&this.storyEscaping?(story?.seconds??0)/(beat==='REACH'?1.8:4):this.hold,
      message:this.elapsed<this.messageUntil?this.message:'',document:this.document,save:{...this.save,items:[...this.save.items]},settings:{...this.settings},cloud:this.cloud,held:this.held,error:this.mode==='error'?this.message:undefined,
      storyHome,storyWait,storyCanSkip:this.storyFullRequested&&!this.storyEscaping&&!storyWait,
      storySubtitle:beat==='KNIFE_SPOTTED'?this.t('Попробуйте дотянуться до ножа','Try reaching for the knife'):story?.subtitle,
      storyClock:story?.clock,storyBlack:storyWait?1:this.storyEscaping?beat==='AWAKE_BOUND'?Math.max(0,1-(story?.seconds??0)/1.1):0:story?.black});}
  private releaseScene(){this.house?.weather.dispose();const materials=new Set<T.Material>();const textures=new Set<T.Texture>();const geometries=new Set<T.BufferGeometry>();this.scene.traverse(o=>{const mesh=o as T.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material){for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(mat);}});for(const g of geometries)g.dispose();for(const mat of materials){for(const value of Object.values(mat))if(value instanceof T.Texture)textures.add(value);mat.dispose();}for(const t of textures)t.dispose();this.scene.clear();}
  dispose(){
    if(this.disposed)return;
    this.persist(false);this.disposed=true;cancelAnimationFrame(this.frame);clearTimeout(this.cloudTimer);
    for(const off of this.listeners)off();this.keys.clear();
    if(document.pointerLockElement===this.canvas)document.exitPointerLock();
    this.audio.dispose();this.storyHome?.dispose();this.storyEscape?.dispose();this.releaseScene();this.reflections?.dispose();
    // EffectComposer owns its two buffers, but does not dispose the passes it contains.
    disposeComposer(this.composer);this.renderer.dispose();
    if(import.meta.env.DEV||import.meta.env.VITE_VERIFY==='1'){
      const w=window as unknown as Record<string,unknown>;
      delete w.__episodeTest;delete w.render_game_to_text;delete w.advanceTime;
      if(import.meta.env.DEV&&this.storyHomeRequested)delete w.__storyHomeTest;
    }
  }
}
