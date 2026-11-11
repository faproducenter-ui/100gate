import { readFile } from 'node:fs/promises'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { describe, expect, it, vi } from 'vitest'
import { WALK_STRIDE, advanceActorMotion, initialActorMotion, loadActor, reactionEnvelope } from './actor'

describe('isometric player movement animation', () => {
  it('uses distance for the authored gait stride', () => {
    const once = advanceActorMotion(initialActorMotion(), .1, 0, 1, 2)
    const split = advanceActorMotion(advanceActorMotion(initialActorMotion(), .05, 0, 1, 2), .05, 0, 1, 2)
    expect(once.phase).toBeCloseTo(.2 / WALK_STRIDE)
    expect(once.phase).toBeCloseTo(split.phase)
    expect(once.walkWeight).toBeCloseTo(split.walkWeight)
  })

  it('holds gait phase on stop and settles out of walk without losing facing', () => {
    const walk = advanceActorMotion(initialActorMotion(), .12, 1, 0, 2.2)
    let stopped = walk
    for (let i = 0; i < 36; i++) stopped = advanceActorMotion(stopped, 1 / 60, 0, 0, 0)
    expect(stopped.phase).toBe(walk.phase)
    expect(stopped.yaw).toBe(walk.yaw)
    expect(stopped.walkWeight).toBeLessThan(.005)
  })

  it('turns the short way when movement crosses the wrap from +pi to -pi', () => {
    const state = { ...initialActorMotion(), yaw: Math.PI - .03 }
    const turned = advanceActorMotion(state, .05, -.02, -1, 2)
    expect(turned.yaw).toBeGreaterThan(state.yaw)
    expect(turned.yaw).toBeLessThan(Math.PI + .021)
  })

  it('gates long pause deltas, non-finite input and reaction pulse boundaries', () => {
    const stable = initialActorMotion()
    expect(advanceActorMotion(stable, Number.NaN, 1, 1, Infinity)).toEqual(stable)
    expect(advanceActorMotion(stable, 10, 0, 1, 2).phase).toBeLessThan(.21)
    expect(reactionEnvelope(-.1)).toBe(0)
    expect(reactionEnvelope(.43)).toBeCloseTo(1)
    expect(reactionEnvelope(1)).toBe(0)
  })
})

it('grounds the packed native actor and gives CCTV its own skeleton', async () => {
  const file = await readFile(new URL('../../public/assets/iso/alexei-6.glb', import.meta.url))
  const oldJsonLength = file.readUInt32LE(12)
  const document = JSON.parse(file.subarray(20, 20 + oldJsonLength).toString())
  // This rig check runs in Node without decoding images or starting a browser.
  // Mesh positions, skin weights, skeleton and clip buffers remain unchanged.
  for (const mesh of document.meshes) for (const primitive of mesh.primitives) delete primitive.material
  const json = Buffer.from(JSON.stringify(document))
  const aligned = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, ' ')])
  const packed = Buffer.concat([file.subarray(0, 20), aligned, file.subarray(20 + oldJsonLength)])
  packed.writeUInt32LE(packed.length, 8)
  packed.writeUInt32LE(aligned.length, 12)
  const parsed = await new GLTFLoader().parseAsync(Uint8Array.from(packed).buffer, '')
  const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(parsed)
  const actor = await loadActor(), echo = actor.createEcho('staff')
  try {
    const foot = actor.root.getObjectByName('foot_l')!
    const echoFoot = echo.root.getObjectByName('foot_l')!
    const boots = actor.root.getObjectByProperty('isSkinnedMesh', true)!.parent!.children
      .find(obj => obj.name.includes('ankle_boots')) as T.SkinnedMesh
    expect(foot).not.toBe(echoFoot)
    expect(foot.quaternion.toArray()).toEqual(echoFoot.quaternion.toArray())
    const position = boots.geometry.getAttribute('position'), joint = new T.Vector3()
    let minimum = Infinity
    for (let i = 0; i < position.count; i++) {
      boots.applyBoneTransform(i, joint.fromBufferAttribute(position, i))
      minimum = Math.min(minimum, boots.localToWorld(joint).y)
    }
    expect(Math.abs(minimum)).toBeLessThan(.003)
    for (let i = 0; i < 30; i++) actor.update(1 / 60, 1 + i / 30, 2, 1, 0, 1.8)
    expect(actor.root.rotation.y).toBeGreaterThan(1.53)
    expect(echo.root.rotation.y).toBe(0)
    expect(foot.quaternion.angleTo(echoFoot.quaternion)).toBeGreaterThan(.06)
    actor.dispose()
    echo.update(.1, 6, 2, 0, -1, 1.4)
    expect(echo.root.position.x).toBe(6)
  } finally {
    actor.dispose()
    echo.dispose()
    load.mockRestore()
  }
})
