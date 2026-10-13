"""Collect the public DETRAN-RJ practice-exam questions.

The simulado site (http://simulado.detran.rj.gov.br/) has several exams, each at
/simulados/iniciarProva/<route>: "habilitacao" (first licence), its accessible
"habilitacao/libras" version, "renovacao" (licence renewal), "CRCI" and their libras
versions. They draw on different question banks: the regular habilitação page uses a
newer bank, while the libras, renewal and CRCI pages use an older one with many more
first-aid and defensive-driving questions. All are official DETRAN-RJ material on the
same subjects, so all are collected.

Each page serves one of a fixed set of numbered provas at random, with its 30 questions
and answer key embedded as JSON. A specific prova can't be requested, so this script
samples each page politely (one request every few seconds) and moves on once it has
gone a long stretch without seeing a new prova. Sign images are downloaded too.

Questions are © DETRAN-RJ and are only used to build a study app that credits them.

Usage:
    python3 scripts/scrape_detran.py              # every route; next route after 60 requests with no new prova
    python3 scripts/scrape_detran.py --patience 120 --routes habilitacao renovacao
"""
import argparse
import json
import pathlib
import re
import time
import unicodedata
import urllib.request

BASE = "http://simulado.detran.rj.gov.br"
ROUTES = ["habilitacao", "habilitacao/libras", "renovacao", "renovacao/libras", "CRCI", "CRCI/libras"]
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
    ap.add_argument("--max", type=int, default=400, help="max requests per route")
    ap.add_argument("--routes", nargs="+", default=ROUTES)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    IMG_OUT.mkdir(parents=True, exist_ok=True)
    raw_path = OUT / "provas.json"
    provas = json.loads(raw_path.read_text()) if raw_path.exists() else {}
    # older files keyed provas by number only; those were all from the habilitação page
    provas = {(k if ":" in k else f"habilitacao:{k}"): v for k, v in provas.items()}

    for route in args.routes:
        since_new = 0
        for i in range(1, args.max + 1):
            try:
                n, qs = parse(get(f"{BASE}/simulados/iniciarProva/{route}"))
            except Exception as exc:  # noqa: BLE001
                print(f"[{route} {i}] error: {exc}", flush=True)
                time.sleep(args.delay * 4)
                continue
            pk = f"{route}:{n}"
            if pk not in provas:
                provas[pk] = qs
                raw_path.write_text(json.dumps(provas, ensure_ascii=False, indent=1))
                since_new = 0
                print(f"[{route} {i}] NEW prova {n} → {sorted(k for k in provas if k.startswith(route + ':'))}", flush=True)
            else:
                since_new += 1
            if since_new >= args.patience:
                print(f"[{route} {i}] no new prova in {since_new} requests; next route", flush=True)
                break
            time.sleep(args.delay)

    # flatten + dedupe questions across provas; ids already in questions.json are kept
    # (saved progress is keyed by question id), new questions get the next free ids
    old_path = OUT / "questions.json"
    old = json.loads(old_path.read_text()) if old_path.exists() else []
    qkey = lambda q: key(q["q"]) + "|" + "|".join(key(a) for a in q["a"])  # noqa: E731
    old_ids = {qkey(q): q["id"] for q in old}
    next_id = max(old_ids.values(), default=0) + 1
    order = {r: i for i, r in enumerate(ROUTES)}
    seen, questions = {}, []
    for pk in sorted(provas, key=lambda k: (order.get(k.split(":")[0], 99), int(k.split(":")[1]))):
        for q in provas[pk]:
            img = q["codigoImagem"] if isinstance(q["codigoImagem"], str) and q["codigoImagem"] else None
            if img:
                img = re.sub(r"\.gif$", "", img, flags=re.I)  # a few codes already carry the extension
            item = {
                "q": q["desc_questao"].strip(),
                "a": [q[f"resposta{j}"].strip() for j in range(1, 5)],
                "c": int(q["respCorreta"]) - 1,
                "img": img,
                "provas": [pk],
            }
            k = qkey(item)
            if k in seen:
                if pk not in seen[k]["provas"]:
                    seen[k]["provas"].append(pk)
                continue
            if k in old_ids:
                item["id"] = old_ids[k]
            else:
                item["id"], next_id = next_id, next_id + 1
            item = {"id": item["id"], **{f: item[f] for f in ("q", "a", "c", "img", "provas")}}
            seen[k] = item
            questions.append(item)
    questions.sort(key=lambda q: q["id"])
    old_path.write_text(json.dumps(questions, ensure_ascii=False, indent=1))
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
