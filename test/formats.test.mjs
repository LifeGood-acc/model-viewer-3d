import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dropBadTriangles, plyAsciiShortfall, fbxSettings, fbxUnitName, parseXyz, sniffText, zipNames } from '../editor/formats.js'

test('xyz: colors 0..255 or 0..1, separators, comments, headers and a point count line are skipped', () => {
  const a = parseXyz('# header\n3\n0 0 0 255 0 0\n1,2,3,0,255,0\n1;2;3;0;0;255\n\n// c\nx y z\n')
  assert.equal(a.count, 3)
  assert.equal(a.skipped, 2, 'the count line and the "x y z" header')
  assert.deepEqual([...a.colors.subarray(0, 3)], [1, 0, 0])
  assert.deepEqual([...a.positions.subarray(3, 6)], [1, 2, 3])
  const b = parseXyz('0 0 0 0.5 0.25 1\n1 1 1 0 0 0\n')
  assert.deepEqual([...b.colors.subarray(0, 3)], [0.5, 0.25, 1], 'already 0..1')
  const c = parseXyz('0 0 0 1 2 3\n1 1 1\n')
  assert.equal(c.colors, null, 'colors on some lines only: none')
  assert.equal(parseXyz('').count, 0)
  assert.equal(parseXyz('1 2 3 4\n').colors, null, 'four columns (an intensity) are not a color')
  assert.equal(parseXyz(Array.from({ length: 5000 }, (_, i) => `${i} 0 0`).join('\n')).count, 5000, 'growing past the first allocation')
})

test('text without a file name is told by its first lines', () => {
  assert.equal(sniffText('ply\nformat ascii 1.0'), 'ply')
  assert.equal(sniffText('solid x\nfacet'), 'stl')
  assert.equal(sniffText('{"asset":{}}'), 'gltf')
  assert.equal(sniffText('; FBX 7.4.0 project file\n'), 'fbx')
  assert.equal(sniffText('# .PCD v0.7 - Point Cloud Data file format\nVERSION 0.7'), 'pcd')
  assert.equal(sniffText('VERSION .7\nFIELDS x y z'), 'pcd')
  assert.equal(sniffText(';generated\nG21\nG90'), 'gcode')
  assert.equal(sniffText('G28\nG1 X1 Y2 E3'), 'gcode')
  assert.equal(sniffText('M104 S200\n'), 'gcode')
  assert.equal(sniffText('\n\n; Z:0.2\nG1 Z0.2'), 'gcode')
  assert.equal(sniffText('0.5 1.5 -2\n1 2 3\n'), 'xyz')
  assert.equal(sniffText('1,2,3,255,0,0\n'), 'xyz')
  assert.equal(sniffText('# a header comment\n0.5 1.5 -2 255 0 0\n'), 'xyz', 'XYZ files may start with a comment')
  assert.equal(sniffText('# cube\nv 0 0 0\n'), 'obj')
  assert.equal(sniffText('# a comment\nv 0 0 0\nf 1 2 3'), 'obj')
  assert.equal(sniffText('v 1 2 3'), 'obj')
  assert.equal(sniffText('g group\nv 1 2 3'), 'obj', 'lowercase g is an OBJ group')
  assert.equal(sniffText('mtllib a.mtl\nv 1 2 3'), 'obj')
  assert.equal(sniffText(''), 'obj')
})

test('FBX settings: unit and up axis, from an ASCII and from a binary file (the generated samples)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fbx-sample-'))
  execFileSync('python3', [join(dirname(fileURLToPath(import.meta.url)), '..', 'dev', 'make_samples.py'), '--out', dir], { stdio: 'ignore' })
  for (const f of ['box.fbx', 'box-bin.fbx']) {
    const s = fbxSettings(readFileSync(join(dir, f)))
    assert.deepEqual(s, { unitScale: 1, up: 'y' }, f)
  }
  assert.deepEqual(fbxSettings(new Uint8Array([1, 2, 3])), { unitScale: null, up: null })
  assert.equal(fbxUnitName(1), 'cm')
  assert.equal(fbxUnitName(100), 'm')
  assert.equal(fbxUnitName(0.1), 'mm')
  assert.equal(fbxUnitName(2.54), 'in')
  assert.equal(fbxUnitName(7), null)
})

test('zip names: the files of a zip (a USDZ), and nothing for other bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zipnames-'))
  const file = join(dir, 'a.zip')
  execFileSync('python3', ['-c', `import zipfile; z = zipfile.ZipFile(r'${file}', 'w'); z.writestr('scene.usdc', b'x'); z.writestr('tex/a.png', b'y'); z.close()`])
  assert.deepEqual(zipNames(readFileSync(file)), ['scene.usdc', 'tex/a.png'])
  assert.deepEqual(zipNames(new Uint8Array(100)), [])
  assert.deepEqual(zipNames(new Uint8Array(3)), [])
})

test('xyz: normals (negative values in the columns 4-6) are not colors; a label after the coordinates and an infinite value do not drop the file', () => {
  const n = parseXyz('0 0 0 0.1 -0.5 0.9\n1 1 1 0.0 0.0 1.0\n')
  assert.equal(n.colors, null, 'x y z nx ny nz')
  const l = parseXyz('1 2 3 ground\n4 5 6 sky\n')
  assert.equal(l.count, 2)
  assert.equal(parseXyz('1 2 3\n1e999 2 3\n4 5 6\n').count, 2, 'an infinite coordinate drops that line')
  assert.equal(parseXyz('1 2 3 4 5\n').colors, null, 'five columns are no color')
  assert.equal(parseXyz('1 2 3\r4 5 6\r').count, 2, 'old Mac line endings')
})

test('text without a name: a header line, a point count and scientific notation before the first triple are still XYZ', () => {
  assert.equal(sniffText('x y z\n1 2 3\n'), 'xyz')
  assert.equal(sniffText('X,Y,Z,R,G,B\n1,2,3,255,0,0\n'), 'xyz')
  assert.equal(sniffText('3000\n1 2 3\n4 5 6\n'), 'xyz')
  assert.equal(sniffText('1.5e-3 2 3\n'), 'xyz')
  assert.equal(sniffText('v 1 2 3\nv 4 5 6\n'), 'obj', 'an OBJ keyword comes first')
  assert.equal(sniffText('o cube\n1 2 3\n'), 'obj')
})

test('FBX settings: other units, Z up, and the int32 form of a value, on ASCII and binary text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fbx-sample2-'))
  execFileSync('python3', [join(dirname(fileURLToPath(import.meta.url)), '..', 'dev', 'make_samples.py'), '--out', dir], { stdio: 'ignore' })
  const ascii = readFileSync(join(dir, 'box.fbx'), 'utf8')
  const set = (text, scale, up) => new TextEncoder().encode(text.replace('"UnitScaleFactor","double","Number","",1.0', `"UnitScaleFactor","double","Number","",${scale}`).replace('"UpAxis","int","Integer","",1', `"UpAxis","int","Integer","",${up}`))
  assert.deepEqual(fbxSettings(set(ascii, '100.0', 2)), { unitScale: 100, up: 'z' })
  assert.deepEqual(fbxSettings(set(ascii, '0.1', 0)), { unitScale: 0.1, up: null }, 'X up is not offered')
  // binary: change the double after "UnitScaleFactor" and the int after "UpAxis"
  const bin = new Uint8Array(readFileSync(join(dir, 'box-bin.fbx')))
  const dv = new DataView(bin.buffer)
  const at = (name) => {
    const nb = Array.from(name, (c) => c.charCodeAt(0))
    for (let i = 0; i < bin.length - nb.length; i++) if (nb.every((b, k) => bin[i + k] === b)) return i
    return -1
  }
  const skip = (p) => { for (let k = 0; k < 4; k++) p += 5 + dv.getUint32(p + 1, true); return p }
  const u = skip(at('UnitScaleFactor') - 5)
  dv.setFloat64(u + 1, 2.54, true)
  const a = skip(at('UpAxis') - 5)
  dv.setInt32(a + 1, 2, true)
  assert.deepEqual(fbxSettings(bin), { unitScale: 2.54, up: 'z' })
  assert.equal(fbxUnitName(2.54), 'in')
})

test('xyz with a decimal comma (European CSV) is read, not turned into nonsense', () => {
  const a = parseXyz('1,5;2,5;3,5\n4,25;5;6\n')
  assert.equal(a.count, 2)
  assert.deepEqual([...a.positions.subarray(0, 6)], [1.5, 2.5, 3.5, 4.25, 5, 6])
  const b = parseXyz('1,5 2,5 3,5\n-4,5 5,5 6,5\n')
  assert.deepEqual([...b.positions], [1.5, 2.5, 3.5, -4.5, 5.5, 6.5])
  assert.equal(b.commaLines, 2)
  assert.deepEqual([...parseXyz('1,2,3,255,0,0\n').positions], [1, 2, 3], 'a plain comma separated file stays what it was')
  const c = parseXyz('1,5;2,5;3,5;255;0;0\n')
  assert.deepEqual([...c.colors], [1, 0, 0])
})

test('an ASCII PLY whose header promises more lines than the file has is told; binary and complete ones are not', () => {
  const enc = (s) => new TextEncoder().encode(s)
  assert.deepEqual(plyAsciiShortfall(enc('ply\nformat ascii 1.0\nelement vertex 999999999\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n1 1 1\n')), { declared: 999999999, actual: 2 })
  assert.equal(plyAsciiShortfall(enc('ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n1 1 1\n')), null)
  assert.equal(plyAsciiShortfall(enc('ply\nformat binary_little_endian 1.0\nelement vertex 99\nproperty float x\nend_header\n')), null)
  assert.deepEqual(plyAsciiShortfall(enc('ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 1 1\n')), { declared: 3, actual: 2 })
})

test('triangles with a coordinate that is not a number are dropped from every attribute, the others stay in order', () => {
  const position = { array: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, NaN, 0, 0, 1, 1, 1, 2, 2, 2, 5, 5, 5, 6, 6, 6, 7, 7, 7]), itemSize: 3 }
  const uv = { array: Float32Array.from([0, 0, 1, 0, 0, 1, 9, 9, 9, 9, 9, 9, 3, 3, 4, 4, 5, 5]), itemSize: 2 }
  const r = dropBadTriangles({ position, uv })
  assert.equal(r.removed, 1)
  assert.deepEqual([...r.attrs.position.array.subarray(9, 12)], [5, 5, 5])
  assert.equal(r.attrs.position.array.length, 18)
  assert.deepEqual([...r.attrs.uv.array], [0, 0, 1, 0, 0, 1, 3, 3, 4, 4, 5, 5])
  const none = dropBadTriangles({ position: { array: Float32Array.from([0, 0, 0, 1, 1, 1, 2, 2, 2]), itemSize: 3 } })
  assert.equal(none.removed, 0)
})

test('xyz: a comma separated file with a trailing semicolon or a blank before the comma is not turned into decimals; PLY counts bytes not characters', () => {
  assert.deepEqual([...parseXyz('1,2,3;\n4,5,6;\n').positions], [1, 2, 3, 4, 5, 6])
  assert.deepEqual([...parseXyz('1 ,2 ,3\n').positions], [1, 2, 3])
  const enc = (s) => new TextEncoder().encode(s)
  assert.deepEqual(plyAsciiShortfall(enc('ply\nformat ascii 1.0\ncomment Käse Müller Größe\nelement vertex 9\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n1 1 1\n')), { declared: 9, actual: 2 })
})

test('dropBadTriangles tells which triangles went (the page keeps the material groups in step)', () => {
  const r = dropBadTriangles({ position: { array: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, NaN, 0, 0, 1, 1, 1, 2, 2, 2]), itemSize: 3 } })
  assert.deepEqual([...r.bad], [0, 1])
})
