"""Search criteria and personal preferences.

Edit this file to change what the finder looks for. Everything the scripts
filter on lives here so each run is reproducible from this file alone.
"""

# --- Price & size ---------------------------------------------------------

# Maximum monthly rent (aluguel), in BRL. Condo fee and IPTU are NOT included.
MAX_RENT = 3700

# Listings below this are almost always typos, daily/room rentals or bait.
MIN_RENT = 800

# Titles containing any of these words are dropped (short-term / room rentals).
EXCLUDE_TITLE_WORDS = ["temporada", "diária", "diaria", "quarto em apartamento", "vaga em"]

# Optional cap on rent + condomínio + IPTU. None disables it.
MAX_TOTAL = None

# Minimum usable area in m².
MIN_AREA_M2 = 40

# --- Where ----------------------------------------------------------------

# name, ZAP/VivaReal zone, OLX path under /rio-de-janeiro-e-regiao/,
# QuintoAndar slug, and whether the listing must be close to a metro station.
NEIGHBORHOODS = [
    # Zona Sul
    ("Flamengo",        "Zona Sul",   "zona-sul/flamengo",        "flamengo",        False),
    ("Botafogo",        "Zona Sul",   "zona-sul/botafogo",        "botafogo",        False),
    ("Copacabana",      "Zona Sul",   "zona-sul/copacabana",      "copacabana",      False),
    ("Humaitá",         "Zona Sul",   "zona-sul/humaita",         "humaita",         False),
    ("Catete",          "Zona Sul",   "zona-sul/catete",          "catete",          False),
    ("Glória",          "Zona Sul",   "zona-sul/gloria",          "gloria",          False),
    ("Lagoa",           "Zona Sul",   "zona-sul/lagoa",           "lagoa",           False),
    ("Jardim Botânico", "Zona Sul",   "zona-sul/jardim-botanico", "jardim-botanico", False),
    ("Ipanema",         "Zona Sul",   "zona-sul/ipanema",         "ipanema",         False),
    ("Leblon",          "Zona Sul",   "zona-sul/leblon",          "leblon",          False),
    ("Gávea",           "Zona Sul",   "zona-sul/gavea",           "gavea",           False),
    ("Laranjeiras",     "Zona Sul",   "zona-sul/laranjeiras",     "laranjeiras",     False),
    ("Cosme Velho",     "Zona Sul",   "zona-sul/cosme-velho",     "cosme-velho",     False),
    # Only when close to the metro
    ("Tijuca",          "Zona Norte", "zona-norte/tijuca-e-regiao", "tijuca",        True),
    ("Centro",          "Centro",     "centro/centro",            "centro",          True),
]

# Straight-line distance to the nearest metro station for neighborhoods
# flagged above. 800 m is roughly a 10-minute walk.
METRO_MAX_DISTANCE_M = 800

# --- Fetching -------------------------------------------------------------

# Results are requested newest-first, so the page cap only drops old listings.
MAX_PAGES_PER_QUERY = 8

# Seconds between requests to the same site (be polite, avoid rate limits).
REQUEST_DELAY_S = 1.0

# --- Listings I don't like ------------------------------------------------

# Keys are the listing keys shown in the report ("zap:2914321526",
# "olx:1538898220", "quintoandar:895742709"). Disliking one listing also hides
# the same apartment when it is cross-posted on another portal.
# The value is a free-text reason, only for reference.
DISLIKED = {
}
