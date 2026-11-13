import type { Sample } from "./corpus";

/**
 * HELD-OUT corpus: written AFTER the taxonomy had been tuned on `corpus.ts`, from admission, visa, job, banking and
 * checkout forms (FR + EN). Its FIRST measurement is the out-of-sample estimate recorded in MAPPING_FILL_SPEC §6;
 * after that it was used to extend the guards, so it is in-sample from then on. Same limits as corpus.ts.
 */
export const HELDOUT: readonly Sample[] = [
  // ---- positives (a vault key exists)
  { l: "Prénom usuel", t: "first_name" }, { l: "Legal first name", t: "first_name" }, { l: "Nom du candidat", t: "last_name", why: "candidate = the user" },
  { l: "Numéro de téléphone", t: "phone" }, { l: "Numéro de portable", t: "phone" }, { l: "Mobile phone number", t: "phone" }, { l: "Home phone", t: "phone" },
  { l: "Adresse e-mail du candidat", t: "email" }, { l: "Adresse e-mail de contact", t: "email" }, { l: "Email (required)", t: "email" },
  { l: "Nationalité actuelle", t: "nationality" }, { l: "Pays de nationalité", t: "nationality" }, { l: "Date of birth of applicant", t: "date_of_birth" },
  { l: "Adresse du domicile", t: "address_line1" }, { l: "Adresse de livraison", t: "address_line1" }, { l: "Adresse de facturation", t: "address_line1" },
  { l: "Current address", t: "address_line1" }, { l: "Mailing address", t: "address_line1" }, { l: "Ville de résidence", t: "city" }, { l: "Pays de résidence actuel", t: "country" },
  { l: "Billing country", t: "country" }, { l: "Shipping country", t: "country" }, { l: "Country / Region", t: "country" }, { l: "Province", t: "region" }, { l: "County", t: "region" },
  { l: "Zip", t: "postal_code" }, { l: "Postcode", t: "postal_code" }, { l: "Billing zip code", t: "postal_code" },
  { l: "Nom de l'employeur", t: "company" }, { l: "Organization", t: "company" }, { l: "Intitulé du diplôme", t: "degree" }, { l: "Degree type", t: "degree" },
  { l: "Établissement fréquenté", t: "institution" }, { l: "Dernier établissement fréquenté", t: "institution" }, { l: "Université d'origine", t: "institution" }, { l: "University name", t: "institution" }, { l: "Name of institution", t: "institution" },
  { l: "Graduation year", t: "graduation_year" }, { l: "Desired salary", t: "salary" }, { l: "Salary expectations", t: "salary" }, { l: "Numéro CNI", t: "national_id" }, { l: "SIREN", t: "tax_id" }, { l: "RIB / IBAN", t: "iban" },
  { l: "Ville d'origine", t: "unknown", why: "origin is not residence" },
  // ---- traps
  { l: "Nom de naissance", t: "unknown", why: "may differ from the current last name" }, { l: "Nom d'épouse", t: "unknown", why: "married name" }, { l: "Preferred name", t: "unknown", why: "nickname" },
  { l: "Alternate email", t: "unknown", k: "email", why: "another instance of the same thing" }, { l: "Adresse e-mail secondaire", t: "unknown", k: "email", why: "another instance" },
  { l: "Seconde nationalité", t: "unknown", why: "another instance" }, { l: "Previous address", t: "unknown", why: "former address" }, { l: "Ancienne adresse", t: "unknown", why: "former address" },
  { l: "Previous employer", t: "unknown", why: "former company" }, { l: "Former name", t: "unknown", why: "former name" }, { l: "Other phone", t: "unknown", k: "tel", why: "another instance" },
  { l: "Indicatif téléphonique", t: "unknown", why: "phone prefix" }, { l: "Numéro de rue", t: "unknown", why: "street number alone" }, { l: "Ville d'accueil", t: "unknown", why: "host city, not residence" },
  { l: "Pays d'accueil", t: "unknown", why: "host country" }, { l: "Destination country", t: "unknown", why: "destination" }, { l: "Pays de destination", t: "unknown", why: "destination" },
  { l: "Ville de l'établissement", t: "unknown", why: "someone else's city" }, { l: "Adresse de l'employeur", t: "unknown", why: "employer's address" }, { l: "Téléphone de l'employeur", t: "unknown", k: "tel", why: "employer's phone" },
  { l: "Employer's address", t: "unknown", why: "employer's address" }, { l: "Adresse de l'établissement", t: "unknown", why: "school's address" },
  { l: "Date d'obtention du diplôme", t: "unknown", why: "a date, not the degree name" }, { l: "Graduation date", t: "unknown", why: "date vs year" }, { l: "Mention", t: "unknown", why: "no vault key" }, { l: "Moyenne générale", t: "unknown", why: "no vault key" },
  { l: "Langue maternelle", t: "unknown", why: "no vault key" }, { l: "Niveau de français", t: "unknown", why: "no vault key" }, { l: "Years of experience", t: "unknown", why: "no vault key" },
  { l: "Current salary", t: "unknown", why: "expectation is not current pay" }, { l: "Start date", t: "unknown", why: "no vault key" }, { l: "Notice period", t: "unknown", why: "no vault key" },
  { l: "Are you a US citizen?", t: "unknown", why: "yes/no, not a nationality" }, { l: "Visa status", t: "unknown", why: "no vault key" }, { l: "Work authorization", t: "unknown", why: "no vault key" },
  { l: "GitHub URL", t: "unknown", why: "social profile, not the personal website" }, { l: "Twitter handle", t: "unknown", why: "social handle" }, { l: "Instagram", t: "unknown", why: "social handle" },
  { l: "BIC", t: "unknown", why: "not an IBAN" }, { l: "SWIFT code", t: "unknown", why: "not an IBAN" }, { l: "Account number", t: "unknown", why: "no vault key" }, { l: "Name on card", t: "unknown", why: "payment" },
  { l: "Expiration date", t: "unknown", why: "payment" }, { l: "Numéro d'étudiant", t: "unknown", why: "no vault key" }, { l: "Numéro de dossier Campus France", t: "unknown", why: "no vault key" },
  { l: "Numéro de TVA de l'entreprise", t: "unknown", why: "company VAT, not the personal tax id" }, { l: "Referral code", t: "unknown", why: "no vault key" },
  { l: "Téléphone de la personne à prévenir", t: "unknown", k: "tel", why: "third party" }, { l: "Nom du représentant légal", t: "unknown", why: "third party" }, { l: "Email du recruteur", t: "unknown", k: "email", why: "third party" },
  { l: "Nom du directeur de thèse", t: "unknown", why: "third party" }, { l: "Prénom du demandeur principal", t: "unknown", why: "someone else, in a family application" },
  { l: "Nom de l'établissement d'accueil", t: "unknown", why: "host institution" }, { l: "Adresse de l'établissement d'accueil", t: "unknown", why: "host institution's address" },
];
