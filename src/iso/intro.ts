import * as T from 'three';

/**
 * The opening, 30 seconds, first person, nothing but the camera:
 *   0.0–12.6  night drive on a forest road, headlights, a felled tree across the road, braking, impact
 *  12.6–15.6  white flash, black, ringing in the ears
 *  15.6–19.5  waking up in the wrecked car, the cracked windshield, the beams on the log
 *  19.5–22.8  out of the car and along its side to the back, red tail lights
 *  22.8–25.6  the trunk opens, the bag is taken
 *  25.6–30.0  turning round, the dark building ahead, the walk to it, fade to black
 * Everything is deterministic in the time t, so it can be skipped, paused or scrubbed.
 */
export const INTRO_DURATION = 30;

const V = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = T.MathUtils.lerp;
const rnd = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

function noiseTexture(size: number, base: [number, number, number], amount: number, repeat: [number, number], lines?: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = `rgb(${base.join(',')})`; g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size), r = rnd(7);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - .5) * amount; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  lines?.(g);
  const tex = new T.CanvasTexture(c); tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

function crackTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d')!, r = rnd(11);
  g.strokeStyle = 'rgba(210,225,230,.8)'; g.lineWidth = 1.4;
  const cx = 330, cy = 130;
  for (let i = 0; i < 26; i++) {
    let a = r() * Math.PI * 2, x = cx, y = cy; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { a += (r() - .5) * .5; const l = 14 + r() * 40; x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y); }
    g.stroke();
  }
  g.lineWidth = .8; g.strokeStyle = 'rgba(210,225,230,.45)';
  for (let k = 1; k < 5; k++) { g.beginPath(); for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2, rr = k * 26 + (r() - .5) * 8; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .8); } g.stroke(); }
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; return tex;
}

type Key = { t: number; eye: T.Vector3; look: T.Vector3; roll: number };

export class Intro {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(68, 16 / 9, .05, 300);
  private readonly car = new T.Group();
  private readonly aim = new T.Camera();   // a Camera so that lookAt points -z at the target
  private readonly lid = new T.Group();
  private readonly bag = new T.Group();
  private readonly crack: T.Mesh;
  private readonly headL: T.SpotLight; private readonly headR: T.SpotLight;
  private readonly tail: T.PointLight;
  private readonly lamp: T.PointLight;
  private readonly building = new T.Group();
  private readonly dashboard = new T.Group();
  /** car state by time during the drive: x, z, yaw, speed */
  private readonly drive: { x: number; z: number; yaw: number; v: number }[] = [];
  private readonly CRASH = 12.6;
  private readonly keys: Key[] = [];
  private carEnd = { x: 0, z: 0, yaw: 0 };

  constructor() {
    const s = this.scene;
    s.background = new T.Color(0x02060a); s.fog = new T.FogExp2(0x030a0f, .052);
    s.add(new T.HemisphereLight(0x3a5a78, 0x0a0e10, 12));
    const moon = new T.DirectionalLight(0x8fb0d0, 8); moon.position.set(-30, 60, 20); s.add(moon);

    // --- the road, the ground, the forest
    const road = new T.Mesh(new T.PlaneGeometry(6.4, 700), new T.MeshStandardMaterial({
      map: noiseTexture(256, [78, 80, 82], 38, [1, 120], g => { g.fillStyle = 'rgba(190,190,170,.55)'; g.fillRect(124, 24, 8, 70); g.fillStyle = 'rgba(160,160,150,.4)'; g.fillRect(4, 0, 4, 256); g.fillRect(248, 0, 4, 256); }),
      roughness: .55, metalness: .1 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, .01, -230); s.add(road);
    const ground = new T.Mesh(new T.PlaneGeometry(500, 760), new T.MeshStandardMaterial({ map: noiseTexture(256, [48, 58, 46], 46, [60, 90]), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -230); s.add(ground);
    const bark = new T.MeshStandardMaterial({ map: noiseTexture(128, [38, 30, 24], 34, [1, 6]), roughness: 1 });
    const crown = new T.MeshStandardMaterial({ color: 0x0a140e, roughness: 1 });
    const N = 700, trunks = new T.InstancedMesh(new T.CylinderGeometry(.16, .3, 15, 6), bark, N), crowns = new T.InstancedMesh(new T.ConeGeometry(2.6, 9, 6), crown, N);
    const r = rnd(3), m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
    for (let i = 0; i < N; i++) {
      const side = r() < .5 ? -1 : 1, x = side * (4.2 + Math.pow(r(), 2.2) * 30), z = 70 - r() * 430, sc = .7 + r() * .7;
      e.set((r() - .5) * .06, r() * 6, (r() - .5) * .06); q.setFromEuler(e);
      m.compose(V(x, 7.5 * sc, z), q, V(sc, sc, sc)); trunks.setMatrixAt(i, m);
      m.compose(V(x + (r() - .5), 13.5 * sc, z), q, V(sc * (.8 + r() * .5), sc, sc * (.8 + r() * .5))); crowns.setMatrixAt(i, m);
    }
    s.add(trunks, crowns);

    // --- the car
    const paint = new T.MeshStandardMaterial({ color: 0x14181b, roughness: .35, metalness: .75 });
    const dark = new T.MeshStandardMaterial({ color: 0x050607, roughness: .8 });
    const glass = new T.MeshStandardMaterial({ color: 0x0a1216, roughness: .05, metalness: .3, transparent: true, opacity: .38 });
    const box = (w: number, h: number, d: number, mat: T.Material, x: number, y: number, z: number, parent: T.Object3D = this.car) => {
      const o = new T.Mesh(new T.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); parent.add(o); return o;
    };
    box(1.86, .5, 4.5, paint, 0, .5, 0);                       // body
    box(1.62, .75, 2.1, glass, 0, 1.12, -.15);                    // cabin glass (seen from outside)
    box(1.7, .06, 2.2, paint, 0, 1.5, -.15);                     // roof
    box(1.9, .12, 4.6, dark, 0, .2, 0);                         // underbody
    // trunk: a cavity open at the top, the lid hinges at its front edge
    box(1.5, .05, 1.1, dark, 0, .74, 2.5);
    box(.05, .38, 1.1, dark, -.75, .95, 2.5); box(.05, .38, 1.1, dark, .75, .95, 2.5);
    box(1.5, .5, .05, dark, 0, .95, 1.97);
    this.lid.position.set(0, 1.0, 1.95); this.car.add(this.lid); box(1.72, .05, 1.1, paint, 0, 0, .55, this.lid);
    // tail lights and the lights themselves
    const red = new T.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1208, emissiveIntensity: 2.2 });
    box(.34, .12, .05, red, -.72, .9, 2.27); box(.34, .12, .05, red, .72, .9, 2.27);
    this.tail = new T.PointLight(0xff1a0c, 0, 7, 1.6); this.tail.position.set(0, 1.0, 2.7); this.car.add(this.tail);
    const spot = (x: number) => { const l = new T.SpotLight(0xdce8ee, 0, 70, .5, .7, 1.4); l.position.set(x, .75, -1.9); l.target.position.set(x * .4, -.2, -16); this.car.add(l, l.target); return l; };
    this.headL = spot(-.62); this.headR = spot(.62);
    const lens = new T.MeshStandardMaterial({ color: 0x555a50, emissive: 0xe8f0f0, emissiveIntensity: 1.8 });
    box(.3, .14, .05, lens, -.62, .75, -2.27); box(.3, .14, .05, lens, .62, .75, -2.27);
    // dashboard, pillars and the wheel (what the driver sees)
    this.car.add(this.dashboard);
    box(1.7, .26, .55, dark, 0, .82, -.72, this.dashboard);
    box(.1, .75, .12, dark, -.82, 1.12, -.7, this.dashboard); box(.1, .75, .12, dark, .82, 1.12, -.7, this.dashboard);
    box(.34, .05, .05, dark, 0, 1.45, -.78, this.dashboard);
    const wheel = new T.Mesh(new T.TorusGeometry(.19, .018, 8, 24), dark); wheel.position.set(-.4, 1.0, -.45); wheel.rotation.x = -1.1; this.dashboard.add(wheel);
    const dial = new T.MeshStandardMaterial({ color: 0x021008, emissive: 0xd89030, emissiveIntensity: .7 });
    box(.05, .018, .01, dial, -.46, .965, -.52, this.dashboard); box(.03, .018, .01, dial, -.34, .965, -.52, this.dashboard);
    // cracked windshield (after the impact)
    this.crack = new T.Mesh(new T.PlaneGeometry(1.5, .75), new T.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, opacity: 0, fog: false }));
    this.crack.position.set(0, 1.3, -.95); this.crack.rotation.x = -.5; this.car.add(this.crack);
    // the bag in the trunk
    const canvas = new T.MeshStandardMaterial({ map: noiseTexture(128, [44, 50, 38], 40, [2, 2]), roughness: 1 });
    const body = new T.Mesh(new T.BoxGeometry(.5, .3, .26), canvas); this.bag.add(body);
    const strap = new T.Mesh(new T.TorusGeometry(.17, .014, 6, 16, Math.PI), dark); strap.position.y = .15; this.bag.add(strap);
    const zip = new T.Mesh(new T.BoxGeometry(.46, .01, .02), dark); zip.position.set(0, .152, 0); this.bag.add(zip);
    this.bag.position.set(0, .93, 2.5); this.car.add(this.bag);
    s.add(this.car); s.add(this.aim); this.car.add(this.aim);

    // --- the building waiting at the end of the road
    const wall = new T.MeshStandardMaterial({ map: noiseTexture(128, [58, 60, 56], 40, [6, 2]), roughness: .95 });
    const b = (w: number, h: number, d: number, mat: T.Material, x: number, y: number, z: number) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); this.building.add(o); return o; };
    b(18, 6.5, 10, wall, 0, 3.25, 0); b(19, .4, 11, dark, 0, 6.6, 0);
    b(2.0, 2.7, .3, dark, 0, 1.35, 5.1); b(2.3, .22, .12, wall, 0, 2.78, 5.2);           // door and its lintel
    b(5.2, .3, 2.4, wall, 0, 3.25, 6.2); b(.28, 3.2, .28, wall, -2.4, 1.6, 7.2); b(.28, 3.2, .28, wall, 2.4, 1.6, 7.2);   // the porch roof on two posts
    b(18, .3, .3, wall, 0, 5.4, 5.1);                                                    // a cornice
    const win = new T.MeshStandardMaterial({ color: 0x030505, emissive: 0xa8c8a0, emissiveIntensity: .8 });
    for (let i = 0; i < 7; i++) { if (Math.abs(-7.5 + i * 2.5) < 2.6) continue; b(.9, 1.3, .1, i === 5 ? win : dark, -7.5 + i * 2.5, 4.2, 5.05); }
    for (let i = 0; i < 7; i++) { if (Math.abs(-7.5 + i * 2.5) < 2.6) continue; b(.9, 1.1, .1, dark, -7.5 + i * 2.5, 1.7, 5.05); }
    this.lamp = new T.PointLight(0xffc880, 0, 14, 1.4); this.lamp.position.set(0, 2.4, 6.1); this.building.add(this.lamp);
    s.add(this.building);

    this.simulate();
    this.placeStatic();
    this.buildKeys();
  }

  /** integrate the drive: a lane of the road, a late swerve to the left, braking */
  private simulate() {
    let x = 1.6, z = 0, yaw = 0, t = 0; const h = 1 / 60;
    for (; t <= this.CRASH + h; t += h) {
      const v = t < 11.1 ? 14 : lerp(14, 8.5, sstep(11.1, 12.6, t));
      yaw = .42 * sstep(11.1, 12.3, t);
      this.drive.push({ x, z, yaw, v });
      x += -Math.sin(yaw) * v * h; z += -Math.cos(yaw) * v * h;
    }
    const end = this.drive[this.drive.length - 1]!;
    this.carEnd = { x: end.x, z: end.z, yaw: end.yaw };
  }

  /** the fallen tree and the building stand where the car ends up */
  private placeStatic() {
    const { x, z, yaw } = this.carEnd;
    const fwd = V(-Math.sin(yaw), 0, -Math.cos(yaw));
    const logBark = new T.MeshStandardMaterial({ map: noiseTexture(128, [44, 34, 26], 40, [6, 1]), roughness: 1 });
    const log = new T.Mesh(new T.CylinderGeometry(.5, .56, 12, 8), logBark);
    log.rotation.z = Math.PI / 2; log.position.set(x + fwd.x * 2.55, .5, z + fwd.z * 2.55); log.rotation.y = .12; this.scene.add(log);
    this.building.position.set(x + Math.sin(yaw) * 23, 0, z + Math.cos(yaw) * 23); this.building.rotation.y = Math.PI + yaw;   // behind the wreck, its door faces it
  }

  private buildKeys() {
    const k = (t: number, eye: T.Vector3, look: T.Vector3, roll = 0) => this.keys.push({ t, eye, look, roll });
    // car-local coordinates (the car faces -z, its left is -x, its rear is +z)
    k(15.6, V(-.4, .93, .35), V(-.3, .95, -6), 1.05);
    k(17.2, V(-.4, .99, .3), V(-.2, 1.0, -6), .75);
    k(19.0, V(-.4, 1.18, .2), V(-.1, 1.1, -6), .2);
    k(19.7, V(-.9, 1.05, .35), V(-3, 1.0, .5), .05);
    k(20.6, V(-1.5, 1.62, .6), V(-1.6, 1.4, 4), 0);
    k(21.7, V(-1.5, 1.62, 2.0), V(-.8, 1.2, 4), 0);
    k(22.8, V(-.8, 1.6, 3.6), V(0, .9, 2.5), 0);
    k(24.4, V(-.05, 1.5, 3.45), V(0, .8, 2.5), 0);
    k(25.2, V(-.05, 1.42, 3.35), V(0, .78, 2.55), 0);
    k(25.7, V(-.05, 1.5, 3.4), V(0, 1.2, 8), 0);
    k(27.0, V(0, 1.62, 4.0), V(0, 2.2, 19), 0);
    k(29.2, V(0, 1.62, 10.2), V(0, 2.4, 19), 0);
    k(30.0, V(0, 1.62, 11), V(0, 2.4, 19), 0);
  }

  private carPose(t: number) {
    if (t < this.CRASH) {
      const i = Math.min(this.drive.length - 1, Math.floor(t * 60)), d = this.drive[i]!;
      const sway = Math.sin(t * 1.3) * .015;
      this.car.position.set(d.x + sway, 0, d.z); this.car.rotation.set(-sstep(11.1, 12.6, t) * .02, d.yaw, 0, 'YXZ');
    } else {
      const { x, z, yaw } = this.carEnd;
      this.car.position.set(x, 0, z); this.car.rotation.set(-.07, yaw, .035, 'YXZ');
    }
    this.car.updateMatrixWorld(true);
  }

  /** Sets up the scene for time t and returns the grade: fade (0 black..1 normal) and flash (0..1 white). */
  update(t: number, aspect: number): { fade: number; flash: number } {
    t = Math.min(INTRO_DURATION, Math.max(0, t));
    this.carPose(t);
    const cam = this.camera;
    if (Math.abs(cam.aspect - aspect) > 1e-3) { cam.aspect = aspect; cam.updateProjectionMatrix(); }
    const crashed = t >= this.CRASH;
    this.dashboard.visible = t < 19.8;
    this.crack.visible = t >= this.CRASH; (this.crack.material as T.MeshBasicMaterial).opacity = t >= this.CRASH ? .8 : 0;
    // lights: the beams reach down the road, after the crash one of them flickers, the tail lights come on in the wreck
    const hl = t < .8 ? 0 : t < 1.4 ? sstep(.8, 1.4, t) : 1;
    const flick = crashed ? (Math.sin(t * 47) * Math.sin(t * 13.1) > .55 ? .15 : 1) : 1;
    this.headL.intensity = 1800 * hl; this.headR.intensity = 1800 * hl * (crashed ? flick : 1);
    this.tail.intensity = crashed ? 24 : 0;
    this.lamp.intensity = t > 26 ? 120 * (1 - .4 * Math.max(0, Math.sin(t * 9) * Math.sin(t * 3.7))) : 0;
    this.lid.rotation.x = -1.25 * sstep(22.8, 24.4, t);
    // the bag: in the trunk, lifted toward the camera, then carried away down out of the frame
    const lift = sstep(24.3, 24.95, t), away = sstep(24.95, 25.55, t);
    this.bag.visible = t < 25.7;
    this.bag.position.set(0, .93 + lift * .42, 2.5 + lift * .52 + away * .25);
    this.bag.rotation.set(0, 0, lift * .15 - away * .5);

    // --- the camera
    const eye = V(0, 0, 0), look = V(0, 0, 0); let roll = 0, shake = 0;
    if (t < this.CRASH) {
      const bump = Math.sin(t * 31) * .004 + Math.sin(t * 17.3) * .003;
      eye.set(-.4, 1.2 + bump, .15); look.set(-.4 + Math.sin(t * .7) * .12, 1.12, -8);
      shake = sstep(11.1, 12.6, t) * .006;
    } else if (t < this.CRASH + .6) {
      const c = t - this.CRASH, k = Math.exp(-c * 6);
      eye.set(-.4, 1.2 - .12 * k, .15 - .1 * k); look.set(-.4 + Math.sin(c * 40) * .5 * k, 1.12 - 1.3 * k, -8); shake = .05 * k;
    } else {
      // between the keys
      const ks = this.keys;
      let i = 0; while (i < ks.length - 2 && t > ks[i + 1]!.t) i++;
      const a = ks[i]!, b = ks[i + 1]!, u = sstep(a.t, b.t, Math.max(a.t, t));
      eye.copy(a.eye).lerp(b.eye, u); look.copy(a.look).lerp(b.look, u); roll = lerp(a.roll, b.roll, u);
      const walking = t > 19.7 && t < 22.8 || t > 26.4;
      if (walking) { const s = t * 6.2; eye.y += Math.abs(Math.sin(s)) * .035 - .02; roll += Math.sin(s) * .012; look.x += Math.sin(s * .5) * .04; }
      if (t < 19) { eye.x += Math.sin(t * 1.9) * .01; look.y += Math.sin(t * 1.3) * .08; }
    }
    this.aim.position.copy(eye);
    const world = this.car.localToWorld(look.clone());
    this.aim.lookAt(world);
    this.aim.rotateZ(roll);
    const wp = new T.Vector3(); const wq = new T.Quaternion();
    this.aim.getWorldPosition(wp); this.aim.getWorldQuaternion(wq);
    cam.position.copy(wp); cam.quaternion.copy(wq);
    if (shake) { cam.position.x += Math.sin(t * 91) * shake; cam.position.y += Math.cos(t * 77) * shake; cam.rotateZ(Math.sin(t * 63) * shake * 1.6); }
    cam.fov = 68 + (t > this.CRASH - 1.5 && t < this.CRASH ? 6 * sstep(this.CRASH - 1.5, this.CRASH, t) : 0);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);

    // --- the grade: fade in, impact flash, black with ringing, eyes opening (twice), fade out at the end
    let fade = sstep(0, 1.3, t), flash = 0;
    if (t >= this.CRASH) {
      flash = t < this.CRASH + .06 ? 1 : Math.max(0, 1 - (t - this.CRASH - .06) / .8);
      fade = t < this.CRASH + .25 ? 1 : t < 15.6 ? 0 : 1;
      if (t >= 15.6) {
        const open = sstep(15.6, 17.1, t);
        const blink = 1 - .85 * Math.max(0, Math.sin((t - 16.4) * 7.5)) * (t > 16.4 && t < 16.8 ? 1 : 0);
        fade = open * blink;
      }
    }
    if (t > 29) fade *= 1 - sstep(29, 30, t);
    return { fade: Math.min(1, Math.max(0, fade)), flash };
  }

  dispose() {
    this.scene.traverse(o => { const m = o as T.Mesh; m.geometry?.dispose?.(); const mat = m.material as T.Material | T.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose()); });
  }
}
