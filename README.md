# Travel

Trip itineraries, planned and researched with Claude Code, published as a static site.

## Structure

```
index.html            Landing page — lists trips newest-first
trips.json            Trip manifest that the landing page reads
assets/               Shared stylesheet + JS (site helpers, trip page renderers)
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

1. Create `trips/<slug>/` with a `data.json` following the shape of an existing trip.
2. Copy the page templates from an existing trip (they are trip-agnostic).
3. Append an entry to `trips.json` — `slug`, `title`, `destination`, `emoji`,
   `startDate`, `endDate`. The landing page sorts by `startDate` descending and derives
   the Upcoming/In progress/Past badge from today's date.

## Local preview

The pages use `fetch()`, so they need to be served over HTTP — opening the files
directly with `file://` will not work.

```
python -m http.server 8080
```

Then visit <http://localhost:8080>.

## Publishing

Hosted with GitHub Pages from the `main` branch (Settings → Pages → deploy from a branch).
