import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { IDBFactory } from "fake-indexeddb";

const [modulePath, wasmPath, browserModulePath] = process.argv.slice(2);
if (modulePath === undefined || wasmPath === undefined || browserModulePath === undefined) {
  throw new Error(
    "usage: generated_web_glue.mjs <generated-module.mjs> <generated-bg.wasm> <browser-module.js>",
  );
}

const api = await import(pathToFileURL(modulePath).href);
const browser = await import(pathToFileURL(browserModulePath).href);
api.initSync({ module: readFileSync(wasmPath) });

const EMPTY_DOCUMENT_JSON = JSON.stringify({
  format: "breditor/document",
  formatVersion: 1,
  schema: { name: "breditor/base", version: 1 },
  root: {
    kind: "element",
    type: "breditor/document",
    entityId: null,
    properties: {},
    children: [
      {
        kind: "element",
        type: "breditor/paragraph",
        entityId: null,
        properties: {},
        children: [],
      },
    ],
  },
});

const SELECTED_CHECKPOINT_JSON =
  '{"format":"breditor/session-checkpoint","formatVersion":1,"historyBase":{"format":"breditor/editor-state","formatVersion":1,"snapshot":{"lineage":"web-glue-projection-update","revision":"0"},"document":{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[{"kind":"text","text":"a","formats":[]}]}]}},"selection":{"kind":"range","anchor":{"kind":"text","textPath":[0,0],"utf16Offset":1,"affinity":"after"},"focus":{"kind":"text","textPath":[0,0],"utf16Offset":1,"affinity":"after"}},"pendingFormats":null},"currentRevision":"0","historyCapacity":100,"cursor":0,"entries":[],"openMergeGroup":null}';

function takeEngine(lineage, capacity = 2) {
  const result = api.BreditorEngine.fromDocumentJson(
    lineage,
    EMPTY_DOCUMENT_JSON,
    capacity,
  );
  assert.equal(result.status, "engine");
  const engine = result.takeEngine();
  assert.ok(engine instanceof api.BreditorEngine);
  assert.equal(result.status, "taken");
  assert.equal(result.takeEngine(), undefined);
  result.free();
  const observation = engine.observation();
  assert.equal(observation.snapshotRevision, "0");
  observation.free();
  return engine;
}

function takeString(result) {
  assert.equal(result.status, "value");
  const value = result.takeValue();
  assert.equal(typeof value, "string");
  assert.equal(result.status, "taken");
  assert.equal(result.takeValue(), undefined);
  result.free();
  return value;
}

function assertCommandError(result, expectedCode) {
  assert.equal(result.status, "error");
  assert.equal(result.observation(), undefined);
  assert.equal(result.eventKind, undefined);
  assert.equal(result.projectionUpdate(), undefined);
  const error = result.error;
  assert.ok(error instanceof api.BreditorError);
  result.free();
  assert.equal(error.code, expectedCode);
  error.free();
}

assert.equal(api.breditorWasmAbiVersion(), "1");
assert.match(api.breditorVersion(), /^0\.0\.\d+$/);

const invalidFactory = api.BreditorEngine.fromDocumentJson(
  "web-glue-redaction",
  "private-invalid-document",
  2,
);
assert.equal(invalidFactory.status, "error");
assert.equal(invalidFactory.takeEngine(), undefined);
const independentError = invalidFactory.error;
assert.ok(independentError instanceof api.BreditorError);
invalidFactory.free();
assert.equal(independentError.code, "codec.invalid_json");
assert.equal(independentError.message, "the initial document was rejected");
assert.doesNotMatch(independentError.message, /private-invalid-document/);
independentError.free();

for (const invalidCapacity of [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -1,
  1.5,
  101,
  2 ** 32 + 1,
  Number.MAX_SAFE_INTEGER,
]) {
  const result = api.BreditorEngine.fromDocumentJson(
    "web-glue-number",
    EMPTY_DOCUMENT_JSON,
    invalidCapacity,
  );
  assert.equal(result.status, "error");
  const error = result.error;
  assert.equal(error.code, "breditor_wasm.invalid_history_capacity");
  error.free();
  result.free();
}

const engine = takeEngine("web-glue-lifecycle");
const firstObservation = engine.observation();
const disabled = engine.executeNoInputAction(
  firstObservation,
  "breditor/toggle-strong",
);
assert.equal(disabled.status, "disabled");
assert.equal(disabled.eventKind, undefined);
assert.equal(disabled.error, undefined);
let successor = disabled.observation();
assert.ok(successor instanceof api.BreditorObservation);
disabled.free();
firstObservation.free();
assert.equal(successor.snapshotRevision, "0");

const selectionCommand = engine.setRangeSelection(
  successor,
  "children",
  1,
  0,
  "after",
  "children",
  1,
  0,
  "after",
);
assert.equal(selectionCommand.status, "committed");
const selectedObservation = selectionCommand.observation();
selectionCommand.free();
successor.free();
const inserted = engine.executeStringAction(
  selectedObservation,
  "breditor/insert-text",
  "reload me",
);
assert.equal(inserted.status, "committed");
successor = inserted.observation();
inserted.free();
selectedObservation.free();
assert.equal(successor.snapshotRevision, "2");

const encodedState = takeString(engine.stateJson());
assert.match(encodedState, /"text":"reload me"/);
assert.match(encodedState, /"format":"breditor\/editor-state"/);
const encodedCheckpoint = takeString(engine.sessionCheckpointJson());
assert.match(encodedCheckpoint, /"format":"breditor\/session-checkpoint"/);

const browserCheckpoint = browser.consumeWasmSessionCheckpoint(
  { lineage: "web-glue-lifecycle", revision: successor.snapshotRevision },
  engine.sessionCheckpointJson(),
  [engine],
);
assert.equal(browserCheckpoint.ok, true);
assert.equal(browserCheckpoint.checkpoint.checkpointJson, encodedCheckpoint);
assert.equal(
  browserCheckpoint.checkpoint.checkpointUtf8Bytes,
  new TextEncoder().encode(encodedCheckpoint).byteLength,
);
assert.ok(globalThis.crypto?.subtle);
const checkpointDatabase = new IDBFactory();
const checkpointWriter = new browser.IndexedDbSessionCheckpointStore({
  indexedDB: checkpointDatabase,
  crypto: globalThis.crypto.subtle,
});
const emptyCheckpointSlot = await checkpointWriter.load();
assert.equal(emptyCheckpointSlot.ok, true);
assert.equal(emptyCheckpointSlot.status, "empty");
const checkpointAutosave = new browser.BreditorSessionCheckpointAutosave(
  { read: () => browserCheckpoint },
  checkpointWriter,
  emptyCheckpointSlot.token,
);
checkpointAutosave.markDirty();
assert.deepEqual(await checkpointAutosave.flush(), { status: "committed" });
checkpointAutosave.dispose();
checkpointWriter.close();

const checkpointReader = new browser.IndexedDbSessionCheckpointStore({
  indexedDB: checkpointDatabase,
  crypto: globalThis.crypto.subtle,
});
const reloadedCheckpoint = await checkpointReader.load();
assert.equal(reloadedCheckpoint.ok, true);
assert.equal(reloadedCheckpoint.status, "loaded");
assert.equal(reloadedCheckpoint.checkpointJson, encodedCheckpoint);
assert.equal(
  reloadedCheckpoint.checkpointUtf8Bytes,
  browserCheckpoint.checkpoint.checkpointUtf8Bytes,
);
const browserRestore = browser.restoreWasmEngine(
  api.BreditorEngine,
  reloadedCheckpoint.checkpointJson,
);
assert.equal(browserRestore.ok, true);
const browserRestoredEngine = browserRestore.engine;
const browserRestoredObservation = browserRestoredEngine.observation();
assert.equal(browserRestoredObservation.snapshotLineage, "web-glue-lifecycle");
assert.equal(browserRestoredObservation.snapshotRevision, "2");
assert.equal(takeString(browserRestoredEngine.stateJson()), encodedState);
const browserUndo = browserRestoredEngine.undo(browserRestoredObservation);
assert.equal(browserUndo.status, "committed");
const browserUndoObservation = browserUndo.observation();
browserUndo.free();
browserRestoredObservation.free();
assert.doesNotMatch(takeString(browserRestoredEngine.stateJson()), /"text":"reload me"/);
const browserRedo = browserRestoredEngine.redo(browserUndoObservation);
assert.equal(browserRedo.status, "committed");
const browserRedoObservation = browserRedo.observation();
browserRedo.free();
browserUndoObservation.free();
const redoneState = JSON.parse(takeString(browserRestoredEngine.stateJson()));
const originalState = JSON.parse(encodedState);
assert.deepEqual(redoneState.document, originalState.document);
assert.deepEqual(redoneState.selection, originalState.selection);
assert.deepEqual(redoneState.pendingFormats, originalState.pendingFormats);
assert.equal(redoneState.snapshot.lineage, originalState.snapshot.lineage);
assert.equal(redoneState.snapshot.revision, "4");
browserRedoObservation.free();
browserRestoredEngine.free();
checkpointReader.close();

const otherEngine = takeEngine("web-glue-other");
const crossEngine = otherEngine.undo(successor);
assert.equal(crossEngine.status, "error");
assert.equal(crossEngine.observation(), undefined);
const crossEngineError = crossEngine.error;
crossEngine.free();
assert.equal(crossEngineError.code, "editor_engine.stale_engine");
assert.equal(crossEngineError.message, "the guarded editor command was rejected");
crossEngineError.free();

const tooLarge = engine.executeStringAction(
  successor,
  "breditor/insert-text",
  "x".repeat(65_537),
);
assert.equal(tooLarge.status, "error");
const tooLargeError = tooLarge.error;
assert.equal(tooLargeError.code, "breditor_wasm.string_input_limit");
tooLargeError.free();
tooLarge.free();

assert.throws(
  () => engine.executeNoInputAction(successor, {
    get length() {
      throw new Error("hostile string coercion ran before Rust");
    },
  }),
  /hostile string coercion ran before Rust/,
);
assert.equal(takeString(engine.stateJson()), encodedState);
const afterUnchanged = engine.observation();
assert.equal(afterUnchanged.snapshotRevision, successor.snapshotRevision);
successor.free();

assert.throws(() => otherEngine.undo({}), /expected instance/);
const fabricatedEngine = new api.BreditorEngine();
assert.throws(() => fabricatedEngine.observation());

afterUnchanged.free();
engine.free();
otherEngine.free();

const actionStateFactory = api.BreditorEngine.fromSessionCheckpointJson(
  SELECTED_CHECKPOINT_JSON,
);
const actionStateEngine = actionStateFactory.takeEngine();
actionStateFactory.free();
const actionStateInitial = actionStateEngine.observation();

const fullActionStates = actionStateEngine.actionStates(actionStateInitial);
assert.equal(fullActionStates.status, "full");
assert.equal(fullActionStates.error, undefined);
const fullActionStateSnapshot = fullActionStates.takeSnapshot();
assert.ok(fullActionStateSnapshot instanceof api.BreditorActionStateSnapshot);
assert.equal(fullActionStates.status, "taken");
assert.equal(fullActionStates.takeSnapshot(), undefined);
fullActionStates.free();
assert.equal(fullActionStateSnapshot.snapshotLineage, "web-glue-projection-update");
assert.equal(fullActionStateSnapshot.snapshotRevision, "0");
assert.equal(fullActionStateSnapshot.entryCount, 3);
assert.equal(fullActionStateSnapshot.entryId(0), "breditor/control-bold");
assert.equal(fullActionStateSnapshot.entryStatus(0), "enabled");
assert.equal(fullActionStateSnapshot.entryActivation(0), "inactive");
assert.equal(fullActionStateSnapshot.entryReasonCode(0), undefined);
assert.equal(fullActionStateSnapshot.entryValueStatus(0), "unsupported");
assert.equal(fullActionStateSnapshot.entryValueContractName(0), undefined);
assert.equal(fullActionStateSnapshot.entryValueContractVersion(0), undefined);
const absentActionValue = fullActionStateSnapshot.entryUniformValueJson(0);
assert.equal(absentActionValue.status, "absent");
absentActionValue.free();
assert.equal(fullActionStateSnapshot.entryId(1), "breditor/control-redo");
assert.equal(fullActionStateSnapshot.entryStatus(1), "disabled");
assert.equal(fullActionStateSnapshot.entryReasonCode(1), "breditor/nothing-to-redo");
assert.equal(fullActionStateSnapshot.entryId(2), "breditor/control-undo");
assert.equal(fullActionStateSnapshot.entryReasonCode(2), "breditor/nothing-to-undo");
assert.equal(fullActionStateSnapshot.entryId(3), undefined);
assert.equal(fullActionStateSnapshot.entryStatus(3), undefined);
assert.equal(fullActionStateSnapshot.changedCount, 3);
for (let index = 0; index < fullActionStateSnapshot.entryCount; index += 1) {
  assert.equal(
    fullActionStateSnapshot.changedId(index),
    fullActionStateSnapshot.entryId(index),
  );
}
fullActionStateSnapshot.free();
assert.throws(() => fullActionStateSnapshot.entryId(0));

const unchangedActionStates = actionStateEngine.actionStates(actionStateInitial);
assert.equal(unchangedActionStates.status, "unchanged");
const unchangedActionStateSnapshot = unchangedActionStates.takeSnapshot();
unchangedActionStates.free();
assert.equal(unchangedActionStateSnapshot.entryCount, 3);
assert.equal(unchangedActionStateSnapshot.changedCount, 0);
unchangedActionStateSnapshot.free();

const toggleActionState = actionStateEngine.executeNoInputAction(
  actionStateInitial,
  "breditor/toggle-strong",
);
const actionStateSuccessor = toggleActionState.observation();
toggleActionState.free();
const staleActionStates = actionStateEngine.actionStates(actionStateInitial);
assert.equal(staleActionStates.status, "error");
assert.equal(staleActionStates.takeSnapshot(), undefined);
const staleActionStateError = staleActionStates.error;
staleActionStates.free();
assert.equal(staleActionStateError.code, "editor_engine.stale_snapshot");
staleActionStateError.free();

const deltaActionStates = actionStateEngine.actionStates(actionStateSuccessor);
assert.equal(deltaActionStates.status, "delta");
const deltaActionStateSnapshot = deltaActionStates.takeSnapshot();
deltaActionStates.free();
assert.equal(deltaActionStateSnapshot.snapshotRevision, "1");
assert.equal(deltaActionStateSnapshot.entryActivation(0), "active");
assert.equal(deltaActionStateSnapshot.changedCount, 1);
assert.equal(deltaActionStateSnapshot.changedId(0), "breditor/control-bold");
deltaActionStateSnapshot.free();
actionStateInitial.free();
actionStateSuccessor.free();
actionStateEngine.free();

const selectionFactory = api.BreditorEngine.fromSessionCheckpointJson(
  SELECTED_CHECKPOINT_JSON,
);
assert.equal(selectionFactory.status, "engine");
const selectionEngine = selectionFactory.takeEngine();
selectionFactory.free();
const selectionObservation = selectionEngine.observation();

const selectedResult = selectionEngine.selection(selectionObservation);
assert.equal(selectedResult.status, "selection");
assert.equal(selectedResult.error, undefined);
const selected = selectedResult.takeSelection();
assert.ok(selected instanceof api.BreditorSelection);
assert.equal(selectedResult.status, "taken");
assert.equal(selectedResult.takeSelection(), undefined);
selectedResult.free();
assert.equal(selected.snapshotLineage, "web-glue-projection-update");
assert.equal(selected.snapshotRevision, "0");
assert.equal(selected.kind, "range");
assert.equal(selected.anchorPointKind, "text");
assert.equal(selected.anchorNodeIndex, 2);
assert.equal(selected.anchorOffset, 1);
assert.equal(selected.anchorAffinity, "after");
assert.equal(selected.focusPointKind, "text");
assert.equal(selected.focusNodeIndex, 2);
assert.equal(selected.focusOffset, 1);
assert.equal(selected.focusAffinity, "after");
assert.equal(selected.rangeOrder, "collapsed");
selected.free();

const selectionCheckpointBefore = takeString(
  selectionEngine.sessionCheckpointJson(),
);
for (const coercibleNumber of [
  null,
  false,
  "2",
  [],
  2n,
  Symbol("2"),
  new Number(2),
  { valueOf: () => 2 },
  {
    valueOf() {
      throw new Error("numeric coercion must not run");
    },
  },
]) {
  const rejected = selectionEngine.setRangeSelection(
    selectionObservation,
    "text",
    coercibleNumber,
    1,
    "after",
    "text",
    2,
    1,
    "after",
  );
  assertCommandError(rejected, "breditor_wasm.invalid_selection_coordinate");
  assert.equal(
    takeString(selectionEngine.sessionCheckpointJson()),
    selectionCheckpointBefore,
  );
}

for (const coercibleString of [
  "x".repeat(1_048_576),
  new String("text"),
  { toString: () => "text" },
  {
    toString() {
      throw new Error("string coercion must not run");
    },
  },
]) {
  const rejectedKind = selectionEngine.setRangeSelection(
    selectionObservation,
    coercibleString,
    2,
    1,
    "after",
    "text",
    2,
    1,
    "after",
  );
  assertCommandError(
    rejectedKind,
    "breditor_wasm.invalid_selection_point_kind",
  );

  const rejectedAffinity = selectionEngine.setRangeSelection(
    selectionObservation,
    "text",
    2,
    1,
    coercibleString,
    "text",
    2,
    1,
    "after",
  );
  assertCommandError(
    rejectedAffinity,
    "breditor_wasm.invalid_selection_affinity",
  );
  assert.equal(
    takeString(selectionEngine.sessionCheckpointJson()),
    selectionCheckpointBefore,
  );
}

const movedSelection = selectionEngine.setRangeSelection(
  selectionObservation,
  "text",
  2,
  0,
  "before",
  "text",
  2,
  0,
  "after",
);
assert.equal(movedSelection.status, "committed");
assert.equal(movedSelection.eventKind, "selection");
const movedUpdate = movedSelection.projectionUpdate();
assert.equal(movedUpdate.impact, "none");
const movedProjection = movedUpdate.takeProjection();
movedProjection.free();
movedUpdate.free();
const movedObservation = movedSelection.observation();
movedSelection.free();

const staleBeforeAdmission = selectionEngine.setRangeSelection(
  selectionObservation,
  { toString: () => "text" },
  { valueOf: () => 2 },
  Number.NaN,
  new String("after"),
  null,
  false,
  Number.POSITIVE_INFINITY,
  Symbol("after"),
);
assertCommandError(staleBeforeAdmission, "editor_engine.stale_snapshot");
const staleSelectionRead = selectionEngine.selection(selectionObservation);
assert.equal(staleSelectionRead.status, "error");
assert.equal(staleSelectionRead.takeSelection(), undefined);
const staleSelectionError = staleSelectionRead.error;
staleSelectionRead.free();
assert.equal(staleSelectionError.code, "editor_engine.stale_snapshot");
staleSelectionError.free();

const echoSelection = selectionEngine.setRangeSelection(
  movedObservation,
  "text",
  2,
  0,
  "before",
  "text",
  2,
  0,
  "after",
);
assert.equal(echoSelection.status, "unchanged");
assert.equal(echoSelection.projectionUpdate(), undefined);
const echoObservation = echoSelection.observation();
echoSelection.free();

const clearSelection = selectionEngine.clearSelection(echoObservation);
assert.equal(clearSelection.status, "committed");
assert.equal(clearSelection.eventKind, "selection");
const clearObservation = clearSelection.observation();
clearSelection.free();
const clearedResult = selectionEngine.selection(clearObservation);
const cleared = clearedResult.takeSelection();
clearedResult.free();
assert.equal(cleared.kind, "none");
assert.equal(cleared.anchorPointKind, undefined);
assert.equal(cleared.rangeOrder, undefined);
cleared.free();

const clearEcho = selectionEngine.clearSelection(clearObservation);
assert.equal(clearEcho.status, "unchanged");
clearEcho.free();
selectionObservation.free();
movedObservation.free();
echoObservation.free();
clearObservation.free();
selectionEngine.free();

const projectionFactory = api.BreditorEngine.fromSessionCheckpointJson(
  SELECTED_CHECKPOINT_JSON,
);
assert.equal(projectionFactory.status, "engine");
const projectionEngine = projectionFactory.takeEngine();
projectionFactory.free();
const projectionObservation = projectionEngine.observation();

const rawProjectionResult = projectionEngine.projection(projectionObservation);
assert.equal(rawProjectionResult.status, "projection");
assert.equal(rawProjectionResult.error, undefined);
const rawProjection = rawProjectionResult.takeProjection();
assert.ok(rawProjection instanceof api.BreditorProjection);
assert.equal(rawProjectionResult.status, "taken");
assert.equal(rawProjectionResult.takeProjection(), undefined);
rawProjectionResult.free();
assert.equal(rawProjection.schemaName, "breditor/base");
assert.equal(rawProjection.schemaVersion, 1);
assert.equal(rawProjection.snapshotLineage, "web-glue-projection-update");
assert.equal(rawProjection.snapshotRevision, "0");
assert.equal(rawProjection.nodeCount, 3);
assert.equal(rawProjection.rootIndex, 0);
assert.equal(rawProjection.nodeKind(0), "element");
assert.equal(rawProjection.elementType(1), "breditor/paragraph");
assert.equal(rawProjection.childAt(1, 0), 2);
assert.equal(rawProjection.text(2), "a");
assert.equal(rawProjection.nodeKind(99), undefined);
rawProjection.free();

const adapterProjectionResult = projectionEngine.projection(projectionObservation);
const adapterProjection = adapterProjectionResult.takeProjection();
adapterProjectionResult.free();
const browserBaseResult = browser.consumeSemanticProjection(adapterProjection);
assert.equal(browserBaseResult.ok, true);
const browserBase = browserBaseResult.value;
assert.deepEqual(browserBase.snapshot, {
  lineage: "web-glue-projection-update",
  revision: "0",
});
assert.deepEqual(browserBase.paragraphs, [
  { runs: [{ text: "a", strong: false }] },
]);

// Exercise the real generated selection view through the dependency-free
// browser adapter, not only through hand-written structural fixtures.
const adapterSelectionResult = projectionEngine.selection(projectionObservation);
assert.equal(adapterSelectionResult.status, "selection");
const adapterSelection = adapterSelectionResult.takeSelection();
adapterSelectionResult.free();
const browserSelectionResult = browser.consumeSemanticSelection(
  browserBase,
  adapterSelection,
);
assert.equal(browserSelectionResult.ok, true);
const browserSelection = browserSelectionResult.value;
assert.notEqual(browserSelection, null);
assert.equal(browserSelection.order, "collapsed");
assert.deepEqual(browserSelection.anchor, {
  kind: "text",
  textPath: [0, 0],
  utf16Offset: 1,
  affinity: "after",
});
assert.deepEqual(browserSelection.focus, browserSelection.anchor);
assert.throws(() => adapterSelection.kind);

const browserSelectionScalars =
  browser.semanticRangeSelectionScalars(browserSelection);
assert.equal(browserSelectionScalars.ok, true);
assert.deepEqual(browserSelectionScalars.value, {
  anchorPointKind: "text",
  anchorNodeIndex: 2,
  anchorOffset: 1,
  anchorAffinity: "after",
  focusPointKind: "text",
  focusNodeIndex: 2,
  focusOffset: 1,
  focusAffinity: "after",
});

const projectionCommand = projectionEngine.executeStringAction(
  projectionObservation,
  "breditor/insert-text",
  "b",
);
assert.equal(projectionCommand.status, "committed");
const projectionSuccessor = projectionCommand.observation();
const rawUpdate = projectionCommand.projectionUpdate();
assert.ok(rawUpdate instanceof api.BreditorProjectionUpdate);
assert.equal(rawUpdate.baseRevision, "0");
assert.equal(rawUpdate.resultRevision, "1");
assert.equal(rawUpdate.impact, "textContainers");
assert.equal(rawUpdate.affectedParagraphCount, 1);
assert.equal(rawUpdate.affectedParagraphIndex(0), 0);
const updatedProjection = rawUpdate.takeProjection();
assert.ok(updatedProjection instanceof api.BreditorProjection);
assert.equal(rawUpdate.takeProjection(), undefined);
rawUpdate.free();
assert.equal(updatedProjection.text(2), "ab");
updatedProjection.free();

const adapterUpdate = projectionCommand.projectionUpdate();
const browserUpdateResult = browser.consumeSemanticProjectionUpdate(
  browserBase,
  adapterUpdate,
);
assert.equal(browserUpdateResult.ok, true);
assert.equal(browserUpdateResult.value.impact.kind, "textContainers");
assert.equal(browserUpdateResult.value.result.paragraphs[0].runs[0].text, "ab");

const droppedOwnedUpdate = projectionCommand.projectionUpdate();
droppedOwnedUpdate.free();
projectionCommand.free();
projectionObservation.free();
projectionSuccessor.free();
projectionEngine.free();

// A fabricated or freed class instance passes wasm-bindgen's JavaScript
// `instanceof` check but fails during Rust ABI conversion. Conversion happens
// after the mutable receiver borrow, so this unsupported raw-glue misuse also
// leaves that receiver unusable. Keep each probe on a throwaway engine.
const fabricatedVictim = takeEngine("web-glue-fabricated-victim");
const fabricatedObservation = new api.BreditorObservation();
assert.throws(() => fabricatedVictim.undo(fabricatedObservation));
assert.throws(() => fabricatedVictim.free());

const freedVictim = takeEngine("web-glue-freed-victim");
const freedObservation = freedVictim.observation();
freedObservation.free();
assert.throws(() => freedVictim.undo(freedObservation));
assert.throws(() => freedVictim.free());
