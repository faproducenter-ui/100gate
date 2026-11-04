import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createHouse, doorTouches, type House, type Target } from './world';
import { Foley } from './audio';
import { DEFAULT_SETTINGS, DOCUMENTS, ROOMS, newSave, text, validSave, type Save, type Settings } from './data';
import { PACK, PORTIONS, remaining, type Consumable, type PackItem, type PropId } from './pack';
import { PlayerRig } from './player';
import { disposeComposer } from './lifetime';
import { HEAD_MARGIN } from './headroom';

export type Mode = 'loading' | 'title' | 'playing' | 'paused' | 'document' | 'bag' | 'ending' | 'error';
export interface View { mode: Mode; loading: number; room: number; objective: string; prompt: string; progress: number; message: string; document?: string; save: Save; settings: Settings; cloud: string; held?:PropId; error?: string; }
const SAVE_KEY='100gate.chapter1.save.v1', SETTINGS_KEY='100gate.settings.v1', TOKEN_KEY='100gate.save-token.v1';
function readLocal(key:string):unknown {try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function writeLocal(key:string,value:unknown) {try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
const API=(import.meta.env.VITE_SAVE_API as string|undefined)?.replace(/\/$/,'')||'';
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
  private scene=new T.Scene(); private camera=new T.PerspectiveCamera(72,1,.055,100);
  private renderer:T.WebGLRenderer;private composer:EffectComposer;private bloom:UnrealBloomPass;private reflections?:T.WebGLRenderTarget;
  private house?:House;private audio=new Foley();private keys=new Set<string>();private listeners:(()=>void)[]=[];
  private frame=0;private disposed=false;private last=0;private elapsed=0;private lastUI=0;private atmosphereTime=0;private redraw=true;
  private velocity=new T.Vector3();private position=new T.Vector3();private yaw=0;private pitch=-.23;private grounded=true;
  private target?:Target;private hold=0;private holdId='';private holdElapsed=0;private ray=new T.Raycaster();private flashlight:T.SpotLight;
  private chairBeat=-1;private stepSide=false;
  private player:PlayerRig;private flashOn=false;private held?:PropId;private itemUntil=0;private useUntil=0;private reachUntil=0;private carryAfter?:{id?:PropId;flash:boolean};
  private movement=new T.Vector2();private motionDebt=0;private actorHeight=1.68;
  private manualClock=false;private frameTimes:number[]=[];
  private holdRay=new T.Raycaster();private holdPoint=new T.Vector3();private holdDirection=new T.Vector3();private holdBounds=new T.Box3();
  private settings:Settings;private save:Save;private mode:Mode='loading';private loading=0;private document?:string;
  private message='';private messageUntil=0;private cloud='local';private cloudTimer:ReturnType<typeof setTimeout>|undefined;
  private savedPosition=new T.Vector3();private saveClock=0;private prePause:'playing'|'document'='playing';
  private mobile=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
  private touchAxes={x:0,z:0};
  constructor(private canvas:HTMLCanvasElement,private emit:(s:View)=>void){
    const raw=readLocal(SAVE_KEY);this.save=validSave(raw)?raw:newSave();this.recoverPack();
    const stored=readLocal(SETTINGS_KEY);this.settings={...DEFAULT_SETTINGS};
    if(stored&&typeof stored==='object'){
      const s=stored as Partial<Settings>;if(s.language==='ru'||s.language==='en')this.settings.language=s.language;
      if(['low','medium','high'].includes(s.quality||''))this.settings.quality=s.quality!;
      if(Number.isFinite(s.volume))this.settings.volume=T.MathUtils.clamp(s.volume!,0,1);
      if(Number.isFinite(s.sensitivity))this.settings.sensitivity=T.MathUtils.clamp(s.sensitivity!,.2,2);
      if(typeof s.headBob==='boolean')this.settings.headBob=s.headBob;
      if(s.weather==='rain'||s.weather==='snow')this.settings.weather=s.weather;
    }
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
    this.frame=requestAnimationFrame(this.tick);
    void this.init();
  }
  private async init(){try{
    this.house=await createHouse(this.scene,this.save,n=>{if(!this.disposed){this.loading=n;this.notify();}});
    if(this.disposed){this.releaseScene();return;}
    this.applyReflections();
    this.player.loadBody(this.house.model);
    this.player.registerModel('flashlight',this.house.model('gear-flashlight'));
    this.player.registerModel('key',this.house.model('gear-brass-key'));
    const satchel=this.house.targets.find(t=>t.id==='bag')?.root.clone(true) as T.Group|undefined;
    if(satchel){satchel.position.set(0,-.078,0);satchel.rotation.set(.05,0,0);satchel.scale.setScalar(.60);this.player.registerModel('bag',satchel);}
    this.mode='title';this.loading=1;this.notify();
    // Probe is exposed only in local development and explicit automated verification builds.
    if(import.meta.env.DEV||import.meta.env.VITE_VERIFY==='1'){
      (window as unknown as Record<string,unknown>).__episodeTest={
        state:()=>({mode:this.mode,save:structuredClone(this.save),position:this.position.toArray(),yaw:this.yaw,pitch:this.pitch,grounded:this.grounded,actorHeight:this.actorHeight,target:this.target?.id,hold:this.hold,settings:{...this.settings},rig:this.player.state(),lamp:this.flashlight.intensity>0,weather:this.house?.weather.snapshot()}),
        foley:()=>this.audio.state(),
        pose:(x:number,y:number,z:number,yaw=0,pitch=0)=>{this.position.set(x,y,z);this.yaw=yaw;this.pitch=pitch;this.velocity.set(0,0,0);this.movement.set(0,0);this.motionDebt=0;this.grounded=true;},
        diagnostics:()=>({render:{...this.renderer.info.render},memory:{...this.renderer.info.memory},frameTimes:[...this.frameTimes],motionDebt:this.motionDebt,manualClock:this.manualClock,elapsed:this.elapsed,verticalVelocity:this.velocity.y,keys:[...this.keys],
          overlappingDoors:this.position.y>=2.4?[]:this.house?.targets.filter(t=>t.doorShape&&doorTouches(t.doorShape,t.angle??0,this.position.x,this.position.z,.22)).map(t=>t.id)}),
        aim:(id:string)=>{const t=this.house?.targets.find(t=>t.id===id);if(t){t.root.updateWorldMatrix(true,true);const point=t.focus?t.focus.getWorldPosition(new T.Vector3()):new T.Box3().setFromObject(t.root).getCenter(new T.Vector3());this.camera.position.copy(this.position).add(new T.Vector3(0,1.68,0));const d=point.sub(this.camera.position);this.yaw=Math.atan2(-d.x,-d.z);this.pitch=Math.atan2(d.y,Math.hypot(d.x,d.z));}},
        targets:()=>this.house?.targets.map(t=>({id:t.id,kind:t.kind,pos:t.root.getWorldPosition(new T.Vector3()).toArray(),open:t.open,unlocked:t.unlocked})),
        hatchView:()=>{
          const t=this.house?.hatch,leaf=t?.pivot?.children.find(o=>o instanceof T.Mesh) as T.Mesh|undefined;
          if(!leaf)return;leaf.updateWorldMatrix(true,false);leaf.geometry.computeBoundingBox();
          return {angle:t?.angle,open:t?.open,matrix:leaf.matrixWorld.toArray(),min:leaf.geometry.boundingBox!.min.toArray(),max:leaf.geometry.boundingBox!.max.toArray()};
        },
        introView:()=>{
          const chair=this.scene.getObjectByName('bound-chair'),ray=new T.Raycaster();
          this.camera.updateWorldMatrix(true,false);chair?.updateWorldMatrix(true,true);ray.far=.82;
          let chairHits=0;
          if(chair)for(const x of [-.7,-.35,0,.35,.7])for(const y of [-.65,-.3,0,.3,.65]){
            ray.setFromCamera(new T.Vector2(x,y),this.camera);
            if(ray.intersectObject(chair,true).length)chairHits++;
          }
          return {chairHits,eye:this.camera.position.toArray()};
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
  }catch(e){if(!this.disposed){this.mode='error';this.message=String(e);this.notify();}}}
  private t(ru:string,en:string){return text(this.settings.language,ru,en);}
  private has(id:string){return this.save.items.includes(id);}
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
    if(document.pointerLockElement===this.canvas)document.exitPointerLock();
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
      if((e.target as HTMLElement)?.matches('input,select,textarea'))return;
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
    on(window,'keyup',((e:KeyboardEvent)=>{this.keys.delete(e.code);if(e.code==='KeyR'){this.hold=0;this.holdId='';}}) as EventListener);
    on(window,'mousemove',((e:MouseEvent)=>{if(document.pointerLockElement!==this.canvas||this.mode!=='playing')return;this.yaw-=e.movementX*.0019*this.settings.sensitivity;this.pitch=T.MathUtils.clamp(this.pitch-e.movementY*.0019*this.settings.sensitivity,-1.42,1.42);}) as EventListener);
    on(document,'pointerlockchange',()=>{if(document.pointerLockElement!==this.canvas&&this.mode==='playing'){this.pause(false);}});
    on(window,'blur',()=>{this.keys.clear();if(this.mode==='playing')this.pause();});
    on(document,'visibilitychange',()=>{if(document.hidden&&this.mode==='playing')this.pause();});
    on(this.canvas,'click',()=>{if(this.mode==='playing')this.requestLock();});
    on(window,'pagehide',()=>this.persist(false));
  }
  private requestLock(){if(this.mobile)return;try{const r=this.canvas.requestPointerLock();if(r&&'catch' in r)void r.catch(()=>{this.toast(this.t('Нажми на экран, чтобы управлять взглядом','Click the scene to control the view'));});}catch{/* browser requires an additional user gesture */}}
  touchMove(x:number,z:number){this.touchAxes={x,z};}
  touchLook(x:number,y:number){if(this.mode!=='playing')return;this.yaw-=x*.004*this.settings.sensitivity;this.pitch=T.MathUtils.clamp(this.pitch-y*.004*this.settings.sensitivity,-1.42,1.42);}
  touchButton(code:string,down:boolean){
    if(!down){this.keys.delete(code);if(code==='KeyR'){this.hold=0;this.holdId='';}return;}
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
    if(!this.house||this.mode==='error')return;
    if(fresh){this.save=newSave();this.position.fromArray(this.save.position);this.yaw=0;this.pitch=-.23;this.velocity.set(0,0,0);this.movement.set(0,0);this.grounded=true;this.equip();
      for(const t of this.house.targets){if(t.kind==='item')t.root.visible=true;if(t.kind==='door'){t.open=false;t.unlocked=!t.key;t.angle=0;t.pivot?.rotation.set(0,0,0);}if(t.kind==='furniture'&&t.home){t.root.position.copy(t.home);t.progress=0;}}
      this.scene.traverse(o=>{if(o.name==='rope')o.visible=true;});
    }
    if(this.flag('free')){this.camera.position.copy(this.position).add(new T.Vector3(0,1.68,0));if(!this.held&&this.has('flashlight'))this.equip('flashlight');}
    this.mode='playing';this.document=undefined;this.audio.setVolume(this.settings.volume);this.audio.start();this.requestLock();this.persist();this.notify();
  }
  pause(unlock=true){if(this.mode!=='playing'&&this.mode!=='document')return;this.prePause=this.mode;this.mode='paused';this.keys.clear();this.touchAxes={x:0,z:0};this.movement.set(0,0);this.hold=0;this.holdId='';this.audio.pause(true);if(unlock&&document.pointerLockElement)document.exitPointerLock();this.persist();this.notify();}
  resume(){if(this.mode!=='paused')return;this.mode=this.prePause;this.keys.clear();this.audio.pause(false);if(this.mode==='playing')this.requestLock();this.notify();}
  title(){this.persist();this.mode='title';this.keys.clear();this.audio.pause(true);if(document.pointerLockElement)document.exitPointerLock();this.notify();}
  settingsChange(next:Partial<Settings>){this.settings={...this.settings,...next};writeLocal(SETTINGS_KEY,this.settings);this.audio.setVolume(this.settings.volume);this.applyQuality();this.resize();this.notify();}
  private applyReflections(){
    if(this.settings.quality==='low'){this.scene.environment=null;return;}
    this.reflections??=roomReflections(this.renderer);
    if(this.reflections){this.scene.environment=this.reflections.texture;this.scene.environmentIntensity=.56;}
  }
  private applyQuality(){const q=this.settings.quality;this.renderer.setPixelRatio(Math.min(devicePixelRatio,q==='high'?1.75:q==='medium'?1.2:.70));this.renderer.shadowMap.enabled=q!=='low';this.bloom.enabled=q==='high';this.flashlight.castShadow=q==='high';if(this.house)this.applyReflections();}
  private resize(){const w=window.innerWidth,h=window.innerHeight;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);this.composer.setSize(w,h);this.redraw=true;}
  private toast(message:string){this.message=message;this.messageUntil=this.elapsed+4.5;this.notify();}
  private objective(){
    if(!this.flag('chairTipped'))return this.t('Раскачай стул. Нож лежит на полу рядом с правой ногой.','Rock the chair. A knife lies beside your right foot.');
    if(!this.has('knife'))return this.t('Посмотри вниз и подбери нож клавишей E.','Look down and take the knife with E.');
    if(!this.flag('free'))return this.t('Удерживай R, чтобы разрезать верёвки.','Hold R to cut the ropes.');
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
    if(!this.flag('chairTipped'))return this.t('УДЕРЖИВАЙ R · Раскачать стул','HOLD R · Rock the chair');
    if(!this.flag('free'))return this.has('knife')?this.t('УДЕРЖИВАЙ R · Разрезать верёвки','HOLD R · Cut the ropes'):this.t('E · Подобрать нож у правой ноги','E · Take the knife by your right foot');
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
    if(!this.flag('free')){if(code==='KeyE'&&this.flag('chairTipped')&&!this.has('knife'))this.take(this.house.targets.find(t=>t.id==='knife')!);return;}
    const t=this.target;if(!t)return;
    if(code==='KeyE'&&t.kind==='item'){this.take(t);return;}
    if(code==='KeyF'&&t.kind==='document'){
      this.document=t.id;this.mode='document';this.keys.clear();if(!this.save.read.includes(t.id))this.save.read.push(t.id);this.audio.play('paper');if(document.pointerLockElement)document.exitPointerLock();this.persist();this.notify();return;
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
    this.audio.play('door');this.audio.pause(true);if(document.pointerLockElement)document.exitPointerLock();this.persist();this.notify();
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
    if(!this.flag('chairTipped'))id='tip';else if(!this.flag('free')&&this.has('knife')){id='cut';duration=2.8;}else if(this.target?.kind==='furniture'&&(this.target.progress||0)<1){id=this.target.id;duration=3;}
    if(!id||!this.keys.has('KeyR')){this.hold=0;this.holdId='';return;}
    if(this.holdId!==id){this.hold=0;this.holdId=id;this.holdElapsed=0;this.chairBeat=-1;if(id!=='tip')this.audio.play(id==='cut'?'cut':'scrape');}
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
    if(this.hold>=1){
      if(id==='tip'){this.addFlag('chairTipped');this.pitch=-.76;this.audio.play('chairFall');this.toast(this.t('Нож рядом с правой рукой. E — подобрать.','The knife is by your right hand. E to take it.'));}
      else if(id==='cut'){this.addFlag('free');this.position.set(.5,3.6,2);this.audio.play('cut');this.equip();this.toast(this.t('Руки свободны. Сумка лежит рядом со стулом.','Your hands are free. Your bag is beside the chair.'));}
      else{this.save.moved.push(id);this.audio.play('scrape');this.toast(this.t('Проход освобождён.','The way is clear.'));}
      this.hold=0;this.holdId='';this.persist();
    }
  }
  private roomAt(){
    if(this.position.y>1.8&&this.position.z>-6)return 0;
    if(this.position.z>-12)return 1;
    if(Math.abs(this.position.x)<1.6)return this.save.room;
    const row=T.MathUtils.clamp(Math.floor((-this.position.z-12)/6),0,3);return 2+row*2+(this.position.x>0?1:0);
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
      const bob=this.settings.headBob&&this.grounded?Math.sin(this.elapsed*(run?19:13))*.018*Math.min(1,Math.hypot(this.position.x-beforeX,this.position.z-beforeZ)/dt):0;
      const targetY=this.position.y+height+bob;
      const safeEye=this.house.headroom.heightAt(this.position.x,this.position.z,this.position.y)-HEAD_MARGIN;
      this.camera.position.set(this.position.x,Math.min(safeEye,T.MathUtils.damp(this.camera.position.y,targetY,14,dt)),this.position.z);
      if(this.hatchTouches(this.position.x,this.position.y,this.position.z,this.camera.position.y-this.position.y))this.camera.position.y=Math.min(this.camera.position.y,this.position.y+height);
      const room=this.roomAt();if(room!==this.save.room){this.save.room=room;this.persist();}
      if(this.elapsed-this.saveClock>8&&this.position.distanceToSquared(this.savedPosition)>.2){this.persist();this.saveClock=this.elapsed;}
    }else{
      const tipped=this.flag('chairTipped');const rock=chairRock*.68;
      this.camera.position.set(tipped?.2:0,tipped?4.54:4.77,tipped?2.15:2.8);this.camera.rotation.z=tipped?-.12:rock;
    }
    if(this.flag('free'))this.camera.rotation.z=T.MathUtils.damp(this.camera.rotation.z,0,8,dt);
    this.camera.rotation.y=this.yaw;this.camera.rotation.x=!this.flag('free')&&this.flag('chairTipped')?Math.max(this.pitch,-.89):this.pitch;
    if(this.itemUntil&&this.elapsed>=this.itemUntil){const before=this.carryAfter;this.equip(before?.id);this.flashOn=before?.id==='flashlight'&&before.flash;}
    if(this.player.update({position:this.position,yaw:this.yaw,pitch:this.pitch,dt,elapsed:this.elapsed,dx:this.position.x-beforeX,dz:this.position.z-beforeZ,grounded:this.grounded,crouch,free:this.flag('free'),tipped:this.flag('chairTipped'),running:run,hold:this.hold,activity:this.holdId,held:!this.flag('free')&&this.has('knife')?'knife':this.held,using:this.useUntil>this.elapsed?1-(this.useUntil-this.elapsed)/.93:0,reach:this.reachUntil>this.elapsed?1-(this.reachUntil-this.elapsed)/.43:0,water:remaining(this.save.flags,'water'),flashOn:this.flashOn,shadows:this.settings.quality!=='low'})){
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
    if(this.disposed)return;const raw=this.last?(now-this.last)/1000:.016,dt=Math.min(.25,Math.max(0,raw));this.last=now;
    if(this.mode==='playing'&&!this.manualClock){this.frameTimes.push(raw*1000);if(this.frameTimes.length>180)this.frameTimes.shift();this.elapsed+=dt;this.update(dt);}else if(this.mode==='title'&&this.house){
      this.camera.position.set(-2.9,4.9,3.8);this.camera.rotation.set(-.1,.21+Math.sin(now*.00007)*.035,0,'YXZ');this.player.setVisible(false);this.flashlight.intensity=0;
    }
    if(this.house&&(this.mode==='title'||this.mode==='playing'||this.mode==='ending')){
      this.atmosphereTime+=dt;if(this.house.weather.update(this.atmosphereTime,this.settings.quality,this.camera,this.settings.weather==='snow')&&this.mode==='playing')this.audio.play('thunder');
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
    if(!this.house)return;
    this.save.position=this.position.toArray() as [number,number,number];this.save.yaw=this.yaw;this.save.pitch=this.pitch;this.save.updatedAt=new Date().toISOString();this.savedPosition.copy(this.position);
    if(!writeLocal(SAVE_KEY,this.save)){this.cloud='unavailable';return;}if(!remote||!API)return;
    clearTimeout(this.cloudTimer);this.cloudTimer=setTimeout(()=>{void this.cloudSave();},800);
  }
  private async cloudSave(){const token=this.token();if(!token||!API)return;this.cloud='saving';this.notify();try{const response=await fetch(`${API}/api/save`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(this.save),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('save');this.cloud='saved';}catch{this.cloud='offline';}if(!this.disposed)this.notify();}
  async restoreCloud(){if(!API){this.cloud='local';this.notify();return;}const token=this.token();if(!token)return;
    try{const r=await fetch(`${API}/api/save`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});if(r.status===404){this.toast(this.t('Серверной копии пока нет.','No server backup yet.'));return;}if(!r.ok)throw Error();const s:unknown=await r.json();if(!validSave(s))throw Error();
      this.save=s;this.recoverPack();writeLocal(SAVE_KEY,s);this.position.fromArray(s.position);this.yaw=s.yaw;this.pitch=s.pitch;this.equip();this.movement.set(0,0);this.velocity.set(0,0,0);
      for(const t of this.house!.targets){if(t.kind==='item')t.root.visible=!s.items.includes(t.id);if(t.kind==='door'){t.open=s.doors.includes(t.id);t.unlocked=!t.key||s.flags.includes(`unlock:${t.id}`);}if(t.home){t.root.position.copy(t.home);if(s.moved.includes(t.id))t.root.position.add(t.move!);t.progress=s.moved.includes(t.id)?1:0;}}
      this.scene.traverse(o=>{if(o.name==='rope')o.visible=!s.flags.includes('free');});this.cloud='restored';this.notify();
    }catch{this.cloud='offline';this.notify();}
  }
  private notify(){if(this.disposed)return;this.emit({mode:this.mode,loading:this.loading,room:this.save.room,objective:this.objective(),prompt:this.mode==='playing'?this.prompt():'',progress:this.hold,message:this.elapsed<this.messageUntil?this.message:'',document:this.document,save:{...this.save,items:[...this.save.items]},settings:{...this.settings},cloud:this.cloud,held:this.held,error:this.mode==='error'?this.message:undefined});}
  private releaseScene(){this.house?.weather.dispose();const materials=new Set<T.Material>();const textures=new Set<T.Texture>();const geometries=new Set<T.BufferGeometry>();this.scene.traverse(o=>{const mesh=o as T.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material){for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(mat);}});for(const g of geometries)g.dispose();for(const mat of materials){for(const value of Object.values(mat))if(value instanceof T.Texture)textures.add(value);mat.dispose();}for(const t of textures)t.dispose();this.scene.clear();}
  dispose(){
    if(this.disposed)return;
    this.persist(false);this.disposed=true;cancelAnimationFrame(this.frame);clearTimeout(this.cloudTimer);
    for(const off of this.listeners)off();this.keys.clear();
    if(document.pointerLockElement===this.canvas)document.exitPointerLock();
    this.audio.dispose();this.releaseScene();this.reflections?.dispose();
    // EffectComposer owns its two buffers, but does not dispose the passes it contains.
    disposeComposer(this.composer);this.renderer.dispose();
    const w=window as unknown as Record<string,unknown>;
    delete w.__episodeTest;delete w.render_game_to_text;delete w.advanceTime;
  }
}
