# Portugal planner — place data spec (for research agents)

You write ONE JSON file: `portugal/parts/<part>.json` with this shape:
```json
{ "places": [ ... ], "drives": [ ... ] }
```
No network access: use what you reliably know. Accuracy matters more than quantity. Do NOT invent URLs, prices or hours you aren't fairly sure of — leave the field out instead.

## places
Each place is an object. Required fields: id, name, region, lat, lon, visit, cat, priority, wiki, summary, facts.
- `id`: lowercase ascii, words joined by `_` (e.g. `pena_palace`, `benagil_cave`). Must be unique; use the hub ids given to you EXACTLY for the hub towns.
- `name`: English name as a visitor would know it, Portuguese in brackets only if useful ("Pena Palace", "Cabo da Roca", "Jerónimos Monastery").
- `region`: one of the region ids assigned to you.
- `lat`, `lon`: WGS84, 4 decimals, the visitor entrance / main viewpoint / town centre. Double-check sign of longitude (Portugal is NEGATIVE, e.g. -9.1393). Madeira ≈ 32.6–32.9 N, -16.9 to -17.3. Azores ≈ 36.9–39.7 N, -25 to -31.
- `visit`: realistic minutes on site (towns 90–180, a viewpoint 20–30, big palace 120, beach 120, hike = its duration).
- `cat`: exactly one of: Town, Base, Old town, Castle, Palace, Monastery & church, Monument, Ruins, Museum, Village, Wine, Food & market, Experience, Beach, Coast, Boat trip, Surf, Whale watching, Lighthouse, Viewpoint, Garden, Hike, Mountain, Waterfall, Lake, Hot spring, Cave, Nature reserve, Airport.
- `priority`: 3 = a highlight most visitors would regret missing, 2 = very good, 1 = nice if nearby.
- `hours`: optional, "HH:MM-HH:MM" typical opening hours in autumn/winter, ONLY for ticketed or gated sites with fixed hours (palaces, museums, monasteries, caves, gardens). Leave out for towns, beaches, viewpoints, hikes.
- `closed`: optional array of weekdays it is closed, 0 = Sunday … 6 = Saturday (many Portuguese museums and monuments close on Monday = [1]). Only if you're confident.
- `needsDaylight`: set `false` for indoor places (museums, palaces, churches, wine cellars, markets, hot springs at night, fado) and for towns good at night. Omit otherwise (default true = outdoor, needs daylight).
- `sleep`: `true` for towns that make a good overnight base (hotels/guesthouses). Typically 2–5 per region. All hub towns must have it.
- `wiki`: exact English Wikipedia article title (e.g. "Pena Palace", "Benagil", "Sete Cidades Massif"). Used to load a photo. Must be a real article.
- `summary`: 2–3 sentences, plain and specific: what it is and why go. No marketing fluff.
- `facts`: 3–4 short practical bullets: ticket price in € (approx, adult, "~€14"), booking needs, best time, parking, how long, tips.
- `season`: optional, one sentence about weather/season (e.g. waterfalls fuller in winter; beach cold Nov–Apr; ferry may not run in rough seas).
- `caution`: optional, one sentence on a real risk (cliff edges, Atlantic currents, flash closures, steep road).
- `early`: optional `true` only if the sight is best at a specific early opening (rare).
- `suggest`: `false` only for airports.

## drives
Road legs between the hub towns and the main sights of your regions, so the planner can route without internet:
`["from_id", "to_id", km, minutes]` — realistic driving distance and time by car, normal traffic, no stops (e.g. `["lisbon", "sintra", 30, 35]`). Both ids must be places in your file or the hub ids listed below. Give 8–20 legs per region, forming a connected network that covers every hub and the farthest sights (a place not on a leg is attached to its nearest hub by straight line, which is fine for nearby sights).
Islands only: you may add `["a","b",km,minutes,"flight"|"ferry", fareEur]` legs between islands, with minutes DOOR TO DOOR (getting to the airport/port, check-in, waiting, the trip).

## Target size
About 12–18 places per region (more for big regions like Lisbon/Algarve/Madeira, fewer for small ones), mixing headline sights, a few lesser-known gems, good bases, beaches/nature. No restaurants or hotels as places.

## Hub ids (all agents must use these exact ids if the place is in your regions; legs may reference any of them)
lisbon (Lisbon city centre, Baixa 38.7107,-9.1366), sintra, cascais, setubal, obidos, nazare, tomar, coimbra, aveiro, porto, braga, guimaraes, viana_do_castelo, peso_da_regua, braganca, evora, beja, lagos, faro, tavira, funchal, ponta_delgada, angra_do_heroismo, horta.
Airports are handled centrally except the islands' (see your brief).

Write valid JSON (UTF-8, no comments, no trailing commas). Validate it with `python3 -c "import json;json.load(open('<file>'))"` before finishing. Reply with a 2-line summary (counts) only.
