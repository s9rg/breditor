/** Native registration reconciliation of complete generation histories, not AST equality. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {IDBDatabase} from 'fake-indexeddb';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {generationParticipant} from './fixtures/room-participant-inventory/generation-participant.mjs';
import {generationInventoryRefusals} from './fixtures/room-participant-inventory/generation-refusals.mjs';

export async function probeGenerationRoomInventory(directory,manifestPath,modules) {
 const api=modules?.collaboration??await import('../packages/breditor-collaboration/dist/index.js'),rich=modules?.rich??await import('../packages/breditor-experimental-rich-content/index.js');
 assert.equal(typeof api.SharedRoomParticipantInventory.prototype.checkGenerationSources,'function','Generation-aware native inventory reconciliation is required');
 const wasm=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);await wasm.default({module_or_path:readFileSync(resolve(directory,'breditor_shared_bg.wasm'))});
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.cases.length,10);
 const counts={nativeRooms:0,sourceFamilies:0,participants:0,coldParticipants:0,coveredStreams:0,localUnboundReviews:0,canonicalClockReads:0,pureChecks:0,duplicateRefusals:0,spoofRefusals:0,disposedSourceRefusals:0,staleSourceRefusals:0,observerZeroPrefixes:0,revokedContributors:0,futureDocumentCheckpoints:0,futureReviewCheckpoints:0,behindDocumentPending:0,documentForkRefusals:0,observerAuthorRefusals:0,foreignPrincipalRefusals:0,reviewForkRefusals:0,behindReviewPending:0,reviewBindingRefusals:0,transportBindingRefusals:0,reviewObserverRefusals:0,versionBindingRefusals:0,suggestionBindingRefusals:0,revisionBindingRefusals:0,effectWriterRefusals:0,retiredReadableSources:0,inventoryDisposalsDuringRead:0,refusalRetentionComparisons:0,networkCalls:0};
 const restoreEnvironment=environment();
 try{for(const item of manifest.cases){
  const fixture=JSON.parse(readFileSync(item.path,'utf8')),factory=fixture.language===1?'from_configuration_json':fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`,profile=wasm.SharedRichProfile[factory](fixture.configuration),inventory=await api.readSharedRoomParticipantInventory(new Blob([fixture.inventoryJson]),fixture.selected);
  try{for(const kind of ['local','relay','retained']){const held=[];try{
   for(const [index,client]of fixture.clients.entries()){const h=await generationParticipant({api,rich,profile,fixture,client,kind,tag:`gen-inventory-${counts.nativeRooms}-${kind}-${index}`,counts});held.push(h);counts.participants++;}
   const before=held.map(h=>({source:h.exportRecovery(),records:h.source.records(),uploads:undefined}));for(const [index,h]of held.entries())before[index].uploads=new Uint8Array(await(await h.uploads.exportBackup()).arrayBuffer());
   const expectedKind=kind==='local'?'pending':'covered',check=()=>inventory.checkGenerationSources(held);assert.equal(check().kind,expectedKind);assert.ok(Object.isFrozen(check().checkedParticipants));counts.pureChecks++;
   if(kind==='local'){const result=check();assert.equal(result.registeredStreamsCovered,false);assert.equal(result.missing.filter(row=>row.kind==='unbound_review').length,2);counts.localUnboundReviews+=2;}else{assert.equal(check().registeredStreamsCovered,true);assert.equal(check().missing.length,0);counts.coveredStreams+=4;}
   const transaction=IDBDatabase.prototype.transaction;try{IDBDatabase.prototype.transaction=function(){throw Error('Unexpected inventory storage I/O');};assert.equal(check().kind,expectedKind);counts.pureChecks++;}finally{IDBDatabase.prototype.transaction=transaction;}
   const methods=['descriptor','writerClock','writerClockV2','writerGroups','writerGroupsV2','reviewWriterClock','localReviewClock'],core=held[0].session.core,saved=new Map(methods.map(name=>[name,Object.getOwnPropertyDescriptor(core,name)]));try{for(const name of methods)core[name]=()=>{throw Error('PRIVATE-INSTANCE-READ-OVERRIDE');};assert.equal(check().kind,expectedKind);counts.canonicalClockReads++;}finally{for(const[name,value]of saved)if(value)Object.defineProperty(core,name,value);else delete core[name];}
   assert.throws(()=>inventory.checkGenerationSources([held[0],held[0]]),e=>e.code==='inventory_duplicate');counts.duplicateRefusals++;
   for(const pair of [{backup:{selection:()=>held[0].backup.selection(),verifySource(){}},source:held[0].source},{backup:held[0].backup,source:{check(){},records:()=>held[0].source.records()}}]){assert.throws(()=>inventory.checkGenerationSources([pair]),e=>e.code==='inventory_source');counts.spoofRefusals++;}
   const disposed=api.captureSharedGenerationSource({kind,session:held[0].session});disposed.dispose();assert.throws(()=>inventory.checkGenerationSources([{backup:held[0].backup,source:disposed}]),e=>e.code==='inventory_source');counts.disposedSourceRefusals++;
   for(const[index,h]of held.entries()){
    assert.deepEqual(h.exportRecovery(),before[index].source);assert.deepEqual(h.source.records(),before[index].records);assert.deepEqual(new Uint8Array(await(await h.uploads.exportBackup()).arrayBuffer()),before[index].uploads);
    await h.recover();assert.equal(check().kind,expectedKind);assert.deepEqual(h.exportRecovery(),before[index].source);assert.deepEqual(h.source.records(),before[index].records);assert.deepEqual(new Uint8Array(await(await h.uploads.exportBackup()).arrayBuffer()),before[index].uploads);
    if(h.client.observer){assert.equal((fixture.atomic?h.session.core.writerClockV2(h.client.writer):h.session.core.writerClock(h.client.writer)).through,'0');assert.equal(h.session.core.localReviewClock().through,'0');counts.observerZeroPrefixes+=2;}else if(h.readOnly){assert.equal(h.session.core.view().readOnly,true);counts.revokedContributors++;}
   }
   for(const h of held)if(!h.readOnly){const current=h.session.core,checkpoint=current.checkpointJson(),review=current.reviewCheckpoint(),reference=new api.SharedRichEditor(profile.restore_segmented(inventory.metadata().room.document,checkpoint),{segmentedHistory:'segmented-v1'});try{reference.enableReview(h.options.review,review);for(const method of ['redo','undo']){assert.equal(current[method](),reference[method]());assert.equal(current.checkpointJson(),reference.checkpointJson());counts.futureDocumentCheckpoints++;current[method+'Review']();reference[method+'Review']();assert.equal(current.reviewCheckpoint(),reference.reviewCheckpoint());counts.futureReviewCheckpoints++;}assert.throws(()=>check(),e=>e.code==='inventory_source');counts.staleSourceRefusals++;}finally{reference.dispose();}}
   counts.sourceFamilies++;
  }finally{for(const h of held.reverse())await h.close();}}
  await generationInventoryRefusals({api,rich,profile,fixture,inventory,counts,tag:`gen-inventory-refusals-${counts.nativeRooms}`});counts.nativeRooms++;
  }finally{inventory.dispose();profile.free();}
 }}finally{restoreEnvironment();}
 assert.equal(counts.nativeRooms,10);assert.equal(counts.sourceFamilies,30);assert.equal(counts.participants,60);assert.equal(counts.coldParticipants,60);assert.equal(counts.coveredStreams,80);assert.equal(counts.localUnboundReviews,20);assert.equal(counts.networkCalls,0);
 for(const key of ['behindDocumentPending','documentForkRefusals','observerAuthorRefusals','foreignPrincipalRefusals','reviewForkRefusals','behindReviewPending','reviewBindingRefusals','transportBindingRefusals','reviewObserverRefusals','versionBindingRefusals','retiredReadableSources','inventoryDisposalsDuringRead'])assert.equal(counts[key],10,key);
 for(const key of ['suggestionBindingRefusals','revisionBindingRefusals','effectWriterRefusals'])assert.equal(counts[key],5,key);assert.equal(counts.refusalRetentionComparisons,405);
 return{format:'breditor/generation-room-inventory-probe',passed:true,...counts,scope:'All ten native server profile/transport fixtures and local/relay/retained generation sources. Genuine native prefix reads, unchanged document/review and pending packet records, whole uploads, operational cold recovery, permanent observers and revoked contributors. Source retirement/authority/activation and global provider closure are separate. Synthetic IndexedDB/locks/raster, not browser durability or a complete room-generation bridge.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error('Expected canonical runtime and native inventory fixture manifest');console.log(JSON.stringify(await probeGenerationRoomInventory(process.argv[2],process.argv[3]),null,2));}
