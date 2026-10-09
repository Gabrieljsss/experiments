# Systems Design Bites (+ DETRAN-RJ, + Mestrado em Epidemiologia)

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

## DETRAN-RJ Habilitação (second app)

Tap the logo in the top-left to switch to a second app for the **DETRAN-RJ theory exam** (prova teórica), in Portuguese.

- **263 questions** from all 10 provas of DETRAN-RJ's public [simulado](http://simulado.detran.rj.gov.br/), plus 25 sign images. All content © DETRAN-RJ, credited in the app.
- **Simulado completo:** 30 questions, answers only at the end, a question grid and a time limit. Use a random set (following the exam's split by subject) or replay any official prova (1–10).
- **Treino rápido:** bites of 5, 10, 15 or 20 questions, with instant feedback if you want it. Choose a focus: a smart mix (wrong and new questions first), only the ones you missed, signs, or one subject.
- **Pacing:** the timer budgets each bite at the real exam's pace (default 60 min / 30 questions = 2:00 per question, adjustable to 40 or 50 min). It shows whether you're ahead or behind, and the result screen says whether you'd finish the full exam in time.
- **Erros** lists questions whose last answer was wrong. **Banco** searches all questions by text, subject or sign images.
- A pass estimate based on your last answer to each question you've seen (21/30 = 70% to pass).
- Progress syncs with the same account as the lessons.

Refreshing the questions:

```bash
python3 scripts/scrape_detran.py   # samples the simulado politely until no new prova shows up; downloads sign images
python3 scripts/build_detran.py    # merges near-duplicates, adds subjects → app/detran/questions.js
```

The site serves one of a fixed set of numbered provas at random, with the answer key embedded. The scraper keeps sampling until 60 requests in a row bring nothing new. Subjects (Legislação, Sinalização, Direção defensiva, Primeiros socorros, Meio ambiente e cidadania, Mecânica básica) were assigned by reading each question (`data/detran/topics.json`); anything new falls back to a keyword guess.

## Mestrado em Epidemiologia · UERJ (third app)

Practice for the written exam of the **PPGSC/IMS/UERJ master's selection (Epidemiologia)**, in Portuguese.

- **Past exams 2023, 2024 and 2025**, with all their figures and tables. UERJ never published an answer key, so the key here is **unofficial**. It was written from the textbook, and debatable statements are flagged "discutível".
- **Textbook questions** written from Medronho et al., *Epidemiologia*, 2nd ed., chapters 1-6, 8 and 18, in the exam's true/false style. Some cover study-design identification and calculations, and there are open questions with model answers.
- **Exercise workbook** (Caderno de Exercícios): its exercises for chapters 2-6, 8 and 18, condensed into the same true/false format. The answers follow the caderno's own answer key (marked "do caderno"), and each statement also points to the caderno's answer page. The caderno's figures and text aren't reproduced.
- Together that makes 128 questions with 596 gradable statements.
- **Every statement links to the book.** You see an explanation and a reference ("Cap. 2, p. 22"). The reference opens a short chapter summary written for this app, at the right section.
- **Optional PDF links:** load your chapter PDFs (and the caderno) on the "Livro" screen and every reference also gets a "PDF ↗" button that opens that page. The PDFs stay in the browser (IndexedDB); they are never uploaded or committed.
- **Exam format and pacing:**
  - 3 hours for 8 true/false questions (1 point each) plus 1 open question (2 points), so 18 min per point.
  - Do a full simulado (random, or a past year), or bites of 1-5 questions with instant correction.
  - The timer shows whether you're on the exam's pace.
- **Open questions:** write a draft, compare it with the key points, and grade yourself 0-2.
- **Erros** lists statements whose last answer was wrong. **Banco** searches every statement with its answer and explanation.
- Progress syncs with the same account.

Content lives in plain text under `data/mestrado/`:

- `provas.txt`: past exams with the unofficial key.
- `livro.txt`: book questions.
- `caderno.txt`: workbook exercises.
- `resumos.txt`: chapter summaries.

Rebuild with `python3 scripts/build_mestrado.py`. It checks that every reference points to a real page and summary section, then writes `app/mestrado/data.js`. Exam figures were extracted from the exam PDFs into `app/mestrado/img/`.

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
scripts/scrape_detran.py, scripts/build_detran.py
scripts/build_mestrado.py
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
app/mestrado/              Mestrado app: mestrado.js (screens, V/F grading, timer, book links), data.js (generated), img/ (exam figures)
app/detran/                DETRAN app: detran.js (screens, quiz, timer), questions.js (generated), img/ (sign images)
data/mestrado/             past exams, book questions and chapter summaries (source of data.js)
data/detran/               scraped provas, deduplicated questions, hand-assigned subjects
data/playlist.json         playlist metadata (titles, ids, durations)
scripts/fetch_transcripts.py
scripts/scrape_detran.py, scripts/build_detran.py
scripts/build_mestrado.py
```
