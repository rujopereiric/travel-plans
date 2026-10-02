'use strict';
/* Iceland free-days planner — vanilla JS, no build step.
   All times are minutes after midnight, Iceland time (= UTC, no DST). */

const LS_STATE = 'iceland-planner-v1';
const LS_UI = 'iceland-planner-ui';
const AX0 = 5 * 60, AX1 = 23 * 60;           // timeline axis 05:00–23:00
const DEFAULT_SETTINGS = {
  speedKmh: 75, roadFactor: 1.35, winterBufferPct: 15, fuelLper100: 7.5, fuelIskPerL: 330,
  eurIsk: 145, slackMin: 30, darkDriveMin: 30, earliestDepart: '07:00', localSun: true, maxDriveH: 5, nightIsk: 10000
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
const isk = n => (Math.round(n || 0)).toLocaleString('en-GB') + ' ISK';
const eur = n => '≈ €' + Math.round((n || 0) / (set('eurIsk') || 145)).toLocaleString('en-GB');
const dateLabel = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowMin = () => { const d = new Date(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
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
  const r = { rise: event(90.833, -1), set: event(90.833, 1), dawn: event(96, -1), dusk: event(96, 1) };
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
const maxDriveOf = d => Math.round(((d && d.maxDriveH != null && d.maxDriveH !== '') ? +d.maxDriveH : +set('maxDriveH')) * 60);
function stateText(d) {
  if (d.state === 'booked') return 'Booked';
  if (d.state === 'partial') return (d.mode === 'from' ? 'Free from ' : 'Free until ') + (d.time || '?');
  return 'Free';
}

/* ---------- driving ---------- */
function haversine(a, b) {
  const R = 6371, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const DRIVE_CACHE = new Map();
function drive(a, b) {
  if (!a || !b || a === b) return { km: 0, min: 0, est: false };
  const key = a + '|' + b;
  if (!DRIVE_CACHE.has(key)) DRIVE_CACHE.set(key, driveRaw(a, b));
  return DRIVE_CACHE.get(key);
}
function driveRaw(a, b) {
  const ov = (S.drives || []).find(x => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
  let km, min, est = false;
  if (ov) { km = ov[2]; min = ov[3]; }
  else {
    const pa = place(a), pb = place(b);
    if (!pa || !pb) return { km: 0, min: 0, est: true };
    km = haversine(pa, pb) * set('roadFactor'); min = km / set('speedKmh') * 60; est = true;
  }
  return { km: Math.round(km), min: Math.round(min * (1 + set('winterBufferPct') / 100)), est };
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
    driveMin: 0, driveKm: 0, stopMin: 0, darkDrive: 0, darkEve: 0, need: 0 };
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
    // aim to reach the first stop at (local) sunrise, but not before the earliest start or your free time
    const early = toMin(set('earliestDepart')) ?? 420;
    const ideal = seq.length ? sunAt(date, seq[0].pid).rise - seq[0].leg.min : early;
    dep = Math.ceil(Math.max(free[0], ideal, early) / 5) * 5;
    dep = Math.round(dep / 5) * 5;
  }
  r.depart = dep;

  // walk the day
  let t = dep, firstArr = null, lastDep = null;
  const pushDrive = (from, to, leg) => {
    if (!leg.min && from === to) return;
    const it = { type: 'drive', from, to, start: t, end: t + leg.min, km: leg.km, min: leg.min, est: leg.est };
    // 'dark' = outside civil twilight; evening dark driving is what we warn about
    it.dark = overlapOutside(it.start, it.end, sun.dawn, sun.dusk);
    it.darkEve = Math.max(0, it.end - Math.max(it.start, sun.dusk));
    r.items.push(it); r.driveMin += leg.min; r.driveKm += leg.km; r.darkDrive += it.dark; r.darkEve += it.darkEve; t += leg.min;
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
  r.maxDrive = maxDriveOf(d);
  if (r.driveMin > r.maxDrive) issue('bad', `${dur(r.driveMin)} of driving is over your ${dur(r.maxDrive)} limit for this day.`);

  // softer warnings
  if (r.darkEve > 0) {
    const tail = r.items.filter(i => i.type === 'drive' && i.darkEve > 0).pop();
    issue(r.darkEve > set('darkDriveMin') ? 'tight' : 'info', `${dur(r.darkEve)} of driving after dark — reach ${placeName(tail.to)} at ${hhmm(tail.end)}; sunset ${hhmm(sun.set)}, dark from ${hhmm(sun.dusk)}.`);
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
  if (noDrive) issue('info', `${noDrive} leg${noDrive > 1 ? 's' : ''} use a straight-line estimate (×${set('roadFactor')} at ${set('speedKmh')} km/h). Add exact values to "drives" in data.json.`);

  r.status = r.issues.reduce((s, [l]) => (RANK[l] || 0) > RANK[s] ? l : s, 'ok');
  return r;
}

/* ---------- suggestions & auto-fill ---------- */
const withStops = (opt, date, stops) => {
  const p = opt.days[date] || { stops: [], sleep: null };
  return { ...opt, days: { ...opt.days, [date]: { ...p, stops } } };
};
const prio = p => p.priority ?? 2;
function suggestable(opt, date) {
  // skip places already on this option or on the selected plan of any other block (already seen on the trip)
  const used = new Set();
  const opts = [opt, ...S.blocks.map(activeOpt).filter(x => x && x.block !== opt.block)];
  for (const o of opts) for (const p of Object.values(o.days)) for (const st of p.stops || []) used.add(st.place);
  return S.places.filter(p => !used.has(p.id) && p.suggest !== false && p.id !== S.trip.home && (p.visit ?? 45) > 0);
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
  for (const c of suggestable(opt, date)) {
    let best = null;
    for (let pos = 0; pos <= stops.length; pos++) {
      const ns = [...stops.slice(0, pos), { place: c.id }, ...stops.slice(pos)];
      const r = simulate(date, withStops(opt, date, ns));
      if (r.status === 'bad') continue;
      const cand = { place: c.id, pos, r, extra: r.driveMin - base.driveMin, visit: c.visit ?? 45, status: r.status };
      if (!best || RANK[cand.status] < RANK[best.status] || (cand.status === best.status && cand.extra < best.extra)) best = cand;
    }
    if (best) out.add.push(best);
  }
  out.add.sort((a, b) => RANK[a.status] - RANK[b.status] || a.extra - b.extra);
  return out;
}
// Greedy: keep adding the highest-priority, cheapest-to-reach place while the day stays "fits".
function autoFill(date, opt) {
  let added = 0;
  for (let n = 0; n < 10; n++) {
    const sg = suggestFor(date, opt).add.filter(x => x.status === 'ok');
    if (!sg.length) break;
    sg.sort((a, b) => (prio(place(b.place)) * 60 - b.extra) - (prio(place(a.place)) * 60 - a.extra));
    const pick = sg[0], p = planOf(opt, date, true);
    p.stops.splice(pick.pos, 0, { place: pick.place });
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
    for (const st of (opt.days[date]?.stops || [])) if (!seen.has(st.place)) { seen.add(st.place); score += prio(place(st.place) || {}) ** 2 * 10; }
    if (r.status === 'tight') score -= 15;
    drive += r.driveMin;
  }
  const nightsMoved = dates.slice(1).filter((d, i) => opt.days[d]?.sleep !== opt.days[dates[i]]?.sleep).length;
  return score - drive / 10 - nightsMoved * 5;
}
function autoPlan(bid) {
  const b = S.blocks.find(x => x.id === bid), dates = blockDates(b).filter(d => freeWin(dayObj(d)));
  if (!dates.length) return null;
  const cur = activeOpt(b), last = dates[dates.length - 1];
  const finalEnd = (cur && cur.days[last]?.sleep) || S.trip.home;
  const cands = sleepCandidates();
  let best = null, tried = 0;
  const rec = (i, prevSleep, seqs) => {
    if (i === dates.length - 1) { tryPlan([...seqs, finalEnd]); return; }
    for (const c of cands) {
      // prune: the bare transfer has to fit under that day's driving limit
      if (drive(prevSleep, c).min > maxDriveOf(dayObj(dates[i]))) continue;
      rec(i + 1, c, [...seqs, c]);
    }
  };
  const tryPlan = sleeps => {
    if (drive(sleeps[sleeps.length - 2] || S.trip.home, finalEnd).min > maxDriveOf(dayObj(last))) return;
    tried++;
    const opt = { id: '_auto', block: bid, name: '', note: '', days: {} };
    dates.forEach((d, k) => { opt.days[d] = { stops: [], sleep: sleeps[k] }; });
    for (const d of dates) { if (simulate(d, opt).status === 'bad') return; autoFill(d, opt); }
    const sc = scoreOption(opt, dates);
    if (sc != null && (!best || sc > best.score)) best = { score: sc, opt };
  };
  rec(0, S.trip.home, []);
  if (!best) return null;
  let n = optsOf(bid).length + 1, id;
  do id = bid + (n++); while (optById(id));
  const o = best.opt;
  o.id = id;
  o.name = `Auto-plan (≤${set('maxDriveH')}h driving/day)`;
  const far = Object.values(o.days).flatMap(p => p.stops.map(s => s.place)).sort((x, y) => drive(S.trip.home, y).km - drive(S.trip.home, x).km)[0];
  o.note = `Generated ${new Date().toISOString().slice(0, 10)} from ${tried} overnight combinations.` + (far ? ` Furthest: ${placeName(far)}.` : '');
  return { opt: o, tried };
}

/* ---------- persistence ---------- */
function normalize(s) {
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  for (const k of ['days', 'blocks', 'options', 'regions', 'places', 'drives', 'bookings', 'links', 'checklist']) if (!Array.isArray(s[k])) s[k] = [];
  s.checks = s.checks || {};
  s.days.sort((a, b) => a.date < b.date ? -1 : 1);
  for (const o of s.options) { o.days = o.days || {}; for (const p of Object.values(o.days)) p.stops = p.stops || []; }
  for (const b of s.bookings) if (!b.id) b.id = uid('b');
  return s;
}
function reindex() { PLACE_IDX = {}; for (const p of S.places) PLACE_IDX[p.id] = p; DRIVE_CACHE.clear(); }
function persist(dirty = true) {
  if (dirty) DIRTY = true;
  try { localStorage.setItem(LS_STATE, JSON.stringify({ state: S, base: BASE_HASH, dirty: DIRTY, saved: new Date().toISOString() })); }
  catch (e) { toast('Could not save to this browser — export to keep your edits'); }
}
function saveUI() { try { localStorage.setItem(LS_UI, JSON.stringify(UI)); } catch (e) { } }
function changed() { DRIVE_CACHE.clear(); persist(true); render(); }

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
      if (!DIRTY) { S = file; BASE_HASH = fh; } else PENDING = { file, hash: fh };
    }
  } else if (file) { S = file; BASE_HASH = fh; }
  if (S) { S = normalize(S); reindex(); persist(DIRTY); }
  if (!UI.cmpBlock && S) UI.cmpBlock = S.blocks[0]?.id;
  if (S && !UI.mapDay) UI.mapDay = firstPlanDay();
  const t = todayISO();
  if (S && dayObj(t) && UI.lastAutoOpen !== t) { UI.open[t] = true; UI.lastAutoOpen = t; }
  render();
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
  a.href = URL.createObjectURL(blob); a.download = `iceland-plan-${todayISO()}.json`;
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
  let h = '';
  if (PENDING) h += `<div class="banner"><b>data.json has changed</b> since your local copy was made, and you have local edits.
    <div class="row" style="margin-top:8px"><button class="btn small primary" data-act="pending-load">Use data.json</button>
    <button class="btn small" data-act="pending-keep">Keep my edits</button><button class="btn small" data-act="export">Export mine first</button></div></div>`;
  h += `<div class="legend"><span><i style="background:var(--day)"></i>Daylight</span><span><i style="background:var(--twilight)"></i>Twilight</span>
    <span><i style="background:repeating-linear-gradient(135deg,#555 0 3px,#999 3px 6px)"></i>Not free</span>
    <span><i style="box-shadow:inset 0 0 0 2px var(--accent)"></i>Usable</span><span><i style="background:var(--accent)"></i>Stop</span><span><i style="background:var(--drive);opacity:.6"></i>Drive</span></div>`;
  let lastBlock = undefined;
  for (const d of S.days) {
    const b = blockOf(d.date) || null;
    if ((b && b.id) !== (lastBlock && lastBlock.id)) {
      h += `<h2>${b ? esc(b.name) : 'Training'}</h2>`;
      if (b) h += blockSummary(b);
    }
    lastBlock = b;
    h += dayCard(d, b);
  }
  h += `<p class="tiny muted">Sunrise/sunset computed for Reykjavík (${S.trip.sunLat}, ${S.trip.sunLon})${set('localSun') ? '; stops are checked against the local sun at each place' : ''}. Iceland is UTC all year. Drive times include a ${set('winterBufferPct')}% winter buffer.</p>`;
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
    sum += ` · drive ${dur(r.driveMin)}`;
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
    ${d.state !== 'booked' ? `<label class="f">Max driving (h)<input type="number" min="0" step="0.5" value="${d.maxDriveH ?? ''}" placeholder="${set('maxDriveH')}" data-act="dmaxdrive" data-date="${d.date}"></label>` : ''}</div>`;
  if (!b) return h + `<p class="small muted">This day isn't in a planning block. Add a block covering it in data.json to plan stops.</p>`;
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
    if (it.type === 'drive') { h += `<div class="leg ${it.darkEve ? 'dark' : ''}">🚗 ${hhmm(it.start)} drive ${dur(it.min)} · ${it.km} km${it.est ? ' (est.)' : ''}${it.dark ? ` · ${dur(it.dark)} in the dark` : ''}</div>`; continue; }
    const s = it.s, i = it.idx, n = plan.stops.length;
    h += `<li><div class="row"><span class="t">${hhmm(it.arr)}–${hhmm(it.dep)}</span><b class="grow">${esc(placeName(s.place))}</b>
        ${it.level !== 'ok' ? `<span class="badge ${it.level}">${it.level === 'bad' ? 'dark' : 'twilight'}</span>` : ''}</div>
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
      <span>Driving</span><b>${dur(r.driveMin)} · ${r.driveKm} km <span class="muted" style="font-weight:400">(limit ${dur(r.maxDrive)})</span></b>
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
    return h + `<p class="small muted" style="margin:0">Removing a single stop isn't enough to make this day fit. Options: sleep somewhere closer, raise this day's max driving, or use <b>Auto-plan</b> for the block.</p>`;
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
      <div class="tiny muted">+${dur(Math.max(0, x.extra))} drive · ${dur(x.visit)} visit · ${esc(after)} · back ${hhmm(x.r.arrive)}</div></span>
      <span class="badge ${x.status}">${x.status === 'ok' ? '✓' : '!'}</span>
      <button class="btn small" data-act="sugadd" data-date="${date}" data-place="${esc(x.place)}" data-pos="${x.pos}">Add</button></div>`;
  }).join('');
  if (sg.add.length > show.length) h += `<button class="btn small" data-act="suggall" data-date="${date}">Show all ${sg.add.length}</button>`;
  return h;
}
function issuesHTML(r) {
  if (!r.issues.length) return r.status === 'ok' ? `<ul class="issues"><li class="ok">Fits inside the usable window.</li></ul>` : '';
  return `<ul class="issues">${r.issues.map(([l, m]) => `<li class="${l}">${esc(m)}</li>`).join('')}</ul>`;
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
    if (sl && sl !== S.trip.home && sl !== 'kef') st.nights.push(sl);
    for (const it of r.items) if (it.type === 'stop') {
      const dkm = drive(S.trip.home, it.pid).km;
      if (!st.far || dkm > st.far.km) st.far = { pid: it.pid, km: dkm };
    }
  }
  st.fuel = st.driveKm * set('fuelLper100') / 100 * set('fuelIskPerL');
  const own = S.bookings.filter(x => x.option === o.id && x.status !== 'cancelled');
  st.book = own.reduce((a, x) => a + (+(x.actual ?? x.est) || 0), 0);
  // nights away without a hostel booking linked to this option are costed at the per-night estimate
  st.unbookedNights = Math.max(0, st.nights.length - own.filter(x => x.type === 'hostel').length);
  st.book += st.unbookedNights * set('nightIsk');
  st.cost = st.fuel + st.book;
  return st;
}
function renderCompare() {
  if (!S.blocks.length) return '<p class="muted">No blocks defined in data.json.</p>';
  const b = S.blocks.find(x => x.id === UI.cmpBlock) || S.blocks[0];
  const opts = optsOf(b.id), ds = blockDates(b);
  let h = `<div class="row" style="margin-bottom:10px"><div class="seg">${S.blocks.map(x => `<button data-act="cmpblock" data-block="${x.id}" aria-pressed="${x.id === b.id}">${esc(x.name.split('·')[0].trim())}</button>`).join('')}</div>
    <span class="grow"></span><button class="btn small primary" data-act="autoplan" data-block="${b.id}">Auto-plan</button><button class="btn small" data-act="onew" data-block="${b.id}">+ New</button></div>
    <p class="small muted" style="margin-top:0">${esc(b.name)} · ${dateLabel(b.from)} – ${dateLabel(b.to)}. Costs are fuel plus bookings linked to that option (shared bookings like car rental are left out).</p>`;
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
        <div class="tiny muted">${r.driveMin ? 'drive ' + dur(r.driveMin) + ' · ' : ''}sleep ${esc(placeName(r.end || S.trip.home))}</div>`;
    });
  });
  h += row('Total driving', (o, s) => `<b class="${best(s.driveMin, 'driveMin')}">${dur(s.driveMin)}</b><div class="tiny muted">${s.driveKm} km</div>`);
  h += row('After dark', (o, s) => `<span class="${best(s.darkDrive, 'darkDrive')}">${dur(s.darkDrive)}</span> <span class="tiny muted">evening driving</span>`);
  h += row('Time at stops', (o, s) => `<span class="${best(s.stopMin, 'stopMin', true)}">${dur(s.stopMin)}</span>`);
  h += row('Furthest', (o, s) => s.far ? `${esc(placeName(s.far.pid))}<div class="tiny muted">${s.far.km} km from ${esc(placeName(S.trip.home))}</div>` : '—');
  h += row('Nights away', (o, s) => s.nights.length ? `${s.nights.length}<div class="tiny muted">${s.nights.map(placeName).map(esc).join(', ')}</div>` : '0');
  h += row('Fuel', (o, s) => `${isk(s.fuel)}<div class="tiny muted">${eur(s.fuel)}</div>`);
  h += row('Bookings', (o, s) => `${isk(s.book)}<div class="tiny muted">${S.bookings.filter(x => x.option === o.id && x.status !== 'cancelled').length} items${s.unbookedNights ? ` + ${s.unbookedNights} night${s.unbookedNights > 1 ? 's' : ''} at ${isk(set('nightIsk'))} est.` : ''}</div>`);
  h += row('<b>Total</b>', (o, s) => `<b class="${best(s.cost, 'cost')}">${isk(s.cost)}</b><div class="tiny muted">${eur(s.cost)}</div>`);
  h += row('Note', o => `<textarea data-act="onote" data-id="${esc(o.id)}" rows="2">${esc(o.note || '')}</textarea>`);
  h += `</tbody></table></div>`;
  h += `<p class="tiny muted">Fuel: ${set('fuelLper100')} L/100 km × ${set('fuelIskPerL')} ISK/L. Green = best in row. “Edit” selects the option and opens it in the planner.</p>`;
  return h;
}

/* ---------- render: bookings tab ---------- */
const BK_STATUS = { todo: 'To book', booked: 'Booked', paid: 'Paid', cancelled: 'Cancelled / not needed' };
const BK_TYPES = ['car', 'hostel', 'tour', 'ice cave', 'northern lights', 'food', 'other'];
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
  const fuel = S.blocks.reduce((a, b) => { const o = activeOpt(b); return a + (o ? optionStats(o).fuel : 0); }, 0);
  let h = `<div class="totals">
    <div class="tile"><div class="l">Running total</div><div class="v">${isk(total)}</div><div class="tiny muted">${eur(total)} · actual where known</div></div>
    <div class="tile"><div class="l">Estimated</div><div class="v">${isk(est)}</div><div class="tiny muted">${eur(est)}</div></div>
    <div class="tile"><div class="l">Actual so far</div><div class="v">${isk(act)}</div><div class="tiny ${delta > 0 ? '' : 'muted'}" style="${delta > 0 ? 'color:var(--bad)' : ''}">${delta ? (delta > 0 ? '+' : '−') + isk(Math.abs(delta)) + ' vs estimate' : 'on estimate'}</div></div>
    <div class="tile"><div class="l">Booked / paid</div><div class="v">${isk(committed)}</div><div class="tiny muted">${todo} still to book</div></div>
    <div class="tile"><div class="l">+ Fuel (selected plans)</div><div class="v">${isk(fuel)}</div><div class="tiny muted">all-in ${isk(total + fuel)}</div></div>
  </div>
  <div class="row" style="margin-bottom:10px"><span class="small muted grow">Bookings tied to an unselected option are greyed out and left out of the totals.</span>
  <button class="btn small primary" data-act="bnew">+ Add</button></div>`;
  S.bookings.forEach((x, i) => {
    const [c, why] = bookingCounted(x);
    if (c) run += +(x.actual ?? x.est) || 0;
    const open = UI.bkOpen && UI.bkOpen[x.id];
    const amt = x.actual != null ? isk(x.actual) : isk(x.est) + '<span class="tiny muted"> est.</span>';
    h += `<div class="card bkrow ${c ? '' : 'dim'}"><button class="bkhead" data-act="btoggle" data-id="${esc(x.id)}" aria-expanded="${!!open}">
        <div class="row"><b class="grow">${esc(x.item)}</b><span class="tabular">${amt}</span></div>
        <div class="row tiny" style="margin-top:3px"><span class="chip st-${esc(x.status)}">${esc(BK_STATUS[x.status] || x.status)}</span>
          <span class="chip">${x.option ? esc(x.option) : 'shared'}</span><span class="muted grow">${c ? 'running ' + isk(run) : esc(why)}</span></div>
        ${x.seasonal ? `<div class="seasonal" style="margin-top:6px">Season: ${esc(x.seasonal)}</div>` : ''}
      </button>`;
    if (open) h += `<div class="bk" style="margin-top:10px">
        <label class="f full">Item<input type="text" value="${esc(x.item)}" data-act="bset" data-k="item" data-i="${i}"></label>
        <label class="f">Type<select data-act="bset" data-k="type" data-i="${i}">${BK_TYPES.map(t => `<option ${t === x.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f">Status<select data-act="bset" data-k="status" data-i="${i}">${Object.entries(BK_STATUS).map(([k, v]) => `<option value="${k}" ${k === x.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f full">Applies to<select data-act="bset" data-k="option" data-i="${i}"><option value="">All plans (shared)</option>
          ${S.options.map(o => `<option value="${esc(o.id)}" ${o.id === x.option ? 'selected' : ''}>${esc(o.id)} · ${esc(o.name)}</option>`).join('')}</select></label>
        <label class="f">Estimate (ISK)<input type="number" min="0" step="500" value="${x.est ?? ''}" data-act="bset" data-k="est" data-i="${i}"></label>
        <label class="f">Actual (ISK)<input type="number" min="0" step="1" value="${x.actual ?? ''}" data-act="bset" data-k="actual" data-i="${i}"></label>
        <label class="f full">Season note<input type="text" value="${esc(x.seasonal || '')}" data-act="bset" data-k="seasonal" data-i="${i}" placeholder="e.g. Nov–Mar only"></label>
        <label class="f full">Notes / ref<input type="text" value="${esc(x.note || '')}" data-act="bset" data-k="note" data-i="${i}"></label>
        <div class="full row"><span class="grow"></span><button class="btn small danger" data-act="bdel" data-i="${i}">Delete booking</button></div>
      </div>`;
    else if (x.note) h += `<div class="tiny muted" style="margin-top:4px">${esc(x.note)}</div>`;
    h += `</div>`;
  });
  return h;
}

/* ---------- render: conditions tab ---------- */
function renderCond() {
  let h = `<h2>Check before you drive</h2><div class="links">${S.links.map(l => `<a class="card" href="${esc(l.url)}" target="_blank" rel="noopener">
    <div class="row"><b>${esc(l.name)}</b><span class="grow"></span><span class="tiny muted">${esc(l.host || new URL(l.url).host)} ↗</span></div>
    ${l.note ? `<div class="small muted">${esc(l.note)}</div>` : ''}</a>`).join('')}</div>
    <p class="small"><b>Emergency: 112.</b> Road info line: 1777.</p>
    <h2>Winter driving checklist</h2><div class="card">${S.checklist.map((c, i) => `<label class="check"><input type="checkbox" data-act="check" data-i="${i}" ${S.checks[i] ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}</div>
    <h2>Daylight in Reykjavík</h2><div class="card"><table class="sun"><thead><tr><th>Day</th><th>Rise</th><th>Set</th><th>Length</th><th>Δ</th><th>Dusk*</th></tr></thead><tbody>`;
  let prev = null;
  for (const d of S.days) {
    const s = sunHome(d.date);
    h += `<tr${d.date === todayISO() ? ' style="font-weight:700"' : ''}><td>${dateLabel(d.date)}</td><td>${hhmm(s.rise)}</td><td>${hhmm(s.set)}</td><td>${dur(s.len)}</td><td class="muted">${prev ? '−' + Math.round(prev - s.len) + 'm' : ''}</td><td class="muted">${hhmm(s.dusk)}</td></tr>`;
    prev = s.len;
  }
  h += `</tbody></table><div class="tiny muted" style="margin-top:6px">*End of civil twilight — usable light for walking, not for driving unfamiliar roads.</div></div>`;
  const num = (k, label, step = 1) => `<label class="f">${label}<input type="number" step="${step}" value="${esc(set(k))}" data-act="set" data-k="${k}"></label>`;
  h += `<h2>Settings</h2><div class="card"><div class="row">
      ${num('speedKmh', 'Avg speed (km/h)')}${num('roadFactor', 'Road factor', 0.05)}${num('winterBufferPct', 'Winter buffer %')}
      ${num('maxDriveH', 'Max driving/day (h)', 0.5)}${num('slackMin', 'Min. spare (min)', 5)}${num('darkDriveMin', 'Dark-drive warn (min)', 5)}
      <label class="f">Earliest auto start<input type="time" value="${esc(set('earliestDepart'))}" data-act="set" data-k="earliestDepart"></label>
      ${num('nightIsk', 'Unbooked night (ISK)', 500)}${num('fuelLper100', 'Fuel L/100 km', 0.1)}${num('fuelIskPerL', 'Fuel ISK/L', 5)}${num('eurIsk', 'ISK per €', 1)}
    </div>
    <label class="check" style="border:0"><input type="checkbox" data-act="setbool" data-k="localSun" ${set('localSun') ? 'checked' : ''}><span>Check each stop against its own local sunrise/sunset (sun sets ~25 min earlier at Jökulsárlón than in Reykjavík)</span></label>
    <label class="f">Theme<div class="seg">${['auto', 'light', 'dark'].map(t => `<button data-act="theme" data-v="${t}" aria-pressed="${UI.theme === t}">${t}</button>`).join('')}</div></label>
    </div>
    <h2>Your data</h2><div class="card">
      <p class="small" style="margin-top:0">Edits are saved in this browser${DIRTY ? ' (you have local changes)' : ''}. Export to keep a copy — the file has the same format as <code>data.json</code>, so you can drop it in as the new data file.</p>
      <div class="row"><button class="btn primary" data-act="export">Export JSON</button><button class="btn" data-act="import">Import JSON</button><button class="btn danger" data-act="reset">Reset to data.json</button></div>
    </div>`;
  return h;
}

/* ---------- render: map tab ---------- */
let MAP = null, mapLayers = null, routeLayer = null, mapDirty = true, addMode = false;
function renderMapControls() {
  const days = S.days.filter(d => blockOf(d.date) && d.state !== 'booked');
  if (!days.find(d => d.date === UI.mapDay)) UI.mapDay = days[0]?.date;
  const b = UI.mapDay && blockOf(UI.mapDay), o = activeOpt(b), r = UI.mapDay ? simulate(UI.mapDay, o) : null;
  return `<div class="row" style="margin-bottom:8px"><label class="f grow">Adding stops to
      <select data-act="mapdaysel">${days.map(d => `<option value="${d.date}" ${d.date === UI.mapDay ? 'selected' : ''}>${dateLabel(d.date)} · ${esc(stateText(d))}${activeOpt(blockOf(d.date)) ? ' · ' + esc(activeOpt(blockOf(d.date)).id) : ''}</option>`).join('')}</select></label>
      ${r ? badge(r.status) : ''}</div>
    ${r && r.plan ? `<div class="small" style="margin-bottom:6px">${[r.start, ...r.plan.stops.filter(x => x.place !== '_break').map(x => x.place), r.end].map(placeName).map(esc).join(' → ')} · drive ${dur(r.driveMin)}</div>` : ''}
    <div class="row small" style="margin-bottom:8px"><button class="btn small" data-act="toplan" data-date="${UI.mapDay || ''}">Open day in planner</button>
      <button class="btn small" data-act="addmode" aria-pressed="${addMode}">${addMode ? 'Tap the map to place it…' : '+ Custom place'}</button></div>`;
}
function initMap() {
  if (MAP || typeof L === 'undefined') return;
  MAP = L.map('map', { zoomControl: true }).setView([64.0, -20.5], 7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(MAP);
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
  if (mapLayers) { mapLayers.control.remove(); Object.values(mapLayers.groups).forEach(g => g.remove()); }
  const groups = {};
  for (const p of S.places) {
    const rg = region(p.region);
    const key = `<span style="color:${rg.color}">●</span> ${esc(rg.name)}`;
    (groups[key] ||= L.layerGroup().addTo(MAP));
    const m = L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2, fillColor: rg.color, fillOpacity: .95 });
    m.bindPopup(() => popupHTML(p.id), { maxWidth: 260 });
    m.bindTooltip(esc(p.name), { direction: 'top', offset: [0, -6] });
    m.addTo(groups[key]);
  }
  const control = L.control.layers(null, groups, { collapsed: true }).addTo(MAP);
  mapLayers = { groups, control };
  mapDirty = false;
}
function drawRoute() {
  if (!MAP) return;
  if (routeLayer) routeLayer.remove();
  routeLayer = L.layerGroup().addTo(MAP);
  const b = UI.mapDay && blockOf(UI.mapDay), o = activeOpt(b);
  if (!o) return;
  const r = simulate(UI.mapDay, o);
  const ids = [r.start, ...((r.plan && r.plan.stops) || []).filter(x => x.place !== '_break').map(x => x.place), r.end].filter(place);
  const pts = ids.map(id => [place(id).lat, place(id).lon]);
  if (pts.length > 1) L.polyline(pts, { color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1f7a8c', weight: 3, dashArray: '6 6' }).addTo(routeLayer);
  ids.slice(1, -1).forEach((id, i) => L.marker([place(id).lat, place(id).lon], { icon: L.divIcon({ className: '', html: `<div class="numicon">${i + 1}</div>`, iconSize: [24, 24], iconAnchor: [12, 26] }), interactive: false }).addTo(routeLayer));
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
      `<div class="small">From <b>${esc(placeName(prevId))}</b>: ${dur(dv.min)} · ${dv.km} km${dv.est ? ' (est.)' : ''}</div>`;
  }
  return `<h4>${esc(p.name)}</h4><div class="tiny" style="color:${rg.color}">${esc(rg.name)} · ~${p.visit ?? 45} min visit</div>
    ${p.note ? `<div style="margin:4px 0">${esc(p.note)}</div>` : ''}${p.caution ? `<div class="small" style="color:var(--warn)">${esc(p.caution)}</div>` : ''}
    ${from}${o ? `<div class="row" style="gap:6px"><button class="btn small primary" data-act="madd" data-place="${esc(pid)}">Add to ${dateLabel(date)}</button>
    <button class="btn small" data-act="msleep" data-place="${esc(pid)}">Sleep here</button></div>` : '<div class="small muted">Pick a plannable day above.</div>'}`;
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
  const scroll = window.scrollY;
  const tab = UI.tab;
  v.innerHTML = tab === 'plan' ? renderPlan() : tab === 'map' ? renderMapControls() : tab === 'compare' ? renderCompare() : tab === 'book' ? renderBook() : renderCond();
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
function goTab(t) { UI.tab = t; render.keepScroll = false; render(); window.scrollTo(0, 0); }
function applyTheme() { if (UI.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', UI.theme); }

/* ---------- events ---------- */
function stopOp(date, fn) {
  const o = activeOpt(blockOf(date)); if (!o) return;
  const p = planOf(o, date, true); fn(p, o); changed();
}
document.addEventListener('click', e => {
  const tabBtn = e.target.closest('#tabs button'); if (tabBtn) return goTab(tabBtn.dataset.tab);
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
        if (!res) { el.disabled = false; el.textContent = 'Auto-plan'; alert('No combination of overnight stops fits your free time and driving limit. Try a higher max driving time.'); return; }
        S.options.push(res.opt); UI.cmpBlock = bid; UI.cmpFocus = res.opt.id; persist();
        toast(`Created ${res.opt.id} · tried ${res.tried} routes in ${Math.round(performance.now() - t0)} ms`);
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
    case 'dstate': d.state = v; if (v === 'partial') { d.mode = d.mode || 'until'; d.time = d.time || '17:00'; } changed(); break;
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
    case 'oname': optById(el.dataset.id).name = v; changed(); break;
    case 'onote': optById(el.dataset.id).note = v; changed(); break;
    case 'bset': {
      const x = S.bookings[i], k = el.dataset.k;
      x[k] = (k === 'est' || k === 'actual') ? (v === '' ? null : +v) : (k === 'option' ? (v || null) : v);
      changed(); break;
    }
    case 'set': {
      const k = el.dataset.k; S.settings[k] = el.type === 'number' ? (v === '' ? DEFAULT_SETTINGS[k] : +v) : v; changed(); break;
    }
  }
});
$('#importfile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importJSON(f); e.target.value = ''; });
const updOnline = () => { $('#offline').hidden = navigator.onLine; };
addEventListener('online', updOnline); addEventListener('offline', updOnline); updOnline();
setInterval(() => { if (S && UI.tab === 'plan' && S.days.find(d => d.date === todayISO()) && !document.activeElement?.matches('input,select,textarea')) render(); }, 5 * 60 * 1000);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
boot();
