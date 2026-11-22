// A G-code reader for a toolpath preview (no browser needed): straight moves (G0/G1), arcs (G2/G3 in the XY plane, with I/J or with R),
// absolute and relative positioning (G90/G91), absolute and relative extrusion (M82/M83), G92, G20/G21, G28. What it does not do is run a
// printer: no temperatures, no firmware retraction, no macros, no tool changes (T), no arcs in the XZ/YZ planes (they are drawn as straight lines
// and counted in `stats.skippedArcs`). Positions are in millimeters, Z up, the way the file has them.

const TWO_PI = Math.PI * 2

/** Parses G-code text. Returns { ext, travel, bounds, stats }:
 *   ext / travel: { positions: Float32Array (6 numbers per segment: x0 y0 z0 x1 y1 z1), layer: Uint16Array (one per segment) }
 *   bounds: { min: [x, y, z], max: [x, y, z] } of the extrusion moves (of all moves when nothing is extruded; null when nothing moves); boundsAll: of every move
 *   stats: { lines, segments, extrusionSegments, travelSegments, layers, filamentMm (extruded length, as the E axis counts it), truncated, skippedArcs, inches }
 *  `options.maxSegments` stops reading at that many segments (stats.truncated). `options.onProgress(fraction)` and `options.shouldCancel()` are
 *  called between blocks of lines; the reader gives the page a turn in between. A cancelled parse returns null. */
export async function parseGcode(text, options = {}) {
  const maxSegments = options.maxSegments || 4_000_000
  const sliceMs = options.sliceMs ?? 150 // how long to work before the page gets a turn
  const onProgress = options.onProgress
  const shouldCancel = options.shouldCancel
  if (text.indexOf('\n') < 0 && text.indexOf('\r') >= 0) text = text.replace(/\r/g, '\n') // old Mac line endings
  const n = text.length
  const ext = new Chunks()
  const trv = new Chunks()
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const st = { lines: 0, segments: 0, extrusionSegments: 0, travelSegments: 0, layers: 0, filamentMm: 0, truncated: false, skippedArcs: 0, inches: false }

  let x = 0
  let y = 0
  let z = 0
  let e = 0
  let absPos = true
  let absE = true
  let unit = 1
  let plane = 17
  let layerZ = -Infinity
  let layer = 0
  let retracted = 0 // filament pulled back and not yet pushed forward again: pushing it forward is not printing

  const emin = [Infinity, Infinity, Infinity] // bounds of the extrusion moves alone: the print, without the first travel from the origin
  const emax = [-Infinity, -Infinity, -Infinity]
  const grow = (lo, hi, a, b, c) => {
    if (a < lo[0]) lo[0] = a
    if (b < lo[1]) lo[1] = b
    if (c < lo[2]) lo[2] = c
    if (a > hi[0]) hi[0] = a
    if (b > hi[1]) hi[1] = b
    if (c > hi[2]) hi[2] = c
  }
  const emit = (x0, y0, z0, x1, y1, z1, extruding) => {
    if (st.segments >= maxSegments) {
      st.truncated = true
      return
    }
    ;(extruding ? ext : trv).push(x0, y0, z0, x1, y1, z1, layer)
    st.segments++
    if (extruding) {
      st.extrusionSegments++
      grow(emin, emax, x0, y0, z0)
      grow(emin, emax, x1, y1, z1)
    } else st.travelSegments++
    grow(min, max, x0, y0, z0)
    grow(min, max, x1, y1, z1)
  }
  // the filament that goes forward in this move, after taking back what a retraction pulled out (a retraction and its undoing are not printing)
  const pushE = (E) => {
    if (E === null) return 0
    let de = absE ? E * unit - e : E * unit
    e = absE ? E * unit : e + de
    if (de < 0) {
      retracted += -de
      return 0
    }
    if (retracted > 0) {
      const back = Math.min(de, retracted)
      retracted -= back
      de -= back
    }
    return de
  }
  const noteLayer = (zNow) => {
    if (Math.abs(zNow - layerZ) > 0.005) { // a Z step of more than 5 microns (a vase-mode spiral rises in smaller steps and stays one layer until it has risen that much)
      layerZ = zNow
      layer = Math.min(65535, layer + 1)
      st.layers = layer
    }
  }

  let pos = 0
  let sinceYield = 0
  let sliceStart = Date.now()
  while (pos < n) {
    let end = text.indexOf('\n', pos)
    if (end < 0) end = n
    st.lines++
    // words of this line: a letter and a number; ';' starts a comment, "(...)" is a comment too
    let gs = null // the G words of the line, in order ("G90 G21" has two)
    let m = null
    let X = null
    let Y = null
    let Z = null
    let E = null
    let I = null
    let J = null
    let R = null
    let i = pos
    while (i < end) {
      const c = text.charCodeAt(i)
      if (c === 59) break // ;
      if (c === 40) {
        // ( comment ): looked for on this line only
        let close = i + 1
        while (close < end && text.charCodeAt(close) !== 41) close++
        i = close + 1
        continue
      }
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
        const letter = c & ~32
        let j = i + 1
        while (j < end) {
          const d = text.charCodeAt(j)
          if ((d >= 48 && d <= 57) || d === 46 || d === 45 || d === 43) j++
          else break
        }
        const v = j > i + 1 ? Number(text.slice(i + 1, j)) : NaN
        if (!Number.isNaN(v)) {
          switch (letter) {
            case 71: // G
              if (Number.isInteger(v)) (gs ||= []).push(v) // G91.1 and the like are other commands than G91: not read
              break
            case 77: // M
              if (m === null) m = v
              break
            case 88:
              X = v
              break
            case 89:
              Y = v
              break
            case 90:
              Z = v
              break
            case 69:
              E = v
              break
            case 73:
              I = v
              break
            case 74:
              J = v
              break
            case 82:
              R = v
              break
            default:
          }
        }
        i = j
        continue
      }
      i++
    }
    pos = end + 1

    if (m !== null) {
      if (m === 82) absE = true
      else if (m === 83) absE = false
    }
    if (gs !== null) for (const gi of gs) {
      if (gi === 0 || gi === 1) {
        const nx = X === null ? x : absPos ? X * unit : x + X * unit
        const ny = Y === null ? y : absPos ? Y * unit : y + Y * unit
        const nz = Z === null ? z : absPos ? Z * unit : z + Z * unit
        const de = pushE(E)
        const extruding = de > 1e-9
        if (extruding) st.filamentMm += de
        if (nx !== x || ny !== y || nz !== z) {
          if (extruding) noteLayer(nz)
          emit(x, y, z, nx, ny, nz, extruding)
          x = nx
          y = ny
          z = nz
        }
      } else if (gi === 2 || gi === 3) {
        const nx = X === null ? x : absPos ? X * unit : x + X * unit
        const ny = Y === null ? y : absPos ? Y * unit : y + Y * unit
        const nz = Z === null ? z : absPos ? Z * unit : z + Z * unit
        const de = pushE(E)
        const extruding = de > 1e-9
        if (extruding) {
          st.filamentMm += de
          noteLayer(nz)
        }
        const arc = plane !== 17 ? null : arcPoints(x, y, nx, ny, I === null ? null : I * unit, J === null ? null : J * unit, R === null ? null : R * unit, gi === 2)
        if (!arc) {
          st.skippedArcs++ // no usable center: a straight line is the honest fallback
          if (nx !== x || ny !== y || nz !== z) emit(x, y, z, nx, ny, nz, extruding)
        } else {
          const steps = arc.length / 2
          let px = x
          let py = y
          let pz = z
          for (let s = 1; s <= steps; s++) {
            const qx = arc[2 * s - 2]
            const qy = arc[2 * s - 1]
            const qz = z + ((nz - z) * s) / steps // a helix when Z changes
            emit(px, py, pz, qx, qy, qz, extruding)
            px = qx
            py = qy
            pz = qz
          }
        }
        x = nx
        y = ny
        z = nz
      } else if (gi === 90) absPos = true
      else if (gi === 91) absPos = false
      else if (gi === 20) {
        unit = 25.4
        st.inches = true
      } else if (gi === 21) unit = 1
      else if (gi === 28) {
        // home: no axis named means all of them
        if (X === null && Y === null && Z === null && E === null) {
          x = 0
          y = 0
          z = 0
        } else {
          if (X !== null) x = 0
          if (Y !== null) y = 0
          if (Z !== null) z = 0
        }
      } else if (gi === 92) {
        if (X !== null) x = X * unit
        if (Y !== null) y = Y * unit
        if (Z !== null) z = Z * unit
        if (E !== null) e = E * unit
        if (X === null && Y === null && Z === null && E === null) e = 0
      } else if (gi === 17 || gi === 18 || gi === 19) plane = gi // arcs are read in the XY plane (G17) only
    }
    if (st.truncated) break
    // give the page a turn after about 150 ms of work (not after a fixed number of lines: a hidden frame slows every timer down, so few and
    // long slices finish sooner)
    if (++sinceYield >= 2000) {
      sinceYield = 0
      if (Date.now() - sliceStart > sliceMs) {
        if (onProgress) onProgress(pos / n)
        if (shouldCancel && shouldCancel()) return null
        await new Promise((r) => setTimeout(r, 0))
        sliceStart = Date.now()
      }
    }
  }
  if (onProgress) onProgress(1)
  const any = st.segments > 0
  const bounds = !any ? null : st.extrusionSegments ? { min: emin, max: emax } : { min, max }
  return { ext: ext.finish(), travel: trv.finish(), bounds, boundsAll: any ? { min, max } : null, stats: st }
}

/** The points of an arc from (x0, y0) to (x1, y1) as [x, y, x, y, ...] (the start point is not repeated), or null when no center can be found.
 *  The center comes from I/J (offsets from the start) or from R (the signed radius: a negative R takes the larger arc). `cw` is G2. */
export function arcPoints(x0, y0, x1, y1, I, J, R, cw) {
  let cx
  let cy
  if (I !== null || J !== null) {
    cx = x0 + (I || 0)
    cy = y0 + (J || 0)
  } else if (R !== null && R !== 0) {
    const dx = x1 - x0
    const dy = y1 - y0
    const d = Math.hypot(dx, dy)
    if (d === 0) return null // a full circle cannot be told by R alone
    const h2 = R * R - (d * d) / 4
    const h = h2 > 0 ? Math.sqrt(h2) : 0 // a radius that is too small for the chord: the chord is the diameter
    // the center lies on the perpendicular bisector; which side depends on the direction and on the sign of R
    const sign = (cw ? 1 : -1) * (R > 0 ? 1 : -1)
    cx = x0 + dx / 2 + (sign * h * dy) / d
    cy = y0 + dy / 2 - (sign * h * dx) / d
  } else return null
  const r = Math.hypot(x0 - cx, y0 - cy)
  if (!(r > 1e-9)) return null
  const a0 = Math.atan2(y0 - cy, x0 - cx)
  const a1 = Math.atan2(y1 - cy, x1 - cx)
  let sweep = a1 - a0
  const full = Math.abs(x1 - x0) < 1e-9 && Math.abs(y1 - y0) < 1e-9
  if (cw) {
    if (sweep >= -1e-12) sweep -= TWO_PI // clockwise goes negative
    if (full) sweep = -TWO_PI
  } else {
    if (sweep <= 1e-12) sweep += TWO_PI
    if (full) sweep = TWO_PI
  }
  // a step small enough that the chord is within 0.02 mm of the arc, and never wider than 6 degrees
  const tol = 0.02
  const step = Math.min(Math.PI / 30, r > tol ? 2 * Math.acos(1 - tol / r) : Math.PI / 30)
  const count = Math.max(2, Math.ceil(Math.abs(sweep) / step))
  const out = new Array(count * 2)
  for (let s = 1; s <= count; s++) {
    const a = a0 + (sweep * s) / count
    out[2 * s - 2] = s === count ? x1 : cx + r * Math.cos(a)
    out[2 * s - 1] = s === count ? y1 : cy + r * Math.sin(a)
  }
  return out
}

// growing typed arrays for the segments
class Chunks {
  constructor() {
    this.cap = 4096
    this.n = 0
    this.pos = new Float32Array(this.cap * 6)
    this.layer = new Uint16Array(this.cap)
  }
  push(x0, y0, z0, x1, y1, z1, layer) {
    if (this.n === this.cap) {
      this.cap *= 2
      const p = new Float32Array(this.cap * 6)
      p.set(this.pos)
      this.pos = p
      const l = new Uint16Array(this.cap)
      l.set(this.layer)
      this.layer = l
    }
    const o = this.n * 6
    const p = this.pos
    p[o] = x0
    p[o + 1] = y0
    p[o + 2] = z0
    p[o + 3] = x1
    p[o + 4] = y1
    p[o + 5] = z1
    this.layer[this.n++] = layer
  }
  finish() {
    return { positions: this.pos.slice(0, this.n * 6), layer: this.layer.slice(0, this.n), count: this.n }
  }
}
