"""Editable combined native cast, set and synchronized door for visual review."""
import bpy,math
from pathlib import Path
ROOT=Path.cwd();OUT=ROOT/'outputs/story-intro/cast';OUT.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;s.name='100gate | 22:42 · cast performance'
assert s.camera and s.camera.name.startswith('StoryHome_')
for path in ('hero/story-hero-home.blend','partner/story-partner-home.blend'):
    with bpy.data.libraries.load(str(ROOT/'outputs/story-intro'/path),link=False) as (src,dst):
        dst.objects=src.objects
    for o in dst.objects:
        if o and o.type in ('MESH','ARMATURE'):s.collection.objects.link(o)
s.render.fps=24;s.frame_start=1;s.frame_end=457
door=s.objects['StoryHome_DoorHinge']
def ease(t,a,b):
    x=max(0,min(1,(t-a)/(b-a)));return x*x*(3-2*x)
for f in range(1,458):
    t=(f-1)/24;door.rotation_euler.z=1.42*ease(t,14.3,16.35)*(1-ease(t,18.4,19))
    door.keyframe_insert('rotation_euler',frame=f)
s.timeline_markers.clear()
for name,t in [('Alexei · line',.7),('Partner · response',3.5),('Turn & walk',9.65),('Door handle',13.6),('Door swings',14.3),('Through doorway',16.65)]:
    s.timeline_markers.new(name,frame=round(1+t*24))
s.frame_set(49);s.render.resolution_x=1120;s.render.resolution_y=720
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'story-home-performance.blend'))
print('COMBINED_NATIVE_CAST',len([o for o in s.objects if o.type=='ARMATURE']))
