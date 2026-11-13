import * as T from 'three';

/**
 * The low-fi analog look. The scene is drawn into a small render target (about 480p, nearest-neighbour filtered), then one full-screen pass
 * upscales it and adds what a cheap camera and a CRT do to a picture: barrel distortion toward the edges, colour fringing that grows toward
 * the edges, scanlines, film grain, a vignette, a slow brightness flicker and a cold, desaturated, deep-black colour grade.
 * Tone mapping and the sRGB encode are done here, because a render target does not get them from the renderer.
 */
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;
const FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uRes;
  uniform float uTime, uGrain, uAberr, uScan, uCurve, uVig, uFlicker, uSat, uExposure, uBlack, uFade, uFlash;
  varying vec2 vUv;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  vec3 aces(vec3 x) { const float a = 2.51, b = .03, c = 2.43, d = .59, e = .14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0., 1.); }
  void main() {
    vec2 uv = vUv * 2. - 1.;
    float r2 = dot(uv, uv);
    uv *= 1. + uCurve * r2;                                       // the glass bulges: the edges bend away
    vec2 st = uv * .5 + .5;
    if (st.x < 0. || st.x > 1. || st.y < 0. || st.y > 1.) { gl_FragColor = vec4(0., 0., 0., 1.); return; }
    vec2 dir = st - .5;
    float ab = uAberr * (.35 + length(dir) * 1.9);                // colour fringing grows toward the edges
    vec3 col;
    col.r = texture2D(tDiffuse, st + dir * ab).r;
    col.g = texture2D(tDiffuse, st).g;
    col.b = texture2D(tDiffuse, st - dir * ab).b;
    // a little horizontal smear, as a tape or a cheap sensor gives
    vec2 px = vec2(1. / uRes.x, 0.);
    col = mix(col, .5 * (texture2D(tDiffuse, st - px).rgb + texture2D(tDiffuse, st + px).rgb), .22);
    float flick = 1. + uFlicker * ((hash(vec2(floor(uTime * 24.), 3.)) - .5) * .8 + sin(uTime * 7.3) * .35);
    {   // a cheap bloom: the bright edges (lamps, sign, gauges) bleed into their surroundings
      vec3 glow = vec3(0.);
      for (int i = 0; i < 8; i++) {
        float a = float(i) * .785398;
        vec2 o = vec2(cos(a), sin(a)) * 2.6 / uRes;
        vec3 c = texture2D(tDiffuse, st + o).rgb;
        glow += max(c - vec3(.8), 0.);
      }
      col += glow * .09;
    }
    col *= uExposure * flick;
    col = aces(col);
    float l = dot(col, vec3(.299, .587, .114));
    col = mix(vec3(l), col, uSat);                                // pulled-down saturation
    col = mix(col * vec3(.50, .93, 1.22), col * vec3(.92, 1.0, 1.04), smoothstep(.08, .55, l));   // the shadows go cold blue-green, a flame stays warm
    col = pow(col, vec3(1.14));
    col = max(col - uBlack, 0.);                                  // deep blacks
    float row = floor(st.y * uRes.y);
    col *= 1. - uScan * (.55 * mod(row, 2.) + .25 * (.5 + .5 * sin(st.y * uRes.y * 6.2831)));
    float n = hash(floor(st * uRes) + floor(uTime * 24.) * 17.3);
    col *= 1. + (n - .5) * uGrain * 2.4;                          // grain rides on the signal instead of speckling the blacks
    col += (n - .5) * uGrain * .07;
    float v = smoothstep(.98, .22, length(dir) * 1.32);
    col *= mix(1., v, uVig);
    col = pow(max(col, 0.), vec3(1. / 2.2));
    col = mix(col * uFade, vec3(1.), uFlash);                     // fades (the opening) and the white flash
    gl_FragColor = vec4(col, 1.);
  }
`;

export class AnalogPass {
  private readonly rt = new T.WebGLRenderTarget(2, 2, { type: T.HalfFloatType, magFilter: T.NearestFilter, minFilter: T.NearestFilter, depthBuffer: true, generateMipmaps: false });
  private readonly mat: T.ShaderMaterial;
  private readonly screen = new T.Scene();
  private readonly cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private lowHeight = 480;
  constructor() {
    this.mat = new T.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { tDiffuse: { value: this.rt.texture }, uRes: { value: new T.Vector2(2, 2) }, uTime: { value: 0 }, uGrain: { value: .06 }, uAberr: { value: .0042 },
        uScan: { value: .22 }, uCurve: { value: .07 }, uVig: { value: .92 }, uFlicker: { value: .035 }, uSat: { value: .7 }, uExposure: { value: 1.0 }, uBlack: { value: .012 }, uFade: { value: 1 }, uFlash: { value: 0 } },
    });
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2), this.mat); quad.frustumCulled = false; this.screen.add(quad);
  }
  /** Size of the output in CSS pixels and the height of the low-resolution picture. */
  resize(w: number, h: number, lowHeight = 480) {
    this.lowHeight = lowHeight;
    const lw = Math.max(2, Math.round(lowHeight * w / h));
    if (this.rt.width !== lw || this.rt.height !== lowHeight) this.rt.setSize(lw, lowHeight);
    (this.mat.uniforms.uRes!.value as T.Vector2).set(lw, lowHeight);
  }
  /** strength 0..1 scales every artefact (the menu uses less than the game). */
  render(renderer: T.WebGLRenderer, draw: () => void, time: number, strength = 1, fade = 1, flash = 0) {
    const u = this.mat.uniforms;
    u.uTime!.value = time; u.uGrain!.value = .06 * strength; u.uAberr!.value = .0042 * strength; u.uScan!.value = .22 * strength;
    u.uCurve!.value = .07 * strength; u.uVig!.value = .92 * strength; u.uFlicker!.value = .035 * strength; u.uSat!.value = 1 - .32 * strength;
    u.uFade!.value = fade; u.uFlash!.value = flash;
    renderer.setRenderTarget(this.rt); renderer.clear(); draw();
    renderer.setRenderTarget(null); renderer.clear(); renderer.render(this.screen, this.cam);
  }
  dispose() { this.rt.dispose(); this.mat.dispose(); }
}
