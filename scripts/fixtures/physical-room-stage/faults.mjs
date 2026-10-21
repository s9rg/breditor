/** Real native clients, deterministic interruption points and actual retained custody. No browser claim. */
import assert from 'node:assert/strict';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
const stageStore='physical_room_stage_state';
const rename=(rows,tag)=>rows.map((row,index)=>({...row,recovery:{...row.recovery,database:tag+'-'+index+'-attempt',destinations:Object.fromEntries(Object.keys(row.recovery.destinations).map(key=>[key,tag+'-'+index+'-'+key]))}}));
async function existing(name){return new Promise((resolve,reject)=>{const request=indexedDB.open(name);let missing=false;request.onupgradeneeded=()=>{missing=true;request.transaction.abort();};request.onerror=()=>missing?resolve(undefined):reject(request.error);request.onsuccess=()=>resolve(request.result);});}
async function storedFile(name,key){const db=await existing(name);assert.ok(db);try{return await new Promise((resolve,reject)=>{const tx=db.transaction('physical_room_files','readonly'),r=tx.objectStore('physical_room_files').get(key);tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
async function replaceFile(name,key,file){const db=await existing(name);assert.ok(db);try{await new Promise((resolve,reject)=>{const tx=db.transaction('physical_room_files','readwrite');tx.objectStore('physical_room_files').put(file,key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function probePhysicalStageFaults({api,wasm,archive,requests,RecoveryLease,counts,tag}){
 const expected=archive.selection(),faults=counts.faults??=Object.fromEntries(['sourceReentryRefusals','stageReentryRefusals','storageContextRefusals','sourceCloseRefusals','initialLostAckResumes','stageLostAckRetries','cleanupRetries','closeDuringRestoreResumes','signalAbortResumes','durableCorruptionRefusals'].map(key=>[key,0]));
 async function run(name,body){const prefix=tag+'-'+name,catalogOpen={wasm,database:prefix+'-catalog',expected,checkAuthority(){}},stageOpen={wasm,database:prefix+'-intent',expected,checkAuthority(){}},policies=rename(requests,prefix);let catalog,stage;
  const state={catalogOpen,stageOpen,policies,get catalog(){return catalog;},set catalog(value){catalog=value;},get stage(){return stage;},set stage(value){stage=value;}};
  try{catalog=await api.SharedPhysicalRoomRecoveryCatalog.begin({...catalogOpen,archive});await body(state);}finally{await stage?.discardAndClose();await catalog?.close();}
 }
 await run('reentry',async s=>{
  let initial=true,reenter;
  s.stage=await api.SharedPhysicalRoomParticipantStage.begin({...s.stageOpen,catalog:s.catalog,checkAuthority(){if(initial){initial=false;assert.throws(()=>s.catalog.verify(),e=>e.code==='catalog_in_use');faults.sourceReentryRefusals++;}reenter?.();}});
  reenter=()=>{reenter=undefined;assert.throws(()=>s.stage.progress(),e=>e.code==='physical_stage_in_use');faults.stageReentryRefusals++;};await s.stage.stage(s.policies);await s.stage.check();
 });
 await run('context',async s=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'indexedDB'),other=new IDBFactory();let once=true;
  try{await assert.rejects(api.SharedPhysicalRoomParticipantStage.begin({...s.stageOpen,catalog:s.catalog,checkAuthority(){if(once){once=false;Object.defineProperty(globalThis,'indexedDB',{...descriptor,value:other});}}}),e=>e.code==='physical_stage_closed');assert.deepEqual(await other.databases(),[]);}finally{Object.defineProperty(globalThis,'indexedDB',descriptor);}
  assert.equal(await existing(s.stageOpen.database),undefined);await s.catalog.verify();s.stage=await api.SharedPhysicalRoomParticipantStage.begin({...s.stageOpen,catalog:s.catalog});await s.stage.stage(s.policies);faults.storageContextRefusals++;
 });
 await run('source-close',async s=>{
  let closing,once=true;await assert.rejects(api.SharedPhysicalRoomParticipantStage.begin({...s.stageOpen,catalog:s.catalog,checkAuthority(){if(once){once=false;closing=s.catalog.close();}}}),e=>e.code==='physical_stage_closed');await closing;
  assert.equal(await existing(s.stageOpen.database),undefined);s.catalog=await api.SharedPhysicalRoomRecoveryCatalog.resume(s.catalogOpen);s.stage=await api.SharedPhysicalRoomParticipantStage.begin({...s.stageOpen,catalog:s.catalog});await s.stage.stage(s.policies);faults.sourceCloseRefusals++;
 });
 await run('initial-ack',async s=>{
  const add=IDBObjectStore.prototype.add;let refuse=false,injected=false;
  try{IDBObjectStore.prototype.add=function(...args){const result=add.apply(this,args);if(this.name===stageStore&&!injected){injected=true;this.transaction.addEventListener('complete',()=>{refuse=true;},{once:true});}return result;};await assert.rejects(api.SharedPhysicalRoomParticipantStage.begin({...s.stageOpen,catalog:s.catalog,checkAuthority(){if(refuse){refuse=false;throw Error('PRIVATE-LOST-ACK');}}}),e=>e.code==='physical_stage_authority'&&!String(e).includes('PRIVATE'));}finally{IDBObjectStore.prototype.add=add;}
  assert.equal(injected,true);await s.catalog.verify();s.stage=await api.SharedPhysicalRoomParticipantStage.resume({...s.stageOpen,catalog:s.catalog});assert.equal((await s.stage.progress()).phase,'retained');await s.stage.stage(s.policies);faults.initialLostAckResumes++;
 });
 await run('stage-ack',async s=>{
  let refuse=false,injected=false;s.stage=await api.SharedPhysicalRoomParticipantStage.begin({...s.stageOpen,catalog:s.catalog,checkAuthority(){if(refuse){refuse=false;throw Error('PRIVATE-STAGE-ACK');}}});
  const put=IDBObjectStore.prototype.put;
  try{IDBObjectStore.prototype.put=function(value,...rest){const result=put.call(this,value,...rest);if(this.name===stageStore&&value.phase==='staged'&&!injected){injected=true;this.transaction.addEventListener('complete',()=>{refuse=true;},{once:true});}return result;};await assert.rejects(s.stage.stage(s.policies),e=>e.code==='physical_stage_authority'&&!String(e).includes('PRIVATE'));}finally{IDBObjectStore.prototype.put=put;}
  assert.equal(injected,true);assert.equal((await s.stage.progress()).phase,'staged');await assert.rejects(s.stage.check(),e=>e.code==='physical_stage_restore');await s.stage.stage(s.policies);await s.stage.check();faults.stageLostAckRetries++;
 });
 await run('cleanup',async s=>{
  s.stage=await api.SharedPhysicalRoomParticipantStage.begin({...s.stageOpen,catalog:s.catalog});await s.stage.stage(s.policies);const close=RecoveryLease.prototype.close;let fail=true;
  try{RecoveryLease.prototype.close=function(...args){if(fail){fail=false;throw Error('PRIVATE-RELEASE');}return close.apply(this,args);};await assert.rejects(s.stage.close(),e=>e.code==='physical_stage_storage'&&!String(e).includes('PRIVATE'));}finally{RecoveryLease.prototype.close=close;}
  assert.equal(fail,false);await assert.rejects(api.SharedPhysicalRoomRecoveryCatalog.resume(s.catalogOpen),e=>e.code==='catalog_in_use');await s.stage.close();s.stage=undefined;
  s.catalog=await api.SharedPhysicalRoomRecoveryCatalog.resume(s.catalogOpen);s.stage=await api.SharedPhysicalRoomParticipantStage.resume({...s.stageOpen,catalog:s.catalog});await s.stage.stage(s.policies);await s.stage.check();faults.cleanupRetries++;
 });
 await run('native-close',async s=>{
  s.stage=await api.SharedPhysicalRoomParticipantStage.begin({...s.stageOpen,catalog:s.catalog});let entered,release;const started=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{release=resolve;}),policies=rename(s.policies,tag+'-blocked-native'),selected=policies.find(row=>row.family==='generation'),restore=selected.recovery.session.options.restoreSegmented;
  selected.recovery.session.options.restoreSegmented=async function(...args){entered();await blocked;return Reflect.apply(restore,this,args);};
  const pending=s.stage.stage(policies);await Promise.race([started,pending.then(()=>{throw Error('Native restore did not enter the blocking factory');})]);let finished=false;const closing=s.stage.close().then(()=>{finished=true;});await Promise.resolve();assert.equal(finished,false);release();await assert.rejects(pending,e=>e.code==='physical_stage_closed');await closing;s.stage=undefined;
  selected.recovery.session.options.restoreSegmented=restore;s.catalog=await api.SharedPhysicalRoomRecoveryCatalog.resume(s.catalogOpen);s.stage=await api.SharedPhysicalRoomParticipantStage.resume({...s.stageOpen,catalog:s.catalog});await s.stage.stage(policies);await s.stage.check();faults.closeDuringRestoreResumes++;
 });
 await run('changed-file',async s=>{
  s.stage=await api.SharedPhysicalRoomParticipantStage.begin({...s.stageOpen,catalog:s.catalog});await s.stage.stage(s.policies);const before=await storedFile(s.catalogOpen.database,'current-server'),corrupt=new Uint8Array(await before.arrayBuffer());corrupt[Math.floor(corrupt.length/2)]^=1;await replaceFile(s.catalogOpen.database,'current-server',new Blob([corrupt]));
  await assert.rejects(s.stage.check(),e=>e.code==='physical_stage_diverged');assert.deepEqual(new Uint8Array(await(await storedFile(s.catalogOpen.database,'current-server')).arrayBuffer()),corrupt);faults.durableCorruptionRefusals++;
 });
 await run('signal-abort',async s=>{
  const controller=new AbortController();s.stage=await api.SharedPhysicalRoomParticipantStage.begin({...s.stageOpen,catalog:s.catalog,signal:controller.signal});let entered,release;const started=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{release=resolve;}),selected=s.policies.find(row=>row.family==='generation'),restore=selected.recovery.session.options.restoreSegmented;
  try{
   selected.recovery.session.options.restoreSegmented=async function(...args){entered();await blocked;return Reflect.apply(restore,this,args);};
   const pending=s.stage.stage(s.policies);await Promise.race([started,pending.then(()=>{throw Error('Native abort did not enter the blocking factory');})]);controller.abort();release();await assert.rejects(pending,e=>e.code==='physical_stage_aborted');await assert.rejects(s.stage.progress(),e=>e.code==='physical_stage_aborted');await s.stage.close();s.stage=undefined;
  }finally{selected.recovery.session.options.restoreSegmented=restore;}
  s.catalog=await api.SharedPhysicalRoomRecoveryCatalog.resume(s.catalogOpen);s.stage=await api.SharedPhysicalRoomParticipantStage.resume({...s.stageOpen,catalog:s.catalog});await s.stage.stage(s.policies);await s.stage.check();faults.signalAbortResumes++;
 });
}
