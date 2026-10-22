/** Fixed full native restored-local journal domain. This proves actual writable
 * source custody and cold recovery, not a whole-upload operational parent or a
 * repeated flat-provenance export. Those remain separate required work. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {localParticipantFixture} from './fixtures/independent-local-operation/participant.mjs';
import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {recoveryFaults,databaseValues} from './fixtures/independent-delivery-recovery/storage.mjs';
import {pixel} from './fixtures/review-assets/pixels.mjs';
const boundaries=[
 {name:'prepare-abort',store:'restored_local_operation_intent',number:1,kind:'abort',sequence:'0'},
 {name:'prepare-lost-completion',store:'restored_local_operation_intent',number:1,kind:'lost-ack',sequence:'1'},
 {name:'native-abort',source:true,store:'local_operation_history_heads',number:1,kind:'abort',sequence:'1'},
 {name:'native-lost-completion',source:true,store:'local_operation_history_heads',number:1,kind:'lost-ack',sequence:'1'},
 {name:'acknowledge-abort',store:'restored_local_operation_intent',number:2,kind:'abort',sequence:'1'},
 {name:'acknowledge-lost-completion',store:'restored_local_operation_intent',number:2,kind:'lost-ack',sequence:'2'},
];
export async function probeRestoredLocalJournal({api,rich,internals,runtime,fixture}){
 const{OperationalIndependentLocalParticipant:Participant,captureLocalOperationBackup:capture,RestoredLocalOperationJournal:Journal,restoredLocalJournalBinding:binding,openRestoredLocalHistory:open}=internals;
 const native=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')));await native.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const root=JSON.parse(readFileSync(fixture,'utf8')),bytes=async blob=>Buffer.from(await blob.arrayBuffer());
 const counts={cases:0,profiles:0,interruptedFirstPublications:0,initialColdResumes:0,laterColdResumes:0,inputLivePublications:0,literalInputs:0,originalPixels:0,incomingWholeUploads:0,versions:0,futureNativePairs:0,readOnlyRefusals:0,oldFamilyRefusals:0,freshReadScopes:0,writeRefusals:0};
 const boundaryCounts=Object.fromEntries(boundaries.map(row=>[row.name,0]));
 for(const key of ['RestoredLocalOperationJournal','DetachedRestoredLocalInput','openRestoredLocalHistory'])assert.equal(key in api,false);
 for(const [language,standard]of [[1,false],[2,false],[2,true],[3,false],[3,true]]){
  const profile=nativeProfile(native,language,standard);counts.profiles++;
  try{for(const scope of [0,1,2])for(const mask of [0,1,2,3,4,5,6,7])for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true]){
   const host={fixture:extra=>localParticipantFixture({api,rich,Participant,profile,root,tag:'restored-local-matrix-'+counts.cases,language,scope,mask,...extra})};
   const f=await restoredLocalFixture(host,capture,{documentSegmented,reviewSegmented}),faults=recoveryFaults(),boundary=boundaries[counts.cases%boundaries.length];
   let journal,source,reader,allowed=true;
   try{
    const options={...f.options,checkAuthority(){if(!allowed)throw Error('New restored-local write grant ended');}},fileBytes=await bytes(f.file),originalPixels=await bytes(f.backup.blob(f.value.f.reference.asset,f.value.f.reference.generation));
    assert.deepEqual(originalPixels,pixel);
    // A separate actual native owner supplies the independent future reference.
    // No fabricated native tree or phase record is used. The fixture already
    // released its original source before reacquiring these native leases.
    const reference=await api.SharedIndependentHistoryPersistentSession.restoreRecovery({...f.nativeOptions(),database:f.value.f.tag+'-future-reference'},f.value.live,'host-reacquired');
    const future=[];try{for(const method of ['undo','redo','undo']){assert.equal(reference.core[method](),true);assert.equal(reference.core[method==='undo'?'undoReview':'redoReview']().kind,'committed');future.push(reference.exportRecovery());}}finally{await reference.discardAndClose();}
    journal=await Journal.begin(f.file,options);f.backup.dispose();
    faults.select(boundary.source?options.sourceDatabase:options.database,boundary.store,boundary.number,boundary.kind);
    await assert.rejects(open(f.nativeOptions(),journal));faults.clear();counts.interruptedFirstPublications++;boundaryCounts[boundary.name]++;
    assert.equal((await journal.progress()).sequence,boundary.sequence);await journal.close();
    journal=await Journal.resume(options);source=await open(f.nativeOptions(),journal);counts.initialColdResumes++;
    const first=await journal.progress();assert.equal(first.sequence,'2');assert.equal(first.pending,null);assert.ok(first.current);assert.deepEqual(source.exportRecovery(),f.value.live);counts.inputLivePublications++;
    assert.deepEqual(await bytes(journal.file()),fileBytes);counts.literalInputs++;
    assert.deepEqual(await bytes(journal.blob(f.value.f.reference.asset,f.value.f.reference.generation)),pixel);counts.originalPixels++;
    reader=binding(journal).borrowRead(source,()=>{});assert.deepEqual(await bytes(reader.uploads()),f.value.uploads);counts.incomingWholeUploads++;reader.release();reader=undefined;
    assert.deepEqual(source.exportRecovery().versions,f.value.live.versions);assert.equal(source.versions().length,2);counts.versions++;
    assert.throws(()=>api.captureSharedIndependentSource({session:source}));assert.throws(()=>api.captureSharedIndependentDeliverySource({session:source}));counts.oldFamilyRefusals+=2;
    for(const [index,method]of ['undo','redo','undo'].entries()){assert.equal(source.core[method](),true);assert.equal(source.core[method==='undo'?'undoReview':'redoReview']().kind,'committed');assert.deepEqual(source.exportRecovery(),future[index]);counts.futureNativePairs++;}
    await source.flush();const saved=source.exportRecovery();await source.close();source=undefined;
    journal=await Journal.resume(options);source=await open(f.nativeOptions({readOnly:true,review:{...f.nativeOptions().review,access:'read_only'}}),journal);counts.laterColdResumes++;
    assert.deepEqual(source.exportRecovery(),saved);assert.throws(()=>source.core.undo());assert.throws(()=>source.core.undoReview());counts.readOnlyRefusals+=2;
    const before=await databaseValues(options.database);allowed=false;assert.throws(()=>source.save());counts.writeRefusals++;
    reader=binding(journal).borrowRead(source,()=>{});assert.deepEqual(reader.readSource(),saved);const cut=await reader.readSnapshot();assert.equal(cut.record.pending,null);assert.deepEqual(await bytes(cut.input),fileBytes);reader.release();reader=undefined;counts.freshReadScopes++;
    assert.deepEqual(await databaseValues(options.database),before);await source.discardAndClose();source=undefined;
    await assert.rejects(api.SharedIndependentHistoryPersistentSession.open(f.nativeOptions()));counts.oldFamilyRefusals++;
    counts.cases++;
   }catch(error){throw new Error('Restored local grammar='+language+' standard='+standard+' scope='+scope+' mask='+mask+' document='+documentSegmented+' review='+reviewSegmented+' case='+counts.cases,{cause:error});}
   finally{allowed=true;reader?.release();faults.clear();faults.restore();await source?.discardAndClose();await journal?.close();await f.close();}
  }}finally{profile.free();}
 }
 for(const [key,expected]of Object.entries({cases:480,profiles:5,interruptedFirstPublications:480,initialColdResumes:480,laterColdResumes:480,inputLivePublications:480,literalInputs:480,originalPixels:480,incomingWholeUploads:480,versions:480,futureNativePairs:1440,readOnlyRefusals:960,oldFamilyRefusals:1440,freshReadScopes:480,writeRefusals:480}))assert.equal(counts[key],expected,key);
 for(const count of Object.values(boundaryCounts))assert.equal(count,80);
 return{format:'breditor/restored-local-operation-journal-probe',formatVersion:1,passed:true,...counts,boundaryCounts,sharedWasmSha256:createHash('sha256').update(readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))).digest('hex'),scope:'Five normal compiler profiles, three selection scopes, eight capability masks and four document/comment history pairs. Actual writable source-owned journal/input, single verified LIVE first-publication, six terminal save interruptions, cold resume and exact future histories. Incoming uploads are preserved data only; no complete operational upload parent, repeated flat export, room adoption, activation, sustainable history or V1 approval.'};
}
