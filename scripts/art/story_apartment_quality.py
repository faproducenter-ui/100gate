"""Editable, metric set dressing for the local-only 100gate apartment pass."""
import random


def residential_view(box, material, scanned, source):
    """Build actual window apertures, returns, frames, rooflines and depth bands."""
    rng = random.Random(1002242)
    sky = material("City | blue-hour sky", (.029, .048, .095), .95, emit=.57)
    brick = scanned("City | weathered brick and plaster", source / "Diffuse.jpg",
                    source / "nor_gl.jpg", source / "Rough.jpg", .27)
    cement = material("City | weathered concrete", (.038, .041, .047), .87, emit=.20)
    parapet = material("City | zinc coping and dark trims", (.018, .025, .030), .64, .35)
    dark = material("City | unlit window and deep reveal", (.009, .014, .023), .55)
    frame = material("City | painted window frame", (.055, .065, .067), .67)
    lights = [
        material("City | indirect amber through curtains", (.42, .247, .116), .85, emit=.76),
        material("City | neutral ceiling spill", (.25, .32, .38), .82, emit=.65),
        material("City | shaded incandescent window", (.25, .115, .044), .90, emit=.54),
    ]
    box("City | backdrop beyond both rows", (0, 23.0, 3.5), (61., .04, 22.), sky)
    # Different offsets, heights and roof silhouettes give actual parallax as the
    # dialogue camera moves. All z values are relative to the apartment's floor.
    blocks = [
        ("Far west", -6.9, 15.5, 6, 6, 1.02, .78, cement),
        ("Far middle", -.25, 14.2, 6, 7, .95, .80, cement),
        ("Far east", 5.9, 15.9, 5, 6, 1.10, .83, cement),
        ("West stairwell", -4.35, 8.75, 5, 5, .94, .82, brick),
        ("East residential", 2.55, 9.8, 6, 5, 1.06, .92, brick),
    ]
    for idx, (label, cx, y, bays, floors, dx, dz, facade) in enumerate(blocks):
        width, z0 = bays*dx, -2.28 if idx < 3 else -2.17
        h = floors*dz
        opening_w, opening_h = .51*dx, .55*dz
        x0 = cx-width/2

        def put(name, x, dy, z, w, d, height, mat, uv=None):
            return box(f"City | {label} | {name}", (x, y+dy, z), (w, d, height), mat, tile=uv)

        put("side west", x0+.07, 1.0, z0+h*.5, .14, 2.05, h, cement)
        put("side east", x0+width-.07, 1.0, z0+h*.5, .14, 2.05, h, cement)
        put("slab", cx, 1.03, z0+h+.04, width+.14, 2.19, .09, parapet)
        put("roof bulkhead", cx+width*.21, .81, z0+h+.24, width*.25, .87, .40, cement)
        put("bulkhead coping", cx+width*.21, .81, z0+h+.45, width*.26, .91, .04, parapet)
        if idx in (1, 3, 4):
            put("chimney", cx-width*.25, .66, z0+h+.19, .26, .25, .36, facade, 1.8)
        for row in range(floors):
            mid = z0 + (row+.5)*dz
            pier_h = (dz-opening_h)/2
            for side in (-1, 1):
                put(f"course {row}/{side}", cx, 0, mid+side*(opening_h+pier_h)/2,
                    width, .23, pier_h, facade, 1.8)
            put(f"stringcourse {row}", cx, -.126, mid-dz*.47, width+.025, .055, .036, cement)
            for col in range(bays):
                x = x0+(col+.5)*dx
                gap = dx-opening_w
                put(f"pier {row}/{col}", x-dx/2+(gap/4 if col == 0 else 0), 0, mid,
                    gap/2 if col == 0 else gap, .23, opening_h, facade, 1.8)
                if col==bays-1:
                    put(f"end pier {row}", x0+width-gap/4, 0, mid, gap/2, .23, opening_h, facade, 1.8)
                glass = rng.choices([dark, *lights], weights=[72, 14, 8, 6])[0]
                put(f"recess {row}/{col}", x, .113, mid, opening_w, .024, opening_h, dark)
                put(f"left pane {row}/{col}", x-opening_w*.214, .092, mid, opening_w*.36, .016, opening_h*.86, glass)
                put(f"right pane {row}/{col}", x+opening_w*.214, .092, mid, opening_w*.36, .016, opening_h*.86,
                    dark if glass!=dark and rng.random()<.37 else glass)
                put(f"mullion {row}/{col}", x, .055, mid, .032, .065, opening_h, frame)
                put(f"sill {row}/{col}", x, -.108, mid-opening_h*.53, opening_w+.087, .235, .042, cement)
                if idx >= 3 and glass!=dark:
                    put(f"blind {row}/{col}", x, .070, mid+opening_h*.29, opening_w*.92, .015,
                        opening_h*.25, frame)
        if idx >= 3:
            put("rainwater pipe", x0+width-.09, -.165, z0+h/2, .047, .047, h, parapet)
    return {"windowWallY": 2.45, "nearFacadeY": [8.75, 9.8],
            "farFacadeY": [14.2, 15.5, 15.9], "skyY": 23.0}


def table_reading(box, material, position, pages):
    """An offset cover, spine and page block, not coplanar intersecting boxes."""
    import math
    x, y, z = position
    angle = -.23
    cover = material("Apartment | book linen binding", (.155, .056, .027), .86)
    ink = material("Apartment | book blind-stamped foil", (.43, .287, .14), .61, .42)

    def book(name, u, v, height, dims, mat, bevel):
        dx = u*math.cos(angle)-v*math.sin(angle)
        dy = u*math.sin(angle)+v*math.cos(angle)
        box(name, (x+dx, y+dy, z+height), dims, mat, bevel, yaw=angle)

    book("Book | bottom board", 0, 0, .0025, (.176, .232, .005), cover, .0015)
    book("Book | separate paper block", .001, 0, .015, (.164, .223, .020), pages, .0015)
    book("Book | top board", 0, 0, .0275, (.176, .232, .005), cover, .0015)
    book("Book | rounded binding", -.085, 0, .015, (.006, .232, .029), cover, .0023)
    for u in (-.045, .045):
        book("Book | foil rule", u, .02, .0301, (.0012, .125, .0003), ink, 0)
    for v in (-.0425, .0825):
        book("Book | foil rule", 0, v, .0301, (.090, .0012, .0003), ink, 0)
