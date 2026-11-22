// Pure helpers: strings, number formats, 3MF inspection. No DOM, no three.js, so `orca plugin test` can run them in Node.
import { unzipSync } from './vendor/addons/libs/fflate.module.js'
import { hasExternalModels, LIMITS } from './threemf.js'
import { EXPORT_STRINGS } from './shared/export-strings.js'
import { TOOLS_STRINGS } from './shared/tools-strings.js'
import { SESSION_STRINGS } from './shared/session-strings.js'
import { STUDIO_STRINGS } from './shared/studio-strings.js'
import { PARTINFO_STRINGS } from './shared/partinfo-strings.js'
import { MEASURE_STRINGS } from './shared/measure-strings.js'
import { CHROME_STRINGS } from './shared/chrome-strings.js'
import { sniffText } from './formats.js'

// ---------- strings ----------
export const STRINGS = {
  en: {
    background: 'Background',
    bg_auto: 'like Orca',
    bg_light: 'light',
    bg_dark: 'dark',
    bg_look: 'like the look',
    surface: 'Surface',
    mesh: 'Mesh',
    tip_mesh_on: 'Shows the closed surface. Click for the mesh, the edges of all triangles (W)',
    tip_surface_on: 'Show the surface again (W)',
    tip_texture_shading: 'Textures show in the Original and Flat looks only (Appearance > Shading)',
    reset_prefs: 'Reset all',
    texture: 'Texture',
    grid: 'Grid',
    axes: 'Axes',
    box: 'Box',
    over: 'Mesh over',
    backfaces: 'Backfaces',
    panel: 'Panel',
    tip_background: 'Background: like Orca (or like the studio look), or the opposite (B)',
    tip_texture: 'Textures on or off (T)',
    tip_grid: 'Floor grid (G)',
    tip_axes: 'X (red), Y (green), Z (blue) axes at the origin',
    tip_box: 'Bounding box',
    tip_over: 'Draws the mesh lines over the closed surface',
    tip_backfaces: 'Draw the back side of surfaces',
    tip_panel: 'Show or hide the panel (P)',
    stats: 'Details',
    orientation: 'Orientation',
    up_is: 'Up is',
    up_y: '+Y up (default, glTF)',
    up_negy: '−Y up (OpenCV / COLMAP)',
    up_z: '+Z up (CAD, 3D printing)',
    hint_y: '+Y is up. glTF files are always +Y up (meters); other formats store no up axis, so choose the one that fits.',
    hint_negy: 'Data with y pointing down (OpenCV, COLMAP) is turned 180° about the X axis.',
    hint_z: 'Z-up data (CAD, 3D printing, Blender) is turned −90° about the X axis.',
    points: 'Points',
    point_size: 'Size',
    parts: 'Parts',
    parts_visible: '{v} / {n} visible',
    all: 'All',
    none: 'None',
    invert: 'Invert',
    color_by_part: 'Color by part',
    tip_color_by_part: 'Give every part its own color',
    tip_tint_shading: 'Colors per part show in the Original look only (Appearance > Shading)',
    studio_unlit: 'This look is not lit: studio lights change nothing here',
    studio_points_no_shadow: 'Points and splats cast no shadow',
    tip_needs_selection: 'Select a part first',
    layer_upto: 'Up to layer {n} / {total}',
    layer_travel: 'Show travel moves',
    parts_hint: 'Click a part in the view to select it. Double-click a row to show only that part.',
    parts_more: '… and {n} more (list limited to {max}; All / None apply to all parts).',
    visible_label: 'Visible: {name}',
    s_size: 'File size',
    s_triangles: 'Triangles',
    s_vertices: 'Vertices',
    s_points: 'Points',
    s_parts: 'Parts',
    s_objects: 'Objects',
    s_extent: 'Size X × Y × Z',
    s_height: 'Height range',
    s_grid: 'Grid step',
    s_texture: 'Texture',
    s_texture_n: '{n} images',
    s_unit: 'Unit',
    s_load: 'Load time',
    unit_gltf: 'meters (glTF)',
    unit_stl: 'unknown (usually mm)',
    unit_unknown: 'not stored (meters assumed)',
    unit_short_stl: 'units',
    unit_gcode: 'millimeters (G-code)',
    unit_fbx_file: '{unit} (from the FBX file)',
    unit_fbx_guess: 'centimeters (FBX default; the file does not say)',
    u_micron: 'micrometers (from file)',
    u_millimeter: 'millimeters (from file)',
    u_centimeter: 'centimeters (from file)',
    u_inch: 'inches (from file)',
    u_foot: 'feet (from file)',
    u_meter: 'meters (from file)',
    part_mesh: 'Part',
    part_points: 'Points',
    part_lines: 'Lines',
    preset: 'View',
    pv_all: 'Show all (R)',
    pv_hero: 'Hero',
    pv_iso: 'Isometric',
    pv_front: 'Front',
    pv_back: 'Back',
    pv_left: 'Left',
    pv_right: 'Right',
    pv_top: 'Top',
    pv_bottom: 'Bottom',
    tip_preset: 'Camera views: every view shows the whole model (keys 1 to 8, R shows all)',
    measure: 'Measure',
    tip_measure: 'Measure the distance between two points on the surface (M)',
    measure_hint: 'Click two points on the surface. Click again to start over, Esc to leave.',
    measure_no_surface: 'This file has no triangle surface to measure on (point clouds and lines cannot be measured).',
    m_distance: 'Distance',
    m_delta: 'Along X, Y, Z',
    save_image: 'Save image',
    tip_save_image: 'Save the current view as a PNG file',
    save_failed: 'The image could not be saved here.',
    section_title: 'Section',
    sec_off: 'Off',
    sec_axis: 'Cut along',
    sec_pos: 'Position',
    sec_flip: 'Flip side',
    shading_title: 'Appearance',
    shading: 'Shading',
    sh_original: 'Original',
    sh_solid: 'Solid gray',
    sh_normals: 'Normals',
    sh_xray: 'X-ray',
    sh_matcap: 'Matcap',
    sh_flat: 'Flat',
    sh_vertex: 'Vertex colors',
    opacity: 'Opacity',
    texsize: 'Texture size',
    ts_full: 'Full',
    ts_4096: 'Max 4096 px',
    ts_2048: 'Max 2048 px',
    ts_1024: 'Max 1024 px',
    s_texmem: 'Texture memory',
    filter: 'Filter parts',
    filter_ph: 'Filter by name',
    filter_none: 'No part matches.',
    anim_play: 'Play',
    anim_pause: 'Pause',
    anim_clip: 'Animation',
    anim_title: 'Animation',
    drop_title: 'Drop a 3D file here',
    drop_title_replace: 'Drop to open this file',
    drop_formats: 'Supported: {list}',
    drop_hint: 'You can drag a file in from Finder or any folder, one after another: each one replaces the view.',
    pick_file: 'Choose file…',
    pick_folder: 'Choose folder…',
    reading_folder: 'Reading the folder …',
    tip_pick_folder: 'Open the first model in a folder; a .gltf finds its separate files there',
    open_file: 'Open another file…',
    tip_open_file: 'Open a file from anywhere (or drop it onto the view)',
    unsupported_file: 'The format .{ext} is not supported here. Supported: {list}.',
    unsupported_step: 'STEP files (.{ext}) open in the companion plugin STEP Viewer 3D. Install it and open the file from the file tree, or drop it there.',
    drop_more: '{n} more file(s) were ignored: drop files one at a time.',
    drop_nothing: 'Nothing to open: the drop contained no files.',
    too_big: 'This file is {size}. Files above {max} cannot be read here (browser memory limit).',
    read_failed: 'The file could not be read: {why}',
    big_gate: 'This file is {size}. Loading it may take a while and use several GB of memory.',
    load_anyway: 'Load anyway',
    budget_gate: 'Opening this file needs about {tex} of graphics memory for {n} picture(s) and draws {tris} triangles: the tab may become slow or run out of memory. The Edit tab can pack the model smaller.',
    budget_note: 'This file needs about {tex} of graphics memory for {n} picture(s) and draws {tris} triangles; if the view is slow, pack it smaller in the Edit tab.',
    cancel: 'Cancel',
    s_name: 'File',
    start_title: 'Open a 3D file',
    toolbar_label: 'Toolbar',
    side_title: 'Panel',
    side_close: 'Close panel',
    side_empty: 'Open a file to see its details and settings here.',
    more: 'More ▾',
    more_tip: 'More: open a folder, reset everything',
    resizer_label: 'Resize the panel (arrow keys; double-click resets)',
    waiting: 'Waiting for the file …',
    gl_lost: 'The graphics context was lost (for example after a GPU reset). The view returns when the system restores it.',
    gl_unavailable: 'WebGL is not available here, so 3D models cannot be drawn.',
    canvas_label: '3D view. Arrow keys move the view, plus and minus zoom, R resets.',
    loading: 'Loading {type} ({size}) …',
    loading_pct: 'Reading {type} ({size}) … {pct} %',
    empty: 'The file is empty (0 bytes). It may still be written, or the writer stopped early.',
    glb_draco: 'The Draco decoder could not run here: {why}',
    ktx2_blocked: '{n} KTX2 texture(s) cannot be decoded in this frame (the Basis decoder needs dynamic code, which Orca does not allow in plugin frames); the model is shown without them. A .glb with PNG or JPEG textures shows them.',
    fbx_unit_odd: 'The file names a unit scale of {v} (centimeters per unit), which is none of the usual units; the numbers are shown as centimeters.',
    gcode_part_extrusion: 'Extrusion moves',
    gcode_part_travel: 'Travel moves',
    gcode_reading: 'Reading the G-code … {pct} %',
    gcode_info: 'Toolpath: {layers} layer(s), {ext} extrusion segments, {trv} travel segments (a hidden part), {fil} of filament counted on the E axis. Not read: tool changes, firmware retraction, temperatures.',
    gcode_truncated: 'The file has more moves than the {n} this viewer draws; only the first {n} segments are shown (the end of the print is missing).',
    gcode_arcs: '{n} arc(s) in a plane other than XY were drawn as straight lines.',
    gcode_none: 'No moves were found in this G-code.',
    xyz_none: 'No points were found in this file (expected lines of x y z or x y z r g b).',
    obj_bad_faces: '{n} triangle(s) were left out: their faces name vertices that are not in the file.',
    why_memory: 'There is not enough memory to read this file here.',
    why_damaged: 'The file is damaged (its structure does not match what it says about itself).',
    binary_as_text: 'This looks like a binary file that Orca handed over as text, so it cannot be read faithfully. Drop the file onto the view (or use Open file …) instead.',
    unexpected_error: 'Something went wrong: {why}',
    ply_short: 'The PLY header promises {declared} data lines but the file has {actual}: it is cut off or its counts are wrong, so what is shown may be incomplete or wrong.',
    xyz_comma: '{n} line(s) had a decimal comma and were read as such.',
    gltf_bad_json: 'This .gltf file is not valid JSON.',
    gltf_missing_files: 'This .gltf refers to {n} separate file(s) that were not dropped with it: {list}. Drop the .gltf together with those files (or with their folder) onto the view, or use a .glb.',
    gltf_missing_images: '{n} picture file(s) were not found ({list}); the surfaces that use them show without a texture.',
    folder_truncated: 'The folder has more than {n} files; only the first {n} (the top of the folder first) were read.',
    gltf_short_buffer: 'The file {name} is shorter than the .gltf says: it is incomplete.',
    fmt_fbx: 'FBX: scenes from Blender, Maya and game engines (meshes, materials, embedded textures, animation); the unit and up axis are read from the file.',
    fmt_pcd: 'PCD, XYZ: point clouds (Point Cloud Library and plain text), with colors when the file has them.',
    fmt_gcode: 'G-code: the toolpath of a print, colored by height, arcs included; travel moves are a hidden part; the Layers tab has a slider up to a layer.',
    fmt_gltf: 'GLTF: the text form of glTF; its separate files (.bin, pictures) are read when dropped together with it, or from a dropped folder.',
    explode: 'Explode',
    part_opacity: 'Selected part',
    tip_fit: 'Zoom to the selected part, or show everything (F)',
    drop_examples: 'Or try an example:',
    ex_table: 'Table scene',
    ex_torus: 'Torus',
    ex_cloud: 'Point cloud',
    fmt_glb: 'GLB / glTF: scenes with parts, materials, textures and animations; the best format for viewing.',
    fmt_ply: 'PLY: meshes and point clouds from scanners and photogrammetry (Gaussian-splat files also show as splats).',
    fmt_splat: 'SPLAT, SPZ: Gaussian-splat scenes (shown as splats; Appearance > Show as switches to points).',
    fmt_stl: 'STL: plain triangles from CAD and 3D printing, without colors.',
    fmt_obj: 'OBJ: meshes with named groups; colors only through a separate material file.',
    fmt_3mf: '3MF: 3D printing with colors and units; slicer projects (Bambu Studio, Orca Slicer) open too.',
    splat_mode: 'Show as',
    sm_splat: 'Splats',
    sm_points: 'Colored points',
    splat_failed: 'The splat renderer could not start here ({why}); the file is shown as colored points.',
    splat_dropped: 'A tool changed the points, so the splats are off; open the file again to see them.',
    cannot_read: 'This {type} file ({size}) cannot be read. It is probably incomplete (still being written) or damaged.',
    no_geometry: 'The file contains no geometry (no triangles, points or lines).',
    bad_coords: 'The file contains no valid coordinates (empty or not finite). It may be truncated or damaged.',
    no_triangles: 'The STL file contains no triangles.',
    usdz_usdc: 'USDZ ({size}) holds its scene as binary USD (.usdc). The library available for plugins (three.js) has no reader for that: its USD loader reads text USD only, and for .usdc it returns an empty scene, so the file is not opened rather than shown empty. Select the file in Finder and press Space (Apple AR Quick Look), or export the scene as .glb.',
    usdz: 'USDZ ({size}) cannot be shown here. It is built for Apple AR Quick Look: select the file in Finder and press Space. A .glb of the same scene is usually the better file to open here.',
    as_text: 'The file arrived as text; the viewer needs the raw bytes.',
    unsupported: 'The format .{type} is not supported.',
    warn_big_mesh: 'Large mesh ({n} triangles): orbiting may stutter. Keep the mesh off.',
    warn_many_points: 'Many points ({n}): orbiting may stutter. A smaller point size helps.',
    threemf_no_model: '3MF: no 3D model (3D/3dmodel.model) in the archive.',
    threemf_main_elsewhere: '3MF: main model is not where expected ({name}).',
    ext_slice: 'Slice extension: slices are not drawn.',
    ext_beam: 'Beam lattice: lattice struts are not drawn.',
    ext_beam_balls: 'Beam lattice (balls): not drawn.',
    ext_slicer: 'Slicer metadata (names, settings, extruders) is not used.',
    ext_unknown: 'Extension not drawn: {uri}',
    threemf_paint: 'Painted colors (multi-color print): {n} triangles are shown in the filament color they are painted with; {k} are painted finer than this viewer shows and keep the part\'s color.',
    ext_missing: '{n} part file(s) or object(s) that the model refers to are missing from the package: those parts are not shown.',
    threemf_too_large: '3MF: the package is too large to open safely (more than about 0.9 GB unpacked, or too many parts).',
    threemf_cyclic: '3MF: the objects refer to each other in a loop or nest too deeply.',
    ext_required: 'Extensions the file requires: {list}'
  },
  de: {
    background: 'Hintergrund',
    bg_auto: 'wie Orca',
    bg_light: 'hell',
    bg_dark: 'dunkel',
    bg_look: 'wie der Look',
    surface: 'Fläche',
    mesh: 'Mesh',
    tip_mesh_on: 'Zeigt die geschlossene Fläche. Klicken für das Mesh, die Kanten aller Dreiecke (W)',
    tip_surface_on: 'Wieder die Fläche zeigen (W)',
    tip_texture_shading: 'Texturen zeigen sich nur in den Looks Original und Flach (Darstellung)',
    reset_prefs: 'Alles zurücksetzen',
    texture: 'Textur',
    grid: 'Raster',
    axes: 'Achsen',
    box: 'Box',
    over: 'Netz drüber',
    backfaces: 'Rückseiten',
    panel: 'Leiste',
    tip_background: 'Hintergrund: wie Orca (oder wie der Studio-Look), oder das Gegenteil (B)',
    tip_texture: 'Textur an oder aus (T)',
    tip_grid: 'Bodenraster (G)',
    tip_axes: 'Achsen X (rot), Y (grün), Z (blau) am Ursprung',
    tip_box: 'Umgebungsbox',
    tip_over: 'Zeichnet die Netzlinien über die geschlossene Fläche',
    tip_backfaces: 'Rückseiten der Flächen zeichnen',
    tip_panel: 'Leiste ein- oder ausblenden (P)',
    stats: 'Kennzahlen',
    orientation: 'Ausrichtung',
    up_is: 'Oben ist',
    up_y: '+Y oben (Standard, glTF)',
    up_negy: '−Y oben (OpenCV / COLMAP)',
    up_z: '+Z oben (CAD, 3D-Druck)',
    hint_y: '+Y ist oben. glTF-Dateien sind immer +Y oben (Meter); andere Formate speichern keine Oben-Achse, dann die passende wählen.',
    hint_negy: 'Daten mit nach unten zeigender y-Achse (OpenCV, COLMAP) werden um 180° um die X-Achse gedreht.',
    hint_z: 'Z-oben-Daten (CAD, 3D-Druck, Blender) werden um −90° um die X-Achse gedreht.',
    points: 'Punkte',
    point_size: 'Größe',
    parts: 'Teile',
    parts_visible: '{v} / {n} sichtbar',
    all: 'Alle',
    none: 'Keine',
    invert: 'Umkehren',
    color_by_part: 'Farbe je Teil',
    tip_color_by_part: 'Jedes Teil in einer eigenen Farbe',
    tip_tint_shading: 'Farbe je Teil zeigt sich nur im Look Original (Darstellung)',
    studio_unlit: 'Dieser Look ist unbeleuchtet: Studio-Lichter ändern hier nichts',
    studio_points_no_shadow: 'Punkte und Splats werfen keinen Schatten',
    tip_needs_selection: 'Wähle zuerst ein Teil',
    layer_upto: 'Bis Schicht {n} / {total}',
    layer_travel: 'Leerfahrten zeigen',
    parts_hint: 'Klick ins Bild wählt ein Teil. Doppelklick auf eine Zeile zeigt nur dieses Teil.',
    parts_more: '… und {n} weitere (Liste auf {max} begrenzt; „Alle“ / „Keine“ gilt für alle Teile).',
    visible_label: 'Sichtbar: {name}',
    s_size: 'Dateigröße',
    s_triangles: 'Dreiecke',
    s_vertices: 'Vertices',
    s_points: 'Punkte',
    s_parts: 'Teile',
    s_objects: 'Objekte',
    s_extent: 'Ausdehnung X × Y × Z',
    s_height: 'Höhenbereich',
    s_grid: 'Rasterweite',
    s_texture: 'Textur',
    s_texture_n: '{n} Bilder',
    s_unit: 'Einheit',
    s_load: 'Ladezeit',
    unit_gltf: 'Meter (glTF)',
    unit_stl: 'unbekannt (meist mm)',
    unit_unknown: 'nicht gespeichert (Meter angenommen)',
    unit_short_stl: 'Einh.',
    unit_gcode: 'Millimeter (G-Code)',
    unit_fbx_file: '{unit} (aus der FBX-Datei)',
    unit_fbx_guess: 'Zentimeter (FBX-Standard; die Datei sagt es nicht)',
    u_micron: 'Mikrometer (laut Datei)',
    u_millimeter: 'Millimeter (laut Datei)',
    u_centimeter: 'Zentimeter (laut Datei)',
    u_inch: 'Zoll (laut Datei)',
    u_foot: 'Fuß (laut Datei)',
    u_meter: 'Meter (laut Datei)',
    part_mesh: 'Teil',
    part_points: 'Punkte',
    part_lines: 'Linien',
    preset: 'Ansicht',
    pv_all: 'Alles zeigen (R)',
    pv_hero: 'Hero',
    pv_iso: 'Isometrisch',
    pv_front: 'Vorne',
    pv_back: 'Hinten',
    pv_left: 'Links',
    pv_right: 'Rechts',
    pv_top: 'Oben',
    pv_bottom: 'Unten',
    tip_preset: 'Kameraansichten: jede passt das ganze Modell ein (Tasten 1 bis 8, R zeigt alles)',
    measure: 'Messen',
    tip_measure: 'Abstand zwischen zwei Punkten auf der Oberfläche messen (M)',
    measure_hint: 'Zwei Punkte auf der Oberfläche anklicken. Erneut klicken beginnt neu, Esc beendet.',
    measure_no_surface: 'Diese Datei hat keine Dreiecksfläche zum Messen (Punktwolken und Linien lassen sich nicht messen).',
    m_distance: 'Abstand',
    m_delta: 'Entlang X, Y, Z',
    save_image: 'Bild speichern',
    tip_save_image: 'Die aktuelle Ansicht als PNG-Datei speichern',
    save_failed: 'Das Bild konnte hier nicht gespeichert werden.',
    section_title: 'Schnitt',
    sec_off: 'Aus',
    sec_axis: 'Schnitt entlang',
    sec_pos: 'Lage',
    sec_flip: 'Seite wechseln',
    shading_title: 'Darstellung',
    shading: 'Schattierung',
    sh_original: 'Original',
    sh_solid: 'Einfarbig grau',
    sh_normals: 'Normalen',
    sh_xray: 'Röntgen',
    sh_matcap: 'Matcap',
    sh_flat: 'Facettiert',
    sh_vertex: 'Vertexfarben',
    opacity: 'Deckkraft',
    texsize: 'Texturgröße',
    ts_full: 'Voll',
    ts_4096: 'Höchstens 4096 px',
    ts_2048: 'Höchstens 2048 px',
    ts_1024: 'Höchstens 1024 px',
    s_texmem: 'Texturspeicher',
    filter: 'Teile filtern',
    filter_ph: 'Nach Name filtern',
    filter_none: 'Kein Teil passt.',
    anim_play: 'Abspielen',
    anim_pause: 'Pause',
    anim_clip: 'Animation',
    anim_title: 'Animation',
    drop_title: 'Eine 3D-Datei hier ablegen',
    drop_title_replace: 'Zum Öffnen dieser Datei ablegen',
    drop_formats: 'Unterstützt: {list}',
    drop_hint: 'Dateien lassen sich aus dem Finder oder jedem Ordner hereinziehen, auch nacheinander: jede ersetzt die Ansicht.',
    pick_file: 'Datei wählen …',
    pick_folder: 'Ordner wählen …',
    reading_folder: 'Der Ordner wird gelesen …',
    tip_pick_folder: 'Das erste Modell in einem Ordner öffnen; eine .gltf findet dort ihre getrennten Dateien',
    open_file: 'Andere Datei öffnen …',
    tip_open_file: 'Eine Datei von überall öffnen (oder auf die Ansicht ziehen)',
    unsupported_file: 'Das Format .{ext} wird hier nicht unterstützt. Unterstützt: {list}.',
    unsupported_step: 'STEP-Dateien (.{ext}) öffnen im Begleit-Plugin STEP Viewer 3D. Installieren und die Datei dort aus dem Dateibaum öffnen oder dort ablegen.',
    drop_more: '{n} weitere Datei(en) wurden ignoriert: Dateien einzeln ablegen.',
    drop_nothing: 'Nichts zu öffnen: Das Abgelegte enthielt keine Dateien.',
    too_big: 'Diese Datei ist {size} groß. Dateien über {max} lassen sich hier nicht lesen (Speichergrenze des Browsers).',
    read_failed: 'Die Datei konnte nicht gelesen werden: {why}',
    big_gate: 'Diese Datei ist {size} groß. Das Laden kann dauern und mehrere GB Speicher brauchen.',
    load_anyway: 'Trotzdem laden',
    budget_gate: 'Dieses Öffnen braucht etwa {tex} Grafikspeicher für {n} Bild(er) und zeichnet {tris} Dreiecke: der Tab kann langsam werden oder der Speicher ausgehen. Der Reiter Bearbeiten kann das Modell kleiner packen.',
    budget_note: 'Diese Datei braucht etwa {tex} Grafikspeicher für {n} Bild(er) und zeichnet {tris} Dreiecke; ist die Ansicht langsam, im Reiter Bearbeiten kleiner packen.',
    cancel: 'Abbrechen',
    s_name: 'Datei',
    start_title: 'Eine 3D-Datei öffnen',
    toolbar_label: 'Werkzeugleiste',
    side_title: 'Leiste',
    side_close: 'Leiste schließen',
    side_empty: 'Eine Datei öffnen, um hier Kennzahlen und Einstellungen zu sehen.',
    more: 'Mehr ▾',
    more_tip: 'Mehr: Ordner öffnen, alles zurücksetzen',
    resizer_label: 'Leistenbreite ändern (Pfeiltasten; Doppelklick setzt zurück)',
    waiting: 'Warte auf die Datei …',
    gl_lost: 'Der Grafikkontext ging verloren (z. B. nach einem GPU-Reset). Die Ansicht kommt zurück, sobald das System ihn wiederherstellt.',
    gl_unavailable: 'WebGL ist hier nicht verfügbar, 3D-Modelle können nicht gezeichnet werden.',
    canvas_label: '3D-Ansicht. Pfeiltasten verschieben die Ansicht, Plus und Minus zoomen, R setzt sie zurück.',
    loading: 'Lade {type} ({size}) …',
    loading_pct: 'Lese {type} ({size}) … {pct} %',
    empty: 'Die Datei ist leer (0 Byte). Sie wird vielleicht noch geschrieben, oder das Schreiben brach ab.',
    glb_draco: 'Der Draco-Decoder konnte hier nicht laufen: {why}',
    ktx2_blocked: '{n} KTX2-Textur(en) lassen sich in diesem Frame nicht dekodieren (der Basis-Decoder braucht dynamischen Code, den Orca Plugins nicht erlaubt); das Modell wird ohne sie gezeigt. Eine .glb mit PNG- oder JPEG-Texturen zeigt sie.',
    fbx_unit_odd: 'Die Datei nennt einen Einheitsfaktor von {v} (Zentimeter pro Einheit), der keiner der üblichen Einheiten entspricht; die Zahlen werden als Zentimeter gezeigt.',
    gcode_part_extrusion: 'Extrusionsbewegungen',
    gcode_part_travel: 'Leerfahrten',
    gcode_reading: 'Der G-Code wird gelesen … {pct} %',
    gcode_info: 'Werkzeugweg: {layers} Schicht(en), {ext} Extrusionssegmente, {trv} Leerfahrt-Segmente (ein verborgenes Teil), {fil} Filament auf der E-Achse gezählt. Nicht gelesen: Werkzeugwechsel, Firmware-Rückzug, Temperaturen.',
    gcode_truncated: 'Die Datei hat mehr Bewegungen, als dieser Viewer zeichnet ({n}); nur die ersten {n} Segmente werden gezeigt (das Ende des Drucks fehlt).',
    gcode_arcs: '{n} Bogen/Bögen in einer anderen Ebene als XY wurden als Geraden gezeichnet.',
    gcode_none: 'In diesem G-Code wurden keine Bewegungen gefunden.',
    xyz_none: 'In dieser Datei wurden keine Punkte gefunden (erwartet: Zeilen mit x y z oder x y z r g b).',
    obj_bad_faces: '{n} Dreieck(e) wurden ausgelassen: ihre Flächen nennen Eckpunkte, die nicht in der Datei stehen.',
    why_memory: 'Für diese Datei reicht der Speicher hier nicht.',
    why_damaged: 'Die Datei ist beschädigt (ihr Aufbau passt nicht zu dem, was sie über sich sagt).',
    binary_as_text: 'Das sieht nach einer Binärdatei aus, die Orca als Text übergeben hat, sie lässt sich so nicht getreu lesen. Die Datei stattdessen auf die Ansicht ziehen (oder Datei öffnen …).',
    unexpected_error: 'Etwas ist schiefgegangen: {why}',
    ply_short: 'Der PLY-Kopf verspricht {declared} Datenzeilen, die Datei hat aber {actual}: sie ist abgeschnitten oder die Zahlen stimmen nicht, das Gezeigte kann unvollständig oder falsch sein.',
    xyz_comma: '{n} Zeile(n) hatten ein Dezimalkomma und wurden so gelesen.',
    gltf_bad_json: 'Diese .gltf-Datei ist kein gültiges JSON.',
    gltf_missing_files: 'Diese .gltf verweist auf {n} getrennte Datei(en), die nicht mit ihr abgelegt wurden: {list}. Die .gltf zusammen mit diesen Dateien (oder mit ihrem Ordner) auf die Ansicht ziehen, oder eine .glb benutzen.',
    gltf_missing_images: '{n} Bilddatei(en) wurden nicht gefunden ({list}); die Flächen, die sie brauchen, erscheinen ohne Textur.',
    folder_truncated: 'Der Ordner hat mehr als {n} Dateien; nur die ersten {n} (zuerst die obersten) wurden gelesen.',
    gltf_short_buffer: 'Die Datei {name} ist kürzer, als die .gltf angibt: sie ist unvollständig.',
    fmt_fbx: 'FBX: Szenen aus Blender, Maya und Spiele-Engines (Netze, Materialien, eingebettete Texturen, Animation); Einheit und Oben-Achse werden aus der Datei gelesen.',
    fmt_pcd: 'PCD, XYZ: Punktwolken (Point Cloud Library und einfacher Text), mit Farben, wenn die Datei sie hat.',
    fmt_gcode: 'G-Code: der Werkzeugweg eines Drucks, nach Höhe gefärbt, mit Bögen; Leerfahrten sind ein verborgenes Teil; der Reiter „Schichten“ zeigt den Druck bis zu einer Schicht.',
    fmt_gltf: 'GLTF: die Textform von glTF; ihre getrennten Dateien (.bin, Bilder) werden gelesen, wenn sie zusammen mit ihr abgelegt werden, oder aus einem abgelegten Ordner.',
    explode: 'Auseinanderziehen',
    part_opacity: 'Gewähltes Teil',
    tip_fit: 'Auf das gewählte Teil zoomen, oder alles zeigen (F)',
    drop_examples: 'Oder ein Beispiel ausprobieren:',
    ex_table: 'Tischszene',
    ex_torus: 'Torus',
    ex_cloud: 'Punktwolke',
    fmt_glb: 'GLB / glTF: Szenen mit Teilen, Materialien, Texturen und Animationen; das beste Format zum Ansehen.',
    fmt_ply: 'PLY: Netze und Punktwolken von Scannern und Fotogrammetrie (Gaussian-Splat-Dateien erscheinen auch als Splats).',
    fmt_splat: 'SPLAT, SPZ: Gaussian-Splat-Szenen (als Splats gezeigt; „Zeigen als“ unter Darstellung schaltet auf Punkte um).',
    fmt_stl: 'STL: einfache Dreiecke aus CAD und 3D-Druck, ohne Farben.',
    fmt_obj: 'OBJ: Netze mit benannten Gruppen; Farben nur über eine separate Materialdatei.',
    fmt_3mf: '3MF: 3D-Druck mit Farben und Einheiten; Slicer-Projekte (Bambu Studio, Orca Slicer) öffnen ebenfalls.',
    splat_mode: 'Zeigen als',
    sm_splat: 'Splats',
    sm_points: 'Farbige Punkte',
    splat_failed: 'Der Splat-Renderer konnte hier nicht starten ({why}); die Datei wird als farbige Punkte gezeigt.',
    splat_dropped: 'Ein Werkzeug hat die Punkte verändert, deshalb sind die Splats aus; die Datei erneut öffnen, um sie zu sehen.',
    cannot_read: 'Diese {type}-Datei ({size}) lässt sich nicht lesen. Vermutlich ist sie unvollständig (wird noch geschrieben) oder beschädigt.',
    no_geometry: 'Die Datei enthält keine Geometrie (keine Dreiecke, Punkte oder Linien).',
    bad_coords: 'Die Datei enthält keine gültigen Koordinaten (leer oder nicht endlich). Vermutlich ist sie abgeschnitten oder beschädigt.',
    no_triangles: 'Die STL-Datei enthält keine Dreiecke.',
    usdz_usdc: 'USDZ ({size}) hat seine Szene als binäres USD (.usdc). Die für Plugins verfügbare Bibliothek (three.js) kann das nicht lesen: ihr USD-Lader liest nur Text-USD und liefert für .usdc eine leere Szene, deshalb wird die Datei nicht geöffnet statt leer gezeigt. Datei im Finder markieren und die Leertaste drücken (Apple AR Quick Look), oder die Szene als .glb exportieren.',
    usdz: 'USDZ ({size}) kann hier nicht gezeigt werden. Das Format ist für Apple AR Quick Look gedacht: Datei im Finder markieren und die Leertaste drücken. Eine .glb derselben Szene ist hier meist die bessere Datei.',
    as_text: 'Die Datei kam als Text an; der Viewer braucht die Rohdaten.',
    unsupported: 'Das Format .{type} wird nicht unterstützt.',
    warn_big_mesh: 'Großes Netz ({n} Dreiecke): Drehen kann ruckeln. Das Mesh aus lassen.',
    warn_many_points: 'Viele Punkte ({n}): Drehen kann ruckeln. Eine kleinere Punktgröße hilft.',
    threemf_no_model: '3MF: kein 3D-Modell (3D/3dmodel.model) im Archiv.',
    threemf_main_elsewhere: '3MF: Hauptmodell nicht an der üblichen Stelle ({name}).',
    ext_slice: 'Slice-Erweiterung: Schnittebenen werden nicht gezeichnet.',
    ext_beam: 'Beam Lattice: Gitterstäbe werden nicht gezeichnet.',
    ext_beam_balls: 'Beam Lattice (Kugeln): wird nicht gezeichnet.',
    ext_slicer: 'Slicer-Metadaten (Namen, Einstellungen, Extruder) werden nicht ausgewertet.',
    ext_unknown: 'Erweiterung wird nicht gezeichnet: {uri}',
    threemf_paint: 'Bemalte Farben (Mehrfarbdruck): {n} Dreiecke erscheinen in der Filamentfarbe, mit der sie bemalt sind; {k} sind feiner bemalt, als dieser Viewer zeigt, und behalten die Farbe des Teils.',
    ext_missing: '{n} Teiledatei(en) oder Objekt(e), auf die das Modell verweist, fehlen im Paket: diese Teile werden nicht gezeigt.',
    threemf_too_large: '3MF: Das Paket ist zu groß, um es sicher zu öffnen (mehr als etwa 0,9 GB entpackt oder zu viele Teile).',
    threemf_cyclic: '3MF: Die Objekte verweisen im Kreis aufeinander oder sind zu tief verschachtelt.',
    ext_required: 'Erweiterungen, die die Datei verlangt: {list}'
  }
}
Object.assign(STRINGS.en, EXPORT_STRINGS.en) // the export section is shared with the STEP viewer
Object.assign(STRINGS.de, EXPORT_STRINGS.de)
Object.assign(STRINGS.en, TOOLS_STRINGS.en) // the Edit tab is shared with the other viewer
Object.assign(STRINGS.de, TOOLS_STRINGS.de)
Object.assign(STRINGS.en, SESSION_STRINGS.en) // the kept-file note is shared with the other viewer
Object.assign(STRINGS.de, SESSION_STRINGS.de)
Object.assign(STRINGS.en, STUDIO_STRINGS.en) // the Studio section is shared with the other viewer
Object.assign(STRINGS.de, STUDIO_STRINGS.de)
Object.assign(STRINGS.en, PARTINFO_STRINGS.en) // the part card and measuring parts are shared with the other viewer
Object.assign(STRINGS.de, PARTINFO_STRINGS.de)
Object.assign(STRINGS.en, MEASURE_STRINGS.en) // Measure+ (list, chain, tab) is shared with the other viewer
Object.assign(STRINGS.de, MEASURE_STRINGS.de)
Object.assign(STRINGS.en, CHROME_STRINGS.en) // the toolbar, tabs and measuring bar are shared with the other viewer
Object.assign(STRINGS.de, CHROME_STRINGS.de)

export function pickLocale(tag) {
  return /^de(\b|-|_)/i.test(String(tag || '')) ? 'de' : 'en'
}

/** t(key, vars): the key in the locale, else English, else the key itself. */
export function makeT(locale) {
  const table = STRINGS[locale] || STRINGS.en
  return (key, vars) =>
    String(table[key] ?? STRINGS.en[key] ?? key).replace(/\{(\w+)\}/g, (_, n) => (vars && vars[n] !== undefined ? String(vars[n]) : ''))
}

// ---------- number formats ----------
const SMALLER = { m: ['cm', 100], cm: ['mm', 10], in: ['mm', 25.4], ft: ['in', 12] } // the next smaller unit and how many of it make one
function volumeText(v, u, power, tag) {
  const sig = (x) => {
    const a = Math.abs(x)
    if (!(a >= 1e-9)) return '0'
    const d = a >= 100 ? 0 : Math.min(9, Math.max(0, 2 - Math.floor(Math.log10(a))))
    return Number(x.toFixed(d)).toLocaleString(tag, { maximumFractionDigits: d })
  }
  const small = SMALLER[u]
  if (small && Math.abs(v) > 0 && Math.abs(v) < (power === 3 ? 0.01 : 0.001)) return `${sig(v * small[1] ** power)} ${small[0]}${power === 3 ? '³' : '²'}`
  return `${sig(v)} ${u}${power === 3 ? '³' : '²'}`
}

export function makeFormat(locale) {
  const tag = locale === 'de' ? 'de-DE' : 'en-US'
  const nf = new Intl.NumberFormat(tag)
  return {
    int: (n) => nf.format(Math.round(n)),
    mb: (b) => (b < 1e6 ? (b / 1e3).toLocaleString(tag, { maximumFractionDigits: 1 }) + ' KB' : (b / 1e6).toLocaleString(tag, { maximumFractionDigits: 2 }) + ' MB'),
    dur: (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString(tag, { maximumFractionDigits: 1 })} s`),
    // three significant digits (never fewer than the whole part), so 0.045 m stays 0.045 and 1.2e-4 stays 0.00012; noise below a micro-unit is zero
    len: (v) => {
      const a = Math.abs(v)
      if (Number.isNaN(v)) return '–' // not a number: say so, not 0
      if (!(a >= 1e-6)) return '0'
      const digits = a >= 100 ? 0 : Math.min(9, Math.max(0, 2 - Math.floor(Math.log10(a))))
      const r = Number(v.toFixed(digits))
      return (r === 0 ? 0 : r).toLocaleString(tag, { maximumFractionDigits: digits })
    },
    // a volume or an area in the model's unit; a small one in the next smaller unit (0.00012 m3 is 120 cm3)
    vol: (v, u) => volumeText(v, u, 3, tag),
    area: (v, u) => volumeText(v, u, 2, tag),
  }
}

/** A round grid step (1, 2, 5 x 10^n) giving roughly a dozen cells across `extent`. */
export function niceStep(extent) {
  const raw = Math.max(extent, 1e-9) / 12
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / p
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p
}

/** Hue (0..1) of part i: golden-angle steps keep neighbours apart. */
export function partHue(i) {
  return ((i * 137.508) % 360) / 360
}

/** Which axis points up when the file does not say: glTF is y-up; CAD and 3D-printing formats are z-up. */
export function defaultUp(type) {
  return type === 'stl' || type === '3mf' || type === 'gcode' ? 'z' : 'y' // printing formats have Z up
}

/** The color of a point is stored as the DC term of spherical harmonics (f_dc_*): a splat file, or a point cloud from the same tools. */
export function hasSphericalHarmonicColor(head) {
  return /property float f_dc_0/.test(head)
}

/** A 3D Gaussian splat PLY: the training tools' properties (color from f_dc_*, opacity, scale_*, rot_*), not just any point cloud with a color. */
export function isGaussianSplatHeader(head) {
  return /property float f_dc_0\b/.test(head) && /property float opacity\b/.test(head) && /property float scale_0\b/.test(head) && /property float rot_0\b/.test(head)
}

// ---------- 3MF ----------
export const UNITS_3MF = {
  micron: { short: 'µm', key: 'u_micron' },
  millimeter: { short: 'mm', key: 'u_millimeter' },
  centimeter: { short: 'cm', key: 'u_centimeter' },
  inch: { short: 'in', key: 'u_inch' },
  foot: { short: 'ft', key: 'u_foot' },
  meter: { short: 'm', key: 'u_meter' }
}
const NS = 'http://schemas.microsoft.com/3dmanufacturing/'
const NS_NOTES = {
  [NS + 'core/2015/02']: null,
  [NS + 'material/2015/02']: null,
  [NS + 'production/2015/06']: null, // read: parts in separate model files (see threemf.js)
  [NS + 'slice/2015/07']: 'ext_slice',
  [NS + 'beamlattice/2017/02']: 'ext_beam',
  [NS + 'beamlattice/balls/2020/07']: 'ext_beam_balls',
  'http://schemas.slic3r.org/3mf/2017/06': 'ext_slicer'
}
const KNOWN_NS = /schemas\.bambulab\.com\/package/i // Bambu Studio / Orca Slicer package metadata: part and object names and filament colors are read

/** Reads a 3MF's unit and lists what the viewer cannot draw, so a file is never shown as if it were complete.
 *  Returns { unit: {short, label}, notes: string[], external: boolean } (external: meshes live in separate .model files, read by
 *  threemf.js); throws Error(message) when the archive has no model or is too large to open safely. */
export function inspect3mf(buf, t) {
  const names = []
  let main = null
  let total = 0
  const files = unzipSync(new Uint8Array(buf), {
    filter: (f) => {
      names.push(f.name)
      total += f.originalSize
      if (total > LIMITS.maxTotalBytes) throw new Error(t('threemf_too_large')) // a zip bomb is refused before anything is unpacked
      const isMain = /(^|\/)3dmodel\.model$/i.test(f.name)
      if (isMain && f.originalSize > LIMITS.maxModelBytes) throw new Error(t('threemf_too_large'))
      if (isMain && !main) main = f.name
      return isMain
    }
  })
  if (!main) {
    const alt = names.find((n) => /\.model$/i.test(n) && !/\/Objects\//i.test(n))
    throw new Error(alt ? t('threemf_main_elsewhere', { name: alt }) : t('threemf_no_model'))
  }
  // The head of the main model holds the unit and the namespaces; the rest of a big file is not needed here.
  const xml = new TextDecoder().decode(files[main].subarray(0, 262144))
  const root = xml.slice(0, 8000)
  const u = (/<model[^>]*\sunit="([a-z]+)"/i.exec(root) || [])[1] || 'millimeter' // the spec's default
  const unit = UNITS_3MF[u] ? { short: UNITS_3MF[u].short, label: t(UNITS_3MF[u].key) } : { short: u, label: u }
  const notes = []
  const seen = new Set()
  const prefixes = {}
  for (const m of root.matchAll(/xmlns:([A-Za-z0-9_]+)="([^"]+)"/g)) {
    const uri = m[2]
    prefixes[m[1]] = uri
    if (seen.has(uri)) continue
    seen.add(uri)
    if (uri in NS_NOTES) {
      if (NS_NOTES[uri]) notes.push(t(NS_NOTES[uri]))
    } else if (!KNOWN_NS.test(uri) && !/w3\.org|opcfoundation|openxmlformats/i.test(uri)) {
      notes.push(t('ext_unknown', { uri }))
    }
  }
  const external = hasExternalModels(names, xml)
  // Required extensions are named by prefix ("p"); say which ones the viewer does not handle, by their namespace.
  const req = (/requiredextensions="([^"]*)"/i.exec(root) || [])[1]
  if (req) {
    const unsupported = req
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => prefixes[p] || p)
      .filter((uri) => !(uri in NS_NOTES && NS_NOTES[uri] === null) && !KNOWN_NS.test(uri))
    if (unsupported.length) notes.push(t('ext_required', { list: unsupported.join(', ') }))
  }
  return { unit, notes, external }
}

// ---------- views ----------
export const PRESETS = ['iso', 'front', 'back', 'left', 'right', 'top', 'bottom', 'hero']
const PRESET_DIR = { iso: [0.7, 0.55, 0.9], front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.0001], bottom: [0, -1, 0.0001], hero: [0.45, 0.16, 1] }
/** Unit direction from the model towards the camera, in view space (+Y is up, front looks along -Z). */
/** How much of the fitting distance a view keeps: the hero shot stands a little closer. */
export const presetScale = (name) => (name === 'hero' ? 0.82 : 1)

export function presetDirection(name) {
  const d = PRESET_DIR[name] || PRESET_DIR.iso
  const l = Math.hypot(...d)
  return d.map((v) => v / l)
}

/** Totals over the parts of a model: triangles, vertices (of meshes and lines), points and B-rep faces (STEP). */
export function summarizeParts(parts) {
  let tris = 0
  let verts = 0
  let pts = 0
  let faces = 0
  for (const p of parts) {
    tris += p.tris || 0
    faces += p.faces || 0
    if (p.kind === 'points') pts += p.verts || 0
    else verts += p.verts || 0
  }
  return { tris, verts, pts, faces }
}

/** How far the camera must be from the center of a sphere of `radius` for all of it to be seen: in the narrower of the vertical and the horizontal field of view
 *  (a tall, narrow view is the narrow one), with a margin. */
export function fitDistance(radius, fovDeg, aspect, margin = 1.08) {
  const v = (fovDeg * Math.PI) / 180
  const h = 2 * Math.atan(Math.tan(v / 2) * Math.max(aspect, 0.05))
  return (radius * margin) / Math.sin(Math.min(v, h) / 2)
}

/** The clipping plane for an axis ('x' | 'y' | 'z', in view space), a position 0..1 across the box and a side.
 *  Points with normal . p + constant < 0 are cut away. Returns { normal, constant }. */
export function clipPlane(axis, t, min, max, flip) {
  const i = { x: 0, y: 1, z: 2 }[axis]
  if (i === undefined) return null
  const pos = min[i] + (max[i] - min[i]) * Math.min(1, Math.max(0, t))
  const n = [0, 0, 0]
  n[i] = flip ? -1 : 1
  return { normal: n, constant: flip ? pos : -pos }
}

/** Distance between two points and the parts along the file's own axes (the same vectors, turned back by the model rotation). */
export function measureInfo(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  return { distance: Math.hypot(...d), delta: d }
}

/** Part indices whose label contains the query (case-insensitive, trimmed); an empty query keeps all. */
export function filterIndices(labels, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return labels.map((_, i) => i)
  return labels.flatMap((l, i) => (String(l).toLowerCase().includes(q) ? [i] : []))
}

/** Target size of a texture under a limit: scaled down by powers of two of the long side, never up. */
export function textureTarget(w, h, max) {
  const m = Math.max(w, h)
  if (!max || m <= max) return { w, h, scaled: false }
  const f = max / m
  return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)), scaled: true }
}

/** Approximate GPU memory of a texture with mipmaps: width x height x 4 bytes x 4/3. */
export function textureBytes(w, h) {
  return Math.round(w * h * 4 * (4 / 3))
}

/** Which view-space axis a file axis ends up on after the "up is" rotation, and whether it points the same way.
 *  up 'y': none; '-y': x stays, y and z reverse; 'z': y -> z (file z becomes view y, file y becomes view -z). */
export function fileAxisToView(axis, up) {
  if (up === 'z') return { x: { axis: 'x', sign: 1 }, y: { axis: 'z', sign: -1 }, z: { axis: 'y', sign: 1 } }[axis] || null
  if (up === '-y') return { x: { axis: 'x', sign: 1 }, y: { axis: 'y', sign: -1 }, z: { axis: 'z', sign: -1 } }[axis] || null
  return { x: { axis: 'x', sign: 1 }, y: { axis: 'y', sign: 1 }, z: { axis: 'z', sign: 1 } }[axis] || null
}

/** Orca hands text files (OBJ, ASCII PLY, ASCII STL, .gltf, ASCII FBX, PCD, XYZ, G-code) to an editor as text, without the file name:
 *  the format is told by the first lines (see formats.js). */
export const sniffTextFormat = sniffText

// ---------- opening files by drop or picker ----------
export const SUPPORTED_EXT = ['glb', 'gltf', 'ply', 'obj', 'stl', '3mf', 'usdz', 'splat', 'spz', 'fbx', 'pcd', 'xyz', 'gcode']
/** Above this a dropped file asks first (it may need several GB while decoding); above HARD_MAX it is refused. */
export const GATE_BYTES = 150e6
export const HARD_MAX_BYTES = 1.5e9

export function extOf(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''))
  return m ? m[1].toLowerCase() : ''
}

/** From a drop or a picker: the first file with a supported extension. `ignored` counts the other files,
 *  `unsupported` lists the names of files that were skipped for their extension. */
export function pickFile(files, supported) {
  const list = Array.from(files || [])
  const ok = list.filter((f) => supported.includes(extOf(f.name)))
  return { file: ok[0] || null, ignored: Math.max(0, list.length - (ok[0] ? 1 : 0)), unsupported: list.filter((f) => !supported.includes(extOf(f.name))).map((f) => f.name) }
}

/** The start file Orca opens for "new 3D viewer" (a tiny text file): first line is the marker. */
export function isStartText(text) {
  return /^\uFEFF?\s*3dview-start\b/.test(String(text).slice(0, 64))
}

/** One line of state that an agent can read with `orca plugin logs`: what is on screen. */
export function stateLine(plugin, info) {
  return `${plugin}-state ${JSON.stringify(info)}`
}

/** The rows of the "Info" list (label, value) from plain numbers; `textures` is `[{ w, h }]`. */
export function statsRows(c) {
  const { t, fmt, fmtMB, fmtLen, tris, verts, pts, fileInfo, unit, size, bounds, textures } = c
  const rows = fileInfo.name ? [[t('s_name'), fileInfo.name], [t('s_size'), fmtMB(fileInfo.bytes)]] : [[t('s_size'), fmtMB(fileInfo.bytes)]]
  if (tris) rows.push([t('s_triangles'), fmt(tris)])
  if (verts && fileInfo.type !== 'stl') rows.push([t('s_vertices'), fmt(verts)])
  if (pts) rows.push([t('s_points'), fmt(pts)])
  if (c.partCount > 1) rows.push([t(fileInfo.type === '3mf' ? 's_objects' : 's_parts'), fmt(c.partCount)])
  rows.push([t('s_extent'), `${fmtLen(size.x)} × ${fmtLen(size.y)} × ${fmtLen(size.z)} ${unit.short}`])
  rows.push([t('s_height'), `${fmtLen(bounds.min.y)} … ${fmtLen(bounds.max.y)} ${unit.short}`])
  rows.push(...c.checks)
  rows.push([t('s_grid'), `${fmtLen(c.gridStep)} ${unit.short}`])
  rows.push([t('s_unit'), unit.label])
  if (textures.length) {
    const img = textures[0]
    rows.push([t('s_texture'), textures.length > 1 ? t('s_texture_n', { n: textures.length }) : img.w ? `${img.w} × ${img.h}` : '1'])
    rows.push([t('s_texmem'), fmtMB(textures.reduce((a, tx) => a + (tx.w ? textureBytes(tx.w, tx.h) : 0), 0))])
  }
  rows.push([t('s_load'), c.dur(c.ms)])
  return rows
}
