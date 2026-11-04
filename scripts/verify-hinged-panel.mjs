import assert from 'node:assert/strict';
import * as T from 'three';
import {segmentBoxDistanceSq,HingedPanel} from '../src/episode/hinged-panel.ts';
const v=(x,y,z)=>new T.Vector3(x,y,z),box=new T.Box3(v(-1,-1,-1),v(1,1,1));
assert.equal(segmentBoxDistanceSq(v(0,-5,0),v(0,5,0),box),0);
assert.equal(segmentBoxDistanceSq(v(2,-5,0),v(2,5,0),box),1);
assert.equal(segmentBoxDistanceSq(v(2,2,0),v(2,2,0),box),2);
assert(Math.abs(segmentBoxDistanceSq(v(3,0,0),v(0,3,0),box)-.5)<1e-12,'interior segment minimum must be evaluated');
let seed=12345;const rand=()=>((seed=seed*16807%2147483647)/2147483647)*8-4;
for(let i=0;i<500;i++){
 const a=v(rand(),rand(),rand()),b=v(rand(),rand(),rand());
 let sampled=Infinity;
 for(let j=0;j<=1000;j++)sampled=Math.min(sampled,box.distanceToPoint(a.clone().lerp(b,j/1000))**2);
 const exact=segmentBoxDistanceSq(a,b,box);
 assert(exact<=sampled+1e-10&&sampled-exact<.0001,'exact distance must bound independent dense sampling');
 assert(Math.abs(exact-segmentBoxDistanceSq(b,a,box))<1e-10,'segment ordering cannot alter contact');
}
const leaf=new T.Box3(v(.025,-.07,-3.65),v(1.975,.05,0));
const basis=new T.Matrix4().makeTranslation(2,3.6,-1),panel=new HingedPanel(leaf,basis,'z');
assert(!panel.sweepTouches(0,Math.PI/2,3,3.6,-.5,1.78),'front approach is clear');
assert(!panel.sweepTouches(0,Math.PI/2,1,3.6,-2.5,1.78),'outside the side hinge is clear');
assert(panel.sweepTouches(0,Math.PI/2,3,3.6,-2.5,1.78),'standing on the closed lid must prevent opening');
assert(!panel.sweepTouches(0,Math.PI/2,3,0,-2.5,1.78),'a lower-floor capsule must not block the upper lid');
assert(!panel.touches(0,3,3.6,-.5,1.78));
console.log('PASS exact segment/box distance, 500 seeded dense-sampling comparisons, and hinge/capsule sweep');
