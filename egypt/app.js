'use strict';
/* Egypt trip planner — vanilla JS, no build step.
   All times are minutes after midnight, Egypt local time (Africa/Cairo: UTC+2, UTC+3 in summer DST). */

const LS_STATE = 'egypt-planner-v1';
const LS_UI = 'egypt-planner-ui';
// Bump on every change. The app compares it with the app.js on the server, so a phone that kept an old tab open
// (no reload, so still the old code) is told a newer version exists.
const APP_BUILD = '2026-10-03.10';
let NEWER = null; // the newer build found on the server, if any
const AX0 = 5 * 60, AX1 = 23 * 60;           // timeline axis 05:00–23:00
const DEFAULT_SETTINGS = {
  speedKmh: 80, roadFactor: 1.3, trafficBufferPct: 15, roadEgpPerKm: 12,
  eurEgp: 57, maxSeeH: 8.5, slackMin: 30, darkDriveMin: 30, earliestDepart: '07:00', localSun: true, maxDriveH: 6, nightEgp: 2500, fxMarkupPct: 0, fxWeekendPct: 1, fxManual: null,
  useFlight: true, useFerry: true, useTrain: true
};

let S = null;            // the plan (same shape as data.json)
let BASE_HASH = null;    // hash of the data.json the local copy derives from
let DIRTY = false;       // local edits since BASE_HASH
let PENDING = null;      // newer data.json found while local edits exist
let LOAD_ERROR = null;
let UI = { tab: 'plan', open: {}, mapDay: null, cmpBlock: null, theme: 'auto' };

/* ---------- small utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const toMin = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const hhmm = m => { if (m == null || !isFinite(m)) return '–'; m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const dur = m => { m = Math.round(Math.max(0, m)); const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h${r ? ' ' + String(r).padStart(2, '0') + 'm' : ''}` : `${r}m`; };
const egp = n => (Math.round(n || 0)).toLocaleString('en-GB') + ' EGP';
const toEur = n => (n || 0) / rate();
const fmtEur = (v, dp) => '€' + (Math.round(v * 100) === 0 ? '0' : v.toLocaleString('en-GB', { minimumFractionDigits: dp ?? (Math.abs(v) < 100 ? 2 : 0), maximumFractionDigits: dp ?? (Math.abs(v) < 100 ? 2 : 0) }));
const eur = n => '≈ ' + fmtEur(toEur(n));
const money = n => `${egp(n)} <span class="eur">· ${fmtEur(toEur(n))}</span>`;
// append € to any "1234 EGP" / "3,400 EGP" / "500 LE" in free text (already escaped)
const withEur = html => html.replace(/(~?\d[\d,.]*)\s?(EGP|LE)\b/g, (m, num) => { const v = +num.replace(/[~,]/g, ''); return isFinite(v) && v > 0 ? `${m} <span class="eur">(${fmtEur(toEur(v))})</span>` : m; });
const dateLabel = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
// Egypt's clock: the browser's time-zone database knows the DST rules (since 2023: last Friday of April
// to last Thursday of October), so we never hard-code the offset
const TZ = () => (S && S.trip && S.trip.tz) || 'Africa/Cairo';
function tzParts(d) {
  try {
    const p = {}; for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: TZ(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d)) p[x.type] = x.value;
    return { iso: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
  } catch (e) { return { iso: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; }
}
const TZ_CACHE = new Map();
function tzOff(date) { // minutes ahead of UTC on that date (at noon)
  const k = TZ() + date;
  if (!TZ_CACHE.has(k)) { const d = new Date(date + 'T12:00:00Z'), p = tzParts(d); TZ_CACHE.set(k, (Date.parse(p.iso + 'T00:00:00Z') + p.min * 60000 - d.getTime()) / 60000); }
  return TZ_CACHE.get(k);
}
const utcLabel = date => { const o = tzOff(date); return 'UTC' + (o >= 0 ? '+' : '−') + Math.abs(o / 60); };
const todayISO = () => tzParts(new Date()).iso;
const nowMin = () => tzParts(new Date()).min;
const weekday = date => new Date(date + 'T12:00:00Z').getUTCDay(); // 0 = Sunday
const DOW = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const set = k => (S && S.settings && S.settings[k] != null) ? S.settings[k] : DEFAULT_SETTINGS[k];
const uid = p => p + Math.random().toString(36).slice(2, 8);
function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }

/* ---------- sun (NOAA solar position algorithm) ---------- */
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const SUN_CACHE = new Map();
function sunTimes(date, lat, lon) {
  const key = date + lat.toFixed(3) + lon.toFixed(3);
  if (SUN_CACHE.has(key)) return SUN_CACHE.get(key);
  const [y, mo, d] = date.split('-').map(Number);
  // iterate once: evaluate solar position near each event rather than at noon
  const calc = (utcMin) => {
    const jd = Date.UTC(y, mo - 1, d) / 86400000 + 2440587.5 + utcMin / 1440;
    const t = (jd - 2451545) / 36525;
    const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
    const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    const C = Math.sin(rad(M)) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * t) + Math.sin(rad(3 * M)) * 0.000289;
    const om = 125.04 - 1934.136 * t;
    const lam = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(om));
    const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    const eps = eps0 + 0.00256 * Math.cos(rad(om));
    const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lam)));
    const yy = Math.tan(rad(eps / 2)) ** 2;
    const eot = 4 * deg(yy * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * yy * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
      - 0.5 * yy * yy * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
    return { decl, eot };
  };
  const event = (zenith, sign) => {
    let m = 720 - 4 * lon;
    for (let i = 0; i < 2; i++) {
      const { decl, eot } = calc(m);
      const cosH = Math.cos(rad(zenith)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
      if (cosH > 1 || cosH < -1) return null;
      m = 720 - 4 * lon - eot + sign * 4 * deg(Math.acos(cosH));
    }
    return m;
  };
  const off = tzOff(date), loc = m => m == null ? null : m + off; // UTC → Egypt local minutes
  const r = { rise: loc(event(90.833, -1)), set: loc(event(90.833, 1)), dawn: loc(event(96, -1)), dusk: loc(event(96, 1)) };
  r.len = r.set - r.rise;
  SUN_CACHE.set(key, r);
  return r;
}
const sunHome = date => sunTimes(date, S.trip.sunLat, S.trip.sunLon);
function sunAt(date, pid) {
  const p = place(pid);
  return set('localSun') && p ? sunTimes(date, p.lat, p.lon) : sunHome(date);
}

/* ---------- data access ---------- */
let PLACE_IDX = {};
const place = id => PLACE_IDX[id];
const placeName = id => id === '_break' ? 'Break' : (place(id)?.name || id || '—');
const region = id => S.regions.find(r => r.id === id) || { name: id || 'Other', color: '#888' };
const dayObj = date => S.days.find(d => d.date === date);
const blockOf = date => S.blocks.find(b => date >= b.from && date <= b.to);
const optById = id => S.options.find(o => o.id === id);
const optsOf = bid => S.options.filter(o => o.block === bid);
const activeOpt = b => b ? (optById(b.active) || optsOf(b.id)[0] || null) : null;
const blockDates = b => S.days.map(d => d.date).filter(d => d >= b.from && d <= b.to).sort();
function planOf(opt, date, create) {
  if (!opt) return null;
  if (!opt.days[date] && create) opt.days[date] = { stops: [], sleep: null };
  return opt.days[date] || null;
}
function startLoc(opt, date) {
  const b = blockOf(date); if (!b) return S.trip.home;
  const ds = blockDates(b), i = ds.indexOf(date);
  if (i > 0) { const p = opt.days[ds[i - 1]]; if (p && p.sleep) return p.sleep; }
  return S.trip.home;
}
const endLoc = (opt, date) => (opt.days[date] && opt.days[date].sleep) || S.trip.home;
function freeWin(d) {
  if (!d || d.state === 'booked') return null;
  if (d.state === 'partial') { const t = toMin(d.time) ?? 720; return d.mode === 'from' ? [t, 1440] : [0, t]; }
  return [0, 1440];
}
// opening hours "HH:MM-HH:MM" → [open, close] in minutes; a close before the open runs past midnight
const hoursOf = id => { const h = place(id)?.hours; if (!h) return null; const [a, b] = h.split('-').map(toMin); return [a, b <= a ? b + 1440 : b]; };
const maxDriveOf = d => Math.round(((d && d.maxDriveH != null && d.maxDriveH !== '') ? +d.maxDriveH : +set('maxDriveH')) * 60);
function stateText(d) {
  if (d.state === 'booked') return 'Booked';
  if (d.state === 'partial') return (d.mode === 'from' ? 'Free from ' : 'Free until ') + (d.time || '?');
  return 'Free';
}

/* ---------- travel: road, plus flights, ferries and trains between regions ---------- */
// S.drives entries: [from, to, km, minutes, mode?, fareEgp?], valid in both directions. mode is 'road' (default),
// 'flight', 'ferry' or 'train'. Flight/ferry/train minutes are door to door (getting to the airport or port, check-in,
// waiting, the trip itself), so they are used as given; road minutes get the traffic buffer.
const MODE_ICON = { road: '🚗', flight: '✈️', ferry: '⛴️', train: '🚆' };
const MODE_NAME = { road: 'drive', flight: 'flight', ferry: 'ferry', train: 'train' };
const modeOn = m => m === 'road' || set('use' + m[0].toUpperCase() + m.slice(1)) !== false;
const legsList = () => (S.drives || []).map(([a, b, km, min, mode = 'road', fare = 0]) => ({ a, b, km, min, mode, fare }));
function haversine(a, b) {
  const R = 6371, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const DRIVE_CACHE = new Map(), ROAD_CACHE = new Map();
function clearTravel() { DRIVE_CACHE.clear(); ROAD_CACHE.clear(); GRAPH = null; GRAPH_DIST.clear(); TRANSIT_DIST.clear(); }
const NO_MOVE = { km: 0, min: 0, est: false, mode: 'road', fare: 0, roadKm: 0 };
function drive(a, b) {
  if (!a || !b || a === b) return NO_MOVE;
  const key = a + '|' + b;
  if (!DRIVE_CACHE.has(key)) DRIVE_CACHE.set(key, driveRaw(a, b));
  return DRIVE_CACHE.get(key);
}
// Road fallback when there's no OSRM data: shortest path over the known road legs, with other places attached to
// their nearest known place, plus short hops. A straight line would cross the Gulf of Suez (Hurghada → Sharm is ~100 km as the crow
// flies, ~900 km by road round through the Suez tunnel), so long estimates have to follow known roads.
let GRAPH = null; const GRAPH_DIST = new Map();
function graphLeg(a, b) {
  if (!GRAPH) {
    GRAPH = new Map(S.places.map(p => [p.id, []]));
    const add = (x, y, km, min) => { if (GRAPH.has(x) && GRAPH.has(y)) { GRAPH.get(x).push([y, km, min]); GRAPH.get(y).push([x, km, min]); } };
    for (const x of legsList()) if (x.mode === 'road') add(x.a, x.b, x.km, x.min);
    // places on known road legs ("hubs") connect only through those legs; any other place hangs off its nearest hub
    // (straight hops between hubs could cross the Gulf of Suez, or the Nile where there's no bridge)
    const hubs = S.places.filter(p => GRAPH.get(p.id).length);
    for (const p of S.places) {
      if (GRAPH.get(p.id).length || !hubs.length) continue;
      let near = null, nd = Infinity;
      for (const h of hubs) { const hv = haversine(p, h); if (hv < nd) { nd = hv; near = h; } }
      const km = nd * set('roadFactor'); add(p.id, near.id, km, km / set('speedKmh') * 60);
    }
    // plus short straight hops (≤ 30 km) inside a city or a cluster of sites, e.g. Giza → Saqqara. The Gulf of Suez is
    // far wider than that, so these never jump the sea.
    for (let i = 0; i < S.places.length; i++) for (let j = i + 1; j < S.places.length; j++) {
      const pa = S.places[i], pb = S.places[j], hv = haversine(pa, pb);
      if (hv <= 30) { const km = hv * set('roadFactor'); add(pa.id, pb.id, km, km / set('speedKmh') * 60); }
    }
  }
  if (!GRAPH_DIST.has(a)) { // Dijkstra from a (small graph, so a simple array scan is fine)
    const dist = new Map([[a, { min: 0, km: 0 }]]), done = new Set();
    while (true) {
      let u = null, best = Infinity;
      for (const [k, v] of dist) if (!done.has(k) && v.min < best) { best = v.min; u = k; }
      if (u == null) break;
      done.add(u);
      for (const [v, km, min] of GRAPH.get(u) || []) {
        const nd = best + min;
        if (!dist.has(v) || nd < dist.get(v).min) dist.set(v, { min: nd, km: dist.get(u).km + km });
      }
    }
    GRAPH_DIST.set(a, dist);
  }
  return GRAPH_DIST.get(a).get(b) || null;
}
// road only: hand-made road leg → OSRM road matrix → known-roads graph → straight line
function roadRaw(a, b) {
  if (a === b) return { km: 0, min: 0, est: false };
  const k = a + '|' + b;
  if (ROAD_CACHE.has(k)) return ROAD_CACHE.get(k);
  const ov = legsList().find(x => x.mode === 'road' && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
  let km, min, est = false;
  if (ov) { km = ov.km; min = ov.min; }
  else if (roadLeg(a, b)) ({ km, min } = roadLeg(a, b));
  else if (graphLeg(a, b)) { ({ km, min } = graphLeg(a, b)); est = true; }
  else {
    const pa = place(a), pb = place(b);
    if (!pa || !pb) return { km: 0, min: 0, est: true };
    km = haversine(pa, pb) * set('roadFactor'); min = km / set('speedKmh') * 60; est = true;
  }
  const r = { km: Math.round(km), min: Math.round(min * (1 + set('trafficBufferPct') / 100)), est };
  ROAD_CACHE.set(k, r);
  return r;
}
// Fastest way using at least one flight/ferry/train: Dijkstra from a over the transit hubs (any two linked by road,
// plus the transit legs), then the last stretch by road. E.g. Karnak → Luxor (road) → Cairo (flight) → Giza (road).
const TRANSIT_DIST = new Map();
const transitLegs = () => legsList().filter(x => x.mode !== 'road' && modeOn(x.mode) && place(x.a) && place(x.b));
function transitLeg(a, b) {
  const T = transitLegs(); if (!T.length) return null;
  if (!TRANSIT_DIST.has(a)) {
    const nodes = [...new Set([a, ...T.flatMap(x => [x.a, x.b])])];
    const dist = new Map([[a, { min: 0, km: 0, fare: 0, est: false, transit: false, segs: [] }]]), done = new Set();
    while (true) {
      let u = null, best = Infinity;
      for (const [k, v] of dist) if (!done.has(k) && v.min < best) { best = v.min; u = k; }
      if (u == null) break;
      done.add(u);
      const du = dist.get(u);
      const relax = (v, leg, mode, fare) => {
        const nd = du.min + leg.min;
        if (!dist.has(v) || nd < dist.get(v).min) dist.set(v, { min: nd, km: du.km + leg.km, fare: du.fare + fare, est: du.est || !!leg.est,
          transit: du.transit || mode !== 'road', segs: [...du.segs, { from: u, to: v, mode, min: leg.min, km: leg.km, fare, est: !!leg.est }] });
      };
      for (const v of nodes) if (v !== u) relax(v, roadRaw(u, v), 'road', 0);
      for (const x of T) { if (x.a === u) relax(x.b, x, x.mode, x.fare); else if (x.b === u) relax(x.a, x, x.mode, x.fare); }
    }
    TRANSIT_DIST.set(a, dist);
  }
  let best = null;
  for (const [h, v] of TRANSIT_DIST.get(a)) {
    if (!v.transit) continue;
    const last = roadRaw(h, b), min = v.min + last.min;
    if (!best || min < best.min) best = { ...v, min, km: v.km + last.km, est: v.est || last.est,
      segs: h === b ? v.segs : [...v.segs, { from: h, to: b, mode: 'road', min: last.min, km: last.km, fare: 0, est: last.est }] };
  }
  return best;
}
function driveRaw(a, b) {
  const r = roadRaw(a, b), t = transitLeg(a, b);
  if (t && t.min < r.min) {
    const segs = t.segs.filter(x => x.min || x.km);
    return { km: Math.round(t.km), min: Math.round(t.min), est: t.est, mode: segs.find(x => x.mode !== 'road').mode, segs, fare: t.fare,
      roadKm: Math.round(segs.filter(x => x.mode === 'road').reduce((s, x) => s + x.km, 0)) };
  }
  return { ...r, mode: 'road', fare: 0, roadKm: r.km };
}
const legText = leg => leg.segs ? leg.segs.map(x => `${MODE_ICON[x.mode]} ${placeName(x.from)} → ${placeName(x.to)} ${dur(x.min)}`).join(' · ') : '';

/* ---------- road network (OSRM, free public server, no key) ---------- */
// One "table" request gives road time + distance between every pair of places; used for any leg
// not in the hand-made "drives" list. Day routes are fetched for the map shape. Both are cached offline.
const OSRM = 'https://router.project-osrm.org';
const LS_ROAD = 'egypt-roads', LS_ROUTES = 'egypt-routes';
let ROAD = null, ROUTES = {}, ROAD_BUSY = false;
try { ROAD = JSON.parse(localStorage.getItem(LS_ROAD) || 'null'); ROUTES = JSON.parse(localStorage.getItem(LS_ROUTES) || '{}'); } catch (e) { }
const coordStr = ids => ids.map(id => `${place(id).lon.toFixed(5)},${place(id).lat.toFixed(5)}`).join(';');
const placesKey = () => hash(S.places.map(p => p.id + p.lat + p.lon).join('|'));
function roadLeg(a, b) {
  if (!ROAD) return null;
  const i = ROAD.ids.indexOf(a), j = ROAD.ids.indexOf(b);
  if (i < 0 || j < 0) return null;
  const d = ROAD.dur[i][j], m = ROAD.dist[i][j];
  return d != null && m != null ? { km: m / 1000, min: d / 60 } : null;
}
// The public server only takes ~100 coordinates per table request, so ask in chunks of 50 × 50
// (≤ 100 coordinates each), one request per second; missing pairs fall back to the road-graph estimate.
async function fetchRoadMatrix() {
  if (!S || ROAD_BUSY || !navigator.onLine) return;
  const key = placesKey();
  if (ROAD && ROAD.key === key) return;
  ROAD_BUSY = true;
  const ids = S.places.map(p => p.id), n = ids.length, C = 50;
  const dur = ids.map(() => new Array(n).fill(null)), dist = ids.map(() => new Array(n).fill(null));
  if (ROAD) { // keep what we already know, so adding a place only fetches its rows and columns
    const oi = new Map(ROAD.ids.map((id, k) => [id, k]));
    ids.forEach((a, r) => { const ra = oi.get(a); if (ra == null) return; ids.forEach((b, c) => { const cb = oi.get(b); if (cb != null) { dur[r][c] = ROAD.dur[ra][cb]; dist[r][c] = ROAD.dist[ra][cb]; } }); });
  }
  const chunks = []; for (let i = 0; i < n; i += C) chunks.push(ids.slice(i, i + C).map((_, k) => i + k));
  let ok = 0;
  let need = 0;
  for (const A of chunks) for (const B of chunks) {
    if (A.every(g => B.every(h => dur[g][h] != null || g === h))) { ok++; continue; } // block already known
    need++;
    const all = [...new Set([...A, ...B])], idx = new Map(all.map((g, k) => [g, k]));
    try {
      const res = await fetch(`${OSRM}/table/v1/driving/${coordStr(all.map(g => ids[g]))}?annotations=duration,distance&sources=${A.map(g => idx.get(g)).join(';')}&destinations=${B.map(g => idx.get(g)).join(';')}`);
      const j = await res.json();
      if (j.code !== 'Ok') throw new Error(j.code);
      A.forEach((g, r) => B.forEach((h, c) => { dur[g][h] = j.durations[r][c]; dist[g][h] = j.distances[r][c]; }));
      ok++;
    } catch (e) { console.warn('road matrix chunk', e); }
    await new Promise(r => setTimeout(r, 1100));
  }
  if (ok) {
    ROAD = { key: ok === chunks.length ** 2 ? key : 'partial', ids, dur, dist, at: Date.now() };
    try { localStorage.setItem(LS_ROAD, JSON.stringify(ROAD)); } catch (e) { }
    clearTravel(); render();
  }
  ROAD_BUSY = false;
}
const ROUTE_BUSY = new Set();
let ROUTE_Q = Promise.resolve();
function fetchRoute(ids) {
  const k = ids.join('>');
  if (ROUTES[k] || ROUTE_BUSY.has(k) || !navigator.onLine) return;
  ROUTE_BUSY.add(k);
  // one request at a time, ~1 s apart: the public OSRM server allows about one request per second
  ROUTE_Q = ROUTE_Q.then(() => fetchRouteNow(ids, k)).then(() => new Promise(r => setTimeout(r, 1000)));
}
async function fetchRouteNow(ids, k) {
  try {
    const res = await fetch(`${OSRM}/route/v1/driving/${coordStr(ids)}?overview=simplified&geometries=geojson`);
    const j = await res.json();
    if (j.code !== 'Ok') throw new Error(j.code);
    ROUTES[k] = { pts: j.routes[0].geometry.coordinates.map(([lon, lat]) => [+lat.toFixed(5), +lon.toFixed(5)]), km: j.routes[0].distance / 1000 };
    const keys = Object.keys(ROUTES); if (keys.length > 120) delete ROUTES[keys[0]];
    try { localStorage.setItem(LS_ROUTES, JSON.stringify(ROUTES)); } catch (e) { }
    if (UI.tab === 'map') { drawRoute(); render(); }
  } catch (e) { console.warn('route', e); }
  ROUTE_BUSY.delete(k);
}

/* ---------- the fit check ---------- */
function overlapOutside(a, b, lo, hi) { // minutes of [a,b] outside [lo,hi]
  if (lo == null || hi == null) return b - a;
  return Math.max(0, Math.min(b, lo) - a) + Math.max(0, b - Math.max(a, hi));
}
const RANK = { none: 0, ok: 1, tight: 2, bad: 3 };
function simulate(date, opt) {
  const d = dayObj(date), sun = sunHome(date), free = freeWin(d);
  const r = { date, d, sun, free, usable: null, items: [], issues: [], status: d && d.state === 'booked' ? 'booked' : 'none',
    driveMin: 0, driveKm: 0, roadKm: 0, fare: 0, stopMin: 0, darkDrive: 0, darkEve: 0, need: 0 };
  if (free) { const u0 = Math.max(sun.rise, free[0]), u1 = Math.min(sun.set, free[1]); r.usable = u1 > u0 ? [u0, u1] : null; }
  if (!opt) return r;
  const plan = opt.days[date], stops = (plan && plan.stops) || [];
  const start = startLoc(opt, date), end = endLoc(opt, date);
  Object.assign(r, { start, end, plan });
  if (!stops.length && start === end) return r;
  const issue = (lvl, msg) => r.issues.push([lvl, msg]);
  if (!free) { issue('bad', 'This day is booked, but the plan has stops or a move to another place.'); r.status = 'bad'; return r; }

  // build sequence
  let loc = start;
  const seq = stops.map((s, i) => {
    const pid = s.place === '_break' ? loc : s.place;
    const leg = drive(loc, pid); loc = pid;
    const p = place(pid);
    const min = s.min != null ? +s.min : (s.place === '_break' ? 30 : (p?.visit ?? 45));
    return { s, i, pid, leg, min };
  });
  const back = drive(loc, end);

  // departure
  let dep;
  if (plan && plan.depart) dep = toMin(plan.depart);
  else {
    // aim to reach the first stop at (local) sunrise, or at opening time if it opens later, but not before the
    // earliest start or your free time. A first stop marked "early" (a balloon flight, the Mount Sinai night hike)
    // sets the start itself: you get there for its opening time, however early.
    let early = toMin(set('earliestDepart')) ?? 420;
    const h0 = seq.length && hoursOf(seq[0].pid);
    let ideal = seq.length ? sunAt(date, seq[0].pid).rise - seq[0].leg.min : early;
    if (h0) ideal = Math.max(ideal, h0[0] - seq[0].leg.min);
    if (h0 && place(seq[0].pid)?.early) { early = 0; ideal = h0[0] - seq[0].leg.min; }
    dep = Math.ceil(Math.max(free[0], ideal, early) / 5) * 5;
    dep = Math.round(dep / 5) * 5;
  }
  r.depart = dep;

  // walk the day
  let t = dep, firstArr = null, lastDep = null;
  const pushDrive = (from, to, leg) => {
    if (!leg.min && from === to) return;
    const it = { type: 'drive', from, to, start: t, end: t + leg.min, km: leg.km, min: leg.min, est: leg.est, mode: leg.mode, segs: leg.segs, fare: leg.fare || 0, dark: 0, darkEve: 0 };
    // 'dark' = road time outside civil twilight; evening dark driving is what we warn about (flights, ferries and
    // trains don't count)
    let t0 = t;
    for (const sg of leg.segs || [{ mode: 'road', min: leg.min }]) {
      if (sg.mode === 'road') { it.dark += overlapOutside(t0, t0 + sg.min, sun.dawn, sun.dusk); it.darkEve += Math.max(0, t0 + sg.min - Math.max(t0, sun.dusk)); }
      t0 += sg.min;
    }
    r.items.push(it); r.driveMin += leg.min; r.driveKm += leg.km; r.roadKm += leg.roadKm ?? leg.km; r.fare += it.fare; r.darkDrive += it.dark; r.darkEve += it.darkEve; t += leg.min;
  };
  let prev = start;
  for (const x of seq) {
    pushDrive(prev, x.pid, x.leg); prev = x.pid;
    const p = place(x.pid), ls = sunAt(date, x.pid);
    const it = { type: 'stop', idx: x.i, pid: x.pid, s: x.s, arr: t, dep: t + x.min, min: x.min, sun: ls, level: 'ok' };
    const daylight = x.s.place !== '_break' && x.min > 0 && !(p && p.needsDaylight === false);
    it.daylight = daylight;
    if (daylight) {
      const outCivil = overlapOutside(it.arr, it.dep, ls.dawn, ls.dusk), out = overlapOutside(it.arr, it.dep, ls.rise, ls.set);
      if (outCivil > 2) { it.level = 'bad'; issue('bad', `${placeName(x.pid)}: ${dur(outCivil)} in full darkness (light here ${hhmm(ls.rise)}–${hhmm(ls.set)}).`); }
      else if (out > 15) { it.level = 'bad'; issue('bad', `${placeName(x.pid)}: ${dur(out)} outside daylight (sunrise–sunset here ${hhmm(ls.rise)}–${hhmm(ls.set)}).`); }
      else if (out > 2) { it.level = 'tight'; issue('tight', `${placeName(x.pid)}: ${dur(out)} in twilight, just outside sunrise–sunset.`); }
      if (firstArr == null) firstArr = it.arr; lastDep = it.dep;
      r.need = (lastDep - firstArr);
    }
    // opening hours and closing days (temples, museums, monasteries)
    const hrs = x.s.place !== '_break' && x.min > 0 && hoursOf(x.pid);
    if (hrs) {
      const out = overlapOutside(it.arr, it.dep, hrs[0], hrs[1]);
      it.hours = hrs;
      if (out > 15) { it.level = 'bad'; issue('bad', `${placeName(x.pid)}: ${dur(out)} outside opening hours (${hhmm(hrs[0])}–${hhmm(hrs[1])}).`); }
      else if (out > 0) { if (it.level === 'ok') it.level = 'tight'; issue('tight', `${placeName(x.pid)}: ${dur(out)} past opening hours (${hhmm(hrs[0])}–${hhmm(hrs[1])}); last entry is usually earlier.`); }
    }
    if (p && (p.closed || []).includes(weekday(date))) { it.level = 'bad'; issue('bad', `${p.name} is closed on ${DOW[weekday(date)]}.`); }
    if (p && p.caution) issue('info', `${p.name}: ${p.caution}`);
    r.items.push(it); r.stopMin += x.min; t += x.min;
  }
  pushDrive(prev, end, back);
  r.arrive = t;

  // cutoffs
  if (dep < free[0]) issue('bad', `Leaves at ${hhmm(dep)}, but you're only free from ${hhmm(free[0])}.`);
  if (t > free[1]) issue('bad', free[1] >= 1440 ? `Arrives at ${placeName(end)} after midnight.` :
    `Arrives at ${placeName(end)} at ${hhmm(t)} — ${dur(t - free[1])} after your ${hhmm(free[1])} cutoff.`);
  if (r.usable && r.need > r.usable[1] - r.usable[0]) issue('bad', `Sightseeing span is ${dur(r.need)}, but there are only ${dur(r.usable[1] - r.usable[0])} of usable daylight.`);
  if (!r.usable && seq.some(x => x.min > 0)) issue('bad', 'No daylight overlaps your free time on this day.');
  r.seeMin = seq.reduce((a, x) => a + (x.s.place === '_break' ? 0 : x.min), 0);
  if (r.seeMin > set('maxSeeH') * 60) issue('bad', `${dur(r.seeMin)} of sightseeing is over your ${dur(set('maxSeeH') * 60)} a day (Settings): too much for one day in the heat.`);
  r.maxDrive = maxDriveOf(d);
  if (r.driveMin > r.maxDrive) issue('bad', `${dur(r.driveMin)} of travel is over your ${dur(r.maxDrive)} limit for this day.`);

  // softer warnings
  if (r.darkEve > 0) {
    const tail = r.items.filter(i => i.type === 'drive' && i.darkEve > 0).pop();
    issue(r.darkEve > set('darkDriveMin') ? 'tight' : 'info', `${dur(r.darkEve)} on the road after dark — reach ${placeName(tail.to)} at ${hhmm(tail.end)}; sunset ${hhmm(sun.set)}, dark from ${hhmm(sun.dusk)}.${r.darkEve > set('darkDriveMin') ? ' Long-distance roads are best done in daylight (unlit, trucks, checkpoints).' : ''}`);
  }
  const morning = r.darkDrive - r.darkEve;
  if (morning > 0) issue('info', `${dur(morning)} of driving before first light (${hhmm(sun.dawn)}).`);
  const slackCut = free[1] < 1440 ? free[1] - t : Infinity;
  const lastDl = [...r.items].reverse().find(i => i.type === 'stop' && i.daylight);
  const slackSun = lastDl ? lastDl.sun.set - lastDl.dep : Infinity;
  const slack = Math.min(slackCut, slackSun);
  r.slack = slack;
  if (isFinite(slack) && slack >= 0 && slack < set('slackMin')) issue('tight', `Only ${dur(slack)} spare before ${slackCut <= slackSun ? 'your cutoff' : 'sunset'}.`);
  const noDrive = r.items.filter(i => i.type === 'drive' && i.est).length;
  if (noDrive) issue('info', `${noDrive} leg${noDrive > 1 ? 's' : ''} use an estimate along known roads or a straight line (×${set('roadFactor')} at ${set('speedKmh')} km/h)${navigator.onLine ? '' : ' — road distances load when you are online'}. Or add exact values to "drives" in data.json.`);
  for (const it of r.items) if (it.type === 'drive' && it.mode !== 'road') {
    const tr = it.segs.filter(x => x.mode !== 'road');
    issue('info', `${tr.map(x => `${MODE_ICON[x.mode]} ${placeName(x.from)} → ${placeName(x.to)}`).join(', ')}: book it and check the timetable — ${dur(it.min)} door to door is an estimate.`);
  }

  r.status = r.issues.reduce((s, [l]) => (RANK[l] || 0) > RANK[s] ? l : s, 'ok');
  return r;
}

/* ---------- suggestions & auto-fill ---------- */
const withStops = (opt, date, stops) => {
  const p = opt.days[date] || { stops: [], sleep: null };
  return { ...opt, days: { ...opt.days, [date]: { ...p, stops } } };
};
const pick = id => (S.picks || {})[id];
const prio = p => pick(p.id) === 'must' ? 10 : (p.priority ?? 2);
function suggestable(opt, date) {
  // skip places already on this option or on the selected plan of any other block (already seen on the trip)
  const used = new Set();
  const opts = [opt, ...S.blocks.map(activeOpt).filter(x => x && x.block !== opt.block)];
  for (const o of opts) for (const p of Object.values(o.days)) for (const st of p.stops || []) used.add(st.place);
  return S.places.filter(p => !used.has(p.id) && pick(p.id) !== 'skip' && (p.suggest !== false || pick(p.id) === 'must') && p.id !== S.trip.home && (p.visit ?? 45) > 0);
}
// Places that can be inserted into the day without making it "doesn't fit", each at its cheapest position.
function suggestFor(date, opt) {
  const base = simulate(date, opt);
  const out = { base, add: [], drop: [] };
  if (!opt || !base.free || !blockOf(date)) return out;
  const stops = (opt.days[date] && opt.days[date].stops) || [];
  if (base.status === 'bad') {
    stops.forEach((st, i) => {
      const r = simulate(date, withStops(opt, date, stops.filter((_, j) => j !== i)));
      if (r.status !== 'bad') out.drop.push({ i, place: st.place, r });
    });
    return out;
  }
  const lim = maxDriveOf(dayObj(date));
  for (const c of suggestable(opt, date)) {
    // cheap bound: if even a direct start → place → end trip breaks the driving limit, skip it
    if (drive(base.start, c.id).min + drive(c.id, base.end).min > lim) continue;
    let best = null;
    for (let pos = 0; pos <= stops.length; pos++) {
      const ns = [...stops.slice(0, pos), { place: c.id }, ...stops.slice(pos)];
      const r = simulate(date, withStops(opt, date, ns));
      if (r.status === 'bad') continue;
      const cand = { place: c.id, pos, r, extra: r.driveMin - base.driveMin, visit: c.visit ?? 45, status: r.status, hassle: hassle(r) - hassle(base) };
      if (!best || RANK[cand.status] < RANK[best.status] || (cand.status === best.status && cand.extra < best.extra)) best = cand;
    }
    if (best) out.add.push(best);
  }
  out.add.sort((a, b) => RANK[a.status] - RANK[b.status] || a.extra - b.extra);
  return out;
}
// Greedy: keep adding the highest-priority, cheapest-to-reach place while the day stays "fits".
// value of visiting a place: cubic in priority, so must-sees (10) and top sights (3) dominate and fillers (1) barely count
const placeValue = p => prio(p) ** 3;
// net gain of adding a suggested stop: its value minus the extra driving and the time it takes
// driving costs 1 point per hour and visit time 1 per 2 h: enough to choose between alternatives, while a good
// place is still worth a day trip; the daylight/driving limits already stop days getting too long
const DRIVE_COST = 1 / 60, VISIT_COST = 1 / 120;
// flights, ferries and trains cost more than their hours (booking, airports, money): a flat penalty per leg, so a
// plan flies to change region rather than for a single sight
const MODE_COST = { flight: 10, ferry: 6, train: 3 };
const hassle = r => r.items.reduce((a, it) => a + (it.segs || []).reduce((b, sg) => b + (MODE_COST[sg.mode] || 0), 0), 0);
const stopGain = x => placeValue(place(x.place)) - Math.max(0, x.extra) * DRIVE_COST - x.visit * VISIT_COST - (x.hassle || 0);
function autoFill(date, opt) {
  let added = 0;
  for (let n = 0; n < 10; n++) {
    // must-sees may make a day 'tight'; everything else has to keep it a clean fit, and be worth the detour
    const sg = suggestFor(date, opt).add.filter(x => (x.status === 'ok' || (x.status === 'tight' && pick(x.place) === 'must')) && stopGain(x) >= 1);
    if (!sg.length) {
      // nothing worthwhile left: give an otherwise empty day a filler or two rather than nothing
      const p = planOf(opt, date, false);
      if (p && p.stops.length) break;
      const fill = suggestFor(date, opt).add.filter(x => x.status === 'ok' && stopGain(x) > 0).sort((a, b) => stopGain(b) - stopGain(a));
      if (!fill.length) break;
      planOf(opt, date, true).stops.splice(fill[0].pos, 0, { place: fill[0].place }); added++;
      continue;
    }
    sg.sort((a, b) => stopGain(b) - stopGain(a));
    const top = sg[0], p = planOf(opt, date, true);
    p.stops.splice(top.pos, 0, { place: top.place });
    added++;
  }
  return added;
}

/* ---------- auto-plan a whole block ---------- */
// Tries every sequence of overnight stops (places with sleep:true, plus home), auto-fills each day in order,
// keeps the combination with the best score. The block's last night stays where the selected option ends it.
function sleepCandidates() {
  const flagged = S.places.filter(p => p.sleep).map(p => p.id);
  return [...new Set([S.trip.home, ...(flagged.length ? flagged : S.places.filter(p => p.needsDaylight === false && p.visit).map(p => p.id))])];
}
function scoreOption(opt, dates) {
  let score = 0, drive = 0;
  const seen = new Set();
  for (const date of dates) {
    const r = simulate(date, opt);
    if (r.status === 'bad') return null;
    for (const st of (opt.days[date]?.stops || [])) if (!seen.has(st.place) && place(st.place)) { seen.add(st.place); score += placeValue(place(st.place)) - (place(st.place).visit ?? 45) * VISIT_COST; }
    if (r.status === 'tight') score -= 15;
    drive += r.driveMin; score -= hassle(r);
  }
  // a cost per hotel change (packing, check-in), so the plan stays two or three nights in each base
  const nightsMoved = dates.slice(1).filter((d, i) => opt.days[d]?.sleep !== opt.days[dates[i]]?.sleep).length;
  return score - drive * DRIVE_COST - nightsMoved * 8;
}
// value of the best unvisited places reachable from a bed: full value next door, fading to 0 at a full day's drive
function potential(opt, bed, lim) {
  const seen = new Set(Object.values(opt.days).flatMap(p => p.stops.map(s => s.place)));
  for (const o of S.blocks.map(activeOpt)) if (o && o.block !== opt.block) for (const p of Object.values(o.days)) for (const st of p.stops) seen.add(st.place);
  const vals = S.places.filter(p => !seen.has(p.id) && p.suggest !== false && pick(p.id) !== 'skip' && (p.visit ?? 45) > 0 && p.id !== S.trip.home)
    .map(p => placeValue(p) * Math.max(0, 1 - drive(bed, p.id).min / lim)).sort((x, y) => y - x);
  return vals.slice(0, 8).reduce((a, v) => a + v, 0) * 0.6;
}
function autoPlan(bid) {
  const b = S.blocks.find(x => x.id === bid), dates = blockDates(b).filter(d => freeWin(dayObj(d)));
  if (!dates.length) return null;
  const cur = activeOpt(b), last = dates[dates.length - 1];
  const finalEnd = (cur && cur.days[last]?.sleep) || (last === S.trip.to && place(S.trip.end) ? S.trip.end : S.trip.home);
  const cands = sleepCandidates();
  // Beam search over overnight stops: build the plan day by day, auto-filling each day, and keep only the
  // BEAM best partial plans after each day (instead of fully planning every combination).
  const BEAM = dates.length > 10 ? 10 : 20;
  let beam = [{ opt: { id: '_auto', block: bid, name: '', note: '', days: {} }, prev: S.trip.home }], tried = 0;
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i], lim = maxDriveOf(dayObj(date)), lastLim = maxDriveOf(dayObj(last)), next = [];
    for (const st of beam) {
      const sleeps = i === dates.length - 1 ? [finalEnd] : cands.filter(c => drive(st.prev, c).min <= lim
        // the night before the last day must still let you reach the block's final stop in time
        && (i < dates.length - 2 || drive(c, finalEnd).min <= lastLim));
      for (const c of sleeps) {
        const opt = { ...st.opt, days: { ...st.opt.days, [date]: { stops: [], sleep: c } } };
        if (simulate(date, opt).status === 'bad') continue;
        autoFill(date, opt); tried++;
        const sc = scoreOption(opt, dates.slice(0, i + 1));
        if (sc == null) continue;
        // rank partial plans by what they've seen *plus* what is still within reach of tonight's bed,
        // so the search is willing to spend a day moving on to unvisited regions
        const rank = i === dates.length - 1 ? sc : sc + potential(opt, c, Math.min(lim, lastLim));
        next.push({ opt, prev: c, score: sc, rank });
      }
    }
    next.sort((x, y) => y.rank - x.rank);
    // keep the beam diverse: at most 4 partial plans ending in the same place
    const perBed = {};
    beam = next.filter(x => (perBed[x.prev] = (perBed[x.prev] || 0) + 1) <= 4).slice(0, BEAM);
    if (!beam.length) return null;
  }
  const best = beam.sort((x, y) => y.score - x.score)[0];
  if (!best) return null;
  let n = optsOf(bid).length + 1, id;
  do id = bid + (n++); while (optById(id));
  const o = best.opt;
  o.id = id;
  o.name = `Auto-plan (≤${set('maxDriveH')}h travel/day)`;
  const far = Object.values(o.days).flatMap(p => p.stops.map(s => s.place)).sort((x, y) => drive(S.trip.home, y).km - drive(S.trip.home, x).km)[0];
  o.note = `Generated ${new Date().toISOString().slice(0, 10)} from ${tried} overnight combinations.` + (far ? ` Furthest: ${placeName(far)}.` : '');
  const planned = new Set([o, ...S.blocks.map(activeOpt).filter(x => x && x.block !== bid)].flatMap(x => Object.values(x.days).flatMap(p => p.stops.map(s => s.place))));
  const missing = Object.keys(S.picks || {}).filter(id => S.picks[id] === 'must' && place(id) && !planned.has(id));
  if (missing.length) o.note += ` Must-sees not fitted: ${missing.map(placeName).join(', ')}.`;
  const empty = dates.filter(d => !o.days[d]?.stops?.length);
  if (empty.length) o.note += ` ${empty.length} day${empty.length > 1 ? 's' : ''} left free: nothing new worth the trip within ${set('maxDriveH')} h. Add more places, allow flights/ferries in Settings, or raise the travel limit.`;
  return { opt: o, tried, missing, empty: empty.length };
}

/* ---------- exchange rate ---------- */
// Card networks and Revolut convert at (close to) the mid-market rate on weekdays, so we fetch the mid-market rate
// from free no-key sources and apply your own markup on top. (The ECB doesn't publish EGP, so no Frankfurter here.)
const LS_FX = 'egypt-fx';
let FX = null; // { mid: EGP per EUR, src, date, at }
try { FX = JSON.parse(localStorage.getItem(LS_FX) || 'null'); } catch (e) { }
let FX_BUSY = false, FX_ERR = null;
const FX_SOURCES = [
  { name: 'ExchangeRate-API', url: 'https://open.er-api.com/v6/latest/EUR', parse: j => ({ mid: j.rates.EGP, date: new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10) }) },
  { name: 'fawazahmed0 currency-api', url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json', parse: j => ({ mid: j.eur.egp, date: j.date }) },
  { name: 'fawazahmed0 currency-api (mirror)', url: 'https://latest.currency-api.pages.dev/v1/currencies/eur.json', parse: j => ({ mid: j.eur.egp, date: j.date }) },
];
const isWeekend = (d = new Date()) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
const fxMarkup = () => +(isWeekend() ? set('fxWeekendPct') : set('fxMarkupPct')) || 0;
function rate() { // EGP you get per €1, after markup
  const man = +set('fxManual');
  if (man > 0) return man;
  if (FX && FX.mid > 0) return FX.mid / (1 + fxMarkup() / 100);
  return +set('eurEgp') || 57;
}
const rateSource = () => +set('fxManual') > 0 ? 'your manual rate' : FX && FX.mid ? FX.src : 'fallback rate from settings';
const rateLabel = () => `1 € = ${rate().toFixed(2)} EGP (${rateSource()})`;
async function fetchRate(force) {
  if (FX_BUSY || !navigator.onLine) return;
  if (!force && FX && Date.now() - FX.at < 60 * 60 * 1000) return;
  FX_BUSY = true; FX_ERR = null; if (UI.tab === 'fx') render();
  for (const src of FX_SOURCES) {
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 7000);
      const res = await fetch(src.url, { signal: ctl.signal, cache: 'no-store' }); clearTimeout(to);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { mid, date } = src.parse(await res.json());
      if (!(mid > 20 && mid < 300)) throw new Error('odd rate ' + mid);
      FX = { mid, src: src.name, date, at: Date.now() }; FX_ERR = null;
      try { localStorage.setItem(LS_FX, JSON.stringify(FX)); } catch (e) { }
      FX_BUSY = false; if (S) render(); return;
    } catch (e) { FX_ERR = `${src.name}: ${e.message}`; }
  }
  FX_BUSY = false; if (S) render();
}
const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
function renderFx() {
  const r = rate(), man = +set('fxManual') > 0;
  const stale = FX && Date.now() - FX.at > 24 * 3600 * 1000;
  const val = UI.fxEgp ?? 1000;
  const n = v => v.toLocaleString('en-GB');
  let h = `<div class="card fxrate"><div class="row"><div class="grow"><div class="fxbig tabular">1 € = ${r.toFixed(2)} EGP</div>
      <div class="small muted tabular">100 EGP = ${fmtEur(100 / r)} · 1,000 EGP = ${fmtEur(1000 / r)}</div></div>
      <button class="btn small" data-act="fxrefresh" ${FX_BUSY ? 'disabled' : ''}>${FX_BUSY ? 'Updating…' : 'Refresh'}</button></div>
    <div class="tiny muted" style="margin-top:6px">${man ? 'Using your manual rate.' : FX ? `Mid-market ${FX.mid.toFixed(2)} from ${esc(FX.src)} (rate date ${esc(FX.date || '?')}), fetched ${ago(FX.at)}${fxMarkup() ? ` · +${fxMarkup()}% ${isWeekend() ? 'weekend ' : ''}markup applied` : ''}.` : 'No live rate fetched yet — using the fallback from settings.'}
      ${stale && !man ? ' <b style="color:var(--warn)">Rate is over a day old.</b>' : ''}${FX_ERR && !FX_BUSY && !navigator.onLine ? '' : FX_ERR && !FX_BUSY ? `<br>Last attempt failed (${esc(FX_ERR)}).` : ''}${!navigator.onLine ? '<br>Offline — showing the last saved rate.' : ''}</div></div>
  <div class="card"><div class="fxconv">
    <label class="f">Egyptian pound (EGP, LE, ج.م)<input type="text" inputmode="decimal" id="fx-egp" data-fx="egp" value="${val}" autocomplete="off"></label>
    <div class="fxeq">=</div>
    <label class="f">Euro (EUR)<input type="text" inputmode="decimal" id="fx-eur" data-fx="eur" value="${(val / r).toFixed(2)}" autocomplete="off"></label>
  </div><div class="row" style="margin-top:8px;gap:6px">${[20, 50, 100, 200, 500, 1000].map(v => `<button class="btn small" data-act="fxset" data-v="${v}">${n(v)} EGP</button>`).join('')}</div></div>
  <div class="row" style="align-items:flex-start;gap:10px">
  <div class="card grow"><h3 style="margin-top:0">EGP → €</h3><table class="sun">${[5, 10, 20, 50, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000].map(v => `<tr><td>${n(v)} EGP</td><td style="text-align:right"><b>${fmtEur(v / r)}</b></td></tr>`).join('')}</table></div>
  <div class="card grow"><h3 style="margin-top:0">€ → EGP</h3><table class="sun">${[1, 2, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500].map(v => `<tr><td>€${v}</td><td style="text-align:right"><b>${n(Math.round(v * r))} EGP</b></td></tr>`).join('')}</table></div>
  </div>
  <h2>Cash and cards</h2><div class="card small">
    <ul class="facts" style="margin:0">
      <li>Notes are 5, 10, 20, 50, 100 and 200 pounds (plastic 10 and 20 notes exist alongside the paper ones). Prices are often written as LE or ج.م, with Arabic-Indic digits: ٠١٢٣٤٥٦٧٨٩ = 0123456789.</li>
      <li>Big sites' ticket offices are card-only now, so carry a card that works abroad. Taxis, small cafés, markets and tips need cash.</li>
      <li>Keep a stash of 10, 20 and 50 notes for tips (<i>baksheesh</i>): toilet attendants, guards who open a tomb, porters, boat crews. Change is often “unavailable”.</li>
      <li>Use bank ATMs (CIB, Banque Misr, National Bank of Egypt), and decline the ATM's own conversion: let your card convert.</li>
    </ul></div>
  <h2>Rate settings</h2><div class="card">
    <p class="small" style="margin-top:0">The app uses the mid-market rate (what Revolut and most card networks convert at on weekdays) and adds the markup you set below.
    To match your card or bank exactly, type the rate it shows into <b>Manual rate</b>. Leave that field empty to go back to the live rate.</p>
    <div class="row">
      <label class="f">Weekday markup %<input type="number" step="0.1" min="0" value="${esc(set('fxMarkupPct'))}" data-act="set" data-k="fxMarkupPct"></label>
      <label class="f">Weekend markup %<input type="number" step="0.1" min="0" value="${esc(set('fxWeekendPct'))}" data-act="set" data-k="fxWeekendPct"></label>
      <label class="f">Manual rate (EGP per €)<input type="number" step="0.01" min="0" value="${esc(set('fxManual') ?? '')}" placeholder="live" data-act="set" data-k="fxManual"></label>
    </div>
    <p class="tiny muted">Check your card's weekend and foreign-cash fees. Every € amount in the app uses this rate.</p>
  </div>`;
  return h;
}
function fxInput(el) {
  const r = rate(), raw = el.value.replace(/[\s,]/g, '').replace(/[^\d.]/g, ''), v = parseFloat(raw);
  if (el.dataset.fx === 'egp') { UI.fxEgp = isFinite(v) ? v : 0; $('#fx-eur').value = isFinite(v) ? (v / r).toFixed(2) : ''; }
  else { UI.fxEgp = isFinite(v) ? Math.round(v * r) : 0; $('#fx-egp').value = isFinite(v) ? Math.round(v * r) : ''; }
  saveUI();
}

/* ---------- trip dates & planning blocks ---------- */
// A planning block is a run of consecutive days that aren't fully booked. Blocks are recomputed whenever dates
// or day states change; existing blocks keep their id, options and selected plan where they overlap.
const DAY_MS = 864e5;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
const blockName = (id, from, to) => `Block ${id} · ${dateLabel(from, { day: 'numeric', month: 'short' })}${from !== to ? ' – ' + dateLabel(to, { day: 'numeric', month: 'short' }) : ''}`;
function freeRuns() {
  const runs = []; let cur = null, prev = null;
  for (const d of S.days) {
    const free = d.state !== 'booked', next = prev && addDays(prev, 1) === d.date;
    if (free && cur && next) cur.push(d.date); else if (free) runs.push(cur = [d.date]); else cur = null;
    prev = d.date;
  }
  return runs;
}
function newOptId(bid) { let n = optsOf(bid).length + 1, id; do id = bid + (n++); while (optById(id)); return id; }
const plannedDates = o => Object.entries(o.days).filter(([, p]) => (p.stops && p.stops.length) || p.sleep).map(([d]) => d);
function recomputeBlocks() {
  const old = S.blocks, runs = freeRuns();
  // 1. match old blocks to runs: prefer the run holding most of the block's *selected plan*, then plain overlap
  const pairs = [];
  runs.forEach((run, ri) => old.forEach(b => {
    const ov = run.filter(x => x >= b.from && x <= b.to), act = optById(b.active);
    const planned = act ? plannedDates(act).filter(x => ov.includes(x)).length : 0;
    if (ov.length) pairs.push({ ri, b, score: planned * 10 + ov.length });
  }));
  pairs.sort((x, y) => y.score - x.score);
  const ids = new Array(runs.length).fill(null), taken = new Set();
  for (const pr of pairs) if (!ids[pr.ri] && !taken.has(pr.b.id)) { ids[pr.ri] = pr.b.id; taken.add(pr.b.id); }
  // 2. every option belongs to the run that contains all of its planned days
  const home = o => { const pd = plannedDates(o); return pd.length ? runs.findIndex(r => pd.every(d => r.includes(d))) : -1; };
  // new runs reuse the letter of the options moving into them (B1, B2 → block B) when it's free
  runs.forEach((run, ri) => { // first pass: claim letters from moving options
    if (ids[ri]) return;
    const movers = S.options.filter(o => home(o) === ri);
    const pre = movers.length && movers.every(o => o.id[0] === movers[0].id[0]) ? movers[0].id[0] : null;
    if (pre && !ids.includes(pre)) ids[ri] = pre;
  });
  runs.forEach((run, ri) => { // second pass: any free letter
    if (!ids[ri]) ids[ri] = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(c => !ids.includes(c)) || 'X' + ri;
  });
  const out = runs.map((run, ri) => {
    const ob = old.find(b => b.id === ids[ri]), from = run[0], to = run[run.length - 1];
    const b = ob ? { ...ob } : { id: ids[ri], active: null };
    if (b.from !== from || b.to !== to || !b.name) { b.from = from; b.to = to; b.name = blockName(b.id, from, to); }
    return b;
  });
  const wasActive = new Set(old.map(b => b.active));
  for (const o of S.options) {
    const ri = home(o);
    if (ri >= 0) o.block = ids[ri];
    else if (!ids.includes(o.block)) { // spans runs or has no plans: keep it with the block covering its first day, if any
      const first = Object.keys(o.days).sort()[0], ri2 = first ? runs.findIndex(r => r.includes(first)) : -1;
      if (ri2 >= 0) o.block = ids[ri2];
    }
  }
  // 3. a new block with no options gets copies of the days other options had planned in it
  runs.forEach((run, ri) => {
    const b = out[ri];
    if (S.options.some(o => o.block === b.id)) return;
    for (const o of S.options.filter(o => plannedDates(o).some(d => run.includes(d)))) {
      const days = {}; for (const x of run) if (o.days[x]) days[x] = JSON.parse(JSON.stringify(o.days[x]));
      const nid = newOptId(b.id); S.options.push({ id: nid, block: b.id, name: o.name, note: `Copied from ${o.id}`, days });
      if (wasActive.has(o.id) && !b.active) b.active = nid;
    }
  });
  for (const b of out) {
    const mine = S.options.filter(o => o.block === b.id);
    if (!mine.some(o => o.id === b.active)) b.active = (mine.find(o => wasActive.has(o.id)) || mine[0])?.id || null;
  }
  S.blocks = out;
}
function setTripDates(from, to) {
  if (!from || !to || from > to) { alert('The arrival date must be on or before the departure date.'); return false; }
  const n = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
  if (n > 60) { alert('That is more than 60 days — check the dates.'); return false; }
  const dates = Array.from({ length: n }, (_, i) => addDays(from, i));
  const dropped = S.days.filter(d => !dates.includes(d.date));
  const planned = dropped.filter(d => S.options.some(o => o.days[d.date]?.stops?.length));
  if (planned.length && !confirm(`Remove ${planned.map(d => dateLabel(d.date)).join(', ')}? ${planned.length > 1 ? 'They have' : 'It has'} stops planned.`)) return false;
  S.days = dates.map(x => dayObj(x) || { date: x, state: 'free' });
  S.trip.from = from; S.trip.to = to;
  recomputeBlocks();
  return true;
}
function tripCard() {
  const n = S.days.length, booked = S.days.filter(d => d.state === 'booked').length;
  if (!UI.editTrip) return `<div class="card row small" style="margin-bottom:10px"><span class="grow"><b>${dateLabel(S.trip.from)} – ${dateLabel(S.trip.to)}</b> · ${n} days · ${n - booked} free or partly free · ${S.blocks.length} planning block${S.blocks.length === 1 ? '' : 's'}</span>
    <button class="btn small" data-act="mapgo" data-date="__all">Map</button><button class="btn small" data-act="tripedit">Change dates</button></div>`;
  return `<div class="card" style="margin-bottom:10px"><h3 style="margin-top:0">Trip dates</h3>
    <div class="row"><label class="f">Arrive<input type="date" id="trip-from" value="${S.trip.from}"></label>
      <label class="f">Leave<input type="date" id="trip-to" value="${S.trip.to}"></label></div>
    <p class="tiny muted">New days are added as fully free. To mark training or other busy days, open a day and set it to <b>Fully booked</b> (or partly free).
      Planning blocks follow the free days automatically; existing plans are kept when blocks grow, merge or split.</p>
    <div class="row"><button class="btn small primary" data-act="tripsave">Apply</button><button class="btn small" data-act="tripedit">Cancel</button></div></div>`;
}

/* ---------- persistence ---------- */
function normalize(s) {

  // "from": "auto" makes a sample trip starting about a month from today, so friends never see someone else's dates.
  if (s.trip && s.trip.from === 'auto') {
    const n = s.trip.autoDays || 7, start = Date.now() + 30 * 864e5, iso = t => new Date(t).toISOString().slice(0, 10);
    const dates = Array.from({ length: n }, (_, i) => iso(start + i * 864e5)), ends = s.trip.autoEnds || {};
    s.trip.from = dates[0]; s.trip.to = dates[n - 1];
    s.days = dates.map((date, i) => ({ date, state: 'free', ...(i === 0 ? ends.first : i === n - 1 ? ends.last : null) }));
    s.blocks = [{ id: 'A', name: 'Block A', from: dates[0], to: dates[n - 1], active: (s.options && s.options[0] && s.options[0].id) || null }];
    delete s.trip.autoDays; delete s.trip.autoEnds;
  }
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  for (const k of ['days', 'blocks', 'options', 'regions', 'places', 'drives', 'bookings', 'links', 'checklist']) if (!Array.isArray(s[k])) s[k] = [];
  s.checks = s.checks || {};
  s.picks = s.picks || {};
  s.days.sort((a, b) => a.date < b.date ? -1 : 1);
  for (const o of s.options) { o.days = o.days || {}; for (const p of Object.values(o.days)) p.stops = p.stops || []; }
  for (const b of s.bookings) if (!b.id) b.id = uid('b');
  return s;
}
function reindex() { PLACE_IDX = {}; for (const p of S.places) PLACE_IDX[p.id] = p; clearTravel(); }
function persist(dirty = true) {
  if (dirty) DIRTY = true;
  try { localStorage.setItem(LS_STATE, JSON.stringify({ state: S, base: BASE_HASH, dirty: DIRTY, saved: new Date().toISOString() })); }
  catch (e) { toast('Could not save to this browser — export to keep your edits'); }
}
function saveUI() { try { localStorage.setItem(LS_UI, JSON.stringify(UI)); } catch (e) { } }
function changed() { clearTravel(); persist(true); render(); fetchRoadMatrix(); }

async function fetchData() {
  const r = await fetch('data.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
async function boot() {
  try { Object.assign(UI, JSON.parse(localStorage.getItem(LS_UI) || '{}')); } catch (e) { }
  applyTheme();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS_STATE) || 'null'); } catch (e) { }
  let text = null;
  try { text = await fetchData(); } catch (e) { LOAD_ERROR = 'Could not load data.json (' + e.message + ').'; }
  let file = null;
  if (text) { try { file = JSON.parse(text); } catch (e) { LOAD_ERROR = 'data.json is not valid JSON: ' + e.message; } }
  const fh = text ? hash(text) : null;
  if (saved && saved.state) {
    S = saved.state; BASE_HASH = saved.base; DIRTY = !!saved.dirty;
    if (file && fh !== saved.base) {
      if (!DIRTY) { S = file; BASE_HASH = fh; } else { PENDING = { file, hash: fh }; mergePlaceInfo(S, file); }
    }
  } else if (file) { S = file; BASE_HASH = fh; }
  if (S) { S = normalize(S); reindex(); persist(DIRTY); }
  if (!UI.cmpBlock && S) UI.cmpBlock = S.blocks[0]?.id;
  if (S && !UI.mapDay) UI.mapDay = firstPlanDay();
  const t = todayISO();
  if (S && dayObj(t) && UI.lastAutoOpen !== t) { UI.open[t] = true; UI.lastAutoOpen = t; }
  render();
}
// Descriptive place fields aren't edited in the app, so newer data.json content can be merged into a locally edited plan
// without asking: new places, categories, summaries, photos titles, links, priorities and sleep flags.
const INFO_FIELDS = ['lat', 'lon', 'visit', 'sources', 'confidence', 'checked', 'cat', 'summary', 'facts', 'season', 'wiki', 'links', 'photo', 'caution', 'note', 'priority', 'sleep', 'suggest', 'needsDaylight', 'hours', 'closed', 'early'];
function mergePlaceInfo(local, file) {
  local.places = local.places || [];
  for (const fp of file.places || []) {
    const lp = local.places.find(p => p.id === fp.id);
    if (!lp) { local.places.push(fp); continue; }
    for (const k of INFO_FIELDS) if (fp[k] !== undefined) lp[k] = fp[k];
  }
  if (file.categories) local.categories = file.categories;
  for (const fr of file.regions || []) if (!(local.regions || []).some(r => r.id === fr.id)) (local.regions = local.regions || []).push(fr);
  // travel legs (road times, flights, ferries) are reference data too
  if (file.drives) local.drives = file.drives;
  for (const k of Object.keys(file.settings || {})) if (local.settings && local.settings[k] === undefined) local.settings[k] = file.settings[k];
}
const firstPlanDay = () => (S.days.find(d => d.date >= todayISO() && blockOf(d.date)) || S.days.find(d => blockOf(d.date)))?.date;

/* ---------- export / import ---------- */
function inline(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(inline).join(', ') + ']';
  return '{' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => JSON.stringify(k) + ': ' + inline(x)).join(', ') + '}';
}
function pretty(v, ind = 0) { // same layout as the hand-edited data.json: short things on one line
  const one = inline(v);
  if (v === null || typeof v !== 'object' || one.length + ind * 2 <= 110) return one;
  const pad = '  '.repeat(ind + 1), close = '  '.repeat(ind);
  if (Array.isArray(v)) return '[\n' + v.map(x => pad + pretty(x, ind + 1)).join(',\n') + '\n' + close + ']';
  return '{\n' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => pad + JSON.stringify(k) + ': ' + pretty(x, ind + 1)).join(',\n') + '\n' + close + '}';
}
function exportJSON() {
  const blob = new Blob([pretty(S) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `egypt-plan-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Exported');
}
function importJSON(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const s = JSON.parse(fr.result);
      if (!Array.isArray(s.days) || !Array.isArray(s.places) || !s.trip) throw new Error('missing trip/days/places');
      if (S && !confirm('Replace your current plan with this file?')) return;
      S = normalize(s); reindex(); LOAD_ERROR = null; PENDING = null; mapDirty = true;
      if (!S.blocks.find(b => b.id === UI.cmpBlock)) UI.cmpBlock = S.blocks[0]?.id;
      changed(); toast('Imported');
    } catch (e) { alert('Could not import: ' + e.message); }
  };
  fr.readAsText(file);
}
async function resetToFile() {
  if (!confirm('Discard all local edits and reload data.json?')) return;
  try {
    const text = await fetchData(); const s = JSON.parse(text);
    S = normalize(s); BASE_HASH = hash(text); DIRTY = false; PENDING = null; reindex(); mapDirty = true;
    persist(false); render(); toast('Reloaded data.json');
  } catch (e) { alert('Could not reload data.json: ' + e.message); }
}

/* ---------- render: shared pieces ---------- */
const pct = m => clamp((m - AX0) / (AX1 - AX0) * 100, 0, 100);
const span = (a, b, cls, title = '') => { const l = pct(a), w = pct(b) - l; return w > 0 ? `<span class="bs ${cls}" style="left:${l}%;width:${w}%" ${title ? `title="${esc(title)}"` : ''}></span>` : ''; };
function barHTML(r) {
  const s = r.sun; let h = '';
  h += span(s.dawn, s.dusk, 'tw', 'Civil twilight') + span(s.rise, s.set, 'dl', `Daylight ${hhmm(s.rise)}–${hhmm(s.set)}`);
  if (!r.free) h += span(AX0, AX1, 'nf', 'Booked');
  else { h += span(AX0, r.free[0], 'nf', 'Not free') + span(r.free[1], AX1, 'nf', 'Not free'); }
  if (r.usable) h += span(r.usable[0], r.usable[1], 'us', `Usable ${hhmm(r.usable[0])}–${hhmm(r.usable[1])}`);
  if (r.date === todayISO()) h += span(nowMin(), nowMin() + 3, 'now', 'Now');
  let p = '';
  for (const it of r.items) {
    if (it.type === 'drive') p += `<span class="dr" style="left:${pct(it.start)}%;width:${pct(it.end) - pct(it.start)}%" title="Drive ${dur(it.min)}"></span>`;
    else p += `<span class="st ${it.level}" style="left:${pct(it.arr)}%;width:${Math.max(.6, pct(it.dep) - pct(it.arr))}%" title="${esc(placeName(it.pid))}"></span>`;
  }
  return `<div class="bar">${h}</div>${r.items.length ? `<div class="plan">${p}</div>` : ''}`;
}
const ticksHTML = () => `<div class="ticks">${[6, 9, 12, 15, 18, 21].map(hr => `<span style="left:${pct(hr * 60)}%">${String(hr).padStart(2, '0')}</span>`).join('')}</div>`;
const STATUS_TXT = { ok: '✓ Fits', tight: '! Tight', bad: '✗ Doesn’t fit', none: 'No plan', booked: 'Booked' };
const badge = st => `<span class="badge ${st === 'booked' ? 'none' : st}">${STATUS_TXT[st]}</span>`;
function placeOptions(sel, { blank = '', exclude = [] } = {}) {
  let h = blank ? `<option value="">${esc(blank)}</option>` : '';
  for (const rg of S.regions) {
    const ps = S.places.filter(p => p.region === rg.id && !exclude.includes(p.id));
    if (!ps.length) continue;
    h += `<optgroup label="${esc(rg.name)}">` + ps.map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('') + '</optgroup>';
  }
  const other = S.places.filter(p => !S.regions.find(r => r.id === p.region));
  if (other.length) h += `<optgroup label="Other">` + other.map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('') + '</optgroup>';
  return h;
}

/* ---------- render: plan tab ---------- */
function renderPlan() {
  let h = tripCard();
  if (PENDING) h += `<div class="banner"><b>data.json has changed</b> since your local copy was made, and you have local edits. New place info has already been merged in; you only need the file version if you want its days, plans or bookings.
    <div class="row" style="margin-top:8px"><button class="btn small primary" data-act="pending-load">Use data.json</button>
    <button class="btn small" data-act="pending-keep">Keep my edits</button><button class="btn small" data-act="export">Export mine first</button></div></div>`;
  h += `<div class="legend"><span><i style="background:var(--day)"></i>Daylight</span><span><i style="background:var(--twilight)"></i>Twilight</span>
    <span><i style="background:repeating-linear-gradient(135deg,#555 0 3px,#999 3px 6px)"></i>Not free</span>
    <span><i style="box-shadow:inset 0 0 0 2px var(--accent)"></i>Usable</span><span><i style="background:var(--accent)"></i>Stop</span><span><i style="background:var(--drive);opacity:.6"></i>Travel</span></div>`;
  let lastBlock = undefined;
  for (const d of S.days) {
    const b = blockOf(d.date) || null;
    if ((b && b.id) !== (lastBlock && lastBlock.id)) {
      h += `<h2>${b ? esc(b.name) : 'Booked'}</h2>`;
      if (b) h += blockSummary(b);
    }
    lastBlock = b;
    h += dayCard(d, b);
  }
  h += `<p class="tiny muted">Sunrise/sunset computed for ${esc(placeName(S.trip.home))} (${S.trip.sunLat}, ${S.trip.sunLon})${set('localSun') ? '; stops are checked against the local sun at each place' : ''}. Times are Egypt time (${S.days.length ? [...new Set(S.days.map(d => utcLabel(d.date)))].join(' / ') : 'UTC+2'}${S.days.some(d => tzOff(d.date) === 180) ? '; summer time ends on the last Thursday of October' : ''}). Road times include a ${set('trafficBufferPct')}% traffic buffer; flights, ferries and trains are door to door.</p>`;
  return h;
}
function blockSummary(b) {
  const opts = optsOf(b.id), o = activeOpt(b);
  if (!o) return `<p class="small muted">No itinerary options for this block yet. <button class="btn small" data-act="onew" data-block="${b.id}">Create one</button></p>`;
  return `<div class="row small" style="margin:-2px 0 8px"><span class="muted">Plan:</span>
    <select data-act="useopt" data-block="${b.id}">${opts.map(x => `<option value="${esc(x.id)}" ${x.id === o.id ? 'selected' : ''}>${esc(x.id)} · ${esc(x.name)}</option>`).join('')}</select>
    <button class="btn small" data-act="gocompare" data-block="${b.id}">Compare</button>
    <button class="btn small" data-act="autoplan" data-block="${b.id}">Auto-plan</button></div>`;
}
function dayCard(d, b) {
  const o = activeOpt(b), r = simulate(d.date, o), open = !!UI.open[d.date];
  const s = r.sun;
  let sum = `Sun ${hhmm(s.rise)}–${hhmm(s.set)} (${dur(s.len)})`;
  if (r.free) sum += r.usable ? ` · usable ${hhmm(r.usable[0])}–${hhmm(r.usable[1])} (${dur(r.usable[1] - r.usable[0])})` : ' · no usable daylight';
  let route = '';
  if (o && r.plan && (r.plan.stops.length || r.start !== r.end)) {
    route = `<div class="small" style="margin-top:3px">${[r.start, ...r.plan.stops.map(x => x.place === '_break' ? '_break' : x.place)].filter(x => x !== '_break').map(placeName).map(esc).join(' → ')}${r.end !== r.start || r.plan.stops.length ? ' → <b>' + esc(placeName(r.end)) + '</b>' : ''}</div>`;
    sum += ` · ${r.items.some(i => i.mode && i.mode !== 'road') ? r.items.filter(i => i.mode && i.mode !== 'road').map(i => MODE_ICON[i.mode]).join('') + ' ' : ''}travel ${dur(r.driveMin)}`;
  }
  if (o && r.free) {
    const sg = suggestFor(d.date, o);
    const okN = sg.add.filter(x => x.status === 'ok').length;
    if (okN) sum += ` · <span style="color:var(--ok)">+${okN} more could fit</span>`;
    else if (sg.drop.length) sum += ` · <span style="color:var(--bad)">drop ${esc(placeName(sg.drop[0].place))} to fit</span>`;
  }
  return `<section class="card day ${d.state}" id="day-${d.date}">
    <button class="head" data-act="toggle" data-date="${d.date}" aria-expanded="${open}">
      <div class="row"><span class="date">${dateLabel(d.date)}</span><span class="chip ${d.state}">${esc(stateText(d))}</span>
      <span class="grow"></span>${b ? badge(r.status) : ''}</div>
      ${d.label ? `<div class="small muted">${esc(d.label)}</div>` : ''}
      ${route}
      ${barHTML(r)}${ticksHTML()}
      <div class="sumline">${sum}</div>
    </button>
    ${open ? `<div class="body">${dayBody(d, b, o, r)}</div>` : ''}
  </section>`;
}
function dayBody(d, b, o, r) {
  let h = `<div class="row">
    <label class="f">State<select data-act="dstate" data-date="${d.date}">
      ${['free', 'partial', 'booked'].map(x => `<option value="${x}" ${d.state === x ? 'selected' : ''}>${{ free: 'Fully free', partial: 'Partially free', booked: 'Fully booked' }[x]}</option>`).join('')}
    </select></label>
    ${d.state === 'partial' ? `<label class="f">Free<select data-act="dmode" data-date="${d.date}"><option value="until" ${d.mode !== 'from' ? 'selected' : ''}>until</option><option value="from" ${d.mode === 'from' ? 'selected' : ''}>from</option></select></label>
    <label class="f">Time<input type="time" value="${esc(d.time || '')}" data-act="dtime" data-date="${d.date}"></label>` : ''}
    </div>
    <div class="row" style="margin-top:8px"><label class="f grow">Note<input type="text" value="${esc(d.label || '')}" data-act="dlabel" data-date="${d.date}" placeholder="e.g. dinner with the group"></label>
    ${d.state !== 'booked' ? `<label class="f">Max travel (h)<input type="number" min="0" step="0.5" value="${d.maxDriveH ?? ''}" placeholder="${set('maxDriveH')}" data-act="dmaxdrive" data-date="${d.date}"></label>` : ''}</div>`;
  if (!b) return h + `<p class="small muted">This day is fully booked. Set it to fully or partly free to plan stops.</p>`;
  if (!o) return h + `<p class="small muted">No itinerary option yet for ${esc(b.name)}.</p>`;
  if (!r.free) return h + (r.issues.length ? issuesHTML(r) : '');
  const plan = planOf(o, d.date, false) || { stops: [] };
  h += `<h3>Stops <span class="muted small">· plan ${esc(o.id)} · ${esc(o.name)}</span></h3>`;
  h += `<div class="row small"><label class="f">Leave ${esc(placeName(r.start))} at
      <input type="time" value="${esc(plan.depart || '')}" data-act="depart" data-date="${d.date}" placeholder="${hhmm(r.depart)}"></label>
      <span class="muted">${plan.depart ? '' : 'auto: ' + hhmm(r.depart)}</span></div>`;
  h += `<ul class="stops" style="margin-top:8px">`;
  let si = 0;
  for (const it of r.items) {
    if (it.type === 'drive') {
      h += it.segs ? `<div class="leg ${it.darkEve ? 'dark' : ''}">${hhmm(it.start)} ${MODE_ICON[it.mode]} ${MODE_NAME[it.mode]} ${dur(it.min)} door to door${it.fare ? ` · fare ~${egp(it.fare)}` : ''}${it.est ? ' (est.)' : ''}<div class="tiny">${esc(legText(it))}</div></div>`
        : `<div class="leg ${it.darkEve ? 'dark' : ''}">🚗 ${hhmm(it.start)} drive ${dur(it.min)} · ${it.km} km${it.est ? ' (est.)' : ''}${it.dark ? ` · ${dur(it.dark)} in the dark` : ''}</div>`;
      continue;
    }
    const s = it.s, i = it.idx, n = plan.stops.length;
    h += `<li><div class="row"><span class="t">${hhmm(it.arr)}–${hhmm(it.dep)}</span><b class="grow">${esc(placeName(s.place))}</b>
        ${it.level !== 'ok' ? `<span class="badge ${it.level}">${it.level === 'bad' ? (it.daylight ? 'check' : 'closed') : 'tight'}</span>` : ''}</div>
      ${it.hours ? `<div class="tiny muted">Open ${hhmm(it.hours[0])}–${hhmm(it.hours[1])}${place(s.place)?.closed?.length ? ' · closed ' + place(s.place).closed.map(x => DOW[x]).join(', ') : ''}</div>` : ''}
      ${it.daylight && set('localSun') && Math.abs(it.sun.set - r.sun.set) >= 5 ? `<div class="tiny muted">Local daylight ${hhmm(it.sun.rise)}–${hhmm(it.sun.set)}</div>` : ''}
      <div class="row" style="margin-top:6px">
        <label class="f">Minutes<input type="number" min="0" step="5" value="${it.min}" data-act="smin" data-date="${d.date}" data-i="${i}"></label>
        <label class="f grow">Note<input type="text" value="${esc(s.note || '')}" data-act="snote" data-date="${d.date}" data-i="${i}" placeholder="${esc(place(s.place)?.note || 'Note')}"></label>
      </div>
      <div class="row" style="margin-top:6px;justify-content:flex-end">
        <button class="btn small icon" data-act="sup" data-date="${d.date}" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
        <button class="btn small icon" data-act="sdown" data-date="${d.date}" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
        <button class="btn small danger" data-act="srm" data-date="${d.date}" data-i="${i}">Remove</button>
      </div></li>`;
    si++;
  }
  h += `</ul>`;
  if (r.arrive != null) h += `<div class="small">Arrive <b>${esc(placeName(r.end))}</b> at <b>${hhmm(r.arrive)}</b>${r.free[1] < 1440 ? ` · cutoff ${hhmm(r.free[1])}` : ''}</div>`;
  h += `<div class="row" style="margin-top:10px"><select data-act="sadd" data-date="${d.date}" class="grow">
      <option value="">+ Add a stop…</option><option value="_break">Break (lunch, rest)</option>${placeOptions(null)}</select>
      <button class="btn small" data-act="mapday" data-date="${d.date}">On map</button></div>`;
  h += `<div class="row" style="margin-top:8px"><label class="f grow">Sleep tonight / end the day at
      <select data-act="sleep" data-date="${d.date}">${placeOptions(plan.sleep || S.trip.home)}</select></label></div>`;
  h += `<div class="kv" style="margin-top:10px">
      <span>Travel</span><b>${dur(r.driveMin)} · ${r.driveKm} km <span class="muted" style="font-weight:400">(limit ${dur(r.maxDrive)})</span></b>
      ${r.fare ? `<span>Fares</span><b>~${money(r.fare)} <span class="muted" style="font-weight:400">per person</span></b>` : ''}
      <span>At stops</span><b>${dur(r.stopMin)}</b>
      <span>Daylight span used</span><b>${dur(r.need)} of ${r.usable ? dur(r.usable[1] - r.usable[0]) : '0m'}</b>
    </div>`;
  h += issuesHTML(r);
  h += suggestHTML(d.date, o);
  return h;
}
function suggestHTML(date, o) {
  const sg = suggestFor(date, o);
  let h = `<h3>Could also fit</h3>`;
  if (sg.base.status === 'bad' && !sg.drop.length) {
    return h + `<p class="small muted" style="margin:0">Removing a single stop isn't enough to make this day fit. Options: sleep somewhere closer, raise this day's max travel, check opening days, or use <b>Auto-plan</b> for the block.</p>`;
  }
  if (sg.drop.length) {
    return h + `<p class="small muted" style="margin:0 0 6px">The day doesn't fit as planned. Removing one of these fixes it:</p>` +
      sg.drop.map(x => `<div class="sugg"><span class="grow"><b>${esc(placeName(x.place))}</b><div class="tiny muted">then ${STATUS_TXT[x.r.status].toLowerCase()} · back ${hhmm(x.r.arrive)}</div></span>
        <button class="btn small danger" data-act="srm" data-date="${date}" data-i="${x.i}">Remove</button></div>`).join('');
  }
  const undo = UI.undo && UI.undo.date === date && UI.undo.opt === o.id;
  const undoBtn = undo ? `<button class="btn small" data-act="undo" data-date="${date}">Undo auto-fill</button>` : '';
  if (!sg.add.length) return h + `<div class="row"><p class="empty grow">Nothing else fits in today's usable window.</p>${undoBtn}</div>`;
  h += `<div class="row" style="margin-bottom:8px"><span class="small muted grow">Recalculated whenever you change free time, stops or settings.</span>
    ${sg.add.some(x => x.status === 'ok') ? `<button class="btn small primary" data-act="autofill" data-date="${date}">Auto-fill</button>` : ''}
    ${undoBtn}</div>`;
  const show = UI.suggAll && UI.suggAll[date] ? sg.add : sg.add.slice(0, 6);
  h += show.map(x => {
    const p = place(x.place), rg = region(p.region);
    const after = x.pos === 0 ? 'first' : 'after ' + placeName(((o.days[date] || {}).stops || [])[x.pos - 1].place);
    return `<div class="sugg"><span class="grow"><span style="color:${rg.color}">●</span> <b>${esc(p.name)}</b>${prio(p) >= 3 ? ' <span class="tiny" title="High priority">★</span>' : ''}
      <div class="tiny muted">+${dur(Math.max(0, x.extra))} travel · ${dur(x.visit)} visit · ${esc(after)} · back ${hhmm(x.r.arrive)}</div></span>
      <span class="badge ${x.status}">${x.status === 'ok' ? '✓' : '!'}</span>
      <button class="btn small" data-act="sugadd" data-date="${date}" data-place="${esc(x.place)}" data-pos="${x.pos}">Add</button></div>`;
  }).join('');
  if (sg.add.length > show.length) h += `<button class="btn small" data-act="suggall" data-date="${date}">Show all ${sg.add.length}</button>`;
  return h;
}
function issuesHTML(r) {
  if (!r.issues.length) return r.status === 'ok' ? `<ul class="issues"><li class="ok">Fits inside the usable window.</li></ul>` : '';
  return `<ul class="issues">${r.issues.map(([l, m]) => `<li class="${l}">${withEur(esc(m))}</li>`).join('')}</ul>`;
}

/* ---------- render: compare tab ---------- */
function optionStats(o) {
  const b = S.blocks.find(x => x.id === o.block), ds = blockDates(b);
  const days = ds.map(date => simulate(date, o));
  const st = { days, driveMin: 0, driveKm: 0, stopMin: 0, darkDrive: 0, ok: 0, tight: 0, bad: 0, nights: [], far: null };
  for (const r of days) {
    st.driveMin += r.driveMin; st.driveKm += r.driveKm; st.stopMin += r.stopMin; st.darkDrive += r.darkEve;
    if (r.status in st) st[r.status]++;
    const sl = o.days[r.date]?.sleep;
    if (r.end && r.date !== S.trip.to) st.nights.push(r.end); // every night is a hotel night, except after the flight home
    for (const it of r.items) if (it.type === 'stop') {
      const dkm = drive(S.trip.home, it.pid).km;
      if (!st.far || dkm > st.far.km) st.far = { pid: it.pid, km: dkm };
    }
  }
  // road legs by taxi / private driver, priced per km; flight, ferry and train fares per person from data.json
  st.roadKm = days.reduce((a, r) => a + r.roadKm, 0); st.fares = days.reduce((a, r) => a + r.fare, 0);
  st.transport = st.roadKm * set('roadEgpPerKm') + st.fares;
  const own = S.bookings.filter(x => x.option === o.id && x.status !== 'cancelled');
  st.book = own.reduce((a, x) => a + (+(x.actual ?? x.est) || 0), 0);
  // nights without a hotel booking linked to this option are costed at the per-night estimate
  st.unbookedNights = Math.max(0, st.nights.length - own.filter(x => x.type === 'hotel').length);
  st.book += st.unbookedNights * set('nightEgp');
  st.cost = st.transport + st.book;
  return st;
}
function renderCompare() {
  if (!S.blocks.length) return '<p class="muted">No blocks defined in data.json.</p>';
  const b = S.blocks.find(x => x.id === UI.cmpBlock) || S.blocks[0];
  const opts = optsOf(b.id), ds = blockDates(b);
  let h = `<div class="row" style="margin-bottom:10px"><div class="seg">${S.blocks.map(x => `<button data-act="cmpblock" data-block="${x.id}" aria-pressed="${x.id === b.id}">${esc(x.name.split('·')[0].trim())}</button>`).join('')}</div>
    <span class="grow"></span><button class="btn small primary" data-act="autoplan" data-block="${b.id}">Auto-plan</button><button class="btn small" data-act="onew" data-block="${b.id}">+ New</button></div>
    <p class="small muted" style="margin-top:0">${esc(b.name)} · ${dateLabel(b.from)} – ${dateLabel(b.to)}. Costs are transport (road km × your per-km rate, plus fares) and bookings linked to that option (shared bookings like international flights are left out).</p>`;
  if (!opts.length) return h + '<p class="empty">No options yet.</p>';
  const stats = opts.map(optionStats);
  const minOf = k => Math.min(...stats.map(s => s[k])), maxOf = k => Math.max(...stats.map(s => s[k]));
  const best = (v, k, hi) => opts.length > 1 && v === (hi ? maxOf(k) : minOf(k)) ? 'best' : '';
  const cell = (fn) => opts.map((o, i) => `<td class="${o.id === b.active ? 'active' : ''}" data-optcol="${esc(o.id)}">${fn(o, stats[i])}</td>`).join('');
  const row = (label, fn) => `<tr><th class="rl">${label}</th>${cell(fn)}</tr>`;
  h += `<div class="cmpwrap"><table class="cmp"><thead><tr><th class="rl">Option</th>${cell(o => `
      <input type="text" value="${esc(o.name)}" data-act="oname" data-id="${esc(o.id)}" aria-label="Option name">
      <div class="tiny muted" style="margin:3px 0">${esc(o.id)}</div>
      <div class="row" style="gap:4px">${o.id === b.active ? '<span class="badge ok">Selected</span>' : `<button class="btn small primary" data-act="oactive" data-id="${esc(o.id)}">Select</button>`}
      <button class="btn small" data-act="oedit" data-id="${esc(o.id)}">Edit</button>
      <button class="btn small" data-act="odup" data-id="${esc(o.id)}">Copy</button>
      <button class="btn small danger" data-act="odel" data-id="${esc(o.id)}" aria-label="Delete">✕</button></div>`)}</tr></thead><tbody>`;
  h += row('Fit', (o, s) => `${s.bad ? `<span class="badge bad">${s.bad} ✗</span> ` : ''}${s.tight ? `<span class="badge tight">${s.tight} !</span> ` : ''}${s.ok ? `<span class="badge ok">${s.ok} ✓</span>` : ''}`);
  ds.forEach((date, di) => {
    h += row(dateLabel(date), (o, s) => {
      const r = s.days[di]; const p = o.days[date];
      const names = (p?.stops || []).map(x => placeName(x.place));
      return `${badge(r.status)}<div class="small" style="margin-top:4px">${names.length ? names.map(esc).join(' → ') : '<span class="muted">—</span>'}</div>
        <div class="tiny muted">${r.driveMin ? r.items.filter(i => i.mode && i.mode !== 'road').map(i => MODE_ICON[i.mode]).join('') + 'travel ' + dur(r.driveMin) + ' · ' : ''}sleep ${esc(placeName(r.end || S.trip.home))}</div>`;
    });
  });
  h += row('Total travel', (o, s) => `<b class="${best(s.driveMin, 'driveMin')}">${dur(s.driveMin)}</b><div class="tiny muted">${s.driveKm} km · ${s.roadKm} by road</div>`);
  h += row('After dark', (o, s) => `<span class="${best(s.darkDrive, 'darkDrive')}">${dur(s.darkDrive)}</span> <span class="tiny muted">evening road travel</span>`);
  h += row('Time at stops', (o, s) => `<span class="${best(s.stopMin, 'stopMin', true)}">${dur(s.stopMin)}</span>`);
  h += row('Furthest', (o, s) => s.far ? `${esc(placeName(s.far.pid))}<div class="tiny muted">${s.far.km} km from ${esc(placeName(S.trip.home))}</div>` : '—');
  h += row('Hotel nights', (o, s) => s.nights.length ? `${s.nights.length}<div class="tiny muted">${[...new Set(s.nights)].map(id => `${esc(placeName(id))} ×${s.nights.filter(x => x === id).length}`).join(', ')}</div>` : '0');
  h += row('Transport', (o, s) => `${egp(s.transport)}<div class="tiny muted">${fmtEur(toEur(s.transport))}${s.fares ? ` · fares ${egp(s.fares)}` : ''}</div>`);
  h += row('Bookings', (o, s) => `${egp(s.book)}<div class="tiny muted">${fmtEur(toEur(s.book))} · ${S.bookings.filter(x => x.option === o.id && x.status !== 'cancelled').length} items${s.unbookedNights ? ` + ${s.unbookedNights} night${s.unbookedNights > 1 ? 's' : ''} at ${egp(set('nightEgp'))} est.` : ''}</div>`);
  h += row('<b>Total</b>', (o, s) => `<b class="${best(s.cost, 'cost')}">${egp(s.cost)}</b><div class="tiny muted">${fmtEur(toEur(s.cost))}</div>`);
  h += row('Note', o => `<textarea data-act="onote" data-id="${esc(o.id)}" rows="2">${esc(o.note || '')}</textarea>`);
  h += `</tbody></table></div>`;
  h += `<p class="tiny muted">Road: ${set('roadEgpPerKm')} EGP/km (${fmtEur(toEur(set('roadEgpPerKm')))}) for a taxi or private driver; fares are per person. € at ${rateLabel()}. Green = best in row. “Edit” selects the option and opens it in the planner.</p>`;
  return h;
}

/* ---------- render: bookings tab ---------- */
const BK_STATUS = { todo: 'To book', booked: 'Booked', paid: 'Paid', cancelled: 'Cancelled / not needed' };
const BK_TYPES = ['flight', 'hotel', 'transfer', 'tour', 'dive', 'tickets', 'visa', 'food', 'other'];
function bookingCounted(x) {
  if (x.status === 'cancelled') return [false, 'cancelled'];
  if (!x.option) return [true, ''];
  const o = optById(x.option); if (!o) return [false, 'option no longer exists'];
  const b = S.blocks.find(y => y.id === o.block);
  return b && b.active === o.id ? [true, ''] : [false, `only for ${o.id}, which isn't selected`];
}
function renderBook() {
  let est = 0, act = 0, committed = 0, total = 0, todo = 0, delta = 0, run = 0;
  for (const x of S.bookings) {
    const [c] = bookingCounted(x); if (!c) continue;
    const v = +(x.actual ?? x.est) || 0;
    est += +x.est || 0; total += v;
    if (x.actual != null && x.actual !== '') { act += +x.actual; delta += (+x.actual) - (+x.est || 0); }
    if (x.status === 'booked' || x.status === 'paid') committed += v; else todo++;
  }
  const transport = S.blocks.reduce((a, b) => { const o = activeOpt(b); return a + (o ? optionStats(o).transport : 0); }, 0);
  let h = `<div class="totals">
    <div class="tile"><div class="l">Running total</div><div class="v">${egp(total)}</div><div class="tiny muted">${fmtEur(toEur(total))} · actual where known</div></div>
    <div class="tile"><div class="l">Estimated</div><div class="v">${egp(est)}</div><div class="tiny muted">${fmtEur(toEur(est))}</div></div>
    <div class="tile"><div class="l">Actual so far</div><div class="v">${egp(act)}</div><div class="tiny muted">${fmtEur(toEur(act))}</div><div class="tiny ${delta > 0 ? '' : 'muted'}" style="${delta > 0 ? 'color:var(--bad)' : ''}">${delta ? (delta > 0 ? '+' : '−') + money(Math.abs(delta)) + ' vs estimate' : 'on estimate'}</div></div>
    <div class="tile"><div class="l">Booked / paid</div><div class="v">${egp(committed)}</div><div class="tiny muted">${fmtEur(toEur(committed))} · ${todo} still to book</div></div>
    <div class="tile"><div class="l">+ Transport (selected plans)</div><div class="v">${egp(transport)}</div><div class="tiny muted">${fmtEur(toEur(transport))} · all-in ${money(total + transport)}</div></div>
  </div>
  <div class="row" style="margin-bottom:10px"><span class="small muted grow">Bookings tied to an unselected option are greyed out and left out of the totals.</span>
  <button class="btn small primary" data-act="bnew">+ Add</button></div>`;
  S.bookings.forEach((x, i) => {
    const [c, why] = bookingCounted(x);
    if (c) run += +(x.actual ?? x.est) || 0;
    const open = UI.bkOpen && UI.bkOpen[x.id];
    const amt = (x.actual != null ? egp(x.actual) : egp(x.est) + '<span class="tiny muted"> est.</span>') + `<div class="tiny muted" style="text-align:right">${fmtEur(toEur(x.actual ?? x.est))}</div>`;
    h += `<div class="card bkrow ${c ? '' : 'dim'}"><button class="bkhead" data-act="btoggle" data-id="${esc(x.id)}" aria-expanded="${!!open}">
        <div class="row"><b class="grow">${esc(x.item)}</b><span class="tabular">${amt}</span></div>
        <div class="row tiny" style="margin-top:3px"><span class="chip st-${esc(x.status)}">${esc(BK_STATUS[x.status] || x.status)}</span>
          <span class="chip">${x.option ? esc(x.option) : 'shared'}</span><span class="muted grow">${c ? 'running ' + money(run) : esc(why)}</span></div>
        ${x.seasonal ? `<div class="seasonal" style="margin-top:6px">Season: ${withEur(esc(x.seasonal))}</div>` : ''}
      </button>`;
    if (open) h += `<div class="bk" style="margin-top:10px">
        <label class="f full">Item<input type="text" value="${esc(x.item)}" data-act="bset" data-k="item" data-i="${i}"></label>
        <label class="f">Type<select data-act="bset" data-k="type" data-i="${i}">${BK_TYPES.map(t => `<option ${t === x.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f">Status<select data-act="bset" data-k="status" data-i="${i}">${Object.entries(BK_STATUS).map(([k, v]) => `<option value="${k}" ${k === x.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f full">Applies to<select data-act="bset" data-k="option" data-i="${i}"><option value="">All plans (shared)</option>
          ${S.options.map(o => `<option value="${esc(o.id)}" ${o.id === x.option ? 'selected' : ''}>${esc(o.id)} · ${esc(o.name)}</option>`).join('')}</select></label>
        <label class="f">Estimate (EGP)${x.est ? ' · ' + fmtEur(toEur(x.est)) : ''}<input type="number" min="0" step="50" value="${x.est ?? ''}" data-act="bset" data-k="est" data-i="${i}"></label>
        <label class="f">Actual (EGP)${x.actual ? ' · ' + fmtEur(toEur(x.actual)) : ''}<input type="number" min="0" step="1" value="${x.actual ?? ''}" data-act="bset" data-k="actual" data-i="${i}"></label>
        <label class="f full">Season note<input type="text" value="${esc(x.seasonal || '')}" data-act="bset" data-k="seasonal" data-i="${i}" placeholder="e.g. winter hours, Ramadan"></label>
        <label class="f full">Notes / ref<input type="text" value="${esc(x.note || '')}" data-act="bset" data-k="note" data-i="${i}"></label>
        <div class="full row"><span class="grow"></span><button class="btn small danger" data-act="bdel" data-i="${i}">Delete booking</button></div>
      </div>`;
    else if (x.note) h += `<div class="tiny muted" style="margin-top:4px">${withEur(esc(x.note))}</div>`;
    h += `</div>`;
  });
  return h;
}

/* ---------- render: conditions tab ---------- */
function renderCond() {
  let h = `<h2>Check before you go</h2><div class="links">${S.links.map(l => `<a class="card" href="${esc(l.url)}" target="_blank" rel="noopener">
    <div class="row"><b>${esc(l.name)}</b><span class="grow"></span><span class="tiny muted">${esc(l.host || new URL(l.url).host)} ↗</span></div>
    ${l.note ? `<div class="small muted">${esc(l.note)}</div>` : ''}</a>`).join('')}</div>
    <div class="card small"><b>Emergency numbers</b><div class="kv" style="margin-top:6px">
      <span>Tourist police</span><b>126</b><span>Ambulance</span><b>123</b><span>Police</span><b>122</b><span>Fire</span><b>180</b></div>
      <div class="tiny muted" style="margin-top:6px">From a foreign phone 112 is usually routed too. Save your hotel's number and address in Arabic for taxi drivers.</div></div>
    <h2>Checklist</h2><div class="card">${S.checklist.map((c, i) => `<label class="check"><input type="checkbox" data-act="check" data-i="${i}" ${S.checks[i] ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}</div>
    <h2>Daylight in ${esc(placeName(S.trip.home))}</h2><div class="card"><table class="sun"><thead><tr><th>Day</th><th>Rise</th><th>Set</th><th>Length</th><th>Δ</th><th>Dusk*</th></tr></thead><tbody>`;
  let prev = null;
  for (const d of S.days) {
    const s = sunHome(d.date);
    h += `<tr${d.date === todayISO() ? ' style="font-weight:700"' : ''}><td>${dateLabel(d.date)}</td><td>${hhmm(s.rise)}</td><td>${hhmm(s.set)}</td><td>${dur(s.len)}</td><td class="muted">${prev ? (s.len <= prev ? '−' : '+') + Math.abs(Math.round(prev - s.len)) + 'm' : ''}</td><td class="muted">${hhmm(s.dusk)}</td></tr>`;
    prev = s.len;
  }
  h += `</tbody></table><div class="tiny muted" style="margin-top:6px">*End of civil twilight. Night falls fast this far south: about 25 minutes after sunset it's dark. Sunrise is ~15 min earlier in Luxor, Aswan and Sharm than in Cairo.</div></div>`;
  const num = (k, label, step = 1) => `<label class="f">${label}<input type="number" step="${step}" value="${esc(set(k))}" data-act="set" data-k="${k}"></label>`;
  const tog = (k, label) => `<label class="check" style="border:0;padding:4px 0"><input type="checkbox" data-act="setbool" data-k="${k}" ${set(k) ? 'checked' : ''}><span>${label}</span></label>`;
  h += `<h2>Settings</h2><div class="card"><div class="row">
      ${num('speedKmh', 'Avg road speed (km/h)')}${num('roadFactor', 'Road factor', 0.05)}${num('trafficBufferPct', 'Traffic buffer %')}
      ${num('maxDriveH', 'Max travel/day (h)', 0.5)}${num('maxSeeH', 'Max sightseeing/day (h)', 0.5)}${num('slackMin', 'Min. spare (min)', 5)}${num('darkDriveMin', 'Dark-road warn (min)', 5)}
      <label class="f">Earliest auto start<input type="time" value="${esc(set('earliestDepart'))}" data-act="set" data-k="earliestDepart"></label>
      ${num('nightEgp', 'Unbooked night (EGP)', 100)}${num('roadEgpPerKm', 'Taxi/driver EGP per km', 0.5)}${num('eurEgp', 'Fallback EGP per €', 0.5)}
    </div>
    <h3>Travel between regions</h3>
    ${tog('useFlight', '✈️ Domestic flights (Cairo ↔ Luxor, Aswan, Hurghada, Sharm el-Sheikh)')}
    ${tog('useFerry', '⛴️ Hurghada ↔ Sharm el-Sheikh ferry')}
    ${tog('useTrain', '🚆 Trains (Cairo ↔ Alexandria, Luxor ↔ Aswan)')}
    <p class="tiny muted" style="margin-top:2px">With these off, the planner only uses roads (taxi, private driver, bus). Times and fares for each leg are in <code>drives</code> in data.json.</p>
    <label class="check" style="border:0"><input type="checkbox" data-act="setbool" data-k="localSun" ${set('localSun') ? 'checked' : ''}><span>Check each stop against its own local sunrise/sunset (the sun rises up to ~15 min earlier in Sinai and the south than in Cairo)</span></label>
    <label class="f">Theme<div class="seg">${['auto', 'light', 'dark'].map(t => `<button data-act="theme" data-v="${t}" aria-pressed="${UI.theme === t}">${t}</button>`).join('')}</div></label>
    </div>
    <p class="tiny muted">App version ${APP_BUILD}${NEWER ? ` · <b>newer version ${esc(NEWER)} available</b> <button class="btn small" data-act="reload">Reload</button>` : ''}</p>
    <h2>Your data</h2><div class="card">
      <p class="small" style="margin-top:0">Edits are saved in this browser${DIRTY ? ' (you have local changes)' : ''}. Export to keep a copy — the file has the same format as <code>data.json</code>, so you can drop it in as the new data file.</p>
      <div class="row"><button class="btn primary" data-act="export">Export JSON</button><button class="btn" data-act="import">Import JSON</button><button class="btn danger" data-act="reset">Reset to data.json</button></div>
    </div>`;
  return h;
}

/* ---------- places tab (POIs) ---------- */
// Photos + an encyclopedic intro come from Wikipedia at runtime (CORS-enabled, no key), cached for offline.
const LS_WIKI = 'egypt-wiki';
let WIKI = {}, WIKI_BUSY = false, WIKI_ERR = null;
try { WIKI = JSON.parse(localStorage.getItem(LS_WIKI) || '{}'); } catch (e) { }
const WAPI = 'https://en.wikipedia.org/w/api.php?format=json&origin=*&action=query';
const WPROPS = '&redirects=1&prop=pageimages|extracts|info&inprop=url&pithumbsize=960&exintro=1&explaintext=1&exsentences=3&exlimit=20';
async function wikiPages(titles) {
  const j = await (await fetch(`${WAPI}${WPROPS}&titles=${encodeURIComponent(titles.join('|'))}`)).json();
  const q = j.query || {}, alias = {};
  for (const x of [...(q.normalized || []), ...(q.redirects || [])]) alias[x.from] = x.to;
  const final = t => { let n = 0; while (alias[t] && n++ < 3) t = alias[t]; return t; };
  const pages = Object.values(q.pages || {});
  return t => { const pg = pages.find(x => x.title === final(t)); return pg && !('missing' in pg) ? pg : null; };
}
async function fetchWiki() {
  if (!S || WIKI_BUSY || !navigator.onLine) return;
  const need = S.places.filter(p => !WIKI[p.id] || (!WIKI[p.id].img && Date.now() - WIKI[p.id].at > 10 * 60 * 1000));
  if (!need.length) return;
  WIKI_BUSY = true; WIKI_ERR = null; if (UI.tab === 'places') render();
  const store = (p, pg) => { WIKI[p.id] = pg ? { title: pg.title, img: pg.thumbnail?.source, extract: pg.extract, url: pg.fullurl, at: Date.now() } : { none: true, at: Date.now() }; };
  try {
    const missing = [];
    for (let i = 0; i < need.length; i += 20) {
      const chunk = need.slice(i, i + 20), get = await wikiPages(chunk.map(p => p.wiki || p.name));
      for (const p of chunk) { const pg = get(p.wiki || p.name); if (pg) store(p, pg); else missing.push(p); }
    }
    // pages without a lead image: try the REST summary endpoint, which picks images differently
    for (const p of need) {
      const w = WIKI[p.id];
      if (!w || w.img || !w.title) continue;
      try {
        const j = await (await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(w.title.replace(/ /g, '_'))}`)).json();
        if (j.thumbnail?.source) w.img = j.thumbnail.source;
      } catch (e) { }
    }
    // still no photo: search Wikimedia Commons for a picture of the place
    for (const p of need) {
      const w = WIKI[p.id];
      if (!w || w.img || w.none) continue;
      try {
        const q = encodeURIComponent(`${p.wiki || p.name} filetype:bitmap`);
        const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?format=json&origin=*&action=query&generator=search&gsrnamespace=6&gsrlimit=5&gsrsearch=${q}&prop=imageinfo&iiprop=url&iiurlwidth=960`)).json();
        const hits = Object.values(j.query?.pages || {}).sort((x, y) => x.index - y.index);
        const hit = hits.find(h => h.imageinfo?.[0]?.thumburl);
        if (hit) { w.img = hit.imageinfo[0].thumburl; w.commons = hit.imageinfo[0].descriptionurl; }
      } catch (e) { }
    }
    for (const p of missing) { // fall back to a search, e.g. if an article was renamed
      const j = await (await fetch(`${WAPI}&list=search&srlimit=1&srsearch=${encodeURIComponent(p.name + ' ' + (S.trip.country || 'Egypt'))}`)).json();
      const t = j.query?.search?.[0]?.title;
      store(p, t ? (await wikiPages([t]))(t) : null);
    }
    try { localStorage.setItem(LS_WIKI, JSON.stringify(WIKI)); } catch (e) { }
    if (UI.tab === 'places') render();
  } catch (e) { console.warn('wiki', e); WIKI_ERR = e.message || String(e); }
  WIKI_BUSY = false;
  if (UI.tab === 'places') render();
}
const IMG_FAIL = {};
// Wikimedia rejects thumbnail widths outside its standard list (HTTP 400, "Use thumbnail sizes listed on w.wiki/GHai").
// We don't hard-code that list: try likely widths, remember the first that works, and fall back to the original file.
const IMG_CHAIN = [960, 1280, 500, 330, 250];
let IMG_W = +(localStorage.getItem('egypt-imgw') || 0) || null;
const isThumb = u => /\/thumb\/.+\/\d+px-[^/]+$/.test(u || '');
const thumbAt = (u, w) => u.replace(/\/\d+px-([^/]+)$/, `/${w}px-$1`);
const origOf = u => u.replace('/thumb/', '/').replace(/\/\d+px-[^/]+$/, '');
const imgSrc = u => (u && isThumb(u) && IMG_W ? thumbAt(u, IMG_W) : u);
function imgFail(el, id) {
  const tried = (el.dataset.tried || '').split(',').filter(Boolean), cur = el.src;
  tried.push(isThumb(cur) ? cur.match(/\/(\d+)px-[^/]+$/)[1] : 'orig');
  el.dataset.tried = tried.join(',');
  if (isThumb(cur)) {
    const w = IMG_CHAIN.find(x => !tried.includes(String(x)));
    el.src = w ? thumbAt(cur, w) : origOf(cur);
    return;
  }
  IMG_FAIL[id] = cur; el.remove();
  const st = document.getElementById('photostatus'); if (st) st.outerHTML = photoStatus();
}
let imgSaveT = null;
function imgOk(id, el) {
  const m = el && el.src.match(/\/thumb\/.+\/(\d+)px-[^/]+$/);
  if (m && +m[1] !== IMG_W) { IMG_W = +m[1]; try { localStorage.setItem('egypt-imgw', IMG_W); } catch (e) { } }
  clearTimeout(imgSaveT); imgSaveT = setTimeout(() => { try { localStorage.setItem(LS_WIKI, JSON.stringify(WIKI)); } catch (e) { } }, 500); }
function photoStatus() {
  const n = S.places.length, got = S.places.filter(p => (p.photo || WIKI[p.id]?.img) && !IMG_FAIL[p.id]).length, failed = Object.keys(IMG_FAIL).length;
  let msg = WIKI_BUSY ? 'Loading photos from Wikipedia…' : !navigator.onLine && got < n ? `Offline — ${got} of ${n} photos available.`
    : `Photos: ${got} of ${n}` + (failed ? ` · ${failed} failed to display` : '') + (WIKI_ERR ? ` · Wikipedia lookup failed: ${WIKI_ERR}` : '');
  const sample = failed ? Object.values(IMG_FAIL)[0] : '';
  return `<div id="photostatus" class="row tiny muted" style="margin-bottom:8px"><span class="grow">${esc(msg)}${sample ? `<br>e.g. <a href="${esc(sample)}" target="_blank" rel="noopener">open a failing image</a>` : ''}</span>
    ${got < n && !WIKI_BUSY ? `<button class="btn small" data-act="wikiretry">Retry photos</button>` : ''}</div>`;
}
function plannedIn(id) {
  const out = [];
  for (const o of S.options) for (const [d, p] of Object.entries(o.days)) if (p.stops.some(s => s.place === id)) out.push({ o, d, active: S.blocks.find(b => b.id === o.block)?.active === o.id });
  return out;
}
function renderPlaces() {
  const seg = `<div class="seg" style="margin-bottom:10px;display:flex"><button style="flex:1" data-act="pmode" data-v="mine" aria-pressed="${UI.pmode !== 'osm'}">My places (${S.places.length})</button>
    <button style="flex:1" data-act="pmode" data-v="osm" aria-pressed="${UI.pmode === 'osm'}">All of Egypt${OSM ? ` (${OSM.items.length.toLocaleString('en-GB')})` : ''}</button></div>`;
  if (UI.pmode === 'osm') return seg + renderOsm();
  return seg + renderMyPlaces();
}
function renderMyPlaces() {

  const pf = UI.pf || {}, cat = pf.cat || 'all', reg = pf.region || 'all', only = pf.only || 'all';
  const cats = (S.categories || []).filter(c => S.places.some(p => p.cat === c));
  const musts = S.places.filter(p => pick(p.id) === 'must'), skips = S.places.filter(p => pick(p.id) === 'skip');
  const chip = (k, v, label, on) => `<button class="pchip" data-act="pfilter" data-k="${k}" data-v="${esc(v)}" aria-pressed="${on}">${label}</button>`;
  let h = `<div class="card small" style="margin-bottom:10px">Mark the places you really want to see as <b>★ Must-see</b>, and the ones you don't care about as <b>Skip</b>.
      <b>Auto-plan</b> builds each block around your must-sees, and suggestions never offer skipped places.
      <div class="muted" style="margin-top:8px">★ ${musts.length} must-see · ${skips.length} skipped</div>
      <div class="row" style="margin-top:6px">${S.blocks.map(b => `<button class="btn small primary" data-act="autoplan" data-block="${b.id}">Auto-plan ${esc(b.name.split('·')[0].trim())}</button>`).join('')}</div></div>
    ${photoStatus()}
    <div class="pchips">${chip('only', 'all', 'All', only === 'all')}${chip('only', 'must', '★ Must-see', only === 'must')}${chip('only', 'unplanned', 'Not in plan', only === 'unplanned')}${chip('only', 'skip', 'Skipped', only === 'skip')}</div>
    <div class="pchips">${chip('cat', 'all', 'All types', cat === 'all')}${cats.map(c => chip('cat', c, esc(c), cat === c)).join('')}</div>
    <div class="pchips">${chip('region', 'all', 'All regions', reg === 'all')}${S.regions.map(r => chip('region', r.id, `<span style="color:${r.color}">●</span> ${esc(r.name)}`, reg === r.id)).join('')}</div>`;
  const days = S.days.filter(d => blockOf(d.date) && d.state !== 'booked');
  const list = S.places.filter(p => (cat === 'all' || p.cat === cat) && (reg === 'all' || p.region === reg)
    && (only === 'all' ? pick(p.id) !== 'skip' : only === 'unplanned' ? !plannedIn(p.id).some(x => x.active) && pick(p.id) !== 'skip' : pick(p.id) === only));
  if (!list.length) h += `<p class="empty">No places match these filters.</p>`;
  for (const p of list) {
    const rg = region(p.region), w = WIKI[p.id] || {}, pk = pick(p.id), where = plannedIn(p.id);
    const img = p.photo || imgSrc(w.img) || null;
    const wurl = w.url || `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(p.wiki || p.name)}`;
    h += `<article class="card poi ${pk ? 'pk-' + pk : ''}" id="poi-${esc(p.id)}">
      <div class="poiimg" style="--rc:${rg.color}"><span>${esc(p.cat || '')}</span>${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="imgFail(this,'${esc(p.id)}')" onload="imgOk('${esc(p.id)}', this)">` : ''}
        ${pk === 'must' ? '<span class="poistar">★ Must-see</span>' : ''}</div>
      <div class="poibody">
        <div class="row"><h3 class="grow" style="margin:0">${esc(p.name)}</h3>${p.confidence === 'low' ? '<span class="chip partial">unverified</span>' : ''}<span class="chip">${catInfo(p.cat).icon} ${esc(p.cat || 'Place')}</span></div>
        ${p.caution ? `<div class="small" style="color:var(--warn);margin:4px 0">⚠ ${withEur(esc(p.caution))}</div>` : ''}
        <div class="tiny" style="color:${rg.color};margin:2px 0 6px">${esc(rg.name)} · ~${p.visit ?? 45} min${p.id !== S.trip.home ? ` · ${drive(S.trip.home, p.id).km} km from ${esc(placeName(S.trip.home))}` : ''}</div>
        ${p.summary ? `<p style="margin:0 0 6px">${esc(p.summary)}</p>` : ''}
        ${p.facts && p.facts.length ? `<ul class="facts">${p.facts.map(f => `<li>${withEur(esc(f))}</li>`).join('')}</ul>` : ''}
        ${p.hours || p.closed?.length ? `<div class="small" style="margin:4px 0">🕘 ${p.hours ? `Open ${esc(p.hours.replace('-', '–'))}` : ''}${p.closed?.length ? `${p.hours ? ' · ' : ''}closed ${p.closed.map(x => DOW[x]).join(', ')}` : ''}</div>` : ''}
        ${p.season ? `<div class="seasonal" style="margin:6px 0">☀ ${withEur(esc(p.season))}</div>` : ''}
        ${w.extract ? `<details class="small"><summary>From Wikipedia</summary><p class="muted" style="margin:4px 0">${esc(w.extract)}</p></details>` : ''}
        <div class="row small" style="margin:8px 0">
          <a href="${esc(wurl)}" target="_blank" rel="noopener">Wikipedia ↗</a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}" target="_blank" rel="noopener">Directions ↗</a>
          ${(p.links || []).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)} ↗</a>`).join('')}</div>
        ${p.sources && p.sources.length ? `<details class="tiny" style="margin-bottom:6px"><summary>Sources${p.checked ? ` · checked ${esc(dateLabel(p.checked, { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}${p.confidence ? ` · ${esc(p.confidence)} confidence` : ''}</summary>
          <ul class="facts" style="margin-top:4px">${p.sources.map(u => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))}</a></li>`).join('')}</ul></details>` : ''}
        ${where.length ? `<div class="tiny muted" style="margin-bottom:6px">In plans: ${where.map(x => `${x.active ? '<b>' : ''}${esc(x.o.id)} ${dateLabel(x.d, { day: 'numeric', month: 'short' })}${x.active ? '</b>' : ''}`).join(', ')}</div>` : ''}
        <div class="row" style="gap:6px">
          <button class="btn small ${pk === 'must' ? 'primary' : ''}" data-act="pick" data-v="must" data-place="${esc(p.id)}" aria-pressed="${pk === 'must'}">★ Must-see</button>
          <button class="btn small ${pk === 'skip' ? 'danger' : ''}" data-act="pick" data-v="skip" data-place="${esc(p.id)}" aria-pressed="${pk === 'skip'}">${pk === 'skip' ? 'Skipped' : 'Skip'}</button>
          <button class="btn small" data-act="pmap" data-place="${esc(p.id)}">Map</button>
          <select data-act="padd" data-place="${esc(p.id)}" class="grow" style="min-width:110px"><option value="">Add to day…</option>${days.map(d => `<option value="${d.date}">${dateLabel(d.date)}</option>`).join('')}</select>
        </div>
        ${img ? `<div class="tiny muted" style="margin-top:6px">Photo: <a href="${esc(p.photo ? p.photo : w.commons || wurl)}" target="_blank" rel="noopener">${p.photo ? 'custom' : w.commons ? 'Wikimedia Commons' : 'Wikipedia / Wikimedia Commons'}</a></div>` : ''}
      </div></article>`;
  }
  if (!navigator.onLine && S.places.some(p => !WIKI[p.id])) h += `<p class="tiny muted">Photos load the first time you open this tab online, and are kept for offline use.</p>`;
  return h;
}

/* ---------- "All of Egypt": every named sight from OpenStreetMap ---------- */
// One Overpass query (free, no key) fetches every named archaeological site, temple, tomb, museum, dive reef,
// beach, viewpoint… in Egypt. Stored compactly for offline use; any item can be promoted into "My places".
// Egypt has tens of thousands of "historic" objects (every old Cairo house is one), so minor historic objects,
// artworks and places of worship are only included when they have a Wikipedia article.
const LS_OSM = 'egypt-osm';
// Downloaded region by region (see OSM_AREAS): OSM_STORE.areas[id] = { at, items }. OSM is the merged, de-duplicated
// view the list, map layer and filter use ({ items }), or null when nothing is downloaded.
let OSM = null, OSM_STORE = { v: 2, areas: {} }, OSM_BUSY = null, OSM_QUEUE = [], OSM_ERRS = {};
// live download status: OSM_ST for the current request, OSM_RUN for the queue ("region 2 of 4")
let OSM_ST = null, OSM_RUN = { done: 0, total: 0 }, OSM_TICK = null;
try {
  const st = JSON.parse(localStorage.getItem(LS_OSM) || 'null');
  if (st && st.v === 2) OSM_STORE = st;
  else if (st && st.items?.length) OSM_STORE.areas.earlier = { at: st.at, items: st.items }; // whole-country download from before
} catch (e) { }
// Public Overpass servers, tried in turn. All send CORS headers on success; their error pages (timeouts, rate
// limits) don't, which the browser can only report as "Failed to fetch".
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
/* osm-shared-start: also run by tools/osm-update.mjs (GitHub Action) to prepare osm/<region>.json */
// One download per region: small queries that come back in seconds, so you fetch what your trip needs. The first six
// match the trip's regions; the rest cover other parts of Egypt. Plain bounding boxes only: an "inside Egypt" area
// filter made every query time out (testing each object against the detailed border took 70+ s). Instead the boxes
// stop at the borders: Taba but not Eilat/Aqaba (east edge 34.92), Siwa but not Libya (west edge 25.0), south of
// Abu Simbel but not Sudan (22.2).
const OSM_AREAS = [ // [id, name, south, west, north, east, region colour/id]
  ['cairo', 'Cairo & Giza', 29.6, 30.9, 30.25, 31.55],
  ['alex', 'Alexandria & El Alamein', 30.7, 28.8, 31.45, 30.5],
  ['luxor', 'Luxor, Dendera & Abydos', 25.5, 31.85, 26.3, 32.9],
  ['aswan', 'Aswan, Edfu & Abu Simbel', 22.2, 31.5, 25.1, 33.1],
  ['redsea', 'Hurghada & Red Sea coast', 24.5, 33.2, 27.6, 35.3],
  ['sinai', 'South Sinai', 27.6, 32.7, 29.6, 34.92],
  ['fayoum', 'Fayoum & Middle Egypt', 27.4, 29.9, 29.6, 31.0],
  ['oases', 'Western Desert oases (Siwa, Bahariya, Dakhla…)', 24.5, 25.0, 29.6, 30.8],
  ['suez', 'Suez, Ain Sokhna & the Red Sea monasteries', 28.5, 31.9, 30.3, 32.75],
];
const osmArea = id => OSM_AREAS.find(x => x[0] === id);
function osmMerge() { // rebuild the merged view from the downloaded areas (areas overlap a little)
  const seen = new Set(), items = [];
  for (const k of Object.keys(OSM_STORE.areas)) for (const a of OSM_STORE.areas[k].items) if (!seen.has(a[0])) { seen.add(a[0]); items.push(a); }
  OSM = items.length || Object.keys(OSM_STORE.areas).length ? { items } : null;
  osmLayerDirty = true;
}
// Placing a relation (a multipolygon: a national park, a desert sand sea) at its centre means loading its whole outline,
// which is what made these queries crawl. So: nodes and ways for everything, relations only for named sites with
// a Wikipedia article (small, and worth it), and no protected areas, nature reserves or sand/dune areas at all:
// the GitHub job's log showed every timeout, in every region and even in near-empty desert boxes, at the
// nature_reserve statement. (The parks that matter, Ras Mohammed, Wadi el-Gemal, Giftun, are in My places anyway.)
const osmQuery = ([, , s, w, n, e], timeout = 60) => `[out:json][timeout:${timeout}][bbox:${s},${w},${n},${e}];(
nw["historic"~"^(archaeological_site|tomb|castle|fort|ruins|monument|city_gate|monastery|temple|pyramid)$"]["name"];
nw["historic"]["name"]["wikipedia"];
nw["tourism"~"^(attraction|viewpoint|museum|gallery|zoo|theme_park)$"]["name"];
nw["tourism"="artwork"]["name"]["wikipedia"];
nw["amenity"="place_of_worship"]["name"]["wikipedia"];
rel["historic"]["name"]["wikipedia"];
rel["tourism"~"^(attraction|museum)$"]["name"]["wikipedia"];
nw["natural"~"^(reef|beach)$"]["name"];
node["natural"~"^(cave_entrance|arch|rock|spring|hot_spring|cape)$"]["name"];
nw["sport"="scuba_diving"]["name"];
node["natural"="peak"]["name"]["wikipedia"];
nw["man_made"="lighthouse"]["name"];
);out center tags qt;`;
function osmCat(t, name = '') {
  const n = t.natural, tr = t.tourism, h = t.historic, nm = name.toLowerCase();
  if (n === 'reef' || t.sport === 'scuba_diving') return 'Snorkel & dive';
  if (n === 'beach') return 'Beach';
  if (h === 'pyramid' || /pyramid/.test(nm)) return 'Pyramids';
  if (h === 'temple' || /temple/.test(nm)) return 'Temple';
  if (h === 'tomb' || /tomb|mastaba|necropolis|mausoleum/.test(nm)) return 'Tomb';
  if (h === 'monastery' || t.religion === 'christian' || /monastery|church|cathedral|convent/.test(nm)) return 'Church & monastery';
  if (t.religion === 'muslim' || /mosque|masjid|madrasa|sabil/.test(nm)) return 'Mosque';
  if (h === 'castle' || h === 'fort' || /citadel|fortress|\bfort\b/.test(nm)) return 'Fortress';
  if (h === 'monument' || h === 'city_gate' || /obelisk|statue|colossus|sphinx/.test(nm)) return 'Monument';
  if (h === 'archaeological_site' || h === 'ruins') return 'Ruins';
  if (tr === 'museum' || tr === 'gallery') return 'Museum';
  if (tr === 'artwork') return 'Art';
  if (n === 'spring' || n === 'hot_spring' || /oasis|spring/.test(nm)) return 'Oasis & spring';
  if (n === 'cave_entrance') return 'Cave';
  if (n === 'peak') return 'Mountain';
  if (n === 'sand' || n === 'dune' || n === 'valley' || /desert|wadi|canyon/.test(nm)) return 'Desert';
  if (n === 'arch' || n === 'rock' || n === 'cape') return 'Landmark';
  if (t.man_made === 'lighthouse') return 'Lighthouse';
  if (tr === 'viewpoint') return 'Viewpoint';
  if (t.leisure === 'nature_reserve' || t.boundary) return 'Nature reserve';
  if (h) return 'Historic';
  return 'Attraction';
}
const osmRow = el => {
  const t = el.tags || {}, lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon, name = t['name:en'] || t['int_name'] || t.name;
  if (!name || lat == null) return null;
  return [el.type[0] + el.id, name, +lat.toFixed(5), +lon.toFixed(5), osmCat(t, name), t.wikipedia || '', t.website || t['contact:website'] || '', (t['description:en'] || t.description || '').slice(0, 200), t.name !== name ? t.name || '' : ''];
};
/* osm-shared-end */
const OSM_TIMEOUT = 120000;
async function osmTile(tile, errs) { // one area, trying each server in turn; null if all fail
  for (const [i, url] of OVERPASS.entries()) {
    const host = url.split('/')[2], ctl = new AbortController(), to = setTimeout(() => ctl.abort(), OSM_TIMEOUT);
    OSM_ST = { host, n: i + 1, of: OVERPASS.length, t0: Date.now(), bytes: 0, phase: 'asking', failed: errs.length }; osmTick();
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(osmQuery(tile)), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 429 ? ' (busy)' : res.status === 504 ? ' (timed out)' : ''));
      // the server sends nothing (and no size) until its query is done; after that we can count what arrives
      OSM_ST.phase = 'receiving'; osmTick();
      let text = '';
      if (res.body && res.body.getReader) {
        const rd = res.body.getReader(), dec = new TextDecoder();
        for (;;) { const { done, value } = await rd.read(); if (done) break; OSM_ST.bytes += value.length; text += dec.decode(value, { stream: true }); osmTick(); }
        text += dec.decode();
      } else text = await res.text();
      OSM_ST.phase = 'processing'; osmTick();
      const j = JSON.parse(text);
      // a query that runs out of time or memory still answers 200, with a "remark" and partial elements
      if (j.remark && /runtime error|timed out|out of memory/i.test(j.remark)) throw new Error(j.remark.replace(/^.*?error:\s*/i, '').slice(0, 80));
      return j.elements || [];
    } catch (e) { errs.push(`${host}: ${e.name === 'AbortError' ? 'no answer in 2 min' : e.message}`); }
    finally { clearTimeout(to); }
  }
  return null;
}
// Queue one or more areas; they download one at a time. A failed area keeps its previous data, if any.
// Updates just the status line (no full re-render), at most every 250 ms, and once a second while waiting.
function osmTick() {
  const now = Date.now(); if (osmTick.last && now - osmTick.last < 250 && OSM_ST?.phase === 'receiving') return; osmTick.last = now;
  const el = document.getElementById('osmstatus'); if (el) el.innerHTML = osmStatusHTML();
}
function osmStatusHTML() {
  const st = OSM_ST; if (!st) return '';
  const sec = Math.round((Date.now() - st.t0) / 1000), kb = st.bytes / 1024;
  const size = kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB';
  const txt = st.phase === 'starting' ? 'Starting…' : st.phase === 'file' ? 'Downloading the prepared file…' : st.phase === 'asking' ? `Waiting for ${esc(st.host)} to search${st.of > 1 ? ` (server ${st.n} of ${st.of})` : ''} · ${sec} s${sec >= 20 ? `, gives up at ${OSM_TIMEOUT / 60000} min` : ''}`
    : st.phase === 'receiving' ? `Receiving from ${esc(st.host)} · ${size} · ${sec} s` : `Processing ${size}…`;
  return `<div class="osmbar"><i class="${st.phase === 'processing' ? '' : 'ind'}" style="width:100%"></i></div><div class="tiny muted">${txt}${st.failed ? ` · ${st.failed} server${st.failed > 1 ? 's' : ''} failed, trying the next` : ''}</div>`;
}
function loadOSM(ids) {
  if (!OSM_BUSY) OSM_RUN = { done: 0, total: 0 };
  for (const id of ids) if (osmArea(id) && OSM_BUSY !== id && !OSM_QUEUE.includes(id)) { OSM_QUEUE.push(id); OSM_RUN.total++; }
  if (!OSM_TICK) OSM_TICK = setInterval(() => { if (OSM_BUSY) osmTick(); else { clearInterval(OSM_TICK); OSM_TICK = null; } }, 1000);
  if (!OSM_BUSY) osmNext(); else render();
}
async function osmNext() {
  const id = OSM_QUEUE.shift();
  if (!id) { OSM_BUSY = null; OSM_ST = null; render(); return; }
  if (!navigator.onLine) { OSM_ERRS[id] = 'You are offline.'; OSM_QUEUE = []; OSM_BUSY = null; render(); return; }
  OSM_BUSY = id; delete OSM_ERRS[id];
  OSM_ST = { host: '', n: 0, of: OVERPASS.length, t0: Date.now(), bytes: 0, phase: 'starting', failed: 0 }; // never a blank line
  render();
  setTimeout(() => document.getElementById('osmstatus')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  // 1. the prepared file on this site (made monthly by a GitHub Action: fast and reliable);
  // 2. if there's none yet, ask the public Overpass servers live
  const errs = [];
  let items = null, at = Date.now();
  try {
    OSM_ST.phase = 'file'; osmTick();
    const res = await fetch(`osm/${id}.json`, { cache: 'no-cache' });
    if (res.ok) { const j = await res.json(); if (Array.isArray(j.items)) { items = j.items; at = j.at || at; } }
    else if (res.status !== 404) errs.push(`osm/${id}.json: HTTP ${res.status}`);
  } catch (e) { errs.push(`osm/${id}.json: ${e.message}`); }
  if (!items) {
    const els = await osmTile(osmArea(id), errs);
    if (els) {
      const seen = new Set(); items = [];
      for (const el of els) { const row = osmRow(el); if (row && !seen.has(row[0])) { seen.add(row[0]); items.push(row); } }
    }
  }
  if (items) {
    OSM_STORE.areas[id] = { at, items };
    try { localStorage.setItem(LS_OSM, JSON.stringify(OSM_STORE)); } catch (e) { OSM_ERRS[id] = 'Loaded, but too big to keep offline on this device.'; }
    osmMerge(); mf().osm = true; UI.osmLayer = true; mapDirty = true;
  } else OSM_ERRS[id] = [...new Set(errs)].join('; ');
  OSM_RUN.done++;
  osmNext();
}
function osmRemove(id) {
  delete OSM_STORE.areas[id];
  try { localStorage.setItem(LS_OSM, JSON.stringify(OSM_STORE)); } catch (e) { }
  osmMerge(); mapDirty = true; render();
}
// the areas this trip uses: the regions of every place in the selected plans
function osmTripAreas() {
  const regs = new Set();
  for (const b of S.blocks) { const o = activeOpt(b); if (!o) continue; for (const p of Object.values(o.days)) for (const id of [p.sleep, ...p.stops.map(x => x.place)]) if (place(id)) regs.add(place(id).region); }
  return OSM_AREAS.filter(a => regs.has(a[0])).map(a => a[0]);
}
const osmObj = a => ({ id: a[0], name: a[1], lat: a[2], lon: a[3], cat: a[4], wiki: a[5], web: a[6], desc: a[7], local: a[8] });
const osmUrl = id => `https://www.openstreetmap.org/${{ n: 'node', w: 'way', r: 'relation' }[id[0]]}/${id.slice(1)}`;
const wikiUrl = w => { const m = /^([a-z-]+):(.+)$/.exec(w || ''); return m ? `https://${m[1]}.wikipedia.org/wiki/${encodeURIComponent(m[2].replace(/ /g, '_'))}` : null; };
const osmPlaceId = o => 'osm_' + o.id;
function osmMine(o) { // already one of my places? (same OSM id, or same name within ~1 km)
  if (place(osmPlaceId(o))) return place(osmPlaceId(o));
  const nm = o.name.toLowerCase();
  return S.places.find(p => haversine(p, o) < 1 && (p.name.toLowerCase().includes(nm) || nm.includes(p.name.toLowerCase().split(' ')[0]))) || null;
}
const OSM_VISIT = { Pyramids: 90, Temple: 75, Tomb: 45, Ruins: 45, Monument: 15, Museum: 75, Mosque: 30, 'Church & monastery': 45, Fortress: 60, Historic: 20, Art: 10,
  'Snorkel & dive': 180, Beach: 120, Lighthouse: 20, Desert: 120, Mountain: 120, Cave: 45, Landmark: 20, 'Oasis & spring': 60, 'Nature reserve': 90, Viewpoint: 15, Attraction: 30 };
function promoteOSM(o) {
  if (osmMine(o)) return osmMine(o);
  let near = null, nd = Infinity;
  for (const p of S.places) { const d = haversine(p, o); if (d < nd) { nd = d; near = p; } }
  const w = /^en:(.+)$/.exec(o.wiki || '');
  const p = { id: osmPlaceId(o), name: o.name, region: near ? near.region : S.regions[0]?.id, lat: o.lat, lon: o.lon, visit: OSM_VISIT[o.cat] ?? 30, cat: o.cat,
    summary: o.desc || `${o.cat} listed on OpenStreetMap${o.local ? ` (local name: ${o.local})` : ''}. No details checked yet.`, facts: [], wiki: w ? w[1] : o.name,
    links: [{ name: 'OpenStreetMap', url: osmUrl(o.id) }, ...(wikiUrl(o.wiki) && !w ? [{ name: 'Wikipedia', url: wikiUrl(o.wiki) }] : []), ...(o.web ? [{ name: 'Website', url: o.web }] : [])],
    priority: 1, sources: [osmUrl(o.id)], confidence: 'low', checked: todayISO() };
  if (['Museum', 'Mosque', 'Church & monastery', 'Art'].includes(o.cat)) p.needsDaylight = false;
  S.places.push(p);
  if (!(S.categories || []).includes(o.cat)) (S.categories = S.categories || []).push(o.cat);
  reindex(); mapDirty = true; delete WIKI[p.id];
  return p;
}
function renderOsm() {
  const trip = osmTripAreas().filter(id => !OSM_STORE.areas[id]);
  const row = ([id, name]) => {
    const got = OSM_STORE.areas[id], busy = OSM_BUSY === id, queued = OSM_QUEUE.includes(id), err = OSM_ERRS[id], rg = S.regions.find(r => r.id === id);
    return `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><span class="grow"><b>${rg ? `<span style="color:${rg.color}">●</span> ` : ''}${esc(name)}</b>
      <div class="tiny ${err ? '' : 'muted'}" style="${err ? 'color:var(--bad)' : ''}">${busy ? `<div id="osmstatus">${osmStatusHTML()}</div>` : queued ? 'Waiting…' : err ? esc(err) : got ? `${got.items.length.toLocaleString('en-GB')} places · ${esc(dateLabel(new Date(got.at).toISOString().slice(0, 10), { day: 'numeric', month: 'short' }))}` : 'Not downloaded'}</div></span>
      ${busy || queued || !osmArea(id) ? '' : `<button class="btn small ${got ? '' : 'primary'}" data-act="osmload" data-v="${id}">${got ? '↻' : err ? 'Retry' : 'Download'}</button>`}
      ${got && !busy ? `<button class="btn small danger" data-act="osmrm" data-v="${id}" aria-label="Remove ${esc(name)}">✕</button>` : ''}</div>`;
  };
  const areasCard = `<details class="card" ${!OSM || UI.osmAreasOpen || OSM_BUSY ? 'open' : ''} ontoggle="UI.osmAreasOpen=this.open;saveUI()" style="padding:10px 12px">
    <summary><b>Download sights by region</b> <span class="tiny muted">· ${Object.keys(OSM_STORE.areas).filter(k => osmArea(k)).length} of ${OSM_AREAS.length} downloaded</span></summary>
    <p class="small muted" style="margin:6px 0">Everything OpenStreetMap knows in each region: archaeological sites, temples, tombs, museums, fortresses, dive reefs, beaches, desert landmarks, viewpoints and reserves, plus famous mosques and churches. Names, types and links only, so set opening hours after adding one to <b>My places</b>. Kept on your phone for offline use.</p>
    ${OSM_BUSY && OSM_RUN.total > 1 ? `<div class="small" style="margin:6px 0 2px"><b>Region ${Math.min(OSM_RUN.done + 1, OSM_RUN.total)} of ${OSM_RUN.total}</b> · ${esc(osmArea(OSM_BUSY)?.[1] || '')}</div>
      <div class="osmbar"><i style="width:${Math.round(OSM_RUN.done / OSM_RUN.total * 100)}%"></i></div>` : ''}
    ${trip.length && !OSM_BUSY ? `<button class="btn small primary" data-act="osmtrip" style="margin-bottom:6px">Download my trip's regions (${trip.length})</button>` : ''}
    ${OSM_AREAS.map(row).join('')}
    ${OSM_STORE.areas.earlier ? row(['earlier', 'Earlier whole-Egypt download']) : ''}</details>`;
  if (!OSM) return areasCard;
  const cats = [...new Set(OSM.items.map(a => a[4]))].sort();
  const counts = Object.fromEntries(cats.map(c => [c, OSM.items.filter(a => a[4] === c).length]));
  const cat = UI.osmCat || 'all', near = place(UI.osmNear) ? UI.osmNear : S.trip.home;
  const chip = (v, label, on) => `<button class="pchip" data-act="osmcat" data-v="${esc(v)}" aria-pressed="${on}">${label}</button>`;
  return areasCard + `
    <div class="row" style="margin-bottom:8px"><input type="search" id="osmq" data-osmq placeholder="Search ${OSM.items.length.toLocaleString('en-GB')} places…" value="${esc(UI.osmQ || '')}" class="grow" autocomplete="off">
      <label class="f">Nearest to<select data-act="osmnear">${placeOptions(near)}</select></label></div>
    <div class="pchips">${chip('all', 'All types', cat === 'all')}${cats.map(c => chip(c, `${esc(c)} <span class="muted">${counts[c]}</span>`, cat === c)).join('')}</div>
    <div id="osmlist">${osmListHTML()}</div>`;
}
function osmListHTML() {
  const q = (UI.osmQ || '').trim().toLowerCase(), cat = UI.osmCat || 'all', near = place(UI.osmNear) || place(S.trip.home);
  const fold = x => x.normalize('NFD').replace(/[\u0300-\u036f\u064b-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/['‘’ʿʾ-]/g, '');
  const fq = fold(q);
  const list = OSM.items.filter(a => (cat === 'all' || a[4] === cat) && (!q || fold(a[1].toLowerCase()).includes(fq) || fold((a[8] || '').toLowerCase()).includes(fq)))
    .map(a => ({ o: osmObj(a), d: haversine(near, { lat: a[2], lon: a[3] }) })).sort((x, y) => x.d - y.d);
  const n = UI.osmN || 40;
  if (!list.length) return `<p class="empty">No matches.</p>`;
  return list.slice(0, n).map(({ o, d }) => {
    const mine = osmMine(o), wurl = wikiUrl(o.wiki);
    return `<div class="card osmrow"><div class="row"><b class="grow">${esc(o.name)}</b><span class="chip">${catInfo(o.cat).icon} ${esc(o.cat)}</span></div>
      <div class="tiny muted">${o.local ? '<bdi dir="auto">' + esc(o.local) + '</bdi>' + ' · ' : ''}${Math.round(d)} km from ${esc(placeName(near.id))} (straight line)</div>
      ${o.desc ? `<div class="small" style="margin-top:3px">${esc(o.desc)}</div>` : ''}
      <div class="row small" style="margin-top:6px;gap:10px">
        ${wurl ? `<a href="${esc(wurl)}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ''}
        <a href="https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lon}" target="_blank" rel="noopener">Directions ↗</a>
        <a href="${esc(osmUrl(o.id))}" target="_blank" rel="noopener">OSM ↗</a>
        ${o.web ? `<a href="${esc(o.web)}" target="_blank" rel="noopener">Website ↗</a>` : ''}
        <span class="grow"></span>
        <button class="btn small" data-act="osmmap" data-osm="${esc(o.id)}">Map</button>
        ${mine ? `<button class="btn small" data-act="pinfo" data-place="${esc(mine.id)}">In my places ✓</button>` : `<button class="btn small primary" data-act="osmadd" data-osm="${esc(o.id)}">+ My places</button>`}
      </div></div>`;
  }).join('') + (list.length > n ? `<button class="btn" data-act="osmmore" style="width:100%">Show more (${(list.length - n).toLocaleString('en-GB')} left)</button>` : `<p class="tiny muted">${list.length} shown.</p>`)
    + `<p class="tiny muted">Data © OpenStreetMap contributors (ODbL).</p>`;
}
// OSM layer: canvas dots (category colour) when zoomed out; real icons for what's on screen from zoom 10.
let osmLayer = null, osmIcons = null, osmLayerDirty = true; const OSM_MARKERS = {};
osmMerge();
const OSM_ICON_ZOOM = 10, OSM_ICON_MAX = 400;
const osmShown = a => catShown(a[4]) && !mf().must;
function refreshOsmView() {
  if (!MAP) return;
  const on = OSM && mf().osm;
  if (!on) { osmLayer && osmLayer.remove(); osmIcons && osmIcons.remove(); return; }
  if (MAP.getZoom() >= OSM_ICON_ZOOM) {
    osmLayer && osmLayer.remove();
    osmIcons = osmIcons || L.layerGroup();
    osmIcons.clearLayers(); for (const k in OSM_MARKERS) delete OSM_MARKERS[k];
    const bb = MAP.getBounds().pad(0.2); let n = 0;
    for (const a of OSM.items) {
      if (n >= OSM_ICON_MAX) break;
      if (!osmShown(a) || !bb.contains([a[2], a[3]])) continue;
      const o = osmObj(a), ci = catInfo(o.cat);
      const m = L.marker([o.lat, o.lon], { icon: L.divIcon({ className: '', html: `<div class="pinw" style="width:22px;height:22px"><div class="pin osm" style="--c:${ci.color}">${ci.icon}</div></div>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] }) });
      m.bindPopup(() => osmPopup(o), { maxWidth: 240 }); m.bindTooltip(esc(o.name), { direction: 'top', offset: [0, -10] });
      m.addTo(osmIcons); OSM_MARKERS[o.id] = m; n++;
    }
    if (!MAP.hasLayer(osmIcons)) osmIcons.addTo(MAP);
  } else {
    osmIcons && osmIcons.remove();
    if (osmLayerDirty || !osmLayer) {
      osmLayer = osmLayer || L.layerGroup();
      osmLayer.clearLayers(); for (const k in OSM_MARKERS) delete OSM_MARKERS[k];
      const renderer = refreshOsmView.r || (refreshOsmView.r = L.canvas({ padding: .5 }));
      for (const a of OSM.items) {
        if (!osmShown(a)) continue;
        const o = osmObj(a);
        const m = L.circleMarker([o.lat, o.lon], { renderer, radius: 3.5, color: '#fff', weight: .8, fillColor: catInfo(o.cat).color, fillOpacity: .85 });
        m.bindPopup(() => osmPopup(o), { maxWidth: 240 });
        m.addTo(osmLayer); OSM_MARKERS[o.id] = m;
      }
      osmLayerDirty = false;
    }
    if (!MAP.hasLayer(osmLayer)) osmLayer.addTo(MAP);
  }
}
function fillOsmLayer() { osmLayerDirty = true; refreshOsmView(); }
function osmPopup(o) {
  const mine = osmMine(o), wurl = wikiUrl(o.wiki);
  return `<h4>${catInfo(o.cat).icon} ${esc(o.name)}</h4><div class="tiny muted">${esc(o.cat)} · OpenStreetMap${o.local ? ' · ' + '<bdi dir="auto">' + esc(o.local) + '</bdi>' : ''}</div>
    ${o.desc ? `<div style="margin:4px 0">${esc(o.desc)}</div>` : ''}
    <div class="small" style="margin:4px 0">${wurl ? `<a href="${esc(wurl)}" target="_blank" rel="noopener">Wikipedia ↗</a> · ` : ''}<a href="${esc(osmUrl(o.id))}" target="_blank" rel="noopener">OSM ↗</a></div>
    ${mine ? `<button class="btn small" data-act="pinfo" data-place="${esc(mine.id)}">In my places ✓</button>` : `<button class="btn small primary" data-act="osmadd" data-osm="${esc(o.id)}">+ Add to my places</button>`}`;
}

/* ---------- category icons & map filter ---------- */
// Each category has an icon; colour comes from its family so related things read together on the map.
const CAT_GROUPS = [
  { id: 'ancient', name: 'Ancient Egypt', color: '#b26a00', cats: { Pyramids: '🔺', Temple: '🏛️', Tomb: '⚱️', Monument: '🗿', Ruins: '🏺' } },
  { id: 'old', name: 'Old cities & faith', color: '#8e24aa', cats: { 'Old city': '🕌', Mosque: '🕌', 'Church & monastery': '⛪', Fortress: '🏰', Historic: '🏚️', Memorial: '🎖️' } },
  { id: 'culture', name: 'Museums & culture', color: '#3949ab', cats: { Museum: '🖼️', Art: '🎨', Village: '🏡', Experience: '🎈', Attraction: '⭐' } },
  { id: 'sea', name: 'Sea', color: '#0277bd', cats: { 'Snorkel & dive': '🤿', Beach: '🏖️', 'Boat trip': '⛵', Lighthouse: '🗼' } },
  { id: 'nature', name: 'Desert & nature', color: '#2e7d32', cats: { Desert: '🐪', Hike: '🥾', Mountain: '⛰️', Cave: '🕳️', Landmark: '📍', 'Oasis & spring': '🌴', 'Nature reserve': '🌿', Garden: '🌳', Viewpoint: '🔭' } },
  { id: 'practical', name: 'Practical', color: '#546e7a', cats: { Town: '🏘️', Base: '🛏️', Airport: '✈️' } },
];
const CAT_INFO = {};
for (const g of CAT_GROUPS) for (const [c, icon] of Object.entries(g.cats)) CAT_INFO[c] = { icon, color: g.color, group: g.id };
const catInfo = c => CAT_INFO[c] || { icon: '📍', color: '#757575', group: 'culture' };
// map filter state lives in UI.mf: { hide: [categories], mine: bool, osm: bool, must: bool }
const mf = () => (UI.mf = UI.mf || { hide: [], mine: true, osm: !!UI.osmLayer, must: false });
const catShown = c => !mf().hide.includes(c || 'Landmark');
const placeShown = p => mf().mine && catShown(p.cat) && (!mf().must || pick(p.id) === 'must');
function mapFilterHTML() {
  const f = mf(), mineCount = {}, osmCount = {};
  for (const p of S.places) mineCount[p.cat] = (mineCount[p.cat] || 0) + 1;
  if (OSM) for (const a of OSM.items) osmCount[a[4]] = (osmCount[a[4]] || 0) + 1;
  const known = new Set([...Object.keys(mineCount), ...Object.keys(osmCount)]);
  const extra = [...known].filter(c => !CAT_INFO[c]);
  const groups = [...CAT_GROUPS.map(g => ({ ...g, list: Object.keys(g.cats).filter(c => known.has(c)) })), ...(extra.length ? [{ id: 'other', name: 'Other', color: '#757575', list: extra }] : [])].filter(g => g.list.length);
  const hidden = f.hide.filter(c => known.has(c)).length;
  const n = c => (f.mine ? mineCount[c] || 0 : 0) + (f.osm && OSM ? osmCount[c] || 0 : 0);
  return `<details class="mlwrap mfilter" ${UI.filterOpen ? 'open' : ''} ontoggle="UI.filterOpen=this.open;saveUI()">
    <summary>Filter map${hidden || f.must || !f.mine || (OSM && !f.osm) ? ` · <b>${[hidden ? `${hidden} type${hidden > 1 ? 's' : ''} hidden` : '', f.must ? 'must-sees only' : '', !f.mine ? 'my places hidden' : '', OSM && !f.osm ? '' : ''].filter(Boolean).join(', ') || 'custom'}</b>` : ''}</summary>
    <div class="row" style="gap:6px;margin:6px 0">
      <button class="pchip" data-act="msrc" data-v="mine" aria-pressed="${f.mine}">My places</button>
      <button class="pchip" data-act="msrc" data-v="osm" aria-pressed="${!!(f.osm && OSM)}" ${OSM ? '' : 'disabled title="Download regions in Places → All of Egypt"'}>All of Egypt${OSM ? '' : ' (none downloaded)'}</button>
      <button class="pchip" data-act="mmust" aria-pressed="${f.must}">★ Must-sees only</button>
      <span class="grow"></span><button class="btn small" data-act="mcatall">All</button><button class="btn small" data-act="mcatnone">None</button></div>
    <div class="mfbody">${groups.map(g => `<div class="mfgroup"><button class="mfgname" data-act="mgroup" data-v="${g.id}" style="color:${g.color}">${esc(g.name)}</button>
      ${g.list.map(c => `<button class="pchip mfchip" data-act="mcat" data-v="${esc(c)}" aria-pressed="${catShown(c)}" title="Tap to show/hide">
        <span class="mfi" style="background:${catInfo(c).color}">${catInfo(c).icon}</span>${esc(c)} <span class="muted">${n(c)}</span></button><button class="mfonly" data-act="mcatonly" data-v="${esc(c)}" aria-label="Only ${esc(c)}">⦿</button>`).join('')}
      </div>`).join('')}</div>
    <p class="tiny muted" style="margin:4px 0 0">Tap a type to show/hide it, ⦿ to show only that type, or a family name to toggle the whole family.</p>
  </details>`;
}
function pinIcon(p) {
  const ci = catInfo(p.cat), must = pick(p.id) === 'must';
  return L.divIcon({ className: '', html: `<div class="pinw"><div class="pin${must ? ' must' : ''}" style="--c:${ci.color}">${ci.icon}</div></div>`, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12] });
}

/* ---------- render: map tab ---------- */
let MARKERS = {};
let MAP = null, mapLayers = null, routeLayer = null, mapDirty = true, addMode = false;
// day colours for the whole-trip view (distinct on the OSM basemap)
const DAY_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0aa5b8', '#f032e6', '#9a6324', '#6b8e23', '#000075'];
const isOverview = v => typeof v === 'string' && v.startsWith('__');
// a day's route split into road runs (drawn along the roads, via OSRM) and flight/ferry/train hops (drawn straight)
function routeParts(r) {
  const parts = []; let run = null;
  for (const it of r.items) if (it.type === 'drive') {
    for (const sg of it.segs || [{ from: it.from, to: it.to, mode: 'road' }]) {
      if (sg.from === sg.to || !place(sg.from) || !place(sg.to)) continue;
      if (sg.mode !== 'road') { run = null; parts.push({ mode: sg.mode, ids: [sg.from, sg.to], min: sg.min }); }
      else if (run && run[run.length - 1] === sg.from) run.push(sg.to);
      else parts.push({ mode: 'road', ids: run = [sg.from, sg.to] });
    }
  }
  return parts;
}
const roadsLoaded = parts => parts.every(pt => pt.mode !== 'road' || ROUTES[pt.ids.join('>')]);
// the days shown by the current map selection, with their plan and route ids
function mapDays() {
  const sel = UI.mapDay;
  const dates = !isOverview(sel) ? [sel] : S.days.map(d => d.date).filter(d => { const b = blockOf(d); return b && (sel === '__all' || sel === '__block:' + b.id); });
  return dates.map(date => {
    const o = activeOpt(blockOf(date)); if (!o) return null;
    const r = simulate(date, o);
    const ids = [r.start, ...((r.plan && r.plan.stops) || []).filter(x => x.place !== '_break').map(x => x.place), r.end].filter(place).filter((id, i, a) => id !== a[i - 1]);
    const n = S.days.findIndex(d => d.date === date) + 1;
    return { date, o, r, ids, n, parts: routeParts(r), color: DAY_COLORS[(n - 1) % DAY_COLORS.length] };
  }).filter(Boolean);
}
function renderMapControls() { return renderMapControlsInner() + mapFilterHTML(); }
function renderMapControlsInner() {
  const days = S.days.filter(d => blockOf(d.date) && d.state !== 'booked');
  const valid = v => v === '__all' || (isOverview(v) && S.blocks.some(b => '__block:' + b.id === v)) || days.some(d => d.date === v);
  if (!valid(UI.mapDay)) UI.mapDay = days[0]?.date || '__all';
  const sel = `<select data-act="mapdaysel"><optgroup label="Overview"><option value="__all" ${UI.mapDay === '__all' ? 'selected' : ''}>Whole trip (selected plans)</option>
      ${S.blocks.map(b => `<option value="__block:${b.id}" ${UI.mapDay === '__block:' + b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</optgroup>
      <optgroup label="One day">${days.map(d => `<option value="${d.date}" ${d.date === UI.mapDay ? 'selected' : ''}>${dateLabel(d.date)} · ${esc(stateText(d))}${activeOpt(blockOf(d.date)) ? ' · ' + esc(activeOpt(blockOf(d.date)).id) : ''}</option>`).join('')}</optgroup></select>`;
  if (isOverview(UI.mapDay)) {
    const md = mapDays(), moving = md.filter(x => x.ids.length > 1);
    const km = md.reduce((a, x) => a + x.r.driveKm, 0), min = md.reduce((a, x) => a + x.r.driveMin, 0);
    const loading = moving.some(x => !roadsLoaded(x.parts));
    return `<div class="row" style="margin-bottom:6px"><label class="f grow">Showing${sel}</label></div>
      <div class="small" style="margin-bottom:4px"><b>${moving.length} travel day${moving.length === 1 ? '' : 's'}</b> · ${dur(min)} · ${Math.round(km)} km${loading ? ` · <span class="muted">${navigator.onLine ? 'loading road routes…' : 'offline: some routes are straight lines'}</span>` : ''}</div>
      <details class="mlwrap" ${UI.legendOpen ? 'open' : ''} ontoggle="UI.legendOpen=this.open;saveUI()"><summary>Days (${md.length}) — tap one to zoom in and edit</summary>
      <div class="maplegend">${md.map(x => `<button data-act="mapgo" data-date="${x.date}" class="mlrow"><i style="background:${x.color}"></i>
        <span class="grow"><b>Day ${x.n} · ${dateLabel(x.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b> ${badge(x.r.status)}<br>
        <span class="tiny muted">${x.ids.length > 1 ? x.ids.map(placeName).map(esc).join(' → ') + ` · ${dur(x.r.driveMin)}` : `Stay in ${esc(placeName(x.r.start || S.trip.home))}`}</span></span></button>`).join('')}</div></details>`;
  }
  const b = UI.mapDay && blockOf(UI.mapDay), o = activeOpt(b), r = UI.mapDay ? simulate(UI.mapDay, o) : null;
  return `<div class="row" style="margin-bottom:8px"><label class="f grow">Adding stops to${sel}</label>
      ${r ? badge(r.status) : ''}</div>
    ${r && r.plan ? `<div class="small" style="margin-bottom:6px">${[r.start, ...r.plan.stops.filter(x => x.place !== '_break').map(x => x.place), r.end].map(placeName).map(esc).join(' → ')} · travel ${dur(r.driveMin)}</div>` : ''}
    ${r && r.plan ? `<div class="tiny muted" style="margin:-2px 0 6px">${(() => { const parts = routeParts(r); const fly = parts.some(pt => pt.mode !== 'road') ? ' Flights, ferries and trains are dashed straight lines.' : '';
      return !parts.length ? '' : (roadsLoaded(parts) ? 'Road stretches follow the roads (OSRM).' : navigator.onLine ? 'Loading road route…' : 'Offline: straight lines until the road route has been loaded once.') + fly; })()}</div>` : ''}
    <div class="row small" style="margin-bottom:8px"><button class="btn small" data-act="toplan" data-date="${UI.mapDay || ''}">Open day in planner</button>
      <button class="btn small" data-act="mapgo" data-date="__all">Whole trip</button>
      <button class="btn small" data-act="addmode" aria-pressed="${addMode}">${addMode ? 'Tap the map to place it…' : '+ Custom place'}</button></div>`;
}
function initMap() {
  if (MAP || typeof L === 'undefined') return;
  MAP = L.map('map', { zoomControl: true }).setView([26.8, 31.5], 6);
  if (S.places.length) MAP.fitBounds(L.latLngBounds(S.places.map(p => [p.lat, p.lon])), { padding: [20, 20] });
  // Base maps. OpenStreetMap's standard style labels everything in the local language (Arabic here). Esri's maps label
  // in English and need no API key (CARTO's now do), so they're the default; dark mode gets Esri's dark canvas.
  const dark = matchMedia('(prefers-color-scheme: dark)').matches ? UI.theme !== 'light' : UI.theme === 'dark';
  const esri = (svc, o = {}) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`,
    { maxZoom: 19, maxNativeZoom: 18, attribution: 'Tiles © Esri, HERE, Garmin, © OpenStreetMap contributors · routing OSRM', ...o });
  const bases = {
    'English labels': esri('World_Street_Map'),
    'English labels, dark': L.layerGroup([esri('Canvas/World_Dark_Gray_Base', { maxNativeZoom: 16 }), esri('Canvas/World_Dark_Gray_Reference', { maxNativeZoom: 16 })]),
    'Satellite': L.layerGroup([esri('World_Imagery', { attribution: 'Imagery © Esri, Maxar, Earthstar Geographics · routing OSRM' }), esri('Reference/World_Boundaries_and_Places')]),
    'OpenStreetMap (Arabic labels)': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors · routing OSRM' }),
  };
  const pickBase = bases[UI.basemap] ? UI.basemap : dark ? 'English labels, dark' : 'English labels';
  bases[pickBase].addTo(MAP);
  // safety net: if a third-party map won't load (blocked, or starts asking for a key), fall back to OpenStreetMap's
  // own tiles rather than leave a blank or watermarked map. Only when online, and only before any tile has loaded.
  const osmBase = bases['OpenStreetMap (Arabic labels)'];
  for (const [name, layer] of Object.entries(bases)) {
    if (layer === osmBase) continue;
    let ok = 0, bad = 0;
    const tiles = layer.getLayers ? layer.getLayers() : [layer];
    for (const t of tiles) {
      t.on('tileload', () => { ok++; });
      t.on('tileerror', () => {
        if (!navigator.onLine || ok || ++bad < 6 || !MAP.hasLayer(layer)) return;
        MAP.removeLayer(layer); osmBase.addTo(MAP);
        toast(`“${name}” map didn't load; showing OpenStreetMap instead`);
      });
    }
  }
  L.control.layers(bases, null, { collapsed: true, position: 'topright' }).addTo(MAP);
  MAP.on('baselayerchange', e => { UI.basemap = e.name; saveUI(); });
  MAP.on('click', e => {
    if (!addMode) return;
    addMode = false;
    const name = prompt('Name for this place?'); if (!name) { render(); return; }
    let near = null, nd = Infinity;
    for (const p of S.places) { const dd = haversine(p, { lat: e.latlng.lat, lon: e.latlng.lng }); if (dd < nd) { nd = dd; near = p; } }
    let id = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '').slice(0, 20) || uid('p');
    while (place(id)) id += '2';
    S.places.push({ id, name, region: near ? near.region : S.regions[0]?.id, lat: +e.latlng.lat.toFixed(4), lon: +e.latlng.lng.toFixed(4), visit: 30, note: '' });
    reindex(); mapDirty = true; changed(); toast('Place added');
  });
}
function buildMarkers() {
  if (!MAP) return;
  if (mapLayers) mapLayers.mine.remove();
  const mine = L.layerGroup().addTo(MAP);
  for (const k in MARKERS) delete MARKERS[k];
  for (const p of S.places) {
    if (!placeShown(p)) continue;
    const m = L.marker([p.lat, p.lon], { icon: pinIcon(p), riseOnHover: true });
    m.bindPopup(() => popupHTML(p.id), { maxWidth: 260 });
    m.bindTooltip(esc(p.name), { direction: 'top', offset: [0, -12] });
    MARKERS[p.id] = m; m.addTo(mine);
  }
  mapLayers = { mine };
  const zoomClass = () => { const z = MAP.getZoom(), c = MAP.getContainer().classList; c.toggle('z-low', z < 8); c.toggle('z-mid', z >= 8 && z < 10); };
  if (!buildMarkers.hooked) { MAP.on('zoomend moveend', () => refreshOsmView()); MAP.on('zoomend', zoomClass); buildMarkers.hooked = true; }
  zoomClass();
  osmLayerDirty = true; refreshOsmView();
  mapDirty = false;
}
function drawRoute() {
  if (!MAP) return;
  if (routeLayer) routeLayer.remove();
  routeLayer = L.layerGroup().addTo(MAP);
  const overview = isOverview(UI.mapDay), md = mapDays(), bounds = [];
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#a8600f';
  const beds = new Map();
  md.forEach(x => {
    const color = overview ? x.color : accent;
    for (const pt of x.parts) {
      const road = pt.mode === 'road' && ROUTES[pt.ids.join('>')], ll = pt.ids.map(id => [place(id).lat, place(id).lon]);
      const line = road ? L.polyline(road.pts, { color, weight: 4, opacity: .85 })
        : L.polyline(ll, { color, weight: 3, dashArray: pt.mode === 'road' ? '6 6' : pt.mode === 'flight' ? '2 9' : '12 6', opacity: .85 });
      line.bindTooltip(overview ? `Day ${x.n} · ${dateLabel(x.date)} · ${dur(x.r.driveMin)}` : pt.mode === 'road' ? 'Road' : `${MODE_ICON[pt.mode]} ${placeName(pt.ids[0])} → ${placeName(pt.ids[1])} · ${dur(pt.min)} door to door`, { sticky: true });
      if (overview) line.on('click', () => { UI.mapDay = x.date; render(); });
      line.addTo(routeLayer); bounds.push(...line.getLatLngs());
      if (pt.mode === 'road' && !road) fetchRoute(pt.ids);
      if (pt.mode !== 'road') L.marker([(ll[0][0] + ll[1][0]) / 2, (ll[0][1] + ll[1][1]) / 2], {
        icon: L.divIcon({ className: '', html: `<div class="modeicon">${MODE_ICON[pt.mode]}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }), interactive: false }).addTo(routeLayer);
    }
    // stops: numbered within the day; in the overview they carry the day's colour and number
    x.ids.slice(1, -1).forEach((id, i) => L.marker([place(id).lat, place(id).lon], {
      icon: L.divIcon({ className: '', html: `<div class="numicon" style="${overview ? `background:${color}` : ''}">${overview ? x.n : i + 1}</div>`, iconSize: [24, 24], iconAnchor: [12, 26] }), interactive: false
    }).addTo(routeLayer));
    if (overview && x.r.end) beds.set(x.r.end, [...(beds.get(x.r.end) || []), x.n]);
  });
  // overnight stops in the overview: a bed marker listing which nights you sleep there
  if (overview) beds.forEach((nights, id) => { if (!place(id)) return;
    L.marker([place(id).lat, place(id).lon], { icon: L.divIcon({ className: '', html: `<div class="bedicon">🛏 ${nights.length > 3 ? nights.length + ' nights' : nights.join(',')}</div>`, iconSize: null, iconAnchor: [-6, 10] }), interactive: false }).addTo(routeLayer);
    bounds.push(L.latLng(place(id).lat, place(id).lon)); });
  // zoom to the selection when it changes (not on every redraw)
  if (drawRoute.fitted !== UI.mapDay && bounds.length) { MAP.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 11 }); drawRoute.fitted = UI.mapDay; }
}
function popupHTML(pid) {
  const p = place(pid), rg = region(p.region);
  const date = UI.mapDay, b = date && blockOf(date), o = activeOpt(b);
  let from = '';
  if (o) {
    const plan = o.days[date], stops = (plan?.stops || []).filter(x => x.place !== '_break');
    const prevId = stops.length ? stops[stops.length - 1].place : startLoc(o, date);
    const dv = drive(prevId, pid);
    from = prevId === pid ? `<div class="small muted">This is the previous stop.</div>` :
      `<div class="small">From <b>${esc(placeName(prevId))}</b>: ${MODE_ICON[dv.mode]} ${dur(dv.min)} · ${dv.km} km${dv.est ? ' (est.)' : ''}</div>${dv.segs ? `<div class="tiny muted">${esc(legText(dv))}</div>` : ''}`;
  }
  const first = (p.summary || '').split(/(?<=\.)\s/)[0];
  return `<h4>${catInfo(p.cat).icon} ${pick(pid) === 'must' ? '★ ' : ''}${esc(p.name)}</h4><div class="tiny" style="color:${rg.color}">${esc(p.cat || rg.name)} · ${esc(rg.name)} · ~${p.visit ?? 45} min visit</div>
    ${first ? `<div style="margin:4px 0">${esc(first)}</div>` : ''}
    ${p.hours ? `<div class="tiny muted">🕘 ${esc(p.hours.replace('-', '–'))}${p.closed?.length ? ' · closed ' + p.closed.map(x => DOW[x]).join(', ') : ''}</div>` : ''}
    ${p.note && p.note !== p.caution ? `<div class="small muted" style="margin:4px 0">${withEur(esc(p.note))}</div>` : ''}${p.caution ? `<div class="small" style="color:var(--warn)">${withEur(esc(p.caution))}</div>` : ''}
    <button class="btn small" data-act="pinfo" data-place="${esc(pid)}" style="margin:2px 0 4px">More info & photo</button>
    ${from}${o ? `<div class="row" style="gap:6px"><button class="btn small primary" data-act="madd" data-place="${esc(pid)}">Add to ${dateLabel(date)}</button>
    <button class="btn small" data-act="msleep" data-place="${esc(pid)}">Sleep here</button></div>` : '<div class="small muted">Pick a single day above to add stops here.</div>'}`;
}

/* ---------- main render ---------- */
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === UI.tab ? 'page' : 'false'));
  const v = $('#view'), mw = $('#mapwrap');
  if (!S) {
    v.innerHTML = `<div class="banner"><b>No plan loaded.</b> ${esc(LOAD_ERROR || '')}<br>
      If you opened the file directly (file://), browsers block reading data.json — run a local server
      (<code>python3 -m http.server</code>) or import the file:<div class="row" style="margin-top:8px"><button class="btn primary" data-act="import">Import data.json</button></div></div>`;
    mw.hidden = true; return;
  }
  if (S.trip.name) $('#title').innerHTML = `${esc(S.trip.name)} <span class="sub">${dateLabel(S.trip.from, { day: 'numeric', month: 'short' })} – ${dateLabel(S.trip.to, { day: 'numeric', month: 'short' })}</span>`;
  $('#fxchip').textContent = `1€ = ${rate().toFixed(1)} EGP`;
  const scroll = window.scrollY;
  const tab = UI.tab;
  const upd = NEWER ? `<div class="banner row"><span class="grow">A newer version of the app is available.</span><button class="btn small primary" data-act="reload">Reload</button></div>` : '';
  v.innerHTML = upd + (tab === 'plan' ? renderPlan() : tab === 'map' ? renderMapControls() : tab === 'compare' ? renderCompare() : tab === 'book' ? renderBook() : tab === 'fx' ? renderFx() : tab === 'places' ? renderPlaces() : renderCond());
  mw.hidden = tab !== 'map';
  document.body.classList.toggle('on-map', tab === 'map');
  if (tab === 'map') {
    if (typeof L === 'undefined') v.insertAdjacentHTML('beforeend', '<div class="banner">The map library could not load (offline before it was ever cached). Everything else works.</div>');
    else { initMap(); if (mapDirty) buildMarkers(); drawRoute(); setTimeout(() => MAP && MAP.invalidateSize(), 0); }
  }
  if (render.keepScroll) window.scrollTo(0, scroll);
  if (tab === 'compare' && UI.cmpFocus) {
    const td = document.querySelector(`[data-optcol="${CSS.escape(UI.cmpFocus)}"]`), wrap = $('.cmpwrap');
    if (td && wrap) wrap.scrollLeft = td.offsetLeft - 96;
    UI.cmpFocus = null;
  }
  render.keepScroll = true;
  saveUI();
}
function goTab(t) { if (t === 'places') setTimeout(fetchWiki, 0); UI.tab = t; render.keepScroll = false; render(); window.scrollTo(0, 0); }
function applyTheme() { if (UI.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', UI.theme); }

/* ---------- events ---------- */
function stopOp(date, fn) {
  const o = activeOpt(blockOf(date)); if (!o) return;
  const p = planOf(o, date, true); fn(p, o); changed();
}
document.addEventListener('click', e => {
  const tabBtn = e.target.closest('#tabs button'); if (tabBtn) return goTab(tabBtn.dataset.tab);
  const go = e.target.closest('[data-tab-go]'); if (go) return goTab(go.dataset.tabGo);
  const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) return;
  const a = el.dataset.act, date = el.dataset.date, i = +el.dataset.i;
  switch (a) {
    case 'toggle': UI.open[date] = !UI.open[date]; render(); break;
    case 'sup': stopOp(date, p => { const s = p.stops; [s[i - 1], s[i]] = [s[i], s[i - 1]]; }); break;
    case 'sdown': stopOp(date, p => { const s = p.stops; [s[i + 1], s[i]] = [s[i], s[i + 1]]; }); break;
    case 'srm': stopOp(date, p => p.stops.splice(i, 1)); break;
    case 'sugadd': stopOp(date, p => p.stops.splice(+el.dataset.pos, 0, { place: el.dataset.place })); toast('Added ' + placeName(el.dataset.place)); break;
    case 'suggall': (UI.suggAll = UI.suggAll || {})[date] = true; render(); break;
    case 'autofill': {
      const o = activeOpt(blockOf(date)); const before = JSON.parse(JSON.stringify(planOf(o, date, true).stops));
      const n = autoFill(date, o);
      UI.undo = { date, opt: o.id, stops: before };
      changed(); toast(n ? `Added ${n} stop${n > 1 ? 's' : ''}` : 'Nothing more fits'); break;
    }
    case 'undo': { const o = optById(UI.undo.opt); if (o) planOf(o, date, true).stops = UI.undo.stops; UI.undo = null; changed(); break; }
    case 'mapday': UI.mapDay = date; goTab('map'); break;
    case 'mapgo': UI.mapDay = date; if (UI.tab !== 'map') goTab('map'); else render(); break;
    case 'toplan': UI.open[date] = true; goTab('plan'); setTimeout(() => document.getElementById('day-' + date)?.scrollIntoView({ block: 'start' }), 0); break;
    case 'gocompare': UI.cmpBlock = el.dataset.block; goTab('compare'); break;
    case 'cmpblock': UI.cmpBlock = el.dataset.block; render(); break;
    case 'oactive': { const o = optById(el.dataset.id); S.blocks.find(b => b.id === o.block).active = o.id; changed(); break; }
    case 'oedit': { const o = optById(el.dataset.id), b = S.blocks.find(x => x.id === o.block); b.active = o.id; persist(); UI.open[b.from] = true; goTab('plan'); setTimeout(() => document.getElementById('day-' + b.from)?.scrollIntoView({ block: 'start' }), 0); break; }
    case 'odup': {
      const o = optById(el.dataset.id); let n = optsOf(o.block).length + 1, id;
      do id = o.block + (n++); while (optById(id));
      const c = JSON.parse(JSON.stringify(o)); c.id = id; c.name = o.name + ' (copy)';
      S.options.splice(S.options.indexOf(o) + 1, 0, c); changed(); toast('Copied as ' + id); break;
    }
    case 'autoplan': {
      const bid = el.dataset.block;
      el.disabled = true; el.textContent = 'Planning…';
      setTimeout(() => {
        const t0 = performance.now(), res = autoPlan(bid);
        if (!res) { el.disabled = false; el.textContent = 'Auto-plan'; alert('No combination of overnight stops fits your free time and travel limit. Try a higher max travel time, or allow flights in Settings.'); return; }
        S.options.push(res.opt); UI.cmpBlock = bid; UI.cmpFocus = res.opt.id; persist();
        toast(`Created ${res.opt.id} · tried ${res.tried} routes in ${Math.round(performance.now() - t0)} ms`);
        if (res.empty) toast(`${res.opt.id}: ${res.empty} day${res.empty > 1 ? 's' : ''} left free — nothing new within reach`);
        if (res.missing.length) setTimeout(() => alert(`${res.opt.id} couldn't fit these must-sees (in this block, within your free time and ${set('maxDriveH')} h/day travel):\n\n• ${res.missing.map(placeName).join('\n• ')}\n\nThey may fit in the other block, or with a higher driving limit.`), 300);
        goTab('compare');
      }, 30);
      break;
    }
    case 'onew': {
      const bid = el.dataset.block; let n = optsOf(bid).length + 1, id;
      do id = bid + (n++); while (optById(id));
      S.options.push({ id, block: bid, name: 'New option', note: '', days: {} });
      const b = S.blocks.find(x => x.id === bid); if (!b.active || !optById(b.active)) b.active = id;
      UI.cmpBlock = bid; UI.cmpFocus = id; changed(); break;
    }
    case 'odel': {
      const o = optById(el.dataset.id);
      if (!confirm(`Delete option ${o.id} · ${o.name}?`)) return;
      S.options.splice(S.options.indexOf(o), 1);
      const b = S.blocks.find(x => x.id === o.block); if (b.active === o.id) b.active = optsOf(b.id)[0]?.id || null;
      changed(); break;
    }
    case 'btoggle': UI.bkOpen = UI.bkOpen || {}; UI.bkOpen[el.dataset.id] = !UI.bkOpen[el.dataset.id]; render(); break;
    case 'bnew': { const nid = uid('b'); (UI.bkOpen = UI.bkOpen || {})[nid] = true; S.bookings.push({ id: nid, item: 'New booking', type: 'other', option: null, status: 'todo', est: 0, actual: null, seasonal: '', note: '' }); changed(); break; }
    case 'bdel': if (confirm('Delete “' + S.bookings[i].item + '”?')) { S.bookings.splice(i, 1); changed(); } break;
    case 'check': S.checks[i] = el.checked; persist(); break;
    case 'setbool': S.settings[el.dataset.k] = el.checked; SUN_CACHE.clear(); changed(); break;
    case 'theme': UI.theme = el.dataset.v; applyTheme(); render(); break;
    case 'export': exportJSON(); break;
    case 'reload': location.reload(); break;
    case 'pmode': UI.pmode = el.dataset.v; render(); break;
    case 'mcat': { const f = mf(), c = el.dataset.v; f.hide = f.hide.includes(c) ? f.hide.filter(x => x !== c) : [...f.hide, c]; mapDirty = true; render(); break; }
    case 'mcatonly': { const f = mf(), c = el.dataset.v; f.hide = [...new Set([...Object.keys(CAT_INFO), ...S.places.map(p => p.cat), ...(OSM ? OSM.items.map(a => a[4]) : [])])].filter(x => x !== c); mapDirty = true; render(); break; }
    case 'mgroup': { const f = mf(), g = CAT_GROUPS.find(x => x.id === el.dataset.v); const cs = g ? Object.keys(g.cats) : [];
      const allShown = cs.every(c => !f.hide.includes(c)); f.hide = allShown ? [...new Set([...f.hide, ...cs])] : f.hide.filter(c => !cs.includes(c)); mapDirty = true; render(); break; }
    case 'mcatall': mf().hide = []; mapDirty = true; render(); break;
    case 'mcatnone': mf().hide = [...new Set([...Object.keys(CAT_INFO), ...S.places.map(p => p.cat), ...(OSM ? OSM.items.map(a => a[4]) : [])])]; mapDirty = true; render(); break;
    case 'msrc': { const f = mf(); f[el.dataset.v] = !f[el.dataset.v]; if (el.dataset.v === 'osm') UI.osmLayer = f.osm; mapDirty = true; render(); break; }
    case 'mmust': mf().must = !mf().must; mapDirty = true; render(); break;
    case 'osmload': loadOSM([el.dataset.v]); break;
    case 'osmtrip': loadOSM(osmTripAreas().filter(id => !OSM_STORE.areas[id])); break;
    case 'osmrm': if (confirm('Remove the downloaded sights for this region? Places you added to My places stay.')) osmRemove(el.dataset.v); break;
    case 'osmcat': UI.osmCat = el.dataset.v; UI.osmN = 40; render(); break;
    case 'osmmore': UI.osmN = (UI.osmN || 40) + 60; $('#osmlist').innerHTML = osmListHTML(); break;
    case 'osmadd': {
      const a = OSM && OSM.items.find(x => x[0] === el.dataset.osm); if (!a) break;
      const p = promoteOSM(osmObj(a)); MAP && MAP.closePopup(); changed(); fetchWiki(); toast(`Added ${p.name} to My places`); break;
    }
    case 'osmmap': {
      const id = el.dataset.osm, a = OSM && OSM.items.find(x => x[0] === id); if (!a) break;
      mf().osm = true; UI.osmLayer = true; if (!catShown(a[4])) mf().hide = mf().hide.filter(c => c !== a[4]); mf().must = false; goTab('map');
      setTimeout(() => { if (!MAP) return; MAP.setView([a[2], a[3]], 11); refreshOsmView(); OSM_MARKERS[id]?.openPopup(); }, 60);
      break;
    }
    case 'tripedit': UI.editTrip = !UI.editTrip; render(); break;
    case 'tripsave': if (setTripDates($('#trip-from').value, $('#trip-to').value)) { UI.editTrip = false; mapDirty = true; changed(); toast('Dates updated'); } break;
    case 'wikiretry': IMG_W = null; try { localStorage.removeItem('egypt-imgw'); } catch (e) { } WIKI = {}; for (const k in IMG_FAIL) delete IMG_FAIL[k]; try { localStorage.removeItem(LS_WIKI); } catch (e) { } fetchWiki(); break;
    case 'pick': { const id = el.dataset.place, v = el.dataset.v; S.picks[id] = S.picks[id] === v ? undefined : v; if (!S.picks[id]) delete S.picks[id]; changed(); break; }
    case 'pfilter': UI.pf = { ...(UI.pf || {}), [el.dataset.k]: el.dataset.v }; render(); break;
    case 'pinfo': UI.pf = {}; UI.pmode = 'mine'; MAP && MAP.closePopup(); goTab('places'); setTimeout(() => document.getElementById('poi-' + el.dataset.place)?.scrollIntoView({ block: 'start' }), 0); break;
    case 'pmap': { const id = el.dataset.place; mf().mine = true; mf().must = false; mf().hide = mf().hide.filter(c => c !== place(id)?.cat); mapDirty = true; goTab('map'); setTimeout(() => { if (MAP && MARKERS[id]) { MAP.setView([place(id).lat, place(id).lon], 10); MARKERS[id].openPopup(); } }, 50); break; }
    case 'fxrefresh': fetchRate(true); break;
    case 'fxset': UI.fxEgp = +el.dataset.v; render(); break;
    case 'import': $('#importfile').click(); break;
    case 'reset': resetToFile(); break;
    case 'pending-load': S = normalize(PENDING.file); BASE_HASH = PENDING.hash; PENDING = null; DIRTY = false; reindex(); mapDirty = true; persist(false); render(); break;
    case 'pending-keep': BASE_HASH = PENDING.hash; PENDING = null; persist(); render(); break;
    case 'addmode': addMode = !addMode; render(); if (addMode) toast('Tap the map where the place is'); break;
    case 'madd': stopOp(UI.mapDay, p => p.stops.push({ place: el.dataset.place })); MAP && MAP.closePopup(); toast('Added to ' + dateLabel(UI.mapDay)); break;
    case 'msleep': stopOp(UI.mapDay, p => p.sleep = el.dataset.place); MAP && MAP.closePopup(); toast('Night set: ' + placeName(el.dataset.place)); break;
  }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, date = el.dataset.date, i = +el.dataset.i, v = el.value;
  const d = date && dayObj(date);
  switch (a) {
    case 'dstate': d.state = v; if (v === 'partial') { d.mode = d.mode || 'until'; d.time = d.time || '17:00'; } recomputeBlocks(); changed(); break;
    case 'dmode': d.mode = v; changed(); break;
    case 'dtime': if (v) { d.time = v; changed(); } break;
    case 'dlabel': d.label = v; changed(); break;
    case 'dmaxdrive': if (v === '') delete d.maxDriveH; else d.maxDriveH = Math.max(0, +v); changed(); break;
    case 'useopt': S.blocks.find(b => b.id === el.dataset.block).active = v; changed(); break;
    case 'smin': stopOp(date, p => { p.stops[i].min = v === '' ? undefined : Math.max(0, +v); }); break;
    case 'snote': stopOp(date, p => { p.stops[i].note = v || undefined; }); break;
    case 'sadd': if (v) stopOp(date, p => p.stops.push(v === '_break' ? { place: '_break', min: 30, note: 'Lunch' } : { place: v })); break;
    case 'sleep': stopOp(date, p => { p.sleep = v || null; }); break;
    case 'depart': stopOp(date, p => { p.depart = v || null; }); break;
    case 'mapdaysel': UI.mapDay = v; render(); break;
    case 'osmnear': UI.osmNear = v; UI.osmN = 40; $('#osmlist').innerHTML = osmListHTML(); saveUI(); break;
    case 'padd': if (v) { stopOp(v, p => p.stops.push({ place: el.dataset.place })); toast(`Added to ${dateLabel(v)}`); } break;
    case 'oname': optById(el.dataset.id).name = v; changed(); break;
    case 'onote': optById(el.dataset.id).note = v; changed(); break;
    case 'bset': {
      const x = S.bookings[i], k = el.dataset.k;
      x[k] = (k === 'est' || k === 'actual') ? (v === '' ? null : +v) : (k === 'option' ? (v || null) : v);
      changed(); break;
    }
    case 'set': {
      const k = el.dataset.k; S.settings[k] = el.type === 'number' ? (v === '' ? DEFAULT_SETTINGS[k] : +v) : v; if (k === 'fxManual' && !(+v > 0)) S.settings[k] = null; changed(); break;
    }
  }
});
document.addEventListener('input', e => {
  if (e.target.dataset && e.target.dataset.fx) fxInput(e.target);
  if (e.target.id === 'osmq') { UI.osmQ = e.target.value; UI.osmN = 40; clearTimeout(document.osmT); document.osmT = setTimeout(() => { $('#osmlist').innerHTML = osmListHTML(); saveUI(); }, 150); }
});

$('#importfile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importJSON(f); e.target.value = ''; });
const updOnline = () => { $('#offline').hidden = navigator.onLine; };
addEventListener('online', () => { updOnline(); fetchRate(); fetchRoadMatrix(); fetchWiki(); }); addEventListener('offline', updOnline); updOnline();
setInterval(() => { if (S && UI.tab === 'plan' && S.days.find(d => d.date === todayISO()) && !document.activeElement?.matches('input,select,textarea')) render(); }, 5 * 60 * 1000);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // when a new version of the app takes over, reload once so you're not left running the old code
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !document.activeElement?.matches('input,textarea')) location.reload(); });
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => { });
}
boot().then(() => { fetchRate(); fetchRoadMatrix(); fetchWiki(); checkUpdate(); });
// newer app.js on the server than the code running here? (offer a reload; nothing is lost, edits are saved locally)
async function checkUpdate() {
  if (!navigator.onLine) return;
  try {
    const t = await (await fetch('app.js', { cache: 'no-cache' })).text(), m = /const APP_BUILD = '([^']+)'/.exec(t);
    if (m && m[1] !== APP_BUILD && m[1] !== NEWER) { NEWER = m[1]; render(); }
  } catch (e) { }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
setInterval(checkUpdate, 15 * 60 * 1000);
setInterval(() => fetchRate(), 30 * 60 * 1000);
