"""Throwaway spike S10: show WHICH expected strings each engine missed on a document (reads out/<engine>/<doc>.json).
    .venv/Scripts/python missing.py cv_fr_scanned.pdf
"""
import json, sys
from pathlib import Path
from bench import norm

HERE = Path(__file__).parent
doc = sys.argv[1]
truth = json.loads((HERE / "corpus" / "truth.json").read_text(encoding="utf-8"))[doc]
for engine_dir in sorted((HERE / "out").iterdir()):
    f = engine_dir / (doc + ".json")
    if not f.exists():
        continue
    text = "\n".join(b["text"] for b in json.loads(f.read_text(encoding="utf-8"))["blocks"])
    hay = norm(text, False)
    miss = [e for e in truth["expected"] if norm(e, False) not in hay]
    print(f"{engine_dir.name:13} missing {len(miss)}/{len(truth['expected'])}: {miss}")
