// Times each statement of the app's Overpass query on its own, per region, to find what makes a region slow.
// Run by the "Diagnose" option of .github/workflows/osm-ireland.yml; locally: node ireland/tools/osm-diagnose.mjs lisbon algarve
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const m = /\/\* osm-shared-start[^\n]*\n([\s\S]*?)\/\* osm-shared-end \*\//.exec(app);
const ctx = {};
vm.runInNewContext(m[1] + '\nthis.OSM_AREAS = OSM_AREAS; this.osmQuery = osmQuery;', ctx);
const { OSM_AREAS, osmQuery } = ctx;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SERVER = 'https://overpass-api.de/api/interpreter';

for (const id of process.argv.slice(2)) {
  const area = OSM_AREAS.find(a => a[0] === id); if (!area) continue;
  const q = osmQuery(area, 45), lines = q.split('\n');
  const head = lines[0].replace(/\($/, ''), stmts = lines.slice(1, -1);
  console.log(`\n${id} · ${area[1]} · bbox ${area.slice(2).join(',')}`);
  for (const st of stmts) {
    const t0 = Date.now(); let res;
    try {
      const r = await fetch(SERVER, { method: 'POST', body: 'data=' + encodeURIComponent(`${head}${st}out center tags qt;`),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'travel-plans diagnostics' }, signal: AbortSignal.timeout(60000) });
      if (!r.ok) res = 'HTTP ' + r.status;
      else { const j = await r.json(); res = j.remark && /error|timed out/i.test(j.remark) ? 'TIMEOUT ' + j.remark.slice(0, 60) : `${j.elements.length} elements`; }
    } catch (e) { res = 'FAIL ' + e.message; }
    console.log(`  ${String(Math.round((Date.now() - t0) / 1000)).padStart(3)} s  ${res.padEnd(40)} ${st}`);
    await sleep(4000);
  }
}
