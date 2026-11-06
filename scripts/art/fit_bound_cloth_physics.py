"""Physical bound-pose cloth fitting on the original 2,126-vertex garment.

The simulation is an ART fitting pass, not an intro-animation substitute.
Original cages are retained; the settled surface becomes an editable corrective
on the four-weight runtime garment. No cloth simulation is shipped to the web.
"""
import bpy,sys,math,json,time
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from cinematic_geometry import getmesh
out=Path.cwd()/'outputs/cinematic-intro';s=bpy.context.scene;s.frame_set(1)
r=next(o for o in s.objects if o.type=='ARMATURE')
shirt=next(o for o in s.objects if o.type=='MESH' and 'fisherman' in o.name and not o.get('authoring_archive'))
cage=next(o for o in s.objects if o.type=='MESH' and 'fisherman' in o.name and o.get('authoring_archive'))
reference=next(o for o in s.objects if o.get('cloth_reference'));reference.hide_set(False)
old_action=r.animation_data.action;old_slot=r.animation_data.action_slot
root=r.matrix_world.copy();bases={p.name:(p.location.copy(),p.rotation_quaternion.copy(),p.scale.copy()) for p in r.pose.bones}
clothes_keys=shirt.data.shape_keys
if clothes_keys.animation_data.action:clothes_keys.animation_data.action=clothes_keys.animation_data.action.copy()
old_clothes_action=clothes_keys.animation_data.action;old_clothes_slot=clothes_keys.animation_data.action_slot
saved_values={k.name:k.value for k in clothes_keys.key_blocks}
clothes_keys.animation_data.action=None
for key in clothes_keys.key_blocks:
    if key.name.startswith('Cine · '):key.value=0
sim=cage.copy();sim.data=cage.data.copy();sim.name='ART FIT | original sweater · low-resolution cloth'
s.collection.objects.link(sim);sim['authoring_archive']=True;sim.hide_render=False;sim.hide_set(False)
assert sim.data!=cage.data
if sim.data.shape_keys:
    sim.shape_key_clear()
for mod in list(sim.modifiers):
    if mod.type!='ARMATURE':sim.modifiers.remove(mod)
pin=sim.vertex_groups.new(name='ART neck and cuff pins')
top=max(v.co.z for v in sim.data.vertices)
reference.data.calc_loop_triangles()
bind_skin=BVHTree.FromPolygons([v.co for v in reference.data.vertices],
    [tuple(t.vertices) for t in reference.data.loop_triangles],all_triangles=True)
for v in sim.data.vertices:
    if v.co.z>top-.025:pin.add([v.index],1,'REPLACE')
    for side in ('r','l'):
        wrist=r.data.bones['hand_'+side].head_local;fore=r.data.bones['lowerarm_'+side]
        axis=(fore.tail_local-fore.head_local).normalized();a=(v.co-wrist).dot(axis);radial=(v.co-wrist-axis*a).length
        if -.065<a<.04 and radial<.065:
            t=max(0,min(1,(a+.065)/.050));t=t*t*(3-2*t)
            # Fit the original ribbed hem to the ORIGINAL native forearm in
            # bind space, then pin the rim fully. The old .85 pin allowed the
            # cuff to sag into inflated folds; enlarging a rope around that
            # fold would pass intersections but look visibly loose.
            target_axial=a-.023*t
            direction=(v.co-wrist-axis*a).normalized()
            center=wrist+axis*target_axial
            hit,n,_,_=bind_skin.ray_cast(center,direction,.08)
            if hit is None:raise RuntimeError('Missing native bind wrist skin '+side)
            target=hit+n*.004
            v.co=v.co.lerp(target,t)
            if a>-.018:pin.add([v.index],1,'REPLACE')
collision=reference.modifiers.new('ART cloth fitting collider','COLLISION')
reference.collision.thickness_outer=.003;reference.collision.thickness_inner=.001
cloth=sim.modifiers.new('ART knitted wool physical fit','CLOTH');cs=cloth.settings
cs.quality=8;cs.mass=.15;cs.air_damping=3;cs.vertex_group_mass=pin.name
cs.tension_stiffness=25;cs.compression_stiffness=25;cs.shear_stiffness=10;cs.bending_stiffness=.4
cs.use_dynamic_mesh=True
cc=cloth.collision_settings;cc.use_collision=True;cc.collision_quality=8;cc.distance_min=.004
cc.use_self_collision=True;cc.self_distance_min=.004
sub=sim.modifiers.new('Original garment surface subdivision','SUBSURF');sub.levels=sub.render_levels=2
end=130;cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=end
s.frame_start=1;s.frame_end=end;s.render.fps=30
r.animation_data_clear();r.rotation_mode='QUATERNION'
target_location,target_q,target_scale=root.decompose();start_location=Vector((target_location.x,target_location.y,.01566))
for frame,t in ((1,0),(80,1),(end,1)):
    r.location=start_location.lerp(target_location,t);r.rotation_quaternion=Quaternion().slerp(target_q,t);r.scale=target_scale
    for prop in ('location','rotation_quaternion','scale'):r.keyframe_insert(prop,frame=frame)
    for p in r.pose.bones:
        loc,q,scale=bases[p.name];p.location=loc*t;p.rotation_quaternion=Quaternion().slerp(q,t);p.scale=Vector((1,1,1)).lerp(scale,t)
        for prop in ('location','rotation_quaternion','scale'):p.keyframe_insert(prop,frame=frame,group=p.name)
started=time.time()
for frame in range(1,end+1):
    s.frame_set(frame);bpy.context.view_layer.update()
    # Evaluation is required; merely advancing the timeline does not run cloth.
    deps=bpy.context.evaluated_depsgraph_get();obj=sim.evaluated_get(deps);mesh=obj.to_mesh();obj.to_mesh_clear()
    if frame%10==0:print('CLOTH FIT FRAME',frame,'seconds',round(time.time()-started,2),flush=True)
settled,_=getmesh(sim)
assert len(settled)==len(shirt.data.vertices),(len(settled),len(shirt.data.vertices))
# Restore the actual four-pose rig, not the artificial fitting transition.
fit_action=r.animation_data.action;r.animation_data.action=old_action;r.animation_data.action_slot=old_slot
r.matrix_world=root;s.frame_set(1);bpy.context.view_layer.update()
for key in clothes_keys.key_blocks:
    if key.name.startswith('Cine · '):key.value=0
base=clothes_keys.key_blocks['Basis'];key=clothes_keys.key_blocks['Cine · Bound skin clearance']
for v,b in zip(key.data,base.data):v.co=b.co
key.value=1;bpy.context.view_layer.update();initial,_=getmesh(shirt)
world=shirt.matrix_world;to_arm=r.matrix_world.inverted()@world;from_arm=world.inverted()@r.matrix_world
maximum=0
for i,v in enumerate(shirt.data.vertices):
    weights=[(shirt.vertex_groups[g.group].name,g.weight) for g in v.groups if shirt.vertex_groups[g.group].name in r.data.bones]
    blend=Matrix(((0,0,0,0),)*4);total=sum(w for _,w in weights)
    for name,w in weights:blend+=(r.pose.bones[name].matrix@r.data.bones[name].matrix_local.inverted())*(w/total)
    delta=settled[i]-initial[i];maximum=max(maximum,delta.length)
    key.data[i].co=base.data[i].co+(world@from_arm@blend@to_arm).to_3x3().inverted()@delta
# Other existing keys must not be double-added to the captured physical shape.
for k in clothes_keys.key_blocks:
    if k.name.startswith('Cine · '):k.value=0
key.value=1
if old_clothes_action:
    clothes_keys.animation_data.action=old_clothes_action;clothes_keys.animation_data.action_slot=old_clothes_slot
    # Captured shape includes the entire hem. Use no additional hem on BOUND.
    for n in ('Cine · Seated waist cloth clearance','Cine · Ground cloth contact'):
        k=clothes_keys.key_blocks[n];k.value=0;k.keyframe_insert('value',frame=1)
sim.hide_render=True;sim.hide_set(True);reference.hide_set(True)
s.frame_end=241;s.frame_set(1);s.name='100gate | Physical sweater fitting · review'
for name,pos,target in [('Cine · Shoulder front',(.65,-.9,1.37),(.11,0,1.04)),('Cine · Shoulder back',(.65,.92,1.36),(.11,.08,1.04))]:
    data=bpy.data.cameras.new(name);cam=bpy.data.objects.new(name,data);s.collection.objects.link(cam);data.lens=52;data.clip_start=.015
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
(out/'physical-cloth-fit.json').write_text(json.dumps({'frames':end,'seconds':time.time()-started,'maxWorldChangeMm':maximum*1000,
    'sourceGarmentVertices':len(sim.data.vertices),'runtimeSurfaceVertices':len(settled),'fitOnlyNotIntroAnimation':True},indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'cinematic-cloth-physical.blend'),compress=True)
