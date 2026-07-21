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
    { key: "budget", label: "Budget", href: "budget.html" },
    { key: "accommodation", label: "Stays", href: "accommodation.html" },
    { key: "transport", label: "Transport", href: "transport.html" },
    { key: "todo", label: "To-do", href: "todo.html" },
  ];

  const PAGE_TITLES = {
    index: null,
    overview: "Overview",
    day: "Day-by-day",
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

  /** "13 Oct 2023 (Fri)" — the trip's canonical date format. */
  function longDate(iso) {
    if (!iso) return "";
    const date = TravelSite.formatDate(iso, { day: "numeric", month: "short", year: "numeric" });
    const weekday = TravelSite.formatDate(iso, { weekday: "short" });
    return `${date} (${weekday})`;
  }

  // ---------------------------------------------------------------- renderers

  function renderIndex(trip) {
    const stays = trip.accommodation || [];
    const nights = stays.reduce((s, a) => s + (a.nights || 0), 0);
    const flights = trip.flights || [];
    const short = (iso) => TravelSite.formatDate(iso, { day: "2-digit", month: "short", year: "numeric" });

    const facts = [
      { label: "Days", value: (trip.days || []).length || (trip.summary && trip.summary.totalDays) || "—" },
      stays.length ? { label: "Nights booked", value: nights } : null,
    ].filter(Boolean);

    const flightSection = flights.length
      ? `<h2>Flights</h2>
         <div class="table-wrap">
           <table>
             <thead><tr><th>Flight</th><th>Date</th><th>Route</th><th>Times</th><th>Airline</th><th>Notes</th></tr></thead>
             <tbody>${flights
               .map(
                 (f) => `<tr>
                   <td><strong>${escapeHtml(f.type || "")}</strong></td>
                   <td>${longDate(f.date)}</td>
                   <td>${escapeHtml(f.from || "")} → ${escapeHtml(f.to || "")}</td>
                   <td>${
                     f.departTime || f.arriveTime
                       ? `${escapeHtml(f.departTime || "—")} → ${escapeHtml(f.arriveTime || "—")}${
                           f.arrivesNextDay ? " <span style=\"font-size:.75rem;color:var(--text-dim)\">+1</span>" : ""
                         }`
                       : "—"
                   }</td>
                   <td>${escapeHtml(f.airline || "—")}${
                   f.flightNo ? `<br><span style="color:var(--text-dim);font-size:.82rem">${escapeHtml(f.flightNo)}</span>` : ""
                 }</td>
                   <td style="color:var(--text-dim);font-size:.85rem">${multiline(f.remarks)}</td>
                 </tr>`
               )
               .join("")}</tbody>
           </table>
         </div>`
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

  function renderOverview(trip) {
    if (!has(trip.overview)) return `<h1>High-level itinerary</h1>${placeholder("itinerary")}`;

    const rows = trip.overview
      .map(
        (o) => `
        <tr>
          <td><a href="day.html?day=${o.day}"><strong>Day ${o.day}</strong></a><br>
            <span style="color:var(--text-dim);font-size:.82rem">${TravelSite.formatDate(o.date, {
              day: "2-digit",
              month: "short",
            })}<br>${escapeHtml(o.weekday || "")}</span></td>
          <td>${multiline(o.city)}</td>
          <td>${multiline(o.morning)}</td>
          <td>${multiline(o.afternoon)}</td>
          <td>${multiline(o.evening)}</td>
          <td style="color:var(--text-dim);font-size:.85rem">${multiline(o.remarks)}${
            o.temperature ? `<br><em>${multiline(o.temperature)}</em>` : ""
          }</td>
        </tr>`
      )
      .join("");

    return `
      <h1>High-level itinerary</h1>
      <p class="subtitle">The whole trip at a glance — click a day for the detailed plan.</p>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Day</th><th>Staying in</th>
            <th>Morning</th><th>Afternoon</th><th>Evening</th>
            <th>Remarks</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderDay(trip) {
    if (!has(trip.days)) return `<h1>Day-by-day</h1>${placeholder("days")}`;

    const requested = parseInt(new URLSearchParams(location.search).get("day"), 10);
    const day = trip.days.find((d) => d.day === requested) || trip.days[0];
    const idx = trip.days.indexOf(day);
    const prev = trip.days[idx - 1];
    const next = trip.days[idx + 1];
    const { totals, sum } = dayCosts(day);
    const labels = costLabels(trip);

    document.title = `Day ${day.day} — ${trip.title}`;

    const pager = `
      <div class="day-pager">
        ${prev ? `<a href="day.html?day=${prev.day}">← Day ${prev.day}</a>` : `<span class="disabled">← Prev</span>`}
        <a href="overview.html">All days</a>
        ${next ? `<a href="day.html?day=${next.day}">Day ${next.day} →</a>` : `<span class="disabled">Next →</span>`}
      </div>`;

    const timeline = has(day.items)
      ? day.items
          .map(
            (it) => `
        <div class="timeline-item">
          <div class="timeline-time">${escapeHtml(it.time || "")}</div>
          <div>
            <div class="timeline-activity">${multiline(it.activity)}</div>
            ${it.remarks ? `<div class="timeline-meta">${multiline(it.remarks)}</div>` : ""}
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
          </div>
        </div>`
          )
          .join("")
      : placeholder("activities");

    const costRows = Object.entries(totals)
      .map(([k, v]) => `<tr><td>${escapeHtml(labels[k] || k)}</td>${moneyCells(v, trip)}</tr>`)
      .join("");

    return `
      <h1>Day ${day.day}${day.city ? " · " + escapeHtml(cityName(day.city)) : ""}</h1>
      <p class="subtitle">
        ${TravelSite.formatDate(day.date)}
        ${day.temperature ? ` · ${escapeHtml(day.temperature.replace(/\n/g, " · "))} °C` : ""}
      </p>
      ${day.summary ? `<p class="section-note">${multiline(day.summary)}</p>` : ""}

      ${pager}

      <h2>Plan</h2>
      <div>${timeline}</div>

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
      }

      ${pager}`;
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

  function renderAccommodation(trip) {
    const stays = trip.accommodation || [];
    if (!stays.length) return `<h1>Accommodation</h1>${placeholder("stays")}`;

    const total = stays.reduce((s, a) => s + (a.total || 0), 0);
    const nights = stays.reduce((s, a) => s + (a.nights || 0), 0);
    const short = (iso) => TravelSite.formatDate(iso, { day: "2-digit", month: "short" });
    const splitTravellers = has(trip.travelers) && stays.some((a) => a.perPerson);

    let out = `
      <h1>Accommodation</h1>
      <p class="subtitle">${stays.length} stays · ${nights} nights · ${home(total, trip)} total</p>

      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Where</th><th>Dates</th><th>Times</th><th>Included</th>
            <th class="num">Per night</th><th class="num">Total</th><th>Notes</th>
          </tr></thead>
          <tbody>${stays
            .map(
              (a) => `<tr>
                <td><strong>${escapeHtml(a.city || "")}</strong><br>
                  <span style="color:var(--text-dim);font-size:.85rem">${escapeHtml(a.name || "")}</span></td>
                <td>${short(a.checkIn)} → ${short(a.checkOut)}<br>
                  <span style="color:var(--text-dim);font-size:.82rem">${a.nights} night${
                a.nights > 1 ? "s" : ""
              }${a.persons ? ` · ${a.persons} pax` : ""}</span></td>
                <td style="font-size:.85rem">In: ${escapeHtml(a.checkInTime || "—")}<br>Out: ${escapeHtml(
                a.checkOutTime || "—"
              )}</td>
                <td style="font-size:.85rem">Breakfast: ${escapeHtml(a.breakfast || "—")}<br>Parking: ${escapeHtml(
                a.parking || "—"
              )}</td>
                <td class="num">${home(a.pricePerNight, trip)}</td>
                <td class="num">${home(a.total, trip)}</td>
                <td style="color:var(--text-dim);font-size:.82rem">${multiline(a.remarks)}${
                a.payment ? `<br><em>${multiline(a.payment)}</em>` : ""
              }</td>
              </tr>`
            )
            .join("")}</tbody>
          <tfoot><tr><td colspan="5">Grand total</td><td class="num">${home(total, trip)}</td><td></td></tr></tfoot>
        </table>
      </div>`;

    if (splitTravellers) {
      const totals = trip.travelers.map((t) =>
        stays.reduce((s, a) => s + ((a.perPerson && a.perPerson[t]) || 0), 0)
      );
      out += `
        <h2>Split per traveller</h2>
        <p class="section-note">Stays paid directly at the property, or not shared, show “—”.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Stay</th>${trip.travelers
              .map((t) => `<th class="num">${escapeHtml(t)}</th>`)
              .join("")}</tr></thead>
            <tbody>${stays
              .map(
                (a) => `<tr><td>${escapeHtml(a.city || a.name || "")}</td>${trip.travelers
                  .map(
                    (t) =>
                      `<td class="num">${
                        a.perPerson && a.perPerson[t] != null ? home(a.perPerson[t], trip) : "—"
                      }</td>`
                  )
                  .join("")}</tr>`
              )
              .join("")}</tbody>
            <tfoot><tr><td>Total</td>${totals
              .map((v) => `<td class="num">${home(v, trip)}</td>`)
              .join("")}</tr></tfoot>
          </table>
        </div>`;
    }

    return out;
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
                <thead><tr><th>Day</th><th>Route</th><th class="num">Distance</th><th></th></tr></thead>
                <tbody>${legs
                  .map(
                    (l) => `<tr>
                      <td><a href="day.html?day=${l.day}">Day ${l.day}</a><br>
                        <span style="color:var(--text-dim);font-size:.82rem">${TravelSite.formatDate(l.date, {
                          day: "2-digit",
                          month: "short",
                        })}</span></td>
                      <td>${escapeHtml(l.route || "")}</td>
                      <td class="num">${l.km ? l.km.toLocaleString() + " km" : "—"}</td>
                      <td>${l.refuel ? "⛽ Refuel" : ""}</td>
                    </tr>`
                  )
                  .join("")}</tbody>
                ${
                  t.totalKm
                    ? `<tfoot><tr><td colspan="2">Total</td><td class="num">${t.totalKm.toLocaleString()} km</td><td></td></tr></tfoot>`
                    : ""
                }
              </table>
            </div>
            <p class="section-note">Fuel, parking and tolls are split between travellers on the
              <a href="budget.html">budget page</a>.</p>`
          : placeholder("travel legs")
      }`;
  }

  function renderTodo(trip) {
    const todo = trip.todo || [];
    if (!todo.length) return `<h1>Pre-trip to-do</h1>${placeholder("to-do items")}`;

    const done = todo.filter((t) => t.status === "Done").length;

    return `
      <h1>Pre-trip to-do</h1>
      <p class="subtitle">${done} of ${todo.length} done — bookings, reservations and paperwork before departure.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Task</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>${todo
            .map(
              (t) => `<tr>
                <td>${escapeHtml(t.ref || "")}</td>
                <td>${escapeHtml(t.task)}${
                t.url
                  ? `<br><a href="${escapeHtml(
                      t.url
                    )}" target="_blank" rel="noopener noreferrer" style="font-size:.82rem">${escapeHtml(t.url)}</a>`
                  : ""
              }</td>
                <td>${
                  t.status
                    ? `<span class="badge${t.status === "Done" ? "" : " past"}">${escapeHtml(t.status)}</span>`
                    : ""
                }</td>
                <td style="color:var(--text-dim);font-size:.85rem">${multiline(t.remarks)}</td>
              </tr>`
            )
            .join("")}</tbody>
        </table>
      </div>`;
  }

  const RENDERERS = {
    index: renderIndex,
    overview: renderOverview,
    day: renderDay,
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

  return { page, multiline, escapeHtml, home, local, toHome, dayCosts, placeholder, ROOT };
})();
