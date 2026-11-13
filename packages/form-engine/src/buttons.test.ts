import { describe, expect, it } from "vitest";
import { classifyButton, classifySemantic, fold } from "./index";

describe("OB-04: buttons fail closed, FR + EN", () => {
  const COMMIT = [
    "Submit", "Send", "Send message", "Envoyer", "Envoyer la demande", "Soumettre", "Pay now", "Payer", "Payer 99 €", "Buy now", "Acheter",
    "Place order", "Passer commande", "Commander", "Checkout", "Delete my account", "Supprimer", "Supprimer mon compte", "Remove", "Sign", "Signer le contrat",
    "I agree", "J'accepte", "Confirm", "Confirmer", "Valider", "Validate", "Register", "S'inscrire", "Create account", "Créer un compte", "Apply", "Postuler",
    "Finish", "Terminer", "Finaliser", "Complete registration", "Book now", "Réserver", "Subscribe", "Donate", "Save and submit",
  ];
  it.each(COMMIT)("%s is a commit (no false negative allowed)", (t) => {
    expect(classifyButton(t).intent).toBe("commit");
  });

  it.each(["Next", "Continue", "Suivant", "Continuer", "Étape suivante", "Next step", "Poursuivre", ">"])("%s is next", (t) => {
    expect(classifyButton(t).intent).toBe("next");
  });
  it.each(["Previous", "Back", "Retour", "Précédent", "Go back", "<"])("%s is previous", (t) => {
    expect(classifyButton(t).intent).toBe("previous");
  });
  it.each(["Cancel", "Annuler", "Close", "Fermer", "Not now", "Skip"])("%s is dismiss", (t) => {
    expect(classifyButton(t).intent).toBe("dismiss");
  });

  it("fails closed on mixed wording and on unknown text", () => {
    expect(classifyButton("Continue and pay").intent).toBe("commit");
    expect(classifyButton("Suivant : valider la commande").intent).toBe("commit");
    expect(classifyButton("Let's go!").intent).toBe("commit");
    expect(classifyButton("").intent).toBe("commit");
    expect(classifyButton("OK", { type: "submit" }).intent).toBe("commit");
  });
  it("tells what kind of commit it is", () => {
    expect(classifyButton("Pay now").commitKind).toBe("purchase");
    expect(classifyButton("Supprimer").commitKind).toBe("delete");
    expect(classifyButton("Signer").commitKind).toBe("sign");
    expect(classifyButton("Envoyer").commitKind).toBe("submit");
  });
});

describe("semantic taxonomy (FR + EN)", () => {
  const sem = (label: string, extra: Partial<Parameters<typeof classifySemantic>[0]> = {}) =>
    classifySemantic({ kind: "text", autocomplete: null, label, name: null, htmlId: null, placeholder: null, ...extra }).type;

  it("separates first name, last name and company name", () => {
    expect(sem("Prénom")).toBe("first_name");
    expect(sem("Nom")).toBe("last_name");
    expect(sem("Nom de famille")).toBe("last_name");
    expect(sem("Nom de l'entreprise")).toBe("company");
    expect(sem("Nom complet")).toBe("full_name");
    expect(sem("Last name")).toBe("last_name");
  });
  it("lets autocomplete tokens win over the label", () => {
    expect(sem("Something odd", { autocomplete: "postal-code" })).toBe("postal_code");
    expect(sem("Whatever", { autocomplete: "section-x shipping given-name" })).toBe("first_name");
  });
  it("does not treat autocomplete=new-password on an ordinary field as a password", () => {
    expect(sem("Country", { autocomplete: "new-password" })).toBe("country");
    expect(classifySemantic({ kind: "text", autocomplete: "new-password", label: "Mot de passe", name: "pwd", htmlId: null, placeholder: null }).secret).toBe(true);
  });
  it("marks secrets and sensitive types", () => {
    const g = (label: string) => classifySemantic({ kind: "text", autocomplete: null, label, name: null, htmlId: null, placeholder: null });
    expect(g("Card number").secret).toBe(true);
    expect(g("CVC").secret).toBe(true);
    expect(g("Code de vérification SMS").secret).toBe(true);
    expect(g("IBAN").sensitive).toBe(true);
    expect(g("Numéro de sécurité sociale").sensitive).toBe(true);
    expect(g("Date de naissance").sensitive).toBe(true);
  });
  it("answers unknown rather than guessing", () => {
    expect(sem("Describe your favourite colour")).toBe("unknown");
    expect(sem("")).toBe("unknown");
  });
});

describe("OB-08: Unicode-safe folding", () => {
  it("removes Latin accents but never alters Arabic, Cyrillic or CJK", () => {
    expect(fold("Éloïse Œuvre")).toBe("eloise œuvre");
    expect(fold("محمد الأمين")).toBe("محمد الأمين");
    expect(fold("Иван Петров")).toBe("иван петров");
    expect(fold("李雷 東京")).toBe("李雷 東京");
  });
});
