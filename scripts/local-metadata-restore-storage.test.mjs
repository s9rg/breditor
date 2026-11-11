/** Real native packets/histories with controlled physical IDB and WebLocks.
 * The placeholder room file here is NEVER a complete-room admission proof;
 * the separate all-seven-owner workflow exercises the actual coordinator. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IDBObjectStore,IDBFactory} from 'fake-indexeddb';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {LocalMetadataRestoreResources as Resources} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/restore_resources.js';
import {LocalMetadataDeliveryStore as Store} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/store.js';
import {metadataSnapshot,metadataJson} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/policy.js';
import {RecoveryOpeningCustody} from '../packages/breditor-collaboration/dist/participant_recovery/opening_custody.js';
import {independentHistoryNative} from '../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {localMetadataFixture,mutateMetadata} from './fixtures/local-metadata/session.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {openAndForceCloseJournal} from './fixtures/local-metadata/unexpected-close.mjs';
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});

async function fixture(){
 const f=await localMetadataFixture(native);
 try{
  insertCleanupText(f.core,'Outstanding restored offline document ');
  f.core.dispatchReview({kind:'create_thread',data:{anchorJson:f.core.captureReviewAnchor({kind:'document'}),body:'Outstanding restored offline comment'}});
  await f.session.flush();
  const snapshot=await metadataSnapshot({before:f.state,current:{...f.state,revision:7,lanes:[{...f.state.lanes[0],source:independentHistoryNative(f.session).persisted()}]}},f.choice);
  const bundle={parent:{prepared:{choice:{database:'metadata-physical-copy-context',before:f.choice.parent.before},file:new Blob(['Physical storage fixture only'])}}};
  const options={wasm:native,checkAuthority(){}};
  return{...f,snapshot,bundle,options,resources(override=options){return new Resources(f.choice,bundle,snapshot,override);}};
 }catch(error){await f.close();throw error;}
}
async function raw(name){
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('No placeholder allowed'));};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly'),s=tx.objectStore('state'),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>resolve({keys:keys.result,values:values.result});tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
test('absent probe leaves no placeholder; restore preserves distinct initial/current rows and opens through the actual metadata store',async()=>{
 const f=await fixture(),r=f.resources();let store;
 try{await r.reserve();assert.equal(await r.inspect(),'absent');assert.equal((await indexedDB.databases()).some(row=>row.name===f.choice.database),false);await r.restore('absent');assert.equal(await r.inspect(),'identical');await r.close();const saved=await raw(f.choice.database);assert.deepEqual(saved.keys,['before','current']);assert.deepEqual(saved.values,[metadataJson(f.snapshot.before),metadataJson(f.snapshot.current)]);assert.notDeepEqual(f.snapshot.before,f.snapshot.current);store=new Store(f.choice,()=>{});
 assert.deepEqual(await openAndForceCloseJournal(store,f.choice.database),f.snapshot);
 assert.throws(store.checkCurrent,error=>error.code==='local_metadata_delivery_closed');
 assert.equal(store.revoked.aborted,true);
 await store.close();
 store=new Store(f.choice,()=>{});
 assert.deepEqual(await store.open(),f.snapshot);
 const text=f.core.documentJson();assert.equal(f.core.undo(),true);assert.equal(f.core.redo(),true);assert.equal(f.core.documentJson(),text);assert.equal(f.core.undoReview().kind,'committed');assert.equal(f.core.redoReview().kind,'committed');}finally{await store?.close();await r.close();await f.close();}
});
test('identical retry makes no writes and never resets advanced records',async()=>{
 const f=await fixture();let r=f.resources();const add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put;let writes=0;
 try{await r.reserve();await r.restore('absent');await r.close();r=f.resources();await r.reserve();IDBObjectStore.prototype.add=function(...args){if(this.transaction.db.name===f.choice.database)writes++;return add.apply(this,args);};IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name===f.choice.database)writes++;return put.apply(this,args);};await r.restore('identical');assert.equal(writes,0);assert.deepEqual((await raw(f.choice.database)).values,[metadataJson(f.snapshot.before),metadataJson(f.snapshot.current)]);}finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;await r.close();await f.close();}
});
test('different existing bytes refuse without overwrite even with identical counters and keys',async()=>{
 const f=await fixture();let r=f.resources();try{await r.reserve();await r.restore('absent');await r.close();await mutateMetadata(f.choice.database,s=>{const q=s.get('current');q.onsuccess=()=>s.put(q.result+' ','current');});const before=await raw(f.choice.database);r=f.resources();await r.reserve();await assert.rejects(r.inspect(),e=>e.code==='local_metadata_restore_exists');await assert.rejects(r.restore('identical'));assert.deepEqual(await raw(f.choice.database),before);}finally{await r.close();await f.close();}
});
test('stale absence cannot overwrite an identical destination that appeared before copy',async()=>{
 const f=await fixture(),r=f.resources();try{await r.reserve();assert.equal(await r.inspect(),'absent');await r.restore('absent');const before=await raw(f.choice.database);await assert.rejects(r.restore('absent'),e=>e.code==='local_metadata_restore_stale');assert.deepEqual(await raw(f.choice.database),before);}finally{await r.close();await f.close();}
});
test('an aborted upgrade creates neither initial nor current data and a fresh retry retains both',async()=>{
 const f=await fixture();let r=f.resources();const add=IDBObjectStore.prototype.add;let armed=true;
 try{await r.reserve();IDBObjectStore.prototype.add=function(...args){if(armed&&this.transaction.db.name===f.choice.database&&args[1]==='current'){armed=false;throw Error('Controlled quota refusal');}return add.apply(this,args);};await assert.rejects(r.restore('absent'));assert.equal(armed,false);IDBObjectStore.prototype.add=add;await r.close();assert.equal((await indexedDB.databases()).some(row=>row.name===f.choice.database),false);r=f.resources();await r.reserve();assert.equal(await r.inspect(),'absent');await r.restore('absent');assert.equal(await r.inspect(),'identical');}finally{IDBObjectStore.prototype.add=add;await r.close();await f.close();}
});
test('post-commit authority refusal keeps the complete data copy for a newly observed identical retry',async()=>{
 const f=await fixture();let allowed=true,r=f.resources({...f.options,checkAuthority(){if(!allowed)throw Error('Current permission revoked');}}),armed=true;const add=IDBObjectStore.prototype.add;
 try{await r.reserve();IDBObjectStore.prototype.add=function(...args){if(armed&&this.transaction.db.name===f.choice.database&&args[1]==='current'){armed=false;this.transaction.addEventListener('complete',()=>{allowed=false;},{once:true});}return add.apply(this,args);};await assert.rejects(r.restore('absent'));assert.equal(armed,false);await r.close();IDBObjectStore.prototype.add=add;allowed=true;r=f.resources();await r.reserve();assert.equal(await r.inspect(),'identical');await r.restore('identical');assert.deepEqual((await raw(f.choice.database)).values,[metadataJson(f.snapshot.before),metadataJson(f.snapshot.current)]);}finally{allowed=true;IDBObjectStore.prototype.add=add;await r.close();await f.close();}
});
test('extra destination rows refuse before bulk reads',async()=>{
 const f=await fixture(),r=f.resources(),get=IDBObjectStore.prototype.getAll;let reads=0;
 try{await r.reserve();await r.restore('absent');await mutateMetadata(f.choice.database,s=>s.add('extra','unknown'));IDBObjectStore.prototype.getAll=function(...args){if(this.transaction.db.name===f.choice.database)reads++;return get.apply(this,args);};await assert.rejects(r.inspect());assert.equal(reads,0);}finally{IDBObjectStore.prototype.getAll=get;await r.close();await f.close();}
});
test('Close drains an actual reservation returned after cancellation before a new owner can reserve',async()=>{
 const f=await fixture(),reserve=RecoveryOpeningCustody.reserve;let r=f.resources(),release,notify;const entered=new Promise(resolve=>{notify=resolve;});
 try{let armed=true;RecoveryOpeningCustody.reserve=async function(...args){const actual=await reserve.apply(this,args);if(armed){armed=false;notify();await new Promise(resolve=>{release=resolve;});}return actual;};const opening=r.reserve(),observed=opening.then(()=>({}),error=>({error}));await entered;let closed=false;const closing=r.close().then(()=>{closed=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,false);release();await closing;assert.ok((await observed).error);RecoveryOpeningCustody.reserve=reserve;r=f.resources();await r.reserve();assert.equal(await r.inspect(),'absent');await r.restore('absent');}finally{release?.();RecoveryOpeningCustody.reserve=reserve;await r.close();await f.close();}
});
test('a late success after committed creation keeps actual custody until its callback drains',async()=>{
 const f=await fixture(),open=IDBFactory.prototype.open;let r=f.resources(),release,notify;const entered=new Promise(resolve=>{notify=resolve;});
 try{await r.reserve();let armed=true;IDBFactory.prototype.open=function(name,...args){const q=open.call(this,name,...args);if(name===f.choice.database)q.addEventListener('success',event=>{if(!armed)return;armed=false;event.stopImmediatePropagation();const callback=q.onsuccess;assert.equal(typeof callback,'function');q.onsuccess=null;release=()=>callback.call(q,event);notify();});return q;};const copying=r.restore('absent'),observed=copying.then(()=>({}),error=>({error}));await entered;await assert.rejects(r.close());const blocked=f.resources();try{await assert.rejects(blocked.reserve());}finally{await blocked.close();}release();release=undefined;assert.ok((await observed).error);await r.close();IDBFactory.prototype.open=open;r=f.resources();await r.reserve();assert.equal(await r.inspect(),'identical');await r.restore('identical');}finally{release?.();IDBFactory.prototype.open=open;await r.close();await f.close();}
});
test('a destination factory replacement refuses before any metadata copy',async()=>{
 const f=await fixture(),r=f.resources(),original=indexedDB;
 try{await r.reserve();Object.defineProperty(globalThis,'indexedDB',{value:new IDBFactory(),configurable:true});assert.throws(()=>r.restore('absent'),e=>e.code==='local_metadata_restore_closed');Object.defineProperty(globalThis,'indexedDB',{value:original,configurable:true});assert.equal((await indexedDB.databases()).some(row=>row.name===f.choice.database),false);}finally{Object.defineProperty(globalThis,'indexedDB',{value:original,configurable:true});await r.close();await f.close();}
});
