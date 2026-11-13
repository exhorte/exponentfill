"""Throwaway: save the OFFICIAL documentation pages needed in flight as clean, script-free HTML files.

Why: the spikes run offline. Output goes OUTSIDE the repository (these are third-party documents, kept for personal
offline reading, never redistributed): C:\\Ebrain_os\\references-externes\\docs-officielles\\.

    .venv/Scripts/python -I fetch_docs.py        # run online, once, before the flight

Pages are DATA: scripts, styles, iframes and event handlers are stripped; nothing here is ever executed.
"""

from __future__ import annotations

import re
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

from lxml import html as lxml_html

OUT = Path(r"C:\Ebrain_os\references-externes\docs-officielles")

PAGES: dict[str, str] = {
    # --- Chrome extensions (MV3) -------------------------------------------------------------------------------
    "chrome-api-sidepanel": "https://developer.chrome.com/docs/extensions/reference/api/sidePanel",
    "chrome-api-permissions": "https://developer.chrome.com/docs/extensions/reference/api/permissions",
    "chrome-api-scripting": "https://developer.chrome.com/docs/extensions/reference/api/scripting",
    "chrome-api-dom": "https://developer.chrome.com/docs/extensions/reference/api/dom",
    "chrome-api-offscreen": "https://developer.chrome.com/docs/extensions/reference/api/offscreen",
    "chrome-api-storage": "https://developer.chrome.com/docs/extensions/reference/api/storage",
    "chrome-api-runtime": "https://developer.chrome.com/docs/extensions/reference/api/runtime",
    "chrome-api-tabs": "https://developer.chrome.com/docs/extensions/reference/api/tabs",
    "chrome-sw-lifecycle": "https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle",
    "chrome-sw-events": "https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events",
    "chrome-content-scripts": "https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts",
    "chrome-match-patterns": "https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns",
    "chrome-declare-permissions": "https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions",
    "chrome-permission-warnings": "https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings",
    "chrome-manifest-csp": "https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy",
    "chrome-messaging": "https://developer.chrome.com/docs/extensions/develop/concepts/messaging",
    # --- Tooling -------------------------------------------------------------------------------------------------
    "wxt-entrypoints": "https://wxt.dev/guide/essentials/entrypoints",
    "wxt-content-scripts": "https://wxt.dev/guide/essentials/content-scripts",
    "wxt-config": "https://wxt.dev/guide/essentials/config/manifest",
    "wxt-i18n": "https://wxt.dev/guide/essentials/i18n",
    "playwright-chrome-extensions": "https://playwright.dev/docs/chrome-extensions",
    "playwright-test-fixtures": "https://playwright.dev/docs/test-fixtures",
    "dexie-tutorial": "https://dexie.org/docs/Tutorial/Getting-started",
    "dexie-table-api": "https://dexie.org/docs/Table/Table",
    "dexie-version-stores": "https://dexie.org/docs/Version/Version.stores()",
    "zod-api": "https://zod.dev/api",
    # --- Platform ------------------------------------------------------------------------------------------------
    "mdn-subtle-derivekey": "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey",
    "mdn-subtle-encrypt": "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt",
    "mdn-datatransfer-files": "https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files",
    "mdn-shadowroot": "https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot",
    # --- Document extraction (S10) ---------------------------------------------------------------------------------
    "docling-usage": "https://docling-project.github.io/docling/usage/",
    "docling-advanced-options": "https://docling-project.github.io/docling/usage/advanced_options/",
    "docling-supported-formats": "https://docling-project.github.io/docling/usage/supported_formats/",
    "liteparse-readme": "https://github.com/run-llama/liteparse",
}

DROP = ('script', 'style', 'iframe', 'noscript', 'svg', 'form', 'button', 'nav', 'link', 'meta', 'object', 'embed')


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "offline-docs-fetch/1.0", "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=40) as r:  # noqa: S310 - fixed https URLs from the list above
        return r.read()


def main_content(raw: bytes) -> tuple[str, str]:
    tree = lxml_html.fromstring(raw)
    title = (tree.findtext(".//title") or "").strip()
    node = None
    for xp in ("//main", "//article", "//*[@role='main']", "//div[contains(@class,'markdown')]", "//body"):
        found = tree.xpath(xp)
        if found:
            node = found[0]
            break
    for el in list(node.iter()):
        if not isinstance(el.tag, str) or el.tag in DROP:
            if el.getparent() is not None:
                el.drop_tree()
            continue
        for attr in list(el.attrib):
            if attr.lower().startswith("on") or attr in ("srcset", "style"):
                del el.attrib[attr]
        href = el.get("href", "")
        if href.lower().startswith("javascript:"):
            del el.attrib["href"]
    cleaned = node
    return title, lxml_html.tostring(cleaned, encoding="unicode")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = ["# Official documentation — offline copies", "",
             f"Fetched {date.today().isoformat()} for use without network. Third-party content, personal use only; not part of any repository.", "",
             "| file | source | bytes | note |", "|---|---|---|---|"]
    failures = 0
    only = set(sys.argv[1:])
    for slug, url in PAGES.items():
        if only and slug not in only:
            continue
        try:
            title, body = main_content(fetch(url))
            doc = (f"<!doctype html><html><head><meta charset='utf-8'><title>{title}</title>"
                   f"<style>body{{font:15px/1.5 system-ui,sans-serif;max-width:60rem;margin:1rem auto;padding:0 1rem}}"
                   f"pre,code{{background:#8882}}pre{{padding:.6rem;overflow:auto}}table{{border-collapse:collapse}}td,th{{border:1px solid #8886;padding:.2rem .4rem}}</style></head>"
                   f"<body><p><small>Source: <a href='{url}'>{url}</a> — saved {date.today().isoformat()}</small></p>{body}</body></html>")
            (OUT / f"{slug}.html").write_text(doc, encoding="utf-8")
            note = "short — check it is not a JS shell" if len(doc) < 4000 else ""
            index.append(f"| {slug}.html | {url} | {len(doc)} | {note} |")
            print(f"ok   {slug:34} {len(doc):>8} bytes {note}")
        except Exception as e:  # keep going: one failing page must not stop the others
            failures += 1
            index.append(f"| {slug}.html | {url} | — | FAILED: {type(e).__name__} |")
            print(f"FAIL {slug:34} {type(e).__name__}: {e}")
        time.sleep(1.0)
    (OUT / "INDEX.md").write_text("\n".join(index) + "\n", encoding="utf-8")
    print(f"\n{len(PAGES) - failures}/{len(PAGES)} pages saved in {OUT}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
