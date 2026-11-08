import type {Foley} from './audio';
import type {StoryBeat} from './story-intro-flow';
import {storyAsset} from './release';
import {egressStudy} from './story-final-options';
import {storyFoleyEvents} from './story-foley-timing';

/** Keep decoded ambience in the existing game audio context and volume bus. */
export class StoryAudio {
  private loop?:AudioBufferSourceNode;
  private gain?:GainNode;
  private low?:BiquadFilterNode;
  private motor?:{tone:OscillatorNode;filter:BiquadFilterNode;gain:GainNode};
  private readonly abort=new AbortController();
  private beat?:StoryBeat;
  private last=0;
  private steps=0;
  constructor(private readonly foley:Foley){}
  async load(){
    const {context,master}=this.foley;if(!context||!master)return;
    try{
      const r=await fetch(storyAsset('audio/night-city-223093.mp3'),{signal:this.abort.signal});
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
    if((beat==='HOME_EXIT'&&(crossed(5.3)||crossed(9.85)))||(!egressStudy&&beat==='ABDUCTION'&&crossed(2.3)))this.foley.play('door');
    if(egressStudy&&context&&this.foley.master){
      if(beat==='ABDUCTION'&&!this.motor){
        const tone=context.createOscillator(),filter=context.createBiquadFilter(),gain=context.createGain();
        tone.type='triangle';filter.type='lowpass';filter.frequency.value=125;gain.gain.value=0;
        tone.connect(filter).connect(gain).connect(this.foley.master);tone.start();
        this.motor={tone,filter,gain};
      }
      if(this.motor){
        const moving=beat==='ABDUCTION';
        const speed=(1-Math.min(seconds/2,1))**2;
        this.motor.tone.frequency.setTargetAtTime(32+45*speed,context.currentTime,.15);
        this.motor.gain.gain.setTargetAtTime(moving?(.024+.035*speed)*(1-black):0,context.currentTime,.20);
      }
      if(seconds-last<.35)for(const cue of storyFoleyEvents(beat,last,seconds,true)){
        if(cue.kind==='boot')this.foley.step(false,false,cue.pan<0);
        else this.foley.cinematicCue(cue.kind,cue.pan);
      }
    }
    if(beat==='STRAIN'&&(crossed(.45)||crossed(1.25)||crossed(2.28)))this.foley.rock(.34,this.steps++%2?1:-1);
    if(beat==='LEFT_HITCH_RELEASE'&&crossed(1.27))this.foley.ropeContact(-.25,false);
    const walks=beat==='WALK_TO_SHOP'||beat==='WALK_HOME'||(beat==='SHOP_ENTER'&&seconds>1)
      ||(beat==='SHOP_EXIT'&&seconds<2.6)||(beat==='HOME_EXIT'&&((seconds>.65&&seconds<3.6)||(seconds>7.65&&seconds<9.4)));
    const rate=beat==='WALK_HOME'?1.45:beat==='WALK_TO_SHOP'?2.5:2.1;
    if(walks&&seconds-last<.35&&Math.floor(seconds*rate)!==Math.floor(last*rate))this.foley.step(false,false,this.steps++%2===0);
    this.beat=beat;this.last=seconds;
  }
  dispose(){this.abort.abort();this.loop?.stop();this.loop?.disconnect();this.gain?.disconnect();this.low?.disconnect();
    this.motor?.tone.stop();this.motor?.tone.disconnect();this.motor?.filter.disconnect();this.motor?.gain.disconnect();}
}
