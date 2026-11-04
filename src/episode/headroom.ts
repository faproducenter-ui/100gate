import * as T from 'three';

// Eye-to-head/near-plane clearance. This is separate from the eye heights used by the rig.
export const HEAD_MARGIN=.10;
const UP=new T.Vector3(0,1,0);
const samples=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[Math.SQRT1_2,Math.SQRT1_2],
  [-Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2],[-Math.SQRT1_2,-Math.SQRT1_2]];
interface Solid {local:T.Box3;world:T.Box3;matrix:T.Matrix4;inverse:T.Matrix4;}

/** CPU-only solid snapshots: rendering/batching owns the original meshes, not the collision query. */
export class Headroom {
  private solids:Solid[]=[];
  private ray=new T.Ray();private hit=new T.Vector3();
  constructor(meshes:readonly T.Mesh[]){
    for(const mesh of meshes){
      mesh.updateWorldMatrix(true,false);mesh.geometry.computeBoundingBox();
      if(!mesh.geometry.boundingBox||mesh.geometry.boundingBox.isEmpty())continue;
      const matrix=mesh.matrixWorld.clone(),local=mesh.geometry.boundingBox.clone();
      this.solids.push({local,matrix,inverse:matrix.clone().invert(),world:local.clone().applyMatrix4(matrix)});
    }
  }
  get count(){return this.solids.length;}
  heightAt(x:number,z:number,feet:number,radius=.22){
    let ceiling=Infinity;
    for(const [sx,sz] of samples){
      const px=x+sx*radius,pz=z+sz*radius;
      for(const solid of this.solids){
        const b=solid.world;
        if(px<b.min.x||px>b.max.x||pz<b.min.z||pz>b.max.z||b.max.y<=feet+.01||b.min.y>=ceiling)continue;
        this.ray.origin.set(px,feet+.01,pz).applyMatrix4(solid.inverse);
        this.ray.direction.copy(UP).transformDirection(solid.inverse);
        // A surface under the soles (including tiny floor overlaps) is not an overhead obstacle.
        if(solid.local.containsPoint(this.ray.origin))continue;
        if(this.ray.intersectBox(solid.local,this.hit)){
          this.hit.applyMatrix4(solid.matrix);
          if(this.hit.y>feet+.01)ceiling=Math.min(ceiling,this.hit.y);
        }
      }
    }
    return ceiling;
  }
}
