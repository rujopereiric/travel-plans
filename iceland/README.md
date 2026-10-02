# Iceland Free Days

A planner for the free days around the Erasmus+ training in Reykjavík (30 Oct – 8 Nov 2026).
It's one page with no backend and no build step. It works offline once it has loaded.

- `index.html`: the page and its styles
- `app.js`: all the logic (sun maths, fit checks, map, comparison, bookings)
- `data.json`: the plan. Edit this by hand.
- `sw.js`: the service worker that handles offline use

## Running it

- **Online:** https://rujopereiric.github.io/travel-plans/iceland/. Open it once on your phone, then use "Add to Home Screen".
- **Locally:** run `python3 -m http.server` in the repo root and open http://localhost:8000/iceland/.
  If you open `index.html` straight from disk (`file://`), the browser won't let it read `data.json`. Use **Import** instead.

Offline: the app files, Leaflet and `data.json` are cached on first load. The browser keeps the map tiles
for the areas you have viewed. Before you leave Wi-Fi, pan and zoom over the regions you'll visit.

## Changing the dates

Tap **Change dates** at the top of the Plan tab to set when you arrive and leave. New days are added as fully free.
If you remove days that have stops planned, the app asks first. To mark training or other busy days, open the day and set it to **Fully booked** or **Partially free**.

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
  The last resort is a straight-line distance × 1.35 at 75 km/h, marked "est.". A 15% winter buffer is added to all of them.
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
  A place is worth priority³: must-see = 10, so 1000; top sight = 3, so 27; filler = 1, so 1.
  A stop is only added when its value outweighs the extra driving and the time it takes.
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

## Euros and the currency tab

Every ISK amount is also shown in € (totals, bookings, comparison, fuel, and ISK prices mentioned in notes).
The **€ / kr** tab is a two-way converter with quick tables. The header chip shows the current rate; tap it to open the tab.

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
