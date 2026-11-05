"""Render the six inspection cameras from art/knife-grip-review.blend."""
import bpy
from pathlib import Path

root=Path(__file__).resolve().parents[2]
out=root.parent.parent/'outputs/intro-animation/grip-review'
out.mkdir(parents=True,exist_ok=True)
scene=bpy.data.scenes['100gate | Knife grip inspection']
bpy.context.window.scene=scene
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_percentage=85
for i,camera in enumerate(sorted((o for o in scene.objects if o.type=='CAMERA'),key=lambda o:o.name),1):
    scene.camera=camera;scene.render.filepath=str(out/f'{i:02d}.png')
    bpy.ops.render.render(write_still=True,scene=scene.name)
