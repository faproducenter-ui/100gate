import * as T from 'three';

/** Continue the existing pavement outside the old camera envelope. Reuse
 * authored PBR materials and keep the extension out of the old review cut. */
export function finishFarCurb(set:T.Object3D,scene:T.Scene){
  const materials=new Map<string,T.Material>();
  set.traverse(o=>{
    if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.set(m.name,m);
  });
  const use=(name:string)=>{
    const m=materials.get(name);
    if(!m)throw Error('Missing street finish material: '+name);
    return m;
  };
  const asphalt=use('Poly Haven asphalt 02');
  const road=new T.Mesh(new T.PlaneGeometry(48,4.42),asphalt);
  road.rotation.x=-Math.PI/2;road.position.set(2,-.010,7.48);
  const uv=road.geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*8,uv.getY(i)*1.2);
  road.name='Street | far lane continuation';road.receiveShadow=true;
  scene.add(road);
  const sidewalk=new T.Mesh(new T.BoxGeometry(48,.13,2.2),use('Pale worn concrete'));
  sidewalk.position.set(2,.045,10.66);sidewalk.name='Street | opposite sidewalk';
  const curb=new T.Mesh(new T.BoxGeometry(48,.19,.14),use('Kerb granite'));
  curb.position.set(2,.03,9.63);curb.name='Street | opposite curb';
  const wall=new T.Mesh(new T.BoxGeometry(48,3.7,.21),use('Poly Haven exposed brick'));
  wall.position.set(2,1.94,11.73);wall.name='Street | far boundary masonry';
  for(const o of [sidewalk,curb,wall]){o.receiveShadow=true;scene.add(o);}
  // A broad far-side falloff like a practical on the opposite pavement.
  const light=new T.SpotLight(0xa9c7ed,36,11,.75,.90,2);
  light.position.set(-3,4.7,6.9);light.target.position.set(-2,.6,3.0);
  scene.add(light,light.target);
}
