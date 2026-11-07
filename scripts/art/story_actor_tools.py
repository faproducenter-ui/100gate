"""Native MPFB actor utilities. No replacement body geometry or bone scaling."""
import bpy, math
from mathutils import Matrix, Vector, Quaternion
from native_pose_tools import two_bone_ik

def ease(t, a, b):
    x=max(0.,min(1.,(t-a)/(b-a)))
    return x*x*(3-2*x)

def clear_pose(rig):
    rig.animation_data_clear()
    rig.rotation_mode='QUATERNION'
    rig.matrix_world=Matrix.Identity(4)
    for p in rig.pose.bones:
        p.rotation_mode='QUATERNION'
        p.matrix_basis=Matrix.Identity(4)
        for c in list(p.constraints):p.constraints.remove(c)
    bpy.context.view_layer.update()

def rotate(rig, name, world_axis, degrees):
    p=rig.pose.bones[name]
    axis=p.bone.matrix_local.to_3x3().inverted()@Vector(world_axis)
    p.rotation_quaternion=p.rotation_quaternion@Quaternion(axis.normalized(),math.radians(degrees))

def arm(rig, side, target_local, pole_local, orientation=None):
    hand=rig.data.bones['hand_'+side]
    if orientation is None:
        direction=Vector((.035 if side=='l' else -.035,-.13,-1)).normalized()
        source=hand.matrix_local.to_3x3()
        orientation=(source@Vector((0,1,0))).rotation_difference(direction).to_matrix()@source
    return two_bone_ik(rig,side,rig.matrix_world@Vector(target_local),
        rig.matrix_world@Vector(pole_local),rig.matrix_world.to_3x3()@orientation)

def pose_relaxed(rig, t, speaker=False, gesture=0.):
    # Individually authored degrees, not identical finger rotations.
    rotate(rig,'spine_02',(0,1,0),.8*math.sin(t*1.1))
    rotate(rig,'spine_03',(1,0,0),.45*math.sin(t*1.9))
    rotate(rig,'neck_01',(0,0,1),1.0*math.sin(t*.7))
    rotate(rig,'head',(1,0,0),(1.6 if speaker else .8)*math.sin(t*2.1))
    for side,sign in [('l',1),('r',-1)]:
        g=gesture if side=='r' else .15*gesture
        arm(rig,side,(sign*(.245+.025*g),-.06-.22*g,.93+.23*g),
            (sign*.42,.025,1.17))
        for finger,base in [('index',7),('middle',10),('ring',13),('pinky',16)]:
            for joint,factor in [(1,1),(2,.7),(3,.35)]:
                name=f'{finger}_{joint:02}_{side}'
                if name in rig.pose.bones:rig.pose.bones[name].rotation_quaternion=Quaternion((1,0,0),math.radians(base*factor*(1-.55*g)))
        for joint,angle in [(1,-3),(2,5),(3,8)]:
            rig.pose.bones[f'thumb_{joint:02}_{side}'].rotation_quaternion=Quaternion((1,0,0),math.radians(angle))
    bpy.context.view_layer.update()

def actor_meshes(rig):
    return [o for o in bpy.context.scene.objects if o.type=='MESH' and
        any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers)]

def floor_offset(meshes):
    deps=bpy.context.evaluated_depsgraph_get()
    boots=[o for o in meshes if 'boot' in o.name.lower() or 'shoe' in o.name.lower()]
    objects=boots or meshes
    return -min((o.matrix_world@v.co).z for o in objects for v in o.evaluated_get(deps).data.vertices)

def export_actor(rig, meshes, path, stem):
    """Evaluate masks/subdivision BEFORE skin; retain editable source originals."""
    scene=bpy.context.scene;scene.frame_set(scene.frame_start)
    staged=[]
    for original in meshes:
        skin=next(m for m in original.modifiers if m.type=='ARMATURE')
        visible=skin.show_viewport;skin.show_viewport=False
        bpy.context.view_layer.update()
        deps=bpy.context.evaluated_depsgraph_get()
        baked=bpy.data.meshes.new_from_object(original.evaluated_get(deps),depsgraph=deps,preserve_all_data_layers=True)
        skin.show_viewport=visible
        obj=bpy.data.objects.new(stem+'_'+original.name.split('body')[-1].strip('. ') if 'body' in original.name else stem+'_'+original.name,baked)
        if not obj.name:obj.name=stem+'_skin'
        scene.collection.objects.link(obj);obj.parent=rig;obj.matrix_world=original.matrix_world
        for group in original.vertex_groups:obj.vertex_groups.new(name=group.name)
        deform=obj.modifiers.new('Native original skin weights','ARMATURE');deform.object=rig
        assert any(v.groups for v in baked.vertices),original.name
        staged.append(obj)
    # Keep original high-resolution textures in the saved source .blend.
    for image in bpy.data.images:
        if image.type=='IMAGE' and max(image.size)>1024:
            w,h=image.size;image.scale(round(w*1024/max(w,h)),round(h*1024/max(w,h)))
    bpy.ops.object.select_all(action='DESELECT')
    for o in [rig,*staged]:o.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(path),use_selection=True,
        export_animations=True,export_animation_mode='SCENE',export_anim_scene_split_object=False,
        export_anim_slide_to_zero=True,export_force_sampling=True,export_frame_range=True,
        export_rest_position_armature=True,export_skins=True,export_morph=False,
        export_tangents=True,export_cameras=False,export_extras=True,
        export_image_format='JPEG',export_jpeg_quality=88)
    for o in staged:bpy.data.objects.remove(o,do_unlink=True)
