"""Metro stations and geocoding for the "close to the metro" rule."""

import math

# Rio metro stations (lines 1, 2 and 4), coordinates from OpenStreetMap.
METRO_STATIONS = {
    "Uruguai": (-22.93093, -43.23829),
    "Saens Peña": (-22.92417, -43.23257),
    "São Francisco Xavier": (-22.92058, -43.22367),
    "Afonso Pena": (-22.91845, -43.21775),
    "Estácio": (-22.91354, -43.20657),
    "Praça Onze": (-22.90992, -43.20028),
    "Central do Brasil": (-22.90461, -43.19106),
    "Presidente Vargas": (-22.90329, -43.18620),
    "Uruguaiana": (-22.90289, -43.18180),
    "Carioca": (-22.90757, -43.17804),
    "Cinelândia": (-22.91090, -43.17568),
    "Glória": (-22.92063, -43.17662),
    "Catete": (-22.92595, -43.17655),
    "Largo do Machado": (-22.93114, -43.17768),
    "Flamengo": (-22.93718, -43.17854),
    "Botafogo": (-22.95037, -43.18420),
    "Cardeal Arcoverde": (-22.96382, -43.18137),
    "Siqueira Campos": (-22.96731, -43.18734),
    "Cantagalo": (-22.97549, -43.19446),
    "General Osório": (-22.98212, -43.19644),
    "Nossa Senhora da Paz": (-22.98372, -43.20602),
    "Jardim de Alah": (-22.98373, -43.21627),
    "Antero de Quental": (-22.98454, -43.22363),
    "Gávea": (-22.97945, -43.23230),
    "Cidade Nova": (-22.90875, -43.20630),
    "São Cristóvão": (-22.90969, -43.22099),
    "Maracanã": (-22.90972, -43.23389),
}


def haversine_m(a, b):
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def nearest_station(lat, lon):
    name, coords = min(METRO_STATIONS.items(), key=lambda kv: haversine_m((lat, lon), kv[1]))
    return name, round(haversine_m((lat, lon), coords))


class Geocoder:
    """CEP -> (lat, lon) through OpenStreetMap Nominatim, cached in the state file."""

    URL = "https://nominatim.openstreetmap.org/search"

    def __init__(self, http, cache):
        self.http = http
        self.cache = cache  # dict persisted by the caller

    def cep(self, cep):
        cep = "".join(c for c in cep or "" if c.isdigit())
        if len(cep) != 8:
            return None
        if cep in self.cache:
            return self.cache[cep]
        result = None
        try:
            resp = self.http.get(self.URL, params={
                "format": "json", "limit": 1, "country": "Brazil",
                "postalcode": f"{cep[:5]}-{cep[5:]}",
            }, headers={"User-Agent": "rio-apartment-finder/1.0 (personal use)"})
            hits = resp.json() if resp.status_code == 200 else []
            if hits:
                result = [float(hits[0]["lat"]), float(hits[0]["lon"])]
        except Exception:
            return None  # transient: don't cache
        self.cache[cep] = result
        return result
