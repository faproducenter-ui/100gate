import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { writeFile } from 'node:fs/promises';

// Review the isolated GLB using the same Three.js version as the game. No runtime
// game code or public assets are involved. Run with a local Vite server.
const base = process.env.GAME_URL ?? 'http://127.0.0.1:3000';
const folder = 'outputs/mpfb-character';
const recordStatic = process.env.GATE_RECORD_STATIC === '1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 840 },
    ...(recordStatic ? {recordVideo:{dir:folder+'/video',size:{width:720,height:660}}} : {}) });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.route(base + '/__mpfb_review__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0}</style></head><body></body></html>',
  }));
  await page.goto(base + '/__mpfb_review__');
  const report = await page.evaluate(async asset => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(asset);
    const scene = new T.Scene();
    scene.background = new T.Color(0x343842);
    scene.add(gltf.scene);
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);
    const label=document.createElement('div');
    label.id='static-review-label';
    Object.assign(label.style,{position:'fixed',top:'12px',left:'12px',color:'white',
      background:'#151a20cc',padding:'8px 12px',font:'13px sans-serif',zIndex:5});
    label.textContent='STATIC POSE QA — no animation';
    document.body.appendChild(label);
    scene.add(new T.HemisphereLight(0xd5e5f5, 0x544e47, 2));
    const key = new T.DirectionalLight(0xffe5ca, 2.4);
    key.position.set(2.1, 3, 3);
    scene.add(key);
    const camera = new T.PerspectiveCamera(36, innerWidth / innerHeight, 0.01, 15);
    camera.position.set(0.65, 1.08, 3.1);
    camera.lookAt(0, 0.9, 0);
    renderer.render(scene, camera);
    window.__disposeMpfbNeutral = () => renderer.dispose();
    const meshes = [];
    const skeletons = new Set();
    const body = [];
    gltf.scene.traverse(o => {
      if (!o.isSkinnedMesh) return;
      meshes.push(o.name);
      skeletons.add(o.skeleton);
      if (o.name.includes('original_MakeHuman_body_glb')) body.push(o);
    });
    const max = [...skeletons].sort((a,b) => b.bones.length-a.bones.length)[0];
    const joints = max?.bones.map(b => b.name) ?? [];
    return {
      meshes, sharedSkeletons: skeletons.size, bones: joints.length,
      fingerBones: joints.filter(n => /^(thumb|index|middle|ring|pinky)_/.test(n)).length,
      triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures,
      draws: renderer.info.render.calls, clips: gltf.animations.length,
      versions: { three: T.REVISION, webgl: renderer.getContext().getParameter(renderer.getContext().VERSION) },
    };
  }, '/' + folder + '/alexei-rig-review.glb');
  await page.screenshot({ path: folder + '/09-threejs-import.png' });
  await writeFile(folder + '/threejs-report.json', JSON.stringify({ ...report, errors }, null, 2) + '\n');
  assert.deepEqual(errors, [], 'Browser reported errors');
  assert.equal(report.meshes.length, 5);
  assert.equal(report.sharedSkeletons, 1);
  assert.equal(report.bones, 53);
  assert.equal(report.fingerBones, 30);
  assert.ok(report.triangles > 0 && report.textures > 1);
  await page.setViewportSize({ width: 720, height: 660 });
  const posed = await page.evaluate(async asset => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const { RoomEnvironment } = await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
    const gltf = await new GLTFLoader().loadAsync(asset);
    window.__disposeMpfbNeutral();
    delete window.__disposeMpfbNeutral;
    document.body.replaceChildren();
    const scene = new T.Scene();
    scene.background = new T.Color(0x343842);
    scene.add(gltf.scene);
    scene.add(new T.HemisphereLight(0xd5e5f5, 0x544e47, .5));
    const light = new T.DirectionalLight(0xffe5ca, 2.0);
    light.position.set(2.1,3,3); scene.add(light);
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(720,660); renderer.toneMapping=T.AgXToneMapping;
    const pmrem=new T.PMREMGenerator(renderer);
    const room=new RoomEnvironment();
    const env=pmrem.fromScene(room,.04);
    scene.environment=env.texture; scene.environmentIntensity=.65;
    room.dispose(); pmrem.dispose();
    document.body.appendChild(renderer.domElement);
    const label=document.createElement('div');
    Object.assign(label.style,{position:'fixed',top:'12px',left:'12px',color:'white',
      background:'#151a20cc',padding:'8px 12px',font:'13px sans-serif',zIndex:5});
    document.body.appendChild(label);
    scene.updateMatrixWorld(true);
    const bounds=[];
    let source;
    gltf.scene.traverse(o => {
      if (o.userData.review_blender_world_aabb_y_up) source=JSON.parse(o.userData.review_blender_world_aabb_y_up);
      if (!o.isSkinnedMesh) return;
      o.computeBoundingBox();
      const b=o.boundingBox.clone().applyMatrix4(o.matrixWorld);
      bounds.push({name:o.name, min:b.min.toArray(),max:b.max.toArray()});
    });
    const deviations=[];
    if (source) {
      for (const b of bounds) {
        const expected=Object.entries(source).find(([name])=>name.replaceAll(' ', '_').replaceAll('.', '')===b.name)?.[1];
        if (!expected) throw new Error('Missing Blender reference for '+b.name);
        deviations.push({name:b.name, delta:Math.max(...b.min.map((v,i)=>Math.abs(v-expected[0][i])),
          ...b.max.map((v,i)=>Math.abs(v-expected[1][i])))});
      }
    }
    window.__mpfbStaticReview = {
      render(name) {
        const cam=gltf.cameras.find(c=>c.name.startsWith(name));
        if (!cam) throw new Error('Missing camera '+name);
        label.textContent='STATIC POSE QA — no animation · '+cam.name;
        renderer.render(scene,cam);
      },
    };
    return {bounds, deviations, cameras:gltf.cameras.map(c=>c.name),clips:gltf.animations.length};
  }, '/'+folder+'/alexei-seated-review.glb');
  assert.equal(posed.clips,0,'Do not claim animation while the static gate is pending');
  assert.equal(posed.deviations.length,5,'Reference bounds are required, not optional');
  assert.ok(posed.deviations.every(d=>d.delta<.02),'GLB pose differs from the evaluated Blender pose');
  for (const camera of ['01','02','04','05','06','07','08']) {
    await page.evaluate(name=>window.__mpfbStaticReview.render(name),camera);
    await page.screenshot({path:folder+'/threejs-'+camera+'.png'});
    if (recordStatic) await page.waitForTimeout(2200);
  }
  assert.deepEqual(errors,[]);
  await writeFile(folder+'/threejs-posed-report.json',JSON.stringify({...posed, errors},null,2)+'\n');
  console.log(JSON.stringify(report, null, 2));
  if (recordStatic) {
    const video=page.video();
    await page.close();
    await video.saveAs(folder+'/static-pose-review.webm');
  }
} finally {
  await browser.close();
}
