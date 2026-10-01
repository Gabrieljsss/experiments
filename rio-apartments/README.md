# Rio apartment finder

Fetches rental apartments in Rio de Janeiro from **OLX**, **ZAP Imóveis**,
**VivaReal** and **QuintoAndar**, applies the same filters to all of them and
writes a single newest-first list.

## Criteria (edit `config.py`)

- Neighborhoods: Flamengo, Botafogo, Copacabana, Humaitá, Catete, Glória, Lagoa,
  Jardim Botânico, Ipanema, Leblon, Gávea, Laranjeiras, Cosme Velho — plus
  Tijuca and Centro **only when within 800 m of a metro station**.
- Rent + condomínio ≤ R$ 3.700 (IPTU not counted) (`MAX_TOTAL`; `MAX_RENT` caps rent alone).
- Usable area ≥ 40 m².
- `DISLIKED`: listings to hide, keyed by the `Key` column of the report. Hiding
  one copy also hides the same apartment cross-posted on another portal.

## Run

```bash
pip install -r requirements.txt
python find_apartments.py            # → reports/latest.md and reports/latest.json
python find_apartments.py --sources zap,quintoandar --dry-run
```

`data/state.json` remembers when each listing was first seen, so later runs
mark new listings with 🆕. It also caches publication dates and geocoded CEPs
so each listing's page is fetched only once.

## How each site is read

| Site | Method |
|---|---|
| ZAP / VivaReal | `glue-api` JSON search (same inventory and ids on both portals), sorted by `createdAt` |
| OLX | Search page's embedded Next.js payload, sorted newest first; the ad page gives the original publication date and CEP |
| QuintoAndar | `house-listing-search/v3/search/list` JSON API; the listing page gives `firstPublicationDate` |

OLX, ZAP and VivaReal are behind Cloudflare, which blocks plain `requests`;
`curl_cffi` impersonates a browser's TLS fingerprint. Metro distance is a
straight line from the listing's coordinates (ZAP, QuintoAndar) or its CEP
geocoded with OpenStreetMap Nominatim (OLX) to the station coordinates in
`apartments/geo.py`.
