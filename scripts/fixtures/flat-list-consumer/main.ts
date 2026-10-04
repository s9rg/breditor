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
  const schema = {name: "example/packed-flat-lists", version: 1};
  const semanticProfile = {formatVersion: 4 as const, bootstrapJson: JSON.stringify({
    format: "breditor/profile-bootstrap", formatVersion: 4, schema, extensions: [],
  })};
  const compiled = wasm.BreditorCompiledProfile.fromBootstrapJsonV4(semanticProfile.bootstrapJson);
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
        element("list-item", [element("paragraph", [text("Second")])])], {"breditor/start": 3})]),
  })};
  const options: Parameters<typeof BreditorBrowserEditor.openFlatLists>[0] = {
    host: document.getElementById("editor")!, label: "Packed list document", wasm, semanticProfile, initialDocument,
    toolbar: {host: document.getElementById("toolbar")!},
    keyboard: {editing: "beforeinputPrimary", primaryModifier: "control", shortcuts: "enabled"},
  };
  if (false) {
    // @ts-expect-error Ordinary package startup must not accept list-mode options.
    void BreditorBrowserEditor.open(options);
  }
  const opened = await BreditorBrowserEditor.openFlatLists(options);
  if (!opened.ok) throw new Error(opened.error.code);
  let owner = opened.editor;
  const exported = (format: "documentJson" | "sessionCheckpointJson" | "plainText") => {
    const result = owner.exportContent(format); if (!result.ok) throw new Error(result.error.code); return result.value;
  };
  try {
    equal(exported("plainText"), "Packed 🙂\nFirst\nSecond");
    equal(options.host.querySelector("ol")?.getAttribute("start"), "3");
    equal(options.toolbar!.host.querySelectorAll("button").length, 14);
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
    const checkpoint = exported("sessionCheckpointJson"); equal(JSON.parse(checkpoint).formatVersion, 6);
    owner.dispose(); equal(options.host.childNodes.length, 0);
    const {initialDocument: _fallback, persistence: _storage, initialSessionCheckpointJson: _checkpoint, ...recovery} = options;
    const restored = await BreditorBrowserEditor.openFlatLists({...recovery, initialSessionCheckpointJson: checkpoint});
    if (!restored.ok) throw new Error(restored.error.code);
    owner = restored.editor; equal(exported("sessionCheckpointJson"), checkpoint);
    (options.toolbar!.host.querySelector('[data-breditor-state-id="breditor/control-redo"]') as HTMLButtonElement).click();
    equal(exported("documentJson"), changed);
    output.textContent = "passed: packed imports, list toolbar, undo, V6 restore and redo";
    output.setAttribute("data-status", "passed");
  } finally { owner.dispose(); }
}
