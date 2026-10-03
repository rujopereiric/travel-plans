// Prepares egypt/osm/<region>.json from OpenStreetMap, so the app downloads a ready file instead of asking the
// public Overpass servers from your phone (slow, and they throttle a phone that retries).
// Run by .github/workflows/osm-egypt.yml; locally: node egypt/tools/osm-update.mjs [region ...]
// The region list, query and row format come from app.js (between the osm-shared markers), so they can't drift.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));   // egypt/
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const m = /\/\* osm-shared-start[^\n]*\n([\s\S]*?)\/\* osm-shared-end \*\//.exec(app);
if (!m) throw new Error('osm-shared block not found in app.js');
const ctx = {};
vm.runInNewContext(m[1] + '\nthis.OSM_AREAS = OSM_AREAS; this.osmQuery = osmQuery; this.osmRow = osmRow;', ctx);
const { OSM_AREAS, osmQuery, osmRow } = ctx;

const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = 'travel-plans Egypt planner (github.com/rujopereiric/travel-plans)';

async function fetchArea(area) {
  // a few rounds over all servers, with growing pauses: here we can afford to wait
  for (let round = 0; round < 2; round++) {
    for (const url of SERVERS) {
      const host = new URL(url).host, t0 = Date.now();
      try {
        const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(osmQuery(area, 90)),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, signal: AbortSignal.timeout(110000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        if (j.remark && /runtime error|timed out|out of memory/i.test(j.remark)) throw new Error(j.remark.slice(0, 120));
        console.log(`  ${host}: ${j.elements.length} elements in ${Math.round((Date.now() - t0) / 1000)} s`);
        return j.elements;
      } catch (e) { console.log(`  ${host}: ${e.message} (${Math.round((Date.now() - t0) / 1000)} s)`); }
      await sleep(5000);
    }
    await sleep(30000);
  }
  return null;
}

const want = process.argv.slice(2);
const out = path.join(dir, 'osm');
fs.mkdirSync(out, { recursive: true });
let failed = 0;
for (const area of OSM_AREAS) {
  if (want.length && !want.includes(area[0])) continue;
  console.log(`${area[0]} · ${area[1]}`);
  const els = await fetchArea(area);
  if (!els) { failed++; console.log('  FAILED, keeping the previous file if any'); continue; }
  const seen = new Set(), items = [];
  for (const el of els) { const row = osmRow(el); if (row && !seen.has(row[0])) { seen.add(row[0]); items.push(row); } }
  items.sort((a, b) => a[0] < b[0] ? -1 : 1);   // stable order, so unchanged data gives an unchanged file
  const file = path.join(out, area[0] + '.json');
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (old && JSON.stringify(old.items) === JSON.stringify(items)) { console.log(`  ${items.length} places, unchanged`); continue; }
  fs.writeFileSync(file, JSON.stringify({ at: Date.now(), area: area[0], name: area[1], source: 'OpenStreetMap contributors (ODbL)', items }) + '\n');
  console.log(`  ${items.length} places, ${Math.round(fs.statSync(file).size / 1024)} KB → osm/${area[0]}.json`);
  // in the GitHub Action, publish each region as soon as it's done, so one slow region doesn't hold up (or lose) the rest
  if (process.env.OSM_COMMIT) {
    const sh = c => execSync(c, { stdio: 'inherit', cwd: path.dirname(dir) });
    sh(`git add egypt/osm/${area[0]}.json`);
    sh(`git commit -q -m "Egypt planner: update OpenStreetMap data for ${area[1]}"`);
    for (let i = 0; i < 3; i++) { try { sh('git pull -q --rebase origin main && git push -q origin HEAD:main'); break; } catch (e) { await sleep(5000); } }
  }
  await sleep(10000);   // be gentle with the public servers
}
if (failed) { console.log(`${failed} region(s) failed`); process.exitCode = failed === OSM_AREAS.length ? 1 : 0; }
