/* Shared helpers for the travel site: header/nav injection, formatting, budget math. */
const TravelSite = (() => {
  function renderHeader({ root = ".", siteTitle = "Travel", tripTitle, tripHome, navLinks = [] } = {}) {
    const mount = document.getElementById("site-header");
    if (!mount) return;

    const titleHtml = tripTitle
      ? `<a href="${tripHome}">${tripTitle}</a>`
      : `<a href="${root}/index.html">${siteTitle}</a>`;

    const navHtml = navLinks
      .map(
        (l) =>
          `<a href="${l.href}"${l.active ? ' class="active"' : ""}>${l.label}</a>`
      )
      .join("");

    mount.innerHTML = `
      <div class="site-header-inner">
        <div class="site-title">${titleHtml}</div>
        <nav class="trip-nav">${navHtml}</nav>
      </div>`;
  }

  async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
  }

  // Day-first everywhere, matching the DD/MM/YYYY convention the trips were planned in.
  // Pinned rather than left to the viewer's locale so dates read the same on every device.
  const LOCALE = "en-GB";

  function formatDate(iso, opts = { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) {
    if (!iso) return "";
    return new Date(iso + "T00:00:00").toLocaleDateString(LOCALE, opts);
  }

  // Three-letter ISO code, as the spreadsheet used — "MYR 517.42", not "RM517.42".
  function formatMoney(amount, currency = "MYR") {
    if (amount === null || amount === undefined || isNaN(amount)) return "-";
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: 2,
    }).format(amount);
  }

  function tripStatus(startDate, endDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (endDate < today) return "past";
    if (startDate <= today && today <= endDate) return "current";
    return "upcoming";
  }

  function sortTripsByDate(trips) {
    return [...trips].sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  /**
   * Convert a foreign-currency amount to home currency (MYR) using the trip's
   * stored exchange rate, mirroring the old Excel "Exchange Rate" sheet
   * (rate = homeCurrencyTotal / foreignCurrencyTotal).
   */
  function toHomeCurrency(amountForeign, rate) {
    if (amountForeign === null || amountForeign === undefined) return 0;
    return amountForeign * rate;
  }

  /**
   * Roll up a trip's budget category rows into totals + percentages,
   * equivalent to the Summary sheet's %-of-budget / %-of-spending columns.
   */
  function computeBudgetSummary(categories) {
    const totalBudget = categories.reduce((s, c) => s + (c.budget || 0), 0);
    const totalActual = categories.reduce((s, c) => s + (c.actual || 0), 0);
    const rows = categories.map((c) => ({
      ...c,
      pctOfBudget: totalBudget ? (c.budget || 0) / totalBudget : 0,
      pctOfActual: totalActual ? (c.actual || 0) / totalActual : 0,
      diff: (c.budget || 0) - (c.actual || 0),
    }));
    return { rows, totalBudget, totalActual };
  }

  function formatPercent(fraction) {
    if (fraction === null || fraction === undefined || isNaN(fraction)) return "-";
    return `${(fraction * 100).toFixed(1)}%`;
  }

  return {
    renderHeader,
    fetchJSON,
    formatDate,
    formatMoney,
    formatPercent,
    tripStatus,
    sortTripsByDate,
    toHomeCurrency,
    computeBudgetSummary,
  };
})();
