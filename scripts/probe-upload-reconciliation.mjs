/** Actual original native replay + durable explicit whole-upload reconciliation. No network. */
import assert from "node:assert/strict";
import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {RichAssetStore} from "../packages/breditor-experimental-rich-content/index.js";
import {SharedParticipantReplay,SharedRichEditor,createSharedDocumentEditor,captureSharedParticipantBackup} from "../packages/breditor-collaboration/dist/index.js";
import {probeParticipantRecovery} from "./probe-participant-recovery.mjs";
import {probeDocumentParticipantRecovery} from "./probe-document-participant-recovery.mjs";
import {pixel,pixelAsset} from "./fixtures/review-assets/pixels.mjs";
import {fourthPixel,fourthAsset,UploadReconciliationImage} from "./fixtures/upload-reconciliation/pixels.mjs";
const bytes=async b=>new Uint8Array(await b.arrayBuffer()),blob=p=>new Blob([p],{type:"image/png"});
export async function probeUploadReconciliation(directory){
 const counts={cases:0,pairedCases:0,documentCases:0,originalUploadRows:0,currentOnlyImages:0,sourceOnlyImages:0,explicitConflicts:0,idempotentRetries:0,coldAttemptReopens:0,coldStoreReopens:0,coldNativeComparisons:0,futureDocumentCheckpoints:0,futureReviewCheckpoints:0,closedSourceRefusals:0,forgedSourceRefusals:0,wrongOriginalRefusals:0,retainedFileComparisons:0,recoveryNotifications:0,networkCalls:0};
 const check=async({input,recovered,restore})=>{
  const globals=new Map(["Image","fetch","WebSocket"].map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)])),fetch=globalThis.fetch;Object.defineProperty(globalThis,"Image",{value:UploadReconciliationImage,configurable:true});
  Object.defineProperty(globalThis,"fetch",{value:(input,...args)=>{const url=typeof input==="string"?input:input?.url??String(input);if(!url.startsWith("blob:")){counts.networkCalls++;throw Error("No recovery network fetch");}return fetch(input,...args);},configurable:true});
  Object.defineProperty(globalThis,"WebSocket",{value:class{static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;constructor(){counts.networkCalls++;throw Error("No recovery WebSocket");}},configurable:true});
  const current=recovered.session.core,paired=input.session.kind.includes("paired"),checkpoint=current.checkpointJson(),review=paired?current.reviewCheckpoint():null,tag=`${input.database}-uploads`,originalRecords=JSON.stringify(input.backup.records());
  let target,attempt,replay,reference,wrong,wrongBackup,notifications=0;
  try{
   replay=await SharedParticipantReplay.read(input);target=await RichAssetStore.open(`${tag}-target`,{onChange(){notifications++;}});
   // Normal ingestion intentionally notifies; only recovery must remain silent.
   await target.ingest(blob(pixel));await target.cancel(pixelAsset);await target.ingest(blob(fourthPixel));const beforeEvents=notifications;
   const before=await target.exportBackup(),original=input.backup.uploadBackup(),options={database:`${tag}-attempt`};
   const previewExpected=input.backup.uploadEntries().length?4:2;
   await assert.rejects(SharedParticipantReplay.prototype.beginUploadReconciliation.call({},current,target,options));counts.forgedSourceRefusals++;
   attempt=await replay.beginUploadReconciliation(current,target,options);const preview=attempt.preview();assert.equal(preview.unionAssets,previewExpected);assert.equal(preview.conflicts.length,paired?1:0);assert.deepEqual(await bytes(attempt.file("current")),await bytes(before));assert.deepEqual(await bytes(attempt.file("original")),await bytes(original));counts.retainedFileComparisons+=2;
   if(paired){await assert.rejects(attempt.commit([]),e=>e.code==="asset_reconciliation_choices");counts.explicitConflicts++;counts.sourceOnlyImages+=2;}
   const choices=preview.conflicts.map(c=>({asset:c.asset,keep:counts.cases%2?"original":"current"}));await attempt.commit(choices);assert.equal(notifications,beforeEvents);counts.recoveryNotifications+=notifications-beforeEvents;
   assert.equal((await target.list()).length,previewExpected);assert.deepEqual(await bytes(await target.blob(fourthAsset)),new Uint8Array(fourthPixel));counts.currentOnlyImages++;
   for(const entry of input.backup.uploadEntries()){assert.deepEqual(await bytes(await target.blob(entry.asset)),await bytes(input.backup.uploadBlob(entry.asset)));counts.originalUploadRows++;}
   const after=await bytes(await target.exportBackup());await attempt.commit(choices);assert.deepEqual(await bytes(await target.exportBackup()),after);counts.idempotentRetries++;
   assert.equal(current.checkpointJson(),checkpoint);if(paired)assert.equal(current.reviewCheckpoint(),review);assert.equal(JSON.stringify(input.backup.records()),originalRecords);
   await attempt.close();attempt=undefined;target.close();target=await RichAssetStore.openRetained(`${tag}-target`);counts.coldStoreReopens++;
   if(counts.cases===0){
    const captured=await captureSharedParticipantBackup({identity:input.expected.identity,source:recovered.sources,assets:target,checkAuthority:input.checkAuthority,resolveAsset:async r=>({...r,blob:input.backup.blob(r.asset,r.generation),identity:/^sha256:[a-f0-9]{64}$/.test(r.asset)?"content-addressed":"host-verified",check(){replay.check();}})});assert.equal(captured.kind,"ready");wrongBackup=captured.backup;wrong=await SharedParticipantReplay.read({...input,backup:wrongBackup,expected:wrongBackup.selection()});wrong.verifyCurrent(current);
    await assert.rejects(wrong.resumeUploadReconciliation(current,target,options),e=>e.code==="asset_reconciliation_source");counts.wrongOriginalRefusals++;wrong.dispose();wrong=undefined;wrongBackup.dispose();wrongBackup=undefined;
   }
   attempt=await replay.resumeUploadReconciliation(current,target,options);await attempt.commit(choices);counts.coldAttemptReopens++;assert.deepEqual(await bytes(await target.exportBackup()),after);
   replay.dispose();await assert.rejects(attempt.commit(choices),e=>e.code==="participant_replay_closed"||e.code==="asset_reconciliation_source");counts.closedSourceRefusals++;
   await assert.rejects(replay.resumeUploadReconciliation(current,target,options),e=>e.code==="participant_replay_closed");counts.closedSourceRefusals++;
   assert.deepEqual(await bytes(attempt.file("original")),await bytes(original));counts.retainedFileComparisons++;
   await attempt.close();attempt=undefined;replay=await SharedParticipantReplay.read(input);attempt=await replay.resumeUploadReconciliation(current,target,options);await attempt.commit(choices);counts.coldAttemptReopens++;
   const nativeOptions={...(input.session.options.reviewedHistory?{reviewedHistory:input.session.options.reviewedHistory}:{}),...(input.expected.identity.source.searchHistory?{searchHistory:"search-v1"}:{})};reference=input.expected.identity.source.selectionEditing==="document-v1"?createSharedDocumentEditor(restore(checkpoint),nativeOptions):new SharedRichEditor(restore(checkpoint),nativeOptions);if(paired)reference.enableReview(input.session.options.review,review);replay.verifyCurrent(reference);counts.coldNativeComparisons++;
   for(const core of[current,reference])core.setReadOnly(false);for(const method of["undo","redo","undo"]){current[method]();reference[method]();assert.equal(current.checkpointJson(),reference.checkpointJson());counts.futureDocumentCheckpoints++;if(paired){current[`${method}Review`]();reference[`${method}Review`]();assert.equal(current.reviewCheckpoint(),reference.reviewCheckpoint());counts.futureReviewCheckpoints++;}}
   counts.cases++;if(paired)counts.pairedCases++;else counts.documentCases++;
  }finally{await attempt?.close();replay?.dispose();reference?.dispose();wrong?.dispose();wrongBackup?.dispose();target?.close();for(const[n,d]of globals)if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];}
 };
 const originalPaired=await probeParticipantRecovery(directory,{onRecovered:check}),originalDocument=await probeDocumentParticipantRecovery(directory,{onRecovered:check});
 for(const[key,value]of Object.entries({cases:66,pairedCases:30,documentCases:36,originalUploadRows:90,currentOnlyImages:66,sourceOnlyImages:60,explicitConflicts:30,idempotentRetries:66,coldAttemptReopens:132,coldStoreReopens:66,coldNativeComparisons:66,futureDocumentCheckpoints:198,futureReviewCheckpoints:90,closedSourceRefusals:132,forgedSourceRefusals:66,wrongOriginalRefusals:1,retainedFileComparisons:198,recoveryNotifications:0,networkCalls:0}))assert.equal(counts[key],value,key);
 return{format:"breditor/upload-reconciliation-probe",formatVersion:1,passed:true,...counts,originalPaired,originalDocument,scope:"Actual66 original native grammar/history/scope families, genuine independently selected original upload files and current native continuity. Explicit per-image choices retain both complete files, current-only and source-only images, cancelled/failed/opaque receipt state; cold target/attempt reopens, invalidated borrowed sources, wrong-original refusal, exact private native restore and288 future document/review checkpoints. IDB/locks/four-PNG decode are Node fixtures. No native branch merge, provider/current-server authority, global marker completion, activation, browser/process durability or generation bridge."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error("Expected actual shared Wasm runtime directory");console.log(JSON.stringify(await probeUploadReconciliation(process.argv[2]),null,2));}
