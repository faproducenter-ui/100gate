import type {Settings} from './data';

/** Original, low-level room design. No audio before a player gesture. */
export class KitchenAudio{
  private ctx?:AudioContext;
  private master?:GainNode;
  private room?:GainNode;
  private ui?:GainNode;
  private noise?:AudioBuffer;
  private next?:ReturnType<typeof setTimeout>;
  private suspended=false;
  unlock(settings:Settings){
    if(!this.ctx){
      if(!window.AudioContext)return;
      const c=this.ctx=new AudioContext();
      this.master=c.createGain();this.room=c.createGain();this.ui=c.createGain();
      this.room.connect(this.master);this.ui.connect(this.master);this.master.connect(c.destination);
      const noise=this.noise=c.createBuffer(1,c.sampleRate*5,c.sampleRate),d=noise.getChannelData(0);
      let slow=0;for(let i=0;i<d.length;i++){slow=slow*.988+(.5-Math.random())*.06;d[i]=slow;}
      const wind=c.createBufferSource(),lp=c.createBiquadFilter(),windGain=c.createGain();
      wind.buffer=noise;wind.loop=true;lp.type='lowpass';lp.frequency.value=360;windGain.gain.value=.10;
      wind.connect(lp).connect(windGain).connect(this.room);wind.start();
      const hum=c.createOscillator(),humGain=c.createGain();
      hum.type='triangle';hum.frequency.value=50;humGain.gain.value=.022;
      hum.connect(humGain).connect(this.room);hum.start();
      const lfo=c.createOscillator(),depth=c.createGain();
      lfo.frequency.value=.11;depth.gain.value=.045;lfo.connect(depth).connect(windGain.gain);lfo.start();
      this.schedule();
    }
    this.apply(settings);if(!this.suspended)void this.ctx.resume().catch(()=>{});
  }
  apply(s:Settings){
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    this.master?.gain.setTargetAtTime(s.mute?0:s.volume,t,.06);
    this.room?.gain.setTargetAtTime(s.ambienceVolume,t,.08);
    this.ui?.gain.setTargetAtTime(s.uiVolume,t,.06);
  }
  private tone(out:GainNode,hz:number,end:number,volume:number,len:number,shape:OscillatorType='sine'){
    const c=this.ctx;if(!c||this.suspended||c.state==='closed')return;
    const t=c.currentTime+.005,o=c.createOscillator(),g=c.createGain();
    o.type=shape;o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(end,t+len);
    g.gain.setValueAtTime(.00001,t);g.gain.linearRampToValueAtTime(volume,t+.015);g.gain.exponentialRampToValueAtTime(.00001,t+len);
    o.connect(g).connect(out);o.onended=()=>{o.disconnect();g.disconnect();};o.start(t);o.stop(t+len+.012);
  }
  private schedule(){
    clearTimeout(this.next);
    if(this.suspended||!this.ctx)return;
    this.next=setTimeout(()=>{
      if(!this.room)return;
      if(Math.random()>.31)this.tone(this.room,1510+Math.random()*430,530,.025,.13);
      else this.tone(this.room,274,209,.010,.82,'triangle');
      this.schedule();
    },7400+Math.random()*16900);
  }
  spark(){
    const c=this.ctx;
    if(!c||c.state!=='running'||this.suspended||!this.room||!this.noise)return;
    const t=c.currentTime,n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
    n.buffer=this.noise;n.playbackRate.value=3.2;f.type='highpass';f.frequency.value=800;
    g.gain.setValueAtTime(.17,t);g.gain.exponentialRampToValueAtTime(.0001,t+.11);
    n.connect(f).connect(g).connect(this.room);n.start(t,Math.random()*4);n.stop(t+.12);
  }
  select(){if(this.ui)this.tone(this.ui,438,236,.06,.10,'triangle');}
  visibility(hidden:boolean){
    this.suspended=hidden;
    if(hidden){clearTimeout(this.next);void this.ctx?.suspend().catch(()=>{});}
    else if(this.ctx){void this.ctx.resume().catch(()=>{});this.schedule();}
  }
  close(){clearTimeout(this.next);void this.ctx?.close().catch(()=>{});this.ctx=undefined;}
}
