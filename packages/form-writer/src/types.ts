/** Kinds of widget the writer understands. */
export type WidgetKind =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "number"
  | "date"
  | "datetime-local"
  | "select"
  | "radio"
  | "checkbox"
  | "richtext"
  | "combobox"
  | "combobox-input"
  | "listbox"
  | "file"
  | "password"
  | "hidden"
  | "unknown";

/**
 * Machine-readable outcome codes. They never contain a value, so they are safe in the audit log.
 * The human `reason` of a result MAY quote a value: it is for the panel only, never stored.
 */
export type ResultCode =
  | "ok"
  | "already_correct"
  | "not_found"
  | "secret"
  | "hidden"
  | "disabled"
  | "read_only"
  | "file"
  | "commit_control"
  | "unsupported"
  | "no_option"
  | "ambiguous"
  | "placeholder_option"
  | "maxlength"
  | "invalid_value"
  | "not_a_date"
  | "readback_mismatch"
  | "not_selected"
  | "no_popup_options"
  | "still_open"
  | "label_not_shown"
  | "editor_refused"
  | "undo_unsupported"
  | "exception";

export type WriteStatus = "written" | "already-correct" | "failed" | "refused";

export interface WriteResult {
  status: WriteStatus;
  kind: WidgetKind;
  code: ResultCode;
  /** Human-readable, may quote a value. Never persisted. */
  reason?: string;
  /** A unique PARTIAL match was chosen in a combobox (still verified on screen). */
  partial?: boolean;
}

export interface WriteOptions {
  /** Restoring a previous state (undo): skip the validity check and the maxlength guard, the page held that state before. */
  restore?: boolean;
}
