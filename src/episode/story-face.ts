type Role='Alexei'|'Partner';
const pulse=(t:number,center:number,range:number)=>{
  const p=Math.max(0,1-Math.abs(t-center)/range);
  return p*p*(3-2*p);
};
const cues={
  Alexei:{
    voice:[[1.12,.23,.26],[1.53,.18,.22],[1.84,.23,.29],[2.26,.14,.20],[2.72,.23,.24],[3.06,.16,.20],[6.82,.22,.21],[7.22,.18,.22],[7.54,.12,.22]],
    blink:[.45,2.14,3.79,5.87,8.22,10.23],
    glance:[3.26,8.44],
  },
  Partner:{
    voice:[[4.37,.25,.24],[4.79,.15,.20],[5.22,.22,.19],[5.65,.18,.21]],
    blink:[1.63,3.23,5.16,6.97,9.49,12.12],
    glance:[2.82,6.38,10.9],
  },
} satisfies Record<Role,{voice:number[][];blink:number[];glance:number[]}>;

/** Acting cues for the subtitled scene, not a claim of lip sync to a voice. */
export function dialogueFace(role:Role,time:number){
  const track=cues[role];
  const blinks=(delay:number)=>Math.max(0,...track.blink.map(t=>pulse(time,t+delay,.091)));
  const jaw=Math.max(0,...track.voice.map(([t=0,w=0,amp=0])=>amp*pulse(time,t,w)));
  return {eyeBlinkLeft:blinks(0),eyeBlinkRight:blinks(.013),
    jawOpen:jaw,mouthPucker:.64*jaw*(.52+.48*Math.sin(time*12)**2),
    browInnerUp:.23*pulse(time,role==='Alexei'?1.45:3.43,.48),
    gazeDown:.25*Math.max(0,...track.glance.map(t=>pulse(time,t,.28))),
    gazeLeft:role==='Alexei'?.10*pulse(time,3.69,.32):0,
    gazeRight:role==='Partner'?.12*pulse(time,9.55,.36):0};
}
