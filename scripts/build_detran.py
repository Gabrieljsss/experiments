"""Turn the scraped DETRAN-RJ questions into app/detran/questions.js.

- Merges near-duplicates: the same question with the same correct answer appears in
  several provas with slightly reworded wrong options; it's kept once.
- Adds a subject to each question. The site doesn't label subjects; they were
  assigned by reading each question (data/detran/topics.json). Anything new that a
  future scrape adds falls back to a keyword guess.

Usage: python3 scripts/build_detran.py
"""
import json
import pathlib
import re
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "detran"
OUT = ROOT / "app" / "detran" / "questions.js"

# weight of each subject in the 30-question exam (CONTRAN Res. 789/2020)
TOPICS = {
    "leg": {"name": "Legislação e infrações", "official": "12 na prova, com Sinalização"},
    "sin": {"name": "Sinalização", "official": "parte das 12 de Legislação"},
    "dd": {"name": "Direção defensiva", "official": "10 na prova"},
    "ps": {"name": "Primeiros socorros", "official": "3 na prova"},
    "ma": {"name": "Meio ambiente e cidadania", "official": "3 na prova"},
    "mec": {"name": "Mecânica básica", "official": "2 na prova"},
}

KEYWORDS = {
    "ps": ["socorro", "vitima", "ferid", "acidentad", "sangra", "hemorrag", "fratura", "queimadura", "desmai",
           "inconscien", "respira", "reanima", "massagem", "samu", "192", "193", "bombeiro", "parada cardi",
           "imobiliz", "pulso", "retirar o capacete", "remover a vitima", "primeiros", "sinalizar o local", "convuls", "engasg"],
    "mec": ["motor", "oleo", "radiador", "bateria", "embreagem", "cambio", "pneu", "calibr", "suspensao",
            "amortecedor", "injecao", "vela", "alternador", "correia", "arrefecimento", "filtro", "lubrifica",
            "superaquec", "fluido", "painel", "luz de advertencia", "manutencao", "revisao", "palheta",
            "freio de mao", "pastilha", "disco de freio", "escapamento", "mecanic", "estepe", "macaco", "triangulo"],
    "ma": ["ambiente", "poluic", "poluent", "emissao", "fumaca", "ruido", "barulho", "lixo", "descart",
           "recicla", "catalis", "cidadania", "cidadao", "respeito", "conviv", "solidari", "etica", "coletiv",
           "gentileza", "cortesia", "educacao", "consciencia", "empatia", "sustent", "combustivel", "economia de"],
    "dd": ["defensiv", "sono", "cansa", "fadiga", "alcool", "bebida", "embriag", "droga", "medicament", "distrac",
           "celular", "chuva", "neblina", "aquaplan", "distancia de seguimento", "distancia segura", "ponto cego",
           "visibilidade", "ofusc", "derrap", "condicoes adversas", "atencao", "prevenc", "risco", "sinistro",
           "colisao", "frenagem", "freada", "cinto", "cadeirinha", "crianca", "pista molhada", "curva", "noite",
           "farol", "ultrapass", "velocidade", "emocion", "estresse", "agressiv", "pressa"],
    "sin": ["placa", "sinal", "semaforo", "faixa", "marca", "sinaliza", "gesto", "apito", "luminos", "cone",
            "seta", "linha", "pintad", "regulament", "advertencia", "indicacao"],
    "leg": ["infracao", "multa", "ponto", "cnh", "permissao", "habilitac", "categoria", "ctb", "codigo",
            "penalidade", "suspens", "cassac", "documento", "crlv", "licenciamento", "artigo", "gravissima",
            "grave", "media", "leve", "recolhiment", "retencao", "remocao", "preferencia", "prioridade", "detran",
            "autoridade", "agente", "fiscaliza", "lei", "proibid", "permitid", "obrigatori", "estacion", "parada"],
}
# when scores tie, the more specific subject wins
PRIORITY = ["ps", "mec", "ma", "sin", "dd", "leg"]


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", s)


def classify(q):
    text = norm(q["q"] + " " + " ".join(q["a"]))
    stem = norm(q["q"])
    scores = {t: 0.0 for t in TOPICS}
    for t, words in KEYWORDS.items():
        for w in words:
            if w in stem:
                scores[t] += 2      # the question itself matters most
            elif w in text:
                scores[t] += 0.5    # answers give a weaker hint
    if q.get("img"):
        scores["sin"] += 4
    best = max(scores.values())
    if best == 0:
        return "leg"
    return next(t for t in PRIORITY if scores[t] == best)


def main():
    scraped = json.loads((SRC / "questions.json").read_text())
    raw = json.loads((SRC / "provas.json").read_text())
    manual = {int(k): v for k, v in json.loads((SRC / "topics.json").read_text()).items()} if (SRC / "topics.json").exists() else {}

    def key(s):
        return re.sub(r"[^a-z0-9]+", " ", norm(s)).strip()

    # merge near-duplicates (same question + same correct answer); keep the first copy
    canon, questions = {}, []
    alias = {}  # scraped id -> kept id
    for q in scraped:
        k = key(q["q"]) + "|" + key(q["a"][q["c"]])
        if k in canon:
            kept = canon[k]
            kept["provas"] = sorted(set(kept["provas"]) | set(q["provas"]))
            alias[q["id"]] = kept["id"]
            continue
        q = dict(q)
        canon[k] = q
        alias[q["id"]] = q["id"]
        questions.append(q)

    # order of questions inside each official prova, mapped to the kept ids
    lookup = {key(q["q"]) + "|" + "|".join(key(a) for a in q["a"]): alias[q["id"]] for q in scraped}
    provas = {}
    for n, qs in sorted(raw.items(), key=lambda kv: int(kv[0])):
        provas[n] = [lookup[key(x["desc_questao"]) + "|" + "|".join(key(x[f"resposta{j}"]) for j in range(1, 5))] for x in qs]

    for q in questions:
        q["t"] = manual.get(q["id"]) or classify(q)
    counts = {t: sum(q["t"] == t for q in questions) for t in TOPICS}

    data = {"questions": [{k: q[k] for k in ("id", "q", "a", "c", "img", "provas", "t")} for q in questions],
            "provas": provas, "topics": TOPICS}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "/* DETRAN-RJ Habilitação question bank. Generated by scripts/build_detran.py from the public\n"
        " * simulado at http://simulado.detran.rj.gov.br/ (all content © DETRAN-RJ). Do not edit by hand. */\n"
        "window.DETRAN = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"{len(scraped)} scraped → {len(questions)} after merging near-duplicates, {len(provas)} provas → {OUT.relative_to(ROOT)}")
    print("by subject:", counts)


if __name__ == "__main__":
    main()
