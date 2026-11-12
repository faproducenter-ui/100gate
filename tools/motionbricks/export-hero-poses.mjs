// node tools/motionbricks/export-hero-poses.mjs [Walk|Run ...]
// Samples the hero's OWN Blender-authored clips (Walk/Run in alexei-10.glb) at 30 Hz and writes the world joint positions
// (+ head orientation) to out/own-<clip>.hero.json. lab/own_targets.py turns those into SOMA target poses, so MotionBricks
// is steered by our own animation instead of NVIDIA's evaluation-licence samples.
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { loadHeroRest } from './hero-rest.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const glb = path.resolve(here, '../../public/assets/iso/alexei-10.glb');
const hero = loadHeroRest(glb);
const buf = fs.readFileSync(glb), jl = buf.readUInt32LE(12);
const j = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
const bin = buf.subarray(20 + jl + 8);
const read = (ai) => {
  const a = j.accessors[ai], v = j.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (a.componentType !== 5126) throw new Error('animation accessors must be float');
  return new Float32Array(bin.buffer.slice(bin.byteOffset + o, bin.byteOffset + o + a.count * n * 4));
};
const nameOf = i => j.nodes[i].name;
const FPS = 30;

function sampleClip(anim) {
  const tracks = new Map();   // bone -> {q?:{t,v}, p?:{t,v}}
  for (const ch of anim.channels) {
    const s = anim.samplers[ch.sampler], name = nameOf(ch.target.node);
    if (!hero.bones.has(name) || !['rotation', 'translation'].includes(ch.target.path)) continue;
    const e = tracks.get(name) ?? {}; tracks.set(name, e);
    e[ch.target.path === 'rotation' ? 'q' : 'p'] = { t: read(s.input), v: read(s.output) };
  }
  const duration = Math.max(...[...tracks.values()].flatMap(e => [e.q, e.p].filter(Boolean).map(x => x.t.at(-1))));
  const at = (tr, t, n) => {
    const k = tr.t; let i = 0; while (i < k.length - 2 && k[i + 1] <= t) i++;
    const f = k.length < 2 ? 0 : Math.min(1, Math.max(0, (t - k[i]) / (k[i + 1] - k[i])));
    return [tr.v.slice(i * n, i * n + n), tr.v.slice((i + 1) * n, (i + 1) * n + n), f];
  };
  const order = [...hero.bones.keys()];
  const depth = n => { let d = 0; for (let p = hero.bones.get(n).parent; p; p = hero.bones.get(p)?.parent) d++; return d; };
  order.sort((a, b) => depth(a) - depth(b));
  const frames = [];
  const count = Math.round(duration * FPS);       // exactly one loop: the last key equals the first
  for (let f = 0; f < count; f++) {
    const t = f / FPS, W = new Map(), pos = {}, rot = {};
    for (const name of order) {
      const b = hero.bones.get(name), tr = tracks.get(name) ?? {};
      const q = b.localQ.clone(), p = b.localPos.clone();
      if (tr.q) { const [a, c, u] = at(tr.q, t, 4); q.copy(new T.Quaternion(...a).slerp(new T.Quaternion(...c), u)); }
      if (tr.p) { const [a, c, u] = at(tr.p, t, 3); p.copy(new T.Vector3(...a).lerp(new T.Vector3(...c), u)); }
      const m = new T.Matrix4().compose(p, q, new T.Vector3(1, 1, 1));
      const w = b.parent ? W.get(b.parent).clone().multiply(m) : hero.rootWorld.clone().multiply(m);
      W.set(name, w);
      const wp = new T.Vector3(), wq = new T.Quaternion(); w.decompose(wp, wq, new T.Vector3());
      pos[name] = wp.toArray().map(v => +v.toFixed(5));
      if (name === 'head') rot[name] = wq.toArray().map(v => +v.toFixed(6));
    }
    frames.push({ pos, rot });
  }
  return { duration, frames };
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : ['Walk', 'Run'];
const STRIDE = { Walk: 1.25, Run: 2.0, CrouchWalk: 0.9 };           // metres per loop (WALK_STRIDE / RUN_STRIDE in src/iso/actor.ts)
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
for (const clipName of want) {
  const anim = j.animations.find(a => a.name === clipName);
  if (!anim) throw new Error(`no clip ${clipName} in ${glb}`);
  const { duration, frames } = sampleClip(anim);
  const out = { fps: FPS, clip: clipName, duration, strideMetres: STRIDE[clipName], speedMps: STRIDE[clipName] / duration, frames, headRestAim: [0, 0.878, 0.478], headRestQ: hero.bones.get('head').worldQ.toArray(),
    source: 'public/assets/iso/alexei-10.glb (our own Blender-authored clip)' };
  fs.writeFileSync(path.join(here, 'out', `own-${clipName === 'CrouchWalk' ? 'crouch' : clipName.toLowerCase()}.hero.json`), JSON.stringify(out));
  const ph = frames.map(f => f.pos.pelvis[1]);
  console.log(clipName, `${frames.length} frames, ${duration}s, speed ${out.speedMps.toFixed(2)} m/s, pelvis y ${Math.min(...ph).toFixed(3)}..${Math.max(...ph).toFixed(3)}`);
}
