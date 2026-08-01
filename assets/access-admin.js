/* Who can edit this site, and which trips each of them can open.

   Shown on the landing page to the owner alone. The list lives in one Firestore
   document, config/access, which the security rules read as well — so what is
   ticked here is what the server enforces, not merely what the page chooses to
   draw. Only the owner can write that document, which is what stops access from
   being handed on; that restriction lives in the rules, not in this file. */
const AccessAdmin = (() => {
  let trips = [];
  let access = { editors: [], trips: {} };
  let mounted = false;
  let unsub = null;
  let status = "";

  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function render() {
    const host = document.getElementById("access-admin");
    if (!host) return;
    // Anyone else — signed out, or signed in but not the owner — sees nothing at
    // all here; the rules would refuse them the document in any case.
    if (!TravelSite.isOwner()) {
      host.innerHTML = "";
      return;
    }

    const rows = access.editors.length
      ? access.editors
          .map(
            (email) => `<tr>
              <td>${esc(email)}</td>
              ${trips
                .map(
                  (t) => `<td class="num"><input type="checkbox" class="attach-check" data-access-trip
                    data-email="${esc(email)}" data-slug="${esc(t.slug)}"${
                    (access.trips[t.slug] || []).indexOf(email) > -1 ? " checked" : ""
                  } aria-label="${esc(email)} can open ${esc(t.title)}" /></td>`
                )
                .join("")}
              <td class="todo-actions"><button type="button" class="todo-remove-btn"
                data-access-remove data-email="${esc(email)}">Remove</button></td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="${trips.length + 2}" class="attach-empty">
           Nobody added yet — you can always edit everything yourself.</td></tr>`;

    host.innerHTML = `
      <h2>Who can edit</h2>
      <p class="section-note">Anyone added here can sign in and edit the trips you tick.
        You always have access to everything, and only you can change this list.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Google account</th>${trips
            .map((t) => `<th class="num">${esc(t.emoji || "")} ${esc(t.title)}</th>`)
            .join("")}<th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="attach-actions">
        <input type="email" id="access-new" class="todo-add-task" placeholder="name@gmail.com"
          aria-label="Google account to add" />
        <button type="button" class="todo-edit-btn" data-access-add>Add person</button>
        <span class="attach-status">${esc(status)}</span>
      </div>`;
  }

  function save(next, message) {
    access = next;
    status = "Saving…";
    render();
    TravelSite.saveAccess(next)
      .then(() => {
        status = message || "";
        render();
      })
      .catch((e) => {
        status = "Couldn't save: " + e.message;
        render();
      });
  }

  function wire() {
    const host = document.getElementById("access-admin");
    if (!host || host.dataset.wired) return;
    host.dataset.wired = "1";

    host.addEventListener("click", (e) => {
      const add = e.target.closest("[data-access-add]");
      const remove = e.target.closest("[data-access-remove]");
      if (add) {
        const input = document.getElementById("access-new");
        const email = (input.value || "").trim().toLowerCase();
        if (!email || email.indexOf("@") < 1) {
          status = "Enter a Google account's email address.";
          render();
          return;
        }
        if (access.editors.some((x) => x.toLowerCase() === email)) {
          status = `${email} is already on the list.`;
          render();
          return;
        }
        save(
          { editors: access.editors.concat([email]), trips: access.trips },
          `${email} added — now tick the trips they can open.`
        );
        return;
      }
      if (remove) {
        const email = remove.dataset.email;
        if (!window.confirm(`Remove ${email}? They lose access to every trip.`)) return;
        const trimmed = {};
        Object.keys(access.trips).forEach((slug) => {
          trimmed[slug] = (access.trips[slug] || []).filter((x) => x !== email);
        });
        save({ editors: access.editors.filter((x) => x !== email), trips: trimmed }, `${email} removed.`);
      }
    });

    host.addEventListener("change", (e) => {
      const box = e.target.closest("[data-access-trip]");
      if (!box) return;
      const { email, slug } = box.dataset;
      const list = new Set(access.trips[slug] || []);
      if (box.checked) list.add(email);
      else list.delete(email);
      const nextTrips = { ...access.trips, [slug]: [...list] };
      save({ editors: access.editors, trips: nextTrips }, "");
    });
  }

  /** Called once the trip list is known; redraws whenever sign-in changes. */
  function mount(tripList) {
    trips = tripList || [];
    if (mounted) {
      render();
      return;
    }
    mounted = true;
    setTimeout(wire, 0);
    TravelSite.onAuthChange((user) => {
      if (unsub) {
        unsub();
        unsub = null;
      }
      access = { editors: [], trips: {} };
      status = "";
      if (user) {
        unsub = TravelSite.watchAccess(
          (data) => {
            access = data;
            render();
          },
          () => {
            // Not allowed to read it — which is the normal case for anyone but
            // the owner, and there is nothing to show them anyway.
            access = { editors: [], trips: {} };
            render();
          }
        );
      }
      render();
    });
  }

  return { mount };
})();
