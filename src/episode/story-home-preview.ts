import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STORY_SECONDS, StoryIntroFlow } from './story-intro-flow';

// The apartment set is editable and still in outputs, not in the release.
const setUrl = '/outputs/story-intro/home/story-home.glb';
const ease = T.MathUtils.smoothstep;
const eye = (x: number, z: number) => new T.Vector3(x, 1.64, z);
const mid = eye(.5, -1.14), threshold = eye(1.79, -1.17), outside = eye(3.58, -1.18);

function disposeSet(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
  const textures = new Set<T.Texture>(), bitmaps = new Set<ImageBitmap>();
  root.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) {
    for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value);
    m.dispose();
  }
  for (const t of textures) {
    if (typeof ImageBitmap !== 'undefined' && t.image instanceof ImageBitmap) bitmaps.add(t.image);
    t.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
}

/** A development-only view of the real Blender set, not a replacement intro. */
export class StoryHomePreview {
  private readonly scene = new T.Scene();
  private readonly camera = new T.PerspectiveCamera(61, 1, .045, 28);
  private readonly flow = new StoryIntroFlow();
  private readonly door: T.Object3D;
  private readonly opening: number;
  private readonly restRotation: number;
  private readonly dialogue: T.PerspectiveCamera;
  private readonly alexei: T.Vector3;
  private readonly light: T.SpotLight;

  static async load() {
    const asset = await new GLTFLoader().loadAsync(setUrl);
    try { return new StoryHomePreview(asset.scene); }
    catch (error) { disposeSet(asset.scene); throw error; }
  }

  private constructor(private readonly set: T.Group) {
    const find = (name: string) => {
      const node = set.getObjectByName('StoryHome_' + name);
      if (!node) throw new Error('Story apartment missing ' + name);
      return node;
    };
    this.door = find('DoorHinge');
    if (find('DoorLeaf').parent !== this.door) throw new Error('Story apartment door is not parented to its hinge');
    const opening: unknown = this.door.userData.opensByRadiansLocalZ;
    if (typeof opening !== 'number' || !Number.isFinite(opening) || opening < 1.3 || opening > 1.57) {
      throw new Error('Story apartment has an invalid hinge opening');
    }
    this.opening = opening;
    this.restRotation = this.door.rotation.y;
    const dialogue = find('Dialogue');
    if (!(dialogue instanceof T.PerspectiveCamera)) throw new Error('Story apartment needs its authored dialogue camera');
    this.dialogue = dialogue;
    this.alexei = find('Alexei').getWorldPosition(new T.Vector3());
    this.alexei.y += 1.64;
    find('Partner'); find('Entry');
    set.traverse(o => {
      if (o instanceof T.Mesh) {
        o.receiveShadow = true;
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        o.castShadow = materials.every(m => !m.transparent);
      }
    });
    this.scene.background = new T.Color(0x151927);
    this.scene.add(set, new T.HemisphereLight(0xc9cddd, 0x664332, .43));
    this.light = new T.SpotLight(0xffba76, 15, 8, 1.08, .88, 2);
    this.light.position.set(-2.33, 1.45, -1.80);
    this.light.target.position.set(-.7, .25, -.75);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.normalBias = .017;
    this.scene.add(this.light, this.light.target);
    const point = (color: number, power: number, pos: [number, number, number]) => {
      const light = new T.PointLight(color, power, 6, 2);
      light.position.set(...pos);
      this.scene.add(light);
    };
    point(0xa4b9e8, 3, [-.08, 1.65, -2.03]);
    point(0xffbb74, 5, [-2.34, 1.49, -1.82]);
    point(0xffdfbb, 5, [.78, 2.55, .92]);
    point(0xdce6ff, 3, [3.7, 2.32, -1.16]);
  }

  restart() { this.flow.restore(undefined); }
  snapshot() {
    const { beat, seconds } = this.flow.snapshot();
    return { beat, seconds, ended: beat === 'STORE_TRANSIT', door: this.door.rotation.y - this.restRotation };
  }
  advance(dt: number) {
    const { beat, seconds } = this.flow.checkpoint();
    // Stop at the boundary of the content that's actually authored here.
    if (beat === 'DIALOGUE') this.flow.advance(Math.min(dt, STORY_SECONDS.DIALOGUE - seconds + STORY_SECONDS.HOME_EXIT));
    if (beat === 'HOME_EXIT') this.flow.advance(Math.min(dt, STORY_SECONDS.HOME_EXIT - seconds));
  }
  render(renderer: T.WebGLRenderer, aspect: number) {
    const { beat, seconds, ended } = this.snapshot();
    const time = ended ? STORY_SECONDS.HOME_EXIT : seconds;
    const dialogue = beat === 'DIALOGUE';
    this.door.rotation.y = this.restRotation + (dialogue ? 0 : this.opening * ease(time, 2.5, 3.65));
    this.camera.aspect = aspect;
    this.camera.fov = dialogue ? this.dialogue.fov : 61;
    this.camera.updateProjectionMatrix();
    if (dialogue) {
      this.dialogue.getWorldPosition(this.camera.position);
      this.dialogue.getWorldQuaternion(this.camera.quaternion);
    } else {
      const approach = ease(time, 0, 2.5);
      if (approach < .54) this.camera.position.lerpVectors(this.alexei, mid, approach / .54);
      else if (time < 2.5) this.camera.position.lerpVectors(mid, threshold, (approach - .54) / .46);
      else this.camera.position.lerpVectors(threshold, outside, ease(time, 3.65, 5));
      this.camera.lookAt(this.camera.position.x + 1, this.camera.position.y - .33, -1.18);
    }
    renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.light.shadow.dispose();
    disposeSet(this.set);
    this.scene.clear();
  }
}
