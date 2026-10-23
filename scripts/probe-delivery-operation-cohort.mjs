/** Fixed forty-cohort workload with five actual native writer families. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {localParticipantFixture} from './fixtures/independent-local-operation/participant.mjs';
import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {flatLocalFixture} from './fixtures/flat-local-operation/session.mjs';
import {portableFixture} from './fixtures/independent-operation/portable.mjs';
import {recoveryFactory} from './fixtures/independent-delivery-recovery/session.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {pixel,pixelAsset} from './fixtures/review-assets/pixels.mjs';
const bytes=async file=>Buffer.from(await file.arrayBuffer());
export async function probeDeliveryOperationCohort({api,rich,internals,runtime,fixture}){
 const native=await import(pathToFileURL(join(runtime,'breditor_shared.js')));await native.default({module_or_path:readFileSync(join(runtime,'breditor_shared_bg.wasm'))});
 const root=JSON.parse(readFileSync(fixture,'utf8')),saved=new Map(['fetch','WebSocket'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),fetch=globalThis.fetch;
 const counts={cases:0,nativeProfiles:0,liveWriters:0,handoffs:0,exactNativeRecords:0,wholeUploads:0,literalFiles:0,pixelComparisons:0,localProviderComparisons:0,completeRetainedComparisons:0,coldReopens:0,documentUndoRedo:0,reviewUndoRedo:0,laterDocumentAndReviewEdits:0,retainedVersions:0,networkCalls:0};
 const familyCounts={'independent-delivery':0,'restored-graph':0,'independent-local':0,'local-operation-snapshot':0,'local-operation-flat':0},kindCounts={'snapshot-v1':0,'lineage-v1':0},scopeCounts=[0,0,0],maskCounts=Array(8).fill(0);let sequence=0;
 Object.defineProperty(globalThis,'fetch',{configurable:true,value:(input,...args)=>{const url=typeof input==='string'?input:input?.url??String(input);if(url.startsWith('blob:')||url.startsWith('data:'))return fetch(input,...args);counts.networkCalls++;throw Error('A local ownership workload cannot activate a service');}});
 Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:class{constructor(){counts.networkCalls++;throw Error('A custody cohort cannot start a relay');}}});
 try{for(const[language,standard]of [[1,false],[2,false],[2,true],[3,false],[3,true]]){
  const profile=nativeProfile(native,language,standard);counts.nativeProfiles++;
  try{for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])for(const kind of ['snapshot-v1','lineage-v1']){
   const scope=counts.cases%3,mask=counts.cases%8,selection={language,scope,mask,documentSegmented,reviewSegmented},host={fixture:extra=>localParticipantFixture({api,rich,Participant:internals.Legacy,profile,root,tag:'delivery-cohort-local-'+sequence++,...selection,...extra})};
   const rows=[];let restore=()=>{},parts;
   try{
    for(const restored of [false,true]){
     const reset=environment(),tag='delivery-cohort-seed-'+sequence++;let f,input,graph;
     try{f=await portableFixture({api,rich,Participant:internals.Delivery,profile,seed:root,tag,selection:{...selection,writer:restored?'606':'101',actor:restored?'restored-cohort-comments':'delivery-cohort-comments'},onToken(){counts.networkCalls++;}});
      if(restored){insertCleanupText(f.source.core,'Restored cohort seed LIVE ');await f.source.flush();const capture=await internals.captureIndependentOperationBackup({source:f.source,assets:f.uploads,...f.readOptions});assert.equal(capture.kind,'ready');input=capture.backup;if(kind==='lineage-v1')graph=await internals.IndependentOperationLineageBackup.append(input,input,f.readOptions);const chosen=graph??input;
       rows.push({id:'restored',family:'restored-graph',Class:internals.Restored,file:chosen.file(),options:{kind,expected:chosen.selection(),database:tag+'-parent',journalDatabase:tag+'-journal',sourceDatabase:tag+'-source',uploadsDatabase:tag+'-uploads',writerRecovery:'host-reacquired',session:recoveryFactory(f.selected.options,{readOnly:false,access:'moderate'}),checkAuthority(){}},uploads:await bytes(input.uploadBackup())});
      }else rows.push({id:'delivery',family:'independent-delivery',Class:internals.Delivery,file:f.backup.file(),expected:f.backup.selection(),options:{...f.options,recovery:{...f.options.recovery,checkAuthority(){}}},recoverySession:recoveryFactory(f.selected.options),uploads:await bytes(f.backup.uploadBackup())});
     }finally{graph?.dispose();input?.dispose();await f?.close();reset();}
    }
    for(const[index,family]of ['independent-local','local-operation-snapshot','local-operation-flat'].entries()){
     const extra={writer:String([303,404,505][index]),actor:'delivery-cohort-local-'+index},f=family==='independent-local'?await host.fixture(extra):family==='local-operation-snapshot'?await restoredLocalFixture(host,internals.captureLocalOperationBackup,extra):await flatLocalFixture(host,extra);
     try{if(family==='independent-local')rows.push({id:'local-'+index,family,Class:internals.Legacy,file:f.file,expected:f.selection,options:f.options,uploads:f.uploadBytes,reference:f.reference});
      else{const value=family==='local-operation-snapshot'?f.value:f.original.value;rows.push({id:'local-'+index,family,Class:family==='local-operation-snapshot'?internals.Snapshot:internals.Flat,file:f.file,options:{...f.options,cohort:{parentDatabase:value.f.tag+'-cohort-parent',uploadsDatabase:value.f.tag+'-cohort-uploads'}},uploads:family==='local-operation-snapshot'?value.uploads:await bytes(f.whole),reference:value.f.reference});}
     }finally{await f.close();}
    }
    restore=environment();
    for(const row of rows){
     if(row.family==='independent-delivery'||row.family==='independent-local'){const delivery=row.family==='independent-delivery',Backup=delivery?api.SharedIndependentDeliveryParticipantBackup:api.SharedIndependentParticipantBackup,Recovery=delivery?api.SharedIndependentDeliveryParticipantRecovery:api.SharedIndependentParticipantRecovery;row.backup=await Backup.read(row.file,row.expected);row.attempt=await Recovery.begin({...row.options.recovery,...(delivery?{session:row.recoverySession}:{}),backup:row.backup});row.ready=await row.attempt.finish();row.parent=await row.Class.begin({...row.options,recovered:row.ready});}
     else{row.parent=await row.Class.begin(row.file,row.options);if(row.family==='restored-graph')await row.parent.finish();}
     row.before=row.parent.readableSource();counts.liveWriters++;
    }
    assert.equal(new Set(rows.map(r=>(r.before.source??r.before).identity.native.writer)).size,5);
    const take=async()=>{parts=await internals.handoffDeliveryOperationParticipants(rows.map(r=>({id:r.id,family:r.family,operation:r.parent})));assert.deepEqual(parts.participants.map(r=>[r.id,r.family]),rows.map(r=>[r.id,r.family]));counts.handoffs+=5;};
    const compare=async(index,expected)=>{
     const row=rows[index],p=parts.participants[index].parts,source=p.source.session,complete=index<2,port=complete?internals.independentDeliverySource(source):null;
     assert.deepEqual(complete?port.read():source.exportRecovery(),expected);counts.exactNativeRecords++;
     const uploads=await p.uploads.exportBackup();assert.deepEqual(await bytes(uploads),row.uploads);counts.wholeUploads++;let file;
     if(complete){assert.equal(Object.hasOwn(p,'original'),false);assert.equal(Object.hasOwn(p,'input'),false);assert.deepEqual(port.read().retained,expected.retained);assert.deepEqual(port.read().relay,expected.relay);counts.completeRetainedComparisons++;
      if(index===0){const scope=internals.operationJournalBinding(port.operation).borrowRead(source,()=>{});try{file=(await scope.readSnapshot()).file;}finally{scope.release();}}
      else file=internals.restoredOperationJournalBinding(port.operation).inputFile();
      const archive=await rich.readRichAssetBackup(uploads);try{assert.deepEqual(await bytes(archive.blob(pixelAsset)),pixel);}finally{archive.dispose();}
     }else{const provider=row.family==='independent-local'?p.original:p.input;assert.equal(Object.hasOwn(p,row.family==='independent-local'?'input':'original'),false);file=provider.file();assert.deepEqual(await bytes(provider.blob(row.reference.asset,row.reference.generation)),pixel);counts.localProviderComparisons++;}
     counts.pixelComparisons++;assert.deepEqual(await bytes(file),await bytes(row.file));assert.equal(file.type,row.file.type);counts.literalFiles++;
    };
    await take();
    for(const[index,row]of rows.entries()){
     await compare(index,row.before);const p=parts.participants[index].parts,source=p.source.session,core=source.core;await row.parent.close();
     const document=core.documentJson();assert.equal(core.undo(),true);assert.equal(core.redo(),true);assert.equal(core.documentJson(),document);counts.documentUndoRedo++;
     assert.equal(core.undoReview().kind,'committed');assert.equal(core.redoReview().kind,'committed');counts.reviewUndoRedo++;
     insertCleanupText(core,'Five-family continued document ');core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Five-family continued review'}});counts.laterDocumentAndReviewEdits++;
     await source.retainVersion(core.captureVersion('Five-family continued version','alice','91'));counts.retainedVersions++;await source.flush();row.later=index<2?internals.independentDeliverySource(source).read():source.exportRecovery();
     const before=index<2?row.before.source:row.before,later=index<2?row.later.source:row.later;assert.notEqual(later.documentCheckpoint,before.documentCheckpoint);assert.notEqual(later.reviewCheckpoint,before.reviewCheckpoint);assert.equal(later.versions.length,before.versions.length+1);
     await source.close();p.uploads.close();row.parent=await row.Class.resume(row.options);if(row.family==='restored-graph')await row.parent.finish();assert.deepEqual(row.parent.readableSource(),row.later);await row.parent.check();counts.coldReopens++;
    }
    await take();for(const[index,row]of rows.entries())await compare(index,row.later);
    for(const row of rows)familyCounts[row.family]++;kindCounts[kind]++;scopeCounts[scope]++;maskCounts[mask]++;counts.cases++;
   }catch(error){throw new Error(`Delivery cohort profile=${language}/${standard} scope=${scope} mask=${mask} histories=${documentSegmented}/${reviewSegmented} kind=${kind} case=${counts.cases}`,{cause:error});}
   finally{try{for(const row of parts?.participants??[]){await row.parts.source.session.discardAndClose();row.parts.uploads.close();}for(const row of rows.toReversed()){await row.parent?.discardAndClose();await row.ready?.discardAndClose();await row.attempt?.close();row.backup?.dispose();}}finally{restore();}}
  }}finally{profile.free();}
 }}finally{for(const[key,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 for(const[key,value]of Object.entries({cases:40,nativeProfiles:5,liveWriters:200,handoffs:400,exactNativeRecords:400,wholeUploads:400,literalFiles:400,pixelComparisons:400,localProviderComparisons:240,completeRetainedComparisons:160,coldReopens:200,documentUndoRedo:200,reviewUndoRedo:200,laterDocumentAndReviewEdits:200,retainedVersions:200,networkCalls:0}))assert.equal(counts[key],value,key);
 for(const value of Object.values(familyCounts))assert.equal(value,40);for(const value of Object.values(kindCounts))assert.equal(value,20);assert.deepEqual(scopeCounts,[14,13,13]);assert.deepEqual(maskCounts,Array(8).fill(5));
 return{format:'breditor/delivery-operation-cohort-probe',formatVersion:1,passed:true,...counts,familyCounts,kindCounts,scopeCounts,maskCounts,historyPairs:4,fullCartesianDomain:false,sharedWasmSha256:createHash('sha256').update(readFileSync(join(runtime,'breditor_shared_bg.wasm'))).digest('hex'),scope:'Forty actual five-family cohorts across five normal native profiles, four history pairs and both restored snapshot/lineage kinds. Scopes/masks rotate, not their full Cartesian product. Two shared handoffs conserve exact native records, complete retained packets/relay state, whole uploads, literal source-owned files and pixels, with later edits, versions, both Undo lanes and cold continuation. No network work; not seven-family physical catalog adoption, full reconciliation, authenticated activation, sustainable history, physical durability or V1 approval.'};
}
