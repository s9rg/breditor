/** Fixed three-family native custody workload. Real Rust and actual file,
 * writer, journal, upload and provider owners run in controlled local storage. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {localParticipantFixture} from './fixtures/independent-local-operation/participant.mjs';
import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {flatLocalFixture} from './fixtures/flat-local-operation/session.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {pixel} from './fixtures/review-assets/pixels.mjs';
const bytes=async file=>Buffer.from(await file.arrayBuffer());
export async function probeLocalOperationCohort({api,rich,internals,runtime,fixture}){
 const native=await import(pathToFileURL(join(runtime,'breditor_shared.js')));await native.default({module_or_path:readFileSync(join(runtime,'breditor_shared_bg.wasm'))});
 const root=JSON.parse(readFileSync(fixture,'utf8')),saved=new Map(['fetch','WebSocket'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),fetch=globalThis.fetch;
 const counts={cases:0,nativeProfiles:0,liveWriters:0,handoffs:0,exactNativeRecords:0,wholeUploads:0,literalFiles:0,providerPixels:0,coldReopens:0,documentUndoRedo:0,reviewUndoRedo:0,laterDocumentAndReviewEdits:0,retainedVersions:0,networkCalls:0};
 const familyCounts={'independent-local':0,'local-operation-snapshot':0,'local-operation-flat':0},scopeCounts=[0,0,0],maskCounts=Array(8).fill(0);
 Object.defineProperty(globalThis,'fetch',{configurable:true,value:(input,...args)=>{const url=typeof input==='string'?input:input?.url??String(input);if(url.startsWith('blob:')||url.startsWith('data:'))return fetch(input,...args);counts.networkCalls++;throw Error('A local custody cohort cannot start network work');}});
 Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:class{constructor(){counts.networkCalls++;throw Error('A local custody cohort cannot activate a relay');}}});
 let sequence=0;
 const orders=[['independent-local','local-operation-snapshot','local-operation-flat'],['local-operation-flat','independent-local','local-operation-snapshot'],['local-operation-snapshot','local-operation-flat','independent-local']];
 try{for(const[language,standard]of [[1,false],[2,false],[2,true],[3,false],[3,true]]){
  const profile=nativeProfile(native,language,standard);counts.nativeProfiles++;
  try{for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])for(const order of orders){
   const scope=counts.cases%3,mask=counts.cases%8,host={fixture:extra=>localParticipantFixture({api,rich,Participant:internals.Legacy,profile,root,tag:'local-cohort-probe-'+sequence++,language,scope,mask,...extra})};
   const rows=[];let restore=()=>{},parts;
   try{
    for(const[index,family]of order.entries()){
     const extra={writer:String([101,303,404][index]),actor:'local-cohort-'+index,documentSegmented,reviewSegmented};
     if(family==='independent-local'){
      const f=await host.fixture(extra);try{rows.push({id:'member-'+index,family,Parent:internals.Legacy,file:f.file,expected:f.selection,options:f.options,reference:f.reference,uploads:f.uploadBytes});}finally{await f.close();}
     }else{
      const f=family==='local-operation-snapshot'?await restoredLocalFixture(host,internals.captureLocalOperationBackup,extra):await flatLocalFixture(host,extra);
      try{const seed=family==='local-operation-snapshot'?f.value:f.original.value;rows.push({id:'member-'+index,family,Parent:family==='local-operation-snapshot'?internals.Snapshot:internals.Flat,file:f.file,options:{...f.options,cohort:{parentDatabase:seed.f.tag+'-cohort-parent',uploadsDatabase:seed.f.tag+'-cohort-uploads'}},reference:seed.f.reference,uploads:family==='local-operation-snapshot'?f.value.uploads:await bytes(f.whole)});}finally{await f.close();}
     }
    }
    restore=environment();
    for(const row of rows){
     if(row.family==='independent-local'){row.backup=await api.SharedIndependentParticipantBackup.read(row.file,row.expected);row.attempt=await api.SharedIndependentParticipantRecovery.begin({...row.options.recovery,backup:row.backup});row.ready=await row.attempt.finish();row.parent=await row.Parent.begin({...row.options,recovered:row.ready});}
     else row.parent=await row.Parent.begin(row.file,row.options);
     row.before=row.parent.readableSource();counts.liveWriters++;
    }
    assert.equal(new Set(rows.map(r=>r.before.identity.native.writer)).size,3);
    const take=async()=>{parts=await internals.handoffLocalOperationCohort(rows.map(r=>({id:r.id,family:r.family,operation:r.parent})));assert.deepEqual(parts.participants.map(r=>[r.id,r.family]),rows.map(r=>[r.id,r.family]));counts.handoffs+=3;};
    const compare=async(index,expected)=>{const row=rows[index],p=parts.participants[index].parts,provider=row.family==='independent-local'?p.original:p.input;
     assert.equal(Object.hasOwn(p,row.family==='independent-local'?'input':'original'),false);assert.deepEqual(p.source.session.exportRecovery(),expected);counts.exactNativeRecords++;
     assert.deepEqual(await bytes(await p.uploads.exportBackup()),row.uploads);counts.wholeUploads++;
     assert.deepEqual(await bytes(provider.file()),await bytes(row.file));assert.equal(provider.file().type,row.file.type);counts.literalFiles++;
     assert.deepEqual(await bytes(provider.blob(row.reference.asset,row.reference.generation)),pixel);counts.providerPixels++;
    };
    await take();
    for(const[index,row]of rows.entries()){
     await compare(index,row.before);const p=parts.participants[index].parts,source=p.source.session,core=source.core;await row.parent.close();
     const doc=core.documentJson();assert.equal(core.undo(),true);assert.equal(core.redo(),true);assert.equal(core.documentJson(),doc);counts.documentUndoRedo++;
     assert.equal(core.undoReview().kind,'committed');assert.equal(core.redoReview().kind,'committed');counts.reviewUndoRedo++;
     insertCleanupText(core,'Three-family cohort document ');core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Three-family cohort review'}});counts.laterDocumentAndReviewEdits++;
     await source.retainVersion(core.captureVersion('Three-family cohort version','alice','71'));counts.retainedVersions++;await source.flush();row.later=source.exportRecovery();
     assert.notEqual(row.later.documentCheckpoint,row.before.documentCheckpoint);assert.notEqual(row.later.reviewCheckpoint,row.before.reviewCheckpoint);assert.equal(row.later.versions.length,row.before.versions.length+1);
     await source.close();p.uploads.close();row.parent=await row.Parent.resume(row.options);assert.deepEqual(row.parent.readableSource(),row.later);await row.parent.check();counts.coldReopens++;
    }
    await take();for(const[index,row]of rows.entries())await compare(index,row.later);
    for(const row of rows)familyCounts[row.family]++;scopeCounts[scope]++;maskCounts[mask]++;counts.cases++;
   }catch(error){throw new Error(`Local cohort profile=${language}/${standard} scope=${scope} mask=${mask} histories=${documentSegmented}/${reviewSegmented} order=${order.join('/')} case=${counts.cases}`,{cause:error});}
   finally{try{for(const row of parts?.participants??[]){await row.parts.source.session.discardAndClose();row.parts.uploads.close();}for(const row of rows.toReversed()){await row.parent?.discardAndClose();await row.ready?.discardAndClose();await row.attempt?.close();row.backup?.dispose();}}finally{restore();}}
  }}finally{profile.free();}
 }}finally{for(const[key,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 for(const[key,value]of Object.entries({cases:60,nativeProfiles:5,liveWriters:180,handoffs:360,exactNativeRecords:360,wholeUploads:360,literalFiles:360,providerPixels:360,coldReopens:180,documentUndoRedo:180,reviewUndoRedo:180,laterDocumentAndReviewEdits:180,retainedVersions:180,networkCalls:0}))assert.equal(counts[key],value,key);
 for(const count of Object.values(familyCounts))assert.equal(count,60);for(const count of scopeCounts)assert.equal(count,20);assert.deepEqual(maskCounts,[8,8,8,8,7,7,7,7]);
 return{format:'breditor/local-operation-cohort-probe',formatVersion:1,passed:true,...counts,familyCounts,scopeCounts,maskCounts,historyPairs:4,cyclicFamilyOrders:3,fullCartesianDomain:false,sharedWasmSha256:createHash('sha256').update(readFileSync(join(runtime,'breditor_shared_bg.wasm'))).digest('hex'),scope:'Sixty actual three-family cohorts across all five normal compiler profiles, four history pairs and three cyclic family orders. Selection scopes and capability masks rotate on a fixed schedule, not their full Cartesian product. Exact native records, complete uploads, original/input files and pixels survive two shared handoffs, later edits, versions, both Undo lanes and cold continuation. Controlled storage, no network activation; not seven-family catalog adoption, complete provider/client reconciliation, authenticated activation, sustainable history, physical durability or V1 approval.'};
}
