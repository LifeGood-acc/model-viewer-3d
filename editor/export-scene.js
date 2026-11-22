// A GLB of the whole scene through three.js' GLTFExporter: materials, textures and animations as the file had them. (The other copy
// formats are written by shared/export.js from plain arrays; the picture and the video are in shared/export-three.js.)
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { exportRotation } from './shared/export.js'

// A copy of a material as the file had it: the viewer changes side, texture, opacity and clipping on the real one.
function pristine(m, cache) {
  if (cache.has(m)) return cache.get(m)
  const u = m.userData || {}
  m.userData = {} // clone() serializes userData, and ours holds textures
  const c = m.clone()
  m.userData = u
  if (u.side0 !== undefined) c.side = u.side0
  if (u.map0 !== undefined) c.map = u.map0
  if (u.o) {
    c.transparent = u.o.transparent
    c.opacity = u.o.opacity
    c.depthWrite = u.o.depthWrite
  }
  if ('wireframe' in c) c.wireframe = false
  c.clippingPlanes = null
  cache.set(m, c)
  return c
}

/**
 * A GLB of the whole scene, turned so that `target` ('keep', 'y', 'z') is up. `textures` are swapped to their full-size images
 * while the exporter reads them (the viewer may show a smaller version).
 */
export async function exportGlb({ model, parts, modelRoot, visibleOnly, fileUp, target, textures = [], scale = 1 }) {
  const clone = SkeletonUtils.clone(model) // like clone(true), and a skinned mesh gets the cloned bones instead of the original ones
  const list = []
  clone.traverse((o) => {
    if (o.geometry && o.geometry.getAttribute('position') && (o.isMesh || o.isPoints || o.isLine)) list.push(o)
  })
  clone.userData = {} // the clips are passed on their own; as userData they would be written into the root node's extras, a second time
  if (list.length !== parts.length) throw new Error('the scene changed while it was copied')
  const cache = new Map()
  list.forEach((o, i) => {
    const orig = parts[i].orig
    o.material = Array.isArray(orig) ? orig.map((m) => pristine(m, cache)) : pristine(orig, cache)
    o.visible = visibleOnly ? parts[i].visible : true
  })
  const wrap = new THREE.Group()
  wrap.name = clone.name || 'Scene'
  const rot = exportRotation(fileUp, target)
  if (rot || scale !== 1) {
    // position, rotation and scale rather than a matrix: with animations the exporter writes each node's TRS and ignores `matrix`
    const m = rot ? new THREE.Matrix4().set(rot[0], rot[1], rot[2], 0, rot[3], rot[4], rot[5], 0, rot[6], rot[7], rot[8], 0, 0, 0, 0, 1) : new THREE.Matrix4()
    new THREE.Matrix4().makeScale(scale, scale, scale).multiply(m).decompose(wrap.position, wrap.quaternion, wrap.scale)
  }
  wrap.add(clone)
  const swapped = []
  for (const tx of textures) {
    const full = tx.userData && tx.userData.full
    if (full && tx.image !== full) {
      swapped.push([tx, tx.image])
      tx.image = full
    }
  }
  try {
    const clips = (model.userData && model.userData.animations) || []
    const result = await new GLTFExporter().parseAsync(wrap, { binary: true, onlyVisible: true, animations: clips, maxTextureSize: Infinity })
    return new Uint8Array(result)
  } finally {
    for (const [tx, img] of swapped) tx.image = img
    for (const m of cache.values()) m.dispose()
  }
}
