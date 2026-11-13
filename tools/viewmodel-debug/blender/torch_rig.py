# exec()'d by the torch scripts (shares their globals). Builds, from art/mixamo-hold.blend (the solved right-hand hold, now for carrying a torch):
#   - metre-scale armature, only both arms + the head kept for export later, game bone names applied late (see torch_game.py)
#   - the Torch in the right hand (TORCH_HOLD), the Lighter, helper bones for every moving prop
# The arm machinery comes from mixamo_anim.py (everything before its frame loop): solve_arm / set_fingers / hand frames of the RIGHT arm.
import bpy, math, sys, os, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion

PROPS = r"C:\Users\libde\100gate\art\torch\props.blend"

# ---- 1. unit scale (same fix as mixamo_game_export.py: the 0.01 came from the Sketchfab parent empty)
arm = bpy.data.objects['Hero']
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.parent == arm and o.name not in ('Hero_Body', 'Hero_Sweatshirt'): bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.name.startswith(('Table', 'Icosphere')) or (o.type == 'EMPTY' and o.parent == arm): bpy.data.objects.remove(o, do_unlink=True)
mw = arm.matrix_world.copy(); arm.parent = None; arm.matrix_world = mw
bpy.context.view_layer.update()
for o in bpy.data.objects: o.select_set(False)
for o in [arm] + list(arm.children): o.select_set(True)
bpy.context.view_layer.objects.active = arm
_SC = arm.matrix_world.to_scale()[0]
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
for b in arm.pose.bones: b.location = b.location * _SC
bpy.context.view_layer.update()

# ---- 2. right-arm machinery
_src = open(r"C:\Users\libde\100gate\tools\viewmodel-debug\blender\mixamo_anim.py", encoding='utf-8').read()
_prefix = _src[:_src.index("miss = []\nneed = []")].replace("if o.name.startswith('Table'):", "if False:")
exec(_prefix, globals())
# the flashlight object of the solved hold is only a proxy for the grip: remove it once the torch exists
print('arm machinery ready; arm lengths', round(Lu, 3), round(Lf, 3))

# ---- 3. the props from props.blend
with bpy.data.libraries.load(PROPS, link=False) as (_s, _d):
    _d.objects = [n for n in ('Torch', 'TorchTip', 'LighterBody', 'LighterLid', 'LighterInsert', 'LighterDetails', 'LighterLidPivot', 'LighterWick') if n in _s.objects]
for _o in _d.objects: sc.collection.objects.link(_o)
torch = bpy.data.objects['Torch']; torch_tip = bpy.data.objects['TorchTip']
l_body, l_lid, l_ins, l_det = (bpy.data.objects[n] for n in ('LighterBody', 'LighterLid', 'LighterInsert', 'LighterDetails'))
l_piv = bpy.data.objects['LighterLidPivot']; l_wick = bpy.data.objects['LighterWick']
for _o in (torch, l_body, l_lid, l_ins, l_det, l_piv, l_wick, torch_tip): _o.parent = None
# the lid is modelled open: bake the closed pose (-133 deg about the hinge) into the lid mesh, so bone rotation 0 = closed and +133 about X = open
_pivot = l_piv.location.copy(); l_piv.rotation_euler = (0, 0, 0)
_closed = Matrix.Translation(_pivot) @ Matrix.Rotation(math.radians(-133), 4, 'X') @ Matrix.Translation(-_pivot)
l_lid.data.transform(_closed); l_lid.matrix_world = Matrix.Identity(4)
LID_PIVOT = _pivot.copy(); WICK = l_wick.location.copy()      # in the lighter's frame (origin = body centre, Z up, hinge axis X)
TIP = torch_tip.location.copy()                                # in the torch frame (origin = grip point, +X toward the head)

# the torch in the right hand = the flashlight proxy's frame moved to the grip point of the hold
TORCH_HOLD = FL_HOLD @ Matrix.Translation(p_local)
REL_TORCH = (W @ B(HA).matrix).inverted() @ TORCH_HOLD         # torch frame in the right hand bone's frame (constant while held)
print('torch hold at', tuple(round(v, 3) for v in TORCH_HOLD.translation), 'rel t', tuple(round(v, 3) for v in REL_TORCH.translation))
fl.hide_set(True); fl.hide_render = True
bpy.data.objects['Flashlight_switch'].hide_set(True); bpy.data.objects['Flashlight_switch'].hide_render = True
torch.matrix_world = TORCH_HOLD
