/** Text helpers. Unicode-safe: accents are folded ONLY on Latin letters; Arabic, Cyrillic, CJK are never altered (OB-08). */

export function collapse(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Lower-case + accent folding on Latin letters, for MATCHING only (never for values that are written). */
export function fold(s: string | null | undefined): string {
  return collapse(s)
    .normalize("NFD")
    .replace(/(?<=\p{Script=Latin})\p{M}+/gu, "")
    .normalize("NFC")
    .toLocaleLowerCase();
}

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function cssEscape(s: string): string {
  return s.replace(/([^\w-])/g, "\\$1").replace(/^(\d)/, "\\3$1 ");
}

/** Escapes text coming from a web page before it is placed inside a prompt: page content is DATA, never instructions. */
export function escapeUntrusted(s: string, max = 160): string {
  return collapse(s)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, max);
}
