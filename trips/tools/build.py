#!/usr/bin/env python3
"""Build the all-in-one "Travel Plans" app in trips/ from the standalone planners.

The standalone apps (iceland-planner/, egypt/) stay the source of truth and are never modified.
This script copies each one into trips/<id>/ and patches the copy so that:
  - all destinations share ONE installable app (trips/manifest.webmanifest); Chrome on Android
    only allows one installed app per site address, and everything here is on rujopereiric.github.io;
  - each copy saves its plan under its own key (tp-...), so the new app can't touch your existing plans.
    On first open it offers to copy your plan from the standalone app;
  - re-downloadable data (photos, routes, map places, exchange rate) keeps the original keys and is
    shared with the standalone app, so the ~5 MB browser storage allowance isn't spent twice;
  - offline caches get a tp-<id>- prefix, so neither app's service worker deletes the other's caches;
  - Egypt reads its OpenStreetMap files from ../../egypt/osm/, which the daily GitHub Action keeps fresh.

Run from the repo root:  python3 trips/tools/build.py
Every patch is checked: if a source file changed so a patch no longer applies, the build stops with an error.
"""
import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TRIPS = os.path.join(ROOT, 'trips')
DESTS = json.load(open(os.path.join(TRIPS, 'trips.json')))['destinations']

def patch(text, old, new, what, count=1):
    n = text.count(old)
    if n < 1 or (count and n != count):
        sys.exit(f'build: patch "{what}" expected {count or ">=1"} match(es) of {old!r}, found {n}. Update trips/tools/build.py.')
    return text.replace(old, new)

def migration_snippet(d):
    pairs = json.dumps(d['copyKeys'])
    return f"""
// ---- added by trips/tools/build.py: first run in the Travel Plans app ----
// This copy saves under its own keys. If you already have a plan in the standalone {d['name']} app, offer to copy it once.
(function () {{
  try {{
    const pairs = {pairs};
    const asked = LS_STATE + '-asked';
    if (localStorage.getItem(LS_STATE) || localStorage.getItem(asked)) return;
    const has = Object.keys(pairs).some(k => localStorage.getItem(k) != null);
    if (has && confirm('Copy your {d['name']} plan from the standalone {d['name']} app into Travel Plans?\\n\\nYour original stays as it is. Choose Cancel to start from the sample plan.'))
      for (const [from, to] of Object.entries(pairs)) {{ const v = localStorage.getItem(from); if (v != null) localStorage.setItem(to, v); }}
    localStorage.setItem(asked, '1');
  }} catch (e) {{ }}
}})();
"""

def build(d):
    src, dst = os.path.join(ROOT, d['source']), os.path.join(TRIPS, d['id'])
    if os.path.isdir(dst): shutil.rmtree(dst)
    skip = set(d.get('skip', []))
    def ignore(dirpath, names):
        rel = os.path.relpath(dirpath, src)
        return [n for n in names if (n if rel == '.' else os.path.join(rel, n)) in skip or n.endswith('.webmanifest')]
    shutil.copytree(src, dst, ignore=ignore)

    # app.js: own plan keys + first-run copy offer (+ per-destination path fixes)
    p = os.path.join(dst, 'app.js'); js = open(p).read()
    for old, new in d['copyKeys'].items():
        js = patch(js, f"'{old}'", f"'{new}'", f'{d["id"]} key {old}')
    js = patch(js, f"const LS_UI = '{d['copyKeys'][d['uiKey']]}';", f"const LS_UI = '{d['copyKeys'][d['uiKey']]}';" + migration_snippet(d), f'{d["id"]} migration')
    for old, new in d.get('jsReplace', {}).items():
        js = patch(js, old, new, f'{d["id"]} js {old}', count=0)
    open(p, 'w').write(js)

    # index.html: the shared manifest, and a way back to the trips list
    p = os.path.join(dst, 'index.html'); h = open(p).read()
    h, n = re.subn(r'<link rel="manifest" href="[^"]+">', '<link rel="manifest" href="../manifest.webmanifest">', h)
    if n != 1: sys.exit(f'build: {d["id"]} index.html manifest link not found')
    h = patch(h, '<header class="top">', '<header class="top">\n  <a class="chip" href="../" style="text-decoration:none;flex:none" title="All trips">← Trips</a>', f'{d["id"]} back link')
    open(p, 'w').write(h)

    # sw.js: own cache prefix, shared manifest, and the CORS tile fix
    p = os.path.join(dst, 'sw.js'); w = open(p).read()
    for old, new in d['swReplace'].items():
        w = patch(w, old, new, f'{d["id"]} sw {old}', count=0)
    w, n = re.subn(r"'[a-z0-9-]+\.webmanifest'", "'../manifest.webmanifest'", w)
    if n < 1: sys.exit(f'build: {d["id"]} sw.js manifest entry not found')
    w = re.sub(r"const res = await fetch\(req\);\n(\s*)if \(res\.ok \|\| res\.type === 'opaque'\) \{ c\.put\(req, res\.clone\(\)\); trimTiles\(\); \}\n(\s*)return res;\n(\s*)\} catch \(err\) \{ return new Response\('', \{ status: 504 \}\); \}",
               "const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); // CORS: opaque responses count as MBs each\n\\1if (res.ok) c.put(req.url, res.clone()).then(trimTiles).catch(() => {});\n\\2return res;\n\\3} catch (err) { try { return await fetch(req); } catch (e2) { return new Response('', { status: 504 }); } }", w)
    bad = [k for k in re.findall(r"startsWith\('([a-z0-9-]+)'\)", w) if not k.startswith('tp-')]
    if bad: sys.exit(f'build: {d["id"]} sw.js still deletes non-tp caches: {bad}')
    open(p, 'w').write(w)
    print(f'built trips/{d["id"]}/ from {d["source"]}/')

for d in DESTS: build(d)
