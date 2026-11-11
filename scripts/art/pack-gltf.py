"""Pack a glTF (.gltf + .bin + image files) into a single .glb without touching the data.
Usage: python pack-gltf.py <scene.gltf> <out.glb>
Only reads the files the glTF names, refuses absolute/parent paths and http(s) URIs.
"""
import json, struct, sys
from pathlib import Path

def pack(src, dst):
    src = Path(src).resolve(); base = src.parent
    g = json.loads(src.read_text(encoding='utf-8'))
    blob = bytearray()
    def safe(uri):
        if '://' in uri or uri.startswith('data:'): raise SystemExit('external/data uri refused: ' + uri[:40])
        p = (base / uri).resolve()
        if base not in p.parents: raise SystemExit('path escapes the model folder: ' + uri)
        return p.read_bytes()
    def add(data):
        while len(blob) % 4: blob.append(0)
        off = len(blob); blob.extend(data)
        g.setdefault('bufferViews', []).append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
        return len(g['bufferViews']) - 1
    # existing buffer(s): single .bin only
    assert len(g['buffers']) == 1
    blob.extend(safe(g['buffers'][0]['uri']))
    for im in g.get('images', []):
        uri = im.pop('uri')
        data = safe(uri)
        im['bufferView'] = add(data)
        im['mimeType'] = 'image/png' if data[:4] == b'\x89PNG' else 'image/jpeg'
    while len(blob) % 4: blob.append(0)
    g['buffers'] = [{'byteLength': len(blob)}]
    doc = json.dumps(g, separators=(',', ':')).encode(); doc += b' ' * (-len(doc) % 4)
    out = struct.pack('<4sII', b'glTF', 2, 28 + len(doc) + len(blob)) + struct.pack('<I4s', len(doc), b'JSON') + doc + struct.pack('<I4s', len(blob), b'BIN\x00') + bytes(blob)
    Path(dst).write_bytes(out)
    print(dst, len(out))

pack(sys.argv[1], sys.argv[2])
