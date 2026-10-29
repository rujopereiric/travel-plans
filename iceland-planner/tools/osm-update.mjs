// Prepares iceland-planner/osm/iceland.json from OpenStreetMap, so the app downloads a ready file instead of asking the
// public Overpass servers from your phone (one query for the whole country is heavy, and they time out or throttle it).
// Run by .github/workflows/osm-iceland.yml; locally: node iceland-planner/tools/osm-update.mjs [--force]
// The query and row format come from app.js (between the osm-shared markers), so they can't drift.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));   // iceland-planner/
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const m = /\/\* osm-shared-start[^\n]*\n([\s\S]*?)\/\* osm-shared-end \*\//.exec(app);
if (!m) throw new Error('osm-shared block not found in app.js');
const ctx = {};
vm.runInNewContext(m[1] + '\nthis.OSM_BOX = OSM_BOX; this.osmQuery = osmQuery; this.osmRow = osmRow; this.osmDedupe = osmDedupe;', ctx);
const { OSM_BOX, osmQuery, osmRow, osmDedupe } = ctx;

const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = 'travel-plans Iceland planner (github.com/rujopereiric/travel-plans)';

// Same approach as portugal/tools/osm-update.mjs: "busy" (504, 429, no answer) means wait and try another server;
// a box is split into 4 only when a server actually ran the query and reports it ran out of time.
const isQueryTimeout = msg => /runtime error|Query timed out|out of memory/i.test(msg);
async function fetchBox(box, depth = 0) {
  const label = `${'  '.repeat(depth + 1)}[${box.map(x => x.toFixed(2)).join(',')}]`;
  let heavy = 0;
  for (let round = 0; round < 4; round++) {
    for (const url of SERVERS) {
      const host = new URL(url).host, t0 = Date.now();
      try {
        const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(osmQuery(box, 120)),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, signal: AbortSignal.timeout(140000) });
        if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 504 || res.status === 429 ? ' (busy)' : ''));
        const j = await res.json();
        if (j.remark && isQueryTimeout(j.remark)) throw new Error(j.remark.slice(0, 120));
        console.log(`${label} ${host}: ${j.elements.length} elements in ${Math.round((Date.now() - t0) / 1000)} s`);
        return j.elements;
      } catch (err) {
        console.log(`${label} ${host}: ${err.message} (${Math.round((Date.now() - t0) / 1000)} s)`);
        if (isQueryTimeout(err.message)) heavy++;
      }
      if (heavy >= 2 && depth < 2) break;
      await sleep(15000);
    }
    if (heavy >= 2 && depth < 2) break;
    console.log(`${label} all servers busy, waiting 60 s (round ${round + 1} of 4)`);
    await sleep(60000);
  }
  if (heavy >= 2 && depth < 2) {
    const [s, w, n, e] = box, mlat = (s + n) / 2, mlon = (w + e) / 2, all = [];
    console.log(`${label} query too heavy, splitting into 4`);
    for (const q of [[s, w, mlat, mlon], [s, mlon, mlat, e], [mlat, w, n, mlon], [mlat, mlon, n, e]]) {
      const els = await fetchBox(q, depth + 1);
      if (!els) return null;
      all.push(...els);
    }
    return all;
  }
  return null;
}

const file = path.join(dir, 'osm', 'iceland.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
// scheduled runs only refresh a file older than 20 days, so a run that meets busy servers just tries again tomorrow
if (old && !process.argv.includes('--force') && Date.now() - old.at < 20 * 864e5) { console.log('osm/iceland.json is fresh, skipped'); process.exit(0); }
const els = await fetchBox(OSM_BOX);
if (!els) { console.log('FAILED, keeping the previous file if any'); process.exit(1); }
const byId = new Map();
for (const el of els) { const row = osmRow(el); if (row) byId.set(row[0], row); }
const items = osmDedupe([...byId.values()].sort((a, b) => a[0] < b[0] ? -1 : 1));   // stable order: unchanged data, unchanged file
if (old && JSON.stringify(old.items) === JSON.stringify(items)) { console.log(`${items.length} places, unchanged`); process.exit(0); }
fs.writeFileSync(file, JSON.stringify({ at: Date.now(), source: 'OpenStreetMap contributors (ODbL)', items }) + '\n');
const counts = {}; for (const r of items) counts[r[4]] = (counts[r[4]] || 0) + 1;
console.log(`${items.length} places, ${Math.round(fs.statSync(file).size / 1024)} KB → osm/iceland.json`, counts);
if (process.env.OSM_COMMIT) {
  const sh = c => execSync(c, { stdio: 'inherit', cwd: path.dirname(dir) });
  sh('git add iceland-planner/osm/iceland.json');
  sh('git commit -q -m "Iceland planner: update OpenStreetMap data"');
  for (let i = 0; i < 3; i++) { try { sh('git pull -q --rebase origin main && git push -q origin HEAD:main'); break; } catch (e) { await sleep(5000); } }
}
