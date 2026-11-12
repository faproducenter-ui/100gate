import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Rigid-body physics for loose props (Rapier). The building is one static set of triangle meshes, the door
 * leaves are kinematic boxes that follow their hinges, the player is a kinematic capsule that can nudge
 * things, and every free prop is a dynamic convex body with a real mass.
 */
export type Physics = Awaited<ReturnType<typeof createPhysics>>;

let ready: Promise<void> | undefined;
export function initPhysics() { return ready ??= RAPIER.init(); }

const STEP = 1 / 120;

export async function createPhysics() {
  await initPhysics();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  let acc = 0;
  const v3 = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(), m = new T.Matrix4();

  /** Every mesh under `root` (except the skipped subtrees) becomes static collision geometry. */
  function addStatic(root: T.Object3D, skip: Set<T.Object3D>) {
    root.updateMatrixWorld(true);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    let triangles = 0;
    const walk = (o: T.Object3D) => {
      if (skip.has(o)) return;
      if (o instanceof T.Mesh && !(o.material as T.Material).transparent) {
        const g = o.geometry as T.BufferGeometry, p = g.getAttribute('position');
        if (p) {
          const verts = new Float32Array(p.count * 3);
          for (let i = 0; i < p.count; i++) {
            v3.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
            verts[i * 3] = v3.x; verts[i * 3 + 1] = v3.y; verts[i * 3 + 2] = v3.z;
          }
          const idx = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: p.count }, (_, i) => i);
          if (idx.length >= 3) {
            world.createCollider(RAPIER.ColliderDesc.trimesh(verts, idx).setFriction(.7).setRestitution(.15), body);
            triangles += idx.length / 3;
          }
        }
      }
      for (const c of o.children) walk(c);
    };
    walk(root);
    return triangles;
  }

  /** A box that follows an animated object (door leaf): centre and half extents in the object's own space. */
  function addKinematicBox(follow: T.Object3D, centre: T.Vector3, half: T.Vector3) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(centre.x, centre.y, centre.z).setFriction(.6), body);
    const sync = () => {
      follow.updateWorldMatrix(true, false);
      follow.matrixWorld.decompose(v3, q, s);
      body.setNextKinematicTranslation(v3);
      body.setNextKinematicRotation(q);
    };
    sync();
    return sync;
  }

  // The player: a capsule pushed along by the walking code, so a prop on the floor is kicked aside, not walked through.
  const player = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, .85, 0));
  world.createCollider(RAPIER.ColliderDesc.capsule(.6, .22).setFriction(.3), player);

  /** A dynamic prop: convex hull of its meshes (in its own space), with a given mass. */
  function addDynamic(obj: T.Object3D, mass: number) {
    obj.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(obj.matrixWorld).invert(), pts: number[] = [];
    obj.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      const p = o.geometry.getAttribute('position');
      const local = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const stride = Math.max(1, Math.floor(p.count / 400));
      for (let i = 0; i < p.count; i += stride) { v3.fromBufferAttribute(p, i).applyMatrix4(local); pts.push(v3.x, v3.y, v3.z); }
    });
    obj.matrixWorld.decompose(v3, q, s);
    // The hull is built in world scale, so bake the object's scale into the points.
    for (let i = 0; i < pts.length; i += 3) { pts[i]! *= s.x; pts[i + 1]! *= s.y; pts[i + 2]! *= s.z; }
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(v3.x, v3.y, v3.z)
      .setRotation(q).setCcdEnabled(true).setLinearDamping(.05).setAngularDamping(.35).setCanSleep(true));
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts)) ?? RAPIER.ColliderDesc.ball(.04);
    world.createCollider(desc.setMass(mass).setFriction(.65).setRestitution(.22), body);
    return body;
  }

  return {
    addStatic, addKinematicBox, addDynamic,
    remove(body: RAPIER.RigidBody) { world.removeRigidBody(body); },
    movePlayer(x: number, z: number, eye: number) { player.setNextKinematicTranslation({ x, y: Math.max(.6, eye - .8), z }); },
    /** Fixed 120 Hz steps; returns how many steps ran. */
    step(dt: number) {
      acc = Math.min(acc + Math.max(0, dt), .1);
      let n = 0;
      while (acc >= STEP) { world.step(); acc -= STEP; n++; }
      return n;
    },
    /** Copy a body's pose onto its object. */
    pull(body: RAPIER.RigidBody, obj: T.Object3D) {
      const t = body.translation(), r = body.rotation();
      obj.position.set(t.x, t.y, t.z); obj.quaternion.set(r.x, r.y, r.z, r.w); obj.updateMatrixWorld(true);
    },
    matrixOf(body: RAPIER.RigidBody) {
      const t = body.translation(), r = body.rotation();
      return m.compose(v3.set(t.x, t.y, t.z), q.set(r.x, r.y, r.z, r.w), s.set(1, 1, 1)).clone();
    },
  };
}
