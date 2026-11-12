import * as T from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { loadGaitClips } from './motionbricks'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

const ASSET = 'assets/iso/alexei-10.glb'
const FLASHLIGHT_ASSET = 'assets/iso/flashlight.glb'
const BACKPACK_ASSET = 'assets/iso/backpack-2.glb'
/** Metres of travel per authored gait cycle (two steps); see scripts/art/package-iso-gait.py. */
export const WALK_STRIDE = 1.25
export const RUN_STRIDE = 2.0
export const CROUCH_STRIDE = .9
const TAU = Math.PI * 2
const clamp = T.MathUtils.clamp
const shortestAngle = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))
const stepDelta = (dt: number) => Number.isFinite(dt) ? clamp(dt, 0, .125) : 0
const moveAlpha = (dt: number, rate: number) => -Math.expm1(-dt * rate)
type Motion = { yaw: number; phase: number; walkWeight: number; runWeight: number; moving: boolean }

export const initialActorMotion = (): Motion => ({ yaw: 0, phase: 0, walkWeight: 0, runWeight: 0, moving: false })

/** Rootless locomotion authored in Blender. Advance only by world travel so feet never skate.
 * Hysteresis keeps a sliding or stuttering speed from flickering between gait and idle. */
export function advanceActorMotion(state: Motion, dt: number, dx: number, dz: number, speed: number): Motion {
  dt = stepDelta(dt)
  if (!dt) return state
  const finite = Number.isFinite(speed)
  const moving = finite && speed > (state.moving ? .06 : .14)
  const heading = moving && Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) > 1e-5
  const running = moving && speed > 2.15
  const runWeight = T.MathUtils.lerp(state.runWeight, running ? 1 : 0, moveAlpha(dt, 7))
  const stride = T.MathUtils.lerp(WALK_STRIDE, RUN_STRIDE, runWeight)
  return {
    yaw: heading ? state.yaw + shortestAngle(state.yaw, Math.atan2(dx, dz)) * moveAlpha(dt, 11) : state.yaw,
    phase: moving ? (state.phase + dt * clamp(speed, 0, 5) / stride) % 1 : state.phase,
    walkWeight: T.MathUtils.lerp(state.walkWeight, moving ? 1 : 0, moveAlpha(dt, moving ? 12 : 9)),
    runWeight,
    moving,
  }
}

export function reactionEnvelope(u: number) {
  if (u <= 0 || u >= 1 || !Number.isFinite(u)) return 0
  return T.MathUtils.smootherstep(u, 0, .3) * (1 - T.MathUtils.smootherstep(u, .54, 1))
}

export type FpPose = { yaw: number; eye: T.Vector3; forward: T.Vector3; right: T.Vector3; up: T.Vector3 }
type Reaction = 'interact' | 'pick-up' | 'door' | 'fear' | 'examine'
type Variant = 'hero' | 'staff' | 'shadow'
export type IsoActor = {
  root: T.Object3D;
  update(dt: number, x: number, z: number, dx: number, dz: number, speed: number): void;
  react(kind: Reaction, targetX?: number, targetZ?: number): void;
  poseTape(pose:{x:number;z:number;yaw:number;time:number;distance:number;walk:number;
    action?:{kind:Reaction;t:number;x:number;z:number}}):void;
  /** Gear carried by the hero: flashlight in the right hand, backpack on the back. */
  setGear(gear: { flashlight: boolean; on: boolean; armHidden?: boolean }): void;
  /** Thumb presses the flashlight switch. */
  pressFlashlight(): void;
  /** World position of the lens and unit beam direction while the flashlight is carried. */
  flashlightPose(): { position: T.Vector3; direction: T.Vector3 } | undefined;
  /** First person: the hero body follows the camera, the head is hidden and the hand holds the flashlight in view. */
  setFirstPerson(pose: FpPose | null): void;
  /** 0 = standing, 1 = fully crouched; blends the crouch idle/walk clips in. */
  setCrouch(amount: number): void;
  /** A fresh copy of the flashlight model for placing in the world. */
  makeFlashlight(): T.Object3D | undefined;
  createEcho(variant?: Variant): IsoActor;
  dispose(): void;
}

type GripOffset = { position: number[]; quaternion: number[]; scale: number[] }
type Props = { flashlight?: T.Object3D; backpack?: T.Object3D; straps?: T.Object3D; grip?: GripOffset }
type Shared = { gripPose: Map<string, T.Quaternion>; source: GLTF; idle: T.AnimationClip; walk: T.AnimationClip; run: T.AnimationClip; crouchIdle: T.AnimationClip; crouchWalk: T.AnimationClip; gait?: { walk: T.AnimationClip; run: T.AnimationClip; walkCycles: number; runCycles: number; crouch?: T.AnimationClip; crouchCycles: number }; props: Props; references: number }
let sharedPromise: Promise<Shared> | undefined

function disposeSource(source: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>()
  const skeletons = new Set<T.Skeleton>(), textures = new Set<T.Texture>(), images = new Set<ImageBitmap>()
  source.traverse(obj => {
    if (!(obj instanceof T.Mesh)) return
    if (obj instanceof T.SkinnedMesh) skeletons.add(obj.skeleton)
    geometries.add(obj.geometry)
    for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(material)
  })
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value)
    material.dispose()
  }
  for (const texture of textures) {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image)
    texture.dispose()
  }
  for (const bitmap of images) bitmap.close()
  for (const geometry of geometries) geometry.dispose()
  for (const skeleton of skeletons) skeleton.dispose()
}

async function loadProp(path: string, name: string): Promise<T.Object3D | undefined> {
  try {
    const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + path)
    const prop = gltf.scene.getObjectByName(name)
    return prop ?? undefined
  } catch { return undefined }
}
const loadProps = async (): Promise<Props> => {
  const [flashlight, backpack, straps] = await Promise.all([loadProp(FLASHLIGHT_ASSET, 'Flashlight'),
    loadProp(BACKPACK_ASSET, 'Backpack'), loadProp(BACKPACK_ASSET, 'Straps')])
  let grip: GripOffset | undefined
  try {
    const r = await fetch(import.meta.env.BASE_URL + 'assets/iso/grip.json')
    if (r.ok) { const j = await r.json(); if (Array.isArray(j.position) && Array.isArray(j.quaternion)) grip = j }
  } catch { /* authored grip is optional */ }
  return { flashlight, backpack, straps, grip }
}

function loadShared(): Promise<Shared> {
  if (sharedPromise) return sharedPromise
  sharedPromise = new GLTFLoader().loadAsync(import.meta.env.BASE_URL + ASSET).then(source => {
    const idle = T.AnimationClip.findByName(source.animations, 'Idle')
    const walk = T.AnimationClip.findByName(source.animations, 'Walk')
    const run = T.AnimationClip.findByName(source.animations, 'Run')
    const crouchIdle = T.AnimationClip.findByName(source.animations, 'CrouchIdle')
    const crouchWalk = T.AnimationClip.findByName(source.animations, 'CrouchWalk')
    const bones = new Set<string>()
    let skins = 0
    source.scene.traverse(obj => {
      if (obj instanceof T.Bone) bones.add(obj.name)
      if (obj instanceof T.SkinnedMesh) skins++
    })
    if (!idle?.validate() || !walk?.validate() || !run?.validate() || !crouchIdle?.validate() || !crouchWalk?.validate() || Math.abs(walk.duration - 1) > .001 || Math.abs(run.duration - 1) > .001 || bones.size !== 53 || skins !== 5) {
      disposeSource(source.scene)
      throw new Error('Invalid native actor: missing expected rig, skin or gait')
    }
    // The Blender-authored 'flashlight held ahead' pose of the right arm and fingers (first key of the Hold clip).
    const gripPose = new Map<string, T.Quaternion>()
    for (const track of T.AnimationClip.findByName(source.animations, 'Hold')?.tracks ?? []) {
      if (track instanceof T.QuaternionKeyframeTrack) gripPose.set(track.name.replace('.quaternion', ''), new T.Quaternion().fromArray(track.values, 0))
    }
    return Promise.all([loadProps(), loadGaitClips(bones, import.meta.env.BASE_URL, { walk: WALK_STRIDE, run: RUN_STRIDE, crouch: CROUCH_STRIDE })]).then(([props, gait]) => ({ gripPose, source, idle, walk, run, crouchIdle, crouchWalk, gait, props, references: 0 }))
  }).catch(error => {
    sharedPromise = undefined
    throw error
  })
  return sharedPromise
}

const REACTION: Record<Reaction, { seconds: number; pitch: number; arm: number; height: number }> = {
  'interact': { seconds: .62, pitch: -.035, arm: 1, height: 1.04 },
  'pick-up': { seconds: .86, pitch: -.20, arm: 1, height: .55 },
  'door': { seconds: .78, pitch: -.06, arm: 1, height: 1.02 },
  'fear': { seconds: .87, pitch: .09, arm: 0, height: 0 },
  'examine': { seconds: .82, pitch: -.07, arm: 1, height: 1.12 },
}

const UP = new T.Vector3(0, 1, 0)
const prepProp = (prop: T.Object3D) => {
  const copy = prop.clone(true)
  copy.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = true; o.receiveShadow = true } })
  return copy
}

function instantiate(shared: Shared, variant: Variant): IsoActor {
  // SkeletonUtils makes joint ownership independent while retaining the GPU
  // geometry/textures for the gameplay hero and both CCTV echoes.
  const body = clone(shared.source.scene), root = new T.Group()
  root.name = '100gate | ' + (variant === 'hero' ? 'Алексей' : 'CCTV · ' + variant)
  root.add(body)
  const joints = new Map<string, T.Bone>(), skeletons = new Set<T.Skeleton>()
  // First person looks from inside the torso: show only outer faces so the inside of the sweater never appears.
  const originalSide = new Map<T.Material, T.Side>()
  let fpSides = false
  const variantMaterials = new Map<T.Material, T.Material>()
  const materialFor = (original: T.Material) => {
    const existing = variantMaterials.get(original)
    if (existing) return existing
    const material = original.clone()
    if (material instanceof T.MeshStandardMaterial) {
      if (variant === 'shadow') {
        material.color.setRGB(.013, .017, .019)
        material.roughness = 1
        material.map = null
        material.normalMap = null
      } else material.color.multiply(new T.Color(0x83958f))
    }
    variantMaterials.set(original, material)
    return material
  }
  body.traverse(obj => {
    if (obj instanceof T.Bone) joints.set(obj.name, obj)
    if (!(obj instanceof T.SkinnedMesh)) return
    obj.castShadow = variant === 'hero'
    obj.receiveShadow = true
    obj.frustumCulled = false // bounds are the old bind-pose proportions
    if (variant === 'hero') for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) originalSide.set(m, m.side)
    skeletons.add(obj.skeleton)
    if (variant !== 'hero') obj.material = Array.isArray(obj.material) ? obj.material.map(materialFor) : materialFor(obj.material)
  })
  shared.references++
  const mixer = new T.AnimationMixer(body)
  const idle = mixer.clipAction(shared.idle).play().setEffectiveWeight(1)
  const walk = mixer.clipAction(shared.gait?.walk ?? shared.walk).play().setEffectiveWeight(0)
  const run = mixer.clipAction(shared.gait?.run ?? shared.run).play().setEffectiveWeight(0)
  const cidle = mixer.clipAction(shared.crouchIdle).play().setEffectiveWeight(0)
  const cwalk = mixer.clipAction(shared.gait?.crouch ?? shared.crouchWalk).play().setEffectiveWeight(0)
  idle.paused = walk.paused = run.paused = cidle.paused = cwalk.paused = true
  let crouchTarget = 0, crouchW = 0, crouchPhase = 0, gaitCycle = 0, lastPhase = 0
  const chest = joints.get('spine_03'), head = joints.get('head')
  const arm = {
    upper: joints.get('upperarm_r'), lower: joints.get('lowerarm_r'), hand: joints.get('hand_r'),
    thumb1: joints.get('thumb_01_r'), thumb2: joints.get('thumb_02_r'),
  }
  // Right-hand finger chains and knuckle markers used to wrap the grip around the handle.
  const fingers = ['index', 'middle', 'ring', 'pinky'].map(n => [1, 2, 3].map(i => joints.get(`${n}_0${i}_r`)))
  const thumbChain = [1, 2, 3].map(i => joints.get(`thumb_0${i}_r`))
  const knuckles = { middle: joints.get('middle_01_r'), index: joints.get('index_01_r'), pinky: joints.get('pinky_01_r') }
  const axis = new T.Vector3(), target = new T.Vector3()
  const worldRight = new T.Vector3(), q = new T.Quaternion()
  let motion = initialActorMotion(), elapsed = 0, disposed = false
  // three's mixer only rewrites a bone when its animated value *changes*, so a held idle pose is
  // never refreshed. Every procedural tweak below would then pile up frame after frame and make
  // the hero rock back and forth. Restore the clean animated pose before each evaluation.
  const tweaked = [chest, head, arm.upper, arm.lower, arm.hand, ...fingers.flat(), ...thumbChain].filter((b): b is T.Bone => !!b)
  const clean = tweaked.map(() => new T.Quaternion())
  let cleanReady = false
  const upperPos = new T.Vector3() // clean animated local position of the shoulder joint (see the first-person shoulder shift)
  const shoulderWorld = new T.Vector3()
  let acting: { kind: Reaction; t: number; x?: number; z?: number } | undefined
  let gear: { flashlight: boolean; on: boolean; armHidden?: boolean } = { flashlight: false, on: false }, beam = 0, press = 1
  let fp: FpPose | undefined

  // The backpack rides the upper spine; its matrix is the inverse bind pose so it
  // sits exactly where it was modelled against the standing hero.
  let backpack: T.Object3D | undefined, straps: T.Object3D | undefined, flashlight: T.Object3D | undefined, flashlightSwitch: T.Object3D | undefined
  let switchRest = 0
  const packBind = new T.Matrix4(), packSwing = new T.Matrix4(), packTilt = new T.Matrix4(), packEuler = new T.Euler()
  let packBound = false
  if (variant === 'hero') {
    if (shared.props.backpack && chest) {
      backpack = prepProp(shared.props.backpack)
      backpack.matrixAutoUpdate = false
      chest.add(backpack)
      if (shared.props.straps) {
        straps = prepProp(shared.props.straps)
        straps.matrixAutoUpdate = false
        chest.add(straps)
      }
    }
    if (shared.props.flashlight) {
      flashlight = prepProp(shared.props.flashlight)
      flashlight.traverse(o => { if (o instanceof T.Mesh) o.castShadow = false })
      flashlightSwitch = flashlight.getObjectByName('Flashlight_switch') ?? undefined
      flashlight.visible = false
      if (shared.props.grip && joints.get('hand_r')) {
        // The grip offset authored in Blender is relative to the hand bone.
        const g = shared.props.grip
        flashlight.position.fromArray(g.position); flashlight.quaternion.fromArray(g.quaternion); flashlight.scale.fromArray(g.scale)
        joints.get('hand_r')!.add(flashlight)
      }
      switchRest = flashlightSwitch?.position.y ?? 0
    }
  }

  function bend(joint: T.Bone | undefined, angle: number) {
    if (!joint || Math.abs(angle) < 1e-5) return
    axis.copy(worldRight).applyQuaternion(joint.getWorldQuaternion(q).invert())
    joint.quaternion.multiply(q.setFromAxisAngle(axis, angle))
  }

  /** Rotate `joint` about its own origin so the bone that points at `child` points along `dir`. */
  const pa = new T.Vector3(), pb = new T.Vector3(), delta = new T.Quaternion(), parentQ = new T.Quaternion(), worldQ = new T.Quaternion()
  function aim(joint: T.Bone, child: T.Object3D, dir: T.Vector3, weight: number) {
    joint.getWorldPosition(pa); child.getWorldPosition(pb)
    pb.sub(pa)
    if (pb.lengthSq() < 1e-8) return
    pb.normalize()
    delta.setFromUnitVectors(pb, dir)
    joint.getWorldQuaternion(worldQ).premultiply(delta)
    ;(joint.parent ?? root).getWorldQuaternion(parentQ)
    delta.copy(parentQ).invert().multiply(worldQ)
    joint.quaternion.slerp(delta, weight)
    joint.updateMatrixWorld(true)
  }
  const shoulder = new T.Vector3(), elbow = new T.Vector3(), wrist = new T.Vector3(), reachDir = new T.Vector3()
  const side = new T.Vector3(), foreArm = new T.Vector3()
  /** Two-bone analytic IK: bring the wrist to `goal`, elbow bending toward `pole`. */
  function reach(goal: T.Vector3, pole: T.Vector3, weight: number) {
    if (!arm.upper || !arm.lower || !arm.hand || weight < .002) return
    arm.upper.getWorldPosition(shoulder); arm.lower.getWorldPosition(elbow); arm.hand.getWorldPosition(wrist)
    const l1 = shoulder.distanceTo(elbow), l2 = elbow.distanceTo(wrist)
    reachDir.copy(goal).sub(shoulder)
    const d = clamp(reachDir.length(), Math.abs(l1 - l2) + .02, l1 + l2 - .005)
    reachDir.normalize()
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), height = Math.sqrt(Math.max(0, l1 * l1 - along * along))
    side.copy(pole).addScaledVector(reachDir, -pole.dot(reachDir))
    if (side.lengthSq() < 1e-6) side.set(0, -1, 0).addScaledVector(reachDir, reachDir.y)
    side.normalize()
    elbow.copy(shoulder).addScaledVector(reachDir, along).addScaledVector(side, height)
    foreArm.copy(shoulder).addScaledVector(reachDir, d).sub(elbow).normalize()
    aim(arm.upper, arm.lower, target.copy(elbow).sub(shoulder).normalize(), weight)
    aim(arm.lower, arm.hand, foreArm, weight)
  }

  const fwd = new T.Vector3(), rightV = new T.Vector3(), goal = new T.Vector3(), pole = new T.Vector3()
  const lensWorld = new T.Vector3(), beamDir = new T.Vector3(), handPos = new T.Vector3(), basisZ = new T.Vector3(), basisY = new T.Vector3()
  const heldGoal = new T.Vector3()
  const basis = new T.Matrix4()
  const down = new T.Vector3(0, -1, 0)
  const gripBones = [...shared.gripPose].map(([name, quat]) => [joints.get(name), quat] as const).filter((x): x is [T.Bone, T.Quaternion] => !!x[0])
  const gripOffset = shared.props.grip
  const offsetPos = new T.Vector3(), offsetQuat = new T.Quaternion(), flashQuat = new T.Quaternion(), handQuat = new T.Quaternion()
  const flashPos = new T.Vector3(), wristGoal = new T.Vector3()
  /** Set the hand's world rotation (blended by `w`) so the held flashlight points where we want. */
  function orientHand(target: T.Quaternion, w: number) {
    if (!arm.hand || w < .002) return
    arm.hand.getWorldQuaternion(worldQ).slerp(target, w)
    ;(arm.hand.parent ?? root).getWorldQuaternion(parentQ)
    arm.hand.quaternion.copy(parentQ.invert().multiply(worldQ))
    arm.hand.updateMatrixWorld(true)
  }

  // Backpack: a damped pendulum hung from the top seam. The straps hold it against the back, so it
  // lags behind acceleration and settles with a spring, but can never swing into the torso.
  const PACK_PIVOT = new T.Vector3(0, 1.40, -.252) // top seam, in the hero's model space
  const pack = { pitch: 0, pitchV: 0, roll: 0, rollV: 0, ready: false, accX: 0, accZ: 0 }
  const packPos = new T.Vector3(), packPrev = new T.Vector3(), packVel = new T.Vector3(), packPrevVel = new T.Vector3()
  function stepPack(dt: number) {
    if (!backpack || !chest || dt <= 0) return
    chest.getWorldPosition(packPos)
    if (!pack.ready) { packPrev.copy(packPos); packVel.set(0, 0, 0); packPrevVel.set(0, 0, 0); pack.ready = true; return }
    packVel.copy(packPos).sub(packPrev).divideScalar(dt)
    if (packVel.length() > 9) { packVel.set(0, 0, 0); packPrev.copy(packPos); packPrevVel.set(0, 0, 0); return } // teleport
    const ax = (packVel.x - packPrevVel.x) / dt, az = (packVel.z - packPrevVel.z) / dt
    packPrev.copy(packPos); packPrevVel.copy(packVel)
    const k = 1 - Math.exp(-dt * 22)
    pack.accX += (clamp(ax, -22, 22) - pack.accX) * k
    pack.accZ += (clamp(az, -22, 22) - pack.accZ) * k
    // Acceleration in the hero's frame: forward is +Z at yaw 0, left is +X.
    const sin = Math.sin(motion.yaw), cos = Math.cos(motion.yaw)
    const forward = pack.accX * sin + pack.accZ * cos, left = pack.accX * cos - pack.accZ * sin
    const L = .2, w2 = 90, damping = 6, gain = .75
    const sub = Math.max(1, Math.ceil(dt / .008)), h = dt / sub
    for (let i = 0; i < sub; i++) {
      // Positive pitch swings the bottom backwards; forward acceleration lags it back.
      pack.pitchV += ((forward * Math.cos(pack.pitch)) / L * gain - w2 * pack.pitch - damping * pack.pitchV) * h
      pack.pitch += pack.pitchV * h
      // Positive roll swings the bottom to the hero's left; leftward acceleration lags it right.
      pack.rollV += ((-left * Math.cos(pack.roll)) / L * gain - w2 * pack.roll - damping * pack.rollV) * h
      pack.roll += pack.rollV * h
      // Body contact: the pack rests on the back and cannot rotate into the torso.
      if (pack.pitch < -.015) { pack.pitch = -.015; pack.pitchV = Math.max(0, -pack.pitchV * .25) }
      if (pack.pitch > .24) { pack.pitch = .24; pack.pitchV = Math.min(0, -pack.pitchV * .25) }
      pack.roll = clamp(pack.roll, -.16, .16)
    }
  }
  function placePack() {
    if (!backpack || !chest) return
    if (!packBound) {
      packBind.copy(chest.matrixWorld).invert().multiply(body.matrixWorld)
      packBound = true
      if (straps) { straps.matrix.copy(packBind); straps.matrixWorldNeedsUpdate = true }
    }
    packEuler.set(pack.pitch, 0, pack.roll, 'XYZ')
    packSwing.makeTranslation(PACK_PIVOT.x, PACK_PIVOT.y, PACK_PIVOT.z)
    packSwing.multiply(packTilt.makeRotationFromEuler(packEuler))
    packSwing.multiply(packTilt.makeTranslation(-PACK_PIVOT.x, -PACK_PIVOT.y, -PACK_PIVOT.z))
    backpack.matrix.copy(packBind).multiply(packSwing)
    backpack.matrixWorldNeedsUpdate = true
  }

  const update: IsoActor['update'] = (delta, x, z, dx, dz, speed) => {
    if (disposed) return
    const dt = stepDelta(delta)
    elapsed = (elapsed + dt) % 4.4
    motion = advanceActorMotion(motion, dt, dx, dz, speed)
    if (fp) motion.yaw = fp.yaw
    if (head) head.scale.setScalar(fp ? .001 : 1)
    if (variant === 'hero' && fpSides !== !!fp) {
      fpSides = !!fp
      for (const [m, side] of originalSide) { m.side = fp ? T.FrontSide : side; m.needsUpdate = true }
    }
    if (!fp && acting && acting.x !== undefined && acting.z !== undefined && speed < .15 &&
      Math.hypot(acting.x - x, acting.z - z) > .14) {
      const aimYaw = Math.atan2(acting.x - x, acting.z - z)
      motion.yaw += shortestAngle(motion.yaw, aimYaw) * moveAlpha(dt, 9)
    }
    root.position.set(x, 0, z)
    root.rotation.y = motion.yaw
    const clipTime = motion.phase * shared.walk.duration
    if (shared.gait) {
      // A baked clip may span several stride cycles: accumulate the unwrapped phase and spread it over the whole clip.
      gaitCycle = (gaitCycle + ((motion.phase - lastPhase + 1.5) % 1 - .5) + 1e6) % 1e6
      lastPhase = motion.phase
      walk.time = (gaitCycle / shared.gait.walkCycles % 1) * shared.gait.walk.duration
      run.time = (gaitCycle / shared.gait.runCycles % 1) * shared.gait.run.duration
    } else walk.time = run.time = clipTime
    const g = motion.walkWeight < .002 ? 0 : motion.walkWeight
    crouchW = T.MathUtils.damp(crouchW, crouchTarget, 9, dt)
    if (motion.moving) crouchPhase = (crouchPhase + dt * clamp(speed, 0, 3) / CROUCH_STRIDE) % 1
    cwalk.time = shared.gait?.crouch ? (crouchPhase / shared.gait.crouchCycles % 1) * shared.gait.crouch.duration : crouchPhase * shared.crouchWalk.duration
    const stand = 1 - crouchW
    idle.setEffectiveWeight((1 - g) * stand)
    walk.setEffectiveWeight(g * (1 - motion.runWeight) * stand)
    run.setEffectiveWeight(g * motion.runWeight * stand)
    cidle.setEffectiveWeight((1 - g) * crouchW)
    cwalk.setEffectiveWeight(g * crouchW)
    if (cleanReady) { tweaked.forEach((joint, i) => joint.quaternion.copy(clean[i]!)); arm.upper?.position.copy(upperPos) }
    mixer.update(0)
    tweaked.forEach((joint, i) => clean[i]!.copy(joint.quaternion))
    if (arm.upper) upperPos.copy(arm.upper.position)
    cleanReady = true
    worldRight.set(Math.cos(motion.yaw), 0, -Math.sin(motion.yaw))
    // Slow breathing only; no whole-body rocking when standing.
    const settle = 1 - g
    const breath = (Math.sin(elapsed * TAU / 4.4) * .012 + Math.sin(elapsed * TAU / 2.2 + 1) * .003) * settle
    bend(head, -breath * .6)
    let reachWeight = 0, reachGoal: T.Vector3 | undefined
    if (acting) {
      const beat = REACTION[acting.kind]
      acting.t += dt
      const weight = reactionEnvelope(acting.t / beat.seconds) * (1 - g)
      if (weight > 0) {
        bend(chest, beat.pitch * weight + breath)
        bend(head, (acting.kind === 'fear' ? -.07 : beat.pitch * .9) * weight)
        if (beat.arm) {
          reachGoal = goal.set(acting.x ?? x + Math.sin(motion.yaw), beat.height, acting.z ?? z + Math.cos(motion.yaw))
          reachWeight = weight
        }
      } else bend(chest, breath)
      if (acting.t >= beat.seconds) acting = undefined
    } else bend(chest, breath)
    root.updateMatrixWorld(true)
    stepPack(dt)
    placePack()

    // Carried flashlight with the grip authored in Blender. Light on: held up ahead. Light off: it goes
    // into the pocket, so the arm is simply free again.
    beam = T.MathUtils.damp(beam, gear.flashlight && gear.on ? 1 : 0, 9, dt)
    press = Math.min(1, press + dt / .34)
    fwd.set(Math.sin(motion.yaw), 0, Math.cos(motion.yaw))
    rightV.set(-fwd.z, 0, fwd.x)
    pole.set(0, -.6, 0).addScaledVector(rightV, .6).addScaledVector(fwd, -.25)
    const pushed = Math.sin(Math.PI * press) // thumb dips onto the switch and releases
    const fpPitch = fp ? Math.asin(Math.max(-1, Math.min(1, fp.forward.y))) : 0
    const holding = !!gripOffset && !!flashlight && gear.flashlight && beam > .02
    if (backpack) backpack.visible = !fp
    // First person: the forearm is slimmed a little (and the hand scaled back) so the sleeve does not fill the screen.
    const slim = fp && holding ? .85 : 1
    arm.lower?.scale.setScalar(slim); arm.hand?.scale.setScalar(1 / slim)
    // While the first-person viewmodel holds the flashlight, the body's own right arm is folded away:
    // the player must never see two right hands.
    arm.upper?.scale.setScalar(fp && gear.armHidden ? .001 : 1)
    if (straps) straps.visible = !fp
    if (holding && arm.upper && arm.lower && arm.hand) {
      // Pose authored in Blender (upper arm, forearm, hand and fingers around the flashlight).
      const w = beam * (1 - reachWeight * .7)
      if (fp && arm.upper.parent) {
        // The torso is hidden in first person, so the shoulder is brought forward and up: the arm then
        // enters the view from the lower right, like a viewmodel, instead of running beside the eye.
        // Looking down brings the shoulder back, so the sleeve never shows its torn opening.
        const shift = w * Math.max(0, Math.min(1, 1 + fpPitch / .7))
        arm.upper.getWorldPosition(shoulderWorld).addScaledVector(fwd, .24 * shift)
        shoulderWorld.y += .16 * shift
        arm.upper.position.copy(arm.upper.parent.worldToLocal(shoulderWorld))
        root.updateMatrixWorld(true)
      }
      for (const [bone, quat] of gripBones) bone.quaternion.slerp(quat, w)
      root.updateMatrixWorld(true)
      // In first person the arm follows the look pitch, so the torch stays where the eye expects it.
      if (fp) { const lift = -Math.max(-1.1, Math.min(1.1, fpPitch)) * .95 * w; bend(arm.upper, lift) }
      if (press < 1 && arm.thumb1) arm.thumb1.rotateX(-pushed * .25)
      root.updateMatrixWorld(true)
      if (reachGoal) reach(reachGoal, pole, reachWeight)
    } else if (reachGoal && arm.upper && arm.lower && arm.hand) reach(reachGoal, pole, reachWeight)
    root.updateMatrixWorld(true)

    if (flashlight) {
      flashlight.visible = !!gripOffset && gear.flashlight && beam > .02
      if (flashlight.visible) {
        if (flashlightSwitch) flashlightSwitch.position.y = switchRest - .004 * pushed
        flashlight.updateMatrixWorld(true)
        lensWorld.set(.15, 0, 0)
        flashlight.localToWorld(lensWorld)
      }
    }
  }

  // Evaluate the grounded stance before the renderer can see a bind pose.
  update(0, 0, 0, 0, 0, 0)
  return {
    root, update,
    react(kind, targetX, targetZ) {
      if (!disposed) acting = { kind, t: 0, x: targetX, z: targetZ }
    },
    setGear(next) { gear = next },
    setFirstPerson(pose) { fp = pose ?? undefined },
    setCrouch(amount) { crouchTarget = clamp(amount, 0, 1) },
    pressFlashlight() { press = 0 },
    flashlightPose() {
      if (!flashlight?.visible) return undefined
      return { position: lensWorld.clone(), direction: new T.Vector3(1, 0, 0).transformDirection(flashlight.matrixWorld) }
    },
    makeFlashlight() { return shared.props.flashlight ? prepProp(shared.props.flashlight) : undefined },
    poseTape({x,z,yaw,time,distance,walk:gait,action}) {
      motion={yaw,phase:((distance/WALK_STRIDE%1)+1)%1,walkWeight:clamp(gait,0,1),runWeight:0,moving:gait>.02}
      elapsed=time%4.4
      acting=action
      update(0,x,z,0,1,0)
    },
    createEcho(next = 'hero') {
      if (disposed) throw new Error('Cannot clone a released actor')
      return instantiate(shared, next)
    },
    dispose() {
      if (disposed) return
      disposed = true
      mixer.stopAllAction()
      mixer.uncacheRoot(body)
      backpack?.removeFromParent()
      straps?.removeFromParent()
      root.removeFromParent()
      root.clear()
      for (const skeleton of skeletons) skeleton.dispose()
      for (const material of variantMaterials.values()) material.dispose()
      if (--shared.references === 0) {
        disposeSource(shared.source.scene)
        for (const prop of [shared.props.flashlight, shared.props.backpack, shared.props.straps]) if (prop) disposeSource(prop)
        sharedPromise = undefined
      }
    },
  }
}

export async function loadActor(): Promise<IsoActor> {
  return instantiate(await loadShared(), 'hero')
}
