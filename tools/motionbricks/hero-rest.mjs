// Reads the hero's rest pose (node hierarchy) straight from the shipped GLB, so the retargeter never
// depends on Blender or on a game build. Everything is in glTF space: Y up, +Z forward, left = +X.
import fs from 'node:fs';
import * as T from 'three';

export function loadHeroRest(path) {
  const b = fs.readFileSync(path);
  const n = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + n).toString('utf8'));
  const nodes = j.nodes, parent = new Map();
  nodes.forEach((x, i) => (x.children ?? []).forEach(c => parent.set(c, i)));
  const local = x => {
    const m = new T.Matrix4();
    if (x.matrix) return m.fromArray(x.matrix);
    return m.compose(new T.Vector3(...(x.translation ?? [0, 0, 0])), new T.Quaternion(...(x.rotation ?? [0, 0, 0, 1])), new T.Vector3(...(x.scale ?? [1, 1, 1])));
  };
  const world = i => { let m = local(nodes[i]); for (let p = parent.get(i); p !== undefined; p = parent.get(p)) m = local(nodes[p]).multiply(m); return m; };
  const byName = new Map(nodes.map((x, i) => [x.name, i]));
  const bones = new Map();
  const skin = j.skins?.[0];
  const jointSet = new Set(skin.joints);
  for (const ji of skin.joints) {
    const nd = nodes[ji], w = world(ji), pos = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
    w.decompose(pos, q, s);
    const lp = new T.Vector3(), lq = new T.Quaternion(), ls = new T.Vector3();
    local(nd).decompose(lp, lq, ls);
    bones.set(nd.name, { name: nd.name, index: ji, parent: jointSet.has(parent.get(ji)) ? nodes[parent.get(ji)].name : undefined, pos, worldQ: q, localQ: lq, localPos: lp });
  }
  // the node above the first bone (armature / root) keeps its rest world matrix
  const rootNode = skin.joints.map(ji => nodes[parent.get(ji)]?.name).find(nm => nm && !bones.has(nm));
  const rootWorld = rootNode ? world(byName.get(rootNode)) : new T.Matrix4();
  return { bones, rootWorld, rootQ: new T.Quaternion().setFromRotationMatrix(rootWorld), animations: j.animations?.map(a => a.name) ?? [] };
}
