'use strict';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
// a trip's dates and progress: from your saved plan if there is one, otherwise from its sample data
async function summary(d) {
  let st = null, mine = false;
  try { const s = JSON.parse(localStorage.getItem(d.copyKeys[Object.keys(d.copyKeys)[0]]) || 'null'); if (s && s.state) { st = s.state; mine = true; } } catch (e) { }
  if (!st) try { st = await (await fetch(d.id + '/data.json')).json(); } catch (e) { }
  if (!st || !st.trip) return '';
  if (st.trip.from === 'auto') return 'Sample trip · tap to set your dates';
  const free = (st.days || []).filter(x => x.state !== 'booked').length;
  const active = (st.blocks || []).map(b => (st.options || []).find(o => o.id === b.active)).filter(Boolean);
  const planned = new Set(active.flatMap(o => Object.entries(o.days || {}).filter(([, p]) => p.stops && p.stops.length).map(([k]) => k))).size;
  return `${fmt(st.trip.from)} – ${fmt(st.trip.to)}${free ? ` · ${planned} of ${free} free days planned` : ''}${mine ? '' : ' <span class="chip">sample</span>'}`;
}
(async () => {
  let list = [];
  try { list = (await (await fetch('trips.json', { cache: 'no-cache' })).json()).destinations; } catch (e) { document.getElementById('list').innerHTML = '<p class="sub">Could not load the trip list (offline before it was ever opened?).</p>'; return; }
  const rows = await Promise.all(list.map(async d => `<a class="trip" href="${esc(d.id)}/" style="--c:${esc(d.color)}">
      <span class="flag">${esc(d.flag)}</span>
      <span class="t"><b>${esc(d.name)}</b><div class="dates">${await summary(d)}</div><div class="blurb">${esc(d.blurb)}</div></span>
      <span class="go">›</span></a>`));
  document.getElementById('list').innerHTML = rows.join('');
})();
const standalone = matchMedia('(display-mode: standalone)').matches;
document.getElementById('install').innerHTML = standalone ? 'Tip: long-press the Trips icon on your home screen to jump straight to a trip.'
  : 'Install: Chrome menu ⋮ → <b>Add to home screen</b>. One app holds every trip; long-press its icon for shortcuts.';
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
