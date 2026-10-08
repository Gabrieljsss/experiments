/* Optional cloud sync of study progress, stored in a Supabase Postgres database.
 *
 * Sign-in is a plain username + password (no email). The database functions in
 * supabase/migrations/20261008000000_username_accounts.sql check the password and hand
 * this device a random sync token; only the token is kept here, never the password.
 *
 * Progress always lives in localStorage first (so the app works offline). When the
 * viewer signs in, local and cloud copies are merged and the result is written back.
 * The merge is a state-based CRDT (see bite 21): every field merges with a
 * commutative, associative, idempotent rule, so devices can sync in any order,
 * any number of times, and still converge. */
(function () {
  const cfg = window.SD_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);

  /* ---------- merge (pure) ---------- */
  function mergeProgress(a, b) {
    a = a || {}; b = b || {};
    const out = { done: {}, quiz: {}, days: [], goal: a.goal || b.goal || 1, cards: {} };
    // finished lessons: keep the earliest completion date
    for (const src of [a.done || {}, b.done || {}])
      for (const [n, d] of Object.entries(src)) if (!out.done[n] || d < out.done[n]) out.done[n] = d;
    // study days: union
    out.days = [...new Set([...(a.days || []), ...(b.days || [])])].sort();
    // quiz: answered correctly on any device counts
    for (const src of [a.quiz || {}, b.quiz || {}])
      for (const [k, v] of Object.entries(src)) out.quiz[k] = !!(out.quiz[k] || v);
    // review cards: the most recently graded copy wins (then higher box, then later due date)
    const newer = (x, y) => {
      const ax = x.at || 0, ay = y.at || 0;
      if (ax !== ay) return ax > ay ? x : y;
      if ((x.box || 0) !== (y.box || 0)) return (x.box || 0) > (y.box || 0) ? x : y;
      return (x.due || "") >= (y.due || "") ? x : y;
    };
    for (const src of [a.cards || {}, b.cards || {}])
      for (const [k, c] of Object.entries(src)) out.cards[k] = out.cards[k] ? { ...newer(out.cards[k], c) } : { ...c };
    out.detran = mergeDetran(a.detran, b.detran);
    return out;
  }

  // DETRAN app progress: per-question records (newest answer wins), finished sessions
  // (a set keyed by id) and study days (a set). Same CRDT properties as above.
  function mergeDetran(a, b) {
    a = a || {}; b = b || {};
    const out = { q: {}, sessions: [], days: [], examMin: a.examMin || b.examMin || 60 };
    for (const src of [a.q || {}, b.q || {}])
      for (const [id, r] of Object.entries(src)) {
        const cur = out.q[id];
        if (!cur || (r.at || 0) > (cur.at || 0) || ((r.at || 0) === (cur.at || 0) && (r.r || 0) + (r.w || 0) > (cur.r || 0) + (cur.w || 0))) out.q[id] = { ...r };
      }
    const byId = {};
    for (const s of [...(a.sessions || []), ...(b.sessions || [])]) if (s && s.id && !byId[s.id]) byId[s.id] = s;
    out.sessions = Object.values(byId).sort((x, y) => y.at - x.at || (x.id < y.id ? -1 : 1)).slice(0, 200);
    out.days = [...new Set([...(a.days || []), ...(b.days || [])])].sort();
    return out;
  }

  /* ---------- talking to the database functions (Supabase's REST endpoint for SQL functions) ---------- */
  async function rpc(fn, args) {
    let res;
    try {
      res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
    } catch {
      throw new Error("Can't reach the sync server (offline?)");
    }
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const e = new Error((body && body.message) || `Sync server error ${res.status}`);
      e.signedOut = body && body.code === "28000";
      throw e;
    }
    return body;
  }

  /* ---------- account on this device ---------- */
  const ACCOUNT_KEY = "sd-bites:account";
  const loadAccount = () => { try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null"); } catch { return null; } };
  const saveAccount = (a) => { try { a ? localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)) : localStorage.removeItem(ACCOUNT_KEY); } catch { /* ignore */ } };

  let account = null, hooks = null, pushTimer = null;
  const status = { state: enabled ? "loading" : "off", lastSync: null, error: null };
  const emit = () => hooks && hooks.onStatus({ ...status, user: account && account.username });

  async function init(h) {
    hooks = h;
    if (!enabled) return;
    account = loadAccount();
    status.state = account ? "idle" : "signed-out";
    emit();
    if (account) syncNow();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && account) syncNow();
    });
  }

  function cleanUsername(u) { return String(u || "").trim().toLowerCase(); }

  async function signIn(username, password) {
    const u = cleanUsername(username);
    const token = await rpc("sd_login", { p_username: u, p_password: password });
    if (!token) throw new Error("Wrong username or password");
    return start(u, token);
  }

  async function register(username, password) {
    const u = cleanUsername(username);
    const token = await rpc("sd_register", { p_username: u, p_password: password });
    return start(u, token);
  }

  async function start(username, token) {
    account = { username, token };
    saveAccount(account);
    status.state = "idle"; status.error = null;
    emit();
    await syncNow();
    if (status.state === "error") throw new Error(status.error);
  }

  async function signOut() {
    const a = account;
    account = null; saveAccount(null);
    status.state = "signed-out"; status.lastSync = null; status.error = null;
    emit();
    if (a) rpc("sd_logout", { p_token: a.token }).catch(() => {}); // best effort
  }

  // read → merge → write, so a push never clobbers progress made on another device
  let running = null;
  function syncNow() {
    if (!account) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      status.state = "syncing"; emit();
      try {
        const remote = await rpc("sd_pull", { p_token: account.token });
        const merged = mergeProgress(hooks.getState(), remote && remote.data);
        hooks.applyMerged(merged);
        await rpc("sd_push", { p_token: account.token, p_data: merged });
        status.state = "idle"; status.lastSync = new Date(); status.error = null;
      } catch (e) {
        if (e.signedOut) {           // token revoked or account removed: back to the sign-in form
          account = null; saveAccount(null);
          status.state = "signed-out"; status.error = null;
        } else {
          status.state = "error"; status.error = e.message || String(e);
        }
      } finally {
        running = null; emit();
      }
    })();
    return running;
  }

  function queuePush() {
    if (!account) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, 1500);
  }

  window.Sync = { enabled, init, syncNow, queuePush, signIn, register, signOut, mergeProgress };
})();
