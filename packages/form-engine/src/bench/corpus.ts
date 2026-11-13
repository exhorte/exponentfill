import type { FieldKind, SemanticType } from "../types";

/**
 * Hand-labelled field descriptors for the mapping benchmark (G4, NFR-03). The truth is the MEANING of the field for the
 * user's own vault, written from how real forms word things (FR + EN), NOT from what the classifier answers.
 * `unknown` = "no vault key fits, or the field is about someone/something else": the right behaviour is to leave it empty.
 *
 * Written once BEFORE the first measurement, then extended when a failure class was found (see MAPPING_FILL_SPEC §6).
 * Limits: our own corpus (not independent), short labels only, no page context.
 */
export interface Sample {
  /** Visible label. */
  l: string;
  /** Expected semantic type from the user's own point of view. */
  t: SemanticType;
  k?: FieldKind;
  /** name / id attribute, when it is what the page offers. */
  n?: string;
  /** autocomplete attribute. */
  ac?: string;
  /** Why this case is in the corpus (adversarial classes). */
  why?: string;
}

const positives: Sample[] = [
  // ---- English
  { l: "First name", t: "first_name" }, { l: "Given name(s)", t: "first_name" }, { l: "Forename", t: "first_name" },
  { l: "Last name", t: "last_name" }, { l: "Surname", t: "last_name" }, { l: "Family name", t: "last_name" },
  { l: "Full name", t: "full_name" }, { l: "Your name", t: "full_name" },
  { l: "Email address", t: "email" }, { l: "E-mail", t: "email" }, { l: "Confirm your email", t: "email" },
  { l: "Phone number", t: "phone" }, { l: "Mobile", t: "phone" }, { l: "Telephone", t: "phone" },
  { l: "Date of birth (DD/MM/YYYY)", t: "date_of_birth" }, { l: "Birthday", t: "date_of_birth" }, { l: "DOB", t: "date_of_birth" },
  { l: "Place of birth", t: "place_of_birth" }, { l: "Nationality", t: "nationality" }, { l: "Citizenship", t: "nationality" },
  { l: "Gender", t: "gender" }, { l: "Marital status", t: "marital_status" },
  { l: "Street address", t: "address_line1" }, { l: "Address line 1", t: "address_line1" }, { l: "Address line 2", t: "address_line2" },
  { l: "Apartment, suite, building", t: "address_line2" }, { l: "ZIP / Postal code", t: "postal_code" }, { l: "City / Town", t: "city" },
  { l: "State / Province", t: "region" }, { l: "Country", t: "country" }, { l: "Country of residence", t: "country" },
  { l: "Company name", t: "company" }, { l: "Current employer", t: "company" }, { l: "Job title", t: "job_title" }, { l: "Current position", t: "job_title" },
  { l: "Personal website", t: "website" }, { l: "Portfolio URL", t: "website" }, { l: "LinkedIn profile", t: "linkedin" }, { l: "LinkedIn URL", t: "linkedin" },
  { l: "Username", t: "username" }, { l: "Social security number", t: "national_id" }, { l: "Passport number", t: "passport_number" }, { l: "Tax ID", t: "tax_id" },
  { l: "IBAN", t: "iban" }, { l: "Expected salary", t: "salary" }, { l: "Highest degree", t: "degree" }, { l: "School / University", t: "institution" },
  { l: "Year of graduation", t: "graduation_year" }, { l: "Cover letter", t: "cover_letter" }, { l: "Resume / CV", t: "resume_file", k: "file" },
  { l: "Password", t: "password", k: "password" }, { l: "Confirm password", t: "password", k: "password" }, { l: "One-time code", t: "one_time_code" },
  { l: "Card number", t: "card_number" }, { l: "CVV", t: "card_security_code" }, { l: "Security code", t: "card_security_code" },
  { l: "I agree to the terms and conditions", t: "consent", k: "checkbox" }, { l: "Subscribe to the newsletter", t: "consent", k: "checkbox" },
  // ---- Français
  { l: "Prénom", t: "first_name" }, { l: "Prénoms", t: "first_name" }, { l: "Nom", t: "last_name" }, { l: "Nom de famille", t: "last_name" },
  { l: "Nom complet", t: "full_name" }, { l: "Nom et prénom", t: "full_name" }, { l: "Prénom et nom", t: "full_name" },
  { l: "Courriel", t: "email" }, { l: "Adresse e-mail", t: "email" }, { l: "Adresse électronique", t: "email" },
  { l: "Téléphone", t: "phone" }, { l: "Téléphone portable", t: "phone" }, { l: "Portable", t: "phone" },
  { l: "Date de naissance", t: "date_of_birth" }, { l: "Né(e) le", t: "date_of_birth" }, { l: "Lieu de naissance", t: "place_of_birth" }, { l: "Ville de naissance", t: "place_of_birth" },
  { l: "Nationalité", t: "nationality" }, { l: "Civilité", t: "civility" }, { l: "Madame / Monsieur", t: "civility" }, { l: "Sexe", t: "gender" },
  { l: "Situation familiale", t: "marital_status" }, { l: "Situation matrimoniale", t: "marital_status" },
  { l: "Adresse", t: "address_line1" }, { l: "Numéro et voie", t: "address_line1" }, { l: "Adresse postale", t: "address_line1" }, { l: "Complément d'adresse", t: "address_line2" },
  { l: "Code postal", t: "postal_code" }, { l: "Ville", t: "city" }, { l: "Commune", t: "city" }, { l: "Département", t: "region" }, { l: "Région", t: "region" },
  { l: "Pays", t: "country" }, { l: "Pays de résidence", t: "country" },
  { l: "Entreprise", t: "company" }, { l: "Société", t: "company" }, { l: "Nom de l'entreprise", t: "company" }, { l: "Employeur actuel", t: "company" },
  { l: "Fonction", t: "job_title" }, { l: "Profession", t: "job_title" }, { l: "Intitulé du poste", t: "job_title" },
  { l: "Site web", t: "website" }, { l: "Site internet", t: "website" }, { l: "Identifiant", t: "username" }, { l: "Nom d'utilisateur", t: "username" },
  { l: "Numéro de sécurité sociale", t: "national_id" }, { l: "Numéro de passeport", t: "passport_number" }, { l: "Numéro fiscal", t: "tax_id" }, { l: "SIRET", t: "tax_id" },
  { l: "Prétentions salariales", t: "salary" }, { l: "Diplôme le plus élevé", t: "degree" }, { l: "Niveau d'études", t: "degree" },
  { l: "Établissement", t: "institution" }, { l: "École", t: "institution" }, { l: "Nom de l'école", t: "institution" }, { l: "Année d'obtention", t: "graduation_year" },
  { l: "Lettre de motivation", t: "cover_letter" }, { l: "CV", t: "resume_file", k: "file" }, { l: "Mot de passe", t: "password", k: "password" },
  { l: "J'accepte les conditions générales", t: "consent", k: "checkbox" },
  // ---- attribute-only fields (no usable label)
  { l: "", n: "first_name", t: "first_name" }, { l: "", n: "lname", t: "unknown", why: "abbreviation: not guessed" }, { l: "", n: "user_email", t: "email" },
  { l: "", n: "zipCode", t: "postal_code" }, { l: "", n: "phoneNumber", t: "phone" }, { l: "", ac: "given-name", t: "first_name" }, { l: "", ac: "family-name", t: "last_name" },
  { l: "", ac: "postal-code", t: "postal_code" }, { l: "", n: "q17", t: "unknown", why: "meaningless name" }, { l: "Field 3", t: "unknown", why: "meaningless label" },
];

/** Cases where proposing a vault value would be WRONG or dangerous: the field is about someone else, or about something else. */
const traps: Sample[] = [
  // about another person
  { l: "Parent's email", t: "unknown", k: "email", why: "third party" }, { l: "Mother's maiden name", t: "unknown", why: "third party" },
  { l: "Father's first name", t: "unknown", why: "third party" }, { l: "Nom du père", t: "unknown", why: "third party" }, { l: "Prénom de la mère", t: "unknown", why: "third party" },
  { l: "Nom de jeune fille", t: "unknown", why: "differs from the current last name" }, { l: "Spouse's name", t: "unknown", why: "third party" }, { l: "Nom du conjoint", t: "unknown", why: "third party" },
  { l: "Emergency contact phone", t: "unknown", k: "tel", why: "third party" }, { l: "Téléphone en cas d'urgence", t: "unknown", k: "tel", why: "third party" },
  { l: "Contact d'urgence : nom", t: "unknown", why: "third party" }, { l: "Referee email", t: "unknown", k: "email", why: "third party" }, { l: "Guardian's last name", t: "unknown", why: "third party" },
  { l: "Tuteur légal : prénom", t: "unknown", why: "third party" }, { l: "Child's date of birth", t: "unknown", why: "third party" }, { l: "Date de naissance de l'enfant", t: "unknown", why: "third party" },
  { l: "Manager's email", t: "unknown", k: "email", why: "third party" }, { l: "Nom du bénéficiaire", t: "unknown", why: "third party" }, { l: "Nom du garant", t: "unknown", why: "third party" },
  // "nom ..." is not always a last name
  { l: "Nom du projet", t: "unknown", why: "'nom' + something else" }, { l: "Nom de la banque", t: "unknown", why: "'nom' + something else" }, { l: "Nom du titulaire de la carte", t: "unknown", why: "cardholder, payment" },
  { l: "Nom du fichier", t: "unknown", why: "'nom' + something else" }, { l: "Nom de la rue", t: "unknown", why: "street name alone is not the full address line" }, { l: "Nom de l'événement", t: "unknown", why: "'nom' + something else" },
  { l: "Nom en écriture d'origine (arabe, cyrillique, etc.)", t: "unknown", why: "native-script name is not the Latin last name" },
  { l: "Name of your company", t: "company", why: "(positive control)" },
  // "title" is not always a civility
  { l: "Job title", t: "job_title", why: "must not be read as a civility" }, { l: "Titre du poste", t: "job_title", why: "must not be read as a civility" },
  { l: "Title of your project", t: "unknown", why: "'title' is not a civility" }, { l: "Titre de la demande", t: "unknown", why: "'titre' is not a civility" },
  // "address" is not always a postal address
  { l: "IP address", t: "unknown", why: "network address" }, { l: "Website address", t: "website", why: "web address" }, { l: "Adresse du site web", t: "website", why: "web address" }, { l: "Adresse IP", t: "unknown", why: "network address" },
  { l: "Wallet address", t: "unknown", why: "crypto wallet" }, { l: "Billing email address", t: "email", why: "(positive control)" },
  // dates and details about documents
  { l: "Passport expiry date", t: "unknown", why: "date, not the number" }, { l: "Date d'expiration du passeport", t: "unknown", why: "date, not the number" },
  { l: "Passport country of issue", t: "unknown", why: "country of issue, not the number" }, { l: "Date of issue", t: "unknown", why: "date" }, { l: "ID card expiry", t: "unknown", why: "date" },
  // country of something else
  { l: "Country code", t: "unknown", why: "phone prefix" }, { l: "Indicatif pays", t: "unknown", why: "phone prefix" }, { l: "Country of birth", t: "unknown", why: "not the country of residence" }, { l: "Pays de naissance", t: "unknown", why: "not a city of birth" },
  // "school", "company", "position" qualifiers
  { l: "School year", t: "unknown", why: "not the institution" }, { l: "Année scolaire", t: "unknown", why: "not the institution" }, { l: "Type d'établissement", t: "unknown", why: "not the institution" },
  { l: "Company size", t: "unknown", why: "not the company" }, { l: "Taille de l'entreprise", t: "unknown", why: "not the company" }, { l: "Secteur d'activité de l'entreprise", t: "unknown", why: "not the company" },
  { l: "Poste visé", t: "unknown", why: "desired job, not the current one" }, { l: "Desired position", t: "unknown", why: "desired job, not the current one" }, { l: "Position applied for", t: "unknown", why: "desired job, not the current one" },
  { l: "Field of study", t: "unknown", why: "major, not the degree" }, { l: "Filière", t: "unknown", why: "major, not the degree" }, { l: "Spécialité", t: "unknown", why: "major, not the degree" },
  // urls and postal words
  { l: "Image URL", t: "unknown", why: "not a personal website" }, { l: "URL de la photo", t: "unknown", why: "not a personal website" },
  { l: "Postal address of the head office", t: "unknown", why: "someone else's address" }, { l: "Hotel name", t: "unknown", why: "contains 'tel'" }, { l: "Statement of purpose", t: "unknown", why: "contains 'state'" },
  { l: "Total amount", t: "unknown", why: "no vault key" }, { l: "How did you hear about us?", t: "unknown", why: "no vault key" }, { l: "Comments", t: "unknown", why: "no vault key" }, { l: "Message", t: "unknown", why: "no vault key" },
  { l: "Number of employees", t: "unknown", why: "no vault key" }, { l: "Cell type", t: "unknown", why: "contains 'cell'" }, { l: "Promo code", t: "unknown", why: "no vault key" }, { l: "Captcha", t: "unknown", why: "never solved" },
];

export const CORPUS: readonly Sample[] = [...positives, ...traps];
