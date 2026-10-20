/** Actual native retirement and storage upgrades: readable bytes are not live custody. */
import assert from "node:assert/strict";
import {SharedParticipantRecovery,OperationalSharedParticipant,SharedRichEditor,createSharedDocumentEditor} from "../../../packages/breditor-collaboration/dist/index.js";
import {RecoveryLease} from "../../../packages/breditor-collaboration/dist/participant_recovery/lease.js";
import {database,dump} from "../room-recovery-catalog/storage.mjs";
async function discard(parts){await parts.sources.revisions?.discardAndClose();await parts.sources.suggestions?.discardAndClose();await parts.sources.versions?.discardAndClose();await parts.session.discardAndClose();parts.uploads.close();}
async function cut(parts,paired){return {document:parts.session.core.checkpointJson(),review:paired?parts.session.core.reviewCheckpoint():null,paired:paired?parts.session.exportRecovery():null,suggestions:parts.sources.suggestions?.exportRecovery()??null,revisions:parts.sources.revisions?.exportRecovery()??null,versions:parts.sources.versions?.exportRecovery()??null,uploads:new Uint8Array(await(await parts.uploads.exportBackup()).arrayBuffer())};}
export async function checkParticipantManagedHandoffs(input,restore,{modes=["ready","operational"],faults=["source-upgrade","core-retire"]}={}){
 const counts={readySourceUpgrade:0,operationalSourceUpgrade:0,readyCoreRetire:0,operationalCoreRetire:0,readableSourceExports:0,unchangedStoredRecords:0,freshRecoveries:0,futureDocumentCheckpoints:0,futureReviewCheckpoints:0},paired=input.session.kind.includes("paired");
 for(const mode of modes)for(const fault of faults){
  const tag=`${input.database}-managed-${mode}-${fault}`,selected={...input,database:tag,destinations:Object.fromEntries(Object.entries(input.destinations).map(([key,name])=>[key,`${name}-managed-${mode}-${fault}`])),checkAuthority(){}},expected=input.expected;
  let attempt,ready,owner,parts,reference;
  try{
   attempt=await SharedParticipantRecovery.begin(selected);ready=await attempt.finish();await attempt.close();attempt=undefined;
   const original={sources:ready.sources,session:ready.session,uploads:ready.uploads},before=await cut(original,paired),stored=await dump(selected.destinations.document),backupBefore=await original.session.exportBackup();
   owner=mode==="ready"?ready:await OperationalSharedParticipant.begin({database:tag+"-operation",recovered:ready,expected,checkAuthority(){}});
   const close=RecoveryLease.prototype.close;let fired=false;try{
    RecoveryLease.prototype.close=async function(...args){await close.apply(this,args);if(!fired){fired=true;if(fault==="source-upgrade"){const db=await database(selected.destinations.document,2);db.close();}else original.session.core.retire();}};
    await assert.rejects(owner.intoParts().then(value=>{parts=value;}),error=>error.code===(fault==="source-upgrade"?"managed_source_unavailable":"retired"));
   }finally{RecoveryLease.prototype.close=close;}
   assert.equal(fired,true);assert.deepEqual(await cut(original,paired),before);assert.equal(await original.session.exportBackup(),backupBefore);counts.readableSourceExports++;
   const after=await dump(selected.destinations.document);assert.equal(after.version,fault==="source-upgrade"?2:stored.version);assert.deepEqual(after.stores,stored.stores);counts.unchangedStoredRecords++;
   assert.throws(()=>original.session.core.type("Must remain retired"),error=>error.code==="retired");assert.equal(original.session.core.checkpointJson(),before.document);
   await assert.rejects(owner.intoParts(),error=>error.code===(mode==="ready"?"recovery_closed":"operation_closed"));await owner.discardAndClose();owner=undefined;await ready.discardAndClose();ready=undefined;
   // An upgraded destination is not silently downgraded or rewritten. Fresh exact
   // recovery to separately named targets also proves the old native leases released.
   const fresh={...selected,database:tag+"-fresh",destinations:Object.fromEntries(Object.entries(selected.destinations).map(([key,name])=>[key,name+"-fresh"]))};
   attempt=await SharedParticipantRecovery.begin(fresh);ready=await attempt.finish();await attempt.close();attempt=undefined;parts=await ready.intoParts();assert.deepEqual(await cut(parts,paired),before);counts.freshRecoveries++;
   const source=expected.identity.source,options={...(input.session.options.reviewedHistory?{reviewedHistory:input.session.options.reviewedHistory}:{}),...(source.searchHistory?{searchHistory:"search-v1"}:{})};reference=source.selectionEditing==="document-v1"?createSharedDocumentEditor(restore(before.document),options):new SharedRichEditor(restore(before.document),options);if(paired)reference.enableReview(input.session.options.review,before.review);parts.session.core.setReadOnly(false);reference.setReadOnly(false);
   for(const method of ["redo","undo"]){assert.equal(parts.session.core[method](),reference[method]());assert.equal(parts.session.core.checkpointJson(),reference.checkpointJson());counts.futureDocumentCheckpoints++;if(paired){parts.session.core[method+"Review"]();reference[method+"Review"]();assert.equal(parts.session.core.reviewCheckpoint(),reference.reviewCheckpoint());counts.futureReviewCheckpoints++;}}
   counts[mode+(fault==="source-upgrade"?"SourceUpgrade":"CoreRetire")]++;await discard(parts);parts=undefined;
  }finally{if(parts)await discard(parts);await owner?.discardAndClose();await ready?.discardAndClose();await attempt?.close();reference?.dispose();}
 }
 return counts;
}
