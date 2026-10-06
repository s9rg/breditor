// Real editor owner and DOM with generated Wasm; synthetic events are not native qualification.
import { BreditorBrowserEditor } from "../packages/breditor-browser/src/browser_editor.ts";

export async function verifyNestedListEditorOwner(api) {
  const equal = (actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`nested owner: ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
  };
  const schema = {name: "example/nested-owner", version: 1};
  const semanticProfile = {formatVersion: 5, bootstrapJson: JSON.stringify({format: "breditor/profile-bootstrap", formatVersion: 5, schema, extensions: []})};
  const compiled = api.BreditorCompiledProfile.fromBootstrapJsonV5(semanticProfile.bootstrapJson);
  let fingerprint;
  try {
    const profile = compiled.takeProfile();
    try { const descriptor = profile.descriptor(); try { fingerprint = descriptor.schemaFingerprint; } finally { descriptor.free(); } }
    finally { profile.free(); }
  } finally { compiled.free(); }
  const element = (type, children, properties = {}) => ({kind: "element", type: `breditor/${type}`, entityId: null, properties, children});
  const paragraph = text => element("paragraph", [{kind: "text", text, formats: []}]);
  const initialDocument = {lineageId: "nested-owner", historyCapacity: 30, documentJson: JSON.stringify({
    format: "breditor/document", formatVersion: 2, schema, schemaFingerprint: fingerprint,
    root: element("document", [element("bullet-list", [element("list-item", [paragraph("one")]),
      element("list-item", [paragraph("two"), element("ordered-list", [element("list-item", [paragraph("child")])], {"breditor/start": 8})])])]),
  })};
  const host = document.createElement("div"), toolbar = document.createElement("div");
  document.body.append(host, toolbar);
  const common = {host, label: "Nested owner qualification", wasm: api, semanticProfile, toolbar: {host: toolbar},
    keyboard: {editing: "beforeinputPrimary", primaryModifier: "control", shortcuts: "enabled"}};
  let editor;
  const exported = format => { const result = editor.exportContent(format); if (!result.ok) throw new Error(result.error.code); return result.value; };
  const selected = () => { const saved = JSON.parse(exported("sessionCheckpointJson")); return saved.cursor === 0 ? saved.historyBase.selection : saved.entries[saved.cursor - 1].resultSelection; };
  const open = async source => {
    const result = await BreditorBrowserEditor.openNestedLists({...common, ...source});
    if (!result.ok) throw new Error(`nested startup: ${result.error.code}/${result.error.causeCode}`);
    editor = result.editor; equal(editor.getStatus(), {phase: "live"}); equal(toolbar.querySelectorAll("button").length, 16);
  };
  const click = name => {
    const button = toolbar.querySelector(`[data-breditor-state-id="breditor/control-${name}"]`);
    if (!button) throw new Error(`missing ${name}`);
    equal(button.getAttribute("aria-disabled"), "false"); button.focus(); button.click(); equal(editor.getStatus(), {phase: "live"});
  };
  const select = (value, offset) => {
    editor.focus(); const text = [...host.querySelectorAll("p")].find(p => p.textContent === value)?.firstChild;
    if (!text) throw new Error(`missing text ${value}`);
    getSelection().setBaseAndExtent(text, offset, text, offset); document.dispatchEvent(new Event("selectionchange"));
  };
  try {
    await open({initialDocument}); equal(exported("plainText"), "one\ntwo\nchild");
    equal(host.querySelector("ol").getAttribute("start"), "8"); select("two", 1);
    const before = exported("documentJson"), beforeSelection = selected();
    click("indent-list-items"); const indented = exported("documentJson"), indentedSelection = selected();
    equal(host.querySelectorAll("ul > li").length, 2);
    equal(indentedSelection.anchor.textPath.length, beforeSelection.anchor.textPath.length + 2);
    click("undo"); equal(exported("documentJson"), before); equal(selected(), beforeSelection);
    const checkpoint = exported("sessionCheckpointJson"); equal(JSON.parse(checkpoint).formatVersion, 7);
    editor.dispose(); await open({initialSessionCheckpointJson: checkpoint});
    equal(exported("sessionCheckpointJson"), checkpoint); click("redo");
    equal(exported("documentJson"), indented); equal(selected(), indentedSelection);
    click("outdent-list-items"); equal(exported("documentJson"), before);
    select("child", 5); const preTyping = exported("documentJson"), preTypingSelection = selected();
    const event = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "🙂"});
    host.dispatchEvent(event); equal(event.defaultPrevented, true); equal(exported("plainText"), "one\ntwo\nchild🙂");
    const typed = exported("documentJson"), typedSelection = selected();
    click("undo"); equal(exported("documentJson"), preTyping); equal(selected(), preTypingSelection);
    click("redo"); equal(exported("documentJson"), typed); equal(selected(), typedSelection);
    editor.dispose(); equal(host.childNodes.length, 0); equal(toolbar.childNodes.length, 0);
    return {status: "passed", scope: "real editor DOM/default toolbar, indent/outdent, deep typing, exact undo/redo and V7 owner recovery; synthetic events"};
  } finally { editor?.dispose(); host.remove(); toolbar.remove(); }
}
