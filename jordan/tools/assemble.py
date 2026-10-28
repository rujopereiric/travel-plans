#!/usr/bin/env python3
"""Builds jordan/data.json from the regional research files in jordan/parts/ plus the shared base below
(trip, regions, airports, flights and trains, links, checklist, bookings).
Run: python3 jordan/tools/assemble.py. Edit data.json by hand afterwards if you like, but re-running this
overwrites it, so put lasting changes in parts/ or here."""
import json, os, re, sys, importlib.util
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
spec = importlib.util.spec_from_file_location('b', os.path.join(os.path.dirname(root), 'trips', 'tools', 'build.py'))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
PARTS = ['north', 'south']
BOUNDS = (29.1, 34.9, 33.4, 39.4)  # south, west, north, east
REGIONS = [
  ('amman', 'Amman', '#a3412c'), ('north', 'Jerash, Ajloun & the north', '#2e7d32'), ('east', 'Desert castles & Azraq', '#8d6e63'),
  ('deadsea', 'Dead Sea, Madaba & Mount Nebo', '#0277bd'), ('kings', "King's Highway: Kerak, Dana & Shobak", '#7b61c9'),
  ('petra', 'Petra & Wadi Musa', '#c0612b'), ('rum', 'Wadi Rum', '#d1495b'), ('aqaba', 'Aqaba', '#00897b'),
]
AIRPORTS = [
  {'id': 'amm', 'name': 'Queen Alia Airport, Amman (AMM)', 'region': 'amman', 'lat': 31.7226, 'lon': 35.9932, 'wiki': 'Queen Alia International Airport',
   'summary': 'Jordan\'s main airport, 35 km south of Amman on the Desert Highway: about 40 min to the city, and on the way to the Dead Sea and the south.',
   'facts': ['Visa on arrival, or free with the Jordan Pass (3+ nights)', 'Car rental desks in arrivals; the Airport Express bus runs to Amman', 'Allow 3 h before international flights: security is thorough']},
  {'id': 'aqj', 'name': 'King Hussein Airport, Aqaba (AQJ)', 'region': 'aqaba', 'lat': 29.6116, 'lon': 35.0181, 'wiki': 'King Hussein International Airport',
   'summary': 'Aqaba\'s airport, 10 km north of town: Royal Jordanian flights to Amman and seasonal charters from Europe. Handy for Wadi Rum and Petra.',
   'facts': ['About 1 h flight to Amman', 'Aqaba is a special economic zone: duty-free shopping']},
]
DRIVES = [['amm', 'amman', 35, 40], ['aqj', 'aqaba', 10, 15], ['amm', 'madaba', 30, 30], ['amm', 'dead_sea', 60, 55]]
TRANSIT = [['amm', 'aqj', 330, 190, 'flight', 60]]
LINKS = [
  {'name': 'Jordan Pass', 'url': 'https://www.jordanpass.jo/', 'host': 'jordanpass.jo', 'note': 'Buy before you arrive: entry to Petra and ~40 sites, and the visa fee waived if you stay 3+ nights.'},
  {'name': 'Visit Petra', 'url': 'https://www.visitpetra.jo/', 'host': 'visitpetra.jo', 'note': 'Petra opening hours, tickets and Petra by Night dates.'},
  {'name': 'Visit Jordan (tourism board)', 'url': 'https://www.visitjordan.com/', 'host': 'visitjordan.com', 'note': 'Official tourism site: regions, events and practical information.'},
  {'name': 'RSCN nature reserves', 'url': 'https://www.rscn.org.jo/', 'host': 'rscn.org.jo', 'note': 'Dana, Wadi Mujib, Ajloun and Azraq reserves: trails, guides and lodges. Some trails need booking.'},
  {'name': 'Jordan Meteorological Department', 'url': 'https://jmd.gov.jo/', 'host': 'jmd.gov.jo', 'note': 'Forecasts and warnings: flash floods, dust storms and the rare winter snow.'},
  {'name': 'JETT buses', 'url': 'https://www.jett.com.jo/', 'host': 'jett.com.jo', 'note': 'Tourist buses Amman ↔ Petra ↔ Aqaba if you don\'t drive.'},
]
CHECKLIST = [
  'Passport valid 6+ months. Visa on arrival, or buy the Jordan Pass online before you fly: it waives the visa fee if you stay at least 3 nights.',
  'Driving licence (an International Driving Permit is recommended); credit card for the rental deposit.',
  'Dress modestly away from the beach resorts: shoulders and knees covered; a headscarf for women in mosques.',
  'Friday is the weekend: some sites, shops and offices open late or close early. Ramadan changes opening hours and restaurant times.',
  'Petra: walking shoes, sun hat, 2–3 l of water a day; start at opening time to beat the heat and the groups.',
  'Wadi Mujib Siq Trail opens only from about April to October, and closes on days with flood risk.',
  'Dead Sea: don\'t shave the day before, keep the water out of your eyes, and float, don\'t swim face down.',
  'Night driving: unlit roads, speed bumps and animals. Plan long drives in daylight.',
  'Book Wadi Rum camps and jeep tours ahead in spring and autumn.',
  'Travel insurance that covers hiking and desert activities.',
]
BOOKINGS = [
  ('Flights to Jordan', 'flight', 300, 'Amman (AMM); some seasonal flights go straight to Aqaba (AQJ).'),
  ('Jordan Pass', 'tickets', 75, 'Wanderer 70 / Explorer 75 / Expert 80 JOD: 1, 2 or 3 days in Petra. Buy before you arrive.'),
  ('Rental car', 'transfer', 250, 'Per week, small car. Or a driver for the King\'s Highway day.'),
  ('Wadi Rum camp and jeep tour', 'tour', 90, 'Per person: a night in a camp with dinner, and a half-day jeep tour.'),
  ('Dead Sea resort day pass', 'other', 35, 'Easier than the free public beaches: showers, pools and shade.'),
  ('Travel insurance', 'other', 30, ''),
]
RETIRED = []
CATEGORIES = ['Town', 'Base', 'Old town', 'Castle', 'Ruins', 'Monument', 'Museum', 'Mosque', 'Monastery & church', 'Village', 'Food & market', 'Experience',
  'Desert', 'Canyon', 'Hike', 'Viewpoint', 'Nature reserve', 'Hot spring', 'Beach', 'Snorkel & dive', 'Boat trip', 'Airport']
TRIP = {'name': 'Jordan', 'sunLat': 31.9539, 'sunLon': 35.9106, 'home': 'amman', 'end': 'amm', 'tz': 'Asia/Amman', 'country': 'Jordan', 'autoDays': 8,
        'arrive': {'time': '14:00', 'at': 'amm'}, 'leave': {'time': '16:00', 'at': 'amm'}}
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
