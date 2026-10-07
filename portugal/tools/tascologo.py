#!/usr/bin/env python3
"""Builds portugal/tascologo.json from O Tascólogo's map export (parts/tascologo_places.xlsx).

O Tascólogo (Luís Lavoura, https://tascologo.pt) hand-picked more than 1,200 tascas and traditional restaurants.
The app shows them as their own map layer and Places tab, credited to him, and any of them can be added to My places.
Places outside Portugal are left out (Spain, Morocco, Thailand…): only the mainland, Madeira and the Azores are kept.
Rows listed twice (once per list in the export) are merged.

Run: python3 portugal/tools/tascologo.py   (needs openpyxl)
Each item is [id, name, lat, lon, district, town, type, note, rating, reviews, phone, website, maps, hours, flags]:
  hours: 7 strings, Sunday first: "08:00-15:00,19:00-22:00", "" = closed, "24h"; null when the export has no hours
  flags: "t" = temporarily closed, "n" = no Google listing (a bare address pin)
"""
import hashlib, json, os, re, sys, datetime
import openpyxl

here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
SRC, OUT = os.path.join(root, 'parts', 'tascologo_places.xlsx'), os.path.join(root, 'tascologo.json')
# mainland, Madeira & Porto Santo, Azores: [south, west, north, east]
BOXES = [(36.9, -9.6, 42.2, -6.15), (32.35, -17.3, 33.15, -16.2), (36.9, -31.3, 39.75, -24.9)]
DAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
# Google's place types come in Portuguese; the app is in English
TYPES = {'Restaurante': 'Restaurant', 'Restaurante português': 'Portuguese restaurant', 'Café': 'Café', 'Bar': 'Bar', 'Churrascaria': 'Grill house',
  'Restaurante familiar': 'Family restaurant', 'Restaurante de frutos do mar': 'Seafood restaurant', 'Cafeteria': 'Café', 'Lanchonete': 'Snack bar',
  'Restaurante especializado em Tapas': 'Tapas bar', 'Bar e Grill': 'Bar & grill', 'Bistrô': 'Bistro', 'Edifício': '', 'Associação / organização': 'Association',
  'Restaurante de comida para viagem': 'Takeaway', 'Hotel': 'Hotel', 'Alimentação': 'Food shop', 'Restaurante de frango': 'Chicken restaurant',
  'Confeitaria': 'Pastry shop', 'Bar esportivo': 'Sports bar', 'Restaurante de carne': 'Steakhouse', 'Microcervejaria': 'Brewpub', 'Banca de café': 'Coffee stand',
  'Açougue': 'Butcher', 'Mercado': 'Market', 'Serviços': '', 'Supermercado': 'Grocery', 'Hospedaria': 'Guesthouse', 'Restaurante basco': 'Basque restaurant',
  'Mercearia': 'Grocery', 'Restaurante mediterrâneo': 'Mediterranean restaurant', 'Restaurante refinado': 'Fine dining', 'Restaurante tailandês': 'Thai restaurant',
  'Armazém': '', 'Bar de vinhos': 'Wine bar', 'Pico de montanha': '', 'Diner': 'Diner', 'Cachorro-quente': 'Hot dogs', 'Padaria': 'Bakery',
  'Local para eventos': 'Event venue', 'Marco histórico': 'Landmark', 'Restaurante fast-food': 'Fast food', 'Restaurante de brunch': 'Brunch'}
DISTRICT = {'Distrito de Évora': 'Évora', 'Distrito da Guarda': 'Guarda'}

def in_portugal(r):
    if not (r['Address'] or '').endswith('Portugal'): return False
    return any(s <= r['Latitude'] <= n and w <= r['Longitude'] <= e for s, w, n, e in BOXES)

def day_hours(t):
    t = t.strip()
    if t == 'Fechado': return ''
    if 'Atendimento 24 horas' in t: return '24h'
    spans = re.findall(r'(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})', t.replace(' ', ' '))
    if not spans: sys.exit(f'unreadable hours: {t!r}')
    return ','.join(f'{a.zfill(5)}-{b.zfill(5)}' for a, b in spans)

def hours(text):
    if not text: return None
    week = {}
    for part in text.split(' | '):
        day, _, t = part.partition(': ')
        if day not in DAYS: sys.exit(f'unknown weekday {day!r}')
        week[DAYS.index(day)] = day_hours(t)
    return [week.get(i, '') for i in range(7)] if len(week) == 7 else None

def main():
    ws = openpyxl.load_workbook(SRC, read_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True)); head = rows[0]
    items, seen, foreign = [], {}, []
    for r in (dict(zip(head, x)) for x in rows[1:]):
        if not r['Name']: continue
        if not in_portugal(r): foreign.append(f"{r['Name']} ({r['District']})"); continue
        key = r['Place ID'] or f"{r['Name']}|{r['Latitude']:.5f}|{r['Longitude']:.5f}"
        if key in seen:  # same place in both lists: keep the first, but don't lose a note
            it = seen[key]
            if not it[7] and r['Note']: it[7] = r['Note'].strip()
            continue
        maps = re.sub(r'&g_mp=.*$', '', r['Google Maps'] or '') or None
        flags = ('t' if r['Status'] == 'CLOSED_TEMPORARILY' else '') + ('' if r['Status'] else 'n')
        it = ['tg_' + hashlib.sha1(key.encode()).hexdigest()[:8], r['Name'].strip(), round(r['Latitude'], 5), round(r['Longitude'], 5),
              DISTRICT.get(r['District'], r['District']), r['Town'] or '', TYPES.get(r['Type'], r['Type'] or ''), (r['Note'] or '').strip(),
              r['Rating'], r['Reviews'], r['Phone'] or '', r['Website'] or '', maps, hours(r['Opening hours']), flags]
        seen[key] = it; items.append(it)
    if len({i[0] for i in items}) != len(items): sys.exit('id collision')
    items.sort(key=lambda i: (i[4], i[5], i[1]))
    data = {'about': 'O Tascólogo (Luís Lavoura): tascas and traditional restaurants, hand-picked. Built by tools/tascologo.py.',
            'site': 'https://tascologo.pt', 'at': datetime.date.today().isoformat(), 'items': items}
    with open(OUT, 'w') as f:
        f.write('{' + ', '.join(f'"{k}": {json.dumps(v, ensure_ascii=False)}' for k, v in data.items() if k != 'items') + ', "items": [\n')
        f.write(',\n'.join(json.dumps(i, ensure_ascii=False, separators=(',', ':')) for i in items) + '\n]}\n')
    print(len(items), 'places in Portugal;', len(foreign), 'abroad left out:', '; '.join(foreign))

main()
