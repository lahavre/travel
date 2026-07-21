# Travel

Trip itineraries, planned and researched with Claude Code, published as a static site.

## Structure

```
index.html            Landing page — lists trips newest-first
trips.json            Trip manifest that the landing page reads
assets/               Shared stylesheet + JS (site helpers, trip page renderers)
trips/_template/      Copy this folder to start a new trip
trips/<slug>/
  data.json           Single source of truth for the trip
  index.html          Trip home
  overview.html       High-level itinerary
  day.html?day=N      Detailed plan for one day, with prev/next navigation
  budget.html         Budget vs actual, settle-up between travellers, exchange rates
  accommodation.html  Stays, nightly rates, per-person split
  transport.html      Driving log / getting around
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
| `homeCurrency` / `tripCurrency` | ISO codes, e.g. `MYR` / `JPY` |
| `exchangeRate` | `{ per, rate, history }` — see below |
| `costCategories` | Optional override of the day-cost buckets |
| `summary` | `totalDays` and an optional `note` shown atop the budget page |
| `budget.categories` | `category`, `perDay`, `budget`, `actual` — in **home** currency |
| `settle` | Group cost-splitting rows; `amounts` keys must match `travelers` |
| `overview` | One row per day for the high-level table |
| `days` | The detailed plan; each has `items` with `time`, `activity`, `costs`, `remarks` |
| `accommodation` | Stays, with optional `perPerson` split |
| `transport` | `mode`, plus optional `legs`, `totalKm`, `rentalTotal` |
| `todo` | Pre-trip checklist; `status: "Done"` renders as complete |

**Currency.** `exchangeRate.rate` is how many *home* currency units you get per
`exchangeRate.per` units of *trip* currency — Japan quotes `per: 100` (3.305 MYR per
100 JPY), while somewhere like Europe would use `per: 1`. Activity costs in
`days[].items[].costs` are in **trip** currency and get converted for display;
everything in `budget`, `settle` and `accommodation` is in **home** currency. Omit
`exchangeRate` entirely for a domestic trip and cost columns collapse to one currency.

**Cost categories.** Default buckets are `transport`, `fuel`, `food`, `sightseeing`,
`misc`. Override with a `costCategories` object mapping key to label; the keys you use
in `costs` must match. Day totals and the budget page's "planned spend" table roll up
from these automatically.

## Local preview

The pages use `fetch()`, so they need to be served over HTTP — opening the files
directly with `file://` will not work.

```
python -m http.server 8080
```

Then visit <http://localhost:8080>.

## Publishing

Hosted with GitHub Pages from the `main` branch (Settings → Pages → deploy from a branch).
