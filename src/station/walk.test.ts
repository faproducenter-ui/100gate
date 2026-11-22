import {describe,expect,it} from 'vitest';
import {WalkGrid,type WalkInfo} from './walk';

// 10 x 10 m room of 0.1 m cells, floor at 0 (stored 50), a 1 m wall across x=5 with a gap at y 4..6, a 0.2 m platform on the right half
const info:WalkInfo={x0:0,y0:0,cell:.1,w:100,h:100,blocked:255,heightOffsetCm:50};
function room(){
  const cells=new Uint8Array(100*100).fill(50);
  for(let j=0;j<100;j++)for(let i=0;i<100;i++){
    const x=(i+.5)/10,y=(j+.5)/10;
    if(i===0||j===0||i===99||j===99)cells[j*100+i]=255;
    else if(Math.abs(x-5)<.1&&!(y>4&&y<6))cells[j*100+i]=255;
    else if(x>5.1)cells[j*100+i]=70;
  }
  return new WalkGrid(info,cells);
}

describe('station walk grid',()=>{
  it('reads heights and blocks walls',()=>{
    const g=room();
    expect(g.floor(2,2)).toBeCloseTo(0);
    expect(g.floor(7,2)).toBeCloseTo(.2);
    expect(g.floor(5,2)).toBeUndefined();
    expect(g.floor(-1,2)).toBeUndefined();
  });
  it('slides along a wall instead of passing it',()=>{
    const g=room();
    const p=g.move({x:4,y:2},2,1);
    expect(p.x).toBeLessThan(5-.3+1e-6);
    expect(p.y).toBeCloseTo(3,1);
  });
  it('passes through the gap and steps onto the low platform',()=>{
    const p=room().move({x:4,y:5},3,0);
    expect(p.x).toBeCloseTo(7,1);
  });
  it('a closed door blocks until it is removed',()=>{
    const g=room();g.blockers.set('door',{x0:4.8,y0:4,x1:5.2,y1:6});
    expect(g.move({x:4,y:5},3,0).x).toBeLessThan(4.6);
    g.blockers.delete('door');
    expect(g.move({x:4,y:5},3,0).x).toBeCloseTo(7,1);
  });
  it('rows from an image are flipped so row 0 is the south edge',()=>{
    const top=new Uint8Array(4).fill(50);top[0]=255;  // 2x2: top-left blocked
    const g=WalkGrid.fromRows({...info,w:2,h:2,cell:1},top);
    expect(g.floor(.5,1.5)).toBeUndefined();
    expect(g.floor(.5,.5)).toBeCloseTo(0);
  });
});
