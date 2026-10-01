"""ZAP Imóveis and VivaReal: both front the same 'glue' search API (Grupo OLX)."""

from datetime import datetime

from ..models import Listing

PORTALS = {
    "zap": ("https://glue-api.zapimoveis.com.br/v2/listings", ".zapimoveis.com.br",
            "https://www.zapimoveis.com.br/imovel/{id}/"),
    "vivareal": ("https://glue-api.vivareal.com/v2/listings", ".vivareal.com.br",
                 "https://www.vivareal.com.br/imovel/{id}/"),
}
PAGE_SIZE = 24  # the API rejects anything larger
FIELDS = ("search(result(listings(listing(id,title,createdAt,updatedAt,usableAreas,bedrooms,"
          "unitTypes,usageTypes,address,pricingInfos,displayAddressType))),totalCount)")


def _price(listing):
    for p in listing.get("pricingInfos") or []:
        if p.get("businessType") == "RENTAL":
            return p
    return None


def _int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _parse(item, portal):
    l = item["listing"]
    if "APARTMENT" not in (l.get("unitTypes") or []) or "RESIDENTIAL" not in (l.get("usageTypes") or []):
        return None
    price = _price(l)
    if not price or not price.get("price"):
        return None
    addr = l.get("address") or {}
    point = addr.get("point") or {}
    street = " ".join(x for x in [addr.get("street"), addr.get("streetNumber")] if x)
    lat = lon = None
    # Without a street the point is just the neighborhood centroid.
    if addr.get("street") and point.get("lat"):
        lat, lon = point["lat"], point["lon"]
    created = l.get("createdAt")
    return Listing(
        source="zap",
        id=str(l["id"]),
        url=PORTALS[portal][2].format(id=l["id"]),
        title=(l.get("title") or "").strip(),
        neighborhood=addr.get("neighborhood") or "",
        rent=_int(price.get("price")),
        condo=_int(price.get("monthlyCondoFee")),
        # Despite its name, agents fill "yearlyIptu" with the monthly amount (it is
        # what the site shows next to the monthly rent), same as OLX.
        iptu=_int(price.get("yearlyIptu")),
        area=_int((l.get("usableAreas") or [0])[0]),
        bedrooms=_int((l.get("bedrooms") or [0])[0]) or None,
        address=street,
        zipcode=addr.get("zipCode") or "",
        lat=lat, lon=lon,
        published_at=datetime.fromisoformat(created) if created else None,
        extra_urls={portal: PORTALS[portal][2].format(id=l["id"])},
    )


def fetch(http, neighborhoods, cfg, portal, log):
    api, domain, _ = PORTALS[portal]
    out = []
    for name, zone, _olx, _qa, _metro in neighborhoods:
        got = 0
        for page in range(cfg.MAX_PAGES_PER_QUERY):
            params = {
                "business": "RENTAL", "listingType": "USED", "categoryPage": "RESULT",
                "unitTypes": "APARTMENT", "unitTypesV3": "APARTMENT", "usageTypes": "RESIDENTIAL",
                "unitSubTypes": "UnitSubType_NONE,DUPLEX,LOFT,STUDIO,TRIPLEX",
                "addressCity": "Rio de Janeiro", "addressState": "Rio de Janeiro",
                "addressZone": zone, "addressNeighborhood": name,
                "priceMax": cfg.MAX_RENT, "usableAreasMin": cfg.MIN_AREA_M2,
                "sort": "createdAt DESC",
                "size": PAGE_SIZE, "from": page * PAGE_SIZE,
                "includeFields": FIELDS,
            }
            resp = http.get(api, params=params, headers={"x-domain": domain})
            if resp.status_code != 200:
                log(f"  {portal} {name}: HTTP {resp.status_code}")
                break
            search = resp.json()["search"]
            items = search["result"]["listings"]
            out += [x for x in (_parse(i, portal) for i in items) if x]
            got += len(items)
            if not items or got >= search["totalCount"]:
                break
        log(f"  {portal} {name}: {got}")
    return out
