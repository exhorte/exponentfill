import { createRoot } from "react-dom/client";
import { useState } from "react";
import Select from "react-select";

const countries = [{ value: "FR", label: "France" }, { value: "SN", label: "Sénégal" }, { value: "CA", label: "Canada" }, { value: "DE", label: "Allemagne" }];
const langs = [{ value: "fr", label: "Français" }, { value: "en", label: "English" }, { value: "wo", label: "Wolof" }];

function App() {
  const [country, setCountry] = useState(null);
  const [lang, setLang] = useState([]);
  const state = { country: country?.value ?? null, langs: lang.map((l) => l.value) };
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <h1>react-select</h1>
      <label htmlFor="rs-country">Country (single, searchable)</label>
      <Select inputId="rs-country" options={countries} value={country} onChange={setCountry} isClearable />
      <label htmlFor="rs-lang">Languages (multi)</label>
      <Select inputId="rs-lang" isMulti options={langs} value={lang} onChange={(v) => setLang([...v])} />
      <h2>Framework state</h2>
      <pre id="state">{JSON.stringify(state)}</pre>
    </form>
  );
}
createRoot(document.getElementById("root")).render(<App />);
