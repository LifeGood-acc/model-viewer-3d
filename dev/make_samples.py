#!/usr/bin/env python3
"""Writes small synthetic sample models (pure standard library, deterministic). The files are generated, not committed:
`samples/` is in .gitignore (a release must not carry binary sample files such as .glb or .3mf archives).

  python3 dev/make_samples.py [--out DIR]        default DIR: ./samples

skinned.glb    a column bent by two joints (a skinned mesh)
animated.glb   a ring with a one-clip rotation animation (meters, +Y up)
parts.glb      a table scene: five named parts with their own colors (meters, +Y up)
textured.glb   a sphere with an embedded checker texture (meters, +Y up)
split.gltf     the same as a .gltf with separate files (split.bin, split-tex.png); embedded.gltf: the same with everything as data: URIs
cloud.ply      a colored point cloud, a trefoil knot (binary PLY, +Y up)
mesh.ply       a colored triangle mesh, a torus (binary PLY with faces)
torus.obj      the same torus as a text OBJ
splat.ply      a small 3D Gaussian splat file (12,000 splats)
ascii.stl      a tetrahedron as text STL; ascii.ply the same as text PLY
bracket.stl    an L-bracket with two bolt heads (binary STL, millimeters, +Z up)
parts.3mf      three colored objects (3MF, millimeters, +Z up)
"""
import argparse, gzip, json, math, os, random, shutil, struct, zipfile, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'samples')


def z_add(z, name, data):
    # a fixed timestamp, so the generated archives are byte-identical on every run
    z.writestr(zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0)), data, zipfile.ZIP_DEFLATED)


# ---------- tiny mesh kit: a mesh is (vertices [(x,y,z)], triangles [(a,b,c)]) ----------
def box(sx, sy, sz, c=(0, 0, 0)):
    x, y, z = sx / 2, sy / 2, sz / 2
    v = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    f = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4), (2, 3, 7), (2, 7, 6), (1, 2, 6), (1, 6, 5), (3, 0, 4), (3, 4, 7)]
    return [(a + c[0], b + c[1], d + c[2]) for a, b, d in v], f


def cylinder(r, h, n=48, c=(0, 0, 0), axis='y'):
    v, f = [], []
    for k in range(n):
        a = 2 * math.pi * k / n
        v += [(r * math.cos(a), -h / 2, r * math.sin(a)), (r * math.cos(a), h / 2, r * math.sin(a))]
    v += [(0, -h / 2, 0), (0, h / 2, 0)]
    b, t = 2 * n, 2 * n + 1
    for k in range(n):
        k2 = (k + 1) % n
        f += [(2 * k, 2 * k2, 2 * k + 1), (2 * k + 1, 2 * k2, 2 * k2 + 1), (b, 2 * k2, 2 * k), (t, 2 * k + 1, 2 * k2 + 1)]
    return orient(v, axis, c), f


def orient(v, axis, c):
    if axis == 'z':  # turn the y-axis cylinder so its axis is z
        v = [(x, -z, y) for x, y, z in v]
    return [(x + c[0], y + c[1], z + c[2]) for x, y, z in v]


def sphere(r, nu=48, nv=24, c=(0, 0, 0)):
    v, f, uv = [], [], []
    for j in range(nv + 1):
        t = math.pi * j / nv
        for i in range(nu + 1):
            p = 2 * math.pi * i / nu
            v.append((c[0] + r * math.sin(t) * math.cos(p), c[1] + r * math.cos(t), c[2] + r * math.sin(t) * math.sin(p)))
            uv.append((i / nu, j / nv))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            b = a + nu + 1
            f += [(a, a + 1, b), (a + 1, b + 1, b)]
    return v, f, uv


def torus(R, r, nu=64, nv=24):
    v, f = [], []
    for i in range(nu):
        a = 2 * math.pi * i / nu
        for j in range(nv):
            b = 2 * math.pi * j / nv
            v.append(((R + r * math.cos(b)) * math.cos(a), r * math.sin(b), (R + r * math.cos(b)) * math.sin(a)))
    for i in range(nu):
        for j in range(nv):
            a0, a1 = i * nv + j, ((i + 1) % nu) * nv + j
            b0, b1 = i * nv + (j + 1) % nv, ((i + 1) % nu) * nv + (j + 1) % nv
            f += [(a0, a1, b0), (a1, b1, b0)]
    return v, f


def normals(v, f):
    n = [[0.0, 0.0, 0.0] for _ in v]
    for a, b, c in f:
        ax, ay, az = v[a]
        ux, uy, uz = v[b][0] - ax, v[b][1] - ay, v[b][2] - az
        wx, wy, wz = v[c][0] - ax, v[c][1] - ay, v[c][2] - az
        nx, ny, nz = uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx
        for i in (a, b, c):
            n[i][0] += nx
            n[i][1] += ny
            n[i][2] += nz
    out = []
    for x, y, z in n:
        l = math.sqrt(x * x + y * y + z * z) or 1.0
        out.append((x / l, y / l, z / l))
    return out


def flat(v, f):  # unshared vertices, so boxes keep hard edges
    nv, nf = [], []
    for a, b, c in f:
        i = len(nv)
        nv += [v[a], v[b], v[c]]
        nf.append((i, i + 1, i + 2))
    return nv, nf


# ---------- writers ----------
def png(w, h, px):  # px(x, y) -> (r, g, b)
    raw = b''.join(b'\0' + bytes(c for x in range(w) for c in px(x, y)) for y in range(h))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def write_glb(path, meshes, image=None, anim=None):
    """meshes: dicts name, v, f, color (linear rgba), optional n, uv. Each becomes a node with its own mesh and material."""
    bin_, views, accs, mats, msh, nodes = bytearray(), [], [], [], [], []

    def view(data, target=None):
        while len(bin_) % 4:
            bin_.append(0)
        views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data), **({'target': target} if target else {})})
        bin_.extend(data)
        return len(views) - 1

    def acc(data, ctype, count, typ, target, mm=None):
        a = {'bufferView': view(data, target), 'componentType': ctype, 'count': count, 'type': typ}
        if mm:
            a['min'], a['max'] = mm
        accs.append(a)
        return len(accs) - 1

    img_idx = None
    if image:
        img_idx = view(image)
    for m in meshes:
        v, f = m['v'], m['f']
        n = m.get('n') or normals(v, f)
        pos = acc(b''.join(struct.pack('<3f', *p) for p in v), 5126, len(v), 'VEC3', 34962, ([min(p[i] for p in v) for i in range(3)], [max(p[i] for p in v) for i in range(3)]))
        nor = acc(b''.join(struct.pack('<3f', *p) for p in n), 5126, len(v), 'VEC3', 34962)
        idx = acc(b''.join(struct.pack('<3I', *t) for t in f), 5125, len(f) * 3, 'SCALAR', 34963)
        attrs = {'POSITION': pos, 'NORMAL': nor}
        if 'uv' in m:
            attrs['TEXCOORD_0'] = acc(b''.join(struct.pack('<2f', *p) for p in m['uv']), 5126, len(v), 'VEC2', 34962)
        pbr = {'metallicFactor': 0.0, 'roughnessFactor': m.get('rough', 0.7)}
        if 'uv' in m:
            pbr['baseColorTexture'] = {'index': 0}
        else:
            pbr['baseColorFactor'] = list(m['color'])
        mats.append({'name': m['name'], 'pbrMetallicRoughness': pbr})
        msh.append({'name': m['name'], 'primitives': [{'attributes': attrs, 'indices': idx, 'material': len(mats) - 1}]})
        nodes.append({'name': m['name'], 'mesh': len(msh) - 1})
    animations = []
    if anim:  # one rotation clip: anim = {'name', 'node', 'times': [s], 'quats': [(x, y, z, w)]}
        t_acc = acc(b''.join(struct.pack('<f', v) for v in anim['times']), 5126, len(anim['times']), 'SCALAR', None, ([min(anim['times'])], [max(anim['times'])]))
        q_acc = acc(b''.join(struct.pack('<4f', *q) for q in anim['quats']), 5126, len(anim['quats']), 'VEC4', None)
        animations = [{'name': anim['name'], 'samplers': [{'input': t_acc, 'output': q_acc, 'interpolation': 'LINEAR'}], 'channels': [{'sampler': 0, 'target': {'node': anim['node'], 'path': 'rotation'}}]}]
    g = {'asset': {'version': '2.0', 'generator': 'make_samples.py'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes,
         'meshes': msh, 'materials': mats, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
    if animations:
        g['animations'] = animations
    if img_idx is not None:
        g['images'] = [{'bufferView': img_idx, 'mimeType': 'image/png'}]
        g['textures'] = [{'source': 0, 'sampler': 0}]
        g['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    js = json.dumps(g, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    bin_.extend(b'\0' * (-len(bin_) % 4))
    data = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(bin_), b'BIN\0') + bytes(bin_)
    open(path, 'wb').write(data)


def write_skinned_glb(path):
    """skinned.glb: a column of two segments bent by two joints (a skinned mesh: joints, weights, inverse bind matrices; meters, +Y up)."""
    ring = [(-0.2, -0.2), (0.2, -0.2), (0.2, 0.2), (-0.2, 0.2)]
    v = [(x, y, z) for y in (0.0, 1.0, 2.0) for x, z in ring]
    f = []
    for seg in range(2):
        for k in range(4):
            a, b = seg * 4 + k, seg * 4 + (k + 1) % 4
            f += [(a, b, a + 4), (b, b + 4, a + 4)]
    f += [(0, 2, 1), (0, 3, 2), (8, 9, 10), (8, 10, 11)]
    joints = b''.join(struct.pack('<4B', 0 if i < 8 else 1, 0, 0, 0) for i in range(12))
    weights = b''.join(struct.pack('<4f', *(((1, 0, 0, 0) if i < 4 else (0.5, 0.5, 0, 0) if i < 8 else (0, 1, 0, 0)))) for i in range(12))
    ibm = struct.pack('<16f', 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) + struct.pack('<16f', 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, 0, 1)
    n = normals(v, f)
    bin_ = bytearray()
    views = []

    def view(data, target=None):
        while len(bin_) % 4:
            bin_.append(0)
        views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data), **({'target': target} if target else {})})
        bin_.extend(data)
        return len(views) - 1

    pos = b''.join(struct.pack('<3f', *p) for p in v)
    accs = [
        {'bufferView': view(pos, 34962), 'componentType': 5126, 'count': 12, 'type': 'VEC3', 'min': [-0.2, 0, -0.2], 'max': [0.2, 2, 0.2]},
        {'bufferView': view(b''.join(struct.pack('<3f', *p) for p in n), 34962), 'componentType': 5126, 'count': 12, 'type': 'VEC3'},
        {'bufferView': view(b''.join(struct.pack('<3I', *t) for t in f), 34963), 'componentType': 5125, 'count': len(f) * 3, 'type': 'SCALAR'},
        {'bufferView': view(joints, 34962), 'componentType': 5121, 'count': 12, 'type': 'VEC4'},
        {'bufferView': view(weights, 34962), 'componentType': 5126, 'count': 12, 'type': 'VEC4'},
        {'bufferView': view(ibm), 'componentType': 5126, 'count': 2, 'type': 'MAT4'},
    ]
    g = {'asset': {'version': '2.0', 'generator': 'make_samples.py'}, 'scene': 0, 'scenes': [{'nodes': [0, 1]}],
         'nodes': [{'name': 'Column', 'mesh': 0, 'skin': 0}, {'name': 'Base joint', 'children': [2]}, {'name': 'Upper joint', 'translation': [0, 1, 0], 'rotation': [0, 0, 0.2588, 0.9659]}],
         'skins': [{'joints': [1, 2], 'inverseBindMatrices': 5, 'skeleton': 1}],
         'meshes': [{'name': 'Column', 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'JOINTS_0': 3, 'WEIGHTS_0': 4}, 'indices': 2, 'material': 0}]}],
         'materials': [{'name': 'Column', 'pbrMetallicRoughness': {'baseColorFactor': list(lin(0x4A90D9)), 'metallicFactor': 0.0, 'roughnessFactor': 0.6}}],
         'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
    js = json.dumps(g, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    bin_.extend(b'\0' * (-len(bin_) % 4))
    open(path, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(bin_), b'BIN\0') + bytes(bin_))


def lin(c):  # sRGB hex -> linear rgba
    r, g, b = [(c >> s & 255) / 255 for s in (16, 8, 0)]
    f = lambda u: u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


def translate(mesh, d):
    v, f = mesh
    return [(x + d[0], y + d[1], z + d[2]) for x, y, z in v], f


def pack_meshopt(out):
    """parts-meshopt.glb: parts.glb compressed with gltfpack 1.3.0 (npm, MIT) so the meshopt path can be tested. Needs npx and
    network access once (npm cache afterwards); without them the file is skipped. MAKE_SAMPLES_NO_NPX=1 skips it on purpose."""
    if os.environ.get('MAKE_SAMPLES_NO_NPX'):
        return
    import subprocess
    try:
        subprocess.run(['npx', '--yes', 'gltfpack@1.3.0', '-i', os.path.join(out, 'parts.glb'), '-o', os.path.join(out, 'parts-meshopt.glb'), '-cc'],
                       check=True, capture_output=True, timeout=180)
    except (OSError, subprocess.SubprocessError):
        print('skipped parts-meshopt.glb (needs npx and gltfpack@1.3.0 from npm)')


def write_splat(path, n=12000):
    """splat.ply, splat.splat and splat.spz (path without extension): the same 3D Gaussian splat scene (little gaussians on a trefoil-like
    ring, colored by position; meters, +Y up) in the three forms the viewer reads. PLY as the training tools write it (x y z, normals,
    f_dc_*, opacity (logit), scale_* (log), rot_* (quaternion)); .splat: 32 bytes per splat (position, scale, rgba, rotation);
    .spz: the compressed format of the Niantic spec, version 2, 12 fractional bits."""
    rnd = random.Random(7)
    C0 = 0.28209479177387814
    splats = []
    for i in range(n):
        t = 2 * math.pi * i / n * 3
        r = 0.5 + 0.18 * math.cos(1.5 * t)
        x, y, z = r * math.cos(t) + rnd.gauss(0, 0.012), 0.2 * math.sin(2 * t) + rnd.gauss(0, 0.012), r * math.sin(t) + rnd.gauss(0, 0.012)
        rgb = tuple(min(1, max(0, c)) for c in (0.5 + 0.5 * math.cos(t), 0.5 + 0.5 * math.sin(1.3 * t), 0.35 + 0.4 * (y + 0.3)))
        q = [rnd.gauss(0, 1) for _ in range(4)]
        ql = math.sqrt(sum(v * v for v in q)) or 1
        q = [v / ql for v in q]
        if q[0] < 0:
            q = [-v for v in q]  # w >= 0, as .spz stores it
        splats.append(((x, y, z), rgb, rnd.uniform(0.6, 0.98), tuple(rnd.uniform(0.008, 0.02) for _ in range(3)), q))
    props = ['x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']
    head = 'ply\nformat binary_little_endian 1.0\nelement vertex %d\n%send_header\n' % (n, ''.join('property float %s\n' % p for p in props))
    with open(path + '.ply', 'wb') as fh:
        fh.write(head.encode())
        for pos, rgb, op, sc, q in splats:
            fh.write(struct.pack('<17f', *pos, 0, 0, 0, *((c - 0.5) / C0 for c in rgb), math.log(op / (1 - op)), *(math.log(v) for v in sc), *q))
    clamp8 = lambda v: max(0, min(255, int(round(v))))
    with open(path + '.splat', 'wb') as fh:
        for pos, rgb, op, sc, q in splats:
            fh.write(struct.pack('<6f4B4B', *pos, *sc, *(clamp8(c * 255) for c in rgb), clamp8(op * 255), *(clamp8(v * 128 + 128) for v in q)))
    fixed = bytearray()
    for pos, _, _, _, _ in splats:
        for v in pos:
            fixed += (int(round(v * 4096)) & 0xFFFFFF).to_bytes(3, 'little')
    body = bytes(fixed)
    body += bytes(clamp8(op * 255) for _, _, op, _, _ in splats)
    body += bytes(clamp8(((c - 0.5) / C0) * (0.15 * 255) + 0.5 * 255) for _, rgb, _, _, _ in splats for c in rgb)
    body += bytes(clamp8((math.log(v) + 10) * 16) for _, _, _, sc, _ in splats for v in sc)
    body += bytes(clamp8(v * 127.5 + 127.5) for _, _, _, _, q in splats for v in q[1:])
    with gzip.open(path + '.spz', 'wb', 9) as gz:
        gz.write(struct.pack('<IIIBBBB', 0x5053474E, 2, n, 0, 12, 0, 0) + body)


def write_gltf_variants(glb_path, out_dir):
    """From a GLB: split.gltf (+ split.bin and split-tex.png, separate files) and embedded.gltf (everything as data: URIs)."""
    import base64
    data = open(glb_path, 'rb').read()
    jlen = struct.unpack('<I', data[12:16])[0]
    doc = json.loads(data[20:20 + jlen])
    off = 20 + ((jlen + 3) & ~3)
    blen = struct.unpack('<I', data[off:off + 4])[0]
    bin_ = data[off + 8:off + 8 + blen]
    # pictures out of the binary chunk
    pics = []
    for im in doc.get('images', []):
        v = doc['bufferViews'][im.pop('bufferView')]
        pics.append(bin_[v['byteOffset']:v['byteOffset'] + v['byteLength']])
    # the views that are left keep their offsets; the pictures' views stay in the buffer (harmless) so no offsets change
    def variant(uri_buf, uri_img):
        d = json.loads(json.dumps(doc))
        d['buffers'] = [{'byteLength': len(bin_), 'uri': uri_buf}]
        for i, im in enumerate(d.get('images', [])):
            im['uri'] = uri_img(i, pics[i])
            im['mimeType'] = 'image/png'
        return d
    open(os.path.join(out_dir, 'split.bin'), 'wb').write(bin_)
    def split_img(i, b):
        name = 'split-tex.png' if i == 0 else 'split-tex%d.png' % i
        open(os.path.join(out_dir, name), 'wb').write(b)
        return name
    open(os.path.join(out_dir, 'split.gltf'), 'w').write(json.dumps(variant('split.bin', split_img), indent=1))
    emb = variant('data:application/octet-stream;base64,' + base64.b64encode(bin_).decode(), lambda i, b: 'data:image/png;base64,' + base64.b64encode(b).decode())
    open(os.path.join(out_dir, 'embedded.gltf'), 'w').write(json.dumps(emb))


# ---------- FBX: a tiny writer for a box (ASCII and binary, version 7.4) ----------
# Nodes are (name, [properties], [children]); a property is an int, a float, a str, ('i', [ints]) or ('d', [floats]) for arrays.
def _fbx_box(zup=False):
    hx, hy, hz = 0.5, 0.25, 0.4
    v = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz), (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
    quads = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (3, 0, 4, 7)]
    idx = []
    for q in quads:
        idx += [q[0], q[1], q[2], -q[3] - 1]
    verts = [c for p in v for c in p]
    def n3(a, b, c):
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]; vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
        x, y, z = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx; l = math.sqrt(x * x + y * y + z * z) or 1
        return (x / l, y / l, z / l)
    normals = []
    for q in quads:
        nrm = n3(v[q[0]], v[q[1]], v[q[2]])
        normals += list(nrm) * 4
    def P(*a): return ('P', list(a), [])
    geo = ('Geometry', [100000, 'Geometry::Box', 'Mesh'], [
        ('Vertices', [('d', verts)], []), ('PolygonVertexIndex', [('i', idx)], []), ('GeometryVersion', [124], []),
        ('LayerElementNormal', [0], [('Version', [101], []), ('Name', [''], []), ('MappingInformationType', ['ByPolygonVertex'], []), ('ReferenceInformationType', ['Direct'], []), ('Normals', [('d', normals)], [])]),
        ('Layer', [0], [('Version', [100], []), ('LayerElement', [], [('Type', ['LayerElementNormal'], []), ('TypedIndex', [0], [])])])])
    model = ('Model', [200000, 'Model::Box', 'Mesh'], [('Version', [232], []), ('Properties70', [], [P('Lcl Translation', 'Lcl Translation', '', 'A', 0.0, 0.0, 0.0), P('Lcl Rotation', 'Lcl Rotation', '', 'A', 0.0, 0.0, 0.0), P('Lcl Scaling', 'Lcl Scaling', '', 'A', 1.0, 1.0, 1.0)])])
    mat = ('Material', [300000, 'Material::Red', ''], [('Version', [102], []), ('ShadingModel', ['phong'], []), ('Properties70', [], [P('DiffuseColor', 'Color', '', 'A', 0.8, 0.2, 0.2)])])
    return [
        ('FBXHeaderExtension', [], [('FBXHeaderVersion', [1003], []), ('FBXVersion', [7400], [])]),
        ('GlobalSettings', [], [('Version', [1000], []), ('Properties70', [], [P('UpAxis', 'int', 'Integer', '', 2 if zup else 1), P('UpAxisSign', 'int', 'Integer', '', 1), P('FrontAxis', 'int', 'Integer', '', 1 if zup else 2), P('CoordAxis', 'int', 'Integer', '', 0), P('UnitScaleFactor', 'double', 'Number', '', 1.0)])]),
        ('Definitions', [], [('Version', [100], []), ('Count', [3], [])]),
        ('Objects', [], [geo, model, mat]),
        ('Connections', [], [('C', ['OO', 200000, 0], []), ('C', ['OO', 100000, 200000], []), ('C', ['OO', 300000, 200000], [])])]


def write_ply_double(cloud_path, mesh_path):
    # double precision fields (photogrammetry and scanner tools write them): since three.js r185 the loader returns Float64 attributes
    pts = [(math.cos(i * 0.37) * 1.5, math.sin(i * 0.23), (i % 40) / 40.0) for i in range(500)]
    with open(cloud_path, 'wb') as fh:
        fh.write(('ply\nformat binary_little_endian 1.0\nelement vertex %d\nproperty double x\nproperty double y\nproperty double z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n' % len(pts)).encode())
        for i, (x, y, z) in enumerate(pts):
            fh.write(struct.pack('<dddBBB', x, y, z, i % 256, (i * 3) % 256, 128))
    v = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]
    f = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4), (2, 3, 7), (2, 7, 6), (1, 2, 6), (1, 6, 5), (3, 0, 4), (3, 4, 7)]
    with open(mesh_path, 'wb') as fh:
        fh.write(('ply\nformat binary_little_endian 1.0\nelement vertex 8\nproperty double x\nproperty double y\nproperty double z\nelement face 12\nproperty list uchar int vertex_indices\nend_header\n').encode())
        for x, y, z in v: fh.write(struct.pack('<ddd', x, y, z))
        for a, b, c in f: fh.write(struct.pack('<Biii', 3, a, b, c))


def write_fbx_ascii(path, nodes):
    def val(x):
        if isinstance(x, str): return '"%s"' % x
        if isinstance(x, float): return repr(x)
        return str(x)
    def emit(n, ind):
        name, props, kids = n
        t = '\t' * ind
        if len(props) == 1 and isinstance(props[0], tuple):
            kind, arr = props[0]
            head = '%s%s: *%d {\n%s\ta: %s\n%s}\n' % (t, name, len(arr), t, ','.join(repr(float(a)) if kind == 'd' else str(a) for a in arr), t)
            return head
        line = '%s%s: %s' % (t, name, ','.join(val(p) for p in props))  # no blanks after the commas, as in files from the real programs (the loader does not trim them)
        if kids:
            return line + ' {\n' + ''.join(emit(k, ind + 1) for k in kids) + t + '}\n'
        return line + '\n'
    body = ''.join(emit(n, 0) + '\n' for n in nodes)
    # three.js' FBX loader tells ASCII from binary by reading characters at the positions 0, 1, 3, 6, 10 ... of the file and refusing it when one
    # equals the matching letter of the binary signature; real files pass by luck of their long standard header, so the comment is padded until this one does
    sig = 'Kaydara\\FBX\\Binary\\\\'
    for pad in range(0, 200):
        text = '; FBX 7.4.0 project file\n; Generated test file for the 3D viewer' + '.' * pad + '\n\n' + body
        if all(i * (i + 1) // 2 >= len(text) or text[i * (i + 1) // 2] != sig[i] for i in range(len(sig))):
            break
    with open(path, 'w') as fh:
        fh.write(text)


def write_fbx_binary(path, nodes, compress=False):
    out = bytearray(b'Kaydara FBX Binary  \x00\x1a\x00' + struct.pack('<I', 7400))
    def prop(p):
        if isinstance(p, tuple):
            kind, arr = p
            if kind == 'd': raw = struct.pack('<%dd' % len(arr), *arr)
            else: raw = struct.pack('<%di' % len(arr), *arr)
            if compress:
                z = zlib.compress(raw)
                return kind.encode() + struct.pack('<III', len(arr), 1, len(z)) + z
            return kind.encode() + struct.pack('<III', len(arr), 0, len(raw)) + raw
        if isinstance(p, str):
            b = p.encode(); return b'S' + struct.pack('<I', len(b)) + b
        if isinstance(p, float): return b'D' + struct.pack('<d', p)
        if p > 2 ** 31 - 1 or p < -2 ** 31 or p in (0,) and False: return b'L' + struct.pack('<q', p)
        return b'I' + struct.pack('<i', p) if abs(p) < 100000 else b'L' + struct.pack('<q', p)
    def node(n, base):
        name, props, kids = n
        plist = b''.join(prop(p) for p in props)
        nm = name.encode()
        head_len = 13 + len(nm)
        body = bytearray()
        pos = base + head_len + len(plist)
        for k in kids:
            kb = node(k, pos + len(body)); body += kb
        if kids: body += b'\0' * 13
        end = base + head_len + len(plist) + len(body)
        return struct.pack('<III', end, len(props), len(plist)) + bytes([len(nm)]) + nm + plist + bytes(body)
    for n in nodes:
        out += node(n, len(out))
    out += b'\0' * 13
    out += b'\0' * 16  # a short footer, which the loader does not read
    open(path, 'wb').write(bytes(out))


def write_gcode(path):
    """print.gcode: a 20 mm box printed in 5 layers of 0.2 mm (perimeter, zig-zag infill), a retraction, travel moves, then on the last layer a
    full circle with G3 (I/J form) and a half circle with G2 (R form); absolute positions, relative extrusion (M83), millimeters."""
    lines = [';generated test file', 'G21', 'G90', 'M83', 'G28', 'M104 S200', 'G92 E0', 'G1 Z0.2 F600']
    area = 0.4 * 0.2 / 1.75 ** 2 * 4  # extrusion per mm, roughly
    def seg(x0, y0, x1, y1, f=1800):
        return 'G1 X%.3f Y%.3f E%.4f F%d' % (x1, y1, math.hypot(x1 - x0, y1 - y0) * area, f)
    for layer in range(5):
        z = 0.2 * (layer + 1)
        lines.append(';LAYER_CHANGE\n;Z:%.2f' % z)
        lines.append('G1 Z%.2f F600' % z)
        lines.append('G1 E-0.8 F2100')
        lines.append('G0 X10 Y10 F7200')
        lines.append('G1 E0.8 F2100')
        pts = [(10, 10), (30, 10), (30, 30), (10, 30), (10, 10)]
        for a, b in zip(pts, pts[1:]):
            lines.append(seg(a[0], a[1], b[0], b[1]))
        cur = (10, 10)
        direction = 1
        for row, y in enumerate(range(12, 30, 2)):
            xa, xb = (12, 28) if direction > 0 else (28, 12)
            if row == 0:
                lines.append('G0 X%d Y%d F7200' % (xa, y))
            else:
                lines.append(seg(cur[0], cur[1], cur[0], y))  # the connector to the next row
            lines.append(seg(xa, y, xb, y))
            cur = (xb, y)
            direction = -direction
    lines.append(';circle')
    lines.append('G0 X25 Y20 F7200')
    lines.append('G3 X25 Y20 I-5 J0 E%.4f F1200' % (2 * math.pi * 5 * area))
    lines.append('G0 X12 Y12 F7200')
    lines.append('G2 X18 Y12 R3 E%.4f F1200' % (math.pi * 3 * area))
    lines += ['M104 S0', 'G91', 'G1 Z5 F600', 'G90', 'M84']
    open(path, 'w').write('\n'.join(lines) + '\n')


def write_pcd(path_ascii, path_bin, n=4000):
    """cloud.pcd (ASCII) and cloud-bin.pcd (binary): a colored helix-like cloud with the packed rgb field."""
    rnd = random.Random(5)
    pts = []
    for i in range(n):
        t = i / n * 6 * math.pi
        x, y, z = math.cos(t) * (1 + 0.1 * math.sin(5 * t)), t / 8 - 1.2, math.sin(t) * (1 + 0.1 * math.sin(5 * t))
        x += rnd.gauss(0, 0.01); y += rnd.gauss(0, 0.01); z += rnd.gauss(0, 0.01)
        r, g, b = int(127 + 127 * math.cos(t)), int(127 + 127 * math.sin(t)), 180
        pts.append((x, y, z, (r << 16) | (g << 8) | b))
    head = 'VERSION .7\nFIELDS x y z rgb\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH %d\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS %d\nDATA %s\n'
    with open(path_ascii, 'w') as fh:
        fh.write(head % (n, n, 'ascii'))
        for x, y, z, c in pts:
            fh.write('%.5f %.5f %.5f %s\n' % (x, y, z, repr(struct.unpack('<f', struct.pack('<I', c))[0])))
    with open(path_bin, 'wb') as fh:
        fh.write((head % (n, n, 'binary')).encode())
        for x, y, z, c in pts:
            fh.write(struct.pack('<fffI', x, y, z, c))


def write_xyz(path, n=3000):
    """cloud.xyz: a comment line, then x y z r g b per line (colors 0..255)."""
    rnd = random.Random(9)
    with open(path, 'w') as fh:
        fh.write('# xyz test cloud: x y z r g b\n')
        for i in range(n):
            u, v = rnd.uniform(0, 2 * math.pi), rnd.uniform(0, math.pi)
            fh.write('%.4f %.4f %.4f %d %d %d\n' % (0.8 * math.sin(v) * math.cos(u), 0.8 * math.cos(v), 0.8 * math.sin(v) * math.sin(u), int(127 + 127 * math.cos(u)), int(127 + 127 * math.sin(v)), 90))


def write_usdz_stub(path):
    """usdc-stub.usdz: a zip with a .usdc entry that is not real USD: it only makes the viewer's notice for binary USD appear."""
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_STORED) as z:
        z.writestr('scene.usdc', b'PXR-USDC' + bytes(64))


def main():
    global OUT
    ap = argparse.ArgumentParser(description='Writes synthetic sample models.')
    ap.add_argument('--out', default=OUT, help='target folder (default: ./samples, ignored by git)')
    OUT = os.path.abspath(ap.parse_args().out)
    os.makedirs(OUT, exist_ok=True)
    # parts.glb: table, 4 legs, vase and a ball (meters, y up)
    top = flat(*box(1.2, 0.05, 0.7, (0, 0.725, 0)))
    legs = [flat(*box(0.06, 0.7, 0.06, (sx * 0.55, 0.35, sz * 0.3))) for sx in (-1, 1) for sz in (-1, 1)]
    legs_v, legs_f = [], []
    for v, f in legs:
        legs_f += [(a + len(legs_v), b + len(legs_v), c + len(legs_v)) for a, b, c in f]
        legs_v += v
    vase_v, vase_f = cylinder(0.07, 0.3, 40, (-0.3, 0.9, 0.05))
    ball_v, ball_f, _ = sphere(0.11, 40, 20, (0.3, 0.84, -0.05))
    floor = flat(*box(2.4, 0.02, 1.8, (0, -0.01, 0)))
    write_glb(os.path.join(OUT, 'parts.glb'), [
        {'name': 'Floor', 'v': floor[0], 'f': floor[1], 'color': lin(0xB8B2A7)},
        {'name': 'Table top', 'v': top[0], 'f': top[1], 'color': lin(0x9C6B3E)},
        {'name': 'Table legs', 'v': legs_v, 'f': legs_f, 'color': lin(0x5E4026)},
        {'name': 'Vase', 'v': vase_v, 'f': vase_f, 'color': lin(0x2E7DAF)},
        {'name': 'Ball', 'v': ball_v, 'f': ball_f, 'color': lin(0xC8402F), 'rough': 0.35},
    ])
    # textured.glb: sphere with a checker texture
    sv, sf, suv = sphere(0.5, 64, 32)
    img = png(256, 256, lambda x, y: (232, 196, 64) if (x // 32 + y // 32) % 2 == 0 else (40, 60, 120))
    write_glb(os.path.join(OUT, 'textured.glb'), [{'name': 'Textured sphere', 'v': sv, 'f': sf, 'uv': suv, 'color': (1, 1, 1, 1)}], image=img)
    write_gltf_variants(os.path.join(OUT, 'textured.glb'), OUT)

    # animated.glb: a torus that turns around its up axis (one clip, 2 s)
    tv2, tf2 = torus(0.4, 0.12, 48, 20)
    tv2 = [(x, y + 0.5, z) for x, y, z in tv2]
    quats = [(0, math.sin(a / 2), 0, math.cos(a / 2)) for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2, 2 * math.pi)]
    write_glb(os.path.join(OUT, 'animated.glb'), [{'name': 'Ring', 'v': tv2, 'f': tf2, 'color': lin(0xD08A2E), 'rough': 0.4}],
              anim={'name': 'Spin', 'node': 0, 'times': [0, 0.5, 1.0, 1.5, 2.0], 'quats': quats})

    # cloud.ply: trefoil knot as points with colors
    rnd = random.Random(7)
    pts = []
    for i in range(160000):
        t = rnd.random() * 2 * math.pi
        x, y, z = math.sin(t) + 2 * math.sin(2 * t), math.cos(t) - 2 * math.cos(2 * t), -math.sin(3 * t)
        r = 0.18 * rnd.random() ** 0.5
        a = rnd.random() * 2 * math.pi
        px, py, pz = x * 0.3 + r * math.cos(a), z * 0.3 + r * math.sin(a), y * 0.3
        h = (t / (2 * math.pi)) % 1.0
        col = tuple(int(255 * c) for c in hsv(h, 0.75, 0.95))
        pts.append((px, py, pz, *col))
    with open(os.path.join(OUT, 'cloud.ply'), 'wb') as fh:
        fh.write(('ply\nformat binary_little_endian 1.0\nelement vertex %d\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n' % len(pts)).encode())
        for p in pts:
            fh.write(struct.pack('<3f3B', *p))

    # mesh.ply and torus.obj: the same torus with a color gradient
    tv, tf = torus(0.5, 0.18, 96, 32)
    cols = [tuple(int(255 * c) for c in hsv((math.atan2(z, x) / (2 * math.pi)) % 1.0, 0.6, 0.9)) for x, y, z in tv]
    with open(os.path.join(OUT, 'mesh.ply'), 'wb') as fh:
        fh.write(('ply\nformat binary_little_endian 1.0\nelement vertex %d\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face %d\nproperty list uchar int vertex_indices\nend_header\n' % (len(tv), len(tf))).encode())
        for p, c in zip(tv, cols):
            fh.write(struct.pack('<3f3B', *p, *c))
        for a, b, c in tf:
            fh.write(struct.pack('<B3i', 3, a, b, c))
    with open(os.path.join(OUT, 'torus.obj'), 'w') as fh:
        fh.write('# torus, meters, +Y up\no torus\n')
        for p, c in zip(tv, cols):
            fh.write('v %.5f %.5f %.5f %.4f %.4f %.4f\n' % (*p, *(u / 255 for u in c)))
        for a, b, c in tf:
            fh.write('f %d %d %d\n' % (a + 1, b + 1, c + 1))

    # bracket.stl (mm, z up)
    bv, bf = bracket()
    with open(os.path.join(OUT, 'bracket.stl'), 'wb') as fh:
        fh.write(b'binary STL, millimeters, +Z up'.ljust(80, b' '))
        fh.write(struct.pack('<I', len(bf)))
        n = normals_face(bv, bf)
        for (a, b, c), nn in zip(bf, n):
            fh.write(struct.pack('<12fH', *nn, *bv[a], *bv[b], *bv[c], 0))

    # ascii.stl and ascii.ply: one tetrahedron as text (Orca gives text files to the text editor, binary ones to the bytes editor)
    tv3 = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)]
    tf3 = [(0, 2, 1), (0, 1, 3), (0, 3, 2), (1, 2, 3)]
    with open(os.path.join(OUT, 'ascii.stl'), 'w') as fh:
        fh.write('solid tetra\n')
        for (a, b, c), nn in zip(tf3, normals_face(tv3, tf3)):
            fh.write('facet normal %g %g %g\n outer loop\n' % nn)
            for i in (a, b, c):
                fh.write('  vertex %g %g %g\n' % tv3[i])
            fh.write(' endloop\nendfacet\n')
        fh.write('endsolid tetra\n')
    with open(os.path.join(OUT, 'ascii.ply'), 'w') as fh:
        fh.write('ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 4\nproperty list uchar int vertex_indices\nend_header\n')
        for v in tv3:
            fh.write('%g %g %g\n' % v)
        for f in tf3:
            fh.write('3 %d %d %d\n' % f)

    # parts.3mf: three colored objects in millimeters
    objs = [
        ('Base plate', box(60, 40, 6, (0, 0, 3)), '#9AA3AD'),
        ('Post', cylinder(8, 30, 40, (0, 0, 21), axis='z'), '#C8402F'),
        ('Cap', box(24, 24, 6, (0, 0, 39)), '#2E7DAF'),
    ]
    write_3mf(os.path.join(OUT, 'parts.3mf'), objs)
    write_3mf_production(os.path.join(OUT, 'parts-production.3mf'))
    write_skinned_glb(os.path.join(OUT, 'skinned.glb'))
    write_splat(os.path.join(OUT, 'splat'))
    fbx_nodes = _fbx_box()
    write_fbx_ascii(os.path.join(OUT, 'box.fbx'), fbx_nodes)
    write_fbx_binary(os.path.join(OUT, 'box-bin.fbx'), fbx_nodes)
    write_fbx_ascii(os.path.join(OUT, 'box-zup.fbx'), _fbx_box(True))
    write_ply_double(os.path.join(OUT, 'cloud-double.ply'), os.path.join(OUT, 'mesh-double.ply'))
    write_gcode(os.path.join(OUT, 'print.gcode'))
    write_pcd(os.path.join(OUT, 'cloud.pcd'), os.path.join(OUT, 'cloud-bin.pcd'))
    write_xyz(os.path.join(OUT, 'cloud.xyz'))
    write_usdz_stub(os.path.join(OUT, 'usdc-stub.usdz'))
    pack_meshopt(OUT)
    shutil.copyfile(os.path.join(HERE, '..', 'editor', 'start.3dview'), os.path.join(OUT, 'start.3dview'))  # the "new file" start file
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)), 'bytes')


def hsv(h, s, v):
    import colorsys
    return colorsys.hsv_to_rgb(h, s, v)


def normals_face(v, f):
    out = []
    for a, b, c in f:
        ux, uy, uz = [v[b][i] - v[a][i] for i in range(3)]
        wx, wy, wz = [v[c][i] - v[a][i] for i in range(3)]
        n = (uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx)
        l = math.sqrt(sum(x * x for x in n)) or 1.0
        out.append(tuple(x / l for x in n))
    return out


def bracket():
    """An L-bracket (base plate + wall) with two bolt heads on the base (z up, millimeters)."""
    v, f = [], []
    parts = [box(80, 30, 5, (40, 15, 2.5)), box(5, 30, 40, (2.5, 15, 20))]
    for cx in (30.0, 60.0):
        parts.append(cylinder(4.0, 7.0, 24, (cx, 15.0, 8.5), axis='z'))
    for pv, pf in parts:
        off = len(v)
        v += pv
        f += [(a + off, b + off, c + off) for a, b, c in pf]
    return v, f


def write_3mf_production(path):
    """A Bambu Studio / Orca Slicer style package: 3D/3dmodel.model holds objects made of components that point into
    3D/Objects/*.model (p:path), build items carry transforms, names and filament colors live in Metadata/*.config.
    Like the slicers do, every object file has its own object id (the unit tests also cover files that reuse an id)."""
    ns = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"'

    def sub(oid, mesh, paint=None):
        # paint: triangle number -> paint_color, as Bambu Studio and Orca Slicer write painted (multi-color) triangles
        v, f = mesh
        paint = paint or {}
        verts = ''.join('<vertex x="%.4f" y="%.4f" z="%.4f"/>' % p for p in v)
        tris = ''.join('<triangle v1="%d" v2="%d" v3="%d"%s/>' % (t + ((' paint_color="%s"' % paint[i]) if i in paint else '',)) for i, t in enumerate(f))
        return '<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" %s><resources><object id="%d" type="model"><mesh><vertices>%s</vertices><triangles>%s</triangles></mesh></object></resources><build/></model>' % (ns, oid, verts, tris)

    def tr(x, y, z):
        return '1 0 0 0 1 0 0 0 1 %g %g %g' % (x, y, z)

    main = ('<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" %s requiredextensions="p"><metadata name="Application">sample</metadata><resources>'
            '<object id="3" p:UUID="00000003" type="model"><components><component p:path="/3D/Objects/base_1.model" objectid="1" transform="%s"/><component p:path="/3D/Objects/post_2.model" objectid="2" transform="%s"/></components></object>'
            '<object id="5" p:UUID="00000005" type="model"><components><component p:path="/3D/Objects/post_2.model" objectid="2"/></components></object>'
            '</resources><build><item objectid="3" transform="%s" printable="1"/><item objectid="5" transform="%s" printable="1"/></build></model>') % (ns, tr(0, 0, 0), tr(0, 0, 6), tr(100, 100, 0), tr(160, 100, 0))
    cfg = ('<?xml version="1.0" encoding="UTF-8"?><config><object id="3"><metadata key="name" value="Stand"/><metadata key="extruder" value="1"/>'
           '<part id="1" subtype="normal_part"><metadata key="name" value="Base plate"/></part><part id="2" subtype="normal_part"><metadata key="name" value="Post"/></part></object>'
           '<object id="5"><metadata key="name" value="Spare post"/><metadata key="extruder" value="2"/></object></config>')
    settings = '{"filament_colour": ["#9AA3AD", "#C8402F"], "printer_model": "sample"}'
    ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
    rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z_add(z, '[Content_Types].xml', ct)
        z_add(z, '_rels/.rels', rels)
        z_add(z, '3D/3dmodel.model', main)
        # the top of the base plate is painted with filament 2 (one hex digit: "8"); one triangle has finer paint ("5", a split triangle) than a viewer can show
        z_add(z, '3D/Objects/base_1.model', sub(1, box(60, 40, 6, (0, 0, 3)), {2: '8', 3: '8', 4: '5'}))
        z_add(z, '3D/Objects/post_2.model', sub(2, cylinder(8, 30, 40, (0, 0, 15), axis='z')))
        z_add(z, 'Metadata/model_settings.config', cfg)
        z_add(z, 'Metadata/project_settings.config', settings)


def write_3mf(path, objs):
    ns = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
    mats = ''.join('<base name="%s" displaycolor="%s"/>' % (n, c) for n, _, c in objs)
    items, res = '', ''
    for i, (name, (v, f), _) in enumerate(objs):
        verts = ''.join('<vertex x="%.4f" y="%.4f" z="%.4f"/>' % p for p in v)
        tris = ''.join('<triangle v1="%d" v2="%d" v3="%d"/>' % t for t in f)
        res += '<object id="%d" name="%s" type="model" pid="1" pindex="%d"><mesh><vertices>%s</vertices><triangles>%s</triangles></mesh></object>' % (i + 2, name, i, verts, tris)
        items += '<item objectid="%d"/>' % (i + 2)
    model = '<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="%s"><resources><basematerials id="1">%s</basematerials>%s</resources><build>%s</build></model>' % (ns, mats, res, items)
    ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
    rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z_add(z, '[Content_Types].xml', ct)
        z_add(z, '_rels/.rels', rels)
        z_add(z, '3D/3dmodel.model', model)


if __name__ == '__main__':
    main()
