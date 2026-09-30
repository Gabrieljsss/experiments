"""Fetch the video list and English transcripts for the "Systems Design 2.0"
playlist by Jordan has no life (https://www.youtube.com/@jordanhasnolife5163).

All content belongs to the original creator. Transcripts are used only to build
study notes that link back to the original videos.

Uses yt-dlp's caption download (youtube-transcript-api gets IP-blocked from
most cloud hosts).

Usage:
    pip install yt-dlp
    python scripts/fetch_transcripts.py
"""
import json
import pathlib
import subprocess
import tempfile
import time

PLAYLIST = "https://www.youtube.com/playlist?list=PLjTveVh7FakLdTmm42TMxbN8PvVn5g4KJ"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "transcripts"


def playlist_entries():
    raw = subprocess.check_output(["yt-dlp", "--flat-playlist", "-J", PLAYLIST])
    data = json.loads(raw)
    meta = {
        "title": data.get("title"),
        "channel": data.get("channel"),
        "channel_url": data.get("channel_url"),
        "url": PLAYLIST,
    }
    videos = [
        {"index": i + 1, "id": e["id"], "title": e["title"], "duration": e.get("duration")}
        for i, e in enumerate(data["entries"])
    ]
    return meta, videos


def json3_to_text(path):
    """Collapse json3 caption events into '[m:ss] text' lines."""
    events = json.loads(path.read_text()).get("events", [])
    lines = []
    for ev in events:
        text = "".join(s.get("utf8", "") for s in ev.get("segs", [])).replace("\n", " ").strip()
        if not text:
            continue
        sec = ev.get("tStartMs", 0) // 1000
        lines.append(f"[{sec // 60}:{sec % 60:02d}] {text}")
    return "\n".join(lines)


def fetch_one(video_id, tmp):
    subprocess.run(
        ["yt-dlp", "--skip-download", "--write-subs", "--write-auto-subs",
         "--sub-langs", "en,en-orig", "--sub-format", "json3",
         "-o", f"{tmp}/%(id)s", f"https://youtu.be/{video_id}"],
        check=True, capture_output=True,
    )
    for suffix in ("en", "en-orig"):
        p = pathlib.Path(tmp) / f"{video_id}.{suffix}.json3"
        if p.exists():
            return json3_to_text(p)
    raise RuntimeError("no English captions")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta, videos = playlist_entries()
    (ROOT / "data" / "playlist.json").write_text(
        json.dumps({**meta, "videos": videos}, indent=2, ensure_ascii=False)
    )
    with tempfile.TemporaryDirectory() as tmp:
        for v in videos:
            path = OUT / f"{v['index']:02d}_{v['id']}.txt"
            if path.exists():
                continue
            for attempt in range(3):
                try:
                    text = fetch_one(v["id"], tmp)
                    path.write_text(f"# {v['title']}\n# https://youtu.be/{v['id']}\n\n{text}\n")
                    print("ok  ", v["index"], v["title"][:60], flush=True)
                    break
                except subprocess.CalledProcessError as exc:
                    err = exc.stderr.decode(errors="ignore").strip().splitlines()[-1:]
                    print("fail", v["index"], err, "- retrying" if attempt < 2 else "", flush=True)
                    time.sleep(60 * 2 ** attempt)  # YouTube rate-limits caption requests
            time.sleep(20)


if __name__ == "__main__":
    main()
