/* Georgiadis Photography: Name that bird. Ten rounds; each opens on a tight crop around the
   bird and offers four names. Answer, and the crop opens out to the whole frame with its field
   note. A recording of the call is there as a hint, for half a point. There's also a daily
   challenge (the same ten for everyone that day, with a streak) and Name that call, where you
   hear the bird before you see it. */
(function (GP) {
  "use strict";
  const ROUNDS = 10;
  const LEVELS = {
    easy: { label: "Field mark", k: 1.8, blurb: "A generous crop, and the wrong answers come from other families." },
    hard: { label: "Expert", k: 3.1, blurb: "A tight crop, and the wrong answers are close relatives." },
    call: { label: "Name that call", k: 1, blurb: "Listen first. The photograph appears when you answer.", calls: true },
  };
  const TITLES = [[10, "Field-guide perfect"], [8, "Sharp-eyed birder"], [6, "Keen observer"], [3, "Getting your eye in"], [0, "Time for binoculars"]];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
  };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let rnd = Math.random;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  // The daily challenge draws from a generator seeded with the date, so everyone gets the same ten.
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dayBefore = (iso) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dailyLog = () => { try { return JSON.parse(store.get("gp-quiz-daily") || "{}"); } catch (e) { return {}; } };
  function dailyStatus() {
    const log = dailyLog(), t = today();
    let streak = 0, d = log[t] != null ? t : dayBefore(t);
    while (log[d] != null) { streak++; d = dayBefore(d); }
    return { date: t, played: log[t] != null, score: log[t], streak };
  }

  function pool(model, calls) {
    // wild birds identified to species, each with its good, confidently named photographs
    return model.life.filter((s) => s.cls === "Aves" && s.bin && (!calls || (s.call && GP.calls))).map((s) => {
      const ph = s.photos.filter((x) => !x.unsure && x.group === "bird" && (x.rating >= 3 || x.isHero) && x.ar > 0.5 && x.ar < 2.2);
      return { s, ph: ph.sort((a, b) => b.score - a.score).slice(0, 8) };
    }).filter((e) => e.ph.length);
  }
  function makeRounds(model, level) {
    const P = pool(model, LEVELS[level].calls), birds = model.life.filter((s) => s.cls === "Aves" && s.bin);
    if (P.length < 4 || birds.length < 4) return null;
    return shuffle(P.slice()).slice(0, ROUNDS).map(({ s, ph }) => {
      const x = pick(ph.slice(0, 5));
      let others;
      if (level === "hard") {
        const fam = shuffle(birds.filter((o) => o !== s && o.family === s.family));
        const ord = shuffle(birds.filter((o) => o !== s && o.family !== s.family && o.order === s.order));
        const rest = shuffle(birds.filter((o) => o !== s && o.order !== s.order));
        others = fam.concat(ord, rest).slice(0, 3);
      } else {
        const fams = new Set([s.family]);
        others = [];
        for (const o of shuffle(birds.filter((b) => b !== s))) { if (others.length === 3) break; if (!fams.has(o.family)) { fams.add(o.family); others.push(o); } }
        if (others.length < 3) others = others.concat(shuffle(birds.filter((b) => b !== s && !others.includes(b))).slice(0, 3 - others.length));
      }
      return { s, x, options: shuffle([s].concat(others)), answer: null, hint: false, points: 0 };
    });
  }
  function crop(x, k) {
    // translate/scale (origin top-left) that fills the frame with the area around the subject
    // the focus point marks the middle of the bird; the head, which tells most, usually sits a little higher
    const fp = x.fp || [0.5, 0.5], lim = 1 / (2 * k);
    const cx = Math.max(lim, Math.min(1 - lim, fp[0])), cy = Math.max(lim, Math.min(1 - lim, fp[1] - 0.035));
    return `translate(${((0.5 - k * cx) * 100).toFixed(3)}%, ${((0.5 - k * cy) * 100).toFixed(3)}%) scale(${k})`;
  }
  const best = (level) => +(store.get("gp-quiz-best-" + level) || 0);
  const fmtPts = (p) => (Number.isInteger(p) ? String(p) : p.toFixed(1));

  function render({ model, h, q }) {
    rnd = Math.random;
    const P = pool(model);
    const sample = shuffle(P.slice()).slice(0, 3).map((e) => e.ph[0]);
    const ds = dailyStatus();
    const levels = Object.entries(LEVELS).filter(([, L]) => !L.calls || pool(model, true).length >= 6);
    const html = `<section class="ql" aria-labelledby="ql-title">
  <div class="wrap page ql-wrap">
    <div class="ql-intro">
      <div class="ql-copy">
        <div class="kicker">A game from the archive</div>
        <h1 id="ql-title" class="display">Name that bird</h1>
        <p class="lede">Ten photographs, each opening on a close crop around the bird. Choose its name from four, then watch the frame open up. Every bird here was photographed in ${h.esc((model.site && model.site.tagline || "Central Florida").replace(/^.*\bof\s+/i, ""))}.</p>
        <div class="ql-daily${ds.played ? " done" : ""}"><div><span class="sc">Today's challenge · ${h.esc(h.fmtDate(ds.date))}${ds.streak > 1 ? ` · ${ds.streak}-day streak` : ""}</span><b>${ds.played ? `You scored ${fmtPts(ds.score)} of ${ROUNDS} today` : "Ten birds, the same for everyone today"}</b><span>${ds.played ? "A new ten arrives tomorrow." : "One go a day. Keep a streak going."}</span></div>${ds.played ? `<button class="btn" data-q="daily-share">${h.ICON.share} Share today's score</button>` : `<button class="btn primary" data-q="daily">Play today's ten ${h.ICON.arrow}</button>`}</div>
        <div class="ql-levels" role="radiogroup" aria-label="Difficulty">${levels.map(([id, L], i) => `<button class="ql-level" role="radio" aria-checked="${i === 0}" data-level="${id}"><b>${L.label}</b><span>${L.blurb}</span><span class="sc">${best(id) ? `Best ${fmtPts(best(id))} / ${ROUNDS}` : "Not played yet"}</span></button>`).join("")}</div>
        <button class="btn primary ql-start" ${P.length < 4 ? "disabled" : ""}>Start ${h.ICON.arrow}</button>
        ${P.length < 4 ? `<p class="sc">The game needs at least four species of bird in the archive.</p>` : `<p class="sc ql-keys">Keys: 1–4 to answer · H for the call · Enter for the next round</p>`}
      </div>
      <div class="ql-deck" aria-hidden="true">${sample.map((x, i) => `<div class="ql-card" style="--i:${i}"><img src="${h.esc(h.src(x, 1600))}" alt="" style="object-position:${(x.fp[0] * 100).toFixed(1)}% ${(x.fp[1] * 100).toFixed(1)}%"></div>`).join("")}</div>
    </div>
    <div class="ql-game" hidden></div>
    <div class="visually-hidden" aria-live="polite" id="ql-live"></div>
  </div>
</section>`;
    return { html, title: "Name that bird", after: (main, signal) => mount(main, signal, model, h, q) };
  }

  function mount(main, signal, model, h, q) {
    const root = main.querySelector(".ql"), intro = root.querySelector(".ql-intro"), game = root.querySelector(".ql-game"), live = root.querySelector("#ql-live");
    let level = "easy", rounds = null, i = 0, score = 0, streak = 0, bestStreak = 0, daily = false;
    const hasCall = (s) => !!(s.call && GP.calls);

    root.addEventListener("click", (e) => {
      const lv = e.target.closest("[data-level]");
      if (lv) { level = lv.dataset.level; root.querySelectorAll("[data-level]").forEach((b) => b.setAttribute("aria-checked", String(b === lv))); return; }
      if (e.target.closest("[data-q=daily]")) { start(true); return; }
      if (e.target.closest("[data-q=daily-share]")) { const d = dailyStatus(); shareText(`I named ${fmtPts(d.score)} of ${ROUNDS} birds in today's Name that bird (${h.fmtDate(d.date)}) at ${GP.app.site.title || "Georgiadis Photography"}.`, "?daily=1"); return; }
      if (e.target.closest(".ql-start")) { start(false); return; }
      if (e.target.closest("[data-q=again]")) { start(false); return; }
      if (e.target.closest("[data-q=listen]")) { listen(); return; }
      const o = e.target.closest("[data-opt]");
      if (o) { answer(+o.dataset.opt); return; }
      if (e.target.closest("[data-q=hint]")) { hint(); return; }
      if (e.target.closest("[data-q=next]")) { next(); return; }
      if (e.target.closest("[data-q=share]")) { share(); return; }
      if (e.target.closest("[data-q=menu]")) { if (GP.calls && GP.calls.state.playing) GP.calls.pause(true); GP.app.route(); }
    }, { signal });
    document.addEventListener("keydown", (e) => {
      if (game.hidden || e.metaKey || e.ctrlKey || e.altKey || (GP.viewer && GP.viewer.isOpen())) return;
      const r = rounds && rounds[i];
      if (!r) return;
      if (/^[1-4]$/.test(e.key) && r.answer == null) { e.preventDefault(); answer(+e.key - 1); }
      else if ((e.key === "h" || e.key === "H") && r.answer == null) { e.preventDefault(); hint(); }
      else if ((e.key === "Enter" || e.key === "ArrowRight") && r.answer != null) { e.preventDefault(); next(); }
    }, { signal });

    function start(isDaily) {
      daily = !!isDaily;
      if (daily && dailyStatus().played) { GP.app.toast("You've played today's ten. A new ten arrives tomorrow."); return; }
      if (daily) level = "easy";
      if (GP.app.parseHash().q.get("daily")) GP.app.setQuery((qq) => qq.delete("daily"));
      rnd = daily ? seeded("gp-daily-" + today()) : Math.random;
      rounds = makeRounds(model, level);
      rnd = Math.random;
      if (!rounds) return;
      i = 0; score = 0; streak = 0; bestStreak = 0;
      intro.hidden = true; game.hidden = false;
      round();
      window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
    }
    function dots() {
      return `<ol class="ql-dots" aria-label="Rounds">${rounds.map((r, k) => `<li class="${r.answer == null ? (k === i ? "now" : "") : r.points === 1 ? "good" : r.points ? "half" : "bad"}"><span class="visually-hidden">Round ${k + 1}</span></li>`).join("")}</ol>`;
    }
    function round() {
      const r = rounds[i], x = r.x, L = LEVELS[level], blind = !!L.calls;
      game.innerHTML = `<div class="ql-bar"><button class="btn ghost" data-q="menu">${h.ICON.left} ${daily ? "Back" : "Levels"}</button>${dots()}<div class="ql-score"><span class="sc">Score</span> <b>${fmtPts(score)}</b>${streak > 1 ? `<span class="ql-streak sc">${streak} in a row</span>` : ""}</div></div>
<div class="ql-stage">
  <figure class="ql-frame${blind ? " blind" : ""}" data-id="${h.esc(x.id)}" style="--ar:${x.ar.toFixed(4)}">
    <img src="${h.esc(h.src(x, 2560))}" alt="${blind ? "Hidden until you answer" : "A close crop of a bird to identify"}" style="transform-origin:0 0;transform:${blind ? "scale(1.15)" : crop(x, L.k)}" draggable="false">
    ${blind ? `<button class="ql-listen" data-q="listen" aria-label="Play the call">${h.ICON.play}<span>Listen</span></button>` : ""}
    <figcaption class="ql-cap" hidden></figcaption>
  </figure>
  <div class="ql-side">
    <div class="kicker">${daily ? `Today's challenge · ${h.esc(h.fmtShort(today()))}` : `Round ${i + 1} of ${ROUNDS} · ${h.esc(L.label)}`}</div>
    <h2 class="display ql-q">${blind ? "Whose call is this?" : "Which bird is this?"}</h2>
    <div class="ql-opts">${r.options.map((o, k) => `<button class="ql-opt" data-opt="${k}"><kbd>${k + 1}</kbd><span><b>${h.esc(o.name)}</b><i>${h.esc(o.bin)}</i></span></button>`).join("")}</div>
    <div class="ql-tools">${blind ? `<span class="sc">Play the call as often as you like.</span>` : hasCall(r.s) ? `<button class="btn ghost" data-q="hint">${h.ICON.play} Hear its call <span class="sc">½ point</span></button>` : `<span class="sc">No recording of this one: eyes only.</span>`}</div>
    <div class="ql-after" hidden></div>
  </div>
</div>`;
      // fetch the next photograph while this one is played
      const n = rounds[i + 1];
      if (n) { const im = new Image(); im.src = h.src(n.x, 2560); }
      const first = game.querySelector(".ql-opt");
      if (first) first.focus({ preventScroll: true });
      if (blind) listen();
    }
    function listen() {
      const r = rounds[i];
      if (!r || !hasCall(r.s)) return;
      GP.calls.play(r.s.slug, { restart: true });
      const b = game.querySelector(".ql-listen");
      if (b) { b.classList.remove("ping"); void b.offsetWidth; b.classList.add("ping"); }
    }
    function hint() {
      const r = rounds[i];
      if (!r || r.answer != null || !hasCall(r.s)) return;
      r.hint = true;
      GP.calls.play(r.s.slug, { restart: true });
      const b = game.querySelector("[data-q=hint]");
      if (b) { b.disabled = true; b.innerHTML = `${h.ICON.play} Playing the call <span class="sc">worth ½ now</span>`; }
    }
    function answer(k) {
      const r = rounds[i];
      if (!r || r.answer != null) return;
      r.answer = k;
      const right = r.options[k] === r.s;
      r.points = right ? (r.hint ? 0.5 : 1) : 0;
      score += r.points;
      streak = right ? streak + 1 : 0;
      bestStreak = Math.max(bestStreak, streak);
      game.querySelectorAll(".ql-opt").forEach((b, j) => {
        b.disabled = true;
        if (r.options[j] === r.s) b.classList.add("right");
        else if (j === k) b.classList.add("wrong");
        else b.classList.add("dim");
      });
      // open the crop out to the whole frame
      const img = game.querySelector(".ql-frame img"), x = r.x, s = r.s;
      game.querySelector(".ql-frame").classList.remove("blind");
      img.style.transition = reduced() ? "none" : "transform 1300ms cubic-bezier(.2,.75,.2,1)";
      requestAnimationFrame(() => { img.style.transform = "none"; });
      const cap = game.querySelector(".ql-cap");
      cap.innerHTML = `<b>${h.esc(s.name)}</b> · ${h.esc(h.fmtDate(x.t))}${x.light ? " · " + h.esc(x.light) : ""}`;
      cap.hidden = false;
      game.querySelector(".ql-q").textContent = right ? (r.hint ? "Right, with a little help" : "Right") : "Not quite";
      game.querySelector(".ql-q").classList.add(right ? "good" : "bad");
      const note = s.note ? `<p class="ql-note">${h.esc(s.note)}</p>` : "";
      const after = game.querySelector(".ql-after");
      after.innerHTML = `${right ? "" : `<p class="ql-was">It was the <b>${h.esc(s.name)}</b> <i>${h.esc(s.bin)}</i>.</p>`}${note}
<div class="ql-next-row"><button class="btn primary" data-q="next">${i + 1 < ROUNDS ? (LEVELS[level].calls ? "Next call" : "Next photograph") : "See your score"} ${h.ICON.arrow}</button><a class="btn ghost" href="#/species/${h.esc(s.slug)}">About the ${h.esc(s.name)}</a></div>`;
      after.hidden = false;
      const tools = game.querySelector(".ql-tools");
      if (tools) tools.hidden = true;
      game.querySelector(".ql-dots").outerHTML = dots();
      const sc = game.querySelector(".ql-score b");
      sc.textContent = fmtPts(score);
      if (r.points) { sc.classList.remove("bump"); void sc.offsetWidth; sc.classList.add("bump"); }
      live.textContent = right ? `Correct: ${s.name}.` : `Not quite: it was the ${s.name}.`;
      game.querySelector("[data-q=next]").focus({ preventScroll: true });
      // on a small screen the answer buttons sit below the photograph: bring the reveal into view
      const fr = game.querySelector(".ql-frame").getBoundingClientRect(), head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--head-h")) || 64;
      if (fr.top < head) window.scrollBy({ top: fr.top - head - 12, behavior: reduced() ? "auto" : "smooth" });
    }
    function next() {
      if (GP.calls && GP.calls.state.playing) GP.calls.pause(true);
      i++;
      if (i < ROUNDS && rounds[i]) round(); else results();
    }
    function results() {
      const prev = best(level);
      if (!daily && score > prev) store.set("gp-quiz-best-" + level, String(score));
      if (daily) { const log = dailyLog(); log[today()] = score; store.set("gp-quiz-daily", JSON.stringify(log)); }
      const ds = dailyStatus();
      const title = TITLES.find(([n]) => score >= n)[1];
      game.innerHTML = `<div class="ql-res">
  <div class="ql-res-head">
    <div class="kicker">${daily ? `Today's challenge · ${h.esc(h.fmtDate(today()))}` : `${h.esc(LEVELS[level].label)} · ${ROUNDS} ${LEVELS[level].calls ? "calls" : "photographs"}`}</div>
    <div class="ql-big display"><b>${fmtPts(score)}</b><span>/ ${ROUNDS}</span></div>
    <h2 class="display">${h.esc(title)}</h2>
    <p class="sc">${daily ? (ds.streak > 1 ? `${ds.streak}-day streak · come back tomorrow for a new ten` : "Come back tomorrow for a new ten") : score > prev && prev ? `A new best, up from ${fmtPts(prev)}` : score > prev ? "Your first score at this level" : `Your best is ${fmtPts(prev)}`}${bestStreak > 2 ? ` · longest run ${bestStreak} in a row` : ""}</p>
    <div class="ql-next-row"><button class="btn primary" data-q="again">${daily ? "Play a practice round" : "Play again"} ${h.ICON.arrow}</button><button class="btn" data-q="share">${h.ICON.share} Share your score</button><button class="btn ghost" data-q="menu">Change level</button></div>
  </div>
  <ol class="ql-recap">${rounds.map((r) => `<li class="${r.points === 1 ? "good" : r.points ? "half" : "bad"}"><a href="#/species/${h.esc(r.s.slug)}"><span class="ql-recap-img">${h.cover(r.x, 360, "", r.s.name)}</span><span class="ql-mark" aria-hidden="true">${r.points === 1 ? "✓" : r.points ? "½" : "✗"}</span><b>${h.esc(r.s.name)}</b>${r.points === 1 ? "" : `<span class="sc">${r.answer == null ? "skipped" : `you said ${h.esc(r.options[r.answer].name)}`}</span>`}</a></li>`).join("")}</ol>
</div>`;
      live.textContent = `You scored ${fmtPts(score)} out of ${ROUNDS}. ${title}.`;
      game.querySelector("[data-q=again]").focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
    }
    function shareText(text, suffix) {
      const url = location.origin + location.pathname.replace(/[^/]*$/, "") + "#/quiz" + (suffix || "");
      if (navigator.share && matchMedia("(pointer: coarse)").matches) navigator.share({ title: "Name that bird", text, url }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(`${text}\n${url}`).then(() => GP.app.toast("Score copied, ready to paste"), () => GP.app.toast(text));
      else GP.app.toast(text);
    }
    function share() {
      const site = GP.app.site.title || "Georgiadis Photography";
      const marks = rounds.map((r) => (r.points === 1 ? "●" : r.points ? "◐" : "○")).join("");
      const what = LEVELS[level].calls ? "calls" : "birds";
      const text = daily ? `I named ${fmtPts(score)} of ${ROUNDS} birds in today's Name that bird (${h.fmtDate(today())}) at ${site}. ${marks}` : `I named ${fmtPts(score)} of ${ROUNDS} ${what} (${LEVELS[level].label}) in Name that bird at ${site}. ${marks}`;
      shareText(text, daily ? "?daily=1" : "");
    }
    // arriving from "Today's challenge": straight into today's ten, unless they're already played
    if (q && q.get("daily") && !dailyStatus().played) start(true);
  }

  GP.quizDaily = { status: dailyStatus };
  (GP.views = GP.views || []).push({ id: "quiz", label: "Quiz", navAfter: "journal", render });
})(window.GP = window.GP || {});
