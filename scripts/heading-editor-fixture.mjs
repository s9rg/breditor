// Public editor fixture for Playwright keyboard/toolbar and IndexedDB checks.
// This deliberately starts with only paragraphs in an explicit text-block profile.
import { BreditorBrowserEditor } from "../packages/breditor-browser/dist/browser_editor.js";
import { preflightWasmSemanticProfile } from "../packages/breditor-browser/dist/wasm_engine_bootstrap.js";
import { createToolbarManifest } from "../packages/breditor-browser/dist/toolbar_manifest.js";

export async function openHeadingEditorFixture(api, slot, editing) {
  const schema = { name: "example/heading-editor", version: 1 };
  const semanticProfile = { formatVersion: 3, bootstrapJson: JSON.stringify({
    format: "breditor/profile-bootstrap", formatVersion: 3, schema, extensions: [],
  }) };
  const preflight = preflightWasmSemanticProfile(api, semanticProfile);
  if (!preflight.ok) throw new Error(JSON.stringify(preflight.error));
  const host = document.createElement("div");
  host.id = "heading-editor";
  const toolbar = document.createElement("div");
  document.body.append(toolbar, host);
  const options = {
    host, label: "Heading editor", wasm: api, semanticProfile,
    keyboard: { editing, primaryModifier: "control", shortcuts: "enabled" },
    toolbar: { host: toolbar, manifest: createToolbarManifest({ label: "Heading controls", controls: [
      { kind: "button", stateId: "breditor/control-heading-2", label: "Heading 2", activation: "tracked",
        command: { kind: "intent", intentId: "breditor/format-heading-2" } },
      { kind: "button", stateId: "breditor/control-paragraph", label: "Paragraph", activation: "tracked",
        command: { kind: "intent", intentId: "breditor/format-paragraph" } },
      ...["undo", "redo"].map((operation) => ({ kind: "button", stateId: `breditor/control-${operation}`,
        label: operation, activation: "stateless", command: { kind: "history", operation } })),
    ] }) },
    persistence: { indexedDB, crypto: crypto.subtle, scope: { kind: "slot", name: slot } },
    initialDocument: { lineageId: slot, historyCapacity: 20, documentJson: JSON.stringify({
      format: "breditor/document", formatVersion: 2, schema, schemaFingerprint: preflight.profileDescriptor.schema.fingerprint,
      root: { kind: "element", type: "breditor/document", entityId: null, properties: {}, children: [
        { kind: "element", type: "breditor/paragraph", entityId: null, properties: {},
          children: [{ kind: "text", text: "a🙂b", formats: [] }] },
      ] },
    }) },
  };
  let editor;
  const open = async () => {
    const result = await BreditorBrowserEditor.open(options);
    if (!result.ok) throw new Error(`public heading open: ${JSON.stringify(result.error)}`);
    editor = result.editor;
  };
  try { await open(); } catch (error) { host.remove(); toolbar.remove(); throw error; }
  return {
    snapshot() { return editor.getSnapshot(); },
    ready() { return editor.exportContent("sessionCheckpointJson").ok; },
    export(format) {
      const result = editor.exportContent(format);
      if (!result.ok) throw new Error(`public heading export: ${JSON.stringify(result.error)}`);
      return result.value;
    },
    async reload() {
      const result = await editor.flushPersistence();
      if (result.status !== "committed") throw new Error(`heading flush: ${JSON.stringify(result)}`);
      editor.dispose();
      await open();
    },
    caret(offset) {
      host.focus();
      const text = host.firstChild.firstChild;
      const selection = document.getSelection();
      selection.setBaseAndExtent(text, offset, text, offset);
    },
    dispose() { editor.dispose(); host.remove(); toolbar.remove(); },
  };
}
