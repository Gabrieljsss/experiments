#!/usr/bin/env python3
"""Fetch Rio rental apartments from OLX, ZAP, VivaReal and QuintoAndar.

Usage:
    python find_apartments.py                 # all sources, writes reports/latest.md
    python find_apartments.py --sources zap,quintoandar
    python find_apartments.py --dry-run       # don't update data/state.json

Criteria and the DISLIKED list live in config.py.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import config
from apartments.geo import Geocoder, nearest_station
from apartments.http import Client
from apartments.models import norm
from apartments.sources import grupozap, olx, quintoandar

ROOT = Path(__file__).parent
STATE_FILE = ROOT / "data" / "state.json"
SOURCES = ["olx", "zap", "vivareal", "quintoandar"]


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"runs": [], "listings": {}, "geocode": {}}


def fetch_all(http, sources):
    listings = []
    for src in sources:
        log(f"Fetching {src}...")
        try:
            if src in ("zap", "vivareal"):
                listings += grupozap.fetch(http, config.NEIGHBORHOODS, config, src, log)
            elif src == "olx":
                listings += olx.fetch(http, config.NEIGHBORHOODS, config, log)
            elif src == "quintoandar":
                listings += quintoandar.fetch(http, config.NEIGHBORHOODS, config, log)
        except Exception as e:  # one broken site shouldn't sink the others
            log(f"  {src} FAILED: {e!r}")
    return listings


def merge_same_id(listings):
    """ZAP and VivaReal return the same inventory with the same ids."""
    by_key = {}
    for l in listings:
        if l.key in by_key:
            by_key[l.key].extra_urls.update(l.extra_urls)
        else:
            by_key[l.key] = l
    return list(by_key.values())


def passes_basic(l, allowed):
    if norm(l.neighborhood) not in allowed:
        return False
    if l.rent <= 0 or l.rent > config.MAX_RENT:
        return False
    if l.area < config.MIN_AREA_M2:
        return False
    if config.MAX_TOTAL is not None and l.total > config.MAX_TOTAL:
        return False
    return True


def group_duplicates(listings):
    """Cluster cross-posted copies of the same apartment (e.g. OLX + ZAP)."""
    groups = {}
    for l in sorted(listings, key=lambda l: (l.source, l.id)):
        groups.setdefault(l.fingerprint, []).append(l)
    return list(groups.values())


def fmt_money(v):
    return f"R$ {v:,.0f}".replace(",", ".")


def links(group):
    out = []
    for l in group:
        urls = l.extra_urls or {l.source: l.url}
        for portal, url in sorted(urls.items()):
            out.append(f"[{portal}]({url})")
    return " ".join(out)


def render(entries, run_at, is_first_run, stats):
    lines = [
        f"# Rio apartments — {run_at:%Y-%m-%d %H:%M} UTC",
        "",
        f"Rent ≤ {fmt_money(config.MAX_RENT)} · ≥ {config.MIN_AREA_M2} m² · "
        f"Tijuca/Centro only within {config.METRO_MAX_DISTANCE_M} m of a metro station. "
        f"Newest first (by original publication date when the site exposes it, otherwise by when this script first saw it).",
        "",
        "Fetched: " + ", ".join(f"{k} {v}" for k, v in stats.items()),
        "",
    ]
    new = [e for e in entries if e["new"]]
    if not is_first_run:
        lines += [f"**{len(new)} new since the last run** (marked 🆕).", ""]
    lines += [
        "| # | Published | Bairro | Rent | Total | m² | Qts | Metro | Title | Links | Key |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for i, e in enumerate(entries, 1):
        l = e["main"]
        date = e["date"].strftime("%d/%m") + ("" if e["date_known"] else "*")
        metro = f"{e['metro'][0]} {e['metro'][1]} m" if e["metro"] else ""
        title = (l.title or l.address).replace("|", "/")[:60]
        lines.append(
            f"| {i}{' 🆕' if e['new'] and not is_first_run else ''} | {date} | {l.neighborhood} | "
            f"{fmt_money(l.rent)} | {fmt_money(l.total)} | {l.area} | {l.bedrooms or ''} | {metro} | "
            f"{title} | {links(e['group'])} | `{l.key}` |"
        )
    lines += ["", "\\* no publication date on the site; date is when this script first saw the listing.",
              "Total = rent + condomínio + IPTU as reported by the site (QuintoAndar reports condo+IPTU together).", ""]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default=",".join(SOURCES))
    ap.add_argument("--out", default=str(ROOT / "reports" / "latest.md"))
    ap.add_argument("--json", default=str(ROOT / "reports" / "latest.json"))
    ap.add_argument("--dry-run", action="store_true", help="don't write data/state.json")
    args = ap.parse_args()
    sources = [s.strip() for s in args.sources.split(",") if s.strip()]

    run_at = datetime.now(timezone.utc).replace(microsecond=0)
    state = load_state()
    is_first_run = not state["runs"]
    http = Client(delay_s=config.REQUEST_DELAY_S)
    geocoder = Geocoder(http, state.setdefault("geocode", {}))

    raw = fetch_all(http, sources)
    stats = {s: sum(1 for l in raw if (s in l.extra_urls) or (l.source == s and not l.extra_urls)) for s in sources}
    listings = merge_same_id(raw)

    allowed = {norm(n[0]): n for n in config.NEIGHBORHOODS}
    listings = [l for l in listings if passes_basic(l, allowed)]
    log(f"{len(listings)} listings pass price/area/neighborhood filters")

    # Details (publication dates, CEPs) only for listings that passed the
    # cheap filters, and only once per listing thanks to the state cache.
    for l in listings:
        cached = state["listings"].setdefault(l.key, {})
        if l.source == "olx":
            olx.enrich(http, l, cached)
        elif l.source == "quintoandar":
            quintoandar.enrich(http, l, cached)

    entries = []
    disliked = set(config.DISLIKED)
    for group in group_duplicates(listings):
        if any(l.key in disliked for l in group):
            continue
        # Prefer the copy with the most information as the displayed one.
        main_l = max(group, key=lambda l: (l.published_at is not None, l.lat is not None, l.source == "zap"))
        needs_metro = allowed[norm(main_l.neighborhood)][4]
        metro = None
        coords = next(((l.lat, l.lon) for l in group if l.lat is not None), None)
        if coords is None and needs_metro:
            coords = next((geocoder.cep(l.zipcode) for l in group if l.zipcode), None)
        if coords:
            metro = nearest_station(*coords)
        if needs_metro and (metro is None or metro[1] > config.METRO_MAX_DISTANCE_M):
            continue

        first_seen = min(
            datetime.fromisoformat(state["listings"].setdefault(l.key, {}).setdefault("first_seen", run_at.isoformat()))
            for l in group
        )
        published = min((l.published_at for l in group if l.published_at), default=None)
        entries.append({
            "main": main_l, "group": group, "metro": metro,
            "date": published or first_seen, "date_known": published is not None,
            "new": first_seen == run_at,
        })

    entries.sort(key=lambda e: (e["date"], e["main"].key), reverse=True)
    report = render(entries, run_at, is_first_run, stats)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(report)
    Path(args.json).write_text(json.dumps([{
        "key": e["main"].key,
        "keys": [l.key for l in e["group"]],
        "neighborhood": e["main"].neighborhood,
        "rent": e["main"].rent, "total": e["main"].total, "area": e["main"].area,
        "bedrooms": e["main"].bedrooms, "title": e["main"].title, "address": e["main"].address,
        "published": e["date"].isoformat(), "published_known": e["date_known"], "new": e["new"],
        "metro": e["metro"],
        "urls": {p: u for l in e["group"] for p, u in (l.extra_urls or {l.source: l.url}).items()},
    } for e in entries], ensure_ascii=False, indent=1))

    if not args.dry_run:
        state["runs"].append(run_at.isoformat())
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=1, sort_keys=True))
    log(f"{len(entries)} apartments -> {args.out}")


if __name__ == "__main__":
    main()
