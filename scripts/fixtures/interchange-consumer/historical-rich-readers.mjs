import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {compileLayoutRichProfileV3, compileRichProfile, compileRichProfileV4, compileStructuralRichProfileV2} from "@breditor/experimental-rich-content";
import initialize, * as wasm from "@breditor/experimental-rich-content/wasm";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const wasmBytes = readFileSync(new URL(import.meta.resolve("@breditor/experimental-rich-content/wasm-binary")));
await initialize({module_or_path: wasmBytes});

// These captures used the original rich profiles with an empty extension set.
const profiles = [];
const fixtures = [];
const compilers = [compileRichProfile, compileStructuralRichProfileV2, compileLayoutRichProfileV3, compileRichProfileV4];
const schema = {name: "example/rich-recovery", version: 1};
const targetBlock = (node, id) => {
  if (node.kind !== "element") return undefined;
  if (node.properties["breditor/block-id"] === id) return node;
  for (const child of node.children) {
    const target = targetBlock(child, id);
    if (target) return target;
  }
};

// Build the expected document at each cursor directly from the producer's
// before/after subtrees. The installed runtime supplies only the actual values.
function expectedDocuments({baseDocument, entries}) {
  const current = structuredClone(baseDocument);
  const expected = [structuredClone(current)];
  for (const {target, expected: before, replacement} of entries) {
    const block = targetBlock(current.root, target);
    assert.deepEqual(block, before);
    Object.assign(block, structuredClone(replacement));
    expected.push(structuredClone(current));
  }
  return expected;
}

try {
  for (const [index, compile] of compilers.entries()) {
    profiles.push(compile(wasm, JSON.stringify({format: "breditor/profile-bootstrap", formatVersion: 6 + index, schema, extensions: []})));
  }
  for (const language of [1, 2, 3]) {
    const fixture = readFileSync(new URL(`./pre-v4/rich-v${language}-history.json`, import.meta.url));
    const checkpoint = fixture.toString("utf8").trimEnd();
    const captured = JSON.parse(checkpoint);
    const expected = expectedDocuments(captured);
    assert.equal(expected.length, 6);
    const core = profiles[language - 1].restoreEditor(checkpoint);
    let historySteps = 0;
    try {
      const check = cursor => {
        const {undoDepth, redoDepth} = core.view();
        assert.deepEqual([undoDepth, redoDepth], [cursor, expected.length - cursor - 1]);
        assert.deepEqual(JSON.parse(core.documentJson()), expected[cursor]);
      };
      const point = {block: "caption", offset: "2", affinity: "after"};
      assert.equal(core.checkpointJson(), checkpoint);
      assert.deepEqual(core.view().selection, {kind: "text", anchor: point, focus: point});
      assert.equal(core.view().pendingFormatsJson, "[]");
      check(4);
      const step = (kind, cursor) => {core.execute({kind});check(cursor);historySteps++;};
      step("redo", 5);
      for (let cursor = 4; cursor >= 0; cursor--) step("undo", cursor);
      for (let cursor = 1; cursor <= 5; cursor++) step("redo", cursor);
    } finally {core.dispose();}

    let crossProfileRefusals = 0;
    for (const [index, profile] of profiles.entries()) {
      if (index + 1 === language) continue;
      assert.throws(() => profile.restoreEditor(checkpoint).dispose(), {code: "breditor_rich.checkpoint_rejected"});
      crossProfileRefusals++;
    }
    fixtures.push({language, fixtureSha256: sha256(fixture), historySteps, crossProfileRefusals});
  }
} finally {for (const profile of profiles) profile.dispose();}

console.log(JSON.stringify({passed: true, wasmSha256: sha256(wasmBytes), fixtures}));
