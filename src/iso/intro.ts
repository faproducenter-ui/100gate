import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * The opening, 30 seconds, first person, built from the supplied scans and models:
 *   mountain_road.glb (photogrammetry, daylight baked into the texture; graded to night here),
 *   car_generic_hatchback_gameready_with_interior.glb, large_camping_backpack_freegameready.glb.
 *
 *   0.0–12.6  night drive up the mountain road in the rain, a sign, an oncoming car with its high beams swerves into the lane
 *  12.6–15.6  white flash, black, ringing in the ears
 *  15.6–19.5  waking up in the wreck: the cracked windshield, the beams on the slope, hazard lights
 *  19.5–22.8  out of the car and along its side to the back, red tail lights
 *  22.8–25.6  the trunk opens, the backpack is taken
 *  25.6–30.0  turning to the road, a faint light far off in the fog, a short walk, fade to black
 * Everything is a function of the time t, so it can be skipped, paused or scrubbed.
 */
export const INTRO_DURATION = 30;
export const INTRO_ENABLED = true;

const V = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = T.MathUtils.lerp;
/** smooth 1-D value noise (0..1), for the slow drift of a living head */
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const noise = (x: number) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };
const rnd = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

/** The scan is in its own units: 6 m of asphalt measured 13 units wide, so one unit is 0.46 m. The car file is 2.04 units long and is brought to 4 m. */
export const ROAD_SCALE = 0.46;
export const CAR_SCALE = 4.0 / 2.04;
export const BAG_SCALE = 0.65 / 145.955;
/** the house file is 14.6 units tall: at 0.5 it is a 7.3 m two-storey; its porch door stands at (0.2, 0, -0.5) in the scaled frame and faces +z */
export const HOUSE_SCALE = 0.5;
const HOUSE_DOOR = { x: 0.2, z: -0.5 };
/** footprint boxes of the house in its scaled frame (x0, x1, z0, z1): the main body, the west wing and the porch */
const HOUSE_BOXES: [number, number, number, number][] = [[-6.6, 2.8, -5.7, -0.5], [-6.6, -2.2, -5.7, 2.5], [-2.2, 2.6, -0.5, 1.3]];
/** The road axis, picked on a top-down view of the scan (x, z, surface height in scan units; the heights are smoothed, the scan surface is rough). */
const AXIS: [number, number, number][] = [
  [-164, 83.3, 54], [-143.4, 67.5, 53.1], [-125.2, 50.6, 52.1], [-115.5, 36, 51.3], [-109.4, 21.4, 50.6], [-102.1, 6.9, 50.1], [-91.2, -3.6, 49.8], [-77.9, -7.7, 49.5], [-60.9, -8.4, 49.4],
];

export type TrailerAssets = { road: T.Object3D; car: T.Object3D; bag: T.Object3D; house: T.Object3D };
export async function loadTrailerAssets(base = '', lite = false): Promise<TrailerAssets> {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const [road, car, bag, house] = await Promise.all((lite ? ['road-lite', 'car-lite', 'backpack-lite', 'house-lite'] : ['road', 'car', 'backpack', 'house']).map(n => loader.loadAsync(`${base}assets/iso/trailer/${n}.glb`)));
  return { road: road!.scene, car: car!.scene, bag: bag!.scene, house: house!.scene };
}

/** Night grade for the road scan: the baked daylight is crushed, drained and pushed cold; flat grey surfaces turn into wet asphalt with puddles. */
function gradeRoad(m: T.MeshStandardMaterial) {
  m.roughness = .9; m.metalness = 0;
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN; varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWN = normalize(mat3(modelMatrix) * normal); vWP = (modelMatrix * vec4(position, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWN; varying vec3 vWP;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        float wetAsphalt = 0.;
        float fbm(vec2 p){ float a = .5, r = 0.; for (int i = 0; i < 4; i++) { r += a * vn(p); p = p * 2.03 + 17.1; a *= .5; } return r; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float lum = dot(diffuseColor.rgb, vec3(.299, .587, .114));
          float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          float sat = (mx - mn) / max(mx, 1e-3);
          float flatUp = smoothstep(.80, .95, abs(vWN.y));
          wetAsphalt = flatUp * (1. - smoothstep(.12, .30, sat)) * smoothstep(.12, .3, lum);
          float puddle = smoothstep(.52, .70, vn(vWP.xz * .55) * .65 + vn(vWP.xz * 2.1) * .35) * wetAsphalt;
          vec3 night = mix(vec3(lum), diffuseColor.rgb, .18) * vec3(.62, .86, 1.0);       // drained, cold blue-green: the baked shadows stop reading
          float road = smoothstep(.2, .7, wetAsphalt);
          float detail = fbm(vWP.xz * 1.7 + vWP.y * .9) * 1.3 + fbm(vWP.xz * 7.3) * .5;      // fine grain of needles, rock and earth over the coarse scan
          diffuseColor.rgb = night * mix(.03 * (.35 + detail), mix(.9, .22, puddle), road);          // trees, slopes and rubble stay nearly black; only the asphalt answers the headlights
          wetAsphalt = mix(wetAsphalt * .7, 1., puddle);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {   // rough up the flat scan facets: a noise gradient bends the normal off the asphalt
          float nr = 1. - smoothstep(.2, .7, wetAsphalt);
          vec3 g = vec3(fbm(vWP.xz * 3.1) - .5, fbm(vWP.zy * 2.7 + 3.) - .5, fbm(vWP.xy * 3.4 + 7.) - .5);
          normal = normalize(normal + (viewMatrix * vec4(g, 0.)).xyz * 1.4 * nr);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(.92, mix(.38, .05, smoothstep(.6, 1., wetAsphalt)), wetAsphalt);`);
  };
  m.customProgramCacheKey = () => 'road-night';
  m.needsUpdate = true;
}

type Key = { t: number; eye: T.Vector3; look: T.Vector3; roll: number };

export class Intro {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(78, 16 / 9, .05, 400);
  /** the player's car, facing -z in its own frame */
  private readonly car = new T.Group();
  private readonly oncoming = new T.Group();
  private readonly aim = new T.Camera();
  private readonly bag = new T.Group();
  private readonly root = new T.Group();
  private readonly headL = new T.SpotLight(0xdbe6ee, 0, 90, .32, .8, 1.0);
  private readonly headR = new T.SpotLight(0xdbe6ee, 0, 90, .32, .8, 1.0);
  private readonly oncomingBeams: T.SpotLight[] = [];
  private readonly oncomingGlare = new T.PointLight(0xe8f2ff, 0, 40, 1.3);
  private readonly tail = new T.PointLight(0xff1a0c, 0, 6, 1.6);
  private readonly hazard = new T.PointLight(0xff9a20, 0, 5, 1.8);
  private readonly dash = new T.PointLight(0xa8d8c8, 0, 1.4, 2);
  private readonly trunkLamp = new T.PointLight(0xd8e4ff, 0, 4, 1.6);
  private readonly distantLight = new T.PointLight(0xffc77a, 0, 70, 1.1);
  /** the glow of a far-off window in the fog, at the end of the road */
  private readonly glow = new T.Sprite();
  private readonly house = new T.Group();
  /** a faint cold light on the front of the house, so that it reads as a shape in the fog */
  private readonly houseFill = new T.PointLight(0x9fb8d0, 0, 22, 1.3);
  /** the porch door in the world and the direction it faces (toward the road) */
  private readonly door = { p: new T.Vector3(), n: new T.Vector3(0, 0, 1) };
  private readonly rain: T.LineSegments;
  /** the crumpled bonnet: uniforms shared by the body shader (amount 0..1, impact point in the car's frame) */
  private readonly dent = { amount: { value: 0 }, point: { value: new T.Vector3(-.65, .15, -1.95) }, size: { value: .8 } };
  private bodyMeshes: T.Mesh[] = [];
  private readonly smoke: T.Points;
  private readonly crack: T.Mesh;
  private readonly sign = new T.Group();
  private readonly curve: T.CatmullRomCurve3;
  private readonly length: number;
  private readonly lamps: { mat: T.MeshStandardMaterial; base: number }[] = [];
  private wheels: T.Object3D[] = []; private wiper?: T.Object3D; private steer?: T.Object3D; private trunk?: T.Object3D; private trunkBase = 0;
  private readonly keys: Key[] = [];
  /** the moment the cars touch, found by the collision simulation (the sound and the flash are scheduled from it) */
  crash = 12.1;
  private sim = new Float32Array(0);
  private readonly SIM_DT = 1 / 120;

  private find(m: T.Object3D, name: string) { return m.getObjectByName(name.replace(/ /g, '_')) ?? undefined; }

  constructor(assets: TrailerAssets) {
    const s = this.scene;
    s.background = new T.Color(0x0a1218); s.fog = new T.FogExp2(0x15222c, .034);
    s.add(new T.HemisphereLight(0x3a5470, 0x0a1014, 2.0));
    s.add(this.root);

    // --- the road, graded to night, with the axis curve through it
    const road = assets.road.clone(true);
    road.scale.setScalar(ROAD_SCALE);
    road.traverse(o => { const mesh = o as T.Mesh; if (mesh.isMesh) gradeRoad(mesh.material as T.MeshStandardMaterial); });
    this.root.add(road);
    const pts = AXIS.map(([x, z, y]) => V(x * ROAD_SCALE, y * ROAD_SCALE + .02, z * ROAD_SCALE));
    const d = pts[pts.length - 1]!.clone().sub(pts[pts.length - 2]!).normalize(); pts.push(pts[pts.length - 1]!.clone().addScaledVector(d, 6));
    this.curve = new T.CatmullRomCurve3(pts, false, 'centripetal'); this.length = this.curve.getLength();

    // --- the player's car
    const carModel = assets.car.clone(true);
    carModel.scale.setScalar(CAR_SCALE); carModel.rotation.y = Math.PI;
    this.prepareCar(carModel, false);
    this.car.add(carModel); this.root.add(this.car);
    this.car.updateMatrixWorld(true);
    const wp = (n: string) => { const o = this.find(carModel, n); return o ? this.car.worldToLocal(o.getWorldPosition(new T.Vector3())) : V(0, .8, 0); };
    const hl = wp('Interior HeadLight');
    for (const [l, sx] of [[this.headL, -1], [this.headR, 1]] as const) { l.position.set(sx * .6, -.12, -2.05); l.target.position.set(sx * .3, -1.0, -26); void hl; this.car.add(l, l.target); }
    this.car.add(this.tail); this.tail.position.set(0, .9, 2.4);
    this.car.add(this.hazard); this.car.add(this.dash); this.car.add(this.trunkLamp); this.trunkLamp.position.set(0, 1.35, 1.7);
    this.steer = this.find(carModel, 'Steering Wheel Pivot'); this.wiper = this.find(carModel, 'Windshield wiper pivot');
    this.trunk = this.find(carModel, 'Trunk Pivot'); this.trunkBase = this.trunk?.rotation.x ?? 0;
    this.wheels = ['Left Front Tire Pivot', 'Right Front Tire Pivot', 'Left Back Tire Pivot', 'Right Back Tire Pivot'].map(n => this.find(carModel, n)).filter(Boolean) as T.Object3D[];

    // --- the oncoming car: the same model, dirty and dark, high beams
    const other = assets.car.clone(true); other.scale.setScalar(CAR_SCALE); other.rotation.y = 0;   // faces +z: toward the player
    this.prepareCar(other, true);
    this.oncoming.add(other); this.root.add(this.oncoming);
    for (const sx of [-1, 1]) { const l = new T.SpotLight(0xf2f6ff, 0, 90, .55, .5, 1.2); l.position.set(sx * .6, .8, 1.9); l.target.position.set(sx * .5, .2, 30); this.oncoming.add(l, l.target); this.oncomingBeams.push(l); }
    this.oncoming.add(this.oncomingGlare); this.oncomingGlare.position.set(0, 1, 2.6);

    // --- weather and the details
    this.rain = this.makeRain(); this.root.add(this.rain);
    this.smoke = this.makeSmoke(); this.car.add(this.smoke);
    this.crack = new T.Mesh(new T.PlaneGeometry(1.5, .72), new T.MeshBasicMaterial({ map: this.crackTexture(), transparent: true, depthWrite: false, opacity: 0, fog: false }));
    this.car.add(this.crack);
    this.makeSign(); this.root.add(this.sign);
    const bag = assets.bag.clone(true); bag.scale.setScalar(BAG_SCALE);
    this.prepareBag(bag);
    this.bag.add(bag); this.car.add(this.bag);
    this.root.add(this.distantLight);
    this.placeHouse(assets.house);
    { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(.18, 'rgba(255,190,110,.55)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      this.glow.material = new T.SpriteMaterial({ map: new T.CanvasTexture(c), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 }); this.glow.scale.set(2.6, 2.6, 1); this.root.add(this.glow); }

    this.simulate();
    this.buildKeys();
  }

  /**
   * The abandoned house stands beside the road ahead of the wreck, its porch door facing the road. A patch of dark gravel levels the ground under it,
   * the siding is darkened to night, and a lantern burns at the porch.
   */
  private placeHouse(model: T.Object3D) {
    // the site was chosen on a height map of the scan: south of the road, just past where the path ends, on a rise about a metre and a half above the road
    const D = V(-41 * ROAD_SCALE, 52.5 * ROAD_SCALE, 6 * ROAD_SCALE);
    const toRoad = V(0, 0, -1);
    const yaw = Math.atan2(toRoad.x, toRoad.z);
    this.door.p.copy(D); this.door.n.copy(toRoad);
    const m = model.clone(true); m.scale.setScalar(HOUSE_SCALE);
    const done = new Set<T.Material>();
    m.traverse(o => { const mesh = o as T.Mesh; if (!mesh.isMesh) return; for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as T.MeshStandardMaterial[]) { if (done.has(mat)) continue; done.add(mat); mat.color.multiplyScalar(.75); mat.roughness = Math.max(.85, mat.roughness); mat.envMapIntensity = 0; } });
    this.house.add(m);
    this.house.rotation.y = yaw;
    const off = V(HOUSE_DOOR.x, 0, HOUSE_DOOR.z).applyAxisAngle(V(0, 1, 0), yaw);
    this.house.position.copy(D).sub(off);
    // the clearing under it (the scan's ground is rough and sloped here)
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, r = rnd(41);
    g.fillStyle = '#2a2b27'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1400; i++) { const v = 30 + r() * 40; g.fillStyle = `rgb(${v},${v},${v - 4})`; g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
    const tex = new T.CanvasTexture(c); tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(7, 7); tex.colorSpace = T.SRGBColorSpace;
    const yard = new T.Mesh(new T.CircleGeometry(8.5, 24), new T.MeshStandardMaterial({ map: tex, roughness: .95, color: 0x3a3a38 }));
    yard.rotation.x = -Math.PI / 2; yard.position.copy(this.house.position).add(V(0, .04, 0)); yard.position.addScaledVector(toRoad, -3.2); this.root.add(yard);
    this.house.updateMatrixWorld(true);
    this.root.add(this.house, this.houseFill);
  }

  /** push a point out of the house (and its porch) so the camera can never pass through a wall */
  private keepOutOfHouse(p: T.Vector3) {
    const inv = this.house.matrixWorld.clone().invert(), q = p.clone().applyMatrix4(inv), pad = .6;
    for (const [x0, x1, z0, z1] of HOUSE_BOXES) {
      if (q.x > x0 - pad && q.x < x1 + pad && q.z > z0 - pad && q.z < z1 + pad && q.y < 8) {
        const d = [q.x - (x0 - pad), (x1 + pad) - q.x, q.z - (z0 - pad), (z1 + pad) - q.z], m = Math.min(...d), k = d.indexOf(m);
        if (k === 0) q.x = x0 - pad; else if (k === 1) q.x = x1 + pad; else if (k === 2) q.z = z0 - pad; else q.z = z1 + pad;
      }
    }
    return p.copy(q.applyMatrix4(this.house.matrixWorld));
  }

  /** materials of the car: the mirror-like paint becomes dull dirty paint; glass does not write depth; lamps are collected for flicker */
  private prepareCar(model: T.Object3D, dirty: boolean) {
    const done = new Set<T.Material>();
    model.traverse(o => {
      const mesh = o as T.Mesh; if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      if (mesh.name === 'Circle_Material.003_0') mesh.visible = false;
      if (/car_body|Bodywork/.test(mesh.name) && !Array.isArray(mesh.material)) {
        mesh.material = (mesh.material as T.MeshStandardMaterial).clone(); const b = mesh.material as T.MeshStandardMaterial; b.roughness = .45; b.metalness = .5; b.color.multiplyScalar(dirty ? .1 : .1); done.add(b);
        if (!dirty) { this.bodyMeshes.push(mesh); this.makeDentable(mesh, b); }
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as T.MeshStandardMaterial[]) {
        if (done.has(m)) continue; done.add(m);
        const n = (m.name || '').toLowerCase();
        if (/body|paint/.test(n)) { m.roughness = .42; m.metalness = .55; m.color.multiplyScalar(dirty ? .12 : .22); }
        if (m.transparent || /glass|window|windshield/.test(n)) { m.transparent = true; m.depthWrite = false; m.opacity = .14; m.color.set(0x0c1418); m.roughness = .1; continue; }   // glass: a faint sheen, not a black screen
        if (/headlight/.test(n)) this.lamps.push({ mat: m, base: m.emissiveIntensity });
        let interior = false; for (let p: T.Object3D | null = mesh; p; p = p.parent) if (p.name === 'Car_Interior') interior = true;
        if (!(m.emissiveIntensity > 0 && m.emissive && m.emissive.getHex() > 0)) m.color.multiplyScalar(interior ? (dirty ? .12 : .13) : (dirty ? .09 : .22));   // the interior and the trim are dark, the paint is dirty and dark
        if (/^(panel|notice)$/.test(m.name)) m.color.multiplyScalar(.4);
        m.envMapIntensity = 0;
      }
    });
  }

  /** after the impact the nose is pushed in: vertices near the impact point move inward along their normals, with a ragged edge */
  private makeDentable(mesh: T.Mesh, m: T.MeshStandardMaterial) {
    const u = { uDent: this.dent.amount, uHit: { value: new T.Vector3() }, uSize: this.dent.size };
    m.userData.dent = u;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uDent; uniform vec3 uHit; uniform float uSize;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            float d = distance(transformed, uHit);
            float fall = exp(-pow(d / uSize, 2.));
            float rag = .8 + .2 * sin(transformed.x * 9. + transformed.y * 7.) * sin(transformed.z * 8.);
            transformed -= normalize(objectNormal) * uDent * fall * rag * .085;
            transformed.y -= uDent * fall * .03;
          }`);
    };
    m.customProgramCacheKey = () => 'body-dent';
    m.needsUpdate = true;
  }

  private prepareBag(bag: T.Object3D) {
    bag.traverse(o => { const m = o as T.Mesh; if (!m.isMesh) return; for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as T.MeshStandardMaterial[]) { mat.color.multiplyScalar(.85); mat.roughness = Math.max(.75, mat.roughness); } });
  }

  private makeRain(): T.LineSegments {
    const n = 1400, pos = new Float32Array(n * 6), r = rnd(21);
    for (let i = 0; i < n; i++) { const x = (r() - .5) * 26, y = r() * 14, z = (r() - .5) * 40; pos.set([x, y, z, x + .02, y - .5, z + .12], i * 6); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const l = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xaac4d4, transparent: true, opacity: .32, depthWrite: false }));
    l.frustumCulled = false; return l;
  }

  /** steam rising from under the bonnet after the impact */
  private makeSmoke(): T.Points {
    const n = 90, pos = new Float32Array(n * 3), r = rnd(33);
    for (let i = 0; i < n; i++) pos.set([(r() - .5) * .8, r() * 1.4, (r() - .5) * .5], i * 3);
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(190,200,205,.55)'); gr.addColorStop(1, 'rgba(190,200,205,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: new T.CanvasTexture(c), size: .9, transparent: true, depthWrite: false, opacity: 0, color: 0x9fb0b8 }));
    p.frustumCulled = false; return p;
  }

  /** the prompt shown on screen at time t, in the style of the game's own hints */
  prompt(t: number): string {
    if (t > 18.3 && t < 19.6) return '[E] выйти из машины';
    if (t > 22.0 && t < 22.9) return '[E] открыть багажник';
    if (t > 24.0 && t < 24.6) return '[E] взять рюкзак';
    return '';
  }

  private crackTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d')!, r = rnd(11);
    g.strokeStyle = 'rgba(210,225,230,.85)'; g.lineWidth = 1.4; const cx = 330, cy = 130;
    for (let i = 0; i < 26; i++) { let a = r() * Math.PI * 2, x = cx, y = cy; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { a += (r() - .5) * .5; const l = 14 + r() * 40; x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y); } g.stroke(); }
    g.lineWidth = .8; g.strokeStyle = 'rgba(210,225,230,.45)';
    for (let k = 1; k < 5; k++) { g.beginPath(); for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2, rr = k * 26 + (r() - .5) * 8; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .8); } g.stroke(); }
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; return tex;
  }

  /** the green forest-reserve sign: a drawn plate on two posts, retro-reflective (it answers the headlights, nothing else) */
  private makeSign() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 640; const g = c.getContext('2d')!;
    g.fillStyle = '#0d4a2f'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#e9efe8'; g.lineWidth = 14; g.strokeRect(22, 22, 980, 596);
    g.fillStyle = '#e9efe8'; g.textAlign = 'center';
    g.font = '600 46px Arial'; g.fillText('STATE OF MICHIGAN', 460, 110);
    g.font = '600 52px Arial'; g.fillText('WELCOME TO', 460, 180);
    g.font = '800 104px Arial'; g.fillText("SAINT JUANA'S", 500, 290);
    g.font = '700 54px Arial'; g.fillText('FOREST RESERVE', 500, 360);
    g.font = '700 40px Arial'; g.fillText('HUNTING, FISHING, RECREATING', 512, 444);
    g.font = '800 58px Arial'; g.fillText('BE CAREFUL WITH FIRE', 512, 556);
    g.beginPath(); g.moveTo(900, 90); g.lineTo(930, 40); g.lineTo(950, 90); g.lineTo(975, 60); g.lineTo(965, 130); g.lineTo(935, 150); g.lineTo(905, 130); g.closePath(); g.fill();   // the stag, a plain silhouette
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
    const plate = new T.Mesh(new T.PlaneGeometry(1.7, 1.06), new T.MeshStandardMaterial({ map: tex, roughness: .35, metalness: .2, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .035, side: T.DoubleSide }));
    plate.position.y = 2.7;
    const postMat = new T.MeshStandardMaterial({ color: 0x1b1d1c, roughness: .8, metalness: .6 });
    for (const x of [-.6, .6]) { const p = new T.Mesh(new T.CylinderGeometry(.04, .04, 3.3, 8), postMat); p.position.set(x, 1.65, -.04); this.sign.add(p); }
    this.sign.add(plate);
  }

  /** where a point at distance s along the road is, with its heading; `side` is the lateral offset (+ = the right-hand lane) */
  private at(s: number, side = 0) {
    const u = T.MathUtils.clamp(s / this.length, 0, 1), p = this.curve.getPointAt(u), tan = this.curve.getTangentAt(u);
    const right = V(-tan.z, 0, tan.x).normalize().negate();   // looking along the road, the right-hand side
    return { p: p.clone().addScaledVector(right, side), tan, yaw: Math.atan2(-tan.x, -tan.z) };
  }

  /**
   * Two cars on the road as boxes (road frame: s along the road, side to the right). The player drives on, the oncoming car swings into the lane,
   * the player swerves right. The boxes are tested against each other every 1/120 s (separating-axis test): the first overlap is the impact, from that
   * moment the cars exchange momentum, spin a little, are pushed apart by the minimum translation, slow down and stop. Nothing passes through anything.
   */
  private simulate() {
    type Body = { s: number; side: number; th: number; v: number; vl: number; w: number };
    const dt = this.SIM_DT, N = Math.ceil(17 / dt), out = new Float32Array(N * 6);
    const P: Body = { s: 0, side: 1.6, th: 0, v: 6.4, vl: 0, w: 0 }, O: Body = { s: 225, side: -1.7, th: Math.PI, v: 12, vl: 0, w: 0 };
    const box = (b: Body) => ({ cx: b.s, cy: b.side, ax: Math.cos(b.th), ay: Math.sin(b.th), hl: 2.0, hw: .92 });
    type Box = ReturnType<typeof box>;
    const sat = (A: Box, B: Box) => {
      const axes = [[A.ax, A.ay], [-A.ay, A.ax], [B.ax, B.ay], [-B.ay, B.ax]] as const;
      let best = 1e9, nx = 0, ny = 0;
      for (const [x, y] of axes) {
        const ra = A.hl * Math.abs(x * A.ax + y * A.ay) + A.hw * Math.abs(-x * A.ay + y * A.ax);
        const rb = B.hl * Math.abs(x * B.ax + y * B.ay) + B.hw * Math.abs(-x * B.ay + y * B.ax);
        const d = (B.cx - A.cx) * x + (B.cy - A.cy) * y, o = ra + rb - Math.abs(d);
        if (o <= 0) return null;
        if (o < best) { best = o; nx = d < 0 ? -x : x; ny = d < 0 ? -y : y; }
      }
      return { nx, ny, depth: best };
    };
    let hit = -1;
    for (let i = 0; i < N; i++) {
      const t = i * dt;
      if (hit < 0) {
        P.v = t < 11 ? 6.4 : Math.max(2, 6.4 - 2.2 * (t - 11));
        P.side = 1.6 + .85 * sstep(10.3, 11.1, t); P.th = .13 * sstep(10.3, 11.1, t);
        O.side = -1.7 + 3.0 * sstep(10, 11.3, t); O.th = Math.PI + .05 * sstep(10, 11.3, t);
        P.s += P.v * Math.cos(P.th) * dt; O.s += O.v * Math.cos(O.th) * dt;
      } else {
        for (const b of [P, O]) {
          b.s += b.v * Math.cos(b.th) * dt; b.side += (b.v * Math.sin(b.th) + b.vl) * dt; b.th += b.w * dt;
          b.v = Math.max(0, b.v - (b === P ? 6.5 : 2.5) * dt); b.vl *= Math.exp(-3 * dt); b.w *= Math.exp(-2.4 * dt);
        }
        if (P.side > 3.1) { P.side = 3.1; P.vl = Math.min(0, P.vl); }
      }
      const c = sat(box(P), box(O));
      if (c) {
        // push apart along the minimum translation (A = player, B = oncoming)
        P.s -= c.nx * c.depth * .5; P.side -= c.ny * c.depth * .5; O.s += c.nx * c.depth * .5; O.side += c.ny * c.depth * .5;
        if (hit < 0) {
          hit = i;
          P.v *= .45; P.vl = 1.6; P.w = 1.3;     // the oncoming car's corner catches the player's left front: the nose is flung to the right
          O.v *= .85; O.vl = -.9; O.w = -.4;
        }
      }
      out.set([P.s, P.side, P.th, O.s, O.side, O.th], i * 6);
    }
    this.sim = out;
    this.crash = hit >= 0 ? hit * dt : 12.1;
  }

  /** the two cars at time t from the simulation: [player s, side, heading, oncoming s, side, heading] */
  private body(t: number) {
    const f = Math.min(this.sim.length / 6 - 2, Math.max(0, t / this.SIM_DT)), i = Math.floor(f), u = f - i, a = i * 6, b = a + 6, r = [0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 6; k++) r[k] = this.sim[a + k]! * (1 - u) + this.sim[b + k]! * u;
    return r as [number, number, number, number, number, number];
  }

  private buildKeys() {
    const k = (t: number, eye: T.Vector3, look: T.Vector3, roll = 0) => this.keys.push({ t, eye, look, roll });
    const eye0 = this.driverEye();
    k(15.6, eye0.clone().add(V(0, -.3, .05)), V(-.3, .9, -6), 1.05);
    k(17.2, eye0.clone().add(V(0, -.22, .02)), V(-.2, 1.0, -6), .75);
    k(19.0, eye0.clone(), V(-.1, 1.1, -6), .2);
    k(19.7, eye0.clone().add(V(-.5, 0, .2)), V(-3, 1.0, .5), .05);
    k(20.6, V(-1.9, 1.62, .6), V(-1.9, 1.4, 4), 0);
    k(21.7, V(-1.9, 1.62, 2.0), V(-1.0, 1.2, 4), 0);
    k(22.8, V(-1.0, 1.6, 4.0), V(0, 0, 2.8), 0);
    k(24.4, V(-.35, 1.4, 3.4), V(0, -.1, 2.75), 0);
    k(25.2, V(-.35, 1.4, 3.3), V(0, .5, 2.9), 0);
    k(25.7, V(-.6, 1.45, 3.1), V(-1.5, 1.4, 0), 0);
    k(27.0, V(-2.2, 1.62, 1.0), V(-2, 1.6, -20), 0);
    k(28.5, V(-2.6, 1.62, -5), V(-2, 1.6, -30), 0);
    k(30.0, V(-2.2, 1.62, -11), V(-2, 1.6, -40), 0);
  }

  /** the eye of the driver in the car's own frame */
  private driverEye() { const w = this.steer ? this.car.worldToLocal(this.steer.getWorldPosition(new T.Vector3())) : V(-.4, 1.1, -.4); return V(w.x, w.y + .5, w.z + .5); }

  private carPose(t: number) {
    const [ps, pside, pth] = this.body(t), a = this.at(ps, pside), k = sstep(this.crash, this.crash + .35, t);
    this.car.position.copy(a.p);
    this.car.rotation.set(-.045 * k, a.yaw - pth, .04 * k, 'YXZ');
    this.car.updateMatrixWorld(true);
  }

  update(t: number, aspect: number): { fade: number; flash: number } {
    t = Math.min(INTRO_DURATION, Math.max(0, t));
    const cam = this.camera;
    if (Math.abs(cam.aspect - aspect) > 1e-3) { cam.aspect = aspect; cam.updateProjectionMatrix(); }
    this.carPose(t);
    const crashed = t >= this.crash;
    const [dist, , , os, oside, oth] = this.body(t);

    // the lights
    const on = t < .6 ? 0 : sstep(.6, 1.2, t);
    const flick = crashed ? (Math.sin(t * 47) * Math.sin(t * 13.1) > .55 ? .12 : 1) : 1;
    this.headL.intensity = 800 * on; this.headR.intensity = 800 * on * flick;
    this.tail.intensity = crashed ? 16 : 0;
    this.hazard.position.set(0, .8, crashed ? 2.4 : 0); this.hazard.intensity = crashed && Math.sin(t * 7.5) > 0 ? 9 : 0;
    this.dash.position.copy(this.driverEye().add(V(0, -.2, -.3))); this.dash.intensity = t < 19.8 ? .22 : 0;
    for (const l of this.lamps) l.mat.emissiveIntensity = l.base * (crashed ? flick : 1);
    this.wheels.forEach(w => { w.rotation.x = -dist / .3; });
    if (this.wiper) this.wiper.rotation.z = Math.sin(t * 2.6) * .7;
    if (this.steer) this.steer.rotation.z = Math.sin(t * .8) * .05 + (t > 10.3 && t < this.crash ? -.9 * sstep(10.3, 10.9, t) : 0);
    if (this.trunk) this.trunk.rotation.x = this.trunkBase - 1.25 * sstep(22.8, 24.4, t);
    const dentAmount = sstep(this.crash, this.crash + .25, t);
    this.dent.amount.value = dentAmount;
    if (dentAmount > 0) for (const mesh of this.bodyMeshes) { const u = (mesh.material as T.MeshStandardMaterial).userData.dent; if (u) { mesh.updateWorldMatrix(true, false); u.uHit.value.copy(this.car.localToWorld(this.dent.point.value.clone())); mesh.worldToLocal(u.uHit.value); u.uSize.value = .8 / (mesh.matrixWorld.getMaxScaleOnAxis() || 1); } }
    this.trunkLamp.intensity = 7 * sstep(22.6, 23.2, t) * (1 - sstep(25.4, 25.7, t));
    this.crack.visible = crashed; (this.crack.material as T.MeshBasicMaterial).opacity = crashed ? .8 : 0;
    const eye = this.driverEye();
    this.crack.position.set(eye.x * .3, eye.y - .05, eye.z - .95); this.crack.rotation.x = -.55;

    // the oncoming car comes down the road from far away, swings into our lane and clips us (see simulate)
    const oa = this.at(os, oside); this.oncoming.position.copy(oa.p);
    this.oncoming.rotation.set(0, oa.yaw - oth + Math.PI, 0, 'YXZ');
    const gap = os - dist;
    this.oncoming.visible = gap < 190 && gap > -60 && t < 15;
    const beam = this.oncoming.visible ? 1 : 0; this.oncomingBeams.forEach(b => { b.intensity = 2600 * beam; });
    this.oncomingGlare.intensity = beam * 40 * Math.max(0, 1 - gap / 150);
    // the sign stands at the right of the road before the crash
    const sg = this.at(Math.max(4, this.body(this.crash)[0] - 38), 4.2); this.sign.position.copy(sg.p); this.sign.rotation.y = sg.yaw - .12;
    // the distant light at the end of the road
    const flickerL = 1 - .35 * Math.max(0, Math.sin(t * 9) * Math.sin(t * 3.7)) - .15 * noise(t * 11);
    this.distantLight.position.copy(this.door.p).add(V(0, 2.5, 0)).addScaledVector(this.door.n, 1.1); this.distantLight.intensity = t > 25 ? 140 * flickerL : 0;
    this.houseFill.position.copy(this.door.p).addScaledVector(this.door.n, 5).add(V(0, 3.2, 0)); this.houseFill.intensity = t > 25 ? 90 * sstep(25, 27, t) : 0;
    this.glow.position.copy(this.distantLight.position); this.glow.visible = t > 25; (this.glow.material as T.SpriteMaterial).opacity = .8 * sstep(25.5, 28, t) * flickerL;
    // steam from under the bonnet, rising and drifting
    this.smoke.visible = crashed; (this.smoke.material as T.PointsMaterial).opacity = crashed ? .5 * sstep(this.crash, this.crash + 1.5, t) : 0;
    this.smoke.position.set(0, .8 + ((t * .5) % 1.2), -1.6);
    // rain falls round the camera
    this.rain.position.set(cam.position.x, cam.position.y - 2 - (t * 9) % 12, cam.position.z);

    // the bag: in the trunk, lifted toward the camera, then carried away down out of the frame
    const lift = sstep(24.3, 24.95, t), away = sstep(24.95, 25.55, t);
    this.bag.visible = t < 25.7;
    this.bag.position.set(0, -.12 + lift * 1.25, 2.75 + lift * .5 + away * .3); this.bag.rotation.set(-Math.PI / 2 + lift * 1.3, 0, lift * .15 - away * .5);   // it lies in the cargo area, then comes up toward the camera

    // --- the camera
    const look = V(0, 0, 0), eyeP = V(0, 0, 0); let roll = 0, shake = 0;
    const base = this.driverEye();
    if (t < this.crash) {
      eyeP.copy(base).add(V(0, Math.sin(t * 31) * .003, 0)); look.set(base.x + Math.sin(t * .7) * .1, base.y - .22, -8);
      shake = sstep(10.3, this.crash, t) * .006;
    } else if (t < this.crash + .6) {
      const c = t - this.crash, k = Math.exp(-c * 6);
      eyeP.copy(base).add(V(0, -.12 * k, -.1 * k)); look.set(base.x + Math.sin(c * 40) * .5 * k, base.y - 1.3 * k, -8); shake = .05 * k;
    } else {
      const ks = this.keys; let i = 0; while (i < ks.length - 2 && t > ks[i + 1]!.t) i++;
      const a = ks[i]!, b = ks[i + 1]!, u = sstep(a.t, b.t, Math.max(a.t, t));
      eyeP.copy(a.eye).lerp(b.eye, u); look.copy(a.look).lerp(b.look, u); roll = lerp(a.roll, b.roll, u);
    }
    if (t > 25.7) {
      // after the bag: turn toward the lantern on the porch and walk to the foot of its steps, in world space (never through the house)
      const lamp = this.distantLight.position.clone().add(V(0, -.8, 0));
      look.lerp(this.car.worldToLocal(lamp), sstep(25.7, 27.2, t));
      const w = sstep(26.2, 27.4, t), start = this.car.localToWorld(V(-2.3, 1.62, -1.2)), stop = this.door.p.clone().addScaledVector(this.door.n, 8.5); stop.y = this.at(this.length - 1, 0).p.y + 1.62;
      const along = sstep(26.2, 29.7, t), walk = start.clone().lerp(stop, along);
      const cur = this.car.localToWorld(eyeP.clone()); cur.lerp(walk, w); this.keepOutOfHouse(cur);
      eyeP.copy(this.car.worldToLocal(cur));
    }
    this.aim.position.copy(eyeP); this.car.add(this.aim); this.car.updateMatrixWorld(true);
    this.aim.lookAt(this.car.localToWorld(look.clone())); this.aim.rotateZ(roll);
    const wp = new T.Vector3(), wq = new T.Quaternion(); this.aim.getWorldPosition(wp); this.aim.getWorldQuaternion(wq);
    cam.position.copy(wp); cam.quaternion.copy(wq);
    this.head(cam, t);
    if (shake) { cam.position.x += Math.sin(t * 91) * shake; cam.position.y += Math.cos(t * 77) * shake; cam.rotateZ(Math.sin(t * 63) * shake * 1.6); }
    cam.updateMatrixWorld(true);

    // --- the grade: fade in, impact flash, black with ringing, eyes opening (twice), fade out at the end
    let fade = sstep(0, 1.3, t), flash = 0;
    if (t >= this.crash) {
      flash = t < this.crash + .06 ? 1 : Math.max(0, 1 - (t - this.crash - .06) / .8);
      fade = t < this.crash + .25 ? 1 : t < 15.6 ? 0 : 1;
      if (t >= 15.6) { const open = sstep(15.6, 17.1, t), blink = 1 - .85 * Math.max(0, Math.sin((t - 16.4) * 7.5)) * (t > 16.4 && t < 16.8 ? 1 : 0); fade = open * blink; }
    }
    // the oncoming beams blind: a growing white veil just before the swerve
    if (t > 10.2 && t < this.crash) flash = Math.max(flash, .55 * sstep(10.2, 12.2, t));
    if (t > 29) fade *= 1 - sstep(29, 30, t);
    return { fade: Math.min(1, Math.max(0, fade)), flash };
  }

  /**
   * A living head: while walking, a step every 0.53 s moves the eye down and up (two bobs per stride), sways it from side to side once per stride,
   * nods and rolls it a little, with a small dip at every footfall; the whole thing is irregular (smooth noise on timing and size). Standing,
   * there is breathing and the slow drift of attention. In the car: road vibration. After the impact: a shaking, unsteady head.
   */
  private head(cam: T.PerspectiveCamera, t: number) {
    const walk = sstep(19.9, 20.5, t) * (1 - sstep(22.2, 22.8, t)) + sstep(26.0, 26.6, t);
    const inCar = t < this.crash ? 1 : 0, dazed = t > 15.6 && t < 19.8 ? 1 : 0;
    const irr = .85 + .3 * noise(t * .7);                                   // the size of the steps is never the same
    const ph = (t - 20) * Math.PI * 2 * (1.9 + .12 * (noise(t * .35) - .5));  // step phase, 1.9 steps per second, wandering
    const bobY = walk * irr * (.020 * Math.cos(ph * 2) + .012 * Math.cos(ph * 2 - .9));
    const frac = (((ph / (Math.PI * 2)) % 1) + 1) % 1, dip = walk * .012 * Math.exp(-6 * frac);
    const sway = walk * irr * .022 * Math.sin(ph);                          // once per stride
    const nod = walk * .012 * Math.sin(ph * 2 + .5), rollW = walk * .014 * Math.sin(ph) * irr, yawW = walk * .010 * Math.sin(ph + .8);
    const breath = Math.sin(t * 1.55) * .0028 * (1 - walk) + Math.sin(t * 1.55) * .0012 * walk;
    const drift = (noise(t * .55) - .5) * .012 + (noise(t * 1.9 + 7) - .5) * .004, driftR = (noise(t * .45 + 3) - .5) * .010;
    const trem = dazed * ((noise(t * 7.3) - .5) * .014 + Math.sin(t * 2.1) * .006);
    const road = inCar * (noise(t * 23) - .5) * .003;
    cam.translateY(bobY - dip + breath * .02 + road);
    cam.translateX(sway);
    cam.rotateX(nod + breath + drift * .8 + trem + road * .6);
    cam.rotateY(yawW + drift + trem * .7);
    cam.rotateZ(rollW + driftR + trem * .5);
  }

  dispose() {
    this.scene.traverse(o => { const m = o as T.Mesh; m.geometry?.dispose?.(); const mat = m.material as T.Material | T.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose()); });
  }
}
