/* Georgiadis Photography: dispatches by email. A visitor who hasn't been asked before is
   offered the newsletter once, in a small card, after they've had a look around; the envelope
   in the header and the footer's link bring it back any time. #/newsletter is its page, and
   where the links in its emails land: confirming an address, or unsubscribing in one click.
   The list itself lives with the newsletter's script (newsletter/Newsletter.gs), whose web app
   address the site gives as adapter.newsletter; without one, none of this shows. */
(function (GP) {
  "use strict";
  const KEY = "gp-news"; // "seen" once offered, "pending" once asked for, "subscribed" once confirmed here
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return "seen"; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
  };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const app = () => GP.app;
  const H = () => GP.app.helpers;
  const endpoint = () => (app() && app().adapter && app().adapter.newsletter) || "";
  const open = () => !!endpoint() && !(app() && app().workshop);
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>';

  /* ---------- talking to the newsletter ---------- */
  // A plain-text POST needs no preflight and the script answers it readably; a page that still
  // can't read the answer asks again the old way, as a script.
  function call(body) {
    const url = endpoint();
    if (!url) return Promise.reject(new Error("closed"));
    return fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), redirect: "follow" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .catch(() => jsonp(url, body));
  }
  let jn = 0;
  function jsonp(url, body) {
    return new Promise((resolve, reject) => {
      const cb = "gpNl_" + Date.now().toString(36) + "_" + ++jn;
      const s = document.createElement("script");
      const done = () => { delete window[cb]; s.remove(); clearTimeout(t); };
      const t = setTimeout(() => { done(); reject(new Error("timeout")); }, 15000);
      window[cb] = (res) => { done(); resolve(res); };
      s.onerror = () => { done(); reject(new Error("network")); };
      s.src = url + (url.includes("?") ? "&" : "?") + new URLSearchParams(Object.assign({}, body, { callback: cb })).toString();
      document.head.appendChild(s);
    });
  }

  /* ---------- the sign-up form ---------- */
  let fid = 0;
  function form(source) {
    const id = "nl-email-" + ++fid;
    return `<form class="nl-form" data-source="${source}" novalidate>
  <label class="visually-hidden" for="${id}">Email address</label>
  <div class="nl-field"><input id="${id}" type="email" name="email" autocomplete="email" inputmode="email" placeholder="Your email address" required>
    <button class="btn primary" type="submit">Subscribe</button></div>
  <input class="nl-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
  <p class="nl-msg" role="status" aria-live="polite"></p>
</form>`;
  }
  const VALID = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
  function say(f, text, kind) {
    const m = f.querySelector(".nl-msg");
    m.textContent = text;
    m.className = "nl-msg" + (kind ? " " + kind : "");
  }
  function submit(f) {
    const input = f.querySelector('input[name="email"]'), btn = f.querySelector('button[type="submit"]');
    const email = input.value.trim();
    if (!VALID.test(email)) { say(f, "That doesn't look like an email address.", "bad"); input.focus(); return; }
    btn.disabled = true; f.classList.add("busy");
    say(f, "One moment…");
    call({ action: "subscribe", email, website: f.querySelector(".nl-hp").value, source: f.dataset.source || "" })
      .then((r) => {
        if (r && r.ok) {
          if (store.get(KEY) !== "subscribed") store.set(KEY, "pending");
          const later = f.parentElement.querySelector(".nl-later");
          if (later) later.textContent = "Close";
          f.outerHTML = sent(email);
          paint();
        } else {
          say(f, r && r.error === "email" ? "That doesn't look like an email address." : "Lots of people are signing up just now. Please try again in a little while.", "bad");
        }
      })
      .catch(() => say(f, "The newsletter couldn't be reached. Please try again.", "bad"))
      .finally(() => { btn.disabled = false; f.classList.remove("busy"); });
  }
  const sent = (email) => `<div class="nl-sent" role="status"><b class="display">Check your inbox</b><p>We've sent a link to <span class="nl-addr">${H().esc(email)}</span>. Open it to confirm, and you'll hear from us when the next outing goes up.</p></div>`;
  document.addEventListener("submit", (e) => {
    const f = e.target.closest && e.target.closest(".nl-form");
    if (!f) return;
    e.preventDefault();
    submit(f);
  });

  /* ---------- the card ---------- */
  // the newest outing with wildlife in it: its photograph heads the card
  function latest() {
    const m = app() && app().model;
    if (!m) return null;
    const wild = m.outings.filter((o) => o.species.length && o.photos.length >= 3 && o.cover);
    const o = wild[wild.length - 1];
    if (!o) return null;
    const cover = o.heroes.filter((x) => x.spKey && !x.unsure).sort((a, b) => (b.ar >= 1.3) - (a.ar >= 1.3) || b.score - a.score)[0] || o.cover;
    return { o, cover };
  }
  // what the outing was, in a line: its summary, or the animals while the summary is still to come
  function hook(o) {
    const first = (o.note || "").split(/(?<=[.!?])\s+/)[0] || "";
    if (first && !/a short outing of \d+ frames|^\S.*, \d{1,2} \w+ \d{4}:/i.test(first)) return first;
    const names = o.species.filter((s) => !/\bsp\.?$/i.test(s.name || "")).slice().sort((a, b) => b.n - a.n).map((s) => s.name);
    const list = names.slice(0, 3), more = names.length > 3 ? " and more" : "";
    if (!list.length) return o.title;
    return `${list.length > 1 ? list.slice(0, -1).join(", ") + (more ? ", " : " and ") + list[list.length - 1] : list[0]}${more}, in ${o.photos.length} frames.`;
  }
  const P = { el: null, manual: false, ret: null };
  function show(manual) {
    if (!open()) return;
    if (P.el) { if (manual) P.el.querySelector("input, button").focus(); return; }
    const h = H(), lt = latest(), state = store.get(KEY);
    P.manual = manual;
    P.ret = manual ? document.activeElement : null;
    const el = document.createElement("aside");
    el.className = "nl-pop";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-labelledby", "nl-pop-t");
    el.innerHTML = `<button class="nl-x icon-btn" type="button" aria-label="Close">${h.ICON.close || "×"}</button>
  ${lt ? `<div class="nl-pic">${h.cover(lt.cover, 760, "", h.titleOf(lt.cover))}<span class="nl-cap"><span class="sc">From the field</span><span class="mono">${h.esc(h.fmtDate(lt.o.date))}</span></span></div>` : ""}
  <div class="nl-body">
    <div class="kicker">Dispatches by email</div>
    <h2 id="nl-pop-t" class="display">Be there when a new outing goes up</h2>
    <p>One short note for each new outing, with its best photograph and a link straight to the rest. Nothing else, and you can leave in one click.</p>
    ${state === "subscribed" ? `<p class="nl-note">You're subscribed on this device. Another address?</p>` : ""}
    ${form(manual ? "menu" : "popup")}
    ${manual ? "" : `<button class="link nl-later" type="button">No thanks</button>`}
  </div>`;
    document.body.appendChild(el);
    P.el = el;
    if (!manual) store.set(KEY, state || "seen");
    requestAnimationFrame(() => el.classList.add("on"));
    if (manual) setTimeout(() => { const i = el.querySelector('input[type="email"]'); if (i) i.focus({ preventScroll: true }); }, reduced() ? 0 : 260);
  }
  function hide() {
    if (!P.el) return;
    const el = P.el;
    P.el = null;
    el.classList.remove("on");
    el.classList.add("off");
    setTimeout(() => el.remove(), reduced() ? 0 : 320);
    if (P.ret && P.ret.focus && P.ret.isConnected) P.ret.focus({ preventScroll: true });
    P.ret = null;
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest('[data-act="newsletter"], .nl-x, .nl-later');
    if (!t) return;
    if (t.matches('[data-act="newsletter"]')) { if (P.el && P.manual) hide(); else show(true); }
    else hide();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && P.el && (P.manual || P.el.contains(document.activeElement))) { e.stopPropagation(); hide(); } }, true);
  addEventListener("hashchange", () => { if (P.el && P.manual) hide(); if (/^#\/newsletter/.test(location.hash)) hide(); });

  /* ---------- when to offer it ---------- */
  // Once per visitor, and only after they've had a proper look: a while on the site and some
  // scrolling or a few pages, never over the opening, a photograph or an exhibition.
  const W = { t0: Date.now(), scrolled: 0, pages: 0, lastY: 0, timer: 0 };
  function due() {
    const s = store.get(KEY);
    if (!open() || s || /[?&]nonews\b/.test(location.search + location.hash)) return false;
    const t = (Date.now() - W.t0) / 1000;
    const engaged = W.scrolled > 900 || W.pages >= 2;
    return (t >= 20 && engaged) || t >= 45;
  }
  function busy() {
    return !!(document.querySelector(".gp-intro, .ex2, .ex, dialog[open]") || (GP.viewer && GP.viewer.isOpen()) || /^#\/newsletter/.test(location.hash) || document.hidden);
  }
  function watch() {
    if (W.timer || store.get(KEY) || !open()) return;
    W.t0 = Date.now();
    W.timer = setInterval(() => {
      if (store.get(KEY) || !open()) { clearInterval(W.timer); W.timer = 0; return; }
      if (due() && !busy() && !P.el) { show(false); clearInterval(W.timer); W.timer = 0; }
    }, 1000);
  }
  addEventListener("scroll", () => { const y = scrollY; W.scrolled += Math.abs(y - W.lastY); W.lastY = y; }, { passive: true });
  addEventListener("hashchange", () => { W.pages++; });

  /* ---------- the header, the footer ---------- */
  function button() {
    return open() ? `<button class="icon-btn nl-btn" data-act="newsletter" title="Dispatches by email" aria-label="Dispatches by email: subscribe">${ICON}</button>` : "";
  }
  function footLink() {
    return open() ? `<a class="foot-news" href="#/newsletter">${ICON}<span>Dispatches by email</span></a>` : "";
  }
  function paint() {
    const s = store.get(KEY);
    for (const b of document.querySelectorAll('[data-act="newsletter"]')) b.classList.toggle("on", s === "subscribed");
  }

  /* ---------- #/newsletter ---------- */
  function render({ q, h }) {
    const lt = latest();
    const preview = lt ? `<a class="nl-prev" href="#/outings/${h.esc(lt.o.id)}">
    <span class="nl-prev-pic">${h.cover(lt.cover, 900, "", h.titleOf(lt.cover))}</span>
    <span class="nl-prev-t"><span class="sc">From the field · Dispatch No. ${lt.o.no}</span><b class="display">${h.esc(h.fmtDate(lt.o.date))}</b><i>${h.esc(lt.o.title)}</i>
      <span class="nl-prev-note">${h.esc(hook(lt.o))}</span><span class="nl-prev-go">See the outing ${h.ICON.arrow}</span></span></a>` : "";
    const confirm = q.get("confirm"), unsub = q.get("unsubscribe");
    let main;
    if (!open()) {
      main = `<div class="nl-state"><p>The newsletter isn't open just yet. Come back soon.</p></div>`;
    } else if (confirm || unsub) {
      main = `<div class="nl-state" data-token="${h.esc(confirm || unsub)}" data-do="${confirm ? "confirm" : "unsubscribe"}" aria-live="polite"><p class="nl-wait">${confirm ? "Confirming your subscription…" : "Unsubscribing…"}</p></div>`;
    } else {
      main = `<div class="nl-join">${store.get(KEY) === "subscribed" ? `<p class="nl-note">You're subscribed on this device.</p>` : ""}${form("page")}
    <ul class="nl-points"><li>One email for each new outing, sent once the day is fully up.</li><li>The date, its best photograph, the animals, and a link straight to the outing.</li><li>Your address is used for nothing else. Every email has a one-click unsubscribe.</li></ul></div>`;
    }
    const html = `<div class="wrap page nl-page">
  ${h.pageHead("Dispatches by email", confirm || unsub ? "One moment…" : "From the field, by email", confirm || unsub ? "" : "A short note whenever a new outing goes up: where it was, what was there, and the photographs.")}
  <div class="nl-grid">${main}${preview ? `<div class="nl-side"><div class="sc nl-side-h">The latest dispatch</div>${preview}</div>` : ""}</div>
</div>`;
    return { html, title: "Dispatches by email", after: (root, signal) => mount(root, signal, h) };
  }
  function mount(root, signal, h) {
    const st = root.querySelector(".nl-state[data-token]");
    if (!st) return;
    const token = st.dataset.token, act = st.dataset.do;
    const title = (t) => { const h1 = root.querySelector(".page-head h1"); if (h1) h1.textContent = t; document.title = `${t} · ${(app().site && app().site.title) || "Georgiadis Photography"}`; };
    const run = (action) => call({ action, token }).then((r) => {
      if (signal.aborted) return;
      if (r && r.ok && r.state === "confirmed") {
        store.set(KEY, "subscribed");
        paint();
        title("You're subscribed");
        st.innerHTML = `<div class="nl-done"><p>${r.email ? `Dispatches will come to <span class="nl-addr">${h.esc(r.email)}</span>` : "Dispatches will come to your inbox"} whenever a new outing goes up. The latest is here already.</p><a class="btn primary" href="#/outings">Browse the outings ${h.ICON.arrow}</a></div>`;
      } else if (r && r.ok && r.state === "unsubscribed") {
        if (store.get(KEY) === "subscribed" || store.get(KEY) === "pending") store.set(KEY, "seen");
        paint();
        title("You're unsubscribed");
        st.innerHTML = `<div class="nl-done"><p>${r.email ? `<span class="nl-addr">${h.esc(r.email)}</span> won't` : "You won't"} receive any more dispatches. The gallery is here whenever you'd like to look in.</p><button class="btn" type="button" data-nl="again">Changed your mind? Subscribe again</button></div>`;
        const again = st.querySelector('[data-nl="again"]');
        again.addEventListener("click", () => { again.disabled = true; run("confirm"); }, { signal });
      } else {
        title("That link has expired");
        st.innerHTML = `<div class="nl-done"><p>It may have been used already, or copied only in part. You can sign up again here:</p>${form("page")}</div>`;
      }
    }).catch(() => {
      if (signal.aborted) return;
      title("The newsletter couldn't be reached");
      st.innerHTML = `<div class="nl-done"><p>Please try the link again in a moment.</p><button class="btn" type="button" data-nl="retry">Try again</button></div>`;
      st.querySelector('[data-nl="retry"]').addEventListener("click", () => { st.innerHTML = `<p class="nl-wait">One moment…</p>`; run(act); }, { signal });
    });
    run(act);
  }

  (GP.views = GP.views || []).push({ id: "newsletter", label: "Dispatches by email", nav: false, render });
  GP.newsletter = { button, footLink, paint, show, hide, call, watch, get state() { return store.get(KEY); }, get open() { return open(); } };
})(window.GP = window.GP || {});
