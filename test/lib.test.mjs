// Run with `orca plugin test .` (node:test). Pure logic only: strings, formats, 3MF inspection, and a no-network lint.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { KEYMAP, VIEW_NAMES } from '../editor/shared/keymap.js'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { LIMITS } from '../editor/threemf.js'
import { zipSync, strToU8 } from '../editor/vendor/addons/libs/fflate.module.js'
import { presetScale, summarizeParts, statsRows, fitDistance, hasSphericalHarmonicColor, isStartText, extOf, pickFile, SUPPORTED_EXT, GATE_BYTES, HARD_MAX_BYTES, stateLine, sniffTextFormat, STRINGS, makeT, makeFormat, niceStep, partHue, pickLocale, defaultUp, inspect3mf, isGaussianSplatHeader, presetDirection, PRESETS, clipPlane, fileAxisToView, measureInfo, filterIndices, textureTarget, textureBytes } from '../editor/lib.js'

const here = dirname(fileURLToPath(import.meta.url))
const editor = join(here, '..', 'editor')

test('every English string has a German one and vice versa', () => {
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.de).sort())
  for (const lang of ['en', 'de']) for (const [k, v] of Object.entries(STRINGS[lang])) assert.ok(v.length > 0, `${lang}.${k} is empty`)
})

test('placeholders agree between languages', () => {
  for (const k of Object.keys(STRINGS.en)) {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',')
    assert.equal(ph(STRINGS.de[k]), ph(STRINGS.en[k]), k)
  }
})

test('every key used in the page or the scripts exists', () => {
  const html = readFileSync(join(editor, 'index.html'), 'utf8')
  const js = readFileSync(join(editor, 'viewer.js'), 'utf8') + readFileSync(join(editor, 'lib.js'), 'utf8')
  const used = new Set()
  for (const m of html.matchAll(/data-i18n(?:-title)?="(\w+)"/g)) used.add(m[1])
  for (const m of js.matchAll(/\bt\('(\w+)'\s*[,)]/g)) used.add(m[1])
  for (const m of js.matchAll(/'((?:ext|u|threemf)_\w+)'/g)) used.add(m[1])
  for (const m of ['auto', 'light', 'dark']) used.add('bg_' + m)
  for (const k of used) assert.ok(k in STRINGS.en, `missing string: ${k}`)
})

test('locale choice and fallback', () => {
  assert.equal(pickLocale('de-DE'), 'de')
  assert.equal(pickLocale('de'), 'de')
  assert.equal(pickLocale('en-GB'), 'en')
  assert.equal(pickLocale('fr'), 'en')
  assert.equal(pickLocale(undefined), 'en')
  const t = makeT('de')
  assert.equal(t('parts_visible', { v: 2, n: 5 }), '2 / 5 sichtbar')
  assert.equal(t('no_such_key'), 'no_such_key')
})

test('part totals: triangles, vertices, points and faces over the parts (points do not count as vertices)', () => {
  const r = summarizeParts([{ tris: 12, verts: 8, kind: 'mesh', faces: 6 }, { tris: 0, verts: 100, kind: 'points' }, { tris: 4, verts: 6, kind: 'lines' }, {}])
  assert.deepEqual(r, { tris: 16, verts: 14, pts: 100, faces: 6 })
  assert.deepEqual(summarizeParts([]), { tris: 0, verts: 0, pts: 0, faces: 0 })
})

test('fit distance: a narrow, tall view needs more distance than a wide one, and the sphere then fits in both directions', () => {
  const wide = fitDistance(1, 50, 1.6)
  const square = fitDistance(1, 50, 1)
  const tall = fitDistance(1, 50, 0.5)
  assert.ok(Math.abs(wide - square) < 1e-9, 'a wide view is limited by the vertical field of view, as before')
  assert.ok(tall > square * 1.5, `${tall} vs ${square}`)
  const hfov = 2 * Math.atan(Math.tan((50 * Math.PI) / 360) * 0.5)
  assert.ok(Math.sin(hfov / 2) * tall >= 1, 'the sphere of radius 1 fits the horizontal field of view')
})

test('number formats', () => {
  const f = makeFormat('en')
  assert.equal(f.int(1234567), '1,234,567')
  assert.equal(f.mb(2209), '2.2 KB')
  assert.equal(f.mb(53_772_000), '53.77 MB')
  assert.equal(f.len(-1e-9), '0') // never "-0"
  assert.equal(f.len(1.07), '1.07')
  assert.equal(f.len(120.4), '120')
  assert.equal(makeFormat('de').len(1.5), '1,5')
  // a model in meters: 0.045 m is not 0.05, a measurement of 79 mm is not 0.08 m, a small volume is not "0"
  assert.equal(f.len(0.045), '0.045')
  assert.equal(f.len(0.0789), '0.0789')
  assert.equal(f.len(1.2e-4), '0.00012')
  assert.equal(f.len(0.235), '0.235')
  assert.equal(f.len(2.4), '2.4')
  assert.equal(f.vol(1.2e-4, 'm'), '120 cm³')
  assert.equal(f.vol(0.00004, 'm'), '40 cm³')
  assert.equal(f.vol(1000, 'mm'), '1,000 mm³')
  assert.equal(f.vol(0.000333, 'cm'), '0.333 mm³')
  assert.equal(f.area(0.0008, 'm'), '8 cm²')
  assert.equal(f.vol(2.5, 'm'), '2.5 m³')
  assert.equal(makeFormat('de').vol(1.2e-4, 'm'), '120 cm³')
})

test('grid step is a round 1/2/5 number', () => {
  for (const e of [0.3, 1, 2.4, 42, 387, 1288, 1e5]) {
    const s = niceStep(e)
    const m = s / Math.pow(10, Math.floor(Math.log10(s)))
    assert.ok([1, 2, 5].includes(Math.round(m * 1e6) / 1e6), `${e} -> ${s}`)
    assert.ok(e / s >= 4 && e / s <= 30, `${e} / ${s}`)
  }
})

test('part hues stay in range and neighbours differ', () => {
  for (let i = 0; i < 200; i++) assert.ok(partHue(i) >= 0 && partHue(i) < 1)
  for (let i = 0; i < 50; i++) assert.ok(Math.abs(partHue(i) - partHue(i + 1)) > 0.05)
})

test('default up axis', () => {
  assert.equal(defaultUp('glb'), 'y')
  assert.equal(defaultUp('stl'), 'z')
  assert.equal(defaultUp('3mf'), 'z')
})

test('spherical-harmonic colors (f_dc_*) are recognised', () => {
  assert.ok(hasSphericalHarmonicColor('ply\nproperty float x\nproperty float f_dc_0\n'))
  assert.ok(!hasSphericalHarmonicColor('ply\nproperty float x\nproperty uchar red\n'))
})

const t = makeT('en')
const model = (attrs, body = '') => `<?xml version="1.0"?><model unit="${attrs.unit ?? 'millimeter'}" ${attrs.extra ?? ''} xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${body}</resources><build/></model>`
const archive = (xml, extra = {}) => zipSync({ '3D/3dmodel.model': strToU8(xml), ...extra }).buffer

test('3MF: unit from the file, default millimeter', () => {
  assert.deepEqual(inspect3mf(archive(model({ unit: 'micron' })), t).unit, { short: 'µm', label: 'micrometers (from file)' })
  assert.equal(inspect3mf(archive(model({ unit: 'inch' })), t).unit.short, 'in')
  const noUnit = '<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources/><build/></model>'
  assert.equal(inspect3mf(archive(noUnit), t).unit.short, 'mm')
  assert.deepEqual(inspect3mf(archive(model({})), t).notes, [])
})

test('3MF: unsupported extensions are reported, not hidden', () => {
  const xml = model({ extra: 'xmlns:b="http://schemas.microsoft.com/3dmanufacturing/beamlattice/2017/02" xmlns:s="http://schemas.slic3r.org/3mf/2017/06" xmlns:x="https://example.com/ext" requiredextensions="b"' })
  const notes = inspect3mf(archive(xml), t).notes
  assert.ok(notes.some((n) => /Beam lattice/.test(n)), notes.join('|'))
  assert.ok(notes.some((n) => /Slicer metadata/.test(n)))
  assert.ok(notes.some((n) => /example\.com/.test(n)))
  assert.ok(notes.some((n) => /require/.test(n)))
})

test('3MF: parts in separate model files are detected (read by threemf.js), Bambu namespaces are not "unknown"', () => {
  const xml = model({ extra: 'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" requiredextensions="p"' }, '<object id="1"><components><component p:path="/3D/Objects/o.model" objectid="1"/></components></object>')
  const r = inspect3mf(archive(xml, { '3D/Objects/o.model': strToU8('<model/>') }), t)
  assert.equal(r.external, true)
  assert.deepEqual(r.notes, []) // production and the Bambu package are handled: no false "parts are missing"
  assert.equal(inspect3mf(archive(model({})), t).external, false)
  // a required extension the viewer cannot handle is named by its namespace, not by the prefix
  const rq = inspect3mf(archive(model({ extra: 'xmlns:x="https://example.com/ext" requiredextensions="x"' })), t)
  assert.ok(rq.notes.some((n) => /Extensions the file requires: https:\/\/example\.com\/ext/.test(n)), rq.notes.join('|'))
})

test('3MF: a zip bomb is refused before anything is unpacked', () => {
  const saved = LIMITS.maxTotalBytes
  LIMITS.maxTotalBytes = 1000 // the real limit is 0.9 GB: a test cannot unpack that, the check works on the declared sizes
  try {
    assert.throws(() => inspect3mf(archive(model({}), { 'filler.bin': new Uint8Array(5000) }), t), /too large to open safely/)
  } finally {
    LIMITS.maxTotalBytes = saved
  }
})

test('3MF: broken archives throw a readable error, not a crash', () => {
  assert.throws(() => inspect3mf(archive('<x/>', {}).slice(0, 0), t))
  assert.throws(() => inspect3mf(zipSync({ 'readme.txt': strToU8('hi') }).buffer, t), /no 3D model/)
  assert.throws(() => inspect3mf(zipSync({ '3D/other.model': strToU8('<model/>') }).buffer, t), /not where expected/)
  assert.throws(() => inspect3mf(new Uint8Array([1, 2, 3, 4, 5]).buffer, t))
})

test('the viewer makes no network requests', () => {
  // Only the viewer's own scripts: the vendored libraries are checked by their licenses and by the page run.
  for (const f of ['viewer.js', 'lib.js', 'index.html', 'viewer.css']) {
    const text = readFileSync(join(editor, f), 'utf8')
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\beval\s*\(|new Function/.test(text), `${f} uses a network or eval API`)
    const urls = [...text.matchAll(/https?:\/\/[^\s'"`)<>]+/g)].map((m) => m[0])
    for (const u of urls) assert.ok(/schemas\.(microsoft|slic3r)|w3\.org|schemas\.openxml/.test(u) || /opcfoundation/.test(u), `${f} mentions ${u}`)
  }
})

test('all bundled files are listed in THIRD_PARTY_NOTICES', () => {
  const notices = readFileSync(join(here, '..', 'THIRD_PARTY_NOTICES.md'), 'utf8')
  for (const name of ['three.js', 'fflate']) assert.ok(notices.includes(name), name)
  for (const f of readdirSync(join(editor, 'vendor', 'addons', 'loaders'))) assert.ok(notices.includes(f), f)
})

test('text files are recognised by their first line (Orca gives text editors no file name)', () => {
  assert.equal(sniffTextFormat('ply\nformat ascii 1.0\n'), 'ply')
  assert.equal(sniffTextFormat('solid cube\nfacet normal 0 0 1'), 'stl')
  assert.equal(sniffTextFormat('\uFEFFSOLID x'), 'stl')
  assert.equal(sniffTextFormat('# a comment\nv 0 0 0\n'), 'obj')
  assert.equal(sniffTextFormat('v 1 2 3'), 'obj')
  assert.equal(sniffTextFormat(''), 'obj')
  assert.equal(sniffTextFormat('plyfoo'), 'obj')
  assert.equal(sniffTextFormat('{"asset":{"version":"2.0"}}'), 'gltf')
  assert.equal(sniffTextFormat('  \n{ "asset": {} }'), 'gltf')
})

test('the manifest has a bytes editor for binary files and a text editor for text files (Orca mounts an editor only when the kind matches)', () => {
  const m = JSON.parse(readFileSync(join(here, '..', 'orca-plugin.json'), 'utf8'))
  const eds = m.contributes.customEditors
  const bytes = eds.filter((e) => e.contentKind === 'bytes').flatMap((e) => e.extensions)
  const text = eds.filter((e) => e.contentKind === 'text').flatMap((e) => e.extensions)
  for (const e of ['.glb', '.3mf', '.usdz', '.splat', '.spz']) assert.ok(bytes.includes(e) && !text.includes(e), `${e} is binary only`)
  assert.ok(text.includes('.obj') && !bytes.includes('.obj'), '.obj is text only')
  assert.ok(text.includes('.gltf') && !bytes.includes('.gltf'), '.gltf is text only')
  for (const e of ['.xyz', '.gcode']) assert.ok(text.includes(e) && !bytes.includes(e), `${e} is text only`)
  for (const e of ['.fbx', '.pcd']) assert.ok(text.includes(e) && bytes.includes(e), `${e} can be binary or text`)
  for (const e of ['.ply', '.stl']) assert.ok(bytes.includes(e) && text.includes(e), `${e} can be binary or ASCII`)
  for (const e of eds) assert.equal(e.frame, 'isolated')
  assert.deepEqual(m.capabilities, [])
})

test('camera presets are unit vectors looking at the front, back, sides, top and bottom', () => {
  assert.deepEqual(PRESETS, ['iso', 'front', 'back', 'left', 'right', 'top', 'bottom', 'hero'])
  assert.equal(presetScale('hero') < 1 && presetScale('front') === 1, true, 'the hero view stands closer')
  for (const p of PRESETS) assert.ok(Math.abs(Math.hypot(...presetDirection(p)) - 1) < 1e-9, p)
  assert.deepEqual(presetDirection('front'), [0, 0, 1])
  assert.deepEqual(presetDirection('left'), [-1, 0, 0])
  assert.ok(presetDirection('top')[1] > 0.99999 && presetDirection('bottom')[1] < -0.99999)
  assert.deepEqual(presetDirection('nope'), presetDirection('iso'))
})

test('section plane: position across the box, side, and the file axes through the "up is" rotation', () => {
  assert.deepEqual(clipPlane('y', 0.5, [0, 0, 0], [2, 4, 2], false), { normal: [0, 1, 0], constant: -2 })
  assert.deepEqual(clipPlane('x', 0, [-1, 0, 0], [1, 0, 0], true), { normal: [-1, 0, 0], constant: -1 })
  assert.deepEqual(clipPlane('z', 2, [0, 0, 0], [0, 0, 10], false), { normal: [0, 0, 1], constant: -10 }) // t is clamped to 0..1
  assert.equal(clipPlane('w', 0.5, [0, 0, 0], [1, 1, 1], false), null)
  assert.deepEqual(fileAxisToView('z', 'z'), { axis: 'y', sign: 1 }) // file z is "up" after the rotation
  assert.deepEqual(fileAxisToView('y', 'z'), { axis: 'z', sign: -1 })
  assert.deepEqual(fileAxisToView('y', '-y'), { axis: 'y', sign: -1 })
  assert.deepEqual(fileAxisToView('x', 'y'), { axis: 'x', sign: 1 })
  assert.equal(fileAxisToView('q', 'y'), null)
})

test('measuring, filtering and texture sizes', () => {
  const m = measureInfo([0, 0, 0], [3, 4, 12])
  assert.equal(m.distance, 13)
  assert.deepEqual(m.delta, [3, 4, 12])
  assert.deepEqual(filterIndices(['Table', 'Vase', 'Table legs'], ' TAB '), [0, 2])
  assert.deepEqual(filterIndices(['a', 'b'], ''), [0, 1])
  assert.deepEqual(filterIndices(['a'], 'zzz'), [])
  assert.deepEqual(textureTarget(8192, 4096, 2048), { w: 2048, h: 1024, scaled: true })
  assert.deepEqual(textureTarget(1000, 500, 2048), { w: 1000, h: 500, scaled: false })
  assert.deepEqual(textureTarget(1000, 500, 0), { w: 1000, h: 500, scaled: false })
  assert.equal(textureBytes(1024, 1024), Math.round(1024 * 1024 * 4 * (4 / 3)))
})

test('every keyboard shortcut a tooltip promises is handled, and typing in a text field never triggers one', () => {
  const js = readFileSync(join(editor, 'viewer.js'), 'utf8')
  const block = js.slice(js.indexOf('const KEY_ACTIONS = {'), js.indexOf('window.addEventListener(\'keydown\''))
  assert.ok(block.length > 200, 'KEY_ACTIONS found')
  for (const [k, v] of Object.entries(STRINGS.en)) {
    if (!k.startsWith('tip_')) continue
    for (const m of v.matchAll(/\(([A-Z])\)/g)) {
      const action = KEYMAP[m[1].toLowerCase()]
      assert.ok(action, `${k} promises key ${m[1]}, shared/keymap.js has no such key`)
      assert.ok(new RegExp(`\\b${action}:`).test(block), `${k} promises key ${m[1]} (${action}), viewer.js has no handler in KEY_ACTIONS`)
    }
  }
  assert.ok(/keys 1 to 8/.test(STRINGS.en.tip_preset), 'the preset tooltip names the keys')
  for (const n of VIEW_NAMES) assert.ok(new RegExp(`view_${n}:`).test(block), `no handler for the view ${n}`)
  assert.ok(/keyAction\(e\)/.test(js), 'the viewer takes its keys through keyAction (text fields, modifiers and repeats are handled there)')
})

test('German strings are translated, not copied (except words that are the same in German)', () => {
  const same = new Set(['ch_l_original', 'ch_ex_title', 'ch_ex_film', 'ch_st_film', 'ch_studio', 'ch_tab_info', 'ch_tab_studio', 'ch_tab_export', 'pc_material', 'pc_position', 'pc_computing', 'st_title', 'st_spin_start', 'st_tone_neutral', 'st_tone_agx', 'pv_hero', 'mesh', 'box', 's_vertices', 'sh_original', 'anim_pause', 'anim_clip', 'anim_title', 'ex_format', 'ex_fmt_glb', 'ex_fmt_stl', 'ex_fmt_obj', 'ex_fmt_ply', 'ex_fmt_3mf', 'ex_ready', 'ex_sec_n', 'ex_progress', 'tl_detail', 'tl_detail_normal', 'sh_matcap', 'ms_radius', 'mp_col_name', 'mp_name', 'ex_torus', 'sm_splat']) // the same word in German
  for (const k of Object.keys(STRINGS.en)) {
    if (STRINGS.en[k] === STRINGS.de[k]) assert.ok(same.has(k), `de.${k} is still English: ${STRINGS.en[k]}`)
  }
})

test('toggle buttons: every aria-pressed button is kept in sync by the script, and the pressed style is theme-independent', () => {
  const html = readFileSync(join(editor, 'index.html'), 'utf8')
  const js = readFileSync(join(editor, 'viewer.js'), 'utf8')
  const css = readFileSync(join(editor, 'viewer.css'), 'utf8')
  const ids = [...html.matchAll(/<button id="([\w-]+)"[^>]*aria-pressed/g)].map((m) => m[1])
  assert.ok(ids.length >= 5, 'toggle buttons found')
  const shellJs = readFileSync(join(editor, 'shared', 'shell.js'), 'utf8')
  for (const id of ids) assert.ok(js.includes(`$('${id}').setAttribute('aria-pressed'`) || shellJs.includes(`$('${id}')`) && /toggleBtn\.setAttribute\('aria-pressed'/.test(shellJs), `${id} never gets aria-pressed updated`)
  // blue fill with white text in light and dark Orca themes: a pale fill in a dark theme reads as "off"
  const shellCss = readFileSync(join(editor, 'shared', 'shell.css'), 'utf8')
  assert.ok(/button\[aria-pressed="true"\]\s*\{[^}]*var\(--on\)/.test(shellCss) && /--on:\s*#[0-9a-f]{6}/i.test(shellCss))
  assert.ok(!/aria-pressed="true"\]\s*\{[^}]*var\(--primary\)/.test(shellCss), 'pressed must not use the theme primary color (pale in dark themes)')
})

test('manifest: the text editor also owns the start file; a panel and a "new file" entry open the viewer without a file', () => {
  const m = JSON.parse(readFileSync(join(here, '..', 'orca-plugin.json'), 'utf8'))
  assert.equal(m.contributes.panels.length, 1)
  assert.equal(m.contributes.panels[0].entry, 'editor/panel.html') // Orca builds the frame per entry file: a panel that shared the editor's entry would get an editor frame with a document API
  const nf = m.contributes.newFiles[0]
  const text = m.contributes.customEditors.filter((e) => e.contentKind === 'text').flatMap((e) => e.extensions)
  assert.ok(text.includes(nf.extension), 'the start file is text, so the text editor must own it')
  assert.ok(isStartText(readFileSync(join(here, '..', nf.template), 'utf8')), 'the template carries the start marker')
  assert.ok(!isStartText('v 0 0 0\nf 1 2 3'))
  assert.deepEqual(m.capabilities, [])
})

test('opening files: first supported file wins, extensions, limits and the state line', () => {
  assert.equal(extOf('a/B.GLB'), 'glb')
  assert.equal(extOf('noext'), '')
  assert.deepEqual(SUPPORTED_EXT, ['glb', 'gltf', 'ply', 'obj', 'stl', '3mf', 'usdz', 'splat', 'spz', 'fbx', 'pcd', 'xyz', 'gcode'])
  const r = pickFile([{ name: 'x.txt' }, { name: 'a.ply' }, { name: 'b.obj' }], SUPPORTED_EXT)
  assert.equal(r.file.name, 'a.ply')
  assert.equal(r.ignored, 2)
  assert.deepEqual(r.unsupported, ['x.txt'])
  assert.equal(pickFile([{ name: 'a.step' }], SUPPORTED_EXT).file, null)
  assert.ok(GATE_BYTES < HARD_MAX_BYTES)
  assert.equal(stateLine('p', { a: 1 }), 'p-state {"a":1}')
})

test('the panel page is the editor page (same scripts), kept in step by this test', () => {
  const a = readFileSync(join(editor, 'index.html'), 'utf8')
  const b = readFileSync(join(editor, 'panel.html'), 'utf8')
  assert.equal(b, a, 'editor/panel.html must equal editor/index.html: copy it after changing the page')
})

test('the shared layout files are the canonical ones (checksum recorded by plugins/_shared/sync-shared.sh) and the page uses them', () => {
  const dir = join(editor, 'shared')
  const rec = Object.fromEntries(readFileSync(join(dir, 'SHARED.sha256'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/).reverse()))
  const present = readdirSync(dir).filter((f) => f !== 'SHARED.sha256').sort()
  assert.deepEqual(present, Object.keys(rec).sort(), 'every file in editor/shared is recorded by sync-shared.sh')
  for (const f of present) assert.equal(createHash('sha256').update(readFileSync(join(dir, f))).digest('hex'), rec[f], `${f} was edited here: change plugins/_shared and run sync-shared.sh`)
  const html = readFileSync(join(editor, 'index.html'), 'utf8')
  assert.ok(html.includes('./shared/shell.css'))
  assert.equal(readFileSync(join(editor, 'panel.html'), 'utf8'), html)
})

test('layout: the side panel takes space next to the view (flow layout), scrolls vertically only, and sections collapse', () => {
  const css = readFileSync(join(editor, 'shared', 'shell.css'), 'utf8')
  const html = readFileSync(join(editor, 'index.html'), 'utf8')
  assert.ok(/#side\s*\{[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto/.test(css), 'no horizontal scrolling in the side panel')
  assert.ok(!/#side\s*\{[^}]*position:\s*(fixed|absolute)/.test(css), 'the panel must not float over the view')
  assert.ok(/#main\s*\{[^}]*display:\s*flex/.test(css) && /body\.narrow #main\s*\{[^}]*flex-direction:\s*column/.test(css))
  for (const id of ['bar', 'main', 'stage', 'resizer', 'side', 'side-close', 'b-panel', 'b-more', 'more-menu', 'more-wrap']) assert.ok(html.includes(`id="${id}"`), `index.html lacks #${id}`)
  assert.ok((html.match(/<details class="sec"/g) || []).length >= 5, 'each side section is a collapsible <details>')
  assert.ok(/role="separator"/.test(html) && /tabindex="0"/.test(html), 'the panel handle is keyboard operable')
  // every toolbar control has a priority for the More menu
  const bar = html.slice(html.indexOf('<header id="bar"'), html.indexOf('</header>'))
  for (const m of bar.matchAll(/<(button|select) id="(b-[\w-]+|preset)"([^>]*)>/g)) if (!['b-more', 'b-panel', 'side-close', 'b-pick', 'b-gate-go', 'b-gate-cancel', 'b-cancel', 'b-go', 'b-play', 'l-all', 'l-none', 'l-inv', 'l-color', 'b-resetprefs'].includes(m[2])) assert.ok(/data-prio=/.test(m[3]), `${m[2]} has no data-prio`)
})

test('a Gaussian splat PLY is told from any point cloud with colors', () => {
  const splat = 'ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty float f_dc_0\nproperty float f_dc_1\nproperty float f_dc_2\nproperty float opacity\nproperty float scale_0\nproperty float scale_1\nproperty float scale_2\nproperty float rot_0\nproperty float rot_1\nproperty float rot_2\nproperty float rot_3\nend_header\n'
  assert.equal(isGaussianSplatHeader(splat), true)
  assert.equal(isGaussianSplatHeader(splat.replace('property float opacity\n', '')), false, 'no opacity')
  assert.equal(isGaussianSplatHeader(splat.replace('property float rot_0\n', '')), false, 'no rotation')
  assert.equal(isGaussianSplatHeader('ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nend_header\n'), false)
})

test('the shared files are the same as plugins/_shared, the source (sync-shared.sh --check compares both plugins, work copies and live folders; this runs it for this folder)', () => {
  const script = [join(here, '..', '..', '_shared', 'sync-shared.sh'), join(here, '..', '..', '..', '_shared', 'sync-shared.sh')].find((p) => existsSync(p))
  if (!script) return // a copy of the plugin without its _shared folder: nothing to compare with
  const r = spawnSync('sh', [script, '--check-dir', join(here, '..')], { encoding: 'utf8' }) // this plugin folder only (the work copy and the live folder each run it)
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test('statsRows: a 20 mm cube as STL gives exact rows (no vertex row for STL, no texture rows, load time last)', () => {
  const F = makeFormat('en')
  const te = makeT('en')
  const rows = statsRows({
    t: te, fmt: F.int || ((n) => String(n)), fmtMB: (b) => `${b} B`, fmtLen: (v) => String(v), dur: (ms) => `${ms} ms`,
    tris: 12, verts: 36, pts: 0, partCount: 1, fileInfo: { name: 'cube.stl', bytes: 684, type: 'stl' }, unit: { short: 'mm', label: 'Millimeters' },
    size: { x: 20, y: 20, z: 20 }, bounds: { min: { y: 0 }, max: { y: 20 } }, gridStep: 5, checks: [], textures: [], ms: 7,
  })
  const m = new Map(rows)
  assert.equal(m.get(te('s_triangles')), '12')
  assert.equal(m.get(te('s_extent')), '20 × 20 × 20 mm')
  assert.equal(m.get(te('s_height')), '0 … 20 mm')
  assert.equal(m.has(te('s_vertices')), false)
  assert.equal(m.has(te('s_texture')), false)
  assert.equal(rows.at(-1)[1], '7 ms')
})
test('statsRows: textures, objects of a 3MF and point clouds', () => {
  const te = makeT('en')
  const base = { t: te, fmt: String, fmtMB: (b) => `${b} B`, fmtLen: String, dur: String, tris: 0, verts: 5, pts: 5, partCount: 3, fileInfo: { bytes: 10, type: '3mf' }, unit: { short: 'm', label: 'Meters' }, size: { x: 1, y: 1, z: 1 }, bounds: { min: { y: 0 }, max: { y: 1 } }, gridStep: 1, checks: [], ms: 1 }
  const rows = new Map(statsRows({ ...base, textures: [{ w: 4, h: 2 }, { w: 1, h: 1 }] }))
  assert.equal(rows.get(te('s_objects')), '3')
  assert.equal(rows.get(te('s_points')), '5')
  assert.equal(rows.get(te('s_texture')), te('s_texture_n', { n: 2 }))
  assert.equal(rows.get(te('s_texmem')), `${textureBytes(4, 2) + textureBytes(1, 1)} B`)
  assert.equal(new Map(statsRows({ ...base, textures: [{ w: 4, h: 2 }] })).get(te('s_texture')), '4 × 2')
  assert.equal(new Map(statsRows({ ...base, fileInfo: { bytes: 10, type: 'ply' }, textures: [] })).get(te('s_parts')), '3')
})

test('the x-ray material keeps its back faces whatever the "Back faces" switch says (viewer honours keepSide)', () => {
  assert.match(readFileSync(join(editor, 'shared/shading.js'), 'utf8'), /xray\.userData\.keepSide = true/)
  assert.match(readFileSync(join(editor, 'viewer.js'), 'utf8'), /m\.userData\.keepSide \? m\.side : state\.back/)
})
