import * as T from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

const ASSET = 'assets/iso/alexei.glb'
const TAU = Math.PI * 2
const clamp = T.MathUtils.clamp
const shortestAngle = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))
const stepDelta = (dt: number) => Number.isFinite(dt) ? clamp(dt, 0, .125) : 0
const moveAlpha = (dt: number, rate: number) => -Math.expm1(-dt * rate)
type Motion = { yaw: number; phase: number; walkWeight: number }

export const initialActorMotion = (): Motion => ({ yaw: 0, phase: 0, walkWeight: 0 })

/** Rootless 1 m locomotion authored in Blender. Advance only by world travel. */
export function advanceActorMotion(state: Motion, dt: number, dx: number, dz: number, speed: number): Motion {
  dt = stepDelta(dt)
  if (!dt) return state
  const moving = Number.isFinite(speed) && speed > .045
  const heading = moving && Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) > 1e-5
  return {
    yaw: heading ? state.yaw + shortestAngle(state.yaw, Math.atan2(dx, dz)) * moveAlpha(dt, 13) : state.yaw,
    phase: moving ? (state.phase + dt * clamp(speed, 0, 5)) % 1 : state.phase,
    walkWeight: T.MathUtils.lerp(state.walkWeight, moving ? 1 : 0, moveAlpha(dt, moving ? 16 : 11)),
  }
}

export function reactionEnvelope(u: number) {
  if (u <= 0 || u >= 1 || !Number.isFinite(u)) return 0
  return T.MathUtils.smootherstep(u, 0, .3) * (1 - T.MathUtils.smootherstep(u, .54, 1))
}

type Reaction = 'interact' | 'pick-up' | 'door' | 'fear' | 'examine'
type Variant = 'hero' | 'staff' | 'shadow'
export type IsoActor = {
  root: T.Object3D;
  update(dt: number, x: number, z: number, dx: number, dz: number, speed: number): void;
  react(kind: Reaction, targetX?: number, targetZ?: number): void;
  poseTape(pose:{x:number;z:number;yaw:number;time:number;distance:number;walk:number;
    action?:{kind:Reaction;t:number;x:number;z:number}}):void;
  createEcho(variant?: Variant): IsoActor;
  dispose(): void;
}

type Shared = { source: GLTF; idle: T.AnimationClip; walk: T.AnimationClip; references: number }
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

function loadShared(): Promise<Shared> {
  if (sharedPromise) return sharedPromise
  sharedPromise = new GLTFLoader().loadAsync(import.meta.env.BASE_URL + ASSET).then(source => {
    const idle = T.AnimationClip.findByName(source.animations, 'Idle')
    const walk = T.AnimationClip.findByName(source.animations, 'Walk')
    const bones = new Set<string>()
    let skins = 0
    source.scene.traverse(obj => {
      if (obj instanceof T.Bone) bones.add(obj.name)
      if (obj instanceof T.SkinnedMesh) skins++
    })
    if (!idle?.validate() || !walk?.validate() || Math.abs(walk.duration - 1) > .001 || bones.size !== 53 || skins !== 5) {
      disposeSource(source.scene)
      throw new Error('Invalid native actor: missing expected rig, skin or gait')
    }
    return { source, idle, walk, references: 0 }
  }).catch(error => {
    sharedPromise = undefined
    throw error
  })
  return sharedPromise
}

const REACTION: Record<Reaction, { seconds: number; pitch: number; arm: number; height: number }> = {
  'interact': { seconds: .57, pitch: -.027, arm: .47, height: 1.11 },
  'pick-up': { seconds: .74, pitch: -.16, arm: .41, height: .66 },
  'door': { seconds: .72, pitch: -.052, arm: .70, height: 1.06 },
  'fear': { seconds: .87, pitch: .09, arm: 0, height: 0 },
  'examine': { seconds: .82, pitch: -.057, arm: .18, height: 1.20 },
}

function instantiate(shared: Shared, variant: Variant): IsoActor {
  // SkeletonUtils makes joint ownership independent while retaining the GPU
  // geometry/textures for the gameplay hero and both CCTV echoes.
  const body = clone(shared.source.scene), root = new T.Group()
  root.name = '100gate | ' + (variant === 'hero' ? 'Алексей' : 'CCTV · ' + variant)
  root.add(body)
  const joints = new Map<string, T.Bone>(), skeletons = new Set<T.Skeleton>()
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
    skeletons.add(obj.skeleton)
    if (variant !== 'hero') obj.material = Array.isArray(obj.material) ? obj.material.map(materialFor) : materialFor(obj.material)
  })
  shared.references++
  const mixer = new T.AnimationMixer(body)
  const idle = mixer.clipAction(shared.idle).play().setEffectiveWeight(1)
  const walk = mixer.clipAction(shared.walk).play().setEffectiveWeight(0)
  idle.paused = walk.paused = true
  const chest = joints.get('spine_03'), head = joints.get('head'), arm = joints.get('upperarm_r')
  const axis = new T.Vector3(), target = new T.Vector3(), origin = new T.Vector3()
  const localY = new T.Vector3(0, 1, 0), worldRight = new T.Vector3(), q = new T.Quaternion(), toward = new T.Quaternion()
  let motion = initialActorMotion(), elapsed = 0, disposed = false
  let acting: { kind: Reaction; t: number; x?: number; z?: number } | undefined

  function bend(joint: T.Bone | undefined, angle: number) {
    if (!joint || Math.abs(angle) < 1e-5) return
    axis.copy(worldRight).applyQuaternion(joint.getWorldQuaternion(q).invert())
    joint.quaternion.multiply(q.setFromAxisAngle(axis, angle))
  }

  const update: IsoActor['update'] = (delta, x, z, dx, dz, speed) => {
    if (disposed) return
    const dt = stepDelta(delta)
    elapsed = (elapsed + dt) % 4.4
    motion = advanceActorMotion(motion, dt, dx, dz, speed)
    if (acting && acting.x !== undefined && acting.z !== undefined && speed < .15 &&
      Math.hypot(acting.x - x, acting.z - z) > .14) {
      const aim = Math.atan2(acting.x - x, acting.z - z)
      motion.yaw += shortestAngle(motion.yaw, aim) * moveAlpha(dt, 9)
    }
    root.position.set(x, 0, z)
    root.rotation.y = motion.yaw
    walk.time = motion.phase * shared.walk.duration
    const gaitBlend = motion.walkWeight < .002 ? 0 : motion.walkWeight
    idle.setEffectiveWeight(1 - gaitBlend)
    walk.setEffectiveWeight(gaitBlend)
    mixer.update(0)
    worldRight.set(Math.cos(motion.yaw), 0, -Math.sin(motion.yaw))
    const breath = Math.sin(elapsed * TAU / 4.4) * .016 * (1 - gaitBlend)
    if (acting) {
      const beat = REACTION[acting.kind]
      acting.t += dt
      const weight = reactionEnvelope(acting.t / beat.seconds) * (1 - gaitBlend)
      if (weight > 0) {
        bend(chest, beat.pitch * weight + breath)
        bend(head, (acting.kind === 'fear' ? -.07 : beat.pitch * .9) * weight)
        if (arm && beat.arm) {
          arm.getWorldPosition(origin)
          target.set(acting.x ?? x + Math.sin(motion.yaw), beat.height,
            acting.z ?? z + Math.cos(motion.yaw)).sub(origin).normalize()
          target.applyQuaternion(arm.getWorldQuaternion(q).invert())
          const angle = localY.angleTo(target)
          if (angle > .001) {
            toward.setFromUnitVectors(localY, target)
            q.identity().slerp(toward, Math.min(1, beat.arm / angle) * weight)
            arm.quaternion.multiply(q)
          }
        }
      } else bend(chest, breath)
      if (acting.t >= beat.seconds) acting = undefined
    } else bend(chest, breath)
    root.updateMatrixWorld(true)
  }

  // Evaluate the grounded stance before the renderer can see a bind pose.
  update(0, 0, 0, 0, 0, 0)
  return {
    root, update,
    react(kind, targetX, targetZ) {
      if (!disposed) acting = { kind, t: 0, x: targetX, z: targetZ }
    },
    poseTape({x,z,yaw,time,distance,walk,action}) {
      motion={yaw,phase:((distance%1)+1)%1,walkWeight:clamp(walk,0,1)}
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
      root.removeFromParent()
      root.clear()
      for (const skeleton of skeletons) skeleton.dispose()
      for (const material of variantMaterials.values()) material.dispose()
      if (--shared.references === 0) {
        disposeSource(shared.source.scene)
        sharedPromise = undefined
      }
    },
  }
}

export async function loadActor(): Promise<IsoActor> {
  return instantiate(await loadShared(), 'hero')
}
