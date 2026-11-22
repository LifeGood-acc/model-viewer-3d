// glTF helpers that need no browser: read the JSON of a GLB, say which extensions it needs, and turn a .gltf (JSON with buffers and
// images as data: URIs or as separate files) into one GLB in memory, so the one loader path that already handles textures and
// compression reads it and no URL has to be fetched (a plugin frame may not fetch data: or blob: URLs).

const textDecoder = new TextDecoder()

/** The JSON of a GLB (the first chunk), or null when the bytes are not a GLB. */
export function readGlbJson(buf) {
  const b = buf instanceof ArrayBuffer ? new DataView(buf) : new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (b.byteLength < 20 || b.getUint32(0, true) !== 0x46546c67) return null // "glTF"
  const len = b.getUint32(12, true)
  if (b.getUint32(16, true) !== 0x4e4f534a || 20 + len > b.byteLength) return null // "JSON"
  try {
    return JSON.parse(textDecoder.decode(new Uint8Array(b.buffer, b.byteOffset + 20, len)))
  } catch {
    return null
  }
}

/** Which compression the file needs a decoder for. */
export function gltfNeeds(json) {
  const used = new Set([...(json?.extensionsUsed || []), ...(json?.extensionsRequired || [])])
  return { draco: used.has('KHR_draco_mesh_compression'), ktx2: used.has('KHR_texture_basisu') }
}

/** The files a .gltf refers to that are not data: URIs, as [{ uri, kind: 'buffer' | 'image' }] (each once). */
export function gltfExternalUris(json) {
  const out = []
  const seen = new Set()
  const add = (uri, kind) => {
    if (typeof uri !== 'string' || /^data:/i.test(uri) || seen.has(uri)) return
    seen.add(uri)
    out.push({ uri, kind })
  }
  for (const b of json?.buffers || []) add(b?.uri, 'buffer')
  for (const i of json?.images || []) add(i?.uri, 'image')
  return out
}

/** A relative URI of a .gltf as a path from the folder of the .gltf: percent-decoded, "./" and "../" resolved, no query or hash.
 *  Returns null for a URI that leaves the folder (or is absolute), which can only be matched by its file name. */
export function uriPath(uri) {
  let s = String(uri).split(/[?#]/)[0]
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('/')) return null
  try {
    s = decodeURIComponent(s)
  } catch {
    // a name that is not valid percent-encoding is taken as it is
  }
  const parts = []
  for (const seg of s.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(seg)
  }
  return parts.length ? parts.join('/') : null
}

/** Finds the file a URI names among dropped files. `files` is a Map from the path below the dropped folder (or just the file name)
 *  to anything; the .gltf's own folder is `dir` (a path with no trailing slash, '' for the root). The exact place wins; otherwise a
 *  file of the same name anywhere (a flat drop of several files has no folders). */
export function findNeighbor(files, dir, uri) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(String(uri))) return null // an address on the web is not a file that was dropped
  const key = (x) => String(x).normalize('NFC').toLowerCase() // macOS and Windows file systems ignore case, and macOS may hold names decomposed
  const rel = uriPath(uri)
  const name = String(uri).split(/[?#]/)[0].replace(/\\/g, '/').split('/').pop()
  let base = name
  try {
    base = decodeURIComponent(name)
  } catch {
    // keep the raw name
  }
  const all = [...files]
  if (rel) {
    const full = dir ? `${dir}/${rel}` : rel
    for (const want of [full, rel]) {
      if (files.has(want)) return files.get(want)
      const hit = all.find(([path]) => key(path) === key(want))
      if (hit) return hit[1]
    }
  }
  // by name alone (a flat drop of several files has no folders), but only when one file has that name: two would be a guess
  const same = all.filter(([path]) => key(path) === key(base) || key(path).endsWith('/' + key(base)))
  return same.length === 1 ? same[0][1] : null
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ktx2: 'image/ktx2', gif: 'image/gif' }
// a 1 x 1 gray PNG, in place of an image file that was not found
const GRAY_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

function decodeDataUri(uri) {
  const m = /^data:([^,;]*)((?:;[^,;]*)*),(.*)$/is.exec(uri)
  if (!m) throw new Error('gltf_bad_data_uri')
  const mime = m[1] || ''
  if (/;base64/i.test(m[2])) {
    const bin = atob(m[3].replace(/\s/g, ''))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return { bytes: out, mime }
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime }
}

/** Packs a .gltf into a GLB. `getBytes(uri, kind)` returns the bytes of a file that is not a data: URI (a Uint8Array) or null when it
 *  is not there. A buffer that is missing is an error (`error.missing` lists the URIs); an image that is missing becomes a 1 x 1 gray
 *  picture and is listed in `missingImages`. Returns { glb: ArrayBuffer, missingImages, bytes } where `bytes` is the size of the binary data. */
export function gltfToGlb(json, getBytes) {
  const doc = JSON.parse(JSON.stringify(json))
  const chunks = [] // { offset, bytes }
  let total = 0
  const place = (bytes) => {
    const offset = total
    chunks.push({ offset, bytes })
    total = Math.ceil((offset + bytes.length) / 4) * 4
    return offset
  }
  const missing = []
  const bufferBase = []
  for (const b of doc.buffers || []) {
    let bytes = null
    if (typeof b.uri === 'string') bytes = /^data:/i.test(b.uri) ? decodeDataUri(b.uri).bytes : getBytes(b.uri, 'buffer')
    else if (b.byteLength === 0 || (b.extensions && b.extensions.EXT_meshopt_compression && b.extensions.EXT_meshopt_compression.fallback)) bytes = new Uint8Array(0) // a meshopt fallback buffer has no data: its views are read from the compressed buffer
    if (!bytes) {
      missing.push(b.uri || '(buffer)')
      bufferBase.push(0)
      continue
    }
    const fallback = !!(b.extensions && b.extensions.EXT_meshopt_compression && b.extensions.EXT_meshopt_compression.fallback)
    if (!fallback && bytes.length < (b.byteLength || 0)) throw Object.assign(new Error('gltf_short_buffer'), { uri: b.uri })
    bufferBase.push(place(bytes))
  }
  if (missing.length) throw Object.assign(new Error('gltf_missing_files'), { missing })
  doc.bufferViews ||= []
  for (const v of doc.bufferViews) {
    const m = v.extensions && v.extensions.EXT_meshopt_compression // a compressed view names its own buffer and offset
    if (m && typeof m.buffer === 'number') {
      m.byteOffset = (m.byteOffset || 0) + (bufferBase[m.buffer] || 0)
      m.buffer = 0
    }
    v.byteOffset = (v.byteOffset || 0) + (bufferBase[v.buffer] || 0)
    v.buffer = 0
  }
  const missingImages = []
  const missingIdx = new Set()
  for (const [imIndex, im] of (doc.images || []).entries()) {
    if (typeof im.uri !== 'string') continue
    let bytes
    let mime = im.mimeType
    if (/^data:/i.test(im.uri)) {
      const d = decodeDataUri(im.uri)
      bytes = d.bytes
      mime ||= d.mime
    } else {
      bytes = getBytes(im.uri, 'image')
      if (!bytes) {
        missingImages.push(im.uri)
        missingIdx.add(imIndex)
        bytes = GRAY_PNG
        mime = 'image/png'
      } else mime ||= MIME[(im.uri.split(/[?#]/)[0].split('.').pop() || '').toLowerCase()]
    }
    const offset = place(bytes)
    doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length })
    im.bufferView = doc.bufferViews.length - 1
    im.mimeType = mime || 'image/png'
    delete im.uri
  }
  if (missingIdx.size) {
    // a surface whose picture is not there shows without a texture (a gray stand-in would also break a normal map)
    const lost = new Set()
    ;(doc.textures || []).forEach((tx, i) => {
      const srcs = [tx.source, ...Object.values(tx.extensions || {}).map((e) => e && e.source)].filter((x) => typeof x === 'number')
      if (srcs.length && srcs.every((x) => missingIdx.has(x))) lost.add(i)
    })
    removeTextures(doc, lost)
  }
  doc.buffers = [{ byteLength: total }]
  const json8 = new TextEncoder().encode(JSON.stringify(doc))
  const jsonLen = Math.ceil(json8.length / 4) * 4
  const length = 12 + 8 + jsonLen + (total ? 8 + total : 0)
  if (length > 2 ** 32 - 1) throw Object.assign(new Error('gltf_too_big'), { bytes: length })
  const out = new Uint8Array(length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, length, true)
  dv.setUint32(12, jsonLen, true)
  dv.setUint32(16, 0x4e4f534a, true)
  out.set(json8, 20)
  out.fill(0x20, 20 + json8.length, 20 + jsonLen) // JSON chunks are padded with spaces
  if (total) {
    const at = 20 + jsonLen
    dv.setUint32(at, total, true)
    dv.setUint32(at + 4, 0x004e4942, true)
    for (const c of chunks) out.set(c.bytes, at + 8 + c.offset)
  }
  return { glb: out.buffer, missingImages, bytes: total }
}

/** A GLB with the same binary data and another JSON (the chunks are laid out again). */
export function withGlbJson(buf, json) {
  const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const oldJson = dv.getUint32(12, true)
  const rest = u8.subarray(20 + Math.ceil(oldJson / 4) * 4) // the binary chunk (header and data), if any
  const json8 = new TextEncoder().encode(JSON.stringify(json))
  const jsonLen = Math.ceil(json8.length / 4) * 4
  const out = new Uint8Array(20 + jsonLen + rest.length)
  const o = new DataView(out.buffer)
  o.setUint32(0, 0x46546c67, true)
  o.setUint32(4, 2, true)
  o.setUint32(8, out.length, true)
  o.setUint32(12, jsonLen, true)
  o.setUint32(16, 0x4e4f534a, true)
  out.set(json8, 20)
  out.fill(0x20, 20 + json8.length, 20 + jsonLen)
  out.set(rest, 20 + jsonLen)
  return out.buffer
}

/** For a frame that cannot run the Basis decoder (it needs dynamic code): a GLB without its KTX2 (KHR_texture_basisu) textures. A texture that
 *  has a PNG or JPEG fallback (`source`) keeps it; one that has not is taken out of the materials. Returns { glb, dropped, kept }. */
export function stripBasisu(buf) {
  const json = readGlbJson(buf)
  if (!json) return { glb: buf, dropped: 0, kept: 0 }
  const lost = new Set()
  let kept = 0
  ;(json.textures || []).forEach((tx, i) => {
    if (!tx.extensions || !tx.extensions.KHR_texture_basisu) return
    delete tx.extensions.KHR_texture_basisu
    const other = typeof tx.source === 'number' || Object.values(tx.extensions).some((e) => e && typeof e.source === 'number') // PNG, JPEG or WebP beside the KTX2 one
    if (!Object.keys(tx.extensions).length) delete tx.extensions
    if (other) kept++
    else lost.add(i)
  })
  removeTextures(json, lost)
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (json[key]) {
      json[key] = json[key].filter((e) => e !== 'KHR_texture_basisu')
      if (!json[key].length) delete json[key]
    }
  }
  return { glb: withGlbJson(buf, json), dropped: lost.size, kept }
}

/** Takes the textures in `lost` (indices) out of every material, wherever a texture reference sits (base color, normal, clearcoat ...). */
function removeTextures(json, lost) {
  if (!lost.size) return
  const walk = (o) => {
    if (!o || typeof o !== 'object') return
    for (const k of Object.keys(o)) {
      const v = o[k]
      if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.index === 'number' && lost.has(v.index) && /texture/i.test(k)) delete o[k]
      else walk(v)
    }
  }
  for (const m of json.materials || []) walk(m)
}

/** What a GLB would cost to open, read from its header and the first bytes of each picture (no picture is decoded): triangles,
 *  vertices, and the memory the pictures take on the GPU (width x height x 4 x 4/3 each; a picture whose size cannot be read counts
 *  as 2048 x 2048). `binOffset` is where the binary chunk starts in `buf`. Returns null when `buf` is not a GLB. */
export function glbBudget(buf) {
  try {
    return glbBudgetUnsafe(buf)
  } catch {
    return null // a damaged file: the loader says what is wrong with it; the estimate is only a courtesy
  }
}
function glbBudgetUnsafe(buf) {
  const json = readGlbJson(buf)
  if (!json) return null
  const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const jsonLen = dv.getUint32(12, true)
  let binStart = -1
  let binLen = 0
  const at = 20 + Math.ceil(jsonLen / 4) * 4
  if (at + 8 <= u8.length && dv.getUint32(at + 4, true) === 0x004e4942) {
    binStart = at + 8
    binLen = Math.min(dv.getUint32(at, true), u8.length - binStart)
  }
  const acc = json.accessors || []
  let tris = 0
  let verts = 0
  for (const m of json.meshes || []) {
    for (const p of m.primitives || []) {
      const mode = p.mode ?? 4
      const pos = acc[p.attributes?.POSITION]
      if (pos) verts += pos.count || 0
      const n = p.indices != null ? acc[p.indices]?.count : pos?.count
      if (mode === 4 && n) tris += Math.floor(n / 3)
      else if ((mode === 5 || mode === 6) && n) tris += Math.max(0, n - 2)
    }
  }
  const sizeOf = (im) => {
    if (im.bufferView == null || binStart < 0) return null
    const v = (json.bufferViews || [])[im.bufferView]
    if (!v) return null
    const o = binStart + (v.byteOffset || 0)
    if (o + 32 > u8.length || o < binStart) return null
    const len = Math.min(v.byteLength || 0, binStart + binLen - o)
    return imageSize(u8.subarray(o, o + Math.min(len, 1 << 20)))
  }
  let textureBytes = 0
  const images = []
  for (const im of json.images || []) {
    const s = sizeOf(im) || { w: 2048, h: 2048, guessed: true }
    images.push(s)
    textureBytes += Math.round(s.w * s.h * 4 * (4 / 3))
  }
  return { tris, verts, textureBytes, images, binBytes: binLen }
}

/** Width and height from the start of a PNG, JPEG or KTX2 file; null for anything else. */
export function imageSize(b) {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return { w: dv.getUint32(16), h: dv.getUint32(20) }
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++
        continue
      }
      const marker = b[i + 1]
      if (marker === 0xff) {
        i++
        continue
      }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2
        continue
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3])
    }
    return null
  }
  if (b.length >= 28 && b[0] === 0xab && b[1] === 0x4b && b[2] === 0x54 && b[3] === 0x58) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return { w: dv.getUint32(20, true), h: dv.getUint32(24, true) }
  }
  return null
}
