// Stores our own place photos (E29.eu albums) inside the app, as portugal/img/<place id>.jpg, so they load from
// the app itself (works offline, no dependence on another server). Other sites' photos stay linked, not copied.
// Run by .github/workflows/photo-fetch.yml (it commits the files); afterwards run portugal/tools/via_ferrata.py.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));   // portugal/
const research = JSON.parse(fs.readFileSync(path.join(dir, 'parts', 'via_ferrata_research.json'), 'utf8'));
fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
let n = 0;
for (const r of research) {
  if (!r.photo || !/(^|\.)e29\.eu$/.test(new URL(r.photo).hostname)) continue;
  const res = await fetch(r.photo);
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('image/jpeg')) { console.log(`${r.id}: ${res.status} ${type}, skipped`); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(dir, 'img', r.id + '.jpg'), buf);
  console.log(`${r.id}: ${Math.round(buf.length / 1024)} KB`); n++;
}
console.log(`${n} photos stored`);
