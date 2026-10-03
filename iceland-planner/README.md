# Iceland Free Days

A daylight-aware trip planner for Iceland: waterfalls, glaciers, hot springs and the ring road, built for short winter days.
It's one page with no backend and no build step. It works offline once it has loaded.

- `index.html`: the page and its styles
- `app.js`: all the logic (sun maths, fit checks, map, comparison, bookings)
- `data.json`: the plan. Edit this by hand.
- `sw.js`: the service worker that handles offline use

## Help

Tap **? Help** at the top right of the app for a built-in guide: quick start, what each tab does, how to read a day, auto-plan, backups and offline use.

## The sample trip

`data.json` holds no personal plan. A new user gets an 8-day sample trip starting about a month after they first open the app (`"from": "auto"`), with arrival and departure days marked and one empty plan.
Set your own dates with **Change dates**. Your plan is saved in your browser only; export it to keep a copy.

## Running it

The app moved from `/iceland/` to `/iceland-planner/` (October 2026) to get round a stuck Android install; the old address redirects here. Saved plans are kept, because browser storage is shared across the whole site.


- **Online:** https://rujopereiric.github.io/travel-plans/iceland-planner/. Open it once on your phone, then use "Add to Home Screen".
- **Locally:** run `python3 -m http.server` in the repo root and open http://localhost:8000/iceland-planner/.
  If you open `index.html` straight from disk (`file://`), the browser won't let it read `data.json`. Use **Import** instead.

Offline: the app files, Leaflet and `data.json` are cached on first load. The browser keeps the map tiles
for the areas you have viewed. Before you leave Wi-Fi, pan and zoom over the regions you'll visit.

## Changing the dates and flights

Tap **Dates & flights** at the top of the Plan tab to set when you arrive and leave. New days are added as fully free.
If you remove days that have stops planned, the app asks first. To mark busy days (work, a course, a wedding…), open the day and set it to **Fully booked** or **Partially free**.

Under **Flights**, enter when you land and when you take off, the airport (Keflavík by default), and the buffers:
- **Landing day:** starts at the airport. Plans begin after landing plus *minutes to get going* (default 60, for passport, bags and the rental car).
- **Departure day:** ends at the airport. You must be there *minutes before* takeoff (default 150, to return the car and check in).
- **Auto-plan:** starts at the arrival airport and ends at the departure one. Before an early flight it keeps the last night close to the airport. A pre-dawn drive of more than 90 minutes to catch the flight counts as not fitting.

Leave a time empty for no flight. Saving a flight time resets a hand-set "free from" or "free until" on that day, because the flight now sets it.
In `data.json` these are `trip.arrive` and `trip.leave`: `{"time": "15:00", "at": "kef", "buf": 60}`.

A **planning block** is a run of consecutive days that aren't fully booked. Blocks are recalculated whenever dates or day states change:
- **Growing or shrinking:** a block keeps its letter and plans.
- **Merging:** the merged block gets all the plans from both.
- **Splitting:** each plan goes to the part that contains all of its planned days, keeping its id (B1 and B2 return to block B).
  A brand-new part with no plans gets copies of whatever was planned for its days.
- **Auto-plan:** a block that ends on your last day finishes at Keflavík Airport.

## How the fit check works

- Sunrise, sunset and civil twilight come from the NOAA solar algorithm, computed from the date.
  Iceland uses UTC all year, so the times shown are local times.
  The day bar uses Reykjavík. Each stop is checked against its own local sun, because the sun sets about 25 minutes earlier at Jökulsárlón.
  You can turn this off in Settings.
- **Usable window** = daylight ∩ free time. On a "free until 19:00" day, you must reach the day's end point by 19:00.
- A day's route runs from the previous night's sleep place (or Reykjavík) through the stops to tonight's sleep place.
- Departure is automatic unless you set it. The default aims to reach the first stop at sunrise, never before 07:00 and never before you're free.
- **✗ Doesn't fit:** you arrive after your cutoff, a stop falls more than 15 min outside sunrise–sunset, or the sightseeing span is longer than the usable window.
  **! Tight:** less than 30 min spare, or more than 30 min of driving after dark.
  Both thresholds can be changed in Settings.
- Driving times come from `drives` in `data.json` first (`[from, to, km, minutes]`, valid in both directions).
  Next come road times and distances between all places from the free public [OSRM](https://project-osrm.org/) server, fetched once and cached.
  Without road data, the app estimates the shortest path along the known `drives` legs, with every other place attached to its nearest place on those legs.
  That keeps long estimates on real roads rather than straight across Vatnajökull. Only as a last resort does it use a straight-line distance × 1.35 at 75 km/h. All estimates are marked "est.".
  The public OSRM server takes about 100 places per request, so road distances are fetched in chunks of 50 × 50, one request a second. A 15% winter buffer is added to all of them.
- **Icons and filter**: every place shows its category icon, coloured by family: blue water, red hot water, brown volcanic and land, cyan ice, indigo coast, green nature, purple culture, orange tours, grey practical stops.
  Must-sees have a gold ring. Zoomed out, pins shrink to dots; the All of Iceland layer shows coloured dots until zoom 10, then icons for what's on screen.
  **Filter map** (above the map): show or hide each type, use ⦿ for that type only, tap a family name to toggle the whole family, or choose All, None or Must-sees only. It also switches My places and All of Iceland on and off.
- **Whole-trip view**: pick *Whole trip* or a block in the map's selector, or tap **Map** next to the trip dates. Each day's route is drawn in its own colour, stops are numbered by day, and 🛏 labels show which nights you sleep where. The collapsible *Days* list shows each day's route and driving time; tap one to zoom in and edit it. Routes are requested one at a time, about a second apart, as the public OSRM server asks.
- The map draws each day's route along roads (OSRM). Routes you've viewed are cached for offline use; until a route has loaded, the map shows dashed straight lines.
  OSRM's car routing knows nothing about winter closures, so a route could in theory use a closed highland F-road. Trust road.is over the line on the map.

## Suggestions and auto-fill

Each open day has a **Could also fit** list. It shows every place you can still add without making the day "doesn't fit".
Each place goes in at the position that adds the least driving, and the list shows the extra drive time and when you'd get back.
The list updates whenever you change free time, stops or settings.
A collapsed day card shows "+N more could fit". If a day doesn't fit, it shows which stop to drop instead.

- Places already on this option or on the selected plan of another block are skipped, as are places with `suggest: false`.
- **Auto-fill** keeps adding the place with the best score while the day still fits. The score is `priority` (1–3, default 2) weighed against extra driving.
  Use **Undo auto-fill** to go back.

## Driving limit and auto-plan

- **Max driving per day**: set in Settings (default 5 h). You can override it per day in the day editor.
  A day with more driving than its limit is marked ✗, so suggestions, auto-fill and auto-plan all stay under it.
- **Auto-plan** (Compare tab, Places tab, or next to the plan picker): builds a block day by day.
  For each day it tries every possible overnight place (places marked `sleep: true` in `data.json`, plus Reykjavík).
  It auto-fills that day, and keeps the 20 best partial plans before moving on to the next day (a beam search).
  A place is worth priority³: must-see = 10, so 1000; top sight = 3, so 27; normal = 2, so 8; filler = 1, so 1.
  Driving costs 1 point per hour and visit time 1 point per 2 hours, so a good place is always worth a day trip. Fillers only go on days that would otherwise be empty.
  Plans are also ranked by the unvisited places still within reach of where they sleep, so the search will spend a day moving to a new region.
  The kept plans are kept varied, with at most 4 ending in the same place.
  If the block runs out of places worth the drive, the plan's note says how many days were left free.
  The block's final night is kept where the selected option ends it: Reykjavík on 2 Nov, Keflavík on 8 Nov.
  The best plan is added as a new option, for example `A3 · Auto-plan (≤5h driving/day)`, but it isn't selected.
  Compare it with your other options, then **Select** or **Copy** it and tweak.
- For a fair comparison, each night away that has no hostel booking linked to the option is costed at the "Unbooked night" estimate.

## Places tab

There's one card per place, with a photo, category, summary, practical facts, winter notes, and links (Wikipedia, Google Maps directions, official sites).
Filter by type, region, must-see, skipped, or "not in plan".

- **★ Must-see / Skip**: Must-sees get top priority in suggestions, auto-fill and auto-plan. Auto-plan builds each block around them and lists any it couldn't fit.
  Skipped places are never suggested. Your picks are saved in `picks` and included in exports.
- The summaries live in `data.json` (`summary`, `facts`, `winter`, `cat`, `links`).
  Photos and the "From Wikipedia" intro come from the Wikipedia API at runtime, using the `wiki` article title, with a search fallback. Places whose article has no lead image get a photo from a Wikimedia Commons search. To pin a specific picture, set `photo` to an image URL.
  They're cached for offline use, and the photos are cached by the service worker. Credit links point back to Wikipedia / Wikimedia Commons.

## All of Iceland (OpenStreetMap)

In the Places tab, switch to **All of Iceland** and tap **Load all of Iceland**. One query to the free OpenStreetMap Overpass API fetches every named sight it knows about in Iceland, usually several thousand:
waterfalls, hot springs, pools, geysers, craters, caves, beaches, glaciers, viewpoints, museums, artworks, historic sites, lighthouses and nature reserves (peaks only if they have a Wikipedia article).
They're stored compactly in the browser for offline use (a few hundred KB).

- **Search:** by name (accents optional: "grindavik" finds Grindavík), filter by type, and sort by straight-line distance from any of your places.
- **Map:** the map's layer menu has an **All of Iceland (OSM)** layer that shows every item as a small grey dot.
- **+ My places:** turns an item into a normal place. It's priority 1 and marked unverified, with links to OSM, Wikipedia and its website, and a photo if Wikipedia has one.
  You can then plan it, auto-plan it and mark it as a must-see. Its road distances are fetched for that place only.
- These items have no summaries, fees or winter notes, so check them before you go. Data © OpenStreetMap contributors (ODbL).

## Euros and the currency tab

Every ISK amount is also shown in € (totals, bookings, comparison, fuel, and ISK prices mentioned in notes).
The **€** chip at the top right shows the current rate. Tap it to open a two-way converter with quick tables. Next to it, **?** opens the help and **⚙** opens Settings: road and weather links, the checklist, the daylight table, settings and backup.

- Revolut has no public rates API. The app fetches the mid-market EUR→ISK rate from free sources that need no key, trying them in order:
  Frankfurter (ECB), then ExchangeRate-API, then fawazahmed0/currency-api.
  It refreshes every 30 min while open and saves the last rate for offline use.
- Revolut converts at roughly mid-market on weekdays within your plan's allowance. Set a weekday and weekend markup %, or type the
  rate your Revolut app shows into **Manual rate** to match it exactly. Clear that field to go back to the live rate.
- Without any fetched rate, the app falls back to `settings.eurIsk`.

## Editing data.json

- `days[]`: `state` is `free`, `booked` or `partial`. A partial day also needs `mode` (`until` or `from`) and `time` (`"HH:MM"`).
- `blocks[]`: date ranges you plan as a unit. `active` names the selected option.
- `options[]`: alternative itineraries for a block. `days[date] = { stops: [{place, min?, note?}], sleep, depart? }`.
- `places[]`: `summary`, `facts[]`, `winter`, `cat`, `wiki` (Wikipedia title), `links[]`, `photo` (optional image URL) for the Places tab; `visit` is the default number of minutes at the place. Set `needsDaylight: false` for towns and the lagoon. `caution` shows a warning. `priority` (1–3) steers auto-fill. `suggest: false` keeps a place out of suggestions. `sleep: true` makes it an overnight candidate for auto-plan.
- `bookings[]`: `option` is `null` for a shared booking or an option id. Bookings tied to an option count only when that option is selected.

Your edits in the app are saved in the browser's localStorage. **Export** writes a file in the same format as `data.json`,
so you can commit it as the new `data.json`. If `data.json` changes while you have unsaved local edits, the app asks which version to keep.
