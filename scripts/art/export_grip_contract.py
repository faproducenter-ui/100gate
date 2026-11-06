"""Read the existing accepted native hand source; no replacement geometry.

blender --background art/hand-knife-contact.blend --python-exit-code 1
        --python scripts/art/export_grip_contract.py
"""
import bpy,json,hashlib
from pathlib import Path
s=bpy.context.scene;s.frame_set(241);bpy.context.view_layer.update()
r=next(o for o in s.objects if o.type=='ARMATURE');k=s.objects['Cinematic field knife']
h=r.matrix_world@r.pose.bones['hand_r'].matrix
out={'source':'art/hand-knife-contact.blend','sourceSha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'frame':241,
 'socket':[list(row) for row in h.inverted()@k.matrix_world],
 'handPose':[list(row) for row in r.pose.bones['hand_r'].matrix],
 'handRest':[list(row) for row in r.data.bones['hand_r'].matrix_local],
 'bones':{p.name:{'pose':[list(row) for row in p.matrix],'rest':[list(row) for row in p.bone.matrix_local]} for p in r.pose.bones if p.name.endswith('_r') and p.name.startswith(('thumb','index','middle','ring','pinky'))}}
Path('art/provenance/native-left-grip-contract.json').write_text(json.dumps(out,indent=2))
print('Exported the original native grip contract, frame241.')
