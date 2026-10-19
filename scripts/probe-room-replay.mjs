/** Every retained catalog copy, including duplicate writers, through actual private native readers. */
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {probeRoomOperationalRecovery} from "./probe-room-operational-recovery.mjs";
import {withoutInfrastructure} from "./fixtures/participant-replay/forbidden.mjs";
async function closeParts(parts){for(const{parts:p}of [...parts.participants].reverse()){await p.sources.revisions?.close();await p.sources.suggestions?.close();await p.sources.versions?.close();await p.session.close();p.uploads.close();}}
const factoryKey=kind=>kind==="document-selection"?"restoreDocument":kind==="search-document"||kind==="search-paired"?"restoreSearch":kind==="reviewed-paired"?"restoreReviewed":"restore";
export async function probeRoomReplay(directory,nativeReport){
 const counts={cases:0,copies:0,duplicateWriterCopies:0,nativeFactoryCalls:0,nativeDisposals:0,originalNativeComparisons:0,wrongCurrentRefusals:0,completePolicyRefusals:0,partialNativeFailures:0,borrowedCatalogRefusals:0,currentValidityAfterCallback:0,authorityRefusals:0,cancellationRefusals:0,forbiddenCalls:0,localBlobReads:0};
 const operational=await probeRoomOperationalRecovery(directory,nativeReport,{onRoom:async context=>{
  const{api,input,chosen,current,counts:oldCounts}=context;let archive,operation,parts,replay;
  try{
   archive=await api.captureSharedRoomRecoveryCatalog(input);operation=await api.SharedRoomOperationalRecovery.resume(current);await operation.finish();parts=await operation.intoParts();operation=undefined;
   for(const{parts:p}of parts.participants){await p.session.flush();await p.sources.revisions?.flush();await p.sources.suggestions?.flush();await p.sources.versions?.flush();}
   const before=parts.participants.map(row=>[row.parts.session.core.checkpointJson(),row.parts.session.core.reviewCheckpoint()]);
   const rows=[...chosen,{...chosen[0],id:"historic-copy"}].map(row=>{
    const key=factoryKey(row.recovery.session.kind),original=row.recovery.session.options[key],options={...row.recovery.session.options,replayId:row.id};
    options[key]=function(...args){assert.equal(this.replayId,row.id);counts.nativeFactoryCalls++;const wrap=raw=>{const free=raw.free.bind(raw);raw.free=()=>{counts.nativeDisposals++;free();};return raw;},raw=Reflect.apply(original,this,args);return raw&&typeof raw.then==="function"?raw.then(wrap):wrap(raw);};
    return{...row,recovery:{...row.recovery,session:{...row.recovery.session,options}}};
   });
   let guardWork=()=>{},permitted=true;const controller=new AbortController(),options={archive,expected:archive.selection(),participants:rows,signal:controller.signal,checkAuthority(){if(!permitted)throw Error("PRIVATE_REVOKED");guardWork();}};
   await withoutInfrastructure(async()=>{
    const opened=counts.nativeFactoryCalls;
    for(const participants of [rows.slice(0,2),[rows[0],rows[0],rows[2]],[...rows,{...rows[0],id:"undeclared"}]]){await assert.rejects(api.SharedRoomReplay.read({...options,participants}),e=>e.code==="room_replay_policy");counts.completePolicyRefusals++;}
    assert.equal(counts.nativeFactoryCalls,opened);
    for(const checkAuthority of [()=>{throw Error("PRIVATE_REVOKED");},()=>false,async()=>{throw Error("PRIVATE_ASYNC");}]){await assert.rejects(api.SharedRoomReplay.read({...options,checkAuthority}),e=>e.code==="room_replay_authority"&&!String(e).includes("PRIVATE"));counts.authorityRefusals++;}
    await assert.rejects(api.SharedRoomReplay.read({...options,signal:AbortSignal.abort()}),e=>e.code==="room_replay_aborted");counts.cancellationRefusals++;assert.equal(counts.nativeFactoryCalls,opened);
    const bad=rows.map((row,index)=>index===1?{...row,recovery:{...row.recovery,session:{...row.recovery.session,options:{...row.recovery.session.options,[factoryKey(row.recovery.session.kind)](){throw Error("PRIVATE_NATIVE_FAILURE");}}}}}:row);
    const freed=counts.nativeDisposals;await assert.rejects(api.SharedRoomReplay.read({...options,participants:bad}),e=>e.code==="room_replay_native"&&!String(e).includes("PRIVATE"));assert.equal(counts.nativeDisposals,freed+1);counts.partialNativeFailures++;
    replay=await api.SharedRoomReplay.read(options);const entries=replay.entries();assert.equal(entries.length,3);assert.ok(Object.isFrozen(entries));assert.throws(()=>entries.push({}));assert.deepEqual(entries.map(row=>row.id),["client-0","client-1","historic-copy"]);
    for(const entry of entries){entry.backup.verifySource(entry.source);assert.deepEqual(entry.source.records(),entry.backup.records());assert.equal(entry.originalInventory.checkedParticipants.length,1);const target=parts.participants.find(row=>row.id===(entry.id==="historic-copy"?"client-0":entry.id));assert.ok(target);replay.verifyNativeContinuation(entry.id,target.parts.session.core);counts.originalNativeComparisons++;counts.copies++;}
    if(counts.cases===0){const selected=entries[0],record=JSON.parse(selected.backup.records().find(row=>row.kind==="paired-session").json),raw=context.profile.restore(selected.backup.selection().identity.source.room,record.documentCheckpointJson),nativeVerify=raw.verify_recovery_origin.bind(raw);let comparisons=0,disposed=false;raw.verify_recovery_origin=(...args)=>{nativeVerify(...args);comparisons++;};const temporary=new api.SharedRichEditor(raw);temporary.enableReview({actor:record.reviewActor,principal:record.principal,access:"read_only"},record.reviewCheckpointJson);guardWork=()=>{if(comparisons>=2){disposed=true;temporary.dispose();}};
     try{let failed;try{replay.verifyNativeContinuation(selected.id,temporary);}catch(error){failed=error;}if(disposed)assert.equal(failed?.code,"room_replay_continuity","A callback must not leave a successful comparison pointing at a closed owner");else{assert.equal(failed,undefined);temporary.verifyRecoveryOrigin(temporary);}counts.currentValidityAfterCallback++;}finally{guardWork=()=>{};temporary.dispose();}}
    counts.duplicateWriterCopies++;assert.throws(()=>replay.verifyNativeContinuation("historic-copy",parts.participants[1].parts.session.core),e=>e.code==="room_replay_continuity");counts.wrongCurrentRefusals++;
    permitted=false;assert.throws(()=>replay.check(),e=>e.code==="room_replay_authority"&&!String(e).includes("PRIVATE"));counts.authorityRefusals++;permitted=true;replay.check();controller.abort();assert.throws(()=>replay.check(),e=>e.code==="room_replay_aborted");counts.cancellationRefusals++;
    const borrowed=entries[0].source;replay.dispose();replay.dispose();assert.throws(()=>borrowed.check());assert.ok(archive.participantFile("historic-copy").size>0);const{signal:_signal,...uncancelled}=options;replay=await api.SharedRoomReplay.read(uncancelled);archive.dispose();archive=undefined;assert.throws(()=>replay.entries(),e=>e.code==="room_replay_closed");counts.borrowedCatalogRefusals++;replay.dispose();replay=undefined;
   },counts);
   assert.deepEqual(parts.participants.map(row=>[row.parts.session.core.checkpointJson(),row.parts.session.core.reviewCheckpoint()]),before);assert.equal(oldCounts.networkCalls,0);counts.cases++;
  }finally{replay?.dispose();archive?.dispose();if(parts)await closeParts(parts);await operation?.discardAndClose();}
 }});
 for(const[key,value]of Object.entries({cases:10,copies:30,duplicateWriterCopies:10,originalNativeComparisons:30,wrongCurrentRefusals:10,completePolicyRefusals:30,partialNativeFailures:10,borrowedCatalogRefusals:10,currentValidityAfterCallback:1,authorityRefusals:40,cancellationRefusals:20,forbiddenCalls:0}))assert.equal(counts[key],value,key);assert.equal(counts.nativeDisposals,counts.nativeFactoryCalls);assert.equal(counts.nativeFactoryCalls,70);
 return{format:"breditor/room-replay-probe",formatVersion:1,passed:true,...counts,operational,scope:"Actual ten native compiler/transport room fixtures and all30 supplied client/historic copies, including a duplicate writer per room. Original factories keep their receiver, private replays match exact native/retained sources and each original registration inventory; all30 native current-journal comparisons pass while selected authors remain open. Missing/duplicate/extra declarations refuse before factories, partial failure frees readers, catalog disposal invalidates the cohort, and current journals stay identical. Storage/lease/network APIs throw during replay. Original parent markers still retain their unreconciled copy lists. No historical branch merge, provider authority, activation barrier, browser/process or generation-bridge qualification."};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error("Expected actual shared runtime and native fixture report");console.log(JSON.stringify(await probeRoomReplay(process.argv[2],process.argv[3]),null,2));}
