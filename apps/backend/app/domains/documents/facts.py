"""Candidate facts read in a document. High-precision rules only: when unsure, nothing is proposed.

Every candidate carries a LOCATOR (page, offsets, a short quote and its hash) so a human can check it against the source.
Nothing here is ever trusted: the vault stores the result as `extracted` / `pending_review`.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

from app.ports import StructuredDocument


@dataclass
class Candidate:
    key: str
    value: str
    confidence: float
    locator: dict[str, object]
    group_id: str | None = None


MONTHS = {
    "janvier": 1,
    "fevrier": 2,
    "février": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "aout": 8,
    "août": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "decembre": 12,
    "décembre": 12,
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}
PRESENT = {"present", "présent", "current", "aujourd'hui", "en cours", "now"}
_MONTH_RE = "|".join(sorted(MONTHS, key=len, reverse=True))
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:(?:\+|00)\d{1,3}[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?){2,5}\d{2,4}|0[1-9](?:[\s.-]?\d{2}){4})")
POSTAL_CITY_RE = re.compile(r"\b(\d{5})\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’\-]+(?:[ -][A-ZÀ-Ý][A-Za-zÀ-ÿ'’\-]+){0,3})")
STREET_RE = re.compile(r"\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|boulevard|bd|chemin|impasse|allée|allee|place|cité|cite|route|quai)\s[^,\n]{2,60}", re.I)
DOB_RE = re.compile(r"(?:n[ée]+(?:\(e\))?\s+le|date de naissance\s*:?|born on|date of birth\s*:?)\s*(\d{1,2})[\s/.-]+(\d{1,2}|" + _MONTH_RE + r")[\s/.-]+(\d{4})", re.I)
PERIOD_RE = re.compile(r"\(\s*(?P<a>[^()–—-]{3,30}?)\s*[–—-]\s*(?P<b>[^()]{3,30}?)\s*\)")
EXPERIENCE_RE = re.compile(r"^(?P<title>[^—–\n]{3,80}?)\s+[—–-]\s+(?P<company>[^,(\n]{2,80}?)(?:,\s*(?P<loc>[^(\n]{2,40}?))?\s*(?P<period>\([^)]*\))\s*$")
EDU_RE = re.compile(
    r"^(?P<degree>(?:Master|Licence|Bachelor|MBA|Doctorat|PhD|BTS|DUT|Dipl[oô]me d'ing[ée]nieur|Master of Science|Bachelor of Science)[^—–\n]{0,80}?)\s+[—–-]\s+(?P<inst>[^(\n]{3,100}?)\s*(?P<period>\([^)]*\))?\s*$",
    re.I,
)
SECTION_RE = {
    "experience": re.compile(r"^(exp[ée]riences?(?: professionnelles?)?|work experience|parcours professionnel|employment)\s*$", re.I),
    "education": re.compile(r"^(formation|[ée]tudes|education|parcours acad[ée]mique)\s*$", re.I),
    "skills": re.compile(r"^(comp[ée]tences|skills)\s*$", re.I),
    "languages": re.compile(r"^(langues|languages)\s*$", re.I),
}
STOP_SECTIONS = re.compile(
    r"^(exp[ée]riences?|formation|[ée]tudes|education|comp[ée]tences|skills|langues|languages|profil|loisirs|hobbies|certifications?|projets?)\b.*$", re.I
)


@dataclass
class _Line:
    text: str
    page: int
    start: int
    end: int


@dataclass
class _Ctx:
    doc_text: str = ""
    lines: list[_Line] = field(default_factory=list)


def _lines(doc: StructuredDocument) -> _Ctx:
    ctx = _Ctx()
    offset = 0
    for block in doc.blocks:
        for raw in block.text.split("\n"):
            line = raw.strip()
            start = offset
            offset += len(raw) + 1
            if line:
                ctx.lines.append(_Line(line, block.page, start, start + len(raw)))
    ctx.doc_text = "\n".join(b.text for b in doc.blocks)
    return ctx


def _loc(line: _Line, quote: str | None = None) -> dict[str, object]:
    q = (quote or line.text)[:140]
    return {"page": line.page, "start": line.start, "end": line.end, "quote": q, "quote_sha256": hashlib.sha256(q.encode()).hexdigest()}


def _month_num(token: str) -> int | None:
    t = token.strip().lower()
    return int(t) if t.isdigit() and 1 <= int(t) <= 12 else MONTHS.get(t)


def _parse_date(token: str) -> str | None:
    """'mars 2021' -> '2021-03'; '2016' -> '2016'; 'présent' -> None."""
    t = token.strip().lower().strip("()")
    if t in PRESENT:
        return None
    m = re.match(rf"^({_MONTH_RE})\.?\s+(\d{{4}})$", t)
    if m:
        return f"{m.group(2)}-{MONTHS[m.group(1)]:02d}"
    if re.fullmatch(r"\d{4}", t):
        return t
    m = re.match(r"^(\d{1,2})[/-](\d{4})$", t)
    if m and 1 <= int(m.group(1)) <= 12:
        return f"{m.group(2)}-{int(m.group(1)):02d}"
    return None


def extract_facts(doc: StructuredDocument, doc_type: str) -> list[Candidate]:
    ctx = _lines(doc)
    out: list[Candidate] = []
    seen: set[tuple[str, str]] = set()

    def add(key: str, value: str, conf: float, line: _Line, group: str | None = None, quote: str | None = None) -> None:
        value = " ".join(value.split()).strip(" ,;:.")
        if not value or (key, value.casefold()) in seen and group is None:
            return
        seen.add((key, value.casefold()))
        out.append(Candidate(key, value, conf, _loc(line, quote), group))

    emails = phones = 0
    for line in ctx.lines:
        for m in EMAIL_RE.finditer(line.text):
            if emails < 2:
                add("contact.email", m.group(0).lower(), 0.95, line, quote=m.group(0))
                emails += 1
        for m in PHONE_RE.finditer(line.text):
            digits = re.sub(r"\D", "", m.group(0))
            if 8 <= len(digits) <= 15 and phones < 2:
                add("contact.phone", m.group(0), 0.8, line, quote=m.group(0))
                phones += 1
        m = POSTAL_CITY_RE.search(line.text)
        if m and doc_type in ("cv", "proof_of_address", "other", "unknown", "contract", "payslip"):
            add("contact.postal_code", m.group(1), 0.8, line, quote=m.group(0))
            add("contact.city", m.group(2), 0.75, line, quote=m.group(0))
        s = STREET_RE.search(line.text)
        if s:
            add("contact.address_line1", s.group(0), 0.75, line, quote=s.group(0))
        d = DOB_RE.search(line.text)
        if d:
            mo = _month_num(d.group(2))
            if mo:
                add("personal.date_of_birth", f"{int(d.group(3)):04d}-{mo:02d}-{int(d.group(1)):02d}", 0.85, line, quote=d.group(0))

    _name_from_header(ctx, doc_type, add)
    if doc_type in ("cv", "unknown", "other"):
        _cv_sections(ctx, add)
    if doc_type == "diploma":
        _diploma(ctx, add)
    return out


def _name_from_header(ctx: _Ctx, doc_type: str, add) -> None:  # type: ignore[no-untyped-def]
    for line in ctx.lines[:6]:
        text = re.sub(r"^(madame|monsieur|mme|m\.|mr|mrs|ms)\s+", "", line.text, flags=re.I)
        tokens = text.replace("—", " ").split()
        words = [t for t in tokens if re.fullmatch(r"[A-Za-zÀ-ÿ'’\-]{2,}", t)]
        if 2 <= len(words) <= 4 and len(words) == len(tokens) and all(w[0].isupper() for w in words):
            uppercase = [w for w in words if w.isupper() and len(w) > 1]
            last = uppercase[-1] if uppercase else words[-1]
            first = [w for w in words if w != last]
            if first:
                add("personal.first_name", " ".join(first).title() if " ".join(first).isupper() else " ".join(first), 0.6, line, quote=line.text)
                add("personal.last_name", last.title() if last.isupper() else last, 0.6, line, quote=line.text)
            return


def _period(token: str) -> tuple[str | None, str | None]:
    m = PERIOD_RE.search(token)
    if not m:
        return None, None
    return _parse_date(m.group("a")), _parse_date(m.group("b"))


def _cv_sections(ctx: _Ctx, add) -> None:  # type: ignore[no-untyped-def]
    section: str | None = None
    exp_n = edu_n = 0
    for line in ctx.lines:
        for name, rx in SECTION_RE.items():
            if rx.match(line.text):
                section = name
                break
        else:
            if STOP_SECTIONS.match(line.text) and len(line.text.split()) <= 3:
                section = None
            elif section == "experience":
                m = EXPERIENCE_RE.match(line.text)
                if m:
                    exp_n += 1
                    g = f"exp-{exp_n}"
                    add("experience.title", m.group("title"), 0.8, line, g)
                    add("experience.company", m.group("company"), 0.8, line, g)
                    if m.group("loc"):
                        add("experience.location", m.group("loc"), 0.7, line, g)
                    start, end = _period(m.group("period"))
                    if start:
                        add("experience.start_date", start, 0.8, line, g)
                    if end:
                        add("experience.end_date", end, 0.8, line, g)
            elif section == "education":
                m = EDU_RE.match(line.text)
                if m:
                    edu_n += 1
                    g = f"edu-{edu_n}"
                    add("academic.degree", m.group("degree"), 0.8, line, g)
                    add("academic.institution", m.group("inst"), 0.8, line, g)
                    if m.group("period"):
                        start, end = _period(m.group("period"))
                        if start:
                            add("academic.start_year", start[:4], 0.75, line, g)
                        if end:
                            add("academic.end_year", end[:4], 0.75, line, g)
            elif section == "skills":
                for token in re.split(r"[,;•·|]", line.text):
                    token = token.strip()
                    if 1 < len(token) <= 40:
                        add("skills.skill", token, 0.7, line)
            elif section == "languages":
                for token in re.split(r"[,;•·|](?![^()]*\))", line.text):
                    name = re.sub(r"\s*\(.*?\)\s*", "", token).strip()
                    if 1 < len(name) <= 30:
                        add("skills.language", name, 0.7, line, quote=token.strip())


def _diploma(ctx: _Ctx, add) -> None:  # type: ignore[no-untyped-def]
    joined = " ".join(line.text for line in ctx.lines)
    first = ctx.lines[0] if ctx.lines else None
    m = re.search(r"(Université|University|École|Ecole|Institut)[^\n.,]{3,80}", joined)
    if m and first:
        add("academic.institution", m.group(0), 0.8, first, "edu-1", quote=m.group(0))
    m = re.search(r"(?:dipl[oô]me(?: national)? de|degree of)\s+(Master|Licence|Bachelor|Doctorat|Ing[ée]nieur)[^,.]{0,60}", joined, re.I)
    if m and first:
        add("academic.degree", m.group(0).split(" de ", 1)[-1] if " de " in m.group(0) else m.group(0), 0.75, first, "edu-1", quote=m.group(0))
    m = re.search(r"session de\s+(" + _MONTH_RE + r")\s+(\d{4})", joined, re.I)
    if m and first:
        add("academic.end_year", m.group(2), 0.75, first, "edu-1", quote=m.group(0))
