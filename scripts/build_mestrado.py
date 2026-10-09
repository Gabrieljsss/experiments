"""Build app/mestrado/data.js from the hand-written sources in data/mestrado/.

Sources (plain text, easy to edit):
  provas.txt   past UERJ exams (2023-2025) with an unofficial answer key
  livro.txt    questions written from the textbook (Medronho et al., caps 1-6, 8, 18)
  resumos.txt  per-chapter summaries; every question reference links to a section

Question format (one block per question):
  === <id>
  cap: 2                      main chapter
  prova: 2024  num: 3         only for past-exam questions
  type: vf | choice | open    (default vf)
  title: short title
  ctx: context paragraph      (repeatable)
  img: file.png | caption     (repeatable; files live in app/mestrado/img/)
  table: a; b; c              (repeatable; first row is the header)
  opts: A; B; C               (choice questions)
  V | statement | explanation | refs        true/false item ("V?"/"F?" = debatable key)
  2 | statement | explanation | refs        choice item, 1-based index of the right option
  key: point of a model answer (open)       ans: summary (open)   pts: 2   ref: refs (open)
refs: "21-22" (page in the question's chapter) or "3:45; 6:137-138" (chapter:page), separated by ";".

Usage: python3 scripts/build_mestrado.py
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "mestrado"
OUT = ROOT / "app" / "mestrado" / "data.js"
IMG = ROOT / "app" / "mestrado" / "img"

# where each book page lives in the PDFs the course handed out (PDF page = book page - offset)
PDFS = [
    {"key": "Cap1", "from": 1, "to": 12, "offset": 0},
    {"key": "Cap2", "from": 13, "to": 30, "offset": 12},
    {"key": "Cap3_Pt1", "from": 31, "to": 55, "offset": 30},
    {"key": "Cap3_Pt2", "from": 56, "to": 82, "offset": 55},
    {"key": "Cap4", "from": 83, "to": 102, "offset": 82},
    {"key": "Cap5", "from": 103, "to": 122, "offset": 102},
    {"key": "Cap6", "from": 123, "to": 151, "offset": 122},
    {"key": "Cap8e18", "from": 173, "to": 179, "offset": 172},
    {"key": "Cap8e18", "from": 323, "to": 341, "offset": 315},
]

errors = []


def err(msg):
    errors.append(msg)


def parse_resumos():
    caps, sections = {}, []
    cur = None
    for raw in (SRC / "resumos.txt").read_text().splitlines():
        line = raw.rstrip()
        m = re.match(r"^# (\d+) \| (.+?) \| (.+?) \| (\d+)-(\d+)$", line)
        if m:
            c = int(m.group(1))
            caps[c] = {"n": c, "title": m.group(2), "authors": m.group(3), "from": int(m.group(4)), "to": int(m.group(5))}
            continue
        m = re.match(r"^## (.+?) \| (\d+)-(\d+)$", line)
        if m:
            c = max(caps)
            cur = {"id": f"s{c}-{sum(s['cap'] == c for s in sections) + 1}", "cap": c, "title": m.group(1),
                   "from": int(m.group(2)), "to": int(m.group(3)), "pts": []}
            sections.append(cur)
            continue
        if line.startswith("- ") and cur:
            cur["pts"].append(line[2:])
    return caps, sections


def parse_refs(text, cap, where):
    refs = []
    for part in [p.strip() for p in text.split(";") if p.strip()]:
        m = re.match(r"^(?:(\d+):)?(\d+)(?:-(\d+))?$", part)
        if not m:
            err(f"{where}: bad ref '{part}'")
            continue
        c = int(m.group(1)) if m.group(1) else cap
        a = int(m.group(2))
        b = int(m.group(3)) if m.group(3) else a
        refs.append({"c": c, "p": a, "p2": b})
    return refs


def parse_questions(path, source):
    qs = []
    cur = None
    for n, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.rstrip()
        if not line or (line.startswith("#") and not cur) or line.startswith("# "):
            continue
        if line.startswith("=== "):
            cur = {"id": line[4:].strip(), "src": source, "type": "vf", "ctx": [], "imgs": [], "table": [], "items": [], "keys": []}
            qs.append(cur)
            continue
        if cur is None:
            continue
        where = f"{path.name}:{n} ({cur['id']})"
        m = re.match(r"^(cap|prova|num|type|title|ctx|img|table|opts|key|ans|pts|ref): ?(.*)$", line)
        if m:
            k, v = m.group(1), m.group(2).strip()
            if k in ("cap", "prova", "num"):
                cur[k] = int(v)
            elif k == "pts":
                cur["pts"] = float(v)
            elif k in ("type", "title", "ans"):
                cur[k] = v
            elif k == "ctx":
                cur["ctx"].append(v)
            elif k == "img":
                f, _, cap = [x.strip() for x in v.partition("|")]
                if not (IMG / f).exists():
                    err(f"{where}: missing image {f}")
                cur["imgs"].append({"f": f, "cap": cap})
            elif k == "table":
                cur["table"].append([x.strip() for x in v.split(";")])
            elif k == "opts":
                cur["opts"] = [x.strip() for x in v.split(";")]
            elif k == "key":
                cur["keys"].append(v)
            elif k == "ref":
                cur["refs"] = parse_refs(v, cur.get("cap", 0), where)
            continue
        parts = [p.strip() for p in line.split(" | ")]
        if len(parts) != 4:
            err(f"{where}: expected 'answer | text | explanation | refs', got {len(parts)} fields")
            continue
        a, t, e, r = parts
        item = {"id": f"{cur['id']}.{len(cur['items']) + 1}", "t": t, "e": e, "refs": parse_refs(r, cur.get("cap", 0), where)}
        if a.rstrip("?") in ("V", "F"):
            item["a"] = a.rstrip("?")
            if a.endswith("?"):
                item["disc"] = 1
        elif a.isdigit():
            item["a"] = int(a) - 1
        else:
            err(f"{where}: bad answer '{a}'")
        cur["items"].append(item)
    return qs


def main():
    caps, sections = parse_resumos()
    questions = parse_questions(SRC / "provas.txt", "prova") + parse_questions(SRC / "livro.txt", "livro")

    def section_for(c, p):
        best = None
        for s in sections:
            if s["cap"] == c and s["from"] <= p <= s["to"] and (best is None or s["from"] >= best["from"]):
                best = s
        return best

    seen = set()
    for q in questions:
        if q["id"] in seen:
            err(f"duplicate id {q['id']}")
        seen.add(q["id"])
        if q.get("cap") not in caps:
            err(f"{q['id']}: unknown chapter {q.get('cap')}")
        if q["type"] == "open":
            if not q["keys"]:
                err(f"{q['id']}: open question without key points")
        else:
            if not q["items"]:
                err(f"{q['id']}: no items")
            for it in q["items"]:
                if q["type"] == "choice":
                    if not isinstance(it.get("a"), int) or not (0 <= it["a"] < len(q.get("opts", []))):
                        err(f"{it['id']}: choice answer out of range")
                elif it.get("a") not in ("V", "F"):
                    err(f"{it['id']}: vf item needs V or F")
        for r in [r for it in q["items"] for r in it["refs"]] + q.get("refs", []):
            if r["c"] not in caps:
                err(f"{q['id']}: ref to unknown chapter {r['c']}")
                continue
            if not (caps[r["c"]]["from"] <= r["p"] <= caps[r["c"]]["to"]):
                err(f"{q['id']}: page {r['p']} outside chapter {r['c']} ({caps[r['c']]['from']}-{caps[r['c']]['to']})")
            s = section_for(r["c"], r["p"])
            if s:
                r["s"] = s["id"]
            else:
                err(f"{q['id']}: no summary section for {r['c']}:{r['p']}")
        if q.get("ctx") == []:
            q.pop("ctx")
        for k in ("imgs", "table", "keys", "items"):
            if not q[k]:
                q.pop(k)

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    counts = {}
    for q in questions:
        for it in q.get("items", []):
            for r in it["refs"][:1]:
                counts[r["s"]] = counts.get(r["s"], 0) + 1
    for s in sections:
        s["n"] = counts.get(s["id"], 0)

    data = {"caps": caps, "sections": sections, "questions": questions, "pdfs": PDFS}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "/* Mestrado em Epidemiologia (IMS/UERJ): question bank and chapter summaries.\n"
        " * Generated by scripts/build_mestrado.py from data/mestrado/*.txt. Do not edit by hand. */\n"
        "window.MESTRADO = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    items = sum(len(q.get("items", [])) for q in questions)
    by = {}
    for q in questions:
        by[q["cap"]] = by.get(q["cap"], 0) + len(q.get("items", []))
    print(f"{len(questions)} questions ({sum(q['src'] == 'prova' for q in questions)} from past exams), "
          f"{items} gradable items, {sum(q['type'] == 'open' for q in questions)} open, {len(sections)} summary sections")
    print("items by chapter:", dict(sorted(by.items())))
    empty = [s["id"] for s in sections if not s["n"]]
    if empty:
        print("sections no question points to first:", ", ".join(empty))


if __name__ == "__main__":
    main()
