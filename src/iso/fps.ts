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
    this.idle.play().setEffectiveWeight(1);
    this.walk?.play().setEffectiveWeight(0);
    if (this.raise) { this.raise.setLoop(T.LoopOnce, 1); this.raise.clampWhenFinished = true; this.raise.play().setEffectiveWeight(0); }
    this.mixer.update(0); rig.updateMatrixWorld(true);
    // Eye = head bone plus a hand's width forward and a little up. The rig is placed so that point is the camera
    // origin (the model faces +Z, the camera looks down -Z, so the model is turned half a turn).
    const head = rig.getObjectByName('head');
    const eye = (head ? head.getWorldPosition(new T.Vector3()) : new T.Vector3(0, 1.6, 0)).add(new T.Vector3(0, .041, .09));
    rig.position.sub(eye);
    this.model.rotation.y = Math.PI;
    // The flashlight hangs under the right hand bone: the beam runs along its local +X, out of the wide end.
    const body = rig.getObjectByName('Flashlight');
    if (body) {
      this.lensNode = body;
      const box = new T.Box3(); body.traverse(o => { if (o instanceof T.Mesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox!); } });
      this.lensLocal.set(box.max.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
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
    this.rig?.updateMatrixWorld(true);
  }

  /** Lens position and beam direction in the camera space of the main view. */
  lensPose() {
    if (!this.ready || !this.pivot.visible || !this.lensNode) return undefined;
    this.pivot.updateMatrixWorld(true);
    const position = this.lensNode.localToWorld(this.lensLocal.clone());
    const direction = this.tmp.set(1, 0, 0).transformDirection(this.lensNode.matrixWorld).clone();
    return { position, direction };
  }

  /** The horizontal field of view stays about 90 degrees, so the hand keeps its place in the lower right corner on any window shape. */
  setAspect(a: number) {
    if (Math.abs(this.camera.aspect - a) > 1e-4) {
      this.camera.aspect = a;
      this.camera.fov = clamp(T.MathUtils.radToDeg(2 * Math.atan(Math.tan(Math.PI / 4) / a)), 50, 90);
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
    this.camera.position.set(i.x - cosY * bobX + sinY * lean, this.eye + bobY + breathe, i.z + sinY * bobX + cosY * lean);
    this.camera.rotation.set(i.pitch + bobY * .12 + sway, i.yaw + Math.PI, this.roll);
    this.camera.updateMatrixWorld(true);

    this.prevYaw = i.yaw; this.prevPitch = i.pitch; this.started = true;
    this.vm.update({ dt, time: i.time, yaw: i.yaw, pitch: i.pitch, hold: i.hasLight && i.lightOn ? 1 : 0, press: i.press, kick: i.kick, speed: i.speed, run });
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
