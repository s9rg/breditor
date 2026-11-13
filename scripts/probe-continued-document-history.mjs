/** The same actual Rust/Wasm assertions can run from the build or a packed consumer. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const [modulePath, binaryPath, fixturePath] = process.argv.slice(2);
assert.equal(process.argv.length, 5);
const runtime = await import(pathToFileURL(resolve(modulePath)).href);
const binary = readFileSync(binaryPath);
await runtime.default({module_or_path:binary});
const canonical = value => {
 if(Array.isArray(value))return value.map(canonical);
 if(value!==null&&typeof value==='object'){
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 }
 return value;
};
const root = canonical(JSON.parse(readFileSync(fixturePath, 'utf8')));
const profile = runtime.SharedRichProfile.from_configuration_json(JSON.stringify({
 format:'breditor/shared-rich-profile', formatVersion:1,
 schema:{name:'example/continued-document-history',version:1}, extensions:[],
}));

function withObservation(owner, action){
 const observed = owner.observe();
 try{return action(observed);}finally{observed.free();}
}
function insert(owner,text){
 return withObservation(owner, observation => owner.dispatch(observation, JSON.stringify({
  commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}],
 })));
}
const clock = owner => JSON.parse(owner.writer_clock_v2('101'));
const history = owner => JSON.parse(owner.segmented_history_info_json());
let owner, restored;
try{
 const descriptor = JSON.parse(profile.descriptor_json());
 owner = profile.create(JSON.stringify({
  format:'breditor/document',formatVersion:2,schema:descriptor.schema,
  schemaFingerprint:descriptor.schemaFingerprint,root,
 }), '101');
 withObservation(owner, observed => owner.enable_segmented_history(observed,'root','gen-1'));
 for(let index=0;index<1000;index++){
  if(index===500)withObservation(owner, observed => owner.seal_history_segment(observed,'gen-2'));
  assert.equal(insert(owner,'x'),true);
 }
 const before = owner.segmented_checkpoint(), acknowledged = clock(owner);
 assert.equal(history(owner).undoItems,1000);
 assert.throws(()=>insert(owner,'past V1 capacity'));
 assert.equal(owner.segmented_checkpoint(),before);
 assert.throws(()=>profile.restore_continued_history('room',before));
 withObservation(owner, observed => owner.continue_history(observed,'gen-3'));
 assert.deepEqual(clock(owner),acknowledged);
 assert.throws(()=>owner.segmented_checkpoint());
 assert.equal(insert(owner,'offline '),true);
 assert.equal(history(owner).undoItems,1001);
 assert.equal(withObservation(owner, observed => owner.undo_observed(observed)),true);
 const continued = owner.continued_history_checkpoint(), archive = JSON.parse(continued), original = JSON.parse(before);
 assert.equal(archive.continuedAfter,2);
 assert.equal(archive.rootCheckpoint,original.rootCheckpoint);
 assert.deepEqual(archive.sealed,[...original.sealed,original.active]);
 assert.throws(()=>profile.restore_segmented('room',continued));
 restored = profile.restore_continued_history('room',continued);
 assert.equal(restored.continued_history_checkpoint(),continued);
 assert.deepEqual(clock(restored),clock(owner));
 assert.equal(history(restored).redoItems,1);
 for(const command of ['redo_observed','undo_observed','undo_observed']){
  assert.equal(withObservation(owner, observed => owner[command](observed)),true);
  assert.equal(withObservation(restored, observed => restored[command](observed)),true);
  assert.equal(restored.continued_history_checkpoint(),owner.continued_history_checkpoint());
 }
 const suffix = replica => withObservation(replica, observed => replica.writer_groups_v2(observed,acknowledged.through));
 const offline = JSON.parse(suffix(restored));
 assert.equal(offline.hasMore,false);
 assert.equal(offline.groups.length,5);
 assert.equal(suffix(restored),suffix(owner));
 console.log(JSON.stringify({
  passed:true, undoGroups:1001, exactOfflineGroups:offline.groups.length,
  exactFutureHistorySteps:3, sharedWasmSha256:createHash('sha256').update(binary).digest('hex'),
 }));
}finally{
 restored?.free();
 owner?.free();
 profile.free();
}
