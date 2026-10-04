// Developer-only generated-Wasm smoke test. Does not replace or publish a package.
// Usage: node scripts/check-experimental-heading-wasm.mjs <wasm-bindgen-output-dir>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

assert.equal(process.argv.length, 3, "provide the experimental binding directory");
const directory = resolve(process.argv[2]);
const wasm = await readFile(join(directory, "breditor_wasm_bg.wasm"));
const api = await import(pathToFileURL(join(directory, "breditor_wasm.js")).href);
api.initSync({ module: wasm });
const handles = [];
const own = (value) => {
  assert.ok(value, "missing owned handle");
  handles.push(value);
  return value;
};
const json = (result) => {
  own(result);
  assert.equal(result.status, "value");
  return JSON.parse(result.takeValue());
};
const observe = (engine) => own(engine.observation());
const document = (engine) => json(engine.documentJson(observe(engine)));
const state = (engine) => json(engine.stateJson());
const commit = (result) => {
  own(result);
  assert.equal(result.status, "committed");
  const value = json(result.commitJson());
  assert.equal(value.formatVersion, 5);
  assert.equal(value.before.formatVersion, 3);
  return value;
};

try {
  const bootstrap = {
    format: "breditor/profile-bootstrap", formatVersion: 3,
    schema: { name: "example/heading-wasm-smoke", version: 1 }, extensions: [],
  };
  assert.equal(own(api.BreditorCompiledProfile.fromBootstrapJsonV2(JSON.stringify(bootstrap))).status, "error");
  const compiled = own(api.BreditorCompiledProfile.fromBootstrapJsonV3(JSON.stringify(bootstrap)));
  assert.equal(compiled.status, "profile");
  const profile = own(compiled.takeProfile());
  const descriptor = own(profile.descriptor());
  assert.equal(descriptor.actionStateCount, 11);
  assert.equal(descriptor.intentCount, 9);
  const initial = {
    format: "breditor/document", formatVersion: 2, schema: bootstrap.schema,
    schemaFingerprint: descriptor.schemaFingerprint,
    root: { kind: "element", type: "breditor/document", entityId: null, properties: {}, children: [
      { kind: "element", type: "breditor/heading", entityId: null,
        properties: { "breditor/level": 2 }, children: [{ kind: "text", text: "abc", formats: [] }] },
    ] },
  };
  const created = own(profile.createEngineFromDocumentJsonV5("heading-wasm-smoke", JSON.stringify(initial), 20));
  assert.equal(created.status, "engine");
  const engine = own(created.takeEngine());
  commit(engine.setRangeSelection(observe(engine), "text", 2, 1, "before", "text", 2, 1, "before"));
  commit(engine.executeStringAction(observe(engine), "breditor/insert-text-block-text", "🙂", false));
  const typed = state(engine);
  commit(engine.executeStringAction(observe(engine), "breditor/insert-text-block-plain-text", "x\r\ny", true));
  const pasted = state(engine);
  assert.equal(pasted.formatVersion, 3);
  assert.deepEqual(document(engine).root.children.map((node) => node.properties["breditor/level"]), [2, 2]);
  commit(engine.undo(observe(engine), false));
  assert.deepEqual(state(engine).selection, typed.selection);
  const checkpoint = json(engine.sessionCheckpointJson());
  assert.equal(checkpoint.formatVersion, 5);
  const restoredResult = own(profile.createEngineFromSessionCheckpointJsonV5(JSON.stringify(checkpoint)));
  assert.equal(restoredResult.status, "engine");
  const restored = own(restoredResult.takeEngine());
  assert.deepEqual(json(restored.sessionCheckpointJson()), checkpoint);
  assert.equal(own(restored.redo(observe(engine), false)).status, "error");
  commit(restored.redo(observe(restored), false));
  assert.deepEqual(state(restored).document, pasted.document);
  assert.deepEqual(state(restored).selection, pasted.selection);
  commit(restored.executeNoInputAction(observe(restored), "breditor/set-heading-3", false));
  assert.equal(document(restored).root.children[1].properties["breditor/level"], 3);
  commit(restored.executeNoInputAction(observe(restored), "breditor/toggle-text-block-strong", false));
  assert.ok(state(restored).pendingFormats.length > 0);
  console.log(JSON.stringify({ status: "passed", scope: "generated experimental Wasm under Node; not browser qualification",
    wasmBytes: wasm.length, wasmGzipBytes: gzipSync(wasm, { level: 9 }).length, gzipLevel: 9,
    wasmSha256: createHash("sha256").update(wasm).digest("hex") }, null, 2));
} finally {
  for (const handle of handles.reverse()) handle.free();
}
