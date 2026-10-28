# Portugal with Kids — place data spec (for research agents)

The kids planner is built from the Portugal planner (`portugal/data.json`). It keeps that planner's hub towns, airports
and travel legs, and shows only places that are good with children aged 0–14.

You write ONE JSON file: `portugal-kids/parts/<part>.json` with this shape:
```json
{ "reuse": [ ... ], "places": [ ... ], "drives": [ ... ] }
```
No network access: use what you reliably know. Accuracy matters more than quantity. Do NOT invent URLs, prices,
hours or attractions you aren't fairly sure exist and still operate — leave the field (or the place) out instead.

## The kid fields (on every entry in `reuse` and `places`)
- `ages`: `[min, max]` — the ages (0–14) the place really works for. `[0, 14]` = everyone, from babies up.
  Examples: a zoo `[0, 14]`; a toddler farm `[0, 8]`; an adventure park with zip lines `[7, 14]`; a big palace with a
  long queue and nothing to touch `[8, 14]`; a 3-hour hike `[9, 14]`. Be honest: it is how the app filters.
- `stroller`: `"yes"` (buggy-friendly all the way), `"partly"` (main areas fine, some steps, cobbles or sand),
  or `"no"` (stairs, trails, rocks: use a baby carrier).
- `kids`: ONE sentence for parents, starting with what kids enjoy, then the best tip. E.g. "Kids love feeding the
  goats and the tractor ride; go in the morning, before the midday heat, and bring a change of clothes."
- `rainy`: `true` if it's a good choice on a rainy day (mostly indoors or covered). Omit otherwise.
- `facilities`: optional short string, only if you're fairly sure: "Baby-changing, café, picnic area".

## reuse
Places that are already in `portugal/data.json` (read it: `python3 -c "import json;[print(p['id'],'|',p['region'],'|',p['cat'],'|',p['name']) for p in json.load(open('portugal/data.json'))['places']]"`)
and in your regions, that families genuinely enjoy: castles to run around, beaches with calm water, caves, boat trips,
easy walks, gardens, towns with lots to see. Each entry: `{"id": "<existing id>", "ages": [...], "stroller": "...", "kids": "...", ...}`.
Optionally `"cat"` (a kid category, e.g. `"Aquarium"`), `"visit"` (minutes) if a family visit is shorter or longer than the adult one, `"priority"` (1–3) for the
family priority, and `"caution"` for a kid-specific risk (cliff edges with no railing, big waves).
Do not reuse places that are boring or risky for kids (wine cellars, long serious hikes, via ferratas, dangerous cliff
paths). Do NOT list hub towns or airports in `reuse` unless you want to add kid notes: the hubs are kept anyway.

## places (new, kid-specific)
Required fields: id, name, region, lat, lon, visit, cat, priority, wiki, summary, facts, ages, stroller, kids.
- `id`: lowercase ascii, `_`-joined, prefixed `k_` (e.g. `k_oceanario`, `k_zoomarine`). Must not clash with Portugal ids.
- `name`: the name a visitor knows ("Lisbon Oceanarium", "Zoomarine", "Portugal dos Pequenitos").
- `region`: one of your region ids.
- `lat`, `lon`: WGS84, 4 decimals, the entrance. Portugal longitudes are NEGATIVE.
- `visit`: realistic family minutes (zoo 180–240, aquarium 120–150, playground 60, theme park 300–360, farm 120).
- `cat`: exactly one of: Zoo, Aquarium, Theme park, Water park, Science centre, Park (a big park, usually with a playground), Farm & animals,
  Adventure park, Train ride, Museum, Castle, Beach, Boat trip, Garden, Hike, Cave, Nature reserve, Experience.
- `priority`: 3 = a family highlight, 2 = very good, 1 = nice if nearby.
- `hours`: optional "HH:MM-HH:MM" typical autumn/winter hours, only for gated sites, only if confident.
- `closed`: optional weekday numbers, 0 = Sunday … 6 = Saturday, only if confident.
- `needsDaylight`: `false` for indoor places. Omit for outdoor ones.
- `season`: optional one sentence (water parks open roughly June–mid September; some parks close in winter or open weekends only).
- `caution`: optional one sentence on a real risk.
- `wiki`: the exact title of a REAL English Wikipedia article about this place (e.g. "Lisbon Oceanarium", "Zoomarine",
  "Portugal dos Pequenitos", "Lisbon Zoo"). If you're not sure one exists, set `"wiki": false` and add
  `"photoSearch": "<words to find a photo on Wikimedia Commons, e.g. Badoca Safari Park>"`.
- `summary`: 2–3 plain sentences: what it is and why a family would go.
- `facts`: 3–4 short practical bullets: prices in € (approx: "Adults ~€25, children 3–12 ~€15, under 3 free"),
  booking, best time, parking, tips.
- `suggest`: omit.
- Do NOT add `sleep` to new places.

Good kinds of places: zoos, aquariums, theme and water parks (only well-known ones that are open), Ciência Viva science
centres, children's museums, big parks with playgrounds, farms and animal parks, adventure/tree-top parks, little tourist
trains and heritage railways, river beaches, calm-water beaches, easy boat trips, dolphin trips, caves with tours, and
easy family walks (boardwalks, short levadas). No restaurants, hotels or shops.

## drives
Road legs `["from_id", "to_id", km, minutes]` from each NEW place to its nearest hub or nearby place, so every new place
is connected. Ids may be your new ids, any id in `portugal/data.json`, or the hubs:
lisbon, sintra, cascais, setubal, obidos, nazare, tomar, coimbra, aveiro, porto, braga, guimaraes, viana_do_castelo,
peso_da_regua, braganca, evora, beja, lagos, faro, tavira, funchal, ponta_delgada, angra_do_heroismo, horta.

## Target size
For each of your regions: about 6–12 new kid places and 6–15 reused places. Write valid JSON (UTF-8, no comments,
no trailing commas). Validate with `python3 -c "import json;json.load(open('<file>'))"` and check every reused id exists
in `portugal/data.json` and every new place has all the required fields. Reply with a 2-line summary (counts) only.
