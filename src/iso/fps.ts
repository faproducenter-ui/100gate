import * as T from 'three';

/** Eye heights in metres (hero is ~1.78 m tall). */
export const EYE_STAND = 1.64;
export const EYE_CROUCH = 1.25; // head height of the authored crouch pose + a few cm
const clamp = T.MathUtils.clamp;
const damp = T.MathUtils.damp;

/**
 * The held flashlight and hand, drawn as a separate viewmodel: its own scene, a fixed-FOV camera and a
 * depth clear, so it never sinks into walls. The hand is the hero's own posed hand (built in Blender),
 * the beam is a SpotLight in the main scene that follows the lens of this model.
 */
export class ViewModel {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(64, 1, .01, 5);
  private readonly pivot = new T.Group();
  private readonly model = new T.Group();
  private switchNode?: T.Object3D;
  private switchRest = new T.Vector3();
  private readonly lensLocal = new T.Vector3();
  private lagYaw = 0; private lagPitch = 0; private prevYaw = 0; private prevPitch = 0; private started = false;
  private shown = 0;
  private readonly tmp = new T.Vector3();
  ready = false;

  constructor(source?: T.Object3D) {
    this.scene.add(this.camera, this.pivot);
    this.pivot.add(this.model);
    this.scene.add(new T.HemisphereLight(0xfff2dc, 0x25272c, 1.5));
    const key = new T.DirectionalLight(0xffe2b8, 2.0); key.position.set(-.6, 1, .8); this.scene.add(key);
    if (!source) return;
    const m = source.clone(true);
    m.traverse(o => { if (o instanceof T.Mesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; } });
    // The model was exported with the beam along +Z; the camera looks down -Z.
    this.model.add(m); this.model.rotation.y = Math.PI;
    const light = m.getObjectByName('VM_Flashlight');
    if (light) {
      const box = new T.Box3().setFromObject(light), c = box.getCenter(new T.Vector3());
      this.lensLocal.set(c.x, c.y, box.max.z);
    }
    this.switchNode = m.getObjectByName('VM_Switch') ?? undefined;
    if (this.switchNode) this.switchRest.copy(this.switchNode.position);
    this.ready = true;
    this.pivot.visible = false;
  }

  update(i: { dt: number; time: number; yaw: number; pitch: number; bobX: number; bobY: number; hold: number; press: number; kick: number; run: boolean }) {
    if (!this.ready) return;
    const dt = clamp(i.dt, 0, .1);
    this.shown = damp(this.shown, i.hold, 6, dt);
    this.pivot.visible = this.shown > .015;
    const dyaw = this.started ? Math.atan2(Math.sin(i.yaw - this.prevYaw), Math.cos(i.yaw - this.prevYaw)) : 0;
    const dpitch = this.started ? i.pitch - this.prevPitch : 0;
    this.prevYaw = i.yaw; this.prevPitch = i.pitch; this.started = true;
    this.lagYaw = damp(this.lagYaw + dyaw * .9, 0, 6, dt);
    this.lagPitch = damp(this.lagPitch + dpitch * .9, 0, 6, dt);
    const out = 1 - this.shown, push = Math.sin(Math.PI * clamp(i.press, 0, 1)), reach = Math.sin(Math.PI * clamp(i.kick, 0, 1));
    // Lower right corner: just the hand and the back/side of the flashlight, the centre of the view stays clear.
    this.pivot.scale.setScalar(1.12);
    this.pivot.position.set(.29 + i.bobX * .8 + clamp(this.lagYaw, -.1, .1) * .7, -.2 + i.bobY * .8 - out * .5 - push * .008 - clamp(this.lagPitch, -.08, .08) * .5,
      -.4 - reach * .12 + (i.run ? .03 : 0));
    this.pivot.rotation.set(.2 + out * .7 + this.lagPitch * .6 + (i.run ? .08 : 0), .13 + this.lagYaw * .8, -.16 - out * .3, 'YXZ');
    if (this.switchNode) this.switchNode.position.set(this.switchRest.x, this.switchRest.y - .004 * push, this.switchRest.z);
  }

  /** Lens position and beam direction in the camera space of the main view. */
  lensPose() {
    if (!this.ready || !this.pivot.visible) return undefined;
    this.pivot.updateMatrixWorld(true);
    const position = this.lensLocal.clone().applyMatrix4(this.model.matrixWorld);
    const direction = this.tmp.set(0, 0, 1).transformDirection(this.model.matrixWorld).clone(); // local +Z = beam
    return { position, direction };
  }

  setAspect(a: number) { if (Math.abs(this.camera.aspect - a) > 1e-4) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); } }

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

  constructor(scene: T.Scene, model?: T.Object3D) {
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
    this.vm.update({ dt, time: i.time, yaw: i.yaw, pitch: i.pitch, bobX: bobX * .7, bobY: bobY * .7, hold: i.hasLight && i.lightOn ? 1 : 0, press: i.press, kick: i.kick, run });
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
