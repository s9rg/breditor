/** Real Wasm continuity and pre-autosave refusal across the original 66 native families. */
import assert from "node:assert/strict";
import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {SharedParticipantRecovery,SharedPersistentSession,SharedReviewPersistentSession} from "../packages/breditor-collaboration/dist/index.js";
import {prepareRecovery} from "../packages/breditor-collaboration/dist/participant_recovery/prepare.js";
import {ParticipantOrigin} from "../packages/breditor-collaboration/dist/participant_operation/origin.js";
import {withRecoveryOrigin} from "../packages/breditor-collaboration/dist/participant_operation/admission.js";
import {probeParticipantRecovery} from "./probe-participant-recovery.mjs";
import {probeDocumentParticipantRecovery} from "./probe-document-participant-recovery.mjs";
import {checkRecoveryReleaseFaults} from "./fixtures/participant-recovery/lifecycle.mjs";

async function stored(database){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(database);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction("journals","readonly"),r=tx.objectStore("journals").get(["room","101"]);tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
function openWithOrigin(input,origin,extra={}){
 const {kind,options}=input.session,opening=withRecoveryOrigin({...options,database:input.destinations.document,create(){throw Error("Operational recovery must not create a native owner");},...extra},origin);
 switch(kind){
  case"document":return SharedPersistentSession.open(opening);
  case"document-selection":return SharedPersistentSession.openDocument(opening);
  case"search-document":return SharedPersistentSession.openSearch(opening);
  case"paired":return SharedReviewPersistentSession.open(opening);
  case"reviewed-paired":return SharedReviewPersistentSession.openReviewed(opening);
  case"search-paired":return SharedReviewPersistentSession.openSearch(opening);
  default:throw Error("Undeclared native family");
 }
}
export async function probeParticipantOrigin(directory){
 const counts={cases:0,factoryReceiverChecks:0,pureNativeReads:0,wrongRestoreRefusals:0,coldReopens:0,futureDocumentCheckpoints:0,futureReviewCheckpoints:0,missingDatabaseRefusals:0,oldCoordinatorRefusals:0,disposedOriginRefusals:0};
 const check=async({input,recovered,restore})=>{
  const {kind,options}=input.session,factory=kind==="document-selection"?"restoreDocument":kind==="search-document"||kind==="search-paired"?"restoreSearch":kind==="reviewed-paired"?"restoreReviewed":"restore",receiverMarker=Symbol("host factory receiver"),receiverOptions={...options,receiverMarker,[factory]:function(...args){assert.equal(this.receiverMarker,receiverMarker,"Origin must preserve the host factory receiver");counts.factoryReceiverChecks++;return options[factory].apply(this,args);}};
  const prepared=await prepareRecovery({...input,session:{kind,options:receiverOptions}}),origin=await ParticipantOrigin.read(prepared),paired=kind.includes("paired"),originalFile=input.backup.file(),originalRecords=input.backup.records(),originalDocument=prepared.records.get("document");let session;
  try{
   const before=recovered.session.core.checkpointJson(),review=paired?recovered.session.core.reviewCheckpoint():undefined;
   assert.equal(recovered.session.core.supportsRecoveryOrigin(),true);origin.verify(recovered.session.core);origin.verify(recovered.session.core);assert.equal(recovered.session.core.checkpointJson(),before);if(paired)assert.equal(recovered.session.core.reviewCheckpoint(),review);counts.pureNativeReads+=2;
   await recovered.close();const record=await stored(input.destinations.document);
   const shortened=()=>restore(originalDocument);await assert.rejects(openWithOrigin(input,origin,{restore:shortened,restoreDocument:shortened,restoreReviewed:shortened,restoreSearch:shortened}),e=>e.code==="recovery_origin_native");assert.deepEqual(await stored(input.destinations.document),record);counts.wrongRestoreRefusals++;
   for(let round=0;round<2;round++){
    session=await openWithOrigin(input,origin);origin.verify(session.core);counts.coldReopens++;
    if(round===0){assert.equal(session.core.checkpointJson(),before);if(paired)assert.equal(session.core.reviewCheckpoint(),review);}
    session.core.setReadOnly(false);for(const method of ["undo","redo","undo","redo"]){session.core[method]();origin.verify(session.core);counts.futureDocumentCheckpoints++;if(paired){session.core[`${method}Review`]();origin.verify(session.core);counts.futureReviewCheckpoints++;}}await session.flush();await session.close();session=undefined;
   }
   const current=await stored(input.destinations.document),old=await SharedParticipantRecovery.resume(input);try{await assert.rejects(old.finish(),e=>e.code==="recovery_diverged");}finally{await old.close();}assert.deepEqual(await stored(input.destinations.document),current);counts.oldCoordinatorRefusals++;
   const inventory=await indexedDB.databases();await assert.rejects(openWithOrigin({...input,destinations:{...input.destinations,document:`${input.destinations.document}-missing`}},origin),e=>e.code==="recovery_origin_missing");assert.deepEqual(await indexedDB.databases(),inventory);counts.missingDatabaseRefusals++;
   origin.dispose();await assert.rejects(openWithOrigin(input,origin),e=>e.code==="recovery_origin");assert.deepEqual(await stored(input.destinations.document),current);counts.disposedOriginRefusals++;
   assert.equal(input.backup.file(),originalFile);assert.deepEqual(input.backup.records(),originalRecords);counts.cases++;
  }finally{await session?.discardAndClose();origin.dispose();}
 };
 let lifecycle;const paired=await probeParticipantRecovery(directory,{onRecovered:check,onLifecycle:async make=>{lifecycle=await checkRecoveryReleaseFaults(make);}}),document=await probeDocumentParticipantRecovery(directory,{onRecovered:check});
 assert.equal(counts.cases,66);assert.equal(counts.factoryReceiverChecks,66);assert.equal(counts.pureNativeReads,132);assert.equal(counts.coldReopens,132);assert.equal(counts.futureDocumentCheckpoints,528);assert.equal(counts.futureReviewCheckpoints,240);for(const key of ["wrongRestoreRefusals","missingDatabaseRefusals","oldCoordinatorRefusals","disposedOriginRefusals"])assert.equal(counts[key],66,key);
 assert.deepEqual(lifecycle,{handoffReleaseRetry:1,completionReleaseRetries:2,ownerDiscardRetry:1,attemptReleaseRetry:1});
 return {format:"breditor/participant-origin-probe",formatVersion:1,passed:true,...counts,lifecycle,paired,document,scope:"Actual native read-only source replay, exact current native replay before autosave, retained origin history and selective Undo/Redo across original 66 families. All prior participant assertions retained. Explicit Node IndexedDB/locks/raster fixtures; not browser durability, durable operational phase, parent catalog handoff, authentication/global activation or cross-generation bridging."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error("Expected current shared Wasm runtime directory");console.log(JSON.stringify(await probeParticipantOrigin(process.argv[2]),null,2));}
