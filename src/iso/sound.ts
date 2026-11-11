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
  dispose(){void this.context?.close();this.context=undefined;}
}
