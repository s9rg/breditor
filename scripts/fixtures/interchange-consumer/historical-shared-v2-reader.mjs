/** Restore unchanged historical bytes through the independent installed shared package. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as wasm from "@breditor/collaboration/wasm";
import { compileStandardStructuralSharedProfileV2 } from "@breditor/collaboration";

const binary = readFileSync(new URL(import.meta.resolve("@breditor/collaboration/wasm-binary")));
wasm.initSync({ module: binary });
const configuration = JSON.parse(readFileSync(new URL("shared-v2-first-sdk/profile.json", import.meta.url), "utf8"));
const captured = readFileSync(new URL("shared-v2-first-sdk/journal.json", import.meta.url), "utf8");
const journalSha256 = createHash("sha256").update(captured).digest("hex");
assert.equal(journalSha256, "b5bbb6b306b2842cf2cb1b2a406d809e6006fd73c8ffae3bca78744b65cc3abf");
assert.ok(captured.endsWith("\n"));
const saved = captured.slice(0, -1);
const room = "historical-shared-v2";
const profiles = [];

function own(profile) {
  profiles.push(profile);
  return profile;
}
function content(owner, first, code, depth) {
  const blocks = JSON.parse(owner.document_json()).root.children;
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map(block => [block.type, block.children.map(run => run.text).join("")]), [
    ["breditor/paragraph", first], [code ? "breditor/code-block" : "breditor/paragraph", "return 2"],
  ]);
  assert.equal(blocks[1].properties["breditor/language"], code ? "Rust" : undefined);
  assert.deepEqual([owner.undo_count(), owner.redo_count()], depth);
}
function apply(owner, action) {
  const observation = owner.observe();
  try { assert.equal(action(observation), true); }
  finally { observation.free(); }
}

const steps = [
  ["redo", "north!", true, [2, 0]], ["undo", "north!", false, [1, 1]], ["undo", "north", false, [0, 2]],
  ["redo", "north!", false, [1, 1]], ["redo", "north!", true, [2, 0]],
];
let owner;
try {
  const profile = own(compileStandardStructuralSharedProfileV2(wasm, configuration));
  owner = profile.restore(room, saved);
  assert.equal(owner.checkpoint(), saved);
  const point = { block: "sample", offset: "3", affinity: "before" };
  const view = JSON.parse(owner.view_json());
  assert.deepEqual(view.selection, { kind: "text", anchor: point, focus: point });
  assert.equal(view.pendingFormatsJson, "[]");
  content(owner, "north!", false, [1, 1]);

  for (const [action, first, code, depth] of steps) {
    apply(owner, observation => owner[`${action}_observed`](observation));
    const checkpoint = owner.checkpoint();
    owner.free();
    owner = undefined;
    owner = profile.restore(room, checkpoint);
    assert.equal(owner.checkpoint(), checkpoint);
    content(owner, first, code, depth);
  }
  apply(owner, observation => owner.dispatch(observation, JSON.stringify({ commands: [
    { kind: "insert_text", data: { block: "note", offset: 6, text: "?" } },
  ] })));
  content(owner, "north!?", true, [3, 0]);
  const future = owner.checkpoint();
  owner.free();
  owner = undefined;
  owner = profile.restore(room, future);
  assert.equal(owner.checkpoint(), future);
  apply(owner, observation => owner.undo_observed(observation));
  content(owner, "north!", true, [2, 1]);
  apply(owner, observation => owner.redo_observed(observation));
  content(owner, "north!?", true, [3, 0]);

  const foreign = own(wasm.SharedRichProfile.from_configuration_json_v2(JSON.stringify(configuration)));
  const older = own(wasm.SharedRichProfile.from_standard_configuration_json_v1(JSON.stringify({ ...configuration, formatVersion: 1 })));
  const newer = own(wasm.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({ ...configuration, formatVersion: 3 })));
  assert.throws(() => profile.restore("foreign-room", saved), /rich journal room binding/);
  assert.throws(() => foreign.restore(room, saved), /rich replica schema admission/);
  for (const counterpart of [older, newer]) {
    assert.throws(() => counterpart.restore(room, saved), /rich replica journal version/);
  }
} finally {
  owner?.free();
  for (const profile of profiles.reverse()) profile.free();
}

console.log(JSON.stringify({ passed: true, journalVersion: 13, journalSha256, historySteps: steps.length,
  futureHistorySteps: 2, wrongReaderRefusals: 4, wasmSha256: createHash("sha256").update(binary).digest("hex") }));
