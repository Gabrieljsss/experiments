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
  const blank = () => ({ done: {}, quiz: {}, days: [], goal: 1, cards: {} });
  let S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { S = blank(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ } };

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
    S.cards[key] = c;
    if (!S.days.includes(today())) S.days.push(today());
    save();
  }

  /* ---------------- helpers ---------------- */
  const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  const watchUrl = (l) => `https://www.youtube.com/watch?v=${l.id}&list=${PLAYLIST}&index=${l.n}`;
  const fmtMin = (s) => `${Math.round(s / 60)} min`;
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
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
      </div>`;

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
        <img src="${thumb(l.id)}" alt="" loading="lazy">
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
              <img src="${thumb(l.id)}" alt="" loading="lazy">
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
        if (k !== s.q.c) S.cards[key] = { box: 0, due: today() };
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
        <section class="card"><div class="video-credit"><img src="${thumb(l.id)}" alt="" loading="lazy">
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

  /* ---------------- router ---------------- */
  let keyHandler = null;
  document.addEventListener("keydown", (e) => keyHandler && keyHandler(e));
  function route() {
    keyHandler = null;
    const h = location.hash.replace(/^#\/?/, "");
    const [a, b, c] = h.split("/");
    if (a === "lesson") lesson(+b, c);
    else if (a === "path") path();
    else if (a === "review") review();
    else home();
    view.focus({ preventScroll: true });
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
