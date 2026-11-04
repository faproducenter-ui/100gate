import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createHouse, type House, type Target } from './world';
import { Foley } from './audio';
import { DEFAULT_SETTINGS, DOCUMENTS, ROOMS, newSave, text, validSave, type Save, type Settings } from './data';
import { PACK, PORTIONS, remaining, type Consumable, type PackItem, type PropId } from './pack';
import { PlayerRig } from './player';

export type Mode = 'loading' | 'title' | 'playing' | 'paused' | 'document' | 'bag' | 'ending' | 'error';
export interface View { mode: Mode; loading: number; room: number; objective: string; prompt: string; progress: number; message: string; document?: string; save: Save; settings: Settings; cloud: string; held?:PropId; error?: string; }
const SAVE_KEY='100gate.chapter1.save.v1', SETTINGS_KEY='100gate.settings.v1', TOKEN_KEY='100gate.save-token.v1';
function readLocal(key:string):unknown {try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function writeLocal(key:string,value:unknown) {try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
const API=(import.meta.env.VITE_SAVE_API as string|undefined)?.replace(/\/$/,'')||'';
export class Episode {
  private scene=new T.Scene(); private camera=new T.PerspectiveCamera(72,1,.055,100);
  private renderer:T.WebGLRenderer;private composer:EffectComposer;private bloom:UnrealBloomPass;
  private house?:House;private audio=new Foley();private keys=new Set<string>();private listeners:(()=>void)[]=[];
  private frame=0;private disposed=false;private last=0;private elapsed=0;private lastUI=0;private atmosphereTime=0;private redraw=true;
  private velocity=new T.Vector3();private position=new T.Vector3();private yaw=0;private pitch=-.23;private grounded=true;
  private target?:Target;private hold=0;private holdId='';private holdStarted=0;private ray=new T.Raycaster();private flashlight:T.SpotLight;
  private player:PlayerRig;private flashOn=false;private held?:PropId;private itemUntil=0;private useUntil=0;private reachUntil=0;
  private movement=new T.Vector2();
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
    const satchel=this.house.targets.find(t=>t.id==='bag')?.root.clone(true) as T.Group|undefined;
    if(satchel){satchel.position.set(0,-.078,0);satchel.rotation.set(.05,0,0);satchel.scale.setScalar(.60);this.player.registerModel('bag',satchel);}
    this.mode='title';this.loading=1;this.notify();
    // Probe is exposed only in local development and explicit automated verification builds.
    if(import.meta.env.DEV||import.meta.env.VITE_VERIFY==='1'){
      (window as unknown as Record<string,unknown>).__episodeTest={
        state:()=>({mode:this.mode,save:structuredClone(this.save),position:this.position.toArray(),yaw:this.yaw,pitch:this.pitch,grounded:this.grounded,target:this.target?.id,hold:this.hold,settings:{...this.settings},rig:this.player.state(),weather:this.house?.weather.snapshot()}),
        pose:(x:number,y:number,z:number,yaw=0,pitch=0)=>{this.position.set(x,y,z);this.yaw=yaw;this.pitch=pitch;this.velocity.set(0,0,0);this.movement.set(0,0);},
        aim:(id:string)=>{const t=this.house?.targets.find(t=>t.id===id);if(t){const point=new T.Box3().setFromObject(t.root).getCenter(new T.Vector3());this.camera.position.copy(this.position).add(new T.Vector3(0,1.68,0));const d=point.sub(this.camera.position);this.yaw=Math.atan2(-d.x,-d.z);this.pitch=Math.atan2(d.y,Math.hypot(d.x,d.z));}},
        targets:()=>this.house?.targets.map(t=>({id:t.id,kind:t.kind,pos:t.root.getWorldPosition(new T.Vector3()).toArray(),open:t.open,unlocked:t.unlocked})),
      };
    }
  }catch(e){if(!this.disposed){this.mode='error';this.message=String(e);this.notify();}}}
  private t(ru:string,en:string){return text(this.settings.language,ru,en);}
  private has(id:string){return this.save.items.includes(id);}
  private flag(id:string){return this.save.flags.includes(id);}
  private addFlag(id:string){if(!this.flag(id))this.save.flags.push(id);}
  private recoverPack(){if(this.save.room>0&&this.flag('free')&&!this.has('bag'))this.save.items.push('bag');}
  private equip(id?:PropId,seconds=0){this.held=id;this.itemUntil=seconds?this.elapsed+seconds:0;this.useUntil=0;if(id!=='flashlight')this.flashOn=false;}
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
    this.audio.play(id==='candy'?'paper':'drink');
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
      if(this.mode==='document'){if(e.code==='KeyF'){this.document=undefined;this.mode='playing';this.requestLock();this.notify();}return;}
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
    if(this.mode==='document'&&code==='KeyF'){this.document=undefined;this.mode='playing';this.requestLock();this.notify();return;}
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
    if(this.flag('free'))this.camera.position.copy(this.position).add(new T.Vector3(0,1.68,0));
    this.mode='playing';this.document=undefined;this.audio.setVolume(this.settings.volume);this.audio.start();this.requestLock();this.persist();this.notify();
  }
  pause(unlock=true){if(this.mode!=='playing'&&this.mode!=='document')return;this.prePause=this.mode;this.mode='paused';this.keys.clear();this.touchAxes={x:0,z:0};this.movement.set(0,0);this.hold=0;this.holdId='';this.audio.pause(true);if(unlock&&document.pointerLockElement)document.exitPointerLock();this.persist();this.notify();}
  resume(){if(this.mode!=='paused')return;this.mode=this.prePause;this.keys.clear();this.audio.pause(false);if(this.mode==='playing')this.requestLock();this.notify();}
  title(){this.persist();this.mode='title';this.keys.clear();this.audio.pause(true);if(document.pointerLockElement)document.exitPointerLock();this.notify();}
  settingsChange(next:Partial<Settings>){this.settings={...this.settings,...next};writeLocal(SETTINGS_KEY,this.settings);this.audio.setVolume(this.settings.volume);this.applyQuality();this.resize();this.notify();}
  private applyQuality(){const q=this.settings.quality;this.renderer.setPixelRatio(Math.min(devicePixelRatio,q==='high'?1.75:q==='medium'?1.2:.8));this.renderer.shadowMap.enabled=q!=='low';this.bloom.enabled=q==='high';this.flashlight.castShadow=q==='high';}
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
    if(!this.flag('free')){if(code==='KeyE'&&this.flag('chairTipped')&&!this.has('knife')){this.take(this.house.targets.find(t=>t.id==='knife')!);this.audio.play('key');}return;}
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
        t.unlocked=true;this.addFlag(`unlock:${t.id}`);this.reachUntil=this.elapsed+.35;this.audio.play('key');this.toast(this.t('Замок открыт. G — открыть дверь рукой.','Unlocked. Press G to open the door.'));this.persist();
      }else if(code==='KeyG'){
        if(!t.unlocked){this.toast(this.t('Заперто. Используй ключ клавишей E.','Locked. Use the key with E.'));this.audio.play('click');return;}
        if(t.id==='hatch'&&t.open&&this.position.x>1.8&&this.position.x<4.2&&this.position.z<-1&&this.position.z>-7){this.toast(this.t('Нельзя закрыть люк, стоя на лестнице.','Step off the stairs before closing the hatch.'));return;}
        if(t.id==='exit'){this.revealExit(t);return;}
        if(t.open&&t.id!=='hatch'&&Math.hypot(this.position.x-t.root.position.x,this.position.z-t.root.position.z)<.7){this.toast(this.t('Отойди от дверного проёма.','Step away from the doorway.'));return;}
        this.reachUntil=this.elapsed+.43;
        t.open=!t.open;this.save.doors=t.open?[...new Set([...this.save.doors,t.id])]:this.save.doors.filter(id=>id!==t.id);this.audio.play('door');this.persist();
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
  private take(t:Target){
    if(!this.has(t.id))this.save.items.push(t.id);
    t.root.visible=false;this.audio.play(t.id==='bag'?'scrape':'key');
    this.toast(t.id==='bag'?this.t('Сумка Алексея найдена. H — открыть.','Alexei’s bag recovered. H to open.'):this.t('Подобрано: ','Taken: ')+t.title[this.settings.language==='ru'?0:1]);
    if(t.id==='flashlight'){this.equip('flashlight');this.flashOn=true;}else if(t.id==='knife')this.equip('knife');else if(!this.held||this.itemUntil)this.equip(t.id==='bag'?'bag':t.id==='fuse'?'fuse':'key',1.25);
    this.reachUntil=this.elapsed+.36;this.target=undefined;this.persist();
  }
  private floorAt(x:number,z:number):number|undefined{
    if(this.house?.hatch.open&&x>2&&x<4&&z<=-1&&z>=-7)return Math.max(0,3.6*(z+7)/6);
    if(x>=-5.9&&x<=5.9&&z>=-4.9&&z<=4.9&&this.position.y>2.6)return 3.6;
    if(x>=-6.85&&x<=6.85&&z>=-35.85&&z<=-5.6)return 0;
    return undefined;
  }
  private blocked(x:number,z:number,feet:number,height:number){
    if(this.floorAt(x,z)===undefined)return true;
    return this.house!.colliders.some(c=>!c.disabled?.()&&feet<c.top-.08&&feet+height>c.bottom+.12&&x+.22>c.minX&&x-.22<c.maxX&&z+.22>c.minZ&&z-.22<c.maxZ&&(!c.touches||c.touches(x,z,.22)));
  }
  private findTarget(){
    this.target=undefined;if(!this.house||!this.flag('free'))return;
    if(this.keys.has('KeyR')&&this.holdId){const held=this.house.targets.find(t=>t.id===this.holdId&&t.kind==='furniture');if(held&&held.root.position.distanceTo(this.position)<3.8){this.target=held;return;}}
    this.camera.updateMatrixWorld();this.scene.updateMatrixWorld();this.ray.setFromCamera(new T.Vector2(0,0),this.camera);this.ray.far=2.7;
    const hits=this.ray.intersectObjects(this.scene.children,true);
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
    if(this.holdId!==id){this.hold=0;this.holdId=id;this.holdStarted=performance.now();this.audio.play(id==='cut'?'cut':'scrape');}
    this.hold=Math.min(1,(performance.now()-this.holdStarted)/1000/duration);
    if(id!=='tip'&&id!=='cut'){
      const t=this.target!;const previous=t.progress||0;const next=Math.max(previous,this.hold);const desired=t.home!.clone().addScaledVector(t.move!,next);
      // Never push a solid object into the player capsule.
      if(Math.hypot(desired.x-this.position.x,desired.z-this.position.z)>.95){t.progress=next;t.root.position.copy(desired);}else{this.hold=previous;this.toast(this.t('Отойди с пути шкафа.','Step out of the furniture’s path.'));return;}
    }
    if(this.hold>=1){
      if(id==='tip'){this.addFlag('chairTipped');this.pitch=-.95;this.audio.play('land');this.toast(this.t('Нож рядом с правой рукой. E — подобрать.','The knife is by your right hand. E to take it.'));}
      else if(id==='cut'){this.addFlag('free');this.position.set(.5,3.6,2);this.scene.traverse(o=>{if(o.name==='rope')o.visible=false;});this.audio.play('cut');this.equip();this.toast(this.t('Руки свободны. Сумка лежит рядом со стулом.','Your hands are free. Your bag is beside the chair.'));}
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
  private update(dt:number){
    if(!this.house)return;this.updateHold(dt);
    const beforeX=this.position.x,beforeZ=this.position.z;
    let crouch=false,run=false;
    if(this.flag('free')){
      crouch=this.keys.has('ShiftLeft');run=this.keys.has('ControlLeft')&&!crouch;
      let x=Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA'))+this.touchAxes.x,z=Number(this.keys.has('KeyW'))-Number(this.keys.has('KeyS'))+this.touchAxes.z;
      const len=Math.hypot(x,z);if(len>1){x/=len;z/=len;}
      const speed=crouch?1.25:run?4:2.35;
      const drive=this.grounded?(len>0?17:24):5.5;
      this.movement.x=T.MathUtils.damp(this.movement.x,(Math.cos(this.yaw)*x-Math.sin(this.yaw)*z)*speed,drive,dt);
      this.movement.y=T.MathUtils.damp(this.movement.y,(-Math.sin(this.yaw)*x-Math.cos(this.yaw)*z)*speed,drive,dt);
      const dx=this.movement.x*dt,dz=this.movement.y*dt;
      const height=crouch?1.04:1.68;
      // Axes separate for wall sliding; bounded dt prevents tunnelling through thin walls.
      if(!this.blocked(this.position.x+dx,this.position.z,this.position.y,height))this.position.x+=dx;else this.movement.x=0;
      if(!this.blocked(this.position.x,this.position.z+dz,this.position.y,height))this.position.z+=dz;else this.movement.y=0;
      const floor=this.floorAt(this.position.x,this.position.z)??this.position.y;
      if(this.grounded&&floor<=this.position.y+.24&&floor>=this.position.y-.3){this.position.y=floor;this.velocity.y=0;}
      else{this.grounded=false;this.velocity.y-=12*dt;this.position.y+=this.velocity.y*dt;if(this.position.y<=floor){if(this.velocity.y<-2)this.audio.play('land');this.position.y=floor;this.velocity.y=0;this.grounded=true;}}
      let ceiling=this.position.y>2.6?7.9-.42*Math.abs(this.position.x):2.9;
      if(this.position.y>2.6&&Math.abs(this.position.z-(-4.8+Math.round((this.position.z+4.8)/1.6)*1.6))<.24)ceiling=Math.min(ceiling,5.82);
      if(this.position.y+height>ceiling&&this.velocity.y>0){this.position.y=Math.max(floor,ceiling-height);this.velocity.y=0;this.grounded=false;}
      if(this.position.y<floor&&floor-this.position.y<.25)this.position.y=floor;
      const bob=this.settings.headBob&&this.grounded?Math.sin(this.elapsed*(run?19:13))*.018*Math.min(1,Math.hypot(this.position.x-beforeX,this.position.z-beforeZ)/dt):0;
      const targetY=this.position.y+height+bob;this.camera.position.set(this.position.x,T.MathUtils.damp(this.camera.position.y,targetY,14,dt),this.position.z);
      const room=this.roomAt();if(room!==this.save.room){this.save.room=room;this.persist();}
      if(this.elapsed-this.saveClock>8&&this.position.distanceToSquared(this.savedPosition)>.2){this.persist();this.saveClock=this.elapsed;}
    }else{
      const tipped=this.flag('chairTipped');const rock=this.holdId==='tip'?Math.sin(this.elapsed*9)*this.hold*.16:0;
      this.camera.position.set(tipped?.2:0,tipped?4.25:4.77,tipped?2.15:2.8);this.camera.rotation.z=tipped?-.15:rock;
    }
    if(this.flag('free'))this.camera.rotation.z=T.MathUtils.damp(this.camera.rotation.z,0,8,dt);
    this.camera.rotation.y=this.yaw;this.camera.rotation.x=this.pitch;
    if(this.itemUntil&&this.elapsed>=this.itemUntil)this.equip();
    if(this.player.update({position:this.position,yaw:this.yaw,pitch:this.pitch,dt,elapsed:this.elapsed,dx:this.position.x-beforeX,dz:this.position.z-beforeZ,grounded:this.grounded,crouch,free:this.flag('free'),tipped:this.flag('chairTipped'),running:run,hold:this.hold,activity:this.holdId,held:this.held,using:this.useUntil>this.elapsed?1-(this.useUntil-this.elapsed)/.93:0,reach:this.reachUntil>this.elapsed?1-(this.reachUntil-this.elapsed)/.43:0,water:remaining(this.save.flags,'water')}))this.audio.play('step');
    this.flashlight.intensity=this.flashOn&&this.held==='flashlight'?43:0;
    this.house.glow.intensity=this.flag('power')?16:0;
    for(const t of this.house.targets){if(t.kind==='door'&&t.pivot){const desired=t.open?(t.id==='hatch'?Math.PI:Number(t.pivot.userData.openAngle)):0;t.angle=T.MathUtils.damp(t.angle||0,desired,4,dt);if(t.id==='hatch')t.pivot.rotation.x=t.angle;else t.pivot.rotation.y=t.angle;}}
    this.house.dust.rotation.y=Math.sin(this.elapsed*.025)*.03;this.house.lamp.intensity=9+Math.sin(this.elapsed*1.4)*.25;
    this.findTarget();
  }
  private tick=(now:number)=>{
    if(this.disposed)return;const dt=Math.min(.085,this.last?(now-this.last)/1000:.016);this.last=now;
    if(this.mode==='playing'){this.elapsed+=dt;this.update(dt);}else if(this.mode==='title'&&this.house){
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
  dispose(){this.persist(false);this.disposed=true;cancelAnimationFrame(this.frame);clearTimeout(this.cloudTimer);for(const off of this.listeners)off();this.keys.clear();if(document.pointerLockElement===this.canvas)document.exitPointerLock();this.audio.dispose();this.releaseScene();this.composer.dispose();this.renderer.dispose();delete (window as unknown as Record<string,unknown>).__episodeTest;}
}
