/* Georgiadis Photography: the sky over Central Florida. Where the sun and moon stand at any
   moment, the colour of the sky they make, and the local time there. The header carries the sky
   as it is right now (with tonight's moon after dark); the viewer's almanac, the outing stories
   and "At this hour" use the same reckoning for the moments the photographs were made. */
(function (GP) {
  "use strict";
  const LAT = 28.54, LON = -81.38, TZ = "America/New_York";
  const R = Math.PI / 180;
  const M = () => GP.model;

  /* ---------- time ---------- */
  // A capture time is Florida wall-clock time; this is its moment in UTC.
  function utcOfLocal(y, mo, d, hh = 12, mi = 0, ss = 0) {
    return Date.UTC(y, mo - 1, d, hh, mi, ss) - M().easternOffset(y, mo, d) * 3600e3;
  }
  function photoMs(x) {
    const c = x && x.cap;
    return c ? utcOfLocal(c.y, c.mo, c.d, c.hh == null ? 12 : c.hh, c.mi || 0, c.ss || 0) : null;
  }
  let fmtParts = null;
  // Florida's local date and time at a moment (the visitor may be anywhere).
  function local(ms = Date.now()) {
    try {
      fmtParts = fmtParts || new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" });
      const p = Object.fromEntries(fmtParts.formatToParts(new Date(ms)).map((o) => [o.type, o.value]));
      return { y: +p.year, mo: +p.month, d: +p.day, hh: +p.hour % 24, mi: +p.minute };
    } catch (e) {
      const off = M().easternOffset(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth() + 1, new Date(ms).getUTCDate());
      const t = new Date(ms + off * 3600e3);
      return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), hh: t.getUTCHours(), mi: t.getUTCMinutes() };
    }
  }
  function clock(mins) {
    if (mins == null || !isFinite(mins)) return "";
    const m = ((Math.round(mins) % 1440) + 1440) % 1440, hh = Math.floor(m / 60), mi = m % 60;
    return `${((hh + 11) % 12) + 1}:${String(mi).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`;
  }

  /* ---------- the sun ---------- */
  // Altitude and azimuth (degrees, azimuth from north through east) of the sun at a moment.
  function sunAt(ms, lat = LAT, lon = LON) {
    const d = ms / 864e5 + 2440587.5 - 2451545.0;
    const g = ((357.529 + 0.98560028 * d) % 360) * R;
    const q = (280.459 + 0.98564736 * d) % 360;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R;
    const e = (23.439 - 0.00000036 * d) * R;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    const H = ((gmst * 15 + lon) * R) - ra;
    const la = lat * R;
    const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H));
    return { alt: alt / R, az: ((az / R) + 360) % 360 };
  }
  const COMPASS = ["north", "north-northeast", "northeast", "east-northeast", "east", "east-southeast", "southeast", "south-southeast", "south", "south-southwest", "southwest", "west-southwest", "west", "west-northwest", "northwest", "north-northwest"];
  const compass = (az) => COMPASS[Math.round(az / 22.5) % 16];

  /* ---------- the moon ---------- */
  const SYNODIC = 29.530588853, NEW0 = Date.UTC(2000, 0, 6, 18, 14);
  function moonAt(ms) {
    const age = ((((ms - NEW0) / 864e5) % SYNODIC) + SYNODIC) % SYNODIC;
    const phase = age / SYNODIC;
    const lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
    const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
    const name = names[Math.round(phase * 8) % 8];
    return { phase, lit, age, name, waxing: phase < 0.5 };
  }
  // A small drawing of the moon's phase.
  function moonSvg(phase, size = 18, cls = "moon") {
    const r = 10, lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
    const k = Math.abs(1 - 2 * lit) * r; // the terminator's half-width
    const waxing = phase < 0.5;
    // the lit limb, then the terminator back (bulging out for gibbous, in for crescent)
    const sweepLimb = waxing ? 1 : 0, sweepTerm = (lit > 0.5) === waxing ? 1 : 0;
    const d = `M12 2 A${r} ${r} 0 0 ${sweepLimb} 12 22 A${k.toFixed(2)} ${r} 0 0 ${sweepTerm} 12 2Z`;
    return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><circle cx="12" cy="12" r="${r}" class="moon-dark"/>${lit > 0.02 ? `<path d="${d}" class="moon-lit"/>` : ""}</svg>`;
  }

  /* ---------- the colour of the sky ---------- */
  const STOPS = [
    [-90, "#04060d", "#090d1d"], [-18, "#060a1a", "#10182f"], [-12, "#0c1430", "#222b55"], [-6, "#18264f", "#4b4878"],
    [-3, "#263a70", "#a6627a"], [0, "#38558f", "#e2845e"], [4, "#5272aa", "#efae66"], [8, "#5b88c1", "#f1cd97"],
    [15, "#5b92d2", "#dde4dd"], [30, "#4d8ed8", "#cde1f1"], [90, "#3c82d6", "#c2ddf4"],
  ];
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const toHex = (a) => "#" + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
  function skyAt(alt, az = 180) {
    let i = 0;
    while (i < STOPS.length - 2 && alt > STOPS[i + 1][0]) i++;
    const [a0, t0, h0] = STOPS[i], [a1, t1, h1] = STOPS[i + 1];
    const t = Math.max(0, Math.min(1, (alt - a0) / (a1 - a0)));
    let top = mix(t0, t1, t), hz = mix(h0, h1, t);
    // dawn leans rose, dusk leans amber
    if (alt > -8 && alt < 8) { const k = (1 - Math.abs(alt) / 8) * 0.22; hz = mix(hz, az < 180 ? "#f19ab0" : "#f08a3c", k); }
    const mid = mix(top, hz, 0.45);
    return { top, mid, hz, night: alt < -6, dark: alt < -1 };
  }
  function phaseOf(alt) {
    if (alt < -18) return "Night";
    if (alt < -12) return "Astronomical twilight";
    if (alt < -6) return "Nautical twilight";
    if (alt < 0) return "Civil twilight";
    if (alt < 6) return "Golden hour";
    return "Daylight";
  }

  /* ---------- a moment, described ---------- */
  function at(ms) {
    const L = local(ms), sun = sunAt(ms), moon = moonAt(ms), st = M().sunTimes(L.y, L.mo, L.d);
    const mins = L.hh * 60 + L.mi;
    return { ms, local: L, mins, time: clock(mins), sun, moon, sky: skyAt(sun.alt, sun.az), rise: st.rise, set: st.set, light: M().lightOf(mins, st), phase: phaseOf(sun.alt) };
  }
  function now() {
    const a = at(Date.now());
    const evts = [["Sunrise", a.rise], ["Golden hour ends", a.rise + 60], ["Golden hour", a.set - 60], ["Sunset", a.set], ["Dark", a.set + 40]];
    const next = evts.find(([, t]) => t > a.mins);
    a.next = next ? { what: next[0], in: Math.round(next[1] - a.mins), at: clock(next[1]) } : { what: "Sunrise", in: Math.round(1440 - a.mins + a.rise), at: clock(a.rise) };
    return a;
  }
  // The sky at the moment a photograph was made.
  function forPhoto(x) {
    const ms = photoMs(x);
    if (ms == null || !x.hasTime) return null;
    return at(ms);
  }
  function inWords(mins) {
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${h} hour${h === 1 ? "" : "s"}${m >= 10 ? ` ${m} min` : ""}`;
  }

  /* ---------- the header ---------- */
  function button() {
    return `<button class="icon-btn sky-btn" data-act="sky" aria-label="The sky over Central Florida now" aria-expanded="false" title="The sky over Central Florida"><span class="sky-win" aria-hidden="true"><i class="sky-sun"></i><span class="sky-moon"></span></span></button>`;
  }
  let timer = 0, card = null;
  function paint() {
    const a = now(), s = a.sky, root = document.documentElement.style;
    root.setProperty("--sky-top", s.top);
    root.setProperty("--sky-mid", s.mid);
    root.setProperty("--sky-hz", s.hz);
    document.documentElement.classList.toggle("sky-dark", s.dark);
    for (const b of document.querySelectorAll(".sky-btn")) {
      // the sun climbs a small arc from east (left) to west (right); the moon stands in after dark
      const day = Math.max(0, Math.min(1, (a.mins - a.rise) / (a.set - a.rise)));
      const sun = b.querySelector(".sky-sun");
      sun.style.left = (12 + day * 76).toFixed(1) + "%";
      sun.style.bottom = (Math.max(-30, Math.min(70, a.sun.alt * 1.1)) + 14).toFixed(1) + "%";
      b.querySelector(".sky-moon").innerHTML = s.dark ? moonSvg(a.moon.phase, 14) : "";
      b.classList.toggle("night", s.dark);
      b.title = `Central Florida, ${a.time}: ${a.light || a.phase}${s.dark ? ` · ${a.moon.name.toLowerCase()}` : ""}`;
    }
    if (card && !card.hidden) fillCard();
  }
  function fillCard() {
    const a = now(), h = GP.app.helpers;
    card.innerHTML = `<div class="sky-card-sky" style="--a:${a.sky.top};--b:${a.sky.mid};--c:${a.sky.hz}">${a.sky.dark ? moonSvg(a.moon.phase, 34, "moon big") : `<i class="sky-card-sun" style="bottom:${Math.max(4, Math.min(80, a.sun.alt * 1.2 + 8)).toFixed(0)}%;left:${(8 + Math.max(0, Math.min(1, (a.mins - a.rise) / (a.set - a.rise))) * 84).toFixed(0)}%"></i>`}<span class="sky-card-hz"></span></div>
<div class="sky-card-t"><div class="sc">Central Florida · now</div><b class="display">${h.esc(a.time)}</b><span>${h.esc(a.light === "Night" ? a.phase : a.light || a.phase)}${a.sun.alt > -18 && a.sun.alt < 60 ? ` · sun ${a.sun.alt >= 0 ? Math.round(a.sun.alt) + "° up" : Math.round(-a.sun.alt) + "° below the horizon"} in the ${compass(a.sun.az)}` : ""}</span></div>
<dl class="sky-card-dl"><div><dt>Sunrise</dt><dd>${h.esc(clock(a.rise))}</dd></div><div><dt>Sunset</dt><dd>${h.esc(clock(a.set))}</dd></div><div><dt>${h.esc(a.next.what)}</dt><dd>in ${h.esc(inWords(a.next.in))}</dd></div><div><dt>Moon</dt><dd>${moonSvg(a.moon.phase, 13)} ${h.esc(a.moon.name)}, ${Math.round(a.moon.lit * 100)}% lit</dd></div></dl>
<p class="sky-card-p">The bar across the top of the page is this sky, recoloured every minute. Every photograph's own sky is in its details.</p>`;
  }
  function toggleCard(btn) {
    if (!card) {
      card = document.createElement("div");
      card.className = "sky-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-label", "The sky over Central Florida");
      card.hidden = true;
      document.body.appendChild(card);
      document.addEventListener("pointerdown", (e) => { if (!card.hidden && !card.contains(e.target) && !e.target.closest(".sky-btn")) closeCard(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !card.hidden) closeCard(); });
      addEventListener("scroll", () => { if (!card.hidden) closeCard(); }, { passive: true });
    }
    if (!card.hidden) { closeCard(); return; }
    fillCard();
    const r = btn.getBoundingClientRect();
    card.style.top = r.bottom + 10 + "px";
    card.style.right = Math.max(12, innerWidth - r.right - 8) + "px";
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add("on"));
    btn.setAttribute("aria-expanded", "true");
  }
  function closeCard() {
    if (!card) return;
    card.classList.remove("on");
    card.hidden = true;
    document.querySelectorAll(".sky-btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
  }
  function start() {
    paint();
    clearInterval(timer);
    timer = setInterval(paint, 60e3);
  }
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest('[data-act="sky"]'); if (b) { e.preventDefault(); toggleCard(b); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) paint(); });

  GP.sky = { LAT, LON, local, clock, utcOfLocal, photoMs, sunAt, moonAt, moonSvg, skyAt, phaseOf, at, now, forPhoto, compass, inWords, button, paint, start };
})(window.GP = window.GP || {});
