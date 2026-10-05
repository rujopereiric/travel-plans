# Ireland planner — place data spec (for research agents)

## Brief
- Country: Ireland (the whole island, so Northern Ireland is included as a region). Currency in facts: euro "~€15"; in Northern Ireland use pounds "~£15".
- Bounds: lat 51.4–55.4, lon -10.7 to -5.4 (longitude NEGATIVE).
- Part files: `south.json` (regions dublin, east, southeast, cork, kerry) and `west_north.json` (regions clare, galway, northwest, midlands, north).
- Regions: `dublin` Dublin (incl. Howth, Malahide) · `east` Wicklow & the Boyne Valley (Glendalough, Powerscourt, Brú na Bóinne, Hill of Tara) · `southeast` Kilkenny, Waterford, Wexford & Tipperary (Rock of Cashel, Copper Coast, Hook Head) · `cork` Cork & West Cork (Blarney, Cobh, Kinsale, Mizen Head, Beara) · `kerry` Kerry (Killarney NP, Ring of Kerry, Dingle, Skellig Michael, Gap of Dunloe) · `clare` Clare & Limerick (Cliffs of Moher, Burren, Bunratty, Loop Head) · `galway` Galway, Connemara & the Aran Islands (Kylemore, Inis Mór) · `northwest` Mayo, Sligo & Donegal (Croagh Patrick, Achill, Slieve League, Glenveagh) · `midlands` Midlands & the Shannon (Clonmacnoise, Birr, Athlone) · `north` Northern Ireland (Belfast, Giant's Causeway, Causeway Coast, Derry, Mournes).
- Categories: Town, Base, Old town, Castle, Stately home, Monastery & church, Ancient site, Monument, Ruins, Museum, Village, Distillery & brewery, Food & market, Experience, Beach, Coast, Island, Boat trip, Lighthouse, Viewpoint, Garden, Hike, Mountain, Waterfall, Lake, Cave, Nature reserve, Scenic drive, Airport.
- Hub ids (use exactly): dublin (O'Connell Bridge, 53.3472,-6.2591), drogheda, wicklow, kilkenny, waterford, wexford, cashel, cork, kinsale, clonakilty, kenmare, killarney, dingle, limerick, ennis, doolin, galway, clifden, inis_mor (Kilronan), westport, sligo, donegal, athlone, belfast, portrush, derry.
- Airport ids for legs: dub (Dublin), ork (Cork), snn (Shannon), knock (Ireland West, Knock), bfs (Belfast International).
- Transit legs allowed: Aran Islands ferries (Rossaveal ↔ Inis Mór, Doolin ↔ Inis Mór / Inis Oírr if you include it) and Irish Rail/NI Railways trains between cities (Dublin ↔ Cork, Dublin ↔ Galway, Dublin ↔ Limerick, Dublin ↔ Killarney, Dublin ↔ Belfast, Belfast ↔ Derry) with door-to-door minutes and an advance fare in € (£ for NI-only legs, but give it as the number only, converted to € roughly). Skellig Michael is a seasonal boat trip: make it a place (Boat trip) at Portmagee, not a leg. Roads are by car, driving on the LEFT; narrow rural roads mean slow averages (Ring of Kerry, Connemara): reflect that in the minutes.

## Output
You write JSON files `<country>/parts/<part>.json` (the part names are in your brief), each with this shape:
```json
{ "places": [ ... ], "drives": [ ... ] }
```
Use what you reliably know (you may use web search to double-check facts if it is available, but don't spend long on it). Accuracy matters more than quantity. Do NOT invent URLs, prices or hours you aren't fairly sure of — leave the field out instead.

## places
Each place is an object. Required fields: id, name, region, lat, lon, visit, cat, priority, wiki, summary, facts.
- `id`: lowercase ascii, words joined by `_` (e.g. `wadi_rum_village`, `kinderdijk`). Must be unique across the whole country; use the hub ids given to you EXACTLY for the hub towns.
- `name`: English name as a visitor would know it, local name in brackets only if useful.
- `region`: one of the region ids in your brief.
- `lat`, `lon`: WGS84, 4 decimals, the visitor entrance / main viewpoint / town centre. Double-check the sign of longitude and that the point is really in the stated place (see the bounding hints in the brief).
- `visit`: realistic minutes on site (towns 90–180, a viewpoint 20–30, a big site 120–240, a hike = its duration).
- `cat`: exactly one of the categories in your brief.
- `priority`: 3 = a highlight most visitors would regret missing, 2 = very good, 1 = nice if nearby.
- `hours`: optional, "HH:MM-HH:MM" typical opening hours (off-season), ONLY for ticketed or gated sites with fixed hours (museums, castles, archaeological sites, gardens, caves). Leave out for towns, viewpoints, hikes, beaches.
- `closed`: optional array of weekdays it is closed, 0 = Sunday … 6 = Saturday. Only if you're confident.
- `needsDaylight`: set `false` for indoor places (museums, churches, mosques, markets, palaces) and for towns good at night. Omit otherwise (default true = outdoor, needs daylight).
- `sleep`: `true` for towns/camps that make a good overnight base (hotels/guesthouses/camps). Typically 2–5 per region. All hub towns must have it.
- `wiki`: exact English Wikipedia article title (e.g. "Petra", "Registan", "Cliffs of Moher"). Used to load a photo. Must be a real article; if there is no article, use the nearest real one (the town).
- `summary`: 2–3 sentences, plain and specific: what it is and why go. No marketing fluff.
- `facts`: 3–4 short practical bullets: ticket price (approx, adult, in the currency named in the brief, e.g. "~10 JOD", "~€15"), booking needs, best time, parking, how long, tips.
- `season`: optional, one sentence about weather/season.
- `caution`: optional, one sentence on a real risk.
- `early`: optional `true` only if the sight is best at a specific early opening (rare).
- `suggest`: `false` only for airports.

## drives
Road legs between the hub towns and the main sights of your regions, so the planner can route without internet:
`["from_id", "to_id", km, minutes]` — realistic driving distance and time by car, normal traffic, no stops. Both ids must be places in your files, hub ids or airport ids listed in the brief. Give 8–20 legs per region, forming a connected network that covers every hub and the farthest sights, and link neighbouring regions' hubs to each other (a place not on a leg is attached to its nearest hub by straight line, which is fine for nearby sights).
Where the brief allows it, add public-transport legs `["a","b",km,minutes,"flight"|"ferry"|"train", fare]` with minutes DOOR TO DOOR (getting to the airport/port/station, check-in or boarding, waiting, the trip) and the fare per person in the brief's currency.

## Target size
About 12–20 places per region (more for big regions), mixing headline sights, a few lesser-known gems, good bases and nature. No restaurants or hotels as places. Do not include the airports (they are added centrally), but you may reference airport ids in legs.

Write valid JSON (UTF-8, no comments, no trailing commas). Validate each file with `python3 -c "import json;json.load(open('<file>'))"` and check: every place has the required fields, every `region` and `cat` is from the brief, ids are unique, every leg's ids exist (your places, hub ids or airport ids). Write a small Python check for this. Reply with a 2-line summary (counts per region) only.
