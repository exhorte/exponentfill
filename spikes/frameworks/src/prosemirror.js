import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "prosemirror-schema-basic";

const out = document.getElementById("state");
const show = (state) => { out.textContent = JSON.stringify({ text: state.doc.textContent }); };
const view = new EditorView(document.getElementById("editor"), {
  state: EditorState.create({ schema }),
  dispatchTransaction(tr) {
    const next = view.state.apply(tr);
    view.updateState(next);
    show(next);
  },
});
show(view.state);
