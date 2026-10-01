"""QuintoAndar: public JSON search API used by their web app."""

import re
from datetime import datetime

from ..models import Listing

API = "https://apigw.prod.quintoandar.com.br/house-listing-search/v3/search/list"
HEADERS = {"Origin": "https://www.quintoandar.com.br", "Referer": "https://www.quintoandar.com.br/"}
PAGE_SIZE = 24
FIELDS = ["id", "rent", "totalCost", "iptuPlusCondominium", "area", "address", "regionName",
          "city", "type", "bedrooms", "neighbourhood", "listingTags", "isFurnished",
          "shortRentDescription", "location"]


def _body(slug, offset, cfg):
    return {
        "slug": slug, "topics": [], "fields": FIELDS,
        "sorting": {"criteria": "MOST_RECENT", "order": "DESC"},
        "pagination": {"pageSize": PAGE_SIZE, "offset": offset},
        "context": {"listShowing": True, "mapShowing": False, "numPhotos": 0, "isSSR": False},
        "filters": {
            "unknownSlugs": [], "enableFlexibleSearch": False, "businessContext": "RENT",
            "location": {"coordinate": {}, "viewport": {}, "neighborhoods": [], "countryCode": "BR"},
            "priceRange": [{"costType": "RENT_PRICE", "range": {"max": cfg.MAX_RENT}}],
            "availability": "ANY", "occupancy": "ANY", "partnerIds": [], "specialConditions": [],
            "excludedSpecialConditions": [], "blocklist": [], "selectedHouses": [], "categories": [],
            "houseSpecs": {
                "area": {"range": {"min": cfg.MIN_AREA_M2}}, "houseTypes": ["APARTMENT"],
                "amenities": [], "installations": [], "bathrooms": {"range": {}},
                "bedrooms": {"range": {}}, "parkingSpace": {"range": {}}, "suites": {"range": {}},
            },
            "origin": "HYBRID",
        },
        "locationDescriptions": [{"description": slug}],
    }


def _parse(hit):
    s = hit["_source"]
    if s.get("type") != "Apartamento" or not s.get("rent"):
        return None
    loc = s.get("location") or {}
    tags = list((hit.get("fields") or {}).get("listingTags") or [])
    if s.get("isFurnished"):
        tags.append("FURNISHED")
    return Listing(
        source="quintoandar",
        id=str(s["id"]),
        url=f"https://www.quintoandar.com.br/imovel/{s['id']}",
        title=s.get("shortRentDescription") or "",
        neighborhood=s.get("neighbourhood") or s.get("regionName") or "",
        rent=int(s["rent"]),
        # Search only gives condo+IPTU combined; enrich() splits it using the
        # listing page. Until then this overestimates the condo fee.
        condo=int(s.get("iptuPlusCondominium") or 0),
        area=int(s.get("area") or 0),
        bedrooms=s.get("bedrooms"),
        address=s.get("address") or "",
        lat=loc.get("lat"), lon=loc.get("lon"),
        tags=tags,
    )


def fetch(http, neighborhoods, cfg, log):
    out = []
    for name, _zone, _olx, slug, _metro in neighborhoods:
        slug = f"{slug}-rio-de-janeiro-rj-brasil"
        got = 0
        for page in range(cfg.MAX_PAGES_PER_QUERY):
            resp = http.post(API, json=_body(slug, page * PAGE_SIZE, cfg), headers=HEADERS)
            if resp.status_code != 200:
                log(f"  quintoandar {name}: HTTP {resp.status_code}")
                break
            hits = resp.json()["hits"]
            # When a neighborhood has few matches the API pads the page with
            # similar listings from nearby areas; those are filtered out later.
            out += [x for x in map(_parse, hits["hits"]) if x]
            got += len(hits["hits"])
            if not hits["hits"] or got >= hits["total"]["value"]:
                break
        log(f"  quintoandar {name}: {got}")
    return out


def enrich(http, listing, cached):
    """Publication date and condo/IPTU split from the listing page (cached per listing)."""
    # Retry the condo split on later runs: the page sometimes renders without it.
    if not cached.get("detail_done") or cached.get("condo") is None:
        try:
            resp = http.get(listing.url)
        except Exception:
            return
        # Rented/unlisted ads answer 404 but still render their data.
        if resp.status_code not in (200, 404):
            return
        m = re.search(r'"firstPublicationDate":"([^"]+)"', resp.text)
        if m:
            cached["published_at"] = datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%S.%f%z").isoformat()
        # The page also embeds an empty placeholder house (all zeros); only
        # trust the block whose rent matches this listing. IPTU is then the
        # remainder of the combined condo+IPTU value from the search API.
        m = re.search(r'"rentPrice":%d,"condoPrice":(\d+)' % listing.rent, resp.text)
        cached["condo"] = [int(m.group(1)), max(listing.condo - int(m.group(1)), 0)] if m else None
        cached["detail_done"] = True
    if cached.get("published_at"):
        listing.published_at = datetime.fromisoformat(cached["published_at"])
    if cached.get("condo"):
        listing.condo, listing.iptu = cached["condo"]
