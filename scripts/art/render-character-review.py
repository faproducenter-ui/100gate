"""Render the actual review source at the closed frame, without changing it."""
import bpy,json,hashlib
from pathlib import Path
scene=bpy.context.scene
scene.frame_set(48)
out=Path.cwd()/'outputs/mpfb-character'
out.mkdir(parents=True,exist_ok=True)
for cam in sorted((o for o in scene.objects if o.type=='CAMERA'),key=lambda o:o.name):
    scene.camera=cam
    scene.render.filepath=str(out/(cam.name+'.png'))
    bpy.ops.render.render(write_still=True)
(out/'blender-render-source.json').write_text(json.dumps({
    'source':bpy.data.filepath,'sha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),
    'frame':48,'scope':'isolated character/grip review, not intro'
},indent=2))
