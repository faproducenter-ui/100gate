// node tools/motionbricks/make-clip.mjs walk|run [--bvh path]
// Stand-in generator: retargets a SOMA BVH clip (the same joint data MotionBricks outputs) onto the hero and writes
// tools/motionbricks/out/<name>.clip.json plus a report. The MotionBricks runtime replaces only the BVH reading.
import fs from 'node:fs';
import path from 'node:path';
import { loadHeroRest } from './hero-rest.mjs';
import { readBvh, samplePositions } from './bvh.mjs';
import { readSomaJson } from './soma-json.mjs';
import { retarget, toClipJson, findCycle } from './retarget.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const kind = process.argv[2] ?? 'walk';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LAB = process.env.MOTIONBRICKS_LAB ?? 'C:/Users/libde/motionbricks-lab/motionbricks';
const clips = { walk: 'Neutral_walk_forward_002__A057.bvh', run: 'run_loop_180_R_003__A326.bvh' };
const bvhPath = arg('--bvh', `${LAB}/assets/motions/soma/locomotion/bs_1d_linear/${clips[kind]}`);

const hero = loadHeroRest(path.resolve(here, '../../public/assets/iso/alexei-10.glb'));
const map = JSON.parse(fs.readFileSync(path.join(here, 'soma-map.json'), 'utf8'));
const somaJson = arg('--soma', null);                // real MotionBricks output from lab/generate_locomotion.py
let frames, origin;
if (somaJson) {
  const s = readSomaJson(somaJson);
  frames = s.frames; origin = `MotionBricks ${path.basename(somaJson)} (${s.meta?.precision}, ${frames.length} frames @ ${s.fps} Hz)`;
} else {
  const bvh = readBvh(bvhPath);
  frames = samplePositions(bvh, 30, 0, Math.min(bvh.frames * bvh.dt, 8));
  origin = `STAND-IN ${path.basename(bvhPath)} (${bvh.joints.length} joints, ${bvh.frames} frames @ ${(1 / bvh.dt).toFixed(0)} Hz)`;
}
console.log('source:', origin);

const r = retarget(hero, map, frames, { fps: 30 });
const start = (somaJson || kind !== 'run') ? 30 : 2;               // walk: skip the first second (capture start-up)
const rng = arg('--range', null)?.split(',').map(Number) ?? (kind === 'run' ? [12, 34] : [18, 60]);
const cyc = findCycle(r, hero, arg('--start', null) ? +arg('--start') : start, ...rng);
const clip = toClipJson(kind, r, hero, map, { start, count: cyc.len });
const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `${arg('--name', kind)}.clip.json`), JSON.stringify({ ...clip, meta: { sourceSpeedMps: r.stats.heroSpeed, cycleFrames: cyc.len, cycleSeconds: cyc.len / 30, origin, license: arg('--own', null) ? 'targets: our own hero animation; model output under the NVIDIA Open Model Agreement (read it before shipping)' : somaJson ? 'MotionBricks output (model: NVIDIA Open Model Agreement); check that the target poses are not evaluation-licence samples before shipping' : 'stand-in: NVIDIA sample clip, evaluation use only, do not ship' } }));
console.log(JSON.stringify({ ...r.stats, cycleFrames: cyc.len, cycleSeconds: +(cyc.len / 30).toFixed(3), cycleSeamError: +cyc.err.toFixed(5) }, null, 1));
