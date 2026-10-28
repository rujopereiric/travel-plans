#!/usr/bin/env python3
"""Builds denmark/data.json from the regional research files in denmark/parts/ plus the shared base below
(trip, regions, airports, flights and trains, links, checklist, bookings).
Run: python3 denmark/tools/assemble.py. Edit data.json by hand afterwards if you like, but re-running this
overwrites it, so put lasting changes in parts/ or here."""
import json, os, re, sys, importlib.util
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
spec = importlib.util.spec_from_file_location('b', os.path.join(os.path.dirname(root), 'trips', 'tools', 'build.py'))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
PARTS = ['east', 'west']
BOUNDS = (54.5, 8.0, 57.8, 15.25)
REGIONS = [
  ('copenhagen', 'Copenhagen', '#c8102e'), ('northzealand', 'North Zealand: Helsingør, Hillerød & the Louisiana coast', '#7b61c9'),
  ('southzealand', 'Roskilde, Møn & South Zealand', '#00897b'), ('funen', 'Funen & the southern islands', '#d4661b'),
  ('bornholm', 'Bornholm', '#2f7fd1'), ('southjutland', 'South Jutland & the Wadden Sea', '#8d6e63'),
  ('eastjutland', 'Aarhus, the Lake District & Legoland', '#2e7d32'), ('westjutland', 'West Jutland coast', '#00838f'),
  ('northjutland', 'North Jutland: Aalborg & Skagen', '#8e244d'),
]
AIRPORTS = [
  {'id': 'cph', 'name': 'Copenhagen Airport (CPH)', 'region': 'copenhagen', 'lat': 55.6180, 'lon': 12.6560, 'wiki': 'Copenhagen Airport',
   'summary': 'Kastrup, the main airport, on Amager: 15 min to the centre by metro (M2) or train, and on the line to Malmö in Sweden.',
   'facts': ['Metro M2 to Kongens Nytorv in ~15 min; trains to Copenhagen Central and onward across Denmark', 'Car rental in the P4 car park area', 'Allow 2 h before flights in summer']},
  {'id': 'bll', 'name': 'Billund Airport (BLL)', 'region': 'eastjutland', 'lat': 55.7403, 'lon': 9.1518, 'wiki': 'Billund Airport',
   'summary': 'Jutland\'s main airport, next to Legoland and LEGO House: handy for a Jutland-only trip.', 'facts': ['Buses to Vejle and Aarhus', 'Legoland is a 5-minute drive']},
  {'id': 'aal', 'name': 'Aalborg Airport (AAL)', 'region': 'northjutland', 'lat': 57.0928, 'lon': 9.8492, 'wiki': 'Aalborg Airport',
   'summary': 'North Jutland\'s airport, 15 min from Aalborg, with flights to Copenhagen and some European cities.', 'facts': ['Train or bus to Aalborg centre in ~15 min']},
  {'id': 'rnn', 'name': 'Bornholm Airport (RNN)', 'region': 'bornholm', 'lat': 55.0633, 'lon': 14.7596, 'wiki': 'Bornholm Airport',
   'summary': 'Bornholm\'s small airport, 5 min from Rønne: about 35 min from Copenhagen by plane.', 'facts': ['Several flights a day to Copenhagen']},
]
DRIVES = [['cph', 'copenhagen', 10, 20], ['bll', 'billund', 3, 5], ['bll', 'vejle', 28, 25], ['aal', 'aalborg', 7, 15], ['rnn', 'ronne', 5, 8]]
TRANSIT = [['cph', 'copenhagen', 10, 30, 'train', 36], ['cph', 'rnn', 160, 140, 'flight', 600], ['cph', 'aal', 240, 160, 'flight', 700]]
LINKS = [
  {'name': 'DSB trains', 'url': 'https://www.dsb.dk/en/', 'host': 'dsb.dk', 'note': 'Train times and tickets across Denmark. Orange tickets (cheaper, fixed train) are sold ahead.'},
  {'name': 'Rejseplanen journey planner', 'url': 'https://www.rejseplanen.dk/', 'host': 'rejseplanen.dk', 'note': 'Door-to-door public transport, including buses and island ferries.'},
  {'name': 'DMI weather warnings', 'url': 'https://www.dmi.dk/', 'host': 'dmi.dk', 'note': 'Official forecasts and warnings: storms close the bridges to high vehicles and stop ferries.'},
  {'name': 'Copenhagen Card', 'url': 'https://copenhagencard.com/', 'host': 'copenhagencard.com', 'note': 'Public transport in the capital region plus entry to 80+ museums and sights, including Kronborg and Frederiksborg.'},
  {'name': 'Bornholmslinjen ferries', 'url': 'https://www.bornholmslinjen.com/', 'host': 'bornholmslinjen.com', 'note': 'Ystad ↔ Rønne fast ferry and Køge ↔ Rønne; book car places ahead in summer.'},
  {'name': 'Storebælt bridge', 'url': 'https://www.storebaelt.dk/en/', 'host': 'storebaelt.dk', 'note': 'Great Belt bridge tolls (Zealand ↔ Funen); BroBizz or pay at the booths.'},
  {'name': 'VisitDenmark', 'url': 'https://www.visitdenmark.com/', 'host': 'visitdenmark.com', 'note': 'Official tourism site, with events and seasonal opening.'},
]
CHECKLIST = [
  'ID card (EU) or passport. Non-EU visitors: check the EES/ETIAS entry rules for the Schengen area. Bornholm by road crosses Sweden: carry your ID.',
  'A card that works abroad: many places are card-only and cash is rarely needed.',
  'Book ahead in summer: Bornholm and Ærø ferry car places, Legoland, LEGO House, Tivoli at weekends.',
  'Many museums close on Mondays; Egeskov, Legoland and Tivoli open only part of the year.',
  'Bridge tolls: the Great Belt (Zealand ↔ Funen) and the Øresund (to Sweden). Some rental cars include a BroBizz tag.',
  'Copenhagen: don\'t drive in the centre; parking is expensive. Use the metro, trains and city bikes.',
  'Cycle lanes are busy and fast: don\'t walk on them, and look before crossing.',
  'The North Sea coast has strong currents: swim only where it\'s safe and lifeguarded, never near Grenen\'s tip at Skagen.',
  'Rain jacket and wind layers all year.',
  'European Health Insurance Card (EU) or travel insurance.',
]
BOOKINGS = [
  ('Flights to Denmark', 'flight', 1500, 'Copenhagen; or Billund for a Jutland-only trip.'),
  ('Rental car', 'transfer', 2500, 'Per week, small car. Ask whether it has a BroBizz bridge-toll tag.'),
  ('Fuel and bridge tolls', 'transfer', 900, 'Great Belt bridge ~300 DKK each way by car; the Compare tab estimates fuel per plan.'),
  ('Copenhagen Card', 'tickets', 600, '48 h; covers transport and most museums around Copenhagen.'),
  ('Legoland or Tivoli', 'tickets', 500, 'Seasonal; cheaper booked online.'),
  ('Bornholm ferry', 'transfer', 800, 'Return per person via Ystad or Køge; more with a car.'),
  ('Travel insurance', 'other', 300, ''),
]
RETIRED = []
CATEGORIES = ['Town', 'Base', 'Old town', 'Castle', 'Palace', 'Monastery & church', 'Ancient site', 'Monument', 'Ruins', 'Museum', 'Windmill', 'Village',
  'Food & market', 'Experience', 'Theme park', 'Garden', 'Beach', 'Coast', 'Island', 'Boat trip', 'Lighthouse', 'Viewpoint', 'Bike ride', 'Hike', 'Lake',
  'Nature reserve', 'Airport']
TRIP = {'name': 'Denmark', 'sunLat': 55.6761, 'sunLon': 12.5683, 'home': 'copenhagen', 'end': 'cph', 'tz': 'Europe/Copenhagen', 'country': 'Denmark', 'autoDays': 8,
        'arrive': {'time': '12:00', 'at': 'cph'}, 'leave': {'time': '18:00', 'at': 'cph'}}
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
