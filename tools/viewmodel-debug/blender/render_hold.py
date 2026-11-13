# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/render_hold.py  -> docs/viewmodel-grip/bl_*.png + contact stats
import bpy, math, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT = r"C:\Users\libde\100gate\docs\viewmodel-grip"
arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; body = bpy.data.objects['VM_body']; sc = bpy.context.scene
for n in ('Cube',):
    o = bpy.data.objects.get(n)
    if o: o.hide_render = True
w = sc.world or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (.12, .13, .15, 1); bg.inputs['Strength'].default_value = 1.2
if 'key' not in bpy.data.objects:
    ld = bpy.data.lights.new('key', 'AREA'); ld.energy = 90; ld.size = 2; lo = bpy.data.objects.new('key', ld); sc.collection.objects.link(lo); lo.location = (.3, .2, 2.1); lo.rotation_euler = (.35, 0, 0)
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError: sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.frame_set(0)
def stats():
    dg = bpy.context.evaluated_depsgraph_get(); fe = fl.evaluated_get(dg); tree = BVHTree.FromObject(fe, dg); inv = fe.matrix_world.inverted(); FW = fe.matrix_world
    be = body.evaluated_get(dg); me = be.to_mesh(); M = be.matrix_world; names = {vg.index: vg.name for vg in body.vertex_groups}; out = {}
    for v in me.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda g: g.weight); n = names[g.group]
        k = next((p for p in ('thumb', 'index', 'middle', 'ring', 'pinky', 'hand') if n.startswith(p) and n.endswith('_r')), None)
        if not k: continue
        co = M @ v.co; loc, nor, idx, dist = tree.find_nearest(inv @ co)
        d = (co - FW @ loc).length * (1 if (inv @ co - loc).dot(nor) >= 0 else -1)
        s = out.setdefault(k, [9, 0, 0]); s[0] = min(s[0], d); s[1] += d < -0.0015; s[2] += d < 0.003
    be.to_mesh_clear(); return {k: (round(v[0] * 1000, 1), v[1], v[2]) for k, v in out.items()}
print('CONTACT mm/penetrating/touching', stats())
def shot(name, cam):
    sc.camera = cam; sc.render.filepath = rf"{OUT}\{name}.png"; bpy.ops.render.render(write_still=True)
shot('bl_hold_fp', bpy.data.objects['VMcam'])
cd = bpy.data.cameras.new('dbg'); co = bpy.data.objects.new('dbg', cd); sc.collection.objects.link(co); cd.angle_y = math.radians(40); cd.clip_start = .01
W = arm.matrix_world; target = W @ arm.pose.bones['hand_r'].head + Vector((-.02, -.05, 0))
for name, off in (('left', (-.5, -.1, .05)), ('above', (0, 0, .55)), ('back', (.1, .55, .1)), ('front', (0, -.55, .1))):
    co.location = target + Vector(off); co.rotation_euler = (target - co.location).to_track_quat('-Z', 'Y').to_euler(); shot(f'bl_hold_{name}', co)
