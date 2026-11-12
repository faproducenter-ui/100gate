// node tools/motionbricks/verify.mjs walk|run
// Numbers that do not need eyes: joint position error against the source (hips-relative, scaled to the hero),
// foot sliding while a foot is planted, ground contact, and loop seam.
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { loadHeroRest } from './hero-rest.mjs';
import { readBvh, samplePositions } from './bvh.mjs';
import { readSomaJson } from './soma-json.mjs';
import { retarget, heroFk, normaliseSource } from './retarget.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const kind = process.argv[2] ?? 'walk';
const LAB = process.env.MOTIONBRICKS_LAB ?? 'C:/Users/libde/motionbricks-lab/motionbricks';
const clips = { walk: 'Neutral_walk_forward_002__A057.bvh', run: 'run_loop_180_R_003__A326.bvh' };
const hero = loadHeroRest(path.resolve(here, '../../public/assets/iso/alexei-10.glb'));
const map = JSON.parse(fs.readFileSync(path.join(here, 'soma-map.json'), 'utf8'));
const si = process.argv.indexOf('--soma');
let frames;
if (si > 0) frames = readSomaJson(process.argv[si + 1]).frames;
else { const bvh = readBvh(`${LAB}/assets/motions/soma/locomotion/bs_1d_linear/${clips[kind]}`); frames = samplePositions(bvh, 30, 0, Math.min(bvh.frames * bvh.dt, 8)); }
const r = retarget(hero, map, frames, { fps: 30 });
const src = normaliseSource(frames, 30).frames;
const k = r.stats.scale;
// [hero joint, SOMA joint, hero chain root, SOMA chain root]: vectors from the chain's own root joint, so the rigs' different hip origin does not count as error
const pairs = [['foot_l', 'LeftFoot', 'thigh_l', 'LeftLeg'], ['foot_r', 'RightFoot', 'thigh_r', 'RightLeg'], ['calf_l', 'LeftShin', 'thigh_l', 'LeftLeg'], ['hand_l', 'LeftHand', 'upperarm_l', 'LeftArm'], ['hand_r', 'RightHand', 'upperarm_r', 'RightArm'], ['lowerarm_l', 'LeftForeArm', 'upperarm_l', 'LeftArm'], ['head', 'Head', 'spine_03', 'Chest'], ['spine_03', 'Chest', 'pelvis', 'Hips']];
const err = Object.fromEntries(pairs.map(([a]) => [a, []]));
const ank = { l: [], r: [] };
const range = [si > 0 ? 30 : kind === 'run' ? 2 : 30, r.quats.length];
for (let i = range[0]; i < range[1]; i++) {
  const hp = heroFk(hero, r.order, r.quats[i], new T.Vector3());
  const ph = hp.get('pelvis'), sh = src[i].get('Hips');
  for (const [a, s, ra, rs] of pairs) {
    const hv = hp.get(a).clone().sub(hp.get(ra)), sv = src[i].get(s).clone().sub(src[i].get(rs)).multiplyScalar(k);
    err[a].push(hv.distanceTo(sv));
  }
  const root = r.pelvisLocal[i].clone().applyMatrix4(new T.Matrix4().compose(hero.bones.get('Root').pos, hero.bones.get('Root').worldQ, new T.Vector3(1, 1, 1)));
  void root;
  const world = (n) => hp.get(n).clone().add(new T.Vector3(0, 0, 0));
  ank.l.push(world('foot_l').add(r.pelvisLocal[i].clone().applyQuaternion(hero.rootQ).sub(hp.get('pelvis')).add(hp.get('pelvis')).sub(hp.get('pelvis'))));
  ank.r.push(world('foot_r'));
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`== ${kind}: hero scale ${k.toFixed(3)}, speed ${r.stats.heroSpeed.toFixed(2)} m/s`);
console.log('hips-relative joint position error vs source (cm): mean / max');
for (const [a] of pairs) console.log('  ' + a.padEnd(11), (mean(err[a]) * 100).toFixed(1).padStart(5), (Math.max(...err[a]) * 100).toFixed(1).padStart(5));

// foot sliding: planted = ankle within 2 cm of the lowest ankle height; in place its horizontal speed should equal the walking speed
const dt = 1 / 30, speed = r.stats.heroSpeed;
const lowest = Math.min(...r.pelvisLocal.map((p, i) => 0 + hero.bones.get('foot_l').pos.y)); void lowest;
let slide = [], planted = 0, total = 0;
for (const side of ['foot_l', 'foot_r']) {
  const traj = [];
  for (let i = range[0]; i < r.quats.length; i++) {
    const hp = heroFk(hero, r.order, r.quats[i], new T.Vector3());
    const pw = r.pelvisLocal[i].clone().applyMatrix4(new T.Matrix4().compose(new T.Vector3(), new T.Quaternion(), new T.Vector3(1, 1, 1))); void pw;
    const rootOff = r.pelvisLocal[i].clone().applyQuaternion(hero.rootQ);
    const rootRest = hp.get('pelvis');
    // world ankle = FK ankle - FK pelvis + world pelvis (pelvis world = Root world * local)
    const pelvisWorld = hero.rootWorld.clone().multiply(new T.Matrix4().makeTranslation(r.pelvisLocal[i].x, r.pelvisLocal[i].y, r.pelvisLocal[i].z));
    const pw2 = new T.Vector3().setFromMatrixPosition(pelvisWorld); void rootOff; void rootRest;
    traj.push(hp.get(side).clone().sub(hp.get('pelvis')).add(pw2));
  }
  const minY = Math.min(...traj.map(p => p.y));
  for (let i = 1; i < traj.length; i++) {
    total++;
    if (traj[i].y < minY + .05 && traj[i - 1].y < minY + .05) {
      planted++;
      const v = Math.hypot(traj[i].x - traj[i - 1].x, traj[i].z - traj[i - 1].z) / dt;
      slide.push(Math.abs(v - speed));
    }
  }
}
console.log(`planted-foot frames: ${planted}/${total}; in place the planted foot should move back at ${speed.toFixed(2)} m/s -> speed mismatch (= skating once the game moves the body at that speed): mean ${mean(slide).toFixed(2)} m/s, max ${Math.max(...slide).toFixed(2)} m/s`);
console.log('stats', JSON.stringify(r.stats.aimErrorDeg), 'ankle height range', r.stats.ankleHeightRange.map(v => +v.toFixed(3)));
