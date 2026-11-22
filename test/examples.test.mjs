// The example models of the start page are valid parts that writeGLB accepts.
import test from 'node:test'
import assert from 'node:assert/strict'
import { EXAMPLES } from '../editor/examples.js'
import { writeGLB, triangleCount, vertexCount } from '../editor/shared/export.js'
import { analyzeMesh } from '../editor/shared/mesh-tools.js'

test('every example becomes a GLB with its parts, finite numbers and unit normals', () => {
  for (const [key, make] of Object.entries(EXAMPLES)) {
    const parts = make()
    assert.ok(parts.length >= 1, key)
    for (const p of parts) {
      assert.ok(vertexCount(p) > 0 && p.positions.every(Number.isFinite), `${key}/${p.name}`)
      if (p.kind === 'mesh') {
        assert.ok(triangleCount(p) > 0 && p.indices.every((v) => v < vertexCount(p)))
        for (let i = 0; i < p.normals.length; i += 3) assert.ok(Math.abs(Math.hypot(p.normals[i], p.normals[i + 1], p.normals[i + 2]) - 1) < 1e-4)
      }
    }
    const glb = writeGLB(parts)
    assert.equal(new DataView(glb.buffer).getUint32(0, true), 0x46546c67)
  }
  // every mesh of the examples is a closed surface (the start page offers them as a look at the numbers too)
  for (const make of [EXAMPLES.table, EXAMPLES.torus]) for (const p of make()) if (p.kind === 'mesh') assert.equal(analyzeMesh(p.positions, p.indices).watertight, true, p.name)
  assert.equal(EXAMPLES.table().length, 8)
  assert.equal(EXAMPLES.cloud()[0].kind, 'points')
})
