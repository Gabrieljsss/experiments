/* DETRAN-RJ Habilitação: practice for the theory exam (prova teórica).
 *
 * Questions come from DETRAN-RJ's public simulado (see scripts/scrape_detran.py) and
 * live in app/detran/questions.js as window.DETRAN = { questions, provas, topics }.
 * The shell (app/app.js) owns routing, the top bar and sync; this module renders the
 * #/detran/... screens and keeps its progress in state.detran (synced with the account). */
(function () {
  const DATA = window.DETRAN || { questions: [], provas: {}, topics: {} };
  const Q = DATA.questions;
  const byId = Object.fromEntries(Q.map((q) => [q.id, q]));
  const TOPICS = DATA.topics; // { key: { name, official } }
  const EXAM_N = 30, PASS = 21; // 30 questions, 70% (21) to pass: CONTRAN Res. 789/2020
  // official distribution of the 30 questions by subject
  const DISTRIB = { leg: 8, sin: 4, dd: 10, ps: 3, ma: 3, mec: 2 };
  const LETTERS = ["A", "B", "C", "D"];
  const RUN_KEY = "detran:run", LAST_KEY = "detran:last";

  let sh = null; // shell API, set on first route()
  const st = () => sh.getState();
  const esc = (s) => sh.esc(s);

  /* ---------------- helpers ---------------- */
  const perQ = () => (st().examMin * 60) / EXAM_N; // seconds per question in the real exam
  const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const shuffle = (xs) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const imgSrc = (code) => `app/detran/img/${encodeURIComponent(code)}.gif`;
  const topicName = (t) => (TOPICS[t] && TOPICS[t].name) || "Geral";
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

  function record(id, ok) {
    const s = st();
    const r = s.q[id] || { r: 0, w: 0 };
    s.q[id] = { r: r.r + (ok ? 1 : 0), w: r.w + (ok ? 0 : 1), last: ok ? 1 : 0, at: Date.now() };
    if (!s.days.includes(sh.today())) s.days.push(sh.today());
  }
  const wrongIds = () => Q.filter((q) => st().q[q.id] && st().q[q.id].last === 0).map((q) => q.id);

  /* ---------------- choosing questions ---------------- */
  // smart mix: questions you got wrong last time come back most, unseen ones next,
  // and ones you keep getting right fade out
  function weight(id) {
    const r = st().q[id];
    if (!r) return 3;
    if (r.last === 0) return 6;
    return Math.max(0.15, 1 / (1 + r.r));
  }
  function weightedPick(ids, n) {
    const pool = ids.map((id) => ({ id, w: weight(id) }));
    const out = [];
    while (out.length < n && pool.length) {
      let total = pool.reduce((s, p) => s + p.w, 0), x = Math.random() * total, i = 0;
      while (i < pool.length - 1 && (x -= pool[i].w) > 0) i++;
      out.push(pool.splice(i, 1)[0].id);
    }
    return out;
  }
  function randomExam() {
    // follow the official split by subject, then top up from anything left
    const picked = [];
    for (const [t, n] of Object.entries(DISTRIB)) picked.push(...shuffle(Q.filter((q) => q.t === t).map((q) => q.id)).slice(0, n));
    const rest = shuffle(Q.map((q) => q.id).filter((id) => !picked.includes(id)));
    return shuffle(picked.concat(rest).slice(0, EXAM_N));
  }

  /* ---------------- runs (a simulado or a bite in progress) ---------------- */
  function startRun({ ids, title, mode, feedback }) {
    if (!ids.length) { sh.toast("Nenhuma questão para esse filtro"); return; }
    const run = { id: uid(), ids, title, mode, feedback, answers: {}, i: 0, start: Date.now(), limit: Math.round(ids.length * perQ()) };
    store(RUN_KEY, run);
    location.hash = "#/detran/quiz";
  }
  function finishRun(run) {
    const end = Date.now();
    const secs = (end - run.start) / 1000;
    let ok = 0;
    run.ids.forEach((id, k) => {
      const a = run.answers[k];
      const right = a === byId[id].c;
      if (right) ok++;
      if (!run.feedback && a != null) record(id, right); // in instant-feedback mode they were recorded as you went
    });
    const n = run.ids.length;
    const session = { id: run.id, at: end, mode: run.mode, title: run.title, n, ok, secs: Math.round(secs), limit: run.limit, examMin: st().examMin };
    st().sessions.unshift(session);
    st().sessions = st().sessions.slice(0, 200);
    if (!st().days.includes(sh.today())) st().days.push(sh.today());
    sh.save();
    store(LAST_KEY, { ...session, ids: run.ids, answers: run.answers });
    store(RUN_KEY, null);
    location.hash = "#/detran/resultado";
  }

  /* ---------------- screens ---------------- */
  function home() {
    sh.setNav("dt-home");
    const s = st();
    const seen = Q.filter((q) => s.q[q.id]);
    const lastRight = seen.filter((q) => s.q[q.id].last === 1).length;
    const acc = seen.length ? lastRight / seen.length : 0;
    const est = Math.round(acc * EXAM_N);
    const wrong = wrongIds().length;
    const placas = Q.filter((q) => q.img).length;
    const running = load(RUN_KEY);
    const streak = (() => { const set = new Set(s.days); let d = sh.today(); if (!set.has(d)) d = sh.addDays(d, -1); let n = 0; while (set.has(d)) { n++; d = sh.addDays(d, -1); } return n; })();
    const provaNums = Object.keys(DATA.provas).map(Number).sort((a, b) => a - b);

    sh.view.innerHTML = `
      <div class="hello"><div><p class="muted" style="margin:0">Prova teórica · DETRAN-RJ</p><h1>Rumo à sua CNH 🚗</h1></div></div>
      <div class="stack">
        ${running ? `<section class="card dt-resume"><div class="row"><span style="flex:1"><b>Treino em andamento:</b> ${esc(running.title)} · ${Object.keys(running.answers).length}/${running.ids.length} respondidas</span>
          <a class="btn primary" href="#/detran/quiz">Continuar</a><button class="btn ghost" id="dtDiscard">Descartar</button></div></section>` : ""}

        <section class="card today dt-hero">
          <span class="pill">📝 Simulado completo</span>
          <h2>${EXAM_N} questões · ${s.examMin} min</h2>
          <p>Igual à prova: aprovação com ${PASS} acertos (70%). As respostas aparecem só no fim.</p>
          <div class="row">
            <button class="btn primary" id="dtExam">Simulado aleatório</button>
            <label class="dt-select">ou prova oficial nº
              <select id="dtProva">${provaNums.map((n) => `<option value="${n}">${n}</option>`).join("")}</select>
              <button class="btn ghost" id="dtProvaGo">Fazer</button></label>
          </div>
        </section>

        <section class="card">
          <h3 style="margin:0 0 4px">⚡ Treino rápido</h3>
          <p class="muted" style="margin:0 0 12px">Sem tempo para a prova inteira? Faça um pedaço. O cronômetro compara seu ritmo com o da prova (${mmss(perQ())} por questão).</p>
          <div class="dt-opts">
            <div><span class="dt-label">Questões</span><div class="goal-select" id="dtN">${[5, 10, 15, 20].map((n) => `<button data-n="${n}" class="${n === 10 ? "on" : ""}">${n}</button>`).join("")}</div></div>
            <div><span class="dt-label">Foco</span>
              <select id="dtFocus" class="dt-input">
                <option value="mix">Mistura inteligente (erradas e novas primeiro)</option>
                <option value="erros" ${wrong ? "" : "disabled"}>Só as que errei (${wrong})</option>
                <option value="placas">Placas e sinalização com imagem (${placas})</option>
                ${Object.entries(TOPICS).map(([k, t]) => `<option value="t:${k}">${esc(t.name)} (${Q.filter((q) => q.t === k).length})</option>`).join("")}
              </select></div>
            <label class="dt-check"><input type="checkbox" id="dtFeedback" checked> Mostrar a resposta certa logo após cada questão</label>
          </div>
          <div class="row" style="margin-top:12px"><button class="btn primary" id="dtBite">Começar treino</button><span class="muted" id="dtBudget" style="font-size:.9rem"></span></div>
        </section>

        <div class="stats">
          <div class="stat"><b>${seen.length}<small class="muted" style="font-size:.9rem">/${Q.length}</small></b><span>questões vistas</span></div>
          <div class="stat"><b>${seen.length ? pct(lastRight, seen.length) + "%" : "–"}</b><span>acerto (última resposta)</span></div>
          <div class="stat"><b>${streak} 🔥</b><span>dias seguidos</span></div>
        </div>

        ${seen.length >= 10 ? `<section class="card dt-ready ${est >= PASS ? "good" : "bad"}"><b>${est >= PASS ? "✅" : "📈"} Estimativa: ${est}/${EXAM_N} acertos</b>
          <span class="muted">${est >= PASS ? `Acima dos ${PASS} necessários. Continue treinando para manter.` : `Faltam ~${PASS - est} acertos para os ${PASS} necessários. Foque nas que errou.`} (Baseado na sua última resposta em cada questão vista.)</span></section>` : ""}

        <section class="card">
          <h3 style="margin:0 0 10px">Por assunto</h3>
          <div class="dt-topics">${Object.entries(TOPICS).map(([k, t]) => {
            const qs = Q.filter((q) => q.t === k), sn = qs.filter((q) => s.q[q.id]), rt = sn.filter((q) => s.q[q.id].last === 1);
            return `<button class="dt-topic" data-topic="${k}"><span class="row" style="justify-content:space-between"><b>${esc(t.name)}</b><small class="muted">${esc(t.official)}</small></span>
              <span class="bar" title="vistas"><i style="width:${pct(sn.length, qs.length)}%;background:var(--accent)"></i></span>
              <small class="muted">${sn.length}/${qs.length} vistas · ${sn.length ? pct(rt.length, sn.length) + "% de acerto" : "ainda não treinado"}</small></button>`;
          }).join("")}</div>
        </section>

        ${s.sessions.length ? `<section class="card"><h3 style="margin:0 0 8px">Últimos treinos</h3><ul class="dt-sessions">${s.sessions.slice(0, 8).map((x) => {
          const inTime = x.secs <= x.limit;
          return `<li><span class="t"><b>${esc(x.title)}</b><small class="muted">${new Date(x.at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${mmss(x.secs)} de ${mmss(x.limit)}</small></span>
            <span class="pill ${pct(x.ok, x.n) >= 70 ? "good" : ""}">${x.ok}/${x.n}</span><span class="pill ${inTime ? "good" : "warn"}">${inTime ? "⏱ no tempo" : "⏱ acima"}</span></li>`;
        }).join("")}</ul></section>` : ""}

        <section class="card">
          <h3 style="margin:0 0 6px">Tempo da prova</h3>
          <p class="muted" style="margin:0 0 10px;font-size:.9rem">Usado para calcular o seu ritmo. No RJ a prova costuma ter 60 minutos: confirme no site do DETRAN-RJ.</p>
          <div class="goal-select" id="dtMin">${[40, 50, 60].map((m) => `<button data-min="${m}" class="${s.examMin === m ? "on" : ""}">${m} min</button>`).join("")}</div>
        </section>
        ${sh.syncCard()}
      </div>`;
    sh.renderSyncCard();

    let n = 10;
    const budget = () => { const b = document.getElementById("dtBudget"); if (b) b.textContent = `Tempo equivalente na prova: ${mmss(n * perQ())}`; };
    budget();
    document.querySelectorAll("#dtN [data-n]").forEach((b) => b.addEventListener("click", () => {
      n = +b.dataset.n; document.querySelectorAll("#dtN [data-n]").forEach((x) => x.classList.toggle("on", x === b)); budget();
    }));
    document.getElementById("dtExam").addEventListener("click", () => startRun({ ids: randomExam(), title: "Simulado aleatório", mode: "sim", feedback: false }));
    document.getElementById("dtProvaGo").addEventListener("click", () => {
      const p = document.getElementById("dtProva").value;
      startRun({ ids: DATA.provas[p].slice(), title: `Prova oficial nº ${p}`, mode: `prova:${p}`, feedback: false });
    });
    document.getElementById("dtBite").addEventListener("click", () => {
      const f = document.getElementById("dtFocus").value;
      let ids, title;
      if (f === "erros") { ids = shuffle(wrongIds()).slice(0, n); title = "Treino: só erradas"; }
      else if (f === "placas") { ids = weightedPick(Q.filter((q) => q.img).map((q) => q.id), n); title = "Treino: placas"; }
      else if (f.startsWith("t:")) { const t = f.slice(2); ids = weightedPick(Q.filter((q) => q.t === t).map((q) => q.id), n); title = `Treino: ${topicName(t)}`; }
      else { ids = weightedPick(Q.map((q) => q.id), n); title = `Treino de ${n}`; }
      startRun({ ids, title, mode: "bite", feedback: document.getElementById("dtFeedback").checked });
    });
    document.querySelectorAll("[data-topic]").forEach((b) => b.addEventListener("click", () => {
      document.getElementById("dtFocus").value = `t:${b.dataset.topic}`;
      document.getElementById("dtBite").scrollIntoView({ behavior: "smooth", block: "center" });
    }));
    document.querySelectorAll("#dtMin [data-min]").forEach((b) => b.addEventListener("click", () => { st().examMin = +b.dataset.min; sh.save(); home(); }));
    const discard = document.getElementById("dtDiscard");
    if (discard) discard.addEventListener("click", () => { if (confirm("Descartar o treino em andamento?")) { store(RUN_KEY, null); home(); } });
  }

  let tick = null;
  function quiz() {
    sh.setNav("dt-home");
    const run = load(RUN_KEY);
    if (!run) { location.replace("#/detran"); return; }
    const n = run.ids.length;

    function render() {
      clearInterval(tick);
      const q = byId[run.ids[run.i]];
      const a = run.answers[run.i];
      const locked = run.feedback && a != null;
      const answered = Object.keys(run.answers).length;
      const isLast = run.i === n - 1;
      sh.view.innerHTML = `
        <div class="lesson-top">
          <a class="btn ghost" href="#/detran" title="Sair (o treino continua salvo)">✕</a>
          <div style="flex:1;min-width:0"><b>${esc(run.title)}</b><br><small class="muted">Questão ${run.i + 1} de ${n} · ${answered} respondida${answered === 1 ? "" : "s"}</small></div>
          <div class="dt-timer" id="dtTimer"><span id="dtClock"></span><div class="dt-tbar"><i id="dtTbar"></i></div><small id="dtPace"></small></div>
        </div>
        <section class="card slide">
          <div class="body">
            <div class="kicker">${esc(topicName(q.t))}${q.img ? " · placa" : ""}</div>
            <p class="dt-q">${esc(q.q)}</p>
            ${q.img ? `<img class="dt-img" src="${imgSrc(q.img)}" alt="Placa ${esc(q.img)}" onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'muted',textContent:'(imagem da placa ${esc(q.img)} indisponível)'}))">` : ""}
            <div class="options">${q.a.map((t, k) => {
              let cls = "";
              if (locked) { if (k === q.c) cls = "correct"; else if (k === a) cls = "wrong"; }
              else if (a === k) cls = "picked";
              return `<button class="option ${cls}" data-k="${k}" ${locked ? "disabled" : ""}><span class="dt-letter">${LETTERS[k]}</span> ${esc(t)}</button>`;
            }).join("")}</div>
            ${locked ? `<div class="why">${a === q.c ? "✅ Certo!" : `❌ Resposta certa: <b>${LETTERS[q.c]}</b>. ${esc(q.a[q.c])}`}</div>` : ""}
          </div>
          <div class="slide-nav">
            ${run.i > 0 ? `<button class="btn" id="dtPrev">← Anterior</button>` : ""}
            ${isLast
              ? `<button class="btn primary" id="dtFinish">${run.feedback ? "Ver resultado" : "Entregar prova"}</button>`
              : `<button class="btn primary" id="dtNext" ${run.feedback && a == null ? "disabled" : ""}>Próxima →</button>`}
          </div>
          ${!run.feedback ? `<div class="dt-grid" aria-label="Ir para questão">${run.ids.map((_, k) => `<button data-go="${k}" class="${k === run.i ? "cur" : ""} ${run.answers[k] != null ? "done" : ""}">${k + 1}</button>`).join("")}</div>
            ${!isLast ? `<div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn ghost" id="dtFinish2">Entregar prova</button></div>` : ""}` : ""}
        </section>`;

      document.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => choose(+b.dataset.k)));
      const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
      on("dtPrev", () => go(run.i - 1));
      on("dtNext", () => go(run.i + 1));
      on("dtFinish", submit);
      on("dtFinish2", submit);
      document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.go)));
      tick = setInterval(clock, 500);
      clock();
    }
    function clock() {
      if (!document.getElementById("dtClock")) { clearInterval(tick); return; }
      const el = (Date.now() - run.start) / 1000;
      const frac = el / run.limit;
      document.getElementById("dtClock").textContent = `${mmss(el)} / ${mmss(run.limit)}`;
      const bar = document.getElementById("dtTbar");
      bar.style.width = `${Math.min(100, frac * 100)}%`;
      const t = document.getElementById("dtTimer");
      t.className = `dt-timer ${frac > 1 ? "over" : frac > 0.8 ? "warn" : ""}`;
      // pace: where the real exam's clock would put you after the questions you've answered
      const done = Object.keys(run.answers).length;
      const diff = done * perQ() - el;
      document.getElementById("dtPace").textContent = done ? (diff >= 0 ? `${mmss(diff)} adiantado` : `${mmss(-diff)} atrasado`) : `ritmo da prova: ${mmss(perQ())}/questão`;
    }
    function choose(k) {
      if (run.feedback && run.answers[run.i] != null) return;
      run.answers[run.i] = k;
      if (run.feedback) { record(run.ids[run.i], k === byId[run.ids[run.i]].c); sh.save(); }
      store(RUN_KEY, run);
      render();
    }
    function go(i) { if (i < 0 || i >= n) return; run.i = i; store(RUN_KEY, run); render(); window.scrollTo({ top: 0 }); }
    function submit() {
      const missing = n - Object.keys(run.answers).length;
      if (missing && !confirm(`Ainda faltam ${missing} questão(ões) sem resposta. Entregar mesmo assim? (Em branco conta como erro.)`)) return;
      clearInterval(tick);
      finishRun(run);
    }
    sh.setKeyHandler((e) => {
      if (/INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || "")) return;
      const k = "1234".indexOf(e.key) > -1 ? +e.key - 1 : "abcd".indexOf(e.key.toLowerCase());
      if (k > -1 && e.key.length === 1) { e.preventDefault(); choose(k); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { const b = document.getElementById("dtNext") || document.getElementById("dtFinish"); if (b && !b.disabled) b.click(); }
      else if (e.key === "ArrowLeft") go(run.i - 1);
    });
    render();
  }

  function result() {
    sh.setNav("dt-home");
    const r = load(LAST_KEY);
    if (!r) { location.replace("#/detran"); return; }
    const p = pct(r.ok, r.n);
    const full = r.n === EXAM_N && !r.mode.startsWith("bite");
    const pace = r.secs / r.n, limitPace = (r.examMin * 60) / EXAM_N;
    const inTime = r.secs <= r.limit;
    const items = r.ids.map((id, k) => ({ q: byId[id], a: r.answers[k], k }));
    const wrongs = items.filter((x) => x.a !== x.q.c);
    sh.view.innerHTML = `
      <div class="stack">
        <section class="card done-hero">
          <div class="big">${p >= 70 ? "🎉" : "📚"}</div>
          <h1 style="margin-bottom:4px">${r.ok}/${r.n} · ${p}%</h1>
          <p style="margin:0"><span class="pill ${p >= 70 ? "good" : "warn"}">${full ? (r.ok >= PASS ? "Aprovado ✓" : `Reprovado: precisava de ${PASS}`) : p >= 70 ? "Acima dos 70% da prova ✓" : "Abaixo dos 70% da prova"}</span></p>
          <p class="muted" style="margin:8px 0 0">${esc(r.title)}</p>
        </section>
        <section class="card dt-time ${inTime ? "good" : "bad"}">
          <h3 style="margin:0 0 6px">${inTime ? "⏱ Dentro do tempo da prova" : "⏱ Acima do tempo da prova"}</h3>
          <p style="margin:0">Você levou <b>${mmss(r.secs)}</b> ${full ? `de ${mmss(r.limit)} da prova` : `para ${r.n} questões. Na prova de ${r.examMin} min isso equivale a <b>${mmss(r.limit)}</b>`}.</p>
          <p class="muted" style="margin:6px 0 0">Ritmo: <b>${mmss(pace)}</b> por questão (prova: ${mmss(limitPace)}). ${inTime ? `Nesse ritmo, as ${EXAM_N} questões levariam ${mmss(pace * EXAM_N)}, ${mmss(r.examMin * 60 - pace * EXAM_N)} antes do fim.` : `Nesse ritmo, as ${EXAM_N} questões levariam ${mmss(pace * EXAM_N)}, ${mmss(pace * EXAM_N - r.examMin * 60)} a mais que o limite.`}</p>
        </section>
        <div class="row">
          ${wrongs.length ? `<button class="btn primary" id="dtRetry">Treinar as ${wrongs.length} erradas</button>` : ""}
          <a class="btn" href="#/detran">Início</a>
        </div>
        <section class="card"><h3 style="margin:0 0 10px">Correção</h3><ol class="dt-review">${[...wrongs, ...items.filter((x) => x.a === x.q.c)].map(({ q, a, k }) => `
          <li class="${a === q.c ? "ok" : "bad"}"><small class="muted">Questão ${k + 1} · ${esc(topicName(q.t))}</small>
            <p>${esc(q.q)}</p>${q.img ? `<img class="dt-img sm" src="${imgSrc(q.img)}" alt="">` : ""}
            ${a !== q.c ? `<p class="dt-ans bad">Sua resposta: ${a == null ? "em branco" : `${LETTERS[a]}. ${esc(q.a[a])}`}</p>` : ""}
            <p class="dt-ans good">${a === q.c ? "✓" : "Certa:"} ${LETTERS[q.c]}. ${esc(q.a[q.c])}</p></li>`).join("")}</ol></section>
      </div>`;
    const retry = document.getElementById("dtRetry");
    if (retry) retry.addEventListener("click", () => startRun({ ids: shuffle(wrongs.map((x) => x.q.id)), title: "Revisão das erradas", mode: "bite", feedback: true }));
  }

  function erros() {
    sh.setNav("dt-erros");
    const ids = wrongIds().sort((a, b) => (st().q[b].w - st().q[a].w));
    sh.view.innerHTML = `<h1>Questões que você errou</h1>
      <p class="muted">A última resposta que você deu a estas questões estava errada. Acertando no treino, elas saem desta lista.</p>
      ${ids.length ? `<div class="row" style="margin-bottom:14px"><button class="btn primary" id="dtTrain">Treinar ${Math.min(ids.length, 20)} delas</button></div>
        <ol class="dt-review">${ids.map((id) => { const q = byId[id], r = st().q[id]; return `<li class="bad"><small class="muted">${esc(topicName(q.t))} · errou ${r.w}×, acertou ${r.r}×</small>
          <p>${esc(q.q)}</p>${q.img ? `<img class="dt-img sm" src="${imgSrc(q.img)}" alt="">` : ""}<p class="dt-ans good">Certa: ${LETTERS[q.c]}. ${esc(q.a[q.c])}</p></li>`; }).join("")}</ol>`
        : `<div class="card done-hero"><div class="big">🎯</div><h2>Nenhuma questão errada pendente</h2><p class="muted">Faça um treino para descobrir seus pontos fracos.</p><a class="btn primary" href="#/detran">Treinar</a></div>`}`;
    const b = document.getElementById("dtTrain");
    if (b) b.addEventListener("click", () => startRun({ ids: shuffle(ids).slice(0, 20), title: "Treino: só erradas", mode: "bite", feedback: true }));
  }

  function banco(qs) {
    sh.setNav("dt-banco");
    let topic = "", onlyImg = false;
    sh.view.innerHTML = `<h1>Banco de questões</h1>
      <p class="muted">${Q.length} questões únicas de ${Object.keys(DATA.provas).length} provas do simulado oficial. A resposta certa está destacada.</p>
      <div class="search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="dtQ" type="search" placeholder="Buscar: “rotatória”, “pedestre”, “álcool”…" autocomplete="off" aria-label="Buscar questões" value="${esc(qs || "")}"></div>
      <div class="chips" style="margin:12px 0"><button class="chip on" data-t="">Todos</button>${Object.entries(TOPICS).map(([k, t]) => `<button class="chip" data-t="${k}">${esc(t.name)}</button>`).join("")}<button class="chip" data-img="1">🛑 Com imagem</button></div>
      <p class="muted" id="dtCount" style="margin:0 0 8px"></p><ol class="dt-review" id="dtList"></ol>`;
    const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const list = document.getElementById("dtList"), input = document.getElementById("dtQ");
    function draw() {
      const terms = norm(input.value).split(/\s+/).filter(Boolean);
      const rows = Q.filter((q) => (!topic || q.t === topic) && (!onlyImg || q.img)
        && terms.every((t) => norm(q.q + " " + q.a.join(" ")).includes(t)));
      document.getElementById("dtCount").textContent = `${rows.length} questão(ões)`;
      list.innerHTML = rows.slice(0, 300).map((q) => {
        const r = st().q[q.id];
        return `<li><small class="muted">${esc(topicName(q.t))} · provas ${q.provas.join(", ")}${r ? ` · você: ✓${r.r} ✗${r.w}` : ""}</small>
          <p>${esc(q.q)}</p>${q.img ? `<img class="dt-img sm" src="${imgSrc(q.img)}" alt="" loading="lazy">` : ""}
          <ul class="dt-alts">${q.a.map((t, k) => `<li class="${k === q.c ? "good" : ""}">${LETTERS[k]}. ${esc(t)}</li>`).join("")}</ul></li>`;
      }).join("");
      history.replaceState(null, "", input.value.trim() ? `#/detran/banco/${encodeURIComponent(input.value.trim())}` : "#/detran/banco");
    }
    input.addEventListener("input", draw);
    document.querySelectorAll(".chips .chip").forEach((c) => c.addEventListener("click", () => {
      if (c.dataset.img) { onlyImg = !onlyImg; c.classList.toggle("on", onlyImg); }
      else { topic = c.dataset.t; document.querySelectorAll(".chips [data-t]").forEach((x) => x.classList.toggle("on", x === c)); }
      draw();
    }));
    draw();
  }

  window.Detran = {
    route(parts, shell) {
      sh = shell;
      clearInterval(tick);
      const [a, ...rest] = parts;
      if (a === "quiz") quiz();
      else if (a === "resultado") result();
      else if (a === "erros") erros();
      else if (a === "banco") banco(rest.length ? decodeURIComponent(rest.join("/")) : "");
      else home();
    },
  };
})();
