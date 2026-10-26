import{buildOriginalReconstructionRecipe as originalBuild}from'../packages/breditor-collaboration/dist/selected_native_reconstruction/original_recipe.js';
import{localOperationJournalIdentity}from'../packages/breditor-collaboration/dist/independent_local_operation/journal_identity.js';
import{unwrapLocalOperationHead,wrapLocalOperationHead}from'../packages/breditor-collaboration/dist/independent_local_operation/operation_head.js';
import{operationCutDigest}from'../packages/breditor-collaboration/dist/independent_operation/cut_codec.js';
import{localPortableCutRecovery}from'../packages/breditor-collaboration/dist/independent_local_operation/portable_cut.js';
import{replayLocalOperationRecovery}from'../packages/breditor-collaboration/dist/independent_local_operation/portable_replay.js';
/** Framed files are DATA: cryptographic integrity alone cannot approve journal
 * topology or loss of immutable native version packets. No sources are written. */
import test,{before,after}from'node:test';import assert from'node:assert/strict';import{join}from'node:path';
import{completeControlFixtures}from'./fixtures/physical-recovery-control/complete-fixtures.mjs';import{acceptedControlTransport}from'./fixtures/physical-recovery-control/accepted-transport.mjs';import{nativeReconstructionData}from'./fixtures/native-reconstruction/data.mjs';import{reframeReconstructionRecords}from'./fixtures/native-reconstruction/reframe.mjs';
import{LoadedNativeReconstructionCurrent as Loaded}from'../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';import{buildLocalReconstructionRecipe as build}from'../packages/breditor-collaboration/dist/selected_native_reconstruction/local_recipe.js';import{saveEvidence}from'./candidate-release/evidence.mjs';
let fixtures,transport,data;before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);data=await nativeReconstructionData(fixtures,'parent-reconstruction-contract-data');});
after(async()=>{data?.close();transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-reconstruction-parent-contract-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});

for(const[label,mutations]of[
 ['complete parent and ready recovery plans',[
  (s,p)=>{p.parent.parent.plan+=' ';},(s,p)=>{p.parent.parent.operation='0'.repeat(64);},(s,p)=>{p.parent.parent.phase='preparing';},(s,p)=>{p.parent.recovery.plan+=' ';},(s,p)=>{p.parent.recovery.phase='preparing';},(s,p)=>{p.parent.recovery.source='started';},(s,p)=>{p.parent.recovery.uploads='started';},
 ]],
 ['literal origin declarations',[
  (s,p)=>{p.parent.file.role='source-origin';},(s,p)=>{p.parent.file.bytes++;},(s,p)=>{p.parent.file.sha256='0'.repeat(64);},(s,p)=>{p.parent.original.identity.participant+='-changed';},
 ]],
])test('local reconstruction rechecks '+label+' after complete frame admission',async()=>{
 const original=await data.load();try{const valid=await build(original,{id:'independent-local',session:data.localFactory});assert.equal(valid.kind,'ready');
  for(const mutate of mutations){let candidate;try{const file=await reframeReconstructionRecords(original,fixtures.native,'independent-local',mutate);candidate=await Loaded.read(file,{wasm:fixtures.native,checkAuthority(){}});await assert.rejects(build(candidate,{id:'independent-local',session:data.localFactory}));assert.deepEqual(await indexedDB.databases(),[]);assert.deepEqual(original.file().selection,data.file.selection);}finally{candidate?.dispose();}}
 }finally{original.dispose();}
});
test('local reconstruction binds a complete self-consistent journal to actual captured namespaces',async()=>{
 const original=await data.load();let candidate;
 try{
  const entry=original.participant('independent-local'),source=structuredClone((await original.records('independent-local')).source),before=source.identity,identity=await localOperationJournalIdentity(before.database+'-unrelated',before.sourceDatabase+'-unrelated',entry.selection),ids=new Map();
  for(const row of source.snapshot.retained){const native=unwrapLocalOperationHead(row.cut.head,before);row.cut.head=wrapLocalOperationHead(native,identity);const old=row.id;row.id=await operationCutDigest(row.cut);ids.set(old,row.id);await localPortableCutRecovery(identity,row.cut);}
  const named=value=>value===null?null:ids.get(value);source.identity=identity;source.snapshot.record={...source.snapshot.record,plan:identity.plan,operation:identity.operation,current:named(source.snapshot.record.current),pending:named(source.snapshot.record.pending)};source.snapshot.observed=named(source.snapshot.observed);
  for(const slot of ['current','pending']){const hash=source.snapshot.record[slot];source.snapshot[slot]=hash===null?null:source.snapshot.retained.find(row=>row.id===hash).cut;}for(const row of source.retainedReferences)row.id=ids.get(row.id);
  const replay=await replayLocalOperationRecovery(entry.selection,data.localFactory,source.live,original.check);try{replay.check();}finally{replay.dispose();}
  const file=await reframeReconstructionRecords(original,fixtures.native,'independent-local',target=>{for(const key of Object.keys(target))delete target[key];Object.assign(target,source);});candidate=await Loaded.read(file,{wasm:fixtures.native,checkAuthority(){}});
  await assert.rejects(build(candidate,{id:'independent-local',session:data.localFactory}));assert.deepEqual(await indexedDB.databases(),[]);assert.deepEqual(original.file().selection,data.file.selection);
 }finally{candidate?.dispose();original.dispose();}
});
const originalOptions=()=>({id:'original',read:{restore:data.restore},descriptor:data.descriptor});
for(const[label,mutations]of[
 ['original parent and complete recovery plans',[
  (s,p)=>{p.parent.operation.plan+=' ';},(s,p)=>{p.parent.operation.recoveryDatabase+='-changed';},(s,p)=>{p.parent.operation.phase='unrecognized';},(s,p)=>{p.parent.recovery.plan+=' ';},(s,p)=>{p.parent.recovery.phase='preparing';},(s,p)=>{p.parent.recovery.steps[0].state='started';},
 ]],
 ['original literal input declarations',[
  (s,p)=>{p.parent.files[0].role='source-origin';},(s,p)=>{p.parent.files[0].bytes++;},(s,p)=>{p.parent.files[0].sha256='0'.repeat(64);},(s,p)=>{p.parent.selection.sha256='0'.repeat(64);},(s,p)=>{p.parent.files.push(structuredClone(p.parent.files[0]));},
 ]],
 ['self-consistent original plans under unrelated destinations',[
  (s,p)=>{const plan=JSON.parse(p.parent.recovery.plan);plan.destinations.document+='-unrelated';p.parent.recovery.plan=JSON.stringify(plan);p.parent.operation.plan=p.parent.recovery.plan;},
 ]],
])test('original reconstruction rechecks '+label+' after complete frame admission',async()=>{
 const original=await data.load();try{const valid=await originalBuild(original,originalOptions());assert.equal(valid.kind,'ready');
  for(const mutate of mutations){let candidate;try{const file=await reframeReconstructionRecords(original,fixtures.native,'original',mutate);candidate=await Loaded.read(file,{wasm:fixtures.native,checkAuthority(){}});await assert.rejects(originalBuild(candidate,originalOptions()));assert.deepEqual(await indexedDB.databases(),[]);assert.deepEqual(original.file().selection,data.file.selection);}finally{candidate?.dispose();}}
 }finally{original.dispose();}
});
test('original historical access remains inert plan data and every restored native owner is currently readonly',async()=>{
 const original=await data.load();let candidate,calls=0;
 try{
  const file=await reframeReconstructionRecords(original,fixtures.native,'original',(s,p)=>{const plan=JSON.parse(p.parent.recovery.plan);assert.ok(plan.session.review);plan.session.review.access=plan.session.review.access==='read_only'?'moderate':'read_only';p.parent.recovery.plan=JSON.stringify(plan);p.parent.operation.plan=p.parent.recovery.plan;});candidate=await Loaded.read(file,{wasm:fixtures.native,checkAuthority(){}});
  const result=await originalBuild(candidate,{...originalOptions(),read:{restore(checkpoint){const raw=data.restore(checkpoint),initialize=raw.initialize_read_only.bind(raw);raw.initialize_read_only=value=>{calls++;assert.equal(value,true,'Historical access must never become current native editing permission');return initialize(value);};return raw;}}});
  assert.equal(result.kind,'ready');assert.ok(calls>0);assert.deepEqual(await indexedDB.databases(),[]);assert.deepEqual(result.retained.selection,file.selection);assert.deepEqual(original.file().selection,data.file.selection);
 }finally{candidate?.dispose();original.dispose();}
});
