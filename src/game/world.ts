import * as THREE from "three";
import { CONTAINER_NAMES, LevelDef, randomFrom } from "./content";
import { MaterialSet } from "./materials";

export type AssetRoot = THREE.Group & {
  setState?: (name: string) => AssetRoot | Promise<AssetRoot>;
  dispose?: () => Promise<void>;
};

export type InteractionKind = "container" | "note" | "door" | "painting" | "safe" | "fusebox" | "hide";

export interface Interactable {
  id: string;
  kind: InteractionKind;
  object: THREE.Object3D;
  position: THREE.Vector3;
  prompt: string;
  containerIndex?: number;
  noteIndex?: number;
  used: boolean;
}

export interface Collider { minX: number; maxX: number; minZ: number; maxZ: number }

export interface BuiltWorld {
  group: THREE.Group;
  interactables: Interactable[];
  colliders: Collider[];
  enemy: THREE.Group;
  enemyHead: THREE.Object3D;
  dust: THREE.Points;
  doorAsset?: AssetRoot;
  doorPlacement?: THREE.Group;
  lampLight: THREE.PointLight;
  mainLight: THREE.SpotLight;
  patrol: THREE.Vector3[];
  spawn: THREE.Vector3;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
const PAPER = new THREE.PlaneGeometry(0.38, 0.52);

function box(
  parent: THREE.Object3D,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  name = "",
): THREE.Mesh {
  const mesh = new THREE.Mesh(BOX, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, radius: number, height: number): THREE.Mesh {
  const mesh = new THREE.Mesh(CYLINDER, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(radius * 2, height, radius * 2);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function collider(colliders: Collider[], x: number, z: number, sx: number, sz: number): void {
  colliders.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 });
}

function normalizeAsset(root: AssetRoot, targetHeight: number): THREE.Group {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = targetHeight / Math.max(size.y, 0.01);
  const placement = new THREE.Group();
  placement.userData.reusedAsset = true;
  placement.add(root);
  placement.scale.setScalar(scale);
  placement.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  return placement;
}

function addTable(group: THREE.Group, mat: MaterialSet, x: number, z: number, width = 2.1, depth = 1.05): THREE.Group {
  const table = new THREE.Group();
  table.position.set(x, 0, z);
  group.add(table);
  box(table, mat.wood, 0, 0.88, 0, width, 0.12, depth);
  box(table, mat.darkWood, 0, 0.72, 0, width * 0.92, 0.25, depth * 0.9);
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) {
    box(table, mat.wood, lx * (width / 2 - 0.13), 0.42, lz * (depth / 2 - 0.12), 0.13, 0.84, 0.13);
  }
  for (const dx of [-0.52, 0, 0.52]) {
    box(table, mat.wood, dx, 0.73, depth * 0.47, 0.48, 0.19, 0.045, "drawer");
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat.brass);
    knob.position.set(dx, 0.73, depth * 0.51);
    table.add(knob);
  }
  return table;
}

function addDresser(group: THREE.Group, mat: MaterialSet, x: number, z: number, rotation = 0): THREE.Group {
  const dresser = new THREE.Group();
  dresser.position.set(x, 0, z);
  dresser.rotation.y = rotation;
  group.add(dresser);
  box(dresser, mat.wood, 0, 0.65, 0, 1.5, 1.3, 0.65);
  box(dresser, mat.trim, 0, 1.34, 0, 1.6, 0.09, 0.72);
  for (let i = 0; i < 4; i++) {
    box(dresser, mat.darkWood, 0, 0.28 + i * 0.29, 0.337, 1.3, 0.23, 0.045, "drawer");
    box(dresser, mat.brass, 0, 0.28 + i * 0.29, 0.375, 0.25, 0.035, 0.035);
  }
  return dresser;
}

function addCabinet(group: THREE.Group, mat: MaterialSet, x: number, z: number, rotation = 0, wardrobe = false): THREE.Group {
  const cabinet = new THREE.Group();
  cabinet.position.set(x, 0, z);
  cabinet.rotation.y = rotation;
  group.add(cabinet);
  const h = wardrobe ? 2.55 : 1.85;
  box(cabinet, mat.darkWood, 0, h / 2, 0, 1.35, h, 0.72);
  box(cabinet, mat.trim, 0, h + 0.06, 0, 1.48, 0.12, 0.82);
  for (const side of [-1, 1]) {
    box(cabinet, mat.wood, side * 0.33, h / 2, 0.38, 0.61, h - 0.2, 0.05, wardrobe ? "wardrobe-door" : "drawer");
    box(cabinet, mat.brass, side * 0.09, h / 2, 0.425, 0.035, 0.16, 0.035);
  }
  return cabinet;
}

function addTrunk(group: THREE.Group, mat: MaterialSet, x: number, z: number): THREE.Group {
  const trunk = new THREE.Group();
  trunk.position.set(x, 0, z);
  group.add(trunk);
  box(trunk, mat.darkWood, 0, 0.34, 0, 1.25, 0.65, 0.75);
  box(trunk, mat.wood, 0, 0.69, 0, 1.28, 0.12, 0.78, "drawer");
  for (const sx of [-0.43, 0.43]) box(trunk, mat.metal, sx, 0.4, 0.39, 0.09, 0.72, 0.035);
  box(trunk, mat.brass, 0, 0.42, 0.42, 0.18, 0.2, 0.04);
  return trunk;
}

function addBookshelf(group: THREE.Group, mat: MaterialSet, x: number, z: number, rotation: number, rand: () => number): void {
  const shelf = new THREE.Group();
  shelf.position.set(x, 0, z);
  shelf.rotation.y = rotation;
  group.add(shelf);
  box(shelf, mat.darkWood, 0, 1.25, 0, 2.25, 2.5, 0.42);
  for (const xSide of [-1.08, 1.08]) box(shelf, mat.trim, xSide, 1.3, 0.16, 0.12, 2.65, 0.58);
  const bookMaterials = [mat.fabric, mat.paper, mat.darkWood, mat.rug];
  for (let row = 0; row < 5; row++) {
    box(shelf, mat.wood, 0, 0.18 + row * 0.5, 0.2, 2.2, 0.08, 0.57);
    let bx = -0.96;
    for (let b = 0; b < 11; b++) {
      const w = 0.09 + rand() * 0.07;
      const h = 0.28 + rand() * 0.12;
      const book = box(shelf, bookMaterials[Math.floor(rand() * bookMaterials.length)], bx, 0.25 + row * 0.5 + h / 2, 0.48, w, h, 0.18);
      book.rotation.z = (rand() - 0.5) * 0.12;
      bx += w + 0.045;
    }
  }
}

function addBed(group: THREE.Group, mat: MaterialSet, x: number, z: number, rotation = 0): void {
  const bed = new THREE.Group();
  bed.position.set(x, 0, z);
  bed.rotation.y = rotation;
  group.add(bed);
  box(bed, mat.metal, 0, 0.35, 0, 1.65, 0.16, 2.2);
  box(bed, mat.fabric, 0, 0.54, 0, 1.55, 0.25, 2.05);
  box(bed, mat.paper, 0, 0.72, -0.72, 1.25, 0.18, 0.48);
  for (const bx of [-0.78, 0.78]) {
    box(bed, mat.metal, bx, 0.75, -1.03, 0.06, 1.5, 0.06);
    box(bed, mat.metal, bx, 0.52, 1.03, 0.06, 1.05, 0.06);
  }
  box(bed, mat.metal, 0, 1.25, -1.03, 1.6, 0.06, 0.06);
}

function addPainting(group: THREE.Group, mat: MaterialSet, chapterId: number): THREE.Group {
  const painting = new THREE.Group();
  painting.position.set(-7.76, 1.85, -2.5);
  painting.rotation.y = Math.PI / 2;
  group.add(painting);
  box(painting, mat.brass, 0, 0, 0, 1.3, 1.55, 0.09);
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 320;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, chapterId % 2 ? "#283b40" : "#49362c");
  gradient.addColorStop(1, "#0b0c0d");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = "rgba(197,183,154,0.65)";
  ctx.beginPath(); ctx.ellipse(128, 112, 39, 52, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#151517";
  ctx.beginPath(); ctx.moveTo(58, 290); ctx.quadraticCurveTo(128, 140, 198, 290); ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(104, 103, 13, 5); ctx.fillRect(142, 103, 13, 5);
  speckleCanvas(ctx, 256, 320, chapterId);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const portrait = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.4), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
  portrait.position.z = 0.051;
  painting.add(portrait);
  return painting;
}

function speckleCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const rand = randomFrom(seed + 33);
  ctx.fillStyle = "rgba(220,210,180,0.08)";
  for (let i = 0; i < 900; i++) ctx.fillRect(rand() * w, rand() * h, 1, 1);
}

function addWindow(group: THREE.Group, mat: MaterialSet): void {
  const windowGroup = new THREE.Group();
  windowGroup.position.set(7.78, 2.05, 2.2);
  windowGroup.rotation.y = -Math.PI / 2;
  group.add(windowGroup);
  box(windowGroup, mat.trim, 0, 0, 0, 2.3, 2.25, 0.12);
  const moon = new THREE.MeshBasicMaterial({ color: 0x7795a4 });
  box(windowGroup, moon, 0, 0, 0.07, 2.02, 1.96, 0.03);
  box(windowGroup, mat.black, 0, 0, 0.1, 0.08, 2.02, 0.05);
  box(windowGroup, mat.black, 0, 0, 0.1, 2.02, 0.08, 0.05);
  for (const side of [-1, 1]) {
    const curtain = box(windowGroup, mat.fabric, side * 1.3, -0.05, 0.22, 0.55, 2.6, 0.16);
    curtain.rotation.z = side * 0.05;
  }
}

function addSconce(group: THREE.Group, mat: MaterialSet, x: number, z: number, color: string): void {
  const side = Math.sign(x);
  const sconce = new THREE.Group();
  sconce.position.set(x, 2.05, z);
  group.add(sconce);
  box(sconce, mat.brass, 0, 0, 0, 0.08, 0.42, 0.26);
  const arm = cylinder(sconce, mat.brass, -side * 0.16, -0.05, 0, 0.025, 0.34);
  arm.rotation.z = Math.PI / 2;
  const glow = new THREE.MeshStandardMaterial({ color: 0xffd7a3, emissive: 0xff9a45, emissiveIntensity: 2.1 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), glow);
  bulb.position.set(-side * 0.32, 0.14, 0); sconce.add(bulb);
  const light = new THREE.PointLight(new THREE.Color(color), 8.5, 7.5, 1.8);
  light.position.set(-side * 0.4, 0.12, 0); sconce.add(light);
}

function addThemeProps(group: THREE.Group, mat: MaterialSet, level: LevelDef, colliders: Collider[], rand: () => number): void {
  const style = level.chapter.propStyle;
  addSconce(group, mat, -7.68, -5.5, level.chapter.palette.light);
  addSconce(group, mat, 7.68, 5.0, level.chapter.palette.light);
  if (style === "school") {
    const board = box(group, mat.black, 0, 1.85, 8.72, 4.8, 1.65, 0.08);
    board.material = new THREE.MeshStandardMaterial({ color: 0x18342b, roughness: 0.95 });
    box(group, mat.trim, 0, 1.85, 8.78, 5.0, 1.83, 0.06);
    for (const x of [-4.7, 3.8]) {
      addTable(group, mat, x, 6.9, 1.5, 0.72);
      collider(colliders, x, 6.9, 1.6, 0.82);
    }
  } else if (style === "medical") {
    for (const x of [-6.5, -5.9]) {
      cylinder(group, mat.metal, x, 0.9, -6.8, 0.025, 1.8);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 6, 12, Math.PI), mat.metal);
      hook.position.set(x, 1.82, -6.8); group.add(hook);
      box(group, mat.glass, x + 0.09, 1.55, -6.8, 0.14, 0.28, 0.06);
    }
    box(group, mat.metal, 0, 1.03, 8.75, 15.4, 0.07, 0.08);
  } else if (style === "bunker") {
    for (const x of [-6.8, -6.35]) {
      const pipe = cylinder(group, mat.metal, x, 3.05, 0, 0.09, 17.5);
      pipe.rotation.x = Math.PI / 2;
    }
    for (let z = -7; z <= 7; z += 2.8) {
      const valve = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 7, 16), mat.brass);
      valve.position.set(-6.35, 2.85, z); valve.rotation.y = Math.PI / 2; group.add(valve);
    }
  } else if (style === "archive") {
    addBookshelf(group, mat, 2.8, 8.25, Math.PI, rand);
    collider(colliders, 2.8, 8.1, 2.4, 0.75);
    for (let i = 0; i < 6; i++) box(group, mat.paper, -6.7 + (i % 2) * 0.65, 0.22 + Math.floor(i / 2) * 0.38, -6.8, 0.55, 0.32, 0.7);
  } else if (style === "theatre") {
    box(group, mat.darkWood, 0, 0.16, 7.75, 8.5, 0.3, 2.0);
    for (const x of [-4.3, 4.3]) {
      const curtain = box(group, mat.fabric, x, 1.85, 8.15, 1.3, 3.5, 0.3);
      curtain.rotation.z = Math.sign(x) * 0.06;
    }
    box(group, mat.brass, 0, 3.35, 8.2, 9.4, 0.18, 0.25);
  } else if (style === "laboratory") {
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x1b4f5b, emissive: 0x1c8294, emissiveIntensity: 1.25, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
      box(group, mat.metal, -6.9, 1.05 + i * 0.48, 6.7, 0.65, 0.4, 0.65);
      box(group, screenMat, -6.54, 1.05 + i * 0.48, 6.7, 0.035, 0.27, 0.45);
    }
    for (const z of [-6.7, -5.7]) box(group, mat.glass, 6.9, 1.6, z, 0.09, 2.8, 0.75);
  } else if (style === "orphanage") {
    for (let i = 0; i < 7; i++) {
      const drawing = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.3), mat.paper);
      drawing.position.set(-3 + i, 1.65 + (i % 2) * 0.35, 8.88);
      drawing.rotation.y = Math.PI;
      drawing.rotation.z = (rand() - 0.5) * 0.25;
      group.add(drawing);
      box(group, i % 2 ? mat.fabric : mat.black, drawing.position.x, drawing.position.y, 8.86, 0.15, 0.025, 0.015);
    }
  } else if (style === "hotel") {
    for (let i = 0; i < 3; i++) {
      const luggage = new THREE.Group(); luggage.position.set(-6.6 + i * 0.65, 0, -6.6); group.add(luggage);
      box(luggage, i % 2 ? mat.fabric : mat.darkWood, 0, 0.35, 0, 0.52, 0.7, 0.35);
      box(luggage, mat.brass, 0, 0.76, 0, 0.2, 0.09, 0.06);
    }
  } else if (style === "void") {
    const glow = new THREE.MeshStandardMaterial({ color: 0x67547e, emissive: 0x493465, emissiveIntensity: 0.8 });
    for (let i = 0; i < 8; i++) {
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.2 + rand() * 0.25, 0.015, 6, 4), glow);
      frame.position.set((rand() - 0.5) * 12, 0.8 + rand() * 2.2, (rand() - 0.5) * 13);
      frame.rotation.set(rand() * 2, rand() * 2, rand() * 2); group.add(frame);
    }
  } else {
    for (const x of [-1.1, 1.1]) {
      cylinder(group, mat.brass, x, 1.02, 8.4, 0.055, 0.7);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb25c }));
      flame.scale.y = 1.7; flame.position.set(x, 1.42, 8.4); group.add(flame);
    }
  }
}

function createEnemy(group: THREE.Group, mat: MaterialSet): { enemy: THREE.Group; head: THREE.Object3D } {
  const enemy = new THREE.Group();
  const coatMat = new THREE.MeshStandardMaterial({ color: 0x101515, roughness: 0.92 });
  const maskMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a0, roughness: 0.58 });
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.58, 1.65, 12), coatMat);
  coat.position.y = 0.9; coat.castShadow = true; enemy.add(coat);
  const shoulders = box(enemy, coatMat, 0, 1.53, 0, 0.95, 0.22, 0.35);
  shoulders.rotation.z = 0.03;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), maskMat);
  head.scale.set(0.78, 1.22, 0.5); head.position.set(0, 1.9, -0.03); enemy.add(head);
  for (const x of [-0.075, 0.075]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat.black);
    eye.position.set(x, 1.94, -0.135); enemy.add(eye);
  }
  for (const side of [-1, 1]) {
    const arm = cylinder(enemy, coatMat, side * 0.42, 1.02, 0, 0.085, 1.25);
    arm.rotation.z = side * -0.11;
  }
  group.add(enemy);
  return { enemy, head };
}

function addDust(group: THREE.Group, seed: number): THREE.Points {
  const rand = randomFrom(seed + 500);
  const positions = new Float32Array(240 * 3);
  for (let i = 0; i < 240; i++) {
    positions[i * 3] = (rand() - 0.5) * 15;
    positions[i * 3 + 1] = 0.2 + rand() * 3.1;
    positions[i * 3 + 2] = (rand() - 0.5) * 17;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xd8c8a4, size: 0.018, transparent: true, opacity: 0.38, depthWrite: false });
  const dust = new THREE.Points(geometry, material);
  group.add(dust);
  return dust;
}

export function buildWorld(
  scene: THREE.Scene,
  level: LevelDef,
  mat: MaterialSet,
  doorAsset?: AssetRoot,
  lampAsset?: AssetRoot,
  watcherAsset?: AssetRoot,
): BuiltWorld {
  const group = new THREE.Group();
  scene.add(group);
  const interactables: Interactable[] = [];
  const colliders: Collider[] = [];
  const rand = randomFrom(level.seed);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 18), mat.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(16, 18), mat.ceiling);
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 3.6; ceiling.receiveShadow = true; group.add(ceiling);
  box(group, mat.wall, -8, 1.8, 0, 0.2, 3.6, 18);
  box(group, mat.wall, 8, 1.8, 0, 0.2, 3.6, 18);
  box(group, mat.wall, 0, 1.8, 9, 16, 3.6, 0.2);
  box(group, mat.wall, -4.65, 1.8, -9, 6.7, 3.6, 0.2);
  box(group, mat.wall, 4.65, 1.8, -9, 6.7, 3.6, 0.2);
  box(group, mat.wall, 0, 3.12, -9, 2.6, 0.96, 0.2);
  for (const z of [-8.86, 8.86]) {
    box(group, mat.trim, 0, 0.47, z, 15.8, 0.82, 0.12);
    box(group, mat.wood, 0, 0.94, z, 15.8, 0.09, 0.18);
    box(group, mat.trim, 0, 3.43, z, 15.8, 0.18, 0.18);
  }
  for (const x of [-7.86, 7.86]) {
    box(group, mat.trim, x, 0.47, 0, 0.12, 0.82, 17.8);
    box(group, mat.wood, x, 0.94, 0, 0.18, 0.09, 17.8);
    box(group, mat.trim, x, 3.43, 0, 0.18, 0.18, 17.8);
  }
  for (let x = -6; x <= 6; x += 3) box(group, mat.darkWood, x, 3.49, 0, 0.12, 0.16, 17.8);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 5.8), mat.rug);
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.012, 0.5); rug.receiveShadow = true; group.add(rug);
  addWindow(group, mat);
  addThemeProps(group, mat, level, colliders, rand);

  let doorPlacement: THREE.Group | undefined;
  if (doorAsset) {
    doorAsset.setState?.("closed");
    doorPlacement = normalizeAsset(doorAsset, 2.5);
    doorPlacement.position.z += -8.77;
    group.add(doorPlacement);
  } else {
    const fallback = new THREE.Group(); fallback.position.set(0, 0, -8.82); group.add(fallback);
    box(fallback, mat.wood, 0, 1.2, 0, 1.25, 2.4, 0.12);
    box(fallback, mat.brass, 0.43, 1.15, 0.1, 0.09, 0.09, 0.09);
  }
  interactables.push({ id: "exit", kind: "door", object: doorPlacement ?? group, position: new THREE.Vector3(0, 1.2, -8.25), prompt: "Открыть дверь", used: false });

  const desk = addTable(group, mat, -3.6, -3.25);
  collider(colliders, -3.6, -3.25, 2.25, 1.2);
  const cabinet = addCabinet(group, mat, 4.8, -4.8, Math.PI);
  collider(colliders, 4.8, -4.8, 1.6, 1.0);
  const dresser = addDresser(group, mat, -5.4, 4.8, 0);
  collider(colliders, -5.4, 4.8, 1.7, 0.9);
  const shelf = addCabinet(group, mat, 5.6, 1.0, -Math.PI / 2);
  collider(colliders, 5.6, 1.0, 1.0, 1.6);
  const trunk = addTrunk(group, mat, 0.8, 3.3);
  collider(colliders, 0.8, 3.3, 1.4, 0.9);
  const nightstand = addDresser(group, mat, 3.9, 5.9, Math.PI);
  nightstand.scale.setScalar(0.72);
  collider(colliders, 3.9, 5.9, 1.2, 0.8);

  const containers = [desk, nightstand, dresser, shelf, trunk, cabinet];
  const containerPositions = [
    new THREE.Vector3(-3.6, 0.9, -2.55),
    new THREE.Vector3(3.9, 0.85, 5.4),
    new THREE.Vector3(-5.4, 0.9, 4.35),
    new THREE.Vector3(5.1, 1.1, 1.0),
    new THREE.Vector3(0.8, 0.65, 2.75),
    new THREE.Vector3(4.8, 1.1, -4.25),
  ];
  containers.forEach((object, index) => {
    interactables.push({ id: `container-${index}`, kind: "container", object, position: containerPositions[index], prompt: `Обыскать: ${CONTAINER_NAMES[index]}`, containerIndex: index, used: false });
  });

  addBookshelf(group, mat, -7.45, 1.0, Math.PI / 2, rand);
  collider(colliders, -7.35, 1.0, 0.7, 2.4);
  if (["medical", "orphanage", "manor", "hotel"].includes(level.chapter.propStyle)) {
    addBed(group, mat, 5.8, 6.4, Math.PI / 2);
    collider(colliders, 5.8, 6.4, 2.3, 1.8);
  } else {
    addTable(group, mat, -1.6, 6.6, 1.8, 0.8);
    collider(colliders, -1.6, 6.6, 1.9, 0.9);
  }

  const wardrobe = addCabinet(group, mat, 7.15, -0.9, -Math.PI / 2, true);
  collider(colliders, 7.15, -0.9, 0.9, 1.5);
  interactables.push({ id: "hide", kind: "hide", object: wardrobe, position: new THREE.Vector3(6.5, 1.3, -0.9), prompt: "Спрятаться в шкафу", used: false });

  const note1 = new THREE.Mesh(PAPER, mat.paper);
  note1.rotation.x = -Math.PI / 2; note1.rotation.z = -0.15; note1.position.set(-3.05, 0.955, -3.1); group.add(note1);
  const ink = box(group, mat.black, -3.05, 0.958, -3.1, 0.21, 0.003, 0.015);
  ink.rotation.y = -0.15;
  interactables.push({ id: "note-0", kind: "note", object: note1, position: note1.position.clone(), prompt: "Читать документ", noteIndex: 0, used: false });
  const note2 = new THREE.Mesh(PAPER, mat.paper);
  note2.rotation.x = -Math.PI / 2; note2.rotation.z = 0.32; note2.position.set(0.5, 0.765, 3.15); group.add(note2);
  interactables.push({ id: "note-1", kind: "note", object: note2, position: note2.position.clone(), prompt: "Читать вторую записку", noteIndex: 1, used: false });

  const painting = addPainting(group, mat, level.chapter.id);
  if (level.puzzle === "safe") {
    interactables.push({ id: "painting", kind: "painting", object: painting, position: new THREE.Vector3(-7.35, 1.8, -2.5), prompt: "Осмотреть портрет", used: false });
    const safe = new THREE.Group(); safe.position.set(-7.68, 1.25, -2.5); safe.rotation.y = Math.PI / 2; group.add(safe);
    box(safe, mat.metal, 0, 0, 0, 0.8, 0.85, 0.18);
    box(safe, mat.black, 0.15, 0, 0.11, 0.23, 0.3, 0.04);
    for (let i = 0; i < 3; i++) box(safe, mat.brass, -0.18, 0.18 - i * 0.17, 0.12, 0.1, 0.08, 0.04);
    safe.visible = false;
    interactables.push({ id: "safe", kind: "safe", object: safe, position: new THREE.Vector3(-7.25, 1.25, -2.5), prompt: "Ввести код сейфа", used: false });
  }

  const fusebox = new THREE.Group(); fusebox.position.set(7.75, 1.45, -5.8); fusebox.rotation.y = -Math.PI / 2; group.add(fusebox);
  box(fusebox, mat.metal, 0, 0, 0, 0.75, 1.0, 0.18);
  for (let i = 0; i < 3; i++) box(fusebox, i === 0 ? mat.brass : mat.black, -0.2 + i * 0.2, 0.1, 0.12, 0.09, 0.35, 0.05);
  if (level.puzzle === "power") interactables.push({ id: "fusebox", kind: "fusebox", object: fusebox, position: new THREE.Vector3(7.25, 1.4, -5.8), prompt: "Вставить предохранитель", used: false });

  let lampLight: THREE.PointLight;
  if (lampAsset) {
    const lamp = normalizeAsset(lampAsset.clone(true) as AssetRoot, 0.68);
    lamp.position.add(new THREE.Vector3(-4.05, 0.94, -3.25));
    group.add(lamp);
  } else {
    cylinder(group, mat.brass, -4.05, 1.12, -3.25, 0.08, 0.36);
  }
  lampLight = new THREE.PointLight(new THREE.Color(level.chapter.palette.light), 16, 8, 2);
  lampLight.position.set(-4.05, 1.55, -3.25); group.add(lampLight);

  const chandelier = new THREE.Group(); chandelier.position.set(0, 3.15, 0.5); group.add(chandelier);
  cylinder(chandelier, mat.brass, 0, 0.25, 0, 0.035, 0.6);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.035, 8, 24), mat.brass);
  ring.rotation.x = Math.PI / 2; chandelier.add(ring);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd2a1, emissive: 0xff9c4a, emissiveIntensity: 2.4 });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    cylinder(chandelier, mat.brass, Math.cos(a) * 0.7, -0.04, Math.sin(a) * 0.7, 0.025, 0.25);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), bulbMat);
    bulb.position.set(Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.7); chandelier.add(bulb);
  }
  const mainLight = new THREE.SpotLight(new THREE.Color(level.chapter.palette.light), 65, 19, Math.PI / 3.2, 0.62, 1.6);
  mainLight.position.set(0, 3.25, 0.5); mainLight.target.position.set(0, 0, 0.5);
  mainLight.castShadow = true; mainLight.shadow.mapSize.set(1024, 1024); mainLight.shadow.bias = -0.0004;
  group.add(mainLight, mainLight.target);
  const moonLight = new THREE.SpotLight(0x779fbd, 28, 15, Math.PI / 4, 0.8, 1.5);
  moonLight.position.set(7.4, 2.4, 2.2); moonLight.target.position.set(0, 0.4, 1.5); group.add(moonLight, moonLight.target);

  let enemy: THREE.Group;
  let head: THREE.Object3D;
  if (watcherAsset) {
    const watcher = watcherAsset.clone(true) as AssetRoot;
    // Tripo's source mesh faces +X; the AI rotates every enemy with a -Z forward convention.
    watcher.rotation.y = Math.PI / 2;
    enemy = normalizeAsset(watcher, 2.08);
    head = enemy;
    group.add(enemy);
  } else {
    const fallback = createEnemy(group, mat);
    enemy = fallback.enemy; head = fallback.head;
  }
  enemy.position.set(-5.5, 0, -6.4);
  enemy.visible = level.enemy;
  const dust = addDust(group, level.seed);
  const patrol = [
    new THREE.Vector3(-5.5, 0, -6.4),
    new THREE.Vector3(4.2, 0, -6.1),
    new THREE.Vector3(4.0, 0, 3.8),
    new THREE.Vector3(-3.5, 0, 5.7),
    new THREE.Vector3(-4.8, 0, -0.5),
  ];
  return {
    group,
    interactables,
    colliders,
    enemy,
    enemyHead: head,
    dust,
    doorAsset,
    doorPlacement,
    lampLight,
    mainLight,
    patrol,
    spawn: new THREE.Vector3(0, 0, 6.9),
  };
}

export function disposeWorld(scene: THREE.Scene, world: BuiltWorld): void {
  scene.remove(world.group);
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();
  world.group.traverse((object) => {
    let parent: THREE.Object3D | null = object;
    let reused = false;
    while (parent) { if (parent.userData.reusedAsset) { reused = true; break; } parent = parent.parent; }
    if (object instanceof THREE.Points) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
    if (!(object instanceof THREE.Mesh) || reused) return;
    if (object.geometry !== BOX && object.geometry !== CYLINDER && object.geometry !== PAPER) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.userData.shared || disposedMaterials.has(material)) continue;
      disposedMaterials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !disposedTextures.has(value)) { disposedTextures.add(value); value.dispose(); }
      }
      material.dispose();
    }
  });
}
