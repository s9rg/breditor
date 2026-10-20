/** Initial open rollback: real static begin/resume, current native backups and actual coordinator leases. */
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
async function stored(value){if(value instanceof Blob)return{type:value.type,bytes:[...new Uint8Array(await value.arrayBuffer())]};if(value instanceof ArrayBuffer)return{bytes:[...new Uint8Array(value)]};if(ArrayBuffer.isView(value))return{bytes:[...new Uint8Array(value.buffer,value.byteOffset,value.byteLength)]};if(Array.isArray(value))return Promise.all(value.map(stored));if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await stored(v)])));return value;}
async function snapshot(name){assert.ok((await indexedDB.databases()).some(r=>r.name===name));const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{const data={version:db.version,stores:{}};for(const store of [...db.objectStoreNames])data.stores[store]=await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),s=tx.objectStore(store),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>resolve({keys:keys.result,values:values.result});tx.onabort=()=>reject(tx.error);});return await stored(data);}finally{db.close();}}
const remap=(row,prefix)=>({...row,recovery:{...row.recovery,database:prefix+'-attempt',destinations:Object.fromEntries(Object.keys(row.recovery.destinations).map(k=>[k,prefix+'-'+k]))}});
export async function initialOpeningFailures({api,RecoveryLease,archive,originalInput,requests,mixedRequests,tag,counts}){
 const oldArchive=await api.SharedRoomRecoveryCatalogArchive.capture(originalInput),failures=[];
 try{for(const route of ['generation','mixed-original','original','direct-generation','direct-original'])for(const mode of ['begin','resume']){
  const direct=route.startsWith('direct-'),generation=route==='generation'||route==='direct-generation',old=route==='original'||route==='direct-original',selectedArchive=old?oldArchive:archive,prefix=tag+'-opening-'+route+'-'+mode,input=generation?requests(prefix)[0]:mixedRequests(prefix).find(r=>r.family==='original'),row=remap(input,prefix),rows=[old?{id:row.id,recovery:row.recovery}:row],open={database:prefix+'-catalog',expected:selectedArchive.selection(),checkAuthority(){}},Catalog=old?api.SharedRoomRecoveryCatalog:api.SharedRoomRecoveryCatalogV2,Attempt=generation?api.SharedGenerationParticipantRecovery:api.SharedParticipantRecovery,acquire=RecoveryLease.acquire,close=RecoveryLease.prototype.close,add=IDBObjectStore.prototype.add,get=IDBObjectStore.prototype.get,target=JSON.stringify(row.recovery.database),leases=new Map();
  let catalog,attempt,ready,backup,aborted=false,failed=false;const filesBefore=await stored([selectedArchive.serverFile(),selectedArchive.inventoryFile(),...selectedArchive.metadata().participants.map(p=>selectedArchive.participantFile(p.id))]);
  try{
   const selected=selectedArchive.metadata().participants.find(p=>p.id===row.id).selection;
   backup=await(generation?api.readSharedGenerationParticipant:api.readSharedParticipantBackup)(selectedArchive.participantFile(row.id),selected);
   const admittedType=backup.file().type;assert.deepEqual(new Uint8Array(await backup.file().arrayBuffer()),new Uint8Array(await selectedArchive.participantFile(row.id).arrayBuffer()));
   const options={...row.recovery,backup,expected:selected,checkAuthority(){}},{backup:_backup,...withoutBackup}=options,resume=generation?withoutBackup:options;
   const records=new Map();
   if(direct){if(mode==='resume'){attempt=await Attempt.begin(options);await attempt.close();attempt=undefined;records.set(row.recovery.database,await snapshot(row.recovery.database));}}
   else{catalog=await Catalog.begin({...open,archive:selectedArchive});if(mode==='resume'){await catalog.stage(rows);await catalog.close();catalog=await Catalog.resume(open);for(const name of [open.database,row.recovery.database,...Object.values(row.recovery.destinations)])records.set(name,await snapshot(name));}}
   RecoveryLease.acquire=async function(name){const lease=await acquire.call(this,name);leases.set(lease,name);return lease;};
   RecoveryLease.prototype.close=async function(...args){if(leases.get(this)===target&&!failed){failed=true;throw Error('PRIVATE-INITIAL-OPEN-RELEASE');}return close.apply(this,args);};
   IDBObjectStore.prototype.add=function(value,...args){const r=add.call(this,value,...args);if(mode==='begin'&&!aborted&&this.transaction.db.name===row.recovery.database){aborted=true;this.transaction.abort();}return r;};
   IDBObjectStore.prototype.get=function(...args){const r=get.apply(this,args);if(mode==='resume'&&!aborted&&this.transaction.db.name===row.recovery.database){r.addEventListener('success',()=>{if(!aborted){aborted=true;this.transaction.abort();}},{once:true});}return r;};
   await assert.rejects(direct?(mode==='begin'?Attempt.begin(options):Attempt.resume(resume)):catalog.stage(rows));assert.equal(aborted,true);assert.equal(failed,true);
   IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.get=get;
   if(mode==='begin'){const present=await indexedDB.databases();for(const name of [row.recovery.database,...Object.values(row.recovery.destinations)]){assert.equal(present.some(r=>r.name===name),false,'Failed initial create leaves no placeholder');counts.openingMissingDestinationChecks++;}if(!direct)records.set(open.database,await snapshot(open.database));}
   if(direct){
    // The old SDK leaves an unreturned lease here. A fresh explicit retry must drain only that failed open.
    attempt=await(mode==='begin'?Attempt.begin(options):Attempt.resume(resume));
    await assert.rejects(Attempt.resume(resume),e=>['recovery_in_use','generation_participant_busy'].includes(e.code));counts.openingLiveOwnerRefusals++;
    await attempt.progress();for(const[name,before]of records){assert.deepEqual(await snapshot(name),before);counts.openingRetainedRecordComparisons++;}
    ready=await attempt.finish();await ready.close();ready=undefined;await attempt.close();attempt=undefined;counts.openingColdParticipants++;
    attempt=await Attempt.resume(resume);ready=await attempt.finish();await ready.close();ready=undefined;await attempt.close();attempt=undefined;counts.openingReturnedOwnerReopens++;
    // Readers attach their canonical MIME; the catalog envelope selects byte identity, not MIME metadata.
    assert.deepEqual(new Uint8Array(await backup.file().arrayBuffer()),new Uint8Array(await selectedArchive.participantFile(row.id).arrayBuffer()));assert.equal(backup.file().type,admittedType);counts.openingOriginalFileComparisons++;
   }else{
    await catalog.close();catalog=undefined;
    const available=await RecoveryLease.acquire(target);await available.close();
    for(const[name,before]of records){assert.deepEqual(await snapshot(name),before);counts.openingRetainedRecordComparisons++;}
    catalog=await Catalog.resume(open);assert.equal((await catalog.stage(rows)).stagedParticipants.length,1);counts.openingColdParticipants++;
    assert.deepEqual(await stored([catalog.serverFile(),catalog.inventoryFile(),...selectedArchive.metadata().participants.map(p=>catalog.participantFile(p.id))]),filesBefore);counts.openingOriginalFileComparisons+=filesBefore.length;
    await catalog.close();catalog=undefined;
   }
   if(direct)counts.openingDirectRetries++;else counts.openingCatalogRetries++;counts.initialOpeningRetries++;
  }catch(error){failures.push({route,mode,code:error.code,message:error.message});}
  finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.get=get;RecoveryLease.acquire=acquire;RecoveryLease.prototype.close=close;await ready?.discardAndClose();await attempt?.close();await catalog?.discardAndClose();backup?.dispose();for(const lease of leases.keys())await close.call(lease);}
 }}finally{oldArchive.dispose();}
 if(failures.length)console.error('INITIAL_OPENING_FAILURES '+JSON.stringify(failures));assert.deepEqual(failures,[],'Failed unreturned opens must remain runtime-owned until cleanup succeeds');
}
