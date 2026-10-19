/** Faults target coordinator release, not native replay or writer-lock substitutes. */
import assert from "node:assert/strict";
import {SharedParticipantRecovery} from "../../../packages/breditor-collaboration/dist/index.js";
import {RecoveryLease} from "../../../packages/breditor-collaboration/dist/participant_recovery/lease.js";

async function failOneRelease(run){
 const close=RecoveryLease.prototype.close;let failed=false;
 try{RecoveryLease.prototype.close=async function(){if(!failed){failed=true;throw Error("fixture release failure");}return close.call(this);};await run();assert.equal(failed,true);}finally{RecoveryLease.prototype.close=close;}
}
async function finish(input){const attempt=await SharedParticipantRecovery.begin(input);try{return await attempt.finish();}finally{await attempt.close();}}
async function canResume(input){const attempt=await SharedParticipantRecovery.resume(input);await attempt.close();}
async function discardParts(parts){try{await parts.sources.revisions?.discardAndClose();}finally{try{await parts.sources.suggestions?.discardAndClose();}finally{try{await parts.sources.versions?.discardAndClose();}finally{try{await parts.session.discardAndClose();}finally{parts.uploads.close();}}}}}

export async function checkRecoveryReleaseFaults(make){
 const handoff=make("handoff-release-retry");let recovered=await finish(handoff),parts;
 try{await failOneRelease(async()=>{await assert.rejects(recovered.intoParts(),e=>e.code==="recovery_storage");assert.ok(recovered.session.core.checkpointJson());parts=await recovered.intoParts();});await discardParts(parts);parts=undefined;await canResume(handoff);}finally{if(parts)await discardParts(parts);await recovered.discardAndClose();}
 for(const method of ["close","discardAndClose"]){
  const input=make(`${method}-release-retry`);recovered=await finish(input);
  try{await failOneRelease(async()=>{await assert.rejects(recovered[method](),e=>e.code==="recovery_storage");await recovered[method]();});await canResume(input);}finally{await recovered.discardAndClose();}
 }
 const input=make("discard-owner-retry");recovered=await finish(input);const discard=recovered.session.discardAndClose;let resume;
 try{
  let entered,allow;const waiting=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{allow=resolve;});
  recovered.session.discardAndClose=async function(){entered();await gate;throw Error("fixture owner cleanup failure");};
  const pending=recovered.discardAndClose(),failure=assert.rejects(pending,/fixture owner cleanup failure/);await waiting;
  await assert.rejects(recovered.discardAndClose(),e=>e.code==="recovery_in_use");await assert.rejects(recovered.intoParts(),e=>e.code==="recovery_in_use");allow();await failure;
  await assert.rejects(SharedParticipantRecovery.resume(input),e=>e.code==="recovery_in_use");
  recovered.session.discardAndClose=discard;await recovered.discardAndClose();resume=await SharedParticipantRecovery.resume(input);await resume.close();resume=undefined;
 }finally{recovered.session.discardAndClose=discard;await recovered.discardAndClose();await resume?.close();}
 const empty=make("attempt-release-retry"),attempt=await SharedParticipantRecovery.begin(empty);
 try{await failOneRelease(async()=>{await assert.rejects(attempt.close(),e=>e.code==="recovery_storage");await attempt.close();});await canResume(empty);}finally{await attempt.close();}
 return Object.freeze({handoffReleaseRetry:1,completionReleaseRetries:2,ownerDiscardRetry:1,attemptReleaseRetry:1});
}
