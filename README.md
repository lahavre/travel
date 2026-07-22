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
  day.html?day=N      Detailed plan for one day, with prev/next navigation
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
| `accommodation` | Stays, with optional `perPerson` split |
| `transport` | `mode`, plus optional `legs`, `totalKm`, `rentalTotal` |
| `todo` | Pre-trip checklist; `status: "Done"` renders as complete |

**Currency.** `exchangeRate.rate` is how many *home* currency units you get per
`exchangeRate.per` units of *trip* currency — Japan quotes `per: 100` (3.305 MYR per
100 JPY), while somewhere like Europe would use `per: 1`. Activity costs in
`days[].items[].costs` are in **trip** currency and get converted for display;
everything in `budget`, `settle` and `accommodation` is in **home** currency. Omit
`exchangeRate` entirely for a domestic trip and cost columns collapse to one currency.

**The overview table.** Each day renders as three colour-banded rows — morning,
afternoon, evening — with the activity and its own remark sharing the band's tint. A
`remarks` value applies to the whole day and gets its own row underneath. The hotel in
the "Staying in" column is resolved from `accommodation` by date rather than typed
twice, so correcting a stay updates the overview too. Temperatures are always Celsius
and read `City: 18 to 25 °C`: one `{location, min, max}` entry per place a day passes
through, or `note` when there is no firm range.

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
