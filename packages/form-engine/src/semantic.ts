import { fold } from "./text";
import type { FieldKind, SemanticGuess, SemanticType } from "./types";

/** `secret`: never filled, stored or sent. `sensitive`: needs explicit human validation before any use. */
export const SECRET: ReadonlySet<SemanticType> = new Set(["password", "one_time_code", "card_number", "card_security_code"]);
export const SENSITIVE: ReadonlySet<SemanticType> = new Set(["national_id", "passport_number", "tax_id", "iban", "salary", "date_of_birth", "place_of_birth", "nationality", "marital_status", "gender"]);

const AUTOCOMPLETE: Record<string, SemanticType> = {
  "given-name": "first_name",
  "additional-name": "first_name",
  "family-name": "last_name",
  name: "full_name",
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  "tel-country-code": "phone",
  bday: "date_of_birth",
  sex: "gender",
  honorific_prefix: "civility",
  "honorific-prefix": "civility",
  "street-address": "address_line1",
  "address-line1": "address_line1",
  "address-line2": "address_line2",
  "postal-code": "postal_code",
  "address-level2": "city",
  "address-level1": "region",
  country: "country",
  "country-name": "country",
  organization: "company",
  "organization-title": "job_title",
  url: "website",
  username: "username",
  "new-password": "password",
  "current-password": "password",
  "one-time-code": "one_time_code",
  "cc-number": "card_number",
  "cc-csc": "card_security_code",
};

/**
 * Ordered rules, accent- and case-insensitive (FR + EN). The first match wins, so the specific ones come first
 * ("prenom" before "nom", "date de naissance" before "date").
 */
const RULES: ReadonlyArray<readonly [SemanticType, RegExp]> = [
  ["password", /\b(password|passwd|mot de passe|mdp)\b/],
  ["one_time_code", /\b(one[- ]?time|otp|2fa|verification code|code de verification|code sms|code de securite a usage unique)\b/],
  ["card_security_code", /\b(cvc|cvv|security code|cryptogramme|code de securite)\b/],
  ["card_number", /\b(card number|numero de carte|n° de carte|no de carte|credit card|carte bancaire)\b/],
  ["iban", /\b(iban|rib)\b/],  // BIC / SWIFT are not an IBAN
  ["national_id", /\b(social security|securite sociale|ssn|nir\b|national id|numero d'identite|carte d'identite|cni\b|id number)\b/],
  ["passport_number", /\b(passport|passeport)\b/],
  ["tax_id", /\b(tax id|tin\b|siret|siren|numero fiscal|nif\b)\b/],  // a VAT number belongs to a business
  ["full_name", /\b(full name|nom complet|nom et prenom|prenom et nom|your name|votre nom(?! (de famille|d'utilisateur|d'usage|patronymique)))\b/],
  ["first_name", /\b(first ?name|given name|forename|prenom|prenoms)\b/],
  // A bare "nom" is a last name (French forms); "nom du projet", "nom de la banque"... are something else.
  ["last_name", /\b(last ?name|family name|surname|nom de famille|nom patronymique|nom d'usage)\b|^nom\s*(?:[:*(]|$)/],
  ["place_of_birth", /\b(place of birth|birth ?place|lieu de naissance|ville de naissance)\b/],
  ["date_of_birth", /\b(date of birth|birth ?date|dob|date de naissance|ne\(e\) le|ne le|birthday)\b|^naissance\s*(?:[:*(]|$)/],
  ["nationality", /\b(nationality|nationalite|citizenship)\b/],
  ["marital_status", /\b(marital|situation familiale|etat civil|situation matrimoniale)\b/],
  // "title"/"titre" alone is a civility; "job title", "title of your project" are not.
  ["civility", /\b(civilite|civility|salutation|madame|monsieur|mme|mlle|mr|mrs)\b|^(title|titre)\s*(?:\([^)]*\))?\s*[:*]?$/],
  ["gender", /\b(gender|genre|sexe|sex)\b/],
  ["email", /\b(e-?mail|courriel|adresse electronique|adresse mail|mel)\b|^mail\s*(?:[:*(]|$)/],
  ["phone", /\b(phone|telephone|mobile|portable|gsm|cell ?phone|tel)\b/],
  ["address_line2", /\b(address line 2|adresse 2|complement d'adresse|appartement|apt|batiment|building)\b/],
  ["postal_code", /\b(postal code|postcode|zip|code postal|cp)\b/],
  ["city", /\b(city|town|ville|commune|localite)\b/],
  ["region", /\b(state|province|region|departement|county)\b/],
  ["country", /\b(country|pays)\b/],
  ["address_line1", /\b(address|adresse|street|rue|voie|numero et voie)\b/],
  ["linkedin", /\b(linkedin)\b/],
  ["website", /\b(website|site web|site internet|site personnel|personal site|portfolio|url)\b/],
  ["company", /\b(company|employer|organisation|organization|entreprise|societe|employeur|business name|raison sociale|nom commercial)\b/],
  ["job_title", /\b(job title|position|poste|fonction|profession|metier|intitule|titre professionnel|professional title)\b/],
  ["salary", /\b(salary|salaire|remuneration|pretentions|expected pay)\b/],
  ["degree", /\b(degree|diplome|niveau d'etudes)\b/],
  ["institution", /\b(school|university|universite|ecole|etablissement|institution)\b/],
  ["graduation_year", /\b(graduation|annee d'obtention|year of graduation|annee de diplome)\b/],
  ["cover_letter", /\b(cover letter|lettre de motivation|motivation)\b/],
  ["resume_file", /\b(resume|cv|curriculum)\b/],
  ["username", /\b(username|user name|nom d'utilisateur|utilisateur|identifiant|login|pseudo)\b/],
  ["consent", /\b(terms|conditions generales|cgu|cgv|accept|j'accepte|consent|consentement|rgpd|gdpr|newsletter|privacy|confidentialite|politique de)\b/],
];

/**
 * When the label ALSO carries one of these words, the rule's type is the wrong referent (a property of the thing, a document
 * date, a network address...): that rule is skipped, and the field stays `unknown` unless another rule fits.
 * Folded (lower-case, no accents) text.
 */
/** Contact details that belong to an organisation or a place that is not the user's ("employer's address", "host city"). */
const OTHER_ENTITY = /\b(employeur|employer|etablissement|institution|school|ecole|university|universite|entreprise|company|societe|siege|accueil|host|destination|recruteur|recruiter)\b/;
const CONTACT: ReadonlySet<SemanticType> = new Set(['address_line1', 'address_line2', 'postal_code', 'city', 'region', 'country', 'phone', 'email']);
/** A workplace or a trip leg is not where the user lives. */
const ELSEWHERE = /\b(work|workplace|travail|professionnel|professionnelle|professional|business|office|bureau|depart|departure|arrivee|arrival|retour|return|escale|stopover|transit)\b/;
const either = (a: RegExp, b: RegExp) => new RegExp(`${a.source}|${b.source}`);
const EXCLUDE: Partial<Record<SemanticType, RegExp>> = {
  address_line1: either(/\b(ip|mac|web|website|site|url|email|mail|wallet|portefeuille|blockchain|head office|siege|street name|street number|nom de la (rue|voie)|numero de (la )?rue)\b/, either(OTHER_ENTITY, ELSEWHERE)),
  address_line2: either(OTHER_ENTITY, ELSEWHERE),
  postal_code: either(OTHER_ENTITY, ELSEWHERE),
  city: either(either(/\b(origine|origin|accueil|host|destination)\b/, OTHER_ENTITY), ELSEWHERE),
  region: either(either(/\b(country|pays)\b/, OTHER_ENTITY), ELSEWHERE),
  country: either(/\b(code|indicatif|prefix|prefixe|birth|naissance|issue|emission|delivrance|origin|origine|accueil|host|destination)\b/, either(OTHER_ENTITY, ELSEWHERE)),
  phone: OTHER_ENTITY,
  email: OTHER_ENTITY,
  passport_number: /\b(type|nature|date|expir\w*|issue|issued|delivr\w*|emission|country|pays|lieu|place|validity|validite|valid)\b/,
  national_id: /\b(type|nature|date|expir\w*|issue|issued|delivr\w*|emission|country|pays|lieu|place|validity|validite|valid)\b/,
  institution: /\b(year|annee|type|level|niveau|accueil|host|destination|prevu|numero|number|adresse|address|telephone|phone|email|courriel|ville|city|pays|country)\b/,
  company: /\b(size|taille|sector|secteur|type|nombre|number|numero|effectif|employees|employes|revenue|industry|tva|vat|adresse|address|telephone|phone|email|courriel|website|site)\b/,
  job_title: /\b(vise|souhaite|desired|applied|sought|wanted|target|cible|recherche|diplome|degree|formation|course|cours|certificat|certificate)\b/,
  degree: /\b(date|annee|year|jour|mois|month|numero|number|mention)\b/,
  graduation_year: /\b(date|jour|mois|month)\b/,
  salary: /\b(current|actuel|actuelle|actual|present|last|dernier|derniere)\b/,
  website: /\b(image|photo|img|avatar|logo|picture|github|gitlab|twitter|instagram|facebook|youtube|tiktok|social|reseau|reseaux)\b/,
};

/**
 * Fields that ask about ANOTHER person (a parent, a spouse, an emergency contact...) or about a different name
 * (maiden name). Their label looks like the user's own ("Father's first name") but the vault value would be WRONG:
 * they are never classified, whatever the input type says (fail closed).
 */
const THIRD_PARTY = /\b(parents?|mother|mere|father|pere|spouse|conjoint|conjointe|epoux|epouse|guardian|tuteur|tutrice|emergency|urgence|referee|sponsor|garant|beneficiary|beneficiaire|supervisor|superviseur|manager|child|children|enfants?|maiden|jeune fille|recommender|recommandeur|representant|representative|recruteur|recruiter|directeur|director|principal applicant|demandeur principal|prevenir|doctor|docteur|medecin|physician|teacher|enseignant|enseignante|professeur|tutor|lawyer|avocat|avocate|notary|notaire|witness|temoin|recipient|destinataire|friend|ami|amie|colleague|collegue|invitee|coach|mentor)\b/;

/** "Alternate email", "previous address", "second nationality": another instance of the thing, not the one the vault holds. */
const OTHER_INSTANCE = /\b(alternate|alternative|alternatif|secondary|secondaire|backup|previous|former|prior|other|second|seconde|autre|autres|precedent|precedente|precedemment|previously|formerly|anciennement|ancien|ancienne|old)\b/;

const guess = (type: SemanticType, confidence: number, via: SemanticGuess["via"]): SemanticGuess => ({
  type,
  confidence,
  via,
  secret: SECRET.has(type),
  sensitive: SENSITIVE.has(type),
});

export interface SemanticInput {
  kind: FieldKind;
  autocomplete: string | null;
  label: string;
  name: string | null;
  htmlId: string | null;
  placeholder: string | null;
}

/** Classify a field. When in doubt the answer is `unknown`: an empty field is better than a wrong personal value. */
export function classifySemantic(i: SemanticInput): SemanticGuess {
  const g = classifyCore(i);
  if (g.secret || g.type === "unknown") return g;
  const aboutSomeoneElse = [i.label, i.placeholder, `${i.name ?? ""} ${i.htmlId ?? ""}`.replace(/[_\-.[\]]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2")].some((t) => THIRD_PARTY.test(fold(t)) || OTHER_INSTANCE.test(fold(t)));
  return aboutSomeoneElse ? guess("unknown", 0, "none") : g;
}

function classifyCore(i: SemanticInput): SemanticGuess {
  if (i.kind === "password") return guess("password", 0.99, "input-type");
  const tokens = (i.autocomplete ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const t = AUTOCOMPLETE[tok];
    // "new-password" is used as an anti-autofill hack on ordinary inputs: only trust it when the field looks like a password.
    if (t === "password" && !/pass|pwd|mdp/i.test(`${i.name ?? ""} ${i.htmlId ?? ""} ${i.label}`)) continue;
    if (t) return guess(t, 0.98, "autocomplete");
  }
  const foldedLabel = fold(i.label);
  if (i.kind === "email") return EXCLUDE.email?.test(foldedLabel) ? guess("unknown", 0, "none") : guess("email", 0.95, "input-type");
  if (i.kind === "tel") return EXCLUDE.phone?.test(foldedLabel) ? guess("unknown", 0, "none") : guess("phone", 0.9, "input-type");

  const test = (text: string | null): SemanticType | null => {
    const f = fold(text);
    if (!f) return null;
    for (const [type, re] of RULES) {
      if (!re.test(f)) continue;
      if (EXCLUDE[type]?.test(f)) {
        if (CONTACT.has(type) && (OTHER_ENTITY.test(f) || ELSEWHERE.test(f)) && type !== "email" && type !== "phone") return null; // about another entity: stop, do not fall through to company/institution
        continue;
      }
      return type;
    }
    return null;
  };
  const byLabel = test(i.label);
  if (byLabel) return guess(byLabel, 0.85, "label");
  const byName = test(`${i.name ?? ""} ${i.htmlId ?? ""}`.replace(/[_\-.[\]]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2"));
  if (byName) return guess(byName, 0.7, "name");
  const byPh = test(i.placeholder);
  if (byPh) return guess(byPh, 0.6, "placeholder");
  return guess("unknown", 0, "none");
}
