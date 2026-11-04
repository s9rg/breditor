/** Compare actual legacy/candidate Wasm checkpoint bytes and future native histories.
 * Both modules remain separate; no AST conversion, history pruning or format inference. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2);
if(args.length!==2)throw Error('Expected explicit previous and candidate normal runtime directories');
const sha=value=>createHash('sha256').update(value).digest('hex');
async function load(directory){
 const bytes=fs.readFileSync(resolve(directory,'breditor_shared_bg.wasm'));
 const module=await import(pathToFileURL(resolve(directory,'breditor_shared.js')));
 await module.default({module_or_path:bytes});
 return {module,sha256:sha(bytes)};
}
const previous=await load(args[0]),candidate=await load(args[1]);
const root=JSON.parse(fs.readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8'));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
let cases=0,exactComparisons=0,legacyToCandidateRestores=0,candidateToLegacyRestores=0,futureHistoryPairs=0,peerDeliveries=0;
function observed(owner,scope,work){const observation=scope===2?owner.observe_document():owner.observe();try{return work(observation);}finally{observation.free();}}
function insert(owner,scope,text){return observed(owner,scope,o=>owner.dispatch(o,JSON.stringify({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]})));}
function equal(before,after){assert.equal(after.segmented_checkpoint(),before.segmented_checkpoint());assert.equal(after.document_json(),before.document_json());exactComparisons++;}
for(const version of [1,2,3])for(const standard of [false,true])for(const scope of [0,1,2])for(const mask of [0,1,2,3,4,5,6,7]){
 const factory=version===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?'from_standard_configuration_json_v':'from_configuration_json_v')+version;
 const configuration=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:version,schema:{name:'example/segmented-byte-compatibility',version:1},extensions:[]});
 const oldProfile=previous.module.SharedRichProfile[factory](configuration),newProfile=candidate.module.SharedRichProfile[factory](configuration);
 let oldOwner,newOwner,peer,legacyAgain;
 try{
  assert.equal(newProfile.descriptor_json(),oldProfile.descriptor_json());
  const descriptor=JSON.parse(oldProfile.descriptor_json());
  const document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(root)});
  oldOwner=oldProfile.create(document,'101');
  if(scope===1)observed(oldOwner,0,o=>oldOwner.enable_general_ranges(o));
  if(scope===2)observed(oldOwner,0,o=>oldOwner.enable_document_selection(o));
  if(mask&1)observed(oldOwner,scope,o=>oldOwner.enable_typing_history(o));
  if(mask&2)observed(oldOwner,scope,o=>oldOwner.enable_reviewed_history(o,JSON.stringify({binding:'a'.repeat(64),principal:'alice',effectWriter:'900'})));
  if(mask&4)observed(oldOwner,scope,o=>oldOwner.enable_search_history(o));
  insert(oldOwner,scope,'Root 🙂 ');
  observed(oldOwner,scope,o=>oldOwner.enable_segmented_history(o,'compat-root','compat-one'));
  insert(oldOwner,scope,'Saved redo 日本語 ');
  assert.equal(observed(oldOwner,scope,o=>oldOwner.undo_observed(o)),true);
  observed(oldOwner,scope,o=>oldOwner.seal_history_segment(o,'compat-two'));
  const saved=oldOwner.segmented_checkpoint();
  newOwner=newProfile.restore_segmented('room',saved);legacyToCandidateRestores++;equal(oldOwner,newOwner);
  peer=oldProfile.join_frame('room','202',oldOwner.update_frame());insert(peer,0,'peer ');
  const frame=peer.update_frame();oldOwner.receive_frame(frame);newOwner.receive_frame(frame);peerDeliveries+=2;equal(oldOwner,newOwner);
  insert(oldOwner,scope,'Same next native operation ');insert(newOwner,scope,'Same next native operation ');equal(oldOwner,newOwner);
  for(const method of ['undo_observed','redo_observed','undo_observed','redo_observed']){
   assert.equal(observed(newOwner,scope,o=>newOwner[method](o)),observed(oldOwner,scope,o=>oldOwner[method](o)));
   equal(oldOwner,newOwner);futureHistoryPairs++;
  }
  observed(oldOwner,scope,o=>oldOwner.seal_history_segment(o,'compat-three'));
  observed(newOwner,scope,o=>newOwner.seal_history_segment(o,'compat-three'));equal(oldOwner,newOwner);
  legacyAgain=oldProfile.restore_segmented('room',newOwner.segmented_checkpoint());candidateToLegacyRestores++;equal(newOwner,legacyAgain);
  assert.equal(oldOwner.document_json().includes('peer'),true);
  cases++;
 }catch(error){console.error(JSON.stringify({version,standard,scope,mask}));throw error;}
 finally{legacyAgain?.free();peer?.free();newOwner?.free();oldOwner?.free();newProfile.free();oldProfile.free();}
}
assert.equal(cases,144);assert.equal(futureHistoryPairs,576);assert.equal(legacyToCandidateRestores,144);assert.equal(candidateToLegacyRestores,144);
console.log(JSON.stringify({format:'breditor/segmented-runtime-byte-compatibility',passed:true,previousWasmSha256:previous.sha256,candidateWasmSha256:candidate.sha256,cases,exactComparisons,legacyToCandidateRestores,candidateToLegacyRestores,futureHistoryPairs,peerDeliveries,scope:'Two independently initialized normal Wasm modules; exact legacy/candidate segmented bytes, original feature identities, bidirectional cold restore, real peer work and future Undo/Redo. No physical storage, browser or whole-room activation qualification.'},null,2));
