#!/usr/bin/env node
// Fuzz test: feeds randomly damaged copies of the samples to the viewer (in Chrome, through the harness) and checks that
// every one ends as "ok" or "error" (a message), with no uncaught exception and no hang.
//   node dev/fuzz.mjs [variantsPerFile=30] [seed=1]        needs Google Chrome (or set CHROME) and python3
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// the samples are generated (not committed): into a temporary folder, so nothing lands in the plugin folder
const samples = mkdtempSync(join(tmpdir(), 'mv3d-samples-'))
execFileSync('python3', [join(here, 'make_samples.py'), '--out', samples], { stdio: 'ignore' })
if (process.env.MV3D_TOOLS) execFileSync('node', [join(here, 'make_compressed_samples.mjs'), samples, process.env.MV3D_TOOLS], { stdio: 'ignore' }) // Draco and KTX2 files too
const N = +process.argv[2] || 30
let seed = +process.argv[3] || 1
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const int = (n) => Math.floor(rnd() * n)

function mutate(buf, kind) {
  const b = Buffer.from(buf)
  switch (kind) {
    case 0: return b.subarray(0, int(b.length)) // truncate anywhere
    case 1: for (let i = 0, n = 1 + int(32); i < n; i++) b[int(b.length)] = int(256); return b // flip bytes
    case 2: { const a = int(b.length), l = 1 + int(Math.min(4096, b.length)); b.fill(0, a, Math.min(b.length, a + l)); return b } // zero a span
    case 3: { const a = int(b.length), l = 1 + int(512); return Buffer.concat([b.subarray(0, a), Buffer.from(Array.from({ length: l }, () => int(256))), b.subarray(a)]) } // insert junk
    case 4: for (let i = 0; i < Math.min(64, b.length); i++) b[i] = int(256); return b // wreck the header
    case 5: { const a = int(Math.min(128, Math.max(1, b.length - 4))); b.writeUInt32LE(0xffffffff, a); return b } // a huge count/length
    case 6: return Buffer.alloc(0)
    default: return Buffer.from(Array.from({ length: 1 + int(4096) }, () => int(256)))
  }
}

const dir = mkdtempSync(join(tmpdir(), 'mv3d-fuzz-'))
let k = 0
for (const f of readdirSync(samples)) {
  const ext = f.split('.').pop()
  if (!['glb', 'gltf', 'ply', 'obj', 'stl', '3mf', 'splat', 'spz', 'fbx', 'pcd', 'xyz', 'gcode'].includes(ext)) continue
  const src = readFileSync(join(samples, f))
  for (let i = 0; i < N; i++) writeFileSync(join(dir, `${String(k++).padStart(4, '0')}-${f.replace(/\./g, '_')}-${i}.${ext}`), mutate(src, i % 8))
}
if (process.env.FUZZ_KEEP) execFileSync('cp', ['-R', dir, process.env.FUZZ_KEEP])
const port = 8900 + int(80)
const server = spawn('python3', [join(here, 'harness_server.py'), String(port)], { stdio: 'ignore' })
const chromePort = 9400 + int(80)
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${chromePort}`, '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-first-run',
  `--user-data-dir=${join(dir, 'profile')}`, 'about:blank'
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let code = 1
try {
  let targets
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${chromePort}/json`)).json(); if (targets.length) break } catch {} await sleep(250) }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0; const pend = new Map()
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Page.enable')
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?fuzzdir=${encodeURIComponent(dir)}${process.argv.includes("--no-tools") ? "" : "&fuzztools=1"}` })
  const total = k
  let title = ''
  let lastSeen = ''
  for (let i = 0; i < 1200; i++) { title = (await send('Runtime.evaluate', { expression: 'document.title' })).result?.result?.value; if (title === 'FUZZDONE') break; const seen = (await send('Runtime.evaluate', { expression: 'JSON.stringify((window.__fuzz || []).slice(-1))' })).result?.result?.value; if (seen) lastSeen = seen; if (title === undefined) { console.log('the page is gone; last file seen:', lastSeen); break } await sleep(500) }
  const res = JSON.parse((await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__fuzz)' })).result.result.value)
  const files = res.filter((r) => r.file && r.state)
  const toolsHung = res.filter((r) => r.tools === 'HUNG')
  const uncaught = res.filter((r) => r.uncaught)
  if (process.env.FUZZ_LIST) writeFileSync(process.env.FUZZ_LIST, files.map((r) => `${r.file}\t${r.state}\t${r.msg || r.error || ''}`.slice(0, 200)).join('\n'))
  const states = {}
  for (const r of files) states[r.state] = (states[r.state] || 0) + 1
  const bad = files.filter((r) => !['ok', 'error', 'notice'].includes(r.state))
  const slow = files.filter((r) => r.ms > 10000)
  console.log(JSON.stringify({ files: total, handled: files.length, states, uncaught: uncaught.length, hung: bad.length, toolsRan: res.filter((r) => r.tools).length, toolsHung: toolsHung.length, slowOver10s: slow.length }))
  for (const u of uncaught.slice(0, 5)) console.log('UNCAUGHT', u.uncaught)
  for (const b of bad.slice(0, 5)) console.log('HUNG', b.file, b.state)
  code = title === 'FUZZDONE' && files.length === total && uncaught.length === 0 && bad.length === 0 && toolsHung.length === 0 ? 0 : 1
  ws.close()
} finally {
  chrome.kill(); server.kill(); rmSync(dir, { recursive: true, force: true })
}
process.exit(code)
