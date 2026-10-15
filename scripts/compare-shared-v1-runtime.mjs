/** Compare original V1 semantics across two real application Wasm builds; never publishes. */
import assert from "node:assert/strict";
import {readFileSync, realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {dirname, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configuration = JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:1,
  schema:{name:"example/v1-runtime-compatibility",version:1},extensions:[]});
async function load(directory) {
  const entry = resolve(directory, "breditor_shared.js");
  const wasm = readFileSync(resolve(directory, "breditor_shared_bg.wasm"));
  const module = await import(pathToFileURL(entry));
  await module.default({module_or_path:wasm});
  return {module, sha256:createHash("sha256").update(wasm).digest("hex")};
}
function guarded(owner, callback) {
  const observation = owner.observe();
  try { return callback(observation); } finally { observation.free(); }
}
function dispatch(owner, commands) {
  return guarded(owner, observation => owner.dispatch(observation, JSON.stringify({commands})));
}
function command(kind, data) { return {kind, data}; }
function canonical(value) {
  return Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
function frameBinding(owner) {
  const {bytes, ...binding} = JSON.parse(owner.update_frame());
  assert.ok(bytes.length > 0);
  return binding;
}
function lineage(owner) {
  const groups = JSON.parse(guarded(owner, observation => owner.writer_groups(observation, "0")));
  groups.groups = groups.groups.map(encoded => {
    const {bytes, payloadDigest, ...semantic} = JSON.parse(encoded);
    assert.ok(bytes.length > 0);
    assert.match(payloadDigest, /^sha256:[a-f0-9]{64}$/);
    return semantic;
  });
  return groups;
}

/** Exact journals, observations, semantic lineage and cross-version future replay. */
export async function compareSharedV1Runtimes(beforeDirectory, afterDirectory) {
  const before = await load(beforeDirectory), after = await load(afterDirectory);
  const oldProfile = before.module.SharedRichProfile.from_standard_configuration_json_v1(configuration);
  const newProfile = after.module.SharedRichProfile.from_standard_configuration_json_v1(configuration);
  const owned = [oldProfile, newProfile];
  let checkpoints = 0, crossRestores = 0, phase = "profile comparison";
  function equal(a, b) {
    assert.equal(b.descriptor_json(), a.descriptor_json(), "V1 owner descriptor bytes");
    assert.equal(b.document_json(), a.document_json(), "V1 document bytes");
    assert.equal(b.checkpoint(), a.checkpoint(), "V1 journal bytes and expected effects");
    assert.equal(b.causal_version(), a.causal_version(), "V1 causal clocks");
    assert.equal(b.view_json(), a.view_json(), "V1 read view bytes");
    assert.deepEqual(frameBinding(b), frameBinding(a), "V1 update bindings");
    assert.deepEqual(lineage(b), lineage(a), "V1 canonical writer lineage digests");
    assert.equal(guarded(b, o => b.presence_frame(o)), guarded(a, o => a.presence_frame(o)), "V1 presence bytes");
    checkpoints += 1;
  }
  try {
    assert.equal(newProfile.descriptor_json(), oldProfile.descriptor_json());
    assert.equal(newProfile.inline_catalog_json(), oldProfile.inline_catalog_json());
    const binding = JSON.parse(oldProfile.descriptor_json());
    const rootValue = JSON.parse(readFileSync(resolve(root, "crates/breditor-core/tests/fixtures/rich-local-root.json"), "utf8"));
    const document = JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,
      schemaFingerprint:binding.schemaFingerprint,root:canonical(rootValue)});
    phase = "old runtime seed";
    const oldA = oldProfile.create(document, "101"); owned.push(oldA);
    phase = "new runtime seed";
    const newA = newProfile.create(document, "101"); owned.push(newA);
    phase = "seed comparison";
    equal(oldA, newA);
    const genesis = oldA.update_frame();
    phase = "old runtime join";
    const oldB = oldProfile.join_frame("room", "202", genesis); owned.push(oldB);
    phase = "new runtime join";
    const newB = newProfile.join_frame("room", "202", genesis); owned.push(newB);
    phase = "join comparison";
    equal(oldB, newB);
    const caret = JSON.stringify({kind:"text",anchor:{block:"p",offset:"1",affinity:"after"},focus:{block:"p",offset:"1",affinity:"after"}});
    for (const owner of [oldA, newA]) guarded(owner, o => owner.set_selection(o, caret));
    equal(oldA, newA);
    for (const commands of [
      [command("set_heading", {block:"p",level:3})],
      [command("split_text_block", {block:"p",offset:1,right:"right",right_heading:null})],
      [command("insert_text", {block:"right",offset:0,text:"Local "})],
      [command("set_format", {block:"right",offset:0,length:5,format:{type:"breditor-inline/italic",properties:{}},enabled:true})],
      [command("set_image_alt", {block:"image-block",text:"New description",decorative:false}),
       command("resize_column", {block:"table-block",column:"c",width:240})],
    ]) {
      phase = `dispatch ${commands.map(value => value.kind).join(", ")}`;
      assert.equal(dispatch(oldA, commands), dispatch(newA, commands));
      equal(oldA, newA);
    }
    phase = "offline typing and reconnect";
    for (const owner of [oldB, newB]) dispatch(owner, [command("insert_text", {block:"p",offset:1,text:"Remote "})]);
    equal(oldB, newB);
    const aFrame = oldA.update_frame(), bFrame = oldB.update_frame();
    for (const owner of [oldA, newA]) owner.receive_frame(bFrame);
    for (const owner of [oldB, newB]) owner.receive_frame(aFrame);
    equal(oldA, newA); equal(oldB, newB);
    assert.equal(oldA.document_json(), oldB.document_json());
    phase = "cross-version restore";
    const oldFromNew = oldProfile.restore("room", newA.checkpoint()); owned.push(oldFromNew);
    const newFromOld = newProfile.restore("room", oldA.checkpoint()); owned.push(newFromOld);
    equal(oldA, oldFromNew); equal(oldA, newFromOld); crossRestores += 2;
    for (const redo of [false,false,false,false,false,false,true,true,true,true,true,true]) {
      phase = redo ? "future redo" : "future undo";
      const results = [oldA,newA,oldFromNew,newFromOld].map(owner => guarded(owner, o => redo ? owner.redo_observed(o) : owner.undo_observed(o)));
      assert.ok(results.every(value => value === results[0]));
      equal(oldA, newA); equal(oldA, oldFromNew); equal(oldA, newFromOld);
    }
    for (const owner of [oldA,newA]) {
      const journal = owner.checkpoint();
      assert.throws(() => dispatch(owner, [command("set_code_block", {block:"p",language:null,format_policy:"remove_formats"})]));
      assert.equal(owner.checkpoint(), journal, "V1 rejects new-model commands without publication");
    }
    return {format:"breditor/shared-v1-runtime-comparison",formatVersion:1,
      beforeWasmSha256:before.sha256,afterWasmSha256:after.sha256,
      comparedCheckpoints:checkpoints,crossVersionRestores:crossRestores,
      futureHistorySteps:12,modelVersion:11,journalVersion:12,passed:true};
  } catch (error) {
    throw new Error(`Shared V1 compatibility failure during ${phase}: ${String(error)}`, {cause:error});
  } finally {
    for (const owner of owned.reverse()) owner.free();
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error("Usage: node scripts/compare-shared-v1-runtime.mjs BEFORE_DIRECTORY AFTER_DIRECTORY");
    process.exitCode = 2;
  } else console.log(JSON.stringify(await compareSharedV1Runtimes(...args), null, 2));
}
