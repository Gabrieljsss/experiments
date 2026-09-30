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
- Light/dark themes, keyboard navigation (← →), mobile-first layout, and a "☰" one-page view of any lesson.
- Progress is saved in your browser (`localStorage`). There's no account and no server.

## Run it

It's plain static HTML/CSS/JS with no build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

You can also open `index.html` directly, or publish the repo with GitHub Pages (Settings → Pages → deploy from branch).

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
app/app.js                 router, daily plan, lesson player, quiz, spaced-repetition review
app/data/lessons-*.js      lesson content, one file per group of modules
data/playlist.json         playlist metadata (titles, ids, durations)
scripts/fetch_transcripts.py
```
