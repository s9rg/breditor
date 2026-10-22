/** Actual two-participant generation cohorts: asynchronous verification/release,
 * then one synchronous all-or-nothing final admission. No public room activation. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {generationParticipant} from './fixtures/room-participant-inventory/generation-participant.mjs';

async function stored(value){if(value instanceof Blob)return{type:value.type,bytes:[...new Uint8Array(await value.arrayBuffer())]};if(value instanceof ArrayBuffer)return{bytes:[...new Uint8Array(value)]};if(ArrayBuffer.isView(value))return{bytes:[...new Uint8Array(value.buffer,value.byteOffset,value.byteLength)]};if(Array.isArray(value))return Promise.all(value.map(stored));if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([key,v])=>[key,await stored(v)])));return value;}
async function databaseSnapshot(name){
 assert.ok((await indexedDB.databases()).some(row=>row.name===name),'Never create a missing database for inspection');
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{const result={version:db.version,stores:{}};for(const name of [...db.objectStoreNames])result.stores[name]=await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),s=tx.objectStore(name),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>resolve({keys:keys.result,values:values.result});tx.onabort=()=>reject(tx.error);});return await stored(result);}finally{db.close();}
}
/** Actual version-change retirement, then abort the upgrader so exact V1 bytes
 * remain available for the required cold resume. Held custody forbids plain close. */
async function retireUploadHandle(name){await new Promise((resolve,reject)=>{const r=indexedDB.open(name,2);r.onupgradeneeded=()=>r.transaction.abort();r.onsuccess=()=>{r.result.close();reject(Error('The fixture upgrader must abort'));};r.onerror=()=>r.error?.name==='AbortError'?resolve():reject(r.error);r.onblocked=()=>reject(Error('The actual upload handle must retire on versionchange'));});}
export async function probeGenerationRoomCustody(directory,manifestPath,modules){
 const api=modules?.collaboration??await import('../packages/breditor-collaboration/dist/index.js'),rich=modules?.rich??await import('../packages/breditor-experimental-rich-content/index.js'),{prepareGenerationRoomParticipants}=await import(new URL('./generation_room_operation/custody.js',import.meta.resolve('@breditor/collaboration')).href),{RecoveryLease}=await import(new URL('./participant_recovery/lease.js',import.meta.resolve('@breditor/collaboration')).href);
 const wasm=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);await wasm.default({module_or_path:readFileSync(resolve(directory,'breditor_shared_bg.wasm'))});const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.cases.length,10);
 const counts={nativeRooms:0,sourceFamilies:0,cohorts:0,participants:0,coldParticipants:0,successfulCohorts:0,releaseRetries:0,uploadCloseRefusals:0,lastGuardRetirementRefusals:0,lastGuardAuthorityRefusals:0,changedCutRefusals:0,abandonedCohorts:0,earlyRetirementRefusals:0,duplicateOwnerRefusals:0,duplicateIdRefusals:0,busyOwnerRefusals:0,retainedFileComparisons:0,storedRecordComparisons:0,coldHistoryComparisons:0,futureDocumentCheckpoints:0,futureReviewCheckpoints:0,networkCalls:0};
 const faults=['success','release-failure','late-upload-close','last-guard-core-retire','last-guard-authority','changed-cut','abandon','early-core-retire'],restoreEnvironment=environment();
 try{for(const [roomIndex,item]of manifest.cases.entries()){
  const fixture=JSON.parse(readFileSync(item.path,'utf8')),factory=fixture.language===1?'from_configuration_json':fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`,profile=wasm.SharedRichProfile[factory](fixture.configuration);
  try{for(const kind of ['local','relay','retained']){for(const fault of faults){const held=[];let capsule,escaped,allowed=true,guardCalls=0,released=false;const checkAuthority=()=>{if(!allowed)throw Error('PRIVATE-REVOKED-AUTHORITY');};
   try{
    for(const [index,client]of fixture.clients.entries()){const h=await generationParticipant({api,rich,profile,fixture,client,kind,tag:`gen-room-${roomIndex}-${kind}-${fault}-${index}`,counts});held.push(h);await h.holdOperation(checkAuthority);counts.participants++;}
    const values=held.map((h,index)=>({id:'participant-'+index,operation:h.operation})),files=await Promise.all(held.map(async h=>new Uint8Array(await h.operation.file().arrayBuffer()))),names=held.flatMap(h=>[h.operationResume.database,h.recoveryRequest.database,...Object.values(h.recoveryRequest.destinations)]);
    const snapshot=async()=>new Map(await Promise.all(names.map(async name=>[name,await databaseSnapshot(name)])));
    const checkStored=async before=>{for(const name of names){assert.deepEqual(await databaseSnapshot(name),before.get(name));counts.storedRecordComparisons++;}};
    const prepare=()=>prepareGenerationRoomParticipants(values,[],[],async()=>{},()=>{guardCalls++;if(guardCalls===2&&fault==='last-guard-core-retire')held[0].session.core.retire();if(guardCalls===2&&fault==='last-guard-authority')allowed=false;},()=>{released=true;});
    if(fault==='success'){
     await assert.rejects(prepareGenerationRoomParticipants([values[0],{id:'different-id',operation:values[0].operation}],[],[],async()=>{},()=>{},()=>{}),e=>e.code==='generation_operation_policy');counts.duplicateOwnerRefusals++;
     await assert.rejects(prepareGenerationRoomParticipants([values[0],{...values[1],id:values[0].id}],[],[],async()=>{},()=>{},()=>{}),e=>e.code==='generation_operation_policy');counts.duplicateIdRefusals++;
    }
    if(fault==='release-failure'){
     const before=await snapshot(),close=RecoveryLease.prototype.close;let fired=false;try{RecoveryLease.prototype.close=async function(...args){if(!fired){fired=true;throw Error('PRIVATE-RELEASE-FAILURE');}return close.apply(this,args);};await assert.rejects(prepare(),e=>e.code==='generation_operation_storage');}finally{RecoveryLease.prototype.close=close;}assert.equal(fired,true);assert.equal(released,false);await checkStored(before);for(const h of held)await h.operation.check();counts.releaseRetries++;
    }
    if(fault==='early-core-retire'){
     const before=await snapshot();held[0].session.core.retire();await assert.rejects(prepare(),e=>e.code==='retired');assert.equal(released,false);await checkStored(before);counts.earlyRetirementRefusals++;
    }else{
     capsule=await prepare();assert.equal(released,true);for(const h of held){await assert.rejects(h.operation.check(),e=>e.code==='generation_operation_busy'||e.code==='generation_operation_closed');counts.busyOwnerRefusals++;}
     if(fault==='late-upload-close')await retireUploadHandle(held[1].recoveryRequest.destinations.uploads);
     if(fault==='changed-cut'){const current=held[0].session.core,peer=new api.SharedRichEditor(profile.join_frame(held[0].options.room,'910',current.updateFrame()));try{peer.select({kind:'text',anchor:{block:'p',offset:'0',affinity:'after'},focus:{block:'p',offset:'0',affinity:'after'}});peer.type('Peer edit during prepared room handoff ');await current.receiveFrame(peer.updateFrame());await held[0].session.flush();}finally{peer.dispose();}}
     const before=await snapshot();
     if(fault==='success'||fault==='release-failure'){
      escaped=capsule.commit();assert.equal(guardCalls,2);assert.equal(escaped.participants.length,2);for(const [index,value]of escaped.participants.entries())held[index].takeParts(value.parts);await checkStored(before);counts.successfulCohorts++;
     }else if(fault==='abandon'){capsule.abandon();assert.throws(()=>capsule.commit(),e=>e.code==='generation_operation_closed');await checkStored(before);counts.abandonedCohorts++;}
     else{assert.throws(()=>{escaped=capsule.commit();},e=>fault==='late-upload-close'?/Asset store is closed/.test(String(e)):fault==='last-guard-core-retire'?e.code==='retired':fault==='last-guard-authority'?e.code==='participant_authority'&&!String(e).includes('PRIVATE'):e.code==='generation_source_changed');assert.equal(escaped,undefined);await checkStored(before);counts[{'late-upload-close':'uploadCloseRefusals','last-guard-core-retire':'lastGuardRetirementRefusals','last-guard-authority':'lastGuardAuthorityRefusals','changed-cut':'changedCutRefusals'}[fault]]++;}
    }
    const expected=[];allowed=true;
    for(const [index,h]of held.entries()){
     if(!escaped){assert.deepEqual(new Uint8Array(await h.operation.file().arrayBuffer()),files[index]);counts.retainedFileComparisons++;if(fault!=='early-core-retire')await assert.rejects(h.operation.intoParts(),e=>e.code==='generation_operation_closed');}
     expected.push(h.exportRecovery());
    }
    for(const [index,h]of held.entries()){
     await h.coldOperation();h.takeParts(await h.operation.intoParts());assert.deepEqual(h.exportRecovery(),expected[index]);counts.coldParticipants++;counts.coldHistoryComparisons++;
     if(!h.readOnly){const core=h.session.core,reference=new api.SharedRichEditor(profile.restore_segmented(h.options.room,core.checkpointJson()),{segmentedHistory:'segmented-v1'});try{reference.enableReview(h.options.review,core.reviewCheckpoint());for(const method of ['redo','undo']){assert.equal(core[method](),reference[method]());assert.equal(core.checkpointJson(),reference.checkpointJson());counts.futureDocumentCheckpoints++;core[method+'Review']();reference[method+'Review']();assert.equal(core.reviewCheckpoint(),reference.reviewCheckpoint());counts.futureReviewCheckpoints++;}}finally{reference.dispose();}}
     else{assert.equal(h.session.core.view().readOnly,true);if(h.client.observer)assert.equal((fixture.atomic?h.session.core.writerClockV2(h.client.writer):h.session.core.writerClock(h.client.writer)).through,'0');}
    }
    counts.cohorts++;
   }catch(error){console.error('Generation cohort case',roomIndex,kind,fault);throw error;}finally{capsule?.abandon();for(const h of held.reverse())await h.close();}
  }counts.sourceFamilies++;}counts.nativeRooms++;}finally{profile.free();}
 }}finally{restoreEnvironment();}
 assert.equal(counts.nativeRooms,10);assert.equal(counts.sourceFamilies,30);assert.equal(counts.cohorts,240);assert.equal(counts.participants,480);assert.equal(counts.coldParticipants,480);assert.equal(counts.successfulCohorts,60);for(const key of ['releaseRetries','uploadCloseRefusals','lastGuardRetirementRefusals','lastGuardAuthorityRefusals','changedCutRefusals','abandonedCohorts','earlyRetirementRefusals','duplicateOwnerRefusals','duplicateIdRefusals'])assert.equal(counts[key],30,key);assert.equal(counts.networkCalls,0);
 return{format:'breditor/generation-room-custody-probe',passed:true,...counts,scope:'Internal genuine two-child custody prerequisite, all ten native profile/transport fixtures and local/relay/retained generation families. No child escapes a late refusal; releases retry, committed originals/records remain exact, and cold native history survives future Undo/Redo. This is not durable room catalog integration, current authenticated activation, provider closure or browser durability.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error('Expected canonical runtime and native inventory fixture manifest');console.log(JSON.stringify(await probeGenerationRoomCustody(process.argv[2],process.argv[3]),null,2));}
