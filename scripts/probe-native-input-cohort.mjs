/** Fixed genuine multi-writer workload. Storage is synthetic; Rust, original
 * input files, native histories, upload leases and returned owners are real. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {flatLocalFixture} from './fixtures/flat-local-operation/session.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {pixel} from './fixtures/review-assets/pixels.mjs';
const bytes=async file=>Buffer.from(await file.arrayBuffer());
export async function probeNativeInputCohort({api,rich,internals,runtime,fixture}){
 const host=await localParticipantUnitHost({api,rich,Participant:internals.OldParent,runtime,fixture});
 const socket=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');let networkCalls=0;
 Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:class{constructor(){networkCalls++;throw Error('This local workload must not start a socket');}}});
 const result={format:'breditor/native-input-cohort-probe',formatVersion:1,passed:true,cases:0,liveWriters:0,handoffs:0,exactNativeRecords:0,wholeUploads:0,literalInputs:0,providerPixels:0,coldReopens:0,documentUndoRedo:0,reviewUndoRedo:0,laterDocumentAndReviewEdits:0,retainedVersions:0,networkCalls:0,families:2,nativeProfiles:1,historyPairs:4,fullCartesianDomain:false};
 const cases=[];
 for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])for(const order of [['snapshot','flat'],['flat','snapshot']])cases.push({order,documentSegmented,reviewSegmented});
 for(const family of ['snapshot','flat'])cases.push({order:[family,family],documentSegmented:true,reviewSegmented:true});
 try{
  for(const chosen of cases){
   const rows=[];let restore=()=>{},parts;
   try{
    for(const [index,family] of chosen.order.entries()){
     const extra={writer:index===0?'101':'303',actor:'cohort-comments-'+index,documentSegmented:chosen.documentSegmented,reviewSegmented:chosen.reviewSegmented};
     const f=family==='snapshot'?await restoredLocalFixture(host,internals.captureLocalOperationBackup,extra):await flatLocalFixture(host,extra);
     try{const seed=family==='snapshot'?f.value:f.original.value,tag=seed.f.tag;
      rows.push({id:'member-'+index,family:'local-operation-'+family,file:f.file,reference:seed.f.reference,uploads:family==='snapshot'?f.value.uploads:await bytes(f.whole),Parent:family==='snapshot'?internals.Snapshot:internals.Flat,options:{...f.options,cohort:{parentDatabase:tag+'-cohort-probe-parent',uploadsDatabase:tag+'-cohort-probe-uploads'}}});
     }finally{await f.close();}
    }
    restore=environment();
    for(const row of rows){row.parent=await row.Parent.begin(row.file,row.options);row.before=row.parent.readableSource();result.liveWriters++;}
    assert.notEqual(rows[0].before.identity.native.writer,rows[1].before.identity.native.writer);
    const take=async()=>{parts=await internals.handoffNativeInputParticipants(rows.map(r=>({id:r.id,family:r.family,operation:r.parent})));assert.equal(parts.participants.length,2);result.handoffs+=2;};
    await take();
    for(const [index,row] of rows.entries()){
     const p=parts.participants[index].parts,source=p.source.session,core=source.core;
     assert.deepEqual(source.exportRecovery(),row.before);result.exactNativeRecords++;
     assert.deepEqual(await bytes(await p.uploads.exportBackup()),row.uploads);result.wholeUploads++;
     assert.deepEqual(await bytes(p.input.file()),await bytes(row.file));assert.equal(p.input.file().type,row.file.type);result.literalInputs++;
     assert.deepEqual(await bytes(p.input.blob(row.reference.asset,row.reference.generation)),pixel);result.providerPixels++;
     await row.parent.close();
     const doc=core.documentJson();assert.equal(core.undo(),true);assert.equal(core.redo(),true);assert.equal(core.documentJson(),doc);result.documentUndoRedo++;
     assert.equal(core.undoReview().kind,'committed');assert.equal(core.redoReview().kind,'committed');result.reviewUndoRedo++;
     insertCleanupText(core,'Cohort continued document ');core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Cohort continued review'}});result.laterDocumentAndReviewEdits++;
     await source.retainVersion(core.captureVersion('Cohort version','alice','41'));result.retainedVersions++;
     await source.flush();row.later=source.exportRecovery();assert.notEqual(row.later.documentCheckpoint,row.before.documentCheckpoint);assert.notEqual(row.later.reviewCheckpoint,row.before.reviewCheckpoint);assert.equal(row.later.versions.length,row.before.versions.length+1);
     await source.close();p.uploads.close();row.parent=await row.Parent.resume(row.options);assert.deepEqual(row.parent.readableSource(),row.later);await row.parent.check();result.coldReopens++;
    }
    await take();
    for(const [index,row] of rows.entries()){const p=parts.participants[index].parts;assert.deepEqual(p.source.session.exportRecovery(),row.later);result.exactNativeRecords++;assert.deepEqual(await bytes(await p.uploads.exportBackup()),row.uploads);result.wholeUploads++;assert.deepEqual(await bytes(p.input.file()),await bytes(row.file));result.literalInputs++;assert.deepEqual(await bytes(p.input.blob(row.reference.asset,row.reference.generation)),pixel);result.providerPixels++;}
    result.cases++;
   }finally{try{for(const p of parts?.participants??[]){await p.parts.source.session.discardAndClose();p.parts.uploads.close();}for(const r of rows.toReversed())await r.parent?.discardAndClose();}finally{restore();}}
  }
  assert.equal(result.cases,10);for(const key of ['liveWriters','coldReopens','documentUndoRedo','reviewUndoRedo','laterDocumentAndReviewEdits','retainedVersions'])assert.equal(result[key],20,key);for(const key of ['handoffs','exactNativeRecords','wholeUploads','literalInputs','providerPixels'])assert.equal(result[key],40,key);assert.equal(networkCalls,0);
  return{...result,sharedWasmSha256:createHash('sha256').update(readFileSync(runtime+'/breditor_shared_bg.wasm')).digest('hex'),scope:'Ten actual two-writer cohorts in one storage context per cohort; both family orders, homogeneous cohorts and all four document/comment history pairs under the normal language3 profile. Forty real handoffs conserve complete native records, versions, whole uploads and original provider pixels; twenty later document/review edits, Undo/Redo exercises and exact cold reopens. Not all seven-family operational adoption, complete reconciliation, authenticated activation, sustainable history, physical durability or V1 approval.'};
 }finally{host.free();if(socket)Object.defineProperty(globalThis,'WebSocket',socket);else delete globalThis.WebSocket;}
}
