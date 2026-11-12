// SOMA joint positions  ->  100GATE hero skeleton (local bone rotations + pelvis translation).
//
// "Frame transfer": for every mapped bone both sides define the same orthonormal frame from geometry
//   x = bone direction (joint -> aim child),  y = body lateral axis made orthogonal to x,  z = x cross y.
// The source frame is taken from the generated pose, the hero frame from the hero's rest pose, and the hero bone
// gets   W = F_src * F_rest^-1 * W_rest.   So every bone points exactly where the SOMA bone points, whatever the
// two rigs' rest poses (T-pose vs A-pose), bone axes or roll are. Bone lengths stay the hero's own.
// Limits of v0 (see docs/motionbricks/INTEGRATION_PLAN.md): the twist of limbs about their own axis is taken from the
// body lateral axis, not from the source; it becomes exact once SOMA's rest orientations (USD) are available.
import * as T from 'three';

const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

function basis(aim, lateral) {
  const x = aim.clone().normalize();
  const y = lateral.clone().sub(x.clone().multiplyScalar(lateral.dot(x)));
  if (y.lengthSq() < 1e-10) y.set(0, 0, 1).sub(x.clone().multiplyScalar(x.z));
  y.normalize();
  const z = V().crossVectors(x, y);
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
}

/** Rotate source frames so the average travel of the hips is +Z, keep left = +X; remove horizontal root travel. */
export function normaliseSource(frames, fps) {
  const first = frames[0].get('Hips'), last = frames.at(-1).get('Hips');
  const travel = V(last.x - first.x, 0, last.z - first.z);
  const yaw = travel.length() > 1e-3 ? Math.atan2(travel.x, travel.z) : 0;
  const q = new T.Quaternion().setFromAxisAngle(V(0, 1, 0), -yaw);
  const duration = (frames.length - 1) / fps;
  const out = frames.map((fr, i) => {
    const m = new Map();
    const h0 = fr.get('Hips');
    const trend = V(first.x + (last.x - first.x) * (i / (frames.length - 1)), 0, first.z + (last.z - first.z) * (i / (frames.length - 1)));
    for (const [k, p] of fr) m.set(k, p.clone().sub(V(trend.x, 0, trend.z)).sub(V(h0.x - trend.x, 0, h0.z - trend.z).multiplyScalar(0)).applyQuaternion(q));
    return m;
  });
  const left = out[0].get('LeftLeg').x - out[0].get('RightLeg').x;   // hip width: far larger than the shoulder-joint gap
  return { frames: out, speed: travel.length() / duration, leftIsPlusX: left > 0 };
}

export function retarget(hero, map, srcFrames, { fps = 30, scale } = {}) {
  for (const fr of srcFrames) for (const [virt, parts] of Object.entries(map.virtualJoints ?? {})) {
    if (parts.every(p => fr.has(p))) fr.set(virt, parts.reduce((s, p) => s.add(fr.get(p)), V()).multiplyScalar(1 / parts.length));
  }
  const { frames, speed, leftIsPlusX } = normaliseSource(srcFrames, fps);
  const B = n => hero.bones.get(n);
  // --- hero rest geometry
  const lateralRest = {
    pelvis: B(map.pelvisLateral.left).pos.clone().sub(B(map.pelvisLateral.right).pos),
    chest: B(map.chestLateral.left).pos.clone().sub(B(map.chestLateral.right).pos),
  };
  // The head has no end bone: its aim is the hero's rest "up" (the head sits upright in the rest pose, the neck leans).
  const heroAimRest = e => e.heroAimVector ? V(...e.heroAimVector) : B(e.heroAim).pos.clone().sub(B(e.hero).pos);
  const restFrame = new Map(map.bones.map(e => [e.hero, basis(heroAimRest(e), lateralRest[e.lateral])]));

  const soma0 = frames[0];
  const somaLeg = soma0.get('LeftLeg').distanceTo(soma0.get('LeftShin')) + soma0.get('LeftShin').distanceTo(soma0.get('LeftFoot'));
  const heroLeg = B('thigh_l').pos.distanceTo(B('calf_l').pos) + B('calf_l').pos.distanceTo(B('foot_l').pos);
  const k = scale ?? heroLeg / somaLeg;

  // --- hierarchy order for FK
  const depth = n => { let d = 0; for (let p = B(n).parent; p; p = B(p)?.parent) d++; return d; };
  const order = [...hero.bones.keys()].sort((a, b) => depth(a) - depth(b));
  const mapped = new Map(map.bones.map(e => [e.hero, e]));

  const quats = [], pelvisWorld = [], aimErr = [], ankles = [];
  const rootInv = hero.rootWorld.clone().invert();
  for (const fr of frames) {
    const lat = {
      pelvis: fr.get(map.pelvisLateral.somaLeft).clone().sub(fr.get(map.pelvisLateral.somaRight)),
      chest: fr.get(map.chestLateral.somaLeft).clone().sub(fr.get(map.chestLateral.somaRight)),
    };
    if (!leftIsPlusX) { lat.pelvis.negate(); lat.chest.negate(); }
    const world = new Map(), local = new Map();
    for (const name of order) {
      const b = B(name), e = mapped.get(name);
      const parentW = b.parent ? world.get(b.parent) : hero.rootQ;
      let W;
      if (e) {
        const aim = fr.get(e.somaAim).clone().sub(fr.get(e.soma));
        const Fs = basis(aim, lat[e.lateral]);
        W = Fs.multiply(restFrame.get(name).clone().invert()).multiply(b.worldQ);
      } else {
        // not driven (fingers, toes, Root ...): keeps its rest orientation relative to its parent
        const parentRest = b.parent ? B(b.parent).worldQ : hero.rootQ;
        W = parentW.clone().multiply(parentRest.clone().invert().multiply(b.worldQ));
      }
      world.set(name, W);
      local.set(name, parentW.clone().invert().multiply(W));
    }
    quats.push(local);

    // --- pelvis translation: sway from the source, height from the source scaled to the hero's legs
    const h = fr.get('Hips');
    pelvisWorld.push(V(h.x * k, h.y * k, h.z * k));

    // --- how well does each hero bone follow its source bone (angle between the two bone directions)
    const heroPos = heroFk(hero, order, quats.at(-1), V(0, 0, 0));
    const py = heroPos.get('pelvis').y;
    ankles.push([heroPos.get('foot_l').y - py, heroPos.get('foot_r').y - py]);   // ankle height relative to the pelvis
    for (const e of map.bones) {
      if (e.heroAimVector) continue;
      const a = heroPos.get(e.heroAim).clone().sub(heroPos.get(e.hero)).normalize();
      const s = fr.get(e.somaAim).clone().sub(fr.get(e.soma)).normalize();
      aimErr.push(Math.acos(Math.min(1, a.dot(s))) * 180 / Math.PI);
    }
  }
  // Ground the whole clip: the lowest ankle of the clip stands on the hero's rest ankle height. Keep the vertical motion
  // of the source (bob, flight phases) instead of snapping every frame.
  const restAnkle = Math.min(B('foot_l').pos.y, B('foot_r').pos.y);
  const lowest = Math.min(...ankles.map((a, i) => Math.min(a[0], a[1]) + pelvisWorld[i].y));
  const lift = restAnkle - lowest;
  const meanXZ = pelvisWorld.reduce((s, p) => s.add(V(p.x, 0, p.z)), V()).multiplyScalar(1 / pelvisWorld.length);
  const rootPos = pelvisWorld.map(p => V(p.x - meanXZ.x, p.y + lift, p.z - meanXZ.z));

  // pelvis local translation relative to the Root bone
  const pelvis = B('pelvis');
  const rootW = pelvis.parent ? new T.Matrix4().compose(B(pelvis.parent).pos, B(pelvis.parent).worldQ, V(1, 1, 1)) : hero.rootWorld.clone();
  const rootWInv = rootW.clone().invert();
  const pelvisLocal = rootPos.map(p => p.clone().applyMatrix4(rootWInv));
  void rootInv;

  const stats = {
    frames: frames.length, scale: k, sourceSpeed: speed, heroSpeed: speed * k, leftIsPlusX,
    aimErrorDeg: { mean: aimErr.reduce((a, b) => a + b, 0) / aimErr.length, max: Math.max(...aimErr) },
    ankleHeightRange: [Math.min(...ankles.flatMap((a, i) => a.map(v => v + rootPos[i].y))), Math.max(...ankles.flatMap((a, i) => a.map(v => v + rootPos[i].y)))],
    restAnkleHeight: restAnkle,
  };
  return { fps, quats, pelvisLocal, rootPos, rootW, stats, order };
}

/** Hero FK: world joint positions for one pose (local rotations), pelvis translated to `pelvisPos` (hero world). */
export function heroFk(hero, order, locals, pelvisOffsetWorld) {
  const out = new Map(), W = new Map();
  for (const name of order) {
    const b = hero.bones.get(name);
    const parent = b.parent ? hero.bones.get(b.parent) : undefined;
    const pm = parent ? W.get(b.parent) : new T.Matrix4();
    const lp = b.localPos.clone();
    const m = new T.Matrix4().compose(lp, locals.get(name), V(1, 1, 1));
    const w = parent ? pm.clone().multiply(m) : hero.rootWorld.clone().multiply(m);
    W.set(name, w);
    out.set(name, V().setFromMatrixPosition(w).add(pelvisOffsetWorld));
  }
  return out;
}

/** Plain JSON clip that THREE.AnimationClip.parse understands. Tracks: <bone>.quaternion for every driven bone + pelvis.position. */
export function toClipJson(name, result, hero, map, { start = 0, count } = {}) {
  const n = count ?? result.quats.length - start, times = Array.from({ length: n }, (_, i) => +(i / result.fps).toFixed(5));
  const tracks = [];
  const driven = new Set(map.bones.map(e => e.hero));
  for (const bone of driven) {
    const vals = [];
    for (let i = 0; i < n; i++) { const q = result.quats[start + i].get(bone); vals.push(+q.x.toFixed(6), +q.y.toFixed(6), +q.z.toFixed(6), +q.w.toFixed(6)); }
    tracks.push({ name: bone + '.quaternion', type: 'quaternion', times, values: vals });
  }
  // One loop: remove whatever horizontal drift the pelvis has over this window (the game moves the body), keep its sway and bob.
  const a = result.rootPos[start], b = result.rootPos[Math.min(result.rootPos.length - 1, start + n)];
  const slope = V((b.x - a.x) / n, 0, (b.z - a.z) / n);
  const loop = Array.from({ length: n }, (_, i) => V(result.rootPos[start + i].x - slope.x * i, result.rootPos[start + i].y, result.rootPos[start + i].z - slope.z * i));
  const mean = loop.reduce((s, p) => s.add(V(p.x, 0, p.z)), V()).multiplyScalar(1 / n);
  const inv = result.rootW.clone().invert();
  const pv = [];
  for (let i = 0; i < n; i++) { const p = V(loop[i].x - mean.x, loop[i].y, loop[i].z - mean.z).applyMatrix4(inv); pv.push(+p.x.toFixed(5), +p.y.toFixed(5), +p.z.toFixed(5)); }
  tracks.push({ name: 'pelvis.position', type: 'vector', times, values: pv });
  void hero;
  return { name, duration: +(n / result.fps).toFixed(5), tracks, blendMode: 2500 };
}

/** Find the length (in frames) of one gait cycle: the shift at which hands/feet (relative to the hips) repeat best. */
export function findCycle(result, hero, fromFrame, minFrames, maxFrames) {
  const feats = result.quats.map(q => {
    const p = heroFk(hero, result.order, q, V());
    const o = p.get('pelvis');
    return ['foot_l', 'foot_r', 'hand_l', 'hand_r', 'head'].flatMap(n => { const d = p.get(n).clone().sub(o); return [d.x, d.y, d.z]; });
  });
  let best = { len: minFrames, err: Infinity };
  for (let len = minFrames; len <= maxFrames && fromFrame + len + 6 <= feats.length; len++) {
    let e = 0;
    for (let j = 0; j < 6; j++) { const a = feats[fromFrame + j], b = feats[fromFrame + len + j]; for (let i = 0; i < a.length; i++) e += (a[i] - b[i]) ** 2; }
    if (e < best.err) best = { len, err: e };
  }
  return best;
}
