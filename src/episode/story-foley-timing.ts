import type {StoryBeat} from './story-intro-flow';
type Cue={at:number;kind:'brake'|'carDoor'|'boot'|'cloth'|'swell';pan:number};
const egressCues:Cue[]=[
  {at:1.39,kind:'brake',pan:.26},
  {at:2.17,kind:'carDoor',pan:-.25},{at:2.31,kind:'carDoor',pan:.38},
  {at:3.05,kind:'cloth',pan:-.31},{at:3.22,kind:'cloth',pan:.35},
  {at:3.86,kind:'boot',pan:-.21},{at:4.04,kind:'boot',pan:.31},
  {at:4.33,kind:'boot',pan:-.21},{at:4.51,kind:'boot',pan:.31},
  {at:7.7,kind:'cloth',pan:-.11},{at:8.12,kind:'swell',pan:0},
];
export function storyFoleyEvents(beat:StoryBeat,last:number,now:number,egress:boolean){
  return egress&&beat==='ABDUCTION'?egressCues.filter(e=>last<e.at&&e.at<=now):[];
}
