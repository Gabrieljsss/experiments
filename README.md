# Systems Design Bites

A small web app that turns the **[Systems Design 2.0](https://www.youtube.com/playlist?list=PLjTveVh7FakLdTmm42TMxbN8PvVn5g4KJ)** playlist by
**[Jordan has no life](https://www.youtube.com/@jordanhasnolife5163)** into daily, bite-sized, visual lessons.

> All credit for the ideas, explanations and examples goes to Jordan. This is an unofficial,
> non-commercial study companion built from his video transcripts. Every lesson links to and
> embeds the original video, so please watch the full classes, like them and subscribe.

## What's inside

- **60 bites**, one per video, grouped into 12 modules (indexes → transactions → replication →
  partitioning → consensus → databases → batch/stream processing → caching → networking).
- Each bite takes about 4 minutes: **one big idea → a diagram → 3–5 key points → takeaway and vocabulary → a quick quiz**.
- **Today** screen with a daily goal (1–3 bites), a streak and a 7-day activity strip.
- **Review**: finished bites feed a spaced-repetition deck (Leitner boxes). Quiz questions you miss come back first.
- **Search** (🔍 icon or press `/`): type a topic like `redis` to list every lesson that covers it, ranked, with highlighted snippets.
- Light/dark themes, keyboard navigation (← →), mobile-first layout, and a "☰" one-page view of any lesson.
- Progress is saved in your browser (`localStorage`). Optionally, **sign in with a username and password to sync it across devices** (see below).

## Run it

It's plain static HTML/CSS/JS with no build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

You can also open `index.html` directly, or publish the repo with GitHub Pages (Settings → Pages → deploy from branch).

## Cross-device sync (optional)

Sync stores progress in a free [Supabase](https://supabase.com) Postgres database. Sign-in is a plain **username + password**, with no email. Without a key in `app/config.js` the app runs fully offline and hides the sync card.

1. **Create the tables and functions.** Open `supabase/migrations/20261008000000_username_accounts.sql`, copy its **contents** (not the file path) into the Supabase SQL Editor and click Run. Or use the CLI: `supabase link --project-ref <ref>`, then `supabase db push`.
2. **Add the public key.** In Project Settings → API Keys, copy the **anon / publishable** key into `supabaseAnonKey` in `app/config.js`. That key is meant to be public; never put the `service_role` / secret key in the site.

How it's secured:
- The tables can't be read or written directly with the public key: row-level security is on, there are no policies, and table access is revoked.
- The app can only call five SQL functions: `sd_register`, `sd_login`, `sd_pull`, `sd_push` and `sd_logout`.
- Passwords are stored as bcrypt hashes. Signing in gives the device a random sync token; only its SHA-256 hash is kept in the database, and only the token (never the password) is kept on the device.
- After 10 wrong passwords in 15 minutes, logins for that username pause until the window passes.
- There's no password reset (there's no email), so use a password you don't use elsewhere.

How syncing works: progress is always saved locally first. When you're signed in, the app reads the cloud copy, merges it with yours and writes the result back on load, when you return to the tab, and about 1.5 s after each change. The merge is a state-based CRDT (bite 21): finished lessons and study days are unioned, a correct quiz answer on any device counts, and the most recently graded copy of each review card wins. Devices can therefore sync in any order and still converge.

`supabase/migrations/20261005000000_progress.sql` is the earlier email-based version and is no longer used.

## How the content was made

`scripts/fetch_transcripts.py` lists the playlist with `yt-dlp` and downloads each video's
English captions into `data/transcripts/` (git-ignored, since the raw transcripts are the creator's work).
The lessons in `app/data/*.js` are hand-written summaries of those transcripts.

```bash
pip install yt-dlp
python3 scripts/fetch_transcripts.py
```

YouTube rate-limits caption downloads from cloud IPs, so the script backs off and can be re-run;
it skips videos it already has.

## Project layout

```
index.html                 app shell and credits
app/styles.css             theme tokens (light/dark) and components
app/visuals.js             renders lesson diagrams (flow, table, steps, lanes, cells, meter, cards, pros/cons)
app/app.js                 router, daily plan, lesson player, quiz, spaced-repetition review, search
app/sync.js                optional sync (username/password via SQL functions) + CRDT merge of progress
app/config.js              Supabase URL and public anon key (empty key = offline only)
supabase/migrations/       SQL for accounts, sync functions and their permissions
app/data/lessons-*.js      lesson content, one file per group of modules
data/playlist.json         playlist metadata (titles, ids, durations)
scripts/fetch_transcripts.py
```
