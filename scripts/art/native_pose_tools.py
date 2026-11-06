"""Analytic native two-bone IK, batched into local bases without depsgraph churn.

Caller updates the rig after parent/torso changes and once after independent
chains. Bone.convert_local_to_pose respects the original hierarchy/rest axes.
No constraints, extra human meshes, arbitrary bone translation or scale hacks.
"""
import math
from mathutils import Vector,Matrix,Quaternion

def set_pose_matrix(bone,desired,parent_matrix=None):
    kwargs={'invert':True}
    if bone.parent:
        kwargs['parent_matrix']=parent_matrix if parent_matrix is not None else bone.parent.matrix
        kwargs['parent_matrix_local']=bone.parent.bone.matrix_local
    bone.matrix_basis=bone.bone.convert_local_to_pose(desired,bone.bone.matrix_local,**kwargs)

def two_bone_ik(rig,side,target,pole,orientation,kind='arm'):
    a=rig.pose.bones[('upperarm_' if kind=='arm' else 'thigh_')+side]
    b=rig.pose.bones[('lowerarm_' if kind=='arm' else 'calf_')+side]
    end=rig.pose.bones[('hand_' if kind=='arm' else 'foot_')+side]
    old_a=a.matrix.copy();old_b=b.matrix.copy();h=old_a.translation
    inv=rig.matrix_world.inverted();p=inv@Vector(target);direction=p-h;distance=direction.length;direction.normalize()
    l1=a.bone.length;l2=b.bone.length
    if not abs(l1-l2)+1e-5<distance<l1+l2-1e-5:raise ValueError(f'Unreachable {kind}/{side}: {distance} vs {l1+l2}')
    x=(l1*l1+distance*distance-l2*l2)/(2*distance)
    n=inv@Vector(pole)-h;n=(n-direction*n.dot(direction)).normalized()
    elbow=h+direction*x+n*math.sqrt(max(0,l1*l1-x*x))
    upper_direction=(elbow-h).normalized()
    ra=(old_a.to_3x3()@Vector((0,1,0))).rotation_difference(upper_direction).to_matrix()@old_a.to_3x3()
    if kind=='arm':
        u=(a.bone.tail_local-a.bone.head_local).normalized();v=(b.bone.tail_local-b.bone.head_local).normalized()
        native=a.bone.matrix_local.to_3x3().inverted()@u.cross(v).normalized()
        current=ra@native;goal=(elbow-h).cross(p-elbow).normalized()
        current=(current-upper_direction*current.dot(upper_direction)).normalized()
        goal=(goal-upper_direction*goal.dot(upper_direction)).normalized()
        angle=math.atan2(upper_direction.dot(current.cross(goal)),current.dot(goal))
        ra=Quaternion(upper_direction,angle).to_matrix()@ra
    ma=Matrix.Translation(h)@ra.to_4x4()
    lower_direction=(p-elbow).normalized()
    local_orientation=rig.matrix_world.to_3x3().inverted()@orientation
    if kind=='arm':
        relation=b.bone.matrix_local.to_3x3().inverted()@end.bone.matrix_local.to_3x3()
        desired=local_orientation@relation.inverted()
        rb=(desired@Vector((0,1,0))).rotation_difference(lower_direction).to_matrix()@desired
    else:
        after_a=ma@old_a.inverted()@old_b
        rb=(after_a.to_3x3()@Vector((0,1,0))).rotation_difference(lower_direction).to_matrix()@after_a.to_3x3()
    mb=Matrix.Translation(elbow)@rb.to_4x4();me=Matrix.Translation(p)@local_orientation.to_4x4()
    set_pose_matrix(a,ma);set_pose_matrix(b,mb,ma);set_pose_matrix(end,me,mb)
    return rig.matrix_world@elbow
