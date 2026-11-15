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
  /**
   * The old telephone: the dial is pulled round (ratchet ticks), runs back on its governor (a dry rattle, the finger-wheel ticks), the line clicks,
   * and the exchange answers with the three rising tones of an error message and a short busy signal. Synthesised; about 3.9 s.
   */
  phoneCall(s:Settings){
    const ctx=this.context,master=this.master,tex=this.texture;
    if(!ctx||!master||!tex)return;
    const t0=ctx.currentTime+.03,g0=ctx.createGain();g0.gain.value=Math.max(.05,s.effects*1.15);g0.connect(master);
    const click=(t:number,v:number,f=2600,len=.02)=>{
      const src=ctx.createBufferSource();src.buffer=tex;const fl=ctx.createBiquadFilter();fl.type='bandpass';fl.frequency.value=f;fl.Q.value=4;
      const g=ctx.createGain();g.gain.setValueAtTime(0,t0+t);g.gain.linearRampToValueAtTime(v,t0+t+.002);g.gain.exponentialRampToValueAtTime(.0008,t0+t+len);
      src.connect(fl).connect(g).connect(g0);src.start(t0+t,Math.random()*1.5);src.stop(t0+t+len+.02);
    };
    // pulled round: ticks of the ratchet, spacing grows as the finger slows
    for(let i=0;i<19;i++)click(i*.05+i*i*.0012,.16+.03*Math.random(),1800+i*45,.018);
    // the stop
    click(1.12,.3,900,.05);
    // running back: the governor's rattle and the ticks of the pulse contact
    {
      const src=ctx.createBufferSource();src.buffer=tex;src.loop=true;const lp=ctx.createBiquadFilter();lp.type='bandpass';lp.frequency.value=1500;lp.Q.value=1.2;
      const g=ctx.createGain();g.gain.setValueAtTime(0,t0+1.34);g.gain.linearRampToValueAtTime(.09,t0+1.45);g.gain.setValueAtTime(.09,t0+2.4);g.gain.linearRampToValueAtTime(0,t0+2.56);
      const lfo=ctx.createOscillator();lfo.frequency.value=34;const lg=ctx.createGain();lg.gain.value=.06;lfo.connect(lg).connect(g.gain);
      src.connect(lp).connect(g).connect(g0);src.start(t0+1.34);src.stop(t0+2.6);lfo.start(t0+1.34);lfo.stop(t0+2.6);
    }
    for(let i=0;i<12;i++)click(1.4+i*.095,.07,3400,.012);
    click(2.58,.22,1200,.04);
    // the exchange answers: three rising tones, then the busy signal
    const tone=(t:number,len:number,f:number,v:number)=>{
      const o=ctx.createOscillator();o.type='sine';o.frequency.value=f;const g=ctx.createGain();
      g.gain.setValueAtTime(0,t0+t);g.gain.linearRampToValueAtTime(v,t0+t+.012);g.gain.setValueAtTime(v,t0+t+len-.012);g.gain.linearRampToValueAtTime(0,t0+t+len);
      const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3200;
      o.connect(lp).connect(g).connect(g0);o.start(t0+t);o.stop(t0+t+len+.02);
    };
    tone(2.85,.3,914,.1);tone(3.15,.3,1371,.1);tone(3.45,.3,1777,.1);
    tone(3.9,.3,425,.09);tone(4.35,.3,425,.09);tone(4.8,.3,425,.09);
    window.setTimeout(()=>g0.disconnect(),6200);
  }
  /** The lens of the camera: a small motor whirs and the focus ring clicks as the zoom goes in (dir 1) or out (-1). */
  zoom(s:Settings,dir:1|-1){
    const ctx=this.context,master=this.master,tex=this.texture;
    if(!ctx||!master||!tex)return;
    const t=ctx.currentTime+.01,len=dir>0?.5:.42,g0=ctx.createGain();g0.gain.value=Math.max(.03,s.ui*.9);g0.connect(master);
    const o=ctx.createOscillator();o.type='sawtooth';
    const f0=dir>0?190:470,f1=dir>0?470:180;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+len);
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1300;
    const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05,t+.05);g.gain.setValueAtTime(.05,t+len-.06);g.gain.linearRampToValueAtTime(0,t+len);
    o.connect(lp).connect(g).connect(g0);o.start(t);o.stop(t+len+.02);
    const n=ctx.createBufferSource();n.buffer=tex;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=2400;bp.Q.value=2.4;
    const ng=ctx.createGain();ng.gain.setValueAtTime(0,t);ng.gain.linearRampToValueAtTime(.025,t+.06);ng.gain.linearRampToValueAtTime(0,t+len);
    n.connect(bp).connect(ng).connect(g0);n.start(t,Math.random());n.stop(t+len+.02);
    // the focus ring settles with a soft click
    const c=ctx.createBufferSource();c.buffer=tex;const cf=ctx.createBiquadFilter();cf.type='bandpass';cf.frequency.value=3100;cf.Q.value=5;
    const cg=ctx.createGain();cg.gain.setValueAtTime(0,t+len);cg.gain.linearRampToValueAtTime(.12,t+len+.003);cg.gain.exponentialRampToValueAtTime(.001,t+len+.04);
    c.connect(cf).connect(cg).connect(g0);c.start(t+len,Math.random());c.stop(t+len+.06);
    window.setTimeout(()=>g0.disconnect(),1200);
  }
  /** A breaker lever thrown: a metal clack and a short spring ring; when the order is wrong the protection trips (a dull thud and a buzz). */
  lever(s:Settings,ok:boolean){
    const ctx=this.context,master=this.master,tex=this.texture;
    if(!ctx||!master||!tex)return;
    const t=ctx.currentTime+.005,g0=ctx.createGain();g0.gain.value=Math.max(.05,s.effects*1.2);g0.connect(master);
    const burst=(at:number,f:number,q:number,v:number,len:number)=>{
      const n=ctx.createBufferSource();n.buffer=tex;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;
      const g=ctx.createGain();g.gain.setValueAtTime(0,t+at);g.gain.linearRampToValueAtTime(v,t+at+.002);g.gain.exponentialRampToValueAtTime(.0008,t+at+len);
      n.connect(bp).connect(g).connect(g0);n.start(t+at,Math.random()*1.5);n.stop(t+at+len+.02);
    };
    const thump=(at:number,f0:number,f1:number,v:number,len:number)=>{
      const o=ctx.createOscillator();o.type='sine';o.frequency.setValueAtTime(f0,t+at);o.frequency.exponentialRampToValueAtTime(f1,t+at+len);
      const g=ctx.createGain();g.gain.setValueAtTime(0,t+at);g.gain.linearRampToValueAtTime(v,t+at+.004);g.gain.exponentialRampToValueAtTime(.001,t+at+len);o.connect(g).connect(g0);o.start(t+at);o.stop(t+at+len+.02);
    };
    if(ok){
      burst(0,2100,3,.5,.05);burst(.09,3400,6,.32,.03);thump(.01,150,60,.5,.12);thump(.1,240,110,.25,.08);
      // the spring of the contact rings
      const o=ctx.createOscillator();o.type='triangle';o.frequency.value=2350;const g=ctx.createGain();g.gain.setValueAtTime(0,t+.01);g.gain.linearRampToValueAtTime(.05,t+.012);g.gain.exponentialRampToValueAtTime(.0005,t+.35);o.connect(g).connect(g0);o.start(t+.01);o.stop(t+.4);
    }else{
      burst(0,900,1.5,.6,.12);thump(0,110,40,.8,.3);
      const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=100;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=500;
      const g=ctx.createGain();g.gain.setValueAtTime(0,t+.05);g.gain.linearRampToValueAtTime(.12,t+.08);g.gain.exponentialRampToValueAtTime(.001,t+.7);o.connect(lp).connect(g).connect(g0);o.start(t+.05);o.stop(t+.75);
    }
    window.setTimeout(()=>g0.disconnect(),1200);
  }
  private crank?:{src:AudioBufferSourceNode;bp:BiquadFilterNode;g:GainNode;lfo:OscillatorNode;lg:GainNode;sq:OscillatorNode;sg:GainNode;out:GainNode};
  /** The rusty knife switch being turned by hand: a gritty scrape and a ratchet that quicken with the effort, a groan of the metal on top. */
  crankStart(s:Settings){
    const ctx=this.context,master=this.master,tex=this.texture;
    if(!ctx||!master||!tex)return;
    this.crankStop(0);
    const out=ctx.createGain();out.gain.value=0;out.connect(master);
    const src=ctx.createBufferSource();src.buffer=tex;src.loop=true;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=900;bp.Q.value=1.6;
    const g=ctx.createGain();g.gain.value=.12;
    const lfo=ctx.createOscillator();lfo.type='square';lfo.frequency.value=5;const lg=ctx.createGain();lg.gain.value=.1;lfo.connect(lg).connect(g.gain);   // the ratchet
    const sq=ctx.createOscillator();sq.type='sawtooth';sq.frequency.value=150;const sg=ctx.createGain();sg.gain.value=.018;                                 // the groan
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=700;sq.connect(lp).connect(sg).connect(out);
    src.connect(bp).connect(g).connect(out);src.start();lfo.start();sq.start();
    out.gain.linearRampToValueAtTime(Math.max(.05,s.effects*1.3),ctx.currentTime+.12);
    this.crank={src,bp,g,lfo,lg,sq,sg,out};
  }
  crankProgress(p:number){
    const c=this.crank,ctx=this.context;if(!c||!ctx)return;
    const t=ctx.currentTime;
    c.lfo.frequency.setTargetAtTime(4+p*9,t,.1);c.bp.frequency.setTargetAtTime(750+p*1100,t,.1);
    c.sq.frequency.setTargetAtTime(110+p*160+Math.sin(t*3)*6,t,.08);c.sg.gain.setTargetAtTime(.012+.03*Math.sin(p*3.14),t,.1);
  }
  /** let go or done: the scrape dies down; when the switch reaches the end (p = 1) there is a heavy clunk */
  crankStop(p:number){
    const c=this.crank,ctx=this.context,master=this.master,tex=this.texture;
    if(c&&ctx){c.out.gain.cancelScheduledValues(ctx.currentTime);c.out.gain.setTargetAtTime(0,ctx.currentTime,.07);window.setTimeout(()=>{try{c.src.stop();c.lfo.stop();c.sq.stop();c.out.disconnect();}catch{/* stopped */}},500);this.crank=undefined;}
    if(p>=1&&ctx&&master&&tex){
      const t=ctx.currentTime,o=ctx.createOscillator();o.type='sine';o.frequency.setValueAtTime(95,t);o.frequency.exponentialRampToValueAtTime(34,t+.35);
      const g=ctx.createGain();g.gain.setValueAtTime(.9,t);g.gain.exponentialRampToValueAtTime(.001,t+.45);o.connect(g).connect(master);o.start(t);o.stop(t+.5);
      const n=ctx.createBufferSource();n.buffer=tex;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=1600;bp.Q.value=2;const ng=ctx.createGain();ng.gain.setValueAtTime(.5,t);ng.gain.exponentialRampToValueAtTime(.001,t+.12);
      n.connect(bp).connect(ng).connect(master);n.start(t,Math.random());n.stop(t+.2);
    }
  }
  /** The current reaches the lines: a deep hum swells, relays click, the lamps tick on and buzz for a moment. */
  powerOn(s:Settings){
    const ctx=this.context,master=this.master,tex=this.texture;
    if(!ctx||!master||!tex)return;
    const t=ctx.currentTime+.05,g0=ctx.createGain();g0.gain.value=Math.max(.05,s.effects*1.1);g0.connect(master);
    const hum=ctx.createOscillator();hum.type='sawtooth';hum.frequency.setValueAtTime(40,t);hum.frequency.linearRampToValueAtTime(50,t+1.2);
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=240;const hg=ctx.createGain();hg.gain.setValueAtTime(0,t);hg.gain.linearRampToValueAtTime(.18,t+.9);hg.gain.linearRampToValueAtTime(0,t+3.2);
    hum.connect(lp).connect(hg).connect(g0);hum.start(t);hum.stop(t+3.3);
    const tick=(at:number,v:number)=>{const n=ctx.createBufferSource();n.buffer=tex;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=2800;bp.Q.value=4;
      const g=ctx.createGain();g.gain.setValueAtTime(0,t+at);g.gain.linearRampToValueAtTime(v,t+at+.002);g.gain.exponentialRampToValueAtTime(.0008,t+at+.03);n.connect(bp).connect(g).connect(g0);n.start(t+at,Math.random()*1.5);n.stop(t+at+.05);};
    [.5,.62,.8,1.05,1.2,1.5,1.62,1.95].forEach((a,i)=>tick(a,.18+.05*(i%3)));
    // fluorescent buzz while the lamps strike
    const buzz=ctx.createOscillator();buzz.type='square';buzz.frequency.value=100;const bl=ctx.createBiquadFilter();bl.type='bandpass';bl.frequency.value=1400;bl.Q.value=2;
    const bg=ctx.createGain();bg.gain.setValueAtTime(0,t+.5);bg.gain.linearRampToValueAtTime(.04,t+.6);bg.gain.setValueAtTime(.04,t+1.8);bg.gain.linearRampToValueAtTime(.007,t+2.4);bg.gain.linearRampToValueAtTime(0,t+4);
    buzz.connect(bl).connect(bg).connect(g0);buzz.start(t+.5);buzz.stop(t+4.1);
    window.setTimeout(()=>g0.disconnect(),5200);
  }
  private introBus?:GainNode;
  private introBuf:Record<string,AudioBuffer>={};
  /** Real recordings for the opening (CC0, OpenGameArt; see CREDITS.md): loaded once, decoded, kept. Missing files fall back to the synthesized sounds. */
  async prepareIntroAudio(base=''){
    const ctx=this.context;
    if(!ctx)return;
    await Promise.all(['rain','engine','crash','heart','gravel','dooropen','doorclose'].map(async n=>{
      if(this.introBuf[n])return;
      try{const r=await fetch(`${base}assets/iso/trailer-audio/${n}.mp3`);if(!r.ok)return;this.introBuf[n]=await ctx.decodeAudioData(await r.arrayBuffer());}catch{/* keep the synthesized fallback */}
    }));
  }
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
    const B=this.introBuf;
    /** play a recording: when, gain, rate, optional loop until `until`, filter, slice of the file */
    const sample=(name:string,when:number,gain:number,opt:{rate?:number;until?:number;lp?:number;hp?:number;offset?:number;dur?:number;fadeIn?:number;fadeOut?:number}={})=>{
      const buf=B[name];if(!buf)return false;
      const end=opt.until??when+(opt.dur??buf.duration)/(opt.rate??1);
      if(end<ctx.currentTime-t0)return true;
      const src=ctx.createBufferSource();src.buffer=buf;src.playbackRate.value=opt.rate??1;
      if(opt.until!==undefined)src.loop=true;
      const g=ctx.createGain();g.gain.setValueAtTime(0,at(when));
      g.gain.linearRampToValueAtTime(gain,at(when+(opt.fadeIn??.02)));
      g.gain.setValueAtTime(gain,at(Math.max(when+.03,end-(opt.fadeOut??.05))));g.gain.linearRampToValueAtTime(0,at(end));
      let node:AudioNode=src;
      if(opt.lp){const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=opt.lp;node.connect(f);node=f;}
      if(opt.hp){const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=opt.hp;node.connect(f);node=f;}
      node.connect(g).connect(bus);
      src.start(at(when),opt.offset??0,opt.until!==undefined?undefined:opt.dur);src.stop(at(end)+.05);
      return true;
    };
    // the rain: all the way through, muffled by the roof while we are in the car, open air after we get out
    sample('rain',0,.85,{until:19.6,lp:2600,fadeIn:1.5,fadeOut:.6});
    sample('rain',19.5,1.1,{until:30,fadeIn:1.2,fadeOut:1.2});
    // the engine, a real recording slowed down and darkened, the revs follow the braking
    sample('engine',0.3,.42,{rate:.58,until:C-.1,lp:520,fadeIn:1.2,fadeOut:.12});
    // the drive: engine, road, the tyres screaming when it brakes
    tone('sawtooth',46,54,0,C-1.1,env([[0,0],[1.2,.09],[C-1.1,.12]]),240);
    tone('sawtooth',54,40,C-1.1,1.5,env([[C-1.1,.12],[C-.05,.1],[C+.05,0]]),240);
    tone('triangle',92,108,0,C-1.1,env([[0,0],[1.2,.035],[C-1.1,.05]]),400);
    noise(0,C+.1,'lowpass',700,900,.7,env([[0,0],[1.4,.07],[11,.1],[C,.1],[C+.1,0]]));
    noise(C-1.1,1.55,'bandpass',1900,1150,9,env([[C-1.1,0],[C-.6,.12],[C-.1,.14],[C+.02,0]]));
    // the impact: a blow, glass, then everything stops
    if(!sample('crash',C,.85,{fadeOut:.4})){
    noise(C,.7,'lowpass',2600,300,.5,env([[C,.0],[C+.02,.95],[C+.7,0]]));
    tone('sine',70,28,C,.9,env([[C,0],[C+.03,.9],[C+.9,0]]));
    }
    tone('sine',62,30,C,1.1,env([[C,0],[C+.03,.5],[C+1.1,0]]));
    if(!B.crash)for(let i=0;i<9;i++)noise(C+.1+i*.05+Math.random()*.1,.12,'highpass',5200,6500,.6,env([[C+.1+i*.05,0],[C+.12+i*.05,.16],[C+.22+i*.05,0]]));
    // the ringing in the ears, fading while the heart beats
    tone('sine',3150,3100,C+.1,8.5,env([[C+.1,0],[C+.2,.075],[16,.05],[21.2,0]]));
    tone('sine',4210,4180,C+.1,6,env([[C+.1,0],[C+.2,.03],[17,.012],[18.7,0]]));
    for(let k=0;k<(B.heart?0:7);k++){const b=C+.9+k*.92,v=.34*(1-k*.08);
      tone('sine',60,38,b,.2,env([[b,0],[b+.03,v],[b+.18,0]]));tone('sine',52,34,b+.26,.2,env([[b+.26,0],[b+.29,v*.7],[b+.44,0]]));}
    sample('heart',C+.9,2.4,{until:19.4,fadeIn:.6,fadeOut:1.2,lp:900});
    // the forest at night, muffled at first
    noise(15.6,14.5,'bandpass',420,700,.7,env([[15.6,0],[19,.035],[28.5,.05],[30,0]]));
    noise(15.8,14,'highpass',4500,5200,.5,env([[15.8,0],[20,.008],[29,.01],[30,0]]));
    // the door, the steps along the car
    if(!sample('dooropen',19.3,.75,{lp:3500}))tone('sawtooth',170,255,19.35,.9,env([[19.35,0],[19.6,.05],[20.1,.04],[20.25,0]]),600);
    let stepN=0;
    const step=(t:number,v:number)=>{const k=stepN++;if(!sample('gravel',t,2.0+.7*Math.random(),{rate:.92+.16*Math.random(),offset:(k%2)*.34,dur:.32,fadeIn:.004,fadeOut:.1}))noise(t,.2,'lowpass',2600,900,.9,env([[t,0],[t+.015,v],[t+.2,0]]));};
    for(let t=20;t<22.7;t+=.56)step(t,.2);
    // the trunk: latch, hinge, the bag
    noise(22.7,.08,'bandpass',3200,3200,3,env([[22.7,0],[22.72,.2],[22.78,0]]));
    sample('dooropen',22.8,.7,{rate:.62,lp:2200});
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
