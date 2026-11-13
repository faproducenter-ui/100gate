import * as T from 'three';

/**
 * A real flame, not a sprite: nested polygon shells (a lathe of a teardrop profile, 14 x 26 quads each) whose vertices are pushed about by scrolling
 * fractal noise in the vertex shader, shaded by a black-body colour ramp (blue-white core -> yellow -> orange -> red -> smoke at the tip) with a
 * fresnel edge fade and noise-eaten tips, plus a soft halo and a few embers that rise, drift and die. All shapes are in unit height: the hosting
 * object (a bone, whose scale is the clip's flame size) scales them.
 */
const NOISE = /* glsl */ `
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
  }
  float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= .5; } return s; }
`;

const SHELL_VERT = /* glsl */ `
  uniform float uTime, uSeed, uLevel, uWobble, uLift;
  varying vec3 vNormal; varying vec3 vView; varying float vH; varying float vAng;
  ${NOISE}
  void main() {
    float h = clamp(position.y, 0., 1.);
    vH = h; vAng = atan(position.z, position.x);
    vec3 pos = position;
    float t = uTime;
    // the whole tongue leans and sways; the tip lags behind the base, wandering more the higher it is
    float nx = fbm(vec2(h * 1.8 - t * 1.5 + uSeed, uSeed * 3.1 + t * .35));
    float nz = fbm(vec2(h * 2.1 - t * 1.7 + 7.3 + uSeed, uSeed * 1.7 - t * .3));
    float k = h * h * (1. + .6 * h);
    pos.x += (nx - .5) * .85 * k * uWobble;
    pos.z += (nz - .5) * .85 * k * uWobble;
    // fast ripple that runs up the surface
    float rip = fbm(vec2(vAng * 1.3 + uSeed, h * 5. - t * 3.4));
    pos.xz *= 1. + (rip - .5) * .35 * h;
    // the flame breathes in height and is lifted by the draught
    pos.y *= (.88 + .24 * fbm(vec2(t * 1.1 + uSeed, 2.3))) * uLevel * uLift;
    pos.xz *= uLevel;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(pos, 1.);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAG = /* glsl */ `
  uniform float uTime, uSeed, uAlpha, uEdge, uTip;
  uniform vec3 uBase, uMid, uTop;
  varying vec3 vNormal; varying vec3 vView; varying float vH; varying float vAng;
  ${NOISE}
  void main() {
    vec3 n = normalize(vNormal), v = normalize(vView);
    float facing = abs(dot(n, v));
    float edge = pow(facing, uEdge);                           // 1 where the shell faces the eye, 0 on its silhouette
    float turb = fbm(vec2(vAng * 1.6 + uSeed, vH * 3.2 - uTime * 2.6));
    float turb2 = fbm(vec2(vAng * 3.1 - uSeed, vH * 6.1 - uTime * 4.1));
    float eaten = smoothstep(uTip - .5, uTip + .18, vH + (turb - .5) * .62 + (turb2 - .5) * .22);   // tips and edges are eaten away by the noise
    float shape = edge * (1. - eaten);
    float heat = clamp(1. - vH * 1.15 + (turb - .5) * .5, 0., 1.);
    vec3 col = heat > .5 ? mix(uMid, uBase, (heat - .5) * 2.) : mix(uTop, uMid, heat * 2.);
    float a = shape * uAlpha * (.8 + .4 * turb2);
    gl_FragColor = vec4(col, a);
  }
`;

const EMBER_VERT = /* glsl */ `
  uniform float uTime, uSize, uRise;
  attribute float aPhase; attribute float aSeed;
  varying float vLife;
  void main() {
    float life = fract(uTime * (.22 + .18 * aSeed) + aPhase);
    vLife = life;
    float rise = life * uRise * (.6 + .8 * aSeed);
    vec3 p = vec3(sin(aSeed * 43. + life * 5. + uTime) * .09 * life, rise, cos(aSeed * 17. + life * 4.) * .09 * life);
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    gl_PointSize = uSize * (1. - life) * (450. / -mv.z) * (.5 + aSeed);
    gl_Position = projectionMatrix * mv;
  }
`;
const EMBER_FRAG = /* glsl */ `
  varying float vLife;
  void main() {
    vec2 c = gl_PointCoord - .5; float d = length(c);
    float a = smoothstep(.5, 0., d) * (1. - vLife) * (1. - vLife);
    vec3 col = mix(vec3(1., .85, .45), vec3(1., .22, .03), vLife);
    gl_FragColor = vec4(col * a, a);
  }
`;

function teardrop(width: number, rows = 26, segs = 14) {
  const pts: T.Vector2[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = i / rows;
    const r = width * Math.pow(Math.max(0, Math.sin(Math.pow(y, .62) * Math.PI)), .9) * (1 - .45 * y);
    pts.push(new T.Vector2(Math.max(r, 1e-4), y));
  }
  return new T.LatheGeometry(pts, segs);
}

let haloTex: T.CanvasTexture | undefined;
const halo = () => {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,170,70,.85)'); grad.addColorStop(.35, 'rgba(255,110,30,.28)'); grad.addColorStop(1, 'rgba(255,70,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  haloTex = new T.CanvasTexture(c); haloTex.colorSpace = T.SRGBColorSpace; return haloTex;
};

type Layer = { geom: T.BufferGeometry; mat: T.ShaderMaterial; mesh: T.Mesh };

export class Flame {
  readonly root = new T.Group();
  private readonly layers: Layer[] = [];
  private readonly embers: T.Points;
  private readonly emberMat: T.ShaderMaterial;
  private readonly haloSprite: T.Sprite;
  /** height: metres of the full flame; phase: de-synchronises several flames; embers: how many sparks. */
  constructor(readonly height: number, readonly phase = 0, embers = 14) {
    const mkLayer = (scale: number, width: number, seed: number, base: number[], mid: number[], top: number[], alpha: number, edge: number, tip: number) => {
      const geom = teardrop(width);
      const mat = new T.ShaderMaterial({
        vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false,
        uniforms: { uTime: { value: 0 }, uSeed: { value: seed + phase }, uLevel: { value: 1 }, uWobble: { value: 1 }, uLift: { value: 1 },
          uAlpha: { value: alpha }, uEdge: { value: edge }, uTip: { value: tip },
          uBase: { value: new T.Color(...base) }, uMid: { value: new T.Color(...mid) }, uTop: { value: new T.Color(...top) } },
      });
      const mesh = new T.Mesh(geom, mat); mesh.scale.set(height * scale, height * scale, height * scale); mesh.renderOrder = 10; mesh.frustumCulled = false;
      mesh.raycast = () => {}; this.root.add(mesh); this.layers.push({ geom, mat, mesh });
    };
    //          scale  width  seed  base                  mid                  top                 alpha edge tip
    mkLayer(1.00, .26, 0.0, [1, .55, .12], [1, .30, .03], [.55, .06, .01], .30, 1.1, .78);   // outer: red-orange, ragged tip
    mkLayer(.74, .20, 3.7, [1, .93, .55], [1, .62, .10], [1, .30, .04], .36, 1.3, .86);       // middle: yellow-orange
    mkLayer(.42, .15, 8.2, [1, .98, .90], [1, .92, .55], [1, .62, .15], .55, 1.7, .95);       // core: almost white
    mkLayer(.20, .20, 5.1, [.20, .42, 1], [.12, .25, .85], [.1, .1, .4], .30, 1.2, 1.1);      // blue root where the fuel burns hottest
    this.layers[3]!.mesh.scale.y = height * .2; this.layers[3]!.mesh.scale.x = this.layers[3]!.mesh.scale.z = height * .24;
    const n = embers, pos = new Float32Array(n * 3), ph = new Float32Array(n), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) { ph[i] = i / n; sd[i] = (Math.sin(i * 12.9898 + phase) * 43758.5453) % 1; sd[i] = Math.abs(sd[i]!); }
    const eg = new T.BufferGeometry();
    eg.setAttribute('position', new T.BufferAttribute(pos, 3)); eg.setAttribute('aPhase', new T.BufferAttribute(ph, 1)); eg.setAttribute('aSeed', new T.BufferAttribute(sd, 1));
    this.emberMat = new T.ShaderMaterial({ vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uSize: { value: height * .022 }, uRise: { value: height * 2.6 } } });
    this.embers = new T.Points(eg, this.emberMat); this.embers.frustumCulled = false; this.embers.renderOrder = 11; this.embers.raycast = () => {}; this.root.add(this.embers);
    this.haloSprite = new T.Sprite(new T.SpriteMaterial({ map: halo(), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: .5 }));
    this.haloSprite.scale.set(height * 1.7, height * 1.7, 1); this.haloSprite.position.y = height * .4; this.haloSprite.renderOrder = 9; this.haloSprite.raycast = () => {}; this.root.add(this.haloSprite);
  }
  /** t: seconds; level 0..1: how much of the flame is there (the hosting bone's scale also applies). */
  private static readonly q = new T.Quaternion();
  update(t: number, level = 1) {
    // a flame always rises: undo whatever the hosting bone / prop is turned to
    const host = this.root.parent;
    if (host) { host.getWorldQuaternion(Flame.q); this.root.quaternion.copy(Flame.q.invert()); }
    for (const l of this.layers) l.mat.uniforms.uTime!.value = t;
    this.emberMat.uniforms.uTime!.value = t + this.phase;
    this.embers.visible = level > .3;
    this.haloSprite.material.opacity = .16 * level * (.85 + .15 * Math.sin(t * 9 + this.phase));
  }
  dispose() {
    for (const l of this.layers) { l.geom.dispose(); l.mat.dispose(); }
    this.embers.geometry.dispose(); this.emberMat.dispose(); this.haloSprite.material.dispose();
  }
}

/** Light output of a real flame over time: breathing, quick shudders and now and then a dip (a draught). ~0.55 .. 1.25 */
export function fireFlicker(t: number, seed = 0) {
  const s = t + seed;
  const slow = Math.sin(s * 1.7) * .08 + Math.sin(s * 2.9 + 1.3) * .06;
  const quick = Math.sin(s * 11.3) * .05 * Math.sin(s * 2.3 + .4) + Math.sin(s * 23.1 + 2.0) * .035;
  const dip = -.28 * Math.pow(Math.max(0, Math.sin(s * .83 + seed * 3.0)), 24);
  return Math.max(.5, 1 + slow + quick + dip);
}
