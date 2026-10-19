import test from "node:test";
import assert from "node:assert/strict";
import {IDBFactory,IDBObjectStore,IDBVersionChangeEvent} from "fake-indexeddb";
import {OperationalSharedParticipant} from "../packages/breditor-collaboration/dist/index.js";
import {createOperationDatabase} from "../packages/breditor-collaboration/dist/participant_operation/create_database.js";
import {existingOperationDatabase,readOperationDatabase} from "../packages/breditor-collaboration/dist/participant_operation/read_database.js";
import {publishParticipantOperation} from "../packages/breditor-collaboration/dist/participant_operation/publish.js";
import {operationRecord} from "../packages/breditor-collaboration/dist/participant_operation/record.js";
import {existingOperationalComponent} from "../packages/breditor-collaboration/dist/participant_operation/existing_component.js";
import {RichAssetStore} from "../packages/breditor-experimental-rich-content/index.js";
import {operationPixel,operationAsset,OperationFixtureImage} from "./fixtures/participant-recovery/operation-pixels.mjs";
const saved=new Map(),guard=()=>{},record=()=>operationRecord("original-recovery","independent-original-plan");
test.beforeEach(()=>{for(const [name,value]of Object.entries({indexedDB:new IDBFactory(),Image:OperationFixtureImage})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true});}});test.afterEach(()=>{for(const [name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];saved.clear();});
async function database(name,upgrade,version=1){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>upgrade?.(r.result);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function write(db,store,key,value){await new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value,key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
test("missing operation inspection creates no placeholder",async()=>{await assert.rejects(existingOperationDatabase("missing",()=>{}),e=>e.code==="operation_missing");assert.deepEqual(await indexedDB.databases(),[]);});
test("origin bytes and prepared intent commit atomically; aborted origin insert leaves no operation",async()=>{
 const add=IDBObjectStore.prototype.add;try{IDBObjectStore.prototype.add=function(...args){const r=add.apply(this,args);if(this.name==="origin")this.transaction.abort();return r;};await assert.rejects(createOperationDatabase("aborted",record(),new Blob(["origin"]),guard),e=>e.code==="operation_storage");}finally{IDBObjectStore.prototype.add=add;}
 assert.deepEqual(await indexedDB.databases(),[]);const db=await createOperationDatabase("complete",record(),new Blob(["original immutable bytes"]),guard);try{const state=await readOperationDatabase(db,record());assert.equal(state.record.phase,"prepared");assert.equal(await state.file.text(),"original immutable bytes");}finally{db.close();}
});
test("occupied and newer operation databases are preserved, never initialized or upgraded",async()=>{
 for(const version of [1,2]){const name=`occupied-${version}`,db=await database(name,db=>db.createObjectStore("foreign"),version);await write(db,"foreign","key","preserve");db.close();await assert.rejects(createOperationDatabase(name,record(),new Blob(["new"]),guard));const old=await database(name,undefined,version);assert.deepEqual([...old.objectStoreNames],["foreign"]);old.close();}
});
test("operational publication compares the exact original marker and never changes original file bytes",async()=>{
 const before=record(),db=await createOperationDatabase("publish",before,new Blob(["original"]),guard);try{const next=await publishParticipantOperation(db,before,guard);assert.equal(next.phase,"operational");await assert.rejects(publishParticipantOperation(db,before,guard),e=>e.code==="operation_diverged");await assert.rejects(readOperationDatabase(db,{...before,plan:"another plan"}),e=>e.code==="operation_diverged");const state=await readOperationDatabase(db,before);assert.deepEqual(state.record,next);assert.equal(await state.file.text(),"original");}finally{db.close();}
});
test("pre-abort changes nothing; cancellation after commit retains operational intent for resume",async()=>{
 const before=record(),db=await createOperationDatabase("cancel",before,new Blob(["original"]),guard),pre=new AbortController();pre.abort();try{await assert.rejects(publishParticipantOperation(db,before,guard,pre.signal),e=>e.code==="operation_aborted");assert.equal((await readOperationDatabase(db)).record.phase,"prepared");const after=new AbortController(),put=IDBObjectStore.prototype.put;
  try{IDBObjectStore.prototype.put=function(value,...args){const r=put.call(this,value,...args);if(this.name==="operation")this.transaction.addEventListener("complete",()=>after.abort(),{once:true});return r;};const next=await publishParticipantOperation(db,before,guard,after.signal);assert.equal(after.signal.aborted,true);assert.equal((await readOperationDatabase(db)).record.phase,next.phase);}finally{IDBObjectStore.prototype.put=put;}
 }finally{db.close();}
});
test("closed operation schemas and malformed records refuse without hanging or erasing data",{timeout:2000},async()=>{
 for(const kind of ["index","extra-record","extra-origin","wrong-phase","wrong-file"]){const db=kind==="index"?await database(kind,db=>{db.createObjectStore("operation").createIndex("unexpected","x");db.createObjectStore("origin");}):await createOperationDatabase(kind,record(),new Blob(["origin"]),guard);
  try{if(kind==="extra-record")await write(db,"operation","extra",record());if(kind==="extra-origin")await write(db,"origin","extra",new Blob(["extra"]));if(kind==="wrong-phase")await write(db,"operation","state",{...record(),phase:"ready"});if(kind==="wrong-file")await write(db,"origin","participant","not a Blob");await assert.rejects(readOperationDatabase(db),e=>e.code==="operation_diverged");}finally{db.close();}
 }
});
test("retained component inspection rejects missing, foreign-key and extra-key stores without creation",async()=>{
 await assert.rejects(existingOperationalComponent("missing","catalogs","writer"),e=>e.code==="operation_missing");assert.deepEqual(await indexedDB.databases(),[]);
 for(const kind of ["empty","foreign","extra"]){const db=await database(kind,db=>db.createObjectStore("catalogs"));if(kind!=="empty")await write(db,"catalogs","other",{keep:true});if(kind==="extra")await write(db,"catalogs","writer",{value:1});db.close();await assert.rejects(existingOperationalComponent(kind,"catalogs","writer"),e=>e.code==="operation_missing");}
});
test("retained component fences are installed before the asynchronous shape/key read",async()=>{
 const db=await database("component",db=>db.createObjectStore("catalogs"));await write(db,"catalogs","writer",{value:1});db.close();const count=IDBObjectStore.prototype.count;
 try{IDBObjectStore.prototype.count=function(...args){this.transaction.db.dispatchEvent(new IDBVersionChangeEvent("versionchange",{oldVersion:1,newVersion:2}));return count.apply(this,args);};await assert.rejects(existingOperationalComponent("component","catalogs","writer"),e=>e.code==="operation_versionchange");}finally{IDBObjectStore.prototype.count=count;}
});
test("retained raster open creates nothing, rejects foreign schemas and admits actual complete bytes",async()=>{
 await assert.rejects(RichAssetStore.openRetained("missing"),e=>e.code==="asset_backup_storage");assert.deepEqual(await indexedDB.databases(),[]);const original=await RichAssetStore.open("rasters");await original.ingest(new Blob([operationPixel],{type:"image/png"}));await original.cancel(operationAsset);const entries=await original.list();original.close();const reopened=await RichAssetStore.openRetained("rasters");try{assert.deepEqual(await reopened.list(),entries);assert.deepEqual(new Uint8Array(await(await reopened.blob(operationAsset)).arrayBuffer()),new Uint8Array(operationPixel));}finally{reopened.close();}
 const foreign=await database("foreign-raster",db=>db.createObjectStore("foreign"),2);foreign.close();await assert.rejects(RichAssetStore.openRetained("foreign-raster"),e=>e.code==="asset_backup_storage");
 const malformed=await database("rasters");await write(malformed,"metadata","unrelated",0);malformed.close();await assert.rejects(RichAssetStore.openRetained("rasters"),e=>e.code==="asset_backup_storage");
});
test("detached operation constructors cannot manufacture native custody",()=>{assert.throws(()=>new OperationalSharedParticipant({},{}),e=>e.code==="operation_closed");});
test("retained raster policy is snapshotted before awaiting storage and cannot be widened by mutation",async()=>{
 const source=await RichAssetStore.open("policy");await source.ingest(new Blob([operationPixel],{type:"image/png"}));source.close();const strict={limits:{maxStoredBytes:1}},refused=RichAssetStore.openRetained("policy",strict);strict.limits.maxStoredBytes=1024;await assert.rejects(refused,e=>e.code==="asset_backup_budget");
 const permitted={limits:{maxStoredBytes:1024}},opening=RichAssetStore.openRetained("policy",permitted);permitted.limits.maxStoredBytes=1;const current=await opening;try{assert.equal(current.limits.maxStoredBytes,1024);assert.equal((await current.list()).length,1);}finally{current.close();}
});
test("operation plans enforce the original byte ceiling before allocating an oversized UTF-8 copy",()=>{assert.throws(()=>operationRecord("original", "x".repeat(64*1024+1)),e=>e.code==="operation_diverged");assert.throws(()=>operationRecord("original","🙂".repeat(32*1024)),e=>e.code==="operation_diverged");});
