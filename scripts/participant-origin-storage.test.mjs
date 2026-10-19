import test from "node:test";
import assert from "node:assert/strict";
import {IDBFactory,IDBObjectStore,IDBVersionChangeEvent} from "fake-indexeddb";
import {existingSessionDatabase} from "../packages/breditor-collaboration/dist/participant_operation/existing_session.js";
import {ParticipantOrigin} from "../packages/breditor-collaboration/dist/participant_operation/origin.js";
const original=Object.getOwnPropertyDescriptor(globalThis,"indexedDB"),key=["room","101"];
test.beforeEach(()=>Object.defineProperty(globalThis,"indexedDB",{value:new IDBFactory(),configurable:true}));test.afterEach(()=>{if(original)Object.defineProperty(globalThis,"indexedDB",original);else delete globalThis.indexedDB;});
async function database(name,upgrade=()=>{},version=1){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>upgrade(r.result);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function put(db,value="checkpoint",at=key){await new Promise((resolve,reject)=>{const tx=db.transaction("journals","readwrite");tx.objectStore("journals").put(value,at);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
test("operational inspection never creates a missing database",async()=>{await assert.rejects(existingSessionDatabase("missing",key),e=>e.code==="recovery_origin_missing");assert.deepEqual(await indexedDB.databases(),[]);});
test("future or extra-store schemas are preserved and refused, not upgraded",async()=>{
 for(const [name,version,extra]of [["future",2,false],["extra",1,true]]){const db=await database(name,db=>{db.createObjectStore("journals");if(extra)db.createObjectStore("unrelated");},version);await put(db);db.close();await assert.rejects(existingSessionDatabase(name,key),e=>e.code==="recovery_origin_storage");const old=await database(name,undefined,version);assert.equal(old.version,version);assert.deepEqual([...old.objectStoreNames],extra?["journals","unrelated"]:["journals"]);old.close();}
});
test("indexed, inline-key or auto-key journals are not interpreted as the operational family",async()=>{
 for(const [name,options,index]of [["indexed",{},true],["inline",{keyPath:"id"},false],["auto",{autoIncrement:true},false]]){const db=await database(name,db=>{const s=db.createObjectStore("journals",options);if(index)s.createIndex("foreign","value");});db.close();await assert.rejects(existingSessionDatabase(name,key),e=>e.code==="recovery_origin_storage");}
});
test("empty, other-writer and ambiguous stores cannot initialize a new operational journal",async()=>{
 for(const name of ["empty","other","both"]){const db=await database(name,db=>db.createObjectStore("journals"));if(name!=="empty")await put(db,"other writer",["room","202"]);if(name==="both")await put(db);db.close();await assert.rejects(existingSessionDatabase(name,key),e=>e.code==="recovery_origin_missing");}
});
test("a single exact key is read without writes; the returned database remains usable",async()=>{
 const db=await database("current",db=>db.createObjectStore("journals"));await put(db);db.close();const methods=["put","add","delete","clear"],saved=new Map(methods.map(m=>[m,IDBObjectStore.prototype[m]]));let opened;
 try{for(const m of methods)IDBObjectStore.prototype[m]=function(){throw Error("Unexpected inspection write");};const retained=await existingSessionDatabase("current",key);opened=retained.db;retained.opening.assertCurrent();assert.equal(opened.version,1);await new Promise((resolve,reject)=>{const tx=opened.transaction("journals","readonly"),r=tx.objectStore("journals").get(key);tx.oncomplete=()=>{assert.equal(r.result,"checkpoint");resolve();};tx.onabort=()=>reject(tx.error);});}finally{opened?.close();for(const [m,method]of saved)IDBObjectStore.prototype[m]=method;}
});
test("version-change fencing starts before the preliminary asynchronous key inspection",async()=>{
 for(const code of ["session_open_versionchange","review_open_versionchange"]){const name=`fenced-${code}`,db=await database(name,db=>db.createObjectStore("journals"));await put(db);db.close();const count=IDBObjectStore.prototype.count;let fenced=false;
  try{IDBObjectStore.prototype.count=function(...args){if(this.transaction.db.name===name){const inspected=this.transaction.db;assert.equal(typeof inspected.onversionchange,"function");inspected.dispatchEvent(new IDBVersionChangeEvent("versionchange",{oldVersion:1,newVersion:2}));fenced=true;}return count.apply(this,args);};await assert.rejects(existingSessionDatabase(name,key,code),e=>e.code===code);assert.equal(fenced,true);}finally{IDBObjectStore.prototype.count=count;}
  const upgraded=await database(name,db=>db.createObjectStore("upgrade-marker"),2);assert.deepEqual([...upgraded.objectStoreNames],["journals","upgrade-marker"]);upgraded.close();
 }
});
test("detached objects and public JavaScript construction cannot manufacture a native origin",()=>{
 assert.throws(()=>new ParticipantOrigin({}, {},"document",undefined,()=>{}),e=>e.code==="recovery_origin");assert.throws(()=>ParticipantOrigin.prototype.verify.call({},{}),e=>e.code==="recovery_origin");assert.doesNotThrow(()=>ParticipantOrigin.prototype.dispose.call({}));
});
