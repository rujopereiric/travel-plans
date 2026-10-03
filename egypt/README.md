# Egypt Trip Planner

A day-by-day planner for Egypt, built from the [Iceland planner](../iceland-planner/README.md). It focuses on the Red Sea and South Sinai (Hurghada, El Gouna, Marsa Alam, Sharm el-Sheikh, Dahab, St Catherine) and on Luxor, and also covers Cairo & Giza, Alexandria and Aswan.
It's one page with no backend and no build step. It works offline once it has loaded.

- `index.html`: the page and its styles
- `app.js`: all the logic (sun maths, opening hours, travel legs, fit checks, map, comparison, bookings)
- `data.json`: the plan, places and travel legs. Edit this by hand.
- `sw.js`: the service worker that handles offline use

## Help

Tap **? Help** at the top right of the app for a built-in guide: quick start, what each tab does, how to read a day, auto-plan, backups and offline use.

## Running it

- **Online:** https://rujopereiric.github.io/travel-plans/egypt/. Open it once on your phone, then use "Add to Home Screen".
- **Locally:** run `python3 -m http.server` in the repo root and open http://localhost:8000/egypt/.

Everything else works as in the Iceland app: dates and planning blocks, suggestions and auto-fill, auto-plan,
the whole-trip map, the Places tab with Wikipedia photos, bookings, and export/import.

## Updates

The app shows its version at the bottom of the Safety tab. When you come back to it, and every 15 minutes, it checks whether the server has a newer `app.js`.
If so, a banner offers **Reload**: an open tab or home-screen app otherwise keeps running the old code. Your edits are saved in the browser, so reloading loses nothing.
When you change `app.js`, bump `APP_BUILD` at the top.

## Flights in and out

Plan tab → **Dates & flights** → **Flights**: set your landing and takeoff times and airports. Cairo is the default.
- **Landing day:** starts at the airport after landing plus 90 minutes (visa and passport).
- **Departure day:** ends at the airport 180 minutes before takeoff.
- **Auto-plan:** starts and ends at those airports.

In `data.json` these are `trip.arrive` and `trip.leave`: `{"time": "13:00", "at": "cai", "buf": 90}`.

## The sample plan

`data.json` holds no personal plan. A new user gets a 10-day sample trip starting about a month after they first open the app (`"from": "auto"`).
The first day is "free from 14:00" (landing) and the last "free until 11:00" (flight home). There's one empty plan: add stops, or let **Auto-plan** build one from your ★ must-sees.
Set your own dates with **Change dates**. Your plan is saved in your browser only; export it to keep a copy.

## What's different from Iceland

- **Time zone:** times are Egypt time (`trip.tz`, Africa/Cairo). Since 2023 Egypt is UTC+2 in winter and UTC+3 from the last Friday of April to the last Thursday of October.
  The browser's time-zone database handles the switch, so sunrise, sunset and "now" are correct on both sides of it.
- **Opening hours:** a place can have `hours: "06:00-17:30"` and `closed: [5, 0]` (weekday numbers, 0 = Sunday).
  A stop more than 15 min outside its hours, or on a closed day, makes the day ✗. Up to 15 min outside makes it "tight".
  Daylight is still checked for outdoor places. Museums, Luxor Temple and town stops have `needsDaylight: false`.
- **Early starts:** places marked `early: true` (the Luxor balloon, the Mount Sinai night hike) set the day's start themselves: you get there for their opening time, even before the "earliest auto start".
  Otherwise the auto start aims for sunrise or opening time, whichever is later.
- **Flights, ferries and trains:** each `drives` entry is `[from, to, km, minutes, mode?, fareEgp?]`. `mode` is `road` (the default), `flight`, `ferry` or `train`.
  - Flight minutes are airport to airport, door to door: about 75 min early at check-in, the flight, and 15 min to get out. Ferry and train minutes run centre to centre.
  - Road minutes get the traffic buffer. Flight, ferry and train minutes are used as given.
  - For every leg, the planner takes the faster of road only, or a mix using at least one flight/ferry/train. For example, Karnak → Giza is a drive to Luxor airport, a flight to Cairo, then a drive to Giza.
  - Turn modes off in Settings to plan by road only.
  - Road-only fallbacks (offline, before OSRM data arrives) follow the hand-made road legs, because a straight line from Hurghada to Sharm would cross the Gulf of Suez (see below).
- **Daily limits:** *Max travel per day* (default 6 h) counts all modes. *Max sightseeing per day* (default 8.5 h, breaks not counted) stops auto-fill from cramming seven temples into one day.
  Dark-road warnings only count road time.
- **Auto-plan** costs each flight (10 points), ferry (6) and train (3) on top of its hours, so it flies to change region rather than for a single sight.
  Each hotel change costs 8 points, so plans stay two or three nights per base. Every night counts as a hotel night (at the "Unbooked night" estimate unless a hotel booking is linked), except the last day's.
- **Costs:** *Transport* = road km × *Taxi/driver EGP per km* (default 12) + the fares in `drives` (per person). Domestic fares are in Transport, so don't also add them as bookings.
- **Money:** amounts are in EGP with € alongside. The live rate comes from ExchangeRate-API or fawazahmed0/currency-api; the ECB doesn't publish EGP. The fallback is `settings.eurEgp`.
  Free text like "550 EGP" or "550 LE" gets a € amount added.
- **Service worker:** caches are named `egypt-*`, and each app only deletes its own old caches, so the Iceland and Egypt apps can both stay offline on the same site.

## Map labels

OpenStreetMap's standard map labels places in the local language, so in Egypt everything is in Arabic. The default map is **Esri World Street Map**, which labels in English and needs no API key. Dark mode uses Esri's dark grey canvas.
The layer button (top right of the map) switches between *English labels*, *English labels, dark*, *Satellite* (Esri imagery with English place names), and *OpenStreetMap (Arabic labels)*. Your choice is remembered. Tiles you've viewed are kept for offline use.

## Map icons and filter

Every place shows its category icon, coloured by family:
- 🔺 **Ancient Egypt** (orange): pyramids, temples, tombs, monuments, ruins
- 🕌 **Old cities & faith** (purple): old quarters, mosques, churches and monasteries, fortresses
- 🖼️ **Museums & culture** (indigo)
- 🤿 **Sea** (blue): snorkel and dive sites, beaches, boat trips
- 🐪 **Desert & nature** (green)
- ✈️ **Practical** (grey): towns, bases, airports

Must-sees have a gold ring. Zoomed out to the whole country, pins shrink to dots.
**Filter map** (above the map) shows or hides each type. Use ⦿ for that type only, or tap a family name to toggle the whole family. It also switches My places, All of Egypt and must-sees only.

## All of Egypt (OpenStreetMap)

In the Places tab, switch to **All of Egypt**. Sights download **per region**, so you only fetch what you need. They're kept in the browser for offline use.

Where the data comes from:
- **Prepared files (normally):** the sights come from OpenStreetMap, prepared by a GitHub Action ("Update Egypt OSM data", `.github/workflows/osm-egypt.yml`, running `egypt/tools/osm-update.mjs`).
  It runs daily at a quiet hour, fetching only regions that are missing or older than 20 days. It also runs on demand (with region ids it always refetches), writes `egypt/osm/<region>.json`, and the site redeploys. The phone then just downloads a ready file, which is fast.
  The public servers are often overloaded and answer "busy" (HTTP 504/429) even to tiny queries. The job then waits and tries another server, and leaves anything still missing to the next day's run.
  `tools/osm-diagnose.mjs` (the workflow's *diagnose* option) times each query statement per region, if a region ever needs investigating.
  The public Overpass servers were too slow and throttled a phone that retried.
  To refresh now: GitHub → Actions → Update Egypt OSM data → Run workflow (optionally with region ids, e.g. `redsea sinai`).
- **Live fallback:** only if a region has no prepared file does the app ask the public Overpass servers directly.
- **Shared code:** the region list, query and parsing live once in `app.js`, between the `osm-shared` markers. The Action's script runs that same code.

- **Regions:** the six trip regions (Cairo & Giza, Alexandria & El Alamein, Luxor with Dendera and Abydos, Aswan to Abu Simbel, Hurghada & the Red Sea coast, South Sinai), plus Fayoum & Middle Egypt, the Western Desert oases, and Suez / Ain Sokhna.
- **Download my trip's regions** fetches every region that has a stop or a night in your selected plans. Downloads run one at a time.
- **Progress:** an overall bar shows "Region 2 of 4". The current region's line updates every second: "Waiting for overpass.private.coffee to search · 23 s" (with the moving bar), then "Receiving · 340 KB", then "Processing". The server sends nothing, and no size, until its search is done, so the waiting part can't show a percentage. Each server gives up after 2 minutes, and the next one is tried.
- Each region can be refreshed (↻) or removed (✕). If one fails, its error is shown with **Retry**, and the others are unaffected. Each request tries four public servers in turn (overpass-api.de, private.coffee, mail.ru, kumi.systems).
- A whole-Egypt download from the earlier version stays as "Earlier whole-Egypt download" until you remove it.

It loads:
- archaeological sites, temples, tombs, pyramids, monuments, fortresses
- museums, viewpoints, attractions
- dive reefs and dive sites, beaches
- springs and oases, desert landmarks, nature reserves and protected areas, lighthouses
- mosques, churches, artworks and other historic objects only when they have a Wikipedia article (otherwise Cairo alone would add tens of thousands)

How to use it:
- **Search** in English or Arabic. Names use the English OSM name when there is one, with the Arabic shown alongside. Arabic search ignores vowel marks and alef forms. Filter by type and sort by distance from any of your places.
- **+ My places** turns an item into a normal place: priority 1, marked unverified, with OSM, Wikipedia and website links. You can then plan it and mark it as a must-see.
  OSM has no opening hours or prices for most sites, so set `hours` yourself (Export, edit, Import) before trusting the fit check. Its road distances are fetched for that place only.
- Data © OpenStreetMap contributors (ODbL).

Road distances from OSRM are fetched in chunks of 50 × 50 places, one request a second. Adding a place only fetches the pairs involving it.
Offline, before road data arrives, estimates follow the hand-made road legs: other places hang off their nearest place on a leg, plus straight hops of up to 30 km within a city or cluster of sites.

## About the data

Places, hours, prices and travel times are from general knowledge as of 2025, **not verified against live sources**.
- Ticket prices for antiquities sites rise often and are marked with `~`. The official source is [egymonuments.gov.eg](https://egymonuments.gov.eg/).
- Places marked `confidence: "low"` show an "unverified" chip.
- Domestic fares and the Hurghada–Sharm ferry (timetable irregular, cancelled in wind) are estimates. Check before booking.
