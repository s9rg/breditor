/** Run against the ABI 3 module built from the released v0.2.1 source. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [modulePath, wasmPath] = process.argv.slice(2);
assert.ok(modulePath && wasmPath && process.argv.length === 4);
const api = await import(pathToFileURL(resolve(modulePath)).href);
api.initSync({ module: readFileSync(wasmPath) });
assert.equal(api.breditorVersion(), "0.2.1");
assert.equal(api.breditorWasmAbiVersion(), "3");

const schema = { name: "example/editor", version: 1 };
const schemaFingerprint = "sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741";
const highlightIntent = "example/toggle-highlight-intent";
const bootstrap = {
  format: "breditor/profile-bootstrap",
  formatVersion: 1,
  schema,
  extensions: [{
    id: { name: "example/highlight-extension", version: 1 },
    dependencies: [],
    conflicts: [],
    inlineFormats: [{ kind: "example/highlight", revision: 7 }],
    inlineFormatToggles: [{
      formatKind: "example/highlight",
      actionId: "example/toggle-highlight",
      intentId: highlightIntent,
      bindingId: "example/toggle-highlight-binding",
      actionStateId: "example/highlight-control",
    }],
  }],
};
const document = {
  format: "breditor/document",
  formatVersion: 2,
  schema,
  schemaFingerprint,
  root: {
    kind: "element", type: "breditor/document", entityId: null, properties: {},
    children: [{
      kind: "element", type: "breditor/paragraph", entityId: null, properties: {},
      children: [{ kind: "text", text: "north", formats: [] }],
    }],
  },
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

const compiled = api.BreditorCompiledProfile.fromBootstrapJson(JSON.stringify(bootstrap));
assert.equal(compiled.status, "profile");
const profile = compiled.takeProfile();
compiled.free();
try {
  const factory = profile.createEngineFromDocumentJson("release-v021-highlight", JSON.stringify(document), 100);
  assert.equal(factory.status, "engine");
  const engine = factory.takeEngine();
  factory.free();
  try {
    committed(engine, observed => engine.setRangeSelection(observed, "text", 2, 0, "before", "text", 2, 5, "after"));
    committed(engine, observed => engine.executeNoInputIntent(observed, highlightIntent));
    committed(engine, observed => engine.setRangeSelection(observed, "text", 2, 5, "after", "text", 2, 5, "after"));
    committed(engine, observed => engine.executeStringAction(observed, "breditor/insert-text", " 🧭"));
    committed(engine, observed => engine.closeHistoryGroup(observed));
    committed(engine, observed => engine.undo(observed));

    const observed = engine.observation();
    try {
      assert.equal(observed.undoDepth, 1);
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
} finally {
  profile.free();
}
