"""Isolated static review: original MPFB human mesh, weights and CC0 wardrobe.

Run in Blender 4.5 with MPFB 2.0.18 enabled in an isolated profile. Set
GATE_MPFB_ASSETS to the extracted asset pack directory (see art/README.md).
Outputs are review files only, never written to the public game directory.
"""
import bpy
import importlib
import json
import math
import os
import sys
import numpy as np
from pathlib import Path
from mathutils import Matrix, Quaternion, Vector

ROOT = Path.cwd()
ASSETS = Path(os.environ.get('GATE_MPFB_ASSETS', ROOT.parent/'100gate-art-sources/makehuman-cc0'))
OUT = ROOT / 'outputs' / 'mpfb-character'
OUT.mkdir(parents=True, exist_ok=True)

def service(suffix, name):
    module = next(key for key in sys.modules if key.endswith('mpfb.services.' + suffix))
    return getattr(importlib.import_module(module), name)

human_service = service('humanservice', 'HumanService')
scene = bpy.context.scene
if bpy.data.filepath:
    raise RuntimeError('Run in a fresh Blender file; refusing to clear an existing source.')
scene.name = '100gate | MPFB character · static review'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def asset(name):
    matches = list(ASSETS.rglob(name))
    if not matches:
        raise FileNotFoundError(name)
    return sorted(matches)[0]

body = human_service.create_human(macro_detail_dict={
    'gender': 1., 'age': .48, 'muscle': .52, 'weight': .49, 'height': .53,
    'race': {'caucasian': 1., 'asian': 0., 'african': 0.},
})
body.name = 'Alexei | original MakeHuman body'
human_service.set_character_skin(str(asset('mindfront_aksel_skin.mhmat')), body, skin_type='GAMEENGINE')
rig = human_service.add_builtin_rig(body, 'game_engine')
rig.name = 'Alexei | MPFB game-engine skeleton'
wardrobe = []
for file, role in (
    ('toigo_fisherman_sweater.mhclo', 'Clothes'),
    ('cortu_cargo_pants.mhclo', 'Clothes'),
    ('toigo_ankle_boots_male.mhclo', 'Clothes'),
    ('low-poly.mhclo', 'Eyes'),
):
    options = {'alternative_materials': [str(asset('brown.mhmat'))]} if role == 'Eyes' else {}
    wardrobe.append(human_service.add_mhclo_asset(
        str(asset(file)), body, asset_type=role, material_type='GAMEENGINE',
        subdiv_levels=0, **options,
    ))

# Reversible wardrobe corrections on the original garment, retaining its UV,
# topology and a Basis shape. The knitted hem must lie outside the trousers.
sweater=wardrobe[0]
sweater.shape_key_add(name='Basis')
fit=sweater.shape_key_add(name='WardrobeFit')
for v in fit.data:
    t=max(0.,min(1.,(1.11-v.co.z)/.12))
    v.co.x *= 1+.10*t
    v.co.y = .015+(v.co.y-.015)*(1+.12*t)
    # Fit the actual knitted cuff around the source forearm, rather than
    # truncating the skin or adding a replacement wrist cylinder.
    side='l' if v.co.x>0 else 'r'
    bone=rig.data.bones['lowerarm_'+side]
    a,b=bone.head_local,bone.tail_local
    axis=b-a
    u=(v.co-a).dot(axis)/axis.length_squared
    if u>.58 and abs(v.co.x)>.3:
        centerline=a+axis*u
        radial=v.co-centerline
        if radial.length>.001:
            blend=min(1.,max(0.,(u-.58)/.32))
            v.co+=radial.normalized()*(.004+.12*radial.length)*blend
fit.value=1
# The original trousers are exceptionally coarse (211 source vertices). A
# non-destructive simple subdivision before skinning interpolates weights at the
# knees without replacing their topology, UVs or garment silhouette.
sub=wardrobe[1].modifiers.new('Knee weight interpolation','SUBSURF')
sub.subdivision_type='SIMPLE'
sub.levels=sub.render_levels=2
bpy.context.view_layer.objects.active=wardrobe[1]
bpy.ops.object.modifier_move_up(modifier=sub.name)
# Clothing hides covered body surfaces without deleting any source geometry.
# Use the source rig's weights, not replacement body parts.
exposed={g.index for g in body.vertex_groups if
    g.name in ('head','neck_01','clavicle_l','clavicle_r','upperarm_l','upperarm_r',
               'lowerarm_l','lowerarm_r','hand_l','hand_r') or
    g.name.startswith(('index_','middle_','ring_','pinky_','thumb_'))}
visible=body.vertex_groups.new(name='WardrobeVisible')
for v in body.data.vertices:
    if sum(g.weight for g in v.groups if g.group in exposed)>.16:
        visible.add([v.index],1,'REPLACE')
mask=body.modifiers.new('Wardrobe occlusion · reversible','MASK')
mask.vertex_group=visible.name
skin_detail=body.modifiers.new('Source topology · close-up subdivision','SUBSURF')
skin_detail.levels=skin_detail.render_levels=1
# glTF skins an already subdivided bind mesh. Match that operation order in
# Blender; post-skin subdivision gave convincing DCC contact but a different
# finger surface in Three.js.
bpy.context.view_layer.objects.active=body
armature_modifier=next(m for m in body.modifiers if m.type=='ARMATURE')
while list(body.modifiers).index(armature_modifier)<len(body.modifiers)-1:
    bpy.ops.object.modifier_move_down(modifier=armature_modifier.name)

# Preserve the source mesh and masks in the editable .blend. Bake only the
# temporary runtime copy; do not replace the body with separate hand meshes.
def save_neutral_glb(name='alexei-rig-review.glb', posed=False, others=(), animations=False):
    staged = []
    bounds={}
    for original in [body, *wardrobe]:
        bpy.context.view_layer.update()
        ev=original.evaluated_get(bpy.context.evaluated_depsgraph_get())
        ps=[ev.matrix_world@v.co for v in ev.data.vertices]
        pts=[(v.x,v.z,-v.y) for v in ps]
        bounds[original.name+'_glb']=[[min(p[i] for p in pts) for i in range(3)],
                                           [max(p[i] for p in pts) for i in range(3)]]
        skin = next(m for m in original.modifiers if m.type == 'ARMATURE')
        skin.show_viewport = False
        bpy.context.view_layer.update()
        deps = bpy.context.evaluated_depsgraph_get()
        baked = bpy.data.meshes.new_from_object(original.evaluated_get(deps),
            depsgraph=deps, preserve_all_data_layers=True)
        skin.show_viewport = True
        export_obj = bpy.data.objects.new(original.name + '_glb', baked)
        scene.collection.objects.link(export_obj)
        export_obj.parent = rig
        export_obj.matrix_world = original.matrix_world
        for vg in original.vertex_groups:
            export_obj.vertex_groups.new(name=vg.name)
        deform = export_obj.modifiers.new('Skin', 'ARMATURE')
        deform.object = rig
        assert any(v.groups for v in baked.vertices), original.name
        staged.append(export_obj)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [rig, *staged, *others]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    rig['review_blender_world_aabb_y_up']=json.dumps(bounds)
    bpy.ops.export_scene.gltf(filepath=str(OUT / name), export_cameras=posed or animations,
        use_selection=True, export_animations=animations, export_morph=False, export_tangents=True,
        export_rest_position_armature=not posed, export_extras=True)
    for o in staged:
        bpy.data.objects.remove(o, do_unlink=True)

for o in [body, *wardrobe]:
    for material in o.data.materials:
        material.surface_render_method = 'DITHERED'
        if material.use_nodes:
            bs = next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            for link in list(bs.inputs['Alpha'].links):
                material.node_tree.links.remove(link)
            bs.inputs['Alpha'].default_value = 1
            for node in material.node_tree.nodes:
                if node.type == 'NORMAL_MAP':
                    node.inputs['Strength'].default_value = .38 if o is not body else .48
save_neutral_glb()

def update():
    bpy.context.view_layer.update()

def rotate_world(name, axis, degrees):
    bone = rig.pose.bones[name]
    old = bone.matrix.copy()
    pivot = old.translation
    bone.matrix = (Matrix.Translation(pivot) @ Quaternion(axis, math.radians(degrees)).to_matrix().to_4x4()
                   @ Matrix.Translation(-pivot) @ old)
    update()

def point_bone(name, direction):
    bone = rig.pose.bones[name]
    old = bone.matrix.copy()
    pivot = old.translation
    current = (bone.tail - bone.head).normalized()
    q = current.rotation_difference(Vector(direction).normalized())
    bone.matrix = Matrix.Translation(pivot) @ q.to_matrix().to_4x4() @ Matrix.Translation(-pivot) @ old
    update()

def place_arm(side, target, elbow_hint):
    upper, lower = (rig.pose.bones[f'{part}_{side}'] for part in ('upperarm', 'lowerarm'))
    shoulder = upper.head.copy()
    to_local = rig.matrix_world.inverted()
    axis = to_local @ Vector(target) - shoulder
    l1, l2 = upper.length, lower.length
    reach = min(axis.length, l1 + l2 - .004)
    axis.normalize()
    h = (l1*l1 + reach*reach - l2*l2)/(2*reach)
    pole = to_local @ Vector(elbow_hint) - shoulder
    pole -= axis * pole.dot(axis)
    elbow = shoulder + axis*h + pole.normalized()*math.sqrt(max(0., l1*l1 - h*h))
    point_bone(upper.name, elbow - shoulder)
    point_bone(lower.name, shoulder + axis*reach - lower.head)

before = set(scene.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/assets/chapter1/old-chair.glb'))
chair = [o for o in scene.objects if o not in before]
chair_roots = [o for o in chair if o.parent not in chair]
for o in chair_roots:
    o.rotation_euler.z += math.pi
    o.location.y += .115
update()

# Face -Y. Both soles stay below the knees; avoid a 90° pelvis rotation,
# which would swing the whole torso and compromise hip skinning.
rig.location = (0, .045, -.365)
update()
for side, sign in [('l', 1), ('r', -1)]:
    point_bone('thigh_'+side, (.068*sign, -.41, -.061))
    point_bone('calf_'+side, (.028*sign, .036, -.43))
    point_bone('foot_'+side, (.002*sign, -.125, -.059))
rotate_world('spine_01', Vector((1,0,0)), 7)
rotate_world('head', Vector((1,0,0)), -12)

place_arm('r', (-.239, -.320, .813), (-.298, -.065, .740))
place_arm('l', (.04, .237, .610), (.252, .141, .733))
point_bone('hand_r', (.26, -.92, -.23))
point_bone('hand_l', (-.8, .12, -.42))

def hand_axes(side):
    palm = rig.pose.bones[f'hand_{side}'].head.copy()
    pts = [rig.pose.bones[f'{finger}_01_{side}'].head.copy() for finger in ('index','middle','ring','pinky')]
    center = sum(pts, Vector()) / 4
    across = (pts[-1] - pts[0]).normalized()
    ahead = center - palm
    ahead = (ahead - across*ahead.dot(across)).normalized()
    outward = across.cross(ahead).normalized() * (1 if side=='r' else -1)
    return palm, center, across, ahead, outward

_, center, across, ahead, outward = hand_axes('r')
grip_open_basis={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
for finger, flex in {
    'index': (22, 36, 12), 'middle': (27, 42, 14),
    'ring': (29, 44, 17), 'pinky': (31, 42, 20),
}.items():
    for j, angle in enumerate(flex, 1):
        name = f'{finger}_{j:02d}_r'
        b = rig.pose.bones[name]
        axis = (b.tail-b.head).cross(-outward)
        if j == 1:
            axis = ahead.cross(-outward)
        elif j > 1:
            axis = ahead.cross(-outward)  # same hinge direction across the chain
        rotate_world(name, axis.normalized(), angle)
rotate_world('thumb_01_r', ahead, 22)
rotate_world('thumb_02_r', -across, 16)
rotate_world('thumb_03_r', -across, 12)

# The knife alone comes from the independent prop study. No meshes or
# custom armatures from the rejected hands are imported.
prop_path = Path(os.environ.get('GATE_KNIFE_SOURCE', ROOT/'art/knife-prop-review.blend'))
if prop_path.exists():
    with bpy.data.libraries.load(str(prop_path), link=False) as (src, dest):
        dest.objects = list(src.objects)
    for o in dest.objects:
        if o.type in {'MESH','EMPTY'}:
            scene.collection.objects.link(o)
    knife = next(o for o in dest.objects if o.type=='EMPTY' and o.parent is None)
    # Knife local +Z is the tip, and +X is the cutting side.
    kx, kz = ahead, -across
    ky = kz.cross(kx)
    rotation = Matrix((kx,ky,kz)).transposed().to_4x4()
    knife.matrix_world = Matrix.Translation(rig.matrix_world @ (center - ahead*.022 - outward*.025)) @ rotation

    # Refine the static study against the actual deformed mesh (not a replacement
    # hand). A contact score is diagnostic; visual review is still required.
    update()
    inv = knife.matrix_world.inverted() @ body.matrix_world
    basis = np.array(inv.to_3x3()).T * 1000
    offset = np.array(inv.translation) * 1000
    deps = bpy.context.evaluated_depsgraph_get()
    posed = body.evaluated_get(deps).data
    deform_groups = {g.index for g in body.vertex_groups if g.name in rig.data.bones}
    def dominant(v):
        candidates = [g for g in v.groups if g.group in deform_groups]
        return max(candidates, key=lambda w: w.weight).group if candidates else -1
    weights = np.array([dominant(v) for v in posed.vertices])
    buf = np.empty(len(weights)*3, np.float32)
    # Measured cross sections of the isolated walnut prop; positive Z = tip.
    rings = np.array([[-62,6,5],[-58,10,8],[-46,12,11],[-22,11,12],
                      [11,11,12],[35,12,11],[52,11,8],[57,8,5]])
    def measure():
        update()
        body.evaluated_get(deps).data.vertices.foreach_get('co', buf)
        return buf.reshape(-1,3) @ basis + offset

    def shaft(points):
        x,y,z = points.T
        a = np.interp(z,rings[:,0],rings[:,1])
        b = np.interp(z,rings[:,0],rings[:,2])
        radial=(np.sqrt((x/a)**2 + (y/b)**2)-1)*np.minimum(a,b)
        axial=np.maximum(z-56,-61-z)
        return np.sqrt(np.maximum(radial,0)**2+np.maximum(axial,0)**2)+np.minimum(np.maximum(radial,axial),0)

    contact_report = {}
    for digit in ('index','middle','ring','pinky','thumb'):
        names = [f'{digit}_{j:02d}_r' for j in (1,2,3)]
        parts = [rig.pose.bones[n] for n in names]
        own = np.flatnonzero(np.isin(weights, [body.vertex_groups[n].index for n in names]))
        pads = np.flatnonzero(weights==body.vertex_groups[names[-1]].index)
        assert len(pads) > 8, (digit, len(pads))
        tip_axis = ahead.cross(-outward).normalized()
        axes = (tip_axis, outward, ahead)
        thumb = digit=='thumb'
        for p in parts:
            if p.rotation_mode != 'QUATERNION':
                old_matrix = p.matrix.copy()
                p.rotation_mode = 'QUATERNION'
                p.matrix = old_matrix
        update()
        rest = [p.rotation_quaternion.copy() for p in parts]
        local = [[p.matrix.to_3x3().inverted() @ axis for axis in axes] for p in parts]
        slots = [(0,0,48),(1,0,52),(2,0,39),(0,1,18),(1,1,14)]
        if thumb:
            slots = [(0,0,66),(1,0,64),(2,0,46),(0,1,70),(1,1,36),
                     (0,2,72),(1,2,44),(2,2,30)]

        def set_pose(values):
            q = [q.copy() for q in rest]
            for angle, (j,k,_) in zip(values,slots):
                q[j] = q[j] @ Quaternion(local[j][k], math.radians(float(angle)))
            for b, pose in zip(parts,q):
                b.rotation_quaternion = pose

        def cost(a):
            set_pose(a)
            xyz = measure()
            d = shaft(xyz[own])
            pen = np.minimum(d+.03,0)
            tip = shaft(xyz[pads])
            n = max(8,len(tip)//12)
            ix = np.argpartition(tip,n)[:n]
            near = tip[ix]
            pad = xyz[pads][ix].mean(axis=0)
            # Contact on the inward half of the shaft, not just at its tip.
            goal = np.array([-11.,-1.,22.]) if thumb else np.array([-6.,13.,pad[2]])
            return (pen.dot(pen)*(.60 if thumb else .35) + min(pen)**2*(60 if thumb else 18) + ((near-.3)**2).mean()*3
                    + np.sum((pad-goal)**2)*(.35 if thumb else .11) + np.mean(a*a)*.004)

        a = np.zeros(len(slots)); best = cost(a)
        for step in (22,14,8,4,2,1,.4,.15):
            for _ in range(3):
                for i,(_,_,limit) in enumerate(slots):
                    found = a
                    for direction in (1,-1):
                        v = a.copy()
                        v[i] = np.clip(v[i] + direction*step,-limit,limit)
                        c = cost(v)
                        if c < best:
                            best = c; found = v
                    a = found
        set_pose(a)
        xyz = measure()
        contact_report[digit] = {'padClearanceMm':round(float(shaft(xyz[pads]).min()), 2),
                                 'shaftClearanceMm':round(float(shaft(xyz[own]).min()),2),
                                 'adjustmentDegrees':[round(float(v),2) for v in a]}
    scene['grip_review_mm'] = json.dumps(contact_report)
    print('STATIC CONTACT', scene['grip_review_mm'], flush=True)
    skin_detail.show_viewport=True
    update()

world = bpy.data.worlds.new('Dark graphite')
scene.world=world
world.use_nodes=True
node = next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
node.inputs['Color'].default_value=(.10,.113,.143,1)
node.inputs['Strength'].default_value=.5
floor_mesh=bpy.data.meshes.new('Review stage')
floor_mesh.from_pydata([(-3,-3,0),(3,-3,0),(3,3,0),(-3,3,0)],[],[(0,1,2,3)])
floor=bpy.data.objects.new('Review stage · floor datum',floor_mesh)
scene.collection.objects.link(floor)
floor_mat=bpy.data.materials.new('Matte graphite stage')
floor_mat.diffuse_color=(.11,.12,.14,1)
floor_mat.use_nodes=True
floor_bs=next(n for n in floor_mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
floor_bs.inputs['Base Color'].default_value=(.11,.12,.14,1)
floor_bs.inputs['Roughness'].default_value=.9
floor.data.materials.append(floor_mat)

def camera(name, at, direction, ortho=None):
    data=bpy.data.cameras.new(name)
    cam=bpy.data.objects.new(name,data);scene.collection.objects.link(cam)
    cam.location=Vector(at)+Vector(direction)
    cam.rotation_euler=(-Vector(direction)).to_track_quat('-Z','Y').to_euler()
    if ortho:
        data.type='ORTHO'
        data.ortho_scale=ortho
    else:
        data.lens=31
    return cam

front=camera('01 seated front', (0, -.11,.68), (.35,-2.6,.55), 1.68)
camera('02 seated side', (0,-.06,.68), (2.65,-.5,.4),1.68)
camera('03 seated rear', (0,.05,.73), (-.4,2.55,.58),1.52)
look_at = (-.09,-.40,.66)
eye=Vector((0,-.237,1.310))
camera('04 first-person framing', look_at, eye-Vector(look_at))
_, center, across, ahead, outward = hand_axes('r')
for name, direction in (
    ('05 grip dorsal', outward+.6*ahead),
    ('06 grip palm', -outward+1.25*ahead),
    ('07 grip thumb side', -across-.5*outward),
    ('08 grip little-finger side', across-.5*outward),
):
    if name.startswith('08'):
        direction = Vector((-.8,-1.,.65))
    cam=camera(name, knife.matrix_world.translation, direction.normalized()*.34, .31)
    cam.data.clip_start=.005

for index,(at, color, power, size) in enumerate((
    ((-1.2,-1.4,2.2), (1,.86,.70), 150,.95),
    ((1.3,-.38,1.55), (.72,.84,1), 110,1.20),
    ((.6,1.1,2.1), (.88,.94,1), 135,.75),
)):
    l=bpy.data.lights.new('Softbox '+str(index),type='AREA')
    l.energy=power;l.size=size;l.color=color
    ob=bpy.data.objects.new(l.name,l);scene.collection.objects.link(ob)
    ob.location=at;ob.rotation_euler=(Vector((0,-.18,.78))-ob.location).to_track_quat('-Z','Y').to_euler()

scene.camera=front
scene.render.resolution_x=720;scene.render.resolution_y=660
scene.render.resolution_percentage=100
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.view_settings.view_transform='AgX'
props = [floor,*chair,*[o for o in scene.objects if o.type=='CAMERA']]
if prop_path.exists():
    props.extend([knife,*knife.children_recursive])
save_neutral_glb('alexei-seated-review.glb', posed=True, others=props)
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version=0
def frame_character():
    scene.camera=front
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active=rig
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            view=area.spaces.active
            view.region_3d.view_location=Vector((0,-.09,.70))
            view.region_3d.view_distance=2.6
            view.region_3d.view_rotation=front.rotation_euler.to_quaternion()
            view.region_3d.view_perspective='PERSP'
            view.shading.type='MATERIAL'
            view.overlay.show_overlays=False
frame_character()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'alexei-seated-review.blend'),compress=True)
print(json.dumps({
    'source_vertices':len(body.data.vertices), 'bones':len(rig.data.bones),
    'finger_bones':sum(b.name.startswith(('index_','middle_','ring_','pinky_','thumb_')) for b in rig.data.bones),
    'clothes': [o.name for o in wardrobe],
}))
for cam in sorted((o for o in scene.objects if o.type=='CAMERA'), key=lambda o:o.name):
    if os.environ.get('GATE_REVIEW_RENDER')=='0':
        break
    if os.environ.get('GATE_REVIEW_VIEWS') and cam.name[:2] not in os.environ['GATE_REVIEW_VIEWS'].split(','):
        continue
    scene.camera=cam
    scene.render.filepath=str(OUT/(cam.name+'.png'))
    bpy.ops.render.render(write_still=True)

# Stage C is opt-in and may only be authored after checking the static A/B
# stills. This is a hand-closing study, not the intro liberation sequence.
if os.environ.get('GATE_AUTHOR_GRIP')=='1':
    assert prop_path.exists(), 'The reviewed knife prop is required'
    closed={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
    saved=knife.matrix_world.copy()
    knife.parent=rig;knife.parent_type='BONE';knife.parent_bone='hand_r'
    update()
    knife.matrix_world=saved
    update()
    assert max(abs(knife.matrix_world[i][j]-saved[i][j]) for i in range(4) for j in range(4))<1e-5
    action=bpy.data.actions.new('KnifePowerGripClose')
    action.use_fake_user=True
    rig.animation_data_create().action=action
    timing={'thumb':(5,33),'index':(12,35),'middle':(10,38),'ring':(8,40),'pinky':(6,42)}
    for bone in rig.pose.bones:
        matrix=bone.matrix_basis.copy()
        bone.rotation_mode='QUATERNION'
        bone.matrix_basis=matrix
    for frame in range(1,49):
        scene.frame_set(frame)
        for bone in rig.pose.bones:
            final=closed[bone.name]
            digit=next((d for d in timing if bone.name.startswith(d+'_') and bone.name.endswith('_r')),None)
            if digit:
                first,last=timing[digit]
                phalanx=int(bone.name.split('_')[1])-1
                if digit=='thumb':
                    first,last=((2,16),(16,33),(26,44))[phalanx]
                    # Approach in an opposed pre-grasp, rather than sweeping a
                    # fully extended thumb across the blade. The eventual
                    # pickup must reach this pose before contacting the knife.
                    authored_time=17+(frame-1)*31/47
                    offset=0
                else:
                    authored_time=frame
                    offset=phalanx*2
                t=max(0.,min(1.,(authored_time-first-offset)/(last-first)))
                t=t*t*(3-2*t)
                initial=grip_open_basis[bone.name]
                loc=initial.to_translation().lerp(final.to_translation(),t)
                rot=initial.to_quaternion().slerp(final.to_quaternion(),t)
                scale=initial.to_scale().lerp(final.to_scale(),t)
            else:
                loc,rot,scale=final.decompose()
            bone.location=loc;bone.rotation_quaternion=rot;bone.scale=scale
            for path in ('location','rotation_quaternion','scale'):
                bone.keyframe_insert(data_path=path,frame=frame,group=bone.name)
        # A CMC abduction arc carries the thumb around the hilt. Direct
        # quaternion interpolation cut through it even though both end poses
        # looked plausible; this intermediate was inspected separately.
        update()
        thumb_time=17+(frame-1)*31/47
        phase=max(0.,min(1.,(thumb_time-1)/43))
        rotate_world('thumb_01_r',ahead,38*math.sin(math.pi*phase))
        rig.pose.bones['thumb_01_r'].keyframe_insert(
            data_path='rotation_quaternion',frame=frame,group='thumb_01_r')
    scene.frame_start=1;scene.frame_end=48;scene.render.fps=24
    scene.frame_set(48);update()
    save_neutral_glb('alexei-grip-close.glb',others=props,animations=True)
    scene['review_status']='Stage C hand-close study; no rope/pickup/stand-up action yet'
    frame_character()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'alexei-seated-review.blend'),compress=True)
