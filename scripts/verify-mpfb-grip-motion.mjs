import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const out='outputs/mpfb-character';
const base=process.env.GAME_URL??'http://127.0.0.1:5182';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:720,height:660},
    recordVideo:{dir:out+'/video',size:{width:720,height:660}}});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.route(base+'/__grip_motion__',r=>r.fulfill({contentType:'text/html',body:
    '<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0}</style></head><body></body></html>'}));
  await page.goto(base+'/__grip_motion__');
  const imported=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const {RoomEnvironment}=await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
    const asset=await new GLTFLoader().loadAsync('/outputs/mpfb-character/alexei-grip-close.glb');
    const scene=new T.Scene();scene.background=new T.Color(0x343842);scene.add(asset.scene);
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(720,660);renderer.toneMapping=T.AgXToneMapping;
    const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();
    scene.environment=pmrem.fromScene(room,.04).texture;scene.environmentIntensity=.65;
    pmrem.dispose();room.dispose();
    scene.add(new T.HemisphereLight(0xd5e5f5,0x544e47,.5));
    const key=new T.DirectionalLight(0xffe5ca,2);key.position.set(2.1,3,3);scene.add(key);
    document.body.appendChild(renderer.domElement);
    const label=document.createElement('div');
    Object.assign(label.style,{position:'fixed',top:'12px',left:'12px',color:'white',background:'#151a20cc',
      padding:'8px 12px',font:'13px sans-serif',zIndex:5});
    document.body.appendChild(label);
    const clip=asset.animations.find(c=>c.name.includes('KnifePowerGripClose'));
    if(!clip)throw new Error('Missing authored grip clip');
    const mixer=new T.AnimationMixer(asset.scene),action=mixer.clipAction(clip);
    action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
    const hand=asset.scene.getObjectByName('hand_r');
    let knife;
    asset.scene.traverse(o=>{if(o.name.startsWith('Cinematic_field_knife'))knife=o;});
    if(!hand||!knife)throw new Error('Missing hand or bone-attached prop');
    const handle=knife.children.find(o=>o.isMesh&&o.name.startsWith('Oval_walnut_scales'));
    if(!handle)throw new Error('Missing measured handle');
    handle.geometry.computeBoundingBox();
    const size=handle.geometry.boundingBox.getSize(new T.Vector3());
    if(!(size.y>.11&&size.y<.13&&size.x<.03&&size.z<.03))
      throw new Error('Handle authoring basis/scale changed; do not use stale contact coordinates');
    let skin;
    asset.scene.traverse(o=>{if(o.isSkinnedMesh&&o.name.endsWith('_body_glb'))skin=o;});
    if(!skin)throw new Error('Missing unified body skin');
    const rows=[[-62,6,5],[-58,10,8],[-46,12,11],[-22,11,12],[11,11,12],[35,12,11],[52,11,8],[57,8,5]];
    const chosen=[];
    const ji=skin.geometry.getAttribute('skinIndex'),jw=skin.geometry.getAttribute('skinWeight');
    for(let i=0;i<ji.count;i++){
      let best=-1,weight=0;
      for(let j=0;j<4;j++){const w=jw.getComponent(i,j);if(w>weight){weight=w;best=ji.getComponent(i,j);}}
      const name=skin.skeleton.bones[best]?.name??'';
      if(/^(thumb|index|middle|ring|pinky)_\d\d_r$/.test(name))chosen.push([i,name.split('_')[0]]);
    }
    const sample=(time,cameraName='06',measure=false)=>{
      action.reset().play();mixer.setTime(time);scene.updateMatrixWorld(true);
      const camera=asset.cameras.find(c=>c.name.startsWith(cameraName));
      if(!camera)throw new Error('Missing camera '+cameraName);
      renderer.render(scene,camera);
      label.textContent='GRIP-CLOSE STUDY — not intro · '+camera.name+' · '+time.toFixed(2)+'s';
      const clearances={};
      if(measure){
        const inverse=new T.Matrix4().copy(knife.matrixWorld).invert();
        const p=new T.Vector3();
        for(const [index,digit] of chosen){
          skin.getVertexPosition(index,p).applyMatrix4(skin.matrixWorld).applyMatrix4(inverse).multiplyScalar(1000);
          // glTF has Y-up *local* coordinates too. The Blender-authored prop's
          // shaft is +Z; after export it is +Y, not +Z. Compare the profile in
          // its authoring basis rather than measuring the wrong cylinder.
          const px=p.x,py=-p.z,pz=p.y;
          let lo=rows[0],hi=rows.at(-1);
          for(let j=1;j<rows.length;j++)if(pz<=rows[j][0]){lo=rows[j-1];hi=rows[j];break;}
          const t=T.MathUtils.clamp((pz-lo[0])/(hi[0]-lo[0]),0,1);
          const a=T.MathUtils.lerp(lo[1],hi[1],t),b=T.MathUtils.lerp(lo[2],hi[2],t);
          const radial=(Math.hypot(px/a,py/b)-1)*Math.min(a,b),axial=Math.max(pz-56,-61-pz);
          const d=Math.hypot(Math.max(radial,0),Math.max(axial,0))+Math.min(Math.max(radial,axial),0);
          clearances[digit]=Math.min(clearances[digit]??Infinity,d);
        }
      }
      return {
        clearances,
        propRelative:new T.Matrix4().copy(hand.matrixWorld).invert().multiply(knife.matrixWorld).elements,
        digits:Object.fromEntries(['thumb','index','middle','ring','pinky'].map(d=>{
          const bone=asset.scene.getObjectByName(d+'_03_r');
          return [d,{position:bone.getWorldPosition(new T.Vector3()).toArray(),rotation:bone.quaternion.toArray()}];
        })),
      };
    };
    window.__gripMotion={sample,async replay(camera){
      const started=performance.now();
      await new Promise(resolve=>{
        const frame=()=>{
          const t=Math.min(clip.duration,(performance.now()-started)/1000);
          sample(t,camera);
          if(t>=clip.duration)resolve();else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    }};
    return {clips:asset.animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})),
      tracks:clip.tracks.map(t=>t.name)};
  });
  assert.equal(imported.clips.length,1);
  const duration=imported.clips[0].duration;
  assert.ok(duration>1.9&&duration<2.1);
  for(const digit of ['thumb','index','middle','ring','pinky'])
    for(let i=1;i<=3;i++) assert.ok(imported.tracks.some(t=>t===digit+'_0'+i+'_r.quaternion'),'Missing '+digit+' joint '+i);
  const samples=[];
  for(const t of [0,.30,.65,1,1.4,duration]){
    samples.push({time:t,...await page.evaluate(t=>window.__gripMotion.sample(t),t)});
    await page.screenshot({path:out+'/grip-close-'+String(Math.round(t*100)).padStart(3,'0')+'.png'});
  }
  const initial=samples[0],last=samples.at(-1);
  const drift=Math.max(...samples.flatMap(s=>s.propRelative.map((v,i)=>Math.abs(v-initial.propRelative[i]))));
  assert.ok(drift<.00001,'Knife slipped relative to the hand');
  for(const digit of Object.keys(initial.digits)) {
    const a=initial.digits[digit].rotation,b=last.digits[digit].rotation;
    assert.ok(Math.abs(a.reduce((sum,v,i)=>sum+v*b[i],0))<.999,'Digit does not move: '+digit);
  }
  const contactSamples=[];
  for(let frame=1;frame<=48;frame++){
    contactSamples.push({frame,...await page.evaluate(t=>window.__gripMotion.sample(t,'06',true),(frame-1)/24)});
  }
  const penetration=Math.min(...contactSamples.flatMap(s=>Object.values(s.clearances)));
  await writeFile(out+'/threejs-grip-contacts.json',JSON.stringify({penetration,contactSamples},null,2)+'\n');
  assert.ok(penetration>-.9,'Runtime finger surface penetrates the shaft: '+penetration+' mm');
  for(const camera of ['01','02','04','06','07']){
    await page.evaluate(camera=>window.__gripMotion.replay(camera),camera);
    await page.waitForTimeout(500);
  }
  assert.deepEqual(errors,[]);
  await writeFile(out+'/grip-motion-report.json',JSON.stringify({imported,samples,knifeMatrixDrift:drift,errors},null,2)+'\n');
  const video=page.video();await page.close();await video.saveAs(out+'/grip-close-study.webm');
  console.log(JSON.stringify({clip:imported.clips[0],knifeMatrixDrift:drift,errors}));
}finally{await browser.close();}
