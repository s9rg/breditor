/** Failure injection against actual retained native files; synthetic storage/locks, never native readiness. */
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
const code=(...names)=>e=>names.includes(e?.code)&&!String(e).includes('PRIVATE');
async function open(name){return new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function snapshot(name){const db=await open(name);try{const result={};for(const name of db.objectStoreNames)result[name]=await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),s=tx.objectStore(name),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>resolve({keys:keys.result,values:values.result});tx.onabort=()=>reject(tx.error);});for(const value of Object.values(result))value.values=await Promise.all(value.values.map(async v=>v instanceof Blob?{bytes:[...new Uint8Array(await v.arrayBuffer())]}:v));return result;}finally{db.close();}}
async function replace(name,key,file){const db=await open(name);try{await new Promise((resolve,reject)=>{const tx=db.transaction('physical_room_files','readwrite');tx.objectStore('physical_room_files').put(file,key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function probePhysicalCatalogFailures({api,wasm,archive,counts,tag}){
 const expected=archive.selection(),options=database=>({database,expected,wasm,checkAuthority(){}}),files=archive.files();
 // Reserve verification before invoking authority: callbacks may synchronously re-enter public APIs.
 let reentrant,nested,reentryEntered=false,accepted=false;
 try{const checkAuthority=()=>{if(reentrant&&!reentryEntered){reentryEntered=true;try{nested=reentrant.verify();accepted=true;}catch(error){assert.equal(error.code,'catalog_in_use');}}};reentrant=await api.SharedPhysicalRoomRecoveryCatalog.begin({...options(tag+'-reentrant'),archive,checkAuthority});await reentrant.verify();await nested;assert.equal(reentryEntered,true);assert.equal(accepted,false,'An authority callback must not start a second overlapping verification');counts.verificationReentryRefusals++;}finally{await Promise.allSettled([nested]);await reentrant?.close();}
 // Genuine source custody is borrowed, not consumed; disposal after the call cannot retarget its files.
 const borrowed=await api.SharedPhysicalRoomRecoveryCatalogArchive.read(archive.manifestJson(),files,expected,{wasm,checkAuthority(){}}),pending=api.SharedPhysicalRoomRecoveryCatalog.begin({...options(tag+'-snapshot'),archive:borrowed});borrowed.dispose();const initial=await pending;await initial.verify();
 await assert.rejects(api.SharedPhysicalRoomRecoveryCatalog.resume(options(tag+'-snapshot')),code('catalog_in_use'));counts.exclusiveOpenRefusals++;
 await initial.close();const unchanged=await snapshot(tag+'-snapshot');
 const mutable=structuredClone(expected),mutableFactory={SharedArchiveDigest:{version:()=>wasm.SharedArchiveDigest.version(),maximum_bytes:()=>wasm.SharedArchiveDigest.maximum_bytes(),maximum_chunk_bytes:()=>wasm.SharedArchiveDigest.maximum_chunk_bytes(),create:value=>wasm.SharedArchiveDigest.create(value)}};
 const resumed=api.SharedPhysicalRoomRecoveryCatalog.resume({...options(tag+'-snapshot'),expected:mutable,wasm:mutableFactory});mutable.sha256='0'.repeat(64);mutableFactory.SharedArchiveDigest.create=()=>{throw Error('PRIVATE-MUTATED-FACTORY');};mutableFactory.SharedArchiveDigest.version=()=> '0';const owner=await resumed;await owner.verify();assert.deepEqual(owner.selection(),expected);await owner.close();assert.deepEqual(await snapshot(tag+'-snapshot'),unchanged);counts.selectionAndFactorySnapshots++;
 for(const selected of [{...expected,sha256:'0'.repeat(64)},{...expected,catalog:'unrelated'}]){await assert.rejects(api.SharedPhysicalRoomRecoveryCatalog.resume({...options(tag+'-snapshot'),expected:selected}),code('catalog_integrity'));assert.deepEqual(await snapshot(tag+'-snapshot'),unchanged);counts.independentSelectionRefusals++;}
 // The IDB factory is captured before reserve/lease awaits, not selected by a later global replacement.
 const factory=indexedDB,alternate=new IDBFactory(),capture=api.SharedPhysicalRoomRecoveryCatalog.resume(options(tag+'-snapshot'));Object.defineProperty(globalThis,'indexedDB',{value:alternate,configurable:true});let captured;try{captured=await capture;await captured.verify();assert.equal((await alternate.databases()).length,0);}finally{await captured?.close();Object.defineProperty(globalThis,'indexedDB',{value:factory,configurable:true});}counts.storageContextSnapshots++;
 // Lost acknowledgement: committed bytes remain selected, but no failed open may publish a handle or keep its lease.
 for(const mode of ['authority','abort']){
  const name=tag+'-lost-'+mode,controller=new AbortController(),saved=Blob.prototype.arrayBuffer;let live=true,once=true;
  try{Blob.prototype.arrayBuffer=function(){const result=saved.call(this);if(once){once=false;if(mode==='abort')controller.abort();else live=false;}return result;};await assert.rejects(api.SharedPhysicalRoomRecoveryCatalog.begin({...options(name),archive,signal:controller.signal,checkAuthority(){if(!live)throw Error('PRIVATE-LOST-ACK');}}),code(mode==='abort'?'archive_aborted':'archive_authority'));assert.equal(once,false);}finally{Blob.prototype.arrayBuffer=saved;}
  const before=await snapshot(name),restored=await api.SharedPhysicalRoomRecoveryCatalog.resume(options(name));await restored.verify();await restored.close();assert.deepEqual(await snapshot(name),before);counts.lostAcknowledgementResumes++;
 }
 // Re-admit actual durable bytes, not a cached metadata marker or old in-memory copy.
 for(const [at,[key,file]]of [...files].entries()){
  const name=tag+'-corrupt-'+at,held=await api.SharedPhysicalRoomRecoveryCatalog.begin({...options(name),archive}),bytes=new Uint8Array(await file.arrayBuffer());bytes[bytes.length-1]^=1;await replace(name,key,new Blob([bytes]));const before=await snapshot(name);
  await assert.rejects(held.verify(),e=>['catalog_integrity','archive_integrity','catalog_diverged'].includes(e?.code));await held.close();await assert.rejects(api.SharedPhysicalRoomRecoveryCatalog.resume(options(name)),e=>['catalog_integrity','archive_integrity','catalog_diverged'].includes(e?.code));assert.deepEqual(await snapshot(name),before);counts.durableCorruptionRefusals++;
 }
 const name=tag+'-cleanup',held=await api.SharedPhysicalRoomRecoveryCatalog.begin({...options(name),archive}),savedDispose=api.SharedServerLogGenerationRoomArchive.prototype.dispose;let once=true;
 try{api.SharedServerLogGenerationRoomArchive.prototype.dispose=function(){if(once){once=false;throw Error('PRIVATE-CLOSE');}return savedDispose.call(this);};await assert.rejects(held.close(),code('catalog_storage'));await assert.rejects(api.SharedPhysicalRoomRecoveryCatalog.resume(options(name)),code('catalog_in_use'));counts.failedCleanupCustodyRefusals++;}finally{api.SharedServerLogGenerationRoomArchive.prototype.dispose=savedDispose;}
 await held.close();const cleaned=await api.SharedPhysicalRoomRecoveryCatalog.resume(options(name));await cleaned.verify();await cleaned.close();counts.failedCleanupRetries++;
 // Closing waits for an in-flight read; it cannot release the lease while verification can still publish.
 const waiting=await api.SharedPhysicalRoomRecoveryCatalog.begin({...options(tag+'-wait'),archive}),saved=Blob.prototype.arrayBuffer;let enter,release;const entered=new Promise(r=>{enter=r;}),gate=new Promise(r=>{release=r;});once=true;
 try{Blob.prototype.arrayBuffer=async function(){if(once){once=false;enter();await gate;}return saved.call(this);};const verify=waiting.verify();await entered;assert.throws(()=>waiting.verify(),code('catalog_in_use'));const closed=waiting.close();release();await assert.rejects(verify,e=>['catalog_closed','archive_authority'].includes(e?.code));await closed;}finally{release();Blob.prototype.arrayBuffer=saved;await waiting.close();}
 const after=await api.SharedPhysicalRoomRecoveryCatalog.resume(options(tag+'-wait'));await after.close();counts.closeWaits++;
 return{unchangedFiles:files.size};
}
