/* Optional cloud sync of study progress through Supabase.
 *
 * Progress always lives in localStorage first (so the app works offline). When the
 * viewer signs in, local and cloud copies are merged and the result is written back.
 * The merge is a state-based CRDT (see bite 21): every field merges with a
 * commutative, associative, idempotent rule, so devices can sync in any order,
 * any number of times, and still converge. */
(function () {
  const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js";
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
    return out;
  }

  /* ---------- client ---------- */
  let client = null, user = null, hooks = null, pushTimer = null;
  const status = { state: enabled ? "loading" : "off", lastSync: null, error: null };
  const emit = () => hooks && hooks.onStatus({ ...status, email: user && user.email });

  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SDK; s.onload = resolve; s.onerror = () => reject(new Error("Couldn't load the sync library (offline?)"));
      document.head.appendChild(s);
    });
  }

  async function init(h) {
    hooks = h;
    if (!enabled) return;
    try {
      await loadSdk();
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        // PKCE puts the sign-in code in ?code= (not the #hash the app's router uses).
        // We exchange it ourselves (below) so the app can tell you whether sign-in worked.
        auth: { flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
      });
      client.auth.onAuthStateChange((_event, session) => {
        const next = (session && session.user) || null;
        const changed = (next && next.id) !== (user && user.id);
        user = next;
        status.state = user ? "idle" : "signed-out";
        emit();
        if (user && changed) setTimeout(syncNow, 0);
      });
      await handleRedirect();
      const { data } = await client.auth.getSession();
      user = (data.session && data.session.user) || null;
      status.state = user ? "idle" : "signed-out";
      emit();
      if (user) await syncNow();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && user) syncNow();
      });
    } catch (e) {
      status.state = "error"; status.error = e.message; emit();
    }
  }

  /* ---------- returning from the email link ---------- */
  // Success: ?code=…  Failure: ?error=…&error_description=… (or the same in the #hash)
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    const h = location.hash.startsWith("#error") ? new URLSearchParams(location.hash.slice(1)) : null;
    const code = q.get("code");
    const err = q.get("error_description") || q.get("error") || (h && (h.get("error_description") || h.get("error")));
    const errCode = q.get("error_code") || (h && h.get("error_code"));
    if (!code && !err) return;
    // drop the auth params from the address bar; keep the app's own #/route
    history.replaceState(null, "", location.pathname + (h ? "" : location.hash));
    if (err) return notify({ ok: false, message: friendly(errCode, err) });
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) return notify({ ok: false, message: friendly(error.code, error.message) });
    notify({ ok: true, email: data.session && data.session.user && data.session.user.email });
  }
  function friendly(code, msg) {
    const m = `${code || ""} ${msg || ""}`.toLowerCase();
    if (m.includes("verifier")) return "Sign-in link opened in a different browser than the one you requested it from. Request a new link in this browser and open it here.";
    if (m.includes("expired") || m.includes("invalid")) return "That sign-in link expired or was already used. Request a new one.";
    return `Sign-in failed: ${msg || code}`;
  }
  function notify(result) { if (hooks && hooks.onAuthResult) hooks.onAuthResult(result); }

  // read → merge → write, so a push never clobbers progress made on another device
  let running = null;
  function syncNow() {
    if (!client || !user) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      status.state = "syncing"; emit();
      try {
        const { data, error } = await client.from("progress").select("data").eq("user_id", user.id).maybeSingle();
        if (error) throw error;
        const merged = mergeProgress(hooks.getState(), data && data.data);
        hooks.applyMerged(merged);
        const { error: e2 } = await client.from("progress")
          .upsert({ user_id: user.id, data: merged, updated_at: new Date().toISOString() });
        if (e2) throw e2;
        status.state = "idle"; status.lastSync = new Date(); status.error = null;
      } catch (e) {
        status.state = "error"; status.error = e.message || String(e);
      } finally {
        running = null; emit();
      }
    })();
    return running;
  }

  function queuePush() {
    if (!user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, 1500);
  }

  async function signIn(email) {
    if (!client) throw new Error("Sync isn't available right now");
    const redirect = location.origin + location.pathname;
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
    if (error) {
      const m = `${error.code || ""} ${error.message || ""}`.toLowerCase();
      if (m.includes("rate limit") || m.includes("over_email_send")) {
        const e = new Error("Supabase's free email service only sends a few sign-in emails per hour, and that limit was reached. Try again in about an hour, or type the code from an email you already received.");
        e.rateLimited = true;
        throw e;
      }
      throw error;
    }
  }

  // The same email also carries a one-time code. Typing it works in any browser or
  // device, unlike the link, which must be opened in the browser that requested it.
  async function verifyCode(email, token) {
    if (!client) throw new Error("Sync isn't available right now");
    const { data, error } = await client.auth.verifyOtp({ email, token, type: "email" });
    if (error) {
      const m = `${error.code || ""} ${error.message || ""}`.toLowerCase();
      throw new Error(m.includes("expired") || m.includes("invalid")
        ? "That code is wrong or has expired. Codes only work once, and only the newest email's code is valid."
        : error.message);
    }
    notify({ ok: true, email: data.user && data.user.email });
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
  }

  window.Sync = { enabled, init, syncNow, queuePush, signIn, verifyCode, signOut, mergeProgress };
})();
