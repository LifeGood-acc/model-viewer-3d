# Third-party notices

3D Model Viewer bundles the following open-source code, unmodified, in `editor/vendor/`. Almost all of it is MIT-licensed; the Draco decoder is Apache-2.0 and the Rust crates inside Spark are MIT/Apache-2.0 and similar permissive licenses (see below); the
full license texts are in `editor/vendor/` (`LICENSE.three.txt`, `LICENSE.fflate.txt`, `LICENSE.apache-2.0.txt`) and `editor/vendor/spark/LICENSE.spark.txt` (copied below). Nothing is
downloaded at run time.

## Where each file comes from (npm)

Every vendored file is a byte-identical copy of a file in an npm package. `dev/vendor.json` records, for each file, the package, the
file's path inside it and its SHA-256, plus the package tarball's integrity (sha512, as npm publishes it).
**Reproducible build:** `npm ci && npm run build` (versions and integrity hashes are locked in `package.json` and `package-lock.json`) copies the files out of the npm packages into `editor/vendor/`; `npm run verify-build` does it in a temporary folder and compares with the committed files.
The Spark file `spark.module.js` is the readable (not minified) `dist` module of the npm package `@sparkjsdev/spark@2.4.0` (its TypeScript and Rust sources are in the upstream repository, tag v2.4.0); its WebAssembly is embedded as one long text line. This project does not minify anything.

`node dev/vendor.mjs --check` verifies the files offline (the unit tests run it); `node dev/vendor.mjs --update` downloads each
package with `npm pack`, verifies the integrity and rebuilds the files, which must come out byte-identical.
**No file is minified by this project.** `three.module.js` and `three.core.js` are the readable builds in the npm package
`three@0.187.0` (`build/`; the r187 package ships no `.min.js` files, so the readable builds are vendored as they are);
they are the build output of the tag r187 in the GitHub repository.

| Component | npm package, version | License | Files in `editor/vendor/` | Source |
| --- | --- | --- | --- | --- |
| three.js (core) | `three@0.187.0` (`build/three.module.js`, `build/three.core.js`) | MIT, Copyright © 2010-2026 three.js authors | `three.module.js`, `three.core.js` | https://github.com/mrdoob/three.js (tag r187) |
| three.js loaders, exporter and controls | `three@0.187.0` (`examples/jsm/`) | MIT, same as three.js | `addons/loaders/GLTFLoader.js`, `DRACOLoader.js` (loaded only for files that need it), `FBXLoader.js` with `addons/curves/NURBSCurve.js` and `NURBSUtils.js` (loaded only for FBX files), `PCDLoader.js`, `PLYLoader.js`, `OBJLoader.js`, `STLLoader.js`, `3MFLoader.js`, `addons/exporters/GLTFExporter.js`, `addons/controls/OrbitControls.js`, `addons/utils/BufferGeometryUtils.js`, `addons/utils/SkeletonUtils.js`, `addons/postprocessing/Pass.js` (used by Spark) | same package |
| fflate | 0.8.3, the copy inside `three@0.187.0` (`examples/jsm/libs/fflate.module.js`); license text from `fflate@0.8.3` (the license text is the same) | MIT, Copyright (c) 2026 Arjun Barrett | `addons/libs/fflate.module.js`, `LICENSE.fflate.txt` | https://github.com/101arrowz/fflate |
| meshoptimizer decoder | 1.1, the copy inside `three@0.187.0` (`examples/jsm/libs/meshopt_decoder.module.js`; WebAssembly embedded as text) | MIT, Copyright (C) 2016-2026 Arseny Kapoulkine | `addons/libs/meshopt_decoder.module.js` (reads `EXT_meshopt_compression` glTF files) | https://github.com/zeux/meshoptimizer |
| meshoptimizer encoder and simplifier (tools, loaded only when used) | `meshoptimizer@1.3.0` (`meshopt_encoder.js`, `meshopt_simplifier.js`; WebAssembly embedded as text) | MIT, Copyright (C) 2016-2026 Arseny Kapoulkine | `meshopt/meshopt_encoder.js`, `meshopt/meshopt_simplifier.js`, `meshopt/LICENSE.meshoptimizer.txt` | https://github.com/zeux/meshoptimizer |
| Draco decoder (glTF build; WebAssembly) | the copy inside `three@0.187.0` (`examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js`, `draco_decoder.wasm`); the upstream version is 1.5.6 (see below), the sources are at https://github.com/google/draco (branch `gltf_2.0_draco_extension`) | Apache-2.0, Copyright The Draco Authors (as named in the upstream repository, not repeated in the files) | `addons/libs/draco/gltf/draco_wasm_wrapper.js`, `addons/libs/draco/gltf/draco_decoder.wasm`, `LICENSE.apache-2.0.txt` | https://github.com/google/draco |
| Spark, Gaussian-splat renderer (loaded only for splat files) | `@sparkjsdev/spark@2.4.0` (`dist/spark.module.js`, 3.0 MB, readable, not minified; the source map is in the same package, the sources at https://github.com/sparkjsdev/spark) | MIT, Copyright © 2025 World Labs Technologies, Inc. (the compiled WebAssembly inside also contains Rust crates, see below) | `spark/spark.module.js`, `spark/LICENSE.spark.txt` | https://github.com/sparkjsdev/spark |

**Draco decoder: version 1.5.6, license Apache-2.0 (clarified).** The files are the copy inside `three@0.187.0`; the three.js history of both files
(`draco_decoder.wasm`, `draco_wasm_wrapper.js`) shows one change since the removal of `examples/js`: commit `a79f0788d` of 2023-02-10, "DRACOLoader: Update Draco decoders to v1.5.6"
(mrdoob/three.js#25475); nothing changed them up to the tag r187 (queried from the GitHub API on 2026-11-21). The WebAssembly contains Draco's C++ decoder classes (`draco::...`) and no
other library. Draco 1.5.6 (https://github.com/google/draco, tag 1.5.6) has the license Apache-2.0 in `LICENSE` (the file also lists MIT and public-domain texts for `docs/` files that are not part of the decoder)
and no `NOTICE` file; its `AUTHORS` file names "Google Inc. and other contributors". The JavaScript wrapper is Emscripten output (Closure-compiled); Emscripten's runtime parts are MIT/NCSA-licensed
and carry no notice in the file. The Draco decoder is loaded only when a glTF file needs it.

**KTX2 / Basis Universal: not shipped (verified).** No `basis_transcoder`, `KTX2Loader` or Basis file is in `editor/vendor/` (searched by name and by content on 2026-11-21); the only mention
is the error text in `GLTFLoader.js` ("setKTX2Loader must be called ..."), which is part of the unmodified loader. The plugin therefore contains no Basis Universal (Apache-2.0) or KTX2 code.

**Rust crates inside Spark 2.4.0 (clarified, from the source).** `spark.module.js` carries one WebAssembly module (1.81 MB, embedded as base64) that Spark builds from `rust/spark-rs` (with `rust/spark-lib`) in its repository
(`wasm-pack build --target web --release`, tag v2.4.0, commit `ffe210dc0a45d0515a06c9235878108112827d61`). The dependency list below was made with `cargo metadata --locked --filter-platform wasm32-unknown-unknown` from
`rust/Cargo.lock` of that tag: all 79 third-party crates reachable from `spark-rs`. The WebAssembly was decoded from the shipped file and searched for crate paths: 20 crates are named in it with exactly the versions of `Cargo.lock`
(for example `wasm-bindgen-0.2.117`, `image-0.25.10`, `zip-7.2.0`, `zlib-rs-0.6.3`), which ties the shipped binary to that lock file. Crates that are only named in `Cargo.lock` are marked.
Every crate carries a permissive license, and almost all offer a choice ("OR"), of which MIT or Apache-2.0 is available for each; none is GPL, AGPL or LGPL. Spark's own crates are MIT (workspace `license = "MIT"`, Copyright World Labs Technologies).
Licenses are taken from each crate's `Cargo.toml` as read by `cargo metadata`; the license texts of the crates were not copied one by one (see "Limits of this license check").

The Spark WebAssembly is the upstream binary as published on npm, not rebuilt here. Its panic messages (Rust crate sources compiled in) contain build paths from the upstream developer's machine (a user folder, then `.cargo/registry/src/...`); those paths are part of the public npm package and are not data of this project. Removing them would change the file, so it is shipped unchanged, like the other vendored files.

| Crate and version | License (SPDX, as declared) | In the shipped wasm |
| --- | --- | --- |
| `adler2` 2.0.1 | 0BSD OR MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `ahash` 0.7.8 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `ahash` 0.8.12 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `allocator-api2` 0.2.21 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `anyhow` 1.0.98 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `autocfg` 1.5.0 | Apache-2.0 OR MIT | build time only (macro or build script), not in the wasm |
| `bitflags` 2.11.0 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `bumpalo` 3.20.2 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `bytemuck` 1.25.0 | Zlib OR Apache-2.0 OR MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `bytemuck_derive` 1.10.2 | Zlib OR Apache-2.0 OR MIT | build time only (macro or build script), not in the wasm |
| `byteorder-lite` 0.1.0 | Unlicense OR MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `cfg-if` 1.0.0 | MIT/Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `console_error_panic_hook` 0.1.7 | Apache-2.0/MIT | found in the wasm (panic path) |
| `const-random` 0.1.18 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `const-random-macro` 0.1.16 | MIT OR Apache-2.0 | build time only (macro or build script), not in the wasm |
| `crc32fast` 1.5.0 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `crunchy` 0.2.3 | MIT | build time only (macro or build script), not in the wasm |
| `doc-comment` 0.3.4 | MIT | build time only (macro or build script), not in the wasm |
| `either` 1.15.0 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `equivalent` 1.0.2 | Apache-2.0 OR MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `fdeflate` 0.3.7 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `flate2` 1.1.10 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `foldhash` 0.2.0 | Zlib | linked per Cargo.lock; not named in the wasm (code inlined) |
| `futures-core` 0.3.32 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `futures-task` 0.3.32 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `futures-util` 0.3.32 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `getrandom` 0.2.16 | MIT OR Apache-2.0 | build time only (macro or build script), not in the wasm |
| `glam` 0.30.8 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `half` 2.6.0 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `hashbrown` 0.11.2 | Apache-2.0/MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `hashbrown` 0.16.1 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `hnsw` 0.11.0 | MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `image` 0.25.10 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `image-webp` 0.2.4 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `indexmap` 2.13.0 | Apache-2.0 OR MIT | found in the wasm (panic path) |
| `itertools` 0.14.0 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `itoa` 1.0.15 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `js-sys` 0.3.94 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `libm` 0.2.16 | MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `memchr` 2.7.6 | Unlicense OR MIT | found in the wasm (panic path) |
| `miniz_oxide` 0.8.9 | MIT OR Zlib OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `miniz_oxide` 0.9.1 | MIT OR Zlib OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `moxcms` 0.8.1 | BSD-3-Clause OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `num-traits` 0.2.19 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `once_cell` 1.21.3 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `ordered-float` 5.1.0 | MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `pin-project-lite` 0.2.17 | Apache-2.0 OR MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `png` 0.18.1 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `proc-macro2` 1.0.95 | MIT OR Apache-2.0 | build time only (macro or build script), not in the wasm |
| `pxfm` 0.1.28 | BSD-3-Clause OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `quick-error` 2.0.1 | MIT/Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `quote` 1.0.40 | MIT OR Apache-2.0 | build time only (macro or build script), not in the wasm |
| `rand_core` 0.6.4 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `rand_pcg` 0.3.1 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `rustversion` 1.0.20 | MIT OR Apache-2.0 | build time only (macro or build script), not in the wasm |
| `ruzstd` 0.9.1 | MIT | found in the wasm (panic path) |
| `ryu` 1.0.20 | Apache-2.0 OR BSL-1.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `serde` 1.0.228 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `serde-wasm-bindgen` 0.6.5 | MIT | found in the wasm (panic path) |
| `serde_core` 1.0.228 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `serde_derive` 1.0.228 | MIT OR Apache-2.0 | build time only (macro or build script), not in the wasm |
| `serde_json` 1.0.145 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `simd-adler32` 0.3.9 | MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `slab` 0.4.12 | MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `smallvec` 1.15.1 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `space` 0.17.0 | MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `syn` 2.0.100 | MIT OR Apache-2.0 | build time only (macro or build script), not in the wasm |
| `tiny-keccak` 2.0.2 | CC0-1.0 | build time only (macro or build script), not in the wasm |
| `typed-path` 0.12.3 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `unicode-ident` 1.0.18 | (MIT OR Apache-2.0) AND Unicode-3.0 | build time only (macro or build script), not in the wasm |
| `version_check` 0.9.5 | MIT/Apache-2.0 | build time only (macro or build script), not in the wasm |
| `wasm-bindgen` 0.2.117 | MIT OR Apache-2.0 | found in the wasm (panic path) |
| `wasm-bindgen-macro` 0.2.117 | MIT OR Apache-2.0 | build time only (macro or build script), not in the wasm |
| `wasm-bindgen-macro-support` 0.2.117 | MIT OR Apache-2.0 | build time only (macro or build script), not in the wasm |
| `wasm-bindgen-shared` 0.2.117 | MIT OR Apache-2.0 | build time only (macro or build script), not in the wasm |
| `web-sys` 0.3.94 | MIT OR Apache-2.0 | linked per Cargo.lock; not named in the wasm (code inlined) |
| `zerocopy` 0.8.27 | BSD-2-Clause OR Apache-2.0 OR MIT | linked per Cargo.lock; not named in the wasm (code inlined) |
| `zip` 7.2.0 | MIT | found in the wasm (panic path) |
| `zlib-rs` 0.6.3 | Zlib | found in the wasm (panic path) |

Special cases: `foldhash` and `zlib-rs` are Zlib; `ryu` is Apache-2.0 OR BSL-1.0; `moxcms` and `pxfm` are BSD-3-Clause OR Apache-2.0; `zerocopy` is BSD-2-Clause OR Apache-2.0 OR MIT; `tiny-keccak` is CC0-1.0 and (with `const-random`) comes
only through the compile-time random seed of `ahash`, so it runs at build time. `unicode-ident` (Unicode-3.0) is a proc-macro helper, build time only.

**Limits of this license check (stated, not hidden).** (1) The license texts and copyright lines of the individual Rust crates are **not copied** into this repository. The crates are permissive (MIT, Apache-2.0, Zlib, BSD, Unlicense, CC0, BSL-1.0; see the table), and the MIT and Apache-2.0 notices of each crate are available in the crate sources named in Spark's `rust/Cargo.lock` (tag v2.4.0) and on crates.io under the exact versions listed above. This section and the list are the notice that travels with the binary. (2) The Rust standard library and `compiler-builtins` (MIT OR Apache-2.0) are compiled into every Rust WebAssembly module and are not in `Cargo.lock`. (3) It was not checked that the shipped WebAssembly is bit-identical to a rebuild from the tag (Spark's build is not reproducible here without its exact toolchain).

A per-file table (source, version, license, size, SHA-256 of every bundled third-party file) is in [docs/VENDORED.md](docs/VENDORED.md).

Package integrity (from the npm registry): `three@0.187.0` `sha512-Qiu7R+Cmh8CstZsY1uJOSWnVlfo7ZtNLV7mF8Jltk3LB3AtDu9cRZlcnRKkAk8Y4z6KKw35z7Y7Urd7jWY8etA==`;
`fflate@0.8.3` `sha512-tbZNuJrLwGUp3zshBtdy4W+ORxZuIh8a5ilyIEQDC5rY1f3U20JMry0Ll3WBzU58EZKsEuJFXhb5gwv8CsPvgA==`;
`@sparkjsdev/spark@2.4.0` `sha512-aUjgBfhwDRcF3nUwiAD6Nh7IwvxEmW9liz2qrAXIm2BlPYBmn81QbXIpGFLBSr/o0TKGvEXbNIsKujgPGV/7QQ==`;
`meshoptimizer@1.3.0` `sha512-2oZqMAcEEiCtXWUjIGtZ71oPx1B0ZxYGTqIKsXB1wzWFhleNsCFxQuUJzgCV706bRcwPWtMGf1odmQvAcqKkIw==`.

Development tools that are **not** part of the plugin: the sample files are generated by `dev/make_samples.py`; the meshopt sample
is made with `gltfpack@1.3.0` from npm (MIT, run through `npx`, optional). The sample files are not committed.

No code with a copyleft license (GPL, AGPL, LGPL) is included.

## three.js and its loaders (MIT)

The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


## fflate (MIT)

MIT License

Copyright (c) 2026 Arjun Barrett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## meshoptimizer decoder, encoder and simplifier (MIT)


MIT License

Copyright (c) 2016-2026 Arseny Kapoulkine

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Spark (MIT)

The MIT License

Copyright © 2025 WORLD LABS TECHNOLOGIES, INC.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
## Apache License 2.0 (Draco)

The text is in `editor/vendor/LICENSE.apache-2.0.txt` (the standard text; no NOTICE file is distributed with the copied files).

