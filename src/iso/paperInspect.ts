import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { PaperKind } from './contracts';

/**
 * Looking at a paper thing in first person: the hero lifts a sheet with both hands and holds it up to read.
 *
 * The pose and the motion are authored in Blender (art/paper-inspect.blend, tools/viewmodel-debug/blender/paper_inspect.py):
 * both arms solved onto a `paper` bone, thumbs over the front near the side edges, fingers behind, elbows down and out;
 * clips paper_open / paper_idle / paper_close for three grip widths (narrow, a4, wide), baked to bone keys.
 * paper-inspect-1.glb carries only those clips, the `paper` bone with the sheet mesh and the eye point; the skinned arms are the
 * game's own viewmodel (viewmodel-9.glb), cloned here, so the clips play on the very same hands.
 *
 * What changes per document is only the content: the kind picks the sheet size and grip, the face is a canvas texture.
 * On top of the clips there is a light procedural layer: the hands trail a turn of the head, sway, bob with the steps.
 */

export type { PaperKind };
type Grip = 'narrow' | 'a4' | 'wide';

/** sheet size in metres and which authored grip holds it (the grip's hands sit on its side edges) */
export const PAPER_KINDS: Record<PaperKind, { grip: Grip; w: number; h: number; base: string; ink: string }> = {
  document: { grip: 'a4', w: .21, h: .297, base: '#d3ccb6', ink: '#2a251b' },
  letter: { grip: 'a4', w: .21, h: .27, base: '#d8cfb2', ink: '#24203a' },
  page: { grip: 'a4', w: .2, h: .28, base: '#cfc6a9', ink: '#2a251b' },
  note: { grip: 'narrow', w: .15, h: .19, base: '#d9d0a8', ink: '#1d2240' },
  clipping: { grip: 'narrow', w: .15, h: .22, base: '#c2baa2', ink: '#1b1b1b' },
  map: { grip: 'wide', w: .32, h: .24, base: '#cbbf9c', ink: '#3a2c1c' },
};
const AUTHORED = { w: .21, h: .297 };          // the sheet mesh in the GLB

export type PaperContent = {
  kind: PaperKind;
  title?: string;
  text?: string;
  /** false when the readable text is laid over the sheet by the page (HTML): the face then keeps only its ruling, stamp or drawing */
  textOnSheet?: boolean;
  /** draw the face yourself (a map, a photo, a drawing): the canvas is already filled with the paper's colour and wear */
  draw?: (g: CanvasRenderingContext2D, w: number, h: number) => void;
};

/** run-time tuning; defaults are the values that read naturally with the authored clips */
export type InspectTuning = {
  /** extra offset of the held sheet in camera space (metres: x right, y up, z back) */
  position: T.Vector3;
  /** extra turn in radians (pitch, yaw, roll) */
  rotation: T.Euler;
  /** overall size of hands and sheet (1 = authored) */
  scale: number;
  /** idle sway on top of the clip's breathing (0 = none, 1 = default) */
  sway: number;
  /** how much the hands trail a turn of the view (0 = locked to the camera) */
  lookFollow: number;
  /** step bob while walking with the sheet up */
  moveBob: number;
  /** clip speed for raising and lowering */
  openSpeed: number;
  closeSpeed: number;
};
export const INSPECT_DEFAULTS: InspectTuning = {
  position: new T.Vector3(0, 0, 0), rotation: new T.Euler(0, 0, 0, 'YXZ'), scale: 1,
  sway: 1, lookFollow: 1, moveBob: 1, openSpeed: 1, closeSpeed: 1.15,
};

type State = 'hidden' | 'opening' | 'holding' | 'closing';
const clamp = T.MathUtils.clamp, damp = T.MathUtils.damp;

export class PaperInspectView {
  /** camera-space group: add it to the viewmodel scene (it is drawn with the viewmodel camera) */
  readonly root = new T.Group();
  readonly tuning: InspectTuning;
  private readonly model = new T.Group();
  private readonly rig: T.Object3D;
  private readonly mixer: T.AnimationMixer;
  private readonly clips = new Map<string, T.AnimationAction>();
  private sheet?: T.Mesh;
  private sheetNode?: T.Object3D;
  private readonly front: T.MeshStandardMaterial;
  private readonly back: T.MeshStandardMaterial;
  private state: State = 'hidden';
  private grip: Grip = 'a4';
  private kind: PaperKind = 'document';
  private current?: T.AnimationAction;
  private time = 0;
  private lagYaw = 0; private lagPitch = 0; private prevYaw = 0; private prevPitch = 0; private started = false;
  private bob = 0; private walkW = 0;
  readonly ready: boolean;

  constructor(viewmodel: { scene: T.Object3D }, paper: { scene: T.Object3D; animations: T.AnimationClip[] }, tuning: Partial<InspectTuning> = {}) {
    this.tuning = { ...INSPECT_DEFAULTS, ...tuning };
    this.root.name = 'Paper inspect'; this.root.visible = false;
    this.root.add(this.model);
    this.rig = clone(viewmodel.scene);
    // only the arms: the torch and the lighters of the viewmodel stay out of this view
    this.rig.traverse(o => {
      if (o instanceof T.Mesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; if (!/^Hero_/.test(o.name)) o.visible = false; }
    });
    this.front = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .93, metalness: 0 });
    this.back = new T.MeshStandardMaterial({ color: 0xb9b19a, roughness: .95, metalness: 0 });
    const srcBone = paper.scene.getObjectByName('paper');
    const armature = this.rig.getObjectByName('Hero') ?? this.rig.getObjectByName('_rootJoint')?.parent ?? this.rig;
    if (srcBone) {
      const bone = srcBone.clone(true);
      armature.add(bone);
      this.sheetNode = bone.getObjectByName('Paper');
      this.sheetNode?.traverse(o => {
        if (!(o instanceof T.Mesh)) return;
        o.frustumCulled = false;
        // the GLB has two primitives: the face (material Paper) and the back + rim (PaperBack)
        const name = (o.material as T.Material).name;
        o.material = name === 'Paper' ? this.front : this.back;
        if (name === 'Paper') this.sheet = o;
      });
    }
    this.mixer = new T.AnimationMixer(this.rig);
    for (const c of paper.animations) this.clips.set(c.name, this.mixer.clipAction(c));
    // the eye of the authored camera becomes the origin; the model faces +Z, the camera looks down -Z
    const eye = paper.scene.getObjectByName('EYE')?.position.clone() ?? new T.Vector3(0, 1.65, -.1);
    this.rig.position.copy(eye).negate();
    this.model.rotation.y = Math.PI;
    this.model.add(this.rig);
    this.ready = !!srcBone && this.clips.size > 0;
    this.setContent({ kind: 'document' });
  }

  get visible() { return this.state !== 'hidden'; }
  get paperKind() { return this.kind; }
  /** the sheet's face mesh (for tests and tools) */
  get face() { return this.sheet; }
  get phase() { return this.state; }
  /** 0 while hidden, 1 once the sheet has settled in front of the eye (drives the readable ink laid over it) */
  get settled() {
    if (this.state === 'holding') return 1;
    const a = this.current; if (!a || this.state === 'hidden') return 0;
    const p = clamp(a.time / a.getClip().duration, 0, 1);
    return this.state === 'opening' ? p * p * (3 - 2 * p) : 1 - p;
  }

  /** lift a sheet into view; a sheet already up just changes its face */
  open(content: PaperContent) {
    this.setContent(content);
    if (!this.ready || this.state === 'opening' || this.state === 'holding') return;
    const from = this.state === 'closing' && this.current ? 1 - clamp(this.current.time / this.current.getClip().duration, 0, 1) : 0;
    this.play('open', from, .12);
    this.state = 'opening'; this.root.visible = true;
  }

  /** lower it out of view */
  close() {
    if (this.state === 'hidden' || this.state === 'closing') return;
    const from = this.state === 'opening' && this.current ? 1 - clamp(this.current.time / this.current.getClip().duration, 0, 1) : 0;
    this.play('close', from, .1);
    this.state = 'closing';
  }

  private play(name: 'open' | 'idle' | 'close', fromFrac: number, fade: number) {
    const a = this.clips.get(`paper_${name}_${this.grip}`); if (!a) return;
    a.reset();
    a.setLoop(name === 'idle' ? T.LoopRepeat : T.LoopOnce, Infinity); a.clampWhenFinished = name !== 'idle';
    a.timeScale = name === 'open' ? this.tuning.openSpeed : name === 'close' ? this.tuning.closeSpeed : 1;
    a.time = fromFrac * a.getClip().duration;
    a.play();
    if (this.current && this.current !== a && fade > 0) this.current.crossFadeTo(a, fade, false);
    else { for (const o of this.clips.values()) if (o !== a) o.stop(); a.setEffectiveWeight(1); }
    this.current = a;
  }

  /** the face of the sheet: size and grip from the kind, a canvas texture with the paper's wear and its content */
  setContent(c: PaperContent) {
    const k = PAPER_KINDS[c.kind];
    const gripChanged = k.grip !== this.grip;
    this.kind = c.kind; this.grip = k.grip;
    // the sheet node's mesh is in the exporter's Y-up axes: x across, y out of the face, -z up the page
    this.sheetNode?.scale.set(k.w / AUTHORED.w, 1, k.h / AUTHORED.h);
    const W = 512, H = Math.round(W * k.h / k.w);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d')!;
    paintPaper(g, W, H, k.base, c.kind);
    if (c.draw) c.draw(g, W, H); else paintContent(g, W, H, c, k.ink);
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 4;
    this.front.map?.dispose(); this.front.map = tex; this.front.needsUpdate = true;
    // a grip change while the sheet is up: carry on in the new grip's idle
    if (gripChanged && (this.state === 'holding')) this.play('idle', 0, .25);
  }

  /** per frame: dt, the view's yaw / pitch (radians) and the ground speed (m/s) */
  update(dt: number, look: { yaw: number; pitch: number }, speed = 0) {
    dt = clamp(dt, 0, .1);
    if (this.state === 'hidden') { this.started = false; return; }
    this.time += dt;
    this.mixer.update(dt);
    const a = this.current;
    if (a && this.state === 'opening' && a.time >= a.getClip().duration - 1e-3) { this.play('idle', 0, .3); this.state = 'holding'; }
    else if (a && this.state === 'closing' && a.time >= a.getClip().duration - 1e-3) { this.state = 'hidden'; this.root.visible = false; for (const o of this.clips.values()) o.stop(); this.current = undefined; return; }
    // the hands trail a turn of the view and settle back (critically damped, small)
    const tu = this.tuning;
    const dyaw = this.started ? Math.atan2(Math.sin(look.yaw - this.prevYaw), Math.cos(look.yaw - this.prevYaw)) : 0;
    const dpitch = this.started ? look.pitch - this.prevPitch : 0;
    this.prevYaw = look.yaw; this.prevPitch = look.pitch; this.started = true;
    this.lagYaw = clamp(damp(this.lagYaw + dyaw * .55 * tu.lookFollow, 0, 7, dt), -.07, .07);
    this.lagPitch = clamp(damp(this.lagPitch + dpitch * .55 * tu.lookFollow, 0, 7, dt), -.06, .06);
    // breathing is in the clip; on top: a slow irregular drift of the hands and the step bob
    const t = this.time, s = tu.sway;
    const swayX = (Math.sin(t * .71) + Math.sin(t * 1.93 + 1.3) * .4) * .0011 * s;
    const swayY = (Math.sin(t * .53 + .7) + Math.sin(t * 2.31) * .3) * .0009 * s;
    const swayR = Math.sin(t * .37 + 2.1) * .006 * s;
    const moving = clamp((speed - .15) / .9, 0, 1);
    this.walkW = damp(this.walkW, moving, 6, dt);
    this.bob += dt * clamp(speed, 0, 4) / 1.45 * Math.PI * 2;
    const bobX = Math.sin(this.bob) * .006 * this.walkW * tu.moveBob, bobY = -Math.abs(Math.cos(this.bob)) * .007 * this.walkW * tu.moveBob;
    this.root.position.set(tu.position.x + swayX + bobX - this.lagYaw * .08, tu.position.y + swayY + bobY + this.lagPitch * .1, tu.position.z);
    this.root.rotation.set(tu.rotation.x + this.lagPitch * .6 + swayY * 2, tu.rotation.y + this.lagYaw * .7, tu.rotation.z + swayR + this.lagYaw * .25 + bobX * .8, 'YXZ');
    this.root.scale.setScalar(tu.scale);
    this.root.updateMatrixWorld(true);
  }

  /** the face's four corners (top-left, top-right, bottom-right, bottom-left) in the viewmodel camera's space, for laying text over it */
  corners(): T.Vector3[] | undefined {
    const node = this.sheetNode;
    if (!node || !this.visible) return undefined;
    this.root.updateMatrixWorld(true);
    const toCam = this.root.parent ? this.root.parent.matrixWorld.clone().invert() : new T.Matrix4();
    // node space: x across, the page runs along -z; the node's scale already holds this kind's size
    return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) =>
      new T.Vector3(sx! * AUTHORED.w / 2, 0, -sy! * AUTHORED.h / 2).applyMatrix4(node.matrixWorld).applyMatrix4(toCam));
  }

  dispose() { this.front.map?.dispose(); this.front.dispose(); this.back.dispose(); this.mixer.stopAllAction(); this.root.removeFromParent(); }
}

/** aged paper: a warm base, uneven tone, foxing spots, a faint fold, darker edges */
function paintPaper(g: CanvasRenderingContext2D, W: number, H: number, base: string, kind: PaperKind) {
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  let seed = W * 7 + H * 13 + kind.length * 101;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H, r = 18 + rnd() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < .5;
    gr.addColorStop(0, dark ? 'rgba(90,72,40,.07)' : 'rgba(255,250,235,.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(120,80,30,${.05 + rnd() * .08})`; g.beginPath(); g.arc(rnd() * W, rnd() * H, 1 + rnd() * 3.5, 0, 7); g.fill(); }
  // one fold across the middle (letters and documents were folded to fit a pocket)
  if (kind !== 'clipping') { const y = H * .5; const gr = g.createLinearGradient(0, y - 6, 0, y + 6); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, 'rgba(70,55,30,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, y - 6, W, 12); }
  const edge = g.createLinearGradient(0, 0, W, 0); edge.addColorStop(0, 'rgba(80,60,30,.16)'); edge.addColorStop(.06, 'rgba(0,0,0,0)'); edge.addColorStop(.94, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(80,60,30,.16)');
  g.fillStyle = edge; g.fillRect(0, 0, W, H);
  const edgeV = g.createLinearGradient(0, 0, 0, H); edgeV.addColorStop(0, 'rgba(80,60,30,.14)'); edgeV.addColorStop(.05, 'rgba(0,0,0,0)'); edgeV.addColorStop(.95, 'rgba(0,0,0,0)'); edgeV.addColorStop(1, 'rgba(80,60,30,.18)');
  g.fillStyle = edgeV; g.fillRect(0, 0, W, H);
}

/**
 * The content as it would look from reading distance: the title and the lines of text as ink bars (the readable text is laid
 * over the sheet by the interface once it has settled), a map as a plan drawing, a clipping in columns.
 */
function paintContent(g: CanvasRenderingContext2D, W: number, H: number, c: PaperContent, ink: string) {
  const m = W * .09, onSheet = c.textOnSheet !== false, text = onSheet ? c.text ?? '' : '', title = onSheet ? c.title ?? '' : '';
  g.fillStyle = ink;
  const bars = (x: number, y: number, w: number, lines: number, step: number, alpha: number) => {
    if (!onSheet) return;
    let words = text.split(/\s+/).length, row = 0;
    for (let yy = y; yy < H - m && row < lines; yy += step, row++) {
      const len = row % 7 === 6 || words < 6 ? .35 + (row * 37 % 40) / 100 : .82 + (row * 53 % 18) / 100;
      g.globalAlpha = alpha; g.fillRect(x, yy, w * Math.min(1, len), Math.max(2, step * .28)); words -= 6;
    }
    g.globalAlpha = 1;
  };
  const lines = Math.max(6, Math.min(40, Math.ceil(text.length / 34)));
  switch (c.kind) {
    case 'map': {
      g.strokeStyle = ink; g.globalAlpha = .7; g.lineWidth = 3;
      const x0 = m, y0 = onSheet ? m * 1.6 : H * .34, w = W - 2 * m, h = H - y0 - m;   // below the title and the legend when those are laid over it
      g.strokeRect(x0, y0, w, h);
      g.lineWidth = 2;
      const cols = [.32, .58, .78], rows = [.4, .7];
      for (const cx of cols) { g.beginPath(); g.moveTo(x0 + w * cx, y0); g.lineTo(x0 + w * cx, y0 + h * (cx > .7 ? .7 : 1)); g.stroke(); }
      for (const ry of rows) { g.beginPath(); g.moveTo(x0, y0 + h * ry); g.lineTo(x0 + w * (ry > .6 ? .58 : 1), y0 + h * ry); g.stroke(); }
      g.globalAlpha = .45; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(x0 + w * .1, y0 + h * .85); g.lineTo(x0 + w * .45, y0 + h * .55); g.lineTo(x0 + w * .7, y0 + h * .2); g.stroke(); g.setLineDash([]);
      if (title) { g.globalAlpha = .8; g.fillRect(x0, m * .7, Math.min(w * .5, 20 + title.length * 9), 9); }
      g.globalAlpha = 1; break;
    }
    case 'clipping': {
      if (onSheet) { g.globalAlpha = .85; g.fillRect(m, m, W - 2 * m, H * .05); g.globalAlpha = 1; }
      const colW = (W - 2 * m - 14) / 2;
      bars(m, m + H * .1, colW, 30, 12, .45); bars(m + colW + 14, m + H * .1, colW, 30, 12, .45);
      break;
    }
    case 'note': {
      g.save(); g.translate(W / 2, H / 2); g.rotate(-.02); g.translate(-W / 2, -H / 2);
      bars(m, m * 1.6, W - 2 * m, lines, 26, .55); g.restore(); break;
    }
    case 'page': {
      g.strokeStyle = 'rgba(60,90,140,.22)'; g.lineWidth = 1;
      for (let y = m * 1.5; y < H - m * .6; y += 22) { g.beginPath(); g.moveTo(m * .5, y); g.lineTo(W - m * .5, y); g.stroke(); }
      g.strokeStyle = 'rgba(160,50,40,.3)'; g.beginPath(); g.moveTo(m * 1.2, 0); g.lineTo(m * 1.2, H); g.stroke();
      if (title) { g.globalAlpha = .75; g.fillRect(m * 1.5, m * .9, Math.min(W * .6, 20 + title.length * 9), 8); g.globalAlpha = 1; }
      bars(m * 1.5, m * 1.5 + 20 - 9, W - m * 2.5, lines, 22, .5); break;
    }
    default: {
      if (title) { g.globalAlpha = .78; g.fillRect(m, m, Math.min(W * .62, 20 + title.length * 9), 10); g.globalAlpha = 1; }
      g.globalAlpha = .3; g.fillRect(m, m + 22, W - 2 * m, 1.5); g.globalAlpha = 1;
      bars(m, m + 44, W - 2 * m, lines, 17, .48);
      if (c.kind === 'document') {          // an office stamp, half faded
        g.save(); g.translate(W * .72, H * .84); g.rotate(-.25); g.strokeStyle = 'rgba(110,40,50,.38)'; g.lineWidth = 4;
        g.beginPath(); g.arc(0, 0, W * .1, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, W * .075, 0, 7); g.stroke(); g.restore();
      }
    }
  }
}
