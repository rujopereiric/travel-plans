#!/usr/bin/env python3
"""Builds the "Campsite" places (ids camp_*) in iceland-planner/data.json from three sources in parts/:
  campsites-tjalda.json      154 published campsites from tjalda.is (operator-maintained directory run by Parka):
                             coordinates, season dates, prices, facilities, contacts. The base list.
  campsites-campiceland.json 20 recommended campsites from Camp Iceland, merged into the tjalda.is site at the
                             same place (within 1.5 km, keeping the old camp_* id so saved plans don't get
                             duplicates); kept as they are when tjalda.is doesn't have them.
  campsites-winter.json      campsites the regional tourism offices list as open for campers in winter (the
                             "camper winter service" pages linked from Visit Iceland), matched by location.
Re-running replaces all camp_* places. Run: python3 iceland-planner/tools/campsites.py && python3 trips/tools/build.py"""
import json, os, re, math, hashlib, unicodedata, urllib.parse, importlib.util
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
spec = importlib.util.spec_from_file_location('b', os.path.join(os.path.dirname(root), 'trips', 'tools', 'build.py'))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
CI_SRC = 'https://www.campiceland.is/camping-equipment/all'
MON = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}
MNAME = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
SKIP_SERVICES = {'Open all year', 'Walking paths', 'Free for children', 'Without Electricity'}

def hv(a, c):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], c[0], c[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))
def slug(name):
    n = unicodedata.normalize('NFKD', name.split('(')[0].replace('Þ', 'Th').replace('þ', 'th').replace('Ð', 'D').replace('ð', 'd').replace('æ', 'ae').replace('Æ', 'Ae').replace('ö', 'o'))
    return re.sub(r'[^a-z0-9]+', '_', n.encode('ascii', 'ignore').decode().lower()).strip('_')
def commons_thumb(page, w=960):
    f = urllib.parse.unquote(page.rsplit('File:', 1)[1]).replace(' ', '_')
    m = hashlib.md5(f.encode()).hexdigest(); q = urllib.parse.quote(f)
    return f'https://upload.wikimedia.org/wikipedia/commons/thumb/{m[0]}/{m[:2]}/{q}/{w}px-{q}'
def ci_season(t):   # "May 15 – Sept 15", "Open Year-Round (…)", "Late June – Mid-Sept (F-Road)"
    if 'year-round' in t.lower(): return {'yearRound': True}
    d = re.findall(r'(Late |Mid-|Early )?([A-Z][a-z]{2})[a-z]*\.? ?(\d{1,2})?', t)
    if len(d) < 2: return None
    def md(x): return [MON[x[1].lower()], int(x[2]) if x[2] else {'Late ': 20, 'Mid-': 15, 'Early ': 5}.get(x[0], 1)]
    return {'from': md(d[0]), 'to': md(d[1])}
MONTHS = {**MON, 'june': 6, 'july': 7, 'sept': 9, 'mai': 5}
def text_season(t):   # dates in the operator's own words win over the year-round flag ("1st of May - 1st of November")
    t = (t or '').lower()
    if re.search(r'all year|year[- ]round|allt árið', t): return {'yearRound': True}
    M = r'(jan|feb|mar|apr|mai|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'
    md = []
    for m in re.finditer(r'(\d{1,2})(?:st|nd|rd|th)?\.?\s*(?:of\s+)?' + M + r'|' + M + r'\s+(\d{1,2})(?:st|nd|rd|th)?\b|(\d{1,2})\.(\d{1,2})\b', t):
        g = m.groups()
        if g[0]: md.append([MONTHS[g[1]], int(g[0])])
        elif g[2]: md.append([MONTHS[g[2]], int(g[3])])
        else: md.append([int(g[5]), int(g[4])])
    if len(md) < 2:   # month names only: "May - October"
        names = [MONTHS[w[:3]] for w in re.findall(r'[a-z]+', t) if w[:3] in MON and len(w) >= 3]
        if len(names) >= 2: md = [[names[0], 1], [names[1], 28 if names[1] == 2 else 30 if names[1] in (4, 6, 9, 11) else 31]]
    return {'from': md[0], 'to': md[1]} if len(md) >= 2 and 1 <= md[0][0] <= 12 and 1 <= md[1][0] <= 12 else None
def season_text(s, text):
    if text: return text
    if not s: return 'Opening dates not given: check with the campsite'
    if s.get('yearRound'): return 'All year'
    return f"{s['from'][1]} {MNAME[s['from'][0]]} – {s['to'][1]} {MNAME[s['to'][0]]}"
def first_sentences(t, n=260):
    t = re.sub(r'\s+', ' ', t or '').strip()
    if len(t) <= n: return t
    cut = t[:n]; k = max(cut.rfind('. '), cut.rfind('! '))
    return (cut[:k + 1] if k > 80 else cut.rsplit(' ', 1)[0] + '…')
def price_lines(t):
    ls = [l.strip(' -•\t') for l in (t or '').splitlines() if re.search(r'\d', l) and re.search(r'ISK|kr|€|EUR', l, re.I)]
    return ls[:2]
def url(u): u = (u or '').strip(); return u if not u or u.startswith('http') else 'https://' + u

p = os.path.join(root, 'data.json'); data = json.load(open(p))
others = [x for x in data['places'] if not x['id'].startswith('camp_')]
def region_of(lat, lon): return min(others, key=lambda x: hv((lat, lon), (x['lat'], x['lon'])))['region']
TJ = json.load(open(os.path.join(root, 'parts', 'campsites-tjalda.json')))['campsites']
CI = json.load(open(os.path.join(root, 'parts', 'campsites-campiceland.json')))
WI = json.load(open(os.path.join(root, 'parts', 'campsites-winter.json')))

places, by_tj = [], {}
for c in TJ:
    # the structured season fields, unless the operator's own text contradicts them (flagged all year, but the text
    # gives dates) or they're missing
    ts = text_season(c['openingText'])
    if c['yearRound']: s = ts if ts and ts.get('from') else {'yearRound': True}
    elif c['from'] and c['to']: s = {'from': c['from'], 'to': c['to']}
    else: s = ts
    stale = 'not an active participant' in c['openingText']   # tjalda.is: listing not renewed for 2026
    if stale: c['openingText'] = ''
    if c['openingText'] and len(c['openingText']) < 14 and not re.search(r'\d{1,2}\D+\d|year|all', c['openingText'], re.I): c['openingText'] = ''   # "Open 2026"
    if re.search(r'kort|map', c['image'].rsplit('/', 1)[-1], re.I): c['image'] = ''   # a site map, not a photo
    fac = [x for x in c['services'] if x not in SKIP_SERVICES][:8]
    pl = {'id': 'camp_' + slug(c['slug']), 'name': c['name'], 'region': region_of(c['lat'], c['lon']),
          'lat': round(c['lat'], 5), 'lon': round(c['lon'], 5), 'visit': 0, 'cat': 'Campsite', 'priority': 1,
          'suggest': False, 'needsDaylight': False, 'wiki': False, 'summary': first_sentences(c['summary']),
          'season': s, 'seasonText': season_text(s, c['openingText']),
          'facts': [f"Open: {season_text(s, c['openingText'])}"] + [f'Price: {x}' for x in price_lines(c['prices'])]
                   + (['Facilities: ' + ', '.join(fac)] if fac else []) + ([f"Phone: {c['phone'] if c['phone'].lstrip().startswith(('+', '00')) else '+354 ' + c['phone']}"] if c['phone'] else []),
          'links': ([{'name': 'Website', 'url': url(c['website'])}] if c['website'] else []) + [{'name': 'tjalda.is', 'url': f"https://tjalda.is/en/{c['slug']}/"}]
                   + ([{'name': 'Book', 'url': url(c['prebook'])}] if c['prebook'] else []),
          'sources': [f"https://tjalda.is/en/{c['slug']}/"], 'confidence': 'low' if stale else 'high', 'checked': '2026-10-28'}
    if stale: pl['facts'].append("tjalda.is: the campsite didn't renew its listing for 2026, so these details may be out of date")
    if c['image']: pl['photo'] = c['image']; pl['photoCredit'] = 'tjalda.is'; pl['photoPage'] = f"https://tjalda.is/en/{c['slug']}/"
    places.append(pl); by_tj[c['slug']] = pl

def nearest(lat, lon, pool, km=1.5):
    best = min(pool, key=lambda x: hv((lat, lon), (x['lat'], x['lon'])), default=None)
    return best if best and hv((lat, lon), (best['lat'], best['lon'])) <= km else None

merged = 0
for c in CI:
    old_id = 'camp_' + slug(c['name'])
    m = nearest(c['lat'], c['lon'], [x for x in places if 'campiceland' not in x])
    if m:   # same site: keep the tjalda.is data, take the old id (saved plans), add Camp Iceland's description if better
        m['id'] = old_id; m['name'] = c['name']; m['campiceland'] = True; merged += 1
        if len(c['summary']) > len(m['summary']): m['summary'] = c['summary']
        m['sources'].append(CI_SRC)
        if not m['season'] and ci_season(c['season']):   # tjalda.is has no usable dates: fall back to Camp Iceland's
            m['season'] = ci_season(c['season']); m['seasonText'] = c['season']
            m['facts'] = [f for f in m['facts'] if not f.startswith('Open:')]; m['facts'].insert(0, f"Open: {c['season']} (Camp Iceland)")
        if 'photo' not in m and c.get('photo'):
            ph = c['photo']; m['photo'] = commons_thumb(ph['page']); m['photoPage'] = ph['page']
            m['photoCredit'] = f"Area photo ({ph['what']}): {ph['author']}, {ph['license']}, Wikimedia Commons"
        continue
    s = ci_season(c['season'])
    pl = {'id': old_id, 'name': c['name'], 'region': region_of(c['lat'], c['lon']) if 'Landmannalaugar' not in c['name'] else 'south',
          'lat': round(c['lat'], 5), 'lon': round(c['lon'], 5), 'visit': 0, 'cat': 'Campsite', 'priority': 1,
          'suggest': False, 'needsDaylight': False, 'wiki': False, 'summary': c['summary'], 'season': s, 'seasonText': c['season'],
          'facts': [f"Open: {c['season']}", f"Access: {c['access']}", 'Facilities: ' + ', '.join(c['facilities'])],
          'links': [{'name': 'Website', 'url': c['url']}] if c['url'] else [], 'sources': [CI_SRC] + ([c['url']] if c['url'] else []),
          'confidence': 'medium', 'checked': '2026-10-28', 'campiceland': True}
    if c.get('photo'):
        ph = c['photo']; pl['photo'] = commons_thumb(ph['page']); pl['photoPage'] = ph['page']
        pl['photoCredit'] = f"Area photo ({ph['what']}): {ph['author']}, {ph['license']}, Wikimedia Commons"
    places.append(pl)

winter_new = 0
for w in WI['providers']:
    page = WI['pages'][w['region']]; office = {'South': 'Visit South Iceland', 'North': 'Visit North Iceland', 'Reykjanes': 'Visit Reykjanes', 'West': 'Visit West Iceland'}[w['region']]
    m = nearest(w['lat'], w['lon'], places)
    if not m:   # a winter-open provider tjalda.is doesn't list
        m = {'id': 'camp_' + slug(w['name']), 'name': w['name'], 'region': region_of(w['lat'], w['lon']), 'lat': w['lat'], 'lon': w['lon'],
             'visit': 0, 'cat': 'Campsite', 'priority': 1, 'suggest': False, 'needsDaylight': False, 'wiki': False,
             'summary': '', 'season': None, 'seasonText': '', 'facts': [], 'links': [], 'sources': [], 'confidence': 'medium', 'checked': '2026-10-28'}
        places.append(m); winter_new += 1
    if m.get('winterService'): continue
    m['winterService'] = office
    if not (m.get('season') or {}).get('yearRound'): m['season'] = dict(m.get('season') or {}, winter=True)
    m['facts'].insert(1 if m['facts'] else 0, f'Winter: {office} lists it as open for campers in winter')
    m['links'].append({'name': f'{office}: winter service', 'url': w['url']})
    m['sources'].append(page)
for x in places: x.pop('campiceland', None)
assert len({x['id'] for x in places}) == len(places), [i for i in {x['id'] for x in places} if sum(y['id'] == i for y in places) > 1]
data['places'] = others + places
if 'Campsite' not in data.get('categories', []): data['categories'] = data.get('categories', []) + ['Campsite']
open(p, 'w').write(b.pretty(data) + '\n')
yr = sum(1 for x in places if (x.get('season') or {}).get('yearRound')); wn = sum(1 for x in places if x.get('winterService'))
print(f'{len(places)} campsites: {len(TJ)} from tjalda.is, {merged} of {len(CI)} Camp Iceland merged into them, {len(CI) - merged} kept, {winter_new} winter-only added; {yr} open all year, {wn} winter-service')
