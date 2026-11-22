#!/usr/bin/env node
// Writes test files in the compressed glTF forms the viewer reads, from the generated samples (never committed; the .gltf variants
// are written by make_samples.py, they need no tools):
//   node dev/make_compressed_samples.mjs <samples-dir> <tools-dir>
//   draco.glb   parts.glb with KHR_draco_mesh_compression
//   ktx2.glb    textured.glb with its texture as KTX2 (Basis Universal, UASTC) through KHR_texture_basisu
// <tools-dir> is a folder where the generator tools are installed (they are test tools, not part of the plugin):
//   npm install --prefix <tools-dir> @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 draco3dgltf ktx2-encoder sharp
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const [samples, tools] = process.argv.slice(2).map((p) => p && resolve(p))
if (!samples || !tools) throw new Error('usage: node dev/make_compressed_samples.mjs <samples-dir> <tools-dir>')
// the tools are ESM-only or CommonJS: load them by file from <tools-dir>
const FILES = { '@gltf-transform/core': 'dist/index.js', '@gltf-transform/extensions': 'dist/index.js', '@gltf-transform/functions': 'dist/index.js', 'ktx2-encoder/gltf-transform': 'dist/gltf-transform/index.js' }
const imp = (name) => import(pathToFileURL(join(tools, 'node_modules', name === 'ktx2-encoder/gltf-transform' ? 'ktx2-encoder' : name, FILES[name])).href)
const req = createRequire(join(tools, 'package.json'))
const { NodeIO } = await imp('@gltf-transform/core')
const { ALL_EXTENSIONS } = await imp('@gltf-transform/extensions')
const { draco } = await imp('@gltf-transform/functions')
const draco3d = req('draco3dgltf')
const sharp = req('sharp')
const { ktx2 } = await imp('ktx2-encoder/gltf-transform')

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule()
})

// Draco
{
  const doc = await io.read(join(samples, 'parts.glb'))
  await doc.transform(draco({ method: 'edgebreaker' }))
  await io.write(join(samples, 'draco.glb'), doc)
  console.log('draco.glb', readFileSync(join(samples, 'draco.glb')).length, 'bytes')
}
// KTX2
{
  const doc = await io.read(join(samples, 'textured.glb'))
  const imageDecoder = async (buffer) => {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data: new Uint8Array(data), width: info.width, height: info.height }
  }
  await doc.transform(ktx2({ isUASTC: true, generateMipmap: true, imageDecoder }))
  await io.write(join(samples, 'ktx2.glb'), doc)
  console.log('ktx2.glb', readFileSync(join(samples, 'ktx2.glb')).length, 'bytes')
}
