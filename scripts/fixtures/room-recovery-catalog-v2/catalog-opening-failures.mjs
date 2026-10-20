/** Catalog factory startup custody: actual closed archives, IDB transactions and coordinator leases. */
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
async function stored(value){if(value instanceof Blob)return{type:value.type,bytes:[...new Uint8Array(await value.arrayBuffer())]};if(value instanceof ArrayBuffer)return{bytes:[...new Uint8Array(value)]};if(ArrayBuffer.isView(value))return{bytes:[...new Uint8Array(value.buffer,value.byteOffset,value.byteLength)]};if(Array.isArray(value))return Promise.all(value.map(stored));if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await stored(v)])));return value;}
async function snapshot(name){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{const result={version:db.version,stores:{}};for(const store of [...db.objectStoreNames])result.stores[store]=await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),s=tx.objectStore(store),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>resolve({keys:keys.result,values:values.result});tx.onabort=()=>reject(tx.error);});return await stored(result);}finally{db.close();}}
const files=archive=>[archive.serverFile(),archive.inventoryFile(),...archive.metadata().participants.map(p=>archive.participantFile(p.id))];
export async function catalogInitialOpeningFailures({api,RecoveryLease,archive,originalInput,tag,counts}){
 const original=await api.SharedRoomRecoveryCatalogArchive.capture(originalInput),failures=[];
 try{for(const family of ['original','v2'])for(const mode of ['begin','resume']){
  const Catalog=family==='original'?api.SharedRoomRecoveryCatalog:api.SharedRoomRecoveryCatalogV2,selected=family==='original'?original:archive,database=tag+'-catalog-opening-'+family+'-'+mode,open={database,expected:selected.selection(),checkAuthority(){}},target=JSON.stringify(database),store=family==='original'?'catalog':'room_v2_state',beforeFiles=await stored(files(selected)),acquire=RecoveryLease.acquire,close=RecoveryLease.prototype.close,add=IDBObjectStore.prototype.add,get=IDBObjectStore.prototype.get,captured=[];
  let owner,aborted=false,failed=false,before;
  try{
   if(mode==='resume'){owner=await Catalog.begin({...open,archive:selected});await owner.close();owner=undefined;before=await snapshot(database);}
   RecoveryLease.acquire=async function(name){const lease=await acquire.call(this,name);if(name===target)captured.push(lease);return lease;};
   RecoveryLease.prototype.close=async function(...args){if(captured.includes(this)&&!failed){failed=true;throw Error('PRIVATE-CATALOG-INITIAL-RELEASE');}return close.apply(this,args);};
   IDBObjectStore.prototype.add=function(value,...args){const r=add.call(this,value,...args);if(mode==='begin'&&!aborted&&this.transaction.db.name===database&&this.name===store){aborted=true;this.transaction.abort();}return r;};
   IDBObjectStore.prototype.get=function(...args){const r=get.apply(this,args);if(mode==='resume'&&!aborted&&this.transaction.db.name===database&&this.name===store)r.addEventListener('success',()=>{if(!aborted){aborted=true;this.transaction.abort();}},{once:true});return r;};
   await assert.rejects(mode==='begin'?Catalog.begin({...open,archive:selected}):Catalog.resume(open));assert.equal(aborted,true);assert.equal(failed,true);
   IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.get=get;
   if(mode==='begin'){assert.equal((await indexedDB.databases()).some(row=>row.name===database),false,'An aborted initial catalog leaves no placeholder');counts.catalogOpeningMissingChecks++;}
   // A fresh explicit retry, not a diagnostic lease teardown, must drain the actual failed opening.
   owner=await(mode==='begin'?Catalog.begin({...open,archive:selected}):Catalog.resume(open));
   await assert.rejects(Catalog.resume(open),e=>e.code==='catalog_in_use');counts.catalogOpeningLiveOwnerRefusals++;
   assert.equal((await owner.progress()).phase,'retained');if(before){assert.deepEqual(await snapshot(database),before);counts.catalogOpeningRetainedRecordComparisons++;}
   assert.deepEqual(await stored(files(owner)),beforeFiles);counts.catalogOpeningOriginalFileComparisons+=beforeFiles.length;
   await owner.close();owner=undefined;owner=await Catalog.resume(open);assert.equal((await owner.progress()).phase,'retained');assert.deepEqual(await stored(files(owner)),beforeFiles);counts.catalogOpeningColdReopens++;
   await owner.close();owner=undefined;counts.catalogOpeningRetries++;counts[mode==='begin'?'catalogOpeningBeginRetries':'catalogOpeningResumeRetries']++;
  }catch(error){failures.push({family,mode,code:error.code,message:error.message});}
  finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.get=get;RecoveryLease.acquire=acquire;RecoveryLease.prototype.close=close;await owner?.close();for(const lease of captured)await close.call(lease);}
 }}finally{original.dispose();}
 if(failures.length)console.error('CATALOG_INITIAL_OPENING_FAILURES '+JSON.stringify(failures));assert.deepEqual(failures,[],'Failed unreturned catalog opens must retain cleanup custody');
}
