/** Genuine mixed-family V2 retention, inactive native staging, interruption and exact future history. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {generationParticipant} from './fixtures/room-participant-inventory/generation-participant.mjs';
import {recoverParticipant} from './fixtures/room-participant-inventory/participant.mjs';
import {pixel,secondPixel} from './fixtures/review-assets/pixels.mjs';
import {catalogV2Faults} from './fixtures/room-recovery-catalog-v2/faults.mjs';
import {catalogCleanupFailures} from './fixtures/room-recovery-catalog-v2/cleanup-failures.mjs';
import {participantCleanupFailures} from './fixtures/room-recovery-catalog-v2/acquisition-failures.mjs';
export async function probeRoomRecoveryCatalogV2(directory,manifestPath,modules){
 const api=modules?.collaboration??await import('../packages/breditor-collaboration/dist/index.js'),rich=modules?.rich??await import('../packages/breditor-experimental-rich-content/index.js'),{SharedRoomRecoveryCatalogArchiveV2,SharedRoomRecoveryCatalogV2}=api;
 assert.equal(typeof SharedRoomRecoveryCatalogV2,'function');
 // An explicit installed-file fixture hook injects a failed cooperative release; it is not public SDK API.
 const {RecoveryLease}=modules?.leases??await import(new URL('./participant_recovery/lease.js',import.meta.resolve('@breditor/collaboration')).href);
 const wasm=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);await wasm.default({module_or_path:readFileSync(resolve(directory,'breditor_shared_bg.wasm'))});
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.cases.length,10);
 const counts={nativeRooms:0,families:0,stagedGeneration:0,stagedMixed:0,coldGeneration:0,coldMixed:0,files:0,duplicateWriterRefusals:0,legacyCopiesRetained:0,futureDocumentCheckpoints:0,futureReviewCheckpoints:0,wrongFamilyRefusals:0,oldReaderRefusals:0,changedPlanRefusals:0,networkCalls:0,restoredParticipants:0,restoredComponents:0}
Object.assign(counts,{lostAcknowledgementResumes:0,planAbortRetries:0,parentMarkerAbortResumes:0,fabricatedCompletionRefusals:0,policySnapshots:0,partialNativeRestoreResumes:0,closeDuringRestoreResumes:0,reentrancyRefusals:0,authorityRefusals:0,mixedPolicySnapshots:0,failedCleanupRetries:0,originalCatalogCleanupRetries:0,generationCatalogCleanupRetries:0,mixedOriginalCleanupRetries:0,cleanupRetainedRecordComparisons:0,cleanupColdParticipants:0,cleanupOriginalFileComparisons:0});const testedTransports=new Set(),restore=environment();
function generationRequest(h,id,tag){const{database:_database,create:_create,initialGenerations:_ids,initialReviewCheckpoint:_review,binding,retained,...native}=h.options;return{id,family:'generation',recovery:{database:tag+'-attempt',destinations:{source:tag+'-source',uploads:tag+'-uploads'},session:{kind:h.kind,options:{...native,...(h.kind!=='local'?{binding}:{}),...(h.kind==='retained'?{retained}:{})}}}};}
function originalRequest(h,id,tag){const{backup:_backup,expected:_expected,checkAuthority:_authority,...rest}=h.recovery;return{id,family:'original',recovery:{...rest,database:tag+'-attempt',destinations:Object.fromEntries(Object.keys(rest.destinations).map(k=>[k,tag+'-'+k]))}};}
try{for(const[roomIndex,item]of manifest.cases.entries()){
 const fixture=JSON.parse(readFileSync(item.path,'utf8')),factory=fixture.language===1?'from_configuration_json':fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`,profile=wasm.SharedRichProfile[factory](fixture.configuration),server=new Blob([readFileSync(resolve(dirname(item.path),'server.backup'))]),serverIdentity={bytes:server.size,sha256:createHash('sha256').update(new Uint8Array(await server.arrayBuffer())).digest('hex')};
 try{for(const kind of ['local','relay','retained']){
  const tag=`room-catalog-v2-${roomIndex}-${kind}`,rows=[],generations=[],held=[];let archive,catalog;
  try{
   for(const[index,client]of fixture.clients.entries()){
    const h=await generationParticipant({api,rich,profile,fixture,client,kind,tag:tag+'-g'+index,counts});held.push(h);const id='generation-'+index;rows.push({id,family:'generation',file:h.backup.file(),expected:h.backup.selection()});generations.push({id,request:generationRequest(h,id,tag+'-g'+index+'-stage'),readOnly:h.readOnly,before:h.exportRecovery()});await h.close();
   }
   const old=await recoverParticipant({api,rich,profile,fixture,client:fixture.clients[0],tag:tag+'-original',counts,uploads:[pixel,secondPixel]});held.push(old);rows.push({id:'a-original-0',family:'original',file:old.backup.file(),expected:old.backup.selection()});const original=originalRequest(old,'a-original-0',tag+'-original-stage');await old.close();
   const input={catalog:tag,inventory:{file:new Blob([fixture.inventoryJson]),expected:fixture.selected},server:{file:server,expected:serverIdentity},participants:rows,checkAuthority(){}};
   archive=await SharedRoomRecoveryCatalogArchiveV2.capture(input);assert.equal(archive.metadata().formatVersion,2);assert.equal(archive.metadata().participants.length,3);const selection=archive.selection(),files=new Map([['server',archive.serverFile()],['inventory',archive.inventoryFile()],...rows.map(row=>['participant:'+row.id,archive.participantFile(row.id)])]);
   await assert.rejects(api.SharedRoomRecoveryCatalogArchive.read(archive.manifestJson(),files,selection,{checkAuthority(){}}),e=>e.code==='catalog_integrity');counts.oldReaderRefusals++;
   await assert.rejects(SharedRoomRecoveryCatalogArchiveV2.capture({...input,participants:rows.map((row,index)=>index===0?{...row,family:'original'}:row)}),e=>e.code==='catalog_integrity');counts.wrongFamilyRefusals++;
   const open={database:tag+'-catalog',expected:selection,checkAuthority(){}};catalog=await SharedRoomRecoveryCatalogV2.begin({...open,archive});
   await assert.rejects(catalog.stage([generations[0].request,original]),e=>e.code==='catalog_source');assert.equal((await catalog.progress()).phase,'retained');counts.duplicateWriterRefusals++;
   const selected=generations.map(g=>g.request),result=await catalog.stage(selected);assert.equal(result.kind,'pending');assert.deepEqual(result.unreconciledParticipants,['a-original-0']);assert.equal(result.coverage.kind,kind==='local'?'pending':'covered');counts.stagedGeneration+=2;assert.deepEqual(await catalog.stage(selected),result);
   await assert.rejects(catalog.stage(selected.slice(0,1)),e=>e.code==='catalog_diverged');counts.changedPlanRefusals++;
   assert.deepEqual(new Uint8Array(await catalog.serverFile().arrayBuffer()),new Uint8Array(await input.server.file.arrayBuffer()));assert.equal(await catalog.inventoryFile().text(),fixture.inventoryJson);counts.files+=2;
   for(const row of rows){assert.deepEqual(new Uint8Array(await catalog.participantFile(row.id).arrayBuffer()),new Uint8Array(await row.file.arrayBuffer()));counts.files++;}counts.legacyCopiesRetained++;
   await catalog.close();catalog=await SharedRoomRecoveryCatalogV2.resume(open);assert.deepEqual(await catalog.stage(selected),result);counts.coldGeneration+=2;await catalog.close();catalog=undefined;
   for(const g of generations){const row=rows.find(row=>row.id===g.id),attempt=await api.SharedGenerationParticipantRecovery.resume({...g.request.recovery,expected:row.expected,checkAuthority(){}});let ready,parts;try{ready=await attempt.finish();parts=await ready.intoParts();const actual=parts.source.session.exportRecovery?kind==='retained'?parts.source.session.exportRetainedRecovery():parts.source.session.exportRecovery():undefined;assert.deepEqual(actual,g.before);if(!g.readOnly){const core=parts.source.session.core,reference=new api.SharedRichEditor(profile.restore_segmented(hRoom(fixture),core.checkpointJson()),{segmentedHistory:'segmented-v1'});try{reference.enableReview(g.request.recovery.session.options.review,core.reviewCheckpoint());for(const action of ['redo','undo']){assert.equal(core[action](),reference[action]());assert.equal(core.checkpointJson(),reference.checkpointJson());counts.futureDocumentCheckpoints++;core[action+'Review']();reference[action+'Review']();assert.equal(core.reviewCheckpoint(),reference.reviewCheckpoint());counts.futureReviewCheckpoints++;}}finally{reference.dispose();}}}finally{await parts?.source.session.close();parts?.uploads.close();await ready?.discardAndClose();await attempt.close();}}
   const mixOpen={database:tag+'-mixed-catalog',expected:selection,checkAuthority(){}};catalog=await SharedRoomRecoveryCatalogV2.begin({...mixOpen,archive});const mixed=[original,generationRequestFrom(generations[1].request,tag+'-mixed-gen1')],mix=await catalog.stage(mixed);assert.equal(mix.kind,'pending');assert.deepEqual(mix.unreconciledParticipants,['generation-0']);assert.equal(mix.coverage.kind,kind==='local'?'pending':'covered');counts.stagedMixed+=2;await catalog.close();catalog=await SharedRoomRecoveryCatalogV2.resume(mixOpen);assert.deepEqual(await catalog.stage(mixed),mix);counts.coldMixed+=2;await catalog.close();catalog=undefined;
   if(kind==='retained'&&!testedTransports.has(fixture.atomic)){
    const requests=prefix=>generations.map((g,index)=>generationRequestFrom(g.request,prefix+'-'+index)),mixedRequests=prefix=>[originalRequestFrom(original,prefix+'-old'),generationRequestFrom(generations[1].request,prefix+'-gen')];
    await catalogV2Faults({api,archive,tag:tag+'-faults',requests,mixedRequests,counts});
    const originalInput={...input,participants:input.participants.filter(row=>row.family==='original').map(({family:_family,...row})=>row)};
    await catalogCleanupFailures({api,RecoveryLease,archive,originalInput,requests,mixedRequests,tag,counts});
    Object.assign(counts,Object.fromEntries(['failedAcquisitionRetries','originalCatalogAcquisitionRetries','generationCatalogAcquisitionRetries','mixedOriginalAcquisitionRetries','acquisitionRetainedRecordComparisons','acquisitionColdParticipants','acquisitionOriginalFileComparisons'].map(key=>[key,counts[key]??0])));
    await participantCleanupFailures({api,RecoveryLease,archive,originalInput,requests,mixedRequests,tag,counts});testedTransports.add(fixture.atomic);
   }
   counts.families++;
  }catch(error){console.error('V2 catalog case',roomIndex,kind);throw error;}finally{await catalog?.discardAndClose();archive?.dispose();for(const h of held.reverse())await h.close();}
 }counts.nativeRooms++;}finally{profile.free();}
}}finally{restore();}
function hRoom(fixture){return JSON.parse(fixture.inventoryJson).room.document;}
function generationRequestFrom(row,tag){return{...row,recovery:{...row.recovery,database:tag+'-attempt',destinations:{source:tag+'-source',uploads:tag+'-uploads'}}};}

function originalRequestFrom(row,tag){return{...row,recovery:{...row.recovery,database:tag+'-attempt',destinations:Object.fromEntries(Object.keys(row.recovery.destinations).map(k=>[k,tag+'-'+k]))}};}
 for(const[key,value]of Object.entries({"nativeRooms":10,"families":30,"stagedGeneration":60,"stagedMixed":60,"coldGeneration":60,"coldMixed":60,"files":150,"duplicateWriterRefusals":30,"legacyCopiesRetained":30,"futureDocumentCheckpoints":54,"futureReviewCheckpoints":54,"wrongFamilyRefusals":30,"oldReaderRefusals":30,"changedPlanRefusals":30,"networkCalls":0,"restoredParticipants":30,"restoredComponents":120,"lostAcknowledgementResumes":6,"planAbortRetries":2,"parentMarkerAbortResumes":2,"fabricatedCompletionRefusals":2,"policySnapshots":2,"partialNativeRestoreResumes":2,"closeDuringRestoreResumes":2,"reentrancyRefusals":2,"authorityRefusals":2,"mixedPolicySnapshots":2}))assert.equal(counts[key],value,key);
 for(const[key,value]of Object.entries({failedCleanupRetries:6,originalCatalogCleanupRetries:2,generationCatalogCleanupRetries:2,mixedOriginalCleanupRetries:2,cleanupColdParticipants:6}))assert.equal(counts[key],value,key);
 for(const[key,value]of Object.entries({failedAcquisitionRetries:12,originalCatalogAcquisitionRetries:4,generationCatalogAcquisitionRetries:4,mixedOriginalAcquisitionRetries:4,acquisitionColdParticipants:12}))assert.equal(counts[key],value,key);
 return{format:'breditor/room-recovery-catalog-v2-probe',formatVersion:1,passed:true,...counts,scope:'Explicit original/generation files in one closed V2 manifest, normal native room histories, genuine readonly staging, duplicate/historic retention, interrupted commits, changed plans and exact cold/future histories. Six parent-cleanup retries and twelve participant-internal cleanup paths retain exact records and files, then cold-reopen real native owners. Synthetic storage/locks/raster; not mixed operational parent transfer, current provider/client closure, independent comment/server generations, browser durability or authenticated room activation.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error('Expected canonical shared runtime and native inventory manifest');console.log(JSON.stringify(await probeRoomRecoveryCatalogV2(process.argv[2],process.argv[3]),null,2));}
