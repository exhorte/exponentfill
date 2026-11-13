"""Throwaway spike S10 helper: list the license of EVERY installed distribution (direct + transitive).

Reads only installed package metadata (no network). Flags copyleft and unknown licenses so a human reviews them.
This is a first filter, not a legal opinion: metadata can be wrong or vague (``License: See LICENSE``).

    uv run python licenses.py            # markdown table on stdout
    uv run python licenses.py --json     # machine-readable
"""

from __future__ import annotations

import json
import re
import sys
from importlib import metadata

COPYLEFT = re.compile(r"\b(A?GPL|LGPL|SSPL|EUPL|MPL|CC-BY-SA|CPAL|OSL|Sleepycat)\b", re.I)
PERMISSIVE = re.compile(r"\b(MIT|BSD|Apache|ISC|PSF|Python Software Foundation|Zlib|Unlicense|CC0|0BSD|HPND|BlueOak|Public Domain|CDLA-Permissive)\b", re.I)


def license_of(dist: metadata.Distribution) -> tuple[str, str]:
    meta = dist.metadata
    expr = (meta.get("License-Expression") or "").strip()
    lic = (meta.get("License") or "").strip().splitlines()[0][:80] if meta.get("License") else ""
    classifiers = [c.split("::")[-1].strip() for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
    text = expr or lic or "; ".join(classifiers)
    source = "License-Expression" if expr else "License" if lic else "classifier" if classifiers else "none"
    return text or "UNKNOWN", source


def classify(text: str) -> str:
    if text == "UNKNOWN":
        return "UNKNOWN"
    has_copyleft = bool(COPYLEFT.search(text))
    if has_copyleft:
        return "REVIEW (copyleft)"
    if PERMISSIVE.search(text):
        return "ok"
    return "REVIEW (unrecognised)"


def main() -> None:
    rows = []
    for dist in sorted(metadata.distributions(), key=lambda d: (d.metadata.get("Name") or "").lower()):
        name = dist.metadata.get("Name") or "?"
        text, source = license_of(dist)
        rows.append({"name": name, "version": dist.version, "license": text, "source": source, "verdict": classify(text)})
    if "--json" in sys.argv:
        print(json.dumps(rows, indent=2, ensure_ascii=False))
        return
    flagged = [r for r in rows if r["verdict"] != "ok"]
    print(f"{len(rows)} distributions installed, {len(flagged)} to review\n")
    print("| package | version | license (as declared) | source | verdict |\n|---|---|---|---|---|")
    for r in rows if "--all" in sys.argv else flagged:
        print(f"| {r['name']} | {r['version']} | {r['license'].replace('|', '/')} | {r['source']} | {r['verdict']} |")


if __name__ == "__main__":
    main()
