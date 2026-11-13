import type {Settings} from './contracts';

/** Original low-band room tone and restrained, action-driven mechanical Foley. */
export class IsoSound {
  private context?:AudioContext;
  private master?:GainNode;
  private room?:GainNode;
  private hum?:GainNode;
  private roomSource?:AudioBufferSourceNode;
  private transformer?:OscillatorNode;
  private texture?:AudioBuffer;
  private stepIndex=0;
  async unlock(){
    if(!this.context){
      const ctx=this.context=new AudioContext();
      this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);
      this.room=ctx.createGain();this.room.gain.value=0;this.room.connect(this.master);
      this.hum=ctx.createGain();this.hum.gain.value=0;this.hum.connect(this.room);
      this.transformer=ctx.createOscillator();this.transformer.type='triangle';this.transformer.frequency.value=50;
      this.transformer.connect(this.hum);this.transformer.start();
      this.texture=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
      const n=this.texture.getChannelData(0);
      for(let i=0;i<n.length;i++)n[i]=Math.random()*2-1;
      this.roomSource=ctx.createBufferSource();this.roomSource.buffer=this.texture;this.roomSource.loop=true;
      const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=136;
      const air=ctx.createGain();air.gain.value=.05;this.roomSource.connect(low).connect(air).connect(this.room);
      this.roomSource.start();
    }
    if(this.context.state==='suspended')await this.context.resume();
  }
  mix(s:Settings,{paused,power,menu}:{paused:boolean;power:boolean;menu:boolean}){
    if(!this.context||!this.master||!this.room||!this.hum)return;
    const t=this.context.currentTime;
    this.master.gain.setTargetAtTime(s.volume,t,.035);
    this.room.gain.setTargetAtTime(paused?0:s.ambience,t,.09);
    this.hum.gain.setTargetAtTime(menu?.024:power?.034:.008,t,.12);
  }
  /** Metal clinks of a key ring: count, pitch, brightness and decay all follow `loudness` (0..1) and chance. */
  jingle(loudness:number,s:Settings){
    const ctx=this.context,master=this.master;
    if(!ctx||ctx.state!=='running'||!master||loudness<=.01)return;
    const clinks=1+Math.floor(loudness*loudness*5*Math.random()+loudness*1.4);
    let at=ctx.currentTime;
    for(let i=0;i<clinks;i++){
      const base=2300+Math.random()*2100,hit=Math.min(1,loudness*(.55+Math.random()*.6));
      const decay=.07+.14*Math.random()+hit*.1;
      // Inharmonic partials of a small brass/steel body, higher ones die faster.
      for(const [ratio,level,fade] of [[1,1,1],[2.76,.55,.6],[5.4,.3,.35],[8.93,.16,.2]] as const){
        const osc=ctx.createOscillator();osc.type='sine';osc.frequency.value=base*ratio*(1+(Math.random()-.5)*.012);
        const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,at);
        gain.gain.linearRampToValueAtTime(.0001+.05*hit*level*s.effects,at+.002);
        gain.gain.exponentialRampToValueAtTime(.0001,at+decay*fade+.02);
        osc.connect(gain).connect(master);osc.start(at);osc.stop(at+decay+.05);
        osc.onended=()=>{osc.disconnect();gain.disconnect();};
      }
      if(this.texture){// the short contact tick
        const src=ctx.createBufferSource();src.buffer=this.texture;
        const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=3800;
        const g=ctx.createGain();g.gain.setValueAtTime(.0001+.03*hit*s.effects,at);g.gain.exponentialRampToValueAtTime(.0001,at+.018);
        src.connect(f).connect(g).connect(master);src.start(at,Math.random()*.9,.03);
        src.onended=()=>{src.disconnect();f.disconnect();g.disconnect();};
      }
      at+=.03+Math.random()*.1*(1.4-loudness);
    }
  }
  cue(kind:'step'|'switch'|'door'|'tape'|'ui'|'phone',s:Settings,energy=1){
    const ctx=this.context,texture=this.texture,master=this.master;
    if(!ctx||ctx.state!=='running'||!texture||!master)return;
    const spec={
      step:[.12*(1.1-.2*Math.min(1.4,energy)),(175+(this.stepIndex++%2)*48)*(.9+Math.random()*.22),.11*energy],
      switch:[.075,1250,.075],door:[.46,266,.09],tape:[.29,1130,.045],ui:[.05,1560,.04],phone:[.32,710,.08],
    }[kind]!;
    const [length,frequency,peak]=spec as [number,number,number],t=ctx.currentTime;
    const source=ctx.createBufferSource();source.buffer=texture;
    const filter=ctx.createBiquadFilter();filter.type=kind==='step'?'lowpass':'bandpass';filter.frequency.value=frequency;filter.Q.value=kind==='phone'?14:1.1;
    const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,t);
    gain.gain.linearRampToValueAtTime(.0001+peak*(kind==='ui'?s.ui:s.effects),t+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,t+length);
    source.connect(filter).connect(gain).connect(master);source.start(t,Math.random()*.9,length+.02);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  private introBus?:GainNode;
  /** The sound of the opening, scheduled against the audio clock so it stays in step with the picture (30 s, see intro.ts). */
  intro(s:Settings,from=0,crash=12.1){
    const C=crash;
    const ctx=this.context,master=this.master,tex=this.texture;
    if(!ctx||!master||!tex)return;
    this.stopIntro();
    const bus=this.introBus=ctx.createGain();bus.gain.value=Math.max(.05,s.effects*1.3);bus.connect(master);
    const t0=ctx.currentTime-from,at=(t:number)=>Math.max(ctx.currentTime,t0+t);
    const noise=(start:number,len:number,type:BiquadFilterType,f0:number,f1:number,q:number,gain:(g:GainNode)=>void)=>{
      if(start+len<ctx.currentTime)return;
      const src=ctx.createBufferSource();src.buffer=tex;src.loop=true;
      const fl=ctx.createBiquadFilter();fl.type=type;fl.Q.value=q;fl.frequency.setValueAtTime(f0,at(start));fl.frequency.linearRampToValueAtTime(f1,at(start+len));
      const g=ctx.createGain();g.gain.value=0;gain(g);src.connect(fl).connect(g).connect(bus);
      src.start(at(start),Math.random()*1.5);src.stop(at(start+len+.1));
    };
    const tone=(type:OscillatorType,f0:number,f1:number,start:number,len:number,gain:(g:GainNode)=>void,lp=0)=>{
      if(start+len<ctx.currentTime)return;
      const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,at(start));o.frequency.linearRampToValueAtTime(f1,at(start+len));
      const g=ctx.createGain();g.gain.value=0;gain(g);
      if(lp){const fl=ctx.createBiquadFilter();fl.type='lowpass';fl.frequency.value=lp;o.connect(fl).connect(g);}else o.connect(g);
      g.connect(bus);o.start(at(start));o.stop(at(start+len+.1));
    };
    const env=(pts:[number,number][])=>(g:GainNode)=>{g.gain.setValueAtTime(0,at(pts[0]![0]));for(const [t,v] of pts)g.gain.linearRampToValueAtTime(v,at(t));};
    // the drive: engine, road, the tyres screaming when it brakes
    tone('sawtooth',46,54,0,C-1.1,env([[0,0],[1.2,.09],[C-1.1,.12]]),240);
    tone('sawtooth',54,40,C-1.1,1.5,env([[C-1.1,.12],[C-.05,.1],[C+.05,0]]),240);
    tone('triangle',92,108,0,C-1.1,env([[0,0],[1.2,.035],[C-1.1,.05]]),400);
    noise(0,C+.1,'lowpass',700,900,.7,env([[0,0],[1.4,.07],[11,.1],[C,.1],[C+.1,0]]));
    noise(C-1.1,1.55,'bandpass',1900,1150,9,env([[C-1.1,0],[C-.6,.12],[C-.1,.14],[C+.02,0]]));
    // the impact: a blow, glass, then everything stops
    noise(C,.7,'lowpass',2600,300,.5,env([[C,.0],[C+.02,.95],[C+.7,0]]));
    tone('sine',70,28,C,.9,env([[C,0],[C+.03,.9],[C+.9,0]]));
    for(let i=0;i<9;i++)noise(C+.1+i*.05+Math.random()*.1,.12,'highpass',5200,6500,.6,env([[C+.1+i*.05,0],[C+.12+i*.05,.16],[C+.22+i*.05,0]]));
    // the ringing in the ears, fading while the heart beats
    tone('sine',3150,3100,C+.1,8.5,env([[C+.1,0],[C+.2,.075],[16,.05],[21.2,0]]));
    tone('sine',4210,4180,C+.1,6,env([[C+.1,0],[C+.2,.03],[17,.012],[18.7,0]]));
    for(let k=0;k<7;k++){const b=C+.9+k*.92,v=.34*(1-k*.08);
      tone('sine',60,38,b,.2,env([[b,0],[b+.03,v],[b+.18,0]]));tone('sine',52,34,b+.26,.2,env([[b+.26,0],[b+.29,v*.7],[b+.44,0]]));}
    // the forest at night, muffled at first
    noise(15.6,14.5,'bandpass',420,700,.7,env([[15.6,0],[19,.035],[28.5,.05],[30,0]]));
    noise(15.8,14,'highpass',4500,5200,.5,env([[15.8,0],[20,.008],[29,.01],[30,0]]));
    // the door, the steps along the car
    tone('sawtooth',170,255,19.35,.9,env([[19.35,0],[19.6,.05],[20.1,.04],[20.25,0]]),600);
    const step=(t:number,v:number)=>noise(t,.2,'lowpass',2600,900,.9,env([[t,0],[t+.015,v],[t+.2,0]]));
    for(let t=20;t<22.7;t+=.56)step(t,.2);
    // the trunk: latch, hinge, the bag
    noise(22.7,.08,'bandpass',3200,3200,3,env([[22.7,0],[22.72,.2],[22.78,0]]));
    tone('sawtooth',130,330,22.85,1.5,env([[22.85,0],[23.3,.045],[24.2,.05],[24.4,0]]),500);
    noise(24.3,1.25,'bandpass',3000,2200,1.2,env([[24.3,0],[24.45,.07],[24.7,.02],[24.9,.09],[25.2,.03],[25.55,0]]));
    tone('sine',90,50,25.05,.25,env([[25.05,0],[25.07,.2],[25.3,0]]));
    for(let t=26.6;t<29.3;t+=.52)step(t,.2);
    bus.gain.setValueAtTime(bus.gain.value,at(28.8));bus.gain.linearRampToValueAtTime(0,at(30));
  }
  stopIntro(){
    const bus=this.introBus,ctx=this.context;
    if(!bus||!ctx)return;
    bus.gain.cancelScheduledValues(ctx.currentTime);bus.gain.setTargetAtTime(0,ctx.currentTime,.05);
    window.setTimeout(()=>bus.disconnect(),600);this.introBus=undefined;
  }
  /** The camera switches on: two short tones. */
  camOn(s:Settings){
    const ctx=this.context,master=this.master;
    if(!ctx||!master)return;
    [[1100,0],[1650,.13]].forEach(([f,d])=>{
      const o=ctx.createOscillator(),g=ctx.createGain();o.type='square';o.frequency.value=f!;
      const t=ctx.currentTime+d!;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05*s.ui,t+.01);g.gain.linearRampToValueAtTime(0,t+.09);
      o.connect(g).connect(master);o.start(t);o.stop(t+.12);
    });
  }
  dispose(){void this.context?.close();this.context=undefined;}
}
