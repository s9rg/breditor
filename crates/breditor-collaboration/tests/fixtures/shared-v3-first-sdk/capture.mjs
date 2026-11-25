/** Produce a retained layout journal using the first shared language 3 SDK. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const [modulePath, wasmPath] = process.argv.slice(2);
assert.ok(modulePath && wasmPath && process.argv.length === 4);
const wasm = await import(pathToFileURL(resolve(modulePath)).href);
wasm.initSync({module: readFileSync(wasmPath)});

const room = "historical-shared-layout";
const profile = wasm.SharedRichProfile.from_standard_configuration_json_v3(
  readFileSync(new URL("profile.json", import.meta.url), "utf8"),
);
const realNow = Date.now;
let time = 1_700_000_000_000;
let owner, peer;

function apply(target, change) {
  time += 2_000;
  const observation = target.observe();
  try { assert.equal(change(observation), true); }
  finally { observation.free(); }
}

function select(target, block, offset, affinity) {
  const point = {block, offset, affinity};
  apply(target, observation => target.set_selection(observation, JSON.stringify({kind: "text", anchor: point, focus: point})));
}

function layout(target, block, patch) {
  const command = {kind: "set_block_layout", data: {block, patch_json: JSON.stringify(patch)}};
  apply(target, observation => target.dispatch(observation, JSON.stringify({commands: [command]})));
}

const paragraph = (id, text) => ({
  kind: "element", type: "breditor/paragraph", entityId: null, properties: {"breditor/block-id": id},
  children: [{kind: "text", text, formats: []}],
});

try {
  Date.now = () => time;
  const binding = JSON.parse(profile.descriptor_json());
  assert.deepEqual([binding.abiVersion, binding.modelVersion, binding.journalVersion], [1, 13, 14]);
  owner = profile.create(JSON.stringify({
    format: "breditor/document", formatVersion: 2, schema: binding.schema,
    schemaFingerprint: binding.schemaFingerprint,
    root: {kind: "element", type: "breditor/document", entityId: null, properties: {"breditor/document-id": room},
      children: [paragraph("summary", "north"), paragraph("peer", "visible")]},
  }), "101");
  peer = profile.join_frame(room, "202", owner.update_frame());
  select(owner, "summary", "5", "after");
  apply(owner, observation => owner.insert_plain_text(observation, "!"));
  layout(owner, "summary", {alignment: "end", direction: "rtl", indent: 3, lineHeightPercent: 150});
  layout(peer, "peer", {alignment: "center", lineHeightPercent: 200});
  owner.receive_frame(peer.update_frame());
  apply(owner, observation => owner.undo_observed(observation));
  select(owner, "summary", "2", "before");
  apply(owner, observation => owner.set_pending_formats(observation, "[]"));
  assert.deepEqual([owner.undo_count(), owner.redo_count()], [1, 1]);
  const checkpoint = owner.checkpoint();
  const clock = time;
  const history = [];
  for (const command of ["redo", "undo", "undo", "redo", "redo"]) {
    const before = owner.checkpoint();
    owner.free();
    owner = undefined;
    owner = profile.restore(room, before);
    assert.equal(owner.checkpoint(), before);
    apply(owner, observation => owner[`${command}_observed`](observation));
    history.push({command, sha256: createHash("sha256").update(owner.checkpoint()).digest("hex")});
  }
  process.stdout.write(JSON.stringify({room, clock, checkpoint, history}, null, 2) + "\n");
} finally {
  Date.now = realNow;
  peer?.free();
  owner?.free();
  profile.free();
}
