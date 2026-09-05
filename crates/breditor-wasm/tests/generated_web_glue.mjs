import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

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
const successor = disabled.observation();
assert.ok(successor instanceof api.BreditorObservation);
disabled.free();
firstObservation.free();
assert.equal(successor.snapshotRevision, "0");

const encodedState = takeString(engine.stateJson());
assert.match(encodedState, /"format":"breditor\/editor-state"/);
const encodedCheckpoint = takeString(engine.sessionCheckpointJson());
assert.match(encodedCheckpoint, /"format":"breditor\/session-checkpoint"/);

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
const stillCurrent = engine.undo(successor);
assert.equal(stillCurrent.status, "unchanged");
const afterUnchanged = stillCurrent.observation();
stillCurrent.free();
successor.free();

assert.throws(() => otherEngine.undo({}), /expected instance/);
const fabricatedEngine = new api.BreditorEngine();
assert.throws(() => fabricatedEngine.observation());

afterUnchanged.free();
engine.free();
otherEngine.free();

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
