/** Real original native owners; change host policy only after an actual coordination release. */
import assert from "node:assert/strict";
import {SharedParticipantRecovery,OperationalSharedParticipant,SharedRichEditor,createSharedDocumentEditor} from "../../../packages/breditor-collaboration/dist/index.js";
import {RecoveryLease} from "../../../packages/breditor-collaboration/dist/participant_recovery/lease.js";
async function closeParts(parts){await parts.sources.revisions?.close();await parts.sources.suggestions?.close();await parts.sources.versions?.close();await parts.session.close();parts.uploads.close();}
async function cut(parts,paired){return {document:parts.session.core.checkpointJson(),review:paired?parts.session.core.reviewCheckpoint():null,paired:paired?parts.session.exportRecovery():null,suggestions:parts.sources.suggestions?.exportRecovery()??null,revisions:parts.sources.revisions?.exportRecovery()??null,versions:parts.sources.versions?.exportRecovery()??null,uploads:new Uint8Array(await(await parts.uploads.exportBackup()).arrayBuffer())};}
export async function checkParticipantHandoffBoundaries(input,restore,{modes=["ready","operational"],faults=["authority","abort"]}={}){
 const counts={readyAuthority:0,readyAbort:0,readyCallbackAbort:0,operationalAuthority:0,operationalAbort:0,operationalCallbackAbort:0,coldReopens:0,futureDocumentCheckpoints:0,futureReviewCheckpoints:0},paired=input.session.kind.includes("paired");
 for(const mode of modes)for(const fault of faults){
  const tag=`${input.database}-handoff-${mode}-${fault}`,controller=new AbortController();let allowed=true,abortInCheck=false,attempt,ready,owner,parts,reference;
  const checkAuthority=()=>{if(!allowed)throw Error("PRIVATE-HANDOFF-REVOKED");if(abortInCheck)controller.abort();},selected={...input,database:tag,destinations:Object.fromEntries(Object.entries(input.destinations).map(([key,name])=>[key,`${name}-handoff-${mode}-${fault}`])),checkAuthority,signal:controller.signal};
  const {backup:_backup,database:recoveryDatabase,signal:_signal,...base}=selected,resume={...base,database:tag+"-operation",recoveryDatabase,currentPolicy:{documentReadOnly:false,reviewAccess:paired?input.session.options.review.access:null}};
  try{
   attempt=await SharedParticipantRecovery.begin(selected);ready=await attempt.finish();await attempt.close();attempt=undefined;const originalParts={sources:ready.sources,session:ready.session,uploads:ready.uploads},before=await cut(originalParts,paired);
   owner=mode==="ready"?ready:await OperationalSharedParticipant.begin({database:resume.database,recovered:ready,expected:input.expected,checkAuthority,signal:controller.signal});
   const close=RecoveryLease.prototype.close;let fired=false;try{
    RecoveryLease.prototype.close=async function(...args){await close.apply(this,args);if(!fired){fired=true;if(fault==="authority")allowed=false;else if(fault==="abort")controller.abort();else abortInCheck=true;}};
    await assert.rejects(owner.intoParts().then(value=>{parts=value;}),error=>error.code===(fault==="authority"?"recovery_authority":"recovery_aborted")&&!String(error).includes("PRIVATE"));
   }finally{RecoveryLease.prototype.close=close;}
   assert.equal(fired,true);allowed=true;assert.deepEqual(await cut(originalParts,paired),before);if(mode==="operational")assert.deepEqual(owner.origin(),input.expected);
   await assert.rejects(owner.intoParts(),error=>error.code===(mode==="ready"?"recovery_closed":"operation_closed"));
   await owner.close();owner=undefined;await ready.close();ready=undefined;
   if(mode==="ready"){attempt=await SharedParticipantRecovery.resume({...base,database:recoveryDatabase,backup:input.backup});ready=await attempt.finish();await attempt.close();attempt=undefined;parts=await ready.intoParts();}
   else{owner=await OperationalSharedParticipant.resume(resume);parts=await owner.intoParts();owner=undefined;}
   assert.deepEqual(await cut(parts,paired),before);counts.coldReopens++;
   const source=input.expected.identity.source,options={...(input.session.options.reviewedHistory?{reviewedHistory:input.session.options.reviewedHistory}:{}),...(source.searchHistory?{searchHistory:"search-v1"}:{})};
   reference=source.selectionEditing==="document-v1"?createSharedDocumentEditor(restore(before.document),options):new SharedRichEditor(restore(before.document),options);if(paired)reference.enableReview(input.session.options.review,before.review);parts.session.core.setReadOnly(false);reference.setReadOnly(false);
   for(const method of ["redo","undo"]){assert.equal(parts.session.core[method](),reference[method]());assert.equal(parts.session.core.checkpointJson(),reference.checkpointJson());counts.futureDocumentCheckpoints++;if(paired){parts.session.core[method+"Review"]();reference[method+"Review"]();assert.equal(parts.session.core.reviewCheckpoint(),reference.reviewCheckpoint());counts.futureReviewCheckpoints++;}}
   counts[mode+(fault==="authority"?"Authority":fault==="abort"?"Abort":"CallbackAbort")]++;await closeParts(parts);parts=undefined;
  }finally{allowed=true;if(parts)await closeParts(parts);await owner?.discardAndClose();await ready?.discardAndClose();await attempt?.close();reference?.dispose();}
 }
 return counts;
}
