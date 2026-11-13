// Throwaway S5 case list: what to write where, and what the PAGE'S OWN state must show afterwards.
// expect: "success" (default) | "failure" (an explicit failure is the CORRECT outcome) | "refusal" (the field must be refused).
// weak: truth is the DOM value of the same field (no framework state to consult): informative, not discriminating.
const eq = (v) => ({ equals: v });

export const PAGES = [
  { path: "/form-basic.html", cases: [
    { id: "basic.first", cat: "native", spec: { sel: "#first" }, value: "Zed", truth: { kind: "field", sel: "#first", ...eq("Zed") }, weak: true },
    { id: "basic.last", cat: "native", spec: { sel: "input[name=last_name]" }, value: "Ndiaye-Lé", truth: { kind: "field", sel: "input[name=last_name]", ...eq("Ndiaye-Lé") }, weak: true },
    { id: "basic.email", cat: "native", spec: { sel: "#email" }, value: "zed@example.com", truth: { kind: "field", sel: "#email", ...eq("zed@example.com") }, weak: true },
    { id: "basic.phone-formatted", cat: "native", spec: { sel: "#phone" }, value: "+33 6 12 34 56 78", truth: { kind: "field", sel: "#phone", canon: "tel", ...eq("+33 6 12 34 56 78") }, weak: true },
    { id: "basic.age", cat: "native", spec: { sel: "#age" }, value: "31", truth: { kind: "field", sel: "#age", ...eq("31") }, weak: true },
    { id: "basic.dob-iso", cat: "native-date", spec: { sel: "#dob" }, value: "1998-03-12", truth: { kind: "field", sel: "#dob", ...eq("1998-03-12") }, weak: true },
    { id: "basic.dob-dayfirst", cat: "native-date", spec: { sel: "#dob" }, value: "13/04/1999", truth: { kind: "field", sel: "#dob", ...eq("1999-04-13") }, weak: true },
    { id: "basic.country-label", cat: "native-choice", spec: { sel: "#country" }, value: "Senegal", truth: { kind: "field", sel: "#country", ...eq("SN") }, weak: true },
    { id: "basic.country-nomatch", cat: "native-choice", spec: { sel: "#country" }, value: "Atlantis", expect: "failure", truth: { kind: "field", sel: "#country", ...eq("Atlantis") }, weak: true },
    { id: "basic.status-radio", cat: "native-choice", spec: { sel: "input[name=status]" }, value: "student", truth: { kind: "checked", sel: "input[name=status][value=student]", ...eq(true) }, weak: true },
    { id: "basic.interest-checkbox", cat: "native-choice", spec: { sel: "input[name=interest][value=tech]" }, value: true, truth: { kind: "checked", sel: "input[name=interest][value=tech]", ...eq(true) }, weak: true },
    { id: "basic.notes-maxlength", cat: "native", spec: { sel: "#notes" }, value: "x".repeat(250), expect: "failure", truth: { kind: "field", sel: "#notes", ...eq("x".repeat(250)) }, weak: true },
    { id: "basic.password", cat: "guard", spec: { sel: "#pw" }, value: "hunter2", expect: "refusal", truth: { kind: "field", sel: "#pw", ...eq("hunter2") }, weak: true },
    { id: "basic.otp", cat: "guard", spec: { sel: "#otp" }, value: "123456", expect: "refusal", truth: { kind: "field", sel: "#otp", ...eq("123456") }, weak: true },
    { id: "basic.readonly", cat: "guard", spec: { sel: "#ro" }, value: "CHANGED", expect: "refusal", truth: { kind: "field", sel: "#ro", ...eq("CHANGED") }, weak: true },
    { id: "basic.disabled", cat: "guard", spec: { sel: "#dis" }, value: "CHANGED", expect: "refusal", truth: { kind: "field", sel: "#dis", ...eq("CHANGED") }, weak: true },
  ] },
  { path: "/form-fr.html", cases: [
    { id: "fr.arabic", cat: "unicode", spec: { sel: "#nom-ar" }, value: "محمد الأمين", truth: { kind: "field", sel: "#nom-ar", ...eq("محمد الأمين") }, weak: true },
    { id: "fr.cyrillic", cat: "unicode", spec: { sel: "#prenom" }, value: "Иван Петров", truth: { kind: "field", sel: "#prenom", ...eq("Иван Петров") }, weak: true },
    { id: "fr.cjk", cat: "unicode", spec: { sel: "#lieu" }, value: "李雷 東京", truth: { kind: "field", sel: "#lieu", ...eq("李雷 東京") }, weak: true },
    { id: "fr.accents", cat: "unicode", spec: { sel: "#nom" }, value: "Éloïse Œuvre-Ñandú", truth: { kind: "field", sel: "#nom", ...eq("Éloïse Œuvre-Ñandú") }, weak: true },
    { id: "fr.civilite", cat: "native-choice", spec: { sel: "#civ" }, value: "madame", truth: { kind: "field", sel: "#civ", ...eq("Madame") }, weak: true },
    { id: "fr.naissance-text", cat: "native-date", spec: { sel: "#nais" }, value: "12/03/1998", truth: { kind: "field", sel: "#nais", ...eq("12/03/1998") }, weak: true },
  ] },
  { path: "/form-combobox.html", cases: [
    { id: "combo.city-exact", cat: "combobox-aria", spec: { sel: "#city-input" }, value: "Dakar", truth: { kind: "dom", sel: "#city-out", ...eq("Dakar") } },
    { id: "combo.city-unique-partial", cat: "combobox-aria", spec: { sel: "#city-input" }, value: "Thi", truth: { kind: "dom", sel: "#city-out", ...eq("Thiès") } },
    { id: "combo.city-ambiguous", cat: "combobox-aria", spec: { sel: "#city-input" }, value: "Pa", expect: "failure", truth: { kind: "dom", sel: "#city-out", contains: "Pa" } },
    { id: "combo.city-nomatch", cat: "combobox-aria", spec: { sel: "#city-input" }, value: "Zzzzzz", expect: "failure", truth: { kind: "dom", sel: "#city-out", contains: "Zzzzzz" } },
    { id: "combo.listbox-div", cat: "combobox-aria", spec: { sel: "#lang" }, value: "English", truth: { kind: "dom", sel: "#lang-out", ...eq("English") } },
    { id: "combo.datalist", cat: "native", spec: { sel: "#airport" }, value: "DSS", truth: { kind: "field", sel: "#airport", ...eq("DSS") }, weak: true },
    { id: "combo.datetime-local", cat: "native-date", spec: { sel: "#d1" }, value: "2026-12-01T09:30", truth: { kind: "field", sel: "#d1", ...eq("2026-12-01T09:30") }, weak: true },
  ] },
  { path: "/shadow-closed.html", cases: [
    { id: "shadow.closed-1", cat: "shadow", spec: { host: ["#host1"], sel: "input" }, value: "ACME SARL", truth: { kind: "dom", sel: "#readout", ...eq("company = ACME SARL") } },
    { id: "shadow.closed-2", cat: "shadow", spec: { host: ["#host2"], sel: "input" }, value: "FR 12 345 678 901", truth: { kind: "dom", sel: "#readout", ...eq("tax = FR 12 345 678 901") } },
  ] },
  { path: "/shadow-open.html", cases: [
    { id: "shadow.open", cat: "shadow", spec: { host: ["#open1"], sel: "input" }, value: "Open value", truth: { kind: "dom", sel: "#readout", ...eq("open_field = Open value") } },
    { id: "shadow.nested", cat: "shadow", spec: { host: ["#nested1", "ef-inner"], sel: "input" }, value: "Nested value", truth: { kind: "dom", sel: "#readout", ...eq("nested_field = Nested value") } },
  ] },
  { path: "/richtext.html", cases: [
    { id: "rich.contenteditable", cat: "richtext", spec: { sel: "#editor" }, value: "Dear team, I am applying", truth: { kind: "dom", sel: "#count", ...eq("24") } },
  ] },
  { path: "/fx/pages/react-basic.html", cases: [
    { id: "react.first", cat: "react", spec: { sel: "#first" }, value: "Zed", truth: { kind: "state", key: "first", ...eq("Zed") } },
    { id: "react.email", cat: "react", spec: { sel: "#email" }, value: "z@example.com", truth: { kind: "state", key: "email", ...eq("z@example.com") } },
    { id: "react.country", cat: "react", spec: { sel: "#country" }, value: "Senegal", truth: { kind: "state", key: "country", ...eq("SN") } },
    { id: "react.status", cat: "react", spec: { sel: "input[name=status]" }, value: "student", truth: { kind: "state", key: "status", ...eq("student") } },
    { id: "react.news", cat: "react", spec: { sel: "input[name=news]" }, value: true, truth: { kind: "state", key: "news", ...eq(true) } },
    { id: "react.notes", cat: "react", spec: { sel: "#notes" }, value: "Hello notes", truth: { kind: "state", key: "notes", ...eq("Hello notes") } },
  ] },
  { path: "/fx/pages/vue-basic.html", cases: [
    { id: "vue.first", cat: "vue", spec: { sel: "#first" }, value: "Zed", truth: { kind: "state", key: "first", ...eq("Zed") } },
    { id: "vue.country", cat: "vue", spec: { sel: "#country" }, value: "France", truth: { kind: "state", key: "country", ...eq("FR") } },
    { id: "vue.status", cat: "vue", spec: { sel: "input[name=status]" }, value: "student", truth: { kind: "state", key: "status", ...eq("student") } },
    { id: "vue.news", cat: "vue", spec: { sel: "input[name=news]" }, value: true, truth: { kind: "state", key: "news", ...eq(true) } },
    { id: "vue.lazy", cat: "vue", spec: { sel: "#lazy" }, value: "lazy value", truth: { kind: "state", key: "lazy", ...eq("lazy value") } },
  ] },
  { path: "/fx/angular-basic.html", cases: [
    { id: "angular.first", cat: "angular", spec: { sel: "#first" }, value: "Zed", truth: { kind: "state", key: "first", ...eq("Zed") } },
    { id: "angular.country", cat: "angular", spec: { sel: "#country" }, value: "Senegal", truth: { kind: "state", key: "country", ...eq("SN") } },
    { id: "angular.news", cat: "angular", spec: { sel: "input[name=news]" }, value: true, truth: { kind: "state", key: "news", ...eq(true) } },
    { id: "angular.email", cat: "angular", spec: { sel: "#email" }, value: "z@example.com", truth: { kind: "state", key: "email", ...eq("z@example.com") } },
    { id: "angular.notes", cat: "angular", spec: { sel: "#notes" }, value: "Hello notes", truth: { kind: "state", key: "notes", ...eq("Hello notes") } },
  ] },
  { path: "/fx/pages/react-mui.html", cases: [
    { id: "mui.name", cat: "mui", spec: { sel: "#mui-name" }, value: "Zed", truth: { kind: "state", key: "name", ...eq("Zed") } },
    { id: "mui.select", cat: "mui", spec: { sel: "#mui-country" }, value: "Senegal", truth: { kind: "state", key: "country", ...eq("SN") } },
    { id: "mui.autocomplete", cat: "mui", spec: { sel: "#mui-city" }, value: "Dakar", truth: { kind: "state", key: "city", ...eq("Dakar") } },
    { id: "mui.datepicker", cat: "mui", spec: { sel: "input[aria-hidden=true]:not(.MuiSelect-nativeInput)" }, value: "03/12/1998", truth: { kind: "state", key: "date", ...eq("1998-03-12") } },
  ] },
  { path: "/fx/pages/react-select.html", cases: [
    { id: "rs.single", cat: "react-select", spec: { sel: "#rs-country" }, value: "Sénégal", truth: { kind: "state", key: "country", ...eq("SN") } },
    { id: "rs.single-unaccented", cat: "react-select", spec: { sel: "#rs-country" }, value: "Canada", truth: { kind: "state", key: "country", ...eq("CA") } },
    { id: "rs.multi", cat: "react-select", spec: { sel: "#rs-lang" }, value: "English", truth: { kind: "state", key: "langs", includes: "en" } },
  ] },
  { path: "/fx/pages/antd.html", cases: [
    { id: "antd.name", cat: "antd", spec: { sel: "#name" }, value: "Zed", truth: { kind: "state", key: "name", ...eq("Zed") } },
    { id: "antd.select", cat: "antd", spec: { sel: "#country" }, value: "Sénégal", truth: { kind: "state", key: "country", ...eq("SN") } },
    { id: "antd.date", cat: "antd", spec: { sel: "#birth" }, value: "1998-03-12", truth: { kind: "state", key: "birth", ...eq("1998-03-12") } },
    { id: "antd.radio", cat: "antd", spec: { sel: "input[type=radio][value=student]" }, value: "student", truth: { kind: "state", key: "status", ...eq("student") } },
  ] },
  { path: "/fx/pages/quill.html", cases: [
    { id: "quill.write", cat: "editors", spec: { sel: ".ql-editor" }, value: "Hello letter", truth: { kind: "state-text", contains: "Hello letter" } },
  ] },
  { path: "/fx/pages/tiptap.html", cases: [
    { id: "tiptap.write", cat: "editors", spec: { sel: ".ProseMirror" }, value: "Hello letter", truth: { kind: "state-text", contains: "Hello letter" } },
  ] },
  { path: "/fx/pages/prosemirror.html", cases: [
    { id: "prosemirror.write", cat: "editors", spec: { sel: ".ProseMirror" }, value: "Hello letter", truth: { kind: "state-text", contains: "Hello letter" } },
  ] },
];

/** Does the page-owned truth match what we meant to write? (canonical comparison for dates/phones) */
export function truthMatches(actual, t, canonical) {
  if (actual === undefined || actual === null) return false;
  if (t.includes !== undefined) return Array.isArray(actual) ? actual.includes(t.includes) : String(actual).includes(String(t.includes));
  if (t.contains !== undefined) return String(actual).includes(String(t.contains));
  if (typeof t.equals === "boolean") return actual === t.equals;
  const norm = (v) => (t.canon ? canonical(t.canon, String(v)) : String(v));
  return norm(actual) === norm(t.equals);
}

export function classify(c, writer, truthOk) {
  const expect = c.expect || "success";
  const claimed = writer.status === "written" || writer.status === "already-correct";
  if (expect === "refusal") return writer.status === "refused" && !truthOk ? "refusal-ok" : "REFUSAL-VIOLATION";
  if (expect === "failure") {
    if (writer.status === "failed" && !truthOk) return "expected-failure-ok";
    return claimed && !truthOk ? "SILENT-FAILURE" : "unexpected-success";
  }
  if (claimed && truthOk) return "success";
  if (claimed && !truthOk) return "SILENT-FAILURE";
  if (!claimed && truthOk) return "false-negative";
  return "explicit-failure";
}
