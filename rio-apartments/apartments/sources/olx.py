"""OLX: listings are embedded in the Next.js RSC payload of the search page."""

import json
import re
from datetime import datetime, timezone

from ..models import Listing, norm

BASE = "https://www.olx.com.br/imoveis/aluguel/apartamentos/estado-rj/rio-de-janeiro-e-regiao/"
PUSH_RE = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)')


def _payload(html):
    return "".join(json.loads('"' + m.group(1) + '"') for m in PUSH_RE.finditer(html))


def _json_after(text, marker):
    i = text.find(marker)
    if i < 0:
        return None
    return json.JSONDecoder().raw_decode(text[i + len(marker):])[0]


def _money(v):
    digits = re.sub(r"\D", "", v or "")
    return int(digits) if digits else 0


def _parse(ad):
    if not ad.get("listId") or not ad.get("url"):
        return None  # banners and other non-listing slots
    props = {p["name"]: p.get("value") for p in ad.get("properties") or []}
    if "apartamento" not in (props.get("real_estate_type") or "").lower() and ad.get("category") != "Apartamentos":
        return None
    loc = ad.get("locationDetails") or {}
    return Listing(
        source="olx",
        id=str(ad["listId"]),
        url=ad["url"],
        title=(ad.get("subject") or "").strip(),
        neighborhood=loc.get("neighbourhood") or "",
        rent=_money(ad.get("price") or ad.get("priceValue")),
        condo=_money(props.get("condominio")),
        iptu=_money(props.get("iptu")),  # OLX reports it as monthly in most ads
        area=_money(props.get("size")),
        bedrooms=_money(props.get("rooms")) or None,
        # Search results only carry the last "bump" date; the real publication
        # date is filled in from the ad page by enrich().
        tags=[f"bumped:{ad['date']}"] if ad.get("date") else [],
    )


def fetch(http, neighborhoods, cfg, log):
    out = []
    for name, _zone, path, _qa, _metro in neighborhoods:
        got = 0
        for page in range(1, cfg.MAX_PAGES_PER_QUERY + 1):
            params = {"pe": cfg.MAX_RENT, "ss": cfg.MIN_AREA_M2, "sf": 1}  # sf=1: newest first
            if page > 1:
                params["o"] = page
            resp = http.get(BASE + path, params=params)
            if resp.status_code != 200:
                log(f"  olx {name}: HTTP {resp.status_code}")
                break
            payload = _payload(resp.text)
            filters = _json_after(payload, '"filters":') or {}
            # Past the last page OLX silently widens the search to the whole
            # region, dropping the neighborhood filter: stop there.
            if not filters.get("sd_id"):
                break
            ads = _json_after(payload, '"ads":') or []
            total = int((re.search(r'"totalOfAds\\?":(\d+)', payload) or [0, 0])[1])
            out += [x for x in map(_parse, ads) if x]
            got += len(ads)
            if not ads or got >= total:
                break
        log(f"  olx {name}: {got}")
    return out


def enrich(http, listing, cached):
    """Publication date and CEP from the ad page (cached per listing)."""
    if not cached.get("detail_done"):
        try:
            resp = http.get(listing.url)
        except Exception:
            return
        if resp.status_code != 200:
            return
        m = re.search(r'\\?"adDate\\?":\\?"?(\d{9,})', resp.text)
        if m:
            cached["published_at"] = datetime.fromtimestamp(int(m.group(1)), timezone.utc).isoformat()
        m = re.search(r'\\?"zipcode\\?":\\?"(\d{8})', resp.text)
        if m:
            cached["zipcode"] = m.group(1)
        cached["detail_done"] = True
    if cached.get("published_at"):
        listing.published_at = datetime.fromisoformat(cached["published_at"])
    listing.zipcode = cached.get("zipcode", listing.zipcode)
