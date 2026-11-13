"""License gate for Python dependencies (installed distributions, direct + transitive). Run: ``uv run python scripts/check_licenses.py``.

Refuses GPL / AGPL / SSPL / unknown. LGPL is reported and needs a documented decision. MPL-2.0 is accepted (file-level copyleft,
unmodified use). A declared license can hide bundled components (e.g. an OpenCV wheel with FFmpeg): read LICENSE-3RD-PARTY too.
"""

from __future__ import annotations

import re
import sys
from importlib import metadata

DENY = re.compile(r"\b(A?GPL|SSPL|BUSL|CPAL|OSL|EUPL|CC-BY-NC)\b", re.I)
LGPL = re.compile(r"\bLGPL\b", re.I)
# "package": "reason" — add justified exceptions here.
ALLOW: dict[str, str] = {
    # LGPL-3.0, imported unmodified as a library, backend runs on our own servers (no distribution of the backend).
    # Revisit if the backend is ever shipped to customers (on-prem): alternatives asyncpg (Apache-2.0) or pg8000 (BSD-3).
    # Decision recorded in LICENSE_AUDIT.md (2026-11-12); owner: Exhorte.
    "psycopg": "LGPL-3.0 library, unmodified, SaaS use",
    "psycopg-binary": "LGPL-3.0 library (bundles libpq), unmodified, SaaS use",
}


def declared(dist: metadata.Distribution) -> str:
    meta = dist.metadata
    expr = (meta.get("License-Expression") or "").strip()
    lic = (meta.get("License") or "").strip().splitlines()[0][:100] if meta.get("License") else ""
    classifiers = "; ".join(c.split("::")[-1].strip() for c in meta.get_all("Classifier") or [] if c.startswith("License ::"))
    return expr or classifiers or lic or "UNKNOWN"


def main() -> int:
    bad: list[str] = []
    total = 0
    for dist in metadata.distributions():
        name = (dist.metadata.get("Name") or "?").lower()
        if name == "exponent-fill-backend":
            continue
        total += 1
        text = declared(dist)
        if name in ALLOW:
            continue
        if text == "UNKNOWN":
            bad.append(f"{name}: license not declared")
        elif LGPL.search(text):
            bad.append(f"{name}: {text} (LGPL: needs a documented decision)")
        elif DENY.search(text):
            bad.append(f"{name}: {text}")
    if bad:
        print(f"check_licenses: {len(bad)} distribution(s) refused", *bad, sep="\n  ")
        return 1
    print(f"check_licenses: OK ({total} Python distributions)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
