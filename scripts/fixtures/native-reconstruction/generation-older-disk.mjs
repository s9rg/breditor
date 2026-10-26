/** Real generation writes fail after an exact attempt has been prepared. Newer
 * pending and LIVE native work remains in memory; cold reopen reads older disk.
 * All three explicit source kinds use their genuine seven-family room owner.
 */
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
import {selectedProviderSession,selectStart} from '../selected-room-provider/session.mjs';
import {LoadedNativeReconstructionCurrent as Loaded} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {generationReferenceRecordStates} from '../../../packages/breditor-collaboration/dist/generation_source/record_reference_capture.js';
import {checkGenerationRecords} from '../../../packages/breditor-collaboration/dist/generation_source/validate_records.js';
import {sourceNativeRecoveryRead} from '../../../packages/breditor-collaboration/dist/source_native_read.js';
import {waitNativePendingWork} from '../../../packages/breditor-collaboration/dist/native_pending_work.js';
const settled=core=>waitNativePendingWork(core,{check(){},watch(){return()=>{};}});
export async function generationOlderDisk(fixtures,tag,kind){
 const s=await selectedProviderSession(fixtures,tag,{documentSegmented:false,reviewSegmented:false,generationKind:kind,generationExtraVersion:true}),integrity={wasm:fixtures.native,checkAuthority(){}},put=IDBObjectStore.prototype.put,add=IDBObjectStore.prototype.add;
 let basisRead,loaded;
 const pair=core=>({checkpoint:core.checkpointJson(),review:core.reviewCheckpoint(),document:core.documentJson()});
 try{
  const client=s.owner.clients.find(row=>row.id==='generation');selectStart(client.core);await settled(client.core);
  const descriptor=JSON.stringify(sourceNativeRecoveryRead(client.core).descriptor()),basis=await s.retain();basisRead=await Loaded.read(basis,integrity);
  const member=basisRead.nativeCut().root().participants.find(row=>row.id==='generation'),database=member.namespaces.find(row=>row.role==='source').database,before=pair(client.core);
  basisRead.dispose();basisRead=undefined;let failures=0;
  const fault=function(original,args){if(this.transaction.db.name===database){failures++;throw Error('Test-owned generation source write failed after exact attempt');}return original.apply(this,args);};
  IDBObjectStore.prototype.put=function(...args){return fault.call(this,put,args);};IDBObjectStore.prototype.add=function(...args){return fault.call(this,add,args);};
  client.core.type('Prepared generation attempt 🙂 ');await settled(client.core);assert.ok(failures>0);const attempted=pair(client.core);
  client.core.type('Newer generation pending 🙂 ');client.core.dispatchReview({kind:'create_thread',data:{anchorJson:client.core.captureReviewAnchor({kind:'document'}),body:'Newer generation comment'}});client.core.undoReview();await settled(client.core);
  const live=pair(client.core),retained=await s.retain();loaded=await Loaded.read(retained,integrity);const source=(await loaded.records('generation')).source,m=source.records;
  assert.equal(source.identity.kind,kind);assert.equal(m.committed.checkpoint,before.checkpoint);assert.ok(m.attempt);assert.ok(m.attempt.cut);assert.ok(m.pending);
  assert.ok(m.live.versions.length>=2);
  assert.equal(m.attempt.capture.checkpoint,attempted.checkpoint);assert.equal(m.attempt.capture.review.checkpoint,attempted.review);
  assert.equal(m.pending.checkpoint,live.checkpoint);assert.equal(m.live.checkpoint,live.checkpoint);assert.equal(m.live.review.checkpoint,live.review);assert.notEqual(m.committed.checkpoint,m.attempt.capture.checkpoint);assert.notEqual(m.attempt.capture.checkpoint,m.live.checkpoint);
  const original=JSON.parse(before.checkpoint),newer=JSON.parse(live.checkpoint);assert.deepEqual(newer.sealed,original.sealed);assert.equal(newer.rootCheckpoint,original.rootCheckpoint);assert.ok(original.sealed.length>0);
  const records=generationReferenceRecordStates(source.identity,m).at(-1).records,recovery=checkGenerationRecords(source.identity,records).recovery;
  if(kind==='retained'){assert.ok(recovery.retained.suggestions.retained.length>0);assert.ok(recovery.retained.revisions.retained.length>0);assert.ok(recovery.retained.versions.packets.length>0);}
  IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;
  await s.owner.discardAndClose();await s.cold(basis);const after=pair(s.owner.clients.find(row=>row.id==='generation').core);
  assert.equal(after.document,before.document);assert.notEqual(after.checkpoint,live.checkpoint);assert.notEqual(after.review,live.review);
  const originalOptions=s.f.f.rows.find(row=>row.id==='generation').owner.options;
  const {database:_database,create:_create,initialGenerations:_generations,initialReviewCheckpoint:_initialReview,binding,retained:retainedBinding,...native}=originalOptions;
  const factory={kind,options:{...native,readOnly:true,review:{...native.review,access:'read_only'},...(kind!=='local'?{binding}:{}),...(kind==='retained'?{retained:retainedBinding}:{})}};
  return{s,basis,retained,loaded,source,recovery,descriptor,before,attempted,live,after,database,failures,factory,read:s.f.reads.find(row=>row.id==='generation').read,async close(){loaded.dispose();await s.close();}};
 }catch(error){IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;loaded?.dispose();await s.close();throw error;}
 finally{IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;basisRead?.dispose();}
}
