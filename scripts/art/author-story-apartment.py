"""Create the 22:42 apartment environment for the new 100gate story intro.

Run Blender 4.5: blender -b -t 6 --python scripts/art/author-story-apartment.py
This is a new, static set with a separate hinged leaf and no character animation.
"""
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
TEX = ROOT / "public" / "textures"
SOURCE = ROOT.parent / "100gate-art-sources"
QUALITY = "--quality-overhaul" in sys.argv
OUT = ROOT / "outputs" / ("quality-overhaul" if QUALITY else "story-intro") / "home"
PREFIX = "StoryHome_"
if QUALITY:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from story_apartment_quality import residential_view, table_reading

city_contract = None


def material(name, color, roughness=.62, metallic=0, emit=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emit:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emit
    return mat


def scanned(name, diffuse, normal, rough=None, normal_strength=.32):
    mat = material(name, (.5, .5, .5))
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    for path, data, socket, y in [
        (diffuse, False, "Base Color", 250),
        (rough, True, "Roughness", -70),
        (normal, True, "Normal", -380),
    ]:
        if path is None:
            continue
        img = nodes.new("ShaderNodeTexImage")
        img.image = bpy.data.images.load(str(path), check_existing=True)
        img.location = (-650, y)
        if data:
            img.image.colorspace_settings.name = "Non-Color"
        if socket == "Normal":
            n = nodes.new("ShaderNodeNormalMap")
            n.location = (-300, y)
            n.inputs["Strength"].default_value = normal_strength
            links.new(img.outputs["Color"], n.inputs["Color"])
            links.new(n.outputs["Normal"], shader.inputs["Normal"])
        else:
            links.new(img.outputs["Color"], shader.inputs[socket])
    return mat


def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def empty(name, location, yaw=None):
    obj = bpy.data.objects.new(PREFIX + name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    if yaw is not None:
        obj.rotation_euler.z = math.radians(yaw)
    obj.empty_display_size = .19
    return obj


def project_uv(obj, tile):
    layer = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
    for face in obj.data.polygons:
        axis = max(range(3), key=lambda i: abs(face.normal[i]))
        u, v = [(1, 2), (0, 2), (0, 1)][axis]
        for idx in face.loop_indices:
            p = obj.data.vertices[obj.data.loops[idx].vertex_index].co
            layer.data[idx].uv = ((p[u] + obj.location[u]) / tile,
                                  (p[v] + obj.location[v]) / tile)


def bevel(obj, width, segments):
    if width:
        for poly in obj.data.polygons:
            poly.use_smooth = True
        mod = obj.modifiers.new("Soft manufactured edges", "BEVEL")
        mod.width = width
        mod.segments = segments
        mod.harden_normals = True
        normal = obj.modifiers.new("Face-weighted normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True


def box(name, position, size, mat, edge=0, segments=2, tile=None, yaw=0, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    for vert in obj.data.vertices:
        for axis in range(3):
            vert.co[axis] *= size[axis]
    obj.data.update()
    obj.data.materials.append(mat)
    if tile:
        project_uv(obj, tile)
    bevel(obj, edge, segments)
    obj.rotation_euler.z = yaw
    if parent:
        obj.parent = parent
    return obj


def facade_box(name, position, size, mat, tile=None):
    """Add a static box without forcing a scene evaluation for each window part."""
    x, y, z = (axis*.5 for axis in size)
    obj = mesh(name, [(-x,-y,-z), (x,-y,-z), (x,y,-z), (-x,y,-z),
                      (-x,-y,z), (x,-y,z), (x,y,z), (-x,y,z)],
               [(3,2,1,0), (0,1,5,4), (1,2,6,5), (2,3,7,6), (3,0,4,7), (4,5,6,7)], mat)
    obj.location = position
    if tile:
        project_uv(obj, tile)
    return obj


def lathe(name, pos, profile, mat, count=28, cap=True):
    verts = [(r * math.cos(i * math.tau / count), r * math.sin(i * math.tau / count), z)
             for r, z in profile for i in range(count)]
    faces = [(j * count + i, j * count + (i + 1) % count,
              (j + 1) * count + (i + 1) % count, (j + 1) * count + i)
             for j in range(len(profile) - 1) for i in range(count)]
    if cap:
        faces += [tuple(reversed(range(count))),
                  tuple(range((len(profile) - 1) * count, len(profile) * count))]
    obj = mesh(name, verts, faces, mat)
    obj.location = pos
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return obj


def import_prop(path, name, center, yaw=0, height=None):
    original = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    parts = [o for o in bpy.data.objects if o not in original]
    root = empty(name, (0, 0, 0))
    for obj in parts:
        if obj.parent is None:
            matrix = obj.matrix_world.copy()
            obj.parent = root
            obj.matrix_world = matrix
    root.rotation_euler.z = yaw
    bpy.context.view_layer.update()
    bounds = [o.matrix_world @ Vector(p) for o in parts if o.type == "MESH" for p in o.bound_box]
    lo = Vector([min(v[i] for v in bounds) for i in range(3)])
    hi = Vector([max(v[i] for v in bounds) for i in range(3)])
    s = height / (hi.z - lo.z) if height else 1
    root.scale = (s, s, s)
    root.location = Vector(center) - Vector(((hi.x + lo.x) / 2, (hi.y + lo.y) / 2, lo.z)) * s
    return root, (hi.z - lo.z) * s


def aim(obj, at):
    obj.rotation_euler = (Vector(at) - obj.location).to_track_quat("-Z", "Y").to_euler()


def camera(name, position, target, focal_length):
    data = bpy.data.cameras.new(PREFIX+name)
    obj = bpy.data.objects.new(PREFIX+name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    data.lens = focal_length
    aim(obj, target)
    return obj


def lamp(name, kind, position, power, color, radius, target=None):
    data = bpy.data.lights.new(PREFIX + name, kind)
    data.energy = power
    data.color = color
    if kind == "AREA":
        data.size = radius
    elif kind == "POINT":
        data.shadow_soft_size = radius
    obj = bpy.data.objects.new(PREFIX + name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    if target:
        aim(obj, target)
    return obj


def curtain(name, x0, width, linen):
    verts = []
    xs, zs = 32, 7
    for j in range(zs + 1):
        v = j / zs
        for i in range(xs + 1):
            u = i / xs
            fold = math.sin(u * math.tau * 4.0 + (1-v) * .38)
            verts.append((x0 + width * u + .018 * fold * (1-v),
                          2.20 + (.047 + .020*(1-v)) * fold,
                          .55 + 1.79 * v + .017 * math.cos(u * math.tau * 4.0) * (1-v)))
    quads = [(j*(xs+1)+i, j*(xs+1)+i+1, (j+1)*(xs+1)+i+1, (j+1)*(xs+1)+i)
             for j in range(zs) for i in range(xs)]
    obj = mesh(name, verts, quads, linen)
    project_uv(obj, .65)
    for face in obj.data.polygons:
        face.use_smooth = True
    mod = obj.modifiers.new("Linen thickness", "SOLIDIFY")
    mod.thickness = .003


def room():
    global city_contract
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.name = "100gate | 22:42 apartment · static set"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    floor = scanned("Existing CC0 | finished oak floor", TEX / "wood-color.jpg", TEX / "wood-normal.jpg", TEX / "wood-rough.jpg", .3)
    # Modern paint rather than the abandoned-house plaster albedo. Share its documented
    # normal/roughness microstructure at a muted amplitude to avoid peeling-wall cues.
    paint = material("Warm greige wall paint", (.48, .407, .327), .74)
    nodes = paint.node_tree.nodes
    surface = nodes.get("Principled BSDF")
    grit = nodes.new("ShaderNodeTexImage")
    grit.image = bpy.data.images.load(str(TEX / "plaster-nor_gl.jpg"), check_existing=True)
    grit.image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = .12
    paint.node_tree.links.new(grit.outputs["Color"], normal.inputs["Color"])
    paint.node_tree.links.new(normal.outputs["Normal"], surface.inputs["Normal"])
    white = material("Satin ivory trim", (.69, .635, .51), .44)
    graphite = material("Graphite painted steel", (.021, .026, .025), .43, .28)
    walnut = scanned("Existing CC0 | veneer", SOURCE / "grey_oak_veneer_02" / "Diffuse.jpg",
                     SOURCE / "grey_oak_veneer_02" / "nor_gl.jpg", SOURCE / "grey_oak_veneer_02" / "Rough.jpg")
    linen = scanned("Existing CC0 | woven linen", TEX / "linen-diff.jpg", TEX / "linen-nor_gl.jpg", normal_strength=.23)
    rug = material("Flatwoven sage wool", (.095, .13, .105), .91)
    rug_stripe = material("Rug stitched slate threads", (.061, .094, .081), .9)
    fabric = material("Textured olive upholstery", (.106, .139, .113), .89)
    fabric_node = fabric.node_tree.nodes.new("ShaderNodeTexImage")
    upholstery_maps = SOURCE / "hessian_380"
    fabric_node.image = bpy.data.images.load(
        str(upholstery_maps / "nor_gl.jpg" if QUALITY else TEX / "linen-nor_gl.jpg"), check_existing=True)
    fabric_node.image.colorspace_settings.name = "Non-Color"
    fabric_normal = fabric.node_tree.nodes.new("ShaderNodeNormalMap")
    fabric_normal.inputs["Strength"].default_value = .23
    fabric.node_tree.links.new(fabric_node.outputs["Color"], fabric_normal.inputs["Color"])
    fabric.node_tree.links.new(fabric_normal.outputs["Normal"], fabric.node_tree.nodes.get("Principled BSDF").inputs["Normal"])
    if QUALITY:
        rough = fabric.node_tree.nodes.new("ShaderNodeTexImage")
        rough.image = bpy.data.images.load(str(upholstery_maps / "Rough.jpg"), check_existing=True)
        rough.image.colorspace_settings.name = "Non-Color"
        fabric.node_tree.links.new(rough.outputs["Color"], fabric.node_tree.nodes.get("Principled BSDF").inputs["Roughness"])
    rust = material("Ochre woven cushion", (.286, .106, .04), .86)
    blue = material("Indigo ceramic glaze", (.07, .125, .16), .34)
    ceramics = material("Unglazed cream ceramics", (.52, .415, .27), .52)
    brass = material("Brushed bronze", (.27, .13, .041), .34, .75)
    paper = material("Paperback page block", (.54, .459, .345), .83)
    ceiling = material("Ceiling white", (.64, .60, .52), .81)

    box("Subfloor · oak planks", (0, 0, -.07), (5.6, 4.8, .14), floor, tile=2.05)
    box("Ceiling", (0, 0, 2.76), (5.6, 4.8, .12), ceiling)
    box("West wall", (-2.85, 0, 1.35), (.12, 4.8, 2.7), paint, tile=.95)
    box("South wall", (0, -2.45, 1.35), (5.6, .12, 2.7), paint, tile=.95)
    # Window opening: (-1.22, .92) x (.88, 2.22).
    for name, pos, size in [
        ("Window wall west", (-2.01, 2.45, 1.35), (1.58, .12, 2.7)),
        ("Window wall east", (1.86, 2.45, 1.35), (1.88, .12, 2.7)),
        ("Window wall sill", (-.15, 2.45, .44), (2.14, .12, .88)),
        ("Window wall header", (-.15, 2.45, 2.46), (2.14, .12, .48)),
        ("Entry wall south", (2.85, -.92, 1.35), (.12, 2.96, 2.7)),
        ("Entry wall north", (2.85, 2.0, 1.35), (.12, .80, 2.7)),
        ("Entry wall header", (2.85, 1.08, 2.43), (.12, 1.04, .54)),
    ]:
        box(name, pos, size, paint, tile=.95)
    for name, pos, size in [
        ("Skirting west", (-2.775, 0, .052), (.039, 4.78, .104)),
        ("Skirting south", (0, -2.374, .052), (5.55, .039, .104)),
        ("Skirting north", (0, 2.372, .052), (5.55, .039, .104)),
        ("Skirting east south", (2.775, -.94, .052), (.039, 2.91, .104)),
        ("Skirting east north", (2.775, 2.01, .052), (.039, .74, .104)),
        ("Sill stone", (-.15, 2.382, .89), (2.30, .25, .05)),
        ("Window top", (-.15, 2.446, 2.19), (2.15, .17, .064)),
        ("Window base", (-.15, 2.446, .922), (2.15, .17, .064)),
        ("Window left", (-1.19, 2.446, 1.56), (.064, .17, 1.25)),
        ("Window right", (.89, 2.446, 1.56), (.064, .17, 1.25)),
        ("Window mullion", (-.15, 2.446, 1.56), (.066, .17, 1.25)),
        ("Door casing south", (2.805, .562, 1.065), (.22, .10, 2.13)),
        ("Door casing north", (2.805, 1.598, 1.065), (.22, .10, 2.13)),
        ("Door casing head", (2.805, 1.08, 2.117), (.22, 1.14, .10)),
    ]:
        box(name, pos, size, white, .004)
    if QUALITY:
        city_contract = residential_view(facade_box, material, scanned, SOURCE / "red_brick_plaster_patch_02")
    else:
        # The old reviewed city is retained only for reproducing that release.
        night = material("Evening sky through window", (.026, .048, .087), .92, emit=.40)
        exterior = material("Window exterior silhouette", (.008, .014, .025), .9, emit=.30)
        window_light = material("Remote warm apartment lights", (.39, .22, .085), .52, emit=1.10)
        box("Distant blue hour", (-.15, 3.2, 1.68), (3.10, .03, 2.30), night)
        for i, (x, height, width) in enumerate([(-1.17, 1.25, .43), (-.72, 1.52, .36), (-.31, 1.17, .39), (.12, 1.44, .45), (.59, 1.37, .37), (.96, 1.20, .29)]):
            box(f"City block {i}", (x, 3.12, height / 2), (width, .06, height), exterior)
            box(f"City roof parapet {i}", (x, 3.112, height+.006), (width+.025, .08, .018), exterior)
            for row in range(4):
                for col in range(3):
                    if (3*i + 13*row + 7*col) % 9 in (1, 2, 4, 8):
                        box(f"City lit window {i}-{row}-{col}", (x-.10+.096*col, 3.083, .92+.104*row),
                            (.028, .015, .043), window_light)
    curtain("Left linen curtain", -1.42, .43, linen)
    curtain("Right linen curtain", .68, .44, linen)
    rod = lathe("Curtain rail", (-1.46, 2.205, 2.361), [(.015, 0), (.015, 2.65)], graphite)
    rod.rotation_euler.y = math.pi / 2

    hinge = empty("DoorHinge", (2.79, .624, .012))
    hinge["opensByRadiansLocalZ"] = 1.42
    door = box(PREFIX+"DoorLeaf", (0, .465, 1.025), (.047, .93, 2.05), walnut, .008, tile=1.75, parent=hinge)
    for z in (.195, 1.82):
        lathe("Hinge barrel", (0, 0, z), [(.012, 0), (.012, .085)], brass, 16).parent = hinge
    back = box("Door lever escutcheon", (-.033, .859, .99), (.014, .044, .14), brass, .006, parent=door)
    # Add hardware in leaf-relative coordinates so it follows the animated hinge.
    back.location -= door.location
    lever = box("Door lever", (-.065, .818, 1.018), (.038, .124, .023), brass, .009, parent=door)
    lever.location -= door.location
    stem = box("Door lever stem", (-.051, .867, 1.018), (.059, .023, .023), brass, .005, parent=door)
    stem.location -= door.location
    box("Threshold strip", (2.83, 1.09, .008), (.22, .95, .016), brass, .004)
    # The outer corridor continues physically through the doorway.
    box("Landing terrazzo", (3.64, 1.08, -.071), (1.72, 1.4, .14), ceiling)
    box("Landing opposite wall", (4.49, 1.08, 1.35), (.10, 1.4, 2.7), paint, tile=.95)
    box("Landing side wall south", (3.65, .36, 1.35), (1.74, .08, 2.7), paint, tile=.95)
    box("Landing side wall north", (3.65, 1.79, 1.35), (1.74, .08, 2.7), paint, tile=.95)
    box("Landing ceiling", (3.65, 1.08, 2.76), (1.74, 1.4, .12), ceiling)
    box("Wall light switch", (2.779, .37, 1.14), (.018, .078, .119), white, .004)
    box("Rocker switch", (2.768, .37, 1.14), (.014, .038, .052), white, .004)

    box("Rug backing", (-.55, .57, .013), (2.7, 2.47, .020), rug, .007)
    for x in (-1.86, .76):
        box("Rug woven selvedge", (x, .57, .0235), (.025, 2.35, .003), linen, tile=.52)
        for d in (.052, .081):
            inner = x + d if x < 0 else x - d
            box("Rug double edge stitching", (inner, .57, .0235), (.012, 2.29, .003), rug_stripe)
    for y in (-.57, 1.71):
        box("Rug horizontal selvedge", (-.55, y, .0235), (2.6, .022, .003), rug_stripe)
    # Asymmetrical couch at west, with upholstered rounded silhouettes and feet.
    box("Couch lower plinth", (-2.126, .42, .20), (.94, 2.18, .18), fabric, .08, 4, .48)
    box("Couch back", (-2.532, .42, .64), (.22, 2.12, .78), fabric, .091, 4, .48)
    for y in (-.565, 1.405):
        box("Couch arm", (-2.125, y, .47), (.94, .235, .49), fabric, .087, 4, .48)
        for x in (-2.44, -1.78):
            lathe("Couch taper leg", (x, y, .018), [(.022, 0), (.035, .13)], graphite, 16)
    for i, y in enumerate((-.02, .86)):
        box(f"Couch seat cushion {i+1}", (-2.046, y, .381), (.725, .858, .182), fabric, .074, 4, .48)
        obj = box(f"Couch back cushion {i+1}", (-2.403, y, .682), (.189, .856, .48), fabric, .073, 4, .48)
        obj.rotation_euler.y = -.105
    for i, (y, mat) in enumerate([(-.38, linen), (1.22, rust)]):
        pillow = box(f"Loose couch pillow {i}", (-2.27, y, .60), (.157, .36, .37), mat, .068, 4, .50)
        pillow.rotation_euler = (.12*(-1 if i else 1), -.22, .14*(-1 if i else 1))
    table, table_h = import_prop(SOURCE / "dining_table" / "dining_table_1k.gltf",
                                 "DiningTable", (1.79, -.86, 0), yaw=math.pi/2, height=.745)
    import_prop(ROOT / "public/assets/chapter1/old-chair.glb", "DiningChair",
                (1.77, -1.63, 0), yaw=math.pi/2, height=.89)
    box("Slim hall shelf", (2.59, 2.027, .729), (.355, .52, .042), walnut, .008, tile=.85)
    for y in (1.842, 2.214):
        box("Hall shelf bracket", (2.68, y, .653), (.20, .043, .147), graphite, .008)
    lathe("Ceramic keys bowl", (2.59, 1.98, .752), [(.09, 0), (.099, .013), (.114, .038), (.117, .056), (.109, .059), (.102, .03), (.077, .012)], blue, 28)
    # Two restrained original screenprint compositions, placed out of actor head space.
    print_indigo = material("Original print | ink blue", (.054, .13, .176), .87)
    print_tan = material("Original print | sand ink", (.50, .275, .112), .87)
    for i, (x, z, w, h) in enumerate([(1.64, 1.82, .48, .60), (2.20, 1.64, .35, .43)]):
        box("Print walnut frame", (x, 2.37, z), (w, .043, h), walnut, .007, tile=.8)
        box("Print paper mat", (x, 2.344, z), (w-.045, .012, h-.047), paper, .002)
        box("Print colored field", (x, 2.336, z), (w*.71, .007, h*.70), print_indigo, .002)
        for q in range(4):
            stripe = box("Print ink band", (x + (q-1.5)*w*.11, 2.331, z + (q-1.5)*h*.09),
                         (w*.23, .004, h*.072), print_tan, .002)
            stripe.rotation_euler.y = (-.35 if i else .35)
    # Table staging: two hand-glazed mugs, book/paper, shallow fruit dish.
    for i, (x, y, mat) in enumerate([(1.49, -.765, blue), (2.02, -.97, ceramics)]):
        lathe("Mug body", (x, y, table_h+.006), [(.042, 0), (.048, .009), (.052, .088), (.05, .097), (.046, .097), (.047, .091), (.042, .014), (.036, .009)], mat, 28)
        bpy.ops.mesh.primitive_torus_add(major_segments=20, minor_segments=8, location=(x+.06, y, table_h+.055), major_radius=.028, minor_radius=.008, rotation=(math.pi/2, 0, 0))
        bpy.context.object.name = f"Mug handle {i+1}"
        bpy.context.object.data.materials.append(mat)
    if QUALITY:
        table_reading(box, material, (1.81, -.52, table_h), paper)
    else:
        box("Closed paperback cover", (1.81, -.52, table_h+.017), (.175, .235, .025), rust, .003, yaw=-.23)
        box("Closed paperback pages", (1.81, -.52, table_h+.017), (.167, .222, .020), paper, .002, yaw=-.23)
    lathe("Stoneware dish", (1.84, -.87, table_h+.006), [(.107, 0), (.12, .012), (.142, .038), (.141, .046), (.131, .043), (.114, .023), (.094, .012)], ceramics)
    # Ribbed radiator below the window.
    for n in range(12):
        box("Radiator enamel fin", (-.70+.1*n, 2.29, .4), (.078, .105, .56), white, .022)
    for z in (.186, .62):
        box("Radiator manifold", (-.15, 2.3, z), (1.23, .11, .06), white, .019)
    # Warm floor-lamp practical behind the couch.
    lamp_pos = (-2.44, 1.86, 0)
    lathe("Lamp weighted foot", lamp_pos, [(.178, 0), (.181, .012), (.177, .034), (.159, .040)], graphite, 36)
    lathe("Lamp brass stem", lamp_pos, [(.013, .035), (.013, 1.54), (.026, 1.55), (.026, 1.60)], brass, 20)
    shade = material("Lamp shade warm linen", (.50, .316, .142), .92, emit=.53)
    diffuser = material("Lamp shade underside diffuser", (.72, .425, .173), .72, emit=2.9)
    lathe("Tapered floor-lamp shade", lamp_pos, [(.229, 1.46), (.223, 1.473), (.145, 1.794), (.139, 1.804), (.132, 1.798), (.212, 1.47), (.229, 1.46)], shade, 40, cap=False)
    lathe("Lamp underside diffuser", lamp_pos, [(.214, 1.475), (.214, 1.483)], diffuser, 40)

    # Actor axes: source forward is Blender local -Y; GLB conversion gives +Z.
    for name, position, yaw in [
        ("Alexei", (-.95, .49, 0), 86),
        ("Partner", (.53, .55, 0), -95),
        ("Entry", (3.58, 1.09, 0), 90),
    ]:
        marker = empty(name, position, yaw)
        marker["actorForwardLocal"] = "-Y"
    scene.camera = camera("Dialogue", (.44, -2.28, 1.53), (-.25, .77, 1.25), 25.5)
    camera("ExitView", (1.10, 1.71, 1.53), (3.24, 1.06, 1.22), 24)
    lamp("WindowCool", "AREA", (-.08, 2.69, 1.60), 87, (.43, .59, 1.0), 1.54, (-.34, .12, .91))
    lamp("FloorLampWarm", "AREA", (-2.15, 1.89, 1.61), 54, (1.0, .63, .34), .42, (-.32, .37, .94))
    lamp("PracticalBounce", "POINT", (-2.33, 1.83, 1.41), 27, (1.0, .64, .34), .20)
    lamp("ApartmentBounce", "AREA", (.78, -.92, 2.59), 39, (1.0, .82, .61), 1.31, (-.12, .6, 1.03))
    lamp("LandingSoft", "POINT", (3.70, 1.16, 2.33), 20, (.81, .87, 1.0), .25)
    scene.world = bpy.data.worlds.new("Late evening ambient")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get("Background").inputs[0].default_value = (.21, .25, .31, 1)
    scene.world.node_tree.nodes.get("Background").inputs[1].default_value = .18
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 18
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1120
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    return scene


def batch_static_materials():
    """Preserve individual meshes in the saved blend; batch only the exported copy."""
    groups = {}
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.parent or len(obj.data.materials) != 1:
            continue
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for name, objects in groups.items():
        if len(objects) < 2:
            continue
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.convert(target="MESH")
        bpy.ops.object.join()
        merged = bpy.context.view_layer.objects.active
        merged.name = "Static batch | " + name
        merged.select_set(False)


def export(scene):
    OUT.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(OUT / "story-home.png")
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "story-home.blend"))
    if "--export-only" not in sys.argv:
        bpy.ops.render.render(write_still=True)
        scene.camera = bpy.data.objects[PREFIX+"ExitView"]
        scene.render.filepath = str(OUT / "story-home-exit.png")
        hinge = bpy.data.objects[PREFIX+"DoorHinge"]
        hinge.rotation_euler.z = 1.42
        bpy.ops.render.render(write_still=True)
        hinge.rotation_euler.z = 0
        scene.camera = bpy.data.objects[PREFIX+"Dialogue"]
    batch_static_materials()
    # Retain the full-resolution packed masters inside the editable blend.
    for img in bpy.data.images:
        if img.name in {"Render Result", "Viewer Node"}:
            continue
        w, h = img.size
        cap = 768 if img.name.startswith(("plaster-", "linen-", "painted_wooden_chair")) else 1024
        if QUALITY and "red_brick_plaster_patch_02" in img.filepath:
            cap = 384  # This facade is at least 6 m beyond the window.
        elif QUALITY and "hessian_380" in img.filepath:
            cap = 512  # Fine detail is maintained by repeating the UV tile.
        if max(w, h) > cap:
            img.scale(max(1, round(w*cap/max(w, h))), max(1, round(h*cap/max(w, h))))
            # Blender does not mark a resized packed image dirty automatically.
            # Force a write so the exporter doesn't copy the original full-size JPEG.
            img.pixels[0] = img.pixels[0]
    # Area lights remain as authoring lights in Blender. Three.js owns their
    # real-time approximation so lighting is not duplicated on import.
    bpy.ops.export_scene.gltf(filepath=str(OUT / "story-home.glb"), export_format="GLB",
                              export_cameras=True, export_lights=False,
                              export_animations=False, export_apply=True, export_extras=True,
                              export_image_format="JPEG", export_jpeg_quality=90)
    model = (OUT / "story-home.glb").read_bytes()
    size = struct.unpack_from("<I", model, 12)[0]
    gltf = json.loads(model[20:20+size])
    primitives = [p for m in gltf["meshes"] for p in m["primitives"]]
    nodes = {n["name"]: (i, n) for i, n in enumerate(gltf["nodes"])}
    contract = {
        "units": "meters",
        "envelope": {"BlenderInteriorXYZ": [5.6, 4.8, 2.7], "includedLandingDepth": 1.7},
        "coordinateConversion": "Blender (x,y,z) to glTF (x,z,-y)",
        "markers": {key: {**nodes[PREFIX+key][1], "blenderMeters": list(bpy.data.objects[PREFIX+key].location)}
                    for key in ("Alexei", "Partner", "Entry", "DoorHinge", "DoorLeaf", "Dialogue", "ExitView")},
        "lighting": "Blender area and fill lights not exported; use warm practical and cool area or window proxy at runtime.",
        "exitPathBlenderMeters": [[-.95, .49, 0], [.50, 1.14, 0], [2.30, 1.18, 0], [3.58, 1.18, 0]],
        "lightsBlender": {o.name: {"location": list(o.location), "color": list(o.data.color),
                                   "watts": o.data.energy, "kind": o.data.type}
                          for o in scene.objects if o.type == "LIGHT"},
        "gltf": {
            "bytes": len(model), "meshes": len(gltf["meshes"]), "primitives": len(primitives),
            "triangles": sum(gltf["accessors"][p.get("indices", p["attributes"]["POSITION"])]["count"]//3 for p in primitives),
            "materials": len(gltf["materials"]), "textures": len(gltf["images"]),
        },
        "license": [
            {"name": "Dining Table", "source": "https://polyhaven.com/a/dining_table", "license": "CC0-1.0"},
            {"name": "Painted Wooden Chair 02", "source": "https://polyhaven.com/a/painted_wooden_chair_02", "license": "CC0-1.0"},
            {"name": "Wood Planks", "source": "https://polyhaven.com/a/wood_planks", "license": "CC0-1.0"},
            {"name": "Worn Plaster Wall normal", "source": "https://polyhaven.com/a/worn_plaster_wall", "license": "CC0-1.0"},
            {"name": "Rough Linen", "source": "https://polyhaven.com/a/rough_linen", "license": "CC0-1.0"},
            {"name": "Grey Oak Veneer 02", "source": "https://polyhaven.com/a/grey_oak_veneer_02", "license": "CC0-1.0"},
        ],
    }
    if QUALITY:
        contract["city"] = city_contract
        contract["license"] += [
            {"name": "Red Brick Plaster Patch 02", "source": "https://polyhaven.com/a/red_brick_plaster_patch_02", "license": "CC0-1.0"},
            {"name": "Hessian 380", "source": "https://polyhaven.com/a/hessian_380", "license": "CC0-1.0"},
        ]
    (OUT / "story-home.json").write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")


export(room())
