/** Native-valid packets are not permission to overwrite current queue work.
 * Reframing below changes DATA only; no stored source/journal row is replaced.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {deliveryOlderDisk} from './fixtures/native-reconstruction/delivery-older-disk.mjs';
import {sourceSnapshot} from './fixtures/native-reconstruction/older-disk.mjs';
import {reframeReconstructionRecords} from './fixtures/native-reconstruction/reframe.mjs';
import {LoadedNativeReconstructionCurrent as Loaded} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {buildDeliveryReconstructionRecipe as build} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/delivery_recipe.js';
import {inspectDeliveryNativeReconstruction as inspect} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_delivery.js';
import {verifyDeliveryReconstructionPackets as verifyPackets} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/delivery_packets.js';
import {replayPortableRecovery} from '../packages/breditor-collaboration/dist/independent_operation/portable_replay.js';
import {SharedIndependentDeliveryParticipantBackup as Backup} from '../packages/breditor-collaboration/dist/independent_delivery_participant/backup.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport,f,oldSource,oldJournal,names;
before(async()=>{
 fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);
 f=await deliveryOlderDisk(fixtures,'delivery-reconstruction-contracts',{documentSegmented:false,reviewSegmented:false});
 oldSource=await sourceSnapshot(f.database);oldJournal=await sourceSnapshot(f.journal);names=(await indexedDB.databases()).map(row=>row.name).sort();
});
after(async()=>{
 await f?.close();transport?.restore();await fixtures?.close();
 if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-reconstruction-delivery-contract-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}
});
const guard=()=>f.loaded.check();
async function unchanged(){assert.deepEqual((await indexedDB.databases()).map(row=>row.name).sort(),names);assert.deepEqual(await sourceSnapshot(f.database),oldSource);assert.deepEqual(await sourceSnapshot(f.journal),oldJournal);}
async function admitted(recovery){
 const replay=await replayPortableRecovery({...f.factory,database:'unused-delivery-data-only',create(){throw Error('No empty source fallback');}},recovery,guard);
 try{replay.check();}finally{replay.dispose();}
}
for(const [label,mutate] of [
 ['dropped nonempty suggestion and revision queues',source=>{assert.ok(source.live.retained.suggestions.retained.length);assert.ok(source.live.retained.revisions.retained.length);source.live.retained.suggestions.retained=[];source.live.retained.revisions.retained=[];}],
 ['changed queued review decision',source=>{const row=source.live.retained.suggestions.retained.find(row=>row.intent?.requested==='reject');assert.ok(row);row.intent.requested='accept';}],
 ['changed retained revision retry intent',source=>{assert.ok(source.live.retained.revisions.retained.length);const row=source.live.retained.revisions.retained[0];row.retry=!row.retry;}],
 ['dropped nonempty queued version packets',source=>{assert.ok(source.live.retained.versions.packets.length);source.live.retained.versions.packets=[];}],
])test('delivery reconstruction requires merge for '+label+' despite successful native packet admission',async()=>{
 let candidate;
 try{
  const file=await reframeReconstructionRecords(f.loaded,fixtures.native,'independent-delivery',mutate);candidate=await Loaded.read(file,{wasm:fixtures.native,checkAuthority(){}});
  assert.notDeepEqual(file.selection,f.retained.selection);const recovery=(await candidate.records('independent-delivery')).source.live;await admitted(recovery);
  await assert.rejects(inspect(f.s.owner,f.s.input(),{id:'independent-delivery',retained:file}),error=>error.code==='native_reconstruction_requires_merge');
  await unchanged();
 }finally{candidate?.dispose();}
});
test('delivery reconstruction refuses dropped nonempty immutable native versions after complete frame and native admission',async()=>{
 let candidate;
 try{
  const file=await reframeReconstructionRecords(f.loaded,fixtures.native,'independent-delivery',source=>{assert.ok(source.live.source.versions.length);source.live.source.versions=[];});candidate=await Loaded.read(file,{wasm:fixtures.native,checkAuthority(){}});
  await admitted((await candidate.records('independent-delivery')).source.live);
  await assert.rejects(build(candidate,{id:'independent-delivery',session:f.factory}));await unchanged();
 }finally{candidate?.dispose();}
});
test('delivery reconstruction admits additional complete native-valid packet rows without finalizing decisions',async()=>{
 const after=structuredClone(f.source.live),before=structuredClone(after);
 before.retained.suggestions.retained=[];before.retained.revisions.retained=[];before.retained.versions.packets=[];
 await admitted(before);await admitted(after);verifyPackets(before,after);
 const result=await build(f.loaded,{id:'independent-delivery',session:f.factory});assert.equal(result.kind,'ready');
 const backup=await Backup.read(result.participant.file,result.participant.selection);
 try{assert.deepEqual(backup.sourceRecovery(),after);assert.ok(after.retained.suggestions.retained.some(row=>row.intent&&row.decision===null));}finally{backup.dispose();}
 await unchanged();
});
test('delivery reconstruction refuses reordered immutable versions that still pass older set-membership continuity',async()=>{
 let candidate;
 try{
  const file=await reframeReconstructionRecords(f.loaded,fixtures.native,'independent-delivery',source=>{assert.ok(source.live.source.versions.length>=2);source.live.source.versions.reverse();});
  candidate=await Loaded.read(file,{wasm:fixtures.native,checkAuthority(){}});
  const after=(await candidate.records('independent-delivery')).source.live;
  assert.ok(f.source.live.source.versions.every(packet=>after.source.versions.includes(packet)));await admitted(after);
  await assert.rejects(build(candidate,{id:'independent-delivery',session:f.factory}),error=>error.code==='native_reconstruction_requires_merge');await unchanged();
 }finally{candidate?.dispose();}
});
test('delivery reconstruction rechecks the complete parent plan and every exact retained journal cut',async()=>{
 for(const [label,mutate] of [
  ['unknown observed cut',source=>{source.snapshot.observed='0'.repeat(64);}],
  ['rewritten retained digest',source=>{source.snapshot.retained[0].id='1'.repeat(64);}],
  ['duplicate retained cut',source=>{source.snapshot.retained.push(structuredClone(source.snapshot.retained[0]));}],
  ['mismatched current row',source=>{source.snapshot.current.head+=' ';}],
  ['changed parent plan',(source,root)=>{root.parent.recovery.plan+=' ';}],
  ['changed LIVE native identity',source=>{source.live.source.identity.review.actor+='-changed';}],
  ['changed LIVE retained binding',source=>{source.live.retainedBinding.versions=null;}],
  ['unknown LIVE field',source=>{source.live.unknownReconstructionField=true;}],
 ]){
  let candidate;
  try{
   const file=await reframeReconstructionRecords(f.loaded,fixtures.native,'independent-delivery',mutate);candidate=await Loaded.read(file,{wasm:fixtures.native,checkAuthority(){}});
   await assert.rejects(build(candidate,{id:'independent-delivery',session:f.factory}),undefined,label);await unchanged();
  }finally{candidate?.dispose();}
 }
});
