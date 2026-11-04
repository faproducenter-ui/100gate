import * as T from 'three';

/** Exact minimum squared distance between a line segment and an axis-aligned box.
 * Coordinate-plane crossings split the convex distance function into quadratic intervals. */
export function segmentBoxDistanceSq(a:T.Vector3,b:T.Vector3,box:T.Box3,cuts:number[]=[]){
  cuts.length=0;cuts.push(0,1);
  for(let axis=0;axis<3;axis++){
    const origin=a.getComponent(axis),delta=b.getComponent(axis)-origin;
    if(Math.abs(delta)<1e-12)continue;
    for(const bound of [box.min.getComponent(axis),box.max.getComponent(axis)]){
      const t=(bound-origin)/delta;if(t>0&&t<1)cuts.push(t);
    }
  }
  cuts.sort((x,y)=>x-y);
  const distance=(t:number)=>{
    let sum=0;
    for(let axis=0;axis<3;axis++){
      const p=a.getComponent(axis)+(b.getComponent(axis)-a.getComponent(axis))*t;
      const d=p-T.MathUtils.clamp(p,box.min.getComponent(axis),box.max.getComponent(axis));sum+=d*d;
    }
    return sum;
  };
  let best=Math.min(distance(0),distance(1));
  for(let i=1;i<cuts.length;i++){
    const lo=cuts[i-1],hi=cuts[i],mid=(lo+hi)/2;let A=0,B=0;
    best=Math.min(best,distance(lo),distance(hi));
    for(let axis=0;axis<3;axis++){
      const origin=a.getComponent(axis),delta=b.getComponent(axis)-origin,p=origin+delta*mid;
      const min=box.min.getComponent(axis),max=box.max.getComponent(axis);
      if(p>=min&&p<=max)continue;
      const offset=origin-(p<min?min:max);A+=delta*delta;B+=delta*offset;
    }
    if(A>0)best=Math.min(best,distance(T.MathUtils.clamp(-B/A,lo,hi)));
  }
  return best;
}

/** Unit-scale rigid hinge, independent from renderer objects and their disposal. */
export class HingedPanel {
  private box:T.Box3;private basis:T.Matrix4;private inverse=new T.Matrix4();private rotation=new T.Matrix4();
  private a=new T.Vector3();private b=new T.Vector3();private cuts:number[]=[];
  private axis:'x'|'z';
  constructor(box:T.Box3,basis:T.Matrix4,axis:'x'|'z'){
    this.box=box.clone();this.basis=basis.clone();this.axis=axis;
  }
  touches(angle:number,x:number,feet:number,z:number,height:number,radius=.22){
    if(this.axis==='x')this.rotation.makeRotationX(angle);else this.rotation.makeRotationZ(angle);
    this.inverse.multiplyMatrices(this.basis,this.rotation).invert();
    this.a.set(x,feet+radius,z).applyMatrix4(this.inverse);
    this.b.set(x,feet+Math.max(radius,height-radius),z).applyMatrix4(this.inverse);
    return segmentBoxDistanceSq(this.a,this.b,this.box,this.cuts)<(radius-.001)**2;
  }
  sweepTouches(from:number,to:number,x:number,feet:number,z:number,height:number){
    // At this leaf's maximum radius the step is <6 cm, well below the capsule diameter.
    const steps=Math.max(1,Math.ceil(Math.abs(to-from)/.03));
    for(let i=1;i<=steps;i++)if(this.touches(from+(to-from)*i/steps,x,feet,z,height))return true;
    return false;
  }
}
