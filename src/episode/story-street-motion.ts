import type { StoryBeat } from './story-intro-flow';
type Point=[number,number,number];
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
const lerp=(a:Point,b:Point,t:number):Point=>t<=0?[...a]:t>=1?[...b]:a.map((n,i)=>n+(b[i]!-n)*t) as Point;
function along(points:Point[],t:number){
  const lengths=points.slice(1).map((p,i)=>Math.hypot(...p.map((n,j)=>n-points[i]![j]!)));
  const total=lengths.reduce((a,b)=>a+b,0);let d=total*clamp(t);
  for(let i=0;i<lengths.length;i++){
    if(d<=lengths[i]!||i===lengths.length-1)return lerp(points[i]!,points[i+1]!,d/lengths[i]!);
    d-=lengths[i]!;
  }
  return points[0]!;
}
export function streetBlocking(beat:StoryBeat,t:number){
  let position:Point=[-8,.12,-1.7],yaw=Math.PI/2,distance=0,shopOpen=0;
  const groceries=['SHOP_EXIT','WALK_HOME','ABDUCTION','BLACKOUT'].includes(beat);
  if(beat==='WALK_TO_SHOP'){distance=10*clamp(t/8);position=[-8+distance,.12,-1.7];}
  if(beat==='SHOP_ENTER'){
    shopOpen=smooth(t/.9);position=lerp([2,.12,-1.7],[2,.12,-4.65],(t-1)/2);
    yaw=Math.PI;distance=2.95*clamp((t-1)/2);
  }
  if(beat==='STORE_TRANSIT'||beat==='RETURN_2316'){position=[2,.12,-4.65];shopOpen=1;}
  if(beat==='SHOP_EXIT'){shopOpen=1-smooth((t-2.7)/.3);position=lerp([2,.12,-4.65],[2,.12,-1.7],t/2.6);yaw=0;distance=2.95*clamp(t/2.6);}
  if(beat==='WALK_HOME'){distance=5.8*clamp(t/8);position=[2-distance,.12,-1.7];yaw=-Math.PI/2;}
  if(beat==='ABDUCTION'||beat==='BLACKOUT'){position=[-3.8,.12,-1.7];yaw=-Math.PI/2;}
  const abduction=beat==='ABDUCTION'||beat==='BLACKOUT';
  const a=beat==='BLACKOUT'?6:t;
  const paths:Point[][]=[
    [[-.9,.02,1.05],[-2.05,.02,.45],[-2.05,.12,-.85],[-3.15,.12,-1.20]],
    [[-.9,.02,3.4],[-1.4,.02,3.7],[-4.1,.02,3.7],[-4.1,.12,-.6],[-4.35,.12,-1.2]],
  ];
  const unknowns=paths.map((points,i)=>{
    const u=clamp((a-2.7)/3.3),p=along(points,u),next=along(points,Math.min(1,u+.001));
    return {position:p,yaw:Math.atan2(next[0]-p[0],next[2]-p[2])|| (i?-.7:-2.1),
      visible:abduction&&a>=2.7,distance:u*(i?10.4:3.4)};
  });
  return {hero:{position,yaw,distance,moving:beat==='WALK_TO_SHOP'||beat==='WALK_HOME'||(beat==='SHOP_ENTER'&&t>1)||(beat==='SHOP_EXIT'&&t<2.6)},
    groceries,shopOpen,carX:abduction?-1.4-8.6*(1-clamp(a/2))**3:-10,
    carOpen:abduction?smooth((a-2.1)/.8):0,unknowns,black:beat==='STORE_TRANSIT'?smooth(t/.5):
      beat==='RETURN_2316'?1-smooth(t/.7):beat==='BLACKOUT'?1:beat==='ABDUCTION'?smooth((t-5.35)/.65):0};
}
