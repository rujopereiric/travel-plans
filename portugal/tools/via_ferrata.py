#!/usr/bin/env python3
"""Builds the via ferratas in "My places" (portugal/parts/via_ferrata.json, picked up by assemble.py) from:
1. parts/via_ferrata_research.json: researched routes (names, grades, approach, operators, sources). These win.
2. the OpenStreetMap files (portugal/osm/*.json, category "Via ferrata"), for any route the research doesn't
   cover (an OSM route within 3 km of a researched one is taken to be the same route). Segments of the same route
(OSM often maps one via ferrata as several ways) are merged when they are within 1.5 km of each other.
Run: python3 portugal/tools/via_ferrata.py && python3 portugal/tools/assemble.py"""
import json, glob, math, os, re
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)

def hv(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))

# OpenStreetMap routes known to be wrong or not accessible (also hidden in the app: OSM_EXCLUDE in app.js)
EXCLUDE = {'w1020660385', 'w975036766'}   # near Portinho da Arrábida: not accessible (Oct 2026)
items = {}
for f in sorted(glob.glob(os.path.join(root, 'osm', '*.json'))):
    for it in json.load(open(f))['items']:
        if it[4] == 'Via ferrata' and it[0] not in EXCLUDE: items[it[0]] = it
# my places (not via ferratas) give each route a region and a "near" name
mine = [p for part in glob.glob(os.path.join(root, 'parts', '*.json')) if not part.endswith(('via_ferrata.json', 'via_ferrata_research.json'))
        for p in json.load(open(part))['places']]
towns = [p for p in mine if p['cat'] in ('Town', 'Base', 'Old town', 'Village') or p.get('sleep')]

groups = []
for it in sorted(items.values(), key=lambda x: (x[1] == 'Via ferrata', x[0])):  # named ones first
    for g in groups:
        if hv((it[2], it[3]), (g[0][2], g[0][3])) < 1.5: g.append(it); break
    else: groups.append([it])

MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
def photo_query(name):  # the name people search for: "Via Ferrata dos Pinheirinhos" rather than "Caminho do Mar"
    m = re.search(r'\((Via Ferrata[^)]*)\)', name, re.I)
    q = m.group(1) if m else re.sub(r'\s*\(.*?\)', '', name)
    return q if 'ferrata' in q.lower() else q + ' via ferrata'
def region_of(lat, lon): return min(mine, key=lambda p: hv((lat, lon), (p['lat'], p['lon'])))['region']
places, used = [], {}
research = json.load(open(os.path.join(root, 'parts', 'via_ferrata_research.json')))
# where the nearest of my places points to the wrong region (by the municipality's district)
REGION = {'vf_talhadas': 'centro', 'vf_pombeira': 'centro', 'vf_teto_do_mundo': 'douro', 'vf_rabacal': 'douro'}
NOTE = re.compile(r"your OSM|I couldn't|No photo URL|No via ferrata found in the Azores|OSM name", re.I)  # research notes, not traveller tips
for r in research:
    lat, lon = r['lat'], r['lon']
    if False:  # (was: Fenda da Arrábida, dropped)  # guided only: place it at the meeting point, Praia do Creiro
        meet = next((p for p in mine if p['id'] in ('portinho_da_arrabida', 'praia_do_creiro')), None)
        if meet: lat, lon = meet['lat'], meet['lon']; r['approach'] += ' (Shown on the map at the meeting point.)'
    if r['status'] == 'planned' or lat is None:
        print('  skipped (not visitable or no location):', r['name'], '·', r['status']); continue
    stats = ' · '.join(x for x in [r['grade'] and 'Grade ' + r['grade'], r['length_m'] and f"{r['length_m']} m", r['height_gain_m'] and f"+{r['height_gain_m']} m",
                                   r['duration_min'] and f"~{r['duration_min'] // 60} h {r['duration_min'] % 60:02d} min in total"] if x)
    facts = [stats, 'Getting there: ' + r['approach']] + [f for f in r['facts'] if not NOTE.search(f)]
    if r.get('features'): facts.append('On the route: ' + r['features'])
    facts.append('Access: ' + (r['access'] or 'unknown'))
    if r.get('operator'): facts.append('Operator: ' + r['operator'])
    if r.get('kitRental'): facts.append('Kit: ' + r['kitRental'])
    facts.append('Bring helmet, harness and a via ferrata lanyard set (EN 958); turn back in rain, wind or very high fire risk')
    p = {'id': r['id'], 'name': r['name'], 'region': REGION.get(r['id']) or region_of(lat, lon), 'lat': lat, 'lon': lon,
         'visit': r['duration_min'] or 150, 'cat': 'Via ferrata', 'priority': 2, 'summary': r['summary'], 'facts': facts,
         'wiki': False, 'photoSearch': photo_query(r['name']),
         'sources': r['sources'], 'confidence': r['confidence'], 'checked': '2026-10-04', 'municipality': r['municipality']}
    if r.get('season') and not r['season'].startswith('No information'): p['season'] = r['season']
    if r['status'] != 'open': p['caution'] = 'Status: ' + r['status'] + '. Check before you go.'
    if r.get('photo'):  # our own photos (E29.eu albums) or a guide site's, credited on the card
        p['photo'] = r['photo']; host = re.sub(r'^https?://(www\.|m\.)?', '', r['photo']).split('/')[0]
        p['photoCredit'] = 'E29.eu' if host.endswith('e29.eu') else host
        del p['photoSearch']
    # our own trip reports (from the E29 Dataverse "Communications" table): blog posts and videos first in the links
    if r.get('e29'):
        nb = sum(1 for x in r['e29'] if x['type'] == 'blog'); nv = sum(1 for x in r['e29'] if x['type'] == 'video')
        p['links'] = [{'name': x.get('label') or (('📝 Our blog post' if x['type'] == 'blog' else '▶️ Our video') + (f" ({'Operation Hook, ' if x['project'] == 'Operation Hook' else ''}{MON[int(x['date'][5:7])]} {x['date'][:4]})" if (nb if x['type'] == 'blog' else nv) > 1 else '')), 'url': x['url']} for x in r['e29']]
        done = sorted({(x['date'][:4], x['project']) for x in r['e29']})
        p['facts'].insert(0, "We've done this one: " + ', '.join(f"{pr} ({y})" for y, pr in done))
        p['e29'] = True
    places.append(p)
known = [(p['lat'], p['lon']) for p in places]
for g in groups:
    if any(hv((x[2], x[3]), k) < 3 for x in g for k in known): continue  # same route as a researched one
    named = [x for x in g if x[1] != 'Via ferrata'] or g
    it = named[0]
    lat = round(sum(x[2] for x in g) / len(g), 4); lon = round(sum(x[3] for x in g) / len(g), 4)
    near = min(towns, key=lambda p: hv((lat, lon), (p['lat'], p['lon'])))
    region = min(mine, key=lambda p: hv((lat, lon), (p['lat'], p['lon'])))['region']
    km = hv((lat, lon), (near['lat'], near['lon']))
    # unnamed routes: name them after the nearest of my places (a cape, a castle…) if it's close, else the nearest town
    mark = min((p for p in mine if p['cat'] != 'Airport'), key=lambda p: hv((lat, lon), (p['lat'], p['lon'])))
    ref = mark if hv((lat, lon), (mark['lat'], mark['lon'])) < 5 else near
    if it[1] == 'Via ferrata': name = f"Via ferrata near {ref['name']}"
    elif 'ferrata' not in it[1].lower(): name = f"Via ferrata {it[1]} (near {(mark if hv((lat, lon), (mark['lat'], mark['lon'])) < 15 else near)['name']})"  # e.g. "North Slope"
    else: name = it[1]
    grades = sorted({m.group(1) for x in g for m in [re.search(r'Via ferrata, ([^.]+)\.', x[7])] if m})
    desc = next((x[7] for x in g if x[7] and not x[7].startswith('Via ferrata')), '')
    close = mark if hv((lat, lon), (mark['lat'], mark['lon'])) < 15 else near
    summary = (desc + ' ' if desc else '') + f"A via ferrata (protected climbing route) {round(hv((lat, lon), (close['lat'], close['lon'])))} km from {close['name']}." \
        + (f" Grade: {', '.join(grades)}." if grades else ' The grade is not mapped: check with the operator.')
    used[name] = used.get(name, 0) + 1
    if used[name] > 1: name += f' ({used[name]})'
    p = {'id': 'vf_' + it[0], 'name': name, 'region': region, 'lat': lat, 'lon': lon, 'visit': 180, 'cat': 'Via ferrata', 'priority': 2,
         'summary': summary,
         'facts': ['You need a helmet, harness and via ferrata lanyard set; local operators rent kits and guide',
                   'Check it is open and the cables are maintained before you go (ask the town hall or tourist office)',
                   'Avoid it in rain or wind: rock and cables get slippery'],
         'osm': [x[0] for x in g]}
    # its own Wikipedia article if OSM has one; never the general "Via ferrata" article
    p['wiki'] = it[5].split(':', 1)[-1] if it[5] else False
    p['confidence'] = 'low'
    p['facts'].insert(0, 'Only known from OpenStreetMap: not confirmed by any guide or official source')
    if it[6]: p['links'] = [{'name': 'Website', 'url': it[6]}]
    places.append(p)
out = os.path.join(root, 'parts', 'via_ferrata.json')
json.dump({'places': places, 'drives': []}, open(out, 'w'), ensure_ascii=False, indent=1)
print(len(items), 'OSM via ferrata objects →', len(places), 'routes:')
for p in places: print(' ', p['name'], '·', p['region'], '·', p['summary'][:110])
