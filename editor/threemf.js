// 3MF reader for packages that keep their meshes in separate model files (the "production" layout that Bambu Studio, Orca
// Slicer, PrusaSlicer and others write): 3D/3dmodel.model holds objects made of <component p:path="/3D/Objects/x.model" objectid=..>
// and a <build> of items; the meshes live in 3D/Objects/*.model. Object ids are only unique inside one file, so a component must be
// resolved by (file, id), which a reader that looks up ids globally gets wrong.
//
// Pure code (no DOM, no three.js), so `orca plugin test` runs it in Node. It returns instances (mesh key + 4x4 matrix + names + color)
// and the unique meshes; viewer.js turns them into three.js objects.
import { unzipSync } from './vendor/addons/libs/fflate.module.js'

export const LIMITS = {
  maxTotalBytes: 900e6, // all entries together, uncompressed (zip bomb guard)
  maxModelBytes: 450e6, // one .model file
  maxConfigBytes: 8e6, // Bambu config files
  maxDepth: 12, // nesting of components
  maxInstances: 20000,
  maxTriangles: 40e6, // unique mesh data
  maxDrawnTriangles: 80e6, // what is drawn: unique triangles x instances
  maxExpansions: 100000, // visits of the component graph (a graph that reuses children many times is not a cycle)
  maxMissing: 50
}

const dec = new TextDecoder()
const attrRe = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
function attrs(s) {
  const a = {}
  let m
  attrRe.lastIndex = 0
  while ((m = attrRe.exec(s))) {
    const k = m[1]
    const v = m[2] ?? m[3]
    a[k] = v
    const i = k.lastIndexOf(':')
    if (i >= 0 && !(k.slice(i + 1) in a)) a[k.slice(i + 1)] = v // p:path is also readable as path
  }
  return a
}
const xmlText = (s) =>
  String(s)
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, d) => safeChar(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
function safeChar(cp) {
  try {
    return String.fromCodePoint(cp)
  } catch {
    return ''
  }
}
/** Comments and CDATA are not markup: remove them before tokenizing. */
const stripNonMarkup = (text) => (text.includes('<!') ? text.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '') : text)
// A tag scanner (instead of one big regex: a regex backtracks quadratically on a hostile file with many "<" and no ">"). Attribute values
// may contain ">" when quoted. exec() returns [whole, "/" if closing, name, attributes, "/" if self-closing] like a RegExp, or null at the end;
// an unterminated tag ends the scan. Linear in the text.
const isNameChar = (c) => (c >= 48 && c <= 58) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45 || c === 46
const isNameStart = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95
function tagScanner(text) {
  let i = 0
  const n = text.length
  return {
    exec() {
      while ((i = text.indexOf('<', i)) !== -1) {
        const closing = text.charCodeAt(i + 1) === 47
        const j = i + (closing ? 2 : 1)
        if (!isNameStart(text.charCodeAt(j))) {
          i++
          continue
        }
        let k = j
        while (k < n && isNameChar(text.charCodeAt(k))) k++
        let e = k
        let q = 0
        while (e < n) {
          const ch = text.charCodeAt(e)
          if (q) {
            if (ch === q) q = 0
          } else if (ch === 34 || ch === 39) q = ch
          else if (ch === 62) break
          e++
        }
        if (e >= n) return null // unterminated: nothing more can be read
        const self = text.charCodeAt(e - 1) === 47 && e - 1 >= k
        const m = [text.slice(i, e + 1), closing ? '/' : '', text.slice(j, k), text.slice(k, self ? e - 1 : e), self ? '/' : '']
        i = e + 1
        return m
      }
      return null
    }
  }
}

// ---------- 4x4 matrices, column-major (three.js order); 3MF writes a row-vector 4x3: m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32 ----------
const IDENTITY = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
export function parseTransform(s) {
  if (!s) return null
  const n = String(s).trim().split(/\s+/).map(Number)
  if (n.length !== 12 || n.some((v) => !Number.isFinite(v))) return null
  return [n[0], n[1], n[2], 0, n[3], n[4], n[5], 0, n[6], n[7], n[8], 0, n[9], n[10], n[11], 1]
}
export function mul(a, b) {
  // a * b, column-major: apply b first, then a
  const o = new Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  return o
}

// ---------- one .model file ----------
const MM = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }
export function parseModel(text) {
  const out = { unit: 'millimeter', objects: new Map(), items: [], baseMaterials: new Map(), colorGroups: new Map(), triangles: 0, skipped: 0 }
  text = stripNonMarkup(text)
  const tag = tagScanner(text)
  let m
  let obj = null
  let verts = null // numbers
  let tris = null // v1 v2 v3 triples
  let triCol = null // [pid, p1] per triangle or -1
  let paint = null // triangle number -> paint_color (Bambu Studio, Orca Slicer: the filament painted on that triangle)
  let inMesh = false
  let group = null // current basematerials / colorgroup
  const px = /\bx="([^"]*)"[^>]*?\by="([^"]*)"[^>]*?\bz="([^"]*)"/
  const tv = /\bv1="(\d+)"[^>]*?\bv2="(\d+)"[^>]*?\bv3="(\d+)"/
  while ((m = tag.exec())) {
    const closing = m[1] === '/'
    const name = m[2].slice(m[2].lastIndexOf(':') + 1)
    if (closing) {
      if (name === 'object' && obj) {
        if (verts) {
          // Keep only triangles whose three corners exist: an index out of range would give NaN normals or reject the whole file.
          const nv = verts.length / 3
          const okIdx = []
          const okCol = []
          const okPaint = new Map()
          for (let i = 0; i < tris.length; i += 3) {
            const a = tris[i]
            const b = tris[i + 1]
            const c = tris[i + 2]
            if (Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(c) && a >= 0 && b >= 0 && c >= 0 && a < nv && b < nv && c < nv) {
              okIdx.push(a, b, c)
              okCol.push(triCol[(i / 3) * 2], triCol[(i / 3) * 2 + 1])
              if (paint && paint.has(i / 3)) okPaint.set(okIdx.length / 3 - 1, paint.get(i / 3)) // numbers shift when a bad triangle is dropped
            } else out.skipped++
          }
          for (let i = 0; i < verts.length; i++) if (!Number.isFinite(verts[i])) verts[i] = 0 // a corrupt coordinate must not turn into NaN bounds
          obj.mesh = { pos: Float32Array.from(verts), idx: Uint32Array.from(okIdx), triCol: okCol, paint: okPaint.size ? okPaint : null }
          out.triangles += okIdx.length / 3
        }
        out.objects.set(obj.id, obj)
        obj = null
        verts = tris = triCol = paint = null
        inMesh = false
      } else if (name === 'mesh') inMesh = false
      else if (name === 'basematerials' || name === 'colorgroup') group = null
      continue
    }
    if (name === 'vertex' && inMesh) {
      const v = px.exec(m[3])
      if (v) verts.push(+v[1], +v[2], +v[3])
      else {
        const a = attrs(m[3])
        verts.push(+a.x, +a.y, +a.z)
      }
    } else if (name === 'triangle' && inMesh) {
      const v = tv.exec(m[3])
      let a = null
      if (v) tris.push(+v[1], +v[2], +v[3])
      else {
        a = attrs(m[3])
        tris.push(+a.v1, +a.v2, +a.v3)
      }
      if (m[3].includes('paint_color=') || m[3].includes('mmu_segmentation=')) {
        a = a || attrs(m[3])
        const code = a.paint_color ?? a.mmu_segmentation
        if (code) (paint ||= new Map()).set(tris.length / 3 - 1, String(code))
      }
      if (m[3].includes('p1=') || m[3].includes('pid=')) {
        a = a || attrs(m[3])
        triCol.push(a.pid !== undefined ? Number(a.pid) : -2, a.p1 !== undefined ? Number(a.p1) : 0)
      } else triCol.push(-1, 0)
    } else if (name === 'object') {
      const a = attrs(m[3])
      obj = { id: a.id, name: a.name ? xmlText(a.name) : '', type: a.type || 'model', pid: a.pid, pindex: a.pindex !== undefined ? Number(a.pindex) : 0, components: [], mesh: null }
      if (m[4] === '/') {
        out.objects.set(obj.id, obj)
        obj = null
      }
    } else if (name === 'mesh' && obj) {
      inMesh = true
      verts = []
      tris = []
      triCol = []
    } else if (name === 'component' && obj) {
      const a = attrs(m[3])
      obj.components.push({ path: a.path || '', objectid: a.objectid, transform: parseTransform(a.transform) })
    } else if (name === 'item') {
      const a = attrs(m[3])
      out.items.push({ objectid: a.objectid, transform: parseTransform(a.transform), path: a.path || '', printable: a.printable })
    } else if (name === 'model') {
      const a = attrs(m[3])
      if (a.unit) out.unit = a.unit
    } else if (name === 'basematerials') {
      group = { kind: 'base', colors: [] }
      out.baseMaterials.set(attrs(m[3]).id, group)
    } else if (name === 'colorgroup') {
      group = { kind: 'color', colors: [] }
      out.colorGroups.set(attrs(m[3]).id, group)
    } else if (name === 'base' && group) {
      group.colors.push(parseColor(attrs(m[3]).displaycolor))
    } else if (name === 'color' && group) {
      group.colors.push(parseColor(attrs(m[3]).color))
    }
  }
  return out
}

/** "#RRGGBB" or "#RRGGBBAA" -> 0xRRGGBB; null when absent or not a color. */
export function parseColor(s) {
  const m = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(String(s || '').trim())
  return m ? parseInt(m[1], 16) : null
}

// ---------- Bambu / Orca Slicer configuration ----------
/** Metadata/model_settings.config: object and part names and extruders. */
export function parseSlicerConfig(text) {
  const cfg = { objects: new Map() }
  text = stripNonMarkup(text)
  const tag = tagScanner(text)
  let m
  let obj = null
  let part = null
  while ((m = tag.exec())) {
    const name = m[2]
    if (m[1] === '/') {
      if (name === 'part') part = null
      else if (name === 'object') obj = null
      continue
    }
    const a = attrs(m[3])
    if (name === 'object') {
      obj = { name: '', extruder: null, parts: new Map() }
      cfg.objects.set(a.id, obj)
    } else if (name === 'part' && obj) {
      part = { name: '', extruder: null }
      obj.parts.set(a.id, part)
      if (m[4] === '/') part = null
    } else if (name === 'metadata' && obj && a.key) {
      const target = part || obj
      if (a.key === 'name') target.name = xmlText(a.value || '')
      else if (a.key === 'extruder') target.extruder = Number(a.value) || null
    }
  }
  return cfg
}
/** Metadata/project_settings.config (JSON): the filament colors, index 0 = extruder 1. */
/**
 * The filament a painted triangle uses, from its paint_color (hex, Bambu Studio / Orca Slicer / PrusaSlicer's mmu_segmentation). The
 * string holds the nibbles of the triangle's selector tree, the last character first: a leaf has its two low bits 0 (no split) and the two
 * high bits are the state; state 1 and 2 are one digit ("4", "8"); a state of 3 or more is the marker nibble C followed by the state minus 3
 * ("0C" is 3, "1C" is 4, ...). Any other code is a triangle painted finer (split into smaller areas): { state: null, fine: true }.
 * (From the slicers' serialization; check it against a real multi-color project before relying on it.)
 */
export function decodePaint(code) {
  const s = String(code).trim()
  if (!/^[0-9a-fA-F]+$/.test(s)) return { state: null, fine: true }
  if (s.length === 1) {
    const h = parseInt(s, 16)
    if ((h & 3) === 0 && h !== 0xc) return { state: h >> 2 || null, fine: false } // 0: not painted
  } else if (s.length === 2 && /c$/i.test(s)) return { state: 3 + parseInt(s[0], 16), fine: false }
  return { state: null, fine: true }
}

export function parseFilamentColors(text) {
  try {
    const j = JSON.parse(text)
    const c = j.filament_colour || j.filament_color
    return Array.isArray(c) ? c.map(parseColor) : []
  } catch {
    return []
  }
}

// ---------- the package ----------
function resolvePath(path, from) {
  // Paths stay inside the package: absolute ("/3D/Objects/a.model") or relative to the referencing file; no ".." out of the root.
  const parts = path.startsWith('/') ? [] : from.split('/').slice(0, -1)
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(seg)
  }
  return parts.join('/')
}
const baseName = (p) => p.split('/').pop().replace(/\.model$/i, '').replace(/_\d+$/, '')

/** True when the package keeps meshes in separate model files (needs this reader). */
export function hasExternalModels(names, mainText) {
  return names.some((n) => /(^|\/)3D\/.+\.model$/i.test(n) && !/(^|\/)3D\/3dmodel\.model$/i.test(n)) || /\sp:path="/.test(mainText || '')
}

/** Reads the package. Throws Error(messageKey) for unreadable packages: 'threemf_no_model', 'threemf_too_large', 'threemf_cyclic'.
 *  Returns { unit, unitScale, instances, meshes, stats, missing } where instances = [{ key, matrix, label, color }] and
 *  meshes = Map key -> { pos, idx, triCol, colors } (colors: per-triangle color table for multi-color meshes). */
export function readPackage(buf, limits = LIMITS) {
  const wanted = (n) => /\.model$/i.test(n) || /(^|\/)Metadata\/(model_settings|project_settings)\.config$/i.test(n)
  let total = 0
  const names = []
  const files = unzipSync(new Uint8Array(buf), {
    filter: (f) => {
      names.push(f.name)
      total += f.originalSize
      if (total > limits.maxTotalBytes) throw new Error('threemf_too_large')
      if (!wanted(f.name)) return false
      const cap = /\.model$/i.test(f.name) ? limits.maxModelBytes : limits.maxConfigBytes
      if (f.originalSize > cap) throw new Error('threemf_too_large')
      return true
    }
  })
  const mainName = names.find((n) => /(^|\/)3D\/3dmodel\.model$/i.test(n))
  if (!mainName) throw new Error('threemf_no_model')
  const models = new Map()
  const load = (name) => {
    if (!models.has(name)) models.set(name, files[name] ? parseModel(dec.decode(files[name])) : null)
    return models.get(name)
  }
  const main = load(mainName)
  const cfgName = names.find((n) => /(^|\/)Metadata\/model_settings\.config$/i.test(n))
  const cfg = cfgName && files[cfgName] ? parseSlicerConfig(dec.decode(files[cfgName])) : { objects: new Map() }
  const setName = names.find((n) => /(^|\/)Metadata\/project_settings\.config$/i.test(n))
  const filaments = setName && files[setName] ? parseFilamentColors(dec.decode(files[setName])) : []

  const instances = []
  const meshes = new Map()
  const missing = []
  const paintStats = { painted: 0, fine: 0 } // painted triangles (paint_color) shown in their filament color / painted finer than shown
  let triangles = 0
  let drawn = 0
  let expansions = 0
  const addMissing = (what) => {
    if (missing.length < limits.maxMissing) missing.push(what)
    else missing.overflow = (missing.overflow || 0) + 1
  }
  const colorOf = (model, obj, ext) => {
    if (ext && filaments[ext - 1] != null) return filaments[ext - 1]
    const g = obj.pid !== undefined ? model.baseMaterials.get(obj.pid) || model.colorGroups.get(obj.pid) : null
    return g && g.colors[obj.pindex] != null ? g.colors[obj.pindex] : null
  }
  const meshKeyFor = (file, obj, model) => {
    const key = `${file}#${obj.id}`
    if (!meshes.has(key)) {
      const colors = new Map()
      if (obj.mesh.triCol && obj.mesh.triCol.some((v, i) => i % 2 === 0 && v !== -1)) {
        for (let i = 0; i < obj.mesh.triCol.length; i += 2) {
          const pid = obj.mesh.triCol[i] === -2 && obj.pid !== undefined ? Number(obj.pid) : obj.mesh.triCol[i] // p1 without pid: the object's material
          const g = pid >= 0 ? model.baseMaterials.get(String(pid)) || model.colorGroups.get(String(pid)) : null
          const c = g ? g.colors[obj.mesh.triCol[i + 1]] : null
          if (c != null) colors.set(i / 2, c)
        }
      }
      let painted = 0
      let fine = 0
      if (obj.mesh.paint) {
        for (const [tri, code] of obj.mesh.paint) {
          const d = decodePaint(code)
          if (d.fine) fine++
          else if (d.state) {
            painted++
            if (filaments[d.state - 1] != null) colors.set(tri, filaments[d.state - 1])
          }
        }
      }
      paintStats.painted += painted
      paintStats.fine += fine
      meshes.set(key, { pos: obj.mesh.pos, idx: obj.mesh.idx, triColors: colors.size ? colors : null })
      triangles += obj.mesh.idx.length / 3
    }
    return key
  }
  // object: { file, id }. `chain` guards against cycles; `names` is the label so far.
  const expand = (file, obj, matrix, depth, chain, label, cfgObj, cfgPart, ext) => {
    if (depth > limits.maxDepth) throw new Error('threemf_cyclic')
    if (instances.length > limits.maxInstances || ++expansions > limits.maxExpansions) throw new Error('threemf_too_large')
    const model = models.get(file)
    const id = `${file}#${obj.id}`
    if (chain.has(id)) throw new Error('threemf_cyclic')
    if (obj.mesh && obj.mesh.idx.length) {
      const key = meshKeyFor(file, obj, model)
      drawn += obj.mesh.idx.length / 3
      if (triangles > limits.maxTriangles || drawn > limits.maxDrawnTriangles) throw new Error('threemf_too_large')
      instances.push({ key, matrix, label, color: colorOf(model, obj, ext || (cfgPart && cfgPart.extruder) || (cfgObj && cfgObj.extruder)) })
    }
    chain.add(id)
    const single = obj.components.length === 1
    obj.components.forEach((c, i) => {
      const f2 = c.path ? resolvePath(c.path, file) : file
      const m2 = f2 ? load(f2) : null
      const child = m2 && m2.objects.get(c.objectid)
      if (!child) {
        addMissing(c.path || `object ${c.objectid}`)
        return
      }
      const part = cfgObj && cfgObj.parts.get(c.objectid)
      const partName = (part && part.name) || child.name || (c.path ? baseName(c.path) : `Part ${i + 1}`)
      const childLabel = single || !partName ? label : `${label} › ${partName}`
      expand(f2, child, c.transform ? mul(matrix, c.transform) : matrix, depth + 1, chain, childLabel, cfgObj, part || null, ext)
    })
    chain.delete(id)
  }
  const items = main.items.length ? main.items : [...main.objects.keys()].map((id) => ({ objectid: id, transform: null }))
  items.forEach((it, i) => {
    const obj = main.objects.get(it.objectid)
    if (!obj) {
      addMissing(`object ${it.objectid}`)
      return
    }
    const cfgObj = cfg.objects.get(it.objectid) || null
    const label = (cfgObj && cfgObj.name) || obj.name || `Object ${i + 1}`
    expand(mainName, obj, it.transform || IDENTITY(), 0, new Set(), label, cfgObj, null, null)
  })
  return {
    unit: main.unit,
    unitScale: MM[main.unit] ?? 1,
    instances,
    meshes,
    missing,
    stats: { paint: paintStats, skippedTriangles: [...models.values()].reduce((a, m) => a + (m ? m.skipped : 0), 0), models: models.size, triangles, instances: instances.length, items: items.length }
  }
}
