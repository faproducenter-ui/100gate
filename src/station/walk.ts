/** Walkability of the gas-station location: a grid baked in Blender by ray casts (tools/gas-station/export_station.py).
 * Coordinates are Blender's ground plane (x east, y north); three.js world is (x, height, -y).
 * Cell value 255 = blocked, otherwise the floor height in centimetres plus an offset (so slightly sunken floors fit a byte). */
export type WalkInfo={x0:number;y0:number;cell:number;w:number;h:number;blocked:number;heightOffsetCm:number};
export type Rect={x0:number;y0:number;x1:number;y1:number};
export const PLAYER_RADIUS=.3;
const STEP_UP=.28;   // a kerb or the shop's raised floor is stepped onto; anything higher is a wall

export class WalkGrid{
  /** Rectangles that block while a door is closed (keyed by door name). */
  readonly blockers=new Map<string,Rect>();
  /** Doorways cut through the baked grid while a door stands open (the bake saw the closed leaf as a wall); h = floor height there. */
  readonly openings=new Map<string,Rect&{h:number}>();
  constructor(readonly info:WalkInfo,private readonly cells:Uint8Array){
    if(cells.length!==info.w*info.h)throw Error('walk grid size mismatch');
  }
  /** cells[row*w+col], row 0 at y0 (south). */
  static fromRows(info:WalkInfo,rowsTopDown:Uint8Array){
    const {w,h}=info,cells=new Uint8Array(w*h);
    for(let r=0;r<h;r++)cells.set(rowsTopDown.subarray(r*w,(r+1)*w),(h-1-r)*w);
    return new WalkGrid(info,cells);
  }
  /** A thin wall the bake missed (under a roof): a row of small squares along the segment, always solid. */
  addWall(id:string,ax:number,ay:number,bx:number,by:number,t=.1){
    const n=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)/(t*1.2)));
    for(let k=0;k<=n;k++){const x=ax+(bx-ax)*k/n,y=ay+(by-ay)*k/n;this.blockers.set(`${id}:${k}`,{x0:x-t,x1:x+t,y0:y-t,y1:y+t});}
  }
  /** Open a doorway: its floor height is taken from the free cells around it. */
  openDoorway(id:string,r:Rect){
    const hs:number[]=[];
    for(let k=0;k<24;k++){
      const a=k*Math.PI/12,cx=(r.x0+r.x1)/2,cy=(r.y0+r.y1)/2,rx=(r.x1-r.x0)/2+.25,ry=(r.y1-r.y0)/2+.25;
      const v=this.raw(cx+Math.cos(a)*rx,cy+Math.sin(a)*ry);if(v!==this.info.blocked)hs.push(v);
    }
    hs.sort((a,b)=>a-b);
    this.openings.set(id,{...r,h:hs.length?hs[hs.length>>1]!:this.info.heightOffsetCm});
  }
  private raw(x:number,y:number){
    const {x0,y0,cell,w,h,blocked}=this.info,i=Math.floor((x-x0)/cell),j=Math.floor((y-y0)/cell);
    if(i<0||j<0||i>=w||j>=h)return blocked;
    return this.cells[j*w+i]!;
  }
  /** Floor height at a point, or undefined where it is blocked. */
  floor(x:number,y:number){
    let v=this.raw(x,y);
    if(v===this.info.blocked){
      for(const r of this.openings.values())if(x>=r.x0&&x<=r.x1&&y>=r.y0&&y<=r.y1){v=r.h;break;}
      if(v===this.info.blocked)return undefined;
    }
    for(const r of this.blockers.values())if(x>=r.x0&&x<=r.x1&&y>=r.y0&&y<=r.y1)return undefined;
    return v/100-this.info.heightOffsetCm/100;
  }
  /** The body (a circle) fits here and no part of it stands more than a step above or below the centre. */
  canStand(x:number,y:number,from?:number){
    const c=this.floor(x,y);if(c===undefined)return false;
    if(from!==undefined&&c-from>STEP_UP)return false;
    for(let k=0;k<8;k++){
      const a=k*Math.PI/4,f=this.floor(x+Math.cos(a)*PLAYER_RADIUS,y+Math.sin(a)*PLAYER_RADIUS);
      if(f===undefined||Math.abs(f-c)>STEP_UP+.15)return false;
    }
    return true;
  }
  /** Substepped, axis-separated move so the body slides along walls instead of sticking or tunnelling. */
  move(p:{x:number;y:number},dx:number,dy:number){
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.06));
    let {x,y}=p;
    for(let i=0;i<steps;i++){
      const h=this.floor(x,y),nx=x+dx/steps,ny=y+dy/steps;
      if(this.canStand(nx,y,h))x=nx;
      if(this.canStand(x,ny,this.floor(x,y)))y=ny;
    }
    return {x,y};
  }
  /** Nearest standable point to (x,y) within a radius (used to put the player down safely). */
  nearestStand(x:number,y:number,radius=4){
    if(this.canStand(x,y))return {x,y};
    const c=this.info.cell;
    for(let r=c;r<=radius;r+=c)for(let k=0;k<32;k++){
      const a=k*Math.PI/16,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
      if(this.canStand(px,py))return {x:px,y:py};
    }
    return undefined;
  }
}

/** Decode the PNG into a grid (browser only). */
export async function loadWalk(url:string,info:WalkInfo){
  // onload, not decode(): decode() can wait indefinitely in a background tab
  const img=new Image();
  await new Promise<void>((ok,fail)=>{img.onload=()=>ok();img.onerror=()=>fail(Error('walk grid image failed'));img.src=url;});
  const cv=document.createElement('canvas');cv.width=info.w;cv.height=info.h;
  const ctx=cv.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('canvas unavailable');
  ctx.drawImage(img,0,0);
  const px=ctx.getImageData(0,0,info.w,info.h).data,rows=new Uint8Array(info.w*info.h);
  for(let i=0;i<rows.length;i++)rows[i]=px[i*4]!;
  return WalkGrid.fromRows(info,rows);
}
