import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GameLoop } from "./engine";
import { Input } from "./input";
import { AudioSystem } from "./audio";
import { storage } from "./storage";
import { CHAPTERS, getLevel, randomFrom, StoryDocument, TOTAL_LEVELS } from "./content";
import { createMaterials, disposeMaterials, MaterialSet } from "./materials";
import { AssetRoot, buildWorld, BuiltWorld, disposeWorld, Interactable } from "./world";
import { DEFAULT_SETTINGS, GameSettings, GameUIState, SaveData } from "./ui-types";

declare global {
  interface Window {
    __gameProbe?: () => { x: number; y: number; z: number };
    __GAME_READY__?: boolean;
    __gameDebug?: () => Record<string, unknown>;
    __gameDebugLoad?: (level: number) => void;
    __gameDebugInteract?: (id: string) => void;
    __gameDebugCatch?: () => void;
    __gameDebugPoseEnemy?: () => void;
  }
}

interface GameCommand { type: string; payload?: unknown }

const DEFAULT_SAVE: SaveData = { currentLevel: 0, maxUnlocked: 0, documents: [] };
const ALL_DOCUMENTS = new Map<string, StoryDocument>();
for (let i = 0; i < TOTAL_LEVELS; i++) for (const doc of getLevel(i).documents) ALL_DOCUMENTS.set(doc.id, doc);

let session: { dispose: () => void } | null = null;

export function startGame(canvas: HTMLCanvasElement): void {
  stopGame();
  void createSession(canvas).then((created) => {
    if (session) created.dispose();
    else session = created;
  }).catch((error) => {
    console.error("Game initialization failed", error);
  });
}

async function createSession(canvas: HTMLCanvasElement): Promise<{ dispose: () => void }> {
  const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.055, 60);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  const hemisphere = new THREE.HemisphereLight(0x8c989b, 0x211b15, 0.88);
  scene.add(hemisphere);
  const entryFill = new THREE.PointLight(0x9aabae, 11, 13, 1.7);
  entryFill.position.set(0, 2.4, 6.2);
  scene.add(entryFill);
  const flashlight = new THREE.SpotLight(0xffe4bc, 32, 15, Math.PI / 7, 0.55, 1.25);
  flashlight.position.set(0.12, -0.08, 0);
  const flashlightTarget = new THREE.Object3D(); flashlightTarget.position.set(0, 0, -1);
  camera.add(flashlight, flashlightTarget); flashlight.target = flashlightTarget;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.5, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const settings: GameSettings = { ...DEFAULT_SETTINGS, ...storage.get<Partial<GameSettings>>("silence.settings", {}) };
  const save: SaveData = { ...DEFAULT_SAVE, ...storage.get<Partial<SaveData>>("silence.save", {}) };
  save.currentLevel = Math.max(0, Math.min(99, save.currentLevel));
  save.maxUnlocked = Math.max(0, Math.min(99, save.maxUnlocked));
  if (!Array.isArray(save.documents)) save.documents = [];

  const input = new Input(canvas);
  input.setScheme(settings.movement);
  input.setSensitivity(settings.sensitivity);
  const audio = new AudioSystem();
  audio.setVolumes(settings);

  let doorAsset: AssetRoot | undefined;
  let lampAsset: AssetRoot | undefined;
  let watcherAsset: AssetRoot | undefined;
  try {
    const doorPath = "/assets/door/asset.mjs";
    const lampPath = "/assets/lamp/asset.mjs";
    const [doorModule, lampModule] = await Promise.all([
      import(/* @vite-ignore */ doorPath) as Promise<{ createAsset: (three: typeof THREE, options: object) => Promise<AssetRoot> }>,
      import(/* @vite-ignore */ lampPath) as Promise<{ createAsset: (three: typeof THREE, options: object) => Promise<AssetRoot> }>,
    ]);
    [doorAsset, lampAsset] = await Promise.all([
      doorModule.createAsset(THREE, { states: "lazy", sharedResources: true }),
      lampModule.createAsset(THREE, { states: "lazy", sharedResources: true }),
    ]);
  } catch {
    // Procedural models remain available if a device cannot decode an optional asset.
  }
  try {
    watcherAsset = (await new GLTFLoader().loadAsync("/assets/watcher.glb")).scene as AssetRoot;
    watcherAsset.traverse((object) => {
      if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
    });
  } catch {
    watcherAsset = undefined;
  }

  const materials = new Map<number, MaterialSet>();
  let world: BuiltWorld | null = null;
  let level = getLevel(save.currentLevel);
  let mode: GameUIState["mode"] = "title";
  let previousMode: GameUIState["mode"] = "title";
  const player = new THREE.Vector3(0, 0, 6.9);
  let yaw = 0;
  let pitch = 0;
  let hasKey = false;
  let hasFuse = false;
  let powered = false;
  let bottles = 0;
  let hidden = false;
  let flashlightOn = true;
  let currentNote: StoryDocument | null = null;
  let interaction: Interactable | null = null;
  let message = "";
  let messageTimer = 0;
  let levelTime = 0;
  let elapsed = 0;
  let uiTimer = 0;
  let stepTimer = 0;
  let enemyWaypoint = 0;
  let enemyState: "patrol" | "chase" | "investigate" = "patrol";
  let noiseTimer = 0;
  let codeError = false;
  const noisePoint = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const targetDirection = new THREE.Vector3();
  const enemyDirection = new THREE.Vector3();
  const proposed = new THREE.Vector3();
  let threat = 0;
  let disposed = false;
  let readySignalled = false;

  function emit(): void {
    const collectedDocuments = save.documents.map((id) => ALL_DOCUMENTS.get(id)).filter((doc): doc is StoryDocument => Boolean(doc));
    const state: GameUIState = {
      mode, previousMode, level: level.index, chapter: level.chapter.id,
      chapterTitle: level.chapter.title, location: level.chapter.location, roomName: level.roomName,
      objective: objectiveText(), interaction: interactionText(), hasKey, hasFuse, bottles, hidden,
      flashlight: flashlightOn, threat, message, note: currentNote, collectedDocuments,
      settings: { ...settings }, save: { ...save, documents: [...save.documents] }, levelTime,
      roomsSolved: save.maxUnlocked, codeError,
    };
    window.dispatchEvent(new CustomEvent<GameUIState>("silence-ui", { detail: state }));
  }

  function objectiveText(): string {
    if (hasKey) return "Ключ найден — откройте дверь на северной стене";
    if (level.puzzle === "power") {
      if (!hasFuse && !powered) return "Найдите предохранитель по подсказке в документе";
      if (!powered) return "Установите предохранитель в электрощит";
      return "Питание восстановлено — найдите ключ";
    }
    if (level.puzzle === "safe") {
      const painting = world?.interactables.find((item) => item.id === "painting");
      if (!painting?.used) return "Осмотрите портрет и найдите код в записке";
      return "Введите код и заберите ключ из сейфа";
    }
    return "Изучите документы и найдите ключ от двери";
  }

  function interactionText(): string {
    if (hidden) return `${keyName(settings.interactKey)} — выйти из шкафа`;
    if (!interaction || mode !== "playing") return "";
    return `${keyName(settings.interactKey)} — ${interaction.used && interaction.kind === "container" ? "Здесь пусто" : interaction.prompt}`;
  }

  function keyName(code: string): string {
    return code.replace("Key", "").replace("Digit", "").replace("Space", "Пробел");
  }

  function notify(text: string, seconds = 2.5): void {
    message = text; messageTimer = seconds; emit();
  }

  function getMaterials(chapterId: number): MaterialSet {
    let mat = materials.get(chapterId);
    if (!mat) { mat = createMaterials(CHAPTERS[chapterId]); materials.set(chapterId, mat); }
    return mat;
  }

  function loadLevel(index: number, nextMode: GameUIState["mode"] = "playing"): void {
    if (world) disposeWorld(scene, world);
    level = getLevel(index);
    save.currentLevel = level.index;
    storage.set("silence.save", save);
    scene.background = new THREE.Color(level.chapter.palette.fog);
    scene.fog = new THREE.FogExp2(level.chapter.palette.fog, 0.026 + level.chapter.id * 0.001);
    world = buildWorld(scene, level, getMaterials(level.chapter.id), doorAsset, lampAsset, watcherAsset);
    player.copy(world.spawn); yaw = 0; pitch = 0;
    hasKey = false; hasFuse = false; powered = false; bottles = 0; hidden = false;
    currentNote = null; interaction = null; levelTime = 0; enemyWaypoint = 0;
    message = ""; messageTimer = 0;
    enemyState = "patrol"; noiseTimer = 0; threat = 0; codeError = false;
    flashlightOn = true; flashlight.visible = true;
    mode = nextMode;
    applyQuality();
    emit();
  }

  function startNew(): void {
    save.currentLevel = 0; save.maxUnlocked = 0; save.documents = [];
    storage.set("silence.save", save);
    loadLevel(0);
    audio.startMusic();
    notify("Найдите документ на столе. Он укажет, где искать ключ.", 4);
  }

  function applyQuality(): void {
    const dpr = settings.quality === "high" ? Math.min(window.devicePixelRatio, 1.65) : settings.quality === "medium" ? Math.min(window.devicePixelRatio, 1.25) : 1;
    renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = settings.quality !== "low";
    bloom.strength = settings.quality === "high" ? 0.22 : settings.quality === "medium" ? 0.12 : 0;
    if (world) {
      world.mainLight.castShadow = settings.quality === "high";
      world.dust.visible = settings.quality !== "low";
    }
    camera.fov = settings.fov; camera.updateProjectionMatrix();
    onResize();
  }

  function applySettings(patch: Partial<GameSettings>): void {
    Object.assign(settings, patch);
    storage.set("silence.settings", settings);
    input.setScheme(settings.movement); input.setSensitivity(settings.sensitivity);
    audio.setVolumes(settings);
    applyQuality(); emit();
  }

  function collectDocument(index: number): void {
    const doc = level.documents[index];
    if (!doc) return;
    currentNote = doc;
    if (!save.documents.includes(doc.id)) {
      save.documents.push(doc.id); storage.set("silence.save", save);
    }
    previousMode = "playing"; mode = "note";
    document.exitPointerLock?.(); audio.sfx("paper"); emit();
  }

  function useContainer(item: Interactable): void {
    if (item.used) { notify("Здесь больше ничего нет."); return; }
    item.used = true;
    const drawer = item.object.getObjectByName("drawer");
    if (drawer) drawer.position.z += 0.12;
    makeNoise(2.8);
    const index = item.containerIndex ?? -1;
    if (level.puzzle === "power" && index === level.fuseContainer && !hasFuse && !powered) {
      hasFuse = true; audio.sfx("pickup"); notify("Найден предохранитель. Установите его в щит на правой стене.", 3.5); return;
    }
    if (index === level.keyContainer && level.puzzle !== "safe") {
      if (level.puzzle === "power" && !powered) {
        item.used = false;
        audio.sfx("locked"); notify("Ящик заблокирован электромагнитом. Нужно восстановить питание.", 3.2); return;
      }
      hasKey = true; audio.sfx("pickup"); notify("Найден ключ от выхода!", 3); return;
    }
    const rand = randomFrom(level.seed + index * 31);
    if (rand() > 0.5 && bottles < 3) {
      bottles++; audio.sfx("pickup"); notify("Найдена стеклянная бутылка. Q — бросить и отвлечь Смотрителя.", 3);
    } else {
      audio.sfx("move"); notify("Пусто. Скрип ящика эхом разнёсся по комнате.");
    }
  }

  function makeNoise(duration: number): void {
    if (!world?.enemy.visible) return;
    noisePoint.copy(player); noiseTimer = Math.max(noiseTimer, duration);
    if (enemyState !== "chase") enemyState = "investigate";
  }

  function interact(item = interaction): void {
    if (mode !== "playing") return;
    if (hidden) { hidden = false; notify("Вы вышли из шкафа."); emit(); return; }
    if (!item) return;
    switch (item.kind) {
      case "note": collectDocument(item.noteIndex ?? 0); break;
      case "container": useContainer(item); break;
      case "painting": {
        if (item.used) { notify("За портретом находится сейф."); break; }
        item.used = true; item.object.rotation.z = -0.3;
        const safe = world?.interactables.find((entry) => entry.id === "safe");
        if (safe) safe.object.visible = true;
        audio.sfx("move"); notify("За портретом обнаружен сейф с кодовым замком.", 3); break;
      }
      case "safe": {
        if (hasKey) { notify("Сейф пуст."); break; }
        previousMode = "playing"; mode = "code"; codeError = false; document.exitPointerLock?.(); emit(); break;
      }
      case "fusebox": {
        if (powered) { notify("Питание уже восстановлено."); break; }
        if (!hasFuse) { audio.sfx("locked"); notify("Не хватает предохранителя. Подсказка есть в документе."); break; }
        hasFuse = false; powered = true; item.used = true;
        if (world) world.lampLight.intensity = 25;
        audio.sfx("fuse"); notify("Питание восстановлено. Электронный замок отключён.", 3); break;
      }
      case "hide": {
        hidden = true; enemyState = "investigate"; noisePoint.copy(player); noiseTimer = 1.5;
        notify("Вы спрятались. Не включайте свет и дождитесь ухода Смотрителя.", 3); break;
      }
      case "door": {
        if (!hasKey) { audio.sfx("locked"); notify("Дверь заперта. Нужен ключ."); break; }
        item.used = true; audio.sfx("door");
        void world?.doorAsset?.setState?.("open");
        save.maxUnlocked = Math.max(save.maxUnlocked, Math.min(99, level.index + 1));
        save.currentLevel = Math.min(99, level.index + 1);
        storage.set("silence.save", save);
        mode = level.index === 99 ? "ending" : "levelComplete";
        document.exitPointerLock?.(); audio.sfx("win"); emit(); break;
      }
    }
    emit();
  }

  function submitCode(code: string): void {
    if (code === level.code) {
      hasKey = true; codeError = false; mode = "playing";
      const safe = world?.interactables.find((item) => item.id === "safe");
      if (safe) safe.used = true;
      audio.sfx("pickup"); notify("Код верный. Вы получили ключ от выхода.", 3);
    } else {
      codeError = true; audio.sfx("locked"); makeNoise(3); emit();
    }
  }

  function throwBottle(): void {
    if (bottles <= 0) { notify("У вас нет бутылок для отвлечения."); return; }
    bottles--;
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    noisePoint.copy(player).addScaledVector(forward, 4.5);
    noiseTimer = 4; enemyState = "investigate";
    audio.sfx("explosion"); notify("Бутылка разбилась. Смотритель идёт на шум."); emit();
  }

  function pause(): void {
    if (mode !== "playing") return;
    previousMode = mode; mode = "paused"; document.exitPointerLock?.(); emit();
  }

  function resume(): void {
    if (["paused", "note", "journal", "code", "settings"].includes(mode)) {
      mode = "playing"; currentNote = null; codeError = false; emit();
    }
  }

  function openSettings(): void { previousMode = mode; mode = "settings"; document.exitPointerLock?.(); emit(); }

  function closeOverlay(): void {
    if (mode === "settings" || mode === "journal" || mode === "note" || mode === "code") {
      if (previousMode === "title" || previousMode === "paused" || previousMode === "levelComplete") mode = previousMode;
      else mode = "playing";
      currentNote = null; codeError = false; emit();
    } else if (mode === "playing") pause();
    else if (mode === "paused") resume();
  }

  function onCommand(event: Event): void {
    const { type, payload } = (event as CustomEvent<GameCommand>).detail;
    switch (type) {
      case "new": startNew(); break;
      case "continue": loadLevel(save.currentLevel); audio.startMusic(); break;
      case "restart": loadLevel(level.index); break;
      case "next": if (level.index < 99) loadLevel(level.index + 1); break;
      case "title": mode = "title"; document.exitPointerLock?.(); emit(); break;
      case "pause": pause(); break;
      case "resume": resume(); break;
      case "settings": openSettings(); break;
      case "close": closeOverlay(); break;
      case "journal": previousMode = mode; mode = "journal"; document.exitPointerLock?.(); emit(); break;
      case "read": {
        const doc = ALL_DOCUMENTS.get(String(payload));
        if (doc) { currentNote = doc; previousMode = "journal"; mode = "note"; emit(); }
        break;
      }
      case "settingsPatch": applySettings(payload as Partial<GameSettings>); break;
      case "submitCode": submitCode(String(payload)); break;
      case "chapterSelect": previousMode = mode; mode = "chapterSelect"; emit(); break;
      case "loadLevel": loadLevel(Number(payload)); audio.startMusic(); break;
    }
  }

  function canStand(x: number, z: number): boolean {
    if (!world || x < -7.52 || x > 7.52 || z < -8.45 || z > 8.45) return false;
    const r = 0.31;
    for (const c of world.colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return false;
    }
    return true;
  }

  function updateInteraction(): void {
    if (!world || mode !== "playing" || hidden) { interaction = null; return; }
    forward.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const item of world.interactables) {
      if (!item.object.visible) continue;
      targetDirection.copy(item.position).sub(camera.position);
      const distance = targetDirection.length();
      if (distance > 2.55 || distance < 0.15) continue;
      targetDirection.multiplyScalar(1 / distance);
      const facing = forward.dot(targetDirection);
      if (facing < 0.64) continue;
      const score = distance - facing * 0.6;
      if (score < bestScore) { best = item; bestScore = score; }
    }
    interaction = best;
  }

  function updateEnemy(dt: number): void {
    if (!world?.enemy.visible || mode !== "playing") { threat = 0; return; }
    const enemy = world.enemy;
    enemyDirection.copy(player).sub(enemy.position); enemyDirection.y = 0;
    const distance = enemyDirection.length();
    const detection = (flashlightOn && !hidden ? 7.2 : 4.1) + level.chapter.id * 0.14;
    if (!hidden && distance < detection) enemyState = "chase";
    else if (enemyState === "chase" && (hidden || distance > detection * 1.65)) {
      enemyState = "investigate"; noisePoint.copy(player); noiseTimer = 2.5;
    }
    if (noiseTimer > 0) noiseTimer -= dt;
    let target = world.patrol[enemyWaypoint];
    if (enemyState === "chase" && !hidden) target = player;
    else if (enemyState === "investigate") {
      target = noisePoint;
      if (noiseTimer <= 0 || enemy.position.distanceToSquared(noisePoint) < 0.4) enemyState = "patrol";
    }
    enemyDirection.copy(target).sub(enemy.position); enemyDirection.y = 0;
    const targetDistance = enemyDirection.length();
    if (enemyState === "patrol" && targetDistance < 0.35) {
      enemyWaypoint = (enemyWaypoint + 1) % world.patrol.length;
      target = world.patrol[enemyWaypoint]; enemyDirection.copy(target).sub(enemy.position);
    }
    if (enemyDirection.lengthSq() > 0.001) {
      enemyDirection.normalize();
      const baseSpeed = 0.82 + level.chapter.id * 0.045 + level.roomNumber * 0.012;
      const speed = enemyState === "chase" ? baseSpeed * 1.65 : enemyState === "investigate" ? baseSpeed * 1.18 : baseSpeed;
      enemy.position.addScaledVector(enemyDirection, speed * dt);
      enemy.rotation.y = Math.atan2(-enemyDirection.x, -enemyDirection.z);
    }
    enemy.position.y = Math.sin(elapsed * 3.2) * 0.018;
    threat = enemyState === "chase" && !hidden ? Math.max(0.15, 1 - distance / 11) : Math.max(0, 0.3 - distance / 30);
    audio.setThreat(threat);
    if (!hidden && distance < 0.78) {
      mode = "gameover"; document.exitPointerLock?.(); audio.sfx("lose"); emit();
    }
  }

  function update(dt: number): void {
    elapsed += dt;
    if (messageTimer > 0) { messageTimer -= dt; if (messageTimer <= 0) message = ""; }
    if (input.consumeAction("Space") && mode === "title") startNew();
    if (input.consumeAction("Escape")) closeOverlay();
    if (input.consumeAction(settings.interactKey)) {
      if (mode === "note") closeOverlay();
      else interact();
    }
    if (input.consumeAction("KeyJ") && mode === "playing") { previousMode = mode; mode = "journal"; document.exitPointerLock?.(); emit(); }
    if (input.consumeAction("KeyF") && mode === "playing" && !hidden) {
      flashlightOn = !flashlightOn; flashlight.visible = flashlightOn; audio.sfx("ui"); emit();
    }
    if (input.consumeAction("KeyQ") && mode === "playing" && !hidden) throwBottle();

    if (mode === "playing") {
      levelTime += dt;
      const look = input.consumeLook(); yaw += look.yaw; pitch = THREE.MathUtils.clamp(pitch + look.pitch, -1.35, 1.35);
      const moving = Math.abs(input.moveX) + Math.abs(input.moveZ) > 0.05 && !hidden;
      if (moving) {
        const speed = 2.65;
        const sin = Math.sin(yaw), cos = Math.cos(yaw);
        proposed.copy(player);
        proposed.x += (input.moveX * cos - input.moveZ * sin) * speed * dt;
        if (canStand(proposed.x, player.z)) player.x = proposed.x;
        proposed.copy(player);
        proposed.z += (-input.moveX * sin - input.moveZ * cos) * speed * dt;
        if (canStand(player.x, proposed.z)) player.z = proposed.z;
        stepTimer -= dt;
        if (stepTimer <= 0) { audio.sfx("step"); stepTimer = 0.47; }
      }
      updateInteraction(); updateEnemy(dt);
      audio.updateMusic();
    } else {
      input.consumeLook(); threat = 0;
    }
    uiTimer -= dt;
    if (uiTimer <= 0) { emit(); uiTimer = 0.12; }
  }

  function render(): void {
    if (!world) return;
    renderer.info.reset();
    if (mode === "title") {
      const t = elapsed * 0.075;
      camera.position.set(3.5 + Math.sin(t) * 0.65, 2.05, 6.4 + Math.cos(t) * 0.3);
      camera.lookAt(-0.8, 1.0, -2.8);
      flashlight.visible = false;
    } else {
      const bob = mode === "playing" && (Math.abs(input.moveX) + Math.abs(input.moveZ) > 0.05) && !hidden ? Math.sin(elapsed * 9) * 0.025 : 0;
      camera.position.set(player.x, hidden ? 1.42 : 1.64 + bob, player.z);
      camera.rotation.set(pitch, yaw, 0);
      flashlight.visible = flashlightOn && !hidden;
    }
    world.dust.rotation.y = elapsed * 0.008;
    const flicker = 1 + Math.sin(elapsed * 7.3) * 0.018 + Math.sin(elapsed * 17.7) * 0.009;
    world.mainLight.intensity = (powered ? 78 : 62) * flicker;
    if (settings.quality === "low") renderer.render(scene, camera);
    else composer.render();
    window.__GAME_READY__ = true;
    if (!readySignalled) { readySignalled = true; window.dispatchEvent(new Event("silence-ready")); }
  }

  const loop = new GameLoop({ update, render });
  const onResize = () => {
    const width = window.innerWidth, height = window.innerHeight;
    camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
    renderer.setSize(width, height, false); composer.setSize(width, height);
  };
  const onCanvasClick = () => { if (mode === "playing") void canvas.requestPointerLock?.(); };
  const onPointerLock = () => { if (!document.pointerLockElement && mode === "playing" && levelTime > 0.5) pause(); };

  window.addEventListener("silence-command", onCommand);
  window.addEventListener("resize", onResize);
  document.addEventListener("pointerlockchange", onPointerLock);
  canvas.addEventListener("click", onCanvasClick);

  loadLevel(save.currentLevel, "title");
  onResize(); loop.start();
  window.__gameProbe = () => ({ x: player.x, y: player.y, z: player.z });
  window.__gameDebugLoad = (index) => loadLevel(index);
  window.__gameDebugInteract = (id) => interact(world?.interactables.find((item) => item.id === id));
  window.__gameDebugCatch = () => { if (world?.enemy.visible) world.enemy.position.copy(player); };
  window.__gameDebugPoseEnemy = () => { if (world?.enemy.visible) { world.enemy.position.set(player.x, 0, player.z - 4); world.enemy.rotation.y = Math.PI; } };
  window.__gameDebug = () => ({
    mode, level: level.index, puzzle: level.puzzle, hasKey, hasFuse, powered, hidden, bottles, codeError,
    player: { x: player.x, z: player.z }, enemyState, threat,
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    keyContainer: level.keyContainer, fuseContainer: level.fuseContainer, code: level.code,
    documents: save.documents.length, levels: TOTAL_LEVELS,
  });

  return {
    dispose: () => {
      if (disposed) return; disposed = true;
      loop.stop();
      window.removeEventListener("silence-command", onCommand);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerlockchange", onPointerLock);
      canvas.removeEventListener("click", onCanvasClick);
      if (world) disposeWorld(scene, world);
      for (const mat of materials.values()) disposeMaterials(mat);
      void doorAsset?.dispose?.(); void lampAsset?.dispose?.();
      composer.dispose(); renderer.dispose(); input.dispose(); audio.dispose();
      delete window.__gameProbe; delete window.__gameDebug; delete window.__gameDebugLoad; delete window.__gameDebugInteract; delete window.__gameDebugCatch; delete window.__gameDebugPoseEnemy;
      window.__GAME_READY__ = false;
    },
  };
}

export function stopGame(): void {
  session?.dispose(); session = null;
}
