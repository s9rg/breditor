import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [modulePath, wasmPath] = process.argv.slice(2);
if (modulePath === undefined || wasmPath === undefined) {
  throw new Error("usage: generated_web_glue.mjs <generated-module.mjs> <generated-bg.wasm>");
}

const api = await import(pathToFileURL(modulePath).href);
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
