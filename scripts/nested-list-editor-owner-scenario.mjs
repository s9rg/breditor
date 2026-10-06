// Real editor owner and DOM with generated Wasm; synthetic events are not native qualification.
import { BreditorBrowserEditor } from "../packages/breditor-browser/src/browser_editor.ts";
import { createKeyboardShortcutManifest, DEFAULT_KEYBOARD_SHORTCUT_MANIFEST } from "../packages/breditor-browser/src/keyboard_shortcut_manifest.ts";

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
    keyboardShortcuts: createKeyboardShortcutManifest({shortcuts: [...DEFAULT_KEYBOARD_SHORTCUT_MANIFEST.shortcuts,
      {stateId: "breditor/control-indent-list-items", chords: [{code: "KeyI", shift: false}]},
      {stateId: "breditor/control-outdent-list-items", chords: [{code: "KeyI", shift: true}]},
    ]}),
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
  const select = (value, offset, notify = true) => {
    editor.focus(); const text = [...host.querySelectorAll("p")].find(p => p.textContent === value)?.firstChild;
    if (!text) throw new Error(`missing text ${value}`);
    getSelection().setBaseAndExtent(text, offset, text, offset);
    if (notify) document.dispatchEvent(new Event("selectionchange"));
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
    const retainedRoot = host.firstElementChild;
    const retainedChild = [...host.querySelectorAll("p")].find(p => p.textContent === "child");
    const retainedOther = [...host.querySelectorAll("p")].find(p => p.textContent === "one");
    const assertTextRefresh = () => {
      if (!retainedRoot || !retainedChild || !retainedOther || host.firstElementChild !== retainedRoot ||
          !host.contains(retainedChild) || !host.contains(retainedOther)) {
        throw new Error("Nested text edit/history rebuilt stable list topology");
      }
    };
    const event = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "🙂"});
    host.dispatchEvent(event); equal(event.defaultPrevented, true); equal(exported("plainText"), "one\ntwo\nchild🙂");
    assertTextRefresh();
    const typed = exported("documentJson"), typedSelection = selected();
    click("undo"); equal(exported("documentJson"), preTyping); equal(selected(), preTypingSelection);
    assertTextRefresh();
    click("redo"); equal(exported("documentJson"), typed); equal(selected(), typedSelection);
    assertTextRefresh();
    // Host-configured physical-code shortcuts must preserve the deep selection.
    const key = (code, shiftKey = false, repeat = false, isComposing = false) => {
      editor.focus();
      const event = new KeyboardEvent("keydown", {bubbles: true, cancelable: true,
        key: code === "KeyI" ? "i" : "z", code, ctrlKey: true, shiftKey, repeat, isComposing});
      host.dispatchEvent(event); equal(editor.getStatus(), {phase: "live"}); return event;
    };
    select("two", 1); const keyBefore = exported("documentJson"), keySelection = selected();
    equal(key("KeyI").defaultPrevented, true); const keyIndented = exported("documentJson"), keyIndentedSelection = selected();
    equal(keyIndentedSelection.anchor.textPath.length, keySelection.anchor.textPath.length + 2);
    equal(key("KeyI", false, true).defaultPrevented, true); equal(exported("documentJson"), keyIndented);
    equal(key("KeyI", true, false, true).defaultPrevented, false); equal(exported("documentJson"), keyIndented);
    equal(key("KeyZ").defaultPrevented, true); equal(exported("documentJson"), keyBefore); equal(selected(), keySelection);
    equal(key("KeyZ", true).defaultPrevented, true); equal(exported("documentJson"), keyIndented); equal(selected(), keyIndentedSelection);
    equal(key("KeyI", true).defaultPrevented, true); equal(exported("documentJson"), keyBefore);
    const tab = (shiftKey = false, repeat = false) => {
      const event = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Tab", code: "Tab", shiftKey, repeat});
      host.dispatchEvent(event); equal(editor.getStatus(), {phase: "live"}); return event.defaultPrevented;
    };
    equal(tab(), true); equal(exported("documentJson"), keyIndented);
    equal(tab(true, true), true); equal(exported("documentJson"), keyIndented);
    equal(tab(true), true); equal(exported("documentJson"), keyBefore);
    // Move the DOM caret without letting selectionchange update Rust first.
    select("one", 1, false); equal(tab(), false); equal(exported("documentJson"), keyBefore);
    equal(tab(true), false); equal(exported("documentJson"), keyBefore);
    select("two", 1, false);
    equal(tab(), true);
    equal(exported("documentJson"), keyIndented);
    click("undo"); equal(exported("documentJson"), keyBefore); equal(selected(), keySelection);
    select("child🙂", 5);
    const pasteBefore = exported("documentJson"), pasteSelection = selected();
    const transfer = new DataTransfer(); transfer.setData("text/plain", "日本\r\nnext");
    transfer.setData("text/html", "<h1>must not import</h1>");
    const paste = new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData: transfer});
    // Firefox allocates its own synthetic event store rather than retaining the supplied one.
    paste.clipboardData.setData("text/plain", "日本\r\nnext");
    paste.clipboardData.setData("text/html", "<h1>must not import</h1>");
    equal(paste.clipboardData.getData("text/plain"), "日本\r\nnext");
    host.dispatchEvent(paste); equal(paste.defaultPrevented, true); equal(editor.getStatus(), {phase: "live"});
    equal(exported("plainText"), "one\ntwo\nchild日本\nnext🙂");
    const pasted = exported("documentJson"), pastedSelection = selected();
    click("undo"); equal(exported("documentJson"), pasteBefore); equal(selected(), pasteSelection);
    click("redo"); equal(exported("documentJson"), pasted); equal(selected(), pastedSelection);
    // A DOM-only paragraph caret and a host-disabled shortcut policy retain Tab.
    editor.dispose(); equal(host.childNodes.length, 0); equal(toolbar.childNodes.length, 0);
    const bare = JSON.parse(initialDocument.documentJson); bare.root = element("document", [paragraph("outside")]);
    await open({initialDocument: {...initialDocument, documentJson: JSON.stringify(bare)}});
    select("outside", 2, false); equal(tab(), false); equal(tab(true), false);
    equal(exported("plainText"), "outside"); editor.dispose();
    await open({initialDocument, keyboard: {...common.keyboard, shortcuts: "disabled"}});
    select("two", 1, false); equal(tab(), false); equal(exported("documentJson"), initialDocument.documentJson);
    editor.dispose();
    return {status: "passed", scope: "real editor DOM/default toolbar, configured nesting/history shortcuts, repeat/composition guards, deep typing/plain-text paste, exact undo/redo and V7 recovery; synthetic events"};
  } finally { editor?.dispose(); host.remove(); toolbar.remove(); }
}
