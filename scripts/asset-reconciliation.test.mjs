import test from "node:test";
import assert from "node:assert/strict";
import {IDBFactory,IDBObjectStore} from "fake-indexeddb";
import {RichAssetStore,RichAssetReconciliation} from "../packages/breditor-experimental-rich-content/index.js";
import {openDatabase} from "../packages/breditor-experimental-rich-content/dist/browser/assets/database.js";
import {equalAssetBytes} from "../packages/breditor-experimental-rich-content/dist/browser/assets/reconciliation/equal_bytes.js";
import {pixel,pixelAsset,secondPixel,secondAsset,proposalPixel,proposalAsset,ReviewFixtureImage} from "./fixtures/review-assets/pixels.mjs";
import {assetLockHost} from './fixtures/asset-custody/locks.mjs';
const originals=new Map(["indexedDB","Image","navigator"].map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
let held;
test.beforeEach(()=>{const host=assetLockHost();held=host.held;for(const[n,v]of Object.entries({indexedDB:new IDBFactory(),Image:ReviewFixtureImage,navigator:{locks:host.locks}}))Object.defineProperty(globalThis,n,{value:v,configurable:true});});
test.afterEach(()=>{assert.equal(held.size,0,"Every owned reconciliation/target lease is released");for(const[n,v]of originals)if(v)Object.defineProperty(globalThis,n,v);else delete globalThis[n];});
const blob=p=>new Blob([p],{type:"image/png"}),options=(database="attempt")=>({database,checkSource(){}}),bytes=async b=>new Uint8Array(await b.arrayBuffer());
async function state(name){const db=await openDatabase(name);try{return await new Promise((resolve,reject)=>{const tx=db.transaction(["assets","metadata"],"readonly"),a=tx.objectStore("assets").getAll(),b=tx.objectStore("metadata").get("bytes");tx.oncomplete=()=>resolve({records:a.result,bytes:b.result});tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
async function setup({same=false,onChange}={}){const source=await RichAssetStore.open("source"),target=await RichAssetStore.open("target",{onChange});await source.ingest(blob(same?pixel:secondPixel));await target.ingest(blob(pixel));return{source,target,original:await source.exportBackup(),before:await state("target")};}

test("whole asset reconciliation retains both exact files, current-only bytes and atomic budget without notifications",async()=>{
 let events=0;const{source,target,original,before}=await setup({onChange(){events++;}});let attempt,resumed,reopened;
 try{const current=await target.exportBackup(),startEvents=events;attempt=await target.beginReconciliation(original,options());assert.equal(RichAssetReconciliation.begin,undefined);assert.equal(attempt.preview().unionAssets,2);assert.equal(attempt.preview().added,1);assert.equal(attempt.preview().conflicts.length,0);assert.deepEqual(await state("target"),before);assert.deepEqual(await bytes(attempt.file("current")),await bytes(current));assert.deepEqual(await bytes(attempt.file("original")),await bytes(original));assert.deepEqual(await attempt.commit([]),{phase:"applied",retained:2,bytes:pixel.length+secondPixel.length});assert.equal(events,startEvents);const after=await state("target");assert.equal(after.records.length,2);assert.equal(after.bytes,pixel.length+secondPixel.length);assert.deepEqual(await bytes(await target.blob(secondAsset)),new Uint8Array(secondPixel));assert.equal(attempt.progress().phase,"applied");await attempt.commit([]);assert.deepEqual(await state("target"),after);await attempt.close();attempt=undefined;target.close();reopened=await RichAssetStore.openRetained("target");resumed=await reopened.resumeReconciliation(options());await resumed.commit([]);assert.deepEqual(await state("target"),after);assert.deepEqual(await bytes(resumed.file("current")),await bytes(current));assert.deepEqual(await source.list(),(await state("source")).records.map(({payload,epoch,...r})=>r));}
 finally{await attempt?.close();await resumed?.close();source.close();target.close();reopened?.close();}
});

test("transaction byte equality covers empty, word-aligned and trailing-byte buffers exactly",()=>{
 for(let length=0;length<130;length++){const a=Uint8Array.from({length},(_,i)=>(i*53+length)&255),b=a.slice();assert.equal(equalAssetBytes(a.buffer,b.buffer),true);assert.equal(equalAssetBytes(a.buffer,new ArrayBuffer(length+1)),false);for(let i=0;i<length;i++){b[i]^=1;assert.equal(equalAssetBytes(a.buffer,b.buffer),false);b[i]^=1;}}
});

test("applying a retained decision writes only the new raster and changed queue row",async()=>{
 const target=await RichAssetStore.open("target"),source=await RichAssetStore.open("source");
 const put=IDBObjectStore.prototype.put,writes=[];
 let attempt;
 try{
  await target.ingest(blob(pixel));await target.ingest(blob(secondPixel));await target.cancel(secondAsset);
  await source.ingest(blob(pixel));await source.ingest(blob(proposalPixel));await source.flush(async()=>"selected-receipt");
  const unchanged=await target.get(secondAsset);
  attempt=await target.beginReconciliation(await source.exportBackup(),options());
  IDBObjectStore.prototype.put=function(...args){
   const request=put.apply(this,args);
   if(this.name==="assets"&&this.transaction.db.name==="target")writes.push(args[0].asset);
   return request;
  };
  await attempt.commit([{asset:pixelAsset,keep:"original"}]);
  assert.deepEqual(writes.sort(),[pixelAsset,proposalAsset].sort());
  assert.deepEqual(await target.get(secondAsset),unchanged);
  assert.equal((await target.get(pixelAsset)).storageRef,"selected-receipt");
  await attempt.commit([{asset:pixelAsset,keep:"original"}]);assert.equal(writes.length,2);
 }finally{IDBObjectStore.prototype.put=put;await attempt?.close();target.close();source.close();}
});

for(const keep of ["current","original"])test(`conflicting receipt/counter state requires exact explicit ${keep} choice and preserves the losing file`,async()=>{
 const{source,target}=await setup({same:true});let attempt;try{await source.flush(async()=>{throw Error("offline");});await source.retry(pixelAsset);await source.flush(async()=>"original:"+String.fromCharCode(0xd800));await target.flush(async()=>"current-receipt");const original=await source.exportBackup(),current=await target.exportBackup(),before=await state("target"),sourceState=await state("source");attempt=await target.beginReconciliation(original,options());assert.equal(attempt.preview().conflicts.length,1);assert.equal(attempt.preview().conflicts[0].original.attempts,2);assert.equal(attempt.preview().conflicts[0].current.attempts,1);for(const choices of [[],[{asset:secondAsset,keep}],[{asset:pixelAsset,keep:"newer"}],[{asset:pixelAsset,keep},{asset:pixelAsset,keep}]])await assert.rejects(attempt.commit(choices),e=>e.code==="asset_reconciliation_choices");assert.equal(attempt.progress().phase,"prepared");assert.deepEqual(await state("target"),before);await attempt.commit([{asset:pixelAsset,keep}]);assert.deepEqual(await state("target"),keep==="original"?sourceState:before);assert.deepEqual(await bytes(attempt.file("current")),await bytes(current));assert.deepEqual(await bytes(attempt.file("original")),await bytes(original));await assert.rejects(attempt.commit([{asset:pixelAsset,keep:keep==="original"?"current":"original"}]),e=>e.code==="asset_reconciliation_choices");}finally{await attempt?.close();source.close();target.close();}
});

test("aborted target transaction leaves exact old records and prepared choices; same attempt retries",async()=>{
 const{source,target,original,before}=await setup();let attempt;const put=IDBObjectStore.prototype.put;try{attempt=await target.beginReconciliation(original,options());let aborted=false;IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(this.name==="assets"&&!aborted){aborted=true;queueMicrotask(()=>{try{this.transaction.abort();}catch{}});}return request;};await assert.rejects(attempt.commit([]),e=>e.code==="asset_reconciliation_storage");IDBObjectStore.prototype.put=put;assert.equal(attempt.progress().phase,"decided");assert.deepEqual(await state("target"),before);await attempt.commit([]);assert.equal((await state("target")).records.length,2);}finally{IDBObjectStore.prototype.put=put;await attempt?.close();source.close();target.close();}
});

test("target commit before acknowledgement is detected on retry without a second asset write",async()=>{
 const{source,target,original}=await setup();let attempt;const put=IDBObjectStore.prototype.put;try{attempt=await target.beginReconciliation(original,options());let injected=false,writes=0;IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(this.name==="assets"){writes++;if(!injected){injected=true;const tx=this.transaction;tx.oncomplete=()=>tx.onabort?.call(tx,new Event("abort"));}}return request;};await assert.rejects(attempt.commit([]),e=>e.code==="asset_reconciliation_storage");assert.equal((await state("target")).records.length,2);const firstWrites=writes;await attempt.commit([]);assert.equal(writes,firstWrites);assert.equal(attempt.progress().phase,"applied");}finally{IDBObjectStore.prototype.put=put;await attempt?.close();source.close();target.close();}
});

for(const phase of ["initial","decided","applied"])test(`ledger ${phase} commit before acknowledgement resumes from actual files and phase`,async()=>{
 const{source,target,original}=await setup();let attempt;const add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put;let injected=false;
 const wrap=method=>function(...args){const request=method.apply(this,args);const record=args[0];if(this.name==="record"&&!injected&&record?.phase===(phase==="initial"?"prepared":phase)){injected=true;const tx=this.transaction;tx.oncomplete=()=>tx.onabort?.call(tx,new Event("abort"));}return request;};
 try{if(phase==="initial")IDBObjectStore.prototype.add=wrap(add);else IDBObjectStore.prototype.put=wrap(put);if(phase==="initial"){await assert.rejects(target.beginReconciliation(original,options()),e=>e.code==="asset_reconciliation_storage");IDBObjectStore.prototype.add=add;attempt=await target.resumeReconciliation(options());}else{attempt=await target.beginReconciliation(original,options());await assert.rejects(attempt.commit([]),e=>e.code==="asset_reconciliation_storage");IDBObjectStore.prototype.put=put;await attempt.close();attempt=await target.resumeReconciliation(options());}assert.equal(injected,true);await attempt.commit([]);assert.equal(attempt.progress().phase,"applied");assert.equal((await state("target")).records.length,2);}finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;await attempt?.close();source.close();target.close();}
});

test("changed target metadata refuses without overwriting; a new attempt captures and resolves the new state",async()=>{
 const{source,target,original}=await setup({same:true});let attempt,next;try{attempt=await target.beginReconciliation(original,options());await target.cancel(pixelAsset);const changed=await state("target");await assert.rejects(attempt.commit([]),e=>e.code==="asset_reconciliation_target_changed");assert.deepEqual(await state("target"),changed);assert.equal(attempt.progress().phase,"decided");next=await target.beginReconciliation(attempt.file("original"),options("next-attempt"));assert.equal(next.preview().conflicts.length,1);await next.commit([{asset:pixelAsset,keep:"current"}]);assert.deepEqual(await state("target"),changed);assert.equal((await source.get(pixelAsset)).status,"pending");}finally{await attempt?.close();await next?.close();source.close();target.close();}
});

test("an applied marker cannot silently recreate assets deleted from the target",async()=>{
 const{source,target,original}=await setup();let attempt;try{attempt=await target.beginReconciliation(original,options());await attempt.commit([]);const db=await openDatabase("target");await new Promise((resolve,reject)=>{const tx=db.transaction(["assets","metadata"],"readwrite");tx.objectStore("assets").delete(secondAsset);tx.objectStore("metadata").put(pixel.length,"bytes");tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();const before=await state("target");await assert.rejects(attempt.commit([]),e=>e.code==="asset_reconciliation_target_changed");assert.deepEqual(await state("target"),before);}finally{await attempt?.close();source.close();target.close();}
});

test("active uploads and cross-owner leases refuse recovery without creating an attempt",async()=>{
 const{source,target,original}=await setup();let attempt,finish,started;const ready=new Promise(r=>started=r);try{const drain=target.flush(()=>{started();return new Promise(r=>finish=r);});await ready;await assert.rejects(target.beginReconciliation(original,options()),e=>e.code==="asset_reconciliation_busy");assert.equal((await indexedDB.databases()).some(d=>d.name==="attempt"),false);finish("uploaded");await drain;attempt=await target.beginReconciliation(original,options());await assert.rejects(target.resumeReconciliation(options()),e=>e.code==="asset_reconciliation_busy");}finally{finish?.("uploaded");await attempt?.close();source.close();target.close();}
});

test("closed or asynchronous source checks refuse before ledger creation and never expose callback errors",async()=>{
 const{source,target,original,before}=await setup();try{for(const checkSource of [()=>true,async()=>{throw Error("PRIVATE");},()=>{throw Error("PRIVATE");}]){await assert.rejects(target.beginReconciliation(original,{database:"bad",checkSource}),e=>e.code==="asset_reconciliation_source"&&!String(e).includes("PRIVATE"));assert.equal((await indexedDB.databases()).some(d=>d.name==="bad"),false);}assert.deepEqual(await state("target"),before);await assert.rejects(target.resumeReconciliation(options("missing")));assert.equal((await indexedDB.databases()).some(d=>d.name==="missing"),false);}finally{source.close();target.close();}
});

test("budget and raster admission happen before attempt storage; neither expands the old bounds",async()=>{
 const source=await RichAssetStore.open("source"),target=await RichAssetStore.open("target",{limits:{maxStoredBytes:Math.max(pixel.length,secondPixel.length)}});let attempt;try{await source.ingest(blob(secondPixel));await target.ingest(blob(pixel));const before=await state("target");await assert.rejects(target.beginReconciliation(await source.exportBackup(),options()),e=>e.code==="asset_reconciliation_budget");assert.deepEqual(await state("target"),before);assert.equal((await indexedDB.databases()).some(d=>d.name==="attempt"),false);await assert.rejects(target.beginReconciliation(new Blob(["invalid"]),options()));assert.equal((await indexedDB.databases()).some(d=>d.name==="attempt"),false);}finally{await attempt?.close();source.close();target.close();}
});

test("new Promise-returning store and replay methods reject closed/forged receivers rather than throwing synchronously",async()=>{
 const target=await RichAssetStore.open("target");target.close();for(const method of["beginReconciliation","resumeReconciliation"]){let pending;assert.doesNotThrow(()=>{pending=method==="beginReconciliation"?target[method](new Blob(),options()):target[method](options());});await assert.rejects(pending,/closed/);}
 const{SharedParticipantReplay}=await import(process.env.BREDITOR_UPLOAD_REPLAY_MODULE??"../packages/breditor-collaboration/dist/index.js");for(const method of["beginUploadReconciliation","resumeUploadReconciliation"]){let pending;assert.doesNotThrow(()=>{pending=SharedParticipantReplay.prototype[method].call({});});await assert.rejects(pending);}
});

test("cancellation during decode blocks reentrant store writes and closes no borrowed owner",async()=>{
 const{source,target,original,before}=await setup();const controller=new AbortController();let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);let first=true;
 class Delayed extends ReviewFixtureImage{async decode(){await super.decode();if(first){first=false;enter();await gate;}}}
 try{Object.defineProperty(globalThis,"Image",{value:Delayed,configurable:true});const pending=target.beginReconciliation(original,{...options(),signal:controller.signal}).catch(e=>e);await entered;assert.throws(()=>target.close(),e=>e.code==="asset_reconciliation_busy");assert.throws(()=>target.flush(async()=>"forbidden"),e=>e.code==="asset_reconciliation_busy");for(const work of[()=>target.cancel(pixelAsset),()=>target.retry(pixelAsset),()=>target.ingest(blob(secondPixel)),()=>target.cacheRemote(secondAsset,blob(secondPixel),"remote")])await assert.rejects(work,e=>e.code==="asset_reconciliation_busy");controller.abort();release();assert.equal((await pending).code,"asset_backup_aborted");assert.deepEqual(await state("target"),before);assert.equal((await indexedDB.databases()).some(d=>d.name==="attempt"),false);}finally{release?.();source.close();target.close();}
});

test("reentrant choice getters cannot close or commit the same attempt before its busy guard",async()=>{
 const{source,target}=await setup({same:true});let attempt;try{await target.cancel(pixelAsset);attempt=await target.beginReconciliation(await source.exportBackup(),options());const refusals=[];const choice={asset:pixelAsset,get keep(){refusals.push(attempt.close().catch(e=>e),attempt.commit([]).catch(e=>e));return"current";}};await attempt.commit([choice]);for(const work of refusals)assert.equal((await work).code,"asset_reconciliation_busy");assert.equal(attempt.progress().phase,"applied");}finally{await attempt?.close();source.close();target.close();}
});

test("aborted initial retention leaves the target intact and a fresh retry can retain both complete files",async()=>{
 const{source,target,original,before}=await setup();const add=IDBObjectStore.prototype.add;let attempt;try{let once=false;IDBObjectStore.prototype.add=function(...args){const r=add.apply(this,args);if(this.name==="files"&&!once){once=true;queueMicrotask(()=>{try{this.transaction.abort();}catch{}});}return r;};await assert.rejects(target.beginReconciliation(original,options()),e=>e.code==="asset_reconciliation_storage");IDBObjectStore.prototype.add=add;assert.deepEqual(await state("target"),before);attempt=await target.beginReconciliation(original,options());await attempt.commit([]);assert.equal((await target.list()).length,2);}finally{IDBObjectStore.prototype.add=add;await attempt?.close();source.close();target.close();}
});

test("tampered retained files refuse without overwriting the target or repairing the stored file",async()=>{
 const{source,target,original,before}=await setup();let attempt;try{attempt=await target.beginReconciliation(original,options());const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("attempt");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const altered=await original.arrayBuffer();new Uint8Array(altered)[0]^=1;await new Promise((resolve,reject)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").put(altered,"original");tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();await assert.rejects(attempt.commit([]),e=>e.code==="asset_reconciliation_format");assert.deepEqual(await state("target"),before);await attempt.close();attempt=undefined;await assert.rejects(target.resumeReconciliation(options()));assert.deepEqual(await state("target"),before);}finally{await attempt?.close();source.close();target.close();}
});

test("foreign target metadata refuses before any attempt file is created",async()=>{
 const{source,target,original}=await setup();try{const db=await openDatabase("target");await new Promise((resolve,reject)=>{const tx=db.transaction("metadata","readwrite");tx.objectStore("metadata").put("keep untouched","extension-owned");tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();const before=await state("target");await assert.rejects(target.beginReconciliation(original,options()),e=>e.code==="asset_reconciliation_format");assert.equal((await indexedDB.databases()).some(d=>d.name==="attempt"),false);assert.deepEqual(await state("target"),before);}finally{source.close();target.close();}
});

test("a held attempt refuses rollback of its durable phase or replacement of recorded choices",async()=>{
 for(const tamper of[record=>({...record,phase:"decided"}),record=>({...record,choices:[{asset:pixelAsset,keep:"original"}]})]){const suffix=Math.random().toString(16).slice(2),source=await RichAssetStore.open(`source-${suffix}`),target=await RichAssetStore.open(`target-${suffix}`);let attempt;try{await source.ingest(blob(pixel));await target.ingest(blob(pixel));await target.cancel(pixelAsset);const database=`attempt-${suffix}`;attempt=await target.beginReconciliation(await source.exportBackup(),options(database));await attempt.commit([{asset:pixelAsset,keep:"current"}]);const before=await state(`target-${suffix}`),db=await new Promise((resolve,reject)=>{const r=indexedDB.open(database);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction("record","readwrite"),store=tx.objectStore("record"),read=store.get("attempt");read.onsuccess=()=>store.put(tamper(read.result),"attempt");tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();await assert.rejects(attempt.commit([{asset:pixelAsset,keep:"current"}]),e=>e.code==="asset_reconciliation_format");assert.deepEqual(await state(`target-${suffix}`),before);}finally{await attempt?.close();source.close();target.close();}}
});

test("an explicitly restored older epoch cannot resurrect a cancelled provider's late receipt",async()=>{
 const{source,target,original}=await setup({same:true});let attempt,finish,started;const ready=new Promise(r=>started=r);try{const uploading=target.flush(()=>{started();return new Promise(r=>finish=r);});await ready;await target.cancel(pixelAsset);await uploading;attempt=await target.beginReconciliation(original,options());assert.equal(attempt.preview().conflicts[0].current.epoch,1);assert.equal(attempt.preview().conflicts[0].original.epoch,0);await attempt.commit([{asset:pixelAsset,keep:"original"}]);finish("stale-provider-receipt");await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));const stateBefore=await state("target");assert.equal(stateBefore.records[0].epoch,0);assert.equal(stateBefore.records[0].status,"pending");assert.equal(stateBefore.records[0].storageRef,null);await attempt.close();attempt=undefined;await target.flush(async()=>"fresh-provider-receipt");assert.equal((await target.get(pixelAsset)).storageRef,"fresh-provider-receipt");}finally{finish?.("late");await attempt?.close();source.close();target.close();}
});
