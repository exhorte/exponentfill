import type { Sample } from "./corpus";

/**
 * Third corpus: written AFTER the guards were generalised on `corpus.ts` and `corpus-heldout.ts`, from other domains
 * (health, e-commerce, travel, banking, public services; FR + EN). Its first measurement is the second out-of-sample
 * estimate recorded in MAPPING_FILL_SPEC §6; it is in-sample once the failures it revealed have been handled.
 */
export const BLIND: readonly Sample[] = [
  // ---- positives
  { l: "Votre prénom", t: "first_name" }, { l: "Votre nom de famille", t: "last_name" }, { l: "Votre adresse e-mail", t: "email" }, { l: "Votre numéro de téléphone", t: "phone" },
  { l: "Your email", t: "email" }, { l: "Enter your first name", t: "first_name" }, { l: "Quel est votre nom ?", t: "full_name" }, { l: "Rue", t: "address_line1" }, { l: "Adresse (rue, numéro)", t: "address_line1" },
  { l: "Code postal de résidence", t: "postal_code" }, { l: "N° de téléphone", t: "phone" }, { l: "Mobile no.", t: "phone" }, { l: "Téléphone (indicatif inclus)", t: "phone" },
  { l: "Civilité (M./Mme)", t: "civility" }, { l: "Titre (M., Mme)", t: "civility" }, { l: "Salutation", t: "civility" }, { l: "Employeur", t: "company" }, { l: "Nom de la société", t: "company" },
  { l: "Profession exercée", t: "job_title" }, { l: "Poste actuel", t: "job_title" }, { l: "Entreprise actuelle", t: "company" }, { l: "Dernier diplôme obtenu", t: "degree" }, { l: "Niveau d'études atteint", t: "degree" },
  { l: "Lieu de naissance (ville)", t: "place_of_birth" }, { l: "Nationalité (pays)", t: "nationality" }, { l: "Sexe (M/F)", t: "gender" }, { l: "État civil", t: "marital_status" }, { l: "Région / État", t: "region" },
  { l: "Page LinkedIn", t: "linkedin" }, { l: "Pseudo", t: "username" }, { l: "Login", t: "username" }, { l: "Adresse électronique professionnelle", t: "email" }, { l: "E-mail pro", t: "email" },
  { l: "Numéro d'identification fiscale (NIF)", t: "tax_id" }, { l: "Birth place", t: "place_of_birth" }, { l: "Site personnel", t: "website" }, { l: "Mail", t: "email" }, { l: "Business name", t: "company" },
  { l: "Date de naissance (jj/mm/aaaa)", t: "date_of_birth" }, { l: "Birth date", t: "date_of_birth" }, { l: "Prénom *", t: "first_name" }, { l: "Nom *", t: "last_name" }, { l: "Email *", t: "email" },
  // ---- traps: another person / role
  { l: "Email du médecin", t: "unknown", k: "email", why: "doctor" }, { l: "Nom de l'enseignant", t: "unknown", why: "teacher" }, { l: "Teacher's email", t: "unknown", k: "email", why: "teacher" },
  { l: "Nom de l'avocat", t: "unknown", why: "lawyer" }, { l: "Witness name", t: "unknown", why: "witness" }, { l: "Nom du témoin", t: "unknown", why: "witness" },
  { l: "Recipient's email", t: "unknown", k: "email", why: "recipient" }, { l: "Email du destinataire", t: "unknown", k: "email", why: "recipient" }, { l: "Nom du destinataire", t: "unknown", why: "recipient" },
  { l: "Friend's email", t: "unknown", k: "email", why: "friend" }, { l: "Email d'un ami", t: "unknown", k: "email", why: "friend" }, { l: "Prénom de votre enfant", t: "unknown", why: "child" },
  { l: "Date de naissance du conjoint", t: "unknown", why: "spouse" }, { l: "Date of birth of the second applicant", t: "unknown", why: "someone else" }, { l: "Nom du médecin traitant", t: "unknown", why: "doctor" },
  // ---- traps: another instance / place
  { l: "Work address", t: "unknown", why: "not the home address" }, { l: "Adresse professionnelle", t: "unknown", why: "not the home address" }, { l: "Business address", t: "unknown", why: "not the home address" },
  { l: "Adresse du lieu de travail", t: "unknown", why: "not the home address" }, { l: "Ancienne entreprise", t: "unknown", why: "former" }, { l: "Employeur précédent", t: "unknown", why: "former" },
  { l: "Pays de délivrance du visa", t: "unknown", why: "visa" }, { l: "Numéro de visa", t: "unknown", why: "visa" },
  // ---- traps: a property of the thing, not the thing
  { l: "Votre nom d'utilisateur", t: "username", why: "'votre nom' must not win" }, { l: "Type de carte d'identité", t: "unknown", why: "type of document" }, { l: "Type de pièce d'identité", t: "unknown", why: "type of document" },
  { l: "Code BIC", t: "unknown", why: "not an IBAN" }, { l: "Titulaire du compte", t: "unknown", why: "no vault key" }, { l: "Numéro de carte de fidélité", t: "unknown", why: "loyalty card (over-protection is acceptable)" },
  { l: "Delivery instructions", t: "unknown", why: "no vault key" }, { l: "Billing name", t: "unknown", why: "no vault key" }, { l: "Montant", t: "unknown", why: "no vault key" }, { l: "Quantité", t: "unknown", why: "no vault key" },
  { l: "Nom du produit", t: "unknown", why: "no vault key" }, { l: "Nom de la campagne", t: "unknown", why: "no vault key" }, { l: "Date de début", t: "unknown", why: "no vault key" }, { l: "Objet de la demande", t: "unknown", why: "no vault key" },
  { l: "Numéro de commande", t: "unknown", why: "no vault key" }, { l: "Numéro de client", t: "unknown", why: "no vault key" }, { l: "Heure du rendez-vous", t: "unknown", why: "no vault key" }, { l: "Motif de la consultation", t: "unknown", why: "no vault key" },
  { l: "Number of guests", t: "unknown", why: "no vault key" }, { l: "Check-in date", t: "unknown", why: "no vault key" }, { l: "Special requests", t: "unknown", why: "no vault key" }, { l: "Département d'accueil", t: "unknown", why: "host department, not the user's region" },
  { l: "Pays de départ", t: "unknown", why: "travel origin, not residence" }, { l: "Ville d'arrivée", t: "unknown", why: "travel destination" }, { l: "Departure city", t: "unknown", why: "travel origin" }, { l: "Arrival country", t: "unknown", why: "travel destination" },
  { l: "Poste occupé précédemment", t: "unknown", why: "former" }, { l: "Sujet du mémoire", t: "unknown", why: "no vault key" }, { l: "Titre de la thèse", t: "unknown", why: "'titre' is not a civility" },
  { l: "Titre du livre", t: "unknown", why: "'titre' is not a civility" }, { l: "Mon titre professionnel", t: "job_title", why: "professional title = job title" },
];
