import { cues } from './foley-cues';
import { chapterAsset } from './release';

const LEVELS={walk:.32,run:.47,paper:.32,keyPickup:.33,key:.31,chair:.31,chairFall:.56,eat:.37,gulp:.32,cap:.23,slosh:.18} as const;
type Recorded=keyof typeof cues;
type Procedural='step'|'key'|'door'|'paper'|'scrape'|'cut'|'click'|'land'|'drink'|'thunder';
type SampleOptions={gain?:number;pan?:number;rate?:number;delay?:number;room?:boolean};
export class Foley {
  context?: AudioContext;
  master?: GainNode;
  private noise?: AudioBuffer;
  private drone?: OscillatorNode;
  private ambience?: AudioBufferSourceNode;
  private active = false;
  private readonly abort=new AbortController();
  private readonly download=fetch(chapterAsset('assets/chapter1/foley-bank.wav'),{signal:this.abort.signal})
    .then(r=>r.ok?r.arrayBuffer():undefined).catch(()=>undefined);
  private bank?:AudioBuffer;
  private last=new Map<Recorded,number>();
  private counts:Partial<Record<Recorded,number>>={};
  volume = .65;
  start() {
    if (!this.context) {
      const WebAudio=window.AudioContext??(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
      if(!WebAudio)return;
      this.context = new WebAudio(); this.master = this.context.createGain(); this.master.connect(this.context.destination);
      const context=this.context;
      void this.download.then(async bytes=>{if(bytes&&context.state!=='closed')this.bank=await context.decodeAudioData(bytes);}).catch(()=>{});
      this.master.gain.value = this.volume;
      this.noise = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
      const data = this.noise.getChannelData(0); let last = 0;
      for (let i = 0; i < data.length; i++) { last = (last + (Math.random() * 2 - 1) * .04) / 1.025; data[i] = last * 3; }
      this.ambience = this.context.createBufferSource(); this.ambience.buffer = this.noise; this.ambience.loop = true;
      const low = this.context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 260;
      const gain = this.context.createGain(); gain.gain.value = .045;
      this.ambience.connect(low).connect(gain).connect(this.master); this.ambience.start();
      this.drone = this.context.createOscillator(); this.drone.frequency.value = 47;
      const hum = this.context.createGain(); hum.gain.value = .012; this.drone.connect(hum).connect(this.master); this.drone.start();
    }
    this.active = true; void this.context.resume();
  }
  pause(paused: boolean) { this.active = !paused; if (this.context) void (paused ? this.context.suspend() : this.context.resume()); }
  setVolume(v: number) { this.volume = v; if (this.master && this.context) this.master.gain.setTargetAtTime(v, this.context.currentTime, .08); }
  private sample(kind:Recorded,options:SampleOptions={}){
    const c=this.context,bank=this.bank,master=this.master;
    if(!this.active||!c||!bank||!master)return false;
    const variants=cues[kind],previous=this.last.get(kind);
    let i=Math.floor(Math.random()*variants.length);
    if(i===previous&&variants.length>1)i=(i+1+Math.floor(Math.random()*(variants.length-1)))%variants.length;
    this.last.set(kind,i);
    if(import.meta.env.DEV||import.meta.env.VITE_VERIFY==='1')this.counts[kind]=(this.counts[kind]??0)+1;
    const [offset,duration]=variants[i],s=c.createBufferSource(),gain=c.createGain();
    s.buffer=bank;s.playbackRate.value=(options.rate??1)*(.94+Math.random()*.12);
    gain.gain.value=LEVELS[kind]*(options.gain??1)*(.91+Math.random()*.18);
    s.connect(gain);
    if(typeof c.createStereoPanner==='function'){
      const stereo=c.createStereoPanner();stereo.pan.value=options.pan??0;gain.connect(stereo).connect(master);
    }else gain.connect(master);
    if(options.room){
      const reflection=c.createDelay(.12),wet=c.createGain(),damp=c.createBiquadFilter();
      reflection.delayTime.value=.031;damp.type='lowpass';damp.frequency.value=1600;wet.gain.value=.13;
      gain.connect(reflection).connect(damp).connect(wet).connect(master);
    }
    s.start(c.currentTime+(options.delay??0),offset,duration);
    return true;
  }
  step(running:boolean,crouched:boolean,left:boolean){
    if(!this.sample(running?'run':'walk',{gain:crouched?.54:1,pan:left?-.11:.11,rate:crouched?.89:1,room:true}))this.procedural('step');
  }
  rock(strength:number,side:number){if(!this.sample('chair',{gain:.48+strength*.66,pan:.12*side,rate:.91+strength*.2,room:true}))this.procedural('scrape');}
  consume(kind:'candy'|'water'){
    if(kind==='candy'){
      if(this.sample('paper',{gain:.56}))this.sample('eat',{delay:.30});
      else this.procedural('paper');
    }else if(this.sample('cap')){
      this.sample('slosh',{delay:.18,gain:.8});
      this.sample('gulp',{delay:.44});
    }else this.procedural('drink');
  }
  state(){return {ready:!!this.bank,recorded:{...this.counts}};}
  play(kind:Procedural|'keyPickup'|'chairFall'){
    if(kind==='keyPickup'||kind==='key'||kind==='paper'||kind==='chairFall'){
      const options=kind==='keyPickup'?{pan:.12}:kind==='chairFall'?{room:true,delay:.14}:undefined;
      if(this.sample(kind,options))return;
    }
    this.procedural(kind==='keyPickup'?'key':kind==='chairFall'?'land':kind);
  }
  private procedural(kind:Procedural) {
    if (!this.active || !this.context || !this.master || !this.noise) return;
    const c = this.context; const now = c.currentTime;
    const source = c.createBufferSource(); source.buffer = this.noise;
    const filter = c.createBiquadFilter(); filter.type = kind === 'key' ? 'highpass' : 'lowpass';
    filter.frequency.value = { step: 480, key: 2200, door: 260, paper: 3500, scrape: 650, cut: 1600, click: 1800, land: 160, drink:410, thunder:125 }[kind];
    const gain = c.createGain(); const duration = { step: .16, key: .4, door: 1.1, paper: .35, scrape: .7, cut: .5, click: .06, land: .3, drink:.47, thunder:1.65 }[kind];
    gain.gain.setValueAtTime(.001, now); gain.gain.linearRampToValueAtTime(kind === 'scrape' ? .55 : .32, now + .02); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    source.connect(filter).connect(gain).connect(this.master); source.start(now, Math.random()); source.stop(now + duration);
    if (kind === 'door' || kind === 'key') {
      const osc = c.createOscillator(); const g = c.createGain(); osc.type = 'triangle'; osc.frequency.setValueAtTime(kind === 'door' ? 130 : 1900, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'door' ? 53 : 900, now + duration); g.gain.setValueAtTime(.045, now); g.gain.exponentialRampToValueAtTime(.001, now + duration);
      osc.connect(g).connect(this.master); osc.start(); osc.stop(now + duration);
    }
  }
  dispose() { this.abort.abort();this.ambience?.stop(); this.drone?.stop(); void this.context?.close(); }
}
