import * as T from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

/**
 * One interaction system for every hand-held prop (flashlight now; keys, notes, bottles, tools later).
 *
 *   Pickup         – a world prop: its 3D object, physics body while it lies free, and how the hand holds it.
 *   HandController – the right hand's state machine: idle → reaching → holding → releasing → idle.
 *                    It only produces timing and blend weights; the viewmodel turns them into an IK reach,
 *                    a finger blend from open to the authored grip, and the moment the prop changes owner.
 *
 * The prop is handed over at the right moment of the motion: it becomes "held" only when the reach has
 * closed on it (fingers already wrapping), and it becomes physical again only when the fingers open.
 */
export type GripSlot = 'flashlight';
export type PickupDef = {
  id: string;
  /** kilograms */ mass: number;
  /** Which authored grip of the viewmodel holds it (finger pose + attachment node). */
  grip: GripSlot;
};

export class Pickup {
  body?: RAPIER.RigidBody;
  held = false;
  constructor(readonly def: PickupDef, readonly object: T.Object3D) {}
}

export type HandPhase = 'idle' | 'reaching' | 'holding' | 'releasing';
/** What the viewmodel should do this frame. */
export type HandFrame = {
  phase: HandPhase;
  /** 0..1: how strongly the hand is pulled onto the IK target (the prop, or the drop point). */
  reach: number;
  /** 0..1: finger blend, 0 = open relaxed hand, 1 = authored grip. */
  grip: number;
  /** The prop is drawn in the hand (attached) rather than in the world. */
  carrying: boolean;
  item?: Pickup;
};

const REACH = .52, RETURN = .45, EXTEND = .3, LOWER = .35;
const ease = (x: number) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export class HandController {
  phase: HandPhase = 'idle';
  private t = 0;
  item?: Pickup;
  private attached = false;
  private onAttach?: () => void;
  private onRelease?: () => void;

  /** Start reaching for a free prop; `attach` runs when the fingers close on it. */
  reachFor(item: Pickup, attach: () => void) {
    if (this.phase !== 'idle' || item.held) return false;
    this.phase = 'reaching'; this.t = 0; this.item = item; this.attached = false; this.onAttach = attach;
    return true;
  }
  /** Put the held prop down; `release` runs when the fingers open. */
  release(release: () => void) {
    if (this.phase !== 'holding' || !this.item) return false;
    this.phase = 'releasing'; this.t = 0; this.onRelease = release;
    return true;
  }
  /** Restore a prop straight into the hand (loading a save). */
  hold(item: Pickup) { this.phase = 'holding'; this.item = item; item.held = true; this.attached = true; this.t = 0; }
  /** Forget the held prop without animation (new game). */
  reset() { this.phase = 'idle'; this.item = undefined; this.attached = false; this.t = 0; }

  update(dt: number): HandFrame {
    this.t += dt;
    const item = this.item;
    switch (this.phase) {
      case 'reaching': {
        const go = this.t / REACH;
        if (!this.attached && this.t >= REACH) {
          // The hand is on the prop and the fingers are closing: ownership changes now, not earlier.
          this.attached = true; item!.held = true; this.onAttach?.();
        }
        if (this.t >= REACH + RETURN) { this.phase = 'holding'; this.t = 0; }
        const back = Math.max(0, (this.t - REACH) / RETURN);
        return { phase: this.phase, item, carrying: this.attached,
          reach: this.attached ? 1 - ease(back) : ease(go),
          // open the hand on the way in, start closing in the last third, fully closed shortly after contact
          grip: this.attached ? Math.min(1, .55 + back * 2.2) : go < .66 ? .1 : .1 + (go - .66) * 1.35 };
      }
      case 'releasing': {
        const go = this.t / EXTEND;
        if (this.attached && this.t >= EXTEND) {
          this.attached = false; item!.held = false; this.onRelease?.();
        }
        if (this.t >= EXTEND + LOWER) { this.phase = 'idle'; this.t = 0; this.item = undefined; }
        const after = Math.max(0, (this.t - EXTEND) / LOWER);
        return { phase: this.phase, item, carrying: this.attached,
          reach: this.attached ? ease(go) : 1 - ease(after),
          grip: this.attached ? 1 : Math.max(.1, 1 - after * 3) };
      }
      case 'holding': return { phase: 'holding', item, carrying: true, reach: 0, grip: 1 };
      default: return { phase: 'idle', carrying: false, reach: 0, grip: .1 };
    }
  }
}
