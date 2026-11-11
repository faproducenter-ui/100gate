"""Splice baked Idle/Walk/Run clips (authored in Blender as G_Idle/G_Walk/G_Run,
exported with the full hero) into public/assets/iso/alexei-5.glb by bone name.
Usage: python package-iso-gait.py <blender-export.glb>
"""
import json, struct, sys
from pathlib import Path

DEST = Path(__file__).resolve().parents[2] / "public/assets/iso/alexei-5.glb"
RENAME = {"G_Idle": "Idle", "G_Walk": "Walk", "G_Run": "Run"}
EXTRAS = {"walkStrideM": 1.25, "runStrideM": 2.0}

def read(path):
    raw = Path(path).read_bytes()
    n = struct.unpack_from("<I", raw, 12)[0]
    return json.loads(raw[20:20+n]), bytearray(raw[28+n:])

def accessor_bytes(g, b, idx):
    a = g["accessors"][idx]; v = g["bufferViews"][a["bufferView"]]
    width = {"SCALAR":1,"VEC3":3,"VEC4":4}[a["type"]]
    off = v.get("byteOffset",0)+a.get("byteOffset",0)
    return a, bytes(b[off:off+a["count"]*width*4]), width

def main(src):
    dst, dbin = read(DEST); gen, gbin = read(src)
    ids = {n["name"]: i for i, n in enumerate(dst["nodes"]) if "name" in n}
    gname = {i: n.get("name") for i, n in enumerate(gen["nodes"])}
    def add(data, kind, count, extra=None):
        while len(dbin) % 4: dbin.append(0)
        off = len(dbin); dbin.extend(data)
        dst["bufferViews"].append({"buffer":0,"byteOffset":off,"byteLength":len(data)})
        acc = {"bufferView":len(dst["bufferViews"])-1,"componentType":5126,"count":count,"type":kind}
        if extra: acc.update(extra)
        dst["accessors"].append(acc); return len(dst["accessors"])-1
    out = []
    for an in gen["animations"]:
        if an["name"] not in RENAME: continue
        clip = {"name":RENAME[an["name"]],"channels":[],"samplers":[]}; cache = {}
        for ch in an["channels"]:
            path = ch["target"]["path"]; name = gname[ch["target"]["node"]]
            if path not in ("translation","rotation") or name not in ids: continue
            s = an["samplers"][ch["sampler"]]
            for key in ("input","output"):
                if (key, s[key]) not in cache:
                    a, data, w = accessor_bytes(gen, gbin, s[key])
                    extra = {"min":a["min"],"max":a["max"]} if key == "input" else None
                    cache[(key, s[key])] = add(data, a["type"], a["count"], extra)
            clip["samplers"].append({"input":cache[("input",s["input"])],"output":cache[("output",s["output"])],"interpolation":"LINEAR"})
            clip["channels"].append({"sampler":len(clip["samplers"])-1,"target":{"node":ids[name],"path":path}})
        out.append(clip)
    assert sorted(c["name"] for c in out) == ["Idle","Run","Walk"], [c["name"] for c in out]
    dst["animations"] = out
    dst.setdefault("asset", {}).setdefault("extras", {}).update(EXTRAS)
    dst["buffers"][0]["byteLength"] = len(dbin)
    doc = json.dumps(dst, separators=(",",":"), ensure_ascii=False).encode(); doc += b" " * (-len(doc) % 4)
    while len(dbin) % 4: dbin.append(0)
    blob = (struct.pack("<4sII", b"glTF", 2, 28+len(doc)+len(dbin)) + struct.pack("<I4s", len(doc), b"JSON") + doc +
            struct.pack("<I4s", len(dbin), b"BIN\x00") + bytes(dbin))
    DEST.write_bytes(blob); print(DEST, len(blob), [(c["name"], len(c["channels"])) for c in out])

main(sys.argv[1])
