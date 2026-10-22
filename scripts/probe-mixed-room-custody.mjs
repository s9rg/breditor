/** Original + generation owners share one barrier. All real native cut/history,
 * review packet and whole-upload stores survive release, refusal and cold reopen. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {generationParticipant} from './fixtures/room-participant-inventory/generation-participant.mjs';
import {originalOperation} from './fixtures/operation-cohort/original-participant.mjs';
import {databaseSnapshot} from './fixtures/operation-cohort/snapshot.mjs';

/** Retire the actual upload connection while preserving the V1 schema for cold
 * resume. Plain close cannot cross the new held upload-custody barrier. */
async function retireUploadHandle(name){await new Promise((resolve,reject)=>{const r=indexedDB.open(name,2);r.onupgradeneeded=()=>r.transaction.abort();r.onsuccess=()=>{r.result.close();reject(Error('The fixture upgrader must abort'));};r.onerror=()=>r.error?.name==='AbortError'?resolve():reject(r.error);r.onblocked=()=>reject(Error('The actual upload owner must retire'));});}

export async function probeMixedRoomCustody(directory,manifestPath){
 const api=await import('../packages/breditor-collaboration/dist/index.js'),rich=await import('../packages/breditor-experimental-rich-content/index.js'),base=import.meta.resolve('@breditor/collaboration'),{prepareMixedRoomParticipants}=await import(new URL('./mixed_room_operation/custody.js',base).href),{RecoveryLease}=await import(new URL('./participant_recovery/lease.js',base).href);
 const wasm=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);await wasm.default({module_or_path:readFileSync(resolve(directory,'breditor_shared_bg.wasm'))});const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.cases.length,10);
 const faults=['success','release-failure','original-upload','generation-upload','original-retire','generation-retire','authority','original-cut','generation-cut','abandon','early-original-retire','early-generation-retire','destructor-original-retire','destructor-generation-retire','destructor-authority','destructor-throw'];
 const counts={nativeRooms:0,sourceFamilies:0,cohorts:0,participants:0,coldParticipants:0,successfulCohorts:0,releaseRetries:0,lateRefusals:0,earlyRefusals:0,abandonedCohorts:0,destructorRefusals:0,busyOwnerRefusals:0,synchronousReservationRefusals:0,invalidSelectionRefusals:0,originalFileComparisons:0,generationFileComparisons:0,storedRecordComparisons:0,historyComparisons:0,uploadComparisons:0,futureDocumentCheckpoints:0,futureReviewCheckpoints:0,networkCalls:0,restoredParticipants:0,restoredComponents:0};
 for(const [roomIndex,item]of manifest.cases.entries()){
  const fixture=JSON.parse(readFileSync(item.path,'utf8')),factory=fixture.language===1?'from_configuration_json':fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`,profile=wasm.SharedRichProfile[factory](fixture.configuration);
  try{for(const kind of ['local','relay','retained']){for(const [faultIndex,fault]of faults.entries()){const restoreEnvironment=environment();let original,generation,cap,escaped,allowed=true,guardCalls=0,released=false,armed=false,fired=false,reservationProbe,reservationObserved=false;const checkAuthority=()=>{if(!allowed)throw Error('PRIVATE-REVOKED');if(reservationProbe){const run=reservationProbe;reservationProbe=undefined;run();}};
   const restoreOriginal=profile.restore,restoreGeneration=profile.restore_segmented;
   const onFree=()=>{if(!armed||fired)return;fired=true;if(fault==='destructor-original-retire')original.parts.session.core.retire();if(fault==='destructor-generation-retire')generation.session.core.retire();if(fault==='destructor-authority')allowed=false;if(fault==='destructor-throw')throw Error('Native reader free failure');};
   for(const [method,restore]of [['restore',restoreOriginal],['restore_segmented',restoreGeneration]])profile[method]=function(...args){const raw=restore.apply(this,args),free=raw.free;raw.free=function(...args){free.apply(this,args);onFree();};return raw;};
   try{
    const originalIndex=(roomIndex+faultIndex)%2;
    original=await originalOperation({api,rich,profile,fixture,client:fixture.clients[originalIndex],tag:`mixed-${roomIndex}-${kind}-${fault}-original`,counts},checkAuthority);
    generation=await generationParticipant({api,rich,profile,fixture,client:fixture.clients[1-originalIndex],kind,tag:`mixed-${roomIndex}-${kind}-${fault}-generation`,counts});await generation.holdOperation(checkAuthority);counts.participants+=2;
    const o={id:'original',family:'original',operation:original.operation},g={id:'generation',family:'generation',operation:generation.operation},values=roomIndex%2?[g,o]:[o,g],names=[...new Set([original,generation].flatMap(h=>[h.operationResume.database,h.operationResume.recoveryDatabase,...Object.values(h.operationResume.destinations)]))];
    const files={original:new Uint8Array(await original.backup.file().arrayBuffer()),generation:new Uint8Array(await generation.operation.file().arrayBuffer())},snapshot=async()=>new Map(await Promise.all(names.map(async name=>[name,await databaseSnapshot(name)]))),checkStored=async before=>{for(const name of names){assert.deepEqual(await databaseSnapshot(name),before.get(name));counts.storedRecordComparisons++;}};
    const prepare=()=>prepareMixedRoomParticipants(values,[],[],async()=>{},()=>{guardCalls++;if(guardCalls===2){if(fault==='original-retire')original.parts.session.core.retire();if(fault==='generation-retire')generation.session.core.retire();if(fault==='authority')allowed=false;}},()=>{released=true;});
    if(fault==='success'){
     for(const invalid of [[o,{...o,id:'duplicate-owner'}],[o,{...g,id:o.id}],[o,{...g,family:'unknown'}],[o,{...g,operation:{}}],[{...o,operation:g.operation},g]]){await assert.rejects(prepareMixedRoomParticipants(invalid,[],[],async()=>{},()=>{},()=>{}),e=>['room_operation_policy','operation_policy','generation_operation_policy'].includes(e.code));counts.invalidSelectionRefusals++;await original.operation.check();await generation.operation.check();}
     // The second family is already busy when the first original guard runs.
     let observation;reservationProbe=()=>{observation=generation.operation.check().then(()=>{throw Error('The second family was not reserved before the first host guard');},error=>{assert.equal(error.code,'generation_operation_busy');reservationObserved=true;});};
     const held=await prepareMixedRoomParticipants(values,[],[],async()=>{},()=>{},()=>{});await observation;assert.equal(reservationObserved,true);held.abandon();counts.synchronousReservationRefusals++;
     // Abandoning a released capsule is cleanup-only, so cold-reopen before retry.
     await original.coldOperation();await generation.coldOperation();o.operation=original.operation;g.operation=generation.operation;
    }
    if(fault==='release-failure'){
     const before=await snapshot(),close=RecoveryLease.prototype.close;let failed=false;try{RecoveryLease.prototype.close=async function(...args){if(!failed){failed=true;throw Error('PRIVATE-RELEASE');}return close.apply(this,args);};await assert.rejects(prepare(),e=>e.code==='room_operation_storage');}finally{RecoveryLease.prototype.close=close;}assert.ok(failed);assert.equal(released,false);await checkStored(before);await original.operation.check();await generation.operation.check();counts.releaseRetries++;
    }
    if(fault.startsWith('early-')){
     const before=await snapshot();(fault==='early-original-retire'?original.parts.session:generation.session).core.retire();await assert.rejects(prepare(),e=>e.code==='retired');assert.equal(released,false);await checkStored(before);counts.earlyRefusals++;
    }else{
     cap=await prepare();assert.equal(released,true);for(const h of [original,generation]){await assert.rejects(h.operation.check(),e=>['operation_in_use','operation_closed','generation_operation_busy','generation_operation_closed'].includes(e.code));counts.busyOwnerRefusals++;}
     if(fault==='original-upload')await retireUploadHandle(original.operationResume.destinations.uploads);if(fault==='generation-upload')await retireUploadHandle(generation.operationResume.destinations.uploads);
     if(fault.endsWith('-cut')){const current=(fault==='original-cut'?original.parts.session:generation.session).core,peer=new api.SharedRichEditor(profile.join_frame(JSON.parse(fixture.inventoryJson).room.document,'910',current.updateFrame()));try{peer.select({kind:'text',anchor:{block:'p',offset:'0',affinity:'after'},focus:{block:'p',offset:'0',affinity:'after'}});peer.type('Concurrent mixed cut ');await current.receiveFrame(peer.updateFrame());await(fault==='original-cut'?original.parts.session:generation.session).flush();}finally{peer.dispose();}}
     const before=await snapshot();armed=fault.startsWith('destructor-');
     if(fault==='success'||fault==='release-failure'){escaped=cap.commit();assert.equal(guardCalls,2);assert.deepEqual(escaped.participants.map(v=>[v.id,v.family]),values.map(v=>[v.id,v.family]));for(const value of escaped.participants)(value.family==='original'?original:generation).takeParts(value.parts);counts.successfulCohorts++;}
     else if(fault==='abandon'){cap.abandon();assert.throws(()=>cap.commit(),e=>e.code==='room_operation_closed');counts.abandonedCohorts++;}
     else{let error;try{escaped=cap.commit();}catch(e){error=e;}finally{armed=false;}assert.equal(escaped,undefined);assert.ok(error);if(fault.includes('retire'))assert.equal(error.code,'retired');else if(fault.includes('authority'))assert.equal(error.code,'participant_authority');else if(fault.includes('upload'))assert.match(String(error),/Asset store is closed/);else if(fault==='generation-cut')assert.equal(error.code,'generation_source_changed');else if(fault==='original-cut')assert.equal(error.code,'stale_observation');else assert.match(String(error),/Native reader free failure/);if(fault.startsWith('destructor-')){assert.ok(fired);counts.destructorRefusals++;}else counts.lateRefusals++;}
     armed=false;await checkStored(before);
    }
    allowed=true;assert.deepEqual(new Uint8Array(await original.backup.file().arrayBuffer()),files.original);counts.originalFileComparisons++;
    if(!escaped){assert.deepEqual(new Uint8Array(await generation.operation.file().arrayBuffer()),files.generation);counts.generationFileComparisons++;assert.equal(original.operation.origin().identity.participant,original.backup.selection().identity.participant);}
    for(const h of [original,generation]){const session=h===original?h.parts.session:h.session,uploads=h===original?h.parts.uploads:h.uploads,expected=h.exportRecovery(),bytes=await databaseSnapshot(h.operationResume.destinations.uploads);await h.coldOperation();h.takeParts(await h.operation.intoParts());assert.deepEqual(h.exportRecovery(),expected);counts.historyComparisons++;assert.deepEqual(await databaseSnapshot(h.operationResume.destinations.uploads),bytes);counts.uploadComparisons++;counts.coldParticipants++;
     const core=(h===original?h.parts.session:h.session).core;
     if(!h.readOnly){const reference=new api.SharedRichEditor(h===original?profile.restore(h.options.room,core.checkpointJson()):profile.restore_segmented(h.options.room,core.checkpointJson()),h===original?{}:{segmentedHistory:'segmented-v1'});try{reference.enableReview(h.options.review,core.reviewCheckpoint());for(const method of ['redo','undo']){assert.equal(core[method](),reference[method]());assert.equal(core.checkpointJson(),reference.checkpointJson());counts.futureDocumentCheckpoints++;core[method+'Review']();reference[method+'Review']();assert.equal(core.reviewCheckpoint(),reference.reviewCheckpoint());counts.futureReviewCheckpoints++;}}finally{reference.dispose();}}
     else assert.equal(core.view().readOnly,true);
    }
    counts.cohorts++;
   }catch(error){console.error('Mixed room cohort',roomIndex,kind,fault);throw error;}finally{armed=false;allowed=true;cap?.abandon();try{await generation?.close();}finally{try{await original?.close();}finally{profile.restore=restoreOriginal;profile.restore_segmented=restoreGeneration;restoreEnvironment();}}}
  }counts.sourceFamilies++;}counts.nativeRooms++;}finally{profile.free();}
 }
 assert.equal(counts.nativeRooms,10);assert.equal(counts.sourceFamilies,30);assert.equal(counts.cohorts,480);assert.equal(counts.participants,960);assert.equal(counts.coldParticipants,960);assert.equal(counts.successfulCohorts,60);assert.equal(counts.releaseRetries,30);assert.equal(counts.earlyRefusals,60);assert.equal(counts.destructorRefusals,120);assert.equal(counts.abandonedCohorts,30);assert.equal(counts.lateRefusals,210);assert.equal(counts.synchronousReservationRefusals,30);assert.equal(counts.invalidSelectionRefusals,150);assert.equal(counts.networkCalls,0);
 return{format:'breditor/mixed-room-custody-probe',passed:true,...counts,scope:'Internal common original/generation barrier across all ten native profiles/transports and local/relay/retained families. Actual files, records, offline native Undo/Redo, review histories and upload bytes survive cold reopen after success/refusal. Not durable V2 room operation integration, credential/provider activation or browser durability.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error('Expected native runtime and original inventory fixture manifest');console.log(JSON.stringify(await probeMixedRoomCustody(process.argv[2],process.argv[3]),null,2));}
