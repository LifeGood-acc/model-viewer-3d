# Repository layout and release rules

Fixed before the first release tag, because moving a plugin to another folder or repository later counts as a transfer for the
plugin catalog (new versions are paused until the move is confirmed).

- **One plugin, one repository.** The plugin manifest `orca-plugin.json` is at the repository root, so the catalog entry needs no
  `source.path` (`orca plugin release-entry .` prints none). Do not move the plugin into a subfolder or a monorepo after the first tag.
- **Entry points** are `editor/index.html` (editor) and `editor/panel.html` (sidebar panel, a byte copy of `index.html`; Orca builds
  one frame per entry file). Shared layout code is `editor/shared/` (canonical copy outside this repository, see the test that checks it).
- **No binary sample files in the repository.** The catalog rejects archives (a `.3mf` is a ZIP), so every sample model is generated:
  `python3 dev/make_samples.py [--out DIR]` (standard library only, deterministic). `samples/` is ignored by git. Only images
  (`assets/`, `docs/images/`) and WebAssembly are binary files here.
- **No minified code without its source.** Third-party files are copied byte for byte from pinned npm packages (the three.js builds and loaders are readable, not minified; the Draco wrapper, meshoptimizer and the WebAssembly embedded in Spark are upstream's compiled output, whose sources are in the upstream repositories); `dev/vendor.json` records every vendored file (package, path inside it, SHA-256) and each package's integrity,
  `node dev/vendor.mjs --check` verifies them offline and `--update` rebuilds them from npm. `THIRD_PARTY_NOTICES.md` lists the origins.
- **Cover and screenshots** (`docs/images/`, cover 1600 x 1000 = 16:10, icon 256 x 256) show only generated example scenes: `dev/make_samples.py` (a table scene, a textured sphere, a trefoil-knot point cloud, a torus). None shows a file from a real project; add new ones the same way.
- **Names.** The display name must not start with the word "Orca"; the plugin id must not start with `orca-`.
- **Versions and tags are final** (a moved tag is rejected). Release only from a clean `main`.
- Nothing is published or pushed from this working copy; publishing is a separate decision.
