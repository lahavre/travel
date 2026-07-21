# Working notes

Static travel-itinerary site, published via GitHub Pages from `main`
(<https://github.com/lahavre/travel>). Replaces a per-trip Excel workbook.
`README.md` documents the site and the full `data.json` schema — read it first.

## Ground rules

- **Never edit the per-trip HTML.** All seven pages in a trip folder are identical
  17-line stubs that call `Trip.page("<section>")`. Every renderer lives in
  `assets/trip.js`, so a fix there lands on every trip at once. If a page needs new
  markup, change the renderer, not the trip.
- **`data.json` is the single source of truth.** Totals, percentages, currency
  conversion, day cost roll-ups and the overview's hotel column are all derived at
  render time. Never hardcode a computed figure into markup or duplicate a value that
  can be looked up (the overview reads hotels from `accommodation` by date).
- **Don't invent trip data.** Where the source didn't record something — a flight
  number, an unforecast temperature — leave it `null` and let it render as "—" or a
  note. Ask rather than fill a plausible-looking gap.
- **Every section is optional.** Missing or empty sections must render a placeholder,
  never throw. Test a sparse trip after touching a renderer.

## House formatting

| Thing | Format |
| --- | --- |
| Dates | Day-first, `13 Oct 2023`. Locale pinned to `en-GB` in `assets/common.js` — don't fall back to the viewer's locale |
| Date + weekday | `13 Oct 2023 (Fri)` — `Trip.longDate()` |
| Temperature | Always Celsius, `City: 18 to 25 °C`. Use "to", never a dash — sub-zero lows (`-1 to 12`) are unreadable otherwise |
| Currency | Driven by `homeCurrency` / `tripCurrency`; never hardcode MYR or JPY |
| Check-in | 3 hours before departure by default |
| Spelling | British — "traveller", "colour" |

Time-of-day colour bands (morning amber, afternoon blue, evening violet) are CSS
variables defined for light **and** dark themes in all four `:root` blocks. Add new
colours to every block or dark mode breaks.

## Verifying

`python serve.py` — plain `http.server` caches aggressively and will hide your edits.
Pages use `fetch()`, so `file://` does not work at all.

Before saying something works: load it in the browser, check light and dark, desktop
and mobile (wide tables must scroll inside `.table-wrap`, never widen the page), and
confirm no console errors. When changing a figure, reconcile against the source —
the Japan trip's totals match its workbook exactly and should stay that way.

## Workflow

For a new trip: research and propose the day-by-day in chat first, get sign-off, then
copy `trips/_template/` to `trips/YYYY-MM-destination/`, fill in `data.json`, and add
one entry to `trips.json`.

Commit locally as work completes. **Push only when explicitly asked.** Commits use
this repo's own git identity (`lahavre` / the GitHub noreply address) — the account
blocks pushes carrying a private email.

## Status

- Live at <https://lahavre.github.io/travel/>; pushing to `main` redeploys.
- Japan 2023 is migrated and reconciled; it is the reference trip.
- `trips/_template/` is the starting point, deliberately absent from `trips.json`.
- The design is a **first draft** — formatting is expected to keep changing.

Do not delete the root `.nojekyll`. Without it Pages runs Jekyll, which drops every
path starting with an underscore and 404s `trips/_template/`.
