// This fixture is copied outside the repository and imports only package roots.
import { BreditorBrowserEditor } from "@breditor/browser";
import initialize, * as wasm from "@breditor/wasm";

const output = document.getElementById("result")!;
function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
void start().catch(error => { output.textContent = String(error); output.setAttribute("data-status", "failed"); });
async function start(): Promise<void> {
  await initialize();
  const schema = {name: "example/packed-nested-lists", version: 1};
  const semanticProfile = {formatVersion: 5 as const, bootstrapJson: JSON.stringify({
    format: "breditor/profile-bootstrap", formatVersion: 5, schema, extensions: [],
  })};
  const compiled = wasm.BreditorCompiledProfile.fromBootstrapJsonV5(semanticProfile.bootstrapJson);
  let fingerprint: string;
  try {
    const profile = compiled.takeProfile();
    if (!profile) throw new Error("Profile compile failed");
    try {
      const descriptor = profile.descriptor();
      try { fingerprint = descriptor.schemaFingerprint; } finally { descriptor.free(); }
    } finally { profile.free(); }
  } finally { compiled.free(); }
  const text = (value: string) => ({kind: "text", text: value, formats: []});
  const element = (type: string, children: unknown[], properties = {}) => ({kind: "element", type: `breditor/${type}`, entityId: null, properties, children});
  const initialDocument = {lineageId: "packed-list-consumer", historyCapacity: 20, documentJson: JSON.stringify({
    format: "breditor/document", formatVersion: 2, schema, schemaFingerprint: fingerprint,
    root: element("document", [element("heading", [text("Packed 🙂")], {"breditor/level": 2}),
      element("ordered-list", [element("list-item", [element("paragraph", [text("First")])]),
        element("list-item", [element("paragraph", [text("Second")]),
          element("bullet-list", [element("list-item", [element("paragraph", [text("Deep 🙂")])])])])], {"breditor/start": 3})]),
  })};
  const options: Parameters<typeof BreditorBrowserEditor.openNestedLists>[0] = {
    host: document.getElementById("editor")!, label: "Packed list document", wasm, semanticProfile, initialDocument,
    toolbar: {host: document.getElementById("toolbar")!},
    keyboard: {editing: "beforeinputPrimary", primaryModifier: "control", shortcuts: "enabled"},
  };
  if (false) {
    // @ts-expect-error Ordinary package startup must not accept list-mode options.
    void BreditorBrowserEditor.open(options);
  }
  const opened = await BreditorBrowserEditor.openNestedLists(options);
  if (!opened.ok) throw new Error(opened.error.code);
  let owner = opened.editor;
  const exported = (format: "documentJson" | "sessionCheckpointJson" | "plainText") => {
    const result = owner.exportContent(format); if (!result.ok) throw new Error(result.error.code); return result.value;
  };
  try {
    equal(exported("plainText"), "Packed 🙂\nFirst\nSecond\nDeep 🙂");
    equal(options.host.querySelector("ol")?.getAttribute("start"), "3");
    equal(options.toolbar!.host.querySelectorAll("button").length, 16);
    owner.focus();
    const second = [...options.host.querySelectorAll("p")].find(p => p.textContent === "Second")!.firstChild!;
    getSelection()!.setBaseAndExtent(second, 2, second, 2);
    document.dispatchEvent(new Event("selectionchange"));
    const beforeIndent = exported("documentJson");
    equal(owner.executeIntent("breditor/indent-list-items").status, "committed");
    equal(options.host.querySelector("ol > li > ol > li > ul > li > p")?.textContent, "Deep 🙂");
    const indented = exported("documentJson");
    (options.toolbar!.host.querySelector('[data-breditor-state-id="breditor/control-undo"]') as HTMLButtonElement).click();
    equal(exported("documentJson"), beforeIndent);
    (options.toolbar!.host.querySelector('[data-breditor-state-id="breditor/control-redo"]') as HTMLButtonElement).click();
    equal(exported("documentJson"), indented);
    equal(owner.executeIntent("breditor/outdent-list-items").status, "committed");
    equal(exported("documentJson"), beforeIndent);
    const tab = new KeyboardEvent("keydown", {key: "Tab", code: "Tab", bubbles: true, cancelable: true});
    options.host.dispatchEvent(tab); equal(tab.defaultPrevented, true);
    equal(exported("documentJson"), indented);
    const outdent = new KeyboardEvent("keydown", {key: "Tab", code: "Tab", shiftKey: true, bubbles: true, cancelable: true});
    options.host.dispatchEvent(outdent); equal(outdent.defaultPrevented, true);
    equal(exported("documentJson"), beforeIndent);
    // Qualify formatting history inside a descendant using the installed
    // package, including pending redo across a fresh owner (not just live Undo).
    owner.focus();
    const deep = [...options.host.querySelectorAll("p")].find(p => p.textContent === "Deep 🙂")!.firstChild!;
    getSelection()!.setBaseAndExtent(deep, 7, deep, 0);
    document.dispatchEvent(new Event("selectionchange"));
    const bold = [...options.toolbar!.host.querySelectorAll("button")].find(button => button.textContent === "Bold")!;
    equal(bold.disabled, false); bold.click();
    equal(options.host.querySelector("ol > li > ul > li > p > strong")?.textContent, "Deep 🙂");
    const formatted = exported("documentJson");
    (options.toolbar!.host.querySelector('[data-breditor-state-id="breditor/control-undo"]') as HTMLButtonElement).click();
    equal(exported("documentJson"), beforeIndent);
    const formattingCheckpoint = exported("sessionCheckpointJson");
    owner.dispose();
    const {initialDocument: _formatFallback, persistence: _formatStorage,
      initialSessionCheckpointJson: _formatCheckpoint, ...formatRecovery} = options;
    const formattingRestored = await BreditorBrowserEditor.openNestedLists({...formatRecovery,
      initialSessionCheckpointJson: formattingCheckpoint});
    if (!formattingRestored.ok) throw new Error(formattingRestored.error.code);
    owner = formattingRestored.editor;
    equal(exported("sessionCheckpointJson"), formattingCheckpoint);
    (options.toolbar!.host.querySelector('[data-breditor-state-id="breditor/control-redo"]') as HTMLButtonElement).click();
    equal(exported("documentJson"), formatted);
    equal(options.host.querySelector("ol > li > ul > li > p > strong")?.textContent, "Deep 🙂");
    equal([getSelection()!.anchorNode?.textContent, getSelection()!.anchorOffset,
      getSelection()!.focusNode?.textContent, getSelection()!.focusOffset], ["Deep 🙂", 7, "Deep 🙂", 0]);
    (options.toolbar!.host.querySelector('[data-breditor-state-id="breditor/control-undo"]') as HTMLButtonElement).click();
    equal(exported("documentJson"), beforeIndent);
    owner.focus();
    const heading = options.host.querySelector("h2")!;
    const range = document.createRange(); range.selectNodeContents(heading);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    const original = exported("documentJson");
    equal(owner.executeIntent("breditor/format-bullet-list").status, "committed");
    equal(options.host.querySelector("ul li h2")?.textContent, "Packed 🙂");
    const changed = exported("documentJson");
    (options.toolbar!.host.querySelector('[data-breditor-state-id="breditor/control-undo"]') as HTMLButtonElement).click();
    equal(exported("documentJson"), original);
    const checkpoint = exported("sessionCheckpointJson"); equal(JSON.parse(checkpoint).formatVersion, 7);
    owner.dispose(); equal(options.host.childNodes.length, 0);
    const {initialDocument: _fallback, persistence: _storage, initialSessionCheckpointJson: _checkpoint, ...recovery} = options;
    const restored = await BreditorBrowserEditor.openNestedLists({...recovery, initialSessionCheckpointJson: checkpoint});
    if (!restored.ok) throw new Error(restored.error.code);
    owner = restored.editor; equal(exported("sessionCheckpointJson"), checkpoint);
    (options.toolbar!.host.querySelector('[data-breditor-state-id="breditor/control-redo"]') as HTMLButtonElement).click();
    equal(exported("documentJson"), changed);
    // A mixed structural/text/kind history must survive fresh-owner recovery at
    // every cursor, not only a checkpoint with one pending formatting redo.
    owner.dispose();
    const mixed = await BreditorBrowserEditor.openNestedLists(options);
    if (!mixed.ok) throw new Error(mixed.error.code);
    owner = mixed.editor;
    owner.focus();
    const mixedSecond = [...options.host.querySelectorAll("p")].find(p => p.textContent === "Second")!.firstChild!;
    getSelection()!.setBaseAndExtent(mixedSecond, 2, mixedSecond, 2);
    document.dispatchEvent(new Event("selectionchange"));
    const mixedState = () => {
      const checkpoint = JSON.parse(exported("sessionCheckpointJson"));
      const current = checkpoint.cursor === 0 ? checkpoint.historyBase : checkpoint.entries[checkpoint.cursor - 1];
      return {document: exported("documentJson"),
        selection: checkpoint.cursor === 0 ? current.selection : current.resultSelection,
        pendingFormats: checkpoint.cursor === 0 ? current.pendingFormats : current.resultPendingFormats};
    };
    const mixedStates = [mixedState()];
    for (const action of [
      () => equal(owner.executeIntent("breditor/indent-list-items").status, "committed"),
      () => options.host.dispatchEvent(new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "🙂"})),
      () => equal(owner.executeIntent("breditor/format-heading-3").status, "committed"),
      () => equal(owner.executeIntent("breditor/outdent-list-items").status, "committed"),
    ]) {
      action(); equal(owner.getStatus().phase, "live");
      mixedStates.push(mixedState());
      equal(JSON.parse(exported("sessionCheckpointJson")).cursor, mixedStates.length - 1);
    }
    equal(options.host.querySelector("ol > li:nth-child(2) > h3")?.textContent, "Se🙂cond");
    equal(options.host.querySelector("ol > li:nth-child(2) > ul > li > p")?.textContent, "Deep 🙂");
    const history = (operation: "undo" | "redo") => {
      const button = options.toolbar!.host.querySelector<HTMLButtonElement>(`[data-breditor-state-id="breditor/control-${operation}"]`)!;
      equal(button.disabled, false); button.click(); equal(owner.getStatus().phase, "live");
    };
    for (let cursor = 4; cursor >= 0; cursor--) {
      const saved = exported("sessionCheckpointJson");
      equal(JSON.parse(saved).cursor, cursor);
      owner.dispose();
      const reopened = await BreditorBrowserEditor.openNestedLists({...recovery, initialSessionCheckpointJson: saved});
      if (!reopened.ok) throw new Error(reopened.error.code);
      owner = reopened.editor;
      equal(exported("sessionCheckpointJson"), saved);
      equal(mixedState(), mixedStates[cursor]);
      for (let index = cursor + 1; index <= 4; index++) {history("redo"); equal(mixedState(), mixedStates[index]);}
      for (let index = 3; index >= cursor; index--) {history("undo"); equal(mixedState(), mixedStates[index]);}
      if (cursor > 0) {history("undo"); equal(mixedState(), mixedStates[cursor - 1]);}
    }
    if (new URL(location.href).searchParams.has("keyboardProbe")) {
      owner.dispose();
      const fresh = await BreditorBrowserEditor.openNestedLists(options);
      if (!fresh.ok) throw new Error(fresh.error.code);
      owner = fresh.editor;
      // Text inputs participate in Safari's default Tab navigation even when
      // platform settings omit buttons from the focus cycle.
      const after = document.createElement("input"); after.id = "after-editor"; after.setAttribute("aria-label", "After editor");
      document.body.append(after);
      const keys: Array<{key: string; trusted: boolean}> = [];
      options.host.addEventListener("keydown", event => { keys.push({key: event.key, trusted: event.isTrusted}); });
      try {
        await new Promise<void>(finish => {
          (globalThis as unknown as {nestedKeyboardProbe: unknown}).nestedKeyboardProbe = {
            select(value: string, offset: number) {
              owner.focus();
              const node = [...options.host.querySelectorAll("p,h2")].find(node => node.textContent === value)?.firstChild;
              if (!node) throw new Error("probe text missing");
              getSelection()!.setBaseAndExtent(node, offset, node, offset);
            },
            read() { return {document: exported("documentJson"), text: exported("plainText"), status: owner.getStatus(),
              active: document.activeElement?.id, keys: [...keys]}; },
            finish,
          };
          output.setAttribute("data-status", "keyboard-ready");
        });
      } finally { after.remove(); delete (globalThis as unknown as {nestedKeyboardProbe?: unknown}).nestedKeyboardProbe; }
    }
    output.textContent = "passed: packed imports, list toolbar, undo, V7 restore and redo";
    output.setAttribute("data-status", "passed");
  } finally { owner.dispose(); }
}
