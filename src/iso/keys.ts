import * as T from 'three';

const clamp = T.MathUtils.clamp;

type Swing = { node: T.Object3D; rest: number; a: number; v: number; w: number; tilt: number; tiltV: number };

/**
 * The "Key with Tag" prop. Hanging on a hook, the key and the tag are two pendulums on the same ring:
 * they swing under draughts and passing footsteps, damp out, and when they knock into each other they
 * report an impact so the sound can follow the real motion (loud clink, quiet tick, or silence).
 * Lying flat it is a static prop.
 */
export class KeyProp {
  readonly root = new T.Group();
  private readonly body = new T.Group();
  private key?: Swing;
  private tag?: Swing;
  private clinkCooldown = 0;
  private readonly hanging: boolean;

  constructor(model: T.Object3D, mode: 'hang' | 'flat') {
    this.hanging = mode === 'hang';
    this.root.name = 'Key with tag (' + mode + ')';
    const m = model.clone(true);
    m.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.body.add(m);
    this.root.add(this.body);
    this.root.updateMatrixWorld(true);
    const keyNode = m.getObjectByName('SM_Key'), tagNode = m.getObjectByName('SM_KeyTag'), ringNode = m.getObjectByName('SM_Ring');
    if (!keyNode || !tagNode || !ringNode) return;
    // Ring centre in the prop's own frame: the shared pivot of key and tag.
    const centre = new T.Box3().setFromObject(ringNode).getCenter(new T.Vector3());
    this.root.worldToLocal(centre);
    if (this.hanging) {
      const make = (node: T.Object3D, rest: number, w: number): Swing => {
        const pivot = new T.Group();
        pivot.position.copy(centre);
        this.body.add(pivot);
        pivot.updateMatrixWorld(true);
        pivot.attach(node);
        return { node: pivot, rest, a: 0, v: 0, w, tilt: 0, tiltV: 0 };
      };
      // The key blade points up in the model, so it is flipped to hang down; the tag already hangs down.
      this.key = make(keyNode, Math.PI + .24, 15.5);
      this.tag = make(tagNode, -.2, 13.5);
      this.body.position.sub(centre); // the ring is the origin: the hook point
      this.apply();
    } else {
      this.root.rotation.x = -Math.PI / 2; // lie flat, face up
    }
  }

  /** A gentle shove, e.g. when someone brushes past or the prop is touched. */
  kick(strength: number) {
    for (const s of [this.key, this.tag]) {
      if (!s) continue;
      s.v += (Math.random() - .5) * 2 * strength;
      s.tiltV += (Math.random() - .5) * 1.2 * strength;
    }
  }

  /** Advance the pendulums; `disturb` 0..1 is how much air/footfall is moving the keys. */
  update(dt: number, disturb: number, onClink: (loudness: number) => void) {
    if (!this.hanging || !this.key || !this.tag) return;
    dt = clamp(dt, 0, .05);
    if (dt <= 0) return;
    this.clinkCooldown = Math.max(0, this.clinkCooldown - dt);
    if (disturb > .02 && Math.random() < disturb * dt * 9) this.kick(disturb * 1.6);
    const sub = Math.max(1, Math.ceil(dt / .004)), h = dt / sub;
    for (let i = 0; i < sub; i++) {
      for (const s of [this.key, this.tag]) {
        s.v += (-s.w * s.w * s.a - 1.9 * s.v) * h;
        s.a += s.v * h;
        s.tiltV += (-s.w * s.w * .5 * s.tilt - 2.3 * s.tiltV) * h;
        s.tilt += s.tiltV * h;
        s.a = clamp(s.a, -1.3, 1.3); s.tilt = clamp(s.tilt, -.5, .5);
      }
      // Key and tag are separate bodies on one ring: they cannot pass through each other.
      const gap = (this.key.rest - Math.PI + this.key.a) - (this.tag.rest + this.tag.a);
      const min = .16;
      if (gap < min) {
        const push = (min - gap) / 2;
        this.key.a += push; this.tag.a -= push;
        const rel = this.tag.v - this.key.v; // closing speed
        if (rel > 0) {
          const e = .45, mean = (this.key.v + this.tag.v) / 2;
          this.key.v = mean + e * rel / 2; this.tag.v = mean - e * rel / 2;
          if (rel > .35 && this.clinkCooldown <= 0) { onClink(clamp(rel / 5, .08, 1)); this.clinkCooldown = .07; }
        }
      }
    }
    this.apply();
  }

  private apply() {
    if (!this.key || !this.tag) return;
    this.key.node.rotation.set(this.key.tilt, 0, this.key.rest + this.key.a);
    this.tag.node.rotation.set(this.tag.tilt, 0, this.tag.rest + this.tag.a);
  }
}
