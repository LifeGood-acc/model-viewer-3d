# Changelog

## 0.27.1

- Release preparation (no change to the viewer; Spark is now the readable `spark.module.js` of the same npm package instead of the minified file, `fflate` lock at 0.8.3): `package.json` with `package-lock.json` and `npm ci && npm run build` rebuild `editor/vendor` byte for byte from the locked npm packages (`npm run verify-build` compares); `dev/privacy-check.sh` checks every file and the whole Git history for private data; `LICENSE` names "LifeGood-acc and contributors"; README has install, support and build notes.
- Review of the fixes: the opacity floor of the mesh lines matches the slider (0.1); a ghosted part (greyed out by a selection) keeps full-strength lines (known, not changed). Test only: the crowded-labels test now uses 600 labels, where the old scan took about ten times as long.

## 0.27.0

- Review of the second stage: switching *Mesh over the surface* off lets go of the meshes (a new file is not kept alive), its lines follow the opacity slider, and a file's own polygon offset on a material is kept (only raised while the lines are on); the hook it puts into the scene is given back when it is disposed.
- Crowded views: the search for a free label place uses a grid of the places taken, looks at the nearest first, and does not scan again for a size that already found nothing. The "No room for …" note is not painted into saved pictures.
- *Set again* during a chain keeps the changed measurement selected; the way back of *Rotate 90°* (Shift + click) is also named for screen readers.

## 0.26.0

- **Appearance > Advanced > Mesh over the surface**: the closed surface and its mesh lines at the same time (the lines are a second object that shares the part's geometry, kept in the helpers: exports, part numbers and the model itself are untouched). Hidden parts have no lines, the section cuts them too, the *Mesh* view needs no extra lines, *Default* turns it off, the choice is remembered with the view.
- **Rotate 90°** in the Edit tab is three buttons (X, Y, Z) instead of six; **Shift + click** turns the other way.
- The Parts tab has **one** hint sentence (select, Ctrl/⌘, Shift, Esc, tick, double-click) instead of two lines.
- Review of the first stage: the "no room" label goes away with the last measurement, is measured only when its text changes, straight edges continue along the best aligned segment, edge picking compares squared distances.

## 0.25.0

- **Measure tab keeps the keyboard focus**: after hiding, colouring, selecting, deleting or setting a point again, the focus stays on the same control (after a delete it moves to the neighbouring row). Tab names read steadily (the eye keeps its name, only its state changes), colours are named, the chosen row is marked as current.
- **Crowded views**: a measurement label never covers another one. It looks for the nearest free place anywhere in the view; what finds none is named in one small label ("No room for: 4, 7, 9 …").
- Review fixes: CSV keeps negative coordinates as numbers (only names and details are guarded against formulas), the area of a small polygon far from the origin is exact, moving a point of an *Edge* measurement makes it a plain distance, deleting the measurement that waits for *Set again* disarms it, *Set again* finishes a chain that is under way, straight edges are found across the borders of the end-point grid, edge picking allocates nothing per segment, dead code removed.

## 0.24.0

- **Measure+** (a wish after seeing the first Measure): every measurement now stays. The result stands **on the line** in a slightly transparent coloured label (number and value; the name below it), upright, readable on light and dark backgrounds, and labels that would cover each other move apart. The summary stays in the chip as before.
- New tab **Measure** (between Section and Info): the list of all measurements (number, kind, value, name), rename, colour, hide, delete, delete all (asks first). One place for this: nothing of it is in Info. Opening a row shows its points; **change a point** by dragging its marker in the view or with *Set again* and a click.
- New way **Chain** (several points in a row): every piece, the sum, and, closed (*Close, with area*), the area of the polygon (a note says when the points are not in one plane). Enter finishes a chain.
- **Compare**: tick two measurements and the tab shows both values, the difference and the ratio (a length and an angle are not compared).
- **Take them along**: *Copy as text* and *Copy as CSV* (German files use `;` and a decimal comma), the labels are drawn into saved pictures (not into a transparent PNG), the measurements stay through a change of look, mesh, Up is and the turntable (their points live in the file's own axes), and *Close file* names them. They are dropped when a tool changes the geometry (Edit tab) and hidden while the parts are pulled apart.
- Review fixes: labels of deleted measurements are not drawn into pictures, measurements stay visible after a new file while *Explode* was on, no markers can be grabbed while parts are pulled apart, the bar's *Delete* only drops the unfinished measurement, darker label colours (contrast), names starting with `=`/`+`/`-`/`@` are made safe in CSV, a note when a tool drops the measurements.
- Five tabs: the tab row is a little tighter so that all five fit.
- Hardening (found by a security review of a sibling tool that shares the code): the GLB accessor reader refuses negative or fractional offsets, counts and strides, and strides under one element or over 252, before it works out sizes or allocates anything; with test.
- Review of the fixes: Decimate keeps an STL flat shaded (a soup stays a soup with face normals; an indexed hard-edged mesh is left alone), a trailing semicolon in a comma separated XYZ is not read as decimals, material groups follow dropped OBJ triangles, a memory error is not called damage and raw messages go to the log, the binary-as-text check needs several U+FFFD, PLY byte counting, an inverted check tolerance, the model edge must be near the click, sharp edges of small models are worked out enlarged, the Tools check panel writes volumes like the details.


## 0.23.3

- The tabs are in the mockup's order: **Parts, Section, Info, Edit**. New store pictures.

## 0.23.2

- The empty panel (no file yet) shows only its sentence: no tab row and no heading "Whole model" (seen in the real Orca panel). The tab row keeps its close button and no longer wraps in a narrow panel. The text about G-code in the start page names the *Layers* tab.

## 0.23.1

**Review fixes and pictures.**
- Export: "Save as…" no longer saves on its own after a copy that was cancelled or changed; it shows "Working…" for every format; *Make smaller* is kept when you switch from Image back to 3D file; the dialog's button is called *Close* when nothing is running.
- **Close file…** is not offered in the editor tab of a project file (the tab is the file); it stays in the panel and in the start file.
- Tooltips: the *Surface ⇄* button says what a click does; the menu rows carry their key. *Section* and *Info* start with a sentence.
- New store pictures from the new interface (`dev/make-shots.mjs`).

## 0.23.0

**The export dialog as in the mockup.**
- **One button, "Save as…"**: it makes the copy and saves it; if the click is still fresh (up to four seconds) the save follows on its own, otherwise the button stays and the next click saves. *Cancel* stops a copy that is being made, or closes the dialog. (Whether Orca takes the save after the copy is made is only known from a try in the real Orca; the two-step way is the fallback and stays in the code.)
- **Image | Film | 3D file**, the sentence "The original file stays unchanged.", **Make smaller** as a check box (it is the compressed GLB; its size and precision appear when it is on), *Only visible parts*, *Advanced* ("Up in the copy"), the size ("About 63 KiB"), and the hint to the Edit tab.
- **Only the formats that fit the file**: a point cloud or splat offers GLB and PLY, G-code offers GLB; a mesh offers all five.

## 0.22.0

**The panel's tabs as in the mockup.**
- **Parts**: a sentence on how to choose, the buttons *All*, *None*, *Invert* and **Only selected**, then a visible line, **"Ctrl/⌘ + click: choose several. Shift + click in the list: a range. Esc: clear."**, and a **Select several** button (while it is on, every click adds a part: for a trackpad or touch without a key; a click on nothing does not clear then). Then the filter, the list, the part card, *Explode* and *Selected part*. *Color per part* moved to *Appearance*.
- **Info** (*Whole model*): the numbers, **the unit with *Set as***, *Check mesh* and *Copy numbers* (the mesh quality in STEP). *More numbers* one level down.
- **Edit**: the sentence, **"No changes."**, then *Position and size* (*Convert to* has its own row), *Parts* and *Simplify mesh* (*Accuracy* instead of "Detail"). *Make "Up is" part of the model* is gone (View > Up is works in the view and the export).
- A radio card no longer swallows the shortcut keys. "Default" in Appearance also sets point size and texture size back.

## 0.21.0

**The toolbar and its menus as in the mockup** (UX concept, second pass after the first look in Orca).
- **The bar has the six elements, then More and the panel button.** *Open file* and *Close file…* are not on the bar any more: they are in **More** (with *Open folder…*, *Keyboard shortcuts* and *Reset all*). The panel button moves into More when the bar is narrow. *Surface ⇄* shows that a click switches.
- **View** is a list with the shortcut of each row: *Show all* (R), *Show the selected part* (F), the eight views (1 to 8), *Up is* and the sentence that every view shows the whole model. "Fit" is gone from the words: *Show*.
- **Appearance** is a menu with a sentence: the colors as four cards with a line each (*Original*, *Gray*, *Color per part*, *X-ray*), *Show texture*, *Helpers* (floor grid, axes), and *Advanced* one level down (the other looks, opacity, bounding box, back faces, texture size, points). *Default* sets the looks back, *Done* closes.
- **Studio** has a header with the key, look tiles with a color swatch, the background, floor, **Turntable** (Turn + Speed in one row), *Advanced* (lights, exposure), and at the foot *Save image…*, *Film…* and *Reset*.
- **A list of keyboard shortcuts** (More > Keyboard shortcuts): every key, one line each (a test checks that every key of the table is in it).
- **The panel's tab row** has the close button at its end; the heading "Panel" is gone while there are tabs. The result of a measurement sits in the measuring bar.

## 0.20.0

**Words, tests and pictures** (UX concept E7).
- Texts follow the new screens: *Panel* (not "side panel"), *Edit* instead of "Tools", *Export* instead of "Export a copy", *Show as* for splats | points, *Reset all*; the sentences that pointed to old sections ("Tools section", "Points section", "Export a copy") now name the tab or menu. German: *Leiste*, *Bearbeiten*, *Exportieren*, *Zeigen als*, *Alles zurücksetzen*.
- New store screenshots, made by `dev/make-shots.mjs` from the plugin's own sample files (start page, parts with the part card, Edit tab, export dialog, Studio menu, narrow view, point cloud, 3MF with a section, textures in German); the cover shows the new interface.
- Tests: every `ch_*` text exists in both languages, no text key shows anywhere in the page, and the manifest version is the newest CHANGELOG entry.

## 0.19.0

**Export as a dialog** (UX concept E6).
- **Export…** opens a dialog over the view with three kinds: **Image**, **Film**, **3D file**. The format list shows 3D formats only; the options of the chosen format follow. *Up in the copy* sits under *Advanced*. A sentence points to the Edit tab for changes to the model itself.
- The Export tab and the quick *Save image* button are gone: *Save image…* and *Film…* in the Studio menu open the same dialog on Image or Film. Esc closes the dialog and the focus goes back to *Export…*.
- Still two steps (*Create copy*, then *Save as …*) as before; a one-click save for fast formats waits for a test in the real Orca (the save needs a click there).

## 0.18.0

**Studio as a menu** (UX concept E5).
- **Studio ▾** opens a menu instead of a side tab: look tiles (Original, Product on white, Dark studio, Grey gradient, Soft daylight), the background, floor with shadow, turntable with speed, and at the foot *Save image* and *Film…* (opens the Export tab with the video format). Lights, reflections, exposure, tone and quality are one level down under *Advanced*. The button says **Studio on** (and is blue) while a look is on.
- **Background that always works**: one list of seven, *Like the look*, *Like Orca*, *Light*, *Dark*, *White*, *Gradient*, *Transparent*, independent of the look and of the shading (it used to be greyed out with the look off). Choosing another look shows that look's own background again; editing a light or the floor leaves a chosen background alone. The key **B** steps through the list and names the new background. An older saved "light" or "dark" is read as before.
- A look with a shading that is not lit (Normals, X-ray, Matcap, Vertex colors) shows a hint with a button, *Set appearance to Original*.
- Behind it, one shared background module (`background-three.js`) replaces the two copies of the background code.

## 0.17.0

**Toolbar and side panel rebuilt** (UX concept E4).
- **Six elements on the bar**: *View* (show all, fit the selected part, look from, up is), *Surface | Mesh* with *Appearance* (shading, texture, edges in STEP, grid, axes, box, back faces, opacity, texture size, points), *Measure*, *Studio*, *Export…*, and *More* (⋯: open folder, reset all; the file buttons and the panel button move in when the bar is too narrow). The background and image buttons are gone from the bar (background and *Save image* sit in the Studio and Export tabs until E5/E6 replace them).
- **Side panel in tabs**: Parts (when there are two or more parts; always in STEP), Section (*Layers* for G-code), Edit (the tools, with the sentence that they change the working copy, never the file), Info (*Whole model*, a line naming the selected part, the numbers you need; load time, texture memory, converter memory and the like under *More numbers*; in STEP the mesh quality), Studio, Export. The tab you used last is remembered. The part card sticks to the bottom of the Parts tab.
- **Measuring bar** in the view: Distance, Angle, Circle, Edge (and Parts from two parts), Clear, Done (Esc). It replaces the Measure section of the panel.
- **Playback bar** for files with animation sits in the view.
- **G-code**: the section tab is called *Layers* and has *Up to layer n / N* (a slider that keeps what lies below) and *Show travel moves*; the section axis is hidden for G-code.
- "Reset settings" is now **Reset all**.

## 0.16.0

**Popovers and tabs as factories** (UX concept E3, pilot).
- `popover.js`: the rules as pure functions (one popover open at most; Esc and a click outside close it and the focus goes back to the button; a click on a button inside closes it, a select or slider keeps it open) and `createPopoverGroup`, `makePopover`, `createTabs` (roles, arrow keys, Home/End, remembered and preferred tab) without fixed element ids.
- The **More menu** now runs on these rules. Esc closes an open menu first and only the next Esc reaches the view (measuring, selection).
- Tabs are built and tested (`dev/e2e-popover.mjs`) but not used by a screen yet: they come with the new side panel (E4).

## 0.15.0

**State instead of scattered flags** (UX concept E2).
- One table (`controls-core.js`, tested for the 28 cells of the effect matrix) says which control is shown, which works and why one does not: *Colour per part* is off with a tooltip outside the Original look, *Texture* outside Original and Flat.
- Remembered settings carry a version (`prefs-core.js`): one background model (look, Orca, light, dark, white, gradient, transparent; the button still offers like-Orca, light, dark until the Studio popover). An older record is migrated and keeps its keys, so an older version still reads it.
- **Reset all** now resets everything: the switches (mesh, grid, axes, box, back faces, colour per part, shading, opacity, point size, edges) go back to the standard values, the view of the file is made again and the remembered view is overwritten.

## 0.14.0

**Part info** (UX concept E8): numbers for single parts.
- **Select several parts**: a click selects a part (the same part again clears it), Ctrl or Cmd click adds or removes one, Shift click in the list selects a range, a click on nothing and Esc clear. In the STEP Viewer a node of the tree selects every part below it. A dashed blue box (not the red one) frames the whole selection and shows which way X, Y and Z run. Keys F (fit to the selection) and I (only the selected; Shift+I all) work in both viewers.
- **Part card** below the parts list: name, type, **size X × Y × Z**, triangles, share of the model; folded away under *More about the part*: centre, corner points (welded), surface, volume (only for closed parts), watertight (with the counts of open edges), material, colour, texture, position, rotation and scale (not for a part without a transform of its own), instance, visibility (also "partly cut away by the section"). The surface, volume and check are worked out when *More* is opened (in a worker, kept for each part until the working copy changes); above 50 parts or for a part with more than 500 000 triangles they wait for *Calculate*. *Copy the numbers* puts the card on the clipboard. The sizes are those of the working copy you see, in the file's axes; for a turned part the box of its vertices is used. The STEP sizes come from the CAD kernel's triangle mesh (a round part measures a little less than the exact one).
- **Two parts selected**: distance centre to centre, and the **smallest distance** between their surfaces on a button (from the points of each part to the surface of the other: an upper bound; "about" when a sample was used above 40 million point-triangle pairs; 0 means they touch or cross). From three parts on the card points to *Measure > Parts*.
- **Chip in the view**: the name and size of the selection, also with the panel closed, with a button to the card.
- **Measure > Parts** (new way to measure, from two parts on): click two different parts; the line goes between the centres of their boxes, the chip names centre to centre and the smallest distance.
- Measured (`dev/measure-parts.mjs`, headless Chrome, 3 000 / 10 000 small parts): load 375 / 521 ms, a click on a part 3 / 5 ms, a range of 1 000 parts 9 ms (it was 800 ms until the world matrices were updated once for all parts instead of once per part), the detailed numbers of 1 000 parts 114 ms in the worker.

## 0.13.1

- **Close**: a *Close* button next to *Open file…* (in the *More* menu when the bar is full) empties the model and goes back to the start page: the scene is emptied, the GPU memory is freed, the section and the tools' working copy are reset and the kept "last file" is forgotten (this replaces the *Forget it* button at the bottom of the panel). It always asks first, with a dialog the page draws itself (no `window.confirm`, which a sandboxed frame may block): "Close the model?", and when something would be lost (tools, section, measurements) it says so. The focus starts on *Cancel*, Escape cancels, Enter never closes by itself, and no shortcut works behind the question. In an editor tab the file of the tab is not touched; the start page then takes another file.

## 0.13.0

First steps of the interface rework (concept `UX-KONZEPT-VIEWER.md`, stages E0 and E1): the toolbar controls say what they do.
- **Surface | Mesh**: the *Wireframe* button is one button whose label is the state (*Surface* or *Mesh*); its tooltip names what a click does; key `W` stays. It is not there for point clouds, splats and G-code (no surface). The mesh shows in every look; the test checks all six (a matcap material only gets the property with three.js r181, so this was broken before 0.12.0).
- **View menu**: the *View* button is gone. The *View* menu holds *Show all* (R) and the eight views (keys 1 to 8, new: *Hero*); **every view fits the whole model** and looks at its middle, from wherever the camera is (before, only *View* did). The camera buttons of the Studio section are gone (they are in this menu).
- **Background** button: always changes what is seen. It flips to the opposite of the background shown now and back (before, the first click in a light Orca theme chose "light", the same colour, and with a studio look it changed only its own label). With a studio look it reads "like the look".
- **Texture** button: only for models with textures, and in the looks that show them (Original, Flat); in the other looks it is off and the tooltip says why.
- Internals: the keys are a table and one pure function (`shared/keymap.js`, `keyAction`), the element ids the tests depend on are listed and checked (`shared/ui-ids.js`); new `dev/e2e-ux.mjs`.

## 0.12.1

Fixes from a first real test of the studio look.
- **Narrow side panel**: the lists of the Studio section (look, background, tone mapping, quality) put their label above the choice, so nothing is cut; the full text is the tooltip.
- **Landscapes and stage sets**: a flat, wide scene (at least three times as wide as high) hides its own floor, so the model now catches the shadows itself; compact objects still show their shadow on the floor.
- **Background button** while the studio look is on: it used to do nothing visible (the look has its own background). It now reads "Background: studio look" and opens the Studio section.
- **PNG with a transparent background**: a note says that many image viewers show it black (the file has an alpha channel and is fine).
- The line "Large file - may take a moment" above the view is Orca's own note for any document over 16 MiB; the plugin cannot hide it.

## 0.12.0

**three.js 0.187.0** (was 0.180.0): the loaders, exporter, controls and the renderer come from the new release. Checked against the old release with the same files: the pictures of the generated samples differ by at most 16 of 255 levels in the original look (0.0 to 1.1 % of the pixels differ by more than 8 levels; a slightly different PBR light model since r181), by at most 46 levels in the studio look (the studio room reflections are made differently since r187); load times, frame times and splats are the same within the noise of the measurement, the JS heap is about 1.5 MB larger (the npm package ships no minified build since r187, so the readable files are vendored: `three.module.js` 0.66 MB and `three.core.js` 1.47 MB instead of 0.72 MB together).
- **FBX with Z up** (Blender and others) stands up correctly: since r184 the FBX loader turns a Z-up file to Y up by itself, so the viewer no longer turns it a second time (it would have lain on its side). Not handled by the loader, as before: a Z-up file with a negative sign and X-up files (those keep the "Up is" choice).
- **PLY with double-precision fields** (CloudCompare, MeshLab, photogrammetry tools): since r185 the PLY loader returns Float64 attributes, which WebGL cannot draw (the first frame would have thrown); they are converted to Float32 when the file is read. New samples `cloud-double.ply` and `mesh-double.ply`, with a test that fails without the conversion.
- Draco: the deprecated `setDecoderConfig` call is gone (WebAssembly is the only decoder that is shipped).
- The studio shadow got a larger bias (the new release drew a hatched edge where a model sits on the floor); a test sample with a Z-up FBX was added.
- Fuzz (960 damaged files): no uncaught error and no hang; one damaged PCD header (a broken `COUNT` line) that the old loader accepted is now reported as damaged.
- `THIRD_PARTY_NOTICES.md`: fflate in three is 0.8.3 now, the meshoptimizer decoder in three is 1.1; the Draco decoder (1.5.6, Apache-2.0) files are byte-identical to before.

## 0.11.0

**Studio look**, shared with the STEP Viewer 3D. Background (colour, gradient, transparent), a floor that catches a soft shadow, key/fill/rim lights, reflections from a procedural studio room (no picture, no network), exposure and tone mapping, camera presets for product shots, a turntable, quality low/high, and the look in PNG (as shown, 2×, 4×) and in the WebM film (length, size). Original stays the default and the picture is pixel-identical to before. No new rights, no network.

## 0.10.3

- Compressing: texture coordinate precision follows the largest picture of the file (a quarter texel, except for "smallest"), so 4k and 8k textures no longer swim; the mesh check reads the inside-out test faster; tsc-clean shared code.

## 0.10.2

Review follow-ups (shared code, tests with numbers).

- **Measuring an edge** on an instanced model uses the matrix of the instance that was clicked (a cube scaled 3× measures 6, not 2); on a skinned model the triangle edge is read in the current pose and labelled as a triangle edge (the cached model edges would be those of the bind pose).
- **Mesh check**: area and volume are right for parts stretched unevenly, mirrored, or drawn as instances (each instance with its own scale); the "inside out" test works per shell, so a cavity inside a hollow body is fine and a single inverted shell next to a good one is found.
- **Explode** clears measuring markers and moves the selection frame with the part; the **X-ray** shading keeps its back faces whatever the "Back faces" switch says; removed parts free their materials and textures when the tools are left.
- Internals: pure decisions moved out of `viewer.js` and tested (`dragReducer`, `planOpen`, `statsRows`); new tests with textbook values (torus volume and area in metres and millimetres, stretched cube 30 / 62, instances 288 / 336).

## 0.10.1

Fixes from the independent review (report 2).

- **Decimate works on STL and OBJ**: a triangle soup with a normal per corner is welded by position (normals are made again); "nothing reduced" is reported when nothing was. Before, STL and OBJ files stayed at 100 %.
- **Numbers**: lengths, sizes and measurements have three significant digits (0.045 m, 0.0789 m; before 0.05 and 0.08); volumes and areas of small models switch to the smaller unit (120 cm³ instead of "0 m³"); the angle uses the language's decimal separator.
- **Texture row**: the matcap picture of the shading was counted as a model texture; now only the model's own textures count (no Texture row, Texture button off for models without textures).
- **Compress**: a stricter target can no longer give a larger file (the smallest try is kept); a target below 10 KiB is honored; KiB/MiB everywhere in the compress report.
- **STL to GLB**: the export panel says that a model without a unit becomes meters.
- **Start view** fits narrow, tall panels (it used the vertical field of view only).
- **Mesh check**: a closed mesh turned inside out is reported (normals point inward).
- **Edge length** measures a model edge (where the surface bends 20 degrees or more), a straight edge end to end; a triangle edge only when none is found, and the text says so.
- Smaller: XYZ with a decimal comma; an ASCII PLY whose counts promise more lines than the file has gets a note; an OBJ with a bad face opens without those triangles; raw JavaScript messages become "the file is damaged"; notices (USDZ) go to the log as warnings, not errors; a binary file that reached the text editor says so; the shortcuts keep working after `E`; an error nobody caught writes a `state:"error"` line to the log (`installErrorGuard`).
- README: license sentence (Draco is Apache-2.0), Draco and KTX2 limits, bundled libraries, formats table, Measure and Shading.
- Shared code: `plugins/_shared` is a git repository and `sync-shared.sh --check` compares it with both plugins, work copies and live folders (each plugin's test runs it for its own folder); `summarizeParts` replaces copied loops. e2e: 'values' section (cube, sphere, torus as STL, OBJ and GLB in two units; volumes, areas, sizes, Decimate, edge length compared with numbers worked out from the triangles).

## 0.10.0

- **FBX** (`.fbx`, ASCII and binary): three.js' `FBXLoader` (loaded only for FBX files). Unit and up axis are read from the file's global settings, which the loader ignores. Tested with generated files only.
- **PCD** (three.js' `PCDLoader`) and **XYZ** (own reader): point clouds with colors; text files arriving without a name are told by their first lines (`sniffText`, also for G-code, FBX, PCD).
- **G-code preview** (`.gcode`): own reader (`editor/gcode.js`) with arcs (`G2`/`G3`, `I`/`J` or `R`, helix), absolute/relative moves and extrusion, `G92`, `G20`/`G21`, `G28`; extrusion moves colored by height, travel moves a hidden part; up to 4 million segments; a 60 MB file of small arcs hits the 4 million limit and loads in 1.0 s. The Section tool along Z is the layer slider. No export of a toolpath.
- Review fixes: net filament length, several G words per line, `G91.1`-like codes ignored, CR/CRLF, unclosed `(`, files without E show their moves, XYZ normals are not colors, text documents use Orca's `fileType` when it names one we read, X-up FBX left to the person, an FBX unit scale that is none of the usual ones is noted.
- **USDZ**: still not shown (three.js reads text USD only, nothing for binary `.usdc`); the notice says when the file holds `.usdc`.
- Manifest: new extensions (`.fbx`, `.pcd` as bytes; `.fbx`, `.pcd`, `.xyz`, `.gcode` as text); no new permissions. New vendored files from `three@0.180.0`: `FBXLoader`, `NURBSCurve`, `NURBSUtils`, `PCDLoader` (MIT, recorded in `dev/vendor.json`).
- Tests: `test/gcode.test.mjs` (moves, arcs, layers, limits, cancel), `test/formats.test.mjs` (XYZ, text sniffing, FBX settings, zip names); e2e checks for every new format (also as text like Orca's text editor); `make_samples.py` writes `box.fbx`, `box-bin.fbx` (a small FBX writer, with the padding three.js' ASCII detection needs), `print.gcode`, `cloud.pcd`, `cloud-bin.pcd`, `cloud.xyz`, `usdc-stub.usdz`; `make_big.mjs` also writes a 60 MB `big.gcode`.

## 0.9.0

- **Draco** (`KHR_draco_mesh_compression`) in GLB and `.gltf`: the decoder (three.js `DRACOLoader`, glTF WebAssembly build, Apache-2.0) is loaded only for files that need it. Works in the real Orca frame.
- **`.gltf`** (new extension in the manifest, text editor): data: URIs open from Orca directly; separate files are read when dropped or chosen together with the `.gltf`, or from a dropped or chosen **folder** (*Choose folder …*, directory entries of a drop). The file chooser now takes several files.
- **KTX2/Basis textures: not possible.** The decoder needs dynamic code, which Orca's frame forbids (measured in the real frame). The model opens without those textures, with a note; a PNG/JPEG fallback texture is used when the file has one.
- **Fixes from the review**: meshopt `.gltf` files (fallback buffer, compressed views), neighbours of another case or spelling, no guess between two files of one name, a missing picture removes its texture instead of a gray stand-in, a BOM at the start of a `.gltf`, 32-bit padding limits, a folder read level by level with a note when truncated, the neighbour files no longer live in a global (a second drop cannot clear them).
- **Cost check** before decoding a dropped GLB (graphics memory from the pictures' headers, triangles): the person is asked above 1.5 GB or 20 million triangles; Orca-opened files get a note.
- Test harness: pages are now served with Orca's content-security policy (no `eval`, WebAssembly yes, workers from blobs), so the checks run under the same rule as the plugin does in Orca; `csp=0` in the URL turns it off. New sample generators: `.gltf` variants in `make_samples.py`; Draco and KTX2 files with `make_compressed_samples.mjs` (needs npm tools, set `MV3D_TOOLS`).
- New shared module `gltf-pack.js` (GLB JSON, `.gltf` to GLB in memory, neighbour paths, cost estimate) with its own tests. Provenance: the Draco files come from `three@0.180.0` (recorded in `dev/vendor.json`); the Apache-2.0 text is added; the exact Draco version is noted as not clarified.

## 0.8.0

- **Gaussian splats**: PLY files in the training tools' layout, `.splat` and `.spz` files are drawn as splats by [Spark](https://github.com/sparkjsdev/spark) 2.4.0 (MIT, 2.85 MB, loaded only when such a file is opened). *Display: Splats / Points* in the *Points* section switches between the soft splats and the plain colored points; the choice is remembered. Under the splats the colored points stay, so size, fit, tools and export work as for point clouds (an exported copy has the points, not the splat shapes, and says so). Section planes, measuring, shading and the part list act on the points (use *Display: Points*); a tool switches the splats off.
- **New file types**: `.splat` and `.spz` (a new extension in the manifest; no new permissions). `.ksplat` is not supported.
- If Spark cannot start, a PLY stays visible as points and the details say why (`model-viewer-3d-splat` line in `orca plugin logs`); a `.splat`/`.spz` file, which only Spark can read, is refused with a message.
- Points of `.splat`/`.spz` files carry Spark's 16-bit positions (README).
- Measured (synthetic files, headless Chrome on Apple Silicon): 3 million splats (204 MB PLY) loaded in 1.4 s, splats ready after 0.5 s, JS heap about 400 MB; the same scene as a 96 MB `.splat`: 0.7 s, JS heap 254 MB, whole browser at most 1.6 GB; confirmed to start in Orca's real frame (12,000 splats ready in 60 ms).
- Provenance: Spark and the one three.js add-on it imports (`Pass.js`) are in `dev/vendor.json` with integrity values; `THIRD_PARTY_NOTICES.md` carries the MIT text and lists the Rust crates compiled into Spark's WebAssembly as **not yet clarified**.
- Samples: `dev/make_samples.py` also writes `splat.splat` and `splat.spz`; end-to-end checks for splat mode, points mode, export and fallback; the fuzz test covers the new formats.

## 0.7.0

- **Shading**: X-ray, matcap, flat and vertex colors next to original, solid and normals.
- **Measure**: angle (3 points), circle diameter (3 points on the rim) and edge length next to distance; a *Measure* section in the side panel.
- **Fit and isolate**: `F` fits the view to the selected part, double-click selects and fits, `I` isolates the selected part, `Shift+I` shows all; **Explode** and a **selected part** opacity slider.
- **Parts list**: scene groups are indented; the filter searches name, material name and color (`#rrggbb`) and appears from 4 parts.
- **Details**: *Watertight*, *Volume* and *Surface area* in the background after a load (up to 500,000 triangles); **Copy details** as text (`execCommand`, no permission).
- **Loading**: a dropped file over 4 MB is read in pieces with a percentage and a **Cancel** button; measured peak memory with 200 MB drops (221 MB GLB 1.9 GB, 218 MB PLY 1.8 GB).
- **3MF**: `paint_color` (Bambu Studio, Orca Slicer): triangles painted as a whole take their filament's color; finer paint is counted in a note.
- **Start page**: format explanations and generated examples (table scene, torus, point cloud). The last dropped file still comes back after a panel rebuild (0.6.0).
- Shared code: `shading.js`, `measure.js`, `measure-three.js`, `details.js`; new tests (measuring arithmetic, areas, paint decoding, examples) and 30 more end-to-end checks. No new permissions (capabilities stay empty).

## 0.6.0

- **Fix: the model is no longer lost when the panel is shown again.** Orca builds a panel frame anew when the right sidebar is closed and opened (or another panel was in front); the page used to start empty. The last file you dropped, chose or pasted is now kept in the plugin's own IndexedDB (this computer only, up to 200 MiB) and comes back with the camera and the display switches; the next file replaces it, **Forget it** deletes it. Frame starts show as `model-viewer-3d-boot` lines in `orca plugin logs`.
- **New: Tools** (side panel) change a working copy of the model, never the file; Export writes the copy; "Back to the file" undoes it. Before/after numbers (and small before/after pictures) after each tool. A 3MF written afresh has no slicer data; 3MF files are only read.
  - **GLB, compressed (under a size)** in the export section: target size (default 45 MiB), texture size and precision; vertex welding and reordering, quantization, meshopt compression (`EXT_meshopt_compression`, opens in this viewer and in Orca), smaller textures; the result says whether the target was reached and suggests what to do if not. In a worker, with progress and Cancel. Point clouds and Gaussian-splat PLY are packed too, and can be thinned if the target needs it (with a warning).
  - **Transform**: unit (convert or set), origin (center, center on floor, put on floor, corner at 0), scale, rotate 90°, mirror, make "Up is" permanent.
  - **Parts**: remove hidden or selected parts, merge visible parts.
  - **Mesh**: decimate (keep 5 to 95 %, detail, keep borders) and a mesh check (holes, non-manifold edges, orientation, degenerate triangles, pieces, volume).
- Measured (synthetic files): 221 MB textured GLB with 3.2 million triangles to 8.8 MB in 6.6 s; 218 MB splat-like PLY (3.2 million points) to 17.7 MiB in 1.8 s; decimate 3.2 million triangles to 30 % in 3.0 s.
- Libraries (loaded only when a tool runs): meshoptimizer 1.3.0 encoder and simplifier (MIT), recorded in `dev/vendor.json` and `THIRD_PARTY_NOTICES.md`. No new permissions (capabilities stay empty).
- Tests: shared tests for the compressor (round trip through the vendored three.js loader and meshopt decoder), mesh tools and scene operations; `dev/e2e-export.mjs` now covers every tool and the compression in Chrome; `dev/make_big.mjs` and `dev/measure-compress.mjs` for large synthetic files.

## 0.5.0

- **New: export a copy.** **Export…** in the toolbar (or `E`) opens a section of the side panel: choose a format, **Create copy**, **Save as …** (Orca's Save dialog, after a click; no permission needed). The original is never changed.
  - **GLB** (through three.js' exporter: materials, textures, animations), **STL**, **OBJ**, **PLY** (meshes and point clouds with vertex colors) and **3MF** (core specification: geometry, part names, one color per part, unit) are written new from the scene. Each format says what the copy loses (compression, extensions, slicer data, textures, vertex colors).
  - **PNG** of the view with an optional **transparent background** (model only, no grid or axes) and a long edge of 1920 or 3840 px; **turntable video** (WebM, one turn, 4 to 15 s).
  - Options: only visible parts; which axis is up in the copy (Y for GLB, Z for STL and 3MF by default).
  - The panel shows the size of the copy against Orca's limits: under 50 MiB Orca can open it in a tab; up to 64 MiB it can be saved but not opened in a tab; above that the Save dialog refuses it.
  - A 3MF from a slicer is never written back, only copied as a plain 3MF.
- Release hygiene: sample models are generated by `dev/make_samples.py` (not committed); every vendored file is traced to its npm package (`dev/vendor.json`, `node dev/vendor.mjs --check` or `--update`), and `THIRD_PARTY_NOTICES.md` lists package versions and integrity values; `docs/REPOSITORY.md` fixes the repository layout. New tests: `test/repo.test.mjs`, `test/export.test.mjs`, shared writer tests; `dev/e2e-export.mjs` exports every format in Chrome and opens the copies again.
- Manifest: no new permissions (capabilities stay empty).

## 0.4.0

- **New layout, nothing overlaps.** Toolbar on top in groups (file and view, display, tools, export); what does not fit goes into a **More** menu. Below it the view and the side panel sit next to each other: the panel takes space instead of covering the view. In a narrow tab or the sidebar (under 520 px) it is one column and the panel is a sheet under the view with its own close button.
- **Side panel**: drag its edge to resize (arrow keys work, double-click resets), close and open with the button or `P`, every section folds on its own, all remembered. It scrolls vertically only; long values are cut with an ellipsis and carry the full text as a tooltip; a long file name stays on one line.
- Controls that need a model are disabled instead of hidden until a file is shown, so nothing jumps when it loads.
- **3MF from slicers** (Bambu Studio, Orca Slicer and others keep the meshes in `3D/Objects/*.model`): read by its own reader that resolves components by file and id (ids repeat from file to file), applies item and component transforms, takes object and part names from `Metadata/model_settings.config` and filament colors from `project_settings.config`. The wrong "parts are missing" note is gone; it only appears when a referenced part really is missing. Limits: 0.9 GB unpacked, 40 million triangles, nesting depth 12; paths cannot leave the package.
- The shared layout code lives in `editor/shared/` (the same files in 3D Model Viewer and STEP Viewer 3D).

## 0.3.0

- New: **start page without a file.** A sidebar panel, a "New file → 3D Viewer (drop a model)" entry and an "Open file…" button; drag a model in from anywhere (Finder, any folder) or choose one; files one after another replace the view. Dropped files bypass Orca's 50 MB limit (98 MB GLB in 0.6 s, 204 MB PLY in 2 s); a gate asks above 150 MB.
- New: an agent-readable state line (`model-viewer-3d-state {...}`) in `orca plugin logs` for every model shown.
- Fix: a panel needs its own entry page (`editor/panel.html`); Orca builds the frame per entry file.
- Manifest: adds a panel and a new-file entry (no new permissions; Orca reported "already-approved").

## 0.2.0

- **Fix: OBJ and ASCII PLY/STL did not open in the viewer.** Orca mounts an editor only when its content kind matches the
  file (text files need a text editor). A second editor now takes text files; the format is recognised from the first line.
- New: preset views, section plane, two-point measuring, PNG export, shading modes (original, solid, normals), opacity,
  texture size limit with texture memory, part filter, glTF animation play and pause, keyboard access.
- Stability: a lost WebGL context or missing WebGL shows a message instead of a dead view; textures, materials and GPU
  memory are freed when a file is replaced and when the tab closes; a newer version of the file arriving while one decodes no
  longer leaks; "Color by part" survives a reload. `dev/fuzz.mjs` found no uncaught error or hang in 1,050 damaged files.
- New: meshopt-compressed glTF (`EXT_meshopt_compression`) opens, so a file over Orca's 50 MB limit can often be shrunk with `gltfpack -cc` and still be viewed.
- Docs: Orca's 50 MB limit for custom editors (measured), performance figures.

## 0.1.0

First version: GLB, PLY (meshes and point clouds), OBJ, STL and 3MF in a custom editor; wireframe, textures, grid, axes,
bounding box; per-part visibility and colors with click-to-select; details; up-axis choice; English and German.
