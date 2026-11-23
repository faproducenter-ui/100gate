import * as T from 'three';

/**
 * The supplied props (CC-BY, see CREDITS.md): a rotary telephone, a CCTV camera, an old fuse box and a 9 V battery. Each is brought to metres,
 * aged (dust on the upward faces, rust in patches, scuffs, dulled colour) and, where something has to move, split into parts with their own pivots.
 */

/** Dust, grime and rust on top of a material's own texture; same look for every prop so that they belong to one place. */
export function weather(model: T.Object3D, o: { dust?: number; rust?: number; dark?: number } = {}) {
  const dust = o.dust ?? .5, rust = o.rust ?? .35, dark = o.dark ?? .8;
  const done = new Set<T.Material>();
  model.traverse(n => {
    const mesh = n as T.Mesh; if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = (Array.isArray(mesh.material) ? mats.map(m => age(m as T.MeshStandardMaterial)) : age(mats[0] as T.MeshStandardMaterial)) as T.Material;
  });
  function age(m: T.MeshStandardMaterial): T.MeshStandardMaterial {
    const c = m.clone(); if (done.has(c)) return c; done.add(c);
    c.color.multiplyScalar(dark); c.roughness = Math.max(.7, c.roughness); c.metalness *= .6; c.envMapIntensity = .3;
    c.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWn; varying vec3 vWp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWn = normalize(mat3(modelMatrix) * normal); vWp = (modelMatrix * vec4(position, 1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWn; varying vec3 vWp;
        float h(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f); return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y), mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
        float fb(vec3 p){ return vn(p) * .55 + vn(p * 2.1) * .3 + vn(p * 4.7) * .15; }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float up = smoothstep(.35, .95, vWn.y);
          float dustMask = clamp(up * (.55 + .8 * fb(vWp * 90.)) * ${dust.toFixed(2)}, 0., .85);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.34, .32, .28), dustMask);
          float rustMask = smoothstep(.58, .78, fb(vWp * 28. + 3.)) * ${rust.toFixed(2)};
          float fine = smoothstep(.55, .85, vn(vWp * 210.));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.30, .13, .055) * (.6 + .6 * fine), rustMask);
          float scuff = smoothstep(.72, .9, vn(vWp * 130. + 9.)) * .25;
          diffuseColor.rgb *= 1. - scuff;
          diffuseColor.rgb *= .82 + .3 * fb(vWp * 14.);
        }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n        roughnessFactor = clamp(roughnessFactor + .25 * smoothstep(.35, .95, vWn.y), 0., 1.);');
    };
    c.customProgramCacheKey = () => `aged-${dust}-${rust}-${dark}`;
    c.needsUpdate = true;
    return c;
  }
  return model;
}

function bounds(o: T.Object3D) { o.updateMatrixWorld(true); return new T.Box3().setFromObject(o); }

/** the model wrapped in a group, scaled, with its origin at the centre of its footprint on the ground (or the centre, when `centre`) */
function wrap(model: T.Object3D, scale: number, centre = false): T.Group {
  const g = new T.Group(); const inner = model; g.add(inner); inner.scale.setScalar(scale);
  const b = bounds(g), c = b.getCenter(new T.Vector3());
  inner.position.set(-c.x, centre ? -c.y : -b.min.y, -c.z);
  g.updateMatrixWorld(true);
  return g;
}

/** the telephone: 22 cm wide in the file's centimetres; the dial is its own pivot and turns about the telephone's vertical axis */
export function makePhone(src: T.Object3D) {
  const model = src.clone(true);
  let dial: T.Mesh | undefined;
  model.traverse(n => { const m = n as T.Mesh; if (m.isMesh && m.geometry.getAttribute('position').count < 400) dial = m; });
  let dialPivot: T.Group | undefined;
  if (dial) {
    // the dial mesh is moved so that its own centre is the pivot, then wrapped in a group sitting where it was
    dial.geometry = dial.geometry.clone(); dial.geometry.computeBoundingBox();
    const c = dial.geometry.boundingBox!.getCenter(new T.Vector3()); dial.geometry.translate(-c.x, -c.y, -c.z);
    const parent = dial.parent!; dialPivot = new T.Group(); dialPivot.position.copy(c); parent.add(dialPivot); dialPivot.add(dial);
    dial.position.set(0, 0, 0);
  }
  weather(model, { dust: .8, rust: .25, dark: .72 });
  const g = wrap(model, .01);
  return { group: g, dial: dialPivot };
}

/** the CCTV camera: 2 units long in the file → 24 cm; the lens end is made to face +z. A small red LED sits on the top of the housing. */
export function makeCamera(src: T.Object3D) {
  const model = src.clone(true);
  weather(model, { dust: .9, rust: .3, dark: .8 });
  const g = wrap(model, .12, true);
  const led = new T.Mesh(new T.SphereGeometry(.0075, 12, 10), new T.MeshBasicMaterial({ color: 0xff2210, transparent: true, opacity: 0 }));
  led.position.set(.035, .02, -.163); g.add(led);   // on the lens itself: the glass is at the model's -z end
  const halo = new T.Sprite(new T.SpriteMaterial({ color: 0xff2a14, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.set(.07, .07, 1); halo.position.copy(led.position); halo.raycast = () => {}; led.raycast = () => {}; g.add(halo);
  return { group: g, led, halo };
}

/** the fuse box: in metres already (43 cm). Its rotary switch is a scan fused with the panel: a cast wing handle on a hub, a rag wound tight
 * round it, two loose ends hanging down. Nothing is cut out: the switch turns by moving the scan's own vertices about the hub's real axis. */
const HUB = new T.Vector2(.0102, .3187);   // centre of the hub ring, measured on the scan (model space, metres; the axis is the panel normal +z)
const PANEL_Z = .004;                       // the panel's face around the switch
const TURN = 2.1;                           // from OFF to ON the handle turns 120 degrees clockwise, between two stops

const smooth = (x: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** the turning switch: rigid handle, wound rag that turns with it and stretches where it meets the panel, loose ends that lag and swing */
export class KnifeSwitch {
  angle = 0;                 // current angle of the handle (rad, 0 = OFF, -TURN = ON)
  speed = 0;                 // its angular speed (rad/s), for the sound
  onStop?: (at: 'rest' | 'on', hit: number) => void;
  private lag = 0; private lagV = 0; private kick = 0; private kickT = 9; private at: 'rest' | 'on' | null = 'rest'; private drawn = NaN; private t = 0;
  private readonly parts: { pos: T.BufferAttribute; nor?: T.BufferAttribute; idx: Uint32Array; rest: Float32Array; nrest: Float32Array; a: Float32Array; b: Float32Array; toLocal: T.Matrix4; nLocal: T.Matrix3 }[] = [];
  constructor(model: T.Object3D) {
    model.updateMatrixWorld(true);
    const v = new T.Vector3(), n = new T.Vector3();
    model.traverse(o => {
      const m = o as T.Mesh; if (!m.isMesh) return;
      const geo = m.geometry = m.geometry.clone();
      // quantized attributes (KHR_mesh_quantization) cannot take the moved positions: the switch's mesh gets plain floats
      const plain = (name: string) => { const src = geo.getAttribute(name) as T.BufferAttribute | undefined; if (!src) return undefined;
        const out = new T.Float32BufferAttribute(src.count * 3, 3); for (let i = 0; i < src.count; i++) out.setXYZ(i, src.getX(i), src.getY(i), src.getZ(i));
        out.setUsage(T.DynamicDrawUsage); geo.setAttribute(name, out); return out; };
      const pos = plain('position')!, nor = plain('normal');
      const M = m.matrixWorld, N = new T.Matrix3().getNormalMatrix(M);
      const idx: number[] = [], rest: number[] = [], nrest: number[] = [], a: number[] = [], b: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(M);
        const r = Math.hypot(v.x - HUB.x, v.y - HUB.y), h = v.z - PANEL_Z;
        if (r > .07 || h < .004) continue;
        // how firmly the vertex is carried by the handle: the cast handle fully, the rag wound on the hub with it, less toward the panel and the rim
        const handle = h > .042 ? 1 : 0;
        const wound = smooth(h, .008, .03) * (1 - smooth(r, .036, .066));
        const ai = Math.max(handle, wound);
        // loose cloth (the hanging ends, the outer folds) keeps its own momentum and lags behind
        const bi = handle ? 0 : smooth(r, .02, .055) * smooth(h, .005, .02) * (v.y < HUB.y ? 1 : .55);
        if (ai < .002 && bi < .002) continue;
        idx.push(i); rest.push(v.x, v.y, v.z); a.push(ai); b.push(bi);
        if (nor) { n.fromBufferAttribute(nor, i).applyMatrix3(N).normalize(); nrest.push(n.x, n.y, n.z); }
      }
      if (!idx.length) return;
      this.parts.push({ pos, nor, idx: Uint32Array.from(idx), rest: Float32Array.from(rest), nrest: Float32Array.from(nrest), a: Float32Array.from(a), b: Float32Array.from(b),
        toLocal: M.clone().invert(), nLocal: new T.Matrix3().getNormalMatrix(M.clone().invert()) });
    });
  }
  /** put the handle somewhere at once, without travel, sound or sway (a loaded game) */
  snap(angle: number) { this.angle = this.lag = Math.min(0, Math.max(-TURN, angle)); this.lagV = 0; this.at = this.angle >= -1e-4 ? 'rest' : this.angle <= -TURN + 1e-4 ? 'on' : null; this.drawn = NaN; this.draw(this.angle, 0, 0); }
  /** target: where the hand drives the handle (0 .. -TURN). The old mechanism does not follow evenly: it sticks, gives, catches on rust. */
  update(target: number, dt: number) {
    dt = Math.min(dt, .05); this.t += dt;
    const goal = Math.min(0, Math.max(-TURN, target)), err = goal - this.angle;
    // uneven drag along the travel (dry rust on the shaft), and a static friction that holds the handle until the hand pushes enough
    const notch = .45 + .55 * (.5 + .5 * Math.sin(this.angle * 9 + Math.sin(this.angle * 23) * .7));
    // near a stop the handle is not held by friction: the spring of the contacts snaps it the last few degrees home
    const toStop = goal <= -TURN + 1e-3 || goal >= -1e-3;
    let vel = Math.abs(err) < .012 && !toStop ? 0 : Math.sign(err) * Math.min(1.5, Math.max(toStop ? (Math.abs(err) < .08 ? 1.1 : .35) : 0, Math.abs(err) * 7.5 * notch));
    const prev = this.angle;
    this.angle = Math.min(0, Math.max(-TURN, this.angle + vel * dt));
    vel = (this.angle - prev) / Math.max(dt, 1e-4); this.speed = vel;
    // the stops: hitting one makes the handle knock back a little and ring
    const now: 'rest' | 'on' | null = this.angle >= -1e-4 ? 'rest' : this.angle <= -TURN + 1e-4 ? 'on' : null;
    if (now && now !== this.at) { const hit = Math.min(1, Math.abs(vel) / 1.2); this.kick = (now === 'on' ? 1 : -1) * (.025 + .03 * hit); this.kickT = 0; this.onStop?.(now, hit); }
    this.at = now;
    this.kickT += dt;
    // loose cloth: a damped spring that trails the handle, overshoots and settles after it stops
    const acc = 85 * (this.angle - this.lag) - 6.5 * this.lagV; this.lagV += acc * dt; this.lag += this.lagV * dt;
    const bounce = this.kick * Math.exp(-this.kickT * 16) * Math.cos(this.kickT * 46);
    const shown = this.angle + bounce;
    const sway = this.lag - shown;
    if (Math.abs(shown - this.drawn) < 1e-4 && Math.abs(sway) < 1e-4 && Math.abs(this.lagV) < 1e-3) return;
    this.drawn = shown;
    this.draw(shown, sway, Math.min(1, Math.abs(this.lagV) * .6));
  }
  private draw(angle: number, sway: number, ripple: number) {
    const v = new T.Vector3(), n = new T.Vector3();
    for (const p of this.parts) {
      for (let k = 0; k < p.idx.length; k++) {
        const ai = p.a[k]!, bi = p.b[k]!;
        const th = angle * ai + sway * bi;
        const c = Math.cos(th), s = Math.sin(th);
        const x = p.rest[3 * k]! - HUB.x, y = p.rest[3 * k + 1]! - HUB.y, z = p.rest[3 * k + 2]!;
        // folds of the loose cloth bunch out a little while it swings (only ever away from the panel)
        const r = Math.hypot(x, y), fold = bi * ripple * .0022 * Math.abs(Math.sin(r * 260 + Math.atan2(y, x) * 3 + this.t * 3));
        v.set(HUB.x + x * c - y * s, HUB.y + x * s + y * c, z + fold).applyMatrix4(p.toLocal);
        p.pos.setXYZ(p.idx[k]!, v.x, v.y, v.z);
        if (p.nor && p.nrest.length) {
          const nx = p.nrest[3 * k]!, ny = p.nrest[3 * k + 1]!, nz = p.nrest[3 * k + 2]!;
          n.set(nx * c - ny * s, nx * s + ny * c, nz).applyMatrix3(p.nLocal).normalize(); p.nor.setXYZ(p.idx[k]!, n.x, n.y, n.z);
        }
      }
      p.pos.needsUpdate = true; if (p.nor) p.nor.needsUpdate = true;
    }
  }
}

export function makeFuseBox(src: T.Object3D) {
  const model = src.clone(true);
  weather(model, { dust: .55, rust: .12, dark: .85 });
  const g = new T.Group(); g.add(model);
  const knife = new KnifeSwitch(model);
  // a marker on the hub axis (the camera's close look aims at it)
  const lever = new T.Group(); lever.position.set(HUB.x, HUB.y, .05); g.add(lever);
  return { group: g, lever, knife, turn: TURN };
}


/** the 9 V battery: 4.85 cm tall, in metres already, lying on its side by default */
export function makeBattery(src: T.Object3D) {
  const model = src.clone(true);
  weather(model, { dust: .4, rust: .05, dark: .85 });
  return wrap(model, 1);
}
