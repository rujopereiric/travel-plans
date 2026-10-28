#!/usr/bin/env python3
"""Builds uzbekistan/data.json from the regional research files in uzbekistan/parts/ plus the shared base below
(trip, regions, airports, flights and trains, links, checklist, bookings).
Run: python3 uzbekistan/tools/assemble.py. Edit data.json by hand afterwards if you like, but re-running this
overwrites it, so put lasting changes in parts/ or here."""
import json, os, re, sys, importlib.util
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
spec = importlib.util.spec_from_file_location('b', os.path.join(os.path.dirname(root), 'trips', 'tools', 'build.py'))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
PARTS = ['east', 'west']
BOUNDS = (37.1, 55.9, 45.6, 73.2)
REGIONS = [
  ('tashkent', 'Tashkent', '#1b6f8a'), ('chimgan', 'Chimgan & Charvak mountains', '#2e7d32'), ('fergana', 'Fergana Valley', '#8e244d'),
  ('samarkand', 'Samarkand', '#3949ab'), ('south', 'Shahrisabz, Termez & the south', '#6d8f1f'), ('nurata', 'Nurata, Aydarkul & the Kyzylkum', '#b5761f'),
  ('bukhara', 'Bukhara', '#c0612b'), ('khorezm', 'Khiva & Khorezm', '#d1495b'), ('karakalpak', 'Nukus & the Aral Sea', '#00838f'),
]
AIRPORTS = [
  {'id': 'tas', 'name': 'Tashkent Airport (TAS)', 'region': 'tashkent', 'lat': 41.2579, 'lon': 69.2812, 'wiki': 'Tashkent International Airport',
   'summary': 'Uzbekistan\'s main airport, inside the city: 20–30 min to the centre by taxi (Yandex Go).',
   'facts': ['Many flights from Europe land at night or early morning', 'SIM cards (Ucell, Beeline, Uzmobile) are sold in arrivals; bring your passport', 'Domestic flights leave from the separate domestic terminal: check which one']},
  {'id': 'skd', 'name': 'Samarkand Airport (SKD)', 'region': 'samarkand', 'lat': 39.7005, 'lon': 66.9838, 'wiki': 'Samarkand International Airport',
   'summary': 'Samarkand\'s airport, 15 min from the Registan, with some direct flights from Europe and Istanbul.', 'facts': ['Open-jaw tickets (into Samarkand, home from Tashkent) save a day']},
  {'id': 'bhk', 'name': 'Bukhara Airport (BHK)', 'region': 'bukhara', 'lat': 39.7750, 'lon': 64.4833, 'wiki': 'Bukhara International Airport',
   'summary': 'Bukhara\'s airport, 15 min from the old town.', 'facts': ['Flights to Tashkent and Moscow; a few to Istanbul']},
  {'id': 'ugc', 'name': 'Urgench Airport (UGC)', 'region': 'khorezm', 'lat': 41.5843, 'lon': 60.6417, 'wiki': 'Urgench International Airport',
   'summary': 'The airport for Khiva: 35–40 min by taxi to the Itchan Kala.', 'facts': ['Flights to Tashkent take about 1 h 40 min', 'Taxis to Khiva wait outside arrivals; agree the price first']},
  {'id': 'ncu', 'name': 'Nukus Airport (NCU)', 'region': 'karakalpak', 'lat': 42.4884, 'lon': 59.6233, 'wiki': 'Nukus Airport',
   'summary': 'Nukus\'s small airport, 10 min from the Savitsky Museum.', 'facts': ['Flights to Tashkent']},
  {'id': 'tmj', 'name': 'Termez Airport (TMJ)', 'region': 'south', 'lat': 37.2867, 'lon': 67.3100, 'wiki': 'Termez Airport',
   'summary': 'Termez\'s airport, 15 min from town.', 'facts': ['Flights to Tashkent take about 1 h 30 min']},
]
DRIVES = [['tas', 'tashkent', 7, 20], ['skd', 'samarkand', 6, 15], ['bhk', 'bukhara', 5, 15], ['ugc', 'urgench', 4, 10], ['ugc', 'khiva', 35, 40],
          ['ncu', 'nukus', 6, 12], ['tmj', 'termez', 10, 15]]
TRANSIT = [['tas', 'ugc', 750, 220, 'flight', 900000], ['tas', 'ncu', 870, 230, 'flight', 1000000], ['tas', 'tmj', 470, 210, 'flight', 800000],
           ['tas', 'bhk', 440, 205, 'flight', 800000]]
LINKS = [
  {'name': 'Uzbekistan Railways tickets', 'url': 'https://eticket.railway.uz/', 'host': 'eticket.railway.uz', 'note': 'Afrosiyob and other trains. Seats go on sale about 45 days ahead and sell out: book early.'},
  {'name': 'Uzbekistan Airways', 'url': 'https://www.uzairways.com/', 'host': 'uzairways.com', 'note': 'Domestic flights: Tashkent ↔ Urgench, Nukus, Termez, Bukhara.'},
  {'name': 'Uzbekistan e-visa', 'url': 'https://e-visa.gov.uz/', 'host': 'e-visa.gov.uz', 'note': 'Many nationalities (including the EU) need no visa for up to 30 days; others apply here.'},
  {'name': 'Uzbekistan Travel (tourism board)', 'url': 'https://uzbekistan.travel/', 'host': 'uzbekistan.travel', 'note': 'Official tourism site: sights, festivals and practical information.'},
]
CHECKLIST = [
  'Passport valid 3+ months after you leave. EU citizens: no visa for up to 30 days; check the rule for your nationality.',
  'Registration: hotels and guesthouses register you with the authorities. Keep the slips; you may be asked for them when you leave.',
  'Book train tickets early (eticket.railway.uz): the Afrosiyob between Tashkent, Samarkand and Bukhara sells out days ahead.',
  'Cash: bring euros or dollars in clean, recent notes to change at banks. Cards work in bigger hotels and in Tashkent.',
  'Dress modestly in mosques and madrasas: shoulders and knees covered; women carry a scarf. Shoes off where asked.',
  'Summer (June–August) is 40 °C+ in Bukhara and Khiva: sightsee early and late. Spring and autumn are the best seasons.',
  'Medicines: some common ones (codeine, some sleeping pills) are controlled. Bring prescriptions in the original packs.',
  'Drones need a permit and are confiscated at the border without one.',
  'Some sites charge a separate photo or video fee; the Itchan Kala in Khiva has one combined ticket.',
  'Travel insurance.',
]
BOOKINGS = [
  ('Flights to Uzbekistan', 'flight', 5000000, 'Tashkent (TAS); open-jaw via Samarkand or Urgench saves backtracking.'),
  ('Afrosiyob train tickets', 'transfer', 900000, 'Tashkent → Samarkand → Bukhara, per person. Book on eticket.railway.uz.'),
  ('Domestic flight to Urgench (Khiva)', 'flight', 900000, 'Or the train from Bukhara (6–7 h).'),
  ('Private driver days', 'transfer', 1500000, 'Shahrisabz, the Khorezm fortresses, Nurata: a driver for the day.'),
  ('Yurt camp night (Aydarkul)', 'hotel', 800000, 'Per person, with dinner and breakfast.'),
  ('Site tickets (estimate)', 'tickets', 600000, 'Registan, Shah-i-Zinda, Ark, Itchan Kala and the rest.'),
  ('Travel insurance', 'other', 500000, ''),
]
RETIRED = []
CATEGORIES = ['Town', 'Base', 'Old town', 'Mosque & madrasa', 'Mausoleum', 'Fortress', 'Palace', 'Ruins', 'Monument', 'Museum', 'Food & market', 'Experience',
  'Village', 'Desert', 'Lake', 'Mountain', 'Hike', 'Nature reserve', 'Viewpoint', 'Garden', 'Airport']
TRIP = {'name': 'Uzbekistan', 'sunLat': 41.3111, 'sunLon': 69.2797, 'home': 'tashkent', 'end': 'tas', 'tz': 'Asia/Tashkent', 'country': 'Uzbekistan', 'autoDays': 10,
        'arrive': {'time': '12:00', 'at': 'tas'}, 'leave': {'time': '14:00', 'at': 'tas'}}
EUR_NOTE = re.compile(r'\s*\((?:~|≈|about )?€\s?[\d.,]+\)')
def clean(p):  # the app adds the € amount itself, at the live rate
    for k in ('facts',):
        if k in p: p[k] = [EUR_NOTE.sub('', f) for f in p[k]]
    for k in ('summary', 'season', 'caution'):
        if k in p: p[k] = EUR_NOTE.sub('', p[k])

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
