/** Real private owners plus a one-shot coordination-release fault. Never browser crash evidence. */
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';

async function stored(value){if(value instanceof Blob)return{type:value.type,bytes:[...new Uint8Array(await value.arrayBuffer())]};if(value instanceof ArrayBuffer)return{bytes:[...new Uint8Array(value)]};if(ArrayBuffer.isView(value))return{bytes:[...new Uint8Array(value.buffer,value.byteOffset,value.byteLength)]};if(Array.isArray(value))return Promise.all(value.map(stored));if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([key,v])=>[key,await stored(v)])));return value;}
async function snapshot(name){
 assert.ok((await indexedDB.databases()).some(row=>row.name===name));const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 try{const result={version:db.version,stores:{}};for(const store of [...db.objectStoreNames])result.stores[store]=await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),s=tx.objectStore(store),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>resolve({keys:keys.result,values:values.result});tx.onabort=()=>reject(tx.error);});return await stored(result);}finally{db.close();}
}
const remap=(row,prefix)=>({...row,recovery:{...row.recovery,database:prefix+'-attempt',destinations:Object.fromEntries(Object.keys(row.recovery.destinations).map(key=>[key,prefix+'-'+key]))}});

/** Run every family before reporting any failures, so the preserved before-fix archive proves all paths. */
export async function catalogCleanupFailures({api,RecoveryLease,archive,originalInput,requests,mixedRequests,tag,counts}){
 const originalArchive=await api.SharedRoomRecoveryCatalogArchive.capture(originalInput),failures=[];
 try{for(const family of ['generation','mixed-original','original']){
  const old=family==='original',chosenArchive=old?originalArchive:archive,prefix=tag+'-cleanup-'+family,input=family==='generation'?requests(prefix)[0]:mixedRequests(prefix).find(row=>row.family==='original'),row=remap(input,prefix),selected=[old?{id:row.id,recovery:row.recovery}:row],open={database:prefix+'-catalog',expected:chosenArchive.selection(),checkAuthority(){}},catalogClass=old?api.SharedRoomRecoveryCatalog:api.SharedRoomRecoveryCatalogV2,target=JSON.stringify(row.recovery.database),leases=new Map(),acquire=RecoveryLease.acquire,close=RecoveryLease.prototype.close,put=IDBObjectStore.prototype.put;
  let catalog,aborted=false,releaseFailed=false;const filesBefore=await stored([chosenArchive.serverFile(),chosenArchive.inventoryFile(),...chosenArchive.metadata().participants.map(p=>chosenArchive.participantFile(p.id))]);
  try{
   catalog=await catalogClass.begin({...open,archive:chosenArchive});
   RecoveryLease.acquire=async function(name){const lease=await acquire.call(this,name);leases.set(lease,name);return lease;};
   RecoveryLease.prototype.close=async function(...args){if(leases.get(this)===target&&!releaseFailed){releaseFailed=true;throw Error('PRIVATE-RETRYABLE-CLEANUP-RELEASE');}return close.apply(this,args);};
   IDBObjectStore.prototype.put=function(value,...args){const result=put.call(this,value,...args);if(!aborted&&this.name===(old?'catalog':'room_v2_state')&&this.transaction.db.name===open.database&&value.participants?.[0]?.state==='complete'){aborted=true;this.transaction.abort();}return result;};
   await assert.rejects(catalog.stage(selected),e=>e.code==='catalog_storage');assert.equal(aborted,true);assert.equal(releaseFailed,true);
   IDBObjectStore.prototype.put=put;
   const names=[open.database,row.recovery.database,...Object.values(row.recovery.destinations)],before=new Map(await Promise.all(names.map(async name=>[name,await snapshot(name)])));
   await assert.rejects(async()=>catalog.stage(selected),e=>e.code==='catalog_in_use');
   await catalog.close();catalog=undefined;
   // This exact journal lease remained held forever before the catalog retained failed cleanup owners.
   const released=await RecoveryLease.acquire(target);await released.close();
   for(const name of names){assert.deepEqual(await snapshot(name),before.get(name));counts.cleanupRetainedRecordComparisons++;}
   catalog=await catalogClass.resume(open);const checked=await catalog.stage(selected);assert.equal(checked.stagedParticipants.length,1);counts.cleanupColdParticipants++;
   assert.deepEqual(await stored([catalog.serverFile(),catalog.inventoryFile(),...chosenArchive.metadata().participants.map(p=>catalog.participantFile(p.id))]),filesBefore);counts.cleanupOriginalFileComparisons+=filesBefore.length;
   await catalog.close();catalog=undefined;counts.failedCleanupRetries++;if(old)counts.originalCatalogCleanupRetries++;else if(family==='generation')counts.generationCatalogCleanupRetries++;else counts.mixedOriginalCleanupRetries++;
  }catch(error){failures.push({family,name:error.name,code:error.code,message:error.message});}
  finally{IDBObjectStore.prototype.put=put;RecoveryLease.acquire=acquire;RecoveryLease.prototype.close=close;await catalog?.discardAndClose();for(const lease of leases.keys())await close.call(lease);}
 }}finally{originalArchive.dispose();}
 if(failures.length)console.error('CATALOG_CLEANUP_FAILURES '+JSON.stringify(failures));
 assert.deepEqual(failures,[],'Failed staging must retain cleanup custody until a successful retry');
}
