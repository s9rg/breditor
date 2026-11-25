/** Capture with the ordinary Wasm reader built from its first V2 SDK source commit. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [modulePath, wasmPath] = process.argv.slice(2);
assert.ok(modulePath && wasmPath && process.argv.length === 4);
const wasm = await import(pathToFileURL(resolve(modulePath)).href);
wasm.initSync({ module: readFileSync(wasmPath) });

const profile = wasm.SharedRichProfile.from_standard_configuration_json_v2(
  readFileSync(new URL("profile.json", import.meta.url), "utf8"),
);
const room = "historical-shared-v2";
const realNow = Date.now;
let time = 1_700_000_000_000;
let owner;
try {
  Date.now = () => time;
  const binding = JSON.parse(profile.descriptor_json());
  assert.deepEqual([binding.abiVersion, binding.modelVersion, binding.journalVersion], [1, 12, 13]);
  const paragraph = (id, text) => ({
    kind: "element", type: "breditor/paragraph", entityId: null, properties: { "breditor/block-id": id },
    children: [{ kind: "text", text, formats: [] }],
  });
  owner = profile.create(JSON.stringify({
    format: "breditor/document", formatVersion: 2, schema: binding.schema,
    schemaFingerprint: binding.schemaFingerprint,
    root: {
      kind: "element", type: "breditor/document", entityId: null, properties: { "breditor/document-id": room },
      children: [paragraph("note", "north"), paragraph("sample", "return 2")],
    },
  }), "101");

  const apply = action => {
    const observation = owner.observe();
    try {
      assert.equal(action(observation), true);
    } finally {
      observation.free();
    }
  };
  const select = (block, offset, affinity) => {
    const point = { block, offset, affinity };
    apply(observation => owner.set_selection(observation, JSON.stringify({ kind: "text", anchor: point, focus: point })));
  };
  select("note", "5", "after");
  apply(observation => owner.insert_plain_text(observation, "!"));
  time += 2_000;
  apply(observation => owner.dispatch(observation, JSON.stringify({ commands: [{
    kind: "set_code_block", data: { block: "sample", language: "Rust", format_policy: "reject_formatted" },
  }] })));
  const tip = JSON.parse(owner.document_json());
  assert.equal(tip.root.children[1].type, "breditor/code-block");
  assert.equal(tip.root.children[1].properties["breditor/language"], "Rust");
  time += 2_000;
  apply(observation => owner.undo_observed(observation));
  select("sample", "3", "before");
  apply(observation => owner.set_pending_formats(observation, "[]"));
  assert.deepEqual([owner.undo_count(), owner.redo_count()], [1, 1]);
  const saved = owner.checkpoint();
  const reopened = profile.restore(room, saved);
  try {
    assert.equal(reopened.checkpoint(), saved);
    const beforeRedo = reopened.observe();
    try {
      assert.equal(reopened.redo_observed(beforeRedo), true);
      assert.deepEqual(JSON.parse(reopened.document_json()), tip);
    } finally {
      beforeRedo.free();
    }
  } finally {
    reopened.free();
  }
  process.stdout.write(saved + "\n");
} finally {
  Date.now = realNow;
  owner?.free();
  profile.free();
}
