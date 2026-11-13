/** UI texts. English is the reference; `fr` must define exactly the same keys (enforced by the compiler). ADR-016. */
export const en = {
  appName: "Exponent Fill", signIn: "Sign in", signOut: "Sign out", register: "Create account", email: "E-mail", password: "Password", displayName: "Name",
  forgot: "Forgot your password?", sendLink: "Send the reset link", resetSent: "If an account exists for this address, a reset link has been sent.", newPassword: "New password",
  resetPassword: "Reset password", passwordHint: "At least 12 characters.", haveAccount: "I already have an account", noAccount: "Create an account", save: "Save", cancel: "Cancel",
  delete: "Delete", edit: "Edit", add: "Add", confirm: "Confirm", loading: "Loading…", empty: "Nothing here yet.", error: "Something went wrong.", retry: "Retry",
  navOverview: "Overview", navPersonal: "Personal information", navContact: "Contact details", navProfessional: "Professional", navAcademic: "Education",
  navSkills: "Skills & certifications", navAdministrative: "Administrative", navDocuments: "Documents", navReview: "To review", navActivity: "Activity",
  navPrivacy: "Privacy & security", navAccount: "Account",
  trustDeclared: "Declared", trustExtracted: "Extracted", trustVerified: "Verified", trustInferred: "Inferred",
  trustHelpDeclared: "You typed it. Not independently verified.", trustHelpExtracted: "Read in a document. Check it before using it.",
  trustHelpVerified: "You confirmed it.", trustHelpInferred: "Deduced. It must be confirmed before use.",
  statusPending: "To review", statusValidated: "Validated", statusRejected: "Rejected", statusSuperseded: "Replaced", inConflict: "In conflict", usable: "Ready for forms",
  value: "Value", key: "Information", source: "Source", sources: "Sources", history: "History", reveal: "Show", masked: "Hidden (sensitive)", validate: "Validate", reject: "Reject",
  validateWithDocument: "Confirm (backed by the document)", addInformation: "Add information", chooseKey: "What is it?", customKey: "Custom key (category.name)",
  overviewTitle: "Your vault", toReview: "items to review", openConflicts: "open conflicts", documentsCount: "documents", lastActivity: "Latest activity",
  uploadDocument: "Import a document", dropHere: "Drop a file here or choose one", docType: "Type", docStatus: "Status", docConfidence: "Confidence", replaceFile: "Replace the file",
  deleteDocument: "Delete the document", factsPolicy: "What about the information read in it?", policyKeep: "Keep it as it is", policyDetach: "Keep it, detach from the document",
  policyDelete: "Delete it too", extractedText: "Extracted text", noText: "No text could be read (a scan needs OCR).", factsFromDocument: "Information read in this document",
  reviewTitle: "To review", reviewIntro: "Information read or deduced automatically is never used until you validate it.", conflictsTitle: "Conflicts",
  conflictIntro: "Two different values exist for the same information. It stays blocked until you choose.", keepA: "Keep this one", keepB: "Keep this one", dismissConflict: "Both are valid",
  activityTitle: "Activity", chainValid: "Journal integrity verified", chainBroken: "Journal integrity check FAILED",
  privacyTitle: "Privacy & security", aiSharing: "Sharing with AI models", aiNone: "Nothing is shared with any AI model", aiStructure: "Only the structure of forms",
  aiSelected: "Selected categories only", aiPreview: "Preview what would be shared", aiDisclosures: "What was shared", aiExcluded: "Excluded", sensitiveNever: "Sensitive information is never shared.",
  deviceValidation: "Allow a device (the extension) to validate information", sessions: "Sessions and devices", revoke: "Revoke", current: "this session", createDevice: "Connect the extension",
  deviceLabel: "Device name", deviceToken: "Copy this token into the extension now: it will not be shown again.", retention: "Keep documents for (days)", save_ok: "Saved.",
  accountTitle: "Account", exportData: "Export my data (JSON)", exportZip: "Export my data and documents (ZIP)", language: "Language",
  changePassword: "Change password", currentPassword: "Current password", deleteAccount: "Delete my account",
  deleteAccountHelp: "Your data is permanently erased after a grace period. You can cancel until then.", deletionScheduled: "Deletion scheduled for", cancelDeletion: "Cancel the deletion",
  confirmDeleteTitle: "Delete this item?", confirmDeleteBody: "This cannot be undone.", verifyEmail: "Your e-mail address is not verified yet.",
  staleVersion: "This information changed elsewhere. Reload and try again.", duplicate: "This information is already in your vault.",
  err_invalid_credentials: "Incorrect e-mail or password.", err_account_locked: "Too many attempts. Try again later.", err_email_taken: "An account already exists for this e-mail.",
  err_password_too_short: "The password is too short.", err_password_too_common: "The password is too common.", err_invalid_email: "That does not look like an e-mail address.",
  err_unauthenticated: "Please sign in.", err_secret_not_storable: "Passwords and card data are never stored.", err_unsupported_type: "This file type is not accepted.",
  err_file_too_large: "The file is too large.", err_invalid_token: "This link is invalid or has expired.",
} as const;

export type MessageKey = keyof typeof en;

export const fr: Record<MessageKey, string> = {
  appName: "Exponent Fill", signIn: "Se connecter", signOut: "Se déconnecter", register: "Créer un compte", email: "Adresse e-mail", password: "Mot de passe", displayName: "Nom",
  forgot: "Mot de passe oublié ?", sendLink: "Envoyer le lien de réinitialisation", resetSent: "Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.",
  newPassword: "Nouveau mot de passe", resetPassword: "Réinitialiser le mot de passe", passwordHint: "Au moins 12 caractères.", haveAccount: "J'ai déjà un compte", noAccount: "Créer un compte",
  save: "Enregistrer", cancel: "Annuler", delete: "Supprimer", edit: "Modifier", add: "Ajouter", confirm: "Confirmer", loading: "Chargement…", empty: "Rien ici pour l'instant.",
  error: "Une erreur est survenue.", retry: "Réessayer",
  navOverview: "Vue d'ensemble", navPersonal: "Informations personnelles", navContact: "Coordonnées", navProfessional: "Parcours professionnel", navAcademic: "Parcours académique",
  navSkills: "Compétences et certifications", navAdministrative: "Informations administratives", navDocuments: "Documents", navReview: "À vérifier", navActivity: "Activité",
  navPrivacy: "Confidentialité et sécurité", navAccount: "Compte",
  trustDeclared: "Déclarée", trustExtracted: "Extraite", trustVerified: "Vérifiée", trustInferred: "Déduite",
  trustHelpDeclared: "Vous l'avez saisie. Non vérifiée de façon indépendante.", trustHelpExtracted: "Lue dans un document. À contrôler avant usage.",
  trustHelpVerified: "Vous l'avez confirmée.", trustHelpInferred: "Déduite. À confirmer avant usage.",
  statusPending: "À vérifier", statusValidated: "Validée", statusRejected: "Rejetée", statusSuperseded: "Remplacée", inConflict: "En conflit", usable: "Utilisable pour les formulaires",
  value: "Valeur", key: "Information", source: "Source", sources: "Sources", history: "Historique", reveal: "Afficher", masked: "Masquée (sensible)", validate: "Valider", reject: "Rejeter",
  validateWithDocument: "Confirmer (appuyée par le document)", addInformation: "Ajouter une information", chooseKey: "De quoi s'agit-il ?", customKey: "Clé libre (catégorie.nom)",
  overviewTitle: "Votre coffre", toReview: "éléments à vérifier", openConflicts: "conflits ouverts", documentsCount: "documents", lastActivity: "Dernière activité",
  uploadDocument: "Importer un document", dropHere: "Déposez un fichier ici ou choisissez-en un", docType: "Type", docStatus: "État", docConfidence: "Confiance",
  replaceFile: "Remplacer le fichier", deleteDocument: "Supprimer le document", factsPolicy: "Que faire des informations lues dedans ?", policyKeep: "Les garder telles quelles",
  policyDetach: "Les garder, sans lien avec le document", policyDelete: "Les supprimer aussi", extractedText: "Texte extrait", noText: "Aucun texte lisible (un scan demande un OCR).",
  factsFromDocument: "Informations lues dans ce document", reviewTitle: "À vérifier", reviewIntro: "Une information lue ou déduite automatiquement n'est jamais utilisée tant que vous ne l'avez pas validée.",
  conflictsTitle: "Conflits", conflictIntro: "Deux valeurs différentes existent pour la même information. Elle reste bloquée tant que vous n'avez pas choisi.",
  keepA: "Garder celle-ci", keepB: "Garder celle-ci", dismissConflict: "Les deux sont valables", activityTitle: "Activité", chainValid: "Intégrité du journal vérifiée",
  chainBroken: "Échec de la vérification d'intégrité du journal", privacyTitle: "Confidentialité et sécurité", aiSharing: "Partage avec les modèles d'IA",
  aiNone: "Rien n'est partagé avec un modèle d'IA", aiStructure: "Uniquement la structure des formulaires", aiSelected: "Catégories choisies seulement",
  aiPreview: "Aperçu de ce qui serait partagé", aiDisclosures: "Ce qui a été partagé", aiExcluded: "Exclus", sensitiveNever: "Les informations sensibles ne sont jamais partagées.",
  deviceValidation: "Autoriser un appareil (l'extension) à valider des informations", sessions: "Sessions et appareils", revoke: "Révoquer", current: "cette session",
  createDevice: "Connecter l'extension", deviceLabel: "Nom de l'appareil", deviceToken: "Copiez ce jeton dans l'extension maintenant : il ne sera plus affiché.",
  retention: "Conserver les documents pendant (jours)", save_ok: "Enregistré.", accountTitle: "Compte", exportData: "Exporter mes données (JSON)",
  exportZip: "Exporter mes données et documents (ZIP)", language: "Langue", changePassword: "Changer le mot de passe", currentPassword: "Mot de passe actuel",
  deleteAccount: "Supprimer mon compte", deleteAccountHelp: "Vos données sont effacées définitivement après un délai de grâce. Vous pouvez annuler jusque-là.",
  deletionScheduled: "Suppression prévue le", cancelDeletion: "Annuler la suppression", confirmDeleteTitle: "Supprimer cet élément ?", confirmDeleteBody: "Cette action est irréversible.",
  verifyEmail: "Votre adresse e-mail n'est pas encore vérifiée.", staleVersion: "Cette information a changé ailleurs. Rechargez puis réessayez.",
  duplicate: "Cette information est déjà dans votre coffre.",
  err_invalid_credentials: "Adresse e-mail ou mot de passe incorrect.", err_account_locked: "Trop de tentatives. Réessayez plus tard.", err_email_taken: "Un compte existe déjà pour cette adresse.",
  err_password_too_short: "Le mot de passe est trop court.", err_password_too_common: "Le mot de passe est trop courant.", err_invalid_email: "Ceci ne ressemble pas à une adresse e-mail.",
  err_unauthenticated: "Veuillez vous connecter.", err_secret_not_storable: "Les mots de passe et données de carte ne sont jamais stockés.",
  err_unsupported_type: "Ce type de fichier n'est pas accepté.", err_file_too_large: "Le fichier est trop volumineux.", err_invalid_token: "Ce lien est invalide ou a expiré.",
};

export type Locale = "en" | "fr";
const catalogs: Record<Locale, Record<MessageKey, string>> = { en, fr };

export function translate(locale: Locale, key: MessageKey): string {
  return catalogs[locale][key] ?? key;
}

/** Maps an API error code to a message when one exists, else the generic error. */
export function errorMessage(locale: Locale, code: string | undefined): string {
  const key = `err_${code}` as MessageKey;
  return code && key in en ? translate(locale, key) : translate(locale, "error");
}

export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem("ef_locale");
    if (saved === "en" || saved === "fr") return saved;
  } catch {
    /* storage unavailable: fall back */
  }
  return typeof navigator !== "undefined" && navigator.language.startsWith("fr") ? "fr" : "en";
}
