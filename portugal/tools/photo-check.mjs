// Checks every custom place photo (the "photo" field in data.json) the way a phone would load it: a plain image
// request with no referrer, and with this site as the referrer (some sites block "hotlinking" from other sites).
// Run by .github/workflows/photo-check.yml; locally: node portugal/tools/photo-check.mjs
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(new URL('../data.json', import.meta.url)));
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
let bad = 0;
for (const p of data.places.filter(p => p.photo)) {
  const out = [];
  for (const [label, referer] of [['no referrer', null], ['from our site', 'https://rujopereiric.github.io/']]) {
    try {
      const res = await fetch(p.photo, { headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8', ...(referer ? { Referer: referer } : {}) }, redirect: 'follow' });
      const buf = await res.arrayBuffer();
      const type = res.headers.get('content-type') || '?';
      const ok = res.ok && type.startsWith('image/');
      if (!ok) bad++;
      out.push(`${label}: ${res.status} ${type} ${Math.round(buf.byteLength / 1024)} KB${res.headers.get('access-control-allow-origin') ? ' CORS' : ''}${ok ? '' : '  <-- FAILS'}`);
    } catch (e) { bad++; out.push(`${label}: ERROR ${e.message}  <-- FAILS`); }
  }
  console.log(`${p.id}\n  ${p.photo}\n  ${out.join('\n  ')}`);
}
console.log(bad ? `${bad} failing request(s)` : 'all photos load');
