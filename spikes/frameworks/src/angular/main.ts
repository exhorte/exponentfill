// Throwaway Angular fixture, bundled by esbuild in JIT mode (no Angular CLI): enough to test how a filler interacts with
// Angular forms. Zone.js change detection on purpose: most existing Angular apps still run with it.
import "zone.js";
import "@angular/compiler";
import { Component, provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

@Component({
  selector: "app-root",
  imports: [FormsModule, ReactiveFormsModule],
  template: `
    <h1>Angular (template-driven + reactive)</h1>
    <h2>Template-driven (ngModel)</h2>
    <label for="first">First name</label>
    <input id="first" name="first" type="text" [(ngModel)]="td.first" />
    <label for="country">Country</label>
    <select id="country" name="country" [(ngModel)]="td.country">
      <option value="">Choose…</option><option value="FR">France</option><option value="SN">Senegal</option>
    </select>
    <label><input type="checkbox" name="news" [(ngModel)]="td.news" /> Newsletter</label>

    <h2>Reactive (FormGroup)</h2>
    <form [formGroup]="rf">
      <label for="email">Email</label>
      <input id="email" type="email" formControlName="email" />
      <label for="notes">Notes</label>
      <textarea id="notes" rows="3" formControlName="notes"></textarea>
    </form>

    <h2>Framework state</h2>
    <pre id="state">{{ json() }}</pre>
  `,
})
class App {
  td = { first: "", country: "", news: false };
  rf = new FormGroup({ email: new FormControl(""), notes: new FormControl("") });
  json() {
    return JSON.stringify({ ...this.td, ...this.rf.value });
  }
}

bootstrapApplication(App, { providers: [provideZoneChangeDetection({ eventCoalescing: true })] }).catch((e) => {
  document.body.insertAdjacentText("beforeend", "Angular bootstrap failed: " + e);
});
