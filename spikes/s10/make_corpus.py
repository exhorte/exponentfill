"""Throwaway spike S10: generate a FICTITIOUS test corpus (CVs, diploma, transcript, utility bill, a scanned CV).

Every person, organisation, address, e-mail and phone number below is invented (example.com / fictitious ranges).
No real personal document may ever enter this corpus (security + privacy rule of the project).

    uv run python make_corpus.py          # writes corpus/*.pdf and corpus/truth.json
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import pypdfium2 as pdfium
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    FrameBreak,
    PageTemplate,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).parent / "corpus"
OUT.mkdir(exist_ok=True)
random.seed(7)

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=18, spaceAfter=4)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=12.5, spaceBefore=10, spaceAfter=3, textColor=colors.HexColor("#1F3A5F"))
P = ParagraphStyle("P", parent=ss["BodyText"], fontSize=10, leading=13)
SMALL = ParagraphStyle("S", parent=P, fontSize=9, leading=11)

truth: dict[str, dict] = {}


def register(name: str, expected: list[str], order: list[str] | None = None, kind: str = "text") -> None:
    truth[name] = {"kind": kind, "expected": expected, "order": order or []}


# --------------------------------------------------------------------------------------------------------------
# 1. CV (FR) — single column
# --------------------------------------------------------------------------------------------------------------
def cv_fr_simple(path: Path) -> None:
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm, bottomMargin=1.8 * cm,
                            title="CV fictif — Camille Durand", author="Corpus fictif")
    s = [
        Paragraph("Camille DURAND", H1),
        Paragraph("Développeuse web — Lyon", P),
        Paragraph("camille.durand@example.com · +33 1 99 00 12 34 · 12 rue des Lilas, 69003 Lyon", SMALL),
        Paragraph("Expérience professionnelle", H2),
        Paragraph("<b>Développeuse full-stack</b> — Société Exemple SAS, Lyon (mars 2021 – présent)", P),
        Paragraph("Conception d'une application de gestion de rendez-vous en TypeScript et PostgreSQL ; encadrement de deux stagiaires.", P),
        Paragraph("<b>Développeuse junior</b> — Atelier Démo SARL, Villeurbanne (septembre 2018 – février 2021)", P),
        Paragraph("Maintenance d'un site de commerce en ligne ; mise en place de tests automatisés.", P),
        Paragraph("Formation", H2),
        Paragraph("<b>Master Informatique, mention Bien</b> — Université Fictive de Démonstration (2016 – 2018)", P),
        Paragraph("<b>Licence Informatique</b> — Université Fictive de Démonstration (2013 – 2016)", P),
        Paragraph("Compétences", H2),
        Paragraph("TypeScript, React, Python, PostgreSQL, Docker, intégration continue", P),
        Paragraph("Langues", H2),
        Paragraph("Français (langue maternelle), anglais (courant, niveau C1), espagnol (notions)", P),
    ]
    doc.build(s)
    register(path.name, [
        "Camille DURAND", "camille.durand@example.com", "+33 1 99 00 12 34", "12 rue des Lilas", "69003 Lyon",
        "Société Exemple SAS", "mars 2021", "Atelier Démo SARL", "septembre 2018", "Master Informatique",
        "mention Bien", "Université Fictive de Démonstration", "PostgreSQL", "niveau C1",
    ], order=["Expérience professionnelle", "Société Exemple SAS", "Atelier Démo SARL", "Formation", "Master Informatique", "Compétences", "Langues"])


# --------------------------------------------------------------------------------------------------------------
# 2. CV (FR) — two columns (sidebar + main): reading-order test
# --------------------------------------------------------------------------------------------------------------
def cv_fr_two_columns(path: Path) -> None:
    w, h = A4
    side = Frame(1.2 * cm, 1.5 * cm, 5.6 * cm, h - 3 * cm, id="side", showBoundary=0)
    main = Frame(7.2 * cm, 1.5 * cm, w - 8.4 * cm, h - 3 * cm, id="main", showBoundary=0)
    doc = BaseDocTemplate(str(path), pagesize=A4, title="CV fictif — Moussa Ndiaye", author="Corpus fictif")
    doc.addPageTemplates([PageTemplate(id="two", frames=[side, main])])
    s = [
        Paragraph("Contact", H2),
        Paragraph("moussa.ndiaye@example.com", SMALL),
        Paragraph("+221 70 000 11 22", SMALL),
        Paragraph("Cité Fictive 4, Dakar", SMALL),
        Paragraph("Compétences", H2),
        Paragraph("Java, Spring, Kubernetes, SQL", SMALL),
        Paragraph("Langues", H2),
        Paragraph("Français, Wolof, anglais", SMALL),
        FrameBreak(),
        Paragraph("Moussa NDIAYE", H1),
        Paragraph("Ingénieur logiciel", P),
        Paragraph("Parcours", H2),
        Paragraph("<b>Ingénieur backend</b> — Banque Exemple, Dakar (janvier 2020 – présent)", P),
        Paragraph("Refonte d'un service de paiement interne ; réduction de 40 % du temps de réponse.", P),
        Paragraph("<b>Stagiaire</b> — Startup Démo, Thiès (juin 2019 – décembre 2019)", P),
        Paragraph("Études", H2),
        Paragraph("<b>Diplôme d'ingénieur en génie logiciel</b> — École Fictive d'Ingénieurs de Dakar (2015 – 2019)", P),
    ]
    doc.build(s)
    register(path.name, [
        "Moussa NDIAYE", "moussa.ndiaye@example.com", "+221 70 000 11 22", "Banque Exemple", "janvier 2020", "Startup Démo",
        "École Fictive d'Ingénieurs de Dakar", "génie logiciel", "Kubernetes",
    ], order=["Moussa NDIAYE", "Parcours", "Banque Exemple", "Startup Démo", "Études"])


# --------------------------------------------------------------------------------------------------------------
# 2b. CV (FR) — two columns written in INTERLEAVED order (left line, right line, left line, ...) like many real
#     exports (Word, design tools). Naive extractors that sort by y merge the columns and break sentences.
# --------------------------------------------------------------------------------------------------------------
def cv_fr_interleaved(path: Path) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    c.setTitle("CV fictif colonnes entrelacées")
    left = ["Contact", "lea.martin@example.com", "+33 1 99 00 98 76", "Compétences", "Python, SQL, Docker", "Langues", "Français, anglais"]
    right = ["Léa MARTIN — Analyste de données", "Parcours", "Analyste — Cabinet Fictif, Nantes (mai 2022 – présent)",
             "Automatisation des rapports mensuels ;", "réduction de 60 % du temps de production des tableaux de bord.",
             "Formation", "Master Statistique — Université Fictive de Démonstration (2020)"]
    y = h - 3 * cm
    for lft, rgt in zip(left, right):
        c.setFont("Helvetica-Bold" if lft in ("Contact", "Compétences", "Langues") else "Helvetica", 10)
        c.drawString(1.2 * cm, y, lft)
        c.setFont("Helvetica-Bold" if rgt in ("Parcours", "Formation") else "Helvetica", 10)
        c.drawString(7.2 * cm, y, rgt)
        y -= 0.8 * cm
    c.showPage()
    c.save()
    register(path.name, [
        "Léa MARTIN", "lea.martin@example.com", "+33 1 99 00 98 76", "Cabinet Fictif", "mai 2022",
        "Automatisation des rapports mensuels ; réduction de 60 % du temps de production des tableaux de bord.",
        "Master Statistique", "Université Fictive de Démonstration",
    ], kind="layout-hard")


# --------------------------------------------------------------------------------------------------------------
# 3. CV (EN)
# --------------------------------------------------------------------------------------------------------------
def cv_en_simple(path: Path) -> None:
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm, bottomMargin=1.8 * cm,
                            title="Fictitious résumé — Jordan Lee", author="Fictitious corpus")
    s = [
        Paragraph("Jordan LEE", H1),
        Paragraph("Data analyst — Montréal", P),
        Paragraph("jordan.lee@example.com · +1 514 555 0147 · 55 Fictional Ave, Montréal, QC H2X 1Y4", SMALL),
        Paragraph("Experience", H2),
        Paragraph("<b>Senior data analyst</b> — Example Analytics Inc., Montréal (April 2020 – present)", P),
        Paragraph("Built dashboards used by 300 colleagues; automated monthly reporting in Python.", P),
        Paragraph("Education", H2),
        Paragraph("<b>Master of Science in Statistics</b> — Fictional University of Demonstration (2016 – 2018)", P),
        Paragraph("Skills", H2),
        Paragraph("Python, SQL, statistics, data visualisation", P),
    ]
    doc.build(s)
    register(path.name, [
        "Jordan LEE", "jordan.lee@example.com", "+1 514 555 0147", "55 Fictional Ave", "Example Analytics Inc.", "April 2020",
        "Master of Science in Statistics", "Fictional University of Demonstration", "data visualisation",
    ], order=["Experience", "Example Analytics Inc.", "Education", "Master of Science in Statistics", "Skills"])


# --------------------------------------------------------------------------------------------------------------
# 4. Diploma (FR) — certificate text
# --------------------------------------------------------------------------------------------------------------
def diplome_fr(path: Path) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    c.setTitle("Diplôme fictif")
    c.setStrokeColor(colors.HexColor("#8a6d1d"))
    c.setLineWidth(3)
    c.rect(1.5 * cm, 1.5 * cm, w - 3 * cm, h - 3 * cm)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(w / 2, h - 5 * cm, "UNIVERSITÉ FICTIVE DE DÉMONSTRATION")
    c.setFont("Helvetica", 14)
    c.drawCentredString(w / 2, h - 6.5 * cm, "DIPLÔME DE MASTER")
    c.setFont("Helvetica", 12)
    lines = [
        "Le Président de l'Université Fictive de Démonstration atteste que",
        "Madame Awa DIOP",
        "née le 12 mars 1998 à Dakar (Sénégal)",
        "a obtenu le diplôme national de Master, mention Informatique,",
        "parcours Génie logiciel, avec la mention Bien,",
        "session de juin 2023.",
        "",
        "Fait à Lyon, le 15 septembre 2023",
        "Numéro du diplôme : FIC-2023-004417",
    ]
    y = h - 9 * cm
    for ln in lines:
        c.drawCentredString(w / 2, y, ln)
        y -= 0.9 * cm
    c.showPage()
    c.save()
    register(path.name, [
        "UNIVERSITÉ FICTIVE DE DÉMONSTRATION", "Awa DIOP", "12 mars 1998", "Dakar", "Master", "Génie logiciel", "mention Bien",
        "juin 2023", "15 septembre 2023", "FIC-2023-004417",
    ], kind="certificate")


# --------------------------------------------------------------------------------------------------------------
# 5. Transcript (FR) — table
# --------------------------------------------------------------------------------------------------------------
def releve_notes_fr(path: Path) -> None:
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm, title="Relevé de notes fictif")
    data = [
        ["Unité d'enseignement", "Crédits", "Note /20", "Résultat"],
        ["Algorithmique avancée", "6", "15,5", "Admis"],
        ["Bases de données", "6", "14,0", "Admis"],
        ["Réseaux et sécurité", "4", "12,25", "Admis"],
        ["Génie logiciel", "6", "16,0", "Admis"],
        ["Anglais professionnel", "2", "17,5", "Admis"],
    ]
    t = Table(data, colWidths=[8 * cm, 2.5 * cm, 3 * cm, 3 * cm])
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EEF7")),
                           ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("ALIGN", (1, 0), (-1, -1), "CENTER")]))
    s = [Paragraph("Relevé de notes — Master Informatique, semestre 3", H1),
         Paragraph("Étudiante : Awa DIOP — N° étudiant 20231234 — Année universitaire 2022-2023", P),
         Spacer(1, 0.5 * cm), t, Spacer(1, 0.4 * cm),
         Paragraph("Moyenne du semestre : 15,02 / 20 — Mention : Bien", P)]
    doc.build(s)
    register(path.name, ["Awa DIOP", "20231234", "2022-2023", "Algorithmique avancée", "15,5", "Réseaux et sécurité", "12,25", "Génie logiciel", "15,02", "Mention : Bien"], kind="table")


# --------------------------------------------------------------------------------------------------------------
# 6. Utility bill (FR) — proof of address
# --------------------------------------------------------------------------------------------------------------
def facture_domicile_fr(path: Path) -> None:
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm, title="Facture d'électricité fictive")
    data = [["Désignation", "Quantité", "Prix unitaire", "Montant TTC"],
            ["Abonnement (6 kVA)", "1 mois", "13,42 €", "13,42 €"],
            ["Consommation", "412 kWh", "0,2516 €", "103,66 €"],
            ["Taxes et contributions", "", "", "11,02 €"]]
    t = Table(data, colWidths=[7 * cm, 3 * cm, 3.5 * cm, 3 * cm])
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]))
    s = [Paragraph("Énergie Exemple — Facture d'électricité", H1),
         Paragraph("Facture n° FE-2026-778812 du 3 octobre 2026", P),
         Paragraph("Titulaire du contrat : Madame Camille DURAND", P),
         Paragraph("Adresse de consommation : 12 rue des Lilas, 69003 Lyon", P),
         Spacer(1, 0.5 * cm), t, Spacer(1, 0.4 * cm),
         Paragraph("<b>Total à payer : 128,10 €</b> avant le 25 octobre 2026", P)]
    doc.build(s)
    register(path.name, ["Camille DURAND", "12 rue des Lilas", "69003 Lyon", "FE-2026-778812", "3 octobre 2026", "412 kWh", "128,10 €", "25 octobre 2026"], kind="bill")


# --------------------------------------------------------------------------------------------------------------
# 7. Multi-page CV (performance)
# --------------------------------------------------------------------------------------------------------------
def cv_fr_long(path: Path) -> None:
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm, bottomMargin=1.8 * cm, title="CV long fictif")
    s = [Paragraph("Inès BERNARD", H1), Paragraph("ines.bernard@example.com · +33 1 99 00 56 78", SMALL), Paragraph("Missions", H2)]
    for i in range(1, 31):
        s.append(Paragraph(f"<b>Mission {i}</b> — Client Fictif {i} SA (20{10 + i % 15}) : audit, conception et déploiement d'un module métier, "
                           f"documentation et formation des équipes sur site.", P))
    doc.build(s)
    register(path.name, ["Inès BERNARD", "ines.bernard@example.com", "+33 1 99 00 56 78", "Mission 1", "Mission 15", "Mission 30", "Client Fictif 30 SA"], kind="long")


# --------------------------------------------------------------------------------------------------------------
# 8. Scanned CV: IMAGE ONLY (no text layer) — needs OCR
# --------------------------------------------------------------------------------------------------------------
def cv_fr_scanned(src: Path, path: Path) -> None:
    pdf = pdfium.PdfDocument(str(src))
    img = pdf[0].render(scale=200 / 72).to_pil().convert("L")
    img = img.rotate(0.7, expand=False, fillcolor=255)  # slight skew, like a real scan
    png = path.with_suffix(".png")
    img.save(png)
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle("CV scanné fictif")
    c.drawImage(str(png), 0, 0, width=A4[0], height=A4[1])
    c.showPage()
    c.save()
    png.unlink()
    truth_src = truth["cv_fr_simple.pdf"]
    register(path.name, truth_src["expected"], kind="scanned")


def main() -> None:
    cv_fr_simple(OUT / "cv_fr_simple.pdf")
    cv_fr_two_columns(OUT / "cv_fr_two_columns.pdf")
    cv_fr_interleaved(OUT / "cv_fr_interleaved.pdf")
    cv_en_simple(OUT / "cv_en_simple.pdf")
    diplome_fr(OUT / "diplome_fr.pdf")
    releve_notes_fr(OUT / "releve_notes_fr.pdf")
    facture_domicile_fr(OUT / "facture_domicile_fr.pdf")
    cv_fr_long(OUT / "cv_fr_long.pdf")
    cv_fr_scanned(OUT / "cv_fr_simple.pdf", OUT / "cv_fr_scanned.pdf")
    (OUT / "truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "README.txt").write_text("FICTITIOUS corpus generated by make_corpus.py. Every person, organisation, address, e-mail and phone number is invented.\n"
                                    "Never add a real personal document here.\n", encoding="utf-8")
    print("corpus:", ", ".join(sorted(truth)))


if __name__ == "__main__":
    main()
