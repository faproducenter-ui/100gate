# blender -b art/viewmodel-hold.blend --python tools/viewmodel-debug/blender/render_v2.py -- <tag>   (measurements + side/top/front/game renders)
import bpy, math, os, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
TAG = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'check'
SHOTS = 'C:/Users/libde/100gate/docs/viewmodel-grip/v2'; os.makedirs(SHOTS, exist_ok=True)
arm = bpy.data.objects['StoryHeroWalk']; fl = bpy.data.objects['Flashlight']; body = bpy.data.objects['VM_body']; sc = bpy.context.scene; cam = bpy.data.objects['VMcam']
arm.animation_data.action = bpy.data.actions['flashlight_idle']; sc.frame_set(1); sc.frame_set(0)
pb = arm.pose.bones; W = arm.matrix_world; bpy.context.view_layer.update()
Cw = cam.matrix_world.to_3x3(); eye = cam.location.copy()
def cs(x, y, z): return Cw @ Vector((x, y, z))
def tocam(p): return cam.matrix_world.inverted() @ p
def hb(n): return W @ pb[n].head
def hand_frame():
    d = (hb('middle_01_r') - hb('hand_r')).normalized()
    r = hb('index_01_r') - hb('pinky_01_r'); r = (r - d * r.dot(d)).normalized()
    return Matrix((d, r, d.cross(r))).transposed()
def flash_geo():
    dg = bpy.context.evaluated_depsgraph_get(); ev = fl.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
    pts = np.array([(M @ v.co)[:] for v in me.vertices]); ev.to_mesh_clear()
    c = pts.mean(axis=0); ax = np.linalg.svd(pts - c, full_matrices=False)[2][0]
    t = (pts - c) @ ax; q = pts - c; rr = np.sqrt(((q - np.outer(t, ax)) ** 2).sum(1))
    sgn = 1 if rr[t > np.percentile(t, 85)].mean() > rr[t < np.percentile(t, 15)].mean() else -1
    ax = ax * sgn; t = t * sgn
    return Vector(c), Vector(ax).normalized(), float(t.min()), float(t.max())
L = flash_geo()[1]
# ---- measurements
def deg(v): return math.degrees(v)
def report(tag):
    bpy.context.view_layer.update()
    S, E, Wr = hb('upperarm_r'), hb('lowerarm_r'), hb('hand_r')
    fore = (Wr - E).normalized(); fr = hand_frame(); dist = fr.col[0]; rad = fr.col[1]; nrm = fr.col[2]
    flex = deg(math.asin(max(-1, min(1, dist.dot((W @ pb['lowerarm_r'].matrix).to_3x3() @ Vector((0, 0, 1)))))))
    # wrist: split the hand-vs-forearm angle into flexion (toward the palm normal) and side bend (toward the thumb)
    v = dist - fore * dist.dot(fore)
    flexion = deg(math.atan2(v.dot(nrm), dist.dot(fore))); side = deg(math.atan2(v.dot(rad), dist.dot(fore)))
    c, a, tn, tx = flash_geo()
    lens_cam = (cam.matrix_world.inverted().to_3x3() @ a).normalized()
    t_palm = ((hb('hand_r') + 0.7 * (hb('middle_01_r') - hb('hand_r'))) - c).dot(a)
    print(f'[{tag}] elbow {deg((S - E).angle(Wr - E)):.0f} deg | upper arm from vertical {deg((E - S).angle(Vector((0, 0, -1)))):.0f} deg | '
          f'wrist flexion {flexion:+.0f} side {side:+.0f} | barrel vs forearm {deg(a.angle(fore)):.0f} deg | '
          f'lens in camera ({lens_cam.x:+.2f}, {lens_cam.y:+.2f}, {lens_cam.z:+.2f}) = {deg(math.atan2(lens_cam.x, -lens_cam.z)):+.0f} deg sideways, {deg(math.asin(lens_cam.y)):+.0f} deg up | '
          f'palm at {(t_palm - tn) / (tx - tn) * 100:.0f}% of the body from the tail | wrist on screen {tuple(round(x, 2) for x in tocam(Wr))}')
def shots(tag):
    w = sc.world or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (.12, .13, .15, 1); bg.inputs['Strength'].default_value = 1.2
    if 'key' not in bpy.data.objects:
        ld = bpy.data.lights.new('key', 'AREA'); ld.energy = 90; ld.size = 2; lo = bpy.data.objects.new('key', ld); sc.collection.objects.link(lo); lo.location = (.3, .2, 2.1); lo.rotation_euler = (.35, 0, 0)
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = 960, 540
    d = bpy.data.cameras.get('shot') or bpy.data.cameras.new('shot'); d.angle_y = math.radians(40); d.clip_start = .01
    co = bpy.data.objects.get('shot') or bpy.data.objects.new('shot', d)
    if co.name not in sc.collection.objects: sc.collection.objects.link(co)
    tgt = hb('hand_r') + (L * 0.06)
    right = cs(1, 0, 0)
    for name, off in (('side', right * 0.55 + cs(0, 0.05, 0)), ('top', cs(0, 0.6, 0.05)), ('front', L * 0.6 + cs(0, 0.05, 0))):
        co.location = tgt + off; co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler()
        sc.camera = co; sc.render.filepath = rf"{SHOTS}\{tag}_{name}.png"; bpy.ops.render.render(write_still=True)
    sc.camera = cam; sc.render.filepath = rf"{SHOTS}\{tag}_game.png"; bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(co, do_unlink=True)


names = {vg.index: vg.name for vg in body.vertex_groups}
def contact():
    dg = bpy.context.evaluated_depsgraph_get(); fe = fl.evaluated_get(dg); tree = BVHTree.FromObject(fe, dg); inv = fe.matrix_world.inverted(); FW = fe.matrix_world
    be = body.evaluated_get(dg); me = be.to_mesh(); MB = be.matrix_world; out = {}
    for v in me.vertices:
        if not v.groups: continue
        n = names[max(v.groups, key=lambda g: g.weight).group]
        k = next((p for p in ('index', 'middle', 'ring', 'pinky', 'thumb', 'hand') if n.startswith(p) and n.endswith('_r')), None)
        if not k: continue
        co = MB @ v.co; loc, nor, i, d = tree.find_nearest(inv @ co)
        s = (co - FW @ loc).length * (1 if (inv @ co - loc).dot(nor) >= 0 else -1)
        o = out.setdefault(k, [9, 0]); o[0] = min(o[0], s); o[1] += s < -0.001
    be.to_mesh_clear(); return {k: (round(v[0] * 1000, 1), v[1]) for k, v in out.items()}
report(TAG)
print('[contact] per part: (closest mm, negative = inside; skin vertices deeper than 1 mm):', contact())
shots(TAG)
