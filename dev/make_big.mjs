#!/usr/bin/env node
// Writes LARGE synthetic test files for measuring the compressor (never committed; they go to the folder you name):
//   node dev/make_big.mjs <out-dir> [mb-of-glb=140] [million-splats=3.2]
//   big.glb   a textured landscape: one mesh with positions, normals and UVs, and 3 PNG textures of 4096 x 4096 (about the given size)
//   splat.ply a Gaussian-splat-like PLY (binary, position, f_dc_*, opacity, scale, rotation), 68 bytes per point; splat.splat the same as a .splat file (32 bytes per point)
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: node dev/make_big.mjs <out-dir> [mb=140] [million-splats=3.2]')
const targetMB = Number(process.argv[3] || 140)
const splats = Math.round(Number(process.argv[4] || 3.2) * 1e6)
mkdirSync(out, { recursive: true })

// ---- a PNG without any library
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b }
  }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))])
}
let seed = 7
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const noise = (x, y, k) => Math.sin(x * 0.013 * k + y * 0.007) * Math.cos(y * 0.011 * k - x * 0.005) // smooth, photo-like gradients
const SIZE = 4096
const textures = [0, 1, 2].map((k) => png(SIZE, SIZE, (x, y) => {
  const n = noise(x, y, k + 1) * 0.5 + 0.5
  const g = rnd() * 4
  return [Math.min(255, 40 + n * 180 + g), Math.min(255, 60 + (1 - n) * 150 + g), Math.min(255, 30 + noise(y, x, k + 2) * 60 + 90 + g)]
}))

// ---- the mesh: a heightfield; its size follows the requested MB (a mesh of N x N cells costs about 48 bytes per cell in a GLB)
const texBytes = textures.reduce((a, t) => a + t.length, 0)
const meshBytes = Math.max(2e6, targetMB * 1e6 * 0.55) // about half of the file is mesh
const N = Math.max(100, Math.floor(Math.sqrt(meshBytes / 48)))
const nv = (N + 1) * (N + 1)
const pos = new Float32Array(nv * 3)
const nor = new Float32Array(nv * 3)
const uv = new Float32Array(nv * 2)
const height = (x, y) => 18 * Math.sin(x * 0.0021) * Math.cos(y * 0.0017) + 5 * Math.sin(x * 0.011 + y * 0.009)
for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
  const v = j * (N + 1) + i
  const x = i * 0.05
  const y = j * 0.05
  const h = height(i, j)
  pos.set([x, h, y], 3 * v)
  const dx = height(i + 1, j) - height(i - 1, j)
  const dz = height(i, j + 1) - height(i, j - 1)
  const l = Math.hypot(dx, 0.1, dz)
  nor.set([-dx / l, 0.1 / l, -dz / l], 3 * v)
  uv.set([i / N, j / N], 2 * v)
}
const idx = new Uint32Array(N * N * 6)
let t = 0
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const a = j * (N + 1) + i
  idx.set([a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2], t); t += 6
}
const parts = []
const views = []
const accs = []
let len = 0
const add = (u8, target) => { while (len % 4) { parts.push(Buffer.alloc(1)); len++ } views.push({ buffer: 0, byteOffset: len, byteLength: u8.byteLength, ...(target ? { target } : {}) }); parts.push(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)); len += u8.byteLength; return views.length - 1 }
const acc = (u8, componentType, count, type, target, extra = {}) => { accs.push({ bufferView: add(u8, target), componentType, count, type, ...extra }); return accs.length - 1 }
const mm = (a, c) => [0, 1, 2].slice(0, c).map((k) => { let lo = Infinity; for (let i = k; i < a.length; i += c) if (a[i] < lo) lo = a[i]; return lo })
const MM = (a, c) => [0, 1, 2].slice(0, c).map((k) => { let hi = -Infinity; for (let i = k; i < a.length; i += c) if (a[i] > hi) hi = a[i]; return hi })
const A = { POSITION: acc(pos, 5126, nv, 'VEC3', 34962, { min: mm(pos, 3), max: MM(pos, 3) }), NORMAL: acc(nor, 5126, nv, 'VEC3', 34962), TEXCOORD_0: acc(uv, 5126, nv, 'VEC2', 34962) }
const I = acc(idx, 5125, idx.length, 'SCALAR', 34963)
const imgViews = textures.map((tx) => add(new Uint8Array(tx)))
const json = {
  asset: { version: '2.0', generator: 'make_big.mjs' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Landscape', mesh: 0 }],
  meshes: [{ name: 'Landscape', primitives: [{ attributes: A, indices: I, material: 0 }] }],
  materials: [{ name: 'Ground', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 1 }, roughnessFactor: 1, metallicFactor: 0 }, normalTexture: { index: 2 } }],
  textures: [0, 1, 2].map((i) => ({ source: i, sampler: 0 })), samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  images: imgViews.map((bv) => ({ bufferView: bv, mimeType: 'image/png' })), accessors: accs, bufferViews: views, buffers: [{ byteLength: len }]
}
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)])
const binPad = (4 - (len % 4)) % 4
const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + len + binPad, 8); head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16)
const bh = Buffer.alloc(8); bh.writeUInt32LE(len + binPad, 0); bh.writeUInt32LE(0x004e4942, 4)
writeFileSync(join(out, 'big.glb'), Buffer.concat([head, js, bh, ...parts, Buffer.alloc(binPad)]))
console.log(`big.glb: ${((12 + 8 + js.length + 8 + len) / 1e6).toFixed(1)} MB, ${(idx.length / 3).toLocaleString()} triangles, ${nv.toLocaleString()} vertices, textures ${(texBytes / 1e6).toFixed(1)} MB`)

// ---- the splat-like PLY
const props = ['x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']
const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${splats}\n${props.map((p) => `property float ${p}`).join('\n')}\nend_header\n`
const body = Buffer.alloc(splats * props.length * 4)
const f = new Float32Array(body.buffer, body.byteOffset, splats * props.length)
for (let i = 0; i < splats; i++) {
  const a = i * 0.0007
  const r = 3 + 2 * Math.sin(i * 0.00013)
  const o = i * props.length
  f[o] = Math.cos(a * 11) * r + rnd() * 0.05; f[o + 1] = Math.sin(a * 7) * r * 0.6 + rnd() * 0.05; f[o + 2] = Math.sin(a * 11) * r + rnd() * 0.05
  f[o + 6] = Math.sin(a) * 1.2; f[o + 7] = Math.cos(a * 3) * 1.2; f[o + 8] = Math.sin(a * 5) * 1.2
  f[o + 9] = 2 + rnd(); f[o + 10] = -4 + rnd(); f[o + 11] = -4 + rnd(); f[o + 12] = -4 + rnd(); f[o + 13] = 1
}
writeFileSync(join(out, 'splat.ply'), Buffer.concat([Buffer.from(header), body]))
// the same scene as .splat (32 bytes per splat: position, scale, rgba, rotation w x y z), to measure the .splat path
{
  const out32 = Buffer.alloc(splats * 32)
  const f32 = new Float32Array(out32.buffer, out32.byteOffset, splats * 8)
  const C0 = 0.28209479177387814
  for (let i = 0; i < splats; i++) {
    const o = i * props.length
    const q = i * 8
    f32[q] = f[o]; f32[q + 1] = f[o + 1]; f32[q + 2] = f[o + 2]
    f32[q + 3] = Math.exp(f[o + 10]); f32[q + 4] = Math.exp(f[o + 11]); f32[q + 5] = Math.exp(f[o + 12])
    const b = i * 32 + 24
    for (let k = 0; k < 3; k++) out32[b + k] = Math.max(0, Math.min(255, Math.round((0.5 + C0 * f[o + 6 + k]) * 255)))
    out32[b + 3] = Math.round(255 / (1 + Math.exp(-f[o + 9])))
    out32[b + 4] = 255; out32[b + 5] = 128; out32[b + 6] = 128; out32[b + 7] = 128
  }
  writeFileSync(join(out, 'splat.splat'), out32)
  console.log(`splat.splat: ${(out32.length / 1e6).toFixed(1)} MB`)
}
// a long G-code file: layers of a zig-zag with arcs and travel moves, about 60 MB (to measure the toolpath reader)
{
  const lines = ['G21', 'G90', 'M83', 'G92 E0']
  let size = 0
  let layer = 0
  while (size < 60e6) {
    const z = (++layer * 0.2).toFixed(2)
    lines.push(`;LAYER_CHANGE\nG1 Z${z} F600`)
    for (let r = 0; r < 400; r++) {
      const y = (r * 0.4).toFixed(3)
      lines.push(`G0 X0 Y${y} F9000`, `G1 X100 Y${y} E0.4123 F1800`, `G3 X100 Y${(r * 0.4 + 0.4).toFixed(3)} I0 J0.2 E0.0421`, `G1 X0 Y${(r * 0.4 + 0.4).toFixed(3)} E0.4123`)
    }
    size = lines.reduce((a, l) => a + l.length + 1, 0)
  }
  writeFileSync(join(out, 'big.gcode'), lines.join('\n') + '\n')
  console.log(`big.gcode: ${(size / 1e6).toFixed(1)} MB, ${layer} layers`)
}
console.log(`splat.ply: ${((header.length + body.length) / 1e6).toFixed(1)} MB, ${splats.toLocaleString()} points`)
