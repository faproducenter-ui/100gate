import * as T from 'three';
import {describe,expect,it,vi} from 'vitest';
import {buildEnvironment} from './environment';
import {DOORS,OBJECTS,ROOMS,type DoorId} from './map';

describe('administration asset contract',()=>{
  it('links 3D props, live hinges and phosphor screens to the physical map',()=>{
    const drawing=new Proxy({
      createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),
      createRadialGradient:()=>({addColorStop:()=>{}}),
    },{get:(self,key)=>Reflect.get(self,key)??(()=>{})});
    vi.stubGlobal('document',{createElement:()=>({getContext:()=>drawing})});
    try{
      const env=buildEnvironment();env.root.updateMatrixWorld(true);
      for(const key of Object.keys(ROOMS))expect(env.root.getObjectByName(key)).toBeInstanceOf(T.Group);
      expect(Object.keys(env.targets).sort()).toEqual(Object.keys(OBJECTS).sort());
      for(const id of Object.keys(DOORS) as DoorId[]){
        expect(env.doors[id].position.toArray()).toEqual([DOORS[id].x,0,DOORS[id].z-DOORS[id].half]);
        expect(env.doors[id].children.some(o=>o instanceof T.Mesh)).toBe(true);
      }
      expect(env.screens).toHaveLength(3);
      expect(env.lamp).toBeInstanceOf(T.PointLight);
      expect(env.occluders.length).toBeGreaterThan(0);
      const eye=new T.Vector3(6.6,1.64,3.62);
      for(const screen of env.screens){
        const visibleCenter=screen.localToWorld(new T.Vector3(0,0,.024));
        const ray=new T.Raycaster(eye,visibleCenter.clone().sub(eye).normalize(),.01,eye.distanceTo(visibleCenter)+.01);
        expect(ray.intersectObject(env.root,true)[0]?.object).toBe(screen);
      }
      let meshes=0,triangles=0;
      env.root.traverse(o=>{
        if(o instanceof T.Mesh){
          meshes++;
          triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o instanceof T.InstancedMesh?o.count:1);
        }
      });
      if(process.env.ISO_ART_DIAGNOSTICS==='1')console.log(JSON.stringify({meshes,triangles}));
      expect(meshes).toBeLessThan(350);
      expect(triangles).toBeLessThan(500_000);
    }finally{vi.unstubAllGlobals();}
  });
});
