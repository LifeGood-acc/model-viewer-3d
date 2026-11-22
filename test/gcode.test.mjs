import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arcPoints, parseGcode } from '../editor/gcode.js'

const seg = (c, i) => [...c.positions.subarray(i * 6, i * 6 + 6)]

test('straight moves: absolute positions, extrusion makes a segment an extrusion move, a move without E is travel', async () => {
  const r = await parseGcode('G90\nM82\nG1 X10 Y0 E1\nG0 X10 Y10\nG1 X0 Y10 E2.5\n')
  assert.equal(r.stats.extrusionSegments, 2)
  assert.equal(r.stats.travelSegments, 1)
  assert.deepEqual(seg(r.ext, 0), [0, 0, 0, 10, 0, 0])
  assert.deepEqual(seg(r.travel, 0), [10, 0, 0, 10, 10, 0])
  assert.deepEqual(seg(r.ext, 1), [10, 10, 0, 0, 10, 0])
  assert.equal(r.stats.filamentMm, 2.5)
  assert.deepEqual(r.bounds, { min: [0, 0, 0], max: [10, 10, 0] })
  assert.deepEqual((await parseGcode('G0 X5 Y5\nG1 X6 Y5 E1\n')).bounds, { min: [5, 5, 0], max: [6, 5, 0] }, 'the bounds are those of the print, not of the travel to it')
})

test('relative positioning (G91) and relative extrusion (M83), comments and parentheses are ignored', async () => {
  const r = await parseGcode('G91 ; relative\nM83\nG1 X5 E0.5 (a comment) \nG1 Y5 E0.5\nG1 X-5 E-0.2 ; retract while moving: travel\n')
  assert.equal(r.stats.extrusionSegments, 2)
  assert.equal(r.stats.travelSegments, 1)
  assert.deepEqual(seg(r.ext, 1), [5, 0, 0, 5, 5, 0])
  assert.deepEqual(seg(r.travel, 0), [5, 5, 0, 0, 5, 0])
})

test('G92 sets the position and the extruder, G20 reads inches, G28 homes', async () => {
  const a = await parseGcode('G92 X5 Y5 E0\nG1 X6 Y5 E1\n')
  assert.deepEqual(seg(a.ext, 0), [5, 5, 0, 6, 5, 0])
  const b = await parseGcode('G20\nG1 X1 Y0 E1\n')
  assert.equal(b.ext.positions[3], Math.fround(25.4))
  assert.equal(b.stats.inches, true)
  const c = await parseGcode('G1 X5 Y5 Z5\nG28\nG1 X1\n')
  assert.deepEqual(seg(c.travel, 1), [0, 0, 0, 1, 0, 0])
})

test('layers: a new Z with extrusion starts a layer; the layer of each segment is stored', async () => {
  const r = await parseGcode('G1 Z0.2\nG1 X1 E1\nG1 Z0.4\nG1 X0 E2\nG1 X1 E3\n')
  assert.equal(r.stats.layers, 2)
  assert.deepEqual([...r.ext.layer], [1, 2, 2])
})

test('arcs: a full circle with I/J is closed and has the radius; the helix interpolates Z', async () => {
  const r = await parseGcode('G90\nG0 X15 Y10\nG3 X15 Y10 I-5 J0 E1\n')
  const c = r.ext
  assert.ok(c.count > 30, `${c.count} chords`)
  for (let i = 0; i < c.count; i++) {
    const [x, y] = seg(c, i).slice(3, 5)
    assert.ok(Math.abs(Math.hypot(x - 10, y - 10) - 5) < 1e-4, 'on the circle')
  }
  assert.deepEqual(seg(c, c.count - 1).slice(3, 6), [15, 10, 0], 'ends where it started')
  const h = await parseGcode('G0 X5 Y0\nG2 X5 Y0 I-5 J0 Z2 E1\n')
  assert.equal(seg(h.ext, h.ext.count - 1)[5], 2)
})

test('arc direction and the sign of R: G2 goes clockwise (over the top from left to right), G3 counter-clockwise (below)', () => {
  const top = arcPoints(12, 12, 18, 12, null, null, 3, true)
  assert.ok(top.some((v, i) => i % 2 === 1 && v > 14.9), 'a clockwise half circle from the left to the right passes the top')
  const under = arcPoints(0, 0, 10, 0, null, null, 10, false)
  assert.ok(Math.min(...under.filter((_, i) => i % 2 === 1)) < -0.5, 'a counter-clockwise arc from the left to the right dips below the chord')
  assert.ok(Math.min(...under.filter((_, i) => i % 2 === 1)) > -2, 'the minor arc: R 10 over a chord of 10 is 1.34 deep')
  const major = arcPoints(0, 0, 10, 0, null, null, -10, false)
  assert.ok(Math.min(...major.filter((_, i) => i % 2 === 1)) < -10, 'a negative R takes the larger arc (counter-clockwise from the left: around the far side)')
  assert.equal(arcPoints(0, 0, 0, 0, null, null, 5, true), null, 'R alone cannot make a full circle')
  assert.equal(arcPoints(0, 0, 4, 0, null, null, null, true), null, 'no center')
})

test('arcs in another plane are drawn straight and counted; the limit stops the read and says so', async () => {
  const r = await parseGcode('G18\nG2 X5 Z5 I2 K2 E1\n')
  assert.equal(r.stats.skippedArcs, 1)
  assert.equal(r.ext.count, 1)
  const big = await parseGcode(Array.from({ length: 50 }, (_, i) => `G1 X${i + 1} E${i + 1}`).join('\n'), { maxSegments: 10 })
  assert.equal(big.stats.truncated, true)
  assert.equal(big.stats.segments, 10)
})

test('cancel and progress: a cancelled read returns null; an empty file has no bounds', async () => {
  const text = Array.from({ length: 50000 }, (_, i) => `G1 X${i} E${i}`).join('\n')
  let called = 0
  const cancelled = await parseGcode(text, { sliceMs: 0, shouldCancel: () => true, onProgress: () => called++ })
  assert.ok(cancelled === null, 'a cancelled read gives null')
  assert.equal(called, 1)
  const e = await parseGcode('; nothing\nM104 S200\n')
  assert.equal(e.bounds, null)
  assert.equal(e.stats.segments, 0)
})

test('the generated sample: five layers of a 20 mm box, a circle and a half circle', async () => {
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const dir = mkdtempSync(join(tmpdir(), 'gcode-sample-'))
  execFileSync('python3', [join(dirname(fileURLToPath(import.meta.url)), '..', 'dev', 'make_samples.py'), '--out', dir], { stdio: 'ignore' })
  const r = await parseGcode(readFileSync(join(dir, 'print.gcode'), 'utf8'))
  assert.equal(r.stats.layers, 5)
  assert.deepEqual(r.bounds.min.map((v) => Math.round(v * 10) / 10), [10, 10, 0.2])
  assert.deepEqual(r.bounds.max.map((v) => Math.round(v * 10) / 10), [30, 30, 1])
  assert.equal(r.stats.skippedArcs, 0)
  assert.equal(r.ext.count, 195)
  assert.equal(r.travel.count, 18)
  assert.ok(Math.abs(r.stats.filamentMm - 129.65) < 0.01, `E added: perimeters, infill, circle and half circle; the retractions and their undoing cancel (${r.stats.filamentMm})`)
})

test('retraction and its undoing are not printing: the filament total is the net', async () => {
  const r = await parseGcode('M83\nG1 E-1\nG0 X10\nG1 E1\nG1 X30 E1\n')
  assert.equal(r.stats.extrusionSegments, 1)
  assert.equal(r.stats.filamentMm, 1)
  const a = await parseGcode('M82\nG92 E0\nG1 E-1\nG0 X10\nG1 E0\nG1 X30 E1\n')
  assert.equal(a.stats.filamentMm, 1, 'absolute E: -1, back to 0, then 1')
})

test('several G words on one line, and codes with a decimal part that are other commands', async () => {
  const a = await parseGcode('G90 G20\nG1 X1 E1\n')
  assert.equal(a.stats.inches, true)
  assert.equal(a.ext.positions[3], Math.fround(25.4))
  const b = await parseGcode('G91\nG91.1\nG1 X5 E1\nG1 X5 E2\n')
  assert.deepEqual(seg(b.ext, 1), [5, 0, 0, 10, 0, 0], 'G91.1 did not turn anything off; G91 stays')
})

test('line endings: CRLF and old Mac CR; an unclosed parenthesis ends at the line', async () => {
  assert.equal((await parseGcode('G1 X1 E1\r\nG1 X2 E2\r\n')).stats.extrusionSegments, 2)
  assert.equal((await parseGcode('G1 X1 E1\rG1 X2 E2\r')).stats.extrusionSegments, 2)
  assert.equal((await parseGcode('G1 X1 (open comment E1\nG1 X2 E1\n')).stats.extrusionSegments, 1, 'the unclosed parenthesis does not swallow the next line')
})

test('a Z-hop does not start a layer; a spiral that rises in tiny steps stays one layer until it has risen 5 microns', async () => {
  const hop = await parseGcode('G1 Z0.2\nG1 X1 E1\nG1 Z0.6\nG0 X2\nG1 Z0.2\nG1 X3 E2\n')
  assert.equal(hop.stats.layers, 1)
  const vase = await parseGcode(Array.from({ length: 100 }, (_, i) => `G1 X${i + 1} Z${(0.2 + i * 0.0001).toFixed(4)} E${i + 1}`).join('\n'))
  assert.ok(vase.stats.layers <= 3, `${vase.stats.layers} layers`)
})

test('a file with no E axis (a CNC or plotter file): all its moves are travel, and the reader says so', async () => {
  const r = await parseGcode('G21\nG90\nG0 X0 Y0\nG1 X10 Y0 F300\nG1 X10 Y10\n')
  assert.equal(r.stats.extrusionSegments, 0)
  assert.equal(r.stats.travelSegments, 2)
  assert.deepEqual(r.bounds, { min: [0, 0, 0], max: [10, 10, 0] }, 'bounds of everything when nothing is extruded')
})
