# Travel

Trip itineraries, planned and researched with Claude Code, published as a static site.

## Structure

```
index.html            Landing page — lists trips newest-first
trips.json            Trip manifest that the landing page reads
serve.py              Local preview server (no-cache)
assets/               Shared stylesheet + JS (site helpers, trip page renderers)
tools/                One-off scripts (Excel migration, page scaffolding)
trips/_template/      Copy this folder to start a new trip
trips/<slug>/
  data.json           Single source of truth for the trip
  index.html          Trip home — flights, hotels, jump-to-a-day
  overview.html       High-level itinerary
  day.html?day=N      One day: plan, weather, costs — day list switches in place
  weather.html        Whole-trip weather — one row per place, local-forecast links
  budget.html         Budget vs actual, settle-up between travellers, exchange rates
  accommodation.html  Stays, nightly rates, per-person split
  transport.html      Travel log / getting around
  todo.html           Pre-trip bookings and paperwork
```

Trip slugs are `YYYY-MM-destination`, so folders sort chronologically.

Every page is a thin template: it fetches `data.json` and renders from it. To correct a
figure or reword an activity, edit `data.json` — never the HTML tables. Totals,
percentages and currency conversions are computed in the browser, so they stay
consistent the same way the old spreadsheet formulas did.

## Adding a trip

1. Copy `trips/_template/` to `trips/<slug>/` — slug is `YYYY-MM-destination`.
2. Fill in `data.json` and delete the `_`-prefixed helper keys (they are inline notes,
   ignored by the site).
3. Append an entry to `trips.json` — `slug`, `title`, `destination`, `emoji`,
   `startDate`, `endDate`. The landing page sorts by `startDate` descending and derives
   the Upcoming/In progress/Past badge from today's date.

The seven HTML pages are identical for every trip and contain no trip-specific content —
never edit them per trip. `_template/` is not listed in `trips.json`, so it stays off the
landing page while remaining previewable at `/trips/_template/`.

## data.json reference

Only `title`, `startDate`, `endDate` and `homeCurrency` are really required. **Every
section below is optional** — omit one and its page shows a placeholder rather than
breaking, so a half-planned trip still renders.

| Key | Purpose |
| --- | --- |
| `title`, `destination`, `emoji`, `notes` | Identity, shown on the trip home page |
| `startDate`, `endDate` | ISO `YYYY-MM-DD` |
| `travelers` | Names used as column headers in the settle-up and per-person split tables |
| `flights` | Outbound / return / internal legs, shown as cards on the trip home page |
| `checkInLeadHours` | Hours before departure to show as check-in (default 3) |
| `homeCurrency` / `tripCurrency` | ISO codes, e.g. `MYR` / `JPY` |
| `exchangeRate` | `{ per, rate, history }` — see below |
| `costCategories` | Optional override of the day-cost buckets |
| `summary` | `totalDays` and an optional `note` shown atop the budget page |
| `budget.categories` | `category`, `perDay`, `budget`, `actual` — in **home** currency |
| `settle` | Group cost-splitting rows; `amounts` keys must match `travelers` |
| `overview` | One row per day; `morning`/`afternoon`/`evening` activities, `slotRemarks` per slot, `remarks` for a whole-day note, `temperature` list in Celsius |
| `days` | The detailed plan; each has `items` with `time`, `activity`, `costs`, `remarks`, optional `travel` |
| `accommodation` | Stays — booking, address, room, times, meal/parking/laundry, payment, optional `perPerson` split |
| `transport` | `mode`, plus optional `legs`, `totalKm`, `rentalTotal` |
| `todo` | Pre-trip checklist; `status` is `"Done"` or `"Open"`. Optional `category` + `subcategory` group the list (see below) |

**Currency.** `exchangeRate.rate` is how many *home* currency units you get per
`exchangeRate.per` units of *trip* currency — Japan quotes `per: 100` (3.305 MYR per
100 JPY), while somewhere like Europe would use `per: 1`. Activity costs in
`days[].items[].costs` are in **trip** currency and get converted for display;
everything in `budget`, `settle` and `accommodation` is in **home** currency. Omit
`exchangeRate` entirely for a domestic trip and cost columns collapse to one currency.

**The Weather page** is the whole-trip counterpart to the per-day weather: one row per
place, aggregating the temperature range and conditions across every day it's visited,
so you can pack for the trip at a glance. Each place name opens its **local forecast**
(same on the day page). Which site that is comes from `weatherLinks` in the data: a trip
can pin a country's own service — Japan uses **tenki.jp**, which addresses by prefecture
area code rather than coordinates, so those links are set by `fetch_weather.py` at
prefecture level (the finest a name alone reaches, and it covers even the places without
coordinates). A place with no pinned link falls back to a point-exact **yr.no** page
built from its coordinates — fast, ad-free, and works for any country. It shares the
same Open-Meteo data, cache and Refresh button. Visit dates are shown as they actually
fall — "13–14 Oct, 28–29 Oct" for a place seen at the start and end, not one long span.

Why not a search on Google, AccuWeather or weather.com: those either land on a search
results page (AccuWeather and tenki.jp both address forecasts by an internal
location/area code, reachable only through their own search or a paid API) or load
slowly. tenki.jp and yr.no open the forecast directly and fast.

**The day page.** A sticky list of days sits beside the plan; clicking one swaps the
panel without reloading, and the URL, title and back button follow. The panel runs
Plan → Weather → Estimated cost. Weather is a row per place the day passes through,
drawn from that day's `temperature`, and the section is omitted when the list is
empty.

Each entry carries one forecast: `min`/`max`, `feelsMin`/`feelsMax`, `condition`,
`wind`, `sunrise` and `sunset`. The last three columns appear only once some entry
has them, so a trip with nothing but temperatures still renders. `note` covers a
place with no forecast — it is never filled with a guess.

Two providers, on purpose: **Open-Meteo supplies the numbers** (it is keyless and
CORS-enabled, which a browser on a static site needs), and **each place name links out
to a readable Google weather card** for a fuller view. Google can't be the data source
— its search card is not a fetchable API, and its Maps-Platform weather API needs a
billing key that a public repo would expose. The source note states both roles so the
split doesn't read as an accident.

Rainfall totals are deliberately absent: for planning, knowing the day reads "Light
rain" or "Rain" is what matters, not the millimetres.

**When the forecast doesn't exist yet.** Open-Meteo only forecasts ~16 days, so a trip
planned further out has no forecast for its later dates. Those dates fall back to the
**same dates a year earlier** (from the archive), tagged `basis: "historical"` with the
`basisDate` they came from. The page marks them "last year" and never passes them off
as a forecast; a Refresh nearer the trip replaces each one with the real forecast as it
comes into range. Dates are bucketed by source — archive for the past, forecast for the
next ~16 days, last-year for the rest — so a trip straddling the horizon gets a real
forecast for its near days and stand-ins only for the far ones.

**Source and refresh.** The forecast comes from [Open-Meteo](https://open-meteo.com) —
free, no API key, and it sends `Access-Control-Allow-Origin: *`, so the browser can
call it directly. `tools/fetch_weather.py` bakes a forecast into `data.json` for a
static first load; the **Refresh** button on the day page then re-fetches live and
caches the result in `localStorage`. A static site can't write back to `data.json`,
so a refresh updates that browser only — re-run the script and commit to change what
everyone sees. Refresh honestly whenever, and especially as departure nears: a
forecast a fortnight out is barely better than a seasonal average, and Open-Meteo only
forecasts ~16 days, beyond which Refresh leaves the baked data untouched.

`weatherPlaces` (a `{name: {lat, lon}}` table) and `weatherTimezone` drive that live
fetch; the script writes them from its verified coordinates.

Other sources considered: Open-Meteo won on being keyless and CORS-enabled, which a
public static site needs. WeatherAPI, OpenWeatherMap, Visual Crossing and Tomorrow.io
all forecast comparably but require an API key — unusable here, since a key in a public
repo is exposed. A national service (JMA, the Met Office, NWS) is authoritative but
single-country; Open-Meteo blends several models worldwide, so the same code serves any
destination.

**The overview table.** Each day renders as three colour-banded rows — morning,
afternoon, evening — with the activity and its own remark sharing the band's tint. A
`remarks` value applies to the whole day and gets its own row underneath. The hotel in
the "Staying in" column is resolved from `accommodation` by date rather than typed
twice, so correcting a stay updates the overview too. Temperatures are always Celsius
and read `City: 18 to 25 °C`: one `{location, min, max}` entry per place a day passes
through, or `note` when there is no firm range.

**Accommodation.** Each stay renders as a summary — place, dates, nights, total with
the nightly rate in brackets — beside a labelled detail list: hotel (linked to Maps),
address, reservation, room type, check-in, check-out, laundry, meal, parking and paid.
Times are 24-hour, so `checkInFrom`/`checkInTo` read "From 15:00 until 19:00" and
`checkOutUntil` reads "Until 11:00" — "until" in both. `prepaid` drives the Paid row,
with `payAtProperty` for anything owed on arrival and `cancellation` for the policy,
which always carries its year. A parking rate or condition goes in `parkingNote` and
renders as "Paid (JPY 1,000 / night)".

Each row states its fact once. `remarks` is for what no other row covers — don't
repeat the payment, meal or parking there.

Full field list per stay: `city`, `name`, `reservation` (`site`, `bookingNo`, `refs`),
`address`, `phone`, `checkIn`, `checkOut`, `nights`, `persons`, `rooms`, `roomType`,
`checkInFrom`, `checkInTo`, `checkOutUntil`, `laundry`, `meal`, `parking`,
`parkingNote`, `prepaid`, `payAtProperty`, `cancellation`, `pricePerNight`, `total`,
`remarks`, `perPerson`. `trips/_template/data.json` has a worked example of every one.

A voucher often carries more than one number — the platform's own booking ID plus the
reference it was placed under with a supplier or the property. Put the platform's in
`bookingNo` and the rest in `refs` as `{label, value}`; every one is displayed, since
either may be the one a front desk asks for.

Fill these from the booking confirmation, not from memory or an old spreadsheet: where
the two disagree, the confirmation is right. A blank renders "—", meaning nobody has
checked; write "N/A" only once you know the property genuinely does not offer it.

**Never put door codes, lock-box codes, host directions or personal contact details in
`data.json`** — the repository and the published site are public. Booking confirmations
routinely contain all of these; copy across the property details only.

**Route notation.** Write a leg inside an activity as `A -(Mode)> B -(Mode)> C`. The
day page collapses it to a single line — **“A to C” with a Directions link** — since
the intermediate hops mostly restate what Maps returns live. Alternatives numbered
`1.` / `2.` between the same two points fold into one line, with every original
spelling kept on hover.

The mode words decide how Maps routes it: a rail or bus line gives transit, `Walk`
or `Hike` gives walking, `Drive`/`Taxi` gives driving. Intermediate stops are passed
as waypoints **except** for transit, which Google cannot route with waypoints — there
the two ends are sent and Maps works out the connection.

Endpoints are resolved rather than taken literally, so a plan can stay loosely worded:

| Written | Becomes | From |
| --- | --- | --- |
| `Hotel`, `Airbnb` | the property, linked to its address | `accommodation` |
| `Haneda`, `HND` | the airport as the booking records it, plus terminal | `flights` |
| `Store`, `Restaurant` | the venue the activity names (“Dinner at …”) | the activity |

A stay word means the property in use *at that hour* — on a moving day, anything
before the new check-in still refers to the place being left, while heading *to* the
hotel always means tonight's. Airports match on their own name or code, never the
city, so “Tokyo Station” is not mistaken for Tokyo Haneda.

**Legs with no notation.** An activity that simply says `Travel to Kitakata` also gets
a link: the destination comes from its own wording, and the start from the last
activity that named a place — walking back through the day until one does, since
`Lunch (Ita Soba)` names nowhere. `Wake up` or `Check out` counts as being at the
accommodation. Nothing is linked unless both ends resolve; a wrong direction link is
worse than none.

Write activities so this can work: `Travel to <place>`, `Explore <place>`,
`Dinner at <place>`. Opening hours and prices in brackets are ignored
(`Explore Aizu Bukeyashiki Museum (8.30am - 5pm, 850JPY)` resolves to the museum).

**Maps and travel times.** Any activity can carry a `travel` block
(`from`, `to`, `mode`, `duration`, `distance`, `cost`) which renders as a line with a
**Directions ↗** link; the same link appears for the day's driving leg and on every
row of the transport page. The links use Google's public URL scheme — no API key, no
billing — and Maps works out the live route, time and tolls once opened.

`duration`, `distance` and `cost` are **your own figures, not computed**. Working them
out in the page would need the Google Directions API, and its key cannot be kept
secret in a public static site, so the link is the honest way to get live numbers.
Distances already recorded per day live in `transport.legs[].km`; note these are the
whole day's driving, so they read higher than a point-to-point Maps estimate.

**Flights and check-in.** Each flight card shows a check-in time so you can work
backwards to when you need to leave for the airport. It defaults to 3 hours before
departure — override per flight with `checkInTime` (an exact time) or
`checkInLeadHours`, or trip-wide with a top-level `checkInLeadHours`. An early
departure correctly rolls check-in back to the previous evening. Flight times are
local to their own airport; set `arrivesNextDay` on a red-eye.

**Cost categories.** Default buckets are `transport`, `fuel`, `food`, `sightseeing`,
`misc`. Override with a `costCategories` object mapping key to label; the keys you use
in `costs` must match. Day totals and the budget page's "planned spend" table roll up
from these automatically.

**The to-do page.** A flat checklist by default. Give items an optional `category`
and the list renders in grouped bands; `Booking` items can add a `subcategory` —
`Accommodation`, `Transport`, `Attractions` or `Restaurant` — which render as
sub-bands in that fixed order. Categories render `Booking` then `Travel preparation`
first, then any others in the order they appear, with each band showing its own
done/total count. Only groups that actually contain items appear (an unused
subcategory is never shown as an empty scaffold), and a trip that sets no category at
all still renders as the plain flat table — the fields are fully optional and
backward-compatible.

Each row's **status** is a two-state dropdown (`Open` / `Done`) and its **remarks**
have an Edit button. Because the site is static, these edits can't be written back to
`data.json`; they are saved in the **browser's `localStorage`** (keyed by trip slug),
exactly like the weather Refresh. So an edit is **per-browser and not shared** — it
won't appear on another device, and clearing browser data resets it. The baked
`data.json` values are the shared defaults; to change what everyone sees, edit
`data.json` and commit. (Sharing edits across the group would need a backend, which a
GitHub Pages site doesn't have.)

## Local preview

The pages use `fetch()`, so they need to be served over HTTP — opening the files
directly with `file://` will not work.

```
python serve.py
```

Then visit <http://localhost:8080>. `serve.py` is `http.server` plus no-cache headers,
so edits to `assets/*.js` and `data.json` show up on a normal refresh instead of
appearing to do nothing until a hard reload.

Dates render day-first (`13 Oct 2023`) on every device — the locale is pinned in
`assets/common.js` rather than following the viewer's browser.

## Tools

`tools/` holds scripts that are not part of the site:

- `new_trip_pages.py [slug...]` — (re)writes the seven boilerplate pages into trip
  folders. Copying `trips/_template/` does the same for a single new trip; this is for
  updating every trip at once if the boilerplate changes.
- `fetch_weather.py <data.json>` — fills each day's `temperature[]` from Open-Meteo,
  which needs no key. It picks the forecast API for a trip still ahead and the
  archive for one already past, from the trip's own dates. Coordinates live in a
  `PLACES` table in the script, taken from Open-Meteo's geocoder and checked against
  the region each place belongs to. **Add a place only once its coordinates are
  verified**: an onsen or a summit often geocodes to a same-named town elsewhere, or
  to a valley hundreds of metres below, and weather from the wrong altitude is worse
  than none. Anything left out keeps whatever the trip recorded.
- `migrate_japan_2023.py [xlsx]` — rebuilds the Japan trip's `data.json` from the
  original workbook. Kept for provenance: it records exactly how those figures were
  derived, and is the starting point for migrating another old workbook. Needs
  `openpyxl`, and the workbook must be closed in Excel or the file is locked.

## Publishing

Live at <https://lahavre.github.io/travel/>, served by GitHub Pages from `main`
(Settings → Pages → Source: Deploy from a branch → `main` / `(root)`). Pushing to
`main` redeploys; allow a minute, and note Pages sets `Cache-Control: max-age=600`,
so a hard refresh may be needed to see a change immediately.

The empty `.nojekyll` file at the repo root is **required**. Without it GitHub Pages
runs the files through Jekyll, which silently drops anything whose name starts with an
underscore — that would 404 the whole of `trips/_template/`. Keep it, and the
published site matches the repo exactly.
