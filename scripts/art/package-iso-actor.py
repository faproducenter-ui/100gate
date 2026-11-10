"""Package the existing licensed MPFB gait and a planted Blender idle pose.

Read-only source inputs are the accepted quality-overhaul exports, not the
cinematic apartment or escape. Re-running writes only the isometric asset.
"""
from bisect import bisect_right
from hashlib import sha256
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "outputs/quality-overhaul"
WALK = SOURCE / "gait/story-hero-walk-mocap.glb"
STOP = SOURCE / "stop/story-hero-stops.json"
DESTINATION = ROOT / "public/assets/iso/alexei.glb"
WALK_SHA = "2f3d3426f182e113309394b74b05f071593f558db6cff8ab1f072caf39820b73"
STOP_SHA = "1e522be4f3f8e1bd8eBA9c7a602990180ce8c4790919b5d3ef34e415320ba06c".lower()
IDLE_TIME = 1.55  # End of stop-80, both soles measured flat in Blender.


def read_verified(path, expected):
    data = path.read_bytes()
    if sha256(data).hexdigest() != expected:
        raise ValueError(f"Actor source has changed: {path}")
    return data


def read_glb(raw):
    magic, version, total = struct.unpack_from("<4sII", raw)
    assert (magic, version, total) == (b"glTF", 2, len(raw))
    length, kind = struct.unpack_from("<I4s", raw, 12)
    assert kind == b"JSON"
    end = length + 20
    binary_length, kind = struct.unpack_from("<I4s", raw, end)
    assert (kind, binary_length) == (b"BIN\x00", len(raw) - end - 8)
    return json.loads(raw[20:end]), bytearray(raw[end+8:])


def sample(track, time, width):
    times, values = track["times"], track["values"]
    i = max(0, min(len(times)-1, bisect_right(times, time)-1))
    a = values[i*width:(i+1)*width]
    if i == len(times)-1 or track.get("interpolation") == 2300:
        return a
    b = values[(i+1)*width:(i+2)*width]
    w = (time-times[i])/(times[i+1]-times[i])
    if width == 4 and sum(x*y for x,y in zip(a,b)) < 0:
        b = [-x for x in b]
    result = [x+(y-x)*w for x,y in zip(a,b)]
    if width == 4:
        length = math.sqrt(sum(x*x for x in result))
        result = [x/length for x in result]
    return result


def pack():
    gltf, binary = read_glb(read_verified(WALK, WALK_SHA))
    stop = json.loads(read_verified(STOP, STOP_SHA))
    assert len(gltf["animations"]) == 1 and len(gltf["meshes"]) == 5
    joint_indices = {i for skin in gltf["skins"] for i in skin["joints"]}
    assert len(joint_indices) == 53
    names = {gltf["nodes"][i]["name"]: i for i in joint_indices}

    def accessor(values, width, kind):
        offset = len(binary)
        binary.extend(struct.pack("<"+"f"*len(values), *values))
        buffer_view = len(gltf["bufferViews"])
        gltf["bufferViews"].append({"buffer":0,"byteOffset":offset,"byteLength":len(binary)-offset})
        result = {"bufferView":buffer_view,"componentType":5126,"count":len(values)//width,"type":kind}
        if kind == "SCALAR":
            result.update(min=[min(values)],max=[max(values)])
        gltf["accessors"].append(result)
        return len(gltf["accessors"])-1

    idle = {"name":"Idle","channels":[],"samplers":[]}
    ticks = accessor([0.,1.],1,"SCALAR")
    for track in stop["tracks"]:
        name, path = track["name"].rsplit(".", 1)
        if name not in names:
            continue
        assert path in ("position", "quaternion")
        width = 3 if path == "position" else 4
        data = sample(track, IDLE_TIME, width)
        out = accessor(data*2,width,f"VEC{width}")
        idle["channels"].append({"sampler":len(idle["samplers"]),
            "target":{"node":names[name],"path":"translation" if width == 3 else "rotation"}})
        idle["samplers"].append({"input":ticks,"output":out,"interpolation":"LINEAR"})
    assert len(idle["channels"]) == 106
    gltf["animations"][0]["name"] = "Walk"
    gltf["animations"].append(idle)
    gltf["asset"]["extras"] = {
        "walkStrideM": 1,
        "forward": "+Z",
        "sourceWalkSha256": WALK_SHA,
        "sourceIdleSha256": STOP_SHA,
        "credit": "The data used in this project was obtained from mocap.cs.cmu.edu."
    }
    gltf["buffers"][0]["byteLength"] = len(binary)
    document = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode()
    document += b" " * (-len(document)%4)
    length = 28+len(document)+len(binary)
    output = (struct.pack("<4sII",b"glTF",2,length)+struct.pack("<I4s",len(document),b"JSON")+
              document+struct.pack("<I4s",len(binary),b"BIN\x00")+binary)
    DESTINATION.parent.mkdir(exist_ok=True,parents=True)
    DESTINATION.write_bytes(output)
    print(DESTINATION.relative_to(ROOT),len(output),sha256(output).hexdigest())


if __name__ == "__main__":
    pack()
