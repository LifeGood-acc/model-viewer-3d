// What the viewer writes must be readable by the viewer's own readers (and by common tools: see dev/e2e-export.mjs).
import test from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync } from '../editor/vendor/addons/libs/fflate.module.js'
import { write3MF, writeSTL, writeGLB, exportRotation } from '../editor/shared/export.js'
import { readPackage } from '../editor/threemf.js'
import { inspect3mf, STRINGS, makeT } from '../editor/lib.js'

const cube = (name, dx, color) => ({
  name,
  kind: 'mesh',
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1].map((v, i) => (i % 3 === 0 ? v + dx : v))),
  indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7]),
  normals: null,
  colors: null,
  color
})

test('a 3MF the viewer writes is read back by the 3MF reader: objects, names, triangles, colors, unit', async () => {
  const bytes = await write3MF([cube('Base', 0, [255, 0, 0]), cube('Lid', 3, [0, 0, 255])], { unit: 'mm' })
  const pkg = readPackage(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  assert.equal(pkg.unit, 'millimeter')
  assert.equal(pkg.instances.length, 2)
  assert.deepEqual(pkg.instances.map((i) => i.label), ['Base', 'Lid'])
  assert.deepEqual(pkg.instances.map((i) => i.color), [0xff0000, 0x0000ff])
  for (const inst of pkg.instances) assert.equal(pkg.meshes.get(inst.key).idx.length / 3, 12)
  const info = inspect3mf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), makeT('en'))
  assert.deepEqual(info.notes, [], 'the viewer finds nothing it cannot draw in its own copy')
})

test('a 3MF copy carries no slicer data and only the three package parts', async () => {
  const files = unzipSync(await write3MF([cube('A', 0, null)], { unit: 'm' }))
  assert.deepEqual(Object.keys(files).sort(), ['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels'])
})

test('the copy writers do not alter their input', () => {
  const p = cube('A', 0, [1, 2, 3])
  const before = JSON.stringify([...p.positions, ...p.indices])
  writeSTL([p])
  writeGLB([p])
  assert.equal(JSON.stringify([...p.positions, ...p.indices]), before)
})

test('every export string exists in both languages with the same placeholders', () => {
  for (const k of Object.keys(STRINGS.en).filter((k) => k.startsWith('ex_') || k.startsWith('export_') || k === 'tip_export')) {
    assert.ok(STRINGS.de[k], k)
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join()
    assert.equal(ph(STRINGS.de[k]), ph(STRINGS.en[k]), k)
  }
  for (const f of ['glb', 'stl', 'obj', 'ply', '3mf', 'png', 'webm']) assert.ok(STRINGS.en['ex_lossy_' + f] && STRINGS.de['ex_lossy_' + f], `a loss notice for ${f}`)
})

test('the default "up in the copy" of each format is a rotation the writers know', () => {
  for (const up of ['y', '-y', 'z']) for (const target of ['keep', 'y', 'z']) assert.doesNotThrow(() => exportRotation(up, target))
})
