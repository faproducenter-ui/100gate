import * as THREE from "three";
import { ChapterDef, randomFrom } from "./content";

export interface MaterialSet {
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
  rug: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  key: THREE.MeshStandardMaterial;
}

function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas textures are unavailable");
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, seed: number, color: string, count: number, alpha = 0.12): void {
  const rand = randomFrom(seed);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const r = 0.4 + rand() * 2.5;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
  ctx.globalAlpha = 1;
}

function makeWoodTexture(base: string, seed: number, planks = false): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const rand = randomFrom(seed);
    const rows = planks ? 8 : 1;
    const rowH = s / rows;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 ? s * 0.31 : 0;
      for (let plank = -1; plank < 3; plank++) {
        const x = plank * (s / 2) + offset;
        const light = Math.floor(rand() * 16);
        ctx.fillStyle = `rgba(${90 + light},${58 + light * 0.45},${34 + light * 0.25},0.13)`;
        ctx.fillRect(x + 2, row * rowH + 2, s / 2 - 4, rowH - 4);
        ctx.strokeStyle = "rgba(8,4,2,0.72)";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, row * rowH, s / 2, rowH);
      }
    }
    for (let i = 0; i < (planks ? 850 : 450); i++) {
      const y = rand() * s;
      const x = rand() * s;
      const len = 12 + rand() * 100;
      ctx.strokeStyle = rand() > 0.5 ? "rgba(15,7,3,0.16)" : "rgba(230,184,124,0.08)";
      ctx.lineWidth = 0.5 + rand();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + len * 0.3, y + rand() * 3, x + len * 0.7, y - rand() * 3, x + len, y);
      ctx.stroke();
    }
    if (planks) {
      for (let row = 0; row < rows; row++) {
        for (let i = 0; i < 5; i++) {
          const x = rand() * s;
          const y = row * rowH + rand() * rowH;
          ctx.fillStyle = "rgba(5,3,2,0.5)";
          ctx.beginPath();
          ctx.ellipse(x, y, 2.5 + rand() * 5, 1 + rand() * 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    speckle(ctx, s, seed + 1, "#090604", 1800, 0.12);
  }, planks ? 2.4 : 1, planks ? 2.8 : 1);
}

function makeWallTexture(chapter: ChapterDef): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = chapter.palette.wall;
    ctx.fillRect(0, 0, s, s);
    const gradient = ctx.createLinearGradient(0, 0, s, s);
    gradient.addColorStop(0, "rgba(255,244,215,0.07)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.03)");
    gradient.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, s, s);
    const rand = randomFrom(400 + chapter.id);
    for (let i = 0; i < 65; i++) {
      const x = rand() * s;
      const y = rand() * s;
      const r = 8 + rand() * 45;
      const stain = ctx.createRadialGradient(x, y, 0, x, y, r);
      stain.addColorStop(0, `rgba(22,18,12,${0.03 + rand() * 0.1})`);
      stain.addColorStop(1, "rgba(22,18,12,0)");
      ctx.fillStyle = stain;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (["manor", "hotel", "orphanage", "theatre", "void"].includes(chapter.propStyle)) {
      ctx.strokeStyle = "rgba(225,211,167,0.09)";
      ctx.lineWidth = 2;
      for (let y = 32; y < s; y += 64) {
        for (let x = 32; x < s; x += 64) {
          ctx.beginPath();
          ctx.moveTo(x, y - 17);
          ctx.bezierCurveTo(x + 18, y - 5, x + 18, y + 5, x, y + 20);
          ctx.bezierCurveTo(x - 18, y + 5, x - 18, y - 5, x, y - 17);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y + 2, 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else {
      ctx.strokeStyle = "rgba(230,240,230,0.05)";
      for (let x = 0; x < s; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke();
      }
    }
    for (let i = 0; i < 14; i++) {
      let x = rand() * s;
      let y = rand() * s;
      ctx.strokeStyle = "rgba(18,14,11,0.28)";
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (rand() - 0.5) * 13; y += 6 + rand() * 14; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    speckle(ctx, s, 900 + chapter.id, "#100c09", 2400, 0.13);
  }, 2.4, 1.1);
}

function makeRugTexture(chapter: ChapterDef): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = chapter.id % 2 ? "#273c3b" : "#512b2a";
    ctx.fillRect(0, 0, s, s);
    for (let inset = 10; inset < 70; inset += 12) {
      ctx.strokeStyle = inset % 24 ? chapter.palette.accent : "#221914";
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 5;
      ctx.strokeRect(inset, inset, s - inset * 2, s - inset * 2);
    }
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = chapter.palette.accent;
    ctx.lineWidth = 3;
    for (let x = 90; x < s - 60; x += 70) {
      for (let y = 90; y < s - 60; y += 70) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-17, -17, 34, 34); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    speckle(ctx, s, 777 + chapter.id, "#d6c9a2", 2600, 0.08);
  });
}

export function createMaterials(chapter: ChapterDef): MaterialSet {
  const floorMap = makeWoodTexture(chapter.palette.wood, 110 + chapter.id, true);
  const woodMap = makeWoodTexture(chapter.palette.wood, 220 + chapter.id);
  const wallMap = makeWallTexture(chapter);
  const rugMap = makeRugTexture(chapter);
  const set: MaterialSet = {
    floor: new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.72, metalness: 0.03, bumpMap: floorMap, bumpScale: 0.025 }),
    wall: new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.94, bumpMap: wallMap, bumpScale: 0.018 }),
    wood: new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.64, metalness: 0.02, bumpMap: woodMap, bumpScale: 0.02 }),
    darkWood: new THREE.MeshStandardMaterial({ map: woodMap, color: 0x6b625b, roughness: 0.77 }),
    trim: new THREE.MeshStandardMaterial({ map: woodMap, color: 0x8c8175, roughness: 0.68 }),
    metal: new THREE.MeshStandardMaterial({ color: chapter.propStyle === "medical" ? 0x8c9997 : 0x343b3c, roughness: 0.43, metalness: 0.76 }),
    brass: new THREE.MeshStandardMaterial({ color: 0x9b7541, roughness: 0.32, metalness: 0.82 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xd5c6a4, roughness: 0.96, side: THREE.DoubleSide }),
    fabric: new THREE.MeshStandardMaterial({ color: chapter.id % 2 ? 0x354c48 : 0x533434, roughness: 1 }),
    rug: new THREE.MeshStandardMaterial({ map: rugMap, roughness: 1 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x6c675d, roughness: 0.96 }),
    black: new THREE.MeshStandardMaterial({ color: 0x090a09, roughness: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x91a9ad, roughness: 0.15, transmission: 0.25, transparent: true, opacity: 0.46 }),
    key: new THREE.MeshStandardMaterial({ color: 0xc6a45c, metalness: 0.9, roughness: 0.24, emissive: 0x2b1b05, emissiveIntensity: 0.4 }),
  };
  for (const material of Object.values(set)) material.userData.shared = true;
  return set;
}

export function disposeMaterials(materials: MaterialSet): void {
  const textures = new Set<THREE.Texture>();
  for (const material of Object.values(materials)) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  textures.forEach((texture) => texture.dispose());
}
