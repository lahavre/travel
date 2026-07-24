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
- **An uploaded document outbids anything typed by hand.** Booking confirmations,
  airline vouchers and receipts are the source of truth; a spreadsheet or a
  remembered detail is not, because it carries human error. When they disagree, the
  document wins — and say so, rather than quietly overwriting. Reading the Japan
  vouchers this way corrected four cancellation policies the workbook had flattened
  to "non-refundable" and explained a stay recorded as costing nothing.
- **Don't invent trip data.** Where the source didn't record something — a flight
  number, an unforecast temperature, a travel duration — leave it `null` and let it
  render as "—" or a note. Ask rather than fill a plausible-looking gap. This
  includes travel times: the page links out to Google Maps rather than guessing,
  because the Directions API needs a key that a public static site cannot keep
  secret.
- **"—" and "N/A" are different claims.** "—" means nobody has found out yet; "N/A"
  means it was checked and the property does not offer it. Never promote one to the
  other. For a trip being planned for real, ask the traveller to confirm the
  amenities a booking rarely states — laundry above all — instead of leaving them
  unknown.
- **Every section is optional.** Missing or empty sections must render a placeholder,
  never throw. Test a sparse trip after touching a renderer.
- **The repo and the site are public.** Booking confirmations carry door codes,
  lock-box codes, host directions and the traveller's own phone, email and date of
  birth. Take the property details across and leave all of that behind.

## House formatting

| Thing | Format |
| --- | --- |
| Dates | Day-first, `13 Oct 2023`. Locale pinned to `en-GB` in `assets/common.js` — don't fall back to the viewer's locale |
| Date + weekday | `13 Oct 2023 (Fri)` — `Trip.longDate()` |
| Temperature | Always Celsius, `City: 18 to 25 °C`. Use "to", never a dash — sub-zero lows (`-1 to 12`) are unreadable otherwise |
| Currency | Three-letter ISO code as the spreadsheet used — `MYR 517.42`, not `RM517.42`. Driven by `homeCurrency` / `tripCurrency`; never hardcode MYR or JPY |
| Hotel check-in / out | `From 15:00 until 19:00` and `Until 11:00` — "until" in both, never "to" |
| Flight check-in | 3 hours before departure by default |
| Travel legs | `A -(Tokyo Monorail)> B -(Walk - 15 mins)> Hotel` — renders as "A to Hotel" + Maps link |
| Activities | `Travel to X` / `Explore X` / `Dinner at X` — the wording is what makes a leg linkable |
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

Ask for the booking confirmations rather than transcribing details from memory or a
spreadsheet, and read every one before filling in a stay.

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
