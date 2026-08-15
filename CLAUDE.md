# Working notes

Static travel-itinerary site, published via GitHub Pages from `main`
(<https://github.com/lahavre/travel>). Replaces a per-trip Excel workbook.
`README.md` documents the site and the full `data.json` schema — read it first.

## Ground rules

- **Never edit the per-trip HTML.** Every page in a trip folder is an identical
  17-line stub that calls `Trip.page("<section>")` (add one with
  `tools/new_trip_pages.py`). Every renderer lives in
  `assets/trip.js`, so a fix there lands on every trip at once. If a page needs new
  markup, change the renderer, not the trip.
- **`data.json` is the single source of truth.** Totals, percentages, currency
  conversion, day cost roll-ups and the overview's hotel column are all derived at
  render time. Never hardcode a computed figure into markup or duplicate a value that
  can be looked up (the overview reads hotels from `accommodation` by date).
- **Page edits override `data.json` field by field — they never copy it.** Stays,
  flights, car hires, legs and booked activities are all editable on the page, but only
  the fields that *actually differ* are stored (`recordEdits/<slug>`,
  `extraActivities/<slug>.overrides`). That asymmetry is the whole design: it keeps the
  file authoritative wherever nobody has contradicted it, so a confirmation transcribed
  into `data.json` later still shows through. Three rules follow, and any new editor
  must keep them — emptying a box **reverts** that field rather than storing a blank,
  a value equal to the file's stores **nothing**, and a value that contradicts the file
  renders the original beside it ("booking: …"). Never seed a whole record into
  Firestore the way the to-do list does; that breaks the property above.
  Records **added on the page** (`+ Add`, kept under `added`) are the one exception —
  nothing else records them, so they are stored whole and are the only ones a Remove
  button may delete. A record from `data.json` belongs to the file.
- **Override keys come from the record's original values.** `stayAttachKey`,
  `flightAttachKey`, `carRentalKey`, `ptKey` and `activityKey` tie a record to its
  private note, its attached documents and its row in the split. Compute them from
  `data.json`, never from edited values, or renaming a hotel silently orphans all three.
  The merged object carries `recordKey` for exactly this reason — use it.
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
- **Weather comes from a verified coordinate or not at all.** `tools/fetch_weather.py`
  fills the forecast from Open-Meteo (free, no key, so the numbers are baked into
  `data.json` and the site stays static). Only add a place to its `PLACES` table once
  the geocoder's answer has been checked against the region it should be in — an
  onsen or a summit often resolves to a same-named town elsewhere, or a valley
  hundreds of metres below, and a few hundred metres of altitude is a few degrees.
  Four Japan places are deliberately left blank for exactly this reason. Dates beyond
  the ~16-day forecast fall back to the same dates a year earlier, flagged "last year"
  — a stand-in, never presented as a forecast.
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
| Currency | Three-letter ISO code as the spreadsheet used — `MYR 517.42`, not `RM517.42`. Driven by `homeCurrency` / `tripCurrency`; never hardcode MYR or JPY. A currency **picker** must also offer whatever currency the record already states, or saving silently rewrites it — a Slovenian bus is fared in EUR on a trip priced in JPY |
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

Then run `python tools/fetch_weather.py <trip>/data.json` for the forecast, adding
each place to its `PLACES` table first. Open-Meteo only forecasts about 16 days, so
a trip planned further out has no weather until closer to departure — re-run it then.
`tools/` also holds the page scaffolder and the Japan workbook migration.

Commit locally as work completes. **Push only when explicitly asked.** Commits use
this repo's own git identity (`lahavre` / the GitHub noreply address) — the account
blocks pushes carrying a private email.

**A new Firestore collection needs `firestore.rules` pasted into the Firebase console**
(Build → Firestore Database → Rules → Publish) before it will accept a write. Editing
the file in the repo does nothing on its own. Say so when shipping one — the feature
looks broken until the user does it. The catch-all at the bottom of the rules refuses
anything without its own `match`, deliberately.

## Status

- Live at <https://lahavre.github.io/travel/>; pushing to `main` redeploys.
- **Eight pages per trip**: Overview, Days, Weather, Budget, Accommodation, Transport,
  Activities, To-do. `tools/new_trip_pages.py` scaffolds all eight.
- Japan 2023 is migrated and reconciled; it is the reference trip. It doubles as the
  **design fixture** — its `publicTransport` holds Croatia legs and its `activities`
  hold 2019 vouchers, deliberately, to exercise the renderers. Its data being
  off-trip is not a bug to fix.
- `trips/_template/` is the starting point, deliberately absent from `trips.json`.
- The design is a **first draft** — formatting is expected to keep changing.

Do not delete the root `.nojekyll`. Without it Pages runs Jekyll, which drops every
path starting with an underscore and 404s `trips/_template/`.
