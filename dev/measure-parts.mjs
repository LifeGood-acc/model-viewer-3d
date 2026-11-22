#!/usr/bin/env node
// Measures what the part card costs with many parts: a GLB with thousands of small boxes is made here (never committed), loaded, and the time
// of a click on one part, of a range of hundreds of parts and of the detailed numbers is taken, with the JS heap.   node dev/measure-parts.mjs [parts=3000]
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const plugin = join(here, '..')
const isStep = existsSync(join(plugin, 'samples', 'assembly.step'))
const dir = mkdtempSync(join(tmpdir(), 'studio-e2e-'))
const samples = join(dir, 'samples')
execFileSync('mkdir', ['-p', samples])
let modelFile
if (isStep) throw new Error('measure-parts.mjs makes a GLB: run it in the 3D Model Viewer')
else {
  execFileSync('python3', [join(here, 'make_samples.py'), '--out', samples], { stdio: 'ignore' })
  modelFile = join(samples, 'many.glb')
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rnd = Math.floor(Math.random() * 80)
const port = 8900 + rnd
const chromePort = 9400 + rnd
const server = spawn('python3', [join(here, 'harness_server.py'), String(port)], { stdio: 'ignore' })
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${chromePort}`, '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-first-run', '--enable-precise-memory-info',
  `--user-data-dir=${join(dir, 'profile')}`, 'about:blank'
], { stdio: 'ignore' })
let failures = 0
const results = []
const check = (ok, what) => {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  console.log(results.at(-1))
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?file=${encodeURIComponent(file)}&lang=en${extra}` })
  await sleep(300)
  await waitFor(`document.documentElement.dataset.state === 'ok'`, 90000, `${file} to load`)
}
// the studio section's controls, as a person would use them
const setCtl = (id, value) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); if (e.type === 'checkbox') e.checked = ${JSON.stringify(value)}; else e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event(e.tagName === 'SELECT' || e.type === 'checkbox' ? 'change' : 'input', { bubbles: true })) })()`)
const preset = (p) => setCtl('st-preset', p)
// draws a frame and reads the canvas in the same task (the drawing buffer is not kept): { w, h, px(x, y), data }
const frame = `(() => { const { renderer, scene, camera } = window.__h; renderer.render(scene, camera); const c = renderer.domElement; const cv = new OffscreenCanvas(c.width, c.height); const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0); return g.getImageData(0, 0, c.width, c.height) })()`
const pixels = (extra = '') => ev(`(() => { const d = ${frame}; const at = (x, y) => [...d.data.slice(4 * (y * d.width + x), 4 * (y * d.width + x) + 4)]; ${extra} })()`)
const corners = () => pixels(`return { w: d.width, h: d.height, tl: at(2, 2), bl: at(2, d.height - 3), tr: at(d.width - 3, 2), c: at(d.width >> 1, d.height >> 1) }`)
// frames are kept in the page (a canvas is millions of numbers: not sent through the debugger)
const snap = (name) => ev(`(() => { window.__f = window.__f || {}; window.__f[${JSON.stringify(name)}] = ${frame}.data; return true })()`)
// how many red-channel values of A are darker than B by more than `by` (in B's opaque pixels)
const darker = (a, b, by = 12) => ev(`(() => { const A = window.__f[${JSON.stringify(a)}], B = window.__f[${JSON.stringify(b)}]; let n = 0; for (let i = 0; i < A.length; i += 4) if (B[i] - A[i] > ${by} && A[i + 3] === 255) n++; return n })()`)
// the largest difference of the red channel between two frames, and how many values differ by more than `by`
const diff = (a, b, by = 20) => ev(`(() => { const A = window.__f[${JSON.stringify(a)}], B = window.__f[${JSON.stringify(b)}]; let n = 0, max = 0; for (let i = 0; i < A.length; i += 4) { const d = Math.abs(A[i] - B[i]); if (d > max) max = d; if (d > ${by}) n++ } return { n, max } })()`)

const N = Math.max(10, Number(process.argv[2]) || 3000)
const { writeGLB } = await import('../editor/shared/export.js')
const cubeP = (x, y, z, s) => { const P = []; for (const dx of [0, s]) for (const dy of [0, s]) for (const dz of [0, s]) P.push(x + dx, y + dy, z + dz); return Float32Array.from(P) }
const cubeI = Uint32Array.from([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5])
const side = Math.ceil(Math.sqrt(N))
const list = Array.from({ length: N }, (_, i) => ({ name: `box ${i}`, kind: 'mesh', positions: cubeP((i % side) * 1.5, 0, Math.floor(i / side) * 1.5, 1), indices: cubeI, normals: null, colors: null, color: [200, 120, 60] }))
writeFileSync(join(samples, 'many.glb'), writeGLB(list))
const heap = () => ev(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null`)
const clickRow = (i, mods = {}) => ev(`(() => { const t0 = performance.now(); document.querySelector('.part[data-i="${i}"]').dispatchEvent(new MouseEvent('click', { bubbles: true, ...${JSON.stringify(mods)} })); return performance.now() - t0 })()`)
const results2 = {}
try {
  let tries = 0
  let targets
  while (tries++ < 50) {
    targets = await fetch(`http://127.0.0.1:${chromePort}/json`).then((r) => r.json()).catch(() => null)
    if (targets) break
    await sleep(200)
  }
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)({ result: d.result, error: d.error }); pend.delete(d.id) } }
  await new Promise((r) => (ws.onopen = r))
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false })
  const t0 = Date.now()
  await open(modelFile)
  results2.parts = N
  results2.loadMs = Date.now() - t0
  results2.heapAfterLoadMB = await heap()
  results2.rows = await ev(`document.querySelectorAll('.part').length`)
  results2.clickOne = Math.round(await clickRow(0))
  results2.clickSecond = Math.round(await clickRow(1, { metaKey: true }))
  results2.heapWithCardMB = await heap()
  results2.clickRange = Math.round(await clickRow(Math.min(999, N - 1), { shiftKey: true }))
  results2.selected = await ev(`document.querySelectorAll('.part.sel').length`)
  results2.cardTris = await ev(`document.querySelector('#part-card') && !document.querySelector('#part-card').hidden ? [...document.querySelectorAll('#part-card dt')].find((d) => d.textContent === 'Triangles').nextElementSibling.textContent : null`)
  // the detailed numbers on a click (more than 50 parts: only on request)
  await ev(`(() => { const d = document.querySelector('#part-card details'); d.open = true; d.dispatchEvent(new Event('toggle')) })()`)
  await sleep(300)
  results2.moreWaitsForClick = await ev(`![...document.querySelectorAll('#part-card dt')].some((d) => d.textContent === 'Surface' && /\\d/.test(d.nextElementSibling.textContent)) && !![...document.querySelectorAll('#part-card button')].find((b) => b.textContent === 'Calculate')`)
  const c0 = Date.now()
  await ev(`[...document.querySelectorAll('#part-card button')].find((b) => b.textContent === 'Calculate').click()`)
  await waitFor(`[...document.querySelectorAll('#part-card dt')].some((d) => d.textContent === 'Surface' && /\\d/.test(d.nextElementSibling.textContent))`, 120000, 'the detailed numbers')
  results2.detailedMs = Date.now() - c0
  results2.heapAfterDetailedMB = await heap()
  await clickRow(0)
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  results2.escClears = await ev(`document.querySelectorAll('.part.sel').length === 0 && document.getElementById('part-card').hidden`)
  console.log(JSON.stringify(results2, null, 1))
} catch (e) {
  console.error('ERROR', e.message)
  failures++
} finally {
  chrome.kill()
  server.kill()
  await sleep(500)
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
process.exit(failures ? 1 : 0)
