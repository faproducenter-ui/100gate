import * as T from 'three';

/** Eye heights in metres (hero is ~1.78 m tall). */
export const EYE_STAND = 1.64;
export const EYE_CROUCH = 1.08;
const clamp = T.MathUtils.clamp;
const damp = T.MathUtils.damp;

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
 * First-person camera rig: eye height, head bob, breathing, strafe roll and the carried flashlight
 * with hand and forearm. The flashlight lags the camera a little, which is what makes the beam feel
 * held rather than glued to the view.
 */
export class FpRig {
  readonly camera = new T.PerspectiveCamera(74, 1, .04, 40);
  private readonly hand = new T.Group();
  private flashlight?: T.Object3D;
  private flashlightSwitch?: T.Object3D;
  private switchRest = 0;
  private bobPhase = 0;
  private eye = EYE_STAND;
  private lagYaw = 0; private lagPitch = 0;
  private prevYaw = 0; private prevPitch = 0;
  private beam = 0;
  private roll = 0;
  private started = false;
  private readonly lens = new T.Vector3();
  private readonly dir = new T.Vector3();

  constructor(scene: T.Scene, model?: T.Object3D) {
    this.camera.name = 'First-person eye';
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);
    this.camera.add(this.hand);
    const sleeve = new T.MeshStandardMaterial({ color: 0x7a2426, roughness: .92 });
    const skin = new T.MeshStandardMaterial({ color: 0xc5977f, roughness: .7 });
    const forearm = new T.Mesh(new T.CapsuleGeometry(.036, .42, 4, 12), sleeve);
    forearm.position.set(.27, -.36, -.30);
    forearm.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(-.16, .55, -.82).normalize());
    const wrist = new T.Mesh(new T.CylinderGeometry(.034, .04, .06, 14), skin);
    wrist.position.set(.226, -.222, -.372);
    wrist.quaternion.copy(forearm.quaternion);
    const palm = new T.Mesh(new T.SphereGeometry(.05, 14, 10), skin);
    palm.scale.set(1, .75, 1.15);
    palm.position.set(.215, -.205, -.385);
    this.hand.add(forearm, wrist, palm);
    for (const o of [forearm, wrist, palm]) o.renderOrder = 10;
    if (model) {
      this.flashlight = model;
      this.flashlightSwitch = model.getObjectByName('Flashlight_switch') ?? undefined;
      this.switchRest = this.flashlightSwitch?.position.y ?? 0;
      model.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = false; o.renderOrder = 11; o.frustumCulled = false; } });
      this.hand.add(model);
    }
    this.hand.traverse(o => { if (o instanceof T.Mesh) o.frustumCulled = false; });
    this.hand.visible = false;
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
    this.camera.position.set(i.x - cosY * bobX, this.eye + bobY + breathe, i.z + sinY * bobX);
    this.camera.rotation.set(i.pitch + bobY * .12 + sway, i.yaw + Math.PI, this.roll);
    this.camera.updateMatrixWorld(true);

    // Flashlight and hand: raised and forward when the light is on, relaxed near the hip when off.
    this.beam = damp(this.beam, i.hasLight && i.lightOn ? 1 : 0, 8, dt);
    const dyaw = this.started ? THREEangle(i.yaw - this.prevYaw) : 0;
    const dpitch = this.started ? i.pitch - this.prevPitch : 0;
    this.lagYaw = damp(this.lagYaw + dyaw * .65, 0, 7, dt);
    this.lagPitch = damp(this.lagPitch + dpitch * .65, 0, 7, dt);
    this.prevYaw = i.yaw; this.prevPitch = i.pitch; this.started = true;
    this.hand.visible = i.hasLight || false;
    const push = Math.sin(Math.PI * clamp(i.press, 0, 1));
    const reach = Math.sin(Math.PI * clamp(i.kick, 0, 1));
    this.hand.position.set(
      bobX * .6 + clamp(this.lagYaw, -.12, .12) * .8,
      -.05 * (1 - this.beam) + bobY * .5 - push * .018 + clamp(-this.lagPitch, -.1, .1) * .5 - reach * .02 + (run ? -.02 : 0),
      reach * -.2 + (run ? .04 : 0),
    );
    this.hand.rotation.set(
      -.06 * (1 - this.beam) + this.lagPitch * .5 + (run ? .22 : 0) + reach * .25,
      this.lagYaw * .7 - (run ? .18 : 0),
      this.beam * 0 + this.roll * -.6,
    );
    if (this.flashlight) {
      // Model axis: +X = beam direction, +Y = switch. Point it forward (-Z in camera space) and slightly inward.
      this.flashlight.visible = i.hasLight;
      this.flashlight.position.set(.205, -.205 - .03 * (1 - this.beam), -.40);
      this.flashlight.rotation.set(0, Math.PI / 2 + .16, .05 + .28 * (1 - this.beam));
      if (this.flashlightSwitch) this.flashlightSwitch.position.y = this.switchRest - .004 * push;
    }
    this.camera.updateMatrixWorld(true);
  }

  /** Lens position and beam direction in world space, or undefined without a flashlight. */
  beamPose() {
    if (!this.flashlight?.visible) return undefined;
    this.flashlight.updateWorldMatrix(true, false);
    this.lens.set(.14, 0, 0);
    this.flashlight.localToWorld(this.lens);
    this.dir.set(1, 0, 0).transformDirection(this.flashlight.matrixWorld);
    return { position: this.lens.clone(), direction: this.dir.clone() };
  }

  setAspect(aspect: number) {
    if (Math.abs(this.camera.aspect - aspect) > 1e-4) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  }

  dispose() {
    this.camera.removeFromParent();
    this.hand.traverse(o => { if (o instanceof T.Mesh && o !== this.flashlight && !this.flashlight?.getObjectById(o.id)) { o.geometry.dispose(); (o.material as T.Material).dispose(); } });
  }
}

/** Shortest signed angle difference. */
function THREEangle(a: number) { return Math.atan2(Math.sin(a), Math.cos(a)); }
