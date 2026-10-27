/** A saved complete root must not repair an incomplete original while merely
 * admitting it. All mutations below are isolated test-store fault injection. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {IDBObjectStore} from 'fake-indexeddb';
import {waitNativePendingWork} from '../packages/breditor-collaboration/dist/native_pending_work.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {selectedProviderSession} from './fixtures/selected-room-provider/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {nativePair,databaseNames} from './fixtures/native-room-retirement/session.mjs';
import {beginCompletedRoomRecovery} from '../packages/breditor-collaboration/dist/cold_room_recovery/attempt.js';
import {RestoredOperationJournal as Journal} from '../packages/breditor-collaboration/dist/restored_operation/journal.js';
import {SharedIndependentHistoryPersistentSession as Session} from '../packages/breditor-collaboration/dist/independent_history/session.js';
import {SharedIndependentDeliverySession as Delivery} from '../packages/breditor-collaboration/dist/independent_delivery/session.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
const Cold=Object.freeze({begin:beginCompletedRoomRecovery});
let fixtures,transport;before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const row of fixtures.manifest.cases){let code;try{await fetch(row.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:row.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(fixtures.directory+'/completed-only-endpoints-closed.json',{rows});assert.ok(rows.every(row=>row.closed));}});
async function changeRecord(format,edit,selected){let found;for(const name of (await databaseNames()).filter(selected)){const db=await new Promise((yes,no)=>{const q=indexedDB.open(name);q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error);});try{for(const table of db.objectStoreNames){const entries=await new Promise((yes,no)=>{const tx=db.transaction(table,'readonly'),store=tx.objectStore(table),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>yes(values.result.map((v,i)=>[keys.result[i],v]));tx.onabort=()=>no(tx.error);});for(const[key,value]of entries)if(value?.format===format){assert.equal(found,undefined,'Exactly one selected parent');found={name,table,key,value};}}}finally{db.close();}}
 assert.ok(found,format);const db=await new Promise((yes,no)=>{const q=indexedDB.open(found.name);q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error);});try{await new Promise((yes,no)=>{const tx=db.transaction(found.table,'readwrite');tx.objectStore(found.table).put(edit(found.value),found.key);tx.oncomplete=()=>yes();tx.onabort=()=>no(tx.error);});}finally{db.close();}return found;
}
const faults=[
 ['root','breditor/shared-physical-room-catalog-operation',r=>({...r,phase:'prepared'})],
 ['original','breditor/shared-participant-operation',r=>({...r,phase:'prepared'})],
 ['generation','breditor/shared-generation-participant-operation',r=>({...r,phase:'prepared'})],
 ['graph','breditor/shared-restored-participant',r=>({...r,source:'started'})],
 ['local','breditor/shared-independent-local-operation-participant',r=>({...r,phase:'prepared'})],
 ['snapshot','breditor/shared-restored-local-operation-participant',r=>({...r,phase:'prepared'})],
 ['flat','breditor/shared-flat-local-participant',r=>({...r,phase:'prepared'})],
];
for(const[kind,format,edit]of faults)test('complete-only cold admission refuses an incomplete '+kind+' without repairing source bytes',async()=>{const tag='completed-only-'+kind,s=await selectedProviderSession(fixtures,tag,{documentSegmented:true,reviewSegmented:true});let owner=s.owner,cold;
 try{const basis=await s.retain();await owner.close();owner=undefined;const injected=await changeRecord(format,edit,name=>kind==='root'?name===s.f.options.database:name.startsWith(tag+'-active-')),bytes=await sourceByteSnapshots(),names=await databaseNames();const{signal,checkAuthority,...chosen}=s.f.options;
  cold=Cold.begin({root:{...chosen,catalogDatabase:tag+'-catalog',checkAuthority(){}},basis,reads:s.input(),intentDatabase:tag+'-inspection-intent'});
  await assert.rejects(cold.open(),e=>['physical_operation_v3_restore','physical_operation_v3_storage','physical_operation_v3_diverged'].includes(e.code),'Inspection must refuse through actual source admission, not a programming error');assert.throws(()=>cold.takeOwner());await assertSourceBytesUnchanged(bytes);assert.deepEqual(await databaseNames(),names);await cold.close();await assertSourceBytesUnchanged(bytes);
  saveEvidence(fixtures.directory+'/'+tag+'.json',{passed:true,injected:{database:injected.name,table:injected.table,format},sourceUnchanged:true,noReplacementCreated:true});
 }finally{try{await owner?.discardAndClose();}finally{try{await cold?.close();}finally{await s.close();}}}
});

for(const family of ['independent-local','independent-delivery','restored-graph','local-operation-snapshot','local-operation-flat'])test('complete-only inspection leaves genuine prepared '+family+' work for explicit recovery',async()=>{
 const tag='completed-pending-'+family,s=await selectedProviderSession(fixtures,tag,{documentSegmented:true,reviewSegmented:true}),add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put;let owner=s.owner,cold,loaded,hits=0;
 try{const basis=await s.retain(),client=owner.clients.find(row=>row.id===family),database=tag+'-active-'+family+'-source';
  const fault=function(fn,args){if(this.transaction.db.name===database){hits++;throw Error('Actual source save interrupted after journal prepare');}return fn.apply(this,args);};IDBObjectStore.prototype.add=function(...args){return fault.call(this,add,args);};IDBObjectStore.prototype.put=function(...args){return fault.call(this,put,args);};
  client.core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Durable prepared work 🙂 '}}]});await waitNativePendingWork(client.core,{check(){},watch(){return()=>{};}});assert.ok(hits>0);const prepared=nativePair(client.core),document=client.core.documentJson();
  const retained=await s.retain();loaded=await Loaded.read(retained,{wasm:fixtures.native,checkAuthority(){}});const source=(await loaded.records(family)).source,snapshot=source.snapshot;assert.notEqual(snapshot.record.current,null);assert.notEqual(snapshot.record.pending,null);assert.equal(snapshot.observed,snapshot.record.current);loaded.dispose();loaded=undefined;
  IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;await owner.discardAndClose();owner=undefined;const bytes=await sourceByteSnapshots(),names=await databaseNames(),{signal,checkAuthority,...chosen}=s.f.options;
  cold=Cold.begin({root:{...chosen,catalogDatabase:tag+'-catalog',checkAuthority(){}},basis,reads:s.input(),intentDatabase:tag+'-intent-current'});await assert.rejects(cold.open(),e=>['physical_operation_v3_restore','physical_operation_v3_storage','physical_operation_v3_diverged'].includes(e.code));assert.throws(()=>cold.takeOwner());await assertSourceBytesUnchanged(bytes);assert.deepEqual(await databaseNames(),names);await cold.close();await assertSourceBytesUnchanged(bytes);
  // The deliberately repair-capable ordinary route is unchanged. It must
  // acknowledge the genuine pending cut, not drop it or reset to the baseline.
  await s.cold(basis);owner=s.owner;const current=owner.clients.find(row=>row.id===family);assert.equal(current.core.documentJson(),document);assert.deepEqual(nativePair(current.core),prepared);assert.equal(current.core.undo(),true);assert.equal(current.core.redo(),true);assert.equal(current.core.documentJson(),document);
  saveEvidence(fixtures.directory+'/'+tag+'.json',{passed:true,actualFailedSourceRequests:hits,preparedCutNotFabricated:true,inspectionPreservedAllBytes:true,explicitRecoveryPreservedPreparedNativeWork:true,nativeUndoRedo:true});
 }finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;loaded?.dispose();try{await owner?.discardAndClose();}finally{try{await cold?.close();}finally{await s.close();}}}
});

test('healthy complete-only open preview and Close issue no source mutations',async()=>{const tag='completed-no-writes',s=await selectedProviderSession(fixtures,tag,{documentSegmented:true,reviewSegmented:false}),methods=new Map(['add','put','delete','clear'].map(name=>[name,IDBObjectStore.prototype[name]]));let owner=s.owner,cold,attempted=[];
 try{const basis=await s.retain();await owner.close();owner=undefined;const bytes=await sourceByteSnapshots(),names=await databaseNames(),{signal,checkAuthority,...chosen}=s.f.options;
  for(const name of methods.keys())IDBObjectStore.prototype[name]=function(){attempted.push({method:name,database:this.transaction.db.name,store:this.name});throw Error('Inspection must not issue a source mutation');};
  cold=Cold.begin({root:{...chosen,catalogDatabase:tag+'-catalog',checkAuthority(){}},basis,reads:s.input(),intentDatabase:tag+'-intent-current'});await cold.open();await cold.preview();await cold.close();assert.deepEqual(attempted,[]);
  for(const[name,method]of methods)IDBObjectStore.prototype[name]=method;await assertSourceBytesUnchanged(bytes);assert.deepEqual(await databaseNames(),names);saveEvidence(fixtures.directory+'/'+tag+'.json',{passed:true,sourceKinds:7,mutatorRequests:attempted,allStoredBytesUnchanged:true});
 }finally{for(const[name,method]of methods)IDBObjectStore.prototype[name]=method;try{await owner?.discardAndClose();}finally{try{await cold?.close();}finally{await s.close();}}}
});

test('failed unreturned graph admission and one native cleanup refusal remain reachable for Close retry',async()=>{
 const tag='completed-cleanup-retry',s=await selectedProviderSession(fixtures,tag,{documentSegmented:true,reviewSegmented:true}),binding=Journal.prototype.bindingType,discard=Session.prototype.discardAndClose,discardDelivery=Delivery.prototype.discardAndClose,closeJournal=Journal.prototype.close;let cold,source,journal,armed=false,hits=0;
 try{const basis=await s.retain();await s.owner.close();const bytes=await sourceByteSnapshots(),{signal,checkAuthority,...chosen}=s.f.options;
  Journal.prototype.bindingType=function(){const value=binding.call(this);return{...value,consume:owner=>{source=owner;journal=this;armed=true;throw Error('Actual source constructed before admission refusal');}};};
  Session.prototype.discardAndClose=function(){if(armed&&hits===0){hits++;return Promise.reject(Error('One actual native cleanup refusal'));}return discard.call(this);};
  cold=Cold.begin({root:{...chosen,catalogDatabase:tag+'-catalog',checkAuthority(){}},basis,reads:s.input(),intentDatabase:tag+'-inspection-intent'});await assert.rejects(cold.open());assert.ok(source);assert.ok(journal);Journal.prototype.bindingType=binding;
  await assert.rejects(cold.close());assert.equal(hits,1);Session.prototype.discardAndClose=discard;
  // No probe-owned cleanup is allowed to make this assertion pass. The same
  // genuine attempt must find and close its exact still-owned source itself.
  await cold.close();await assertSourceBytesUnchanged(bytes);saveEvidence(fixtures.directory+'/'+tag+'.json',{passed:true,actualNativeOwnerConstructed:true,actualCleanupFailures:hits,secondCloseCompletedWithoutProbeHelp:true,allSourceBytesPreserved:true});
 }finally{Journal.prototype.bindingType=binding;Session.prototype.discardAndClose=discard;try{if(source)await discardDelivery.call(source);if(journal)await closeJournal.call(journal);await cold?.close();}finally{await s.close();}}
});
