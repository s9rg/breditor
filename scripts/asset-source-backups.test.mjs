import test from "node:test";
import assert from "node:assert/strict";
import {IDBFactory,IDBObjectStore,IDBDatabase} from "fake-indexeddb";
import {RichAssetStore} from "../packages/breditor-experimental-rich-content/dist/browser/assets/store.js";
import {readRichAssetBackup,RichAssetArchive} from "../packages/breditor-experimental-rich-content/dist/browser/assets/archive/read_backup.js";
import {openDatabase} from "../packages/breditor-experimental-rich-content/dist/browser/assets/database.js";
import {pixel,pixelAsset,secondPixel,secondAsset,ReviewFixtureImage} from "./fixtures/review-assets/pixels.mjs";
const originals=new Map(["indexedDB","Image","navigator"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
test.beforeEach(()=>{for(const [key,value]of Object.entries({indexedDB:new IDBFactory(),Image:ReviewFixtureImage,navigator:{locks:{request:(_name,run)=>Promise.resolve().then(run)}}}))Object.defineProperty(globalThis,key,{value,configurable:true});});
test.afterEach(()=>{for(const [key,value]of originals)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
const blob=value=>new Blob([value],{type:"image/png"});
test("live asset-owner admission is synchronous and performs no I/O, write or notification",async()=>{
 let notices=0;const source=await RichAssetStore.open("live-owner",{onChange(){notices++;}});try{await source.ingest(blob(pixel));const before=new Uint8Array(await(await source.exportBackup()).arrayBuffer()),count=notices,transaction=IDBDatabase.prototype.transaction;try{IDBDatabase.prototype.transaction=function(){throw Error("Unexpected admission I/O");};for(let i=0;i<3;i++)assert.equal(source.checkOpen(),undefined);assert.throws(()=>RichAssetStore.prototype.checkOpen.call({}));}finally{IDBDatabase.prototype.transaction=transaction;}assert.equal(notices,count);assert.deepEqual(new Uint8Array(await(await source.exportBackup()).arrayBuffer()),before);}finally{source.close();}assert.throws(()=>source.checkOpen(),/Asset store is closed/);
});
test("live asset-owner admission refuses a genuine database version-change retirement",async()=>{
 const source=await RichAssetStore.open("upgraded-live-owner");try{await source.ingest(blob(pixel));const db=await new Promise((resolve,reject)=>{const request=indexedDB.open("upgraded-live-owner",2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{assert.equal(db.version,2);assert.throws(()=>source.checkOpen(),/Asset store is closed/);await assert.rejects(source.list(),/Asset store is closed/);const count=await new Promise((resolve,reject)=>{const tx=db.transaction("assets","readonly"),request=tx.objectStore("assets").count();tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);});assert.equal(count,1);}finally{db.close();}}finally{source.close();}
});
test("source callback executes in an active asset snapshot and a queued write cannot split its cut",async()=>{
 const source=await RichAssetStore.open("source");let tx,queued,archive,restored;const cursor=IDBObjectStore.prototype.openCursor;
 try{await source.ingest(blob(pixel));IDBObjectStore.prototype.openCursor=function(...args){if(this.name==="assets")tx=this.transaction;return cursor.apply(this,args);};
  let calls=0;const cut=Object.freeze({native:"checkpoint before upload cancellation"});const result=await source.captureBackup(()=>{calls++;assert.equal(tx.mode,"readonly");assert.doesNotThrow(()=>tx.objectStore("metadata").get("bytes"));queued=source.cancel(pixelAsset);return cut;});
  IDBObjectStore.prototype.openCursor=cursor;assert.equal(calls,1);assert.equal(result.source,cut);assert.ok(Object.isFrozen(result));await queued;
  archive=await readRichAssetBackup(result.backup);assert.equal(archive.entries()[0].status,"pending");assert.equal(archive.entries()[0].epoch,0);assert.equal((await source.get(pixelAsset)).status,"cancelled");
  restored=await RichAssetStore.restoreBackup("restored",archive.backup(),{uploadState:"preserve"});assert.equal((await restored.get(pixelAsset)).status,"pending");assert.deepEqual(new Uint8Array(await(await restored.blob(pixelAsset)).arrayBuffer()),new Uint8Array(pixel));
 }finally{IDBObjectStore.prototype.openCursor=cursor;archive?.dispose();source.close();restored?.close();}
});
test("snapshot validates complete records and counter before invoking source code",async()=>{
 const source=await RichAssetStore.open("source");try{await source.ingest(blob(pixel));const db=await openDatabase("source");try{await new Promise((resolve,reject)=>{const tx=db.transaction("metadata","readwrite");tx.objectStore("metadata").put(0,"bytes");tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}let called=0;await assert.rejects(source.captureBackup(()=>{called++;}),e=>e.code==="asset_backup_storage");assert.equal(called,0);assert.equal((await source.get(pixelAsset)).status,"pending");}finally{source.close();}
});
test("throwing async and then-getter source callbacks refuse without leaking private text or writing assets",async()=>{
 const source=await RichAssetStore.open("source");try{await source.ingest(blob(pixel));for(const callback of [()=>{throw Error("PRIVATE-CAPTURE");},async()=>{throw Error("PRIVATE-ASYNC");},()=>({get then(){throw Error("PRIVATE-GETTER");}})])await assert.rejects(source.captureBackup(callback),e=>e.code==="asset_backup_source"&&!String(e).includes("PRIVATE"));await new Promise(resolve=>setImmediate(resolve));assert.equal((await source.get(pixelAsset)).status,"pending");assert.equal((await source.list()).length,1);}finally{source.close();}
});
test("cancellation before or within the synchronous cut exposes no ready result and leaves original uploads intact",async()=>{
 const source=await RichAssetStore.open("source");try{await source.ingest(blob(pixel));for(const phase of ["before","callback"]){const abort=new AbortController();if(phase==="before")abort.abort();let called=0;await assert.rejects(source.captureBackup(()=>{called++;abort.abort();return"captured";},{signal:abort.signal}),e=>e.code==="asset_backup_aborted");assert.equal(called,phase==="before"?0:1);assert.equal((await source.get(pixelAsset)).status,"pending");}}finally{source.close();}
});
test("pure archive reader keeps all upload epochs opaque receipts and immutable payloads without a destination",async()=>{
 const source=await RichAssetStore.open("source");let archive;try{await source.ingest(blob(pixel));await source.ingest(blob(secondPixel));await source.flush(async info=>{if(info.asset===pixelAsset)return"opaque-\ud800-receipt";throw Error("offline");});await source.cancel(secondAsset);const file=await source.exportBackup(),before=await indexedDB.databases();archive=await readRichAssetBackup(file);
  assert.deepEqual(await indexedDB.databases(),before);const entries=archive.entries();assert.ok(Object.isFrozen(entries)&&entries.every(Object.isFrozen));assert.equal(entries.find(e=>e.asset===pixelAsset).storageRef,"opaque-\ud800-receipt");assert.equal(entries.find(e=>e.asset===secondAsset).epoch,1);assert.equal(entries.find(e=>e.asset===secondAsset).status,"cancelled");assert.equal(archive.blob("missing"),undefined);
  assert.deepEqual(new Uint8Array(await archive.backup().arrayBuffer()),new Uint8Array(await file.arrayBuffer()));assert.throws(()=>{entries[0].epoch=100;});assert.throws(()=>RichAssetArchive.prototype.blob.call({...archive},pixelAsset),e=>e.code==="asset_backup_closed");archive.dispose();assert.equal(archive.entries(),entries);assert.throws(()=>archive.backup(),e=>e.code==="asset_backup_closed");
 }finally{archive?.dispose();source.close();}
});
