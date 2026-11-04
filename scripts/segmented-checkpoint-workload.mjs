/** Compare explicit normal Wasm runtimes on a bounded native history workload.
 * Keep exact bytes, peer work and future history as requirements. Timings are
 * local observations; this command cannot promote a runtime or qualify V1. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const args=process.argv.slice(2);
if((args.length!==2&&args.length!==3)||!['64','256'].includes(args[2]??'256'))
 throw Error('Expected previous-runtime candidate-runtime [64|256 actions per segment]');
const rounds=Number(args[2]??'256'),sha=value=>createHash('sha256').update(value).digest('hex');
const directories=args.slice(0,2).map(path=>fs.realpathSync(path));
assert.notEqual(directories[0],directories[1],'Independent module locations are required');
const moduleFiles=directories.map(directory=>fs.realpathSync(resolve(directory,'breditor_shared.js')));
assert.notEqual(moduleFiles[0],moduleFiles[1],'Independent module files are required');
async function load(directory){
 const file=resolve(directory,'breditor_shared_bg.wasm'),bytes=fs.readFileSync(file);
 const module=await import(pathToFileURL(resolve(directory,'breditor_shared.js')));
 await module.default({module_or_path:bytes});return {module,file,sha256:sha(bytes)};
}
const previous=await load(directories[0]),candidate=await load(directories[1]);
assert.notEqual(previous.module.SharedRichProfile,candidate.module.SharedRichProfile,'Independent native bindings are required');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
 ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const root=canonical(JSON.parse(fs.readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')));
const configuration=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/large-segmented-encoding',version:1},extensions:[]});
let oldProfile,newProfile,before,after,restored,peer,exactComparisons=0;
function observed(owner,work){const observation=owner.observe_document();try{return work(observation);}finally{observation.free();}}
const insert=(owner,text)=>observed(owner,o=>owner.dispatch(o,JSON.stringify({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]})));
function equal(){assert.equal(after.segmented_checkpoint(),before.segmented_checkpoint());assert.equal(after.document_json(),before.document_json());exactComparisons++;}
try{
 oldProfile=previous.module.SharedRichProfile.from_standard_configuration_json_v3(configuration);
 newProfile=candidate.module.SharedRichProfile.from_standard_configuration_json_v3(configuration);
 assert.equal(newProfile.descriptor_json(),oldProfile.descriptor_json());
 const descriptor=JSON.parse(oldProfile.descriptor_json());
 before=oldProfile.create(JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root}),'101');
 {const observation=before.observe();try{before.enable_document_selection(observation);}finally{observation.free();}}
 observed(before,o=>before.enable_typing_history(o));
 observed(before,o=>before.enable_reviewed_history(o,JSON.stringify({binding:'a'.repeat(64),principal:'alice',effectWriter:'900'})));
 observed(before,o=>before.enable_search_history(o));
 insert(before,'Root 🙂 ');observed(before,o=>before.enable_segmented_history(o,'large-root','large-one'));
 const text='Native bytes 日本語 🙂 '.padEnd(512,'x');
 for(let i=0;i<rounds;i++)insert(before,text);
 observed(before,o=>before.seal_history_segment(o,'large-two'));
 for(let i=0;i<rounds;i++)insert(before,text);
 for(let i=0;i<3;i++)assert.equal(observed(before,o=>before.undo_observed(o)),true);
 const retained=before.segmented_checkpoint();
 after=newProfile.restore_segmented('room',retained);equal();

 // Alternate order to avoid giving either module every first sample. Exact
 // comparisons are included in these local timings; there is no pass threshold.
 const samples=[];
 for(let sample=0;sample<5;sample++){
  const durations={};
  for(const label of sample%2?['candidate','previous']:['previous','candidate']){
   const owner=label==='previous'?before:after,start=performance.now();
   for(let i=0;i<3;i++)assert.equal(owner.segmented_checkpoint(),retained);
   durations[label]=performance.now()-start;
  }
  samples.push(durations);
 }

 peer=oldProfile.join_frame('room','202',before.update_frame());
 {const observation=peer.observe();try{peer.dispatch(observation,JSON.stringify({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Actual concurrent peer '}}]}));}finally{observation.free();}}
 const frame=peer.update_frame();before.receive_frame(frame);after.receive_frame(frame);equal();
 const futureHistory=[];
 for(const method of ['redo_observed','undo_observed','redo_observed','undo_observed']){
  const oldResult=observed(before,o=>before[method](o)),newResult=observed(after,o=>after[method](o));
  assert.equal(oldResult,true,'The original redo/undo must remain usable after peer work');
  assert.equal(newResult,oldResult);equal();futureHistory.push({method,result:newResult});
  assert.ok(after.document_json().includes('Actual concurrent peer '),'Selective local history must retain peer text');
 }
 observed(before,o=>before.seal_history_segment(o,'large-three'));
 observed(after,o=>after.seal_history_segment(o,'large-three'));equal();
 restored=oldProfile.restore_segmented('room',after.segmented_checkpoint());
 assert.equal(restored.segmented_checkpoint(),after.segmented_checkpoint());
 assert.equal(restored.document_json(),after.document_json());exactComparisons++;
 for(const input of [previous,candidate])assert.equal(sha(fs.readFileSync(input.file)),input.sha256,'An input runtime changed');
 const median=values=>values.toSorted((a,b)=>a-b)[Math.floor(values.length/2)];
 const previousMedianMs=median(samples.map(row=>row.previous)),candidateMedianMs=median(samples.map(row=>row.candidate));
 console.log(JSON.stringify({format:'breditor/segmented-checkpoint-workload',formatVersion:1,passed:true,node:process.version,platform:process.platform,architecture:process.arch,previousWasmSha256:previous.sha256,candidateWasmSha256:candidate.sha256,actionsPerSegment:rounds,nativeTextInsertions:1+rounds*2,configuration:{language:3,standard:true,documentSelection:true,typing:true,reviewed:true,search:true},checkpointBytes:Buffer.byteLength(retained),checkpointSha256:sha(retained),samples,encodesPerSample:3,timedCheckpointComparisons:30,previousMedianMs,candidateMedianMs,medianReductionFraction:1-candidateMedianMs/previousMedianMs,exactComparisons,futureHistory,bidirectionalColdRestores:2,realPeerDeliveries:2,runtimeInputsUnchanged:true,runtimePromoted:false,scope:'Two actual normal Wasm modules, bounded native segmented actions, exact checkpoints, genuine peer updates and usable future selective Undo/Redo. Busy-host timing includes byte comparisons; no complete recovery performance, supported-limit or V1 qualification.'},null,2));
}finally{
 restored?.free();peer?.free();after?.free();before?.free();newProfile?.free();oldProfile?.free();
}
