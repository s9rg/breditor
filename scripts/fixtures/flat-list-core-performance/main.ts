// Diagnostic only. Every owned Wasm handle is released, including failed cases.
import initialize, * as wasm from "@breditor/wasm";

const output = document.getElementById("result")!;
let progress = "initialization";
const equal = (actual: unknown, expected: unknown): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Core fixture mismatch at ${progress}`);
};
function using<T extends {free(): void}, R>(handle: T | undefined, action: (value: T) => R): R {
  if (handle === undefined) throw new Error(`Missing owned handle at ${progress}`);
  try { return action(handle); } finally { handle.free(); }
}
function json(result: wasm.BreditorStringResult): string {
  return using(result, value => {
    equal(value.status, "value");
    const text = value.takeValue();
    if (typeof text !== "string") throw new Error("Missing JSON");
    return text;
  });
}
const schema = {name: "example/list-performance", version: 1};
const element = (type: string, children: unknown[], properties = {}) => ({kind: "element", type: `breditor/${type}`, entityId: null, properties, children});
const text = (i: number) => `Item ${i}: A🙂 with enough text to measure a representative short list entry.`;

void run().catch(error => {
  output.textContent = JSON.stringify({progress, error: String(error)});
  output.dataset["status"] = "failed";
});
async function run(): Promise<void> {
  let start = performance.now(); await initialize();
  const initializationMs = performance.now() - start;
  start = performance.now();
  const profile = using(wasm.BreditorCompiledProfile.fromBootstrapJsonV4(JSON.stringify({
    format: "breditor/profile-bootstrap", formatVersion: 4, schema, extensions: [],
  })), result => { equal(result.status, "profile"); return result.takeProfile(); });
  const profileCompilationMs = performance.now() - start;
  if (!profile) throw new Error("Missing compiled profile");
  try {
    const fingerprint = using(profile.descriptor(), descriptor => {
      equal(descriptor.actionStateCount, 14); return descriptor.schemaFingerprint;
    });
    const cases = [];
    sample(profile, fingerprint, 5, -1);
    for (const items of [10, 100, 500]) for (let repetition = 0; repetition < 3; repetition++) {
      cases.push(sample(profile, fingerprint, items, repetition));
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    output.textContent = JSON.stringify({initializationMs, profileCompilationMs, cases});
    output.dataset["status"] = "passed";
  } finally { profile.free(); }
}

function sample(profile: wasm.BreditorCompiledProfile, fingerprint: string, items: number, repetition: number) {
  const metrics: Record<string, number> = {};
  const measured = <T>(name: string, action: () => T): T => {
    progress = `${items} items, repetition ${repetition}: ${name}`;
    const start = performance.now(); const result = action(); metrics[name] = performance.now() - start; return result;
  };
  const initial = {format: "breditor/document", formatVersion: 2, schema, schemaFingerprint: fingerprint,
    root: element("document", [element("ordered-list", Array.from({length: items}, (_, i) => element("list-item", [
      element(i % 10 === 0 ? "heading" : "paragraph", [{kind: "text", text: text(i), formats: []}], i % 10 === 0 ? {"breditor/level": 2} : {}),
    ])), {"breditor/start": 7})])};
  const documentJson = JSON.stringify(initial);
  let engine = using(measured("createEngineMs", () => profile.createEngineFromDocumentJsonV6(`core-${items}-${repetition}`, documentJson, 20)), result => {
    equal(result.status, "engine"); return result.takeEngine();
  });
  if (!engine) throw new Error("Missing engine");
  const observed = <T>(action: (observation: wasm.BreditorObservation) => T): T => using(engine!.observation(), action);
  const state = () => JSON.parse(json(engine!.stateJson()));
  const contents = () => {const value = state(); return {document: value.document, selection: value.selection, pendingFormats: value.pendingFormats};};
  // Commands below pass false for close_history_group_before. This is not a
  // rendering flag. We deliberately do not request command.projectionUpdate().
  const command = (name: string, action: (observation: wasm.BreditorObservation) => wasm.BreditorCommandResult) =>
    using(measured(name, () => observed(action)), result => {
      equal(result.status, "committed"); equal(result.historyGroupClosedBefore, false);
    });
  const actionStates = (name: string, status: "full" | "unchanged" | "delta") =>
    using(measured(name, () => observed(o => engine!.actionStates(o))), result => {
      equal(result.status, status);
      return using(result.takeSnapshot(), snapshot => {
        equal(snapshot.entryCount, 14);
        if (status === "unchanged") equal(snapshot.changedCount, 0);
        observed(o => {equal(snapshot.snapshotRevision, o.snapshotRevision); equal(snapshot.snapshotLineage, o.snapshotLineage);});
        const entries = Array.from({length: snapshot.entryCount}, (_, index) => {
          const id = snapshot.entryId(index), availability = snapshot.entryStatus(index);
          // Routed actions may be blocked or unhandled for a valid selection.
          // A fault, absent field or duplicate identity is not a valid snapshot.
          if (!id || !["enabled", "disabled", "blocked", "unhandled"].includes(availability ?? "")) {
            throw new Error(`Invalid action state: ${id}/${availability}`);
          }
          return [id, availability, snapshot.entryActivation(index), snapshot.entryReasonCode(index)];
        });
        equal(new Set(entries.map(entry => entry[0])).size, 14);
        return entries;
      });
    });
  const middle = Math.floor(items / 2);
  const projection = (name: string, expected: string) => using(measured(name, () => observed(o => engine!.projection(o))), result =>
    using(result.takeProjection(), view => {
      const list = view.childAt(view.rootIndex, 0)!;
      equal(view.listKind(list), "ordered"); equal(view.orderedListStart(list), 7);
      const item = view.childAt(list, middle)!, block = view.childAt(item, 0)!, leaf = view.childAt(block, 0)!;
      equal(view.nodeKind(leaf), "text"); equal(view.text(leaf), expected); return leaf;
    }));
  try {
    const leaf = projection("initialProjectionMs", text(middle));
    command("selectionCommandMs", o => engine!.setRangeSelection(o, "text", leaf, text(middle).length, "after", "text", leaf, text(middle).length, "after"));
    const before = contents();
    const cold = actionStates("actionStatesColdMs", "full");
    equal(actionStates("actionStatesHitMs", "unchanged"), cold);
    equal(contents(), before);
    equal(cold.find(entry => entry[0] === "breditor/control-undo")?.[1], "disabled");
    equal(cold.find(entry => entry[0] === "breditor/control-redo")?.[1], "disabled");
    command("insertCommandMs", o => engine!.executeStringAction(o, "breditor/insert-flat-list-text", "X", false));
    const edited = contents();
    const expectedDocument = JSON.parse(JSON.stringify(before.document));
    expectedDocument.root.children[0].children[middle].children[0].children[0].text += "X";
    equal(edited.document, expectedDocument);
    projection("editedProjectionMs", `${text(middle)}X`);
    const afterEdit = actionStates("actionStatesAfterEditMs", "delta");
    equal(contents(), edited);
    equal(afterEdit.find(entry => entry[0] === "breditor/control-undo")?.[1], "enabled");
    equal(afterEdit.find(entry => entry[0] === "breditor/control-redo")?.[1], "disabled");
    const exported = measured("documentExportMs", () => json(observed(o => engine!.documentJson(o))));
    equal(JSON.parse(exported), edited.document);
    command("undoCommandMs", o => engine!.undo(o, false)); equal(contents(), before);
    const afterUndo = actionStates("actionStatesAfterUndoMs", "delta");
    equal(contents(), before);
    equal(afterUndo.find(entry => entry[0] === "breditor/control-undo")?.[1], "disabled");
    equal(afterUndo.find(entry => entry[0] === "breditor/control-redo")?.[1], "enabled");
    const backup = measured("checkpointMs", () => json(engine!.sessionCheckpointJson()));
    equal(JSON.parse(backup).formatVersion, 6);
    measured("disposeMs", () => engine!.free()); engine = undefined;
    engine = using(measured("restoreEngineMs", () => profile.createEngineFromSessionCheckpointJsonV6(backup)), result => {
      equal(result.status, "engine"); return result.takeEngine();
    });
    if (!engine) throw new Error("Missing restored engine");
    equal(contents(), before);
    command("redoCommandMs", o => engine!.redo(o, false)); equal(contents(), edited);
    return {items, repetition, metrics, actionStates: {cold, afterEdit, afterUndo}};
  } finally { engine?.free(); }
}
