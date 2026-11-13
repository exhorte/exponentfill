import Quill from "quill";
import "quill/dist/quill.snow.css";

const quill = new Quill("#editor", { theme: "snow", placeholder: "Cover letter…" });
const out = document.getElementById("state");
const show = () => { out.textContent = JSON.stringify({ text: quill.getText().replace(/\n$/, ""), length: quill.getLength() - 1 }); };
quill.on("text-change", show);
show();
