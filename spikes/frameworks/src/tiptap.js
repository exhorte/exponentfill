import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

const out = document.getElementById("state");
const editor = new Editor({
  element: document.getElementById("editor"),
  extensions: [StarterKit],
  content: "<p></p>",
  onUpdate: ({ editor }) => { out.textContent = JSON.stringify({ text: editor.getText() }); },
});
out.textContent = JSON.stringify({ text: editor.getText() });
