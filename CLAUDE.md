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
- **Never write planning commentary into a field that seeds the private layer.**
  `remarks` on a stay, flight, activity, car hire, leg or **overview day** is a *seed*:
  the first signed-in load copies it into Firestore, and from then on the file no longer
  governs it. Rewrite `data.json` afterwards and the old text stays in Firestore,
  indistinguishable from something the traveller typed — on a trip still being planned
  that is a growing pile of stale notes nobody can safely delete. So leave all of those
  `null`. Commentary belongs in the **file-owned** fields, which are re-read from
  `data.json` on every load and replaced cleanly by a rebuild: `days[].summary`,
  `days[].items[].remarks`, the trip-level `notes`, and `summary.note`. Nothing under
  `days[]` is ever seeded — that is what makes it safe. As a bonus it is public, so the
  reasoning shows to everyone rather than only to whoever is signed in. `todo` is the one
  knowing exception: it seeds `todoList/<slug>` once and is a checklist meant to become
  the group's, so it is still written — and the document wants deleting once, when the
  plan stops moving. A generator for a trip should **assert** that every seeded field is
  null rather than trust itself to remember.
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
  other — including in a renderer, which used to turn a blank `meal` into "N/A" and
  so made a claim the data never supported. For a trip being planned for real, ask the
  traveller to confirm the amenities a booking rarely states — laundry above all —
  instead of leaving them unknown. **Meals are the settled exception**: the traveller's
  rule is that a booking states a meal when one is included, so a blank on a *booked*
  stay means none was purchased and should be written as "N/A" in `data.json`. That
  applies only once the stay is booked — on an unbooked trip nothing has been checked,
  so it stays "—".
- **Weather comes from a verified coordinate or not at all.** `tools/fetch_weather.py`
  fills the forecast from Open-Meteo (free, no key, so the numbers are baked into
  `data.json` and the site stays static). Only add a place to its `PLACES` table once
  the geocoder's answer has been checked against the region it should be in — an
  onsen or a summit often resolves to a same-named town elsewhere, or a valley
  hundreds of metres below, and a few hundred metres of altitude is a few degrees.
  Seven Japan places are deliberately left blank for exactly this reason —
  "Kamikochi" is the clearest: it geocodes to a same-named place in Kanagawa at 13 m
  when the valley is at ~1,500 m in Nagano. Dates beyond the ~16-day forecast fall
  back to the same dates in the most recent year the archive actually covers, flagged
  with how far back it went ("last year", "2 years ago") — a stand-in, never presented
  as a forecast, and one particular year rather than a seasonal average. It is not
  always last year: a trip over a year out has no last year either, so the lookup steps
  back until the range is past. That rule is duplicated in `fetch_weather.py` and
  `trip.js` and the two must agree, or Refresh contradicts the baked figures.
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

For a new trip, in this order — walked end to end as a dry run on 9 Aug 2026, so these
are the actual steps rather than a guess:

1. **Research and propose the day-by-day in chat first, and get sign-off.** Nothing goes
   into the repo before that.
2. `cp -r trips/_template trips/YYYY-MM-destination` — this brings the eight page stubs
   *and* a worked `data.json` with every section filled in as an example.
3. In the new `data.json`: **delete every `_`-prefixed key** (they are inline notes on
   the schema, not data), set `slug`/`title`/`destination`/`emoji`/`startDate`/`endDate`,
   and **replace the sample content** — the template's `days`, `overview`, `accommodation`,
   `transport`, `activities` and `todo` all carry made-up entries with their own dates,
   which do *not* follow `startDate`. Leaving one behind puts "Museum of Modern Art" on a
   real trip.
4. Add one entry to `trips.json` (`slug`, `title`, `destination`, `emoji`, `startDate`,
   `endDate`). The landing page sorts by `startDate` descending and derives its badge
   from today's date.
5. Load all eight pages before saying it works. A trip missing a section must render a
   placeholder, never throw.
6. **Grant the other travellers access to the new slug**, on the root `index.html` admin
   panel (owner only). `canAccessTrip()` short-circuits for the owner, so a new trip's
   private side — to-do, remarks, files, splits, every Edit — works for the owner
   immediately and is **invisible to everyone else until their email is ticked against
   that slug**. It looks like a bug and is not one; do this before telling anyone the
   trip is up.

Ask for the booking confirmations rather than transcribing details from memory or a
spreadsheet, and read every one before filling in a stay. What no confirmation states —
a price, a laundry, a check-in window — stays `null`; it can be typed on the page later,
and typing it there is *better* than guessing here.

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
- **Japan 2027 (`trips/2027-10-japan-alps`) is the first real trip the planner has
  handled** — 8-23 Oct 2027, two travellers, nothing booked. Planned across several
  rounds of the traveller's own review, so the shape reflects their decisions, not a
  first draft: two nights at Nagano for Zenkoji and Togakushi, three at Hakuba, Matsumoto
  with Azumino, Okuhida, one night in Kamikochi, the Kiso valley, a last night at
  Shinagawa. The dates
  are a knowing trade the traveller made against advice, on evidence they found: Hakuba's
  alpine colour peaks late September and the Nakasendo's late October, five weeks apart,
  so no single trip catches both. Happo Pond was reported at peak on 11 Oct in both 2024
  and 2025, and it has three nights and two headline walks, so the window follows it —
  accepting the Kiso valley before its peak and Kamikochi in maples rather than larch.
  **Sports Day falls on Mon 11 Oct**, and the trip is arranged around it rather than
  against: the long weekend is spent in Nagano, a city, which absorbs a holiday far
  better than a resort valley, and the drive to Hakuba happens on the Monday itself —
  against traffic that runs from the resorts back to the cities. Both Hakuba walks then
  fall on ordinary weekdays. **Transport is
  deliberately mixed**: a hire car for the middle five days (Nagano 11 Oct to Matsumoto
  15 Oct — same prefecture, so the one-way drop stays cheap) where the buses are sparse,
  and rail everywhere else, because Kamikochi bans private cars, the Magome-Tsumago walk
  is point-to-point, and the long hauls are faster by train.
- Japan 2023 is migrated and reconciled; it is the reference trip. It doubles as the
  **design fixture** — its `publicTransport` holds Croatia legs and its `activities`
  hold 2019 vouchers, deliberately, to exercise the renderers. Its data being
  off-trip is not a bug to fix.
- `trips/_template/` is the starting point, deliberately absent from `trips.json`.
- The design is a **first draft** — formatting is expected to keep changing.

Do not delete the root `.nojekyll`. Without it Pages runs Jekyll, which drops every
path starting with an underscore and 404s `trips/_template/`.
