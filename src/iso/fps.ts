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
 * First-person camera rig: eye height, head bob, breathing and strafe roll. The hero body itself is
 * rendered by the actor (see `setFirstPerson`), so the arms and the held flashlight are the real model.
 */
export class FpRig {
  readonly camera = new T.PerspectiveCamera(74, 1, .04, 40);
  private bobPhase = 0;
  private eye = EYE_STAND;
  private prevYaw = 0; private prevPitch = 0;
  private roll = 0;
  private started = false;

  constructor(scene: T.Scene) {
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
    this.camera.position.set(i.x - cosY * bobX + sinY * .1, this.eye + bobY + breathe, i.z + sinY * bobX + cosY * .1);
    this.camera.rotation.set(i.pitch + bobY * .12 + sway, i.yaw + Math.PI, this.roll);
    this.camera.updateMatrixWorld(true);

    this.prevYaw = i.yaw; this.prevPitch = i.pitch; this.started = true;
    this.camera.updateMatrixWorld(true);
  }

  setAspect(aspect: number) {
    if (Math.abs(this.camera.aspect - aspect) > 1e-4) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  }

  dispose() {
    this.camera.removeFromParent();
  }
}

/** Shortest signed angle difference. */
function THREEangle(a: number) { return Math.atan2(Math.sin(a), Math.cos(a)); }
