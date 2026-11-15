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

/** Triangles of a mesh grouped by connected pieces: returns an index list per piece, with each piece's centre (in the mesh's own space) */
function pieces(geo: T.BufferGeometry) {
  const idx = geo.index!.array, n = geo.getAttribute('position').count, p = geo.getAttribute('position');
  const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a: number) => { while (parent[a] !== a) { parent[a] = parent[parent[a]!]!; a = parent[a]!; } return a; };
  for (let i = 0; i < idx.length; i += 3) { const a = find(idx[i]!), b = find(idx[i + 1]!), c = find(idx[i + 2]!); parent[b] = a; parent[c] = a; }
  const byRoot = new Map<number, { tris: number[]; box: T.Box3 }>(); const v = new T.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    const r = find(idx[i]!); let e = byRoot.get(r); if (!e) { e = { tris: [], box: new T.Box3() }; byRoot.set(r, e); }
    e.tris.push(idx[i]!, idx[i + 1]!, idx[i + 2]!);
    for (let k = 0; k < 3; k++) { v.fromBufferAttribute(p, idx[i + k]!); e.box.expandByPoint(v); }
  }
  return [...byRoot.values()];
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

/** the fuse box: in metres already (43 cm). The knife switch (a few hundred small pieces near the top centre) is split off as `lever` with its pivot. */
/** local depth above which the knife switch's pieces count as the turning handle */
const WING_Z = .04;
export function makeFuseBox(src: T.Object3D) {
  const model = src.clone(true);
  const lever = new T.Group(); const pivot = new T.Vector3(-.018, .325, .02);
  model.updateMatrixWorld(true);
  const toRemove: T.Mesh[] = [];
  model.traverse(n => {
    const m = n as T.Mesh; if (!m.isMesh || !m.geometry.index) return;
    const parts = pieces(m.geometry), body: number[] = []; let knife: number[] = [];
    for (const p of parts) {
      const c = p.box.getCenter(new T.Vector3()).applyMatrix4(m.matrixWorld), sz = p.box.getSize(new T.Vector3());
      const inLever = c.x > -.04 && c.x < .065 && c.y > .26 && c.y < .37 && c.z > -.03 && sz.x < .13 && sz.y < .13;
      (inLever ? knife : body).push(...p.tris);
    }
    // only what stands proud of the panel (the wing handle and its screw) turns; the housing underneath stays where it is
    { const wing: number[] = [], v = new T.Vector3(), pos = m.geometry.getAttribute('position');
      for (let i = 0; i < knife.length; i += 3) {
        let z = 0; for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, knife[i + k]!).applyMatrix4(m.matrixWorld); z += v.z / 3; }
        (z > WING_Z ? wing : body).push(knife[i]!, knife[i + 1]!, knife[i + 2]!);
      }
      knife = wing; }
    if (knife.length) {
      const kg = new T.BufferGeometry();
      for (const name of Object.keys(m.geometry.attributes)) kg.setAttribute(name, m.geometry.getAttribute(name));
      kg.setIndex(knife);
      const km = new T.Mesh(kg, m.material); km.matrix.copy(m.matrixWorld); km.matrixAutoUpdate = false; lever.add(km);
      const bg = m.geometry.clone(); bg.setIndex(body); m.geometry = bg;
    }
    void toRemove;
  });
  weather(model, { dust: .55, rust: .12, dark: .85 });
  const g = new T.Group(); g.add(model);
  // the lever's meshes carry the world matrix of the model; they turn about the pivot, so they get a group placed there
  const leverPivot = new T.Group(); leverPivot.position.copy(pivot);
  lever.children.forEach(k => { const km = k as T.Mesh; const mat = km.matrix.clone(); km.matrixAutoUpdate = true; mat.decompose(km.position, km.quaternion, km.scale); km.position.sub(pivot); leverPivot.add(km); });
  g.add(leverPivot);
  weather(leverPivot, { dust: .3, rust: .25, dark: .9 });
  return { group: g, lever: leverPivot };
}

/** the 9 V battery: 4.85 cm tall, in metres already, lying on its side by default */
export function makeBattery(src: T.Object3D) {
  const model = src.clone(true);
  weather(model, { dust: .4, rust: .05, dark: .85 });
  return wrap(model, 1);
}
