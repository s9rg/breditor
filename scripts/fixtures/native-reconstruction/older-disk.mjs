/** Real failed native persistence and a genuine cold reopen. Only this
 * test-owned database is faulted; production records are never hand-written. */
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
import {selectedProviderSession,selectStart} from '../selected-room-provider/session.mjs';
import {LoadedNativeReconstructionCurrent} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {SelectedRoomCurrentArchive} from '../../../packages/breditor-collaboration/dist/selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive} from '../../../packages/breditor-collaboration/dist/physical_room_record_cut/archive.js';
import {waitNativePendingWork} from '../../../packages/breditor-collaboration/dist/native_pending_work.js';
export async function originalOlderDisk(fixtures,tag){
 const s=await selectedProviderSession(fixtures,tag,{documentSegmented:false,reviewSegmented:false}),integrity={wasm:fixtures.native,checkAuthority(){}},put=IDBObjectStore.prototype.put,add=IDBObjectStore.prototype.add;let outer,cut,loaded;
 try{
  const basis=await s.retain();outer=await SelectedRoomCurrentArchive.read(basis.file,basis.selection,integrity);const nested=outer.current();cut=await PhysicalRoomRecordCutArchive.read(nested.file,nested.selection,integrity);
  const database=cut.root().participants.find(row=>row.id==='original').namespaces.find(row=>row.role==='document').database,client=s.owner.clients.find(row=>row.id==='original'),before={document:client.core.documentJson(),checkpoint:client.core.checkpointJson(),review:client.core.reviewCheckpoint()};cut.dispose();cut=undefined;outer.dispose();outer=undefined;let failures=0;
  const fault=function(original,args){if(this.transaction.db.name===database){failures++;throw Error('Test-owned failed source save');}return original.apply(this,args);};
  IDBObjectStore.prototype.put=function(...args){return fault.call(this,put,args);};IDBObjectStore.prototype.add=function(...args){return fault.call(this,add,args);};
  selectStart(client.core);client.core.type('Only retained LIVE 🙂 ');client.core.dispatchReview({kind:'create_thread',data:{anchorJson:client.core.captureReviewAnchor({kind:'document'}),body:'Only retained review'}});client.core.undoReview();
  await waitNativePendingWork(client.core,{check(){},watch(){return()=>{};}});assert.ok(failures>0);
  const live={document:client.core.documentJson(),checkpoint:client.core.checkpointJson(),review:client.core.reviewCheckpoint()},retained=await s.retain();
  IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;await s.owner.discardAndClose();await s.cold(basis);
  const reopened=s.owner.clients.find(row=>row.id==='original');assert.equal(reopened.core.documentJson(),before.document);assert.notEqual(reopened.core.checkpointJson(),live.checkpoint);assert.notEqual(reopened.core.reviewCheckpoint(),live.review);
  loaded=await LoadedNativeReconstructionCurrent.read(retained,integrity);
  return{s,basis,retained,loaded,live,before,database,failures,options:s.f.f.rows.find(row=>row.id==='original').owner.recovery,read:s.f.reads.find(row=>row.id==='original').read,descriptor:JSON.stringify((await import('../../../packages/breditor-collaboration/dist/source_native_read.js')).sourceNativeRecoveryRead(reopened.core).descriptor()),async close(){loaded.dispose();await s.close();}};
 }catch(error){loaded?.dispose();await s.close();throw error;}finally{IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.add=add;cut?.dispose();outer?.dispose();}
}
export async function sourceSnapshot(database){
 assert.ok((await indexedDB.databases()).some(row=>row.name===database));
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(database);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 try{const result={version:db.version,stores:{}};for(const name of db.objectStoreNames)result.stores[name]=await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),store=tx.objectStore(name),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>resolve({keys:keys.result,values:values.result});tx.onabort=()=>reject(tx.error);});return result;}finally{db.close();}
}
