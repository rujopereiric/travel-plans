#!/usr/bin/env python3
"""Adds the campsites from Camp Iceland (https://www.campiceland.is/camping-equipment/all, fetched 28 Oct 2026,
parsed into parts/campsites-campiceland.json) to iceland-planner/data.json as "Campsite" places (ids camp_*).
Re-running replaces the camp_* places, so it's safe to run again after updating the parts file.
Run: python3 iceland-planner/tools/campsites.py && python3 trips/tools/build.py"""
import json, os, re, math, hashlib, unicodedata, urllib.parse, importlib.util
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
spec = importlib.util.spec_from_file_location('b', os.path.join(os.path.dirname(root), 'trips', 'tools', 'build.py'))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
SRC = 'https://www.campiceland.is/camping-equipment/all'
REGION = {'Landmannalaugar Highland Basecamp (F208)': 'south'}   # highlands: closest planner region
PRICE = {'Reykjavík Eco Campsite (Laugardalur)': '~2,900 ISK per adult (Camp Iceland, 2026)'}

def hv(a, b_):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b_[0], b_[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))
def slug(name):
    n = unicodedata.normalize('NFKD', name.split('(')[0].replace('Þ', 'Th').replace('þ', 'th').replace('Ð', 'D').replace('ð', 'd').replace('æ', 'ae'))
    return re.sub(r'[^a-z0-9]+', '_', n.encode('ascii', 'ignore').decode().lower()).strip('_')
def commons_thumb(page, w=960):   # File page → direct upload.wikimedia.org thumbnail (what the app caches for offline)
    f = urllib.parse.unquote(page.rsplit('File:', 1)[1]).replace(' ', '_')
    m = hashlib.md5(f.encode()).hexdigest(); q = urllib.parse.quote(f)
    return f'https://upload.wikimedia.org/wikipedia/commons/thumb/{m[0]}/{m[:2]}/{q}/{w}px-{q}'

p = os.path.join(root, 'data.json'); data = json.load(open(p))
camps = json.load(open(os.path.join(root, 'parts', 'campsites-campiceland.json')))
others = [x for x in data['places'] if not x['id'].startswith('camp_')]
places = []
for c in camps:
    yr = 'year-round' in c['season'].lower()
    pl = {'id': 'camp_' + slug(c['name']), 'name': c['name'],
          'region': REGION.get(c['name']) or min(others, key=lambda x: hv((c['lat'], c['lon']), (x['lat'], x['lon'])))['region'],
          'lat': round(c['lat'], 4), 'lon': round(c['lon'], 4), 'visit': 0, 'cat': 'Campsite', 'priority': 1,
          'suggest': False, 'needsDaylight': False, 'wiki': False, 'summary': c['summary'],
          'facts': [f"Open: {c['season']}", f"Access: {c['access']}"] + ([PRICE[c['name']]] if c['name'] in PRICE else []) + ['Facilities: ' + ', '.join(c['facilities'])],
          'links': [{'name': 'Official site', 'url': c['url']}] if c['url'] else [],
          'sources': [SRC] + ([c['url']] if c['url'] else []), 'confidence': 'medium', 'checked': '2026-10-28'}
    if not yr: pl['winter'] = f"Seasonal: open {c['season']} only. Check the official site before you go."
    elif '(' in c['season']: pl['winter'] = 'Open all year; ' + c['season'].split('(', 1)[1].rstrip(')') + '.'
    if c.get('photo'):
        ph = c['photo']; pl['photo'] = commons_thumb(ph['page'])
        pl['photoCredit'] = f"Area photo ({ph['what']}): {ph['author']}, {ph['license']}, Wikimedia Commons"; pl['photoPage'] = ph['page']
    places.append(pl)
assert len({x['id'] for x in places}) == len(places), 'duplicate campsite ids'
data['places'] = others + places
if 'Campsite' not in data.get('categories', []): data['categories'] = data.get('categories', []) + ['Campsite']
open(p, 'w').write(b.pretty(data) + '\n')
for x in places: print(f"{x['id']:34} {x['region']:12} {'year-round' if 'winter' not in x or x['winter'].startswith('Open all') else 'seasonal'}")
print(len(places), 'campsites')
