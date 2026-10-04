import { BreditorBrowserEditor } from "@breditor/browser";
import initialize, * as wasm from "@breditor/wasm";

const output = document.getElementById("result")!;
const host = document.getElementById("editor")!;
const toolbar = document.getElementById("toolbar")!;
const equal = (actual: unknown, expected: unknown): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Performance fixture correctness mismatch");
};
const element = (type: string, children: unknown[], properties = {}) => ({kind: "element", type: `breditor/${type}`, entityId: null, properties, children});
const schema = {name: "example/list-performance", version: 1};
const semanticProfile = {formatVersion: 4 as const, bootstrapJson: JSON.stringify({
  format: "breditor/profile-bootstrap", formatVersion: 4, schema, extensions: [],
})};
type Metrics = Record<string, number>;
let progress = "initialization";
const renderingTrace = new URLSearchParams(location.search).get("renderTrace") === "1";

void run().catch(error => { output.textContent = JSON.stringify({progress, error: String(error)}); output.dataset["status"] = "failed"; });
async function run(): Promise<void> {
  const initializeStart = performance.now(); await initialize();
  const initializationMs = performance.now() - initializeStart;
  const compiled = wasm.BreditorCompiledProfile.fromBootstrapJsonV4(semanticProfile.bootstrapJson);
  let fingerprint: string;
  try {
    const profile = compiled.takeProfile(); if (!profile) throw new Error("Profile compilation failed");
    try { const descriptor = profile.descriptor(); try {fingerprint = descriptor.schemaFingerprint;} finally {descriptor.free();} }
    finally {profile.free();}
  } finally {compiled.free();}
  const cases = [];
  // One untimed warm-up document, then three independent owners per size.
  await sample(5, fingerprint, -1);
  for (const items of [10, 100, 500]) {
    for (let repetition = 0; repetition < 3; repetition++) {
      cases.push(await sample(items, fingerprint, repetition));
      // Allow pending native selection notifications to drain between owners.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
  output.textContent = JSON.stringify({initializationMs, cases}); output.dataset["status"] = "passed";
}

async function sample(items: number, fingerprint: string, repetition: number) {
  progress = `${items} items, repetition ${repetition}: startup`;
  const metrics: Metrics = {};
  let owner: BreditorBrowserEditor | undefined;
  const text = (i: number) => `Item ${i}: A🙂 with enough text to measure a representative short list entry.`;
  const documentJson = JSON.stringify({format: "breditor/document", formatVersion: 2, schema, schemaFingerprint: fingerprint,
    root: element("document", [element("ordered-list", Array.from({length: items}, (_, i) => element("list-item", [
      element(i % 10 === 0 ? "heading" : "paragraph", [{kind: "text", text: text(i), formats: []}], i % 10 === 0 ? {"breditor/level": 2} : {}),
    ])), {"breditor/start": 7})]),
  });
  const options = {host, label: "List performance document", wasm, semanticProfile, toolbar: {host: toolbar},
    keyboard: {editing: "beforeinputPrimary" as const, primaryModifier: "control" as const, shortcuts: "enabled" as const}};
  const measured = <T>(name: string, action: () => T): T => {
    progress = `${items} items, repetition ${repetition}: ${name}`;
    const marker = renderingTrace ? `breditor-perf:${items}:${repetition}:${name}` : "";
    if (renderingTrace) performance.mark(`${marker}:start`);
    try {
      const before = performance.now(); const result = action(); host.getBoundingClientRect(); metrics[name] = performance.now() - before; return result;
    } finally {
      if (renderingTrace) performance.mark(`${marker}:end`);
    }
  };
  const exported = (format: "documentJson" | "sessionCheckpointJson" | "plainText") => {
    const value = owner!.exportContent(format);
    if (!value.ok) throw new Error(`${format}: ${JSON.stringify(value.error)}; owner=${JSON.stringify(owner!.getStatus())}`);
    return value.value;
  };
  const selected = () => {
    const checkpoint = JSON.parse(exported("sessionCheckpointJson"));
    return checkpoint.cursor === 0 ? checkpoint.historyBase.selection : checkpoint.entries[checkpoint.cursor - 1].resultSelection;
  };
  const history = (operation: "undo" | "redo") => {
    const button = toolbar.querySelector<HTMLButtonElement>(`[data-breditor-state-id="breditor/control-${operation}"]`)!;
    equal(button.getAttribute("aria-disabled"), "false"); button.click(); equal(owner!.getStatus().phase, "live");
  };
  try {
    let before = performance.now();
    const opened = await BreditorBrowserEditor.openFlatLists({...options,
      initialDocument: {lineageId: `perf-${items}-${repetition}`, historyCapacity: 20, documentJson}});
    if (!opened.ok) throw new Error(opened.error.code); owner = opened.editor;
    host.getBoundingClientRect(); metrics["startupMs"] = performance.now() - before;
    const middle = Math.floor(items / 2);
    measured("selectionMs", () => {
      owner!.focus(); const block = host.querySelectorAll("li")[middle]!.firstElementChild!;
      const range = document.createRange(); range.selectNodeContents(block); range.collapse(false);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    const original = exported("documentJson"), originalSelection = selected();
    measured("editMs", () => host.dispatchEvent(new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "X"})));
    equal(owner.getStatus().phase, "live"); equal(host.querySelectorAll("li")[middle]!.textContent, `${text(middle)}X`);
    const edited = exported("documentJson"), editedSelection = selected();
    measured("undoMs", () => history("undo")); equal(exported("documentJson"), original); equal(selected(), originalSelection);
    const backup = measured("checkpointMs", () => exported("sessionCheckpointJson"));
    const checkpointBytes = new TextEncoder().encode(backup).byteLength;
    measured("disposeMs", () => owner!.dispose()); equal(host.childNodes.length, 0);
    before = performance.now();
    progress = `${items} items, repetition ${repetition}: restore`;
    const restored = await BreditorBrowserEditor.openFlatLists({...options, initialSessionCheckpointJson: backup});
    if (!restored.ok) throw new Error(restored.error.code); owner = restored.editor;
    host.getBoundingClientRect(); metrics["restoreMs"] = performance.now() - before;
    equal(exported("documentJson"), original); equal(selected(), originalSelection);
    measured("redoMs", () => history("redo")); equal(exported("documentJson"), edited); equal(selected(), editedSelection);
    return {items, repetition, documentBytes: new TextEncoder().encode(documentJson).byteLength, checkpointBytes, metrics};
  } finally { owner?.dispose(); equal(host.childNodes.length, 0); equal(toolbar.childNodes.length, 0); }
}
