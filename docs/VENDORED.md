# Vendored third-party files

Every file below `editor/vendor/` is a third-party file that this project does **not** write, minify or transform. Each one is a byte-identical copy of a file in a pinned npm package. This page lists, for every such file, where it comes from, its version, its license and its SHA-256, and how to rebuild it.

## Rebuild and verify

```sh
npm ci                # installs the exact packages locked in package-lock.json (integrity hashes)
npm run build         # copies the files out of node_modules into editor/vendor (node dev/build.mjs)
npm run verify-build  # rebuilds into a temporary folder and compares with the committed files (exit 1 on any difference)
node dev/vendor.mjs --check    # offline: the SHA-256 of every vendored file against dev/vendor.json
```

`dev/vendor.json` is the machine-readable source of this page (package, version, tarball integrity, file path inside the package, SHA-256). `THIRD_PARTY_NOTICES.md` has the license notices and the license texts live next to the files (`LICENSE.*.txt`). A file that is not in the table is the project's own code (MIT, see `LICENSE`), including `editor/shared/`.

Files that are compiled output (their sources are in the upstream repositories, not in this one): the WebAssembly modules (`draco_decoder.wasm`, and the WebAssembly embedded as base64 text in `meshopt_decoder.module.js`, `meshopt_encoder.js`, `meshopt_simplifier.js` and `spark.module.js`) and the Emscripten wrapper `draco_wasm_wrapper.js`. The three.js files are the readable builds of the npm release (no minified file is vendored).

## three 0.187.0 (MIT)

- npm: https://www.npmjs.com/package/three/v/0.187.0
- source: https://github.com/mrdoob/three.js/tree/r187
- tarball integrity: `sha512-Qiu7R+Cmh8CstZsY1uJOSWnVlfo7ZtNLV7mF8Jltk3LB3AtDu9cRZlcnRKkAk8Y4z6KKw35z7Y7Urd7jWY8etA==`
- three.module.js and three.core.js are the builds of this npm release as published (build/); the npm package ships no minified builds since r187, so the readable files are vendored unchanged.

| File in `editor/vendor/` | Path in the package | Size | License | SHA-256 |
| --- | --- | --- | --- | --- |
| `three.module.js` | `build/three.module.js` | 643.5 KiB | MIT (three.js r187) | `104f56145899722094556490d787aae0617cc2fc3382f31df02d724ea1aee341` |
| `three.core.js` | `build/three.core.js` | 1.41 MiB | MIT (three.js r187) | `613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578` |
| `LICENSE.three.txt` | `LICENSE` | 1.1 KiB | license text | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` |
| `addons/loaders/GLTFLoader.js` | `examples/jsm/loaders/GLTFLoader.js` | 117.1 KiB | MIT (three.js r187) | `532ac726e120039acbcd6cf54328c57acbf7b438176afaa6951257126d11bff1` |
| `addons/loaders/PLYLoader.js` | `examples/jsm/loaders/PLYLoader.js` | 22.2 KiB | MIT (three.js r187) | `751ff866f793ba1fc9181425748d88b7f9234c6e9983386fdaf2e664221340f2` |
| `addons/loaders/OBJLoader.js` | `examples/jsm/loaders/OBJLoader.js` | 22.8 KiB | MIT (three.js r187) | `355484026ac163fdeceececaa943b0473a2e169444015cd2209cc7d27b5b894d` |
| `addons/loaders/STLLoader.js` | `examples/jsm/loaders/STLLoader.js` | 10.5 KiB | MIT (three.js r187) | `a07441b8cd812faf8049741fe5e95373b19547e4038694753dfec26fe230a7eb` |
| `addons/loaders/3MFLoader.js` | `examples/jsm/loaders/3MFLoader.js` | 43.4 KiB | MIT (three.js r187) | `154d7cb43f9fd3f936350209c99e591f4dbe2f61f014862043f9e151b047e1c6` |
| `addons/controls/OrbitControls.js` | `examples/jsm/controls/OrbitControls.js` | 40.0 KiB | MIT (three.js r187) | `e7fca2fe9e7670a828af9b28084669a5909445b7f36f1f26cee9bf8f2961c32c` |
| `addons/utils/BufferGeometryUtils.js` | `examples/jsm/utils/BufferGeometryUtils.js` | 38.2 KiB | MIT (three.js r187) | `7bda2a8ba836b2bcf67cb938d4b9e1bb5d1b1bc616817103ed858c0b58296ce7` |
| `addons/libs/fflate.module.js` | `examples/jsm/libs/fflate.module.js` | 89.0 KiB | MIT (fflate 0.8.3) | `4ab9828cf361a8009b71094ea251e076168de20f72eaa1e745da8aba88c725ac` |
| `addons/libs/meshopt_decoder.module.js` | `examples/jsm/libs/meshopt_decoder.module.js` | 28.6 KiB | MIT (meshoptimizer 1.1) | `d428e73a000057c6c94bfcedc3412d0c2dc14ca8800e88553aab05113ad2bf19` |
| `addons/exporters/GLTFExporter.js` | `examples/jsm/exporters/GLTFExporter.js` | 91.4 KiB | MIT (three.js r187) | `569793baeba62baeb4ab0b3619b6b1495b45d4b2ba9690430497adb58307bdf2` |
| `addons/utils/SkeletonUtils.js` | `examples/jsm/utils/SkeletonUtils.js` | 11.3 KiB | MIT (three.js r187) | `b1632a703206c3d830de9fcbe515696770d04b71a15ee6b50afa6d2c3298c86f` |
| `addons/postprocessing/Pass.js` | `examples/jsm/postprocessing/Pass.js` | 4.1 KiB | MIT (three.js r187) | `444b409c235ead986893c472e720da1b779a56985c7d10b279c7944b52bd61c5` |
| `addons/loaders/DRACOLoader.js` | `examples/jsm/loaders/DRACOLoader.js` | 18.7 KiB | MIT (three.js r187) | `344684542690b7381d86970bbc428a87c89293730f9e9ec8be592b9e5b3263a9` |
| `addons/libs/draco/gltf/draco_wasm_wrapper.js` | `examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js` | 57.1 KiB | Apache-2.0 (Draco 1.5.6) | `8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6` |
| `addons/libs/draco/gltf/draco_decoder.wasm` | `examples/jsm/libs/draco/gltf/draco_decoder.wasm` | 187.9 KiB | Apache-2.0 (Draco 1.5.6) | `a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac` |
| `LICENSE.apache-2.0.txt` | (not from the npm file list: the standard Apache License 2.0 text (trimmed from the copy in rxjs@7.8.1 at "END OF TERMS AND CONDITIONS"; rxjs is not otherwise used); not rebuilt by --update) | 9.6 KiB | license text | `aaade63eb260977c8b4de42bbebc38af71a81a9c023ce9c4d94169bcd2808563` |
| `addons/loaders/PCDLoader.js` | `examples/jsm/loaders/PCDLoader.js` | 16.3 KiB | MIT (three.js r187) | `5931640bfcba801effbf6d6c5e73fdb318488d310dff14bf46aea016e867bf79` |
| `addons/loaders/FBXLoader.js` | `examples/jsm/loaders/FBXLoader.js` | 110.9 KiB | MIT (three.js r187) | `04daa9a7054f17838b78a114e7d400c05d08d72afa7b62f2fc1d508909a6df3c` |
| `addons/curves/NURBSCurve.js` | `examples/jsm/curves/NURBSCurve.js` | 4.1 KiB | MIT (three.js r187) | `f5aaeff3ed9b659c3d9c599878ede3106d93665e3243e502a09375f2edaed7fa` |
| `addons/curves/NURBSUtils.js` | `examples/jsm/curves/NURBSUtils.js` | 10.5 KiB | MIT (three.js r187) | `c6bd7c4137d585098923f189687898ea3e8762ea3ecbe255d749a56353894379` |

## fflate 0.8.3 (MIT)

- npm: https://www.npmjs.com/package/fflate/v/0.8.3
- source: https://github.com/101arrowz/fflate
- tarball integrity: `sha512-tbZNuJrLwGUp3zshBtdy4W+ORxZuIh8a5ilyIEQDC5rY1f3U20JMry0Ll3WBzU58EZKsEuJFXhb5gwv8CsPvgA==`
- Only the license text comes from this package; editor/vendor/addons/libs/fflate.module.js is the copy that ships inside three.js (listed under three).

| File in `editor/vendor/` | Path in the package | Size | License | SHA-256 |
| --- | --- | --- | --- | --- |
| `LICENSE.fflate.txt` | `LICENSE` | 1.0 KiB | license text | `0a1df3a083d0c010560aa342e87959c8c1070e6fd54545741f083f22d0c8b551` |

## meshoptimizer 1.3.0 (MIT)

- npm: https://www.npmjs.com/package/meshoptimizer/v/1.3.0
- source: https://github.com/zeux/meshoptimizer
- tarball integrity: `sha512-2oZqMAcEEiCtXWUjIGtZ71oPx1B0ZxYGTqIKsXB1wzWFhleNsCFxQuUJzgCV706bRcwPWtMGf1odmQvAcqKkIw==`
- Encoder (compression for EXT_meshopt_compression) and simplifier (decimation, point thinning), each a JavaScript file with its WebAssembly embedded as text; loaded only when a tool is used. The decoder that opens such files is the one inside three.js (examples/jsm/libs/meshopt_decoder.module.js; its header says it is built from meshoptimizer 1.1).

| File in `editor/vendor/` | Path in the package | Size | License | SHA-256 |
| --- | --- | --- | --- | --- |
| `meshopt/meshopt_encoder.js` | `meshopt_encoder.js` | 23.8 KiB | MIT (meshoptimizer 1.3.0) | `22c128be3e22b187e2d2661882fc62f51e995f409c0fe14c9f6358cfbaff1611` |
| `meshopt/meshopt_simplifier.js` | `meshopt_simplifier.js` | 66.1 KiB | MIT (meshoptimizer 1.3.0) | `c3098ee4cb4fc242b84f064c88898e76e44bf58b0e1f693507f323c08cdbb5ed` |
| `meshopt/LICENSE.meshoptimizer.txt` | `LICENSE.md` | 1.1 KiB | license text | `f03037ca7bad1e3eb7f4a63fa6084a8baabd5ba30d3c239a9a7f35705d873e26` |

## @sparkjsdev/spark 2.4.0 (MIT)

- npm: https://www.npmjs.com/package/@sparkjsdev/spark/v/2.4.0
- source: https://github.com/sparkjsdev/spark
- tarball integrity: `sha512-aUjgBfhwDRcF3nUwiAD6Nh7IwvxEmW9liz2qrAXIm2BlPYBmn81QbXIpGFLBSr/o0TKGvEXbNIsKujgPGV/7QQ==`
- The Gaussian-splat renderer (World Labs, MIT), loaded only when a Gaussian-splat PLY is shown. spark.module.js is the readable (not minified) module of the npm package, bundled by Spark with rolldown from the TypeScript sources in the repository; the Rust/WebAssembly sources are in the repository too; its WebAssembly is embedded as text. It imports three and three/addons/postprocessing/Pass.js.

| File in `editor/vendor/` | Path in the package | Size | License | SHA-256 |
| --- | --- | --- | --- | --- |
| `spark/spark.module.js` | `dist/spark.module.js` | 2.86 MiB | MIT (Spark 2.4.0; the embedded WebAssembly also holds permissive Rust crates, see THIRD_PARTY_NOTICES.md) | `5ae86ab35d4ceb655db486dcc336299775bb314c280d7e5b39f64e4539f8e0e9` |
| `spark/LICENSE.spark.txt` | `LICENSE` | 1.1 KiB | license text | `51829693e5dccd9ca1daa093991faac3aaa93238eb8fd5f5cb4130af85791d64` |

