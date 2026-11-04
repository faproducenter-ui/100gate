"""Bake CC0 Aksel skin onto the existing hand topology. Run in Blender's hand QA scene."""
import bpy
from pathlib import Path
from mathutils import Vector

ROOT=Path(r"C:/Users/libde/Documents/Codex/2026-11-02/new-chat")
SOURCE=ROOT/"work/100gate-refinement-assets/skin"
cols=[c for c in bpy.context.scene.collection.children if c.get("100gate_asset_id") in {"player-hand-open","player-hand-grip"}]
assert len(cols)==2
objects=[next(o for o in c.objects if o.type=="MESH") for c in sorted(cols,key=lambda c:c.get("100gate_asset_id"),reverse=True)]
hand=objects[0]
scene=bpy.context.scene
old_engine=scene.render.engine
scene.render.engine="CYCLES"
scene.cycles.device="CPU"
scene.cycles.samples=1
scene.render.bake.margin=12

# Reverse the known source export normalization; preserve the old UV layer for rollback.
for ob in objects:
    original=ob.data.uv_layers.get("MakeHuman source UV") or ob.data.uv_layers.new(name="MakeHuman source UV")
    detail=ob.data.uv_layers[0]
    for i,d in enumerate(detail.data):
        original.data[i].uv=(.010077+d.uv.x/1.7*(.554137-.010077),
                             .011539+d.uv.y/1.7*(.828554-.011539))
    ob.data.uv_layers.active=original
    game=ob.data.uv_layers.get("GameHandUV") or ob.data.uv_layers.new(name="GameHandUV")
    for i,d in enumerate(original.data):game.data[i].uv=d.uv
    ob.data.uv_layers.active=game
    game.active_render=True
for ob in scene.objects:ob.select_set(False)
hand.select_set(True)
bpy.context.view_layer.objects.active=hand
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.select_all(action="SELECT")
bpy.ops.uv.pack_islands(rotate=True,margin=.015)
bpy.ops.object.mode_set(mode="OBJECT")
atlas=hand.data.uv_layers.get("GameHandUV")
for ob in objects[1:]:
    target=ob.data.uv_layers.get("GameHandUV")
    assert len(target.data)==len(atlas.data)
    for i,d in enumerate(atlas.data):target.data[i].uv=d.uv

mat=bpy.data.materials.new("Alexei | Aksel skin PBR | CC0")
mat.use_nodes=True;mat.use_backface_culling=True
nodes=mat.node_tree.nodes;links=mat.node_tree.links;nodes.clear()
output=nodes.new("ShaderNodeOutputMaterial")
bs=nodes.new("ShaderNodeBsdfPrincipled");bs.inputs["Roughness"].default_value=.7
emission=nodes.new("ShaderNodeEmission")
uv=nodes.new("ShaderNodeUVMap");uv.uv_map="MakeHuman source UV"
textures={}
for key,file in [("color","Aksel_Skin_diffuse.png"),("normal","Aksel_Skin_NRM.png"),("spec","Aksel_Skin_SPEC.png")]:
    im=bpy.data.images.load(str(SOURCE/file),check_existing=True)
    im.colorspace_settings.name="sRGB" if key=="color" else "Non-Color"
    n=nodes.new("ShaderNodeTexImage");n.image=im;links.new(uv.outputs["UV"],n.inputs["Vector"]);textures[key]=n
normal=nodes.new("ShaderNodeNormalMap");normal.uv_map="MakeHuman source UV"
normal.inputs["Strength"].default_value=.55
links.new(textures["normal"].outputs["Color"],normal.inputs["Color"])
links.new(normal.outputs["Normal"],bs.inputs["Normal"])
links.new(textures["color"].outputs["Color"],bs.inputs["Base Color"])
rough=nodes.new("ShaderNodeMapRange")
rough.inputs["From Min"].default_value=0;rough.inputs["From Max"].default_value=1
rough.inputs["To Min"].default_value=.77;rough.inputs["To Max"].default_value=.48
links.new(textures["spec"].outputs["Color"],rough.inputs["Value"])
for ob in objects:
    ob.data.materials.clear();ob.data.materials.append(mat)
maps={}
target=nodes.new("ShaderNodeTexImage")
for kind in ["color","roughness","normal"]:
    image=bpy.data.images.new("Alexei | baked hand "+kind,width=1024,height=1024,alpha=False)
    image.colorspace_settings.name="sRGB" if kind=="color" else "Non-Color"
    target.image=image;nodes.active=target
    for link in list(output.inputs["Surface"].links):links.remove(link)
    if kind=="normal":
        links.new(bs.outputs["BSDF"],output.inputs["Surface"])
        bpy.ops.object.bake(type="NORMAL",normal_space="TANGENT",uv_layer="GameHandUV")
    else:
        src=textures["color"].outputs["Color"] if kind=="color" else rough.outputs["Result"]
        for link in list(emission.inputs["Color"].links):links.remove(link)
        links.new(src,emission.inputs["Color"]);links.new(emission.outputs["Emission"],output.inputs["Surface"])
        bpy.ops.object.bake(type="EMIT",uv_layer="GameHandUV")
    image.pack();maps[kind]=image
    print("BAKED",kind,list(image.size))
# Keep only the baked graph in the game material; source UV and maps remain in the .blend.
nodes.clear()
output=nodes.new("ShaderNodeOutputMaterial");bs=nodes.new("ShaderNodeBsdfPrincipled")
bs.inputs["Metallic"].default_value=0
links.new(bs.outputs["BSDF"],output.inputs["Surface"])
for kind in ["color","roughness","normal"]:
    t=nodes.new("ShaderNodeTexImage");t.image=maps[kind];t.label="CC0 Aksel skin: "+kind
    uv=nodes.new("ShaderNodeUVMap");uv.uv_map="GameHandUV";links.new(uv.outputs["UV"],t.inputs["Vector"])
    if kind=="normal":
        n=nodes.new("ShaderNodeNormalMap");n.uv_map="GameHandUV";n.inputs["Strength"].default_value=.7
        links.new(t.outputs["Color"],n.inputs["Color"]);links.new(n.outputs["Normal"],bs.inputs["Normal"])
    else:links.new(t.outputs["Color"],bs.inputs["Base Color" if kind=="color" else "Roughness"])
for ob in objects:
    ob["textured_skin"]=True
    ob.data.uv_layers.active=ob.data.uv_layers.get("GameHandUV")
scene.render.engine=old_engine
print("PBR_SKIN_COMPLETE: source UV retained, color/normal/roughness baked to a compact hand atlas")
