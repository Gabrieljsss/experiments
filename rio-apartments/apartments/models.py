import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime


def norm(text):
    """Accent- and case-insensitive form used to compare neighborhood names."""
    text = unicodedata.normalize("NFKD", text or "")
    return " ".join("".join(c for c in text if not unicodedata.combining(c)).lower().split())


def furnished_status(flag, text):
    """'mobiliado', 'semi-mobiliado' or None from a site's flag plus free text."""
    t = norm(text)
    if re.search(r"semi[- ]?mobiliad", t):
        return "semi-mobiliado"
    if flag:
        return "mobiliado"
    if re.search(r"(nao|sem) (e )?mobiliad|sem mobilia", t):
        return None
    return "mobiliado" if re.search(r"mobiliad", t) else None


@dataclass
class Listing:
    source: str               # olx | zap | quintoandar (zap covers VivaReal too)
    id: str
    url: str
    title: str
    neighborhood: str
    rent: int
    area: int
    condo: int = 0
    iptu: int = 0             # monthly
    bedrooms: int | None = None
    address: str = ""
    zipcode: str = ""
    lat: float | None = None
    lon: float | None = None
    published_at: datetime | None = None   # original publication date, when the site exposes it
    extra_urls: dict = field(default_factory=dict)  # portal name -> url for the same listing
    tags: list = field(default_factory=list)
    furnished: str | None = None           # 'mobiliado' | 'semi-mobiliado'

    @property
    def key(self):
        return f"{self.source}:{self.id}"

    @property
    def total(self):
        """Monthly cost compared against MAX_TOTAL: rent + condomínio (no IPTU)."""
        return self.rent + (self.condo or 0)

    @property
    def fingerprint(self):
        """Same apartment cross-posted on different portals by the same agency."""
        return (norm(self.neighborhood), self.rent, self.area, self.condo or 0)
