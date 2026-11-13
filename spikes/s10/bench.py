"""Throwaway spike S10: run every engine over the fictitious corpus and score it against ``corpus/truth.json``.

    uv run python bench.py                    # all engines
    uv run python bench.py pypdf docling      # a subset
    uv run python bench.py --repeat 3         # more timing samples

Scores per (engine, document):
  recall_exact   share of expected strings found (case-folded, whitespace-collapsed, ACCENTS KEPT)
  recall_folded  same with accents removed (the gap shows accent loss: it matters for French)
  order          share of consecutive pairs of ``order`` strings that appear in the right order (reading order)
  seconds        wall time of the extraction (Docling: first call also pays model loading, reported separately)
Outputs: out/<engine>/<doc>.json (the StructuredDocument), results.json, results.md.
"""

from __future__ import annotations

import json
import sys
import time
import unicodedata
from pathlib import Path

from engines import ENGINES

HERE = Path(__file__).parent
CORPUS = HERE / "corpus"
OUT = HERE / "out"


def norm(s: str, fold_accents: bool) -> str:
    s = unicodedata.normalize("NFKC", s).replace("’", "'").replace(" ", " ")
    if fold_accents:
        s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return " ".join(s.casefold().split())


def recall(text: str, expected: list[str], fold: bool) -> float:
    hay = norm(text, fold)
    return sum(norm(e, fold) in hay for e in expected) / len(expected) if expected else 1.0


def order_score(text: str, order: list[str]) -> float | None:
    if len(order) < 2:
        return None
    hay = norm(text, True)
    pos = [hay.find(norm(o, True)) for o in order]
    pairs = list(zip(pos, pos[1:]))
    return sum(a >= 0 and b >= 0 and a < b for a, b in pairs) / len(pairs)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    repeat = int(sys.argv[sys.argv.index("--repeat") + 1]) if "--repeat" in sys.argv else 1
    if "--repeat" in sys.argv:
        args = [a for a in args if a != str(repeat)]
    engines = {k: v for k, v in ENGINES.items() if not args or k in args}
    truth = json.loads((CORPUS / "truth.json").read_text(encoding="utf-8"))
    rows = []
    for name, fn in engines.items():
        (OUT / name).mkdir(parents=True, exist_ok=True)
        for doc_name, t in truth.items():
            path = CORPUS / doc_name
            times = []
            sd = None
            error = None
            for _ in range(repeat):
                t0 = time.perf_counter()
                try:
                    sd = fn(path)
                except Exception as e:  # an engine failing on a document is a RESULT, not a crash
                    error = f"{type(e).__name__}: {e}"
                    break
                times.append(time.perf_counter() - t0)
            row = {"engine": name, "doc": doc_name, "kind": t["kind"], "error": error}
            if sd is not None:
                text = sd.text
                row.update({
                    "seconds": round(min(times), 3), "chars": len(text), "pages": sd.page_count, "blocks": len(sd.blocks),
                    "tables": sum(b.kind == "table" for b in sd.blocks),
                    "recall_exact": round(recall(text, t["expected"], False), 3),
                    "recall_folded": round(recall(text, t["expected"], True), 3),
                    "order": order_score(text, t["order"]), "warnings": sd.warnings,
                })
                (OUT / name / (doc_name + ".json")).write_text(json.dumps(sd.to_dict(), ensure_ascii=False, indent=1), encoding="utf-8")
            rows.append(row)
            print(f"{name:13} {doc_name:24} " + (error or f"{row['seconds']:>7}s  exact={row['recall_exact']:.2f} folded={row['recall_folded']:.2f} order={row['order']}"), flush=True)
    # Keep rows of engines not run this time (so a partial run never erases earlier results), then add LiteParse (JS) rows.
    previous = []
    if (HERE / "results.json").exists():
        previous = [r for r in json.loads((HERE / "results.json").read_text(encoding="utf-8")) if r["engine"] not in engines]
    rows = previous + rows
    (HERE / "results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    lite = HERE / "results-liteparse.json"
    if lite.exists():
        rows = [r for r in rows if r["engine"] != "liteparse-wasm"] + json.loads(lite.read_text(encoding="utf-8"))

    # Markdown summary
    lines = ["| engine | document | kind | s | recall (accents kept) | recall (folded) | order | tables | note |", "|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        if r["error"]:
            lines.append(f"| {r['engine']} | {r['doc']} | {r['kind']} | — | — | — | — | — | ERROR {r['error'][:60]} |")
        else:
            note = "; ".join(r.get("warnings") or ([] if not r.get("needsOcr") else ["needsOcr: " + ",".join(r.get("reasons", []))]))[:60]
            lines.append(f"| {r['engine']} | {r['doc']} | {r['kind']} | {r['seconds']} | {r['recall_exact']} | {r['recall_folded']} | {r['order'] if r['order'] is not None else '—'} | {r.get('tables', '—')} | {note} |")
    (HERE / "results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
