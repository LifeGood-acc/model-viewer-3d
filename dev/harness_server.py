"""Test harness: runs the editor in a plain browser, without Orca (Orca asks for approval before it runs a plugin).

  python3 dev/harness_server.py [port]
  open  http://127.0.0.1:8765/h/index.html?file=/abs/path/model.glb&act=b-wire,b-bg

`file` is read-only and must end in .glb/.ply/.obj/.stl/.3mf/.usdz. `act` is a comma list of element ids to click after loading.
`orca.document` is a stand-in that hands the file over as bytes, the way Orca does for contentKind "bytes".
Binds to 127.0.0.1 only; nothing is fetched from the network.
"""
import http.server, os, sys, urllib.parse

ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), '..', 'editor'))
SHIM = """<script>
(() => {
  const q = new URLSearchParams(location.search)
  const file = q.get('file') || ''
  const type = file.split('.').pop().toLowerCase()
  if (q.get('theme') === 'dark') {
    document.documentElement.classList.add('dark')
    const st = document.documentElement.style
    for (const [k, v] of Object.entries({ background: '#16181c', foreground: '#e8e9ec', card: '#1f2227', 'muted-foreground': '#9aa0aa', border: '#33373f', accent: '#2c3038', primary: '#e8e9ec', 'primary-foreground': '#16181c' })) st.setProperty('--orca-' + k, v)
  }
  window.__mv3dHook = (h) => { window.__h = h } // test tooling: gives scripts access to renderer, camera and controls
  window.orca = {
    locale: q.get('lang') || 'en',
    on() { return { dispose() {} } },
    host: { async call(m, p) { window.__saved = { m, bytes: p.data.byteLength, name: p.suggestedName, mime: p.mimeType, png: new Uint8Array(p.data).slice(0, 4).join(',') }; window.__savedData = p.data; if (q.get('savecancel')) return { status: 'cancelled' }; return { status: 'saved' } } },
    document: q.get('nodoc') ? undefined : {
      onDidChange(h) {
        window.__handler = h
        if (q.get('fuzzdir')) return { dispose() {} } // fuzz mode feeds the files itself, see below
        fetch('/file?p=' + encodeURIComponent(file))
          .then((r) => r.arrayBuffer())
          .then((bytes) => h({ version: 1, readOnly: true, fileType: type, content: q.get('astext') ? { kind: 'text', text: new TextDecoder().decode(bytes) } : { kind: 'bytes', bytes } })) // astext=1: the way Orca hands a text file to a text editor
        return { dispose() {} }
      }
    }
  }
  const act = (q.get('act') || '').split(',').filter(Boolean)
  for (const id of (q.get('open') || '').split(',').filter(Boolean)) addEventListener('DOMContentLoaded', () => { const d = document.getElementById(id); if (d) d.open = true }) // open sections for screenshots
  const t0 = Date.now()
  const iv = setInterval(() => {
    const msg = document.getElementById('msg')
    if (msg && msg.className.indexOf('hide') >= 0 || (msg && msg.className.indexOf('err') >= 0) || Date.now() - t0 > 120000 || type === 'usdz' && document.getElementById('msg-text').textContent.startsWith('USDZ')) {
      clearInterval(iv)
      for (const id of act) {
        const el = document.getElementById(id); if (!el) continue
        if (id === 'up') { el.value = q.get('up') || 'y'; el.dispatchEvent(new Event('change')) } else el.click()
      }
      for (const kv of (q.get('set') || '').split(',').filter(Boolean)) { const [id, v] = kv.split(':'); const el = document.getElementById(id); if (!el) continue; el.value = v; el.dispatchEvent(new Event(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', { bubbles: true })) }
  if (q.get('pt')) { const r = document.getElementById('pt'); r.value = q.get('pt'); r.dispatchEvent(new Event('input')) }
      setTimeout(() => { document.title = 'READY' }, 800)
    }
  }, 200)
  if (q.get('fuzzdir')) {
    window.__fuzz = []
    window.addEventListener('error', (e) => window.__fuzz.push({ uncaught: String(e.message) + ' @ ' + String((e.error && e.error.stack) || '').split('\\n').slice(0, 4).join(' | ') }))
    window.addEventListener('unhandledrejection', (e) => window.__fuzz.push({ uncaught: String(e.reason && e.reason.message || e.reason) }))
    ;(async () => {
      const files = await (await fetch('/fuzzlist?d=' + encodeURIComponent(q.get('fuzzdir')))).json()
      while (!window.__handler) await new Promise((r) => setTimeout(r, 20))
      for (const f of files) {
        const bytes = await (await fetch('/file?p=' + encodeURIComponent(f))).arrayBuffer()
        document.documentElement.dataset.state = 'feeding'
        const ext = f.split('.').pop().toLowerCase()
        // like Orca: text editors get text (always for .obj, and for every second .ply/.stl), bytes editors get bytes
        const asText = ['obj', 'xyz', 'gcode', 'gltf'].includes(ext) || (['ply', 'stl', 'pcd', 'fbx'].includes(ext) && files.indexOf(f) % 2 === 1)
        window.__handler({ version: 1, readOnly: true, fileType: ext, content: asText ? { kind: 'text', text: new TextDecoder().decode(bytes) } : { kind: 'bytes', bytes } })
        const t1 = Date.now()
        while (['feeding', 'loading', 'waiting'].includes(document.documentElement.dataset.state) && Date.now() - t1 < 30000) await new Promise((r) => setTimeout(r, 10))
        window.__fuzz.push({ file: f.split('/').pop(), state: document.documentElement.dataset.state, ms: Date.now() - t1 })
        if (document.documentElement.dataset.state === 'ok' && q.get('fuzztools')) {
          // the Tools on whatever loaded: check, decimate, compress; each must end (idle again) without an uncaught error
          const waitIdle = async (cond) => { const t2 = Date.now(); while (!cond() && Date.now() - t2 < 30000) await new Promise((r) => setTimeout(r, 10)); return cond() }
          const D = document.documentElement.dataset
          document.getElementById('tl-check-btn').click(); const a1 = await waitIdle(() => D.tools === 'idle')
          document.getElementById('tl-decimate').click(); const a2 = await waitIdle(() => D.tools === 'idle')
          const sel = document.getElementById('ex-format'); sel.value = 'glbc'; sel.dispatchEvent(new Event('change', { bubbles: true }))
          document.getElementById('b-ex-make').click(); const a3 = await waitIdle(() => D.export !== 'busy')
          document.getElementById('tl-reset').click()
          window.__fuzz.push({ file: f.split('/').pop(), tools: a1 && a2 && a3 ? 'ok' : 'HUNG' })
        }
      }
      document.title = 'FUZZDONE'
    })()
  }
})()
</script>"""

# What Orca's frame allows scripts (script-src is read from its error message; worker-src blob: is inferred, because workers made from blobs run there): no eval, WebAssembly yes. The page is served with it unless `csp=0` is in the URL,
# so the checks run under the same rule as in Orca.
CSP = "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:"

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body, ctype, csp=False):
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body)))
        if csp: self.send_header('Content-Security-Policy', CSP)
        self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/fuzzlist':
            d = os.path.realpath(urllib.parse.parse_qs(u.query).get('d', [''])[0])
            names = sorted(f for f in os.listdir(d) if f.lower().endswith(('.glb', '.ply', '.obj', '.stl', '.3mf', '.usdz', '.splat', '.spz', '.gltf', '.fbx', '.pcd', '.xyz', '.gcode')))
            return self.send(200, __import__('json').dumps([os.path.join(d, f) for f in names]).encode(), 'application/json')
        if u.path == '/file':
            p = os.path.realpath(urllib.parse.parse_qs(u.query).get('p', [''])[0])
            if not p.lower().endswith(('.glb', '.ply', '.obj', '.stl', '.3mf', '.usdz', '.splat', '.spz', '.gltf', '.fbx', '.pcd', '.xyz', '.gcode')) or not os.path.isfile(p):
                return self.send(404, b'no', 'text/plain')
            return self.send(200, open(p, 'rb').read(), 'application/octet-stream')
        if u.path.startswith('/h/'):
            rel = u.path[3:] or 'index.html'
            p = os.path.realpath(os.path.join(ROOT, rel))
            if not p.startswith(ROOT + os.sep) or not os.path.isfile(p):
                return self.send(404, b'no', 'text/plain')
            data = open(p, 'rb').read()
            ctype = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'}.get(os.path.splitext(p)[1], 'application/octet-stream')
            if rel == 'index.html':
                data = data.replace(b'<link rel="stylesheet"', SHIM.encode() + b'<link rel="stylesheet"', 1)
            return self.send(200, data, ctype, csp=rel == 'index.html' and urllib.parse.parse_qs(u.query).get('csp', ['1'])[0] != '0')
        self.send(404, b'no', 'text/plain')

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
