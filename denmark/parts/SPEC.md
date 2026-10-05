# Denmark planner — place data spec (for research agents)

## Brief
- Country: Denmark (mainland Jutland, the islands, and Bornholm; not Greenland or the Faroes). Currency in facts: Danish kroner, written "~150 DKK" (7.46 DKK ≈ €1). Mention the Copenhagen Card where it gives free entry, and when booking ahead is needed (Tivoli at weekends, Legoland, Noma-style things are out of scope).
- Bounds: lat 54.55–57.75, lon 8.05–15.2 (longitude POSITIVE).
- Part files: `east.json` (regions copenhagen, northzealand, southzealand, funen, bornholm) and `west.json` (regions southjutland, eastjutland, westjutland, northjutland).
- Regions: `copenhagen` Copenhagen (incl. Dragør, Amager, Bakken/Dyrehaven) · `northzealand` North Zealand: Helsingør, Hillerød & the Louisiana coast (Kronborg, Frederiksborg, Fredensborg, Hornbæk/Gilleleje beaches, Arken in the south-west suburbs is fine here too) · `southzealand` Roskilde, Møn & South Zealand (Roskilde Cathedral and Viking Ship Museum, Lejre, Stevns Klint, Møns Klint, Trelleborg, Falster/Lolland: Knuthenborg) · `funen` Funen & the southern islands (Odense, Egeskov, Faaborg, Svendborg, Ærø/Ærøskøbing, Nyborg, Langeland, Kerteminde) · `bornholm` Bornholm (Hammershus, round churches, Gudhjem, Rønne, Dueodde) · `southjutland` South Jutland & the Wadden Sea (Ribe, Rømø, Esbjerg, Tønder, Sønderborg, Dybbøl, Fanø) · `eastjutland` Aarhus, the Lake District & Legoland (Aarhus, ARoS, Den Gamle By, Moesgaard, Silkeborg, Himmelbjerget, Jelling, Billund/Legoland/LEGO House, Vejle, Horsens, Ebeltoft, Mols Bjerge, Randers Regnskov) · `westjutland` West Jutland coast (Ringkøbing, Hvide Sande, Bovbjerg, Lemvig, Thy National Park, Klitmøller, Holstebro, Struer) · `northjutland` North Jutland: Aalborg & Skagen (Skagen, Grenen, Råbjerg Mile, Rubjerg Knude, Lønstrup, Løkken, Lindholm Høje, Rold Skov, Hirtshals, Fårup Sommerland, Mariager).
- Categories: Town, Base, Old town, Castle, Palace, Monastery & church, Ancient site, Monument, Ruins, Museum, Windmill, Village, Food & market, Experience, Theme park, Garden, Beach, Coast, Island, Boat trip, Lighthouse, Viewpoint, Bike ride, Hike, Lake, Nature reserve, Airport.
- Hub ids (use exactly): copenhagen (City Hall Square, 55.6761,12.5683), helsingor, hillerod, roskilde, koge, stege (Møn), nykobing_falster, odense, svendborg, faaborg, aeroskobing, ronne, gudhjem, ribe, esbjerg, sonderborg, aarhus, silkeborg, vejle, billund, ringkobing, lemvig, aalborg, skagen, hirtshals.
- Airport ids for legs: cph (Copenhagen Kastrup), bll (Billund), aal (Aalborg), rnn (Bornholm, Rønne).
- Transit legs (door to door, fare per person in DKK): DSB intercity trains copenhagen–roskilde, copenhagen–odense, odense–aarhus, copenhagen–aarhus, aarhus–aalborg, aalborg–skagen? (regional, via Frederikshavn), copenhagen–helsingor, cph–copenhagen; ferries (with a car: say the minutes include check-in) Køge ↔ Rønne (koge–ronne), Svendborg ↔ Ærøskøbing, Esbjerg ↔ Fanø (if you add Fanø as a place); flights cph ↔ rnn, cph ↔ aal. Road legs by car; the Great Belt bridge (Storebælt) between Zealand and Funen has a toll (~300 DKK by car): say so in a fact on a relevant place and include the bridge in road legs (e.g. koge/roskilde–odense, copenhagen–odense). Bornholm by road goes via Sweden and the Ystad–Rønne fast ferry: model it as a "ferry" leg copenhagen–ronne, ~220 min door to door, ~400 DKK per person, and the Køge ferry as another "ferry" leg.

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
