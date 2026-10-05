# Jordan planner — place data spec (for research agents)

## Brief
- Country: Jordan. Currency in facts: Jordanian dinar, written "~10 JOD" (Jordan Pass, ~70–80 JOD, covers Petra and most sites: mention it where it applies).
- Bounds: lat 29.2–33.4, lon 34.9–39.3 (longitude POSITIVE).
- Part files: `north.json` (regions amman, north, east, deadsea) and `south.json` (regions kings, petra, rum, aqaba).
- Regions: `amman` Amman · `north` Jerash, Ajloun & the north (Umm Qais, Pella, Ajloun Forest) · `east` Desert castles & Azraq · `deadsea` Dead Sea, Madaba & Mount Nebo (Baptism Site, Wadi Mujib, Ma'in) · `kings` King's Highway: Kerak, Dana & Shobak (Wadi Ghuweir/Feynan too) · `petra` Petra & Wadi Musa (Little Petra, the Monastery, Petra by Night as a place) · `rum` Wadi Rum · `aqaba` Aqaba & the Red Sea.
- Categories: Town, Base, Old town, Castle, Ruins, Monument, Museum, Mosque, Monastery & church, Village, Food & market, Experience, Desert, Canyon, Hike, Viewpoint, Nature reserve, Hot spring, Beach, Snorkel & dive, Boat trip, Airport.
- Hub ids (use exactly): amman (downtown, 31.9539,35.9106), jerash, ajloun, madaba, dead_sea (Sweimeh hotel strip), azraq, kerak, dana (Dana village), wadi_musa, wadi_rum (Rum village), aqaba.
- Airport ids for legs: amm (Queen Alia, south of Amman), aqj (King Hussein, Aqaba).
- Transit legs allowed: `["amm","aqj",330,190,"flight",60]` style (Amman ↔ Aqaba flight). The JETT bus could be a "train"-mode leg only if you know times; otherwise skip. Road legs are by car (rental or driver). Include the Desert Highway and the King's Highway as alternative legs where useful.
- Caution topics worth noting: heat and flash floods in canyons (Wadi Mujib siq closed Nov–Mar), Petra's long walks, Dead Sea swimming rules.

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
