// Example models for the start page, made on the spot (nothing is shipped or downloaded): each is a list of parts for writeGLB.
// part = { name, kind, positions, indices, normals, colors (sRGB bytes per vertex) | null, color: [r,g,b] | null }
function mesh(name, positions, indices, color) {
  const normals = new Float32Array(positions.length)
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
    const u = [0, 1, 2].map((k) => positions[3 * b + k] - positions[3 * a + k])
    const v = [0, 1, 2].map((k) => positions[3 * c + k] - positions[3 * a + k])
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) normals[3 * i + k] += n[k]
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2])
    if (l < 1e-12) normals.set([0, 1, 0], i) // a pole where every triangle is flat
    else {
      normals[i] /= l
      normals[i + 1] /= l
      normals[i + 2] /= l
    }
  }
  return { name, kind: 'mesh', positions, indices, normals, colors: null, color }
}
function box(name, w, h, d, at, color) {
  const [x, y, z] = [w / 2, h / 2, d / 2]
  const faces = [[[1, 0, 0], [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]]], [[-1, 0, 0], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]]], [[0, 1, 0], [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]]], [[0, -1, 0], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]]], [[0, 0, 1], [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]], [[0, 0, -1], [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]]]
  const pos = []
  const idx = []
  for (const [, quad] of faces) {
    const base = pos.length / 3
    for (const p of quad) pos.push(p[0] + at[0], p[1] + at[1], p[2] + at[2])
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return mesh(name, Float32Array.from(pos), Uint32Array.from(idx), color)
}
function sphere(name, r, at, color, nu = 32, nv = 16) {
  const pos = []
  const idx = []
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const t = (Math.PI * j) / nv
    const p = (2 * Math.PI * (i % nu)) / nu // the last column is the first one exactly: the seam closes
    pos.push(at[0] + r * Math.sin(t) * Math.cos(p), at[1] + r * Math.cos(t), at[2] + r * Math.sin(t) * Math.sin(p))
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i
    const b = a + nu + 1
    idx.push(a, a + 1, b, a + 1, b + 1, b)
  }
  return mesh(name, Float32Array.from(pos), Uint32Array.from(idx), color)
}
function torus(name, R, r, at, color, nu = 48, nv = 24) {
  const pos = []
  const idx = []
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = (2 * Math.PI * (i % nu)) / nu
    const v = (2 * Math.PI * (j % nv)) / nv // both seams close exactly
    pos.push(at[0] + (R + r * Math.cos(v)) * Math.cos(u), at[1] + r * Math.sin(v), at[2] + (R + r * Math.cos(v)) * Math.sin(u))
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i
    const b = a + nu + 1
    idx.push(a, b, a + 1, a + 1, b, b + 1)
  }
  return mesh(name, Float32Array.from(pos), Uint32Array.from(idx), color)
}

/** key -> { parts } */
export const EXAMPLES = {
  table: () => [
    box('Floor', 2.4, 0.02, 1.8, [0, -0.01, 0], [176, 168, 156]),
    box('Table top', 1.2, 0.05, 0.7, [0, 0.725, 0], [150, 104, 62]),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => box(`Table leg ${i + 1}`, 0.06, 0.7, 0.06, [sx * 0.55, 0.35, sz * 0.3], [100, 66, 40])),
    sphere('Ball', 0.11, [0.3, 0.84, -0.05], [200, 64, 48]),
    box('Box', 0.2, 0.2, 0.2, [-0.3, 0.85, 0.05], [48, 120, 176])
  ],
  torus: () => [torus('Torus', 0.5, 0.18, [0, 0.2, 0], [212, 138, 46], 64, 32)],
  cloud: () => {
    const n = 30000
    const pos = new Float32Array(n * 3)
    const col = new Uint8Array(n * 3)
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2 * 14
      const r = 0.25 + 0.2 * Math.cos(t / 14) + 0.18 * Math.sin(t / 3)
      pos.set([Math.cos(t) * r * 2, (i / n) * 1.2 - 0.6, Math.sin(t) * r * 2], 3 * i)
      col.set([127 + 127 * Math.cos(t / 14), 127 + 127 * Math.sin(t / 9), 200 - 90 * (i / n)], 3 * i)
    }
    return [{ name: 'Cloud', kind: 'points', positions: pos, indices: null, normals: null, colors: col, color: null }]
  }
}
