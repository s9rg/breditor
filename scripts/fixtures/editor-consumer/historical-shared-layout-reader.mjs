/** Open the first shared layout journal using only installed package routes. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {compileStandardLayoutSharedProfileV3} from "@breditor/collaboration";
import * as wasm from "@breditor/collaboration/wasm";

const sha = value => createHash("sha256").update(value).digest("hex");
const read = filename => readFileSync(new URL(`shared-v3-first-sdk/${filename}`, import.meta.url), "utf8");
const binary = readFileSync(new URL(import.meta.resolve("@breditor/collaboration/wasm-binary")));
wasm.initSync({module: binary});
const config = JSON.parse(read("profile.json"));
const artifact = read("journal.json");
const fixtureSha256 = sha(artifact);
assert.equal(fixtureSha256, "523503c789139c403b819ba58ff7311cc7e39ed1dc92530468b7988a0aba167b");
const {checkpoint, clock, history, room} = JSON.parse(artifact);
const states = [
  ["redo", "north!", true, [2, 0]], ["undo", "north!", false, [1, 1]], ["undo", "north", false, [0, 2]],
  ["redo", "north!", false, [1, 1]], ["redo", "north!", true, [2, 0]],
];
assert.deepEqual(history.map(step => step.command), states.map(([command]) => command));

const profiles = [];
function own(profile) {
  profiles.push(profile);
  return profile;
}
function exactContent(owner, text, layout, depth) {
  const [summary, peer, ...rest] = JSON.parse(owner.document_json()).root.children;
  assert.deepEqual(rest, []);
  assert.deepEqual([summary.type, peer.type], ["breditor/paragraph", "breditor/paragraph"]);
  assert.deepEqual([summary, peer].map(block => block.children.map(run => run.text).join("")), [text, "visible"]);
  assert.deepEqual(summary.properties, {"breditor/block-id": "summary", ...(layout ? {
    "breditor/block-align": 3, "breditor/block-direction": 2, "breditor/block-indent": 3, "breditor/line-height-percent": 150,
  } : {})});
  assert.deepEqual(peer.properties, {"breditor/block-id": "peer", "breditor/block-align": 2, "breditor/line-height-percent": 200});
  assert.deepEqual([owner.undo_count(), owner.redo_count()], depth);
}
function refuses(open, reason) {
  let opened;
  try { assert.throws(() => { opened = open(); }, reason); }
  finally { opened?.free(); }
}

const realNow = Date.now;
let time = clock, owner;
try {
  Date.now = () => time;
  const profile = own(compileStandardLayoutSharedProfileV3(wasm, config));
  const binding = JSON.parse(profile.descriptor_json());
  assert.deepEqual([binding.abiVersion, binding.modelVersion, binding.journalVersion], [1, 13, 14]);
  owner = profile.restore(room, checkpoint);
  assert.equal(owner.checkpoint(), checkpoint);
  const point = {block: "summary", offset: "2", affinity: "before"};
  const view = JSON.parse(owner.view_json());
  assert.deepEqual(view.selection, {kind: "text", anchor: point, focus: point});
  assert.equal(view.pendingFormatsJson, "[]");
  exactContent(owner, "north!", false, [1, 1]);
  for (const [index, [command, text, layout, depth]] of states.entries()) {
    time += 2_000;
    const observation = owner.observe();
    try { assert.equal(owner[`${command}_observed`](observation), true); }
    finally { observation.free(); }
    const saved = owner.checkpoint();
    assert.equal(sha(saved), history[index].sha256);
    owner.free();
    owner = undefined;
    owner = profile.restore(room, saved);
    assert.equal(owner.checkpoint(), saved);
    exactContent(owner, text, layout, depth);
  }

  const foreign = own(compileStandardLayoutSharedProfileV3(wasm, {...config, schema: {...config.schema, version: 2}}));
  const older = own(wasm.SharedRichProfile.from_standard_configuration_json_v2(JSON.stringify({...config, formatVersion: 2})));
  const newer = own(wasm.SharedRichProfile.from_standard_configuration_json_v4(JSON.stringify({...config, formatVersion: 4})));
  refuses(() => profile.restore("foreign-room", checkpoint), /rich journal room binding/);
  refuses(() => profile.restore_typing(room, checkpoint), /invalid JSON envelope/);
  refuses(() => foreign.restore(room, checkpoint), /rich replica schema admission/);
  refuses(() => older.restore(room, checkpoint), /rich replica journal version/);
  refuses(() => newer.restore(room, checkpoint), /rich replica journal version/);
} finally {
  Date.now = realNow;
  owner?.free();
  for (const profile of profiles.reverse()) profile.free();
}

console.log(JSON.stringify({passed: true, modelVersion: 13, journalVersion: 14, fixtureSha256, wasmSha256: sha(binary),
  exactColdReopens: states.length + 1, exactOriginalHistorySteps: states.length, preservedPeerLayout: true, wrongReaderRefusals: 5}));
