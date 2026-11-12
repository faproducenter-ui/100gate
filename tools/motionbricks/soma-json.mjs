// Reader for the JSON that lab/generate_locomotion.py writes (real MotionBricks output).
import fs from 'node:fs';
import * as T from 'three';

export function readSomaJson(path) {
  const j = JSON.parse(fs.readFileSync(path, 'utf8'));
  let frames = j.frames.map(fr => new Map(j.joints.map((name, i) => [name, new T.Vector3(...fr[i])])));
  // The engine's world axes are not SOMA's Y-up (measured: up = -Y, forward = +X, left = +Z). Find "up" as the direction
  // hips -> head and rotate it onto +Y: a proper rotation, so left/right are never mirrored.
  const up = new T.Vector3();
  for (const fr of frames) up.add(fr.get('Head').clone().sub(fr.get('Hips')));
  // snap to the nearest world axis: the spine leans a few degrees, and a tilted "up" would turn forward travel into fake climbing
  const comp = ['x', 'y', 'z'].reduce((a, c) => Math.abs(up[c]) > Math.abs(up[a]) ? c : a, 'x');
  const axisUp = new T.Vector3(); axisUp[comp] = Math.sign(up[comp]);
  up.copy(axisUp);
  const R = new T.Quaternion().setFromUnitVectors(up, new T.Vector3(0, 1, 0));
  frames = frames.map(fr => new Map([...fr].map(([k, v]) => [k, v.clone().applyQuaternion(R)])));
  return { fps: j.fps, frames, meta: j.meta, detectedUp: up.toArray().map(v => +v.toFixed(2)) };
}
