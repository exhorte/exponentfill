/** Shared types of the form engine. Everything here describes STRUCTURE: no field value ever appears in these types. */

export type FieldKind =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "number"
  | "date"
  | "datetime-local"
  | "select"
  | "radio-group"
  | "checkbox"
  | "checkbox-group"
  | "combobox"
  | "listbox"
  | "richtext"
  | "file"
  | "password"
  | "unknown";

/** A stable reference to a field. It is computed from the DOM and NEVER written into the page (OB-02). */
export interface FieldRef {
  /** CSS selectors of the shadow hosts crossed to reach the field, outermost first. */
  hosts: string[];
  /** CSS path of the field inside its (shadow) root. */
  path: string;
  /** Fingerprint of the field's own attributes and explicit label (survives reordering). */
  fp: string;
}

export type LabelSource =
  | "aria-labelledby"
  | "label-for"
  | "label-wrap"
  | "group-legend"
  | "container-question"
  | "aria-label"
  | "placeholder"
  | "title"
  | "name"
  | "none";

export interface LabelInfo {
  text: string;
  source: LabelSource;
  /** 0..1, how much we trust this label. */
  confidence: number;
  /** True when the same aria-label is shared by several fields of the page (it does not identify this field). */
  shared: boolean;
}

export interface FieldOption {
  value: string;
  label: string;
  selected: boolean;
  disabled: boolean;
}

export interface Constraints {
  maxLength: number | null;
  minLength: number | null;
  pattern: string | null;
  min: string | null;
  max: string | null;
  step: string | null;
  multiple: boolean;
  accept: string | null;
}

/** Semantic types of the taxonomy (FR + EN). `unknown` means: leave the field empty. */
export const SEMANTIC_TYPES = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "date_of_birth",
  "place_of_birth",
  "nationality",
  "civility",
  "gender",
  "marital_status",
  "address_line1",
  "address_line2",
  "postal_code",
  "city",
  "region",
  "country",
  "company",
  "job_title",
  "website",
  "linkedin",
  "username",
  "national_id",
  "passport_number",
  "tax_id",
  "iban",
  "salary",
  "degree",
  "institution",
  "graduation_year",
  "cover_letter",
  "resume_file",
  "consent",
  "password",
  "one_time_code",
  "card_number",
  "card_security_code",
  "unknown",
] as const;
export type SemanticType = (typeof SEMANTIC_TYPES)[number];


export interface SemanticGuess {
  type: SemanticType;
  confidence: number;
  via: "autocomplete" | "input-type" | "label" | "name" | "placeholder" | "model" | "none";
  /** Never filled, never stored, never sent (passwords, one-time codes, card data). */
  secret: boolean;
  /** Needs explicit human validation before any use (identity numbers, bank data...). */
  sensitive: boolean;
}

export interface FormField {
  /** Local identifier inside one scan ("f1", "f2", ...). */
  id: string;
  ref: FieldRef;
  kind: FieldKind;
  name: string | null;
  htmlId: string | null;
  label: LabelInfo;
  /** Heading or legend of the section that contains the field. */
  section: string | null;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  constraints: Constraints;
  options: FieldOption[] | null;
  autocomplete: string | null;
  semantic: SemanticGuess;
  /** True when the field currently holds something. The value itself is deliberately NOT exposed. */
  hasValue: boolean;
}

export type ButtonIntent = "next" | "previous" | "dismiss" | "commit";
export type CommitKind = "submit" | "purchase" | "delete" | "sign" | "other";

export interface ButtonInfo {
  text: string;
  intent: ButtonIntent;
  commitKind: CommitKind | null;
  /** Why this intent was chosen ("unknown text: fail closed" when in doubt). */
  reason: string;
}

export interface ScanStats {
  fields: number;
  unlabeled: number;
  sharedLabels: number;
  secrets: number;
  skipped: number;
}

export interface ScanResult {
  fields: FormField[];
  buttons: ButtonInfo[];
  stats: ScanStats;
}

export interface ScanOptions {
  /** Access to closed shadow roots (in the extension: chrome.dom.openOrClosedShadowRoot). */
  getShadowRoot?: (el: Element) => ShadowRoot | null;
  /** Visibility test. Default: attribute-based heuristics (works without layout). In a browser pass a layout-based one. */
  isVisible?: (el: Element) => boolean;
  /** Include fields judged invisible (default false). */
  includeHidden?: boolean;
}
