import { BreditorBrowserEditor, createInlineFormatRenderManifest } from "@breditor/browser";
import initialize, * as wasm from "@breditor/wasm";

const output = document.getElementById("result")!;
const host = document.getElementById("editor")!;
const toolbar = document.getElementById("toolbar")!;
const equal = (actual: unknown, expected: unknown, label = "assertion"): void => {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`Performance fixture correctness mismatch (${label}): actual=${a?.slice(0, 1024)} expected=${b?.slice(0, 1024)}`);
};
const element = (type: string, children: unknown[], properties = {}) => ({kind: "element", type: `breditor/${type}`, entityId: null, properties, children});
const schema = {name: "example/list-performance", version: 1};
const propertyFormats = new URLSearchParams(location.search).get("propertyFormats") === "1";
const semanticProfile = {formatVersion: 5 as const, bootstrapJson: JSON.stringify({
  format: "breditor/profile-bootstrap", formatVersion: 5, schema, extensions: propertyFormats ? [{
    id: {name: "example/annotation-extension", version: 1}, dependencies: [], conflicts: [],
    inlineFormats: [{kind: "example/link", revision: 1}],
    inlineFormatPropertyContracts: [{formatKind: "example/link", properties: [
      {name: "example/href", presence: "required", valueType: {kind: "string", minimumUtf8Bytes: 1, maximumUtf8Bytes: 2048}},
      {name: "example/open-in-new-window", presence: "required", valueType: {kind: "boolean"}},
    ]}], inlineFormatToggles: [], inlineFormatSets: [],
  }] : [],
})};
type Metrics = Record<string, number>;
let progress = "initialization";
const renderingTrace = new URLSearchParams(location.search).get("renderTrace") === "1";
const editTarget = new URLSearchParams(location.search).get("editTarget") ?? "root";
const formatted = new URLSearchParams(location.search).get("formatted") === "1";
const formats = () => formatted ? [{type: "breditor/strong", properties: {}}, ...(propertyFormats ? [{
  type: "example/link", properties: {"example/href": "https://example.test/", "example/open-in-new-window": false},
}] : [])] : [];
const rendering = () => createInlineFormatRenderManifest({recipes: [
  {formatKind: "breditor/strong", element: "strong"},
  {formatKind: "example/link", element: "a", classes: ["breditor-link"], attributes: {kind: "safeLinkV1", hrefProperty: "example/href", openInNewWindowProperty: "example/open-in-new-window"}},
]});

void run().catch(error => { output.textContent = JSON.stringify({progress, error: String(error)}); output.dataset["status"] = "failed"; });
async function run(): Promise<void> {
  if (editTarget !== "root" && editTarget !== "grandchild") throw new Error("Invalid edit target");
  const initializeStart = performance.now(); await initialize();
  const initializationMs = performance.now() - initializeStart;
  const compiled = wasm.BreditorCompiledProfile.fromBootstrapJsonV5(semanticProfile.bootstrapJson);
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
      element(i % 10 === 0 ? "heading" : "paragraph", [{kind: "text", text: text(i), formats: formats()}], i % 10 === 0 ? {"breditor/level": 2} : {}),
      ...(i % 10 === 0 ? [element("bullet-list", [element("list-item", [
        element("paragraph", [{kind: "text", text: `Child ${i}`, formats: formats()}]),
        element("ordered-list", [element("list-item", [element("paragraph", [{kind: "text", text: `Grandchild ${i}`, formats: formats()}])])], {"breditor/start": 4}),
      ])])] : []),
    ])), {"breditor/start": 7})]),
  });
  const options = {host, label: "List performance document", wasm, semanticProfile, ...(propertyFormats ? {rendering: rendering()} : {}), toolbar: {host: toolbar},
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
    equal(button.getAttribute("aria-disabled"), "false", `${operation} enabled`);
    button.click();
    const status = owner!.getStatus();
    equal(status.phase, "live", `${operation} owner: ${JSON.stringify(status)}`);
  };
  try {
    let before = performance.now();
    const opened = await BreditorBrowserEditor.openNestedLists({...options,
      initialDocument: {lineageId: `perf-${items}-${repetition}`, historyCapacity: 20, documentJson}});
    if (!opened.ok) throw new Error(opened.error.code); owner = opened.editor;
    host.getBoundingClientRect(); metrics["startupMs"] = performance.now() - before;
    const middle = Math.floor(items / 2);
    const targetText = editTarget === "grandchild" ? `Grandchild ${Math.floor(middle / 10) * 10}` : text(middle);
    measured("selectionMs", () => {
      owner!.focus(); const block = [...host.querySelectorAll("p,h2")].find(block => block.textContent === targetText);
      if (!block) throw new Error(`Missing ${editTarget} edit target`);
      const range = document.createRange(); range.selectNodeContents(block); range.collapse(false);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    const original = exported("documentJson"), originalSelection = selected();
    measured("editMs", () => host.dispatchEvent(new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "X"})));
    equal(owner.getStatus().phase, "live", "owner after edit");
    const expectedText = `${targetText}X`;
    const matches = [...host.querySelectorAll("p,h2")].filter(block => block.textContent === expectedText).length;
    try { equal(matches, 1, "edited block count"); }
    catch (error) {
      throw new Error(`${String(error)}; context=${JSON.stringify({expectedText, originalSelection,
        currentSelection: selected(), status: owner.getStatus(),
        matchingPrefix: [...host.querySelectorAll("p,h2")].map(block => block.textContent).filter(value => value?.startsWith(targetText.slice(0, 12))).slice(0, 4),
      }).slice(0, 4096)}`);
    }
    const edited = exported("documentJson"), editedSelection = selected();
    if (formatted) {
      const verifyFormats = (node: {kind: string; formats?: unknown; children?: unknown[]}) => {
        if (node.kind === "text") equal(node.formats, formats(), "strong format retained after edit");
        for (const child of node.children ?? []) verifyFormats(child as typeof node);
      };
      verifyFormats(JSON.parse(edited).root);
    }
    measured("undoMs", () => history("undo")); equal(exported("documentJson"), original); equal(selected(), originalSelection);
    const backup = measured("checkpointMs", () => exported("sessionCheckpointJson"));
    const checkpointBytes = new TextEncoder().encode(backup).byteLength;
    measured("disposeMs", () => owner!.dispose()); equal(host.childNodes.length, 0);
    before = performance.now();
    progress = `${items} items, repetition ${repetition}: restore`;
    const restored = await BreditorBrowserEditor.openNestedLists({...options, initialSessionCheckpointJson: backup});
    if (!restored.ok) throw new Error(restored.error.code); owner = restored.editor;
    host.getBoundingClientRect(); metrics["restoreMs"] = performance.now() - before;
    equal(exported("documentJson"), original); equal(selected(), originalSelection);
    measured("redoMs", () => history("redo")); equal(exported("documentJson"), edited); equal(selected(), editedSelection);
    return {items, repetition, editTarget, documentBytes: new TextEncoder().encode(documentJson).byteLength, checkpointBytes, metrics};
  } finally { owner?.dispose(); equal(host.childNodes.length, 0); equal(toolbar.childNodes.length, 0); }
}
