/** Run only against the module generated from the released v0.1.0 source. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [modulePath, wasmPath] = process.argv.slice(2);
assert.ok(modulePath && wasmPath && process.argv.length === 4);
const api = await import(pathToFileURL(resolve(modulePath)).href);
api.initSync({ module: readFileSync(wasmPath) });
assert.equal(api.breditorVersion(), "0.1.0");
assert.equal(api.breditorWasmAbiVersion(), "2");

const caret = { kind: "text", textPath: [0, 0], utf16Offset: 5, affinity: "after" };
const seed = {
  format: "breditor/session-checkpoint",
  formatVersion: 1,
  historyBase: {
    format: "breditor/editor-state",
    formatVersion: 1,
    snapshot: { lineage: "release-v010-wire-compatibility", revision: "0" },
    document: {
      format: "breditor/document",
      formatVersion: 1,
      schema: { name: "breditor/base", version: 1 },
      root: {
        kind: "element",
        type: "breditor/document",
        entityId: null,
        properties: {},
        children: [{
          kind: "element",
          type: "breditor/paragraph",
          entityId: null,
          properties: {},
          children: [{ kind: "text", text: "start", formats: [] }],
        }],
      },
    },
    selection: { kind: "range", anchor: caret, focus: caret },
    pendingFormats: null,
  },
  currentRevision: "0",
  historyCapacity: 100,
  cursor: 0,
  entries: [],
  openMergeGroup: null,
};

function committed(engine, execute) {
  const observation = engine.observation();
  try {
    const result = execute(observation);
    try {
      assert.equal(result.status, "committed");
    } finally {
      result.free();
    }
  } finally {
    observation.free();
  }
}

const factory = api.BreditorEngine.fromSessionCheckpointJson(JSON.stringify(seed));
assert.equal(factory.status, "engine");
const engine = factory.takeEngine();
factory.free();
try {
  for (const text of [" 🦀", " café", " 末"]) {
    if (text === " café") {
      committed(engine, observed => engine.executeNoInputAction(observed, "breditor/toggle-strong"));
    }
    committed(engine, observed => engine.executeStringAction(observed, "breditor/insert-text", text));
    committed(engine, observed => engine.closeHistoryGroup(observed));
  }
  committed(engine, observed => engine.undo(observed, true));

  const observed = engine.observation();
  try {
    assert.ok(observed.undoDepth > 0);
    assert.equal(observed.redoDepth, 1);
  } finally {
    observed.free();
  }
  const checkpoint = engine.sessionCheckpointJson();
  try {
    assert.equal(checkpoint.status, "value");
    process.stdout.write(checkpoint.takeValue() + "\n");
  } finally {
    checkpoint.free();
  }
} finally {
  engine.free();
}
