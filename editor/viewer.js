// 3D Model Viewer: a read-only viewer for GLB, PLY, OBJ, STL and 3MF (USDZ: notice only).
// three.js 0.187.0 (MIT) and fflate 0.8.3 (MIT) are shipped in ./vendor; nothing is loaded from the network.
// Orca never gives an editor a file path, so the file arrives as bytes through orca.document.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { initShell, installErrorGuard } from './shared/shell.js'
import { dragReducer, planOpen } from './shared/core.js'
import { initStudioUi } from './shared/studio-ui.js'
import { keyAction } from './shared/keymap.js'
import { askConfirm, confirmOpen } from './shared/confirm-dialog.js'
import { createBackground } from './shared/background-three.js'
import { buildChrome } from './shared/chrome-layout.js'
import { controlsState } from './shared/controls-core.js'
import { migratePrefs, isNewerPrefs, bgModeOf, bgColorOf, nextBgMode, withBg, defaultState, resetPrefs } from './shared/prefs-core.js'
import { createSelectionBox } from './shared/selection-three.js'
import { initPartCard } from './shared/part-card.js'
import { createPartTree } from './shared/part-tree-ui.js'
import { PLUGIN_VERSION } from './version.js'
import { rowsFromPaths } from './shared/part-tree-core.js'
import * as S from './shared/tools-scene.js'
import { suggestName, triangleCount, write3MF, writeGLB, writeOBJ, writePLY, writeSTL } from './shared/export.js'
import { EXAMPLES } from './examples.js'
import { collectParts as collectExportParts, renderPng } from './shared/export-three.js'
import { initExportUi } from './shared/export-ui.js'
import { runTask } from './shared/tools-run.js'
import { initToolsUi } from './shared/tools-ui.js'
import { createShading } from './shared/shading.js'
import { createMeasure } from './shared/measure-three.js'
import { createMeshOverlay } from './shared/mesh-overlay.js'
import { installMeasureInteraction } from './shared/measure-wire.js'
import { copyText, detailsText } from './shared/details.js'
import { createSessionStore, KEEP_MAX_BYTES } from './shared/session-store.js'
import { UNIT_METERS } from './shared/tools-scene.js'
import { exportGlb } from './export-scene.js'
import { readPackage } from './threemf.js'
import { dropBadTriangles, fbxSettings, fbxUnitName, parseXyz, plyAsciiShortfall, zipNames } from './formats.js'
import { parseGcode } from './gcode.js'
import { findNeighbor, gltfExternalUris, gltfNeeds, gltfToGlb, glbBudget, readGlbJson, stripBasisu } from './gltf-pack.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { fitDistance, summarizeParts, statsRows, hasSphericalHarmonicColor, clipPlane, defaultUp, extOf, fileAxisToView, GATE_BYTES, HARD_MAX_BYTES, inspect3mf, isStartText, pickFile, stateLine, SUPPORTED_EXT, isGaussianSplatHeader, makeFormat, makeT, measureInfo, niceStep, partHue, pickLocale, presetDirection, presetScale, sniffTextFormat, textureBytes, textureTarget } from './lib.js'

const $ = (id) => document.getElementById(id)
const locale = pickLocale(orca.locale || navigator.language)
const t = makeT(locale)
let extentText = '' // the size of the whole model as one line, for "Copy details" (the card shows it as three numbers)
const F = makeFormat(locale)
const fmt = F.int
const fmtMB = F.mb
const fmtLen = F.len
document.documentElement.lang = locale
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle)
for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria))
for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh)

// Remembered choices (best effort: storage can be unavailable in a frame)
const PREF_KEY = 'model-viewer-3d.v2'
let prefs = {}
try {
  prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}
} catch {}
const newerPrefs = isNewerPrefs(prefs)
prefs = migratePrefs(prefs) // one version field, one background model (an older record keeps its keys)
if (!newerPrefs) savePrefs() // stored at once, so the record on disk has its version (a newer record is not touched)
function savePrefs() {
  if (newerPrefs) return // written by a newer version: not overwritten
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
  } catch {}
}

// Lets tests and tooling see what the viewer is doing without reading the DOM text.
function setStateAttr(v) {
  document.documentElement.dataset.state = v
  if (document.body) document.body.dataset.state = v
}
setStateAttr('waiting')

// Budgets: above these the viewer still tries, but says so.
const WARN_TRIS = 1_500_000
const WARN_POINTS = 4_000_000

const state = {
  up: 'y',
  upTouched: false, // the user chose an axis: keep it across reloads of the same file
  wire: false,
  tex: true,
  grid: true,
  axes: true,
  box: false,
  over: false, // the mesh lines over the surface (Appearance > Advanced)
  back: true,
  pointSize: 2,
  tint: false,
  shading: 'original',
  opacity: 1,
  clip: { axis: '', t: 0.5, flip: false },
  texMax: 0,
  measure: false,
}

// ---------- renderer / scene ----------
const canvas = $('gl')
let renderer
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }) // alpha: a PNG with a transparent background
} catch (e) {
  setStateAttr('error')
  setMsg(t('gl_unavailable'), true)
  throw new Error('WebGL is not available') // nothing can be drawn; the message above is what the person sees
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.localClippingEnabled = true // the section plane clips per material
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000)
camera.up.set(0, 1, 0)
scene.add(camera)
let studioUiRef = null // the studio ui, once it exists (the background asks it for the look's own)
const bgModel = createBackground({ scene, canvas, studio: () => studioUiRef, themeDark: () => document.documentElement.classList.contains('dark') })
bgModel.set(bgModeOf(prefs), bgColorOf(prefs)) // one model for both viewers: look, orca, light, dark, white, gradient, transparent, custom (own colour)
const hemisphere = new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6)
scene.add(hemisphere)
const headlight = new THREE.DirectionalLight(0xffffff, 1.8) // light from the camera, so every side reads
headlight.position.set(0.3, 0.6, 1)
headlight.target.position.set(0, 0, -1)
camera.add(headlight, headlight.target)

const controls = new OrbitControls(camera, canvas)
controls.screenSpacePanning = true
controls.zoomToCursor = true
controls.enableDamping = false
canvas.tabIndex = 0
canvas.setAttribute('role', 'img')
canvas.setAttribute('aria-label', t('canvas_label'))
controls.listenToKeyEvents(canvas) // arrow keys pan when the view has focus

const spinRoot = new THREE.Group() // the studio's turntable turns this (it holds the model's root)
spinRoot.name = 'spin'
scene.add(spinRoot)
const modelRoot = new THREE.Group() // rotated by the "Up is" choice
spinRoot.add(modelRoot)
let studioUi = null
let lastPreset = null // the look chosen last (not counting edits)
let syncLooks = null // marks the chosen look tile
const helpers = new THREE.Group()
scene.add(helpers)
// "Mesh over the surface": a line object per mesh, in the helpers (not in the model: exports and part numbers never see it)
const meshOver = createMeshOverlay({ THREE, parent: helpers, getMeshes: () => parts.flatMap((p) => { const r = []; if (p.obj) p.obj.traverse((o) => o.isMesh && r.push(o)); return r }) })
meshOver.install(scene)
if (typeof window.__mv3dHook === 'function') window.__mv3dHook({ renderer, scene, camera, controls, get partCard() { return partCard }, get parts() { return parts }, get rows() { return rows }, get measure() { return measure }, get helpers() { return helpers }, get modelRoot() { return modelRoot }, get chrome() { return chrome }, get state() { return state }, viewFrame: () => viewFrame() }) // test tooling only

// Heavy models are drawn at a lower resolution while the camera moves.
const basePixelRatio = Math.min(window.devicePixelRatio || 1, 2)
controls.addEventListener('start', () => {
  if (heavy && basePixelRatio > 1) {
    renderer.setPixelRatio(1)
    resize()
  }
})
controls.addEventListener('end', () => {
  if (heavy && basePixelRatio > 1) {
    renderer.setPixelRatio(basePixelRatio)
    resize()
  }
})

let wantRender = false
function requestRender() {
  if (wantRender || glLost) return
  wantRender = true
  requestAnimationFrame(() => {
    wantRender = false
    renderer.render(scene, camera)
    viewFrame()
  })
}
/** After a drawn frame: the cube, the scale bar, the zoom and the status bar follow the camera (shared/view-info.js; the numbers come from the camera and the mesh). */
function viewFrame() {
  if (!chrome || !(model || isSplat)) return
  chrome.view.frame({ matrix: camera.matrixWorld.elements, distance: camera.position.distanceTo(controls.target), fov: camera.fov, viewH, fit: fitDistance(diag / 2, camera.fov, camera.aspect), grid: { on: !!gridObj && state.grid, step: gridStep } })
}
controls.addEventListener('change', requestRender)

// The view is the #stage element: its size follows the window, the side panel and the toolbar (layout in shared/shell.js).
let viewH = 1 // the height of the view in pixels (read when the view changes size, not at every frame)
function resize() {
  const s = $('stage')
  const w = Math.max(1, s.clientWidth)
  const h = Math.max(1, s.clientHeight)
  viewH = h
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  requestRender()
}
// Controls that need a model are disabled (not hidden) until one is shown, so the toolbar does not jump when a file loads.
function setHasModel(has) {
  document.body.classList.toggle('has-model', has)
  for (const el of document.querySelectorAll('[data-needs-model]')) el.disabled = !has
}

// A lost WebGL context (GPU reset, too many contexts) is recoverable: three.js re-uploads what it needs after restore.
let glLost = false
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault()
  glLost = true
  setMsg(t('gl_lost'), true)
})
canvas.addEventListener('webglcontextrestored', () => {
  glLost = false
  if ($('msg-text').textContent === t('gl_lost')) {
    // only take our own message down; a load error or "Loading ..." that came since stays
    if (model) hideMsg()
    else setMsg(t('waiting'))
  }
  requestRender()
})
// Free GPU memory when the tab closes or the editor is replaced.
window.addEventListener('pagehide', () => {
  if (studioUi) studioUi.studio.dispose()
  disposeModel()
  renderer.dispose()
})

// ---------- model state ----------
let model = null // loaded object (child of modelRoot)
let parts = [] // { obj, kind, name, label, tris, verts, orig, tint, visible }
const size = new THREE.Vector3() // extent in view axes
const fileSize = new THREE.Vector3() // extent along the file's own x, y, z
const center = new THREE.Vector3()
let diag = 1
let boundsBox = new THREE.Box3()
let allMaterials = new Set()
let textures = []
let fileInfo = { bytes: 0, type: '' }
let unit = { short: 'm', label: '' }
let fileNotes = []
let chrome = null // the toolbar and tabs (chrome-layout.js)
let multiSelect = false // "Select several": every click adds a part (no key needed)
let selected = -1 // the index of the main selected part (the last one chosen), -1: none
const selObjs = new Set() // everything that is selected (meshes), kept by object so it survives a rebuild of the part list
let selPrimary = null
let partCard = null
const selFrame = createSelectionBox(helpers)
let loadSeq = 0
let firstFrame = true // the camera is fitted once; reloads of a changed file keep the view
let lastLoadMs = 0
let loadSource = 'editor' // where the current file came from: 'editor' (Orca opened it), 'drop' or 'picker'
let currentName = '' // known for dropped and picked files only: Orca gives editors no file name
let docStart = 0 // when the document arrived: the load time covers decoding and building
let mixer = null
let actions = []
let playing = false
let lastFrameTime = 0
const shading = createShading()
const solidMat = shading.solid
const normalMat = shading.normals
const clipPlane3 = new THREE.Plane()
let heavy = false // many triangles or points: draw at a lower resolution while the camera moves

function setMsg(text, isErr = false) {
  if (isErr) setStateAttr('error')
  $('msg-text').textContent = text
  $('msg').className = 'msg' + (isErr ? ' err' : '')
}
function hideMsg() {
  $('msg').className = 'msg hide'
  setStateAttr('ok')
}
const PLUGIN_NAME = 'model-viewer-3d'
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()))

function disposeTexture(v) {
  v.dispose()
  const full = v.userData && v.userData.full
  if (full && full !== v.image && full.close) full.close() // the original of a downsampled texture
  if (v.image && v.image.close) v.image.close()
}

function disposeObject(root) {
  const sm = root.userData && root.userData.splat
  if (sm && sm.mesh && typeof sm.mesh.dispose === 'function') sm.mesh.dispose() // a splat renderer object that was never shown
  if (sm) root.userData.splat = null
  const mats = new Set()
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) mats.add(m)
  })
  for (const m of mats) {
    for (const k of Object.keys(m)) {
      const v = m[k]
      if (v && v.isTexture) {
        disposeTexture(v)
      }
    }
    m.dispose()
  }
}

function disposeModel() {
  if (chrome) chrome.resetMulti() // "Select several" is off again for the next file
  stopAnimation()
  measure.clearAll() // the measurements belong to the file
  disposeSplat()
  if (!model) return
  modelRoot.remove(model)
  model.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
  })
  const seen = new Set()
  for (const m of allMaterials) {
    for (const k of Object.keys(m)) {
      const v = m[k]
      if (v && v.isTexture && !seen.has(v)) {
        seen.add(v)
        disposeTexture(v)
      }
    }
    m.dispose()
  }
  allMaterials = new Set()
  textures = []
  parts = []
  rows = []
  if (chrome) {
    chrome.files.update(null)
    chrome.dims.update(null)
    extentText = ''
    chrome.view.setModel(null)
  }
  tree.reset() // nothing folded, no filter for the next model
  model = null
  selected = -1
  selObjs.clear()
  selPrimary = null
  selFrame.set(null)
  if (partCard) partCard.update() // no card without a model
}

function fail(text, notice = false) {
  disposeModel()
  setHasModel(false)
  setMsg(text, true)
  if (incoming.source !== 'editor') showStart(text, true) // a dropped or picked file that fails with nothing on screen: the drop page says why and takes the next file
  // a notice (a format that cannot be shown here) is not an error of the plugin: it goes to the log as a warning
  console[notice ? 'warn' : 'error'](`${PLUGIN_NAME}: ${text.split('\n')[0]}`)
  requestRender()
}

// ---------- decoding ----------
// Materials the viewer makes up for files that have none are marked: their gray is not data of the model (exports leave it out).
function generic(m) {
  m.userData.generic = true
  return m
}
function standardMaterial(hasColor) {
  return generic(new THREE.MeshStandardMaterial({ color: 0xc8ccd2, vertexColors: hasColor, roughness: 0.9, metalness: 0 }))
}

let isSplat = false // the file on screen is a Gaussian splat file (the compressed copy keeps only its colored points)
// A decoded splat file travels with its decoded object as obj.userData.splat: { bytes, type } for a PLY (the splat renderer reads it itself)
// or { mesh } for .splat/.spz (already read). finishLoad takes it; whoever drops the object disposes it (disposeObject).
function decodePly(buf) {
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096)))
  const loader = new PLYLoader()
  const shortfall = plyAsciiShortfall(buf)
  if (shortfall) fileNotes.push(t('ply_short', { declared: fmt(shortfall.declared), actual: fmt(shortfall.actual) })) // the file is cut off or its count lies: what is shown may be wrong
  const splat = hasSphericalHarmonicColor(head) // colors from f_dc_*
  if (splat) loader.setCustomPropertyNameMapping({ sh: ['f_dc_0', 'f_dc_1', 'f_dc_2'] })
  const geo = loader.parse(buf)
  // since r185 the loader keeps double fields as Float64Array, which WebGL cannot draw: all attributes become Float32
  for (const [name, a] of Object.entries(geo.attributes)) {
    if (a.array instanceof Float64Array) geo.setAttribute(name, new THREE.BufferAttribute(Float32Array.from(a.array), a.itemSize, a.normalized))
  }
  if (splat && geo.getAttribute('sh')) {
    // 3D Gaussian Splat file: the DC spherical-harmonic term is the base colour (C0 = 0.2820948).
    const sh = geo.getAttribute('sh')
    const col = new Float32Array(sh.count * 3)
    const c = new THREE.Color()
    const clamp = (v) => Math.min(1, Math.max(0, 0.5 + 0.2820948 * v))
    for (let i = 0; i < sh.count; i++) {
      c.setRGB(clamp(sh.getX(i)), clamp(sh.getY(i)), clamp(sh.getZ(i)), THREE.SRGBColorSpace)
      col[3 * i] = c.r
      col[3 * i + 1] = c.g
      col[3 * i + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.deleteAttribute('sh')
  }
  const hasColor = !!geo.getAttribute('color')
  const g = new THREE.Group()
  g.userData.isSplat = splat
  if (isGaussianSplatHeader(head)) g.userData.splat = { bytes: buf, type: 'ply' } // a real splat file: the splat renderer gets the bytes
  if (geo.index) {
    if (!geo.getAttribute('normal')) geo.computeVertexNormals()
    g.add(new THREE.Mesh(geo, standardMaterial(hasColor)))
  } else {
    const mat = generic(new THREE.PointsMaterial({ color: hasColor ? 0xffffff : 0x4a90d9, vertexColors: hasColor, size: state.pointSize, sizeAttenuation: false }))
    g.add(new THREE.Points(geo, mat))
  }
  return g
}

/** .splat and .spz hold nothing but Gaussian splats, so the splat renderer reads them; the points shown while it works (and in the
 *  "Points" display) are made from the splat centers and colors, which gives these files bounds, a fit and an export like a PLY cloud. */
async function decodeSplatFile(type, buf) {
  sparkApi ||= await import('./vendor/spark/spark.module.js')
  makeSpark()
  const mesh = new sparkApi.SplatMesh({ fileBytes: buf, fileType: type })
  try {
    let timer
    await Promise.race([mesh.initialized, new Promise((_, no) => (timer = setTimeout(() => no(new Error('the splat renderer did not answer')), 90_000)))]).finally(() => clearTimeout(timer))
    const n = mesh.packedSplats ? mesh.packedSplats.numSplats : 0
    if (!n) throw new Error(t('no_geometry'))
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    const lin = new THREE.Color()
    mesh.forEachSplat((i, c, _s, _q, _o, color) => {
      pos[3 * i] = c.x
      pos[3 * i + 1] = c.y
      pos[3 * i + 2] = c.z
      lin.setRGB(color.r, color.g, color.b, THREE.SRGBColorSpace) // the splat colors are sRGB; vertex colors are linear (as in the PLY path)
      col[3 * i] = lin.r
      col[3 * i + 1] = lin.g
      col[3 * i + 2] = lin.b
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const g = new THREE.Group()
    g.add(new THREE.Points(geo, generic(new THREE.PointsMaterial({ color: 0xffffff, vertexColors: true, size: state.pointSize, sizeAttenuation: false }))))
    g.userData.isSplat = true
    g.userData.splat = { mesh }
    return g
  } catch (e) {
    if (typeof mesh.dispose === 'function') mesh.dispose()
    throw e
  }
}

// PCD (the Point Cloud Library's format, ASCII or binary) through three.js' loader; the colors it reads are already linear.
async function decodePcd(buf) {
  const { PCDLoader } = await import('three/addons/loaders/PCDLoader.js')
  const pts = new PCDLoader().parse(buf)
  const geo = pts.geometry
  if (!geo.getAttribute('position') || geo.getAttribute('position').count === 0) throw plain(t('xyz_none'))
  const hasColor = !!geo.getAttribute('color')
  const g = new THREE.Group()
  g.add(new THREE.Points(geo, generic(new THREE.PointsMaterial({ color: hasColor ? 0xffffff : 0x4a90d9, vertexColors: hasColor, size: state.pointSize, sizeAttenuation: false }))))
  return g
}

// XYZ point text: read by formats.js
function decodeXyz(buf, text) {
  const r = parseXyz(text !== undefined ? text : new TextDecoder().decode(buf))
  if (!r.count) throw plain(t('xyz_none'))
  if (r.commaLines) fileNotes.push(t('xyz_comma', { n: fmt(r.commaLines) }))
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(r.positions, 3))
  if (r.colors) {
    const lin = new THREE.Color()
    for (let i = 0; i < r.count; i++) {
      lin.setRGB(r.colors[3 * i], r.colors[3 * i + 1], r.colors[3 * i + 2], THREE.SRGBColorSpace)
      r.colors[3 * i] = lin.r
      r.colors[3 * i + 1] = lin.g
      r.colors[3 * i + 2] = lin.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(r.colors, 3))
  }
  const g = new THREE.Group()
  g.add(new THREE.Points(geo, generic(new THREE.PointsMaterial({ color: r.colors ? 0xffffff : 0x4a90d9, vertexColors: !!r.colors, size: state.pointSize, sizeAttenuation: false }))))
  return g
}

// FBX through three.js' loader (loaded only for FBX files). Since r184 the loader turns a Z-up file to Y up itself, so the model is Y up
// when it comes out of it; the unit still has to be read from the file's settings.
// Pictures that are embedded work; pictures that the file only names (separate files) cannot be had by a plugin and are left out.
async function decodeFbx(buf) {
  const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js')
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => (/^(blob:|data:)/.test(url) ? url : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')) // a name of a separate file: nothing to fetch
  const g = new FBXLoader(manager).parse(buf, '')
  g.userData.animations = g.animations || []
  const s = fbxSettings(buf)
  const name = s.unitScale ? fbxUnitName(s.unitScale) : null
  g.userData.fileUnit = name ? { short: name, label: t('unit_fbx_file', { unit: name }) } : { short: 'cm', label: t('unit_fbx_guess'), assumed: true }
  if (s.unitScale && !name) fileNotes.push(t('fbx_unit_odd', { v: s.unitScale })) // the file names a unit scale that is none of the usual ones
  if (s.up === 'z') g.userData.fileUp = 'y' // the loader has already turned a Z-up file to Y up (turning it twice would lay it down); other files keep the person's choice
  return g
}

// G-code: the toolpath as two line parts, "Extrusion" (colored by height) and "Travel" (hidden at first)
async function decodeGcode(buf, text, seq) {
  const src = text !== undefined ? text : new TextDecoder().decode(buf)
  const r = await parseGcode(src, {
    maxSegments: GCODE_MAX_SEGMENTS,
    onProgress: (f) => seq === loadSeq && setMsg(t('gcode_reading', { pct: Math.floor(f * 100) })),
    shouldCancel: () => seq !== loadSeq
  })
  if (!r || seq !== loadSeq) throw plain('') // superseded: the caller drops the result
  if (!r.bounds) throw plain(t('gcode_none'))
  const g = new THREE.Group()
  const zLo = r.bounds.min[2]
  const zHi = r.bounds.max[2]
  const color = new THREE.Color()
  const add = (c, name, colored, hidden) => {
    if (!c.count) return
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(c.positions, 3))
    if (colored) {
      const col = new Float32Array(c.positions.length)
      for (let i = 0; i < c.count; i++) {
        const z = (c.positions[6 * i + 2] + c.positions[6 * i + 5]) / 2
        const f = zHi > zLo ? Math.min(1, Math.max(0, (z - zLo) / (zHi - zLo))) : 0.5
        color.setHSL(0.66 * (1 - f), 0.85, 0.5, THREE.SRGBColorSpace) // blue at the bed, red at the top
        for (let k = 0; k < 2; k++) col.set([color.r, color.g, color.b], 6 * i + 3 * k)
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    }
    const mat = generic(new THREE.LineBasicMaterial(colored ? { vertexColors: true } : { color: 0x8a94a3 }))
    const lines = new THREE.LineSegments(geo, mat)
    lines.name = name
    if (hidden) {
      lines.userData.startHidden = true
      // the travel from the origin to the print would stretch the model's bounds (and the fit, the grid, the section range) far beyond the print:
      // its box is the print's, and it is not culled by its own (too small) sphere
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(...r.bounds.min), new THREE.Vector3(...r.bounds.max))
      lines.frustumCulled = false
    }
    g.add(lines)
  }
  // a file that extrudes nothing (CNC, laser, plotter) is all travel: that part is the picture, not a hidden extra
  const onlyTravel = !r.ext.count
  add(r.ext, t('gcode_part_extrusion'), true, false)
  add(r.travel, t('gcode_part_travel'), onlyTravel, !onlyTravel)
  gcodeLayers = r.stats.layers
  const f = new Intl.NumberFormat(locale)
  fileNotes.push(t('gcode_info', { layers: f.format(r.stats.layers), ext: f.format(r.stats.extrusionSegments), trv: f.format(r.stats.travelSegments), fil: `${f.format(Math.round(r.stats.filamentMm / 10) / 100)} m` }))
  if (r.stats.truncated) fileNotes.push(t('gcode_truncated', { n: f.format(GCODE_MAX_SEGMENTS) }))
  if (r.stats.skippedArcs) fileNotes.push(t('gcode_arcs', { n: r.stats.skippedArcs }))
  return g
}

function decodeObj(buf, text) {
  const g = new OBJLoader().parse(text !== undefined ? text : new TextDecoder().decode(buf))
  let badFaces = 0
  g.traverse((o) => {
    if (o.isMesh && !o.geometry.index) {
      // a face that names a vertex that is not there gives NaN corners: those triangles go, the rest of the file stays
      const attrs = {}
      for (const [name, a] of Object.entries(o.geometry.attributes)) attrs[name] = { array: a.array, itemSize: a.itemSize }
      const r = dropBadTriangles(attrs)
      if (r.removed) {
        badFaces += r.removed
        for (const [name, a] of Object.entries(r.attrs)) o.geometry.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize))
        // the material groups count vertices: they follow the triangles that stayed
        const groups = o.geometry.groups.map((g) => ({ ...g }))
        o.geometry.clearGroups()
        let start = 0
        for (const g of groups) {
          let kept = 0
          for (let tri = g.start / 3; tri < (g.start + g.count) / 3; tri++) if (!r.bad[tri]) kept++
          if (kept) o.geometry.addGroup(start, kept * 3, g.materialIndex)
          start += kept * 3
        }
      }
    }
  })
  if (badFaces) fileNotes.push(t('obj_bad_faces', { n: fmt(badFaces) }))
  g.traverse((o) => {
    if (o.isMesh) {
      const hasColor = !!o.geometry.getAttribute('color')
      if (!o.geometry.getAttribute('normal')) o.geometry.computeVertexNormals()
      o.material = standardMaterial(hasColor)
    }
  })
  return g
}

function decodeStl(buf) {
  const geo = new STLLoader().parse(buf)
  const pos = geo.getAttribute('position')
  if (!pos || pos.count === 0) throw new Error(t('no_triangles'))
  const hasColor = !!geo.hasColors && !!geo.getAttribute('color')
  const mat = generic(new THREE.MeshStandardMaterial({ color: 0xb9c0cb, vertexColors: hasColor, roughness: 0.6, metalness: 0.1 }))
  const g = new THREE.Group()
  g.add(new THREE.Mesh(geo, mat))
  return g
}

// Turns the instances of a production-layout 3MF into three.js meshes: one geometry per unique mesh, one mesh per instance with its matrix.
function build3mfGroup(buf) {
  let pkg
  try {
    pkg = readPackage(buf)
  } catch (e) {
    throw new Error(['threemf_too_large', 'threemf_cyclic', 'threemf_no_model'].includes(e.message) ? t(e.message) : e.message)
  }
  if (pkg.missing.length) fileNotes.push(t('ext_missing', { n: pkg.missing.length }))
  if (pkg.stats.paint.painted + pkg.stats.paint.fine > 0) fileNotes.push(t('threemf_paint', { n: fmt(pkg.stats.paint.painted), k: fmt(pkg.stats.paint.fine) }))
  const group = new THREE.Group()
  const geos = new Map()
  const mats = new Map()
  const material = (hex, vertexColors) => {
    const k = `${hex}|${vertexColors}`
    if (!mats.has(k)) {
      const m = new THREE.MeshStandardMaterial({ color: vertexColors ? 0xffffff : hex ?? 0xc8ccd2, vertexColors, roughness: 0.65, metalness: 0.05 })
      if (hex == null && !vertexColors) generic(m)
      mats.set(k, m)
    }
    return mats.get(k)
  }
  for (const inst of pkg.instances) {
    const m = pkg.meshes.get(inst.key)
    const gkey = m.triColors ? `${inst.key}|${inst.color}` : inst.key // a multi-color mesh bakes its default color in
    let g = geos.get(gkey)
    if (!g) {
      g = new THREE.BufferGeometry()
      if (m.triColors) {
        // a mesh with several colors: unshared vertices, one color per triangle (the default color where a triangle has none)
        const n = m.idx.length
        const pos = new Float32Array(n * 3)
        const col = new Float32Array(n * 3)
        const base = new THREE.Color(inst.color ?? 0xc8ccd2)
        const c = new THREE.Color()
        for (let tri = 0; tri < n / 3; tri++) {
          const hex = m.triColors.get(tri)
          if (hex != null) c.set(hex)
          else c.copy(base)
          for (let k = 0; k < 3; k++) {
            const vi = m.idx[tri * 3 + k] * 3
            pos.set([m.pos[vi], m.pos[vi + 1], m.pos[vi + 2]], (tri * 3 + k) * 3)
            col.set([c.r, c.g, c.b], (tri * 3 + k) * 3)
          }
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      } else {
        g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3))
        g.setIndex(new THREE.BufferAttribute(m.idx, 1))
      }
      g.computeVertexNormals()
      geos.set(gkey, g)
    }
    const mesh = new THREE.Mesh(g, material(inst.color, !!m.triColors))
    mesh.name = inst.label
    mesh.matrixAutoUpdate = false
    mesh.matrix.fromArray(inst.matrix)
    mesh.matrixWorldNeedsUpdate = true // since r185 updateWorldMatrix() only recomputes what is flagged
    group.add(mesh)
  }
  return group
}

// An error whose text is the whole message for the person (not a "cannot be read" with a reason after it).
const plain = (message) => Object.assign(new Error(message), { plain: true })

// GLB and .gltf: a .gltf is first packed into a GLB in memory (buffers and pictures from data: URIs or from the files dropped with it), so one
// loader path serves both. The Draco decoder is loaded only for a file that says it needs it.
// `nb` is what came with a dropped .gltf: { files: Map from the path below the dropped folder (or just the name) to a File, dir, used }.
async function decodeGltf(type, buf, text, nb) {
  let glb = buf
  if (type === 'gltf') {
    let json
    try {
      json = JSON.parse((text !== undefined ? text : new TextDecoder().decode(buf)).replace(/^\uFEFF/, ''))
    } catch {
      throw plain(t('gltf_bad_json'))
    }
    const have = new Map()
    const found = []
    for (const e of gltfExternalUris(json)) {
      const f = nb && findNeighbor(nb.files, nb.dir, e.uri)
      if (f) found.push([e.uri, f])
    }
    const bytes = found.reduce((a, [, f]) => a + f.size, 0)
    if (bytes > HARD_MAX_BYTES) throw plain(t('too_big', { size: fmtMB(bytes), max: fmtMB(HARD_MAX_BYTES) }))
    for (const [uri, f] of found) {
      have.set(uri, new Uint8Array(await f.arrayBuffer()))
      nb.used++
    }
    try {
      const r = gltfToGlb(json, (uri) => have.get(uri) || null)
      glb = r.glb
      if (r.missingImages.length) fileNotes.push(t('gltf_missing_images', { n: r.missingImages.length, list: r.missingImages.slice(0, 4).join(', ') }))
    } catch (e) {
      if (e.message === 'gltf_missing_files') throw plain(t('gltf_missing_files', { n: e.missing.length, list: e.missing.slice(0, 4).join(', ') }))
      if (e.message === 'gltf_short_buffer') throw plain(t('gltf_short_buffer', { name: e.uri }))
      if (e.message === 'gltf_too_big') throw plain(t('too_big', { size: fmtMB(e.bytes), max: fmtMB(2 ** 32 - 1) }))
      throw e
    }
  }
  const needs = gltfNeeds(readGlbJson(glb))
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const done = []
  try {
    if (needs.draco) {
      const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js')
      const d = new DRACOLoader()
      d.setDecoderPath('./vendor/addons/libs/draco/gltf/')
      loader.setDRACOLoader(d)
      done.push(() => d.dispose())
    }
    if (needs.ktx2) {
      // the Basis decoder builds functions at run time, which Orca's plugin frames forbid: the model is shown without those textures
      const r = stripBasisu(glb)
      glb = r.glb
      if (r.dropped) fileNotes.push(t('ktx2_blocked', { n: r.dropped })) // a texture with a PNG or JPEG fallback just uses that
    }
    return await new Promise((resolve, reject) =>
      loader.parse(
        glb,
        '',
        (g) => {
          g.scene.userData.animations = g.animations || [] // travels with this decode, not in a global
          resolve(g.scene)
        },
        reject
      )
    )
  } finally {
    for (const f of done) f()
  }
}

async function decodeBuffer(type, buf, text, nb, seq) {
  if (type === 'glb' || type === 'gltf') return decodeGltf(type, buf, text, nb)
  if (type === 'pcd') return decodePcd(buf)
  if (type === 'xyz') return decodeXyz(buf, text)
  if (type === 'fbx') return decodeFbx(buf)
  if (type === 'gcode') return decodeGcode(buf, text, seq)
  if (type === 'ply') return decodePly(buf)
  if (type === 'splat' || type === 'spz') return decodeSplatFile(type, buf)
  if (type === 'obj') return decodeObj(buf, text)
  if (type === 'stl') return decodeStl(buf)
  if (type === '3mf') {
    const info = inspect3mf(buf, t) // before the loader: its unit and what it cannot draw
    unit = info.unit
    fileNotes = info.notes
    if (info.external) return build3mfGroup(buf) // meshes in separate model files (Bambu Studio, Orca Slicer, ...)
    return new ThreeMFLoader().parse(buf)
  }
  throw new Error(t('unsupported', { type }))
}

function unitFor(type) {
  if (type === 'glb' || type === 'gltf') return { short: 'm', label: t('unit_gltf') }
  if (type === 'gcode') return { short: 'mm', label: t('unit_gcode') }
  if (type === 'stl') return { short: t('unit_short_stl'), label: t('unit_stl') }
  return { short: 'm', label: t('unit_unknown'), assumed: true } // PLY and OBJ do not say: meters are assumed for the numbers
}

function collectParts(root) {
  const found = []
  root.traverse((o) => {
    const geo = o.geometry
    if (!geo || !geo.getAttribute('position')) return
    const kind = o.isMesh ? 'mesh' : o.isPoints ? 'points' : o.isLine ? 'lines' : null
    if (!kind) return
    const pos = geo.getAttribute('position')
    const path = []
    for (let a = o.parent; a && a !== root; a = a.parent) if (a.name) path.unshift({ id: a.uuid, name: a.name }) // the named groups above, outermost first: the scene tree of the list
    const m0 = Array.isArray(o.material) ? o.material[0] : o.material
    found.push({
      obj: o,
      kind,
      name: o.name || '',
      path,
      matName: (m0 && m0.name) || '',
      label: '',
      verts: pos.count,
      tris: kind === 'mesh' ? Math.floor((geo.index ? geo.index.count : pos.count) / 3) : 0,
      orig: o.material,
      tint: null,
      visible: !(o.userData && o.userData.startHidden)
    })
    if (o.userData && o.userData.startHidden) o.visible = false
  })
  const prefix = { mesh: t('part_mesh'), points: t('part_points'), lines: t('part_lines') }
  const counts = new Map()
  for (const p of found) counts.set(p.name, (counts.get(p.name) || 0) + 1)
  found.forEach((p, i) => {
    const plain = p.name !== '' && counts.get(p.name) === 1
    p.label = plain ? p.name : `${prefix[p.kind]} ${i + 1}${p.name ? ' · ' + p.name : ''}`
  })
  return found
}

function gatherMaterials() {
  allMaterials = new Set([...shading.shared, ...shading.flatSet])
  for (const p of parts) if (p.fade) allMaterials.add(p.fade.mat)
  for (const p of parts) {
    const mats = Array.isArray(p.orig) ? p.orig : [p.orig]
    mats.forEach((m) => m && allMaterials.add(m))
    if (p.tint) allMaterials.add(p.tint)
  }
  // the model's own textures: from its materials, not from the view's helper materials (the matcap picture of the shading is not the model's)
  const tex = new Set()
  for (const p of parts) {
    for (const m of Array.isArray(p.orig) ? p.orig : [p.orig]) {
      if (!m) continue
      for (const k of Object.keys(m)) {
        const v = m[k]
        if (v && v.isTexture) tex.add(v)
      }
      if (m.userData && m.userData.map0 && m.userData.map0.isTexture) tex.add(m.userData.map0) // the texture switch is off: the map is parked here
    }
  }
  textures = [...tex]
}

// What is being opened now: set by onDocument (Orca) and openFiles (drop, picker) before load(), and only committed (currentName,
// loadSource, fileInfo, unit) when the file really replaces the view, so a failed drop leaves the model on screen untouched.
let incoming = { name: '', source: 'editor' }

// A load that fails: a file opened by drop or picker keeps the current model and says why; an editor document that fails shows the error.
function reject(text, snap) {
  if (incoming.source !== 'editor' && model) {
    if (snap) {
      unit = snap.unit
      fileNotes = snap.fileNotes
    }
    console.error(`${PLUGIN_NAME}: ${text.split('\n')[0]}`)
    showStart(text, true)
    setStateAttr('ok')
    return
  }
  fail(text)
}

// `text` is given for OBJ files that arrive as text: the string goes straight to the parser, without an encode/decode round trip.
let curExt = '' // the type of the file shown
let gcodeLayers = 0 // the number of layers of the G-code file shown
async function load(type, buf, seq, text, nb) {
  curExt = type
  gcodeLayers = 0 // the layers of the file before are of no use
  state.clip.axis = ''
  $('sec-axis').value = ''
  const size = text !== undefined ? text.length : buf.byteLength // characters, which equals bytes for the ASCII that OBJ files are
  const info = { bytes: size, type, name: incoming.name }
  const snap = { unit, fileNotes }
  if (type === 'usdz') {
    // the notice says what the file holds: nearly every USDZ keeps its scene as binary USD (.usdc), which no library available here reads
    const binaryUsd = zipNames(buf).some((n) => /\.usdc$/i.test(n))
    const text = t(binaryUsd ? 'usdz_usdc' : 'usdz', { size: fmtMB(size) })
    if (incoming.source !== 'editor' && model) {
      showStart(text, false) // a notice, the model stays
      return
    }
    fail(text, true)
    $('msg').className = 'msg' // a notice, not an error
    if (incoming.source !== 'editor') showStart(text, false)
    setStateAttr('notice')
    return
  }
  if (size === 0) return reject(t('empty'), snap)
  setMsg(t('loading', { type: type.toUpperCase(), size: fmtMB(size) }))
  setStateAttr('loading')
  await nextFrame()
  fileNotes = []
  unit = unitFor(type)
  if (type === 'glb') {
    const b = glbBudget(buf)
    if (b && (b.textureBytes > BUDGET_TEXTURE_BYTES || b.tris > BUDGET_TRIANGLES)) fileNotes.push(t('budget_note', { tex: fmtMB(b.textureBytes), n: b.images.length, tris: fmt(b.tris) }))
  }
  const t0 = performance.now()
  let obj
  try {
    obj = await decodeBuffer(type, buf, text, nb, seq)
  } catch (e) {
    if (seq !== loadSeq) return // a newer version of the file arrived meanwhile
    let why = e && e.message ? String(e.message).slice(0, 300) : String(e)
    if (!(e && e.plain)) {
      console.error(`${PLUGIN_NAME}: ${type} ${why}`) // the raw message stays in the log
      if (/allocation failed|out of memory/i.test(why) || (e instanceof RangeError && /array length|buffer length/i.test(why) && size > 5e7)) why = t('why_memory')
      else if (e instanceof TypeError) why = t('why_damaged') // a raw JavaScript message says nothing to a person
    }
    if (e && e.plain) return reject(why, snap)
    if (/DRACO/i.test(why)) why = t('glb_draco', { why })
    return reject(`${t('cannot_read', { type: type.toUpperCase(), size: fmtMB(size) })}\n${why}`, snap)
  }
  if (seq !== loadSeq) {
    disposeObject(obj) // a newer version arrived while this one was decoding
    return
  }
  try {
    finishLoad(obj, type, t0, info, snap)
  } catch (e) {
    if (obj.userData && obj.userData.splat && obj.userData.splat.mesh && typeof obj.userData.splat.mesh.dispose === 'function') obj.userData.splat.mesh.dispose()
    let why = e && e.message ? String(e.message).slice(0, 300) : String(e)
    console.error(`${PLUGIN_NAME}: ${type} ${why}`)
    if (/allocation failed|out of memory/i.test(why)) why = t('why_memory')
    else if (e instanceof TypeError) why = t('why_damaged')
    fail(`${t('cannot_read', { type: type.toUpperCase(), size: fmtMB(size) })}\n${why}`)
  }
}

function finishLoad(obj, type, t0, info, snap) {
  // Check the new file BEFORE the old model goes away.
  const probe = collectParts(obj)
  if (probe.length === 0) {
    disposeObject(obj)
    return reject(t('no_geometry'), snap)
  }
  const bb = new THREE.Box3()
  for (const p of probe) {
    if (!p.obj.geometry.boundingBox) p.obj.geometry.computeBoundingBox()
    bb.union(p.obj.geometry.boundingBox)
    if (p.obj.isSkinnedMesh) {
      // a damaged skin (joints that point at nodes that are not there) makes three.js throw when it draws the mesh: give the mesh the
      // bounds of its geometry instead, so a broken file shows its bind pose
      try {
        p.obj.computeBoundingSphere()
      } catch {
        p.obj.geometry.computeBoundingSphere()
        p.obj.boundingSphere = p.obj.geometry.boundingSphere.clone()
        p.obj.frustumCulled = false
      }
    }
  }
  if (bb.isEmpty() || ![bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].every(Number.isFinite)) {
    disposeObject(obj)
    return reject(t('bad_coords'), snap)
  }
  // A file the user opened is a new subject: fit the camera. A reload of the same editor document keeps the view.
  const prevView = firstFrame || incoming.source !== 'editor' ? null : { pos: camera.position.clone(), target: controls.target.clone() }
  disposeModel()
  fileInfo = info
  currentName = incoming.name
  loadSource = incoming.source
  model = obj
  modelRoot.add(model)
  parts = probe
  if (obj.userData.fileUnit) unit = obj.userData.fileUnit // FBX: from the file's own settings
  // an axis the file names beats the choice remembered for the format (files differ); a remembered choice beats the format's usual axis
  if (!state.upTouched) state.up = obj.userData.fileUp || (prefs.up && prefs.up[type]) || defaultUp(type)
  $('up').value = state.up
  gatherMaterials()
  applyUp()
  fitBounds()
  if (!Number.isFinite(diag) || boundsBox.isEmpty() || ![size.x, size.y, size.z, center.x, center.y, center.z].every(Number.isFinite)) {
    return fail(t('bad_coords'))
  }
  applyMaterialFlags()
  buildHelpers()
  if (prevView) {
    camera.position.copy(prevView.pos)
    controls.target.copy(prevView.target)
    controls.update()
  } else {
    resetView()
    firstFrame = false
  }
  lastLoadMs = performance.now() - docStart
  heavy = parts.reduce((a, p) => a + (p.kind === 'points' ? p.verts / 4 : p.tris), 0) > 500_000
  applyMaterials() // a reload keeps "Color by part", shading and the section
  updateClip()
  setupAnimation()
  applyTextureLimit()
  hideStart()
  buildStats(lastLoadMs)
  logState()
  buildPartList()
  setHasModel(true)
  updateDisplayButtons()
  $('ts-row').hidden = textures.length === 0
  $('pt-sec').hidden = !parts.some((p) => p.kind === 'points')
  hideMsg()
  isSplat = !!obj.userData.isSplat
  if (obj.userData.splat) {
    const sf = obj.userData.splat
    obj.userData.splat = null
    startSplat(sf) // asynchronous: the points are shown until the splats are ready
  }
  checkInfo = null
  explodeBase = null // a new model is not pulled apart
  explodeFactor = 0
  $('explode').value = '0'
  syncPartOpacity()
  if (toolsUi) toolsUi.modelChanged() // a new file: the old working copy is gone
  if (partCard) partCard.invalidate()
  invalidateExport()
  requestRender()
}

// ---------- orientation, bounds, helpers ----------
function applyUp() {
  modelRoot.rotation.set(0, 0, 0)
  if (state.up === '-y') modelRoot.rotation.x = Math.PI
  else if (state.up === 'z') modelRoot.rotation.x = -Math.PI / 2
  modelRoot.updateMatrixWorld(true)
  $('up-hint').textContent = t(state.up === '-y' ? 'hint_negy' : state.up === 'z' ? 'hint_z' : 'hint_y')
}

function fitBounds() {
  if (studioUi) studioUi.studio.spin.stop() // bounds are measured with the model standing still
  modelRoot.updateMatrixWorld(true)
  boundsBox = new THREE.Box3()
  for (const p of parts) {
    p.obj.updateWorldMatrix(true, false)
    const g = p.obj.geometry
    if (!g.boundingBox) g.computeBoundingBox()
    boundsBox.union(g.boundingBox.clone().applyMatrix4(p.obj.matrixWorld))
  }
  boundsBox.getSize(size)
  boundsBox.getCenter(center)
  diag = Math.max(size.length(), 1e-6)
  const inv = modelRoot.matrixWorld.clone().invert()
  const fb = new THREE.Box3()
  for (const p of parts) fb.union(p.obj.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(p.obj.matrixWorld)))
  fb.getSize(fileSize)
}

let gridObj = null
let axesObj = null
let boxObj = null
let gridStep = 1
function buildHelpers() {
  for (const o of [gridObj, axesObj, boxObj]) {
    if (o) {
      helpers.remove(o)
      o.geometry?.dispose()
      o.material?.dispose()
    }
  }
  const horiz = Math.max(size.x, size.z, diag * 0.1)
  gridStep = niceStep(horiz * 1.5)
  const cells = Math.min(200, Math.max(4, Math.ceil((horiz * 1.6) / gridStep / 2) * 2))
  gridObj = new THREE.GridHelper(cells * gridStep, cells, 0x888888, 0x888888)
  gridObj.position.set(center.x, boundsBox.min.y, center.z)
  gridObj.material.transparent = true
  gridObj.material.opacity = 0.35
  axesObj = new THREE.AxesHelper(diag * 0.12)
  axesObj.material.depthTest = false
  axesObj.renderOrder = 10
  boxObj = new THREE.Box3Helper(boundsBox, 0xe0a030)
  helpers.add(gridObj, axesObj, boxObj)
  applyHelperFlags()
  const far = diag * 40
  camera.near = Math.max(diag / 4000, 1e-6)
  camera.far = far
  camera.updateProjectionMatrix()
  controls.maxDistance = far * 0.8
  controls.minDistance = diag / 2000
  if (studioUi) studioUi.refresh() // floor level, lights and shadows follow the model
}

function applyHelperFlags() {
  if (gridObj) gridObj.visible = state.grid
  if (axesObj) axesObj.visible = state.axes
  if (boxObj) boxObj.visible = state.box
  const dark = bgModel.dark()
  bgModel.apply()
  if (gridObj) gridObj.material.color.set(dark ? 0x6b7078 : 0x8b9098)
  $('b-grid').setAttribute('aria-pressed', String(state.grid))
  $('b-axes').setAttribute('aria-pressed', String(state.axes))
  $('b-box').setAttribute('aria-pressed', String(state.box))
}

/** "Default" in the Appearance menu: the looks and helpers go back to the standard values (not the view, not the studio, not the section). */
function resetAppearance() {
  if (!model) return
  const d = defaultState()
  state.tex = d.tex
  state.tint = d.tint
  $('l-color').setAttribute('aria-pressed', 'false')
  applyView({ grid: d.grid, axes: d.axes, box: d.box, over: d.over, back: d.back, shading: d.shading, opacity: d.opacity, pointSize: d.pointSize })
  state.texMax = 0
  $('texsize').value = '0'
  applyTextureLimit()
  applyTint()
  applyMaterialFlags()
  if (chrome) chrome.syncLook()
}

function resetView() {
  applyPreset('iso') // the start view: everything, seen from the corner
}

// ---------- details ----------
let checkInfo = null // watertight, volume and surface from the mesh check (looked up in the background after a load, or by "Check mesh")
function checkRows() {
  if (!checkInfo) return []
  const u = unit.short
  const rows = [[t('row_watertight'), checkInfo.watertight ? t('yes') : t('no')]]
  if (checkInfo.watertight && checkInfo.volume != null) rows.push([t('row_volume'), F.vol(checkInfo.volume, u)])
  if (checkInfo.area) rows.push([t('row_area'), F.area(checkInfo.area, u)])
  if (checkInfo.inverted) rows.push([t('row_normals'), t('val_inward')])
  return rows
}
/** Where a row of the Info card comes from: the file says it, the viewer's own setting, or it is worked out from the mesh (the default). */
function statSource(label) {
  const FILE = [t('s_name'), t('s_size'), t('s_texture')] // what the file itself says
  const DERIVED = [t('s_extent'), t('s_triangles'), t('s_vertices'), t('s_points'), t('s_height'), t('s_grid'), t('s_texmem'), t('s_load'), t('row_watertight'), t('row_volume'), t('row_area'), t('row_normals')] // worked out from the mesh or measured while loading
  const UI = [t('s_unit')] // a setting or a name of the viewer, no quantity of the file
  if (FILE.includes(label)) return 'file'
  if (DERIVED.includes(label)) return 'derived'
  if (UI.includes(label)) return 'ui'
  console.error(`info card: no origin declared for the row "${label}"`) // a new row must be added to one of the three lists; there is no default
  return 'ui'
}
/** The card Files (one row): what the file says (name, format, size, a unit it names) and where the unit comes from. */
function updateFilesCard() {
  if (!chrome) return
  if (!(model || isSplat) || !fileInfo.type) return chrome.files.update(null)
  chrome.files.update({
    name: fileInfo.name || fileInfo.type.toUpperCase(),
    nameSrc: fileInfo.name ? 'file' : 'ui',
    format: fileInfo.type.toUpperCase(),
    size: fmtMB(fileInfo.bytes),
    unit: unit.short,
    unitSrc: unitSource()
  })
}
function unitSource() {
  return unit && unit.assumed !== undefined ? (unit.assumed ? 'assumed' : 'file') : model && model.userData && model.userData.fileUnit ? 'file' : 'assumed'
}
function buildStats(ms) {
  const { tris, verts, pts } = summarizeParts(parts)
  const rows = statsRows({
    t, fmt, fmtMB, fmtLen, dur: F.dur, tris, verts, pts, partCount: parts.length, fileInfo, unit, size: fileSize, bounds: boundsBox, gridStep,
    checks: checkRows(), textures: textures.map((tx) => ({ w: tx.image && tx.image.width, h: tx.image && tx.image.height })), ms,
  })
  const dl = $('stats')
  dl.replaceChildren()
  $('stats-more').replaceChildren()
  const advanced = new Set([t('s_load'), t('s_texmem'), t('s_texture'), t('s_grid'), t('s_unit')]) // load time, texture memory, the unit's name (the unit itself is set in its own row): one level down
  extentText = (rows.find((r) => r[0] === t('s_extent')) || [])[1] || ''
  if (chrome) chrome.dims.update({ x: fmtLen(fileSize.x), y: fmtLen(fileSize.y), z: fmtLen(fileSize.z), unit: unit.short, unitSrc: unitSource() }) // the size is the row X, Y, Z at the top of the card, not a line of the list
  for (const [k, v] of rows) {
    if (k === t('s_extent')) continue
    const dt = document.createElement('dt')
    dt.textContent = k
    const dd = document.createElement('dd')
    dd.textContent = v
    dd.title = v // the full value for anything the panel has to cut
    dd.dataset.src = statSource(k) // where the number comes from (cards.js): the Info card is part of the honesty check
    if (k === t('s_name')) dd.className = 'ell' // a file name stays on one line with an ellipsis
    ;(advanced.has(k) ? $('stats-more') : dl).append(dt, dd)
  }
  $('stats-adv').hidden = $('stats-more').children.length === 0
  updateFilesCard()
  if (chrome) chrome.view.setModel({ tris, points: isSplat ? 0 : pts, parts: curExt === 'gcode' ? 0 : parts.length, partsSrc: parts.some((p) => p.name) ? 'file' : 'derived', unit: unit.short, unitSrc: unitSource() }) // a toolpath's two parts and the points of a splat's reduced copy are the viewer's own: not shown as the file's
  const warn = [...fileNotes]
  if (tris > WARN_TRIS) warn.push(t('warn_big_mesh', { n: fmt(tris) }))
  if (pts > WARN_POINTS) warn.push(t('warn_many_points', { n: fmt(pts) }))
  const w = $('warn')
  w.hidden = warn.length === 0
  w.replaceChildren(...warn.map((text) => Object.assign(document.createElement('div'), { textContent: text })))
}

// ---------- the display buttons say what they do ----------
// "Surface | Mesh": one button, its label is the state, its tooltip names what a click does. A model without textures has no Texture button; with
// textures it only works in the looks that show them (Original, Flat), so in the others it is off and says why.
let displaySig = ''
/** What controlsState needs to know about the file shown. */
function controlsInput() {
  const kinds = new Set(parts.map((p) => p.kind))
  const kind = !model ? 'none' : isSplat ? 'splat' : kinds.has('mesh') ? 'mesh' : kinds.has('points') ? 'points' : kinds.has('lines') ? 'lines' : 'none'
  return {
    kind: kind === 'lines' && curExt === 'gcode' ? 'gcode' : kind,
    partCount: parts.length,
    hasTextures: textures.length > 0,
    hasVertexColors: parts.some((p) => p.obj.geometry && p.obj.geometry.getAttribute('color')),
    hasAnimation: actions.length > 0,
    shading: state.shading,
    studioActive: !!(studioUi && studioUi.isActive()),
    selection: selObjs.size
  }
}
function updateDisplayButtons() {
  const inp = controlsInput()
  const c = controlsState(inp)
  if ($('sec-sec')) $('sec-sec').hidden = !c.clip.visible // G-code has the layer slider instead
  syncLayerRow()
  if (chrome) chrome.setFileKind(inp.kind) // which 3D formats the export offers
  if (chrome) chrome.update(c, { hasModel: !!model, measurable: parts.some((p) => p.kind === 'mesh'), kind: inp.kind, studioActive: !!(studioUi && studioUi.isActive()), selectedName: selected >= 0 && parts[selected] ? parts[selected].label : null })
  syncMeasureBar()
  const wire = $('b-wire')
  wire.hidden = !!model && !c.surface.visible // point clouds, splats and G-code have no surface to switch
  $('b-over').hidden = wire.hidden
  wire.textContent = t(state.wire ? 'mesh' : 'surface')
  wire.title = t(state.wire ? 'tip_surface_on' : 'tip_mesh_on')
  const tex = $('b-tex')
  tex.hidden = !!model && !c.texture.visible
  tex.disabled = !model || !c.texture.enabled
  tex.title = c.texture.reason ? t(c.texture.reason) : t('tip_texture')
  const tint = $('l-color')
  tint.disabled = !c.tint.enabled
  tint.title = c.tint.reason ? t(c.tint.reason) : t('tip_color_by_part')
  const sig = `${wire.hidden}|${wire.textContent}|${tex.hidden}`
  if (sig !== displaySig) {
    displaySig = sig
    shell.layout() // a button came, went or changed its label (not on every slider tick)
  }
}

// ---------- material flags ----------
function syncMeshOver() {
  meshOver.setClip(state.clip.axis ? [clipPlane3] : null)
  meshOver.setSuppressed(state.wire) // the mesh view already shows the lines
  meshOver.setOpacity(state.opacity)
  meshOver.set(state.over)
  $('b-over').setAttribute('aria-pressed', String(state.over))
  requestRender()
}
function applyMaterialFlags() {
  for (const m of allMaterials) {
    if ('wireframe' in m) m.wireframe = state.wire // (a matcap material only has the property since three.js r181: e2e-ux checks the mesh in every look)
    if (m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshNormalMaterial || m.isMeshMatcapMaterial) {
      if (m.userData.map0 === undefined) m.userData.map0 = m.map || null
      if (m.userData.side0 === undefined) m.userData.side0 = m.side
      const side = m.userData.keepSide ? m.side : state.back ? THREE.DoubleSide : THREE.FrontSide
      const map = state.tex ? m.userData.map0 : null
      if (m.side !== side || m.map !== map) {
        // only a changed side or texture needs a new shader; sliders (opacity, section, point size) must stay cheap
        m.side = side
        m.map = map
        m.needsUpdate = true
      }
    }
    if (m.isPointsMaterial) m.size = state.pointSize
    if (m.userData.o === undefined) m.userData.o = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite }
    const o = m.userData.o
    m.transparent = o.transparent || state.opacity < 1
    m.opacity = o.opacity * state.opacity
    m.depthWrite = state.opacity < 1 ? false : o.depthWrite
    m.clippingPlanes = state.clip.axis ? [clipPlane3] : null
    // with the mesh lines over it the surface sits a little behind them, so they do not flicker (an offset the file's own material has stays)
    if (m.userData.po0 === undefined) m.userData.po0 = { on: m.polygonOffset, f: m.polygonOffsetFactor, u: m.polygonOffsetUnits }
    const po = m.userData.po0
    m.polygonOffset = state.over || po.on
    m.polygonOffsetFactor = state.over ? Math.max(1, po.f) : po.f
    m.polygonOffsetUnits = state.over ? Math.max(1, po.u) : po.u
  }
  syncMeshOver()
  $('b-wire').setAttribute('aria-pressed', String(state.wire))
  $('b-tex').setAttribute('aria-pressed', String(state.tex))
  updateDisplayButtons()
  $('b-back').setAttribute('aria-pressed', String(state.back))
  requestRender()
}

// ---------- parts list ----------
function partColor(i) {
  return new THREE.Color().setHSL(partHue(i), 0.62, 0.55, THREE.SRGBColorSpace)
}

function materialFor(p, i) {
  if (p.kind !== 'mesh') return p.orig // points and lines keep their own look
  const sh = shading.forPart(state.shading, p, (m) => allMaterials.add(m))
  if (sh) return sh
  if (!state.tint) return p.orig
  if (!p.tint) {
    const base = Array.isArray(p.orig) ? p.orig[0] : p.orig
    p.tint = base.clone()
    p.tint.vertexColors = false
    p.tint.map = null
    p.tint.userData = { map0: null, o: base.userData.o ? { ...base.userData.o } : undefined } // the clone starts from the original, not the faded values
    p.tint.color.copy(partColor(i))
    allMaterials.add(p.tint)
  }
  return p.tint
}

function applyMaterials() {
  parts.forEach((p, i) => {
    p.obj.material = fadeMaterial(p, materialFor(p, i))
  })
  applyMaterialFlags()
  buildPartList()
}
function applyTint() {
  applyMaterials()
}

function swatchColor(p) {
  if (state.tint && p.tint) return '#' + p.tint.color.getHexString(THREE.SRGBColorSpace)
  const col = p.obj.geometry.getAttribute('color')
  if (col && col.count) {
    // one vertex is enough for flat-coloured parts
    const k = Math.floor(col.count / 2)
    return '#' + new THREE.Color(col.getX(k), col.getY(k), col.getZ(k)).getHexString(THREE.SRGBColorSpace)
  }
  const m = Array.isArray(p.orig) ? p.orig[0] : p.orig
  return m && m.color ? '#' + m.color.getHexString(THREE.SRGBColorSpace) : '#999999'
}

// the part tree (part-tree-ui.js, the same in both viewers): the scene's named groups are rows with a fold button, the parts are the rows below; the selection stays in `selObjs`
let rows = []
const tree = createPartTree({
  t,
  fmt,
  host: $('parts'),
  filter: $('filter'),
  count: $('part-count'),
  note: () => $('parts-note'),
  getRows: () => rows,
  getPart: (k) => parts[k],
  swatch: (r) => swatchColor(parts[r.meshes[0]]),
  // the filter looks at the name, the material's name and the color (#rrggbb) of each part
  searchText: (r) => (r.group ? r.name : `${r.name} ${parts[r.meshes[0]].matName} ${swatchColor(parts[r.meshes[0]])}`),
  nameSrc: (r) => (r.src || (parts[r.meshes[0]].name ? 'file' : 'ui')), // a part the file did not name is "Mesh 3": the viewer's own word
  selected: () => new Set(selectedIndices()),
  onVisible: (i, on) => {
    for (const k of rows[i].meshes) {
      parts[k].visible = on
      parts[k].obj.visible = on
    }
    invalidateExport()
    requestRender()
  },
  onSelect: (i, mode) => selectParts(rows[i].meshes, false, mode),
  onIsolate: (i) => {
    const keep = new Set(rows[i].meshes)
    setAllVisible((_, k) => keep.has(k))
    selectParts(rows[i].meshes, false)
  },
  isMulti: () => multiSelect
})

function buildPartList() {
  rows = rowsFromPaths(parts.map((p) => ({ label: p.label, named: !!p.name && p.label === p.name, path: p.path })))
  $('part-sec').hidden = parts.length < 2
  const partsOpt = $('measure-mode').querySelector('option[value="parts"]')
  partsOpt.hidden = parts.length < 2
  if (parts.length < 2 && state.measureMode === 'parts') {
    state.measureMode = 'distance'
    $('measure-mode').value = 'distance'
  }
  if (parts.length < 2) return
  tree.render()
}

function setAllVisible(fn) {
  parts.forEach((p, i) => {
    p.visible = fn(p, i)
    p.obj.visible = p.visible
  })
  invalidateExport()
  buildPartList()
  requestRender()
}

$('l-all').onclick = () => setAllVisible(() => true)
$('l-none').onclick = () => setAllVisible(() => false)
$('l-inv').onclick = () => setAllVisible((p) => !p.visible)
$('l-color').onclick = () => {
  state.tint = !state.tint
  $('l-color').setAttribute('aria-pressed', String(state.tint))
  applyTint()
}

/**
 * Select parts. mode 'replace': this part only (the same part again clears); 'toggle': add it or take it out (Ctrl or Cmd click);
 * 'range': from the main part to this one, in list order (Shift click in the list). i = -1 clears.
 */
function selectPart(i, scroll, mode = 'replace') {
  selectParts(i < 0 || !parts[i] ? [] : [i], scroll, mode)
}
/** The same for several parts at once (a group row of the tree stands for all the parts below it): 'replace' (the same set again clears), 'toggle' (all in: take them out, else add them), 'range'. */
function selectParts(list, scroll, mode = 'replace') {
  const objs = list.filter((k) => parts[k]).map((k) => parts[k].obj)
  if (!objs.length) {
    selObjs.clear()
    selPrimary = null
  } else if (mode === 'toggle') {
    const all = objs.every((o) => selObjs.has(o))
    for (const o of objs) {
      if (all) selObjs.delete(o)
      else selObjs.add(o)
    }
    if (all) {
      if (objs.includes(selPrimary)) selPrimary = selObjs.size ? [...selObjs][selObjs.size - 1] : null
    } else selPrimary = objs[0]
  } else if (mode === 'range' && selPrimary) {
    const from = parts.findIndex((p) => p.obj === selPrimary)
    const lo = list.reduce((a, k) => Math.min(a, k), from < 0 ? Infinity : from)
    const hi = list.reduce((a, k) => Math.max(a, k), from < 0 ? -Infinity : from)
    for (let k = lo; k <= hi; k++) if (parts[k]) selObjs.add(parts[k].obj)
  } else if (selObjs.size === objs.length && objs.every((o) => selObjs.has(o)) && !scroll) {
    selObjs.clear() // the only selected set again: gone
    selPrimary = null
  } else {
    selObjs.clear()
    for (const o of objs) selObjs.add(o)
    selPrimary = objs[0]
  }
  syncSelection(scroll)
}
/** After the selection (or the part list) changed: the main index, the frame, the list and the card. */
function syncSelection(scroll) {
  if (selObjs.size) {
    const live = new Set(parts.map((p) => p.obj))
    for (const o of [...selObjs]) if (!live.has(o)) selObjs.delete(o) // a part that is gone
  }
  if (selPrimary && !selObjs.has(selPrimary)) selPrimary = selObjs.size ? [...selObjs][selObjs.size - 1] : null
  selected = selPrimary ? parts.findIndex((p) => p.obj === selPrimary) : -1
  refreshSelectionFrame()
  tree.updateSelection()
  syncPartOpacity()
  if (scroll && selected >= 0) {
    const row = rows.findIndex((r) => !r.group && r.meshes[0] === selected)
    if (row >= 0) tree.reveal(row) // unfolds the groups above it and scrolls
  }
  if (partCard) partCard.update()
  updateDisplayButtons() // the info tab names the selection
  requestRender()
}
const selectedIndices = () => parts.map((p, i) => (selObjs.has(p.obj) ? i : -1)).filter((i) => i >= 0)
function selectionBoxOf(objs) {
  const want = new Set(objs)
  const box = new THREE.Box3()
  for (const p of parts) {
    if (!want.has(p.obj)) continue
    p.obj.updateWorldMatrix(true, false)
    if (!p.obj.geometry.boundingBox) p.obj.geometry.computeBoundingBox()
    box.union(p.obj.geometry.boundingBox.clone().applyMatrix4(p.obj.matrixWorld))
  }
  return box
}
const selectionBox3 = () => selectionBoxOf([...selObjs])
function refreshSelectionFrame() {
  selFrame.set(selObjs.size ? selectionBox3() : null) // a dashed blue box around everything selected
}

// A click in the view picks a part (a drag is an orbit, not a pick).
const ray = new THREE.Raycaster()
// A ray ignores clipping planes: skip hits on the cut-away side so measuring and picking only see what is drawn.
function pickHit(objs) {
  const hits = ray.intersectObjects(objs, false)
  return state.clip.axis ? hits.find((h) => clipPlane3.distanceToPoint(h.point) >= 0) : hits[0]
}
let down = null
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() }
})
canvas.addEventListener('pointerup', (e) => {
  if (!down || !model) return
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
  const quick = performance.now() - down.t < 500
  down = null
  if (moved > 4 || !quick || e.button !== 0) return
  if (!state.measure && parts.length < 2) return
  const r = canvas.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)), camera)
  const meshes = parts.filter((p) => p.kind === 'mesh' && p.visible).map((p) => p.obj)
  const hit = pickHit(meshes)
  if (state.measure) {
    if (hit) measure.add(hit)
    return
  }
  const k = hit ? parts.findIndex((p) => p.obj === hit.object) : -1
  if (multiSelect && k < 0) return // a click on nothing does not clear while choosing several
  selectPart(k, true, e.metaKey || e.ctrlKey || e.shiftKey || multiSelect ? 'toggle' : 'replace')
})

// ---------- explode, part opacity, fit, isolate ----------
// Explode moves every part away from the middle of the model: a view only, the export always writes the parts where they belong.
let explodeBase = null // part object -> { matrix, auto, center } as the model was before it was pulled apart
let explodeFactor = 0
function setExplode(f) {
  explodeFactor = f
  if (!model || !parts.length) return
  if (!explodeBase) {
    if (f === 0) return
    explodeBase = new Map()
    modelRoot.updateMatrixWorld(true)
    for (const p of parts) {
      const g = p.obj.geometry
      if (!g.boundingBox) g.computeBoundingBox()
      explodeBase.set(p.obj, { matrix: p.obj.matrix.clone(), auto: p.obj.matrixAutoUpdate, position: p.obj.position.clone(), center: g.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(p.obj.matrixWorld) })
    }
  }
  const mid = new THREE.Vector3()
  for (const p of parts) mid.add(explodeBase.get(p.obj)?.center || new THREE.Vector3())
  mid.divideScalar(Math.max(1, parts.length))
  for (const p of parts) {
    const b = explodeBase.get(p.obj)
    if (!b) continue
    const off = b.center.clone().sub(mid).multiplyScalar(f * 1.2)
    const parent = p.obj.parent
    parent.updateWorldMatrix(true, false)
    const local = parent.worldToLocal(b.center.clone().add(off)).sub(parent.worldToLocal(b.center.clone()))
    if (b.auto) p.obj.position.copy(b.position).add(local)
    else p.obj.matrix.copy(b.matrix).premultiply(new THREE.Matrix4().makeTranslation(local.x, local.y, local.z))
    p.obj.matrixWorldNeedsUpdate = true
  }
  if (f === 0) explodeBase = null
  modelRoot.updateMatrixWorld(true)
  // the measurements were taken on the parts where they were: while the parts are pulled apart they are hidden, not wrong
  if (f > 0) measure.cancelDraft()
  measure.setSuspended(f > 0)
  if (selObjs.size) refreshSelectionFrame() // the frame follows the moved parts
  if (partCard) partCard.invalidate() // centres and distances were of the parts before they moved
  requestRender()
}
$('explode').oninput = (e) => setExplode(Number(e.target.value) / 100)
// what is written to a file never has the parts pulled apart
async function unexploded(fn) {
  const f = explodeFactor
  const m = model
  if (f) setExplode(0)
  try {
    return await fn()
  } finally {
    if (f && model === m) setExplode(f) // not for a model that replaced this one meanwhile
  }
}
function collapseExplode() {
  if (!explodeFactor) return
  $('explode').value = '0'
  setExplode(0)
}

// One part can be made see-through (a clone of its material), also under "Color by part" and the shadings.
function fadeMaterial(p, m) {
  if (p.opacity === undefined || p.opacity >= 1 || Array.isArray(m)) return m // a part with several materials keeps them
  if (!p.fade || p.fade.base !== m || p.fade.opacity !== p.opacity) {
    if (p.fade) {
      allMaterials.delete(p.fade.mat)
      p.fade.mat.dispose()
    }
    const keep = m.userData
    m.userData = {} // clone() serializes userData, and ours holds textures
    const c = m.clone()
    m.userData = keep
    if (keep.map0 !== undefined) c.map = keep.map0 // the texture as the file had it, whatever the "Texture" switch says now
    c.transparent = true
    c.opacity = p.opacity
    c.depthWrite = false
    allMaterials.add(c)
    p.fade = { base: m, mat: c, opacity: p.opacity }
  }
  return p.fade.mat
}
function syncPartOpacity() {
  const p = parts[selected]
  const slider = $('part-opacity')
  slider.disabled = !p || p.kind !== 'mesh'
  const v = p && p.opacity !== undefined ? Math.round(p.opacity * 100) : 100
  slider.value = String(v)
  $('part-opacity-out').textContent = String(v)
}
$('part-opacity').oninput = (e) => {
  const p = parts[selected]
  if (!p) return
  p.opacity = Number(e.target.value) / 100
  $('part-opacity-out').textContent = e.target.value
  p.obj.material = fadeMaterial(p, materialFor(p, selected))
  applyMaterialFlags()
}

// F: fit the view to the selected part, or to everything; a double-click on a part selects it and fits.
function fitView() {
  if (!model) return
  if (!selObjs.size) return resetView()
  modelRoot.updateMatrixWorld(true)
  const box = selectionBox3()
  const c = box.getCenter(new THREE.Vector3())
  const d = Math.max(box.getSize(new THREE.Vector3()).length(), diag * 0.02) * 1.3
  const dir = camera.position.clone().sub(controls.target).normalize()
  controls.target.copy(c)
  camera.position.copy(c).addScaledVector(dir, d)
  controls.update()
  requestRender()
}
canvas.addEventListener('dblclick', (e) => {
  if (!model || state.measure) return
  const r = canvas.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)), camera)
  const hit = pickHit(parts.filter((p) => p.kind === 'mesh' && p.visible).map((p) => p.obj))
  if (hit && !multiSelect) selectPart(parts.findIndex((p) => p.obj === hit.object), true) // choosing several: a double-click does not turn the choice into one part
  fitView()
})
// I: show only the selected part; Shift+I: show all again
function isolateSelected(all) {
  if (!parts.length) return
  if (all || !selObjs.size) setAllVisible(() => true)
  else setAllVisible((p) => selObjs.has(p.obj))
}

// ---------- animation (glTF clips) ----------
function stopAnimation() {
  playing = false
  if (mixer) {
    mixer.stopAllAction()
    if (model) mixer.uncacheRoot(model)
  }
  mixer = null
  actions = []
  $('anim-sec').hidden = true
}

function setupAnimation() {
  const clips = (model && model.userData.animations) || []
  stopAnimation()
  if (!clips.length) return
  mixer = new THREE.AnimationMixer(model)
  actions = clips.map((c) => mixer.clipAction(c))
  const sel = $('anim-clip')
  sel.replaceChildren(...clips.map((c, i) => Object.assign(document.createElement('option'), { value: String(i), textContent: c.name || `${t('anim_clip')} ${i + 1}` })))
  selectClip(0)
  $('b-play').textContent = t('anim_play')
  $('anim-sec').hidden = false
}

function selectClip(i) {
  if (!mixer) return
  mixer.stopAllAction()
  actions[i].reset().play()
  mixer.update(0) // the first pose, paused until Play
  requestRender()
}

function tick(now) {
  if (!playing || !mixer) return
  mixer.update(Math.min((now - lastFrameTime) / 1000, 0.1))
  lastFrameTime = now
  if (!glLost) {
    renderer.render(scene, camera)
    viewFrame()
  }
  requestAnimationFrame(tick)
}
$('b-play').onclick = () => {
  if (!mixer) return
  playing = !playing
  $('b-play').textContent = t(playing ? 'anim_pause' : 'anim_play')
  if (playing) {
    lastFrameTime = performance.now()
    requestAnimationFrame(tick)
  }
}
$('anim-clip').onchange = (e) => selectClip(Number(e.target.value))

// ---------- section plane ----------
function updateClip() {
  const c = state.clip
  $('sec-pos').disabled = !c.axis
  $('sec-flip').disabled = !c.axis
  if (c.axis && model) {
    // the axes are the file's own: map them through the "up is" rotation
    const m = fileAxisToView(c.axis, state.up)
    const tt = m.sign < 0 ? 1 - c.t : c.t
    const pl = clipPlane(m.axis, tt, [boundsBox.min.x, boundsBox.min.y, boundsBox.min.z], [boundsBox.max.x, boundsBox.max.y, boundsBox.max.z], m.sign < 0 ? !c.flip : c.flip)
    clipPlane3.set(new THREE.Vector3(...pl.normal), pl.constant)
  }
  syncLayerRow()
  applyMaterialFlags()
}
// G-code: the layers tab. "Up to layer n / N" is the section along Z that keeps what lies below, and the travel moves can be shown.
let layerRow = null
function initLayerRow() {
layerRow = document.createElement('div')
layerRow.id = 'layer-row'
layerRow.hidden = true
layerRow.className = 'sec-plain'
layerRow.style.padding = '8px 10px'
layerRow.innerHTML = '<label class="row"><span id="layer-text"></span> <input id="layer-pos" type="range" min="1" max="1" step="1" value="1"></label><label class="row"><input id="layer-travel" type="checkbox"> <span id="layer-travel-text"></span></label>'
$('tp-cut').prepend(layerRow)
$('layer-travel-text').textContent = t('layer_travel')
$('layer-pos').oninput = (e) => {
  const n = Number(e.target.value)
  if (n >= gcodeLayers) {
    state.clip.axis = ''
    $('sec-axis').value = ''
  } else {
    state.clip.axis = 'z'
    state.clip.flip = fileAxisToView('z', state.up).sign >= 0 // keeps what lies below the plane (the up axis may run the other way)
    state.clip.t = n / gcodeLayers
    $('sec-axis').value = 'z'
    $('sec-flip').checked = state.clip.flip
  }
  updateClip()
}
$('layer-travel').onchange = (e) => {
  const travel = parts.find((p) => p.label === t('gcode_part_travel'))
  if (!travel) return
  travel.visible = e.target.checked
  travel.obj.visible = travel.visible
  invalidateExport()
  buildPartList()
  requestRender()
}
}
function syncLayerRow() {
  if (!layerRow) return
  const g = curExt === 'gcode' && !!model && gcodeLayers > 0
  layerRow.hidden = !g
  if (!g) return
  const pos = $('layer-pos')
  pos.max = String(gcodeLayers)
  const n = Math.min(gcodeLayers, Math.max(1, Math.round(state.clip.axis === 'z' ? state.clip.t * gcodeLayers : gcodeLayers)))
  pos.value = String(n)
  $('layer-text').textContent = t('layer_upto', { n, total: gcodeLayers })
  const travel = parts.find((p) => p.label === t('gcode_part_travel'))
  $('layer-travel').checked = !!(travel && travel.visible)
  $('layer-travel').disabled = !travel
}
$('sec-axis').onchange = (e) => {
  state.clip.axis = e.target.value
  updateClip()
}
$('sec-pos').oninput = (e) => {
  state.clip.t = Number(e.target.value) / 100
  updateClip()
}
$('sec-flip').onchange = (e) => {
  state.clip.flip = e.target.checked
  updateClip()
}

// ---------- appearance ----------
$('shading').onchange = (e) => {
  state.shading = e.target.value
  applyMaterials()
  updateDisplayButtons()
  scheduleViewSave()
}
$('opacity').oninput = (e) => {
  state.opacity = Number(e.target.value) / 100
  $('opacity-out').textContent = e.target.value
  applyMaterialFlags()
}

// Large texture atlases can be shown smaller: a 8192 x 4096 texture takes about 180 MB of GPU memory with mipmaps.
let texJob = 0
async function applyTextureLimit() {
  const job = ++texJob
  const max = state.texMax
  for (const tx of textures) {
    const cur = tx.image
    if (!cur || !cur.width) continue
    if (!tx.userData.full) tx.userData.full = cur
    const full = tx.userData.full
    const target = textureTarget(full.width, full.height, max)
    if (!target.scaled) {
      if (tx.image !== full) {
        if (tx.image.close) tx.image.close()
        tx.image = full
        tx.dispose() // three keeps the old storage size: drop it so the next render allocates the right one
        tx.needsUpdate = true
      }
      continue
    }
    if (tx.image !== full && tx.image.width === target.w) continue
    try {
      const bmp = await createImageBitmap(full, { resizeWidth: target.w, resizeHeight: target.h, resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      if (job !== texJob || !model) {
        bmp.close()
        return
      }
      if (tx.image !== full && tx.image.close) tx.image.close()
      tx.image = bmp
      tx.dispose()
      tx.needsUpdate = true
    } catch {
      // keep the full-size texture when it cannot be resized
    }
  }
  if (model) {
    buildStats(lastLoadMs)
    requestRender()
  }
}
$('texsize').onchange = (e) => {
  state.texMax = Number(e.target.value)
  applyTextureLimit()
}

// ---------- measuring ----------
// The tool itself (markers, lines, the modes) is shared/measure-three.js; here: where its text goes and what clears it.
state.measureMode = 'distance'
function showMeasureText(lines, isHint = true) {
  const out = $('measure-out')
  out.hidden = false
  out.className = isHint && lines.length <= 2 ? 'chip hint' : 'chip'
  out.replaceChildren(...lines.map((text) => Object.assign(document.createElement('div'), { textContent: text })))
}
let measureTab = null
const measure = createMeasure({
  t,
  locale,
  modelRoot,
  camera,
  canvas,
  stage: $('stage'),
  onChange: () => {
    if (measureTab) measureTab.render()
    syncMeasureBar()
  },
  getDiag: () => diag,
  unitShort: () => unit.short,
  fmtLen,
  showText: showMeasureText,
  hide: () => {
    $('measure-out').hidden = true
  },
  requestRender: () => renderer && requestRender(),
  getMode: () => state.measureMode,
  isOn: () => state.measure,
  // mode "parts": the middle of a part's box, and the smallest distance between two parts (a worker)
  partCentre: (o) => selectionBoxOf([o]).getCenter(new THREE.Vector3()),
  partsDistance: (a, b) => {
    const pa = parts.find((p) => p.obj === a)
    const pb = parts.find((p) => p.obj === b)
    return pa && pb ? S.partDistance(toolsAdapter, pa, pb) : Promise.resolve(null)
  }
})
/** The unfinished measurement is dropped; the finished ones stay (they are in the Measure tab). */
function clearMeasure() {
  measure.cancelDraft()
  if (state.measure && parts.length && !parts.some((p) => p.kind === 'mesh')) showMeasureText([t('measure_no_surface')], true)
}
/** A chain with two or more points is kept as it is when measuring ends or the way to measure changes; anything else unfinished is dropped. */
function endDraft() {
  const d = measure.draft()
  if (d && d.kind === 'chain' && d.count >= 2) measure.finishChain(false)
  else clearMeasure()
}
function syncMeasureBar() {
  const d = measure.draft()
  if (chrome) chrome.measureBar.sync({ on: state.measure, mode: state.measureMode, partsOk: parts.length >= 2, chainCount: d && d.kind === 'chain' ? d.count : 0 })
}
function setMeasure(on) {
  if (!on) endDraft()
  state.measure = on
  syncMeasureBar()
  $('b-measure').setAttribute('aria-pressed', String(on))
  canvas.style.cursor = on ? 'crosshair' : ''
  clearMeasure()
}
$('b-measure').onclick = () => setMeasure(!state.measure)
$('measure-mode').onchange = (e) => {
  if (state.measure) endDraft()
  state.measureMode = e.target.value
  if (state.measure) clearMeasure()
  else setMeasure(true) // choosing a way to measure starts measuring
  syncMeasureBar()
}

// ---------- export a copy ----------
// The section of the side panel is shared with the STEP viewer (shared/export-ui.js, set up below); this file says how this viewer's
// parts become files. The original is never touched.
function flash(text) {
  setMsg(text)
  setTimeout(() => {
    if (model && $('msg-text').textContent === text) hideMsg() // not when something newer is showing
  }, 3500)
}
async function saveBytes(name, mime, bytes) {
  const data = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer
  return orca.host.call('files.saveAs', { suggestedName: name, mimeType: mime, data })
}
let exportUi = null
let toolsUi = null
const invalidateExport = () => {
  if (exportUi) exportUi.invalidate()
  if (studioUi) studioUi.studio.dirty() // parts shown, hidden or moved: the shadow is drawn again
}
function exportCounts(only) {
  let tris = 0
  let verts = 0
  let points = 0
  let textured = 0
  let pointParts = 0
  for (const p of parts) {
    if (only && !p.visible) continue
    if (p.kind === 'mesh') {
      tris += p.tris
      verts += p.verts
    } else if (p.kind === 'points') {
      points += p.verts
      pointParts++
    }
    const m = Array.isArray(p.orig) ? p.orig[0] : p.orig
    if (m && m.map) textured++
  }
  // memory the decoded textures need (width x height x 4 bytes), for the compressor's memory check
  const texBytes = textures.reduce((acc, tx) => acc + (tx.image && tx.image.width ? textureBytes(tx.image.width, tx.image.height) : 0), 0)
  return { tris, verts, points, textured, pointParts, texBytes }
}
async function buildMeshCopy(fmt, { only, target, scale = 1 }) {
  if (fmt === 'glb') {
    gatherMaterials()
    return exportGlb({ model, parts, modelRoot, visibleOnly: only, fileUp: state.up, target, textures, scale })
  }
  const { parts: ps } = collectExportParts(parts, modelRoot, { visibleOnly: only, fileUp: state.up, target })
  if (['stl', '3mf'].includes(fmt) && !ps.some((p) => p.kind === 'mesh' && triangleCount(p) > 0)) throw new Error('none')
  if (fmt === 'stl') return writeSTL(ps)
  if (fmt === 'obj') return writeOBJ(ps)
  if (fmt === 'ply') return writePLY(ps)
  return write3MF(ps, { unit: unit.short })
}
// "GLB, compressed": the plain GLB is written here (by GLTFExporter when there are textures, animations or skins, else straight from the
// parts' arrays) and compressed in a worker.
async function buildCompressedCopy({ only, target, scale = 1, opts, onProgress, setCancel, isCancelled }) {
  // a glTF file keeps its materials, extensions, skins and animations through the exporter; the other formats only have colors, so
  // their arrays are written directly (faster, and the page holds less memory)
  const needsExporter = fileInfo.type === 'glb' || fileInfo.type === 'gltf' || parts.some((p) => {
    const m = Array.isArray(p.orig) ? p.orig[0] : p.orig
    return (m && m.map) || p.obj.isSkinnedMesh
  }) || ((model.userData && model.userData.animations) || []).length > 0
  const transfer = []
  let payload
  if (needsExporter) {
    gatherMaterials()
    const glb = await exportGlb({ model, parts, modelRoot, visibleOnly: only, fileUp: state.up, target, textures, scale })
    transfer.push(glb.buffer)
    payload = { glb, opts }
  } else {
    const { parts: ps } = collectExportParts(parts, modelRoot, { visibleOnly: only, fileUp: state.up, target, withNormals: true, scale })
    for (const p of ps) for (const k of ['positions', 'indices', 'normals', 'colors']) if (p[k]) transfer.push(p[k].buffer)
    payload = { parts: ps, opts }
  }
  if (isCancelled()) throw new Error('cancelled') // cancelled while the plain copy was being written
  const task = runTask('compress', payload, { transfer, onProgress })
  setCancel(() => task.cancel())
  return task.promise
}
// "Copy details": the rows of the Details section as text.
$('b-copy-details').onclick = () => {
  const rows = [...document.querySelectorAll('#stats dt')].map((dt) => [dt.textContent, dt.nextElementSibling ? dt.nextElementSibling.textContent : ''])
  if (extentText) rows.splice(rows.findIndex((r) => r[0] === t('s_name')) + 1, 0, [t('s_extent'), extentText]) // after the name (as the list was), the card shows the three numbers on top
  flash(copyText(detailsText(`${PLUGIN_NAME} ${t('stats')}`, rows)) ? t('copied') : t('copy_failed'))
}
// The quick path: the current view as a PNG, as it is shown (with the background), saved straight away.
$('b-shot').onclick = async () => {
  if (!model || glLost) return
  try {
    const r = await renderPng({ renderer, scene, camera, canvas, helpers, size: 0, transparent: false, overlay: measure })
    await saveBytes(suggestName(currentName, 'png'), 'image/png', r.bytes)
  } catch {
    flash(t('save_failed'))
  }
}

// ---------- preset views ----------
function applyPreset(name) {
  if (!model) return
  // every view fits the whole model (distance from the size, target in the middle), so it works from wherever the camera is
  const d = fitDistance(diag / 2, camera.fov, camera.aspect) * presetScale(name)
  camera.position.copy(center).addScaledVector(new THREE.Vector3(...presetDirection(name)), d)
  controls.target.copy(center)
  controls.update()
  requestRender()
}
/** The cube's edges and corners: the same fit as a preset view, looking from the given direction (a vector from the model towards the camera). */
function lookFrom(dir) {
  if (!model) return
  const d = fitDistance(diag / 2, camera.fov, camera.aspect)
  camera.position.copy(center).addScaledVector(new THREE.Vector3(...dir).normalize(), d)
  controls.target.copy(center)
  controls.update()
  requestRender()
}
$('preset').onchange = (e) => {
  if (e.target.value === 'all') resetView()
  else applyPreset(e.target.value)
  e.target.value = ''
}
// ---------- toolbar ----------
function toggle(key, after) {
  state[key] = !state[key]
  after()
  scheduleViewSave()
}
const redrawHelpers = () => {
  applyHelperFlags()
  requestRender()
}
// Background: one mode (look, orca, light, dark, white, gradient, transparent), remembered; it works in every look and shading.
function themeDark() {
  return document.documentElement.classList.contains('dark')
}
function effectiveDark() {
  return bgModel.dark()
}
function refreshBg() {
  const label = `${t('background')}: ${t('ch_bg_' + bgModel.mode)}`
  $('b-bg').textContent = label
  $('b-bg').setAttribute('aria-label', label)
  applyHelperFlags()
  if (chrome) chrome.syncBackground(bgModel.mode, !!(studioUi && studioUi.isActive()), bgModel.color)
  requestRender()
  shell.layout() // the label changed length
}
function setBackground(mode, color) {
  bgModel.set(mode, color)
  prefs = withBg(prefs, mode, bgModel.color)
  savePrefs()
  refreshBg()
}
/** Key B: the next background, named (the list in the Studio menu shows and sets the same mode). */
function cycleBackground() {
  const next = nextBgMode(bgModel.mode)
  setBackground(next)
  flash(t('ch_bg_now', { name: t('ch_bg_' + next) }))
}
$('b-bg').onclick = cycleBackground
$('b-resetprefs').onclick = () => {
  shell.reset()
  prefs = resetPrefs()
  savePrefs()
  bgModel.set('look')
  if (studioUi) {
    studioUi.reset()
    lastPreset = studioUi.studio.state.preset
    if (syncLooks) syncLooks()
  }
  // the switches too (they are not stored, but "reset all" means all): back to the standard values, the view of the file again
  const d = defaultState()
  state.tex = d.tex
  state.tint = d.tint
  state.texMax = 0
  $('texsize').value = '0'
  $('l-color').setAttribute('aria-pressed', 'false')
  if (model) {
    state.clip.axis = ''
    $('sec-axis').value = ''
    updateClip()
    collapseExplode()
    clearMeasure()
    selectPart(-1, false)
    applyTextureLimit()
    applyView({ wire: d.wire, grid: d.grid, axes: d.axes, box: d.box, over: d.over, back: d.back, shading: d.shading, opacity: d.opacity, pointSize: d.pointSize })
    applyTint()
    resetView()
    scheduleViewSave() // the remembered view is overwritten with the standard one
  } else Object.assign(state, { wire: d.wire, grid: d.grid, axes: d.axes, box: d.box, over: d.over, back: d.back, shading: d.shading, opacity: d.opacity, pointSize: d.pointSize })
  refreshBg()
}
$('b-wire').onclick = () => toggle('wire', applyMaterialFlags)
$('b-tex').onclick = () => toggle('tex', applyMaterialFlags)
$('b-back').onclick = () => toggle('back', applyMaterialFlags)
$('b-grid').onclick = () => toggle('grid', redrawHelpers)
$('b-axes').onclick = () => toggle('axes', redrawHelpers)
$('b-box').onclick = () => toggle('box', redrawHelpers)
$('b-over').onclick = () => toggle('over', applyMaterialFlags)
$('up').onchange = (e) => {
  collapseExplode() // its base positions are in the old orientation
  state.up = e.target.value
  state.upTouched = true
  prefs.up = { ...(prefs.up || {}), [fileInfo.type]: state.up }
  savePrefs()
  if (!model) return
  applyUp()
  fitBounds()
  buildHelpers()
  resetView()
  updateClip()
  clearMeasure()
  buildStats(lastLoadMs)
  invalidateExport()
}
$('pt').oninput = (e) => {
  state.pointSize = Number(e.target.value)
  $('pt-out').textContent = String(state.pointSize)
  applyMaterialFlags()
}
// What each key does (the keys themselves are the table in shared/keymap.js; an action this viewer does not have is not listed)
const zoomBy = (k) => {
  if (!model) return
  camera.position.lerp(controls.target, k)
  controls.update()
  requestRender()
}
const click = (id) => {
  const b = $(id)
  if (b && !b.hidden && !b.disabled) b.click()
}
const KEY_ACTIONS = {
  zoom_in: () => zoomBy(0.18),
  zoom_out: () => zoomBy(-0.18),
  view_iso: () => applyPreset('iso'),
  view_front: () => applyPreset('front'),
  view_back: () => applyPreset('back'),
  view_left: () => applyPreset('left'),
  view_right: () => applyPreset('right'),
  view_top: () => applyPreset('top'),
  view_bottom: () => applyPreset('bottom'),
  view_hero: () => applyPreset('hero'),
  view_all: () => resetView(),
  measure: () => click('b-measure'),
  studio: () => {
    if (!model) return
    studioUi.toggle()
    if (studioUi.isActive()) chrome.popovers.open('studio')
    else chrome.popovers.close(false)
  },
  export: () => {
    click('b-export')
    // the section puts the focus on its format list (for a click on the toolbar button); after the key E the other shortcuts must keep working
    if (document.activeElement && document.activeElement.tagName === 'SELECT') document.activeElement.blur()
  },
  escape: () => {
    if (shell.closePopover()) return // an open popover (More) closes first
    if (chrome.closeExport()) return // then the export dialog
    if (chrome.closeKeys()) return // and the list of shortcuts
    if (!$('drop').hidden && model) hideStart()
    else if (state.measure) setMeasure(false)
    else if (selObjs.size) selectPart(-1, false)
  },
  fit_selected: () => fitView(),
  isolate: (a) => isolateSelected(a.shift),
  texture: () => click('b-tex'),
  mesh: () => click('b-wire'),
  grid: () => click('b-grid'),
  background: () => cycleBackground(),
  panel: () => click('b-panel')
}
window.addEventListener('keydown', (e) => {
  if (confirmOpen()) return // a question is open: its own keys only
  const a = keyAction(e)
  if (a && KEY_ACTIONS[a.action]) KEY_ACTIONS[a.action](a)
})
// follow Orca's light/dark theme until the user picks a background
orca.on('theme', () => {
  refreshBg()
  chrome.view.redraw() // the cube's colours are the theme's
}) // also while another background is on: the swatch of Orca in the Studio menu shows the colour of the theme

// ---------- the last dropped file comes back ----------
// Orca builds a panel's frame anew when the panel is shown again (right sidebar closed and opened, another panel in front), so the file
// the person dropped or chose is kept in this frame's IndexedDB (nothing leaves the computer) and restored when the frame starts without a
// document, together with the camera and the display switches. One file at a time; the next one replaces it; "Forget it" deletes it.
console.warn(`${PLUGIN_NAME}-boot ${JSON.stringify({ surface: typeof orca.document === 'object' && orca.document ? 'editor' : 'panel' })}`) // frame starts, readable in `orca plugin logs`
const sessionStore = createSessionStore()
let keptMeta = null
let keptNote = ''
let pendingView = null
function refreshKeep() {
  const text = keptMeta ? t('keep_note', { name: keptMeta.name, size: fmtMB(keptMeta.size) }) : keptNote
  $('keep-row').hidden = !text
  $('keep-text').textContent = text
}
sessionStore.info().then((i) => {
  if (i) keptMeta = i.meta
  refreshKeep()
})
async function rememberFile(name, bytes, type) {
  keptNote = ''
  const kept = await sessionStore.keep(name, bytes, type)
  if (kept && !model) {
    await sessionStore.forget() // the model was closed while this was being written: it must not come back
    return
  }
  if (kept) keptMeta = { name, size: bytes.byteLength, type }
  else {
    keptMeta = null
    if (bytes.byteLength > KEEP_MAX_BYTES) {
      keptNote = t('keep_too_big', { size: fmtMB(bytes.byteLength) })
      sessionStore.forget() // what was kept is not what is on screen any more
    }
  }
  refreshKeep()
}
let viewTimer = 0
function viewState() {
  return { pos: camera.position.toArray(), target: controls.target.toArray(), up: state.up, wire: state.wire, grid: state.grid, axes: state.axes, box: state.box, over: state.over, back: state.back, shading: state.shading, opacity: state.opacity, pointSize: state.pointSize }
}
function scheduleViewSave() {
  if (!keptMeta) return
  clearTimeout(viewTimer)
  viewTimer = setTimeout(() => keptMeta && model && sessionStore.keepView(viewState()), 600)
}
function applyView(v) {
  if (!v || !model) return
  if (['y', '-y', 'z'].includes(v.up) && v.up !== state.up) {
    state.up = v.up
    state.upTouched = true
    $('up').value = v.up
    applyUp()
    fitBounds()
    buildHelpers()
    updateClip()
  }
  for (const k of ['wire', 'grid', 'axes', 'box', 'over', 'back']) if (typeof v[k] === 'boolean') state[k] = v[k]
  if (['original', 'solid', 'normals', 'xray', 'matcap', 'flat', 'vertex'].includes(v.shading)) {
    state.shading = v.shading
    $('shading').value = v.shading
  }
  if (Number.isFinite(v.opacity)) {
    state.opacity = Math.min(1, Math.max(0.1, v.opacity))
    $('opacity').value = String(Math.round(state.opacity * 100))
    $('opacity-out').textContent = $('opacity').value
  }
  if (Number.isFinite(v.pointSize)) {
    state.pointSize = v.pointSize
    $('pt').value = String(v.pointSize)
    $('pt-out').textContent = String(v.pointSize)
  }
  applyMaterials()
  applyHelperFlags()
  if (Array.isArray(v.pos) && v.pos.length === 3 && v.pos.every(Number.isFinite) && Array.isArray(v.target) && v.target.length === 3 && v.target.every(Number.isFinite)) {
    camera.position.fromArray(v.pos)
    controls.target.fromArray(v.target)
    controls.update()
  }
  requestRender()
}
let restoreTried = false
// The start page, or, when this frame has no document and a file was kept, that file.
async function startOrRestore() {
  if (restoreTried || model) return model ? undefined : showStart()
  restoreTried = true
  const rec = await sessionStore.load()
  if (!rec || model || incoming.source !== 'editor') {
    if (!model) showStart()
    return
  }
  const seq = ++loadSeq
  docStart = performance.now()
  hideStart()
  setMsg(t('loading', { type: extOf(rec.meta.name).toUpperCase(), size: fmtMB(rec.meta.size) }))
  setStateAttr('loading')
  incoming = { name: rec.meta.name, source: 'restore' }
  pendingView = rec.view
  await load(extOf(rec.meta.name), rec.bytes, seq)
  if (seq === loadSeq && model) {
    applyView(pendingView)
    flash(t('keep_restored', { name: rec.meta.name }))
  }
  pendingView = null
}
controls.addEventListener('end', scheduleViewSave)
window.addEventListener('pagehide', () => keptMeta && model && sessionStore.keepView(viewState()))
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && keptMeta && model && sessionStore.keepView(viewState()))

// ---------- close the model ----------
// Back to the start page: the scene is emptied (GPU memory freed), the kept "last file" is forgotten. Always asked first, with a dialog the page
// draws itself (window.confirm may be blocked in a sandboxed frame); the text says more when something would be lost. Escape cancels, the focus
// starts on "Cancel". In an editor tab the file of the tab is not touched: the start page then takes another file.
function hasUnexportedChanges() {
  return !!((toolsUi && toolsUi.hasChanges()) || state.clip.axis || measure.count() > 0 || explodeFactor > 0)
}
async function closeModel() {
  loadSeq++ // a file that is still being read is dropped
  pendingFile = null // and a "load anyway?" question is void
  pendingList = []
  if (studioUi) studioUi.studio.spin.stop()
  collapseExplode()
  disposeModel()
  checkInfo = null
  isSplat = false
  currentName = ''
  fileInfo = { bytes: 0, type: '' }
  fileNotes = []
  explodeBase = null
  state.clip.axis = ''
  $('sec-axis').value = '' // the section goes with the model
  for (const o of [gridObj, axesObj, boxObj]) {
    // the floor grid, axes and box belong to the model too
    if (o) {
      helpers.remove(o)
      o.geometry?.dispose()
      o.material?.dispose()
    }
  }
  gridObj = axesObj = boxObj = null
  if (toolsUi) toolsUi.modelChanged()
  invalidateExport()
  setHasModel(false)
  updateDisplayButtons()
  $('b-load-cancel').hidden = true
  $('b-load-cancel').onclick = null
  firstFrame = true // the next model is fitted, not shown from the camera of this one
  showStart()
  requestRender()
  try {
    await sessionStore.forget()
  } catch {
    // the start page is up all the same
  }
  keptMeta = null
  keptNote = ''
  refreshKeep()
}
$('b-close').onclick = async () => {
  if (!model) return
  const asked = loadSeq // what is on screen when the question is asked
  const ok = await askConfirm({ title: t('close_title'), text: t(hasUnexportedChanges() ? 'close_text_changes' : 'close_text_plain') + (measure.store.count() ? ` ${t('close_text_measures', { n: measure.store.count() })}` : ''), confirmLabel: t('close_confirm'), cancelLabel: t('close_cancel') })
  if (ok && model && asked === loadSeq) await closeModel() // not a model that came while the question was open
}

// ---------- document ----------
const TEXT_TYPES = ['obj', 'gltf', 'xyz', 'gcode', 'ply', 'stl', 'pcd', 'fbx']
function onDocument(d) {
  const seq = ++loadSeq
  docStart = performance.now()
  incoming = { name: '', source: 'editor' }
  const c = d.content
  // "Close file…" is for the panel and the start file; in the editor tab of a project file there is nothing to close to (the tab is the file)
  $('b-close').hidden = !(c.kind === 'text' && isStartText(c.text))
  if (c.kind === 'bytes') {
    load(String(d.fileType || '').replace(/^\./, '').toLowerCase(), c.bytes, seq)
  } else if (c.kind === 'text') {
    if (isStartText(c.text)) return startOrRestore() // the start file ("new 3D viewer"): an empty page that takes dropped files
    // Orca gives text files (OBJ, ASCII PLY, ASCII STL) to the text editor, without the file name: tell the format by content.
    const declared = String(d.fileType || '').replace(/^\./, '').toLowerCase()
    const type = TEXT_TYPES.includes(declared) ? declared : sniffTextFormat(c.text) // the type Orca names, when it names one we read as text
    if (['ply', 'stl', 'pcd', 'fbx'].includes(type) && (c.text.slice(0, 8192).match(/\uFFFD/g) || []).length >= 8) return fail(t('binary_as_text')) // a binary file that reached the text editor: decoding it as text has broken it, and what would be drawn is nonsense
    if (['obj', 'gltf', 'xyz', 'gcode'].includes(type)) load(type, null, seq, c.text)
    else load(type, new TextEncoder().encode(c.text).buffer, seq) // PLY and STL loaders take bytes
  } else {
    fail(t('as_text'))
  }
}

// ---------- start page, drop and file picker ----------
// A file dropped or picked arrives through the browser File API, so Orca's 50 MB limit for files it hands to an editor does not apply.
const FORMAT_LIST = SUPPORTED_EXT.map((e) => '.' + e).join(' ')
let pendingFile = null // a big file waiting for "Load anyway"
let pendingList = [] // everything that was dropped with it (a .gltf needs its neighbours again)
const approved = new WeakSet() // files the person said "Load anyway" to: no second question about their size or cost
// What a GLB may cost before the person is asked: the GPU memory of its pictures (estimated from their headers) and its triangles.
const BUDGET_TEXTURE_BYTES = 1.5e9
const BUDGET_TRIANGLES = 20e6
const GCODE_MAX_SEGMENTS = 4_000_000 // about 100 MB of arrays with colors
let dragDepth = 0
let dropWasShown = false

// The start page doubles as the drop target and as the place where a rejected file's reason is shown. It lies over the view only (the
// toolbar and the panel stay usable); with a model on screen a click beside the card or Esc closes it.
function showStart(note, isErr) {
  $('msg').className = 'msg hide'
  $('drop').hidden = false
  $('drop').classList.remove('over')
  $('drop-title').textContent = t('drop_title')
  $('drop-formats').textContent = t('drop_formats', { list: FORMAT_LIST })
  $('drop-explain').replaceChildren(...['glb', 'gltf', 'ply', 'stl', 'obj', '3mf', 'splat', 'fbx', 'pcd', 'gcode'].map((k) => Object.assign(document.createElement('li'), { textContent: t('fmt_' + k) })))
  $('drop-gate').hidden = !pendingFile
  const n = $('drop-note')
  n.hidden = !note
  n.className = isErr ? 'drop-note' : 'drop-note info'
  n.textContent = note || ''
  if (!model) setStateAttr('start')
  $('b-pick').focus({ preventScroll: true })
}
function hideStart() {
  pendingFile = null
  $('drop').hidden = true
  $('drop').classList.remove('over')
  $('drop-note').hidden = true
  $('drop-gate').hidden = true
}
$('drop').addEventListener('click', (e) => {
  if (e.target === $('drop') && model) hideStart()
})
// The examples are made here (a GLB written from generated parts) and opened like a dropped file; they are not kept for the next start.
for (const b of document.querySelectorAll('#drop button[data-example]')) {
  b.onclick = () => {
    const key = b.dataset.example
    const bytes = writeGLB(EXAMPLES[key]())
    const seq = ++loadSeq
    docStart = performance.now()
    incoming = { name: `example-${key}.glb`, source: 'example' }
    hideStart()
    setStateAttr('loading')
    load('glb', bytes.buffer, seq)
  }
}

function logState() {
  const { tris, verts, pts } = summarizeParts(parts)
  // console.warn on purpose: `orca plugin logs` keeps warnings and errors only, and it is the one channel an agent can read without any capability
  console.warn(
    stateLine(PLUGIN_NAME, {
      state: 'ok',
      file: currentName || null,
      source: loadSource,
      format: fileInfo.type,
      bytes: fileInfo.bytes,
      triangles: tris,
      vertices: verts,
      points: pts,
      parts: parts.length,
      size: [fileSize.x, fileSize.y, fileSize.z].map((v) => Number(v.toPrecision(5))),
      unit: unit.short,
      up: state.up,
      loadMs: Math.round(lastLoadMs)
    })
  )
}

function setMsgProgress(file, fraction) {
  const text = t('loading_pct', { type: extOf(file.name).toUpperCase(), size: fmtMB(file.size), pct: Math.floor(fraction * 100) })
  if ($('msg-text').textContent !== text) $('msg-text').textContent = text
  $('b-load-cancel').hidden = false
}
// Reads a file into one ArrayBuffer; a file over 4 MB comes in pieces with progress. isStopped() ends it early (then the result is not used).
async function readFile(file, onProgress, handle, isStopped) {
  if (file.size < 4 * 1024 * 1024 || typeof file.stream !== 'function') return file.arrayBuffer()
  const out = new Uint8Array(file.size)
  const reader = file.stream().getReader()
  handle.cancel = () => reader.cancel().catch(() => {})
  let got = 0
  onProgress(0)
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.set(value, got)
    got += value.length
    onProgress(got / file.size)
    if (isStopped()) {
      reader.cancel().catch(() => {})
      return out.buffer // the caller does not use it
    }
  }
  if (got !== file.size) throw new Error(`the file ended after ${got} of ${file.size} bytes`) // it changed while it was read
  return out.buffer
}

// Where a dropped file lies below the dropped folder ('' keys are not used: a single file is just its name).
const filePaths = new WeakMap()
const pathOf = (f) => filePaths.get(f) || f.webkitRelativePath || f.name
const MAX_DROPPED_FILES = 5000
// A dropped folder is read through its directory entries (taken while the drop event runs); every file remembers its path.
async function filesFromEntries(entries) {
  const out = []
  let truncated = false
  // level by level, so the files at the top of the folder are read first and a limit cuts off the deepest ones
  let level = entries.map((en) => [en, en.name])
  for (let depth = 0; level.length && depth <= 12; depth++) {
    const next = []
    for (const [en, path] of level) {
      try {
        if (en.isFile) {
          if (out.length >= MAX_DROPPED_FILES) {
            truncated = true
            continue
          }
          const f = await new Promise((ok, no) => en.file(ok, no))
          filePaths.set(f, path)
          out.push(f)
        } else if (en.isDirectory) {
          const reader = en.createReader()
          for (;;) {
            const batch = await new Promise((ok, no) => reader.readEntries(ok, no))
            if (!batch.length) break
            for (const child of batch) next.push([child, `${path}/${child.name}`])
          }
        }
      } catch {
        // a file that cannot be read (a dangling link, no permission) is left out; the others still open
      }
    }
    if (depth === 12 && next.length) truncated = true
    level = next
  }
  out.truncated = truncated
  return out
}

async function openFiles(fileList, source) {
  // shallow files first, so a folder with models in sub-folders opens the one at the top
  const sorted = Array.from(fileList || []).sort((a, b) => pathOf(a).split('/').length - pathOf(b).split('/').length)
  const plan = planOpen(pickFile(sorted, SUPPORTED_EXT), { hardMax: HARD_MAX_BYTES, gate: GATE_BYTES }, (f) => approved.has(f), extOf)
  if (plan.action === 'nothing') return showStart(t('drop_nothing'), true)
  if (plan.action === 'unsupported') return showStart(['step', 'stp'].includes(plan.ext) ? t('unsupported_step', { ext: plan.ext }) : t('unsupported_file', { ext: plan.ext || '?', list: FORMAT_LIST }), true)
  if (plan.action === 'toobig') return showStart(t('too_big', { size: fmtMB(plan.file.size), max: fmtMB(HARD_MAX_BYTES) }), true)
  const { file } = plan
  let ignored = plan.ignored
  if (plan.action === 'gate') {
    pendingFile = file
    pendingList = sorted
    showStart()
    $('drop-gate-text').textContent = t('big_gate', { size: fmtMB(file.size) })
    $('drop-gate').hidden = false
    return
  }
  hideStart() // the file is accepted: the loading message and any result are visible, the start card is not in the way
  const seq = ++loadSeq
  docStart = performance.now()
  setMsg(t('loading', { type: extOf(file.name).toUpperCase(), size: fmtMB(file.size) }))
  setStateAttr('loading')
  // A big file is read in pieces: the message shows how far it is, and Cancel stops reading (decoding a file that is in memory cannot be stopped).
  let buf
  let cancelled = false
  const reading = { cancel: null }
  $('b-load-cancel').onclick = () => {
    cancelled = true
    if (reading.cancel) reading.cancel()
  }
  try {
    buf = await readFile(file, (f) => seq === loadSeq && setMsgProgress(file, f), reading, () => cancelled || seq !== loadSeq)
    if (seq === loadSeq) $('b-load-cancel').hidden = true // not the button of a newer read
    if (cancelled) {
      // nothing was changed: the model that was on screen stays
      if (seq === loadSeq) {
        if (model) hideMsg()
        else showStart()
      }
      return
    }
  } catch (e) {
    if (seq === loadSeq) $('b-load-cancel').hidden = true
    if (seq === loadSeq) {
      incoming = { name: file.name, source }
      reject(t('read_failed', { why: String((e && e.message) || e).slice(0, 200) }))
    }
    return
  }
  if (seq !== loadSeq) return // another file was opened while this one was being read
  if (extOf(file.name) === 'glb' && !approved.has(file)) {
    // the header says what opening it will cost: ask before the pictures are decoded, not after the tab has run out of memory
    const b = glbBudget(buf)
    if (b && (b.textureBytes > BUDGET_TEXTURE_BYTES || b.tris > BUDGET_TRIANGLES)) {
      pendingFile = file
      pendingList = sorted
      showStart()
      if (model) setStateAttr('ok') // the model on screen is still what is shown
      $('drop-gate-text').textContent = t('budget_gate', { tex: fmtMB(b.textureBytes), n: b.images.length, tris: fmt(b.tris) })
      $('drop-gate').hidden = false
      return
    }
  }
  incoming = { name: file.name, source }
  // a .gltf finds its separate files among the others that came with it
  const kind = extOf(file.name)
  const here = pathOf(file)
  const nb = { files: new Map(), dir: here.includes('/') ? here.slice(0, here.lastIndexOf('/')) : '', used: 0 }
  if (kind === 'gltf') for (const f of sorted) if (f !== file) nb.files.set(pathOf(f), f)
  await load(kind, buf, seq, undefined, nb)
  const separateFiles = kind === 'gltf' && nb.used > 0 // the kept copy is the file alone: a .gltf with separate files could not be shown again from it
  if (kind === 'gltf') ignored = Math.max(0, ignored - nb.used)
  if (seq === loadSeq && model && currentName === file.name && !separateFiles) rememberFile(file.name, buf, extOf(file.name)) // so it is still here when the panel is shown again
  if (ignored > 0 && seq === loadSeq && model) flash(t('drop_more', { n: ignored }))
}

const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return
  e.preventDefault()
  const r = dragReducer(dragDepth, { type: 'enter' })
  dragDepth = r.depth
  if (r.started) {
    dropWasShown = !$('drop').hidden
    $('drop').hidden = false
    $('drop').classList.add('over')
    $('drop-title').textContent = model ? t('drop_title_replace') : t('drop_title')
  }
})
window.addEventListener('dragover', (e) => {
  if (hasFiles(e)) {
    e.preventDefault() // lets the drop happen here instead of navigating the frame to the file
    e.dataTransfer.dropEffect = 'copy'
  }
})
function dragEnded() {
  dragDepth = 0
  $('drop').classList.remove('over')
  $('drop-title').textContent = t('drop_title')
  if (!dropWasShown) hideStart() // the overlay only appeared for the drag: take it down again (a start page that was already up stays)
}
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return
  const r = dragReducer(dragDepth, { type: 'leave', leftWindow: e.relatedTarget === null && e.clientX <= 0 })
  dragDepth = r.depth
  if (r.ended) dragEnded()
})
window.addEventListener('dragend', dragEnded)
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth = 0
  $('drop').classList.remove('over')
  // the entries of a dropped folder are only available while this event runs
  const files = Array.from(e.dataTransfer.files)
  const entries = Array.from(e.dataTransfer.items || []).map((it) => (it.kind === 'file' && it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean)
  if (entries.some((en) => en.isDirectory)) {
    setMsg(t('reading_folder'))
    filesFromEntries(entries).then(
      (list) => openFiles(list, 'drop').then(() => list.truncated && model && flash(t('folder_truncated', { n: MAX_DROPPED_FILES }))),
      () => openFiles(files, 'drop')
    )
  } else openFiles(files, 'drop')
})
// Cmd+V of a file copied in Finder
window.addEventListener('paste', (e) => {
  const files = e.clipboardData && e.clipboardData.files
  if (files && files.length) {
    e.preventDefault()
    openFiles(files, 'paste')
  }
})
$('file-input').accept = SUPPORTED_EXT.map((e) => '.' + e).join(',')
$('file-input').onchange = (e) => {
  const files = Array.from(e.target.files || [])
  e.target.value = '' // the same file can be chosen again
  if (files.length) openFiles(files, 'picker')
}
$('b-pick').onclick = () => $('file-input').click()
$('b-pick-folder').onclick = () => $('folder-input').click()
$('folder-input').onchange = (e) => {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (files.length) openFiles(files, 'picker')
}
$('b-open').onclick = () => $('file-input').click()
$('b-gate-go').onclick = () => {
  if (!pendingFile) return
  approved.add(pendingFile)
  openFiles(pendingList.length ? pendingList : [pendingFile], 'picker')
}
$('b-gate-cancel').onclick = () => {
  pendingFile = null
  pendingList = []
  if (model) hideStart()
  else showStart()
}

new ResizeObserver(resize).observe($('stage'))
// the toolbar, the side tabs and the measuring bar are built from the page's elements (chrome-layout.js), before the shell wires them
chrome = buildChrome({ t, locale, version: PLUGIN_VERSION, step: false, tabPref: { get: () => prefs.tab, set: (v) => ((prefs.tab = v), savePrefs()) } })
const shell = initShell({ getPrefs: () => prefs, savePrefs, onLayout: resize, popovers: chrome.popovers })
chrome.hooks.fitAll = () => resetView()
chrome.hooks.lookFrom = (dir) => lookFrom(dir)
chrome.hooks.fitSelected = () => fitView()
chrome.hooks.openPanel = () => shell.setPanelOpen(true)
chrome.hooks.resetAppearance = () => resetAppearance()
chrome.hooks.isolate = () => isolateSelected(false)
chrome.hooks.setMulti = (on) => (multiSelect = on)
chrome.hooks.clearSelection = () => selectPart(-1, false)
chrome.hooks.setBackground = (m, c) => setBackground(m, c)
chrome.hooks.shadingOriginal = () => {
  $('shading').value = 'original'
  $('shading').dispatchEvent(new Event('change', { bubbles: true }))
}
initLayerRow()
// the segment of the measuring bar sets the (hidden) select, which stays the one source of the mode
chrome.measureBar.bind({
  setMode: (m) => {
    $('measure-mode').value = m
    $('measure-mode').dispatchEvent(new Event('change', { bubbles: true }))
  },
  // "Delete": the unfinished measurement, else the selected one
  clear: () => clearMeasure(), // the unfinished measurement; finished ones are deleted in the Measure tab
  done: () => setMeasure(false),
  finishChain: (closed) => measure.finishChain(closed)
})
measureTab = chrome.bindMeasureTab({
  measure,
  locale,
  copy: copyText,
  flash,
  startMeasuring: () => {
    if (!state.measure) setMeasure(true)
  },
  confirm: askConfirm
})
installMeasureInteraction({
  canvas,
  camera,
  controls,
  measure,
  canEdit: () => !!model && (state.measure || chrome.tabs.current() === 'measure'),
  isMeasuring: () => state.measure,
  pickAt: (x, y) => {
    const r = canvas.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)), camera)
    return pickHit(parts.filter((p) => p.kind === 'mesh' && p.visible).map((p) => p.obj))
  }
})
syncMeasureBar()
updateDisplayButtons() // no model yet: no tabs (the empty panel says what to do)
// whatever nobody caught: a line in the log (`orca plugin logs`) and a message for the person; a model that is on screen stays
installErrorGuard(window, {
  plugin: PLUGIN_NAME,
  onFatal: (why) => {
    if (model) flash(t('unexpected_error', { why }))
    else setMsg(t('unexpected_error', { why }), true)
  }
})
setHasModel(false)
exportUi = initExportUi({
  t,
  openExport: () => chrome.openExport(), // the export is a dialog over the view
  fmtMB,
  shell,
  pluginName: PLUGIN_NAME,
  locale,
  hasModel: () => !!model,
  glLost: () => glLost,
  currentName: () => currentName,
  nextFrame,
  counts: exportCounts,
  exportable: (only) => parts.some((p) => (p.kind === 'mesh' || p.kind === 'points') && (!only || p.visible)),
  buildMesh: (fmt, o) => unexploded(() => buildMeshCopy(fmt, o)),
  buildCompressed: (o) => unexploded(() => buildCompressedCopy(o)),
  originalBytes: () => fileInfo.bytes,
  unitAssumed: () => !!unit.assumed,
  unitUnknown: () => !!unit.assumed || unit.short === t('unit_short_stl'), // STL and the like: the numbers carry no unit
  gltfScale: () => ({ k: unit.short !== 'm' && UNIT_METERS[unit.short] ? UNIT_METERS[unit.short] : 1, unit: unit.short }),
  isSplat: () => isSplat,
  view: () => ({ renderer, scene, camera, controls, canvas, helpers, overlay: measure, spinner: studioUi && studioUi.isActive() ? studioUi.studio.spin : null }),
  resize,
  requestRender,
  saveBytes
})

studioUi = initStudioUi({
  t,
  prefs: () => prefs,
  savePrefs,
  hasModel: () => !!model,
  insertBefore: 'studio-anchor',
  afterApply: () => {
    // a look chosen from the tiles shows its own background again; editing a light or the floor leaves a chosen background alone
    const preset = studioUiRef ? studioUiRef.studio.state.preset : null
    if (preset && preset !== 'custom' && preset !== lastPreset && bgModel.mode !== 'look') setBackground('look')
    if (preset && preset !== 'custom') lastPreset = preset
    refreshBg() // the background and the Studio button follow the look
    if (syncLooks) syncLooks()
  },
  beforeSpin: () => {
    clearMeasure()
    selectPart(-1, false)
    collapseExplode()
  },
  studioCtx: {
    scene,
    camera,
    renderer,
    controls,
    canvas,
    spinRoot,
    modelRoot,
    baseLights: [hemisphere, headlight],
    getBox: () => boundsBox,
    getStats: () => {
      const sm = summarizeParts(parts)
      return { tris: sm.tris, points: sm.pts, splat: isSplat }
    },
    requestRender
  }
})
studioUiRef = studioUi
syncLooks = chrome.decorateStudio() // look tiles over the list, the details one level down
lastPreset = studioUi.studio.state.preset
$('studio-sec').addEventListener('toggle', () => {
  if (!$('studio-sec').open) $('studio-sec').open = true // the section has no heading to open it again
})
refreshBg()

// ---------- Gaussian splats (Spark) ----------
// A real Gaussian-splat PLY is drawn as splats by Spark (MIT, loaded only now: ~2.9 MB). The colored points stay the model for bounds, export and
// tools; they are only moved out of the camera's layer while the splats are shown. If Spark cannot start (its worker, a file it dislikes) the file
// stays what it was: colored points, with a note.
let sparkApi = null
let spark = null
let splatMesh = null
const POINT_LAYER = 1 // the layer the points move to while the splats are shown (the camera sees layer 0)
function pointsParts() {
  return parts.filter((p) => p.kind === 'points')
}
function setSplatMode(on) {
  if (!splatMesh) return
  splatMesh.visible = on
  for (const p of pointsParts()) p.obj.layers.set(on ? POINT_LAYER : 0)
  $('splat-mode').value = on ? 'splat' : 'points'
  requestRender()
}
// The splats are the file's own shapes: after a tool has changed the points they would no longer fit, so the view goes back to the points.
function dropSplats() {
  if (!splatMesh) return
  disposeSplat()
  for (const p of pointsParts()) p.obj.layers.set(0)
  fileNotes.push(t('splat_dropped'))
  buildStats(lastLoadMs)
  requestRender()
}
function disposeSplat() {
  if (splatMesh) {
    modelRoot.remove(splatMesh)
    if (typeof splatMesh.dispose === 'function') splatMesh.dispose()
    splatMesh = null
  }
  delete document.documentElement.dataset.splat
  $('splat-row').hidden = true
}
function makeSpark() {
  if (spark) return
  spark = new sparkApi.SparkRenderer({ renderer, onDirty: () => requestRender() })
  scene.add(spark)
}
async function startSplat(sf) {
  const mine = loadSeq
  const t0 = performance.now()
  let mesh = sf.mesh
  try {
    sparkApi ||= await import('./vendor/spark/spark.module.js')
    makeSpark()
    if (!mesh) mesh = new sparkApi.SplatMesh({ fileBytes: sf.bytes, fileType: sf.type })
    await mesh.initialized
    if (mine !== loadSeq || !model) {
      if (typeof mesh.dispose === 'function') mesh.dispose() // another file arrived meanwhile
      return
    }
    splatMesh = mesh
    modelRoot.add(mesh)
    $('splat-row').hidden = false
    setSplatMode(prefs.splat !== 'points')
    document.documentElement.dataset.splat = 'on'
    console.warn(`${PLUGIN_NAME}-splat ${JSON.stringify({ state: 'on', splats: mesh.packedSplats ? mesh.packedSplats.numSplats : null, ms: Math.round(performance.now() - t0) })}`) // for `orca plugin logs`
  } catch (e) {
    const why = String((e && e.message) || e).slice(0, 120)
    console.warn(`${PLUGIN_NAME}-splat ${JSON.stringify({ state: 'failed', why })}`)
    if (mine === loadSeq && model) {
      document.documentElement.dataset.splat = 'failed'
      fileNotes.push(t('splat_failed', { why }))
      buildStats(lastLoadMs)
    }
  }
}
$('splat-mode').onchange = (e) => {
  prefs.splat = e.target.value
  savePrefs()
  setSplatMode(e.target.value === 'splat')
}

// ---------- tools: the working copy ----------
// The Tools section (shared/tools-ui.js) changes the model that is on screen; this adapter tells it how this viewer holds its model.
const partMemory = new WeakMap()
const toolsAdapter = {
  modelRoot,
  structure: true, // parts can be removed and merged: they are read from the scene again afterwards
  getModel: () => model,
  getParts: () => parts,
  getUnit: () => unit,
  setUnit: (u) => {
    unit = u
  },
  getUp: () => state.up,
  setUp: (u) => {
    state.up = u
    state.upTouched = true
    $('up').value = u
    applyUp()
  },
  rebuildParts() {
    for (const p of parts) partMemory.set(p.obj, p) // a part that was removed and comes back by "Back to the file" gets its own look again, not the one the view had given its object
    const old = new Map(parts.map((p) => [p.obj, p]))
    const fresh = collectParts(model)
    for (const p of fresh) {
      const o = old.get(p.obj) || partMemory.get(p.obj)
      if (o) Object.assign(p, { orig: o.orig, tint: o.tint, visible: o.visible, opacity: o.opacity, fade: o.fade }) // a part the tools did not touch keeps its look
      p.obj.visible = p.visible
    }
    parts = fresh
    syncSelection(false) // what was selected and still exists stays selected
    gatherMaterials()
    applyMaterials()
  },
  disposeTexture,
  afterChange() {
    if (!model) return
    checkInfo = null // the numbers were of the model before
    fitBounds()
    buildHelpers()
    resetView()
    updateClip()
    if (measure.store.count()) flash(t('mp_dropped'))
    measure.clearAll() // the geometry was changed by a tool: the old points are not on the surface any more
    buildStats(lastLoadMs)
    buildPartList()
    syncSelection(false) // the frame follows the parts after they moved
    if (partCard) partCard.invalidate() // the numbers were of the working copy before
    invalidateExport()
    requestRender()
  }
}
toolsUi = initToolsUi({
  t,
  locale,
  A: toolsAdapter,
  hasModel: () => !!model,
  beforeChange: () => {
    collapseExplode()
    dropSplats() // the tools change the points, which the splats would not follow
  },
  selectedPart: () => selected,
  measure: () => ({ size: [fileSize.x, fileSize.y, fileSize.z], tris: parts.reduce((a, p) => a + p.tris, 0) }),
  onCheck: (r) => {
    checkInfo = r.total
    buildStats(lastLoadMs)
  },
  fmtLen,
  fmtVol: (v, u) => F.vol(v, u),
  fmtArea: (v, u) => F.area(v, u),
  view: () => ({ renderer, scene, camera, canvas, helpers }),
  resize,
  nextFrame
})
$('parts').title = t('tip_selection')
partCard = initPartCard({
  t,
  locale,
  A: toolsAdapter,
  host: $('part-count') || $('parts'), // the cards stand after the count line under the tree
  chipHost: $('stage'),
  upAxis: () => (state.up === 'z' ? 'z' : 'y'), // the axis of the file that is up (-Y up counts as Y)
  unitSrc: () => (unit && unit.assumed !== undefined ? (unit.assumed ? 'assumed' : 'file') : model && model.userData && model.userData.fileUnit ? 'file' : 'assumed'), // glTF, STL, OBJ, PLY do not state the unit: an assumption
  fmtLen,
  fmtVol: (v, u) => F.vol(v, u),
  fmtArea: (v, u) => F.area(v, u),
  getSelection: () => ({ indices: selectedIndices(), label: null }),
  clear: () => selectPart(-1, false),
  fit: () => fitView(),
  isolate: () => isolateSelected(false),
  openPanel: () => shell.setPanelOpen(true),
  measureParts: () => {
    state.measureMode = 'parts'
    $('measure-mode').value = 'parts'
    shell.setPanelOpen(true)
    setMeasure(true)
  },
  flash,
  isCut: (p) => {
    if (!state.clip.axis) return false
    if (!p.obj.geometry.boundingBox) p.obj.geometry.computeBoundingBox()
    p.obj.updateWorldMatrix(true, false)
    const b = p.obj.geometry.boundingBox
    let inside = 0
    for (let k = 0; k < 8; k++) {
      const v = new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(p.obj.matrixWorld)
      if (clipPlane3.distanceToPoint(v) >= 0) inside++
    }
    return inside > 0 && inside < 8
  },
  describe: (i) => {
    const p = parts[i]
    const first = Array.isArray(p.orig) ? p.orig[0] : p.orig
    const map = first && first.map && first.map.image && first.map.image.width ? first.map : null
    return { name: p.label, colour: p.kind === 'mesh' ? swatchColor(p) : null, material: p.matName || null, texture: map ? `${map.image.width} × ${map.image.height} px` : null }
  },
  prefs: { get: (k) => prefs[k], set: (k, v) => ((prefs[k] = v), savePrefs()) }
})
let gotDocument = false
if (typeof orca.document === 'object' && orca.document && typeof orca.document.onDidChange === 'function') {
  setMsg(t('waiting'))
  refreshBg() // the empty view already has the theme's background
  resize()
  orca.document.onDidChange((d) => {
    gotDocument = true
    onDocument(d)
  })
  // A sidebar panel has the same page but no document: say so instead of waiting for one forever.
  if (typeof orca.document.get === 'function') {
    Promise.resolve(orca.document.get()).catch(() => {
      if (!gotDocument) startOrRestore()
    })
  }
  setTimeout(() => {
    if (!gotDocument && !model && incoming.source === 'editor') startOrRestore()
  }, 4000)
} else {
  // opened as a sidebar panel: there is no file; the start page, or the file that was kept
  refreshBg()
  resize()
  startOrRestore()
}
