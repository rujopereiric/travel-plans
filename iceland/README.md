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
- Driving times come from `drives` in `data.json` (`[from, to, km, minutes]`, valid in both directions) plus a 15% winter buffer.
  Pairs that aren't listed use a straight-line distance × 1.35 at 75 km/h and are marked "est.".

## Editing data.json

- `days[]`: `state` is `free`, `booked` or `partial`. A partial day also needs `mode` (`until` or `from`) and `time` (`"HH:MM"`).
- `blocks[]`: date ranges you plan as a unit. `active` names the selected option.
- `options[]`: alternative itineraries for a block. `days[date] = { stops: [{place, min?, note?}], sleep, depart? }`.
- `places[]`: `visit` is the default number of minutes at the place. Set `needsDaylight: false` for towns and the lagoon. `caution` shows a warning.
- `bookings[]`: `option` is `null` for a shared booking or an option id. Bookings tied to an option count only when that option is selected.

Your edits in the app are saved in the browser's localStorage. **Export** writes a file in the same format as `data.json`,
so you can commit it as the new `data.json`. If `data.json` changes while you have unsaved local edits, the app asks which version to keep.
