import { fold } from "./text";
import type { ButtonInfo, CommitKind } from "./types";

// Spec OB-04: classify the INTENT of a button (next / previous / commit), FR + EN, and FAIL CLOSED:
// any doubt, any unknown text, any mix of navigation and commit wording => "commit" (the user must decide).

const COMMIT: ReadonlyArray<readonly [CommitKind, RegExp]> = [
  ["purchase", /\b(pay|payer|payment|paiement|buy|acheter|order|commander|checkout|place order|purchase|passer commande|subscribe|s'abonner|donate|donner)\b/],
  ["delete", /\b(delete|supprimer|remove|retirer|erase|effacer|cancel (my )?(account|subscription)|resilier|fermer (mon )?compte|unsubscribe)\b/],
  ["sign", /\b(sign|signer|e-?sign|accept and sign|approuver|approve|authorize|autoriser|i agree|j'accepte)\b/],
  ["submit", /\b(submit|send|envoyer|soumettre|apply|postuler|register|s'inscrire|sign up|create (an )?account|creer (un )?compte|finish|finish registration|terminer|finaliser|confirm|confirmer|valider|validate|complete|save and submit|book|reserver|candidater)\b/],
];
const NEXT = /\b(next|continue|suivant|continuer|next step|etape suivante|poursuivre|go on|avancer)\b|^(>|>>|→)$/;
const PREVIOUS = /\b(previous|prev|back|go back|retour|precedent|etape precedente|revenir)\b|^(<|<<|←)$/;
const DISMISS = /^(cancel|annuler|close|fermer|not now|plus tard|later|no thanks|non merci|skip|passer|ignorer)$/;

export function classifyButton(rawText: string, attrs: { type?: string | null } = {}): ButtonInfo {
  const text = fold(rawText);
  const make = (intent: ButtonInfo["intent"], commitKind: CommitKind | null, reason: string): ButtonInfo => ({ text: rawText.trim(), intent, commitKind, reason });

  let commitKind: CommitKind | null = null;
  for (const [k, re] of COMMIT) {
    if (re.test(text)) {
      commitKind = k;
      break;
    }
  }
  const nav = NEXT.test(text) ? "next" : PREVIOUS.test(text) ? "previous" : null;

  if (commitKind && nav) return make("commit", commitKind, "mixed navigation and commit wording: fail closed");
  if (commitKind) return make("commit", commitKind, `commit wording (${commitKind})`);
  if (nav === "next") return make("next", null, "navigation: next");
  if (nav === "previous") return make("previous", null, "navigation: previous");
  if (DISMISS.test(text)) return make("dismiss", null, "dismiss wording");
  if (attrs.type === "submit") return make("commit", "submit", "type=submit without recognised text: fail closed");
  return make("commit", "other", "unknown text: fail closed");
}
