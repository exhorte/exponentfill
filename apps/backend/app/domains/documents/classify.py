"""Document classification: weighted keywords, FR + EN. Cheap, explainable, and honest about its confidence."""

from __future__ import annotations

import re
import unicodedata

DOC_TYPES = ["cv", "diploma", "transcript", "proof_of_address", "id_document", "payslip", "contract", "certificate", "other", "unknown"]

KEYWORDS: dict[str, dict[str, float]] = {
    "cv": {
        "curriculum vitae": 3,
        "cv": 1.5,
        "experience professionnelle": 3,
        "parcours": 1,
        "competences": 2,
        "skills": 2,
        "formation": 1.5,
        "education": 1.5,
        "langues": 1.5,
        "languages": 1.5,
        "work experience": 3,
        "experience": 1,
        "profil": 1,
        "resume": 1.5,
    },
    "diploma": {
        "diplome": 2.5,
        "diploma": 2.5,
        "atteste que": 3,
        "certifie que": 2,
        "a obtenu": 2.5,
        "mention": 1.5,
        "delivre": 1.5,
        "degree": 1.5,
        "universite": 1,
        "president de l'universite": 3,
        "awarded": 2,
        "graduated": 2,
    },
    "transcript": {"releve de notes": 4, "transcript": 3, "credits": 1.5, "note /20": 2, "moyenne": 1.5, "unite d'enseignement": 2.5, "grades": 1.5, "semestre": 1},
    "proof_of_address": {
        "justificatif de domicile": 4,
        "facture": 2,
        "adresse de consommation": 3,
        "electricite": 2,
        "gaz": 1,
        "quittance de loyer": 3,
        "utility bill": 3,
        "proof of address": 4,
        "total a payer": 1.5,
        "titulaire du contrat": 2,
    },
    "id_document": {
        "carte nationale d'identite": 4,
        "passeport": 3,
        "passport": 3,
        "identity card": 3,
        "date d'expiration": 1.5,
        "nationalite": 1,
        "lieu de naissance": 1,
        "numero du document": 2,
    },
    "payslip": {"bulletin de paie": 4, "bulletin de salaire": 4, "payslip": 4, "salaire brut": 2.5, "net a payer": 2.5, "cotisations": 2, "employeur": 1},
    "contract": {"contrat de travail": 4, "employment contract": 4, "entre les soussignes": 3, "periode d'essai": 2, "clause": 1.5, "signature": 1, "parties": 1},
    "certificate": {"attestation": 3, "certificate": 2.5, "certificat": 2.5, "je soussigne": 3, "atteste sur l'honneur": 3},
}


def fold(text: str) -> str:
    return re.sub(r"(?<=[a-z])[̀-ͯ]+", "", unicodedata.normalize("NFD", text.casefold()))


def classify(text: str) -> tuple[str, float]:
    """(type, confidence). Low evidence means `unknown`: asking the user is better than guessing."""
    if not text.strip():
        return "unknown", 0.0
    hay = " ".join(fold(text).split())
    scores: dict[str, float] = {}
    for doc_type, words in KEYWORDS.items():
        scores[doc_type] = sum(w * min(hay.count(k), 3) for k, w in words.items())
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    best, best_score = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else 0.0
    if best_score < 3.0:
        return "unknown", round(min(best_score / 10, 0.3), 2)
    confidence = best_score / (best_score + second + 2.0)
    return best, round(min(confidence, 0.98), 2)


def detect_language(text: str) -> str | None:
    hay = " " + fold(text)[:6000] + " "
    fr = sum(hay.count(w) for w in (" le ", " la ", " les ", " des ", " et ", " de ", " du ", " une ", " est "))
    en = sum(hay.count(w) for w in (" the ", " and ", " of ", " to ", " with ", " is ", " in ", " for "))
    if fr == en == 0:
        return None
    return "fr" if fr >= en else "en"
