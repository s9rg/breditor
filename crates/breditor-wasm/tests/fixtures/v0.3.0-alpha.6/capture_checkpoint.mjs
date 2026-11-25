/** Run against the ABI 4 module built from the tagged v0.3.0-alpha.6 source. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const [modulePath, wasmPath] = process.argv.slice(2);
assert.ok(modulePath && wasmPath && process.argv.length === 4);
const api = await import(pathToFileURL(resolve(modulePath)).href);
api.initSync({module: readFileSync(wasmPath)});
assert.equal(api.breditorVersion(), "0.3.0-alpha.6");
assert.equal(api.breditorWasmAbiVersion(), "4");

const bootstrap = readFileSync(new URL("profile.json", import.meta.url), "utf8");
const paragraph = children => ({kind: "element", type: "breditor/paragraph", entityId: null, properties: {}, children});
const text = (text, formats = []) => ({kind: "text", text, formats});
const href = "https://example.test/route";

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

const compiled = api.BreditorCompiledProfile.fromBootstrapJsonV2(bootstrap);
assert.equal(compiled.status, "profile");
const profile = compiled.takeProfile();
compiled.free();
try {
  const descriptor = profile.descriptor();
  const document = {
    format: "breditor/document", formatVersion: 2,
    schema: JSON.parse(bootstrap).schema,
    schemaFingerprint: descriptor.schemaFingerprint,
    root: {kind: "element", type: "breditor/document", entityId: null, properties: {}, children: [
      paragraph([text("North", [{type: "breditor/strong", properties: {}}])]),
      paragraph([]),
      paragraph([text("south")]),
    ]},
  };
  descriptor.free();
  const factory = profile.createEngineFromDocumentJsonV3("release-alpha6-typed-range", JSON.stringify(document), 100);
  assert.equal(factory.status, "engine");
  const engine = factory.takeEngine();
  factory.free();
  try {
    committed(engine, observed => engine.setRangeSelection(observed, "text", 5, 5, "after", "text", 5, 5, "after"));
    committed(engine, observed => engine.executeStringAction(observed, "breditor/insert-text", "!", false));
    committed(engine, observed => engine.closeHistoryGroup(observed));
    committed(engine, observed => engine.setRangeSelection(observed, "text", 5, 2, "after", "text", 2, 1, "before"));
    committed(engine, observed => engine.executeTypedIntentJson(observed, "example/set-link-intent",
      JSON.stringify({operation: "set", properties: [{name: "example/href", value: href}]}), false));
    committed(engine, observed => engine.undo(observed, false));

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
      const encoded = checkpoint.takeValue();
      const parsed = JSON.parse(encoded);
      assert.equal(parsed.formatVersion, 3);
      assert.equal(parsed.cursor, 1);
      assert.match(JSON.stringify(parsed.entries[1]), /rootTextReplace/);
      assert.match(JSON.stringify(parsed.entries[1]), /https:\/\/example\.test\/route/);
      process.stdout.write(encoded + "\n");
    } finally {
      checkpoint.free();
    }
  } finally {
    engine.free();
  }
} finally {
  profile.free();
}
