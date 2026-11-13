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
const rnd = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

/** The scan is in its own units: 6 m of asphalt measured 13 units wide, so one unit is 0.46 m. The car file is 2.04 units long and is brought to 4 m. */
export const ROAD_SCALE = 0.46;
export const CAR_SCALE = 4.0 / 2.04;
export const BAG_SCALE = 0.65 / 145.955;
/** The road axis, picked on a top-down view of the scan (x, z, surface height in scan units; the heights are smoothed, the scan surface is rough). */
const AXIS: [number, number, number][] = [
  [-164, 83.3, 54], [-143.4, 67.5, 53.1], [-125.2, 50.6, 52.1], [-115.5, 36, 51.3], [-109.4, 21.4, 50.6], [-102.1, 6.9, 50.1], [-91.2, -3.6, 49.8], [-77.9, -7.7, 49.5], [-60.9, -8.4, 49.4],
];

export type TrailerAssets = { road: T.Object3D; car: T.Object3D; bag: T.Object3D };
export async function loadTrailerAssets(base = ''): Promise<TrailerAssets> {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const [road, car, bag] = await Promise.all(['road', 'car', 'backpack'].map(n => loader.loadAsync(`${base}assets/trailer/${n}.glb`)));
  return { road: road!.scene, car: car!.scene, bag: bag!.scene };
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
        float wetAsphalt = 0.;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float lum = dot(diffuseColor.rgb, vec3(.299, .587, .114));
          float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          float sat = (mx - mn) / max(mx, 1e-3);
          float flatUp = smoothstep(.80, .95, abs(vWN.y));
          wetAsphalt = flatUp * (1. - smoothstep(.12, .30, sat)) * smoothstep(.12, .3, lum);
          float puddle = smoothstep(.52, .70, vn(vWP.xz * .55) * .65 + vn(vWP.xz * 2.1) * .35) * wetAsphalt;
          vec3 night = mix(vec3(lum), diffuseColor.rgb, .18) * vec3(.46, .82, 1.0);       // drained, cold blue-green: the baked shadows stop reading
          diffuseColor.rgb = night * mix(.34, .14, puddle);
          wetAsphalt = mix(wetAsphalt * .7, 1., puddle);
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
  readonly camera = new T.PerspectiveCamera(70, 16 / 9, .05, 400);
  /** the player's car, facing -z in its own frame */
  private readonly car = new T.Group();
  private readonly oncoming = new T.Group();
  private readonly aim = new T.Camera();
  private readonly bag = new T.Group();
  private readonly root = new T.Group();
  private readonly headL = new T.SpotLight(0xdbe6ee, 0, 90, .42, .7, 1.0);
  private readonly headR = new T.SpotLight(0xdbe6ee, 0, 90, .42, .7, 1.0);
  private readonly oncomingBeams: T.SpotLight[] = [];
  private readonly oncomingGlare = new T.PointLight(0xe8f2ff, 0, 40, 1.3);
  private readonly tail = new T.PointLight(0xff1a0c, 0, 6, 1.6);
  private readonly hazard = new T.PointLight(0xff9a20, 0, 5, 1.8);
  private readonly dash = new T.PointLight(0xa8d8c8, 0, 1.4, 2);
  private readonly distantLight = new T.PointLight(0xffc77a, 0, 50, 1.2);
  private readonly rain: T.LineSegments;
  private readonly crack: T.Mesh;
  private readonly sign = new T.Group();
  private readonly curve: T.CatmullRomCurve3;
  private readonly length: number;
  private readonly lamps: { mat: T.MeshStandardMaterial; base: number }[] = [];
  private wheels: T.Object3D[] = []; private wiper?: T.Object3D; private steer?: T.Object3D; private trunk?: T.Object3D; private trunkBase = 0;
  private readonly keys: Key[] = [];
  private readonly CRASH = 12.6;
  private crashPose = { s: 0, side: 0, yaw: 0 };

  private find(m: T.Object3D, name: string) { return m.getObjectByName(name.replace(/ /g, '_')) ?? undefined; }

  constructor(assets: TrailerAssets) {
    const s = this.scene;
    s.background = new T.Color(0x0a1218); s.fog = new T.FogExp2(0x15222c, .034);
    s.add(new T.HemisphereLight(0x3a5470, 0x0a1014, 7));
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
    for (const [l, sx] of [[this.headL, -1], [this.headR, 1]] as const) { l.position.set(sx * .6, hl.y || .75, hl.z || -1.9); l.target.position.set(sx * .3, -1.2, -26); this.car.add(l, l.target); }
    this.car.add(this.tail); this.tail.position.set(0, .9, 2.4);
    this.car.add(this.hazard); this.car.add(this.dash);
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
    this.crack = new T.Mesh(new T.PlaneGeometry(1.5, .72), new T.MeshBasicMaterial({ map: this.crackTexture(), transparent: true, depthWrite: false, opacity: 0, fog: false }));
    this.car.add(this.crack);
    this.makeSign(); this.root.add(this.sign);
    const bag = assets.bag.clone(true); bag.scale.setScalar(BAG_SCALE);
    this.prepareBag(bag);
    this.bag.add(bag); this.car.add(this.bag);
    this.root.add(this.distantLight);

    this.crashPose = { s: this.travelled(this.CRASH) + 2, side: 2.9, yaw: -.55 };
    this.buildKeys();
  }

  /** materials of the car: the mirror-like paint becomes dull dirty paint; glass does not write depth; lamps are collected for flicker */
  private prepareCar(model: T.Object3D, dirty: boolean) {
    const done = new Set<T.Material>();
    model.traverse(o => {
      const mesh = o as T.Mesh; if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      if (mesh.name === 'Circle_Material.003_0') mesh.visible = false;
      if (/car_body|Bodywork/.test(mesh.name) && !Array.isArray(mesh.material)) { mesh.material = (mesh.material as T.MeshStandardMaterial).clone(); const b = mesh.material as T.MeshStandardMaterial; b.roughness = .45; b.metalness = .5; b.color.multiplyScalar(dirty ? .12 : .2); done.add(b); }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as T.MeshStandardMaterial[]) {
        if (done.has(m)) continue; done.add(m);
        const n = (m.name || '').toLowerCase();
        if (/body|paint/.test(n)) { m.roughness = .42; m.metalness = .55; m.color.multiplyScalar(dirty ? .12 : .22); }
        if (m.transparent || /glass|window|windshield/.test(n)) { m.transparent = true; m.depthWrite = false; m.opacity = Math.min(m.opacity, .45); }
        if (/headlight/.test(n)) this.lamps.push({ mat: m, base: m.emissiveIntensity });
        let interior = false; for (let p: T.Object3D | null = mesh; p; p = p.parent) if (p.name === 'Car_Interior') interior = true;
        if (!(m.emissiveIntensity > 0 && m.emissive && m.emissive.getHex() > 0)) m.color.multiplyScalar(interior ? (dirty ? .45 : .6) : (dirty ? .09 : .22));   // the interior and the trim are dark, the paint is dirty and dark
        if (/^(panel|notice)$/.test(m.name)) m.color.multiplyScalar(.4);
        m.envMapIntensity = 0;
      }
    });
  }

  private prepareBag(bag: T.Object3D) {
    bag.traverse(o => { const m = o as T.Mesh; if (!m.isMesh) return; for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as T.MeshStandardMaterial[]) { mat.color.multiplyScalar(.55); mat.roughness = Math.max(.75, mat.roughness); } });
  }

  private makeRain(): T.LineSegments {
    const n = 1400, pos = new Float32Array(n * 6), r = rnd(21);
    for (let i = 0; i < n; i++) { const x = (r() - .5) * 26, y = r() * 14, z = (r() - .5) * 40; pos.set([x, y, z, x + .02, y - .5, z + .12], i * 6); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const l = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xaac4d4, transparent: true, opacity: .32, depthWrite: false }));
    l.frustumCulled = false; return l;
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

  /** the player's distance along the road: 6.4 m/s (a rainy mountain road in fog), braking at the end */
  private travelled(t: number) { const tt = Math.min(t, this.CRASH); return 6.4 * tt - 2.6 * sstep(11.1, 12.6, tt) * (tt - 11.1) * .5; }

  private buildKeys() {
    const k = (t: number, eye: T.Vector3, look: T.Vector3, roll = 0) => this.keys.push({ t, eye, look, roll });
    const eye0 = this.driverEye();
    k(15.6, eye0.clone().add(V(0, -.3, .05)), V(-.3, .9, -6), 1.05);
    k(17.2, eye0.clone().add(V(0, -.22, .02)), V(-.2, 1.0, -6), .75);
    k(19.0, eye0.clone(), V(-.1, 1.1, -6), .2);
    k(19.7, eye0.clone().add(V(-.5, 0, .2)), V(-3, 1.0, .5), .05);
    k(20.6, V(-1.9, 1.62, .6), V(-1.9, 1.4, 4), 0);
    k(21.7, V(-1.9, 1.62, 2.0), V(-1.0, 1.2, 4), 0);
    k(22.8, V(-1.0, 1.6, 3.9), V(0, 1.0, 2.0), 0);
    k(24.4, V(-.05, 1.6, 3.5), V(0, .8, 1.8), 0);
    k(25.2, V(-.05, 1.5, 3.3), V(0, .9, 2.0), 0);
    k(25.7, V(-.05, 1.5, 3.6), V(0, 1.3, 9), 0);
    k(27.0, V(.2, 1.62, 4.4), V(.4, 1.7, 30), 0);
    k(30.0, V(.4, 1.62, 11), V(.6, 1.7, 40), 0);
  }

  /** the eye of the driver in the car's own frame */
  private driverEye() { const w = this.steer ? this.car.worldToLocal(this.steer.getWorldPosition(new T.Vector3())) : V(-.4, 1.1, -.4); return V(w.x, w.y + .5, w.z + .55); }

  private carPose(t: number) {
    const crashed = t >= this.CRASH;
    const dist = crashed ? this.crashPose.s : this.travelled(t);
    const swerve = sstep(11.1, 12.5, t), lane = 1.6 + swerve * 1.3, side = crashed ? this.crashPose.side : lane;
    const a = this.at(dist, side);
    this.car.position.copy(a.p);
    this.car.rotation.set(crashed ? -.07 : 0, a.yaw + (crashed ? this.crashPose.yaw : -.5 * swerve), crashed ? .05 : 0, 'YXZ');
    this.car.updateMatrixWorld(true);
  }

  update(t: number, aspect: number): { fade: number; flash: number } {
    t = Math.min(INTRO_DURATION, Math.max(0, t));
    const cam = this.camera;
    if (Math.abs(cam.aspect - aspect) > 1e-3) { cam.aspect = aspect; cam.updateProjectionMatrix(); }
    this.carPose(t);
    const crashed = t >= this.CRASH;
    const dist = crashed ? this.crashPose.s : this.travelled(t);

    // the lights
    const on = t < .6 ? 0 : sstep(.6, 1.2, t);
    const flick = crashed ? (Math.sin(t * 47) * Math.sin(t * 13.1) > .55 ? .12 : 1) : 1;
    this.headL.intensity = 480 * on; this.headR.intensity = 480 * on * flick;
    this.tail.intensity = crashed ? 16 : 0;
    this.hazard.position.set(0, .8, crashed ? 2.4 : 0); this.hazard.intensity = crashed && Math.sin(t * 7.5) > 0 ? 9 : 0;
    this.dash.position.copy(this.driverEye().add(V(0, -.2, -.3))); this.dash.intensity = t < 19.8 ? .5 : 0;
    for (const l of this.lamps) l.mat.emissiveIntensity = l.base * (crashed ? flick : 1);
    this.wheels.forEach(w => { w.rotation.x = -dist / .3; });
    if (this.wiper) this.wiper.rotation.z = Math.sin(t * 2.6) * .7;
    if (this.steer) this.steer.rotation.z = Math.sin(t * .8) * .05 + (t > 11.1 && t < 12.6 ? -.9 * sstep(11.1, 11.6, t) : 0);
    if (this.trunk) this.trunk.rotation.x = this.trunkBase - 1.25 * sstep(22.8, 24.4, t);
    this.crack.visible = crashed; (this.crack.material as T.MeshBasicMaterial).opacity = crashed ? .8 : 0;
    const eye = this.driverEye();
    this.crack.position.set(eye.x * .3, eye.y - .05, eye.z - .95); this.crack.rotation.x = -.55;

    // the oncoming car: appears far up the road at 5.5 s, comes down the left lane, swings into ours at 11 s
    const gap = Math.max(-40, 140 - (t - 5.5) * 23);
    const oSide = -1.7 + sstep(10.4, 11.4, t) * 3.0;
    const oa = this.at(dist + gap + 3, oSide); this.oncoming.position.copy(oa.p);
    this.oncoming.rotation.set(0, oa.yaw + Math.PI + .25 * sstep(10.4, 11.4, t), 0, 'YXZ');
    this.oncoming.visible = t > 5 && t < 14;
    const beam = t > 5 ? 1 : 0; this.oncomingBeams.forEach(b => { b.intensity = 2600 * beam; });
    this.oncomingGlare.intensity = beam * 40 * Math.max(0, 1 - gap / 140);
    // the sign stands at the right of the road before the crash
    const sg = this.at(Math.max(4, this.travelled(this.CRASH) - 38), 4.2); this.sign.position.copy(sg.p); this.sign.rotation.y = sg.yaw - .12;
    // the distant light at the end of the road
    const far = this.at(this.length - 1, 0).p; this.distantLight.position.copy(far).add(V(0, 3, 0)); this.distantLight.intensity = t > 26 ? 40 : 0;
    // rain falls round the camera
    this.rain.position.set(cam.position.x, cam.position.y - 2 - (t * 9) % 12, cam.position.z);

    // the bag: in the trunk, lifted toward the camera, then carried away down out of the frame
    const lift = sstep(24.3, 24.95, t), away = sstep(24.95, 25.55, t);
    this.bag.visible = t < 25.7;
    this.bag.position.set(0, .98 + lift * .55, 1.55 + lift * 1.5 + away * .3); this.bag.rotation.set(-Math.PI / 2 + lift * 1.3, 0, lift * .15 - away * .5);   // it lies in the cargo area, then comes up toward the camera

    // --- the camera
    const look = V(0, 0, 0), eyeP = V(0, 0, 0); let roll = 0, shake = 0;
    const base = this.driverEye();
    if (t < this.CRASH) {
      eyeP.copy(base).add(V(0, Math.sin(t * 31) * .003, 0)); look.set(base.x + Math.sin(t * .7) * .1, base.y - .22, -8);
      shake = sstep(11.1, 12.6, t) * .006;
    } else if (t < this.CRASH + .6) {
      const c = t - this.CRASH, k = Math.exp(-c * 6);
      eyeP.copy(base).add(V(0, -.12 * k, -.1 * k)); look.set(base.x + Math.sin(c * 40) * .5 * k, base.y - 1.3 * k, -8); shake = .05 * k;
    } else {
      const ks = this.keys; let i = 0; while (i < ks.length - 2 && t > ks[i + 1]!.t) i++;
      const a = ks[i]!, b = ks[i + 1]!, u = sstep(a.t, b.t, Math.max(a.t, t));
      eyeP.copy(a.eye).lerp(b.eye, u); look.copy(a.look).lerp(b.look, u); roll = lerp(a.roll, b.roll, u);
      const walking = t > 19.7 && t < 22.8 || t > 26.4;
      if (walking) { const s = t * 6.2; eyeP.y += Math.abs(Math.sin(s)) * .035 - .02; roll += Math.sin(s) * .012; look.x += Math.sin(s * .5) * .04; }
      if (t < 19) { eyeP.x += Math.sin(t * 1.9) * .01; look.y += Math.sin(t * 1.3) * .08; }
    }
    this.aim.position.copy(eyeP); this.car.add(this.aim); this.car.updateMatrixWorld(true);
    this.aim.lookAt(this.car.localToWorld(look.clone())); this.aim.rotateZ(roll);
    const wp = new T.Vector3(), wq = new T.Quaternion(); this.aim.getWorldPosition(wp); this.aim.getWorldQuaternion(wq);
    cam.position.copy(wp); cam.quaternion.copy(wq);
    if (shake) { cam.position.x += Math.sin(t * 91) * shake; cam.position.y += Math.cos(t * 77) * shake; cam.rotateZ(Math.sin(t * 63) * shake * 1.6); }
    cam.updateMatrixWorld(true);

    // --- the grade: fade in, impact flash, black with ringing, eyes opening (twice), fade out at the end
    let fade = sstep(0, 1.3, t), flash = 0;
    if (t >= this.CRASH) {
      flash = t < this.CRASH + .06 ? 1 : Math.max(0, 1 - (t - this.CRASH - .06) / .8);
      fade = t < this.CRASH + .25 ? 1 : t < 15.6 ? 0 : 1;
      if (t >= 15.6) { const open = sstep(15.6, 17.1, t), blink = 1 - .85 * Math.max(0, Math.sin((t - 16.4) * 7.5)) * (t > 16.4 && t < 16.8 ? 1 : 0); fade = open * blink; }
    }
    // the oncoming beams blind: a growing white veil just before the swerve
    if (t > 10.2 && t < this.CRASH) flash = Math.max(flash, .55 * sstep(10.2, 12.2, t));
    if (t > 29) fade *= 1 - sstep(29, 30, t);
    return { fade: Math.min(1, Math.max(0, fade)), flash };
  }

  dispose() {
    this.scene.traverse(o => { const m = o as T.Mesh; m.geometry?.dispose?.(); const mat = m.material as T.Material | T.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose()); });
  }
}
