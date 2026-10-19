/** Actual original native archive replay while the current author remains open. No storage fallback. */
import assert from "node:assert/strict";
import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {SharedParticipantReplay,SharedRichEditor,captureSharedAssetBytes} from "../packages/breditor-collaboration/dist/index.js";
import {probeParticipantRecovery} from "./probe-participant-recovery.mjs";
import {probeDocumentParticipantRecovery} from "./probe-document-participant-recovery.mjs";
import {withoutInfrastructure} from "./fixtures/participant-replay/forbidden.mjs";
export async function probeParticipantReplay(directory){
 const counts={cases:0,pairedCases:0,documentCases:0,concurrentReadOnlyCopies:0,exactNativeSources:0,actualArchivedByteCaptures:0,retainedBindings:0,currentContinuityChecks:0,closedSourceRefusals:0,sourceDisposals:0,forgedCurrentRefusals:0,reentrantSourceDisposals:0,currentClosedDuringAuthorityRefusals:0,authorityRefusals:0,cancellationRefusals:0,localBlobReads:0,forbiddenCalls:0};
 const check=async({input,recovered,restore})=>{
  await recovered.session.flush();await recovered.sources.revisions?.flush();await recovered.sources.suggestions?.flush();await recovered.sources.versions?.flush();
  const current=recovered.session.core,before=current.checkpointJson(),review=input.session.kind.includes("paired")?current.reviewCheckpoint():null,original=JSON.stringify(input.backup.records());
  const noPort=new Proxy({}, {get(){counts.forbiddenCalls++;throw Error("PRIVATE_UNEXPECTED_PORT");}}),options={...input,...(input.revisions?{revisions:{...input.revisions,transport:noPort}}:{}),...(input.versions?{versions:{...input.versions,getToken(){counts.forbiddenCalls++;throw Error("PRIVATE_UNEXPECTED_TOKEN");}}}:{})};
  let one,two,bytes;
  try{await withoutInfrastructure(async()=>{
   if(counts.cases===0){for(const checkAuthority of [()=>{throw Error("PRIVATE_REVOKED");},()=>false,async()=>{throw Error("PRIVATE_ASYNC");}]){await assert.rejects(SharedParticipantReplay.read({...options,checkAuthority}),e=>e.code==="participant_replay_authority"&&!String(e).includes("PRIVATE"));counts.authorityRefusals++;}
    await assert.rejects(SharedParticipantReplay.read({...options,signal:AbortSignal.abort()}),e=>e.code==="participant_replay_aborted");counts.cancellationRefusals++;
    const controller=new AbortController(),cancelled=await SharedParticipantReplay.read({...options,signal:controller.signal});try{controller.abort();assert.throws(()=>cancelled.check(),e=>e.code==="participant_replay_aborted");counts.cancellationRefusals++;}finally{cancelled.dispose();}
    let permitted=true;const revoked=await SharedParticipantReplay.read({...options,checkAuthority(){if(!permitted)throw Error("PRIVATE_REVOKED");}});try{permitted=false;assert.throws(()=>revoked.check(),e=>e.code==="participant_replay_authority"&&!String(e).includes("PRIVATE"));counts.authorityRefusals++;}finally{revoked.dispose();}}
   one=await SharedParticipantReplay.read(options);two=await SharedParticipantReplay.read(options);counts.concurrentReadOnlyCopies++;
   assert.throws(()=>one.verifyCurrent({verifyRecoveryOrigin(){}}),e=>e.code==="participant_replay_continuity","A lookalike object is not an actual current native owner");counts.forgedCurrentRefusals++;
   if(counts.cases===0){let expired=false,borrowed;const nested=await SharedParticipantReplay.read({...options,checkAuthority(){options.checkAuthority();if(expired)borrowed.dispose();}});try{borrowed=nested.references();expired=true;assert.throws(()=>nested.check(),e=>e.code==="participant_replay_closed","Disposing a borrowed source inside its authority callback must invalidate the same check");counts.reentrantSourceDisposals++;}finally{nested.dispose();}}
   if(counts.cases===0){const raw=restore(input.backup.records()[0].json),nativeVerify=raw.verify_recovery_origin.bind(raw);let compared=false,armed=false;raw.verify_recovery_origin=(...args)=>{nativeVerify(...args);compared=true;};const temporary=new SharedRichEditor(raw),paired=JSON.parse(input.backup.records().find(r=>r.kind==="paired-session").json);temporary.enableReview({...input.session.options.review,access:"read_only"},paired.reviewCheckpointJson);
    const nested=await SharedParticipantReplay.read({...options,checkAuthority(){options.checkAuthority();if(armed&&compared)temporary.dispose();}});try{armed=true;assert.throws(()=>nested.verifyCurrent(temporary),e=>e.code==="participant_replay_continuity","Closing the actual current owner in a post-comparison authority check must refuse");counts.currentClosedDuringAuthorityRefusals++;}finally{nested.dispose();temporary.dispose();}}
   assert.ok(Object.isFrozen(one));assert.equal(one.core,undefined);assert.equal(one.session,undefined);assert.deepEqual(one.selection(),input.expected);
   for(const replay of [one,two]){replay.check();input.backup.verifySource(replay.references());assert.equal(JSON.stringify(replay.references().records()),original);replay.verifyCurrent(current);counts.currentContinuityChecks++;}
   counts.exactNativeSources++;const source=one.references();assert.equal(source.metadata().outcome.kind,"ready");counts.retainedBindings+=source.metadata().outcome.references.length;
   const result=await captureSharedAssetBytes({source,resolveAsset:async reference=>{
    const blob=input.backup.blob(reference.asset,reference.generation);assert.ok(blob);return{...reference,blob,identity:/^sha256:[a-f0-9]{64}$/.test(reference.asset)?"content-addressed":"host-verified",check(){one.check();}};
   }});
   assert.equal(result.kind,"ready");bytes=result.capture;bytes.check();counts.actualArchivedByteCaptures++;
   const retained=one.references();one.dispose();one.dispose();assert.throws(()=>retained.check());assert.throws(()=>bytes.check());assert.throws(()=>one.references(),e=>e.code==="participant_replay_closed");counts.closedSourceRefusals++;
   two.check();two.verifyCurrent(current);counts.currentContinuityChecks++;two.dispose();counts.sourceDisposals+=2;
  },counts);
  assert.equal(current.checkpointJson(),before);if(review!==null)assert.equal(current.reviewCheckpoint(),review);assert.equal(JSON.stringify(input.backup.records()),original);
  counts.cases++;if(input.session.kind.includes("paired"))counts.pairedCases++;else counts.documentCases++;
  }finally{bytes?.dispose();two?.dispose();one?.dispose();}
 };
 const paired=await probeParticipantRecovery(directory,{onRecovered:check}),document=await probeDocumentParticipantRecovery(directory,{onRecovered:check});
 assert.equal(counts.cases,66);assert.equal(counts.pairedCases,30);assert.equal(counts.documentCases,36);assert.equal(counts.forbiddenCalls,0);assert.ok(counts.localBlobReads>0);assert.equal(counts.forgedCurrentRefusals,66);assert.equal(counts.reentrantSourceDisposals,1);assert.equal(counts.currentClosedDuringAuthorityRefusals,1);assert.equal(counts.authorityRefusals,4);assert.equal(counts.cancellationRefusals,2);assert.equal(counts.concurrentReadOnlyCopies,66);assert.equal(counts.exactNativeSources,66);assert.equal(counts.actualArchivedByteCaptures,66);assert.equal(counts.currentContinuityChecks,198);assert.equal(counts.closedSourceRefusals,66);assert.equal(counts.sourceDisposals,132);
 return{format:"breditor/participant-replay-probe",formatVersion:1,passed:true,...counts,paired,document,scope:"Actual private read-only replays of complete retained archives across original66 native families, with the current author still open. Two readers per copy, exact canonical records, whole native/packet reference closure, actual archived image bytes, native same-author current-journal continuity and disposal invalidation. IDB/lease/delivery globals and dependent network/token ports throw throughout read/capture/check. Existing original recovery/history assertions retained. Node raster/storage fixtures do not qualify browser/process durability, current provider authority, historical-copy merging, room activation or generation bridging."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error("Expected actual shared Wasm runtime directory");console.log(JSON.stringify(await probeParticipantReplay(process.argv[2]),null,2));}
