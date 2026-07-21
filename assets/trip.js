/* Renderers for a single trip's pages. Every page loads data.json and renders from it. */
const Trip = (() => {
  const ROOT = "../..";

  const COST_LABELS = {
    transport: "Transport",
    fuel: "Fuel / Parking",
    food: "Food",
    sightseeing: "Sightseeing",
    misc: "Misc",
  };

  function nav(trip, active, dayCount) {
    return [
      { label: "Trip", href: "index.html", active: active === "index" },
      { label: "Overview", href: "overview.html", active: active === "overview" },
      { label: "Days", href: "day.html?day=1", active: active === "day" },
      { label: "Budget", href: "budget.html", active: active === "budget" },
      { label: "Stays", href: "accommodation.html", active: active === "accommodation" },
      { label: "Transport", href: "transport.html", active: active === "transport" },
      { label: "To-do", href: "todo.html", active: active === "todo" },
    ];
  }

  function multiline(text) {
    if (!text) return "";
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const PAGE_TITLES = {
    index: null,
    overview: "Overview",
    day: "Day-by-day",
    budget: "Budget",
    accommodation: "Accommodation",
    transport: "Transport",
    todo: "To-do",
  };

  /** Load data.json, set up the shared header, and hand the data to the page's renderer. */
  async function page(active, render) {
    const trip = await TravelSite.fetchJSON("data.json");
    const section = PAGE_TITLES[active];
    document.title = section ? `${section} — ${trip.title}` : trip.title;
    TravelSite.renderHeader({
      root: ROOT,
      tripTitle: trip.title,
      tripHome: "index.html",
      navLinks: nav(trip, active, trip.days.length),
    });
    render(trip);
  }

  /** JPY -> MYR using the trip's effective rate (quoted per 100 JPY, as in the old sheet). */
  function toMYR(jpy, trip) {
    return (jpy / 100) * trip.exchangeRate.effectivePer100;
  }

  function dayCosts(day) {
    const totals = {};
    let sum = 0;
    day.items.forEach((it) => {
      Object.entries(it.costs || {}).forEach(([k, v]) => {
        totals[k] = (totals[k] || 0) + v;
        sum += v;
      });
    });
    return { totals, sum };
  }

  return { page, multiline, escapeHtml, toMYR, dayCosts, COST_LABELS, ROOT };
})();
