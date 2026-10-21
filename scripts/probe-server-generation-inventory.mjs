/** Real native physical selections checked against genuine original/generation client histories. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {IDBDatabase} from 'fake-indexeddb';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {generationParticipant} from './fixtures/room-participant-inventory/generation-participant.mjs';
import {recoverParticipant} from './fixtures/room-participant-inventory/participant.mjs';
import {probePhysicalMixedSources} from './fixtures/server-generation-inventory/mixed.mjs';
export async function probeServerGenerationInventory(runtime,manifestPath,modules) {
 const api=modules?.collaboration??await import('../packages/breditor-collaboration/dist/index.js'),rich=modules?.rich??await import('../packages/breditor-experimental-rich-content/index.js');
 const wasm=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')).href);await wasm.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.format,'breditor/native-server-generation-inventory-fixtures');assert.equal(manifest.cases.length,10);
 const counts={nativeRooms:0,longNativeCuts:0,physicalOnlyCuts:0,originalParticipants:0,generationParticipants:0,sourceFamilies:0,coldParticipants:0,restoredParticipants:0,restoredComponents:0,coveredStreams:0,localUnboundReviews:0,pureChecks:0,sourceComparisons:0,duplicateRefusals:0,mixedCohorts:0,mixedDuplicateRefusals:0,mixedRetainedComparisons:0,crossFamilyWriterOwnershipRefusals:0,crossFamilyReviewOwnershipRefusals:0,spoofRefusals:0,revokedContributors:0,observerZeroPrefixes:0,futureDocumentCheckpoints:0,futureReviewCheckpoints:0,networkCalls:0};
 const restore=environment();
 try{for(const item of manifest.cases){
  const fixture=JSON.parse(readFileSync(item.path,'utf8')),folder=dirname(item.path),factory=fixture.language===1?'from_configuration_json':fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`,profile=wasm.SharedRichProfile[factory](fixture.configuration);
  const file=new Blob([readFileSync(resolve(folder,'inventory.json'))]),afterFile=new Blob([readFileSync(resolve(folder,'inventory-after.json'))]);
  const inventory=await api.readSharedServerLogGenerationParticipantInventory(file,fixture.selected),after=await api.readSharedServerLogGenerationParticipantInventory(afterFile,fixture.afterSelected);
  try{
   assert.deepEqual(inventory.metadata().native,JSON.parse(fixture.inventoryJson));assert.deepEqual(inventory.metadata().native,after.metadata().native);assert.deepEqual(inventory.identity(),fixture.selected);assert.deepEqual(after.identity(),fixture.afterSelected);assert.deepEqual(inventory.identity(),fixture.recoveryState.participants);assert.deepEqual(after.identity(),fixture.afterRecoveryState.participants);assert.notDeepEqual(inventory.identity().source,after.identity().source);counts.physicalOnlyCuts++;
   await assert.rejects(api.readSharedServerLogGenerationParticipantInventory(afterFile,{source:fixture.selected.source,sha256:fixture.afterSelected.sha256}),error=>error.code==='inventory_format');
   if(fixture.longNativeCut){assert.ok(inventory.identity().source.source.records>8192);counts.longNativeCuts++;const declaration=fixture.inventoryJson,digest=[...createHash('sha256').update(declaration).digest()];await assert.rejects(api.readSharedRoomParticipantInventory(new Blob([declaration]),{room:inventory.metadata().native.room,sha256:digest}),error=>error.code==='inventory_format');}
   const originals=[];
   try{for(const client of fixture.clients)originals.push(await recoverParticipant({api,rich,profile,fixture,client,counts,tag:`physical-original-${counts.nativeRooms}-${client.writer}`}));
    const selected=inventory.checkSources(originals),continued=after.checkSources(originals);assert.equal(selected.coverage.kind,'covered');assert.equal(selected.coverage.registeredStreamsCovered,true);assert.deepEqual(selected.coverage,continued.coverage);assert.deepEqual(selected.source,fixture.selected.source);assert.deepEqual(continued.source,fixture.afterSelected.source);counts.originalParticipants+=2;counts.coveredStreams+=4;
   }finally{for(const handle of originals.reverse())await handle.close();}
   for(const kind of ['local','relay','retained']){
    const held=[];
    try{for(const client of fixture.clients){held.push(await generationParticipant({api,rich,profile,fixture,client,kind,counts,tag:`physical-${counts.nativeRooms}-${kind}-${client.writer}`}));counts.generationParticipants++;}
     const before=held.map(h=>({source:h.exportRecovery(),records:h.source.records()})),check=()=>inventory.checkGenerationSources(held),initial=check();assert.deepEqual(initial.source,fixture.selected.source);assert.deepEqual(after.checkGenerationSources(held).coverage,initial.coverage);assert.equal(initial.coverage.kind,kind==='local'?'pending':'covered');
     if(kind==='local'){assert.equal(initial.coverage.missing.filter(row=>row.kind==='unbound_review').length,2);counts.localUnboundReviews+=2;}else{assert.equal(initial.coverage.registeredStreamsCovered,true);counts.coveredStreams+=4;}
     const transaction=IDBDatabase.prototype.transaction;try{IDBDatabase.prototype.transaction=function(){throw Error('Unexpected physical inventory I/O');};assert.deepEqual(check(),initial);counts.pureChecks++;}finally{IDBDatabase.prototype.transaction=transaction;}
     assert.throws(()=>inventory.checkGenerationSources([held[0],held[0]]),error=>error.code==='inventory_duplicate');counts.duplicateRefusals++;
     for(const fake of [{backup:{selection:()=>held[0].backup.selection(),verifySource(){}},source:held[0].source},{backup:held[0].backup,source:{check(){},records:()=>held[0].source.records()}}]){assert.throws(()=>inventory.checkGenerationSources([fake]),error=>error.code==='inventory_source');counts.spoofRefusals++;}
     for(const[index,h]of held.entries()){
      assert.deepEqual(h.exportRecovery(),before[index].source);assert.deepEqual(h.source.records(),before[index].records);await h.recover();assert.deepEqual(check(),initial);assert.deepEqual(h.exportRecovery(),before[index].source);assert.deepEqual(h.source.records(),before[index].records);counts.sourceComparisons+=4;
      if(h.client.observer){assert.equal((fixture.atomic?h.session.core.writerClockV2(h.client.writer):h.session.core.writerClock(h.client.writer)).through,'0');assert.equal(h.session.core.localReviewClock().through,'0');counts.observerZeroPrefixes+=2;}else if(h.readOnly){assert.equal(h.session.core.view().readOnly,true);counts.revokedContributors++;}
     }
     for(const h of held)if(!h.readOnly){const current=h.session.core,checkpoint=current.checkpointJson(),review=current.reviewCheckpoint(),reference=new api.SharedRichEditor(profile.restore_segmented(inventory.metadata().native.room.document,checkpoint),{segmentedHistory:'segmented-v1'});try{reference.enableReview(h.options.review,review);for(const method of ['redo','undo']){assert.equal(current[method](),reference[method]());assert.equal(current.checkpointJson(),reference.checkpointJson());counts.futureDocumentCheckpoints++;current[method+'Review']();reference[method+'Review']();assert.equal(current.reviewCheckpoint(),reference.reviewCheckpoint());counts.futureReviewCheckpoints++;}assert.throws(()=>check(),error=>error.code==='inventory_source');}finally{reference.dispose();}}
     counts.sourceFamilies++;
    }finally{for(const h of held.reverse())await h.close();}
   }
   await probePhysicalMixedSources({api,rich,profile,fixture,inventory,after,counts,tag:`physical-mixed-${counts.nativeRooms}`});
   counts.nativeRooms++;
  }finally{inventory.dispose();after.dispose();profile.free();}
 }}finally{restore();}
 for(const[key,value]of Object.entries({nativeRooms:10,longNativeCuts:1,physicalOnlyCuts:10,originalParticipants:20,generationParticipants:60,sourceFamilies:30,coldParticipants:60,restoredParticipants:80,coveredStreams:120,localUnboundReviews:20,pureChecks:30,sourceComparisons:240,duplicateRefusals:30,mixedCohorts:60,mixedDuplicateRefusals:120,mixedRetainedComparisons:120,crossFamilyWriterOwnershipRefusals:60,crossFamilyReviewOwnershipRefusals:1,spoofRefusals:60,revokedContributors:3,observerZeroPrefixes:60,futureDocumentCheckpoints:54,futureReviewCheckpoints:54,networkCalls:0}))assert.equal(counts[key],value,key);
 return{format:'breditor/server-generation-inventory-sdk-probe',passed:true,...counts,scope:'Actual separately admitted physical native files and complete source pins, genuine original and local/relay/retained generation client histories in all ten compilers/transports, cold recovery and future exact document/review Undo/Redo. Synthetic IndexedDB/lock/raster fixtures, not browser durability, whole-room provider/client closure or authenticated activation.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error('Expected canonical shared runtime and native physical fixture manifest');console.log(JSON.stringify(await probeServerGenerationInventory(process.argv[2],process.argv[3]),null,2));}
