import type {Foley} from './audio';
import type {StoryBeat} from './story-intro-flow';

/** Keep decoded ambience in the existing game audio context and volume bus. */
export class StoryAudio {
  private loop?:AudioBufferSourceNode;
  private gain?:GainNode;
  private low?:BiquadFilterNode;
  private readonly abort=new AbortController();
  private beat?:StoryBeat;
  private last=0;
  private steps=0;
  constructor(private readonly foley:Foley){}
  async load(){
    const {context,master}=this.foley;if(!context||!master)return;
    try{
      const r=await fetch('/outputs/story-intro/audio/night-city-223093.mp3',{signal:this.abort.signal});
      if(!r.ok)throw Error('City ambience unavailable');
      const buffer=await context.decodeAudioData(await r.arrayBuffer());
      if(this.abort.signal.aborted||context.state==='closed')return;
      const loop=context.createBufferSource();loop.buffer=buffer;loop.loop=true;
      this.low=context.createBiquadFilter();this.low.type='lowpass';this.low.frequency.value=2100;
      this.gain=context.createGain();this.gain.gain.value=0;
      loop.connect(this.low).connect(this.gain).connect(master);loop.start();this.loop=loop;
    }catch(e){if(!this.abort.signal.aborted)console.warn('Story audio: city bed not loaded',e);}
  }
  sample(beat:StoryBeat,seconds:number,black:number){
    const streets=['WALK_TO_SHOP','SHOP_ENTER','STORE_TRANSIT','RETURN_2316','SHOP_EXIT','WALK_HOME','ABDUCTION','BLACKOUT'];
    const outside=streets.includes(beat);
    const context=this.foley.context;
    if(context&&this.gain&&this.low){
      const gain=(outside?.20:0)*(1-black);
      const cutoff=beat==='ABDUCTION'||beat==='BLACKOUT'?2200-1970*black:beat==='SHOP_ENTER'||beat==='SHOP_EXIT'?950:2900;
      this.gain.gain.setTargetAtTime(gain,context.currentTime,.19);
      this.low.frequency.setTargetAtTime(cutoff,context.currentTime,.12);
    }
    const last=this.beat===beat?this.last:0;
    const crossed=(at:number)=>seconds>=at&&last<at&&seconds-last<.35;
    if((beat==='HOME_EXIT'&&(crossed(5.3)||crossed(9.85)))||(beat==='ABDUCTION'&&crossed(2.3)))this.foley.play('door');
    if(beat==='STRAIN'&&(crossed(.45)||crossed(1.25)||crossed(2.28)))this.foley.rock(.34,this.steps++%2?1:-1);
    if(beat==='LEFT_HITCH_RELEASE'&&crossed(1.27))this.foley.ropeContact(-.25,false);
    const walks=beat==='WALK_TO_SHOP'||beat==='WALK_HOME'||(beat==='SHOP_ENTER'&&seconds>1)
      ||(beat==='SHOP_EXIT'&&seconds<2.6)||(beat==='HOME_EXIT'&&((seconds>.65&&seconds<3.6)||(seconds>7.65&&seconds<9.4)));
    const rate=beat==='WALK_HOME'?1.45:beat==='WALK_TO_SHOP'?2.5:2.1;
    if(walks&&seconds-last<.35&&Math.floor(seconds*rate)!==Math.floor(last*rate))this.foley.step(false,false,this.steps++%2===0);
    this.beat=beat;this.last=seconds;
  }
  dispose(){this.abort.abort();this.loop?.stop();this.loop?.disconnect();this.gain?.disconnect();this.low?.disconnect();}
}
