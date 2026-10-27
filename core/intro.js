/* Georgiadis Photography: the first look. On a visitor's first visit the home page opens through a
   viewfinder. It is the first thing on screen: while the archive loads, the autofocus points blink
   and the brackets hunt; once the opening photograph has arrived they slide onto its subject, lock
   with a green dot, and the shutter's curtains open on it. It plays once, and any key, click or
   scroll skips it. Reduced motion skips it entirely. */
(function (GP) {
  "use strict";
  const KEY = "gp-intro";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return "1"; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
  };
  const I = { el: null, done: false, started: false, timers: [], guard: 0 };
  const home = () => /^#?\/?$/.test(location.hash);
  function shouldRun() {
    if (I.done || store.get(KEY) || (GP.app && GP.app.workshop)) return false;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    if (/[?&]nointro\b/.test(location.search + location.hash)) return false;
    return true;
  }
  const at = (ms, fn) => I.timers.push(setTimeout(fn, ms));
  function build() {
    const el = document.createElement("div");
    el.className = "gp-intro";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<div class="gi-vf"><div class="gi-mat"></div>
  <div class="gi-af">${Array.from({ length: 11 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
  <div class="gi-br" style="--x:50%;--y:46%"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i><b></b></div>
  <div class="gi-lcd"><span class="gi-ss">----</span><span class="gi-f">F--</span><span class="gi-meter"><i></i><i></i><i></i><i class="z"></i><i></i><i></i><i></i></span><span class="gi-iso">ISO --</span><span class="gi-fc">[----]</span><span class="gi-dot">●</span></div></div>
<div class="gi-cur top"></div><div class="gi-cur bot"></div>
<button class="gi-skip" type="button">Skip</button>`;
    document.body.appendChild(el);
    document.documentElement.classList.add("gp-intro-on");
    el.addEventListener("click", skip);
    addEventListener("keydown", skip, true);
    addEventListener("wheel", skip, { capture: true, passive: true });
    addEventListener("touchstart", skip, { capture: true, passive: true });
    addEventListener("hashchange", skip);
    I.el = el;
    requestAnimationFrame(() => el.classList.add("on"));
  }
  function off() {
    removeEventListener("keydown", skip, true);
    removeEventListener("wheel", skip, true);
    removeEventListener("touchstart", skip, true);
    removeEventListener("hashchange", skip);
  }
  // fast: skipped or abandoned; seen: remember it so it never plays again
  function finish(fast, seen = true) {
    if (I.done || !I.el) return;
    I.done = true;
    if (seen) store.set(KEY, "1");
    I.timers.forEach(clearTimeout);
    clearTimeout(I.guard);
    off();
    const el = I.el;
    el.classList.remove("wait");
    el.classList.add(fast ? "skip" : "open");
    setTimeout(() => { el.remove(); document.documentElement.classList.remove("gp-intro-on"); }, fast ? 380 : 900);
  }
  function skip() { finish(true); }

  // Called by the site's start-up script before the archive has loaded, so that a new visitor's
  // first sight is the viewfinder rather than a loading screen.
  function early() {
    if (I.el || !home() || !shouldRun()) return false;
    build();
    I.el.classList.add("on", "wait");
    // the archive never arrived: get out of the way of the error message
    I.guard = setTimeout(() => finish(true, false), 15000);
    return true;
  }
  // The home page is ready. x: the opening photograph (its subject point and exposure set the
  // scene); img: its element, so the shutter opens once it has loaded.
  function run(x, frames, img) {
    if (I.started) return false;
    if (!I.el) { if (!shouldRun()) return false; build(); }
    I.started = true;
    clearTimeout(I.guard);
    const e = (x && x.exif) || {}, el = I.el;
    const fp = (x && x.fp) || [0.5, 0.45];
    el.querySelector(".gi-ss").textContent = e.ss ? GP.model.shutter(e.ss).replace(/ s$/, "") : "1/1000";
    el.querySelector(".gi-f").textContent = e.f ? "F" + +(+e.f).toFixed(1) : "F5.6";
    el.querySelector(".gi-iso").textContent = e.iso ? "ISO " + e.iso : "ISO 400";
    el.querySelector(".gi-fc").textContent = `[${Math.min(9999, frames || 0)}]`;
    const go = () => {
      if (I.done) return;
      const br = el.querySelector(".gi-br");
      br.style.setProperty("--x", (fp[0] * 100).toFixed(1) + "%");
      br.style.setProperty("--y", (fp[1] * 100).toFixed(1) + "%");
      el.classList.remove("wait");
      el.classList.add("hunt");
      at(1000, () => el.classList.add("lock"));
      at(1500, () => el.classList.add("fire"));
      at(1630, () => finish(false));
    };
    // hold for the photograph (briefly), so the curtains open on it rather than on its placeholder
    if (img && !(img.complete && img.naturalWidth)) {
      const t = setTimeout(go, 2600);
      img.addEventListener("load", () => { clearTimeout(t); go(); }, { once: true });
      img.addEventListener("error", () => { clearTimeout(t); go(); }, { once: true });
    } else at(el.classList.contains("on") ? 120 : 380, go);
    return true;
  }
  // The archive couldn't be shown (an error, or nothing published yet).
  function cancel() { finish(true, false); }
  GP.intro = { early, run, cancel, shouldRun, reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } } };
})(window.GP = window.GP || {});
