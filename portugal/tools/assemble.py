#!/usr/bin/env python3
"""Builds portugal/data.json from the regional research files in portugal/parts/ plus the shared base below
(trip, regions, airports, links between regions, flights and trains, links, checklist, bookings).
Run: python3 portugal/tools/assemble.py. Edit data.json by hand afterwards if you like, but re-running this
overwrites it, so put lasting changes in parts/ or here."""
import json, os, sys, importlib.util
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
spec = importlib.util.spec_from_file_location('b', os.path.join(os.path.dirname(root), 'trips', 'tools', 'build.py'))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)

REGIONS = [
  ('lisbon', 'Lisbon', '#1d5fa8'), ('sintra', 'Sintra & Cascais', '#7b61c9'), ('setubal', 'Setúbal & Arrábida', '#00897b'),
  ('oeste', 'Óbidos, Nazaré & Tomar', '#c0612b'), ('centro', 'Coimbra, Aveiro & Serra da Estrela', '#6d8f1f'),
  ('porto', 'Porto', '#2f7fd1'), ('minho', 'Minho & Gerês', '#2e7d32'), ('douro', 'Douro Valley & Trás-os-Montes', '#8e244d'),
  ('alentejo', 'Alentejo', '#b5761f'), ('algarve', 'Algarve', '#d1495b'),
  ('madeira', 'Madeira', '#3f9142'), ('azores', 'Azores', '#00838f'),
]
AIRPORTS = [
  {'id': 'lis', 'name': 'Lisbon Airport (LIS)', 'region': 'lisbon', 'lat': 38.7742, 'lon': -9.1342, 'wiki': 'Lisbon Airport',
   'summary': "Humberto Delgado airport, inside the city: 20–30 min to the centre by metro (red line) or taxi.",
   'facts': ['Metro red line to the centre; change at Alameda or São Sebastião', 'Car rental desks in the P2 car park area', 'Allow 2 h before international flights in summer']},
  {'id': 'opo', 'name': 'Porto Airport (OPO)', 'region': 'porto', 'lat': 41.2481, 'lon': -8.6814, 'wiki': 'Porto Airport',
   'summary': "Francisco Sá Carneiro airport, ~25 min from central Porto by metro (line E, violet) or car.",
   'facts': ['Metro line E to Trindade in ~30 min', 'Tolls: the A28/A4 near Porto are electronic-only in places']},
]
for a in AIRPORTS: a.update({'visit': 0, 'cat': 'Airport', 'needsDaylight': False, 'suggest': False, 'priority': 1})

# links between the regions (each part only links its own hubs) and the airports: [a, b, km, minutes]
DRIVES = [
  ['lis', 'lisbon', 9, 20], ['opo', 'porto', 17, 25], ['lis', 'sintra', 28, 30], ['lis', 'setubal', 48, 40],
  ['lisbon', 'obidos', 85, 60], ['lisbon', 'tomar', 140, 95], ['lisbon', 'coimbra', 205, 130], ['lisbon', 'porto', 315, 190],
  ['lisbon', 'evora', 135, 90], ['lisbon', 'lagos', 300, 180], ['lisbon', 'faro', 280, 170],
  ['setubal', 'evora', 100, 70], ['tomar', 'coimbra', 85, 60], ['nazare', 'coimbra', 105, 70], ['coimbra', 'aveiro', 65, 50],
  ['aveiro', 'porto', 75, 55], ['coimbra', 'porto', 120, 75], ['porto', 'braga', 55, 40], ['porto', 'guimaraes', 55, 45],
  ['porto', 'peso_da_regua', 115, 75], ['evora', 'beja', 80, 55], ['beja', 'faro', 145, 95],
]
# door to door (to the airport or station, check-in or boarding, the trip): [a, b, km, minutes, mode, fare €]
TRANSIT = [
  ['lis', 'fnc', 970, 210, 'flight', 110], ['opo', 'fnc', 1150, 225, 'flight', 120],
  ['lis', 'pdl', 1450, 240, 'flight', 130], ['opo', 'pdl', 1520, 250, 'flight', 140],
  ['lis', 'ter', 1560, 245, 'flight', 140], ['lis', 'hor', 1700, 255, 'flight', 150], ['fnc', 'pdl', 960, 240, 'flight', 150],
  ['lisbon', 'coimbra', 205, 140, 'train', 25], ['lisbon', 'porto', 315, 205, 'train', 33], ['coimbra', 'porto', 120, 95, 'train', 17],
  ['lisbon', 'faro', 280, 230, 'train', 24],
]
LINKS = [
  {'name': 'IPMA weather & warnings', 'url': 'https://www.ipma.pt/en/', 'host': 'ipma.pt', 'note': 'Official forecasts, coastal sea state and yellow/orange/red warnings by district. In summer, the daily fire-risk map.'},
  {'name': 'Infraestruturas de Portugal: road conditions', 'url': 'https://www.infraestruturasdeportugal.pt/', 'host': 'infraestruturasdeportugal.pt', 'note': 'Road works and closures on national roads.'},
  {'name': 'Portugal Tolls (electronic tolls)', 'url': 'https://www.portugaltolls.com/', 'host': 'portugaltolls.com', 'note': 'How to pay the electronic-only tolls with a foreign or rental car. Simplest: a rental with Via Verde.'},
  {'name': 'CP trains', 'url': 'https://www.cp.pt/', 'host': 'cp.pt', 'note': 'Alfa Pendular and Intercidades tickets: Lisbon ↔ Coimbra ↔ Porto, Lisbon ↔ Faro. Cheaper booked ahead.'},
  {'name': 'Parques de Sintra', 'url': 'https://www.parquesdesintra.pt/', 'host': 'parquesdesintra.pt', 'note': 'Timed tickets for Pena, Monserrate, the Moorish Castle and Sintra Palace.'},
  {'name': 'Visit Portugal', 'url': 'https://www.visitportugal.com/', 'host': 'visitportugal.com', 'note': 'Official tourism site, with events by region.'},
  {'name': 'Madeira trails status', 'url': 'https://ifcn.madeira.gov.pt/', 'host': 'ifcn.madeira.gov.pt', 'note': 'Which official walks (PR trails, levadas) are open; they close after storms or rockfalls.'},
  {'name': 'Azores weather webcams (SpotAzores)', 'url': 'https://www.spotazores.com/', 'host': 'spotazores.com', 'note': 'Check the crater lakes are not in cloud before driving up to Sete Cidades or Lagoa do Fogo.'},
]
CHECKLIST = [
  'ID card (EU) or passport. Non-EU visitors: check the EES/ETIAS entry rules for the Schengen area.',
  'Driving licence; credit card in the driver\'s name for the rental deposit.',
  'Rental car with a Via Verde toll transponder (many motorways have electronic tolls only).',
  'Book timed tickets ahead: Pena Palace, Livraria Lello, Jerónimos in high season, Benagil boat trips.',
  'Many museums and monuments close on Mondays; some on public holidays (1 Jan, Easter, 1 May, 25 Dec).',
  'Atlantic beaches: strong currents and big swell. Swim only at beaches with lifeguards and a green flag.',
  'Cliffs (Algarve, Cabo da Roca, Nazaré): stay back from the edge, it can crumble.',
  'Hiking in Madeira and the Azores: check the trail is open, start early, bring a rain jacket and a headlamp for tunnels.',
  'Summer and early autumn: forest fire risk. No barbecues or open fires; follow road closures.',
  'Lunch is usually 12:30–15:00 and dinner from 19:30; many restaurants close one day a week.',
  'European Health Insurance Card (EU) or travel insurance.',
]
BOOKINGS = [
  ('Flights to Portugal', 'flight', 250, 'Lisbon, Porto and Faro all have international flights; open-jaw (into one, out of another) saves driving back.'),
  ('Rental car (with Via Verde)', 'car', 300, 'Per week, small car, outside summer. Ask for the Via Verde toll device.'),
  ('Tolls and fuel', 'car', 150, 'Rough guess for a week of touring; the Compare tab estimates it per plan.'),
  ('Sintra tickets (Pena + Regaleira)', 'tickets', 35, 'Pena park and palace ~€20, Regaleira ~€15. Timed entry.'),
  ('Douro river or Benagil boat trip', 'tour', 40, ''),
  ('Flights to Madeira or the Azores', 'flight', 150, 'Only if you add the islands. Rent a car there too.'),
  ('Travel insurance', 'other', 40, ''),
]
CATEGORIES = ['Town', 'Base', 'Old town', 'Castle', 'Palace', 'Monastery & church', 'Monument', 'Ruins', 'Museum', 'Village', 'Wine',
  'Food & market', 'Experience', 'Beach', 'Coast', 'Boat trip', 'Surf', 'Whale watching', 'Lighthouse', 'Viewpoint', 'Garden', 'Hike',
  'Mountain', 'Waterfall', 'Lake', 'Hot spring', 'Cave', 'Nature reserve', 'Airport']

def main():
    places, drives, seen = [], [], {a['id'] for a in AIRPORTS}
    parts = ['lisbon_sintra_setubal', 'oeste_centro', 'north', 'south', 'islands']
    for part in parts:
        f = os.path.join(root, 'parts', part + '.json')
        if not os.path.exists(f): print('missing part', part); continue
        d = json.load(open(f))
        for p in d['places']:
            if p['id'] in seen: print('duplicate id, skipped:', p['id'], 'in', part); continue
            seen.add(p['id']); places.append(p)
        drives += d['drives']
    places += AIRPORTS   # last, so the Places list starts with sights
    ids = {p['id'] for p in places}
    regs = {r[0] for r in REGIONS}
    for p in places:
        if p['region'] not in regs: sys.exit(f"unknown region {p['region']} for {p['id']}")
        if p['cat'] not in CATEGORIES: print('unknown category', p['cat'], 'for', p['id'], '→ Landmark'); p['cat'] = 'Landmark'
    allD = []; key = set()
    for x in DRIVES + drives + TRANSIT:
        if x[0] not in ids or x[1] not in ids: print('leg with unknown place, skipped:', x); continue
        k = tuple(sorted(x[:2])) + ((x[4],) if len(x) > 4 else ('road',))
        if k in key: continue
        key.add(k); allD.append(x)
    data = {
        'version': 1,
        'trip': {'name': 'Portugal', 'from': 'auto', 'to': 'auto', 'sunLat': 38.7223, 'sunLon': -9.1393, 'home': 'lisbon', 'end': 'lis',
                 'tz': 'Europe/Lisbon', 'country': 'Portugal', 'autoDays': 8,
                 'autoEnds': {'first': {'label': 'Arrival day'}, 'last': {'label': 'Departure day'}},
                 'arrive': {'time': '12:00', 'at': 'lis'}, 'leave': {'time': '18:00', 'at': 'lis'}},
        'settings': {},
        'days': [], 'blocks': [], 'options': [{'id': 'A1', 'block': 'A', 'name': 'My plan', 'note': '', 'days': {}}],
        'regions': [{'id': i, 'name': n, 'color': c} for i, n, c in REGIONS],
        'places': places, 'drives': allD,
        'bookings': [{'id': f'b{i + 1}', 'item': it, 'type': ty, 'option': None, 'status': 'todo', 'est': est, 'actual': None, 'seasonal': '', 'note': note}
                     for i, (it, ty, est, note) in enumerate(BOOKINGS)],
        'links': LINKS, 'checklist': CHECKLIST, 'checks': {}, 'categories': CATEGORIES, 'picks': {},
    }
    open(os.path.join(root, 'data.json'), 'w').write(b.pretty(data) + '\n')
    from collections import Counter
    print(len(places), 'places,', len(allD), 'legs', dict(Counter(p['region'] for p in places)))

main()
