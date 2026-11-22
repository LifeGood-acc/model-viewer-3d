// Small readers for formats that need no library (no browser needed): XYZ point text, and the unit and up axis an FBX file names in its
// global settings (three.js' FBX loader ignores both).

/** XYZ point text: one point per line, "x y z" or "x y z r g b" (more columns are ignored), separated by spaces, commas, semicolons or tabs.
 *  Lines that start with '#' or '//', empty lines and lines that are not numbers (a header, a point count) are skipped. Colors are 0..255 or
 *  0..1 (told from the largest value in the file). Returns { positions, colors | null, count, skipped }. */
export function parseXyz(text) {
  if (text.indexOf('\n') < 0 && text.indexOf('\r') >= 0) text = text.replace(/\r/g, '\n') // old Mac line endings
  const n = text.length
  let cap = 1024
  let pos = new Float32Array(cap * 3)
  let col = new Float32Array(cap * 3)
  let count = 0
  let skipped = 0
  let withColor = 0
  let maxCol = 0
  let commaLines = 0 // lines read with a decimal comma
  let negative = false // a negative value in the columns 4 to 6: normals (x y z nx ny nz), not colors
  let p = 0
  const v = [0, 0, 0, 0, 0, 0]
  while (p < n) {
    let end = text.indexOf('\n', p)
    if (end < 0) end = n
    let i = p
    p = end + 1
    // skip leading blanks
    while (i < end && text.charCodeAt(i) <= 32) i++
    if (i >= end) continue
    const c0 = text.charCodeAt(i)
    if (c0 === 35 || (c0 === 47 && text.charCodeAt(i + 1) === 47)) continue // # or //
    // a decimal comma (European CSV): "1,5;2,5;3,5" (semicolons between the numbers) or "1,5 2,5 3,5" (blanks between numbers that all have a comma)
    let lineText = null
    let comma = false
    let semi = false
    for (let q = i; q < end; q++) {
      const d = text.charCodeAt(q)
      if (d === 44) comma = true
      else if (d === 59) semi = true
    }
    const rawLine = comma ? text.slice(i, end) : ''
    if (comma) {
      if (semi && rawLine.split(';').filter((x) => x.trim() !== '').every((x) => /^[-+]?\d*,?\d+(e[-+]?\d+)?$/i.test(x.trim()))) lineText = rawLine.split(';').map((x) => x.trim().replace(',', '.')).join(' ')
      else if (!semi && /\s/.test(rawLine.trim()) && rawLine.trim().split(/\s+/).every((x) => /^[-+]?\d+,\d+(e[-+]?\d+)?$/i.test(x) || /^[-+]?\d+$/.test(x)) && /,/.test(rawLine)) lineText = rawLine.replace(/,/g, '.')
    }
    const src = lineText === null ? text : lineText
    const base = lineText === null ? i : 0
    const stop = lineText === null ? end : lineText.length
    if (lineText !== null) commaLines++
    let k = 0
    let j0 = base
    while (j0 < stop && k < 6) {
      while (j0 < stop && (src.charCodeAt(j0) <= 32 || src.charCodeAt(j0) === 44 || src.charCodeAt(j0) === 59)) j0++
      if (j0 >= stop) break
      let j = j0
      while (j < stop) {
        const d = src.charCodeAt(j)
        if (d <= 32 || d === 44 || d === 59) break
        j++
      }
      const x = Number(src.slice(j0, j))
      if (!Number.isFinite(x)) {
        if (k >= 3) break // a label or something else after the coordinates (and colors): the point is read without it
        k = -1
        break
      }
      v[k++] = x
      j0 = j
    }
    if (k < 3) {
      skipped++
      continue
    }
    if (k > 3 && k < 6) k = 3 // four or five numbers: no complete color
    if (count === cap) {
      cap *= 2
      const np = new Float32Array(cap * 3)
      np.set(pos)
      pos = np
      const nc = new Float32Array(cap * 3)
      nc.set(col)
      col = nc
    }
    pos[count * 3] = v[0]
    pos[count * 3 + 1] = v[1]
    pos[count * 3 + 2] = v[2]
    if (k >= 6) {
      col[count * 3] = v[3]
      col[count * 3 + 1] = v[4]
      col[count * 3 + 2] = v[5]
      withColor++
      maxCol = Math.max(maxCol, v[3], v[4], v[5])
      if (v[3] < 0 || v[4] < 0 || v[5] < 0) negative = true
    }
    count++
  }
  const useColor = count > 0 && withColor === count && !negative // a file where only some lines have colors has none
  let colors = null
  if (useColor) {
    colors = col.slice(0, count * 3)
    const k = maxCol > 1 ? 1 / 255 : 1
    for (let i = 0; i < colors.length; i++) colors[i] = Math.min(1, Math.max(0, colors[i] * k))
  }
  return { positions: pos.slice(0, count * 3), colors, count, skipped, commaLines }
}

/** The text format of a file seen only as text (Orca gives text editors no file name), told from its first lines.
 *  Returns 'ply', 'stl', 'gltf', 'fbx', 'pcd', 'gcode', 'xyz', or 'obj' (the rest). */
export function sniffText(text) {
  const head = String(text).slice(0, 2048).replace(/^﻿/, '').trimStart()
  if (/^ply\b/.test(head)) return 'ply'
  if (/^solid\b/i.test(head)) return 'stl'
  if (head.startsWith('{')) return 'gltf' // a .gltf is JSON; OBJ never starts with a brace
  if (/^;\s*FBX\b/.test(head)) return 'fbx'
  if (/^#\s*\.PCD\b/i.test(head) || /^VERSION\s+\.?\d/.test(head)) return 'pcd'
  // the first lines that are not blank and not a '#' or '//' comment (OBJ and XYZ files both may start with such comments)
  const lines = head.split(/\r?\n/).filter((l) => l.trim() !== '' && !/^\s*(#|\/\/)/.test(l)).slice(0, 8).map((l) => l.trim())
  const first = lines[0] || ''
  if (/^(;|%|\(|N\d+\s*[GM]\d|[GM]\d)/.test(first)) return 'gcode' // comments with ';', or a G or M word; OBJ has neither
  // point text: three numbers or more on a line (scientific notation too), after at most a header or a count line, and no OBJ keyword before it
  const objWord = /^(v|vt|vn|vp|f|l|p|o|g|s|usemtl|mtllib|mg|cstype|deg|curv|curv2|surf|parm|trim|hole|scrv|sp|end)\s/
  const num = '[-+]?(?:\\d|\\.\\d)[^\\s,;]*'
  const triple = new RegExp(`^${num}(?:[\\s,;]+${num}){2,}$`)
  for (const l of lines) {
    if (objWord.test(l)) break
    if (triple.test(l)) return 'xyz'
  }
  return 'obj'
}

/** Unit and up axis from the global settings of an FBX file (ASCII or binary), as { unitScale, up } with nulls where the file does not say.
 *  `unitScale` is centimeters per unit (FBX's UnitScaleFactor: 1 = centimeters, 100 = meters, 0.1 = millimeters); `up` is 'x', 'y' or 'z'. */
export function fbxSettings(buf) {
  const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  const head = u8.subarray(0, Math.min(u8.length, 1 << 20))
  const binary = head.length > 20 && String.fromCharCode(...head.subarray(0, 17)) === 'Kaydara FBX Binar'
  const find = (name) => {
    const needle = Array.from(name, (c) => c.charCodeAt(0))
    outer: for (let i = 0; i + needle.length < head.length; i++) {
      for (let k = 0; k < needle.length; k++) if (head[i + k] !== needle[k]) continue outer
      return i
    }
    return -1
  }
  const number = (name) => {
    const at = find(name)
    if (at < 0) return null
    if (!binary) {
      const m = /,\s*(-?[\d.eE+-]+)/.exec(new TextDecoder().decode(head.subarray(at + name.length, Math.min(head.length, at + name.length + 120))).split('\n')[0].replace(/^[^,]*,[^,]*,[^,]*,[^,]*/, ''))
      return m ? Number(m[1]) : null
    }
    // binary: the property list is S "name", S "type", S "label", S "flags", then the value (I int32 or D double)
    const dv = new DataView(head.buffer, head.byteOffset, head.byteLength)
    let p = at - 5 // the 'S' tag and the length of the name string
    if (p < 0 || head[p] !== 83) return null
    for (let s = 0; s < 4; s++) {
      if (head[p] !== 83) return null
      p += 5 + dv.getUint32(p + 1, true)
    }
    if (p + 9 > head.length) return null
    if (head[p] === 68) return dv.getFloat64(p + 1, true)
    if (head[p] === 73) return dv.getInt32(p + 1, true)
    return null
  }
  const unitScale = number('UnitScaleFactor')
  const up = number('UpAxis')
  return { unitScale: unitScale !== null && unitScale > 0 && Number.isFinite(unitScale) ? unitScale : null, up: up === 1 ? 'y' : up === 2 ? 'z' : null } // an X-up file: the viewer has no such choice, so it is left to the person
}

/** The short unit name for an FBX UnitScaleFactor (centimeters per unit), the nearest known one, or null when none is within 1 %. */
export function fbxUnitName(unitScale) {
  const known = { µm: 1e-4, mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 }
  for (const [name, cm] of Object.entries(known)) if (Math.abs(unitScale - cm) <= 0.01 * cm) return name
  return null
}

/** The names of the files in a zip (read from its central directory; a USDZ is a zip). Returns [] for bytes that are not a zip. */
export function zipNames(buf) {
  const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let eocd = -1
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return []
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const names = []
  const dec = new TextDecoder()
  for (let k = 0; k < count && p + 46 <= u8.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const nl = dv.getUint16(p + 28, true)
    const xl = dv.getUint16(p + 30, true)
    const cl = dv.getUint16(p + 32, true)
    names.push(dec.decode(u8.subarray(p + 46, p + 46 + nl)))
    p += 46 + nl + xl + cl
  }
  return names
}

/** An ASCII PLY whose header promises more lines than the file has (cut off, or a count that lies): { declared, actual } (data lines), else null.
 *  Binary PLY files are not looked at. */
export function plyAsciiShortfall(buf) {
  const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  const head = new TextDecoder().decode(u8.subarray(0, Math.min(u8.length, 8192)))
  const end = head.indexOf('end_header')
  if (end < 0 || !/^format\s+ascii/m.test(head)) return null
  let declared = 0
  for (const m of head.slice(0, end).matchAll(/^element\s+\S+\s+(\d+)/gm)) declared += Number(m[1])
  const headEnd = head.indexOf('\n', end) + 1
  if (headEnd <= 0) return null
  const bodyStart = new TextEncoder().encode(head.slice(0, headEnd)).length // bytes, not characters (a comment may hold multibyte letters)
  // count the non-empty lines after the header, from the bytes (10 = newline)
  let actual = 0
  let lineHas = false
  for (let i = bodyStart; i < u8.length; i++) {
    const c = u8[i]
    if (c === 10) {
      if (lineHas) actual++
      lineHas = false
    } else if (c > 32) lineHas = true
  }
  if (lineHas) actual++
  return actual < declared ? { declared, actual } : null
}

/** Removes the triangles that have a coordinate that is not a finite number (a face of an OBJ that names a vertex that is not there), from the
 *  attributes of a triangle soup: `attrs` is { name: { array, itemSize } } with position first. Returns { attrs, removed }; `attrs` is the same
 *  object when nothing had to go. */
export function dropBadTriangles(attrs) {
  const pos = attrs.position.array
  const tris = Math.floor(pos.length / 9)
  const bad = new Uint8Array(tris)
  let removed = 0
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 9; k++) {
      if (!Number.isFinite(pos[t * 9 + k])) {
        bad[t] = 1
        removed++
        break
      }
    }
  }
  if (!removed) return { attrs, removed: 0, bad }
  const out = {}
  for (const [name, a] of Object.entries(attrs)) {
    const per = a.itemSize * 3 // numbers per triangle
    const arr = new a.array.constructor((tris - removed) * per)
    let o = 0
    for (let t = 0; t < tris; t++) {
      if (bad[t]) continue
      arr.set(a.array.subarray(t * per, t * per + per), o)
      o += per
    }
    out[name] = { array: arr, itemSize: a.itemSize }
  }
  return { attrs: out, removed, bad }
}
