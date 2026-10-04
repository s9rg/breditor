// High-level owner only: no generated handles, adapter, queue or renderer escape.
import { BreditorBrowserEditor } from "../packages/breditor-browser/src/browser_editor.ts";

const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`list editor owner: ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
};
const exported = (editor, format) => {
  const result = editor.exportContent(format); if (!result.ok) throw new Error(`${format}: ${result.error.code}`); return result.value;
};
const checkpoint = editor => JSON.parse(exported(editor, "sessionCheckpointJson"));
const selected = editor => {
  const saved = checkpoint(editor);
  return saved.cursor === 0 ? saved.historyBase.selection : saved.entries[saved.cursor - 1].resultSelection;
};
const root = editor => JSON.parse(exported(editor, "documentJson")).root;

export async function verifyFlatListEditorOwner(api, semanticProfile, documentJson, iteration) {
  const host = document.createElement("div"), toolbar = document.createElement("div");
  host.setAttribute("aria-label", "Original host"); document.body.append(host, toolbar);
  const common = {host, label: "List editor qualification", wasm: api, semanticProfile,
    keyboard: {editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled"}, toolbar: {host: toolbar}};
  const initialDocument = {lineageId: `list-owner-${iteration}`, documentJson, historyCapacity: 20};
  const persistence = {indexedDB, crypto: crypto.subtle, scope: {kind: "slot", name: `qualification.list-owner.${iteration}`}};
  let editor;
  const open = async source => {
    const result = await BreditorBrowserEditor.openFlatLists({...common, ...source});
    if (!result.ok) throw new Error(`owner startup: ${result.error.code}/${result.error.causeCode}`);
    editor = result.editor; equal(editor.getStatus(), {phase: "live"});
    equal(host.getAttribute("role"), "textbox"); equal(host.getAttribute("contenteditable"), "true");
    equal(toolbar.querySelectorAll("button").length, 14);
    return editor;
  };
  const click = state => {
    const button = toolbar.querySelector(`[data-breditor-state-id="breditor/control-${state}"]`);
    if (!button) throw new Error(`missing ${state}`);
    equal(button.getAttribute("aria-disabled"), "false"); button.focus(); button.click();
    equal(editor.getStatus(), {phase: "live"});
  };
  const dispose = () => {
    editor.dispose(); equal(editor.getStatus(), {phase: "disposed"});
    equal(host.childNodes.length, 0); equal(toolbar.childNodes.length, 0);
    equal(host.getAttribute("aria-label"), "Original host"); equal(host.hasAttribute("contenteditable"), false);
    editor = undefined;
  };
  try {
    await open({initialDocument, persistence});
    equal((await BreditorBrowserEditor.open({...common, initialDocument})).error?.code, "browser_editor.host_in_use");
    equal((await BreditorBrowserEditor.openFlatLists({...common, initialDocument})).error?.code, "browser_editor.host_in_use");
    equal(exported(editor, "plainText"), "A🙂\nB");
    equal(editor.focus(), true);
    const text = host.querySelector("h2").firstChild;
    document.getSelection().setBaseAndExtent(text, 3, text, 1);
    document.dispatchEvent(new Event("selectionchange"));
    const original = root(editor), originalSelection = selected(editor);
    equal(originalSelection.anchor.textPath, [0, 0, 0, 0]);
    equal(originalSelection.anchor.utf16Offset, 3); equal(originalSelection.focus.utf16Offset, 1);
    const before = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "漢\n字"});
    host.dispatchEvent(before); equal(before.defaultPrevented, true); equal(editor.getStatus(), {phase: "live"});
    equal(exported(editor, "plainText"), "A漢\n字\nB");
    const edited = root(editor), editedSelection = selected(editor);
    click("undo"); equal(root(editor), original); equal(selected(editor), originalSelection);
    equal(await editor.flushPersistence(), {status: "committed"});
    equal(editor.getSnapshot().persistence, {phase: "idle", dirty: false});
    dispose();

    await open({initialDocument: {...initialDocument, lineageId: "unused-fallback"}, persistence});
    equal(editor.getSnapshot().document.lineage, initialDocument.lineageId);
    equal(root(editor), original); equal(selected(editor), originalSelection);
    click("redo"); equal(root(editor), edited); equal(selected(editor), editedSelection);
    const backup = exported(editor, "sessionCheckpointJson"); equal(JSON.parse(backup).formatVersion, 6);
    dispose();

    await open({initialSessionCheckpointJson: backup});
    equal(root(editor), edited); equal(selected(editor), editedSelection);
    equal(await editor.flushPersistence(), {status: "disabled"});
    click("undo"); equal(root(editor), original); equal(selected(editor), originalSelection);
    equal(editor.executeIntent("breditor/format-bullet-list").status, "committed");
    if (!host.querySelector("ul")) throw new Error("list intent did not reach Rust");
    click("undo"); equal(root(editor), original); equal(selected(editor), originalSelection);
    equal(editor.executeIntentJson("breditor/format-bullet-list", "{}").reason, "inputNotAccepted");
    dispose();

    // Ordinary startup cannot silently select V4 from its supplied profile.
    equal((await BreditorBrowserEditor.open({...common, initialDocument})).error?.code, "browser_editor.invalid_options");
    equal(host.childNodes.length, 0); equal(toolbar.childNodes.length, 0);

    const add = Object.getOwnPropertyDescriptor(EventTarget.prototype, "addEventListener");
    const foreign = document.createElement("p"); foreign.textContent = "Application-owned content";
    let intercepted = false;
    Object.defineProperty(EventTarget.prototype, "addEventListener", {...add, value(type, listener, options) {
      const result = Reflect.apply(add.value, this, [type, listener, options]);
      if (this === host && type === "input" && !intercepted) {
        intercepted = true; host.append(foreign); throw new Error("injected partial listener installation");
      }
      return result;
    }});
    try {
      const failed = await BreditorBrowserEditor.openFlatLists({...common, initialSessionCheckpointJson: backup});
      equal(failed.error?.code, "browser_editor.setup_failed"); equal(intercepted, true);
    } finally { Object.defineProperty(EventTarget.prototype, "addEventListener", add); }
    equal(host.childNodes.length, 1); if (host.firstChild !== foreign) throw new Error("startup rollback removed foreign content");
    equal(toolbar.childNodes.length, 0); equal(host.getAttribute("aria-label"), "Original host");
    foreign.remove(); await open({initialSessionCheckpointJson: backup}); dispose();
  } finally { editor?.dispose(); host.remove(); toolbar.remove(); }
}
