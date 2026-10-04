#!/usr/bin/env python3
"""Builds portugal-kids/data.json: the Portugal planner's data (portugal/data.json) narrowed to things to do with kids.

- From portugal/data.json it keeps the regions, airports, every overnight base (sleep: true) and the travel legs.
- parts/<part>.json `reuse`: Portugal places that families enjoy, with kid fields added (ages, stroller, kids, rainy,
  facilities) and optionally a family visit time, priority or caution.
- parts/<part>.json `places`: new kid-specific places (zoos, aquariums, science centres…), ids starting k_.
- parts/<part>.json `drives`: road legs connecting the new places.
- parts/osm_kids.json: playgrounds and kid venues from OpenStreetMap (ids osm_…), a one-off download from 2026-10-04.
  Playgrounds are minor places (minor: true): each hangs off the planner place it's next to (near: id).
See parts/SPEC.md for the format.

Run after changing parts/ or portugal/data.json:  python3 portugal-kids/tools/assemble.py
"""
import json, os, sys, importlib.util
from collections import Counter
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here); repo = os.path.dirname(root)
spec = importlib.util.spec_from_file_location('b', os.path.join(repo, 'trips', 'tools', 'build.py'))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)

PARTS = ['lisbon_sintra_setubal', 'oeste_centro', 'north', 'south', 'islands', 'osm_kids']
KID_FIELDS = ['ages', 'stroller', 'kids', 'rainy', 'facilities']
REUSE_FIELDS = KID_FIELDS + ['cat', 'visit', 'priority', 'caution', 'season']
KID_CATS = ['Zoo', 'Aquarium', 'Theme park', 'Water park', 'Science centre', 'Park & playground', 'Farm & animals',
            'Adventure park', 'Train ride', 'Indoor play', 'Trampoline park', 'Mini golf', 'Playground']
STROLLER = {'yes', 'partly', 'no'}
ADULTISH = {'Monastery & church', 'Monument', 'Palace', 'Museum', 'Ruins', 'Viewpoint', 'Old town', 'Town', 'Village', 'Wine',
            'Food & market', 'Lighthouse'}

CHECKLIST = [
    'ID for every child: EU children need their own ID card or passport, even babies.',
    'A child travelling with only one parent, or with grandparents: carry a signed consent letter from the other parent(s).',
    'Car seats: children under 135 cm must ride in a child seat in Portugal. Book them with the rental car, or bring your own.',
    'European Health Insurance Card (EU) for each child, or travel insurance. SNS 24 (808 24 24 24) gives health advice by phone.',
    'Sun: hats, high-factor sunscreen and water, even in spring and autumn. Avoid the beach between 12:00 and 16:00 in summer.',
    'Atlantic beaches: strong currents and big waves. Swim only at beaches with lifeguards and a green flag; river beaches and the Algarve\'s sheltered coves are calmer.',
    'Cliffs (Algarve, Cabo da Roca, Nazaré): hold hands near the edge; many viewpoints have no railing.',
    'Old towns are hilly and cobbled: a sturdy buggy, or a baby carrier, works better than a light city stroller.',
    'Book ahead in summer and school holidays: Oceanário, Zoomarine, dolphin and boat trips, water parks.',
    'Many museums and monuments close on Mondays. Kids under 12 often go free, or pay a reduced price; ask for a family ticket.',
    'Restaurants welcome children; dinner starts late (from 19:30). Most have high chairs; a "meia dose" (half portion) suits kids.',
    'Summer and early autumn: forest fire risk. Follow road closures and keep away from smoke.',
]
BOOKINGS = [
    ('Flights to Portugal', 'flight', 600, 'Lisbon, Porto and Faro all have international flights. Kids under 2 usually fly on a lap ticket.'),
    ('Rental car with child seats (and Via Verde)', 'car', 400, 'Per week; child seats cost ~€5–10 a day each, often capped per rental. Ask for the Via Verde toll device.'),
    ('Family accommodation', 'hotel', 700, 'Per week. Family rooms or an apartment with a kitchen; a pool is a big plus in summer.'),
    ('Tolls and fuel', 'car', 120, 'Rough guess for a week; the Compare tab estimates it per plan.'),
    ('Zoo, aquarium and park tickets', 'tickets', 200, 'For a family of four, a few big attractions. Buying online is often cheaper.'),
    ('Dolphin or boat trip', 'tour', 120, 'Family of four; book a calm-sea morning.'),
    ('Flights to Madeira or the Azores', 'flight', 400, 'Only if you add the islands. Rent a car (with child seats) there too.'),
    ('Travel insurance', 'other', 60, 'Family policy.'),
]


def fail(msg): sys.exit('assemble: ' + msg)


def main():
    base = json.load(open(os.path.join(repo, 'portugal', 'data.json')))
    pt = {p['id']: p for p in base['places']}
    regs = {r['id'] for r in base['regions']}
    keep = {}  # id → place, in order
    for p in base['places']:
        if p.get('sleep') or p['cat'] == 'Airport': keep[p['id']] = dict(p)
    new, drives = [], []
    for part in PARTS:
        f = os.path.join(root, 'parts', part + '.json')
        if not os.path.exists(f): print('missing part', part); continue
        d = json.load(open(f))
        for r in d.get('reuse', []):
            if r['id'] not in pt: print(f'{part}: unknown reused id, skipped:', r['id']); continue
            p = keep.get(r['id']) or dict(pt[r['id']])
            # the Portugal planner's priority is an adult's: a top monastery or viewpoint is "very good" here, not a
            # family highlight, unless the kids research gives it a family priority
            if 'priority' not in r and p['cat'] in ADULTISH: p['priority'] = min(p.get('priority', 2), 2)
            p.update({k: r[k] for k in REUSE_FIELDS if k in r})
            keep[r['id']] = p
        for p in d.get('places', []):
            if p['id'] in pt or p['id'] in keep or any(q['id'] == p['id'] for q in new): print(f'{part}: duplicate id, skipped:', p['id']); continue
            p.pop('sleep', None); new.append(p)
        drives += d.get('drives', [])
    places = [p for p in keep.values() if p['cat'] != 'Airport'] + new + [p for p in keep.values() if p['cat'] == 'Airport']
    cats = KID_CATS + [c for c in base['categories'] if c not in KID_CATS]
    for p in places:
        if p['region'] not in regs: fail(f"unknown region {p['region']} for {p['id']}")
        if p['cat'] not in cats: print('unknown category', p['cat'], 'for', p['id'], '→ Experience'); p['cat'] = 'Experience'
        if 'ages' in p:
            a = p['ages']
            if not (isinstance(a, list) and len(a) == 2 and 0 <= a[0] <= a[1] <= 18): fail(f"bad ages {a} for {p['id']}")
        if 'stroller' in p and p['stroller'] not in STROLLER: fail(f"bad stroller {p['stroller']} for {p['id']}")
        if p['id'].startswith('k_'):
            for k in ['name', 'lat', 'lon', 'visit', 'priority', 'summary', 'ages', 'stroller', 'kids']:
                if k not in p: fail(f"{p['id']} has no {k}")
            if not (29 < p['lat'] < 43 and -32 < p['lon'] < -6): fail(f"{p['id']} is outside Portugal: {p['lat']}, {p['lon']}")
    # a town with no kids tip is in the planner only as an overnight base: auto-plan doesn't offer it as a day stop
    for p in places:
        if p['cat'] in ('Town', 'Base', 'Village', 'Old town') and 'kids' not in p and p['cat'] != 'Airport': p['suggest'] = False
    ids = {p['id'] for p in places}
    for p in places:
        if p.get('minor') and p.get('near') not in ids: fail(f"{p['id']} is near {p.get('near')}, which isn't a place")
    legs, seen = [], set()
    for x in base['drives'] + drives:
        if x[0] not in ids or x[1] not in ids: continue
        k = tuple(sorted(x[:2])) + ((x[4],) if len(x) > 4 else ('road',))
        if k in seen: continue
        seen.add(k); legs.append(x)
    trip = dict(base['trip'], name='Portugal with kids')
    data = dict(base)
    data.update({
        'trip': trip, 'places': places, 'drives': legs, 'categories': cats, 'retiredPlaces': [],
        'checklist': CHECKLIST, 'checks': {}, 'picks': {},
        'bookings': [{'id': f'b{i + 1}', 'item': it, 'type': ty, 'option': None, 'status': 'todo', 'est': est, 'actual': None, 'seasonal': '', 'note': note}
                     for i, (it, ty, est, note) in enumerate(BOOKINGS)],
    })
    open(os.path.join(root, 'data.json'), 'w').write(b.pretty(data) + '\n')
    kid = [p for p in places if 'ages' in p]
    print(len(places), 'places (', len(new), 'new,', len(kid), 'with ages ),', len(legs), 'legs')
    print(dict(Counter(p['region'] for p in places)))
    print(dict(Counter(p['cat'] for p in places)))


main()
