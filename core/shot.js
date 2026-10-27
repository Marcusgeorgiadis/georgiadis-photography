/* Georgiadis Photography: how a photograph was made, and the sky it was made under.
   "How it was shot" turns the exposure into pictures: the aperture's blades closing to the
   f-number, the shutter's slit sweeping the frame and how far the subject moved while it was open,
   and the slice of the world the focal length took in. "The sky that moment" draws where the sun
   stood, the light it made and the moon that night. Both live in the viewer's details (H opens them). */
(function (GP) {
  "use strict";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const H = () => GP.app.helpers;

  // Rough cruising speeds (km/h) and body lengths (cm) by family, for "how far it moved".
  const FAM = {
    Ardeidae: [30, 70], Threskiornithidae: [40, 65], Anhingidae: [35, 85], Phalacrocoracidae: [50, 80], Pandionidae: [40, 55], Accipitridae: [40, 50],
    Cathartidae: [35, 65], Falconidae: [45, 35], Strigidae: [30, 45], Alcedinidae: [40, 30], Picidae: [25, 23], Anatidae: [65, 50], Rallidae: [30, 33],
    Aramidae: [35, 65], Gruidae: [45, 110], Pelecanidae: [40, 125], Laridae: [40, 42], Scolopacidae: [45, 20], Charadriidae: [45, 22], Columbidae: [55, 30],
    Ciconiidae: [40, 100], Icteridae: [30, 28], Mimidae: [25, 24], Tyrannidae: [25, 18], Cardinalidae: [25, 21], Corvidae: [35, 45], Trochilidae: [40, 9],
    Libellulidae: [30, 4.5], Aeshnidae: [35, 7],
  };
  const DEFAULT = [35, 40];
  function cropFactor(cam) {
    if (/\bD(3|5|7)\d{3}\b|\bD(300|500|90)\b|Z ?(50|fc|30)\b|APS-C|EOS (\d{2,3}D|Rebel)/i.test(cam || "")) return 1.5;
    if (/\bD(6|7|8)\d{2}\b|\bD(4|5|6)\b|Z ?(5|6|7|8|9)\b|full frame/i.test(cam || "")) return 1;
    return 1.5;
  }
  function lensRange(lens) {
    const m = /(\d+)\s*[–-]\s*(\d+)\s*mm\s*f\/([\d.]+)\s*[–-]\s*([\d.]+)/i.exec(lens || "");
    return m ? { f0: +m[1], f1: +m[2], a0: +m[3], a1: +m[4] } : null;
  }
  // The widest aperture the lens has at this focal length (zooms get slower as they zoom).
  function wideOpen(x) {
    const L = lensRange(x.exif.lens), fl = x.exif.fl;
    if (!L || !fl) return Math.min(x.exif.f || 4, 4);
    const k = Math.max(0, Math.min(1, (fl - L.f0) / Math.max(1, L.f1 - L.f0)));
    return L.a0 + (L.a1 - L.a0) * k;
  }
  const stops = (a, b) => 2 * Math.log2(b / a);
  function fmtLen(m) {
    if (m < 0.001) return `${+(m * 1e6 / 1000).toFixed(2)} mm`;
    if (m < 0.01) return `${+(m * 1000).toFixed(1)} mm`;
    if (m < 1) return `${+(m * 100).toFixed(1)} cm`;
    return `${+m.toFixed(2)} m`;
  }
  function fraction(n) { return n >= 1 ? `${+n.toFixed(1)} times` : `1/${Math.round(1 / n)}`; }

  /* ---------- the aperture ---------- */
  function iris(r, R = 46, n = 7) {
    // the opening is a regular polygon; each blade runs from one side of it out past the rim
    const turn = (1 - r / R) * 0.9;
    const pts = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + turn; return [Math.cos(a) * r, Math.sin(a) * r]; });
    const blades = pts.map((p, i) => {
      const q = pts[(i + 1) % n];
      const a1 = Math.atan2(q[1], q[0]) + 0.55, a0 = Math.atan2(p[1], p[0]) + 0.55;
      const o1 = [Math.cos(a1) * (R + 8), Math.sin(a1) * (R + 8)], o0 = [Math.cos(a0) * (R + 8), Math.sin(a0) * (R + 8)];
      return `<path d="M${p[0].toFixed(2)},${p[1].toFixed(2)} L${q[0].toFixed(2)},${q[1].toFixed(2)} L${o1[0].toFixed(2)},${o1[1].toFixed(2)} L${o0[0].toFixed(2)},${o0[1].toFixed(2)}Z"/>`;
    }).join("");
    return blades;
  }

  /* ---------- the panel ---------- */
  function panel(x) {
    const h = H(), e = x.exif || {};
    if (!e.ss && !e.f && !e.fl) return "";
    const sp = x.spKey ? GP.app.model.speciesByKey.get(x.spKey) : null;
    const [kmh, cm] = FAM[x.family] || DEFAULT;
    const flying = (x.behaviours || []).includes("In flight");
    const name = sp ? sp.name.replace(/ sp\.$/, "") : "the subject";
    // shutter: how far things moved while it was open
    let moved = "";
    if (e.ss) {
      const v = flying ? kmh / 3.6 : x.group === "bird" ? 1.2 : x.cls === "Insecta" ? 2 : 0.6;
      const d = v * e.ss, body = cm / 100;
      moved = flying
        ? `A ${h.esc(name)} cruises at about ${kmh} km/h. In ${h.esc(GP.model.shutter(e.ss))} it moved ${fmtLen(d)}, ${d / body < 0.02 ? `about ${fraction(d / body)} of its own length: frozen` : `${Math.round((d / body) * 100)}% of its own length: a hint of blur`}.`
        : `Even a quick turn of the head (about ${+(v * 3.6).toFixed(1)} km/h) moves just ${fmtLen(d)} in ${h.esc(GP.model.shutter(e.ss))}: ${d < 0.002 ? "nothing can blur" : "barely a blur"}.`;
    }
    const sync = 1 / 200, slit = e.ss ? Math.max(0.03, Math.min(1, e.ss / sync)) : 1;
    // aperture
    const wo = wideOpen(x), fnum = e.f || wo, R = 46;
    const r = Math.max(5, R * Math.min(1, wo / fnum) * 0.86);
    const st = stops(wo, fnum);
    // field of view
    const crop = cropFactor(e.cam), fl = e.fl || 0;
    const hfov = fl ? 2 * Math.atan(36 / (2 * fl * crop)) * 180 / Math.PI : 0;
    const eq = Math.round(fl * crop);
    const coin = hfov ? (2 * 0.65 * Math.tan((hfov / 2) * Math.PI / 180) * 100) : 0; // the width it spans at arm's length, cm
    const cone = (deg, len) => { const a = (deg / 2) * Math.PI / 180; return `M60,110 L${(60 - Math.sin(a) * len).toFixed(1)},${(110 - Math.cos(a) * len).toFixed(1)} A${len},${len} 0 0 1 ${(60 + Math.sin(a) * len).toFixed(1)},${(110 - Math.cos(a) * len).toFixed(1)} Z`; };
    return `<section class="shot" aria-label="How it was shot">
  <div class="sc">How it was shot</div>
  <div class="shot-grid">
    <figure class="shot-card shot-iris"><svg viewBox="-60 -60 120 120" aria-hidden="true"><defs><radialGradient id="iris-sky-${h.esc(x.id)}" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="#f4f8fc"/><stop offset=".55" stop-color="#a9c2dc"/><stop offset="1" stop-color="#5f7d9e"/></radialGradient></defs><circle r="${R + 8}" class="rim" fill="url(#iris-sky-${h.esc(x.id)})"/><g class="blades" data-r="${r.toFixed(2)}" data-r0="${(R * 0.86).toFixed(2)}">${iris(R * 0.86, R)}</g><circle r="${R + 8}" class="rim2"/></svg>
      <figcaption><b class="mono">f/${+(+fnum).toFixed(1)}</b><span>${st > 0.15 ? `Stopped down ${+st.toFixed(1)} stop${Math.abs(st - 1) < 0.05 ? "" : "s"} from the lens's f/${+wo.toFixed(1)}, for a little more depth in focus.` : `Wide open, as much light as the lens lets in, and the softest background it can give.`}</span></figcaption></figure>
    <figure class="shot-card shot-shutter"><div class="shot-frame" style="--slit:${(slit * 100).toFixed(1)}%"><i class="shot-slit"></i><span class="shot-subj"></span></div>
      <figcaption><b class="mono">${h.esc(e.ss ? GP.model.shutter(e.ss) : "")}</b><span>${moved}</span></figcaption></figure>
    ${hfov ? `<figure class="shot-card shot-fov"><svg viewBox="0 0 120 120" aria-hidden="true"><path d="${cone(46, 96)}" class="eye"/><path d="${cone(hfov, 104)}" class="lens"/><circle cx="60" cy="110" r="3.5" class="cam"/><text x="60" y="${(110 - 96 * Math.cos(23 * Math.PI / 180) - 6).toFixed(0)}" text-anchor="middle" class="eye-t">your eye</text></svg>
      <figcaption><b class="mono">${Math.round(fl)} mm</b><span>A ${hfov < 10 ? hfov.toFixed(1) : Math.round(hfov)}° slice of the world${crop !== 1 ? ` (like ${eq} mm on full frame)` : ""}, as wide as a ${coin < 10 ? coin.toFixed(1) : Math.round(coin)} cm card held at arm's length.</span></figcaption></figure>` : ""}
    ${e.iso ? `<figure class="shot-card shot-iso"><div class="shot-grain" style="--g:${Math.min(1, Math.log2(Math.max(100, e.iso) / 100) / 6).toFixed(2)}"></div><figcaption><b class="mono">ISO ${e.iso}</b><span>${e.iso <= 200 ? "The sensor at its cleanest: plenty of light." : `The signal turned up ${+Math.log2(e.iso / 100).toFixed(1)} stops from ISO 100${e.iso >= 1600 ? ": the light was going" : ""}.`}</span></figcaption></figure>` : ""}
  </div>
  ${e.cam || e.lens ? `<p class="shot-gear mono">${h.esc([e.cam, e.lens].filter(Boolean).join(" · "))}</p>` : ""}
</section>`;
  }

  /* ---------- the sky that moment ---------- */
  function almanac(x) {
    const a = GP.sky && GP.sky.forPhoto(x);
    if (!a) return "";
    const h = H(), s = a.sky;
    const up = a.sun.alt >= 0;
    // the dome: east on the left, west on the right, the sun at its height
    const az = a.sun.az, alt = Math.max(-12, a.sun.alt);
    const xPos = Math.max(4, Math.min(96, ((az - 60) / 240) * 100));
    const yPos = Math.max(-8, Math.min(88, (alt / 70) * 80));
    const rel = (m) => { const d = Math.round(a.mins - m); return d >= 0 ? `${GP.sky.inWords(d)} after` : `${GP.sky.inWords(-d)} before`; };
    const note = Math.abs(a.mins - a.set) < 90 ? `${rel(a.set)} sunset` : Math.abs(a.mins - a.rise) < 90 ? `${rel(a.rise)} sunrise` : up ? `${Math.round(a.sun.alt)}° up in the ${GP.sky.compass(az)}` : `${Math.round(-a.sun.alt)}° below the horizon`;
    return `<section class="alm" aria-label="The sky that moment">
  <div class="sc">The sky that moment</div>
  <div class="alm-dome" style="--a:${s.top};--b:${s.mid};--c:${s.hz}">
    <span class="alm-arc"></span>
    ${up ? `<i class="alm-sun" style="left:${xPos.toFixed(1)}%;bottom:${(12 + yPos).toFixed(1)}%"></i>` : `<span class="alm-moon" style="left:${xPos > 50 ? 22 : 72}%">${GP.sky.moonSvg(a.moon.phase, 22, "moon")}</span>`}
    <span class="alm-ground"></span><span class="alm-e">E</span><span class="alm-s">S</span><span class="alm-w">W</span>
    <b class="alm-time display">${h.esc(GP.sky.clock(a.mins))}</b>
  </div>
  <dl class="alm-dl"><div><dt>Light</dt><dd>${h.esc(x.light || a.phase)}</dd></div><div><dt>The sun</dt><dd>${h.esc(note)}</dd></div>
    <div><dt>Sunrise · sunset</dt><dd>${h.esc(GP.sky.clock(a.rise))} · ${h.esc(GP.sky.clock(a.set))}</dd></div>
    <div><dt>The moon</dt><dd>${GP.sky.moonSvg(a.moon.phase, 13)} ${h.esc(a.moon.name)}, ${Math.round(a.moon.lit * 100)}% lit</dd></div></dl>
</section>`;
  }

  /* ---------- bringing them to life ---------- */
  function mount(root) {
    if (!root) return;
    const g = root.querySelector(".shot-iris .blades");
    if (g) {
      const r1 = +g.dataset.r, r0 = +g.dataset.r0;
      if (reduced() || Math.abs(r0 - r1) < 0.5) g.innerHTML = iris(r1, 46);
      else {
        // the blades close from wide open to the f-number, the way the lens did as the shutter fired
        const t0 = performance.now(), d = 1100;
        const step = (t) => {
          if (!g.isConnected) return;
          const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
          g.innerHTML = iris(r0 + (r1 - r0) * e, 46);
          if (k < 1) requestAnimationFrame(step);
        };
        setTimeout(() => requestAnimationFrame(step), 350);
      }
    }
    root.querySelectorAll(".shot-card, .alm").forEach((c, i) => { c.style.setProperty("--i", i); c.classList.add("shown"); });
  }

  GP.shot = { panel, almanac, mount, cropFactor, wideOpen };
})(window.GP = window.GP || {});
