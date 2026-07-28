/* Renderers for a single trip's pages.
   Every per-trip HTML page is thin boilerplate: it calls Trip.page(<section>) and
   everything below draws from that trip's data.json. Fix a bug here and every trip
   — past, present and template — picks it up. */
const Trip = (() => {
  const ROOT = "../..";

  // Default cost buckets. A trip can override these in data.json via `costCategories`
  // (e.g. drop "fuel" for a trip with no rental car, add "tickets" for a rail trip).
  const DEFAULT_COST_LABELS = {
    transport: "Transport",
    fuel: "Fuel / Parking",
    food: "Food",
    sightseeing: "Sightseeing",
    misc: "Misc",
  };

  const SECTIONS = [
    { key: "index", label: "Trip", href: "index.html" },
    { key: "overview", label: "Overview", href: "overview.html" },
    { key: "day", label: "Days", href: "day.html?day=1" },
    { key: "weather", label: "Weather", href: "weather.html" },
    { key: "budget", label: "Budget", href: "budget.html" },
    { key: "accommodation", label: "Accommodation", href: "accommodation.html" },
    { key: "transport", label: "Transport", href: "transport.html" },
    { key: "todo", label: "To-do", href: "todo.html" },
  ];

  const PAGE_TITLES = {
    index: null,
    overview: "Overview",
    day: "Day-by-day",
    weather: "Weather",
    budget: "Budget",
    accommodation: "Accommodation",
    transport: "Transport",
    todo: "To-do",
  };

  // ---------------------------------------------------------------- helpers

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function multiline(text) {
    if (!text) return "";
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  /** Placeholder for a section the trip hasn't filled in yet. */
  function placeholder(what) {
    return `<div class="empty-state">No ${escapeHtml(what)} recorded for this trip yet.</div>`;
  }

  function has(list) {
    return Array.isArray(list) && list.length > 0;
  }

  function costLabels(trip) {
    return trip.costCategories || DEFAULT_COST_LABELS;
  }

  /** Money in the traveller's home currency (what everything settles into). */
  function home(amount, trip) {
    if (amount === null || amount === undefined || isNaN(amount)) return "—";
    return TravelSite.formatMoney(amount, trip.homeCurrency || "MYR");
  }

  /** Money in the destination's currency. */
  function local(amount, trip) {
    if (amount === null || amount === undefined || isNaN(amount)) return "—";
    return TravelSite.formatMoney(amount, trip.tripCurrency || trip.homeCurrency || "MYR");
  }

  /**
   * Convert destination currency into home currency.
   * `exchangeRate.rate` is home-currency units per `exchangeRate.per` foreign units,
   * so Japan quotes 3.305 MYR per 100 JPY, while Europe would quote 4.9 MYR per 1 EUR.
   */
  function toHome(amount, trip) {
    const fx = trip.exchangeRate;
    if (!fx || !fx.rate) return null;
    return (amount / (fx.per || 1)) * fx.rate;
  }

  /** Both currencies as two table cells, or one cell when no rate is defined. */
  function moneyCells(amountLocal, trip) {
    const converted = toHome(amountLocal, trip);
    const localCell = `<td class="num">${local(amountLocal, trip)}</td>`;
    if (converted === null) return localCell;
    return `${localCell}<td class="num">${home(converted, trip)}</td>`;
  }

  function moneyHeaders(trip) {
    const localHead = `<th class="num">${escapeHtml(trip.tripCurrency || "Cost")}</th>`;
    if (!trip.exchangeRate || !trip.exchangeRate.rate) return localHead;
    return `${localHead}<th class="num">${escapeHtml(trip.homeCurrency || "Home")}</th>`;
  }

  /** Sum every cost bucket across one day's activities. */
  function dayCosts(day) {
    const totals = {};
    let sum = 0;
    (day.items || []).forEach((it) => {
      Object.entries(it.costs || {}).forEach(([k, v]) => {
        totals[k] = (totals[k] || 0) + v;
        sum += v;
      });
    });
    return { totals, sum };
  }

  function cityName(value) {
    return (value || "").replace(/\n/g, " ");
  }

  /**
   * Recommended check-in time — how the trip home page answers "when do I need to
   * leave for the airport". Explicit `checkInTime` in data.json always wins; otherwise
   * it is derived by backing off `checkInLeadHours` (default 3) from departure.
   * Returns the clock time plus a day offset, since an early departure can push
   * check-in into the previous evening.
   */
  function checkIn(flight, defaultLeadHours = 3) {
    if (flight.checkInTime) return { time: flight.checkInTime, dayOffset: 0, derived: false };
    if (!flight.departTime) return null;

    const [h, m] = flight.departTime.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return null;

    const lead = flight.checkInLeadHours != null ? flight.checkInLeadHours : defaultLeadHours;
    let minutes = h * 60 + m - Math.round(lead * 60);
    let dayOffset = 0;
    while (minutes < 0) {
      minutes += 24 * 60;
      dayOffset -= 1;
    }
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return { time: `${hh}:${mm}`, dayOffset, derived: true };
  }

  /**
   * Google Maps links. These use the public URL scheme, which needs no API key and
   * no billing — Maps itself works out the live route, time and tolls when opened.
   * Predicting duration or cost *inside* this page would need the Directions API,
   * whose key cannot be kept secret in a public static site, so stored estimates
   * (travel.duration / travel.cost) are shown as-is and the link covers the rest.
   */
  function mapsDirections(from, to, mode) {
    const params = new URLSearchParams({ api: "1", origin: from, destination: to });
    if (mode) params.set("travelmode", mode);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  function mapsSearch(query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  /**
   * Directions through intermediate stops.
   *
   * Google Maps cannot route transit *with* waypoints — asking for both returns
   * "could not calculate transit directions". For a train or bus route the
   * interchanges are the plan's suggestion anyway, so we pass the two ends and
   * let Maps work out the live connection; the written line still names the
   * intended lines.
   */
  function mapsRoute(stops, mode, region) {
    const q = (s) => (region && !s.toLowerCase().includes(region.toLowerCase()) ? `${s}, ${region}` : s);
    const params = new URLSearchParams({
      api: "1",
      origin: q(stops[0]),
      destination: q(stops[stops.length - 1]),
    });
    const via = mode === "transit" ? [] : stops.slice(1, -1);
    if (via.length) params.set("waypoints", via.map(q).join("|"));
    if (mode) params.set("travelmode", mode);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  // "Haneda -(Tokyo Monorail)> Hamamatsuchō Station -(Walk - 15 mins)> Hotel (500JPY)"
  const ROUTE_STEP = /\s*-\(([^)]*)\)>\s*/;

  /**
   * Pick a travel mode from the leg descriptions the route names. Checked in
   * priority order: a route that mixes a train with a walk to the station is a
   * transit route, while one that mixes a ropeway with a hike is best walked —
   * Google cannot route an aerial ropeway at all.
   */
  function routeMode(modes) {
    const all = modes.join(" ").toLowerCase();
    if (/\b(line|train|monorail|subway|metro|shinkansen|bus|ferry|tram)\b/.test(all)) return "transit";
    if (/\b(drive|driving|car|taxi)\b/.test(all)) return "driving";
    if (/\b(walk|hike|hiking|trek|trekking|foot)/.test(all)) return "walking";
    if (/\b(ropeway|cable ?car|gondola|funicular|lift)\b/.test(all)) return "transit";
    return null;
  }

  // Words a plan uses for "the place we are staying" rather than naming it.
  const STAY_WORD = /^(hotel|airbnb|hostel|ryokan|guest ?house|pension|apartment|accommodation|the hotel)$/i;

  // A plan says "Store" or "Restaurant" for the venue its own title already named.
  const VENUE_WORD = /^(store|shop|restaurant|cafe|café|venue|the store)$/i;

  /**
   * Which stay "Hotel" means at a given moment.
   *
   * On a moving day both are in play: the one being checked out of that morning and
   * the one being checked into that evening. Anything before the new place opens for
   * check-in still refers to the old one.
   */
  function stayAt(trip, day, time, arrivingPreferred) {
    const stays = trip.accommodation || [];
    const arriving = stays.find((a) => a.checkIn === day.date);
    const leaving = stays.find((a) => a.checkOut === day.date);
    // Heading *to* the hotel means tonight's, whatever the hour.
    if (arrivingPreferred && arriving) return arriving;
    if (arriving && leaving && time && arriving.checkInFrom && time < arriving.checkInFrom) {
      return leaving;
    }
    return arriving || leaving || stayOn(day.date, stays);
  }

  /** The place an activity's own wording names — "Dinner at Ichiran Ramen". */
  function venueFrom(proseLines) {
    for (const line of proseLines) {
      // Take the rest of the line and let cleanPlace find the sentence end, so
      // "at Mt. Otakamori" is not cut short at the abbreviation.
      const m = /\b(?:at|@)\s+(.+)$/i.exec(line);
      if (m) return cleanPlace(m[1]);
    }
    return null;
  }

  /**
   * Trim a place name out of the surrounding sentence.
   *
   * Drops a trailing "via …", anything after a sentence break, and a closing
   * bracket that holds opening hours or a price rather than a location — so
   * "Explore Aizu Bukeyashiki Museum (8.30am - 5pm, 850JPY)" keeps the museum but
   * "Hotel (Kinugawa Onsen)" keeps its town.
   */
  const ABBREVIATION = /(?:Mt|St|Jr|Sr|Dr|Ave|Rd|No)$/i;

  function cleanPlace(text) {
    let s = String(text || "");

    // Cut at the first sentence break. A full stop inside "Mt. Otakamori" or
    // "8.30am" is not one, or the place would come out as "Mt".
    for (let i = 0; i < s.length; i += 1) {
      if (s[i] !== ".") continue;
      if (i + 1 < s.length && !/\s/.test(s[i + 1])) continue;
      if (ABBREVIATION.test(s.slice(0, i).split(/[\s(]/).pop())) continue;
      s = s.slice(0, i);
      break;
    }

    s = s.replace(/\s+via\s+.*$/i, "");
    s = s.replace(/\s*\(([^)]*)\)\s*$/, (m, inner) =>
      /\d|jpy|yen|am\b|pm\b|free|alternative/i.test(inner) ? "" : m
    );
    return s.replace(/[\s,.;:?!-]+$/, "").trim();
  }

  // "Travel to Kitakata", "Explore Matsushima" — an activity that states where it is.
  const GOES_TO = /^\s*(?:travel|drive|head|go|walk|move)\s+(?:back\s+)?to\s+(.+)$/i;
  const HAPPENS_AT = /^\s*(?:explore|hike|hiking|trekking|visit|check[- ]?in(?:\s+at)?)\s+(.+)$/i;
  // Being somewhere at the start or end of a day means being at the accommodation.
  const AT_THE_STAY = /^\s*(?:wake up|sleep|breakfast|check[- ]?out|collect luggage|rest)\b/i;

  /**
   * Where an activity leaves the traveller.
   *
   * Used to infer the start of a journey the plan did not spell out: the previous
   * activity says where you are. Returns null rather than a guess when the wording
   * names no place — a wrong direction link is worse than none.
   */
  function placeOf(text, trip, day, time) {
    for (const line of String(text || "").split("\n")) {
      if (ROUTE_STEP.test(line)) continue;
      const goes = GOES_TO.exec(line);
      if (goes) return cleanPlace(goes[1]);
      const at = HAPPENS_AT.exec(line);
      if (at) return cleanPlace(at[1]);
      const venue = venueFrom([line]);
      if (venue) return venue;
      if (AT_THE_STAY.test(line)) {
        const stay = stayAt(trip, day, time);
        if (stay) return stay.address || stay.name;
      }
    }
    return null;
  }

  /**
   * Resolve a route stop to what to show and what to send Google.
   *
   * A stay word becomes the property in use at that hour; a venue word becomes the
   * place the activity named; an airport named loosely ("Haneda") becomes the airport
   * as the flight booking records it, terminal included when the voucher gave one.
   * The label stays readable while the query is precise.
   */
  function resolveStop(stop, trip, day, ctx) {
    // "Hotel", or a longer phrase like "Hotel (Kinugawa Onsen) - K's House Nikko".
    if (day && (STAY_WORD.test(stop) || /^hotel\b/i.test(stop))) {
      const stay = stayAt(trip, day, ctx && ctx.time, ctx && ctx.arriving);
      if (stay) return { label: stay.name || stop, query: stay.address || stay.name || stop };
    }

    if (VENUE_WORD.test(stop) && ctx && ctx.venue) {
      return { label: ctx.venue, query: ctx.venue };
    }

    // Match an airport on its own name or code — never on the city, or "Tokyo
    // Station" would be mistaken for Tokyo Haneda.
    const hay = stop.toLowerCase();
    for (const f of trip.flights || []) {
      for (const [port, terminal] of [[f.from, f.fromTerminal], [f.to, f.toTerminal]]) {
        if (!port) continue;
        const code = (/\(([A-Z]{3})\)/.exec(port) || [])[1];
        const name = port.replace(/\s*\([^)]*\)\s*$/, "").split(/\s+/).pop();
        const hit =
          (code && new RegExp(`\\b${code}\\b`, "i").test(stop)) ||
          (name && name.length > 3 && hay.includes(name.toLowerCase()));
        if (hit) {
          const full = terminal ? `${port} ${terminal}` : port;
          return { label: full, query: full };
        }
      }
    }
    return { label: stop, query: stop };
  }

  /**
   * Collapse an activity's route lines into one summary per journey.
   *
   * The written options all run between the same two points and mostly restate
   * what Maps returns live, so the page shows "A to B" with a link and keeps the
   * original wording on hover.
   */
  function activityRoutes(text, trip, day, time, earlier) {
    const lines = String(text || "").split("\n");
    const plain = lines.filter((l) => !ROUTE_STEP.test(l));
    // You set off from wherever the day last left you, and arrive at the place this
    // activity names — so an unnamed origin looks back, a destination does not.
    // Some activities ("Lunch (Ita Soba)") name nowhere, so keep looking back.
    const before = Array.isArray(earlier) ? earlier : earlier ? [earlier] : [];
    const lastKnownPlace = () => {
      for (const t of before) {
        const p = placeOf(t, trip, day, time);
        if (p) return p;
      }
      return null;
    };

    const venue = venueFrom(plain);
    const ctx = { time, venue, originVenue: lastKnownPlace() || venue };
    const routes = [];
    const byKey = new Map();

    lines.forEach((line) => {
      if (!ROUTE_STEP.test(line)) return;
      let body = line.replace(/^\s*\d+[.)]\s*/, "");
      const cost = /\s*(\([^()]*\))\s*$/.exec(body);
      if (cost && !ROUTE_STEP.test(cost[1])) body = body.slice(0, cost.index);

      const parts = body.split(ROUTE_STEP);
      const stops = parts.filter((_, i) => i % 2 === 0).map((s) => s.trim()).filter(Boolean);
      const modes = parts.filter((_, i) => i % 2 === 1).map((s) => s.trim());
      if (stops.length < 2) return;

      const from = resolveStop(stops[0], trip, day, { ...ctx, venue: ctx.originVenue });
      const to = resolveStop(stops[stops.length - 1], trip, day, ctx);
      const key = `${from.query}|${to.query}`;
      if (byKey.has(key)) {
        byKey.get(key).detail.push(line.trim());
        return;
      }
      const route = {
        from,
        to,
        url: mapsRoute(
          [from.query, ...stops.slice(1, -1), to.query],
          routeMode(modes),
          trip.destination
        ),
        detail: [line.trim()],
      };
      byKey.set(key, route);
      routes.push(route);
    });

    // No legs written out, but the activity says where it is going — a self-drive
    // plan mostly reads "Travel to Kitakata". Take the destination from its own
    // wording and the start from the previous activity, and link that.
    if (!routes.length) {
      const goes = plain.map((l) => GOES_TO.exec(l)).find(Boolean);
      const origin = lastKnownPlace();
      if (goes && origin) {
        const from = resolveStop(origin, trip, day, ctx);
        const to = resolveStop(cleanPlace(goes[1]), trip, day, { ...ctx, arriving: true });
        if (from.query && to.query && from.query.toLowerCase() !== to.query.toLowerCase()) {
          routes.push({
            from,
            to,
            url: mapsRoute([from.query, to.query], trip.defaultTravelMode || null, trip.destination),
            detail: [],
            inferred: true,
          });
        }
      }
    }

    return { plain, routes };
  }

  /** Activity text, with its travel legs collapsed into linked "A to B" summaries. */
  function activityHtml(text, trip, day, time, earlier) {
    if (!text) return "";
    const { plain, routes } = activityRoutes(text, trip, day, time, earlier);

    const prose = plain.map((l) => escapeHtml(l)).join("<br>");
    const legs = routes
      .map(
        (r) => `<div class="route-line" title="${escapeHtml(r.detail.join("\n"))}">
          <span class="route-ends">${escapeHtml(r.from.label)} to ${escapeHtml(r.to.label)}</span>
          <a href="${r.url}" target="_blank" rel="noopener noreferrer" class="travel-link">Directions ↗</a>
        </div>`
      )
      .join("");

    return prose + legs;
  }

  /** A "Tokyo to Kinugawa Onsen" style route string, split into its two ends. */
  function splitRoute(route) {
    const m = /^(.*?)\s+to\s+(.*)$/i.exec(route || "");
    if (!m) return null;
    const to = m[2].replace(/,?\s*and back$/i, "").trim();
    return to ? { from: m[1].trim(), to } : null;
  }

  /** Travel details attached to one activity, with a directions link. */
  function travelChip(travel, trip) {
    if (!travel || (!travel.from && !travel.to)) return "";
    const mode = travel.mode || (trip.transport && trip.transport.defaultMode) || "driving";
    const bits = [];
    if (travel.duration) bits.push(escapeHtml(travel.duration));
    if (travel.distance) bits.push(escapeHtml(travel.distance));
    if (travel.cost != null) bits.push(local(travel.cost, trip));

    const url =
      travel.from && travel.to ? mapsDirections(travel.from, travel.to, mode) : mapsSearch(travel.to || travel.from);

    return `<div class="travel-chip">
      <span class="travel-route">${escapeHtml(travel.from || "")}${
      travel.from && travel.to ? " → " : ""
    }${escapeHtml(travel.to || "")}</span>
      ${bits.length ? `<span class="travel-meta">${bits.join(" · ")}</span>` : ""}
      <a href="${url}" target="_blank" rel="noopener noreferrer" class="travel-link">Directions ↗</a>
    </div>`;
  }

  /** "13 Oct 2023 (Fri)" — the trip's canonical date format. */
  function longDate(iso) {
    if (!iso) return "";
    const date = TravelSite.formatDate(iso, { day: "numeric", month: "short", year: "numeric" });
    const weekday = TravelSite.formatDate(iso, { weekday: "short" });
    return `${date} (${weekday})`;
  }

  // ---------------------------------------------------------------- renderers

  function indexHtml(trip) {
    const stays = trip.accommodation || [];
    const nights = stays.reduce((s, a) => s + (a.nights || 0), 0);
    const flights = trip.flights || [];
    const short = (iso) => TravelSite.formatDate(iso, { day: "2-digit", month: "short", year: "numeric" });

    const facts = [
      { label: "Days", value: (trip.days || []).length || (trip.summary && trip.summary.totalDays) || "—" },
      stays.length ? { label: "Nights booked", value: nights } : null,
    ].filter(Boolean);

    const anyDerivedCheckIn = flights.some((f) => {
      const c = checkIn(f, trip.checkInLeadHours);
      return c && c.derived;
    });

    const flightCard = (f) => {
      const c = checkIn(f, trip.checkInLeadHours);
      const stop = (time, name, terminal, extraNote) => `
        <div class="flight-stop">
          <div class="flight-time">${escapeHtml(time || "—")}</div>
          <div>
            <div class="flight-port">${escapeHtml(name || "")}</div>
            ${terminal ? `<div class="flight-terminal">${escapeHtml(terminal)}</div>` : ""}
            ${extraNote ? `<div class="flight-nextday">${extraNote}</div>` : ""}
          </div>
        </div>`;

      return `
        <div class="flight-card">
          <div class="flight-card-head">
            <span class="flight-type">${escapeHtml(f.type || "Flight")}</span>
            <span class="flight-date">${longDate(f.date)}</span>
            ${f.duration ? `<span class="flight-duration">${escapeHtml(f.duration)}</span>` : ""}
          </div>
          <div class="flight-card-body">
            ${stop(f.departTime, f.from, f.fromTerminal, null)}
            ${stop(
              f.arriveTime,
              f.to,
              f.toTerminal,
              f.arrivesNextDay ? "Arrives next day" : null
            )}
            <div class="flight-card-foot">
              <span>${escapeHtml(f.airline || "")}${
        f.flightNo ? ` · <strong>${escapeHtml(f.flightNo)}</strong>` : ""
      }</span>
              ${
                c
                  ? `<span class="flight-checkin">Check-in from <strong>${escapeHtml(c.time)}</strong>${
                      c.dayOffset < 0 ? " (prev day)" : ""
                    }</span>`
                  : ""
              }
            </div>
            ${stayNoteHtml(flightAttachKey(f))}
            ${attachmentsHtml("flight", flightAttachKey(f), "Tickets & documents")}
          </div>
        </div>`;
    };

    const flightSection = flights.length
      ? `<h2>Flights</h2>
         <div class="flight-list">${flights.map(flightCard).join("")}</div>
         ${
           anyDerivedCheckIn
             ? `<p class="section-note">Check-in times shown are
                ${trip.checkInLeadHours || 3} hours before departure.</p>`
             : ""
         }`
      : "";

    const hotelSection = stays.length
      ? `<h2>Hotels</h2>
         <div class="table-wrap">
           <table>
             <thead><tr><th>Location</th><th>Hotel</th><th>Check-in</th><th>Check-out</th><th class="num">Nights</th></tr></thead>
             <tbody>${stays
               .map(
                 (a) => `<tr>
                   <td><strong>${escapeHtml(a.city || "")}</strong></td>
                   <td>${escapeHtml(a.name || "")}</td>
                   <td>${short(a.checkIn)}</td>
                   <td>${short(a.checkOut)}</td>
                   <td class="num">${a.nights || "—"}</td>
                 </tr>`
               )
               .join("")}</tbody>
             <tfoot><tr><td colspan="4">Total</td><td class="num">${nights}</td></tr></tfoot>
           </table>
         </div>
         <p class="section-note">Rates and per-person splits are on the
           <a href="accommodation.html">accommodation page</a>.</p>`
      : "";

    return `
      <h1>${trip.emoji ? trip.emoji + " " : ""}${escapeHtml(trip.title)}</h1>
      <p class="subtitle">${longDate(trip.startDate)} – ${longDate(trip.endDate)}</p>

      <div class="fact-grid">
        ${facts
          .map((f) => `<div class="fact"><div class="label">${f.label}</div><div class="value">${f.value}</div></div>`)
          .join("")}
      </div>

      <div class="quick-links">
        ${SECTIONS.filter((s) => s.key !== "index")
          .map((s) => `<a href="${s.href}">${s.label}</a>`)
          .join("")}
      </div>

      ${flightSection}
      ${hotelSection}
      ${trip.transport && trip.transport.mode ? `<h2>Getting around</h2><p>${escapeHtml(trip.transport.mode)}</p>` : ""}
      ${trip.notes ? `<h2>Notes</h2><p>${multiline(trip.notes)}</p>` : ""}

      <h2>Jump to a day</h2>
      ${
        has(trip.days)
          ? `<div class="day-grid">${trip.days
              .map(
                (d) =>
                  `<a href="day.html?day=${d.day}"><span class="day-grid-n">Day ${d.day}</span><span class="day-grid-city">${escapeHtml(
                    cityName(d.city).split(" (")[0]
                  )}</span></a>`
              )
              .join("")}</div>`
          : placeholder("days")
      }`;
  }

  function renderIndex(trip) {
    const redraw = () => {
      const main = document.getElementById("main");
      if (main) main.innerHTML = indexHtml(trip);
    };
    // Each flight can carry its own note and documents (boarding passes, e-tickets),
    // on the same private, signed-in-only basis as a stay's.
    setupAttachments(
      trip,
      (trip.flights || []).map((f) => ({ kind: "flight", key: flightAttachKey(f) })),
      redraw
    );
    setupStayNotes(trip, redraw);
    setTimeout(() => {
      const main = document.getElementById("main");
      if (main && !main.dataset.stayNotesWired) {
        main.dataset.stayNotesWired = "1";
        wireStayNotes(main);
      }
    }, 0);
    return indexHtml(trip);
  }

  /** The stay covering a given night: check-in on or before it, check-out after it. */
  function stayOn(isoDate, stays) {
    return (stays || []).find((a) => a.checkIn && a.checkOut && a.checkIn <= isoDate && isoDate < a.checkOut);
  }

  /**
   * Temperatures are stored as [{location, min, max, note}] in Celsius and render
   * as "City: 18 to 25 °C". "to" rather than a dash keeps a sub-zero low readable
   * ("Zao Onsen: -1 to 12 °C").
   */
  function temperatureLines(list) {
    if (!has(list)) return [];
    return list.map((t) => {
      const place = t.location ? `${escapeHtml(t.location)}: ` : "";
      if (t.min === null || t.max === null) {
        return `${place}${escapeHtml(t.note || "—")}`;
      }
      return `${place}${t.min} to ${t.max} °C`;
    });
  }

  // WMO weather codes, in the wording a traveller would use. Mirrors the table in
  // tools/fetch_weather.py so a live refresh reads the same as the baked-in data.
  const WMO = {
    0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Freezing fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Light showers", 81: "Showers", 82: "Heavy showers",
    85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
  };

  const DAILY_FIELDS =
    "weathercode,temperature_2m_max,temperature_2m_min," +
    "apparent_temperature_max,apparent_temperature_min,windspeed_10m_max,sunrise,sunset";

  function weatherCoords(trip, location) {
    return (trip.weatherPlaces || {})[location] || null;
  }

  /**
   * The forecast page a place name opens.
   *
   * A trip can pin an explicit URL per place in `weatherLinks` — that's how a
   * country's own service is used (Japan links to tenki.jp, which addresses by
   * prefecture area code, not coordinates). With no explicit link, a point-exact
   * page is built on yr.no from the stored coordinates — fast, ad-free, and it
   * works anywhere. Null when a place has neither, so its name shows unlinked.
   */
  function forecastPageLink(trip, location) {
    const explicit = (trip.weatherLinks || {})[location];
    if (explicit) return explicit;
    const coords = weatherCoords(trip, location);
    return coords ? `https://www.yr.no/en/forecast/daily-table/${coords.lat},${coords.lon}` : null;
  }

  // A refresh writes into localStorage, since a static page can't save back to
  // data.json. Keyed by trip slug; each value is {fetchedAt, byKey:{"place|date":{…}}}.
  function weatherCacheKey(trip) {
    return `weather:${trip.slug || trip.title || "trip"}`;
  }
  function readWeatherCache(trip) {
    try {
      return JSON.parse(localStorage.getItem(weatherCacheKey(trip))) || { byKey: {} };
    } catch (e) {
      return { byKey: {} };
    }
  }
  function writeWeatherCache(trip, cache) {
    try {
      localStorage.setItem(weatherCacheKey(trip), JSON.stringify(cache));
    } catch (e) {
      /* private mode or quota — the page still works from the baked data */
    }
  }

  /** Overlay any refreshed forecast held for this place and date onto the entry. */
  function withFreshWeather(trip, entry, date, cache) {
    const fresh = cache.byKey[`${entry.location}|${date}`];
    return fresh ? { ...entry, ...fresh } : entry;
  }

  /**
   * Re-fetch the forecast for every place in the trip and cache it. Runs in the
   * browser against Open-Meteo, which sends `Access-Control-Allow-Origin: *`, so no
   * key and no proxy are needed — the forecast endpoint for dates from today on, the
   * archive for dates already past.
   *
   * All places go in one request (Open-Meteo takes comma-separated coordinates and
   * returns an array in the same order): one round-trip per source rather than a
   * dozen, which also sidesteps the rate limit that dropped places when they were
   * fetched in parallel.
   *
   * Dates split by source the same way the offline tool does: archive for the past,
   * forecast for the next ~16 days, and — for anything further out, where no forecast
   * exists yet — the same dates a year ago, flagged as a stand-in.
   */
  const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

  function shiftYearIso(iso, delta) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(y + delta, m - 1, d));
    // Roll 29 Feb back to the 28th in a non-leap year.
    if (date.getUTCMonth() !== m - 1) date.setUTCDate(0);
    return date.toISOString().slice(0, 10);
  }

  async function refreshWeather(trip) {
    const names = Object.keys(trip.weatherPlaces || {});
    const days = trip.days || [];
    if (!names.length || !days.length) return { updated: 0 };

    const tz = trip.weatherTimezone || "auto";
    const lats = names.map((n) => trip.weatherPlaces[n].lat).join(",");
    const lons = names.map((n) => trip.weatherPlaces[n].lon).join(",");
    const today = new Date().toISOString().slice(0, 10);
    const horizon = (() => {
      const h = new Date();
      h.setUTCDate(h.getUTCDate() + 15);
      return h.toISOString().slice(0, 10);
    })();

    const wanted = [...new Set(days.map((d) => d.date))].sort();
    const past = wanted.filter((d) => d < today);
    const near = wanted.filter((d) => d >= today && d <= horizon);
    const far = wanted.filter((d) => d > horizon);

    const cache = readWeatherCache(trip);
    let updated = 0;

    // Fetch one contiguous range from one endpoint and store each day. `histShift`
    // (+1) marks last-year rows and maps their date back to this year.
    async function pull(base, s, e, { historical = false } = {}) {
      const res = await fetch(
        `${base}?latitude=${lats}&longitude=${lons}` +
          `&start_date=${s}&end_date=${e}` +
          `&daily=${DAILY_FIELDS}&timezone=${encodeURIComponent(tz)}`
      );
      if (!res.ok) return; // 400 beyond horizon etc. — leave the baked data
      const results = await res.json();
      (Array.isArray(results) ? results : [results]).forEach((r, idx) => {
        const name = names[idx];
        const d = r.daily;
        (d.time || []).forEach((date, i) => {
          if (d.temperature_2m_max[i] === null) return;
          const key = historical ? shiftYearIso(date, 1) : date;
          cache.byKey[`${name}|${key}`] = {
            min: Math.round(d.temperature_2m_min[i] * 10) / 10,
            max: Math.round(d.temperature_2m_max[i] * 10) / 10,
            feelsMin: Math.round(d.apparent_temperature_min[i] * 10) / 10,
            feelsMax: Math.round(d.apparent_temperature_max[i] * 10) / 10,
            condition: WMO[d.weathercode[i]] || `code ${d.weathercode[i]}`,
            wind: Math.round(d.windspeed_10m_max[i] * 10) / 10,
            sunrise: d.sunrise[i].slice(11, 16),
            sunset: d.sunset[i].slice(11, 16),
            note: null,
            ...(historical ? { basis: "historical", basisDate: date } : { basis: null, basisDate: null }),
          };
          updated += 1;
        });
      });
    }

    if (past.length) await pull(ARCHIVE_URL, past[0], past[past.length - 1]);
    if (near.length) await pull(FORECAST_URL, near[0], near[near.length - 1]);
    if (far.length) {
      await pull(ARCHIVE_URL, shiftYearIso(far[0], -1), shiftYearIso(far[far.length - 1], -1), {
        historical: true,
      });
    }

    cache.fetchedAt = new Date().toISOString();
    writeWeatherCache(trip, cache);
    return { updated };
  }

  function renderOverview(trip) {
    if (!has(trip.overview)) return `<h1>High-level itinerary</h1>${placeholder("itinerary")}`;

    const SLOTS = [
      { key: "morning", label: "Morning", cls: "slot-morning" },
      { key: "afternoon", label: "Afternoon", cls: "slot-afternoon" },
      { key: "evening", label: "Evening", cls: "slot-evening" },
    ];

    const rows = trip.overview
      .map((o) => {
        const stay = stayOn(o.date, trip.accommodation);
        const location = stay ? stay.city : cityName(o.city);
        const temps = temperatureLines(o.temperature);
        const slotRemarks = o.slotRemarks || {};
        // A whole-day note has no single slot to sit in, so it gets its own row.
        const dayNote = o.remarks ? 1 : 0;
        const span = 3 + dayNote;

        const stayingIn = `
          ${stay && stay.name
            ? `${escapeHtml(location)}<span class="stay-hotel">(${escapeHtml(stay.name)})</span>`
            : escapeHtml(cityName(o.city))}
          ${
            temps.length
              ? `<div class="stay-temp"><span class="stay-temp-label">Temperature:</span>
                   ${temps.map((t) => `<span class="stay-temp-val">${t}</span>`).join("")}</div>`
              : ""
          }`;

        const slotRows = SLOTS.map((slot, i) => {
          const lead =
            i === 0
              ? `<td rowspan="${span}" class="ov-day">
                   <a href="day.html?day=${o.day}"><strong>Day ${o.day}</strong></a><br>
                   <span class="ov-date">${TravelSite.formatDate(o.date, {
                     day: "2-digit",
                     month: "short",
                     year: "numeric",
                   })}<br>${escapeHtml(o.weekday || "")}</span>
                 </td>
                 <td rowspan="${span}" class="ov-stay">${stayingIn}</td>`
              : "";
          return `<tr class="${slot.cls}${i === 0 ? " ov-day-start" : ""}">
            ${lead}
            <td class="ov-slot">${slot.label}</td>
            <td class="ov-activity">${multiline(o[slot.key])}</td>
            <td class="ov-remarks">${multiline(slotRemarks[slot.key])}</td>
          </tr>`;
        }).join("");

        const noteRow = dayNote
          ? `<tr class="ov-note-row">
               <td colspan="3"><span class="ov-note-label">All day</span> ${multiline(o.remarks)}</td>
             </tr>`
          : "";

        return slotRows + noteRow;
      })
      .join("");

    return `
      <h1>High-level itinerary</h1>
      <p class="subtitle">The whole trip at a glance — click a day for the detailed plan.</p>
      <div class="table-wrap">
        <table class="overview-table">
          <thead><tr>
            <th>Day</th><th>Staying in</th>
            <th colspan="2">Activity</th>
            <th>Remarks</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  /** The panel for one day: heading, pager, plan and costs. */
  function dayPanel(trip, day) {
    const idx = trip.days.indexOf(day);
    const prev = trip.days[idx - 1];
    const next = trip.days[idx + 1];
    const { totals, sum } = dayCosts(day);
    const labels = costLabels(trip);

    // The first and last days simply have no previous or next — an empty slot keeps
    // "All days" centred without leaving a dead button behind.
    const pager = `
      <div class="day-pager">
        <div class="pager-slot">${
          prev ? `<a href="day.html?day=${prev.day}" data-day="${prev.day}">← Day ${prev.day}</a>` : ""
        }</div>
        <a href="overview.html">All days</a>
        <div class="pager-slot end">${
          next ? `<a href="day.html?day=${next.day}" data-day="${next.day}">Day ${next.day} →</a>` : ""
        }</div>
      </div>`;

    const planRows = has(day.items)
      ? day.items
          .map(
            (it, i) => `
        <tr>
          <td class="plan-time">${escapeHtml(it.time || "")}</td>
          <td class="plan-activity">
            <div class="timeline-activity">${activityHtml(
              it.activity,
              trip,
              day,
              it.time,
              day.items.slice(0, i).map((p) => p.activity).reverse()
            )}</div>
            ${it.remarks ? `<div class="timeline-meta">${multiline(it.remarks)}</div>` : ""}
            ${travelChip(it.travel, trip)}
            ${
              Object.keys(it.costs || {}).length
                ? `<div class="cost-tags">${Object.entries(it.costs)
                    .map(
                      ([k, v]) =>
                        `<span class="cost-tag">${escapeHtml(labels[k] || k)}: ${local(v, trip)}</span>`
                    )
                    .join("")}</div>`
                : ""
            }
          </td>
        </tr>`
          )
          .join("")
      : "";

    const costRows = Object.entries(totals)
      .map(([k, v]) => `<tr><td>${escapeHtml(labels[k] || k)}</td>${moneyCells(v, trip)}</tr>`)
      .join("");

    // One row per place the day passes through. A planner only ever has a forecast,
    // so there is a single set of figures rather than a comparison. Rainfall totals
    // are left out — "Light rain" or "Rain" is what a plan turns on. Any forecast
    // pulled by the Refresh button (held in localStorage) is overlaid here.
    const cache = readWeatherCache(trip);
    const entries = (day.temperature || []).map((t) => withFreshWeather(trip, t, day.date, cache));
    const anyDetail = entries.some((t) => t.condition || t.wind || t.sunrise);
    const anyHistorical = entries.some((t) => t.basis === "historical");
    const canRefresh = Object.keys(trip.weatherPlaces || {}).length > 0;

    const weatherRows = entries
      .map((t) => {
        // A forecast this far out doesn't exist yet, so the same date a year ago
        // stands in — flagged, never passed off as a forecast.
        const lastYear =
          t.basis === "historical"
            ? `<span class="weather-note weather-lastyear">last year${
                t.basisDate
                  ? ` · ${TravelSite.formatDate(t.basisDate, { day: "2-digit", month: "short", year: "numeric" })}`
                  : ""
              }</span>`
            : "";
        const range =
          t.min === null || t.min === undefined || t.max === null || t.max === undefined
            ? `<span class="weather-note">${escapeHtml(t.note || "—")}</span>`
            : `${t.min} to ${t.max} °C${
                t.feelsMin !== undefined && t.feelsMin !== null
                  ? `<span class="weather-note">feels ${t.feelsMin} to ${t.feelsMax}</span>`
                  : ""
              }${lastYear}`;
        const purl = t.location ? forecastPageLink(trip, t.location) : null;
        const place = !t.location
          ? "—"
          : purl
          ? `<a href="${purl}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.location)}</a>`
          : escapeHtml(t.location);
        return `<tr${t.basis === "historical" ? ' class="is-historical"' : ""}>
          <td>${place}</td>
          <td>${range}</td>
          ${
            anyDetail
              ? `<td>${t.condition ? escapeHtml(t.condition) : "—"}</td>
                 <td class="num">${t.wind ? `${t.wind} km/h` : "—"}</td>
                 <td class="weather-note">${
                   t.sunrise ? `${escapeHtml(t.sunrise)}–${escapeHtml(t.sunset)}` : "—"
                 }</td>`
              : ""
          }
        </tr>`;
      })
      .join("");

    // The later of the baked-in fetch date and any browser Refresh — string
    // compare works on ISO dates.
    const updatedIso = [cache.fetchedAt && cache.fetchedAt.slice(0, 10), trip.weatherUpdated]
      .filter(Boolean)
      .sort()
      .pop();
    const updatedAt = updatedIso
      ? ` (updated ${TravelSite.formatDate(updatedIso, { day: "2-digit", month: "short" })})`
      : "";

    const weather = has(day.temperature)
      ? `<div class="weather-head">
           <h2>Weather</h2>
           ${
             canRefresh
               ? `<button type="button" class="weather-refresh" data-weather-refresh>↻ Refresh</button>`
               : ""
           }
         </div>
         <div class="table-wrap">
           <table class="weather-table">
             <thead><tr>
               <th>Place</th><th>Temperature</th>
               ${anyDetail ? `<th>Conditions</th><th class="num">Wind</th><th>Daylight</th>` : ""}
             </tr></thead>
             <tbody>${weatherRows}</tbody>
           </table>
         </div>
         <p class="section-note">Forecast data from
           <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">Open-Meteo</a>${updatedAt}.
           Each place name opens its local forecast.${
             anyHistorical
               ? " Rows marked <em>last year</em> show that date a year ago, standing in until the forecast is available (~16 days out) — Refresh nearer the trip."
               : ""
           }</p>`
      : "";

    return `
      <h1>Day ${day.day}${day.city ? " · " + escapeHtml(cityName(day.city)) : ""}</h1>
      <p class="subtitle">${TravelSite.formatDate(day.date)}</p>
      ${day.summary ? `<p class="section-note">${multiline(day.summary)}</p>` : ""}

      ${pager}

      <h2>Plan</h2>
      ${
        planRows
          ? `<div class="table-wrap">
               <table class="plan-table">
                 <thead><tr><th>Time</th><th>Activity</th></tr></thead>
                 <tbody>${planRows}</tbody>
               </table>
             </div>`
          : placeholder("activities")
      }

      ${weather}

      ${
        sum > 0
          ? `<h2>Estimated cost for the day</h2>
             <div class="table-wrap">
               <table>
                 <thead><tr><th>Category</th>${moneyHeaders(trip)}</tr></thead>
                 <tbody>${costRows}</tbody>
                 <tfoot><tr><td>Total</td>${moneyCells(sum, trip)}</tr></tfoot>
               </table>
             </div>`
          : ""
      }`;
  }

  /** The day list that sits alongside the plan. */
  function dayList(trip, current) {
    return `
      <nav class="day-picker" aria-label="Jump to a day">
        ${trip.days
          .map(
            (d) =>
              `<a href="day.html?day=${d.day}" data-day="${d.day}" class="${
                d.day === current.day ? "current" : ""
              }"${d.day === current.day ? ' aria-current="page"' : ""} title="${escapeHtml(
                cityName(d.city)
              )}">
                <span class="day-picker-n">Day ${d.day} (${TravelSite.formatDate(d.date, {
                weekday: "short",
              })})</span>
                <span class="day-picker-date">${TravelSite.formatDate(d.date, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}</span>
              </a>`
          )
          .join("")}
      </nav>`;
  }

  function dayFromUrl(trip) {
    const requested = parseInt(new URLSearchParams(location.search).get("day"), 10);
    return trip.days.find((d) => d.day === requested) || trip.days[0];
  }

  /**
   * Swap the panel without reloading, so flipping through days keeps the list in
   * place. Links keep their href, so opening one in a new tab still works and the
   * page is usable if this script never runs.
   */
  function showDay(trip, day, push) {
    const panel = document.getElementById("day-panel");
    if (!panel) return;
    panel.innerHTML = dayPanel(trip, day);
    document.title = `Day ${day.day} — ${trip.title}`;
    document
      .querySelectorAll(".day-picker a")
      .forEach((a) => {
        const on = Number(a.dataset.day) === day.day;
        a.classList.toggle("current", on);
        if (on) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
    if (push) history.pushState({ day: day.day }, "", `day.html?day=${day.day}`);
    revealCurrentDay();
  }

  /** Keep the selected day visible in a long list without moving the page. */
  function revealCurrentDay() {
    const side = document.querySelector(".day-side");
    const current = document.querySelector(".day-picker a.current");
    if (!side || !current) return;
    // Only the list scrolls; on mobile it scrolls sideways instead.
    const vertical = side.scrollHeight > side.clientHeight;
    if (vertical) {
      const target = current.offsetTop - side.clientHeight / 2 + current.offsetHeight / 2;
      side.scrollTop = Math.max(0, target);
    } else if (side.scrollWidth > side.clientWidth) {
      side.scrollLeft = Math.max(0, current.offsetLeft - side.clientWidth / 2);
    }
  }

  function renderDay(trip) {
    if (!has(trip.days)) return `<h1>Day-by-day</h1>${placeholder("days")}`;

    const day = dayFromUrl(trip);
    document.title = `Day ${day.day} — ${trip.title}`;

    // Wired up after the markup lands in the document.
    setTimeout(() => {
      const main = document.getElementById("main");
      if (!main || main.dataset.dayNav) return;
      main.dataset.dayNav = "1";

      main.addEventListener("click", (e) => {
        const link = e.target.closest("a[data-day]");
        if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
          const target = trip.days.find((d) => d.day === Number(link.dataset.day));
          if (!target) return;
          e.preventDefault();
          showDay(trip, target, true);
          document.getElementById("day-panel").scrollIntoView({ block: "start" });
          return;
        }

        const refresh = e.target.closest("[data-weather-refresh]");
        if (refresh) {
          e.preventDefault();
          if (refresh.disabled) return;
          refresh.disabled = true;
          refresh.textContent = "Refreshing…";
          refreshWeather(trip)
            .then(({ updated }) => {
              showDay(trip, dayFromUrl(trip), false);
              const btn = document.querySelector("[data-weather-refresh]");
              if (btn && !updated) {
                btn.textContent = "No forecast yet";
                setTimeout(() => (btn.textContent = "↻ Refresh"), 2500);
              }
            })
            .catch(() => {
              const btn = document.querySelector("[data-weather-refresh]");
              if (btn) {
                btn.disabled = false;
                btn.textContent = "Couldn't refresh — retry";
              }
            });
        }
      });

      window.addEventListener("popstate", () => showDay(trip, dayFromUrl(trip), false));
      revealCurrentDay();
    }, 0);

    return `
      <div class="day-layout">
        <aside class="day-side">${dayList(trip, day)}</aside>
        <div class="day-panel" id="day-panel">${dayPanel(trip, day)}</div>
      </div>`;
  }

  /**
   * The whole trip's weather in one table — one row per place, aggregated across
   * every day it's visited, for packing and planning. The per-day breakdown lives
   * on the Days page; this is the overview. Each place links to a monthly outlook
   * for the month it falls in.
   */
  function weatherHtml(trip) {
    const cache = readWeatherCache(trip);

    // Gather every temperature entry by place, keeping the order places first appear.
    const order = [];
    const byPlace = new Map();
    (trip.days || []).forEach((day) => {
      (day.temperature || []).forEach((t0) => {
        if (!t0.location) return;
        const t = withFreshWeather(trip, t0, day.date, cache);
        let rec = byPlace.get(t.location);
        if (!rec) {
          rec = { location: t.location, dates: [], mins: [], maxs: [], conditions: [], note: null, historical: false };
          byPlace.set(t.location, rec);
          order.push(t.location);
        }
        rec.dates.push(day.date);
        if (t.min != null && t.max != null) {
          rec.mins.push(t.min);
          rec.maxs.push(t.max);
        } else if (t.note && !rec.note) {
          rec.note = t.note;
        }
        if (t.condition && !rec.conditions.includes(t.condition)) rec.conditions.push(t.condition);
        if (t.basis === "historical") rec.historical = true;
      });
    });

    if (!order.length) return `<h1>Weather</h1>${placeholder("weather")}`;

    const short = (iso) => TravelSite.formatDate(iso, { day: "2-digit", month: "short" });
    // "13 Oct, 28–29 Oct" — group only the consecutive dates, so a place visited at
    // the start and end of a trip doesn't read as one long stay.
    const compactDates = (isoList) => {
      const uniq = [...new Set(isoList)].sort();
      const runs = [];
      uniq.forEach((iso) => {
        const last = runs[runs.length - 1];
        const prevDay = last && new Date(last[1] + "T00:00:00");
        if (prevDay && new Date(iso + "T00:00:00") - prevDay === 86400000) last[1] = iso;
        else runs.push([iso, iso]);
      });
      return runs
        .map(([a, b]) =>
          a === b
            ? short(a)
            : `${TravelSite.formatDate(a, { day: "2-digit" })}–${short(b)}`
        )
        .join(", ");
    };
    const anyHistorical = order.some((p) => byPlace.get(p).historical);
    const canRefresh = Object.keys(trip.weatherPlaces || {}).length > 0;

    const rows = order
      .map((name) => {
        const r = byPlace.get(name);
        const dates = [...r.dates].sort();
        const when = compactDates(dates);
        const temp = r.mins.length
          ? `${Math.min(...r.mins)} to ${Math.max(...r.maxs)} °C${
              r.historical ? '<span class="weather-note weather-lastyear">last year</span>' : ""
            }`
          : `<span class="weather-note">${escapeHtml(r.note || "—")}</span>`;
        const url = forecastPageLink(trip, name);
        const link = url
          ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>`
          : escapeHtml(name);
        return `<tr${r.historical ? ' class="is-historical"' : ""}>
          <td>${link}</td>
          <td class="weather-note">${when}</td>
          <td>${temp}</td>
          <td>${r.conditions.length ? escapeHtml(r.conditions.join(", ")) : "—"}</td>
        </tr>`;
      })
      .join("");

    const updatedIso = [cache.fetchedAt && cache.fetchedAt.slice(0, 10), trip.weatherUpdated]
      .filter(Boolean)
      .sort()
      .pop();
    const updatedAt = updatedIso
      ? ` (updated ${TravelSite.formatDate(updatedIso, { day: "2-digit", month: "short" })})`
      : "";

    return `
      <div class="weather-head">
        <h1>Weather</h1>
        ${canRefresh ? `<button type="button" class="weather-refresh" data-weather-refresh>↻ Refresh</button>` : ""}
      </div>
      <p class="subtitle">Every place on the trip, for packing and planning — the day-by-day is on the
        <a href="day.html?day=1">Days page</a>.</p>
      <div class="table-wrap">
        <table class="weather-table weather-trip">
          <thead><tr><th>Place</th><th>When</th><th>Temperature</th><th>Conditions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="section-note">Forecast data from
        <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">Open-Meteo</a>${updatedAt}.
        Each place name opens its local forecast — tenki.jp in Japan, yr.no elsewhere.${
          anyHistorical
            ? " Ranges marked <em>last year</em> use the same dates a year ago until the forecast is in range (~16 days out)."
            : ""
        }</p>`;
  }

  function renderWeather(trip) {
    // The Refresh button re-fetches into localStorage, then re-renders this page.
    setTimeout(() => {
      const main = document.getElementById("main");
      if (!main || main.dataset.wxWired) return;
      main.dataset.wxWired = "1";
      main.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-weather-refresh]");
        if (!btn || btn.disabled) return;
        e.preventDefault();
        btn.disabled = true;
        btn.textContent = "Refreshing…";
        refreshWeather(trip)
          .then(() => {
            main.innerHTML = weatherHtml(trip);
          })
          .catch(() => {
            const b = document.querySelector("[data-weather-refresh]");
            if (b) {
              b.disabled = false;
              b.textContent = "Couldn't refresh — retry";
            }
          });
      });
    }, 0);
    return weatherHtml(trip);
  }

  function renderBudget(trip) {
    const categories = (trip.budget && trip.budget.categories) || [];
    const fx = trip.exchangeRate || {};

    let head = `<h1>Budget${has(trip.settle) ? " &amp; settle-up" : ""}</h1>`;
    if (trip.summary && trip.summary.note) head += `<p class="subtitle">${escapeHtml(trip.summary.note)}</p>`;
    if (!categories.length && !has(trip.settle)) return head + placeholder("budget");

    let out = head;

    if (categories.length) {
      const { rows, totalBudget, totalActual } = TravelSite.computeBudgetSummary(categories);
      const days = (trip.days || []).length || (trip.summary && trip.summary.totalDays) || 0;

      out += `
        <div class="fact-grid">
          <div class="fact"><div class="label">Budgeted</div><div class="value">${home(totalBudget, trip)}</div></div>
          <div class="fact"><div class="label">Actual</div><div class="value">${
            totalActual ? home(totalActual, trip) : "—"
          }</div></div>
          <div class="fact"><div class="label">Difference</div><div class="value">${
            totalActual ? home(totalBudget - totalActual, trip) : "—"
          }</div></div>
          ${
            days
              ? `<div class="fact"><div class="label">Avg / day</div><div class="value">${home(
                  (totalActual || totalBudget) / days,
                  trip
                )}</div></div>`
              : ""
          }
        </div>

        <h2>Budget vs actual by category</h2>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Category</th><th class="num">Per day</th>
              <th class="num">Budget</th><th class="num">% of budget</th>
              <th class="num">Actual</th><th class="num">% of actual</th><th class="num">Difference</th>
            </tr></thead>
            <tbody>${rows
              .map(
                (c) => `<tr>
                  <td>${escapeHtml(c.category)}</td>
                  <td class="num">${c.perDay ? home(c.perDay, trip) : "—"}</td>
                  <td class="num">${home(c.budget, trip)}</td>
                  <td class="num">${TravelSite.formatPercent(c.pctOfBudget)}</td>
                  <td class="num">${c.actual === null || c.actual === undefined ? "—" : home(c.actual, trip)}</td>
                  <td class="num">${
                    c.actual === null || c.actual === undefined ? "—" : TravelSite.formatPercent(c.pctOfActual)
                  }</td>
                  <td class="num">${c.actual === null || c.actual === undefined ? "—" : home(c.diff, trip)}</td>
                </tr>`
              )
              .join("")}</tbody>
            <tfoot><tr>
              <td>Total</td><td class="num"></td>
              <td class="num">${home(totalBudget, trip)}</td><td class="num">100.0%</td>
              <td class="num">${totalActual ? home(totalActual, trip) : "—"}</td>
              <td class="num">${totalActual ? "100.0%" : "—"}</td>
              <td class="num">${totalActual ? home(totalBudget - totalActual, trip) : "—"}</td>
            </tr></tfoot>
          </table>
        </div>
        <p class="section-note">Categories showing “—” for actual have not been tallied.</p>`;
    }

    if (has(trip.settle) && has(trip.travelers)) {
      out += `
        <h2>Settle-up between travellers</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th></th>${trip.travelers
              .map((t) => `<th class="num">${escapeHtml(t)}</th>`)
              .join("")}<th>Remarks</th></tr></thead>
            <tbody>${trip.settle
              .map(
                (r) => `<tr>
                  <td>${escapeHtml(r.label)}</td>
                  ${trip.travelers
                    .map(
                      (t) =>
                        `<td class="num">${
                          r.amounts[t] === null || r.amounts[t] === undefined ? "—" : home(r.amounts[t], trip)
                        }</td>`
                    )
                    .join("")}
                  <td style="color:var(--text-dim);font-size:.85rem">${multiline(r.remarks)}</td>
                </tr>`
              )
              .join("")}</tbody>
          </table>
        </div>`;
    }

    // Planned spend rolled up from the day-by-day plan.
    const dayRows = (trip.days || [])
      .map((d) => ({ day: d.day, city: d.city, amount: dayCosts(d).sum }))
      .filter((d) => d.amount > 0);

    if (dayRows.length) {
      const planned = dayRows.reduce((s, d) => s + d.amount, 0);
      out += `
        <h2>Planned spend from the itinerary</h2>
        <p class="section-note">Rolled up from every costed activity in the day-by-day plan — group total, before splitting.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Day</th><th>Where</th>${moneyHeaders(trip)}</tr></thead>
            <tbody>${dayRows
              .map(
                (d) => `<tr>
                  <td><a href="day.html?day=${d.day}">Day ${d.day}</a></td>
                  <td>${escapeHtml(cityName(d.city))}</td>
                  ${moneyCells(d.amount, trip)}</tr>`
              )
              .join("")}</tbody>
            <tfoot><tr><td colspan="2">Total planned</td>${moneyCells(planned, trip)}</tr></tfoot>
          </table>
        </div>`;
    }

    if (has(fx.history)) {
      out += `
        <h2>Exchange rate history</h2>
        <p class="section-note">Effective rate for this trip:
          <strong>${fx.rate} ${escapeHtml(trip.homeCurrency)} per ${fx.per || 1} ${escapeHtml(trip.tripCurrency)}</strong>.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date exchanged</th>
              <th class="num">${escapeHtml(trip.homeCurrency)}</th>
              <th class="num">${escapeHtml(trip.tripCurrency)}</th>
              <th class="num">Rate</th></tr></thead>
            <tbody>${fx.history
              .map(
                (f) => `<tr>
                  <td>${TravelSite.formatDate(f.date, { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td class="num">${home(f.home, trip)}</td>
                  <td class="num">${local(f.local, trip)}</td>
                  <td class="num">${f.rate}</td></tr>`
              )
              .join("")}</tbody>
          </table>
        </div>`;
    }

    return out;
  }

  // Each stay's own key for attached files — name + check-in, so two stays at the
  // same property on different dates keep separate folders.
  function stayAttachKey(a) {
    return attachSlug(`${a.name || a.city || "stay"}-${a.checkIn || ""}`);
  }

  // A flight's own key for notes and attached files — flight number + date, so a
  // return leg or a repeated route stays separate.
  function flightAttachKey(f) {
    return attachSlug(`flight-${f.flightNo || f.airline || "leg"}-${f.date || ""}-${f.from || ""}`);
  }

  // A stay's or flight's remark, editable in place. Like the to-do list it lives in
  // Firestore (stayNotes/<slug> = { byKey: { <key>: "text" } }, the doc name kept
  // from when only stays had notes), seeded from data.json's `remarks`, shared live
  // across the signed-in group and private to the allow-list — a booking note often
  // carries payment or arrival detail, so it is treated like the rest of the private
  // layer rather than left on the public page. Stay and flight keys can't collide,
  // so one flat map serves both.
  const stayNotesState = {
    trip: null,
    doc: null,
    signedIn: false,
    seeded: false,
    unsub: null,
    rerender: null,
  };
  function stayNotesPath(trip) {
    return "stayNotes/" + (trip.slug || trip.title || "trip");
  }
  function stayNotesSeed(trip) {
    const byKey = {};
    (trip.accommodation || []).forEach((a) => {
      if (a.remarks) byKey[stayAttachKey(a)] = a.remarks;
    });
    (trip.flights || []).forEach((f) => {
      if (f.remarks) byKey[flightAttachKey(f)] = f.remarks;
    });
    return byKey;
  }
  function stayNotesMap() {
    const d = stayNotesState.doc;
    if (d && d.byKey) return d.byKey;
    return stayNotesSeed(stayNotesState.trip);
  }
  function writeStayNotes(byKey) {
    stayNotesState.doc = { byKey: byKey }; // optimistic
    TravelSite.writeDoc(stayNotesPath(stayNotesState.trip), { byKey: byKey }).catch((e) =>
      console.warn("Couldn't save the stay note:", e)
    );
  }
  function maybeSeedStayNotes() {
    if (stayNotesState.signedIn && !stayNotesState.seeded && stayNotesState.doc === null) {
      stayNotesState.seeded = true;
      writeStayNotes(stayNotesSeed(stayNotesState.trip));
    }
  }
  // Renders nothing when signed out, so the public page is unchanged.
  function stayNoteHtml(key) {
    if (!stayNotesState.signedIn) return "";
    const text = stayNotesMap()[key];
    return `<div class="stay-note" data-stay-key="${escapeHtml(key)}">
      <div class="stay-note-text">${
        text ? multiline(text) : `<span class="attach-empty">No remarks yet.</span>`
      }</div>
      <button type="button" class="todo-edit-btn" data-stay-note-edit>Edit</button>
    </div>`;
  }
  function wireStayNotes(main) {
    main.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-stay-note-edit]");
      const saveBtn = e.target.closest("[data-stay-note-save]");
      const cancelBtn = e.target.closest("[data-stay-note-cancel]");
      if (!editBtn && !saveBtn && !cancelBtn) return;
      if (!stayNotesState.signedIn) return;
      const box = (editBtn || saveBtn || cancelBtn).closest(".stay-note");
      const key = box.dataset.stayKey;

      if (editBtn) {
        const cur = stayNotesMap()[key] || "";
        box.innerHTML = `<textarea class="todo-remarks-input" rows="3">${escapeHtml(cur)}</textarea>
          <div class="todo-edit-actions">
            <button type="button" class="todo-edit-btn" data-stay-note-save>Save</button>
            <button type="button" class="todo-edit-btn todo-edit-cancel" data-stay-note-cancel>Cancel</button>
          </div>`;
        const ta = box.querySelector("textarea");
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        return;
      }
      if (saveBtn) {
        const val = box.querySelector("textarea").value.trim();
        const byKey = { ...stayNotesMap() };
        if (val) byKey[key] = val;
        else delete byKey[key];
        writeStayNotes(byKey);
      }
      if (stayNotesState.rerender) stayNotesState.rerender();
    });
  }
  function setupStayNotes(trip, rerender) {
    stayNotesState.trip = trip;
    stayNotesState.doc = null;
    stayNotesState.seeded = false;
    stayNotesState.rerender = rerender;
    stayNotesState.signedIn = !!TravelSite.currentUser();
    TravelSite.onAuthChange((user) => {
      if (stayNotesState.unsub) {
        stayNotesState.unsub();
        stayNotesState.unsub = null;
      }
      stayNotesState.signedIn = !!user;
      stayNotesState.doc = null;
      if (user) {
        stayNotesState.unsub = TravelSite.watchDoc(
          stayNotesPath(trip),
          (data) => {
            stayNotesState.doc = data;
            maybeSeedStayNotes();
            if (rerender) rerender();
          },
          () => {
            stayNotesState.doc = null;
            if (rerender) rerender();
          }
        );
      }
      if (rerender) rerender();
    });
  }

  function accommodationHtml(trip) {
    const stays = trip.accommodation || [];
    if (!stays.length) return `<h1>Accommodation</h1>${placeholder("stays")}`;

    const total = stays.reduce((s, a) => s + (a.total || 0), 0);
    const nights = stays.reduce((s, a) => s + (a.nights || 0), 0);
    const short = (iso) => TravelSite.formatDate(iso, { day: "2-digit", month: "short", year: "numeric" });
    const splitTravellers = has(trip.travelers) && stays.some((a) => a.perPerson);

    const dash = (v) => (v == null || v === "" ? "—" : escapeHtml(v));

    // "From 15:00 until 19:00" — "until" matches the check-out wording.
    const checkInValue = (a) => {
      if (!a.checkInFrom) return "—";
      return `From ${a.checkInFrom}${a.checkInTo ? ` until ${a.checkInTo}` : ""}`;
    };

    const paidValue = (a) => {
      if (a.prepaid == null) return "—";
      const cancel = a.cancellation ? escapeHtml(a.cancellation) : null;
      if (a.prepaid) return `Yes${cancel ? ` (${cancel})` : ""}`;
      const bits = [];
      if (a.payAtProperty) bits.push(`Pay ${escapeHtml(a.payAtProperty)} at the property`);
      if (cancel) bits.push(cancel);
      return `No${bits.length ? ` (${bits.join(". ")})` : ""}`;
    };

    /**
     * A booking often carries more than one number — the platform's own booking ID
     * plus whatever reference it was placed under with the supplier or the property.
     * Both matter at the desk, so show every one rather than picking a favourite.
     */
    const reservationValue = (r) => {
      if (!r || !r.site) return "—";
      const numbers = [];
      if (r.bookingNo) numbers.push(`Booking No: ${escapeHtml(r.bookingNo)}`);
      (r.refs || []).forEach((x) => {
        if (x && x.value) numbers.push(`${escapeHtml(x.label || "Ref")}: ${escapeHtml(x.value)}`);
      });
      return `${escapeHtml(r.site)}${
        numbers.length ? ` <span class="stay-refs">(${numbers.join(" · ")})</span>` : ""
      }`;
    };

    // Hotel name links to Maps — search the address when we have one, since a
    // property name alone can be ambiguous.
    const hotelValue = (a) => {
      if (!a.name) return "—";
      const query = a.address ? `${a.name}, ${a.address}` : a.name;
      return `<a href="${mapsSearch(query)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        a.name
      )}</a>`;
    };

    const roomValue = (a) => {
      const count = [];
      if (a.rooms) count.push(`${a.rooms} room${a.rooms > 1 ? "s" : ""}`);
      if (a.persons) count.push(`${a.persons} pax`);
      const label = [a.roomType, count.join(" · ")].filter(Boolean).join(" · ");
      return label || "—";
    };

    const detailRows = (a) => [
      ["Hotel", hotelValue(a)],
      ["Address", a.address ? dash(a.address) : "—"],
      ["Reservation", reservationValue(a.reservation)],
      ["Room Type", roomValue(a)],
      ["Check-In", checkInValue(a)],
      ["Check-Out", a.checkOutUntil ? `Until ${escapeHtml(a.checkOutUntil)}` : "—"],
      ["Laundry", dash(a.laundry)],
      ["Meal", dash(a.meal || "N/A")],
      // Rate and conditions belong beside "Paid"/"Free", not buried in the notes.
      [
        "Parking",
        a.parking
          ? `${escapeHtml(a.parking)}${a.parkingNote ? ` (${escapeHtml(a.parkingNote)})` : ""}`
          : "—",
      ],
      ["Paid", paidValue(a)],
    ];

    let out = `
      <h1>Accommodation</h1>
      <p class="subtitle">${stays.length} stays · ${nights} nights · ${home(total, trip)} total</p>

      <div class="table-wrap">
        <table class="stay-table">
          <tbody>${stays
            .map(
              (a) => `<tr>
                <td class="stay-summary">
                  <div class="stay-place">${escapeHtml(a.city || "")}</div>
                  <div class="stay-dates">${short(a.checkIn)} – ${short(a.checkOut)}, ${a.nights} night${
                a.nights > 1 ? "s" : ""
              }</div>
                  <div class="stay-price">${home(a.total, trip)}${
                a.pricePerNight != null && a.nights > 1
                  ? ` <span class="stay-rate">(${home(a.pricePerNight, trip)} / night)</span>`
                  : ""
              }</div>
                </td>
                <td class="stay-detail">
                  <dl>${detailRows(a)
                    .map(([k, v]) => `<dt>${k}:</dt><dd>${v}</dd>`)
                    .join("")}</dl>
                  ${stayNoteHtml(stayAttachKey(a))}
                  ${attachmentsHtml("accommodation", stayAttachKey(a), "Booking files")}
                </td>
              </tr>`
            )
            .join("")}</tbody>
        </table>
      </div>`;

    if (splitTravellers) {
      const totals = trip.travelers.map((t) =>
        stays.reduce((s, a) => s + ((a.perPerson && a.perPerson[t]) || 0), 0)
      );
      out += `
        <h2>Split per traveller</h2>
        <p class="section-note">N/A — paid directly at the property, or cost not shared.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Stay</th><th class="num">Price</th>${trip.travelers
              .map((t) => `<th class="num">${escapeHtml(t)}</th>`)
              .join("")}</tr></thead>
            <tbody>${stays
              .map(
                (a) => `<tr>
                  <td>${escapeHtml(a.city || a.name || "")}</td>
                  <td class="num">${a.total != null ? home(a.total, trip) : "N/A"}</td>
                  ${trip.travelers
                    .map(
                      (t) =>
                        `<td class="num">${
                          a.perPerson && a.perPerson[t] != null ? home(a.perPerson[t], trip) : "N/A"
                        }</td>`
                    )
                    .join("")}</tr>`
              )
              .join("")}</tbody>
            <tfoot><tr><td>Total</td>
              <td class="num">${home(total, trip)}</td>
              ${totals.map((v) => `<td class="num">${home(v, trip)}</td>`).join("")}
            </tr></tfoot>
          </table>
        </div>`;
    }

    return out;
  }

  function renderAccommodation(trip) {
    const redraw = () => {
      const main = document.getElementById("main");
      if (main) main.innerHTML = accommodationHtml(trip);
    };
    // Register one attach group per stay, and the editable notes; both redraw the
    // page as sign-in state, the note doc and the file lists arrive.
    setupAttachments(
      trip,
      (trip.accommodation || []).map((a) => ({ kind: "accommodation", key: stayAttachKey(a) })),
      redraw
    );
    setupStayNotes(trip, redraw);
    setTimeout(() => {
      const main = document.getElementById("main");
      if (main && !main.dataset.stayNotesWired) {
        main.dataset.stayNotesWired = "1";
        wireStayNotes(main);
      }
    }, 0);
    return accommodationHtml(trip);
  }

  function renderTransport(trip) {
    const t = trip.transport;
    if (!t) return `<h1>Transport</h1>${placeholder("transport details")}`;

    const legs = t.legs || [];
    const facts = [
      t.totalKm ? { label: "Total distance", value: `${t.totalKm.toLocaleString()} km` } : null,
      legs.length ? { label: "Travel days", value: legs.length } : null,
      legs.length ? { label: "Refuel stops", value: legs.filter((l) => l.refuel).length } : null,
      t.rentalTotal ? { label: "Rental total", value: home(t.rentalTotal, trip) } : null,
    ].filter(Boolean);

    return `
      <h1>Transport</h1>
      ${t.mode ? `<p class="subtitle">${escapeHtml(t.mode)}</p>` : ""}

      ${
        facts.length
          ? `<div class="fact-grid">${facts
              .map(
                (f) => `<div class="fact"><div class="label">${f.label}</div><div class="value">${f.value}</div></div>`
              )
              .join("")}</div>`
          : ""
      }

      <h2>Travel log</h2>
      ${
        legs.length
          ? `<div class="table-wrap">
              <table>
                <thead><tr><th>Day</th><th>Route</th><th class="num">Distance</th><th></th><th></th></tr></thead>
                <tbody>${legs
                  .map((l) => {
                    const ends = splitRoute(l.route);
                    const url = ends
                      ? mapsDirections(ends.from, ends.to, (t && t.defaultMode) || "driving")
                      : mapsSearch(l.route || "");
                    return `<tr>
                      <td><a href="day.html?day=${l.day}">Day ${l.day}</a><br>
                        <span style="color:var(--text-dim);font-size:.82rem">${TravelSite.formatDate(l.date, {
                          day: "2-digit",
                          month: "short",
                        })}</span></td>
                      <td>${escapeHtml(l.route || "")}</td>
                      <td class="num">${l.km ? l.km.toLocaleString() + " km" : "—"}</td>
                      <td>${l.refuel ? "⛽ Refuel" : ""}</td>
                      <td><a href="${url}" target="_blank" rel="noopener noreferrer" class="travel-link">Map ↗</a></td>
                    </tr>`;
                  })
                  .join("")}</tbody>
                ${
                  t.totalKm
                    ? `<tfoot><tr><td colspan="2">Total</td><td class="num">${t.totalKm.toLocaleString()} km</td><td></td><td></td></tr></tfoot>`
                    : ""
                }
              </table>
            </div>
            <p class="section-note">Fuel, parking and tolls are split between travellers on the
              <a href="budget.html">budget page</a>.</p>`
          : placeholder("travel legs")
      }`;
  }

  // Categories and, within Booking, subcategories render in this fixed order;
  // anything not listed falls in after, in the order it first appears in the
  // data. Uncategorised items collect under "Other" at the very end, so a trip
  // that never sets a category still renders as a plain flat list.
  const TODO_CATEGORY_ORDER = ["Booking", "Travel preparation"];
  const TODO_SUBCATEGORY_ORDER = {
    Booking: ["Accommodation", "Transport", "Attractions", "Restaurant"],
  };

  // Stable ordering by a preferred list: listed keys first in their given
  // order, the rest after in first-seen order, with `last` (e.g. "Other")
  // always pinned to the end.
  function orderKeys(keys, preferred, last) {
    const rank = (k) => {
      if (k === last) return Number.MAX_SAFE_INTEGER;
      const i = preferred.indexOf(k);
      return i === -1 ? preferred.length : i;
    };
    return keys
      .map((k, i) => [k, i])
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
      .map((pair) => pair[0]);
  }

  // The whole to-do list lives in one Firestore document per trip
  // (todoList/<slug> = { items: [{id, task, category, subcategory, status, url,
  // remarks}] }), shared live across the signed-in group. data.json's `todo` is
  // the seed that initialises it on the first signed-in load. The list is private:
  // only the allow-list can read or write it (security rules), so a signed-out
  // visitor sees a sign-in prompt, not the list.
  const todoState = {
    trip: null,
    doc: null, // { items } from Firestore, or null before it loads / is seeded
    access: "none", // none (signed out) | ok (allow-listed) | denied (signed in, not listed)
    unsub: null,
    seeded: false,
    wired: false,
  };

  function todoItemKey(t) {
    return [t.category || "", t.subcategory || "", t.task || ""].join("|");
  }
  function todoDocPath(trip) {
    return "todoList/" + (trip.slug || trip.title || "trip");
  }
  function newTodoId() {
    return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // The seed derived from data.json — the initial items, remarks included.
  function todoSeed(trip) {
    return (trip.todo || []).map((t) => ({
      id: todoItemKey(t),
      task: t.task,
      category: t.category || "",
      subcategory: t.subcategory || "",
      status: t.status === "Done" ? "Done" : "Open",
      url: t.url || null,
      remarks: t.remarks || null,
    }));
  }
  // Current items to render: the Firestore list if present, else the seed.
  function todoItems() {
    const d = todoState.doc;
    if (d && Array.isArray(d.items)) return d.items;
    return todoSeed(todoState.trip);
  }
  function writeTodoItems(items) {
    todoState.doc = { items: items }; // optimistic
    TravelSite.writeDoc(todoDocPath(todoState.trip), { items: items }).catch((e) =>
      console.warn("Couldn't save the to-do list:", e)
    );
  }
  // First signed-in visit with no Firestore list yet: seed it from data.json.
  function maybeSeedTodo() {
    if (todoState.access === "ok" && !todoState.seeded && todoState.doc === null) {
      todoState.seeded = true;
      writeTodoItems(todoSeed(todoState.trip));
    }
  }

  const TODO_ADD_FORM = `
    <div class="todo-add">
      <button type="button" class="todo-edit-btn" data-todo-add-toggle>+ Add item</button>
      <form class="todo-add-form" data-todo-add-form hidden>
        <input type="text" class="todo-add-task" placeholder="Task" aria-label="Task" />
        <select class="todo-add-category" aria-label="Category">
          ${TODO_CATEGORY_ORDER.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
        </select>
        <select class="todo-add-subcategory" aria-label="Subcategory">
          ${TODO_SUBCATEGORY_ORDER.Booking.map(
            (s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`
          ).join("")}
        </select>
        <input type="text" class="todo-add-url" placeholder="Link (optional)" aria-label="Link" />
        <input type="text" class="todo-add-remarks" placeholder="Remarks (optional)" aria-label="Remarks" />
        <div class="todo-add-actions">
          <button type="button" class="todo-edit-btn" data-todo-add-save>Add</button>
          <button type="button" class="todo-edit-btn todo-edit-cancel" data-todo-add-cancel>Cancel</button>
        </div>
      </form>
    </div>`;

  function todoHtml(trip) {
    if (todoState.access !== "ok") {
      const msg =
        todoState.access === "denied"
          ? "Your Google account isn't on this trip's access list."
          : "This to-do list is private. Sign in (top right) to view and edit it — it's shared across your group.";
      return `<h1>Pre-trip to-do</h1><div class="empty-state">${msg}</div>`;
    }

    const items = todoItems();
    const done = items.filter((it) => it.status === "Done").length;
    const note = `<p class="todo-note">Shared list — changes save for everyone signed in.</p>`;

    if (!items.length) {
      return `
        <h1>Pre-trip to-do</h1>
        <p class="subtitle">Nothing on the list yet — add the first item below.</p>
        ${note}
        ${TODO_ADD_FORM}`;
    }

    const todoRow = (it) => {
      const isDone = it.status === "Done";
      return `<tr>
        <td class="todo-task-cell">${escapeHtml(it.task)}${
        it.url
          ? `<br><a href="${escapeHtml(
              it.url
            )}" target="_blank" rel="noopener noreferrer" style="font-size:.82rem">${escapeHtml(it.url)}</a>`
          : ""
      }</td>
        <td><select class="todo-status" data-todo-id="${escapeHtml(it.id)}" aria-label="Status">
          <option value="Open"${isDone ? "" : " selected"}>Open</option>
          <option value="Done"${isDone ? " selected" : ""}>Done</option>
        </select></td>
        <td class="todo-remarks-cell" data-todo-id="${escapeHtml(it.id)}">
          <div class="todo-remarks-text">${multiline(it.remarks)}</div>
          <button type="button" class="todo-edit-btn" data-todo-edit>Edit</button>
        </td>
        <td class="todo-actions"><button type="button" class="todo-remove-btn" data-todo-remove data-todo-id="${escapeHtml(
          it.id
        )}" title="Remove item">Remove</button></td>
      </tr>`;
    };

    let bodyRows;
    if (items.some((it) => it.category)) {
      // Grouped: category bands, and subcategory sub-bands within each.
      const cats = orderKeys(
        [...new Set(items.map((it) => it.category || "Other"))],
        TODO_CATEGORY_ORDER,
        "Other"
      );
      bodyRows = cats
        .map((cat) => {
          const group = items.filter((it) => (it.category || "Other") === cat);
          const catDone = group.filter((it) => it.status === "Done").length;
          const band = `<tr class="todo-cat-row"><td colspan="4"><span class="todo-cat-name">${escapeHtml(
            cat
          )}</span><span class="todo-cat-count">${catDone}/${group.length}</span></td></tr>`;
          // "" (no subcategory) sorts first, so those rows sit directly under
          // the category heading before any sub-band.
          const subs = orderKeys(
            [...new Set(group.map((it) => it.subcategory || ""))],
            ["", ...(TODO_SUBCATEGORY_ORDER[cat] || [])],
            null
          );
          const groups = subs
            .map((sub) => {
              const rows = group
                .filter((it) => (it.subcategory || "") === sub)
                .map(todoRow)
                .join("");
              const subBand = sub
                ? `<tr class="todo-subcat-row"><td colspan="4">${escapeHtml(sub)}</td></tr>`
                : "";
              return subBand + rows;
            })
            .join("");
          return band + groups;
        })
        .join("");
    } else {
      bodyRows = items.map(todoRow).join("");
    }

    return `
      <h1>Pre-trip to-do</h1>
      <p class="subtitle">${done} of ${items.length} done — bookings, reservations and paperwork before departure.</p>
      ${note}
      ${TODO_ADD_FORM}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Task</th><th>Status</th><th>Remarks</th><th></th></tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;
  }

  function renderTodoMain() {
    const main = document.getElementById("main");
    if (main) main.innerHTML = todoHtml(todoState.trip);
  }

  function wireTodoOnce() {
    const main = document.getElementById("main");
    if (!main || todoState.wired) return;
    todoState.wired = true;
    const editable = () => todoState.access === "ok";
    // A fresh shallow copy of the current items, safe to mutate before writing.
    const itemsCopy = () => todoItems().map((it) => ({ ...it }));

    main.addEventListener("change", (e) => {
      const sel = e.target.closest(".todo-status");
      if (sel) {
        if (!editable()) return;
        const items = itemsCopy();
        const it = items.find((x) => x.id === sel.dataset.todoId);
        if (it) {
          it.status = sel.value;
          writeTodoItems(items);
          renderTodoMain();
        }
        return;
      }
      const cat = e.target.closest(".todo-add-category");
      if (cat) {
        const sub = main.querySelector(".todo-add-subcategory");
        if (sub) sub.disabled = cat.value !== "Booking";
      }
    });

    main.addEventListener("click", (e) => {
      if (!editable()) return;
      const editBtn = e.target.closest("[data-todo-edit]");
      const saveBtn = e.target.closest("[data-todo-save]");
      const cancelBtn = e.target.closest("[data-todo-cancel]");
      const removeBtn = e.target.closest("[data-todo-remove]");
      const addToggle = e.target.closest("[data-todo-add-toggle]");
      const addSave = e.target.closest("[data-todo-add-save]");
      const addCancel = e.target.closest("[data-todo-add-cancel]");

      if (editBtn) {
        const cell = editBtn.closest(".todo-remarks-cell");
        const row = cell.closest("tr");
        const it = todoItems().find((x) => x.id === cell.dataset.todoId);
        const taskCell = row.querySelector(".todo-task-cell");
        if (taskCell) {
          taskCell.innerHTML = `<input type="text" class="todo-edit-task" value="${escapeHtml(
            (it && it.task) || ""
          )}" aria-label="Task" />
            <input type="text" class="todo-edit-url" value="${escapeHtml(
              (it && it.url) || ""
            )}" placeholder="Link (optional)" aria-label="Link" />`;
        }
        cell.innerHTML = `<textarea class="todo-remarks-input" rows="3">${escapeHtml(
          (it && it.remarks) || ""
        )}</textarea>
          <div class="todo-edit-actions">
            <button type="button" class="todo-edit-btn" data-todo-save>Save</button>
            <button type="button" class="todo-edit-btn todo-edit-cancel" data-todo-cancel>Cancel</button>
          </div>`;
        const ta = cell.querySelector("textarea");
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        return;
      }
      if (saveBtn) {
        const cell = saveBtn.closest(".todo-remarks-cell");
        const row = cell.closest("tr");
        const taskInput = row.querySelector(".todo-edit-task");
        const newTask = taskInput ? taskInput.value.trim() : null;
        if (taskInput && !newTask) {
          taskInput.focus(); // a task can't be left blank
          return;
        }
        const urlInput = row.querySelector(".todo-edit-url");
        const items = itemsCopy();
        const it = items.find((x) => x.id === cell.dataset.todoId);
        if (it) {
          if (taskInput) it.task = newTask;
          if (urlInput) it.url = urlInput.value.trim() || null;
          it.remarks = cell.querySelector("textarea").value.trim() || null;
          writeTodoItems(items);
        }
        renderTodoMain();
        return;
      }
      if (cancelBtn) {
        renderTodoMain();
        return;
      }
      if (removeBtn) {
        const id = removeBtn.dataset.todoId;
        const it = todoItems().find((x) => x.id === id);
        if (!it || !window.confirm(`Remove "${it.task}" from the list?`)) return;
        writeTodoItems(todoItems().filter((x) => x.id !== id));
        renderTodoMain();
        return;
      }
      if (addToggle) {
        const form = main.querySelector("[data-todo-add-form]");
        if (form) {
          form.hidden = false;
          addToggle.hidden = true;
          const task = form.querySelector(".todo-add-task");
          if (task) task.focus();
        }
        return;
      }
      if (addSave) {
        const form = addSave.closest("[data-todo-add-form]");
        const task = form.querySelector(".todo-add-task").value.trim();
        if (!task) {
          form.querySelector(".todo-add-task").focus();
          return;
        }
        const category = form.querySelector(".todo-add-category").value;
        const subEl = form.querySelector(".todo-add-subcategory");
        const items = itemsCopy();
        items.push({
          id: newTodoId(),
          task: task,
          category: category,
          subcategory: category === "Booking" ? subEl.value : "",
          status: "Open",
          url: form.querySelector(".todo-add-url").value.trim() || null,
          remarks: form.querySelector(".todo-add-remarks").value.trim() || null,
        });
        writeTodoItems(items);
        renderTodoMain();
        return;
      }
      if (addCancel) renderTodoMain();
    });
  }

  function renderTodo(trip) {
    todoState.trip = trip;
    todoState.doc = null;
    todoState.access = TravelSite.currentUser() ? "ok" : "none";
    todoState.seeded = false;
    setTimeout(wireTodoOnce, 0);

    // The list is private: subscribe when signed in (live via onSnapshot). A
    // permission error means signed in but not on the allow-list; signed out
    // shows a sign-in prompt.
    TravelSite.onAuthChange((user) => {
      if (todoState.unsub) {
        todoState.unsub();
        todoState.unsub = null;
      }
      if (user) {
        todoState.access = "ok";
        todoState.doc = null;
        todoState.unsub = TravelSite.watchDoc(
          todoDocPath(trip),
          (data) => {
            todoState.doc = data;
            todoState.access = "ok";
            maybeSeedTodo();
            renderTodoMain();
          },
          () => {
            todoState.doc = null;
            todoState.access = "denied";
            renderTodoMain();
          }
        );
      } else {
        todoState.access = "none";
        todoState.doc = null;
        renderTodoMain();
      }
    });

    return todoHtml(trip);
  }

  // ---------------------------------------------------------------- attachments

  // Files attached to a specific thing on a page -- a stay, later a travel leg --
  // rather than to a separate files page, so a booking confirmation sits with the
  // hotel it belongs to. Stored in Firebase Storage under
  // trips/<slug>/<kind>/<key>/, private: viewing and uploading both need sign-in
  // and the allow-list (Storage rules). Storage has no live sync, so a group's
  // list is fetched on sign-in and re-fetched after each upload or delete.
  const ATTACH_MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
  const attachState = {
    trip: null,
    groups: [], // [{kind, key}] the page has registered
    files: {}, // "kind/key" -> [{name, fullPath, url, size, uploadedBy, uploadedAt}]
    signedIn: false,
    error: "",
    rerender: null, // set by the page renderer
    wired: false,
  };

  // A stable, path-safe key for a thing being attached to.
  function attachSlug(value) {
    return (
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "item"
    );
  }
  function attachGroupId(kind, key) {
    return kind + "/" + key;
  }
  function attachPrefix(kind, key) {
    const slug = attachState.trip.slug || attachState.trip.title || "trip";
    return `trips/${slug}/${kind}/${key}/`;
  }
  function formatBytes(n) {
    if (n === null || n === undefined || isNaN(n)) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
    return (n / 1024 / 1024).toFixed(1) + " MB";
  }

  // Fetch every registered group's files. Storage lists per prefix, so this is one
  // call per group -- fine for a handful of stays.
  function loadAttachments() {
    if (!attachState.signedIn || !attachState.groups.length) return;
    Promise.all(
      attachState.groups.map((g) =>
        TravelSite.listFiles(attachPrefix(g.kind, g.key))
          .then((files) => [attachGroupId(g.kind, g.key), files])
          .catch(() => [attachGroupId(g.kind, g.key), []])
      )
    ).then((pairs) => {
      const next = {};
      pairs.forEach(([id, files]) => {
        files.sort((a, b) => String(a.uploadedAt).localeCompare(String(b.uploadedAt)));
        next[id] = files;
      });
      attachState.files = next;
      if (attachState.rerender) attachState.rerender();
    });
  }

  // The attach box for one thing. Renders nothing at all when signed out, so the
  // public page is untouched.
  function attachmentsHtml(kind, key, label) {
    if (!attachState.signedIn) return "";
    const id = attachGroupId(kind, key);
    const files = attachState.files[id] || [];
    const list = files
      .map(
        (f) => `<li class="attach-file">
          <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          f.name
        )}</a>
          <span class="attach-size">${formatBytes(f.size)}</span>
          <button type="button" class="attach-del" data-attach-delete data-attach-path="${escapeHtml(
            f.fullPath
          )}" data-attach-name="${escapeHtml(f.name)}" title="Delete file">Delete</button>
        </li>`
      )
      .join("");
    return `<div class="attach-box" data-attach-group="${escapeHtml(id)}">
      <div class="attach-head">${escapeHtml(label || "Booking file")}${
      files.length ? ` <span class="attach-count">${files.length}</span>` : ""
    }</div>
      ${files.length ? `<ul class="attach-list">${list}</ul>` : `<p class="attach-empty">None attached yet.</p>`}
      <div class="attach-actions">
        <input type="file" class="attach-input" multiple aria-label="Choose a file to attach" />
        <button type="button" class="todo-edit-btn" data-attach-upload>Attach</button>
        <span class="attach-status"></span>
      </div>
    </div>`;
  }

  // One delegated listener for every attach box on the page.
  function wireAttachmentsOnce() {
    const main = document.getElementById("main");
    if (!main || attachState.wired) return;
    attachState.wired = true;

    main.addEventListener("click", (e) => {
      const uploadBtn = e.target.closest("[data-attach-upload]");
      const deleteBtn = e.target.closest("[data-attach-delete]");
      if (!uploadBtn && !deleteBtn) return;
      const box = (uploadBtn || deleteBtn).closest(".attach-box");
      const status = box.querySelector(".attach-status");
      const [kind, key] = box.dataset.attachGroup.split("/");

      if (uploadBtn) {
        const input = box.querySelector(".attach-input");
        if (!input || !input.files.length) {
          status.textContent = "Choose a file first.";
          return;
        }
        const chosen = [...input.files];
        const tooBig = chosen.find((f) => f.size > ATTACH_MAX_BYTES);
        if (tooBig) {
          status.textContent = `"${tooBig.name}" is over 25 MB.`;
          return;
        }
        status.textContent = "Uploading…";
        uploadBtn.disabled = true;
        Promise.all(
          chosen.map((f) =>
            TravelSite.uploadFile(
              attachPrefix(kind, key) +
                Date.now().toString(36) +
                Math.random().toString(36).slice(2, 6),
              f
            )
          )
        )
          .then(() => loadAttachments())
          .catch((err) => {
            uploadBtn.disabled = false;
            status.textContent = "Upload failed: " + err.message;
          });
        return;
      }

      const path = deleteBtn.dataset.attachPath;
      const name = deleteBtn.dataset.attachName;
      if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
      deleteBtn.disabled = true;
      TravelSite.deleteFile(path)
        .then(() => loadAttachments())
        .catch((err) => {
          deleteBtn.disabled = false;
          status.textContent = "Delete failed: " + err.message;
        });
    });
  }

  // Called by a page renderer: declare what can be attached to, and how to redraw.
  function setupAttachments(trip, groups, rerender) {
    attachState.trip = trip;
    attachState.groups = groups;
    attachState.files = {};
    attachState.rerender = rerender;
    attachState.signedIn = !!TravelSite.currentUser();
    setTimeout(wireAttachmentsOnce, 0);
    TravelSite.onAuthChange((user) => {
      attachState.signedIn = !!user;
      attachState.files = {};
      if (user) loadAttachments();
      if (attachState.rerender) attachState.rerender();
    });
  }

  const RENDERERS = {
    index: renderIndex,
    overview: renderOverview,
    day: renderDay,
    weather: renderWeather,
    budget: renderBudget,
    accommodation: renderAccommodation,
    transport: renderTransport,
    todo: renderTodo,
  };

  // ---------------------------------------------------------------- entry point

  /** Load data.json, draw the shared header, then render the requested section. */
  async function page(active) {
    const main = document.getElementById("main");
    let trip;
    try {
      trip = await TravelSite.fetchJSON("data.json");
    } catch (err) {
      main.innerHTML = `<div class="empty-state">Couldn't load this trip's data.json — ${escapeHtml(
        err.message
      )}</div>`;
      return;
    }

    const section = PAGE_TITLES[active];
    document.title = section ? `${section} — ${trip.title}` : trip.title;

    TravelSite.renderHeader({
      root: ROOT,
      tripTitle: trip.title,
      tripHome: "index.html",
      navLinks: SECTIONS.map((s) => ({ label: s.label, href: s.href, active: s.key === active })),
    });

    try {
      main.innerHTML = RENDERERS[active](trip);
    } catch (err) {
      main.innerHTML = `<div class="empty-state">Couldn't render this page — ${escapeHtml(err.message)}</div>`;
      throw err;
    }
  }

  return {
    page, multiline, escapeHtml, home, local, toHome, dayCosts, checkIn,
    activityHtml, activityRoutes, placeholder, ROOT,
  };
})();
