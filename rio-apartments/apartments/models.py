import unicodedata
from dataclasses import dataclass, field
from datetime import datetime


def norm(text):
    """Accent- and case-insensitive form used to compare neighborhood names."""
    text = unicodedata.normalize("NFKD", text or "")
    return " ".join("".join(c for c in text if not unicodedata.combining(c)).lower().split())


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

    @property
    def key(self):
        return f"{self.source}:{self.id}"

    @property
    def total(self):
        return self.rent + (self.condo or 0) + (self.iptu or 0)

    @property
    def fingerprint(self):
        """Same apartment cross-posted on different portals by the same agency."""
        return (norm(self.neighborhood), self.rent, self.area, self.condo or 0)
