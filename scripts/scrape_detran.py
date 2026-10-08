"""Collect the public DETRAN-RJ "habilitação" practice-exam questions.

The simulado page (http://simulado.detran.rj.gov.br/simulados/iniciarProva/habilitacao)
serves one of a fixed set of numbered provas at random, with its 30 questions and
answer key embedded as JSON. A specific prova can't be requested, so this script
samples the page politely (one request every few seconds) and stops once it has
gone a long stretch without seeing a new prova. Sign images are downloaded too.

Questions are © DETRAN-RJ and are only used to build a study app that credits them.

Usage:
    python3 scripts/scrape_detran.py              # stop after 60 requests with no new prova
    python3 scripts/scrape_detran.py --patience 120
"""
import argparse
import json
import pathlib
import re
import time
import unicodedata
import urllib.request

BASE = "http://simulado.detran.rj.gov.br"
START = f"{BASE}/simulados/iniciarProva/habilitacao"
IMG = f"{BASE}/img/placas/{{}}.GIF"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "detran"
IMG_OUT = ROOT / "app" / "detran" / "img"
UA = "Mozilla/5.0 (study-app scraper; one request every few seconds)"


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")


def parse(html):
    prova = re.search(r"var numero_prova = '(\d+)'", html)
    m = re.search(r"var questoes = (\{.*?\});", html, flags=re.S)
    if not (prova and m):
        raise ValueError("page format changed: no questoes JSON found")
    qs = [q for q in json.loads(m.group(1))["Questao"] if q]
    return int(prova.group(1)), qs


def key(text):
    """Normalise question text so the same question in two provas dedupes."""
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--patience", type=int, default=60, help="stop after this many requests with no new prova")
    ap.add_argument("--delay", type=float, default=3.0)
    ap.add_argument("--max", type=int, default=400)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    IMG_OUT.mkdir(parents=True, exist_ok=True)
    raw_path = OUT / "provas.json"
    provas = json.loads(raw_path.read_text()) if raw_path.exists() else {}

    since_new = 0
    for i in range(1, args.max + 1):
        try:
            n, qs = parse(get(START))
        except Exception as exc:  # noqa: BLE001
            print(f"[{i}] error: {exc}", flush=True)
            time.sleep(args.delay * 4)
            continue
        if str(n) not in provas:
            provas[str(n)] = qs
            raw_path.write_text(json.dumps(provas, ensure_ascii=False, indent=1))
            since_new = 0
            print(f"[{i}] NEW prova {n} → {len(provas)} provas: {sorted(map(int, provas))}", flush=True)
        else:
            since_new += 1
        if since_new >= args.patience:
            print(f"[{i}] no new prova in {since_new} requests; stopping", flush=True)
            break
        time.sleep(args.delay)

    # flatten + dedupe questions across provas
    seen, questions = {}, []
    for n in sorted(provas, key=int):
        for q in provas[n]:
            k = key(q["desc_questao"]) + "|" + "|".join(key(q[f"resposta{j}"]) for j in range(1, 5))
            if k in seen:
                seen[k]["provas"].append(int(n))
                continue
            img = q["codigoImagem"] if isinstance(q["codigoImagem"], str) and q["codigoImagem"] else None
            item = {
                "id": len(questions) + 1,
                "q": q["desc_questao"].strip(),
                "a": [q[f"resposta{j}"].strip() for j in range(1, 5)],
                "c": int(q["respCorreta"]) - 1,
                "img": img,
                "provas": [int(n)],
            }
            seen[k] = item
            questions.append(item)
    (OUT / "questions.json").write_text(json.dumps(questions, ensure_ascii=False, indent=1))
    print(f"{len(provas)} provas, {sum(len(v) for v in provas.values())} questions, {len(questions)} unique", flush=True)

    # sign images
    for code in sorted({q["img"] for q in questions if q["img"]}):
        dest = IMG_OUT / f"{code}.gif"
        if dest.exists():
            continue
        try:
            dest.write_bytes(get(IMG.format(code), binary=True))
            print("img", code, flush=True)
        except Exception as exc:  # noqa: BLE001
            print("img FAIL", code, exc, flush=True)
        time.sleep(1)


if __name__ == "__main__":
    main()
