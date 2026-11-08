import * as T from 'three';

const sides=['L','R'] as const;
const wheels=['Front_L','Front_R','Rear_L','Rear_R'] as const;

/** Adapter for the Blender-authored metric sedan; does not author actor motion. */
export class StorySedan {
  private readonly doors:{pivot:T.Object3D;closed:number;open:number}[];
  private readonly wheels:{pivot:T.Object3D;rest:T.Quaternion;radius:number}[];
  private readonly spin=new T.Quaternion();
  private readonly axle=new T.Vector3(0,0,1);
  constructor(readonly model:T.Group, anchor:T.Object3D){
    const find=(name:string)=>{
      const node=model.getObjectByName(name);
      if(!node?.children.length)throw Error('Sedan missing articulated '+name);
      return node;
    };
    const sedan=find('SedanRoot');
    if(sedan.userData.source_license!=='CC0-1.0')throw Error('Sedan provenance missing');
    this.doors=sides.map(side=>{
      const pivot=find('Sedan_Door_Rear_'+side+'_Pivot');
      const open=pivot.userData.open_angle_radians;
      if(typeof open!=='number'||Math.abs(open)<.9||Math.abs(open)>1.3||Math.sign(open)!==(side==='L'?-1:1))
        throw Error('Invalid sedan hinge angle '+side);
      return {pivot,closed:pivot.rotation.y,open};
    });
    this.wheels=wheels.map(id=>{
      const pivot=find('Sedan_Wheel_'+id),radius=pivot.userData.radius_m;
      if(typeof radius!=='number'||radius<.26||radius>.38)throw Error('Invalid sedan wheel radius '+id);
      return {pivot,rest:pivot.quaternion.clone(),radius};
    });
    model.rotation.y=Math.PI; // Authored nose -X, stage traffic travels +X.
    model.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(model,true);
    model.position.set(-.5*(bounds.min.x+bounds.max.x),-bounds.min.y,0);
    anchor.add(model);
    model.traverse(o=>{
      if(!(o instanceof T.Mesh))return;
      const materials=Array.isArray(o.material)?o.material:[o.material];
      o.receiveShadow=true;
      o.castShadow=materials.every(m=>!m.transparent&&!(m instanceof T.MeshPhysicalMaterial&&m.transmission>.1));
    });
  }
  sample(travel:number,opening:number,wide=false){
    for(const d of this.doors)d.pivot.rotation.y=d.closed+(wide?Math.sign(d.open)*1.55:d.open)*opening;
    // Rotation is determined by distance, not FPS or wall time. After the
    // existing brake curve stops, wheels do not continue spinning.
    for(const w of this.wheels)w.pivot.quaternion.copy(w.rest)
      .multiply(this.spin.setFromAxisAngle(this.axle,travel/w.radius));
  }
  snapshot(){
    return {angles:this.doors.map(d=>d.pivot.rotation.y-d.closed),
      wheels:this.wheels.map(w=>w.pivot.quaternion.toArray()),loaded:true};
  }
}
