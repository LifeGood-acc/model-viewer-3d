// The production-layout 3MF reader (Bambu Studio, Orca Slicer, ...): resolution by (file, id), transforms, names, colors, limits.
import test from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from '../editor/vendor/addons/libs/fflate.module.js'
import { readPackage, decodePaint, parseModel, parseTransform, parseColor, parseSlicerConfig, parseFilamentColors, mul, hasExternalModels, LIMITS } from '../editor/threemf.js'

const NS = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"'
const mesh = (n = 1, off = 0) =>
  `<mesh><vertices>${Array.from({ length: n + 2 }, (_, i) => `<vertex x="${i + off}" y="0" z="${i % 2}"/>`).join('')}</vertices><triangles>${Array.from({ length: n }, (_, i) => `<triangle v1="${i}" v2="${i + 1}" v3="${i + 2}"/>`).join('')}</triangles></mesh>`
const sub = (id, n, off) => `<?xml version="1.0"?><model unit="millimeter" ${NS}><resources><object id="${id}" type="model">${mesh(n, off)}</object></resources><build/></model>`
const mainModel = (resources, build, unit = 'millimeter') => `<?xml version="1.0"?><model unit="${unit}" ${NS} requiredextensions="p"><resources>${resources}</resources><build>${build}</build></model>`
const pack = (files) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))).buffer
const T = (x, y, z) => `1 0 0 0 1 0 0 0 1 ${x} ${y} ${z}`

test('matrices: 3MF row-vector transforms become column-major, composed parent first', () => {
  assert.equal(parseTransform('1 0 0 0 1 0 0 0 1 5 6 7').slice(12, 15).join(','), '5,6,7')
  assert.equal(parseTransform('1 2 3'), null)
  assert.equal(parseTransform('1 0 0 0 1 0 0 0 1 a b c'), null)
  const rotZ = parseTransform('0 1 0 -1 0 0 0 0 1 0 0 0') // 3MF row-vector: x axis maps to (0,1,0)
  const p = (m, v) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r])
  assert.deepEqual(p(rotZ, [1, 0, 0]), [0, 1, 0])
  const both = mul(parseTransform(T(10, 0, 0)), rotZ) // rotate first, then move
  assert.deepEqual(p(both, [1, 0, 0]), [10, 1, 0])
})

test('colors and slicer config', () => {
  assert.equal(parseColor('#F2754E'), 0xf2754e)
  assert.equal(parseColor('#F2754EFF'), 0xf2754e)
  assert.equal(parseColor('red'), null)
  assert.deepEqual(parseFilamentColors('{"filament_colour":["#112233","#445566"]}'), [0x112233, 0x445566])
  assert.deepEqual(parseFilamentColors('not json'), [])
  const cfg = parseSlicerConfig('<config><object id="2"><metadata key="name" value="Case &amp; lid"/><metadata key="extruder" value="2"/><part id="1" subtype="normal_part"><metadata key="name" value="Lid"/></part></object></config>')
  assert.equal(cfg.objects.get('2').name, 'Case & lid')
  assert.equal(cfg.objects.get('2').extruder, 2)
  assert.equal(cfg.objects.get('2').parts.get('1').name, 'Lid')
})

test('a Bambu-like package: ids repeat in every file, names and colors come from the config, transforms apply', () => {
  const buf = pack({
    '3D/3dmodel.model': mainModel(
      '<object id="2" type="model"><components><component p:path="/3D/Objects/a.model" objectid="1"/><component p:path="/3D/Objects/b.model" objectid="1" transform="' + T(20, 0, 0) + '"/></components></object>' +
        '<object id="3" type="model"><components><component p:path="/3D/Objects/a.model" objectid="1"/></components></object>',
      '<item objectid="2" transform="' + T(100, 0, 0) + '"/><item objectid="3" transform="' + T(0, 50, 0) + '"/>'
    ),
    '3D/Objects/a.model': sub(1, 3, 0), // both files use object id 1: only (file, id) tells them apart
    '3D/Objects/b.model': sub(1, 5, 7),
    'Metadata/model_settings.config': '<config><object id="2"><metadata key="name" value="Housing"/><metadata key="extruder" value="2"/><part id="1"><metadata key="name" value="Body"/></part></object><object id="3"><metadata key="name" value="Knob"/></object></config>',
    'Metadata/project_settings.config': '{"filament_colour":["#FF0000","#00FF00"]}'
  })
  const r = readPackage(buf)
  assert.equal(r.instances.length, 3)
  assert.equal(r.missing.length, 0)
  assert.equal(r.unit, 'millimeter')
  assert.equal(r.meshes.size, 2) // a.model#1 and b.model#1, a.model's mesh is shared by two instances
  const tris = r.instances.map((i) => r.meshes.get(i.key).idx.length / 3)
  assert.deepEqual(tris, [3, 5, 3]) // right geometry per file despite the equal ids
  assert.equal(r.instances[0].key, r.instances[2].key)
  assert.deepEqual(r.instances.map((i) => i.matrix.slice(12, 15).join(',')), ['100,0,0', '120,0,0', '0,50,0']) // item transform x component transform
  assert.equal(r.instances[0].label, 'Housing › Body') // object name and the part name from the config
  assert.equal(r.instances[1].label, 'Housing › Body') // the config names parts by id; a second component with the same id gets the same name (the parts list numbers duplicates)
  assert.equal(r.instances[2].label, 'Knob') // one component: the object name alone
  assert.deepEqual(r.instances.map((i) => i.color), [0x00ff00, 0x00ff00, null]) // extruder 2 -> second filament color; no extruder -> none
})

test('nesting: relative paths, objects inside a model file that refer to each other, several levels', () => {
  const buf = pack({
    '3D/3dmodel.model': mainModel('<object id="9"><components><component p:path="/3D/Objects/l1.model" objectid="5" transform="' + T(1, 0, 0) + '"/></components></object>', '<item objectid="9"/>'),
    '3D/Objects/l1.model': `<?xml version="1.0"?><model ${NS}><resources><object id="5"><components><component objectid="6" transform="${T(0, 2, 0)}"/><component p:path="sub/l2.model" objectid="7"/></components></object><object id="6">${mesh(2)}</object></resources></model>`,
    '3D/Objects/sub/l2.model': sub(7, 4, 0)
  })
  const r = readPackage(buf)
  assert.equal(r.missing.length, 0)
  assert.deepEqual(r.instances.map((i) => r.meshes.get(i.key).idx.length / 3), [2, 4])
  assert.equal(r.instances[0].matrix.slice(12, 15).join(','), '1,2,0')
  assert.equal(r.instances[1].matrix.slice(12, 15).join(','), '1,0,0')
})

test('safety: missing files and objects, paths that leave the package, loops, depth, size limits', () => {
  const missing = readPackage(pack({ '3D/3dmodel.model': mainModel('<object id="2"><components><component p:path="/3D/Objects/none.model" objectid="1"/><component p:path="../../etc/passwd" objectid="1"/><component p:path="/3D/Objects/a.model" objectid="99"/></components></object>', '<item objectid="2"/><item objectid="404"/>'), '3D/Objects/a.model': sub(1, 1, 0) }))
  assert.equal(missing.instances.length, 0)
  assert.equal(missing.missing.length, 4)
  assert.throws(() => readPackage(pack({ '3D/3dmodel.model': mainModel('<object id="2"><components><component objectid="2"/></components></object>', '<item objectid="2"/>') })), /threemf_cyclic/)
  assert.throws(() => readPackage(pack({ '3D/3dmodel.model': mainModel('<object id="1"><components><component objectid="2"/></components></object><object id="2"><components><component objectid="1"/></components></object>', '<item objectid="1"/>') })), /threemf_cyclic/)
  const deep = Array.from({ length: 20 }, (_, i) => `<object id="${i + 1}"><components><component objectid="${i + 2}"/></components></object>`).join('') + `<object id="21">${mesh(1)}</object>`
  assert.throws(() => readPackage(pack({ '3D/3dmodel.model': mainModel(deep, '<item objectid="1"/>') })), /threemf_cyclic/) // deeper than LIMITS.maxDepth
  assert.throws(() => readPackage(pack({ '3D/3dmodel.model': mainModel('', ''), 'x.model': 'y'.repeat(2000) }), { ...LIMITS, maxTotalBytes: 1000 }), /threemf_too_large/)
  assert.throws(() => readPackage(pack({ '3D/3dmodel.model': mainModel('', ''), '3D/Objects/big.model': 'z'.repeat(5000) }), { ...LIMITS, maxModelBytes: 1000 }), /threemf_too_large/)
  assert.throws(() => readPackage(pack({ 'readme.txt': 'hi' })), /threemf_no_model/)
  assert.throws(() => readPackage(new Uint8Array([1, 2, 3, 4]).buffer))
})

test('damaged XML never crashes the reader (truncated, tags cut, junk numbers)', () => {
  const good = mainModel('<object id="2"><components><component p:path="/3D/Objects/a.model" objectid="1"/></components></object>', '<item objectid="2"/>')
  const part = sub(1, 6, 0)
  for (let cut = 0; cut < part.length; cut += 37) {
    try {
      readPackage(pack({ '3D/3dmodel.model': good, '3D/Objects/a.model': part.slice(0, cut) }))
    } catch (e) {
      assert.ok(/threemf_/.test(e.message), e.message)
    }
  }
  const junk = parseModel('<model><resources><object id="1"><mesh><vertices><vertex x="a" y="b" z="c"/></vertices><triangles><triangle v1="0" v2="0" v3="0"/></triangles></mesh></object></resources></model>')
  assert.equal(junk.objects.get('1').mesh.idx.length, 3)
  assert.equal(junk.objects.get('1').mesh.pos[0], 0) // a corrupt coordinate becomes 0, never NaN bounds
})

test('multi-color meshes: triangle colors come from base materials and color groups', () => {
  const xml = `<?xml version="1.0"?><model ${NS}><resources><basematerials id="5"><base name="a" displaycolor="#FF0000FF"/><base name="b" displaycolor="#0000FF"/></basematerials><object id="1" pid="5" pindex="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="1" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2" pid="5" p1="0"/><triangle v1="1" v2="3" v3="2" pid="5" p1="1"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>`
  const r = readPackage(pack({ '3D/3dmodel.model': xml }))
  assert.equal(r.instances[0].color, 0x0000ff) // the object's own material
  const m = r.meshes.get(r.instances[0].key)
  assert.equal(m.triColors.get(0), 0xff0000)
  assert.equal(m.triColors.get(1), 0x0000ff)
})

test('detecting the production layout', () => {
  assert.equal(hasExternalModels(['3D/3dmodel.model', '3D/Objects/a.model'], ''), true)
  assert.equal(hasExternalModels(['3D/3dmodel.model'], '<component p:path="/3D/x.model"/>'), true)
  assert.equal(hasExternalModels(['3D/3dmodel.model', 'Metadata/x.png'], '<mesh/>'), false)
})

test('without a slicer config the names come from the object name or the file name', () => {
  const buf = pack({
    '3D/3dmodel.model': mainModel('<object id="2" name="Frame"><components><component p:path="/3D/Objects/side_plate_3.model" objectid="1"/><component p:path="/3D/Objects/side_plate_3.model" objectid="1" transform="' + T(5, 0, 0) + '"/></components></object>', '<item objectid="2"/>'),
    '3D/Objects/side_plate_3.model': sub(1, 2, 0)
  })
  const r = readPackage(buf)
  assert.deepEqual(r.instances.map((i) => i.label), ['Frame › side_plate', 'Frame › side_plate'])
  assert.equal(r.meshes.size, 1) // two instances share one geometry
})

test('a component graph that reuses children many times is bounded (fan-out is not a cycle)', () => {
  const objs = Array.from({ length: 10 }, (_, i) => `<object id="${i + 1}"><components>${Array.from({ length: 10 }, () => `<component objectid="${i + 2}"/>`).join('')}</components></object>`).join('') + '<object id="11"><components><component objectid="12"/></components></object><object id="12"/>'
  const t0 = Date.now()
  assert.throws(() => readPackage(pack({ '3D/3dmodel.model': mainModel(objs, '<item objectid="1"/>') })), /threemf_too_large/)
  assert.ok(Date.now() - t0 < 3000, 'must stop quickly, not after 10^10 visits')
  const many = readPackage(pack({ '3D/3dmodel.model': mainModel('<object id="1"><components>' + '<component objectid="77"/>'.repeat(5000) + '</components></object>', '<item objectid="1"/>') }))
  assert.equal(many.missing.length, LIMITS.maxMissing) // the list of missing parts stays short
  assert.equal(many.missing.overflow, 5000 - LIMITS.maxMissing)
})

test('what is drawn is bounded too: unique triangles times instances', () => {
  const comps = '<component objectid="2"/>'.repeat(30)
  const xml = mainModel('<object id="1"><components>' + comps + '</components></object><object id="2">' + mesh(100) + '</object>', '<item objectid="1"/>')
  assert.throws(() => readPackage(pack({ '3D/3dmodel.model': xml }), { ...LIMITS, maxDrawnTriangles: 2000 }), /threemf_too_large/)
  assert.equal(readPackage(pack({ '3D/3dmodel.model': xml })).instances.length, 30)
})

test('XML that is valid but unusual: single quotes, ">" in values, comments, CDATA, numeric entities', () => {
  const xml = `<?xml version='1.0'?><model unit='millimeter' ${NS}><resources>
    <!-- <object id="99"><mesh><vertices><vertex x="1" y="1" z="1"/></vertices></mesh></object> -->
    <object id='1' name='A &gt; B &#228; &#x4E2D;'><mesh><vertices><vertex x='0' y='0' z='0'/><vertex x='1' y='0' z='0'/><vertex x='0' y='1' z='0'/></vertices><triangles><triangle v1='0' v2='1' v3='2'/></triangles></mesh></object>
    <![CDATA[ <object id="98"/> ]]>
    </resources><build><item objectid='1'/></build></model>`
  const r = readPackage(pack({ '3D/3dmodel.model': xml }))
  assert.equal(r.instances.length, 1)
  assert.equal(r.instances[0].label, 'A > B ä 中')
  assert.equal(r.meshes.get(r.instances[0].key).idx.length, 3)
  const hostile = '<a'.repeat(200000)
  const t0 = Date.now()
  parseModel(hostile)
  assert.ok(Date.now() - t0 < 2000, 'a hostile file with many "<" and no ">" must not hang the tokenizer')
})

test('bad triangles are dropped, not turned into NaN; p1 without pid uses the object material', () => {
  const xml = `<?xml version="1.0"?><model ${NS}><resources><basematerials id="5"><base name="a" displaycolor="#112233"/></basematerials><object id="1" pid="5" pindex="0"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/><triangle v1="0" v2="5" v3="2"/><triangle v1="0" v2="-1" v3="2"/><triangle v1="0" v2="1.5" v3="2"/><triangle v1="2" v2="1" v3="0" p1="0"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>`
  const m = parseModel(xml)
  assert.equal(m.objects.get('1').mesh.idx.length / 3, 2)
  assert.equal(m.skipped, 3)
  const r = readPackage(pack({ '3D/3dmodel.model': xml }))
  assert.equal(r.stats.skippedTriangles, 3)
  assert.equal(r.meshes.get(r.instances[0].key).triColors?.get(1), 0x112233) // the triangle with p1 only: object's material
})

test('painted triangles (paint_color): a whole-triangle code takes the filament color, finer paint is counted and keeps the part color', () => {
  assert.deepEqual(decodePaint('8'), { state: 2, fine: false })
  assert.deepEqual(decodePaint('4'), { state: 1, fine: false })
  assert.equal(decodePaint('C').fine, true, 'the marker alone is not a complete code')
  assert.deepEqual(decodePaint('0C'), { state: 3, fine: false })
  assert.deepEqual(decodePaint('1C'), { state: 4, fine: false })
  assert.deepEqual(decodePaint('0'), { state: null, fine: false })
  assert.equal(decodePaint('5').fine, true, 'a split triangle')
  assert.equal(decodePaint('zz').fine, true)
  const tri = (i, extra = '') => `<triangle v1="${i}" v2="${i + 1}" v3="${i + 2}"${extra}/>`
  const verts = Array.from({ length: 8 }, (_, i) => `<vertex x="${i}" y="${i % 2}" z="${i % 3}"/>`).join('')
  const model = `<?xml version="1.0"?><model unit="millimeter" ${NS}><resources><object id="1" type="model"><mesh><vertices>${verts}</vertices><triangles>${tri(0)}${tri(1, ' paint_color="8"')}${tri(2, ' paint_color="5"')}${tri(5, ' paint_color="4"')}<triangle v1="0" v2="1" v3="99" paint_color="8"/>${tri(3, ' paint_color="8"')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`
  const settings = '{"filament_colour": ["#112233", "#445566", "#778899"]}'
  const pkg = readPackage(pack({ '3D/3dmodel.model': model, 'Metadata/project_settings.config': settings }))
  assert.deepEqual(pkg.stats.paint, { painted: 3, fine: 1 }) // the triangle with a bad index is gone with its paint
  const m = pkg.meshes.get([...pkg.meshes.keys()][0])
  assert.equal(m.triColors.get(1), 0x445566)
  assert.equal(m.triColors.get(3), 0x112233)
  assert.equal(m.triColors.get(4), 0x445566, 'the numbers follow the triangles that are kept')
  assert.equal(m.triColors.has(2), false)
})
