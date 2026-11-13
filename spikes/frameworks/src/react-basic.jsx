import { createRoot } from "react-dom/client";
import { useState } from "react";

function App() {
  const [f, setF] = useState({ first: "", email: "", country: "", status: "", news: false, notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <h1>React (controlled inputs)</h1>
      <label htmlFor="first">First name</label>
      <input id="first" name="first" type="text" value={f.first} onChange={set("first")} />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" value={f.email} onChange={set("email")} />
      <label htmlFor="country">Country</label>
      <select id="country" name="country" value={f.country} onChange={set("country")}>
        <option value="">Choose…</option><option value="FR">France</option><option value="SN">Senegal</option>
      </select>
      <fieldset><legend>Status</legend>
        {["employed", "student"].map((s) => (
          <label key={s}><input type="radio" name="status" value={s} checked={f.status === s} onChange={set("status")} /> {s}</label>
        ))}
      </fieldset>
      <label><input type="checkbox" name="news" checked={f.news} onChange={set("news")} /> Newsletter</label>
      <label htmlFor="notes">Notes</label>
      <textarea id="notes" name="notes" value={f.notes} onChange={set("notes")} rows={3} />
      <h2>Framework state</h2>
      <pre id="state">{JSON.stringify(f)}</pre>
    </form>
  );
}
createRoot(document.getElementById("root")).render(<App />);
