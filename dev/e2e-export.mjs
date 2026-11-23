#!/usr/bin/env node
// End-to-end test of "Export a copy" in headless Chrome (through the harness, which stands in for Orca's Save dialog):
// opens generated sample models, makes a copy in every format, saves it (the stand-in keeps the bytes), checks the bytes with
// independent tools where there are any (unzip, ffprobe), and opens the copy in the viewer again to compare what it shows.
//   node dev/e2e-export.mjs [keep]        needs Google Chrome (or set CHROME) and python3; "keep" leaves the copies in a folder and prints it
import { spawn, execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeGLB } from '../editor/shared/export.js'

const here = dirname(fileURLToPath(import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'mv3d-e2e-'))
const samples = join(dir, 'samples')
const out = join(dir, 'copies')
execFileSync('python3', [join(here, 'make_samples.py'), '--out', samples], { stdio: 'ignore' })
execFileSync('mkdir', ['-p', out])
// Draco and KTX2 samples need generator tools (npm packages): set MV3D_TOOLS to the folder where they are installed (see make_compressed_samples.mjs)
const withCompressed = !!process.env.MV3D_TOOLS
if (withCompressed) execFileSync('node', [join(here, 'make_compressed_samples.mjs'), samples, process.env.MV3D_TOOLS], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rnd = Math.floor(Math.random() * 80)
const port = 8900 + rnd
const chromePort = 9400 + rnd
const server = spawn('python3', [join(here, 'harness_server.py'), String(port)], { stdio: 'ignore' })
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${chromePort}`, '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-first-run',
  `--user-data-dir=${join(dir, 'profile')}`, 'about:blank'
], { stdio: 'ignore' })

let failures = 0
const results = []
const check = (ok, what) => {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures++
}

let ws
let id = 0
const pend = new Map()
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text))
  return r.result?.result?.value
}
async function waitFor(expr, ms = 60000, what = expr) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await ev(expr)) return
    await sleep(100)
  }
  throw new Error(`timeout waiting for ${what}`)
}
const open = async (file, extra = '') => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?file=${encodeURIComponent(join(samples, file))}&lang=en${extra}` })
  await sleep(300)
  await waitFor(`document.documentElement.dataset.state === 'ok'`, 60000, `${file} to load`)
}
// what the viewer shows now: counts from its parts, and the extent from the row of three sizes in the Info card
const shown = () => ev(`(() => {
  const parts = window.__h.parts
  const dd = [...document.querySelectorAll('#stats dd, #stats-more dd')].map((e) => e.textContent)
  const dt = [...document.querySelectorAll('#stats dt, #stats-more dt')].map((e) => e.textContent)
  return { state: document.documentElement.dataset.state,
    parts: parts.length, tris: parts.reduce((a, p) => a + p.tris, 0), points: parts.filter((p) => p.kind === 'points').reduce((a, p) => a + p.verts, 0),
    height: ((dd[dt.indexOf('Height range')] || '').replace(/\u2212/g, '-').match(/-?[\\d.]+/g) || []).map(Number).slice(0, 2),
    extent: [...document.querySelectorAll('#info-dims-row .dim-n')].map((e) => Number(e.textContent.replace(/,/g, ''))), unit: dd[dt.indexOf('Unit')] || '', anim: !document.getElementById('anim-sec').hidden,
    textures: dt.includes('Texture') }
})()`)
const glbJson = (b) => JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'))
const sameHeight = (a, b) => a.length === 2 && b.length === 2 && a.every((v, i) => Math.abs(v - b[i]) <= 0.01 * Math.max(1, Math.abs(b[i])))
const sameExtent = (a, b) => a.length === 3 && b.length === 3 && [...a].sort((x, y) => x - y).every((v, i) => Math.abs(v - [...b].sort((x, y) => x - y)[i]) <= 0.01 * Math.max(1, Math.abs(v)))

// one export: choose the format and options, make the copy, save it; returns { bytes, name, mime, result text }
async function exportCopy(fmt, opts = {}) {
  await ev(`(() => {
    window.__savedData = null
    const f = document.getElementById('ex-format'); f.value = ${JSON.stringify(fmt)}; f.dispatchEvent(new Event('change', { bubbles: true }))
    for (const [id, v] of Object.entries(${JSON.stringify(opts)})) {
      const el = document.getElementById(id)
      if (el.type === 'checkbox') el.checked = v; else el.value = v
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    document.getElementById('b-ex-make').click()
  })()`)
  await waitFor(`document.documentElement.dataset.export === 'ready' || (document.documentElement.dataset.export === 'idle' && !document.getElementById('ex-result').hidden && document.getElementById('ex-result').textContent.startsWith('The copy could not'))`, 120000, `${fmt} copy`)
  const text = await ev(`document.getElementById('ex-result').textContent`)
  if (await ev(`document.documentElement.dataset.export !== 'ready'`)) return { error: text }
  await ev(`document.getElementById('b-ex-save').click()`)
  await waitFor(`!!window.__savedData`, 20000, 'the Save dialog call')
  const meta = await ev(`({ ...window.__saved })`)
  const b64 = await ev(`(() => { const u = new Uint8Array(window.__savedData); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s) })()`)
  return { bytes: Buffer.from(b64, 'base64'), name: meta.name, mime: meta.mime, text }
}
// opens a copy in the viewer again (like Orca does: OBJ as text, the rest as bytes)
async function reopen(copy) {
  const ext = copy.name.split('.').pop()
  const b64 = copy.bytes.toString('base64')
  await ev(`(async () => {
    document.documentElement.dataset.state = 'feeding'
    const bin = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0))
    window.__handler({ version: 1, readOnly: true, fileType: ${JSON.stringify(ext)}, content: ${ext === 'obj' ? 'return_text' : '{ kind: "bytes", bytes: bin.buffer }'} })
  })()`.replace('return_text', `{ kind: 'text', text: new TextDecoder().decode(bin) }`))
  await waitFor(`['ok', 'error'].includes(document.documentElement.dataset.state)`, 60000, 'the copy to open')
  return shown()
}
const save = (copy) => {
  const p = join(out, copy.name)
  writeFileSync(p, copy.bytes)
  return p
}

try {
  let targets
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${chromePort}/json`)).json(); if (targets.length) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
  await send('Page.enable')

  // ----- a model with five named parts (GLB, +Y up, meters)
  await open('parts.glb')
  const src = await shown()
  check(src.parts === 5, `parts.glb has ${src.parts} parts`)
  for (const fmt of ['glb', 'stl', 'obj', 'ply', '3mf']) {
    const c = await exportCopy(fmt)
    if (c.error) { check(false, `${fmt}: ${c.error}`); continue }
    const p = save(c)
    check(c.bytes.length > 100 && c.name === `model.${fmt}`, `${fmt}: ${c.name}, ${c.bytes.length} bytes, ${c.mime}`)
    if (fmt === '3mf') check(spawnSync('unzip', ['-tq', p]).status === 0, '3mf: unzip -t accepts the archive')
    const again = await reopen(c)
    check(again.state === 'ok', `${fmt}: the copy opens again (${again.state})`)
    check(again.tris === src.tris, `${fmt}: triangles ${again.tris} = ${src.tris}`)
    if (['glb', 'obj', '3mf'].includes(fmt)) check(again.parts === src.parts, `${fmt}: ${again.parts} parts = ${src.parts}`)
    check(sameExtent(again.extent, src.extent), `${fmt}: extent ${again.extent.join(' x ')} matches ${src.extent.join(' x ')} (axes may differ)`)
    check(sameHeight(again.height, src.height), `${fmt}: height ${again.height.join(' … ')} = ${src.height.join(' … ')} (up is kept)`)
    await open('parts.glb')
  }

  // ----- only the visible parts
  await open('parts.glb')
  await ev(`document.querySelector('.part input').click()`)
  let c = await exportCopy('glb', { 'ex-visible': true })
  check(!c.error && (await reopen(c)).parts === 4, 'glb: a hidden part is left out')
  await open('parts.glb')
  await ev(`document.querySelector('.part input').click()`)
  c = await exportCopy('glb', { 'ex-visible': false })
  check(!c.error && (await reopen(c)).parts === 5, 'glb: with "only visible" off every part is written')

  // ----- textures and animation survive a GLB copy
  await open('textured.glb')
  const tsrc = await shown()
  c = await exportCopy('glb')
  const tagain = c.error ? null : await reopen(c)
  check(tagain && tagain.textures && tagain.tris === tsrc.tris, 'textured.glb: the GLB copy still has its texture')
  await open('animated.glb')
  c = await exportCopy('glb')
  const aagain = c.error ? null : await reopen(c)
  check(aagain && aagain.anim, 'animated.glb: the GLB copy still has its animation')

  // ----- an animated model keeps the rotation of "Up in the copy" (the exporter ignores a node's matrix when it writes animations)
  await open('animated.glb')
  const asrc = await shown()
  c = await exportCopy('glb', { 'ex-up': 'z' })
  if (c.error) check(false, `animated.glb -> glb Z up: ${c.error}`)
  else {
    const j = glbJson(c.bytes)
    const root = j.scenes[0].nodes.map((n) => j.nodes[n])[0]
    check(!!(root.rotation || root.matrix), `animated.glb -> glb Z up: the root node carries the rotation (${JSON.stringify(root.rotation || root.matrix || null)})`)
    check((j.animations || []).length === 1, 'animated.glb -> glb Z up: the animation is kept')
    await reopen(c)
    await ev(`(() => { const u = document.getElementById('up'); u.value = 'z'; u.dispatchEvent(new Event('change')) })()`)
    await sleep(300)
    const back = await shown()
    check(sameHeight(back.height, asrc.height), `animated.glb -> glb Z up, read as Z up again: height ${back.height.join(' … ')} = ${asrc.height.join(' … ')}`)
    await ev(`(() => { const u = document.getElementById('up'); u.value = 'y'; u.dispatchEvent(new Event('change')) })()`) // "Up is" is remembered per format: put it back
  }

  // ----- a skinned model: the joints of the copy are nodes of the copy
  await open('skinned.glb')
  const ssrc = await shown()
  c = await exportCopy('glb', { 'ex-up': 'y' })
  if (c.error) check(false, `skinned.glb -> glb: ${c.error}`)
  else {
    const j = glbJson(c.bytes)
    const skin = (j.skins || [])[0]
    check(!!skin && skin.joints.length === 2 && skin.joints.every((n) => j.nodes[n]), `skinned.glb -> glb: ${skin ? skin.joints.length : 0} joints, each a node of the copy`)
    const names = (j.skins || []).flatMap((sk) => sk.joints.map((n) => j.nodes[n].name))
    check(names.includes('Base_joint') && names.includes('Upper_joint'), `skinned.glb -> glb: joint names ${names.join(', ')} (three.js writes spaces as underscores)`)
    const again = await reopen(c)
    check(again.state === 'ok' && again.tris === ssrc.tris, `skinned.glb -> glb: the copy opens again with ${again.tris} triangles`)
  }

  // ----- GLB, compressed: smaller, opens again, the same triangles; the work ran in the worker
  await open('parts.glb')
  const pgsrc = await shown()
  c = await exportCopy('glbc', { 'ex-target': '45' })
  if (c.error) check(false, `parts.glb -> compressed: ${c.error}`)
  else {
    const plain = await exportCopy('glb')
    const again = await reopen(c)
    check(c.bytes.length < plain.bytes.length / 2, `parts.glb -> compressed GLB: ${c.bytes.length} bytes < half of ${plain.bytes.length}`)
    check(again.state === 'ok' && again.tris === pgsrc.tris && again.parts === pgsrc.parts, `compressed GLB opens again: ${again.tris} triangles, ${again.parts} parts`)
    check(sameExtent(again.extent, pgsrc.extent), 'compressed GLB: the extent is kept')
    const j = glbJson(c.bytes)
    check((j.extensionsRequired || []).includes('EXT_meshopt_compression'), 'compressed GLB declares EXT_meshopt_compression')
    check((await ev(`document.documentElement.dataset.toolsRunner`)) === 'worker', 'the compression ran in the worker')
    const rep = c.text // the result before it was saved
    check(/Triangles: 1,832 → 1,832/.test(rep) && /Target 45\.0 MB reached|Target .* reached/.test(rep), `the report shows before and after: ${rep.replace(/\s+/g, ' ').slice(0, 160)}`)
  }
  await open('textured.glb')
  const txsrc = await shown()
  c = await exportCopy('glbc', { 'ex-target': '45', 'ex-texmax': '512' })
  if (c.error) check(false, `textured.glb -> compressed: ${c.error}`)
  else {
    const plain = await exportCopy('glb')
    const again = await reopen(c)
    check(again.textures && again.tris === txsrc.tris && c.bytes.length < plain.bytes.length, `textured.glb -> compressed: texture kept, ${c.bytes.length} < ${plain.bytes.length} bytes`)
    const tj = glbJson(c.bytes)
    check(tj.images && tj.images.length === 1 && /jpeg|png/.test(tj.images[0].mimeType), `textured.glb -> compressed: the image is re-encoded (${tj.images && tj.images[0].mimeType})`)
  }
  // a target that cannot be met is said so, with suggestions
  c = await exportCopy('glbc', { 'ex-target': '0.01', 'ex-texmax': '512' })
  const missed = c.text
  check(!c.error && /not reachable/.test(missed), `a target that cannot be reached is reported: ${missed.replace(/\s+/g, ' ').slice(0, 600)}`)
  for (const f of ['animated.glb', 'skinned.glb']) {
    await open(f)
    const srcA = await shown()
    c = await exportCopy('glbc', { 'ex-target': '45' })
    const againA = c.error ? null : await reopen(c)
    check(againA && againA.state === 'ok' && againA.tris === srcA.tris, `${f} -> compressed: opens again with ${againA && againA.tris} triangles`)
    if (f === 'animated.glb') check(againA && againA.anim, 'animated.glb -> compressed: the animation is kept')
  }

  // ----- cancel: a compression of a larger file is stopped, nothing is kept, and the next one works
  execFileSync('node', [join(here, 'make_big.mjs'), join(dir, 'big'), '20', '0.1'], { stdio: 'ignore' })
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?file=${encodeURIComponent(join(dir, 'big', 'big.glb'))}&lang=en` })
  await sleep(300)
  await waitFor(`document.documentElement.dataset.state === 'ok'`, 120000, 'the larger GLB')
  await ev(`(() => { document.getElementById('b-export').click(); const f = document.getElementById('ex-format'); f.value = 'glbc'; f.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('b-ex-make').click() })()`)
  await waitFor(`document.documentElement.dataset.export === 'busy' && !document.getElementById('b-ex-cancel').hidden`, 20000, 'the cancel button')
  await ev(`document.getElementById('b-ex-cancel').click()`)
  await waitFor(`document.documentElement.dataset.export === 'idle'`, 20000, 'the cancelled state')
  check(await ev(`document.getElementById('ex-result').hidden && document.getElementById('b-ex-save').disabled`), 'cancel: nothing is kept and Save is off')
  c = await exportCopy('glbc', { 'ex-target': '45' })
  check(!c.error && c.bytes.length > 1000, `after a cancel the next compression works (${c.bytes ? c.bytes.length : c.error} bytes)`)

  // ----- the panel frame is built anew (Orca does it when the sidebar is closed and opened): the last dropped file comes back
  const panelUrl = `http://127.0.0.1:${port}/h/index.html?nodoc=1&lang=en`
  await send('Page.navigate', { url: panelUrl })
  await sleep(300)
  await waitFor(`document.documentElement.dataset.state === 'start'`, 20000, 'the panel start page')
  await ev(`(async () => { const r = await fetch('/file?p=' + encodeURIComponent(${JSON.stringify(join(samples, 'parts.glb'))})); const bytes = await r.arrayBuffer()
    const dt = new DataTransfer(); dt.items.add(new File([bytes], 'my table.glb')); const inp = document.getElementById('file-input'); inp.files = dt.files; inp.dispatchEvent(new Event('change')) })()`)
  await waitFor(`document.documentElement.dataset.state === 'ok'`, 30000, 'the dropped file')
  await ev(`document.getElementById('b-wire').click()`)
  await ev(`(() => { const h = window.__h; h.camera.position.set(3, 2.5, 4); h.controls.target.set(0.2, 0.5, 0.1); h.controls.update(); h.controls.dispatchEvent({ type: 'end' }) })()`)
  await sleep(1200)
  const camBefore = await ev(`window.__h.camera.position.toArray().map((v) => +v.toFixed(3))`)
  check(/my table\.glb/.test(await ev(`document.getElementById('keep-text').textContent`)), 'kept: the panel says which file it keeps')
  await send('Page.navigate', { url: panelUrl }) // a new frame, as Orca makes it
  await sleep(400)
  await waitFor(`document.documentElement.dataset.state === 'ok'`, 30000, 'the restored file')
  const back = await shown()
  check(back.state === 'ok' && back.parts === 5 && back.tris === 1832, `kept: the file is back after the frame was rebuilt (${back.parts} parts, ${back.tris} triangles)`)
  const camAfter = await ev(`window.__h.camera.position.toArray().map((v) => +v.toFixed(3))`)
  check(JSON.stringify(camAfter) === JSON.stringify(camBefore), `kept: the camera is back (${camAfter.join(', ')})`)
  check(await ev(`document.getElementById('b-wire').getAttribute('aria-pressed') === 'true'`), 'kept: the wireframe switch is back')
  check(/Back from the last time: my table\.glb/.test(await ev(`document.getElementById('msg-text').textContent`)) || (await ev(`document.getElementById('keep-text').textContent`)).includes('my table.glb'), 'kept: the panel says it restored the file')
  await ev(`document.getElementById('b-close').click()`)
  await ev(`document.querySelector('#confirm button.danger').click()`)
  await sleep(300)
  await send('Page.navigate', { url: panelUrl })
  await sleep(400)
  await waitFor(`document.documentElement.dataset.state === 'start'`, 20000, 'the start page after forgetting')
  check(await ev(`document.getElementById('keep-row').hidden`), 'kept: after "Close" the next frame starts empty')
  // an editor tab (a file from Orca) is never replaced by the kept file
  await open('parts.glb')
  check((await shown()).parts === 5, 'kept: a document from Orca is shown as it is')

  // ----- Tools: the working copy changes, the export writes it
  const click = (id) => ev(`document.getElementById(${JSON.stringify(id)}).click()`)
  const toolsIdle = () => waitFor(`document.documentElement.dataset.tools === 'idle' && !document.getElementById('tl-result').textContent.startsWith('Working')`, 60000, 'the tool to finish')
  const result = () => ev(`document.getElementById('tl-result').textContent`)
  await open('bracket.stl') // millimeters unknown ("units"), Z up
  let tlsrc = await shown()
  await ev(`(() => { const u = document.getElementById('tl-unit'); u.value = 'mm'; document.getElementById('tl-unit-to').value = 'mm' })()`)
  await click('tl-assign'); await toolsIdle()
  check(/millimeters \(set by you\)/.test((await shown()).unit), `tools: unit assigned (${(await shown()).unit})`)
  await ev(`(() => { const u = document.getElementById('tl-unit'); u.value = 'm'; document.getElementById('tl-unit-to').value = 'm' })()`)
  await click('tl-convert'); await toolsIdle()
  let after = await shown()
  check(sameHeight(after.height, tlsrc.height.map((v) => v / 1000)), `tools: mm to m scales the model (${after.height.join(' … ')})`)
  await ev(`(() => { const e = document.getElementById('tl-scale'); e.value = '1000' })()`)
  await click('tl-scale-go'); await toolsIdle()
  after = await shown()
  check(sameHeight(after.height, tlsrc.height), 'tools: scale x1000 brings it back')
  await click('tl-floor'); await toolsIdle()
  after = await shown()
  check(Math.abs(after.height[0]) < 1e-6, `tools: put on floor (lowest ${after.height[0]})`)
  await click('tl-center'); await toolsIdle()
  after = await shown()
  check(Math.abs(after.height[0] + after.height[1]) < 1e-3, `tools: centered (${after.height.join(' … ')})`)
  const beforeRot = (await shown()).height
  await ev(`document.querySelector('#tl-rotate button[data-axis="x"]').click()`); await toolsIdle()
  await ev(`document.querySelector('#tl-rotate button[data-axis="x"]').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }))`); await toolsIdle()
  check(sameHeight((await shown()).height, beforeRot), 'tools: Shift + click on a rotate button turns it back')
  await ev(`document.querySelector('#tl-rotate button[data-axis="x"]').click()`); await toolsIdle()
  await ev(`document.querySelector('#tl-mirror button[data-axis="x"]').click()`); await toolsIdle()
  const ct = await exportCopy('glb', { 'ex-up': 'keep' })
  check(!ct.error, `tools: the changed copy exports (${ct.error || ct.bytes.length + ' bytes'})`)
  const status = await ev(`document.getElementById('tl-status').textContent`)
  check(/[1-9]\d* change/.test(status) || /Working copy: \d+/.test(status), `tools: status line "${status}"`)
  await click('tl-reset'); await toolsIdle()
  after = await shown()
  check(sameHeight(after.height, tlsrc.height) && after.unit.includes('units') || sameHeight(after.height, tlsrc.height), `tools: back to the file (${after.height.join(' … ')}, ${after.unit})`)

  // glTF means meters: a model in a known unit is scaled when it is written as GLB (a file in unknown units is written as it is)
  await open('bracket.stl')
  const brk = await shown()
  const asUnknown = await exportCopy('glb', { 'ex-up': 'y' })
  check(!asUnknown.error && sameHeight((await reopen(asUnknown)).height, brk.height), 'GLB of a model without a unit is written as it is')
  await open('bracket.stl')
  await ev(`document.getElementById('tl-unit').value = 'mm'; document.getElementById('tl-unit-to').value = 'mm'`)
  await click('tl-assign'); await toolsIdle()
  const asMm = await exportCopy('glb', { 'ex-up': 'y' })
  const scaledNote = await ev(`document.getElementById('ex-notes').textContent`) // before the copy replaces the model on screen
  const mm = asMm.error ? null : await reopen(asMm)
  check(mm && sameHeight(mm.height, brk.height.map((v) => v / 1000)) && /meters/.test(mm.unit), `GLB of a millimeter model is in meters (${mm && mm.height.join(' … ')})`)
  check(/scaled from mm to meters/.test(scaledNote), 'the export section says the copy is scaled to meters')

  // a PLY stores no unit: the 3MF says meters and the export section warns about it
  await open('mesh.ply')
  const ply3 = await exportCopy('3mf')
  check(!ply3.error && /does not store a unit/.test(await ev(`document.getElementById('ex-notes').textContent`)), 'a model without a unit gets a note before it is written as 3MF')
  // ----- E3: shading, measuring modes, fit, isolate, explode, part opacity, filter, paint, examples, details
  await open('parts.glb')
  const press = (k, shift = false) => ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, shiftKey: ${shift}, bubbles: true }))`)
  const matOf = (i) => ev(`(() => { const m = window.__h.parts[${i}].obj.material; return { type: m.type, transparent: m.transparent, flat: !!m.flatShading, vc: !!m.vertexColors } })()`)
  for (const sh of ['xray', 'matcap', 'flat', 'vertex', 'normals', 'solid', 'original']) {
    await ev(`(() => { const s = document.getElementById('shading'); s.value = ${JSON.stringify(sh)}; s.dispatchEvent(new Event('change')) })()`)
    await sleep(120)
    const m = await matOf(4)
    const ok = { xray: m.type === 'MeshBasicMaterial' && m.transparent, matcap: m.type === 'MeshMatcapMaterial', flat: m.flat, vertex: m.type === 'MeshBasicMaterial' || m.type === 'MeshStandardMaterial', normals: m.type === 'MeshNormalMaterial', solid: m.type === 'MeshStandardMaterial', original: m.type === 'MeshStandardMaterial' }[sh]
    check(ok, `shading "${sh}" gives ${m.type}${m.flat ? ' (flat)' : ''}`)
  }
  // measuring modes: clicks on the model through the real raycaster
  const clickAt = (fx, fy) => ev(`(() => { const c = document.getElementById('gl'); const r = c.getBoundingClientRect(); const x = r.left + r.width * ${fx}, y = r.top + r.height * ${fy}
    const o = { clientX: x, clientY: y, button: 0, bubbles: true, pointerId: 1, isPrimary: true }; c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new PointerEvent('pointerup', o)) })()`)
  const outText = () => ev(`document.getElementById('measure-out').textContent`)
  for (const [mode, pts, rx] of [['distance', [[0.45, 0.55], [0.6, 0.6]], /Distance/], ['angle', [[0.4, 0.6], [0.5, 0.55], [0.6, 0.62]], /Angle: [\d.]+°/], ['circle', [[0.42, 0.6], [0.5, 0.52], [0.58, 0.62]], /Diameter/], ['edge', [[0.5, 0.58]], /Edge length/]]) {
    await ev(`(() => { const s = document.getElementById('measure-mode'); s.value = ${JSON.stringify(mode)}; s.dispatchEvent(new Event('change')) })()`)
    for (const [fx, fy] of pts) await clickAt(fx, fy)
    check(rx.test(await outText()), `measure mode "${mode}": ${(await outText()).slice(0, 80)}`)
  }
  await press('Escape')
  // F fits, I isolates (Shift+I shows all), double-click selects a part
  await clickAt(0.5, 0.6)
  await press('f')
  await press('i')
  const iso = await ev(`document.querySelectorAll('.part:not(.off)').length`)
  check(iso <= 1, `I shows only the selected part (${iso} visible rows)`)
  await press('i', true)
  check((await ev(`document.querySelectorAll('.part.off').length`)) === 0, 'Shift+I shows all parts again')
  // explode moves parts apart; an export always writes them in place
  const ex0 = await shown()
  const place0 = await ev(`window.__h.parts[1].obj.getWorldPosition(new window.__h.parts[1].obj.position.constructor()).toArray()`)
  await ev(`(() => { const e = document.getElementById('explode'); e.value = '60'; e.dispatchEvent(new Event('input')) })()`)
  const spread = await ev(`(() => { const ps = window.__h.parts; const a = ps[1].obj.getWorldPosition(new ps[1].obj.position.constructor()); return a.toArray().map((v) => +v.toFixed(3)) })()`)
  const cx = await exportCopy('glb', { 'ex-up': 'keep' })
  const cexp = cx.error ? null : await reopen(cx)
  check(cexp && sameExtent(cexp.extent, ex0.extent), `export while exploded writes the model in place (${cexp && cexp.extent.join(' x ')} vs ${ex0.extent.join(' x ')})`)
  check(Math.hypot(...spread.map((v, i) => v - place0[i])) > 0.05, `explode moved a part (${place0.map((v) => +v.toFixed(2))} to ${spread})`)
  // one part see-through
  await open('parts.glb')
  await ev(`document.querySelectorAll('.part .nm')[4].click()`)
  await ev(`(() => { const e = document.getElementById('part-opacity'); e.value = '40'; e.dispatchEvent(new Event('input')) })()`)
  const fade = await matOf(4)
  check(fade.transparent, 'part opacity: the selected part is see-through')
  // filter by name, material and color
  await ev(`(() => { const f = document.getElementById('filter'); f.value = 'table'; f.dispatchEvent(new Event('input')) })()`)
  await sleep(150)
  check((await ev(`document.querySelectorAll('.part').length`)) === 2, 'filter by name: "table" finds the top and the legs')
  await ev(`(() => { const f = document.getElementById('filter'); f.value = ''; f.dispatchEvent(new Event('input')) })()`)
  await sleep(150)
  const firstHex = await ev(`(() => { const rgb = getComputedStyle(document.querySelector('.part .sw')).backgroundColor.match(/\\d+/g).map(Number); return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('') })()`)
  await ev(`(() => { const f = document.getElementById('filter'); f.value = ${JSON.stringify(firstHex)}; f.dispatchEvent(new Event('input')) })()`)
  await sleep(150)
  check((await ev(`document.querySelectorAll('.part').length`)) >= 1, `filter by color: ${firstHex} finds its part`)
  // painted 3MF, details with the mesh check, Copy details, start-page examples
  await open('parts-production.3mf')
  check(/Painted colors/.test(await ev(`document.getElementById('warn').textContent`)), 'a painted 3MF says so')
  await open('mesh.ply')
  await waitFor(`[...document.querySelectorAll('#stats dt, #stats-more dt')].some((e) => e.textContent === 'Watertight')`, 20000, 'the background mesh check')
  check(/Watertight[\s\S]*yes/.test(await ev(`document.getElementById('stats').textContent`)) && /Volume/.test(await ev(`document.getElementById('stats').textContent`)), 'Details: watertight and volume appear after the mesh check')
  await ev(`document.getElementById('b-copy-details').click()`)
  check(/Details copied|Copying is not possible/.test(await ev(`document.getElementById('msg-text').textContent`)), 'Copy details answers')
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?nodoc=1&lang=en` })
  await sleep(300)
  await waitFor(`document.documentElement.dataset.state === 'start'`, 20000, 'the start page')
  check((await ev(`document.querySelectorAll('#drop-explain li').length`)) === 10, 'the start page explains the formats')
  for (const [key, parts] of [['table', 8], ['torus', 1], ['cloud', 1]]) {
    await ev(`document.querySelector('#drop button[data-example="${key}"]').click()`)
    await waitFor(`document.documentElement.dataset.state === 'ok'`, 20000, `example ${key}`)
    check((await shown()).parts === parts, `example "${key}" opens with ${parts} part(s)`)
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?nodoc=1&lang=en` })
    await sleep(300)
    await waitFor(`document.documentElement.dataset.state === 'start' || document.documentElement.dataset.state === 'ok'`, 20000, 'the start page again')
    await ev(`(async () => { const r = indexedDB.databases ? await indexedDB.databases() : []; for (const d of r) indexedDB.deleteDatabase(d.name) })()`)
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?nodoc=1&lang=en` })
    await sleep(300)
    await waitFor(`document.documentElement.dataset.state === 'start'`, 20000, 'the start page')
  }

  // parts: remove, merge, decimate, check
  await open('parts.glb')
  const tpsrc = await shown()
  await ev(`document.querySelector('.part input').click()`)
  await click('tl-remove-hidden'); await toolsIdle()
  check((await shown()).parts === tpsrc.parts - 1, `tools: remove hidden parts (${(await shown()).parts} left)`)
  await click('tl-merge'); await toolsIdle()
  const merged = await shown()
  check(merged.parts === 1, `tools: merge visible parts (${merged.parts} part)`)
  c = await exportCopy('glb')
  const mAgain = c.error ? null : await reopen(c)
  check(mAgain && mAgain.parts === 1 && mAgain.tris === merged.tris, `tools: the merged copy exports and opens (${mAgain && mAgain.tris} triangles)`)
  await open('parts.glb')
  await ev(`(() => { const k = document.getElementById('tl-keep'); k.value = '30'; k.dispatchEvent(new Event('input')); const d = document.getElementById('tl-detail'); d.value = 'target' })()`)
  const trisBefore = (await shown()).tris
  await click('tl-decimate'); await toolsIdle()
  const dec = await shown()
  check(dec.tris < trisBefore * 0.5 && dec.tris > 20, `tools: decimate ${trisBefore} to ${dec.tris} triangles`)
  check(/Decimated: /.test(await result()) && !(await ev(`document.getElementById('tl-thumbs').hidden`)), 'tools: decimate shows its numbers and the before and after pictures')
  const thumbs = await ev(`(() => { const a = document.getElementById('tl-cv-before'), b = document.getElementById('tl-cv-after'); return [a.width, b.width] })()`)
  check(thumbs[0] > 100 && thumbs[1] > 100, `tools: pictures drawn (${thumbs.join(' x ')})`)
  c = await exportCopy('glb')
  const dAgain = c.error ? null : await reopen(c)
  check(dAgain && dAgain.tris === dec.tris, `tools: the decimated copy exports ${dAgain && dAgain.tris} triangles`)
  await open('parts.glb') // the copy replaced the model: a fresh one for the reset check
  await click('tl-decimate'); await toolsIdle()
  await click('tl-reset'); await toolsIdle()
  const afterReset = await shown()
  check(afterReset.tris === trisBefore, `tools: reset restores the triangles (${afterReset.tris} vs ${trisBefore})`)
  await open('mesh.ply') // a torus: closed
  await click('tl-check-btn'); await toolsIdle()
  const ck = await ev(`document.getElementById('tl-check').textContent`)
  check(/Closed \(watertight\): yes/.test(ck) && /Volume/.test(ck), `tools: mesh check says "${ck.slice(0, 120)}"`)
  await open('cloud.ply')
  await click('tl-check-btn'); await toolsIdle()
  check(/No mesh to check/.test(await ev(`document.getElementById('tl-check').textContent`)), 'tools: a point cloud has no surface to check')

  // ----- point clouds
  await open('cloud.ply')
  const csrc = await shown()
  for (const fmt of ['ply', 'glb', 'obj', 'glbc']) {
    c = await exportCopy(fmt)
    if (c.error) { check(false, `cloud ${fmt}: ${c.error}`); continue }
    const again = await reopen(c)
    check(again.points === csrc.points, `cloud.ply -> ${fmt}: ${again.points} points = ${csrc.points}`)
    await open('cloud.ply')
  }
  c = await exportCopy('stl')
  check(!!c.error, 'cloud.ply -> stl: refused (a point cloud has no triangles)')
  c = await exportCopy('3mf')
  check(!!c.error, 'cloud.ply -> 3mf: refused')

  // ----- Gaussian splats (E7): the splat renderer shows PLY splat files and .splat/.spz; the points stay underneath for the tools and the export
  for (const f of ['splat.ply', 'splat.splat', 'splat.spz']) {
    await open(f)
    await waitFor(`document.documentElement.dataset.splat === 'on' || document.documentElement.dataset.splat === 'failed'`, 30000, `${f} splats`)
    const sp = await ev(`(() => ({ splat: document.documentElement.dataset.splat, row: !document.getElementById('splat-row').hidden, mode: document.getElementById('splat-mode').value,
      pointsHidden: window.__h.parts.filter((p) => p.kind === 'points').every((p) => p.obj.layers.mask !== 1), n: window.__h.parts.filter((p) => p.kind === 'points').reduce((a, p) => a + p.verts, 0) }))()`)
    check(sp.splat === 'on' && sp.row && sp.mode === 'splat' && sp.pointsHidden && sp.n === 12000, `${f}: splats on, mode "splat", points hidden (${JSON.stringify(sp)})`)
    await ev(`(() => { const m = document.getElementById('splat-mode'); m.value = 'points'; m.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    check(await ev(`window.__h.parts.filter((p) => p.kind === 'points').every((p) => p.obj.layers.mask === 1)`), `${f}: "Points" shows the points again`)
    await ev(`(() => { const m = document.getElementById('splat-mode'); m.value = 'splat'; m.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    c = await exportCopy('glbc')
    if (c.error) check(false, `${f} -> compressed GLB: ${c.error}`)
    else check(/Gaussian splat/i.test(await ev(`document.getElementById('ex-notes').textContent`)), `${f} -> compressed GLB says it keeps only the colored points`)
  }
  await open('splat.ply')
  await waitFor(`document.documentElement.dataset.splat === 'on'`, 30000, 'splat.ply again')
  c = await exportCopy('ply')
  const sback = c.error ? null : await reopen(c)
  check(sback && sback.points === 12000, `splat.ply -> ply: the points come back (${sback && sback.points})`)
  // the picture of a splat file: the splats are drawn in it (the transparent mode too), not only the points under them
  await open('splat.ply')
  await waitFor(`document.documentElement.dataset.splat === 'on'`, 30000, 'splat.ply for the picture')
  {
    c = await exportCopy('png', { 'ex-png-size': '0' })
    const cover = c.error ? -1 : await ev(`(async () => { const bmp = await createImageBitmap(new Blob([new Uint8Array(window.__savedData)])); const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, bmp.width, bmp.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n / (bmp.width * bmp.height) })()`)
    check(cover > 0.02, `splat.ply -> png: the model covers ${(cover * 100).toFixed(1)} % of the picture`)
  }
  // the points of the three splat files are the same scene: positions and (linear) colors agree within what each format stores
  const probe = async (f) => {
    await open(f)
    return ev(`(() => { const g = window.__h.parts.find((p) => p.kind === 'points').obj.geometry; const P = g.getAttribute('position'), C = g.getAttribute('color'); const n = P.count
      let r = 0, gg = 0, b = 0; for (let i = 0; i < n; i++) { r += C.getX(i); gg += C.getY(i); b += C.getZ(i) }
      return { n, p: [P.getX(100), P.getY(100), P.getZ(100)], c: [r / n, gg / n, b / n] } })()`)
  }
  const refPts = await probe('splat.ply')
  for (const f of ['splat.splat', 'splat.spz']) {
    const o = await probe(f)
    const dp = Math.max(...o.p.map((v, i) => Math.abs(v - refPts.p[i])))
    const dc = Math.max(...o.c.map((v, i) => Math.abs(v - refPts.c[i])))
    check(o.n === refPts.n && dp < 0.01 && dc < 0.02, `${f}: the same points as splat.ply (${o.n}; position differs by ${dp.toFixed(4)}, mean colour by ${dc.toFixed(4)})`)
  }
  // a file opened after a splat file drops the splats (feeding the next file, no page reload)
  await open('splat.ply')
  await waitFor(`document.documentElement.dataset.splat === 'on'`, 30000, 'splat.ply before the next file')
  const next = await reopen({ name: 'cloud.ply', bytes: readFileSync(join(samples, 'cloud.ply')) })
  check(next.points > 0 && (await ev(`document.documentElement.dataset.splat === undefined && document.getElementById('splat-row').hidden`)), 'a plain point cloud fed after a splat file: no splat mode, the splats are gone')
  // a tool changes the points: the splats would not fit any more, so they go and the points stay
  await open('splat.ply')
  await waitFor(`document.documentElement.dataset.splat === 'on'`, 30000, 'splat.ply before a tool')
  await ev(`document.getElementById('tl-scale').value = '2'`)
  await ev(`document.getElementById('tl-scale-go').click()`)
  await waitFor(`document.documentElement.dataset.tools === 'idle' && !document.getElementById('tl-result').textContent.startsWith('Working')`, 60000, 'the scale tool')
  check((await ev(`document.documentElement.dataset.splat`)) === undefined && (await ev(`window.__h.parts.filter((p) => p.kind === 'points').every((p) => p.obj.layers.mask === 1)`)), 'a tool changes the points: the splats go, the points show')
  // Spark cannot be had (blocked, like a frame that does not allow it): a splat PLY stays visible as points with a note, a .splat file says it cannot be read
  await send('Network.enable')
  await send('Network.setBlockedURLs', { urls: ['*spark.module.js*'] })
  await open('splat.ply')
  await waitFor(`document.documentElement.dataset.splat === 'failed'`, 30000, 'the splat renderer to fail')
  const nosp = await shown()
  check(nosp.points === 12000 && /splat renderer could not start/i.test(await ev(`document.getElementById('warn').textContent`)), 'splat.ply without the renderer: the points stay and the details say why')
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?file=${encodeURIComponent(join(samples, 'splat.splat'))}&lang=en` })
  await sleep(300)
  await waitFor(`document.documentElement.dataset.state === 'error' || document.documentElement.dataset.state === 'ok'`, 30000, 'a .splat file without the renderer')
  check((await ev(`document.documentElement.dataset.state`)) === 'error', '.splat without the renderer: a message, not a hang')
  await send('Network.setBlockedURLs', { urls: [] })

  await open('cloud.ply')
  check(await ev(`document.documentElement.dataset.splat === undefined && document.getElementById('splat-row').hidden`), 'a plain point cloud has no splat mode (and opening it drops the splats of the file before)')

  // ----- E2a: glTF forms (Draco, KTX2, .gltf with separate files), the cost check, and folders
  await open('parts.glb')
  const partsRef = await shown()
  await open('textured.glb')
  const texRef = await shown()
  const note = () => ev(`document.getElementById('warn').textContent`)
  if (withCompressed) {
    await open('draco.glb')
    const d = await shown()
    // the Draco encoder drops the degenerate triangles of parts.glb (1832 -> 1752; the reference decoder in draco3dgltf reads 1752 as well)
    check(d.tris > 0.9 * partsRef.tris && d.tris <= partsRef.tris && d.parts === partsRef.parts && sameExtent(d.extent, partsRef.extent), `draco.glb opens: ${d.tris} triangles, ${d.parts} parts, extent ${d.extent} (parts.glb: ${partsRef.tris}, ${partsRef.parts}, ${partsRef.extent})`)
    await open('ktx2.glb')
    const k = await shown()
    check(k.tris === texRef.tris && /KTX2/.test(await note()), `ktx2.glb: the geometry opens (${k.tris} triangles) and a note says its KTX2 textures cannot be decoded here`)
  } else results.push('skip draco.glb / ktx2.glb (set MV3D_TOOLS)')
  await open('embedded.gltf')
  const em = await shown()
  check(em.tris === texRef.tris && em.textures && /meters/.test(em.unit.replace('(glTF)', 'meters')) && em.unit.includes('glTF'), `embedded.gltf opens like textured.glb (${em.tris} triangles, textures, unit "${em.unit}")`)
  // files chosen together: the .gltf finds its .bin and its picture
  const chooseFiles = async (names, sel = '#file-input') => {
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?nodoc=1&lang=en` })
    await sleep(300)
    await waitFor(`document.documentElement.dataset.state === 'start'`, 20000, 'the start page')
    await send('DOM.enable')
    const doc = await send('DOM.getDocument')
    const inp = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: sel })
    await send('DOM.setFileInputFiles', { files: names.map((n) => join(samples, n)), nodeId: inp.result.nodeId })
    await waitFor(`['ok', 'error'].includes(document.documentElement.dataset.state) || !document.getElementById('drop-note').hidden || !document.getElementById('drop-gate').hidden`, 30000, 'the files to open')
  }
  await chooseFiles(['split.gltf', 'split.bin', 'split-tex.png'])
  const sp = await shown()
  check(sp.state === 'ok' && sp.tris === texRef.tris && sp.textures, `split.gltf + split.bin + split-tex.png: ${sp.tris} triangles with the texture`)
  check(!/were not found/.test(await note()), 'split.gltf with its picture: no missing-picture note')
  await chooseFiles(['split.gltf', 'split.bin'])
  check((await shown()).state === 'ok' && /were not found/.test(await note()), 'split.gltf without its picture: opens with a note that the picture was not found')
  await chooseFiles(['split.gltf'])
  const lost = await ev(`document.getElementById('msg-text').textContent + ' ' + document.getElementById('drop-note').textContent`)
  check(/split\.bin/.test(lost) && /Drop the \.gltf together/.test(lost), `split.gltf alone: the message names the missing file ("${lost.slice(0, 90)}…")`)
  // a folder dropped on the view (its directory entries are read): a .gltf in a sub-folder finds its .bin beside it and its picture in a sub-folder
  {
    const folder = join(dir, 'dropped', 'model')
    mkdirSync(join(folder, 'tex'), { recursive: true })
    copyFileSync(join(samples, 'split.bin'), join(folder, 'split.bin'))
    copyFileSync(join(samples, 'split-tex.png'), join(folder, 'tex', 'picture one.png'))
    const g = JSON.parse(readFileSync(join(samples, 'split.gltf'), 'utf8'))
    for (const im of g.images) im.uri = 'tex/picture%20one.png'
    writeFileSync(join(folder, 'scene.gltf'), JSON.stringify(g))
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?nodoc=1&lang=en` })
    await sleep(300)
    await waitFor(`document.documentElement.dataset.state === 'start'`, 20000, 'the start page')
    for (const type of ['dragEnter', 'dragOver', 'drop']) await send('Input.dispatchDragEvent', { type, x: 300, y: 300, data: { items: [], files: [folder], dragOperationsMask: 1 } })
    await waitFor(`['ok', 'error'].includes(document.documentElement.dataset.state)`, 30000, 'the dropped folder to open')
    const fo = await shown()
    check(fo.state === 'ok' && fo.tris === texRef.tris && fo.textures && !/were not found/.test(await note()), `a dropped folder: scene.gltf opens with its .bin and its picture from a sub-folder (${fo.tris} triangles)`)
  }
  // the cost check: a GLB whose pictures say they are huge is asked about before anything is decoded
  {
    const { gltfToGlb } = await import(join(here, '..', 'editor', 'gltf-pack.js'))
    const fakePng = new Uint8Array(64)
    fakePng.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])
    new DataView(fakePng.buffer).setUint32(16, 16384)
    new DataView(fakePng.buffer).setUint32(20, 16384)
    const bin = new Uint8Array(44)
    new Float32Array(bin.buffer, 0, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0])
    new Uint16Array(bin.buffer, 36, 3).set([0, 1, 2])
    const doc = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }], buffers: [{ byteLength: 44, uri: 'b.bin' }],
      images: Array.from({ length: 6 }, (_, i) => ({ uri: `i${i}.png` })) }
    const glb = gltfToGlb(doc, (uri) => (uri === 'b.bin' ? bin : fakePng)).glb
    writeFileSync(join(samples, 'costly.glb'), Buffer.from(glb))
    await chooseFiles(['costly.glb'])
    check(await ev(`!document.getElementById('drop-gate').hidden && /graphics memory/.test(document.getElementById('drop-gate-text').textContent)`), 'a GLB whose pictures cost over 1.5 GB of graphics memory: the person is asked first')
    check((await ev(`document.documentElement.dataset.state`)) !== 'ok', 'nothing was decoded before the answer')
  }

  // ----- E2b: FBX, PCD, XYZ, G-code, and the USDZ notice
  const unitText = () => ev(`(() => { const dt = [...document.querySelectorAll('#stats dt, #stats-more dt')].map((e) => e.textContent); const dd = [...document.querySelectorAll('#stats dd, #stats-more dd')].map((e) => e.textContent); return dd[dt.indexOf('Unit')] || '' })()`)
  for (const f of ['box.fbx', 'box-bin.fbx']) {
    for (const as of ['', '&astext=1']) {
      if (as && f !== 'box.fbx') continue
      await open(f, as)
      const fb = await shown()
      check(fb.tris === 12 && fb.parts === 1 && sameExtent(fb.extent, [1, 0.5, 0.8]) && /cm \(from the FBX file\)/.test(await unitText()), `${f}${as ? ' (as text, like Orca\'s text editor)' : ''}: 12 triangles, 1 x 0.5 x 0.8 cm from the file's unit`)
    }
  }
  // double precision PLY (three.js r185 returns Float64 attributes: they must be drawn, not throw at the first frame)
  for (const [f, tris, pts] of [['cloud-double.ply', 0, 500], ['mesh-double.ply', 12, 0]]) {
    await open(f)
    const dd = await shown()
    const drawn = await ev(`(() => { const { renderer, scene, camera } = window.__h; try { renderer.render(scene, camera); return renderer.info.render.calls > 0 } catch (e) { return String(e.message) } })()`)
    check(dd.tris === tris && dd.points === pts && drawn === true, `${f}: opens and draws (${dd.tris} triangles, ${dd.points} points, drawn: ${drawn})`)
  }
  // a Z-up FBX (as Blender writes it): since three.js r184 the loader turns it to Y up, so its 0.8 tall axis (z in the file) is the height
  await open('box-zup.fbx')
  const zup = await shown()
  check(zup.tris === 12 && sameHeight(zup.height, [-0.4, 0.4]), `box-zup.fbx: a Z-up FBX stands up, its 0.8 tall axis is the height (${zup.height})`)
  await open('box-bin.fbx')
  c = await exportCopy('glb')
  const fbxBack = c.error ? null : await reopen(c)
  check(fbxBack && fbxBack.tris === 12, `box-bin.fbx -> glb opens again (${fbxBack && fbxBack.tris} triangles)`)
  for (const [f, n, as] of [['cloud.pcd', 4000, ''], ['cloud-bin.pcd', 4000, ''], ['cloud.pcd', 4000, '&astext=1'], ['cloud.xyz', 3000, '&astext=1'], ['cloud.xyz', 3000, '']]) {
    await open(f, as)
    const pc = await shown()
    check(pc.points === n && pc.tris === 0, `${f}${as ? ' (as text)' : ''}: ${pc.points} points`)
  }
  {
    // colors: the helix of cloud.pcd runs through red-ish and green-ish values, so the colors are not all one
    await open('cloud-bin.pcd')
    const spread = await ev(`(() => { const g = window.__h.parts.find((p) => p.kind === 'points').obj.geometry.getAttribute('color'); if (!g) return -1; let lo = 9, hi = -9; for (let i = 0; i < g.count; i++) { lo = Math.min(lo, g.getX(i)); hi = Math.max(hi, g.getX(i)) } return hi - lo })()`)
    check(spread > 0.3, `cloud-bin.pcd: the points carry their colors (spread of red ${spread.toFixed(2)})`)
  }
  for (const as of ['', '&astext=1']) {
    await open('print.gcode', as)
    const gc = await shown()
    const g = await ev(`(() => ({ parts: window.__h.parts.map((p) => ({ kind: p.kind, visible: p.visible, shown: p.obj.visible, verts: p.verts })), warn: document.getElementById('warn').textContent }))()`)
    check(gc.parts === 2 && g.parts[0].kind === 'lines' && g.parts[0].visible && g.parts[1].visible === false && g.parts[1].shown === false, `print.gcode${as ? ' (as text)' : ''}: an extrusion part and a hidden travel part`)
    check(sameExtent(gc.extent, [20, 20, 0.8]) && /5 layer/.test(g.warn) && /195 extrusion/.test(g.warn), `print.gcode: the extent is the print's (${gc.extent}), ${/(\d+) layer/.exec(g.warn)?.[1]} layers, 195 extrusion segments`)
    if (as) continue
    check(/millimeters \(G-code\)/.test(await unitText()), 'print.gcode: millimeters, Z up')
  }
  await open('print.gcode')
  c = await exportCopy('glb')
  check(!!c.error && /nothing/i.test(c.error), 'print.gcode: no export (a toolpath is lines, which the writers do not take)')
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?file=${encodeURIComponent(join(samples, 'usdc-stub.usdz'))}&lang=en` })
  await waitFor(`/USDZ/.test(document.getElementById('msg-text').textContent)`, 20000, 'the USDZ notice')
  check(/binary USD/.test(await ev(`document.getElementById('msg-text').textContent`)), 'a USDZ with a .usdc entry: the notice says it holds binary USD')

  // ----- values: known shapes (cube, sphere, torus) in STL, OBJ and GLB, in mm-like units and in meters: what the viewer shows is compared with
  // numbers worked out here from the triangles, not matched by a pattern
  {
    const cube = (a) => {
      const P = []
      for (const x of [0, a]) for (const y of [0, a]) for (const z of [0, a]) P.push(x, y, z)
      const quad = (i, j, k, l) => [i, j, k, i, k, l]
      // vertex index = x * 4 + y * 2 + z
      const I = [...quad(0, 1, 3, 2), ...quad(4, 6, 7, 5), ...quad(0, 4, 5, 1), ...quad(2, 3, 7, 6), ...quad(0, 2, 6, 4), ...quad(1, 5, 7, 3)]
      return { positions: Float32Array.from(P), indices: Uint32Array.from(I) }
    }
    const sphere = (r, depth) => {
      const V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
      let T = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]
      const cache = new Map()
      const mid = (a, b) => {
        const k = a < b ? `${a}_${b}` : `${b}_${a}`
        if (cache.has(k)) return cache.get(k)
        const m = V[a].map((v, i) => (v + V[b][i]) / 2)
        const l = Math.hypot(...m)
        V.push(m.map((v) => v / l))
        cache.set(k, V.length - 1)
        return V.length - 1
      }
      for (let d = 0; d < depth; d++) T = T.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]] })
      return { positions: Float32Array.from(V.flatMap((v) => v.map((x) => x * r))), indices: Uint32Array.from(T.flat()) }
    }
    const torus = (R, r, nu, nv) => {
      const P = []
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const u = (2 * Math.PI * i) / nu
        const v = (2 * Math.PI * j) / nv
        P.push((R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v))
      }
      const I = []
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const a = i * nv + j, b = ((i + 1) % nu) * nv + j, c = ((i + 1) % nu) * nv + ((j + 1) % nv), d = i * nv + ((j + 1) % nv)
        I.push(a, b, c, a, c, d)
      }
      return { positions: Float32Array.from(P), indices: Uint32Array.from(I) }
    }
    // volume (signed), area and bounding box worked out from the triangles
    const measureMesh = (m) => {
      let vol = 0, area = 0
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
      for (let t = 0; t < m.indices.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => [...m.positions.subarray(3 * m.indices[t + k], 3 * m.indices[t + k] + 3)])
        vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
        const u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i])
        area += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2
        for (const p of [a, b, c]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]) }
      }
      return { vol: Math.abs(vol), area, size: hi.map((v, i) => v - lo[i]), tris: m.indices.length / 3 }
    }
    const writeStl = (m, file) => {
      const n = m.indices.length / 3
      const b = Buffer.alloc(84 + 50 * n)
      b.write('binary stl made by the e2e test', 0)
      b.writeUInt32LE(n, 80)
      for (let t = 0; t < n; t++) {
        const p = [0, 1, 2].map((k) => [...m.positions.subarray(3 * m.indices[3 * t + k], 3 * m.indices[3 * t + k] + 3)])
        const u = p[1].map((v, i) => v - p[0][i]), w = p[2].map((v, i) => v - p[0][i])
        const nr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
        const l = Math.hypot(...nr) || 1
        const o = 84 + 50 * t
        nr.forEach((v, i) => b.writeFloatLE(v / l, o + 4 * i))
        p.flat().forEach((v, i) => b.writeFloatLE(v, o + 12 + 4 * i))
      }
      writeFileSync(join(samples, file), b)
    }
    const writeObj = (m, file) => {
      const L = []
      for (let i = 0; i < m.positions.length; i += 3) L.push(`v ${m.positions[i]} ${m.positions[i + 1]} ${m.positions[i + 2]}`)
      for (let t = 0; t < m.indices.length; t += 3) L.push(`f ${m.indices[t] + 1} ${m.indices[t + 1] + 1} ${m.indices[t + 2] + 1}`)
      writeFileSync(join(samples, file), L.join('\n') + '\n')
    }
    const writeGlbScaled = (m, file, k) => writeFileSync(join(samples, file), Buffer.from(writeGLB([{ name: 'shape', kind: 'mesh', positions: m.positions.map((v) => v * k), indices: m.indices, color: null }])))
    const shapes = { cube: cube(10), sphere: sphere(10, 5), torus: torus(20, 5, 48, 24) }
    const exp = Object.fromEntries(Object.entries(shapes).map(([k, m]) => [k, measureMesh(m)]))
    const detailText = (label) => ev(`(() => { const dt = [...document.querySelectorAll('#stats dt, #stats-more dt')].map((e) => e.textContent); const dd = [...document.querySelectorAll('#stats dd, #stats-more dd')].map((e) => e.textContent); return dd[dt.indexOf(${JSON.stringify(label)})] || '' })()`)
    const num = (txt) => Number((String(txt).match(/-?[\d,]*\.?\d+(?:e-?\d+)?/i) || ['NaN'])[0].replace(/,/g, ''))
    const inUnit = (txt, base) => { // a volume or area text with its unit ("1.2 cm³", "40 mm²") in the base unit (m, as the file's unit)
      const f = { mm: 1e-3, cm: 1e-2, m: 1, units: 1, in: 0.0254 }
      const m = /([a-zµ]+)([²³])/.exec(txt)
      return num(txt) * (f[m ? m[1] : 'units'] ** (m && m[2] === '³' ? 3 : 2))
    }
    const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-12)
    for (const [name, m] of Object.entries(shapes)) {
      writeStl(m, `v-${name}.stl`)
      writeObj(m, `v-${name}.obj`)
      writeGlbScaled(m, `v-${name}-m.glb`, 0.001) // the same shape made in millimeters, written in meters
    }
    for (const [name, e] of Object.entries(exp)) {
      for (const [ext, scale, unitText] of [['stl', 1, 'units'], ['obj', 1, 'm'], ['-m.glb', 0.001, 'm']]) {
        const file = ext.startsWith('-') ? `v-${name}${ext}` : `v-${name}.${ext}`
        await open(file)
        await waitFor(`[...document.querySelectorAll('#stats dt, #stats-more dt')].some((d) => d.textContent === 'Volume')`, 30000, `${file} volume`)
        const sh = await shown()
        check(sh.tris === e.tris, `${file}: ${sh.tris} triangles (expected ${e.tris})`)
        const ext3 = await ev(`[...document.querySelectorAll('#info-dims-row .dim-n')].map((e) => Number(e.textContent.replace(/,/g, '')))`) // the three sizes are the row X, Y, Z at the top of the Info card (UX v3 round 4)
        const wantSize = [...e.size].map((v) => v * scale)
        check(ext3.length === 3 && [...ext3].sort((a, b) => a - b).every((v, i) => near(v, [...wantSize].sort((a, b) => a - b)[i], 0.02)), `${file}: size ${ext3.join(' x ')} (expected about ${wantSize.map((v) => +v.toPrecision(3)).join(' x ')})`)
        const vol = await detailText('Volume')
        const area = await detailText('Surface area')
        check(near(inUnit(vol), e.vol * scale ** 3, 0.01) || (unitText === 'units' && near(num(vol), e.vol, 0.01)), `${file}: volume "${vol}" (expected ${+(e.vol * scale ** 3).toPrecision(4)} in the file's unit)`)
        check(near(inUnit(area), e.area * scale ** 2, 0.01) || (unitText === 'units' && near(num(area), e.area, 0.01)), `${file}: area "${area}" (expected ${+(e.area * scale ** 2).toPrecision(4)})`)
        check(!sh.textures, `${file}: no Texture row (the matcap picture of the shading is not the model's)`)
        check(await ev(`document.getElementById('b-tex').hidden`), `${file}: there is no Texture button for a model without textures`)
      }
    }
    // Decimate works on an STL (a triangle soup with a normal per corner) as on an indexed mesh
    await open('v-sphere.stl')
    await ev(`(() => { const k = document.getElementById('tl-keep'); k.value = '50'; k.dispatchEvent(new Event('input')); document.getElementById('tl-detail').value = 'target' })()`)
    await click('tl-decimate'); await toolsIdle()
    const dsph = await shown()
    check(dsph.tris <= exp.sphere.tris * 0.55 && dsph.tris > 0, `Decimate on an STL sphere: ${exp.sphere.tris} -> ${dsph.tris} triangles (at most 55 %)`)
    check(/Decimated/.test(await result()), `the report says what was done ("${(await result()).slice(0, 50)}")`)
    // an STL cube turned inside out: closed, but the normals point inward
    const inv = { positions: shapes.cube.positions, indices: Uint32Array.from(shapes.cube.indices, (v, i) => shapes.cube.indices[i - (i % 3) + [0, 2, 1][i % 3]]) }
    writeStl(inv, 'v-cube-inside-out.stl')
    await open('v-cube-inside-out.stl')
    await waitFor(`[...document.querySelectorAll('#stats dt, #stats-more dt')].some((d) => d.textContent === 'Volume')`, 30000, 'the check of the inside-out cube')
    check(/inward/i.test(await detailText('Normals')), 'a cube turned inside out: the details say the normals point inward')
    // edge length: a click in the middle of a face measures a model edge (10), not the diagonal of the triangulation (14.1)
    await open('v-cube.stl')
    const clickWorld = (p) => ev(`(() => { const h = window.__h; const o = h.parts[0].obj; o.updateWorldMatrix(true, false); const V = o.position.constructor; const v = new V(${p[0]}, ${p[1]}, ${p[2]}).applyMatrix4(o.matrixWorld).project(h.camera); const c = document.getElementById('gl'); const r = c.getBoundingClientRect(); const x = r.left + r.width * (v.x + 1) / 2, y = r.top + r.height * (1 - v.y) / 2; const op = { clientX: x, clientY: y, button: 0, bubbles: true, pointerId: 1, isPrimary: true }; c.dispatchEvent(new PointerEvent('pointerdown', op)); c.dispatchEvent(new PointerEvent('pointerup', op)) })()`)
    await ev(`(() => { const s = document.getElementById('measure-mode'); s.value = 'edge'; s.dispatchEvent(new Event('change')) })()`)
    await ev(`(() => { const b = document.getElementById('b-measure'); if (b.getAttribute('aria-pressed') !== 'true') b.click() })()`)
    await clickWorld([5, 5, 10])
    const edgeText = await ev(`document.getElementById('measure-out').textContent`)
    check(near(num(edgeText.split(':')[1]), 10, 0.01) && !/Triangle edge/.test(edgeText), `edge length in the middle of a cube face: "${edgeText.slice(0, 60)}" (a model edge of 10, not the diagonal 14.1)`)
    await press('Escape')
    // an OBJ with one face that names a vertex that is not there: the rest of the file opens, with a note
    writeFileSync(join(samples, 'v-bad-face.obj'), 'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\nf 1 3 4\nf 1 2 99\n')
    await open('v-bad-face.obj')
    check((await shown()).tris === 2 && /left out/.test(await ev(`document.getElementById('warn').textContent`)), 'an OBJ with one bad face: 2 triangles open, a note says one was left out')
    // a binary STL that reached the text editor: a clear message instead of nonsense
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?file=${encodeURIComponent(join(samples, 'v-torus.stl'))}&lang=en&astext=1` })
    await sleep(300)
    await waitFor(`['ok', 'error'].includes(document.documentElement.dataset.state)`, 30000, 'the binary STL given as text')
    check((await ev(`document.documentElement.dataset.state`)) === 'error' && /binary file/.test(await ev(`document.getElementById('msg-text').textContent`)), 'a binary STL that reached the text editor: a clear message (drop it instead), not nonsense')
    // GLB from a model without a unit: the export says that its numbers become meters
    await open('v-cube.stl')
    await click('b-export')
    await ev(`(() => { const f = document.getElementById('ex-format'); f.value = 'glb'; f.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    check(/stores no unit/.test(await ev(`document.getElementById('ex-notes').textContent`)), 'STL to GLB: the export panel says the model has no unit and its numbers become meters')
    // the view: a narrow, tall panel still shows the whole model after loading
    await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 720, deviceScaleFactor: 1, mobile: false })
    await open('v-torus.stl')
    await sleep(300)
    const inside = await ev(`(() => { const h = window.__h; const o = h.parts[0].obj; o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; o.updateWorldMatrix(true, false); const V = o.position.constructor; let worst = 0; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { const v = new V(x, y, z).applyMatrix4(o.matrixWorld).project(h.camera); worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y)) } return worst })()`)
    check(inside < 1, `a 360 x 720 view shows the whole torus after loading (largest screen coordinate ${inside.toFixed(2)}, must be under 1)`)
    await send('Emulation.clearDeviceMetricsOverride')
    // German: an angle is written with a decimal comma
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?file=${encodeURIComponent(join(samples, 'parts.glb'))}&lang=de` })
    await sleep(300)
    await waitFor(`document.documentElement.dataset.state === 'ok'`, 60000, 'parts.glb in German')
    await sleep(600) // the view settles after the window size came back
    await ev(`(() => { const b = document.getElementById('b-measure'); if (b.getAttribute('aria-pressed') !== 'true') b.click() })()`)
    await ev(`(() => { const s = document.getElementById('measure-mode'); s.value = 'angle'; s.dispatchEvent(new Event('change')) })()`)
    for (const [fx, fy] of [[0.4, 0.6], [0.5, 0.55], [0.6, 0.62]]) await clickAt(fx, fy)
    const angleDe = await ev(`document.getElementById('measure-out').textContent`)
    check(/Winkel: \d+,\d°/.test(angleDe), `German: the angle reads with a decimal comma ("${angleDe.slice(0, 60)}")`)
    await press('Escape')
  }

  // ----- a printing model (STL, millimeters, +Z up)
  await open('bracket.stl')
  const bsrc = await shown()
  c = await exportCopy('3mf')
  const b3 = c.error ? null : await reopen(c)
  check(b3 && b3.tris === bsrc.tris && /mm|millimeter/.test(b3.unit) && sameHeight(b3.height, bsrc.height), `bracket.stl -> 3mf: ${b3 && b3.tris} triangles, unit "${b3 && b3.unit}", height ${b3 && b3.height}`)
  await open('bracket.stl')
  c = await exportCopy('glb', { 'ex-up': 'y' })
  const bg = c.error ? null : await reopen(c)
  check(bg && bg.tris === bsrc.tris && sameExtent(bg.extent, bsrc.extent) && sameHeight(bg.height, bsrc.height), `bracket.stl -> glb (Z up turned to Y up): height ${bg && bg.height} = ${bsrc.height}`)

  // ----- 3MF with slicer layout in, plain 3MF out
  await open('parts-production.3mf')
  const psrc = await shown()
  c = await exportCopy('3mf')
  const p3 = c.error ? null : await reopen(c)
  check(p3 && p3.tris === psrc.tris && p3.parts === psrc.parts, `parts-production.3mf -> 3mf: ${p3 && p3.parts} objects, ${p3 && p3.tris} triangles`)

  // ----- PNG: transparent, a larger size, and as shown
  await open('parts.glb')
  c = await exportCopy('png', { 'ex-png-size': '1920', 'ex-png-bg': 'transparent' })
  if (c.error) check(false, `png: ${c.error}`)
  else {
    save(c)
    const info = await ev(`(async () => { const bmp = await createImageBitmap(new Blob([new Uint8Array(window.__savedData)])); const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0)
      const px = (x, y) => [...g.getImageData(x, y, 1, 1).data]; return { w: bmp.width, h: bmp.height, corner: px(0, 0), centre: px(bmp.width >> 1, bmp.height >> 1) } })()`)
    check(Math.max(info.w, info.h) === 1920, `png: ${info.w} x ${info.h}`)
    check(info.corner[3] === 0, `png: the corner is transparent (alpha ${info.corner[3]})`)
    const filled = await ev(`(async () => { const bmp = await createImageBitmap(new Blob([new Uint8Array(window.__savedData)])); const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, bmp.width, bmp.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n / (bmp.width * bmp.height) })()`)
    check(filled > 0.02 && filled < 0.9, `png: the model covers ${(filled * 100).toFixed(1)} % of the picture`)
  }
  c = await exportCopy('png', { 'ex-png-size': '0', 'ex-png-bg': 'shown' })
  const solid = c.error ? null : await ev(`(async () => { const bmp = await createImageBitmap(new Blob([new Uint8Array(window.__savedData)])); const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); return [...g.getImageData(1, 1, 1, 1).data] })()`)
  check(solid && solid[3] === 255, 'png: "as shown" keeps the background (opaque corner)')
  const view = await ev(`(() => { const c = document.getElementById('gl'); return { w: c.width, h: c.height, css: document.getElementById('stage').clientWidth } })()`)
  check(view.w > 0 && view.h > 0, `the view is drawn again after the export (${view.w} x ${view.h})`)

  // ----- turntable video
  c = await exportCopy('webm', { 'ex-seconds': '4' })
  if (c.error) check(false, `webm: ${c.error}`)
  else {
    const p = save(c)
    check(c.bytes.subarray(0, 4).toString('hex') === '1a45dfa3', `webm: EBML header, ${c.bytes.length} bytes`)
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', p], { encoding: 'utf8' })
    if (probe.status === 0) check(/vp[89]/.test(probe.stdout), `webm: ffprobe sees ${probe.stdout.trim()}`)
  }

  console.log(results.join('\n'))
  console.log(failures ? `\n${failures} check(s) failed` : `\nall ${results.length} checks passed`)
} catch (e) {
  console.log(results.join('\n'))
  console.error('ERROR', e.message)
  failures++
} finally {
  if (process.argv[2] === 'keep') console.log('copies kept in', out)
  chrome.kill()
  server.kill()
  await sleep(500)
  if (process.argv[2] !== 'keep') rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
process.exit(failures ? 1 : 0)
