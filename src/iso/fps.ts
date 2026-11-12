import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

/** Eye heights in metres (hero is ~1.78 m tall). */
export const EYE_STAND = 1.64;
export const EYE_CROUCH = 1.25; // head height of the authored crouch pose + a few cm
const clamp = T.MathUtils.clamp;
const damp = T.MathUtils.damp;

/**
 * The first-person viewmodel: the hero's own skinned body with its armature, rendered in a separate scene
 * with a fixed-FOV camera and a depth clear, so it never sinks into walls. Nothing is cut out of the mesh:
 * the faces that do not belong to the right arm sit in the `VM_hide` material and are simply not drawn.
 * The camera sits at the eye of that model (head bone), so the shoulder is behind the camera and the
 * arm enters the frame from the lower right. Poses come from the Blender actions flashlight_idle,
 * flashlight_walk and flashlight_raise.
 */
export class ViewModel {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(64, 1, .01, 5);
  private readonly pivot = new T.Group();
  private readonly model = new T.Group();
  private mixer?: T.AnimationMixer;
  private idle?: T.AnimationAction; private walk?: T.AnimationAction; private raise?: T.AnimationAction;
  private lensNode?: T.Object3D;
  private readonly lensLocal = new T.Vector3();
  private lagYaw = 0; private lagPitch = 0; private prevYaw = 0; private prevPitch = 0; private started = false;
  private shown = 0; private wasShown = false; private raiseT = 9; private walkW = 0; private rig?: T.Object3D;
  private readonly tmp = new T.Vector3();
  // --- hand interaction (reach IK, finger blend, carried prop) ---
  private arm?: { upper: T.Object3D; lower: T.Object3D; hand: T.Object3D };
  private readonly fingers: { bone: T.Object3D; rest: T.Quaternion; grip: T.Quaternion }[] = [];
  private readonly heldNodes: T.Object3D[] = [];
  /** hand bone → flashlight in the authored hold pose (viewmodel space). */
  private readonly gripRel = new T.Matrix4();
  private readonly reachTarget = new T.Matrix4();
  private reachW = 0; private gripW = 1; private carrying = true; private fovMatch = 0; private mainFov = 74; private baseFov = 64;
  ready = false;

  constructor(source?: { scene: T.Object3D; animations: T.AnimationClip[] }) {
    this.scene.add(this.camera, this.pivot);
    this.pivot.add(this.model);
    this.scene.add(new T.HemisphereLight(0xfff2dc, 0x25272c, 1.5));
    const key = new T.DirectionalLight(0xffe2b8, 2.0); key.position.set(-.6, 1, .8); this.scene.add(key);
    if (!source) return;
    const rig = clone(source.scene);
    rig.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      o.frustumCulled = false; o.castShadow = o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some(m => m.name === 'VM_hide')) o.visible = false;
    });
    this.rig = rig;
    this.model.add(rig);
    this.mixer = new T.AnimationMixer(rig);
    const act = (name: string) => { const c = T.AnimationClip.findByName(source.animations, name); return c ? this.mixer!.clipAction(c) : undefined; };
    this.idle = act('flashlight_idle'); this.walk = act('flashlight_walk'); this.raise = act('flashlight_raise');
    if (!this.idle) return;
    // Relaxed open hand = the skeleton's bind pose for the fingers (captured before any clip touches them).
    rig.traverse(o => {
      if (/^(index|middle|ring|pinky|thumb)_0[123]_r$/.test(o.name)) this.fingers.push({ bone: o, rest: o.quaternion.clone(), grip: o.quaternion.clone() });
    });
    const upper = rig.getObjectByName('upperarm_r'), lower = rig.getObjectByName('lowerarm_r'), hand = rig.getObjectByName('hand_r');
    if (upper && lower && hand) this.arm = { upper, lower, hand };
    this.idle.play().setEffectiveWeight(1);
    this.walk?.play().setEffectiveWeight(0);
    if (this.raise) { this.raise.setLoop(T.LoopOnce, 1); this.raise.clampWhenFinished = true; this.raise.play().setEffectiveWeight(0); }
    this.mixer.update(0); rig.updateMatrixWorld(true);
    // The clips hold the fingers still, so the mixer will not rewrite them: keep the authored grip ourselves.
    for (const f of this.fingers) f.grip.copy(f.bone.quaternion);
    // Eye = head bone plus a hand's width forward and a little up. The rig is placed so that point is the camera
    // origin (the model faces +Z, the camera looks down -Z, so the model is turned half a turn).
    const head = rig.getObjectByName('head');
    const eye = (head ? head.getWorldPosition(new T.Vector3()) : new T.Vector3(0, 1.6, 0)).add(new T.Vector3(0, .05, 0));
    rig.position.sub(eye);
    this.model.rotation.y = Math.PI;
    // The flashlight hangs under the right hand bone: the beam runs along its local +X, out of the wide end.
    const body = rig.getObjectByName('Flashlight');
    if (body) {
      this.lensNode = body;
      const box = new T.Box3(); body.traverse(o => { if (o instanceof T.Mesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox!); } });
      this.lensLocal.set(box.max.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
      this.heldNodes.push(body);
      if (this.arm) {
        this.scene.updateMatrixWorld(true);
        this.gripRel.copy(this.arm.hand.matrixWorld).invert().multiply(body.matrixWorld);
      }
    }
    this.ready = true;
    this.pivot.visible = false;
  }

  update(i: { dt: number; time: number; yaw: number; pitch: number; hold: number; press: number; kick: number; speed: number; run: boolean }) {
    if (!this.ready || !this.mixer) return;
    const dt = clamp(i.dt, 0, .1);
    this.shown = damp(this.shown, i.hold, 7, dt);
    const on = i.hold > .5;
    if (on && !this.wasShown && this.raise) { this.raise.reset(); this.raise.play(); this.raiseT = 0; }
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
    this.mixer.update(dt);
    const dyaw = this.started ? Math.atan2(Math.sin(i.yaw - this.prevYaw), Math.cos(i.yaw - this.prevYaw)) : 0;
    const dpitch = this.started ? i.pitch - this.prevPitch : 0;
    this.prevYaw = i.yaw; this.prevPitch = i.pitch; this.started = true;
    // The arm trails the turn a little and settles back.
    this.lagYaw = damp(this.lagYaw + dyaw * .9, 0, 6, dt);
    this.lagPitch = damp(this.lagPitch + dpitch * .9, 0, 6, dt);
    const out = 1 - this.shown, push = Math.sin(Math.PI * clamp(i.press, 0, 1)), reach = Math.sin(Math.PI * clamp(i.kick, 0, 1));
    this.pivot.position.set(clamp(this.lagYaw, -.1, .1) * .5, -out * .35 - push * .006 - clamp(this.lagPitch, -.08, .08) * .4, -reach * .1);
    this.pivot.rotation.set(this.lagPitch * .5 + out * .5, this.lagYaw * .6, -out * .2, 'YXZ');
    this.pivot.updateMatrixWorld(true);
    // Fingers: open relaxed hand ↔ authored grip.
    for (const f of this.fingers) f.bone.quaternion.copy(f.grip).slerp(f.rest, (1 - this.gripW) * .92);
    this.rig?.updateMatrixWorld(true);
    if (this.reachW > .001) this.solveReach();
    for (const n of this.heldNodes) n.visible = this.carrying;
    // While reaching into the world the hand is drawn with the main camera's field of view, so the hand and
    // the prop it touches line up on screen; it eases back to the fixed viewmodel FOV afterwards.
    const fov = T.MathUtils.lerp(this.baseFov, this.mainFov, this.fovMatch);
    if (Math.abs(this.camera.fov - fov) > .01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  /**
   * Hand interaction input for this frame. `target` is the prop's pose in viewmodel (camera) space; the hand is
   * pulled onto the grip that would hold the prop exactly there, by `reach` (0..1).
   */
  setHand(f: { reach: number; grip: number; carrying: boolean; target?: T.Matrix4; fovMatch: number; mainFov: number }) {
    this.reachW = f.target ? f.reach : 0; this.gripW = f.grip; this.carrying = f.carrying;
    if (f.target) this.reachTarget.copy(f.target);
    this.fovMatch = f.fovMatch; this.mainFov = f.mainFov;
  }

  /** How far from the eye the hand would be if it held a prop at `target` (camera space). */
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
  private solveReach() {
    const a = this.arm; if (!a) return;
    const w = this.reachW;
    const goal = this.reachTarget.clone().multiply(this.gripRel.clone().invert());
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
    const E = a.lower.getWorldPosition(new T.Vector3()), Hc = a.hand.getWorldPosition(new T.Vector3());
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
    void Hc;
  }

  /** True while the hand with the flashlight is on screen. */
  get shownNow() { return this.ready && this.pivot.visible; }

  /** Lens position and beam direction in the camera space of the main view. */
  lensPose() {
    if (!this.ready || !this.pivot.visible || !this.lensNode || !this.carrying) return undefined;
    this.pivot.updateMatrixWorld(true);
    const position = this.lensNode.localToWorld(this.lensLocal.clone());
    const direction = this.tmp.set(1, 0, 0).transformDirection(this.lensNode.matrixWorld).clone();
    return { position, direction };
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
  /** Hand on screen (0/1) when the interaction system drives it; defaults to "holding a lit flashlight". */
  armShown?: number;
  /** The body bends toward something being picked up or put down (world offset of the eye, metres). */
  bend?: { x: number; y: number; z: number };
  press: number;               // 0..1 progress of a flashlight button press (1 = idle)
  kick: number;                // 0..1 interaction reach animation (1 = idle)
  grounded?: boolean;
};

/**
 * First-person camera rig: eye height, head bob, breathing and strafe roll. The hero body itself is
 * rendered by the actor (see `setFirstPerson`), so the arms and the held flashlight are the real model.
 */
export class FpRig {
  readonly camera = new T.PerspectiveCamera(74, 1, .05, 40);
  private bobPhase = 0;
  private eye = EYE_STAND;
  private prevYaw = 0; private prevPitch = 0;
  private roll = 0;
  private started = false;

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
    const sinY = Math.sin(i.yaw), cosY = Math.cos(i.yaw);
    // Offsets: side bob is applied along the camera's right vector (-cos, sin).
    // The camera sits just ahead of the (hidden) head so the real arms and torso stay in view.
    // In the crouch pose the head leans about 10 cm further forward.
    const lean = .13 + .1 * i.crouch; // just ahead of the hidden head: arms enter the view from below, not beside the eye
    this.camera.position.set(i.x - cosY * bobX + sinY * lean + (i.bend?.x ?? 0), this.eye + bobY + breathe + (i.bend?.y ?? 0), i.z + sinY * bobX + cosY * lean + (i.bend?.z ?? 0));
    this.camera.rotation.set(i.pitch + bobY * .12 + sway, i.yaw + Math.PI, this.roll);
    this.camera.updateMatrixWorld(true);

    this.prevYaw = i.yaw; this.prevPitch = i.pitch; this.started = true;
    this.vm.update({ dt, time: i.time, yaw: i.yaw, pitch: i.pitch, hold: i.armShown ?? (i.hasLight && i.lightOn ? 1 : 0), press: i.press, kick: i.kick, speed: i.speed, run });
    this.camera.updateMatrixWorld(true);
  }

  /** Lens position and beam direction in world space (from the viewmodel), or undefined while the flashlight is pocketed. */
  beamPose() {
    const lens = this.vm.lensPose();
    if (!lens) return undefined;
    this.camera.updateMatrixWorld(true);
    return { position: this.camera.localToWorld(lens.position.clone()), direction: lens.direction.clone().transformDirection(this.camera.matrixWorld) };
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
