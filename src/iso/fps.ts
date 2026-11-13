import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Flame, fireFlicker } from './flame';
export { Flame } from './flame';

/** Eye heights in metres (hero is ~1.78 m tall). */
export const EYE_STAND = 1.64;
export const EYE_CROUCH = 1.25; // head height of the authored crouch pose + a few cm
const clamp = T.MathUtils.clamp;
const damp = T.MathUtils.damp;

/**
 * The first-person viewmodel: the hero's own skinned arms with their armature, rendered in a separate scene
 * with a fixed-FOV camera and a depth clear, so it never sinks into walls. Only the arms and sleeves are in the model.
 * The camera sits at the eye of that model (head bone), so the shoulders are behind the camera and the
 * arms enter the frame from below. Everything that moves (arms, fingers, the torch, the lighter, its lid and the flames) is a bone of that
 * armature, so every Blender action is one clip: torch_idle / torch_walk / torch_raise, torch_pickup, lighter_take, torch_ignite.
 */
export class ViewModel {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(64, 1, .01, 5);
  private readonly pivot = new T.Group();
  private readonly pivotBase = new T.Vector3();
  private readonly baseRot = new T.Euler(0, 0, 0, 'YXZ');       // the whole arm turned about the eye so that it enters the frame from the lower right
  /** Placement of the arms in camera space (metres, x right / y up / z back) and a base turn in degrees (pitch, yaw, roll). */
  place(x: number, y: number, z: number, pitch = 0, yaw = 0, roll = 0) { this.pivotBase.set(x, y, z); this.baseRot.set(T.MathUtils.degToRad(pitch), T.MathUtils.degToRad(yaw), T.MathUtils.degToRad(roll), 'YXZ'); }
  private readonly model = new T.Group();
  private mixer?: T.AnimationMixer;
  private idle?: T.AnimationAction; private walk?: T.AnimationAction; private raise?: T.AnimationAction;
  /** Authored clips that take the arms over while they play. */
  private pickup?: T.AnimationAction; private ignite?: T.AnimationAction; private lighter?: T.AnimationAction;
  pickupT = -1;                       // seconds into the clip, -1 = not playing
  igniteT = -1; lighterT = -1;
  private onFlame?: () => void; private onLighter?: () => void; private flameFired = false; private lighterFired = false;
  private targetSeen = false;
  /** The clip's own arm rotations, evaluated by hand: the mixer skips writing values that did not change, which would let the IK feed on itself. */
  private pickupArm: { bone: T.Object3D; interp: T.Interpolant }[] = [];
  readonly pickupNominal = new T.Matrix4();   // where the clip stands the torch (viewmodel space)
  private upCam = new T.Vector3(0, 1, 0);
  private flameNode?: T.Object3D; private lighterFlameNode?: T.Object3D;
  private torchFlame?: Flame; private lighterFlame?: Flame;
  private litBlend = 0; private lit = false; private flameTime = 0;
  private readonly headMats: T.MeshStandardMaterial[] = [];
  private fireLight?: T.PointLight;                 // the flame lights the hands and the torch head in the viewmodel scene
  private leftArm?: T.Object3D;                      // only the lighting clip needs the left arm: otherwise it is folded to nothing so its sleeve does not hang in the corner
  private lagYaw = 0; private lagPitch = 0; private prevYaw = 0; private prevPitch = 0; private started = false;
  private shown = 0; private wasShown = false; private raiseT = 9; private walkW = 0; private rig?: T.Object3D;
  private readonly tmp = new T.Vector3();
  // --- hand interaction (reach IK, finger blend, carried prop) ---
  private arm?: { upper: T.Object3D; lower: T.Object3D; hand: T.Object3D };
  private readonly fingers: { bone: T.Object3D; rest: T.Quaternion; grip: T.Quaternion }[] = [];
  private readonly heldNodes: T.Object3D[] = [];
  /** hand bone -> torch in the authored hold pose (viewmodel space). */
  private readonly gripRel = new T.Matrix4();
  private readonly reachTarget = new T.Matrix4();
  private reachW = 0; private gripW = 1; private carrying = true; private fovMatch = 0; private mainFov = 74; private baseFov = 64;
  /** A sheet of paper held in the right hand while a document is read. `paperHold` follows the hand's grip frame; the sheet's own pose in it is `paper`. */
  readonly paperHold = new T.Group();
  readonly paper: T.Mesh;
  paperW = 0;
  ready = false;

  constructor(source?: { scene: T.Object3D; animations: T.AnimationClip[] }) {
    this.scene.add(this.camera, this.pivot);
    this.paperHold.matrixAutoUpdate = false; this.paperHold.visible = false;
    this.paper = new T.Mesh(new T.PlaneGeometry(.21, .297), new T.MeshStandardMaterial({ color: 0x8f8872, roughness: .95, metalness: 0, side: T.DoubleSide }));
    this.paper.position.set(.0, .12, .0); this.paper.scale.setScalar(.8);
    this.paperHold.add(this.paper); this.scene.add(this.paperHold);
    this.pivot.add(this.model);
    this.scene.add(new T.HemisphereLight(0xfff2dc, 0x25272c, 1.5));
    const key = new T.DirectionalLight(0xffe2b8, 2.0); key.position.set(-.6, 1, .8); this.scene.add(key);
    if (!source) return;
    const rig = clone(source.scene);
    rig.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      o.frustumCulled = false; o.castShadow = o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map(m => { if (m.name !== 'Torch_head') return m; const c = (m as T.MeshStandardMaterial).clone(); this.headMats.push(c); return c; });
      o.material = Array.isArray(o.material) ? cloned : cloned[0]!;
    });
    this.rig = rig;
    this.model.add(rig);
    this.mixer = new T.AnimationMixer(rig);
    const act = (name: string) => { const c = T.AnimationClip.findByName(source.animations, name); return c ? this.mixer!.clipAction(c) : undefined; };
    this.idle = act('torch_idle'); this.walk = act('torch_walk'); this.raise = act('torch_raise');
    this.pickup = act('torch_pickup'); this.ignite = act('torch_ignite'); this.lighter = act('lighter_take');
    if (this.pickup) this.pickupArm = ['upperarm_r', 'lowerarm_r', 'hand_r'].flatMap(n => {
      const tr = this.pickup!.getClip().tracks.find(t => t.name === `${n}.quaternion`), bone = rig.getObjectByName(n);
      return tr && bone ? [{ bone, interp: (tr as unknown as { createInterpolant(): T.Interpolant }).createInterpolant() }] : [];
    });
    for (const a of [this.pickup, this.ignite, this.lighter]) if (a) { a.setLoop(T.LoopOnce, 1); a.clampWhenFinished = true; a.play().setEffectiveWeight(0); a.timeScale = 0; }
    if (!this.idle) return;
    // The model's bind pose is a T-pose with flat fingers: the relaxed open hand is the one the pickup clip starts with (a few frames before the grasp).
    rig.traverse(o => {
      if (/^(index|middle|ring|pinky|thumb)_0[123]_r$/.test(o.name)) this.fingers.push({ bone: o, rest: o.quaternion.clone(), grip: o.quaternion.clone() });
    });
    if (this.pickup) for (const f of this.fingers) { const tr = this.pickup.getClip().tracks.find(t => t.name === `${f.bone.name}.quaternion`); if (tr) f.rest.fromArray(tr.values, 4 * 8); }
    const upper = rig.getObjectByName('upperarm_r'), lower = rig.getObjectByName('lowerarm_r'), hand = rig.getObjectByName('hand_r');
    if (upper && lower && hand) this.arm = { upper, lower, hand };
    this.idle.play().setEffectiveWeight(1);
    this.walk?.play().setEffectiveWeight(0);
    if (this.raise) { this.raise.setLoop(T.LoopOnce, 1); this.raise.clampWhenFinished = true; this.raise.play().setEffectiveWeight(0); }
    this.mixer.update(0); rig.updateMatrixWorld(true);
    // The clips hold the fingers still, so the mixer will not rewrite them: keep the authored grip ourselves.
    for (const f of this.fingers) f.grip.copy(f.bone.quaternion);
    // Eye = head bone plus a little up. The rig is placed so that point is the camera origin (the model faces +Z, the camera looks down -Z, so the model is turned half a turn).
    const head = rig.getObjectByName('head');
    const eye = (head ? head.getWorldPosition(new T.Vector3()) : new T.Vector3(0, 1.6, 0)).add(new T.Vector3(0, .05, 0));
    rig.position.sub(eye);
    this.place(0.0, 0.06, -0.30, -14, 20, 0);   // the forearm sweeps in from the lower right, the torch head with its flame is in the frame
    this.model.rotation.y = Math.PI;
    // The torch and the lighters hang on helper bones (prop_*), the flames on flame_* bones: the clips move and scale them.
    this.leftArm = rig.getObjectByName('upperarm_l');
    const body = rig.getObjectByName('prop_torch');
    this.flameNode = rig.getObjectByName('flame_torch'); this.lighterFlameNode = rig.getObjectByName('flame_lighter_l');
    if (this.flameNode) { this.torchFlame = new Flame(.34, 0, 16); this.flameNode.add(this.torchFlame.root); }
    if (this.lighterFlameNode) { this.lighterFlame = new Flame(.045, 1.7, 0); this.lighterFlameNode.add(this.lighterFlame.root); }
    this.fireLight = new T.PointLight(0xff9a3c, 0, 2.4, 1.6); this.scene.add(this.fireLight);
    if (body) {
      this.heldNodes.push(body);
      if (this.arm) {
        this.scene.updateMatrixWorld(true);
        this.gripRel.copy(this.arm.hand.matrixWorld).invert().multiply(body.matrixWorld);
        if (this.pickup) {
          // where the clip stands the torch: evaluate it at time 0 with only the pickup clip on
          this.idle!.setEffectiveWeight(0); this.pickup.setEffectiveWeight(1);
          this.pickup.time = 0; this.mixer!.update(0); this.scene.updateMatrixWorld(true);
          this.pickupNominal.copy(this.pivot.matrixWorld).invert().multiply(body.matrixWorld);
          this.pickup.setEffectiveWeight(0); this.idle!.setEffectiveWeight(1);
          this.mixer!.update(0); this.scene.updateMatrixWorld(true);
        }
      }
    }
    this.ready = true;
    this.pivot.visible = false;
  }

  private get clipActive() { return this.pickupT >= 0 || this.igniteT >= 0 || this.lighterT >= 0; }

  update(i: { dt: number; time: number; yaw: number; pitch: number; hold: number; press: number; kick: number; speed: number; run: boolean; lit?: boolean }) {
    if (!this.ready || !this.mixer) return;
    const dt = clamp(i.dt, 0, .1);
    this.flameTime += dt;
    const lit = !!i.lit;
    if (lit && !this.lit && this.igniteT < 0) this.litBlend = 1;       // a torch that is already burning (a loaded game, picked up burning) shows its flame at once
    this.lit = lit;
    this.litBlend = lit ? Math.min(1, this.litBlend + dt / .35) : 0;
    this.shown = damp(this.shown, this.clipActive ? 1 : i.hold, 7, dt);
    const on = i.hold > .5;
    if (on && !this.wasShown && this.raise && !this.clipActive) { this.raise.reset(); this.raise.play(); this.raiseT = 0; }
    this.wasShown = on;
    this.pivot.visible = this.shown > .015;
    // Blend idle / walk by ground speed; the raise clip takes over for half a second after pickup.
    const moving = clamp((i.speed - .15) / .8, 0, 1);
    this.walkW = damp(this.walkW, moving, 8, dt);
    this.walk?.setEffectiveWeight(this.walkW); this.idle?.setEffectiveWeight(1 - this.walkW);
    if (this.walk) this.walk.timeScale = clamp(i.speed / 1.4, .6, 1.9);
    if (this.raise) {
      this.raiseT += dt;
      const dur = this.raise.getClip().duration;
      this.raise.setEffectiveWeight(this.raiseT < dur ? 1 : Math.max(0, 1 - (this.raiseT - dur) / .12));
    }
    // An authored clip replaces idle / walk / raise while it plays and fades back out in its last tenth of a second.
    const play = (act: T.AnimationAction | undefined, t: number) => {
      if (!act) return -1;
      const dur = act.getClip().duration, tc = Math.min(t, dur);
      act.time = tc;
      const w = t < dur ? Math.min(1, t / .12) : Math.max(0, 1 - (t - dur) / .1);
      act.setEffectiveWeight(w);
      this.idle?.setEffectiveWeight(1 - w); this.walk?.setEffectiveWeight(0); this.raise?.setEffectiveWeight(0);
      return t >= dur + .1 ? -1 : t;
    };
    if (this.pickupT >= 0) { this.pickupT += dt; this.pickupT = play(this.pickup, this.pickupT); if (this.pickupT < 0) { this.pickup?.setEffectiveWeight(0); this.idle?.setEffectiveWeight(1); } }
    if (this.igniteT >= 0) {
      this.igniteT += dt;
      if (!this.flameFired && this.igniteT >= 60 / 24) { this.flameFired = true; this.onFlame?.(); }
      this.igniteT = play(this.ignite, this.igniteT);
      if (this.igniteT < 0) { this.ignite?.setEffectiveWeight(0); this.idle?.setEffectiveWeight(1); if (!this.flameFired) { this.flameFired = true; this.onFlame?.(); } }
    }
    if (this.lighterT >= 0) {
      this.lighterT += dt;
      if (!this.lighterFired && this.lighterT >= 12 / 24) { this.lighterFired = true; this.onLighter?.(); }
      this.lighterT = play(this.lighter, this.lighterT);
      if (this.lighterT < 0) { this.lighter?.setEffectiveWeight(0); this.idle?.setEffectiveWeight(1); if (!this.lighterFired) { this.lighterFired = true; this.onLighter?.(); } }
    }
    this.mixer.update(dt);
    const dyaw = this.started ? Math.atan2(Math.sin(i.yaw - this.prevYaw), Math.cos(i.yaw - this.prevYaw)) : 0;
    const dpitch = this.started ? i.pitch - this.prevPitch : 0;
    this.prevYaw = i.yaw; this.prevPitch = i.pitch; this.started = true;
    // The arm trails the turn a little and settles back.
    this.lagYaw = damp(this.lagYaw + dyaw * .9, 0, 6, dt);
    this.lagPitch = damp(this.lagPitch + dpitch * .9, 0, 6, dt);
    const out = 1 - this.shown, push = Math.sin(Math.PI * clamp(i.press, 0, 1)), reach = Math.sin(Math.PI * clamp(i.kick, 0, 1));
    this.pivot.position.set(clamp(this.lagYaw, -.1, .1) * .5, -out * .35 - push * .006 - clamp(this.lagPitch, -.08, .08) * .4, -reach * .1);
    this.pivot.position.add(this.pivotBase);
    this.pivot.rotation.set(this.lagPitch * .5 + out * .5 + this.baseRot.x, this.lagYaw * .6 + this.baseRot.y, -out * .2 + this.baseRot.z, 'YXZ');
    this.pivot.updateMatrixWorld(true);
    // Fingers: open relaxed hand <-> authored grip (only while no authored clip drives the fingers).
    if (!this.clipActive) for (const f of this.fingers) f.bone.quaternion.copy(f.grip).slerp(f.rest, (1 - this.gripW) * .92);
    // The flame of a burning torch stays at full size after the lighting clip; the clip's own scale only matters while it grows.
    if (this.flameNode) {
      const ts = this.flameNode.scale.x;
      this.flameNode.scale.setScalar(Math.max(ts <= 2e-4 ? 0 : ts, this.litBlend));
      this.torchFlame?.update(this.flameTime, this.flameNode.scale.x);
      if (this.torchFlame) this.torchFlame.root.visible = this.flameNode.scale.x > .02;
    }
    if (this.lighterFlameNode) {
      this.lighterFlame?.update(this.flameTime, this.lighterFlameNode.scale.x);
      if (this.lighterFlame) this.lighterFlame.root.visible = this.lighterFlameNode.scale.x > .02;
    }
    // The wrapped head is charred dark until the flame catches, then glows.
    const burn = this.flameNode ? clamp(this.flameNode.scale.x, 0, 1) : 0;
    for (const m of this.headMats) { m.color.setScalar(.12 + .88 * burn); m.emissive.setRGB(1, .42, .12); m.emissiveIntensity = burn * .9; }
    this.leftArm?.scale.setScalar(this.igniteT >= 0 ? 1 : 1e-4);
    this.rig?.updateMatrixWorld(true);
    if (this.fireLight) {
      const f = this.flamePose();
      if (f) { this.fireLight.position.copy(f.position); this.fireLight.intensity = .28 * f.level * fireFlicker(this.flameTime); this.fireLight.color.setHSL(.072 + .012 * (fireFlicker(this.flameTime, 3) - 1), 1, .58); }
      else this.fireLight.intensity = 0;
    }
    if (this.pickupT >= 0) this.solvePickup(); else if (this.reachW > .001) this.solveReach();
    this.paperHold.visible = this.paperW > .01;
    if (this.paperHold.visible) { this.paperHold.matrix.copy(this.reachTarget); this.paperHold.matrixWorldNeedsUpdate = true; }
    for (const n of this.heldNodes) n.visible = this.carrying;
    // While reaching into the world the hand is drawn with the main camera's field of view, so the hand and
    // the prop it touches line up on screen; it eases back to the fixed viewmodel FOV afterwards.
    const fov = T.MathUtils.lerp(this.baseFov, this.mainFov, this.fovMatch);
    if (Math.abs(this.camera.fov - fov) > .01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  /** The lighting clip: calls onFlame when the flame catches on the torch (the game then marks the torch as burning). */
  startIgnite(onFlame: () => void) {
    if (!this.ignite || !this.ready || this.clipActive) return false;
    this.igniteT = 0; this.flameFired = false; this.onFlame = onFlame; this.litBlend = 0; return true;
  }
  /** The take-the-lighter-from-the-drawer clip: calls onTaken when the fingers close on it. */
  startLighter(onTaken: () => void) {
    if (!this.lighter || !this.ready || this.clipActive) return false;
    this.lighterT = 0; this.lighterFired = false; this.onLighter = onTaken; return true;
  }
  get igniting() { return this.igniteT >= 0; }
  get lighterPlaying() { return this.lighterT >= 0; }

  /** Hand interaction input for this frame. target is the prop's pose in viewmodel (camera) space; the hand is pulled onto the grip that would hold the prop exactly there, by reach (0..1). */
  /** The sheet is held up (w = 0..1 how far it has been raised); it is drawn at the hand target given to setHand. */
  setPaper(w: number) { this.paperW = w; }
  setHand(f: { reach: number; grip: number; carrying: boolean; target?: T.Matrix4; up?: T.Vector3; fovMatch: number; mainFov: number }) {
    if (f.up) this.upCam.copy(f.up).normalize();
    this.reachW = f.target ? f.reach : 0; this.gripW = f.grip; this.carrying = f.carrying;
    if (f.target) { this.reachTarget.copy(f.target); this.targetSeen = true; }
    this.fovMatch = f.fovMatch; this.mainFov = f.mainFov;
  }

  /** How far from the eye the hand would be if it held a prop at target (camera space). */
  handDistanceFor(target: T.Matrix4) {
    return new T.Vector3().setFromMatrixPosition(target.clone().multiply(this.gripRel.clone().invert())).length();
  }

  /** Pose of the held prop in viewmodel (camera) space, e.g. to drop it where the hand is. */
  heldMatrix() {
    const n = this.heldNodes[0];
    if (!n) return undefined;
    this.pivot.updateMatrixWorld(true);
    return n.matrixWorld.clone();
  }

  /** Two-bone IK (upper arm, forearm) with the hand oriented onto the prop; leans in when the prop is out of reach. */
  private solveReach() { this.solveTo(this.reachTarget.clone().multiply(this.gripRel.clone().invert()), this.reachW); }

  /**
   * The authored clip stands the torch at pickupNominal. The real torch stands elsewhere and turned some way about the vertical: the hand path
   * of the clip is moved there (shifted and turned about the nominal spot) while the hand is near the prop, and is the authored one before and after.
   */
  private solvePickup() {
    const a = this.arm, clip = this.pickup; if (!a || !clip) return;
    const dur = clip.getClip().duration, tc = Math.min(this.pickupT, dur);
    if (this.pickupT >= dur) return;
    for (const { bone, interp } of this.pickupArm) bone.quaternion.fromArray(interp.evaluate(tc) as ArrayLike<number>);
    this.rig?.updateMatrixWorld(true);
    const f = this.pickupT * 24;                            // clip frames
    const w = f < 4 ? 0 : f < 14 ? (f - 4) / 10 : f < 24 ? 1 : f < 40 ? 1 - (f - 24) / 16 : 0;
    if (!this.targetSeen || w <= 0) return;
    const nomM = this.pivot.matrixWorld.clone().multiply(this.pickupNominal);          // the clip's torch spot, in camera space now
    const nom = new T.Vector3().setFromMatrixPosition(nomM), act = new T.Vector3().setFromMatrixPosition(this.reachTarget);
    const dir = (m: T.Matrix4) => { const d = new T.Vector3(1, 0, 0).transformDirection(m); d.addScaledVector(this.upCam, -d.dot(this.upCam)); return d.normalize(); };
    const hn = dir(nomM), ha = dir(this.reachTarget);
    let yaw = Math.atan2(new T.Vector3().crossVectors(hn, ha).dot(this.upCam), hn.dot(ha));
    yaw = clamp(yaw, -1.4, 1.4);
    const delta = new T.Matrix4().makeTranslation(act.x * w + nom.x * (1 - w), act.y * w + nom.y * (1 - w), act.z * w + nom.z * (1 - w))
      .multiply(new T.Matrix4().makeRotationAxis(this.upCam, yaw * w)).multiply(new T.Matrix4().makeTranslation(-nom.x, -nom.y, -nom.z));
    this.solveTo(delta.multiply(a.hand.matrixWorld.clone()), 1);
  }

  /** Start the authored take-the-torch-from-the-wall motion. The prop's pose comes with setHand (target) while it plays. */
  startPickup() { if (this.pickup && this.ready && !this.clipActive) { this.pickupT = 0; this.targetSeen = false; return true; } return false; }
  get pickupPlaying() { return this.pickupT >= 0; }

  private solveTo(goal: T.Matrix4, w: number) {
    const a = this.arm; if (!a) return;
    const gp = new T.Vector3(), gq = new T.Quaternion(), gs = new T.Vector3();
    goal.decompose(gp, gq, gs);
    const hp = a.hand.getWorldPosition(new T.Vector3()), hq = a.hand.getWorldQuaternion(new T.Quaternion());
    const P = hp.clone().lerp(gp, w), Q = hq.clone().slerp(gq, w);
    let S = a.upper.getWorldPosition(new T.Vector3());
    const E0 = a.lower.getWorldPosition(new T.Vector3());
    const L1 = S.distanceTo(E0), L2 = E0.distanceTo(hp), maxR = (L1 + L2) * .985;
    const toP = P.clone().sub(S);
    if (toP.length() > maxR) {
      // Out of reach: the body leans in (the whole arm rig moves) instead of the arm stretching.
      this.pivot.position.add(toP.clone().setLength(Math.min(toP.length() - maxR, .16)));
      this.pivot.updateMatrixWorld(true);
      S = a.upper.getWorldPosition(new T.Vector3());
    }
    const E = a.lower.getWorldPosition(new T.Vector3());
    const d = Math.min(P.distanceTo(S), maxR), dir = P.clone().sub(S).normalize();
    const cosA = T.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const bend = E.clone().sub(S); bend.sub(dir.clone().multiplyScalar(bend.dot(dir)));
    if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0);
    bend.normalize();
    const elbow = S.clone().add(dir.clone().multiplyScalar(L1 * cosA)).add(bend.multiplyScalar(L1 * sinA));
    const turn = (bone: T.Object3D, from: T.Vector3, to: T.Vector3) => {
      const dq = new T.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
      const wq = bone.getWorldQuaternion(new T.Quaternion()), pq = bone.parent!.getWorldQuaternion(new T.Quaternion());
      bone.quaternion.copy(pq.invert().multiply(dq.multiply(wq)));
      bone.updateMatrixWorld(true);
    };
    turn(a.upper, E.clone().sub(S), elbow.clone().sub(S));
    const E2 = a.lower.getWorldPosition(new T.Vector3()), H2 = a.hand.getWorldPosition(new T.Vector3());
    turn(a.lower, H2.clone().sub(E2), P.clone().sub(E2));
    const pq = a.hand.parent!.getWorldQuaternion(new T.Quaternion());
    a.hand.quaternion.copy(pq.invert().multiply(Q));
    a.hand.updateMatrixWorld(true);
  }

  /** True while the arms are on screen. */
  get shownNow() { return this.ready && this.pivot.visible; }

  /** The burning flame in the camera space of the main view (for the light) and how strong it is, 0..1; undefined while nothing burns in the hand. */
  flamePose() {
    if (!this.ready || !this.pivot.visible) return undefined;
    this.pivot.updateMatrixWorld(true);
    const torch = this.flameNode && this.carrying ? this.flameNode.scale.x : 0;
    const lighter = this.lighterFlameNode ? this.lighterFlameNode.scale.x * .35 : 0;
    const node = torch >= lighter ? this.flameNode : this.lighterFlameNode, level = Math.max(torch, lighter);
    if (!node || level < .05) return undefined;
    const position = node.getWorldPosition(this.tmp.clone()).add(new T.Vector3(0, node === this.flameNode ? .05 : .02, 0));
    return { position, level: Math.min(1.4, level) };
  }

  /** The horizontal field of view stays about 90 degrees, so the hand keeps its place in the lower right corner on any window shape. */
  setAspect(a: number) {
    if (Math.abs(this.camera.aspect - a) > 1e-4) {
      this.camera.aspect = a;
      this.baseFov = clamp(T.MathUtils.radToDeg(2 * Math.atan(Math.tan(Math.PI / 4) / a)), 50, 90);
      this.camera.fov = T.MathUtils.lerp(this.baseFov, this.mainFov, this.fovMatch);
      this.camera.updateProjectionMatrix();
    }
  }

  draw(renderer: T.WebGLRenderer) {
    if (!this.ready || !this.pivot.visible) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}

export type FpInput = {
  x: number; z: number;        // player position on the floor plan
  yaw: number; pitch: number;  // look direction; yaw 0 faces +Z
  speed: number;               // actual ground speed, m/s
  sprint: boolean; crouch: number; // crouch 0..1
  dt: number; time: number;
  hasLight: boolean; lightOn: boolean;
  /** Hand on screen (0/1) when the interaction system drives it; defaults to "holding the torch". */
  armShown?: number;
  /** The body bends toward something being picked up or put down (world offset of the eye, metres). */
  bend?: { x: number; y: number; z: number };
  press: number;               // 0..1 progress of a button press (1 = idle)
  kick: number;                // 0..1 interaction reach animation (1 = idle)
  grounded?: boolean;
};

/**
 * First-person camera rig: eye height, head bob, breathing and strafe roll. The hero body itself is
 * rendered by the actor (see `setFirstPerson`), so the arms and the held torch are the real model.
 */
export class FpRig {
  readonly camera = new T.PerspectiveCamera(74, 1, .05, 40);
  private bobPhase = 0;
  private eye = EYE_STAND;
  private prevYaw = 0; private prevPitch = 0;
  private roll = 0;
  private started = false;
  private syaw = 0; private spitch = 0;      // the look the camera really has: it follows the mouse a moment later and settles

  readonly vm: ViewModel;

  constructor(scene: T.Scene, model?: { scene: T.Object3D; animations: T.AnimationClip[] }) {
    this.vm = new ViewModel(model);
    this.camera.name = 'First-person eye';
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);
  }

  /** Eye position in world space (floor plan x/z and current eye height). */
  update(i: FpInput) {
    const dt = clamp(i.dt, 0, .1);
    const moving = i.speed > .15;
    const run = i.sprint && moving;
    // Eye height eases between standing and crouching.
    this.eye = damp(this.eye, T.MathUtils.lerp(EYE_STAND, EYE_CROUCH, i.crouch), 9, dt);
    // Walking cycle: one full left-right cycle per ~1.45 m (2.1 m when running).
    const stride = run ? 2.1 : i.crouch > .5 ? 1.2 : 1.45;
    if (moving) this.bobPhase = (this.bobPhase + dt * i.speed / stride) % 1;
    const amp = moving ? (run ? 1.7 : i.crouch > .5 ? .55 : 1) : 0;
    const w = T.MathUtils.smoothstep(i.speed, 0, 1.2);
    const bobY = (Math.abs(Math.sin(this.bobPhase * Math.PI * 2)) * .032 - .016) * amp * w;
    const bobX = Math.sin(this.bobPhase * Math.PI * 2) * .014 * amp * w;
    const breathe = Math.sin(i.time * 1.35) * .0022 * (1 - w);
    const sway = Math.sin(i.time * .62) * .0012 * (1 - w);
    // Slight head roll toward the foot that is down, and a lean when turning quickly.
    const turn = this.started ? clamp((i.yaw - this.prevYaw) / Math.max(dt, 1e-3), -6, 6) : 0;
    this.roll = damp(this.roll, Math.sin(this.bobPhase * Math.PI * 2) * .006 * amp * w - turn * .0035, 8, dt);
    // The head has mass: the camera follows the look with a short, critically damped lag instead of snapping to it.
    if (!this.started) { this.syaw = i.yaw; this.spitch = i.pitch; }
    const kk = 1 - Math.exp(-dt * 13);
    this.syaw += THREEangle(i.yaw - this.syaw) * kk; this.spitch += (i.pitch - this.spitch) * kk;
    // Breathing and a hand-held camera: a slow chest rise, shoulders drifting, small irregular shake; all of it stronger when standing than walking.
    const t = i.time, still = 1 - w;
    const breath = Math.sin(t * 1.45) * .5 + .5;
    const breathY = (breath - .5) * .012 * still, breathP = (breath - .5) * .0075 * still;
    const handYaw = (Math.sin(t * .83) + Math.sin(t * 2.17 + 1.1) * .6 + Math.sin(t * 3.9 + .4) * .25) * .0021 * (.5 + still);
    const handPitch = (Math.sin(t * .71 + 2) + Math.sin(t * 1.93) * .5 + Math.sin(t * 4.3 + 1.7) * .2) * .0017 * (.5 + still);
    const handRoll = Math.sin(t * .57) * .0045 * still + Math.sin(t * 1.31 + .6) * .0016;
    const sinY = Math.sin(this.syaw), cosY = Math.cos(this.syaw);
    // Offsets: side bob is applied along the camera's right vector (-cos, sin).
    // The camera sits just ahead of the (hidden) head so the real arms and torso stay in view.
    // In the crouch pose the head leans about 10 cm further forward.
    const lean = .13 + .1 * i.crouch; // just ahead of the hidden head: arms enter the view from below, not beside the eye
    this.camera.position.set(i.x - cosY * bobX + sinY * lean + (i.bend?.x ?? 0), this.eye + bobY + breathe + breathY + (i.bend?.y ?? 0), i.z + sinY * bobX + cosY * lean + (i.bend?.z ?? 0));
    this.camera.rotation.set(this.spitch + bobY * .12 + sway + breathP + handPitch, this.syaw + Math.PI + handYaw, this.roll + handRoll);
    this.camera.updateMatrixWorld(true);

    this.prevYaw = i.yaw; this.prevPitch = i.pitch; this.started = true;
    this.vm.update({ dt, time: i.time, yaw: i.yaw, pitch: i.pitch, hold: i.armShown ?? (i.hasLight ? 1 : 0), press: i.press, kick: i.kick, speed: i.speed, run, lit: i.lightOn });
    this.camera.updateMatrixWorld(true);
  }

  /** Flame position in world space (from the viewmodel) and its strength, or undefined while nothing burns in the hand. */
  flamePose() {
    const f = this.vm.flamePose();
    if (!f) return undefined;
    this.camera.updateMatrixWorld(true);
    return { position: this.camera.localToWorld(f.position.clone()), level: f.level };
  }

  setAspect(aspect: number) {
    this.vm.setAspect(aspect);
    if (Math.abs(this.camera.aspect - aspect) > 1e-4) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  }

  dispose() {
    this.camera.removeFromParent();
  }
}

/** Shortest signed angle difference. */
function THREEangle(a: number) { return Math.atan2(Math.sin(a), Math.cos(a)); }
