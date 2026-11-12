// Minimal BVH reader for SOMA-style clips: forward kinematics -> joint world positions (metres, Y up).
// This is the *stand-in generator* for the prototype: it feeds the retargeter the same thing the MotionBricks
// runtime will (SOMA joint positions at 30 Hz). Evaluation-licence sample clips are read locally only.
import fs from 'node:fs';
import * as T from 'three';

export function readBvh(path) {
  const text = fs.readFileSync(path, 'utf8');
  const [head, body] = text.split(/\nMOTION\s*\n/);
  const joints = [], stack = [];
  let cur;
  for (const raw of head.split(/\r?\n/)) {
    const s = raw.trim();
    let m;
    if ((m = s.match(/^(ROOT|JOINT)\s+(\S+)/))) { cur = { name: m[2], parent: stack.at(-1), offset: [0, 0, 0], channels: [], end: false }; joints.push(cur); stack.push(cur); }
    else if (s.startsWith('End Site')) { cur = { name: stack.at(-1).name + 'End', parent: stack.at(-1), offset: [0, 0, 0], channels: [], end: true }; joints.push(cur); stack.push(cur); }
    else if (s.startsWith('OFFSET')) cur.offset = s.split(/\s+/).slice(1, 4).map(Number);
    else if (s.startsWith('CHANNELS')) { const p = s.split(/\s+/); cur.channels = p.slice(2); }
    else if (s === '}') { stack.pop(); cur = stack.at(-1); }
  }
  const lines = body.split(/\r?\n/);
  const frames = Number(lines[0].match(/Frames:\s*(\d+)/)[1]);
  const dt = Number(lines[1].match(/Frame Time:\s*([\d.eE+-]+)/)[1]);
  const data = lines.slice(2, 2 + frames).map(l => l.trim().split(/\s+/).map(Number));
  return { joints, frames, dt, data };
}

const AXIS = { X: new T.Vector3(1, 0, 0), Y: new T.Vector3(0, 1, 0), Z: new T.Vector3(0, 0, 1) };

/** World positions of every joint at frame f (cm -> m). BVH rotation channels are applied in listed order. */
export function fkFrame(bvh, f) {
  const row = bvh.data[f], out = new Map(), rot = new Map();
  let k = 0;
  for (const j of bvh.joints) {
    const q = new T.Quaternion(), pos = new T.Vector3(...j.offset).multiplyScalar(.01);
    for (const ch of j.channels) {
      const v = row[k++];
      if (ch.endsWith('position')) pos[ch[0].toLowerCase()] += v * .01;
      else q.multiply(new T.Quaternion().setFromAxisAngle(AXIS[ch[0]], v * Math.PI / 180));
    }
    if (j.parent) {
      const pq = rot.get(j.parent.name), pp = out.get(j.parent.name);
      out.set(j.name, pos.applyQuaternion(pq).add(pp));
      rot.set(j.name, pq.clone().multiply(q));
    } else { out.set(j.name, pos); rot.set(j.name, q); }
  }
  return out;
}

/** Sample at a fixed rate (default 30 Hz) as arrays of Map(name -> Vector3). */
export function samplePositions(bvh, fps = 30, from = 0, to = bvh.frames * bvh.dt) {
  const frames = [], step = 1 / fps;
  for (let t = from; t <= to + 1e-9; t += step) {
    const f = Math.min(bvh.frames - 1, Math.round(t / bvh.dt));
    frames.push(fkFrame(bvh, f));
  }
  return frames;
}
