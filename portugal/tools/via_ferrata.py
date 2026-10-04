#!/usr/bin/env python3
"""Turns the via ferratas found in the OpenStreetMap files (portugal/osm/*.json, category "Via ferrata") into
"My places" entries: portugal/parts/via_ferrata.json, picked up by assemble.py. Segments of the same route
(OSM often maps one via ferrata as several ways) are merged when they are within 1.5 km of each other.
Run: python3 portugal/tools/via_ferrata.py && python3 portugal/tools/assemble.py"""
import json, glob, math, os, re
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)

def hv(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))

items = {}
for f in sorted(glob.glob(os.path.join(root, 'osm', '*.json'))):
    for it in json.load(open(f))['items']:
        if it[4] == 'Via ferrata': items[it[0]] = it
# my places (not via ferratas) give each route a region and a "near" name
mine = [p for part in glob.glob(os.path.join(root, 'parts', '*.json')) if not part.endswith('via_ferrata.json')
        for p in json.load(open(part))['places']]
towns = [p for p in mine if p['cat'] in ('Town', 'Base', 'Old town', 'Village') or p.get('sleep')]

groups = []
for it in sorted(items.values(), key=lambda x: (x[1] == 'Via ferrata', x[0])):  # named ones first
    for g in groups:
        if hv((it[2], it[3]), (g[0][2], g[0][3])) < 1.5: g.append(it); break
    else: groups.append([it])

places, used = [], {}
for g in groups:
    named = [x for x in g if x[1] != 'Via ferrata'] or g
    it = named[0]
    lat = round(sum(x[2] for x in g) / len(g), 4); lon = round(sum(x[3] for x in g) / len(g), 4)
    near = min(towns, key=lambda p: hv((lat, lon), (p['lat'], p['lon'])))
    region = min(mine, key=lambda p: hv((lat, lon), (p['lat'], p['lon'])))['region']
    km = hv((lat, lon), (near['lat'], near['lon']))
    # unnamed routes: name them after the nearest of my places (a cape, a castle…) if it's close, else the nearest town
    mark = min((p for p in mine if p['cat'] != 'Airport'), key=lambda p: hv((lat, lon), (p['lat'], p['lon'])))
    ref = mark if hv((lat, lon), (mark['lat'], mark['lon'])) < 5 else near
    name = it[1] if it[1] != 'Via ferrata' else f"Via ferrata near {ref['name']}"
    grades = sorted({m.group(1) for x in g for m in [re.search(r'Via ferrata, ([^.]+)\.', x[7])] if m})
    desc = next((x[7] for x in g if x[7] and not x[7].startswith('Via ferrata')), '')
    summary = (desc + ' ' if desc else '') + f"A via ferrata (protected climbing route) {round(km)} km from {near['name']}." \
        + (f" Grade: {', '.join(grades)}." if grades else ' The grade is not mapped: check with the operator.')
    used[name] = used.get(name, 0) + 1
    if used[name] > 1: name += f' ({used[name]})'
    p = {'id': 'vf_' + it[0], 'name': name, 'region': region, 'lat': lat, 'lon': lon, 'visit': 180, 'cat': 'Via ferrata', 'priority': 2,
         'summary': summary,
         'facts': ['You need a helmet, harness and via ferrata lanyard set; local operators rent kits and guide',
                   'Check it is open and the cables are maintained before you go (ask the town hall or tourist office)',
                   'Avoid it in rain or wind: rock and cables get slippery'],
         'osm': [x[0] for x in g]}
    # its own Wikipedia article if OSM has one; otherwise the general article, for a representative photo
    p['wiki'] = it[5].split(':', 1)[-1] if it[5] else 'Via ferrata'
    if it[6]: p['links'] = [{'name': 'Website', 'url': it[6]}]
    places.append(p)
out = os.path.join(root, 'parts', 'via_ferrata.json')
json.dump({'places': places, 'drives': []}, open(out, 'w'), ensure_ascii=False, indent=1)
print(len(items), 'OSM via ferrata objects →', len(places), 'routes:')
for p in places: print(' ', p['name'], '·', p['region'], '·', p['summary'][:110])
