import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findNeighbor, glbBudget, gltfExternalUris, gltfNeeds, gltfToGlb, imageSize, readGlbJson, stripBasisu, uriPath, withGlbJson } from '../editor/gltf-pack.js'

// one triangle: 3 positions (36 bytes) and 3 indices (6 bytes, padded to 8)
const tri = () => {
  const b = new Uint8Array(44)
  new Float32Array(b.buffer, 0, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0])
  new Uint16Array(b.buffer, 36, 3).set([0, 1, 2])
  return b
}
const b64 = (u8) => Buffer.from(u8).toString('base64')
const gltf = (bufUri, extra = {}) => ({
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
    { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }
  ],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
  buffers: [{ byteLength: 44, uri: bufUri }],
  ...extra
})
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==', 'base64'))
const binChunk = (glb) => {
  const dv = new DataView(glb)
  const at = 20 + ((dv.getUint32(12, true) + 3) & ~3)
  return new Uint8Array(glb, at + 8, dv.getUint32(at, true))
}

test('a .gltf with a data: buffer becomes a GLB with the same data', () => {
  const r = gltfToGlb(gltf('data:application/octet-stream;base64,' + b64(tri())), () => null)
  const json = readGlbJson(r.glb)
  assert.equal(json.buffers.length, 1)
  assert.equal(json.buffers[0].uri, undefined)
  assert.equal(new DataView(r.glb).getUint32(8, true), r.glb.byteLength, 'the GLB header length is the real length')
  assert.deepEqual([...binChunk(r.glb).subarray(0, 44)], [...tri()])
})

test('separate files: buffers from the neighbours; several buffers are joined and their views moved', () => {
  const a = tri()
  const c = new Uint8Array([1, 2, 3, 4, 5])
  const doc = gltf('a.bin', { buffers: [{ byteLength: 44, uri: 'a.bin' }, { byteLength: 5, uri: 'sub/c.bin' }] })
  doc.bufferViews.push({ buffer: 1, byteOffset: 1, byteLength: 4 })
  const files = { 'a.bin': a, 'sub/c.bin': c }
  const r = gltfToGlb(doc, (uri) => files[uri] || null)
  const json = readGlbJson(r.glb)
  assert.equal(json.bufferViews[2].buffer, 0)
  const bin = binChunk(r.glb)
  assert.deepEqual([...bin.subarray(json.bufferViews[2].byteOffset, json.bufferViews[2].byteOffset + 4)], [2, 3, 4, 5], 'a view of the second buffer reads the same bytes')
  assert.deepEqual([...bin.subarray(0, 44)], [...a])
  assert.deepEqual(gltfExternalUris(doc), [{ uri: 'a.bin', kind: 'buffer' }, { uri: 'sub/c.bin', kind: 'buffer' }])
})

test('pictures: a data: picture and a file become views; a missing picture is listed and its texture leaves the materials', () => {
  const doc = gltf('data:application/octet-stream;base64,' + b64(tri()), {
    images: [{ uri: 'data:image/png;base64,' + b64(PNG) }, { uri: 'tex%20one.png' }, { uri: 'gone.jpg' }]
  })
  const r = gltfToGlb(doc, (uri) => (uri === 'tex%20one.png' ? PNG : null))
  const json = readGlbJson(r.glb)
  assert.equal(json.images.length, 3)
  for (const im of json.images) assert.ok(im.bufferView != null && im.mimeType && im.uri === undefined)
  assert.deepEqual(r.missingImages, ['gone.jpg'])
  const v = json.bufferViews[json.images[0].bufferView]
  assert.deepEqual([...binChunk(r.glb).subarray(v.byteOffset, v.byteOffset + 8)], [...PNG.subarray(0, 8)])
})

test('a missing buffer is an error that names the files; a short one is too', () => {
  assert.throws(() => gltfToGlb(gltf('x.bin'), () => null), (e) => e.message === 'gltf_missing_files' && e.missing[0] === 'x.bin')
  assert.throws(() => gltfToGlb(gltf('x.bin'), () => new Uint8Array(10)), (e) => e.message === 'gltf_short_buffer' && e.uri === 'x.bin')
})

test('paths of neighbours: percent-decoding, ./ and ../, and a name match when a flat drop has no folders', () => {
  assert.equal(uriPath('tex%20one.png'), 'tex one.png')
  assert.equal(uriPath('./a/../b/c.bin?x=1'), 'b/c.bin')
  assert.equal(uriPath('../up.bin'), null)
  assert.equal(uriPath('https://example.com/a.bin'), null)
  const files = new Map([['model/scene.bin', 1], ['model/tex/a b.png', 2], ['other/x.bin', 3]])
  assert.equal(findNeighbor(files, 'model', 'scene.bin'), 1)
  assert.equal(findNeighbor(files, 'model', 'tex/a%20b.png'), 2)
  assert.equal(findNeighbor(files, 'model', '../other/x.bin'), 3, 'by name when the path leaves the folder')
  assert.equal(findNeighbor(new Map([['scene.bin', 9]]), '', 'sub/scene.bin'), 9, 'a flat drop')
  assert.equal(findNeighbor(files, 'model', 'nope.bin'), null)
})

test('needs: Draco and KTX2 are named by extensionsUsed or extensionsRequired', () => {
  assert.deepEqual(gltfNeeds({ extensionsUsed: ['KHR_draco_mesh_compression'] }), { draco: true, ktx2: false })
  assert.deepEqual(gltfNeeds({ extensionsRequired: ['KHR_texture_basisu'] }), { draco: false, ktx2: true })
  assert.deepEqual(gltfNeeds({}), { draco: false, ktx2: false })
  assert.equal(readGlbJson(new Uint8Array([1, 2, 3]).buffer), null)
})

test('stripBasisu: a texture with a fallback keeps it, one without is taken out of the materials, the binary data is untouched', () => {
  const doc = gltf('data:application/octet-stream;base64,' + b64(tri()), {
    images: [{ uri: 'data:image/png;base64,' + b64(PNG) }, { uri: 'data:image/ktx2;base64,' + b64(PNG) }],
    textures: [{ source: 0, extensions: { KHR_texture_basisu: { source: 1 } } }, { extensions: { KHR_texture_basisu: { source: 1 } } }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 1 }, metallicRoughnessTexture: { index: 0 } }, normalTexture: { index: 1, scale: 1 } }],
    extensionsUsed: ['KHR_texture_basisu'],
    extensionsRequired: ['KHR_texture_basisu']
  })
  const glb = gltfToGlb(doc, () => null).glb
  const r = stripBasisu(glb)
  const json = readGlbJson(r.glb)
  assert.equal(r.dropped, 1)
  assert.equal(r.kept, 1)
  assert.equal(json.extensionsUsed, undefined)
  assert.equal(json.extensionsRequired, undefined)
  assert.equal(json.materials[0].pbrMetallicRoughness.baseColorTexture, undefined)
  assert.equal(json.materials[0].normalTexture, undefined)
  assert.equal(json.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.index, 0)
  assert.equal(json.textures[0].extensions, undefined)
  assert.deepEqual([...binChunk(r.glb)], [...binChunk(glb)])
  assert.equal(new DataView(r.glb).getUint32(8, true), r.glb.byteLength)
  assert.equal(readGlbJson(withGlbJson(glb, { ...json, extra: 1 })).extra, 1)
})

test('glbBudget: triangles, vertices and the GPU memory of the pictures from their headers', () => {
  const png = new Uint8Array(64)
  png.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])
  new DataView(png.buffer).setUint32(16, 4096)
  new DataView(png.buffer).setUint32(20, 2048)
  const doc = gltf('data:application/octet-stream;base64,' + b64(tri()), { images: [{ uri: 'data:image/png;base64,' + b64(png) }] })
  const b = glbBudget(gltfToGlb(doc, () => null).glb)
  assert.equal(b.tris, 1)
  assert.equal(b.verts, 3)
  assert.deepEqual(b.images, [{ w: 4096, h: 2048 }])
  assert.equal(b.textureBytes, Math.round(4096 * 2048 * 4 * (4 / 3)))
  assert.equal(glbBudget(new Uint8Array(10).buffer), null)
  assert.deepEqual(imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x01, 0x00, 0x02, 0x00, 3, 1, 0x22, 0, 1, 0x03, 0x11, 0x01])), { w: 512, h: 256 }, 'JPEG start-of-frame')
  assert.equal(imageSize(new Uint8Array(40)), null)
})

test('a missing picture takes its texture out of the materials (a gray stand-in would break a normal map)', () => {
  const doc = gltf('data:application/octet-stream;base64,' + b64(tri()), {
    images: [{ uri: 'n.png' }, { uri: 'c.png' }],
    textures: [{ source: 0 }, { source: 1 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 1 } }, normalTexture: { index: 0 } }]
  })
  const r = gltfToGlb(doc, (uri) => (uri === 'c.png' ? PNG : null))
  const m = readGlbJson(r.glb).materials[0]
  assert.equal(m.normalTexture, undefined)
  assert.equal(m.pbrMetallicRoughness.baseColorTexture.index, 1)
})

test('a meshopt .gltf: the fallback buffer has no data, and a compressed view is moved with its own buffer', () => {
  const a = new Uint8Array(16).fill(7)
  const c = new Uint8Array(8).fill(9)
  const doc = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 16, uri: 'a.bin' }, { byteLength: 40, extensions: { EXT_meshopt_compression: { fallback: true } } }, { byteLength: 8, uri: 'c.bin' }],
    bufferViews: [{ buffer: 1, byteLength: 24, extensions: { EXT_meshopt_compression: { buffer: 2, byteOffset: 4, byteLength: 4, byteStride: 4, count: 1, mode: 'ATTRIBUTES' } } }]
  }
  const r = gltfToGlb(doc, (uri) => ({ 'a.bin': a, 'c.bin': c })[uri] || null)
  const json = readGlbJson(r.glb)
  const m = json.bufferViews[0].extensions.EXT_meshopt_compression
  assert.equal(m.buffer, 0)
  assert.deepEqual([...binChunk(r.glb).subarray(m.byteOffset, m.byteOffset + 4)], [9, 9, 9, 9], 'the compressed bytes are where the extension says')
  assert.equal(json.buffers.length, 1)
})

test('neighbours: case and composed/decomposed names, a unique name only, and no address on the web', () => {
  const files = new Map([['Model/Tex/Wood.PNG', 1], ['a/dup.png', 2], ['b/dup.png', 3], ['Ku\u0308che.png', 4]])
  assert.equal(findNeighbor(files, 'Model', 'tex/wood.png'), 1, 'case is ignored')
  assert.equal(findNeighbor(files, '', 'K\u00fcche.png'), 4, 'NFC against NFD')
  assert.equal(findNeighbor(files, 'x', 'dup.png'), null, 'two files of that name: a guess is not made')
  assert.equal(findNeighbor(files, 'x', 'https://example.com/Wood.PNG'), null)
})

test('buffers that are not 4-byte aligned are padded, and the lengths of the GLB agree', () => {
  const doc = gltf('a.bin', { buffers: [{ byteLength: 5, uri: 'a.bin' }, { byteLength: 3, uri: 'b.bin' }] })
  doc.bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: 5 }, { buffer: 1, byteOffset: 0, byteLength: 3 }]
  doc.accessors = []
  doc.meshes = []
  const r = gltfToGlb(doc, (uri) => (uri === 'a.bin' ? new Uint8Array([1, 2, 3, 4, 5]) : new Uint8Array([6, 7, 8])))
  const json = readGlbJson(r.glb)
  assert.equal(json.bufferViews[1].byteOffset % 4, 0)
  assert.equal(json.buffers[0].byteLength % 4, 0)
  assert.deepEqual([...binChunk(r.glb).subarray(json.bufferViews[1].byteOffset, json.bufferViews[1].byteOffset + 3)], [6, 7, 8])
  assert.equal(new DataView(r.glb).getUint32(8, true), r.glb.byteLength)
})

test('stripBasisu keeps a texture that has another source extension (WebP) beside the KTX2 one', () => {
  const doc = gltf('data:application/octet-stream;base64,' + b64(tri()), {
    images: [{ uri: 'data:image/png;base64,' + b64(PNG) }],
    textures: [{ extensions: { KHR_texture_basisu: { source: 0 }, EXT_texture_webp: { source: 0 } } }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }]
  })
  const r = stripBasisu(gltfToGlb(doc, () => null).glb)
  assert.equal(r.dropped, 0)
  assert.equal(r.kept, 1)
  assert.equal(readGlbJson(r.glb).materials[0].pbrMetallicRoughness.baseColorTexture.index, 0)
})

test('glbBudget never throws on a damaged file (the estimate is only a courtesy)', () => {
  const glb = gltfToGlb(gltf('data:application/octet-stream;base64,' + b64(tri())), () => null).glb
  const bad = readGlbJson(glb)
  for (const damage of [{ meshes: { a: 1 } }, { accessors: 5 }, { images: [{ bufferView: 99 }] }, { meshes: [{ primitives: [null] }] }, { images: 'x' }]) {
    assert.doesNotThrow(() => glbBudget(withGlbJson(glb, { ...bad, ...damage })))
  }
})
