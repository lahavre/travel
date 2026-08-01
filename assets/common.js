/* Shared helpers for the travel site: header/nav injection, formatting, budget math. */
const TravelSite = (() => {
  // Absolute URL of the assets/ folder, captured from this script's own src so
  // dynamic import() of firebase-config.js resolves the same from a trip page
  // (trips/<slug>/) or the root index.html. import() alone would resolve against
  // the document, which differs by page depth.
  const ASSETS_BASE = (() => {
    try {
      return new URL(".", document.currentScript.src).href;
    } catch (e) {
      return "./";
    }
  })();

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
        <div class="site-auth" id="site-auth"></div>
      </div>`;

    initAuth();
  }

  // ---- Google sign-in (Firebase Auth) --------------------------------------
  // Loaded lazily and only when firebase-config.js has real values, so the
  // public site is unaffected until Firebase is set up. Access itself (who can
  // read/write remarks and files) is enforced by security rules on the server,
  // not here — this only drives the sign-in button and lets other code react to
  // who is signed in.
  let fb = null; // { auth, mod } once loaded
  let authState = { ready: false, user: null };
  const authListeners = [];

  function onAuthChange(fn) {
    authListeners.push(fn);
    if (authState.ready) fn(authState.user);
  }
  function currentUser() {
    return authState.user;
  }

  let authStarted = false;
  async function initAuth() {
    if (authStarted) {
      renderAuthControl();
      return;
    }
    authStarted = true;
    let cfg;
    try {
      cfg = await import(ASSETS_BASE + "firebase-config.js");
    } catch (e) {
      authStarted = false;
      return; // no config file — stay public
    }
    if (!cfg.firebaseReady) return; // placeholder config — stay public

    try {
      const [appMod, authMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"),
      ]);
      const app = appMod.initializeApp(cfg.firebaseConfig);
      const auth = authMod.getAuth(app);
      fb = { app, auth, mod: authMod };
      authMod.onAuthStateChanged(auth, (user) => {
        authState = { ready: true, user };
        renderAuthControl();
        authListeners.forEach((fn) => fn(user));
      });
      // If this page was opened from an emailed link, finish the sign-in.
      completeEmailLink();
    } catch (e) {
      console.warn("Firebase auth failed to load:", e);
    }
  }

  // Two ways in, because a Google account isn't a fair thing to require of someone
  // you're sharing a trip with. The email link verifies the address as part of
  // signing in, so both routes arrive with a verified email and the security rules
  // treat them identically.
  let emailFormOpen = false;
  let emailStatus = "";

  function renderAuthControl() {
    const slot = document.getElementById("site-auth");
    if (!slot || !fb) return;
    const user = authState.user;
    if (user) {
      slot.innerHTML = `<span class="auth-who" title="${user.email || ""}">${
        user.email || "signed in"
      }</span>
        <button type="button" class="auth-btn" data-auth-signout>Sign out</button>`;
      return;
    }
    slot.innerHTML = `
      <button type="button" class="auth-btn" data-auth-signin>Sign in with Google</button>
      <button type="button" class="auth-btn auth-btn-quiet" data-auth-email-toggle>Use email</button>
      <form class="auth-email" data-auth-email-form${emailFormOpen ? "" : " hidden"}>
        <input type="email" class="auth-email-input" data-auth-email
          placeholder="you@example.com" aria-label="Your email address" />
        <button type="submit" class="auth-btn" data-auth-email-send>Email me a link</button>
      </form>
      ${emailStatus ? `<span class="auth-status">${emailStatus}</span>` : ""}`;
    if (emailFormOpen) {
      const input = slot.querySelector("[data-auth-email]");
      if (input) input.focus();
    }
  }

  /** Where the sign-in link should land: this page, minus any link parameters. */
  function signInRedirectUrl() {
    const url = new URL(window.location.href);
    ["apiKey", "oobCode", "mode", "lang", "continueUrl"].forEach((p) => url.searchParams.delete(p));
    return url.href;
  }

  async function sendEmailLink(email) {
    emailStatus = "Sending…";
    renderAuthControl();
    try {
      await fb.mod.sendSignInLinkToEmail(fb.auth, email, {
        url: signInRedirectUrl(),
        handleCodeInApp: true,
      });
      // Kept so the returning click knows who asked; Firebase requires the address
      // to match, which is what stops a forwarded link signing in someone else.
      window.localStorage.setItem("emailForSignIn", email);
      emailFormOpen = false;
      // Deliberately not "that address isn't registered": signing in only proves
      // who you are, and saying which addresses have access would let anyone test
      // them one by one. What access you have is decided afterwards, by the rules.
      emailStatus = `If ${email} has access, a sign-in link is on its way — open it on this device.`;
    } catch (err) {
      emailStatus = "Couldn't send: " + (err.code || err.message);
    }
    renderAuthControl();
  }

  /** Completes sign-in when the page is opened from an emailed link. */
  async function completeEmailLink() {
    if (!fb || !fb.mod.isSignInWithEmailLink(fb.auth, window.location.href)) return;
    let email = window.localStorage.getItem("emailForSignIn");
    if (!email) {
      // A different browser or device than the one that asked.
      email = window.prompt("Confirm the email address this link was sent to:");
    }
    if (!email) return;
    try {
      await fb.mod.signInWithEmailLink(fb.auth, email, window.location.href);
      window.localStorage.removeItem("emailForSignIn");
      // Drop the one-time code from the address bar so a refresh can't retry it.
      window.history.replaceState({}, document.title, signInRedirectUrl());
    } catch (err) {
      emailStatus = "That link didn't work: " + (err.code || err.message);
      renderAuthControl();
    }
  }

  document.addEventListener("submit", async (e) => {
    if (!e.target.closest("[data-auth-email-form]") || !fb) return;
    e.preventDefault();
    const input = e.target.querySelector("[data-auth-email]");
    const email = (input && input.value.trim()) || "";
    if (!email || email.indexOf("@") < 1) {
      emailStatus = "Enter an email address.";
      renderAuthControl();
      return;
    }
    await sendEmailLink(email);
  });

  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-auth-email-toggle]")) {
      emailFormOpen = !emailFormOpen;
      emailStatus = "";
      renderAuthControl();
      return;
    }
    if (e.target.closest("[data-auth-signin]") && fb) {
      const provider = new fb.mod.GoogleAuthProvider();
      try {
        await fb.mod.signInWithPopup(fb.auth, provider);
      } catch (err) {
        console.warn("Sign-in cancelled or failed:", err);
      }
    }
    if (e.target.closest("[data-auth-signout]") && fb) {
      await fb.mod.signOut(fb.auth);
    }
  });

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

  // ---- Firestore (shared, private data) ------------------------------------
  // Lazy-loaded on the same Firebase app as auth. watchDoc streams live updates
  // (onSnapshot) so an edit by one signed-in traveller appears for the others
  // without a refresh; writeDoc saves. Both no-op / reject when Firebase isn't
  // configured, and the security rules deny everything to non-allow-listed users.
  let fs = null;
  async function getFirestore() {
    if (fs) return fs;
    if (!fb) return null;
    const mod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    fs = { db: mod.getFirestore(fb.app), mod };
    return fs;
  }
  function watchDoc(path, onData, onError) {
    let unsub = null;
    let cancelled = false;
    getFirestore()
      .then((f) => {
        if (!f || cancelled) return;
        const ref = f.mod.doc(f.db, path);
        unsub = f.mod.onSnapshot(
          ref,
          (snap) => onData(snap.exists() ? snap.data() : null),
          (err) => onError && onError(err)
        );
      })
      .catch((e) => onError && onError(e));
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }
  async function writeDoc(path, data) {
    const f = await getFirestore();
    if (!f) throw new Error("Firestore not available");
    await f.mod.setDoc(f.mod.doc(f.db, path), data);
  }

  // ---- Activity trail -------------------------------------------------------
  // Append-only: entries are created and never changed, which is what makes the
  // trail worth having — including against whoever made the change. That is
  // enforced by the rules refusing update and delete, not by this file.
  // Entries live under the trip they belong to — activity/<slug>/entries — rather
  // than one flat collection filtered by trip. Sorting a filtered collection would
  // need a composite index created by hand in the console; sorting within a
  // subcollection needs only the single-field index Firestore maintains itself.
  function activityPath(slug) {
    return ["activity", slug || "trip", "entries"];
  }

  async function logActivity(slug, action, detail) {
    const f = await getFirestore();
    const user = currentUser();
    if (!f || !user) return; // signed out, or Firebase not configured
    try {
      await f.mod.addDoc(f.mod.collection(f.db, ...activityPath(slug)), {
        who: user.email || "",
        action: action || "",
        detail: detail || "",
        at: new Date().toISOString(),
      });
    } catch (e) {
      // A lost trail entry must never cost the change it was describing.
      console.warn("Couldn't record activity:", e);
    }
  }

  /** The newest entries for one trip, live. */
  function watchActivity(slug, max, onData, onError) {
    let unsub = null;
    let cancelled = false;
    getFirestore()
      .then((f) => {
        if (!f || cancelled) return;
        const q = f.mod.query(
          f.mod.collection(f.db, ...activityPath(slug)),
          f.mod.orderBy("at", "desc"),
          f.mod.limit(max || 50)
        );
        unsub = f.mod.onSnapshot(
          q,
          (snap) => onData(snap.docs.map((d) => d.data())),
          (err) => onError && onError(err)
        );
      })
      .catch((e) => onError && onError(e));
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }

  // ---- Who may edit, and which trips they may see --------------------------
  // One document, config/access: { editors: [email], trips: { slug: [email] } }.
  // The rules read the same document, so the site and the server agree; only the
  // owner below can write it, and that is enforced in the rules, not here. This
  // copy exists so the page can show the right thing rather than to decide access.
  const OWNER_EMAIL = "chew.mun.chun@gmail.com";
  function isOwner() {
    const u = currentUser();
    return !!u && (u.email || "").toLowerCase() === OWNER_EMAIL;
  }
  function watchAccess(onData, onError) {
    return watchDoc("config/access", (data) => onData(normalizeAccess(data)), onError);
  }
  function normalizeAccess(data) {
    return { editors: (data && data.editors) || [], trips: (data && data.trips) || {} };
  }
  async function saveAccess(access) {
    await writeDoc("config/access", {
      editors: access.editors || [],
      trips: access.trips || {},
    });
  }
  /** Can this signed-in address open that trip? The owner always can. */
  function canAccessTrip(access, slug, email) {
    if (!email) return false;
    if (email.toLowerCase() === OWNER_EMAIL) return true;
    const list = (access && access.trips && access.trips[slug]) || [];
    return list.some((e) => String(e).toLowerCase() === email.toLowerCase());
  }

  // ---- Firebase Storage (private files) ------------------------------------
  // The booking-file vault. Lazy-loaded like Firestore, on the same app. Gated
  // to the allow-list by Storage security rules. Needs the project on the Blaze
  // plan (Cloud Storage isn't available on the free Spark plan).
  let st = null;
  async function getStorage() {
    if (st) return st;
    if (!fb) return null;
    const mod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
    st = { store: mod.getStorage(fb.app), mod };
    return st;
  }
  async function uploadFile(path, file) {
    const s = await getStorage();
    if (!s) throw new Error("Storage not available");
    const metadata = {
      customMetadata: {
        uploadedBy: (currentUser() && currentUser().email) || "",
        uploadedAt: new Date().toISOString(),
        originalName: file.name,
      },
    };
    await s.mod.uploadBytes(s.mod.ref(s.store, path), file, metadata);
  }
  async function listFiles(prefix) {
    const s = await getStorage();
    if (!s) return [];
    const res = await s.mod.listAll(s.mod.ref(s.store, prefix));
    return Promise.all(
      res.items.map(async (itemRef) => {
        const [url, meta] = await Promise.all([
          s.mod.getDownloadURL(itemRef),
          s.mod.getMetadata(itemRef),
        ]);
        const cm = meta.customMetadata || {};
        return {
          name: cm.originalName || itemRef.name,
          fullPath: itemRef.fullPath,
          url: url,
          size: meta.size,
          uploadedBy: cm.uploadedBy || "",
          uploadedAt: cm.uploadedAt || meta.timeCreated || "",
        };
      })
    );
  }
  async function deleteFile(path) {
    const s = await getStorage();
    if (!s) throw new Error("Storage not available");
    await s.mod.deleteObject(s.mod.ref(s.store, path));
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
    onAuthChange,
    currentUser,
    watchDoc,
    writeDoc,
    uploadFile,
    listFiles,
    deleteFile,
    isOwner,
    watchAccess,
    saveAccess,
    canAccessTrip,
    logActivity,
    watchActivity,
    OWNER_EMAIL,
    ASSETS_BASE,
  };
})();
