#!/usr/bin/env python3
"""Builds ireland/data.json from the regional research files in ireland/parts/ plus the shared base below
(trip, regions, airports, flights and trains, links, checklist, bookings).
Run: python3 ireland/tools/assemble.py. Edit data.json by hand afterwards if you like, but re-running this
overwrites it, so put lasting changes in parts/ or here."""
import json, os, re, sys, importlib.util
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
spec = importlib.util.spec_from_file_location('b', os.path.join(os.path.dirname(root), 'trips', 'tools', 'build.py'))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
PARTS = ['south', 'west_north']
BOUNDS = (51.3, -10.8, 55.5, -5.3)
REGIONS = [
  ('dublin', 'Dublin', '#1f7a4a'), ('east', 'Wicklow & the Boyne Valley', '#6d8f1f'), ('southeast', 'Kilkenny, Waterford, Wexford & Tipperary', '#b5761f'),
  ('cork', 'Cork & West Cork', '#d1495b'), ('kerry', 'Kerry', '#00897b'), ('clare', 'Clare & Limerick', '#7b61c9'),
  ('galway', 'Galway, Connemara & the Aran Islands', '#2f7fd1'), ('northwest', 'Mayo, Sligo & Donegal', '#8e244d'),
  ('midlands', 'Midlands & the Shannon', '#8d6e63'), ('north', 'Northern Ireland', '#3949ab'),
]
AIRPORTS = [
  {'id': 'dub', 'name': 'Dublin Airport (DUB)', 'region': 'dublin', 'lat': 53.4264, 'lon': -6.2499, 'wiki': 'Dublin Airport',
   'summary': 'Ireland\'s main airport, 10 km north of the city: 25–45 min to the centre by Airlink/Dublin Express bus or taxi.',
   'facts': ['US pre-clearance for flights to the United States', 'Car rental in the car rental centre (shuttle bus)', 'The M50 ring road toll is barrier-free: pay online by 8 pm the next day (eflow.ie)']},
  {'id': 'ork', 'name': 'Cork Airport (ORK)', 'region': 'cork', 'lat': 51.8413, 'lon': -8.4911, 'wiki': 'Cork Airport',
   'summary': 'Cork\'s airport, 15 min south of the city: handy for West Cork and Kerry.', 'facts': ['Flights from the UK and Europe']},
  {'id': 'snn', 'name': 'Shannon Airport (SNN)', 'region': 'clare', 'lat': 52.7020, 'lon': -8.9248, 'wiki': 'Shannon Airport',
   'summary': 'Between Limerick and Ennis: the closest airport to the Cliffs of Moher and the Burren, with flights from the US and Europe.', 'facts': ['US pre-clearance', 'Bunratty Castle is 10 min away']},
  {'id': 'knock', 'name': 'Ireland West Airport, Knock (NOC)', 'region': 'northwest', 'lat': 53.9103, 'lon': -8.8185, 'wiki': 'Ireland West Airport',
   'summary': 'A small airport on a hilltop in Mayo, between Westport and Sligo.', 'facts': ['Flights from the UK and some European cities', 'Fog can divert flights']},
  {'id': 'bfs', 'name': 'Belfast International Airport (BFS)', 'region': 'north', 'lat': 54.6575, 'lon': -6.2158, 'wiki': 'Belfast International Airport',
   'summary': 'Northern Ireland\'s main airport, 30 min north-west of Belfast; also close to the Causeway Coast.', 'facts': ['Belfast City Airport (BHD) is closer to the centre, for UK flights', 'UK rules: pounds (£)']},
]
DRIVES = [['dub', 'dublin', 12, 25], ['dub', 'drogheda', 40, 35], ['ork', 'cork', 8, 15], ['ork', 'kinsale', 22, 25], ['snn', 'limerick', 25, 25],
          ['snn', 'ennis', 23, 20], ['knock', 'westport', 55, 50], ['knock', 'sligo', 55, 45], ['bfs', 'belfast', 25, 30], ['bfs', 'portrush', 70, 60]]
TRANSIT = []
LINKS = [
  {'name': 'Met Éireann warnings', 'url': 'https://www.met.ie/warnings', 'host': 'met.ie', 'note': 'Official forecasts and yellow/orange/red wind and rain warnings by county.'},
  {'name': 'Met Office (Northern Ireland)', 'url': 'https://www.metoffice.gov.uk/', 'host': 'metoffice.gov.uk', 'note': 'Forecasts and warnings for Northern Ireland.'},
  {'name': 'Irish Rail', 'url': 'https://www.irishrail.ie/', 'host': 'irishrail.ie', 'note': 'Trains from Dublin to Cork, Galway, Limerick, Killarney, Sligo, Westport and Belfast (Enterprise). Cheaper booked online.'},
  {'name': 'Translink (Northern Ireland)', 'url': 'https://www.translink.co.uk/', 'host': 'translink.co.uk', 'note': 'Trains and buses in Northern Ireland: Belfast ↔ Derry, the Causeway Coast.'},
  {'name': 'Heritage Ireland (OPW)', 'url': 'https://heritageireland.ie/', 'host': 'heritageireland.ie', 'note': 'State heritage sites, seasonal opening hours, and tickets for Brú na Bóinne (Newgrange). The Heritage Card covers them all.'},
  {'name': 'eFlow M50 toll', 'url': 'https://www.eflow.ie/', 'host': 'eflow.ie', 'note': 'The Dublin ring road toll has no barriers: pay online by 8 pm the next day (rental cars often pay it for you).'},
  {'name': 'Aran Island Ferries', 'url': 'https://www.aranislandferries.com/', 'host': 'aranislandferries.com', 'note': 'Sailings from Rossaveal to the three islands; check on windy days.'},
  {'name': 'Discover Ireland', 'url': 'https://www.discoverireland.ie/', 'host': 'discoverireland.ie', 'note': 'Official tourism site for the Republic, with events.'},
]
CHECKLIST = [
  'Passport or EU ID card. Northern Ireland is in the UK: check whether you need the UK ETA if you cross the border (non-Irish, non-UK citizens).',
  'Driving licence and a credit card for the rental deposit. Tell the rental company if you\'ll drive into Northern Ireland (cross-border fee).',
  'Drive on the LEFT. Narrow country roads: give way at passing places, watch for sheep, cyclists and tractors.',
  'Rain jacket and layers all year: the weather changes several times a day.',
  'Book timed tickets ahead: the Book of Kells, the Guinness Storehouse, Brú na Bóinne (Newgrange), and Skellig Michael landing tours months ahead.',
  'Many castles, houses and visitor centres close or shorten hours from November to March.',
  'Cliffs (Moher, Slieve League, the Causeway coast): stay behind barriers and away from crumbling edges, especially in wind.',
  'The Atlantic is cold and has rip currents: swim only at lifeguarded beaches in summer.',
  'Plugs are the UK three-pin type (G).',
  'European Health Insurance Card (EU) or travel insurance.',
]
BOOKINGS = [
  ('Flights to Ireland', 'flight', 250, 'Dublin, Shannon or Cork; flying into one and out of another saves driving back.'),
  ('Rental car', 'transfer', 350, 'Per week, small car, outside summer. Automatics cost more: book early.'),
  ('Fuel and tolls', 'transfer', 150, 'Rough guess for a week of touring; the Compare tab estimates it per plan.'),
  ('Book of Kells and Guinness Storehouse', 'tickets', 50, 'Timed entry. ~€20 and ~€26.'),
  ('Skellig Michael landing tour', 'tour', 150, 'Mid-May to September only; book months ahead. Often cancelled for the sea.'),
  ('Aran Islands ferry', 'tour', 35, 'Return, Rossaveal ↔ Inis Mór. Bikes for hire at the pier.'),
  ('Travel insurance', 'other', 40, ''),
]
RETIRED = []
CATEGORIES = ['Town', 'Base', 'Old town', 'Castle', 'Stately home', 'Monastery & church', 'Ancient site', 'Monument', 'Ruins', 'Museum', 'Village',
  'Distillery & brewery', 'Food & market', 'Experience', 'Beach', 'Coast', 'Island', 'Boat trip', 'Lighthouse', 'Viewpoint', 'Garden', 'Hike',
  'Mountain', 'Waterfall', 'Lake', 'Cave', 'Nature reserve', 'Scenic drive', 'Airport']
TRIP = {'name': 'Ireland', 'sunLat': 53.3472, 'sunLon': -6.2591, 'home': 'dublin', 'end': 'dub', 'tz': 'Europe/Dublin', 'country': 'Ireland', 'autoDays': 8,
        'arrive': {'time': '12:00', 'at': 'dub'}, 'leave': {'time': '17:00', 'at': 'dub'}}
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
