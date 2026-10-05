#!/usr/bin/env python3
"""Builds netherlands/data.json from the regional research files in netherlands/parts/ plus the shared base below
(trip, regions, airports, flights and trains, links, checklist, bookings).
Run: python3 netherlands/tools/assemble.py. Edit data.json by hand afterwards if you like, but re-running this
overwrites it, so put lasting changes in parts/ or here."""
import json, os, re, sys, importlib.util
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
spec = importlib.util.spec_from_file_location('b', os.path.join(os.path.dirname(root), 'trips', 'tools', 'build.py'))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
PARTS = ['west', 'east']
BOUNDS = (50.7, 3.3, 53.6, 7.3)
REGIONS = [
  ('amsterdam', 'Amsterdam', '#d4661b'), ('noordholland', 'North Holland: Haarlem, Zaanse Schans & Texel', '#2f7fd1'),
  ('zuidholland', 'South Holland: Leiden, The Hague, Delft & Rotterdam', '#7b61c9'), ('utrecht', 'Utrecht', '#d1495b'),
  ('zeeland', 'Zeeland', '#00897b'), ('gelderland', 'Veluwe, Arnhem & Overijssel', '#2e7d32'),
  ('north', 'Friesland, Groningen & the Wadden', '#00838f'), ('south', 'Brabant & Limburg', '#8e244d'),
]
AIRPORTS = [
  {'id': 'ams', 'name': 'Amsterdam Schiphol Airport (AMS)', 'region': 'amsterdam', 'lat': 52.3105, 'lon': 4.7683, 'wiki': 'Amsterdam Airport Schiphol',
   'summary': 'The main airport, with its own train station under the terminal: 15 min to Amsterdam Centraal, 20 min to Leiden, 30 min to The Hague.',
   'facts': ['Trains every few minutes; tap in and out with a contactless bank card', 'Car rental desks in the arrivals hall', 'Allow 3 h in summer: security queues can be long']},
  {'id': 'ein', 'name': 'Eindhoven Airport (EIN)', 'region': 'south', 'lat': 51.4500, 'lon': 5.3745, 'wiki': 'Eindhoven Airport',
   'summary': 'The second airport, used by low-cost airlines: 20 min by bus to Eindhoven station.', 'facts': ['Bus 400/401 to Eindhoven station']},
]
DRIVES = [['ams', 'amsterdam', 18, 25], ['ams', 'haarlem', 17, 20], ['ams', 'leiden', 30, 25], ['ein', 'eindhoven', 8, 15]]
TRANSIT = [['ams', 'amsterdam', 18, 35, 'train', 6], ['ams', 'leiden', 30, 40, 'train', 7], ['ams', 'the_hague', 45, 50, 'train', 10], ['ams', 'utrecht', 45, 50, 'train', 10]]
LINKS = [
  {'name': 'NS trains', 'url': 'https://www.ns.nl/en', 'host': 'ns.nl', 'note': 'Train times, engineering works and tickets. Tap in and out with a contactless bank card (OVpay).'},
  {'name': '9292 journey planner', 'url': 'https://9292.nl/en', 'host': '9292.nl', 'note': 'Door-to-door public transport: trains, buses, trams, ferries.'},
  {'name': 'KNMI weather warnings', 'url': 'https://www.knmi.nl/nederland-nu/weer/waarschuwingen', 'host': 'knmi.nl', 'note': 'Official warnings: storms, ice, heat. Code orange storms stop ferries and some trains.'},
  {'name': 'Museumkaart', 'url': 'https://www.museum.nl/en/museumkaart', 'host': 'museum.nl', 'note': 'One card for free entry to 500+ museums for a year; worth it from about 4 big museums.'},
  {'name': 'Anne Frank House tickets', 'url': 'https://www.annefrank.org/en/', 'host': 'annefrank.org', 'note': 'Online only, released 6 weeks ahead every Tuesday; they sell out fast.'},
  {'name': 'Keukenhof', 'url': 'https://keukenhof.nl/en/', 'host': 'keukenhof.nl', 'note': 'Open only mid-March to mid-May. Timed tickets, and the flower bloom report.'},
  {'name': 'ANWB traffic', 'url': 'https://www.anwb.nl/verkeer', 'host': 'anwb.nl', 'note': 'Traffic jams and road works.'},
  {'name': 'Holland.com', 'url': 'https://www.holland.com/', 'host': 'holland.com', 'note': 'Official tourism site, with events.'},
]
CHECKLIST = [
  'ID card (EU) or passport. Non-EU visitors: check the EES/ETIAS entry rules for the Schengen area.',
  'A contactless bank card for trains, trams and buses (tap in and out), and for most shops. Some places don\'t take foreign credit cards: carry a debit card too.',
  'Book ahead: the Anne Frank House, the Rijksmuseum and the Van Gogh Museum (timed slots), Keukenhof in spring.',
  'Don\'t drive into Amsterdam or the other big centres: use P+R car parks. Some cities have low-emission zones for older diesels.',
  'Bike lanes are red asphalt and busy: don\'t walk on them, and look both ways before crossing.',
  'Some smaller museums close on Mondays; many shops open late on Monday morning and stay open late on Thursday or Friday.',
  'Rain jacket and wind layers all year.',
  'Mudflat walking (wadlopen) only with a licensed guide.',
  'European Health Insurance Card (EU) or travel insurance.',
]
BOOKINGS = [
  ('Flights to the Netherlands', 'flight', 200, 'Schiphol, or Eindhoven for low-cost airlines.'),
  ('Train travel', 'transfer', 120, 'Rough guess for a week of intercity trips; or a rental car (~€250/week) for the Veluwe and the islands.'),
  ('Museumkaart', 'tickets', 75, 'Free entry to most museums for a year; or pay per museum (~€25 each for the big ones).'),
  ('Anne Frank House', 'tickets', 17, 'Online only, 6 weeks ahead.'),
  ('Keukenhof', 'tickets', 21, 'Mid-March to mid-May only. Timed tickets.'),
  ('Travel insurance', 'other', 40, ''),
]
RETIRED = []
CATEGORIES = ['Town', 'Base', 'Old town', 'Castle', 'Palace', 'Monastery & church', 'Monument', 'Ruins', 'Museum', 'Windmill', 'Village', 'Food & market',
  'Experience', 'Theme park', 'Garden', 'Beach', 'Coast', 'Island', 'Boat trip', 'Lighthouse', 'Viewpoint', 'Bike ride', 'Hike', 'Lake', 'Nature reserve', 'Airport']
TRIP = {'name': 'Netherlands', 'sunLat': 52.3731, 'sunLon': 4.8926, 'home': 'amsterdam', 'end': 'ams', 'tz': 'Europe/Amsterdam', 'country': 'Netherlands', 'autoDays': 7,
        'arrive': {'time': '12:00', 'at': 'ams'}, 'leave': {'time': '18:00', 'at': 'ams'}}
clean = lambda p: None

def main():
    places, drives, seen = [], [], {a['id'] for a in AIRPORTS}
    for part in PARTS:
        f = os.path.join(root, 'parts', part + '.json')
        if not os.path.exists(f): print('missing part', part); continue
        d = json.load(open(f))
        for p in d['places']:
            if p['id'] in seen: print('duplicate id, skipped:', p['id'], 'in', part); continue
            seen.add(p['id']); places.append(p)
        drives += d['drives']
    for a in AIRPORTS: a.update({'visit': 0, 'cat': 'Airport', 'needsDaylight': False, 'suggest': False, 'priority': 1})
    places += AIRPORTS   # last, so the Places list starts with sights
    ids = {p['id'] for p in places}
    regs = {r[0] for r in REGIONS}
    for p in places:
        if p['region'] not in regs: sys.exit(f"unknown region {p['region']} for {p['id']}")
        if p['cat'] not in CATEGORIES: print('unknown category', p['cat'], 'for', p['id'], '→ Landmark'); p['cat'] = 'Landmark'
        if not (BOUNDS[0] <= p['lat'] <= BOUNDS[2] and BOUNDS[1] <= p['lon'] <= BOUNDS[3]): sys.exit(f"{p['id']} is outside the country: {p['lat']}, {p['lon']}")
        clean(p)
    allD = []; key = set()
    for x in DRIVES + drives + TRANSIT:
        if x[0] not in ids or x[1] not in ids: print('leg with unknown place, skipped:', x); continue
        k = tuple(sorted(x[:2])) + ((x[4],) if len(x) > 4 else ('road',))
        if k in key: continue
        key.add(k); allD.append(x)
    data = {
        'version': 1,
        'trip': {**TRIP, 'from': 'auto', 'to': 'auto', 'autoEnds': {'first': {'label': 'Arrival day'}, 'last': {'label': 'Departure day'}}},
        'settings': {},
        'days': [], 'blocks': [], 'options': [{'id': 'A1', 'block': 'A', 'name': 'My plan', 'note': '', 'days': {}}],
        'regions': [{'id': i, 'name': n, 'color': c} for i, n, c in REGIONS],
        'places': places, 'drives': allD,
        'bookings': [{'id': f'b{i + 1}', 'item': it, 'type': ty, 'option': None, 'status': 'todo', 'est': est, 'actual': None, 'seasonal': '', 'note': note}
                     for i, (it, ty, est, note) in enumerate(BOOKINGS)],
        'retiredPlaces': RETIRED, 'links': LINKS, 'checklist': CHECKLIST, 'checks': {}, 'categories': CATEGORIES, 'picks': {},
    }
    open(os.path.join(root, 'data.json'), 'w').write(b.pretty(data) + '\n')
    from collections import Counter
    print(len(places), 'places,', len(allD), 'legs', dict(Counter(p['region'] for p in places)))

main()
