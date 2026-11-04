import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const expected={
  'player-hand-open':{min:[-.063017413,-.005743396,-.070884615],max:[.045177523,.165244684,.014801969]},
  'player-hand-grip':{min:[-.050505843,-.005743396,-.085741840],max:[.040407214,.132681534,.014813356]},
};
for(const [id,bounds] of Object.entries(expected)){
  const bytes=await readFile(new URL('../public/assets/chapter1/'+id+'.glb',import.meta.url));
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  assert.equal(gltf.meshes.length,1,'unselected Blender geometry leaked into '+id);
  const primitive=gltf.meshes[0].primitives[0],material=gltf.materials[primitive.material];
  assert('TANGENT' in primitive.attributes);assert('TEXCOORD_0' in primitive.attributes);
  assert(!('COLOR_0' in primitive.attributes),'vertex tint must not multiply the skin atlas');
  assert(material.pbrMetallicRoughness.baseColorTexture);
  assert(material.pbrMetallicRoughness.metallicRoughnessTexture);
  assert(material.normalTexture);
  const pos=gltf.accessors[primitive.attributes.POSITION];
  for(const bound of ['min','max'])for(let i=0;i<3;i++)assert(Math.abs(pos[bound][i]-bounds[bound][i])<1e-6,'wrist/held-object calibration changed');
  assert(bytes.length<850000,'hand asset exceeded the agreed local size budget');
  console.log('PASS '+id+': PBR maps, tangents, unchanged proportions, no extra meshes, '+bytes.length+' bytes');
}
