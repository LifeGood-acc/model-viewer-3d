#!/usr/bin/env node
// Measures "GLB, compressed" on a big file in headless Chrome: load time, compression time, output size, peak memory of the whole browser
// process tree, and whether the result opens again. Reads the file, writes nothing but a summary (and the copy when you pass --keep <path>).
//   node dev/measure-compress.mjs <file.glb|file.ply> [target-MiB=45] [--tex=2048] [--thin] [--keep out.glb]
//   node dev/measure-compress.mjs <file> --tool=decimate|check|merge   times a Tools button instead (decimate keeps 30 %)
//   add --drop to open the file like a drop (panel start page, file input, read in pieces with progress) instead of as an editor document
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const file = resolve(args.find((a) => !a.startsWith('--') && /\.(glb|ply|stl|obj|3mf)$/i.test(a)) || '')
if (!args.length) throw new Error('usage: node dev/measure-compress.mjs <file> [target-MiB] [--tex=2048] [--thin] [--keep out.glb]')
const target = Number(args.find((a) => /^[\d.]+$/.test(a)) || 45)
const tex = (args.find((a) => a.startsWith('--tex=')) || '--tex=2048').split('=')[1]
const thin = args.includes('--thin')
const keep = args.includes('--keep') ? args[args.indexOf('--keep') + 1] : null
const dir = mkdtempSync(join(tmpdir(), 'mv3d-measure-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const port = 8500 + Math.floor(Math.random() * 90)
const cport = 9500 + Math.floor(Math.random() * 90)
const server = spawn('python3', [join(here, 'harness_server.py'), String(port)], { stdio: 'ignore' })
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${cport}`, '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, 'about:blank'], { stdio: 'ignore' })

function treeRss() {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number))
  const kids = new Map()
  for (const [pid, ppid, rss] of rows) { if (!kids.has(ppid)) kids.set(ppid, []); kids.get(ppid).push([pid, rss]) }
  let sum = 0
  const walk = (pid) => { for (const [c, rss] of kids.get(pid) || []) { sum += rss; walk(c) } }
  walk(chrome.pid)
  return sum / 1024 // MiB
}
let peak = 0
const sampler = setInterval(() => { try { peak = Math.max(peak, treeRss()) } catch {} }, 300)

let ws, id = 0
const pend = new Map()
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value }
const waitFor = async (expr, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return Date.now() - t0; await sleep(200) } throw new Error('timeout: ' + what) }
let code = 1
try {
  let targets
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cport}/json`)).json(); if (targets.length) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
  await send('Page.enable')
  const drop = args.includes('--drop')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__msgs = []; new MutationObserver(() => { const e = document.getElementById('msg-text'); if (e && window.__msgs[window.__msgs.length - 1] !== e.textContent) window.__msgs.push(e.textContent) }).observe(document, { childList: true, subtree: true, characterData: true })` })
  const t0 = Date.now()
  if (drop) {
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?nodoc=1&lang=en` })
    await sleep(500)
    await waitFor(`document.documentElement.dataset.state === 'start'`, 30000, 'the start page')
    await send('DOM.enable')
    const doc = await send('DOM.getDocument')
    const inp = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#file-input' })
    await send('DOM.setFileInputFiles', { files: [file], nodeId: inp.result.nodeId })
    await sleep(800)
    if (await ev(`!document.getElementById('drop-gate').hidden`)) await ev(`document.getElementById('b-gate-go').click()`) // above 150 MB the viewer asks first
  } else {
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/h/index.html?file=${encodeURIComponent(file)}&lang=en` })
  }
  await sleep(500)
  await waitFor(`['ok','error'].includes(document.documentElement.dataset.state)`, 600000, 'load')
  const loadMs = Date.now() - t0
  const state = await ev(`document.documentElement.dataset.state`)
  const stats = await ev(`(() => { const dd = [...document.querySelectorAll('#stats dd, #stats-more dd')].map((e) => e.textContent), dt = [...document.querySelectorAll('#stats dt, #stats-more dt')].map((e) => e.textContent); return Object.fromEntries(dt.map((k, i) => [k, dd[i]])) })()`)
  const afterLoadMiB = treeRss()
  const msgs = await ev(`window.__msgs.filter((m) => /%/.test(m)).length + ' progress messages, e.g. ' + (window.__msgs.find((m) => /%/.test(m)) || '-')`)
  console.log(JSON.stringify({ file: file.split('/').pop(), mode: drop ? 'drop' : 'document', state, loadMs, stats, rssAfterLoadMiB: Math.round(afterLoadMiB), peakRssDuringLoadMiB: Math.round(peak), progress: msgs }))
  if (state !== 'ok') throw new Error('did not load: ' + (await ev(`document.getElementById('msg-text').textContent`)))
  const tool = (args.find((a) => a.startsWith('--tool=')) || '').split('=')[1]
  if (tool) {
    const ids = { decimate: 'tl-decimate', check: 'tl-check-btn', merge: 'tl-merge' }
    const t1 = Date.now()
    await ev(`(() => { const k = document.getElementById('tl-keep'); k.value = '30'; document.getElementById('tl-detail').value = 'target'; document.getElementById(${JSON.stringify(ids[tool])}).click() })()`)
    await waitFor(`document.documentElement.dataset.tools === 'busy'`, 20000, 'the tool to start').catch(() => {})
    await waitFor(`document.documentElement.dataset.tools === 'idle'`, 1800000, 'the tool')
    const text = await ev(`document.getElementById('tl-result').textContent + ' | ' + document.getElementById('tl-check').textContent`)
    console.log(JSON.stringify({ tool, ms: Date.now() - t1, runner: await ev(`document.documentElement.dataset.toolsRunner`), peakRssMiB: Math.round(peak), result: text }))
    code = 0
    throw new Error('done')
  }
  const t1 = Date.now()
  await ev(`(() => { document.getElementById('b-export').click(); const f = document.getElementById('ex-format'); f.value = 'glbc'; f.dispatchEvent(new Event('change', { bubbles: true }))
    const set = (id, v) => { const e = document.getElementById(id); if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })) }
    set('ex-target', ${JSON.stringify(String(target))}); set('ex-texmax', ${JSON.stringify(tex)}); ${thin ? "set('ex-thin', true)" : ''}
    window.__prog = []; new MutationObserver(() => window.__prog.push(document.getElementById('ex-result').textContent.slice(0, 60))).observe(document.getElementById('ex-result'), { childList: true, subtree: true })
    document.getElementById('b-ex-make').click() })()`)
  await waitFor(`['ready','idle'].includes(document.documentElement.dataset.export) && !document.getElementById('ex-result').hidden && !/…/.test(document.getElementById('ex-result').textContent)`, 1800000, 'compression')
  const compressMs = Date.now() - t1
  const text = await ev(`document.getElementById('ex-result').textContent`)
  const runner = await ev(`document.documentElement.dataset.toolsRunner`)
  const steps = await ev(`[...new Set(window.__prog)].slice(0, 12)`)
  console.log(JSON.stringify({ compressMs, runner, peakRssMiB: Math.round(peak), result: text }))
  console.log('progress seen:', steps.join(' | '))
  if (await ev(`document.documentElement.dataset.export === 'ready'`)) {
    await ev(`document.getElementById('b-ex-save').click()`)
    await waitFor(`!!window.__savedData`, 30000, 'save')
    const size = await ev(`window.__savedData.byteLength`)
    if (keep) {
      const b64 = await ev(`(() => { const u = new Uint8Array(window.__savedData); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s) })()`)
      writeFileSync(keep, Buffer.from(b64, 'base64'))
    }
    // open the copy again: where is it from here? feed it back into the viewer
    const t2 = Date.now()
    await ev(`(() => { document.documentElement.dataset.state = 'feeding'; window.__handler({ version: 1, readOnly: true, fileType: ${JSON.stringify(file.toLowerCase().endsWith('.glb') || true ? 'glb' : 'glb')}, content: { kind: 'bytes', bytes: window.__savedData } }) })()`)
    await waitFor(`['ok','error'].includes(document.documentElement.dataset.state)`, 600000, 'reload of the copy')
    const re = await ev(`(() => { const dd = [...document.querySelectorAll('#stats dd, #stats-more dd')].map((e) => e.textContent), dt = [...document.querySelectorAll('#stats dt, #stats-more dt')].map((e) => e.textContent); return { state: document.documentElement.dataset.state, ...Object.fromEntries(dt.map((k, i) => [k, dd[i]])) } })()`)
    console.log(JSON.stringify({ copyBytes: size, reopenMs: Date.now() - t2, reopened: re }))
  }
  code = 0
} catch (e) {
  if (e.message !== 'done') console.error('ERROR', e.message)
} finally {
  clearInterval(sampler)
  chrome.kill(); server.kill(); await sleep(500)
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
process.exit(code)
