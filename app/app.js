/* Systems Design Bites — a daily, bite-sized companion to the
 * "Systems Design 2.0" playlist by Jordan has no life. */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = window.escapeHtml;
  const rich = window.richText;
  const view = $("#view");

  const PLAYLIST = "PLjTveVh7FakLdTmm42TMxbN8PvVn5g4KJ";
  const CREATOR = "Jordan has no life";
  const CHANNEL = "https://www.youtube.com/@jordanhasnolife5163";

  const MODULES = [
    { id: "foundations", title: "Foundations & Indexes", icon: "🗂️", color: "#3b6fe0", from: 1, to: 6 },
    { id: "transactions", title: "Transactions & Isolation", icon: "🔒", color: "#8a5cf6", from: 7, to: 13 },
    { id: "storage", title: "Storage & Encoding", icon: "🧱", color: "#0e9f9a", from: 14, to: 15 },
    { id: "replication", title: "Replication", icon: "🪞", color: "#e0703b", from: 16, to: 24 },
    { id: "partitioning", title: "Partitioning & Distributed Transactions", icon: "🧩", color: "#c23b8c", from: 25, to: 27 },
    { id: "consensus", title: "Consistency & Consensus", icon: "🤝", color: "#2f9d57", from: 28, to: 31 },
    { id: "databases", title: "Choosing a Database", icon: "🛢️", color: "#b7791f", from: 32, to: 38 },
    { id: "batch", title: "Batch Processing", icon: "📦", color: "#5b6ee1", from: 39, to: 41 },
    { id: "streams", title: "Stream Processing", icon: "🌊", color: "#1d8fd1", from: 42, to: 45 },
    { id: "special", title: "Specialized Indexes", icon: "🔎", color: "#d14a4a", from: 46, to: 50 },
    { id: "caching", title: "Caching & Storage", icon: "⚡", color: "#e0a93b", from: 51, to: 56 },
    { id: "networking", title: "Networking & Deployment", icon: "🌐", color: "#4a8f8f", from: 57, to: 60 },
  ];

  const LESSONS = (window.LESSONS || []).slice().sort((a, b) => a.n - b.n);
  const byN = Object.fromEntries(LESSONS.map((l) => [l.n, l]));
  const moduleOf = (n) => MODULES.find((m) => n >= m.from && n <= m.to);

  /* ---------------- state ---------------- */
  const KEY = "sd-bites:v1";
  const blank = () => ({ done: {}, quiz: {}, days: [], goal: 1, cards: {}, detran: { q: {}, sessions: [], days: [], examMin: 60 }, mestrado: { q: {}, sessions: [], days: [] } });
  let S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { S = blank(); }
  S.detran = Object.assign(blank().detran, S.detran || {});
S.mestrado = Object.assign(blank().mestrado, S.mestrado || {});
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ } };
  // every change is saved locally first, then (if signed in) pushed to the cloud shortly after
  const save = () => { persist(); if (window.Sync) window.Sync.queuePush(); };

  const iso = (d = new Date()) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  };
  const addDays = (s, k) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + k); return iso(d); };
  const today = () => iso();

  function streak() {
    const set = new Set(S.days);
    let d = today();
    if (!set.has(d)) d = addDays(d, -1);
    let n = 0;
    while (set.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }
  const doneToday = () => Object.values(S.done).filter((d) => d === today()).length;
  const nextLesson = () => LESSONS.find((l) => !S.done[l.n]);

  function markDone(n) {
    if (!S.done[n]) S.done[n] = today();
    if (!S.days.includes(today())) S.days.push(today());
    // seed review cards for this lesson
    for (const c of cardsFor(byN[n])) if (!S.cards[c.key]) S.cards[c.key] = { box: 0, due: addDays(today(), 1) };
    save();
  }

  /* ---------------- review deck (Leitner boxes) ---------------- */
  const GAPS = [1, 2, 4, 8, 16, 32];
  function cardsFor(l) {
    if (!l) return [];
    const out = (l.terms || []).map(([t, d], i) => ({ key: `${l.n}:t${i}`, n: l.n, front: t, back: d, kind: "Term" }));
    (l.quiz || []).forEach((q, i) => out.push({ key: `${l.n}:q${i}`, n: l.n, front: q.q, back: `${q.a[q.c]}${q.why ? " — " + q.why : ""}`, kind: "Question" }));
    return out;
  }
  function dueCards() {
    const all = LESSONS.filter((l) => S.done[l.n]).flatMap(cardsFor);
    return all.filter((c) => S.cards[c.key] && S.cards[c.key].due <= today());
  }
  function grade(key, ok) {
    const c = S.cards[key] || { box: 0 };
    c.box = ok ? Math.min(c.box + 1, GAPS.length - 1) : 0;
    c.due = addDays(today(), ok ? GAPS[c.box] : 1);
    c.at = Date.now(); // newest grade wins when devices sync
    S.cards[key] = c;
    if (!S.days.includes(today())) S.days.push(today());
    save();
  }

  /* ---------------- helpers ---------------- */
  const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  const watchUrl = (l) => `https://www.youtube.com/watch?v=${l.id}&list=${PLAYLIST}&index=${l.n}`;
  const fmtMin = (s) => `${Math.round(s / 60)} min`;
  function toast(msg, ms = 2200) {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
  function setNav(name) {
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === name));
  }

  /* ---------------- views ---------------- */
  function home() {
    setNav("home");
    const done = Object.keys(S.done).length;
    const next = nextLesson();
    const dueN = dueCards().length;
    const hrs = new Date().getHours();
    const hi = hrs < 12 ? "Good morning" : hrs < 18 ? "Good afternoon" : "Good evening";
    const goalMet = doneToday() >= S.goal;

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today(), -i);
      const wd = new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "narrow" });
      days.push(`<i class="${S.days.includes(d) ? "on" : ""} ${i === 0 ? "today-mark" : ""}" title="${d}">${wd}</i>`);
    }

    let todayCard;
    if (!next) {
      todayCard = `<section class="card today"><span class="pill">🏁 Course complete</span><h2>You finished all ${LESSONS.length} bites!</h2>
        <p>Keep it fresh with a daily review, and go thank Jordan in the comments of his videos.</p>
        <div class="row"><a class="btn primary" href="#/review">Start review</a><a class="btn ghost" href="${CHANNEL}" target="_blank" rel="noopener">Visit the channel ↗</a></div></section>`;
    } else {
      const m = moduleOf(next.n);
      todayCard = `<section class="card today">
        <span class="pill">${goalMet ? "✅ Daily goal done — bonus bite" : "☀️ Today's bite"} · ${m.icon} ${esc(m.title)}</span>
        <h2>${next.n}. ${esc(next.title)}</h2>
        <p>${rich(next.bigIdea)}</p>
        <div class="row">
          <a class="btn primary" href="#/lesson/${next.n}">Start · ~${next.read || 4} min</a>
          ${dueN ? `<a class="btn ghost" href="#/review">Review ${dueN} card${dueN > 1 ? "s" : ""}</a>` : ""}
        </div></section>`;
    }

    view.innerHTML = `
      <div class="hello"><div><p class="muted" style="margin:0">${hi} 👋</p><h1>Your systems design habit</h1></div></div>
      <div class="stack">
        ${todayCard}
        <div class="stats">
          <div class="stat"><b>${streak()} 🔥</b><span>day streak</span></div>
          <div class="stat"><b>${done}<small class="muted" style="font-size:.9rem">/${LESSONS.length}</small></b><span>bites done</span></div>
          <div class="stat"><b>${dueN}</b><span>cards to review</span></div>
        </div>
        <section class="card">
          <div class="row"><h3 style="margin:0">This week</h3><span class="spacer"></span>
            <span class="muted" style="font-size:.85rem">Daily goal</span>
            <div class="goal-select">${[1, 2, 3].map((g) => `<button data-goal="${g}" class="${S.goal === g ? "on" : ""}">${g} bite${g > 1 ? "s" : ""}</button>`).join("")}</div>
          </div>
          <div class="week" style="margin-top:12px">${days.join("")}</div>
          <p class="muted" style="margin:12px 0 0;font-size:.9rem">Each bite takes about 4 minutes: one big idea, a diagram, a few key points and a quick quiz. Finished bites add cards to your spaced-repetition review.</p>
        </section>
        ${continueModule()}
        ${window.Sync && window.Sync.enabled ? `<section class="card" id="syncCard"></section>` : ""}
      </div>`;
    renderSyncCard();

    view.querySelectorAll("[data-goal]").forEach((b) => b.addEventListener("click", () => { S.goal = +b.dataset.goal; save(); home(); }));
  }

  function continueModule() {
    const next = nextLesson();
    if (!next) return "";
    const m = moduleOf(next.n);
    const ls = LESSONS.filter((l) => l.n >= m.from && l.n <= m.to);
    const d = ls.filter((l) => S.done[l.n]).length;
    return `<section class="card module">${moduleHead(m, d, ls.length, false)}${lessonList(ls, next)}</section>`;
  }

  function moduleHead(m, d, total, button = true) {
    const tag = button ? "button" : "div";
    return `<${tag} class="module-head" ${button ? `data-mod="${m.id}"` : ""}>
      <span class="module-icon" style="background:${m.color}22">${m.icon}</span>
      <span style="flex:1;min-width:0"><h3>${esc(m.title)}</h3><small>${d}/${total} done · lessons ${m.from}–${m.to}</small>
      <div class="bar"><i style="width:${(100 * d) / total}%"></i></div></span></${tag}>`;
  }

  function lessonList(ls, next) {
    return `<ul class="lesson-list">${ls.map((l) => {
      const st = S.done[l.n] ? "done" : next && next.n === l.n ? "next" : "";
      return `<li><a href="#/lesson/${l.n}"><span class="num ${st}">${S.done[l.n] ? "✓" : l.n}</span>
        <span class="t">${esc(l.title)}<small>${esc(l.bigIdea.replace(/\*\*|`/g, ""))}</small></span>
        <span class="muted" style="font-size:.8rem">${fmtMin(l.duration)}</span></a></li>`;
    }).join("")}</ul>`;
  }

  function path(open) {
    setNav("path");
    const next = nextLesson();
    const openId = open || (next ? moduleOf(next.n).id : null);
    view.innerHTML = `<h1>Learning path</h1>
      <p class="muted">${MODULES.length} modules · ${LESSONS.length} bites · following the order of the original playlist.</p>
      <div class="stack">${MODULES.map((m) => {
        const ls = LESSONS.filter((l) => l.n >= m.from && l.n <= m.to);
        const d = ls.filter((l) => S.done[l.n]).length;
        return `<section class="card module">${moduleHead(m, d, ls.length)}${m.id === openId ? lessonList(ls, next) : ""}</section>`;
      }).join("")}</div>`;
    view.querySelectorAll("[data-mod]").forEach((b) => b.addEventListener("click", () => {
      path(b.dataset.mod === openId ? "__none" : b.dataset.mod);
    }));
  }

  /* ---------------- lesson player ---------------- */
  function buildSlides(l) {
    const m = moduleOf(l.n);
    const slides = [];
    slides.push({
      kind: "intro", html: `<div class="kicker">${m.icon} ${esc(m.title)} · Bite ${l.n} of ${LESSONS.length}</div>
      <h1>${esc(l.title)}</h1>
      <p class="big-idea">${rich(l.bigIdea)}</p>
      ${l.why ? `<p class="muted">${rich(l.why)}</p>` : ""}
      <div class="video-credit" style="margin-top:auto">
        <img src="${thumb(l.id)}" alt="" loading="lazy" onerror="this.style.display='none'">
        <p>Based on <a href="${watchUrl(l)}" target="_blank" rel="noopener">“${esc(l.fullTitle || l.title)}”</a> by <a href="${CHANNEL}" target="_blank" rel="noopener">${CREATOR}</a> · ${fmtMin(l.duration)} video</p>
      </div>`,
    });
    const vs = l.visuals || (l.visual ? [l.visual] : []);
    vs.forEach((v, i) => slides.push({
      kind: "visual", html: `<div class="kicker">Picture it${vs.length > 1 ? ` · ${i + 1}/${vs.length}` : ""}</div>${window.renderVisual(v)}`,
    }));
    (l.points || []).forEach((p, i) => slides.push({
      kind: "point", html: `<div class="kicker">Key idea ${i + 1} of ${l.points.length}</div>
      <div class="point"><span class="n">${i + 1}</span><div><h2>${rich(p.h)}</h2><p>${rich(p.t)}</p></div></div>
      ${p.v ? window.renderVisual(p.v) : ""}
      ${p.analogy ? `<div class="analogy"><b>Think of it like…</b> ${rich(p.analogy)}</div>` : ""}`,
    }));
    slides.push({
      kind: "wrap", html: `<div class="kicker">Remember this</div>
      <div class="takeaway"><b>Takeaway.</b> ${rich(l.takeaway)}</div>
      ${l.interview ? `<div class="analogy"><b>In an interview:</b> ${rich(l.interview)}</div>` : ""}
      ${(l.terms || []).length ? `<h3 style="margin-top:18px">Vocabulary</h3><dl class="terms">${l.terms.map(([t, d]) => `<div><dt>${rich(t)}</dt><dd>${rich(d)}</dd></div>`).join("")}</dl>` : ""}`,
    });
    (l.quiz || []).forEach((q, i) => slides.push({ kind: "quiz", q, i }));
    slides.push({ kind: "finish" });
    return slides;
  }

  function lesson(n, mode) {
    setNav("path");
    const l = byN[n];
    if (!l) { view.innerHTML = `<div class="card"><h2>Lesson not found</h2><a href="#/path">Back to the path</a></div>`; return; }
    if (mode === "all") return lessonPage(l);

    const slides = buildSlides(l);
    let idx = 0;
    const answers = {};

    function render() {
      const s = slides[idx];
      const dots = slides.map((_, i) => `<i class="${i <= idx ? "on" : ""}"></i>`).join("");
      let inner = "";
      let canNext = true;
      if (s.kind === "quiz") {
        const a = answers[s.i];
        canNext = a != null;
        inner = `<div class="kicker">Quick check ${s.i + 1} of ${l.quiz.length}</div>
          <div class="quiz-q">${rich(s.q.q)}</div>
          <div class="options">${s.q.a.map((o, k) => {
            let cls = "";
            if (a != null) { if (k === s.q.c) cls = "correct"; else if (k === a) cls = "wrong"; }
            return `<button class="option ${cls}" data-opt="${k}" ${a != null ? "disabled" : ""}>${rich(o)}</button>`;
          }).join("")}</div>
          ${a != null ? `<div class="why">${a === s.q.c ? "✅ Correct!" : "❌ Not quite."} ${rich(s.q.why || "")}</div>` : ""}`;
      } else if (s.kind === "finish") {
        const total = (l.quiz || []).length;
        const right = Object.entries(answers).filter(([i, a]) => l.quiz[i].c === a).length;
        const nxt = byN[l.n + 1];
        inner = `<div class="done-hero"><div class="big">🎉</div><h1>Bite ${l.n} done!</h1>
          ${total ? `<p class="muted">Quiz: ${right}/${total} correct. ${right === total ? "Perfect." : "The cards you missed will come back in Review."}</p>` : ""}</div>
          <div class="stack">
            <div id="player" class="video-wrap" style="display:none"></div>
            <div class="video-credit">
              <img src="${thumb(l.id)}" alt="" loading="lazy" onerror="this.style.display='none'">
              <div><p style="margin-bottom:6px">Want the full explanation? Watch Jordan's original ${fmtMin(l.duration)} class, and leave him a like.</p>
              <div class="row"><button class="btn" id="play">▶ Watch here</button><a class="btn ghost" href="${watchUrl(l)}" target="_blank" rel="noopener">YouTube ↗</a></div></div>
            </div>
          </div>`;
      } else {
        inner = s.html;
      }
      const isLast = idx === slides.length - 1;
      const nxt = byN[l.n + 1];
      view.innerHTML = `<div class="lesson-top">
          <a class="btn ghost" href="#/path" aria-label="Close lesson">✕</a>
          <div class="progress-dots">${dots}</div>
          <a class="btn ghost" href="#/lesson/${l.n}/all" title="Show everything on one page">☰</a>
        </div>
        <section class="card slide">${`<div class="body">${inner}</div>`}
          <div class="slide-nav">
            ${idx > 0 ? `<button class="btn" id="prev">Back</button>` : ""}
            ${isLast
              ? (nxt ? `<a class="btn primary" href="#/lesson/${nxt.n}">Next bite →</a><a class="btn" href="#/">Home</a>` : `<a class="btn primary" href="#/">Home</a>`)
              : `<button class="btn primary" id="next" ${canNext ? "" : "disabled"}>${s.kind === "quiz" && !canNext ? "Pick an answer" : "Continue"}</button>`}
          </div></section>`;

      view.querySelectorAll("[data-opt]").forEach((b) => b.addEventListener("click", () => {
        const k = +b.dataset.opt;
        answers[s.i] = k;
        const key = `${l.n}:q${s.i}`;
        S.quiz[key] = k === s.q.c;
        if (k !== s.q.c) S.cards[key] = { box: 0, due: today(), at: Date.now() };
        save();
        render();
      }));
      const nx = $("#next"); if (nx) nx.addEventListener("click", go(1));
      const pv = $("#prev"); if (pv) pv.addEventListener("click", go(-1));
      const pl = $("#play"); if (pl) pl.addEventListener("click", () => {
        const p = $("#player");
        p.style.display = "block";
        p.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${l.id}?autoplay=1&rel=0" title="${esc(l.fullTitle || l.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        pl.remove();
      });
      if (s.kind === "finish" && !S.done[l.n]) { markDone(l.n); toast("Saved to your progress ✓"); }
    }
    const go = (d) => () => { idx = Math.max(0, Math.min(slides.length - 1, idx + d)); render(); window.scrollTo({ top: 0 }); };
    keyHandler = (e) => {
      if (e.key === "ArrowRight") { const b = $("#next"); if (b && !b.disabled) b.click(); }
      if (e.key === "ArrowLeft") { const b = $("#prev"); if (b) b.click(); }
    };
    render();
  }

  function lessonPage(l) {
    const m = moduleOf(l.n);
    const vs = l.visuals || (l.visual ? [l.visual] : []);
    const nxt = byN[l.n + 1], prv = byN[l.n - 1];
    view.innerHTML = `<div class="lesson-top"><a class="btn ghost" href="#/lesson/${l.n}">← Slides</a><span class="spacer"></span>
      ${prv ? `<a class="btn ghost" href="#/lesson/${prv.n}/all">‹ ${prv.n}</a>` : ""}${nxt ? `<a class="btn ghost" href="#/lesson/${nxt.n}/all">${nxt.n} ›</a>` : ""}</div>
      <article class="stack">
        <section class="card"><div class="kicker" style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent)">${m.icon} ${esc(m.title)} · Bite ${l.n}</div>
          <h1>${esc(l.title)}</h1><p class="big-idea">${rich(l.bigIdea)}</p>${l.why ? `<p class="muted">${rich(l.why)}</p>` : ""}</section>
        ${vs.map((v) => `<section class="card">${window.renderVisual(v)}</section>`).join("")}
        <section class="card stack">${(l.points || []).map((p, i) => `<div class="point"><span class="n">${i + 1}</span><div><h3>${rich(p.h)}</h3><p>${rich(p.t)}</p>
          ${p.v ? window.renderVisual(p.v) : ""}${p.analogy ? `<div class="analogy"><b>Think of it like…</b> ${rich(p.analogy)}</div>` : ""}</div></div>`).join("")}</section>
        <section class="card stack"><div class="takeaway"><b>Takeaway.</b> ${rich(l.takeaway)}</div>
          ${l.interview ? `<div class="analogy" style="margin:0"><b>In an interview:</b> ${rich(l.interview)}</div>` : ""}
          ${(l.terms || []).length ? `<dl class="terms">${l.terms.map(([t, d]) => `<div><dt>${rich(t)}</dt><dd>${rich(d)}</dd></div>`).join("")}</dl>` : ""}</section>
        <section class="card"><div class="video-credit"><img src="${thumb(l.id)}" alt="" loading="lazy" onerror="this.style.display='none'">
          <p>Source: <a href="${watchUrl(l)}" target="_blank" rel="noopener">“${esc(l.fullTitle || l.title)}”</a> by <a href="${CHANNEL}" target="_blank" rel="noopener">${CREATOR}</a>. <a href="#/lesson/${l.n}">Take the quiz →</a></p></div></section>
      </article>`;
  }

  /* ---------------- review ---------------- */
  function review() {
    setNav("review");
    const deck = dueCards().sort(() => Math.random() - 0.5).slice(0, 12);
    if (!Object.keys(S.done).length) {
      view.innerHTML = `<h1>Review</h1><div class="card"><p>Finish your first bite and its key terms and questions will show up here, spaced out over days so they stick.</p><a class="btn primary" href="#/">Go to today's bite</a></div>`;
      return;
    }
    if (!deck.length) {
      const upcoming = Object.values(S.cards).map((c) => c.due).sort()[0];
      view.innerHTML = `<h1>Review</h1><div class="card done-hero"><div class="big">🧠</div><h2>All caught up!</h2>
        <p class="muted">${upcoming ? `Next cards are due on ${upcoming}.` : ""} Want more? Take today's bite or reread a finished one.</p>
        <div class="row" style="justify-content:center"><a class="btn primary" href="#/">Today's bite</a><button class="btn" id="cram">Practice anyway</button></div></div>`;
      $("#cram").addEventListener("click", () => {
        const all = LESSONS.filter((l) => S.done[l.n]).flatMap(cardsFor).sort(() => Math.random() - 0.5).slice(0, 10);
        runDeck(all, false);
      });
      return;
    }
    runDeck(deck, true);
  }

  function runDeck(deck, scheduled) {
    let i = 0, right = 0;
    function show() {
      if (i >= deck.length) {
        view.innerHTML = `<h1>Review</h1><div class="card done-hero"><div class="big">✅</div><h2>Session complete</h2>
          <p class="muted">${right}/${deck.length} remembered. ${scheduled ? "Cards you knew come back later; ones you missed return tomorrow." : ""}</p>
          <a class="btn primary" href="#/">Back to today</a></div>`;
        return;
      }
      const c = deck[i];
      const l = byN[c.n];
      view.innerHTML = `<div class="lesson-top"><a class="btn ghost" href="#/">✕</a><div class="progress-dots">${deck.map((_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div></div>
        <div class="flash" id="card"><div class="flash-inner">
          <div class="flash-face front"><span class="pill accent">${c.kind} · Bite ${c.n}</span><h2 style="margin-top:14px">${rich(c.front)}</h2><small>Tap to reveal</small></div>
          <div class="flash-face back"><p style="font-size:1.08rem">${rich(c.back)}</p><small>${esc(l.title)}</small></div>
        </div></div>
        <div class="slide-nav" id="grade" style="visibility:hidden">
          <button class="btn" data-g="0">😕 Forgot</button><button class="btn primary" data-g="1">😎 Knew it</button></div>`;
      const card = $("#card");
      card.addEventListener("click", () => { card.classList.toggle("flipped"); $("#grade").style.visibility = "visible"; });
      view.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => {
        const ok = b.dataset.g === "1";
        if (ok) right++;
        if (scheduled) grade(c.key, ok);
        i++; show();
      }));
    }
    keyHandler = (e) => {
      if (e.key === " " || e.key === "Enter") { const c = $("#card"); if (c) { e.preventDefault(); c.click(); } }
    };
    show();
  }

  /* ---------------- cloud sync ---------------- */
  let syncStatus = { state: "loading" };
  let syncNote = "";
  function ago(d) {
    if (!d) return "";
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    return s < 10 ? "just now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function renderSyncCard() {
    const el = document.getElementById("syncCard");
    if (!el) return;
    const st = syncStatus;
    let body;
    if (st.state === "loading") {
      body = `<p class="muted" style="margin:0">Checking sync…</p>`;
    } else if (!st.user) {
      body = `<p class="muted" style="margin:0 0 10px">Sign in to keep your progress, streak and review cards in sync across your phone, tablet and laptop. New here? Pick a username and password and tap <b>Create account</b>. No email needed.</p>
        <form class="sync-form login" id="syncForm" autocomplete="on">
          <input id="syncUser" name="username" required autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Username" aria-label="Username" minlength="3" maxlength="32">
          <input id="syncPass" name="password" type="password" required autocomplete="current-password" placeholder="Password" aria-label="Password" minlength="6">
          <div class="row" style="gap:8px">
            <button class="btn primary" type="submit" data-act="login">Sign in</button>
            <button class="btn" type="submit" data-act="register">Create account</button>
          </div>
        </form>
        <p class="muted" style="margin:10px 0 0;font-size:.85rem">Use a password you don't use anywhere else. There's no password reset without email.</p>
        ${syncNote ? `<p class="sync-note">${syncNote}</p>` : ""}`;
    } else {
      const line = st.state === "syncing" ? "Syncing…" : st.state === "error" ? `<span class="bad">Sync failed: ${esc(st.error || "")}</span>` : `Synced ${ago(st.lastSync)}`;
      body = `<div class="row" style="flex-wrap:nowrap"><span class="sync-dot ${st.state}"></span>
          <span style="flex:1;min-width:0;overflow-wrap:anywhere">Signed in as <b>${esc(st.user)}</b><br><small class="muted">${line}</small></span></div>
        <div class="row" style="margin-top:12px"><button class="btn" id="syncNow">Sync now</button><button class="btn ghost" id="syncOut">Sign out</button></div>`;
    }
    el.innerHTML = `<h3 style="margin:0 0 8px">☁️ Sync across devices</h3>${body}`;
    const form = document.getElementById("syncForm");
    if (form) form.addEventListener("input", () => {
      // an old error shouldn't linger once you start fixing it
      if (syncNote) { syncNote = ""; const n = el.querySelector(".sync-note"); if (n) n.remove(); }
    });
    if (form) form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const act = (e.submitter && e.submitter.dataset.act) || "login";
      const user = document.getElementById("syncUser").value;
      const pass = document.getElementById("syncPass").value;
      form.querySelectorAll("button").forEach((x) => { x.disabled = true; });
      e.submitter && (e.submitter.textContent = act === "register" ? "Creating…" : "Signing in…");
      try {
        await (act === "register" ? window.Sync.register(user, pass) : window.Sync.signIn(user, pass));
        syncNote = "";
        toast(`✅ Signed in as ${user.trim().toLowerCase()}. Your progress is synced.`, 4000);
      } catch (err) {
        syncNote = `<span class="bad">⚠️ ${esc(err.message || "Couldn't sign in")}</span>`;
        renderSyncCard();
        const u = document.getElementById("syncUser"); if (u) u.value = user;
      }
    });
    const now = document.getElementById("syncNow");
    if (now) now.addEventListener("click", () => window.Sync.syncNow());
    const out = document.getElementById("syncOut");
    if (out) out.addEventListener("click", async () => { await window.Sync.signOut(); syncNote = "Signed out. Your progress stays on this device."; toast("Signed out"); renderSyncCard(); });
  }
  if (window.Sync && window.Sync.enabled) {
    window.Sync.init({
      getState: () => S,
      applyMerged: (merged) => {
        const before = JSON.stringify(S);
        S = Object.assign(blank(), merged);
        S.detran = Object.assign(blank().detran, S.detran || {});
        S.mestrado = Object.assign(blank().mestrado, S.mestrado || {});
        persist();
        // refresh overview screens if the merge brought in anything new (never interrupt a lesson or quiz)
        if (JSON.stringify(S) !== before && /^#?\/?(path|detran\/?(erros|banco)?|mestrado\/?(erros|banco|livro)?)?$/.test(location.hash)) route();
      },
      onStatus: (st) => { syncStatus = st; renderSyncCard(); renderAcct(); },
    });
    // top-bar status: cloud icon, green dot when signed in; tap to open the sync card
    const acct = document.getElementById("acctBtn");
    acct.hidden = false;
    acct.addEventListener("click", (e) => {
      e.preventDefault();
      const go = () => {
        const card = document.getElementById("syncCard");
        if (!card) return;
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        const user = document.getElementById("syncUser");
        if (user) user.focus({ preventScroll: true });
      };
      const homeHash = currentApp === "sd" ? "#/" : `#/${currentApp}`;
      if (location.hash.replace(/\/$/, "") === homeHash.replace(/\/$/, "") || (!location.hash && currentApp === "sd")) go();
      else { location.hash = homeHash; setTimeout(go, 80); }
    });
  }
  function renderAcct() {
    const acct = document.getElementById("acctBtn");
    if (!acct) return;
    const st = syncStatus;
    const signedIn = !!st.user;
    acct.dataset.state = signedIn ? st.state : "signed-out";
    const label = signedIn
      ? `Signed in as ${st.user}${st.state === "error" ? ": sync failed" : st.state === "syncing" ? ": syncing…" : ""}`
      : "Not signed in: tap to sync across devices";
    acct.title = label; acct.setAttribute("aria-label", label);
  }

  /* ---------------- search ---------------- */
  // Every piece of text in a lesson becomes a "passage" with a weight, so a hit in the
  // title or vocabulary ranks above a passing mention in a diagram.
  const SKIP_KEYS = new Set(["type", "kind", "id", "s", "style", "from", "to", "x", "y", "w", "h", "bend", "both", "noArrow", "noFlip", "colW", "rowH", "nodeW", "nodeH", "tones", "values", "c"]);
  const plain = (s) => String(s).replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim();
  function collect(obj, out) {
    if (obj == null) return;
    if (typeof obj === "string") { if (obj.trim()) out.push(plain(obj)); return; }
    if (Array.isArray(obj)) { obj.forEach((x) => collect(x, out)); return; }
    if (typeof obj === "object") for (const [k, v] of Object.entries(obj)) if (!SKIP_KEYS.has(k)) collect(v, out);
  }
  let searchIndex = null;
  function buildIndex() {
    return LESSONS.map((l) => {
      const P = [];
      const add = (text, w, where) => text && P.push({ text: plain(text), low: plain(text).toLowerCase(), w, where });
      add(l.title, 10, "Title");
      (l.terms || []).forEach(([t, d]) => { add(t, 6, "Vocabulary"); add(`${plain(t)}: ${plain(d)}`, 2, "Vocabulary"); });
      add(l.bigIdea, 4, "Big idea");
      (l.points || []).forEach((p) => {
        add(p.h, 3, "Key idea"); add(p.t, 1.5, "Key idea"); add(p.analogy, 1, "Analogy");
        if (p.v) { const s = []; collect(p.v, s); s.forEach((t) => add(t, 1, "Diagram")); }
      });
      add(l.takeaway, 2, "Takeaway"); add(l.interview, 1.5, "Interview tip"); add(l.why, 1.5, "Big idea");
      const vs = []; collect(l.visuals || (l.visual ? [l.visual] : []), vs); vs.forEach((t) => add(t, 1, "Diagram"));
      // only the correct answer: wrong options are deliberately about other topics
      (l.quiz || []).forEach((q) => { add(q.q, 1, "Quiz"); add(q.a[q.c], 0.5, "Quiz"); add(q.why, 0.5, "Quiz"); });
      add(l.fullTitle, 2, "Video title");
      return { l, P, all: P.map((p) => p.low).join(" \n ") };
    });
  }
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function runSearch(q) {
    searchIndex = searchIndex || buildIndex();
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return { tokens, results: [] };
    const phrase = tokens.join(" ");
    const results = [];
    for (const entry of searchIndex) {
      if (!tokens.every((t) => entry.all.includes(t))) continue;
      let score = 0;
      const hits = [];
      for (const p of entry.P) {
        let pScore = 0;
        for (const t of tokens) {
          const n = p.low.split(t).length - 1;
          pScore += n * p.w;
        }
        if (tokens.length > 1 && p.low.includes(phrase)) pScore += 3 * p.w;
        if (pScore) { score += pScore; hits.push({ p, pScore }); }
      }
      // best passages to show, skipping the title (it's already displayed) and duplicates
      const seen = new Set();
      const snippets = hits
        .filter((h) => h.p.where !== "Title" && h.p.where !== "Video title")
        .sort((a, b) => b.pScore - a.pScore)
        .filter((h) => !seen.has(h.p.text) && seen.add(h.p.text))
        .slice(0, 2)
        .map((h) => ({ where: h.p.where, html: snippet(h.p.text, tokens) }));
      results.push({ l: entry.l, score, snippets });
    }
    results.sort((a, b) => b.score - a.score || a.l.n - b.l.n);
    return { tokens, results };
  }
  function snippet(text, tokens) {
    const low = text.toLowerCase();
    let at = Math.min(...tokens.map((t) => { const i = low.indexOf(t); return i < 0 ? Infinity : i; }));
    if (!isFinite(at)) at = 0;
    let start = Math.max(0, at - 60), end = Math.min(text.length, at + 110);
    if (start > 0) { const sp = text.indexOf(" ", start); start = sp > -1 && sp < at ? sp + 1 : start; }
    if (end < text.length) { const sp = text.lastIndexOf(" ", end); end = sp > at ? sp : end; }
    const cut = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
    return highlight(cut, tokens);
  }
  function highlight(text, tokens) {
    // match against the escaped text, so escape the tokens the same way
    const re = new RegExp(`(${tokens.map((t) => reEsc(esc(t))).sort((a, b) => b.length - a.length).join("|")})`, "gi");
    return esc(text).replace(re, "<mark>$1</mark>");
  }

  const SUGGEST = ["Redis", "Kafka", "B-tree", "quorum", "consistent hashing", "change data capture", "two-phase commit", "LSM", "Raft", "CDN"];
  function search(initial) {
    setNav("search");
    const q0 = initial || "";
    view.innerHTML = `<h1>Search</h1>
      <div class="search-box">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="q" type="search" placeholder="Try “redis”, “quorum”, “b-tree”…" autocomplete="off" spellcheck="false" aria-label="Search lessons" value="${esc(q0)}">
      </div>
      <div id="results" aria-live="polite"></div>`;
    const input = $("#q");
    const out = $("#results");
    const render = () => {
      const q = input.value.trim();
      history.replaceState(null, "", q ? `#/search/${encodeURIComponent(q)}` : "#/search");
      if (!q) {
        out.innerHTML = `<p class="muted" style="margin:14px 0 8px">Search every lesson's text, diagrams, vocabulary and quizzes. Popular topics:</p>
          <div class="chips">${SUGGEST.map((s) => `<button class="chip" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
        out.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.q; render(); input.focus(); }));
        return;
      }
      const { results } = runSearch(q);
      if (!results.length) {
        out.innerHTML = `<div class="card" style="margin-top:14px"><p style="margin:0">No lessons mention <b>${esc(q)}</b>${LESSONS.length < 60 ? ` yet (${60 - LESSONS.length} lessons are still being written)` : ""}.</p></div>`;
        return;
      }
      const next = nextLesson();
      out.innerHTML = `<p class="muted" style="margin:14px 0 8px">${results.length} lesson${results.length > 1 ? "s" : ""} mention <b>${esc(q)}</b></p>
        <ul class="results">${results.map(({ l, snippets }) => {
          const m = moduleOf(l.n);
          const st = S.done[l.n] ? "done" : next && next.n === l.n ? "next" : "";
          return `<li><a href="#/lesson/${l.n}" class="result card">
            <span class="num ${st}">${S.done[l.n] ? "✓" : l.n}</span>
            <span class="t"><b>${highlight(l.title, q.toLowerCase().split(/\s+/).filter(Boolean))}</b>
              <small class="muted">${m.icon} ${esc(m.title)} · Bite ${l.n}</small>
              ${snippets.map((s) => `<span class="snip"><em>${esc(s.where)}</em> ${s.html}</span>`).join("")}
            </span></a></li>`;
        }).join("")}</ul>`;
    };
    input.addEventListener("input", render);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const first = out.querySelector("a.result"); if (first) location.hash = first.getAttribute("href"); }
    });
    render();
    setTimeout(() => input.focus(), 0);
  }

  // "/" opens search from anywhere (unless you're typing in a field)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    e.preventDefault();
    if (location.hash.startsWith("#/search")) { const i = $("#q"); if (i) i.focus(); }
    else location.hash = "#/search";
  });

  /* ---------------- apps: switcher + shared shell ---------------- */
  const APPS = {
    sd: { name: "Systems Design <b>Bites</b>", title: "Systems Design Bites", logo: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h9M5 17h11" /></svg>' },
    detran: { name: "DETRAN-RJ <b>Habilitação</b>", title: "DETRAN-RJ Habilitação", logo: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v6M5.2 15.5l5.2-2.5M18.8 15.5l-5.2-2.5"/></svg>' },
    mestrado: { name: "Mestrado <b>Epidemio</b>", title: "Mestrado em Epidemiologia · UERJ", logo: '<svg viewBox="0 0 24 24"><path d="M4 19h16M7 16v-5M12 16V6M17 16v-8"/></svg>' },
  };
  const MODULES_BY_APP = { detran: () => window.Detran, mestrado: () => window.Mestrado };
  let currentApp = null;
  function setApp(app) {
    if (app === currentApp) return;
    currentApp = app;
    document.body.dataset.app = app;
    document.documentElement.lang = app === "sd" ? "en" : "pt-BR";
    $("#brandName").innerHTML = APPS[app].name;
    $("#brandLogo").innerHTML = APPS[app].logo;
    $("#brandLogo").className = `logo ${app}`;
    document.title = APPS[app].title;
    document.querySelectorAll("[data-app-link]").forEach((a) => a.classList.toggle("current", a.dataset.appLink === app));
    try { localStorage.setItem("sd-bites:app", app); } catch { /* ignore */ }
  }
  const drawer = $("#drawer"), drawerBg = $("#drawerBg");
  function openDrawer(open) {
    drawer.hidden = drawerBg.hidden = !open;
    document.body.classList.toggle("drawer-open", open);
    if (open) (drawer.querySelector(".app-item.current") || drawer.querySelector(".app-item")).focus();
    else $("#appSwitch").focus({ preventScroll: true });
  }
  $("#appSwitch").addEventListener("click", () => openDrawer(drawer.hidden));
  drawerBg.addEventListener("click", () => openDrawer(false));
  $("#drawerClose").addEventListener("click", () => openDrawer(false));
  drawer.querySelectorAll(".app-item").forEach((a) => a.addEventListener("click", () => openDrawer(false)));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) openDrawer(false); });

  // what the DETRAN and Mestrado apps (app/detran/, app/mestrado/) get to use
  const makeShell = (key) => ({
    view, esc, rich, toast, setNav, today, addDays,
    getState: () => S[key],
    save,
    syncCard: () => (window.Sync && window.Sync.enabled ? `<section class="card" id="syncCard"></section>` : ""),
    renderSyncCard: () => renderSyncCard(),
    setKeyHandler: (fn) => { keyHandler = fn; },
  });
  const shells = { detran: makeShell("detran"), mestrado: makeShell("mestrado") };

  /* ---------------- router ---------------- */
  let keyHandler = null;
  document.addEventListener("keydown", (e) => keyHandler && keyHandler(e));
  function route() {
    keyHandler = null;
    let h = location.hash.replace(/^#\/?/, "");
    // a bare visit reopens whichever app you used last
    if (!location.hash) { let last = "sd"; try { last = localStorage.getItem("sd-bites:app") || "sd"; } catch { /* ignore */ } if (MODULES_BY_APP[last]) h = last; }
    const [a, b, c] = h.split("/");
    setApp(MODULES_BY_APP[a] && MODULES_BY_APP[a]() ? a : "sd");
    if (currentApp !== "sd") { MODULES_BY_APP[currentApp]().route(h.split("/").slice(1), shells[currentApp]); view.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); return; }
    if (a === "lesson") lesson(+b, c);
    else if (a === "path") path();
    else if (a === "review") review();
    else if (a === "search") search(b ? decodeURIComponent(h.slice("search/".length)) : "");
    else home();
    if (a !== "search") view.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", route);
  // diagrams pick a layout for the screen width, so re-render when crossing the phone breakpoint
  let wasNarrow = window.innerWidth < 600;
  window.addEventListener("resize", () => {
    const isNarrow = window.innerWidth < 600;
    if (isNarrow !== wasNarrow && !/lesson\/\d+$/.test(location.hash)) route();
    wasNarrow = isNarrow;
  });

  /* ---------------- theme ---------------- */
  const root = document.documentElement;
  try { const t = localStorage.getItem("sd-bites:theme"); if (t) root.dataset.theme = t; } catch { /* ignore */ }
  $("#themeBtn").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("sd-bites:theme", root.dataset.theme); } catch { /* ignore */ }
  });

  route();
})();
