/** Real Wasm owners + synthetic IndexedDB/Web Locks. Tests paired storage, not physical browser APIs. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {IDBFactory,IDBDatabase} from "fake-indexeddb";
import {SharedReviewPersistentSession} from "../packages/breditor-collaboration/dist/persistence/review_session.js";
import {SharedPersistentSession} from "../packages/breditor-collaboration/dist/persistence/shared_session.js";
import {openSessionDatabase,readCheckpoint,writeCheckpoint} from "../packages/breditor-collaboration/dist/persistence/session_database.js";
import {readReviewRecord,writeReviewRecord} from "../packages/breditor-collaboration/dist/persistence/review_database.js";
import {ReviewWriterLease} from "../packages/breditor-collaboration/dist/persistence/review_writer_lease.js";
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const principal={actor:"paired-alice",principal:"alice",access:"comment"};
function locks(){const held=new Set();return {held,request(name,_options,callback){return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};}
export async function probeReviewPersistenceSdk(directory){
 const originalIndexed=Object.getOwnPropertyDescriptor(globalThis,"indexedDB"),originalNavigator=Object.getOwnPropertyDescriptor(globalThis,"navigator");
 const lockHost=locks();Object.defineProperty(globalThis,"indexedDB",{value:new IDBFactory(),configurable:true});Object.defineProperty(globalThis,"navigator",{value:{locks:lockHost},configurable:true});
 const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/review-persistence-sdk",version:1},extensions:[]}));
 const descriptor=JSON.parse(profile.descriptor_json()),root=canonical(JSON.parse(readFileSync(new URL("../crates/breditor-core/tests/fixtures/rich-local-root.json",import.meta.url),"utf8")));
 const seed=JSON.stringify({format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root});
 let trials=0,pairedRestores=0,retainedVersions=0,atomicAbortChecks=0,leaseChecks=0,corruptRecoveriesRejected=0;
 const key=["room","101"];
 const txOriginal=IDBDatabase.prototype.transaction;let abortWrites=false;
 try{
  for(const document of [false,true])for(const natural of [false,true]){
   const database=`paired-${document}-${natural}`,errors=[];
   const options={database,room:"room",writer:"101",review:principal,richLanguage:3,history:natural?"typing-v1":"explicit",rangeEditing:document?"general-v1":"original",selectionEditing:document?"document-v1":"original",create:()=>profile.create(seed,"101"),restore:(saved,p)=>document?(p.history==="typing-v1"?profile.restore_document_typing("room",saved):profile.restore_document("room",saved)):(p.history==="typing-v1"?profile.restore_typing("room",saved):profile.restore("room",saved)),onError:e=>errors.push(e)};
   let session=await SharedReviewPersistentSession.open(options);let db;
   try{
    assert.equal(session.recovered,false);db=await openSessionDatabase(database);
    await assert.rejects(SharedReviewPersistentSession.open({...options,database:`${database}-other`}),/already active/);leaseChecks++;
    await assert.rejects(ReviewWriterLease.acquire("room",principal.actor),/already active/);leaseChecks++;
    const packet=session.core.captureReviewAnchor({kind:"selection",selection:{kind:"node",block:"image-block"}});
    const created=session.core.dispatchReview({kind:"create_thread",data:{anchorJson:packet,body:"Durable initial comment"}});assert.equal(created.kind,"committed");
    session.core.select({kind:"text",anchor:{block:"p",offset:"0",affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}});
    if(natural){session.core.typeUser("A","1");session.core.typeUser("🙂","2");}else session.core.type("A🙂");
    const version=session.saveVersion("Durable named version","1792200000000");await session.flush();retainedVersions++;
    const stored=await readReviewRecord(db,key);assert.equal(stored.documentCheckpointJson,session.core.checkpointJson());assert.equal(stored.reviewCheckpointJson,session.core.reviewCheckpoint());assert.equal(stored.versions[0],session.versionPacket(version.id));
    await assert.rejects(SharedPersistentSession.open({database,room:"room",writer:"202",create:()=>{throw Error("wrong reader must not create");},restore:()=>{throw Error("wrong reader must not restore");}}),/wrong reader must not create/); // A different key remains distinct.
    const doc=session.core.checkpointJson(),review=session.core.reviewCheckpoint(),versionPacket=session.versionPacket(version.id);await session.close();assert.equal(session.state().status,"closed");
    session=await SharedReviewPersistentSession.open(options);assert.equal(session.recovered,true);pairedRestores++;
    assert.equal(session.core.checkpointJson(),doc);assert.equal(session.core.reviewCheckpoint(),review);assert.equal(session.versionPacket(version.id),versionPacket);
    session.core.undoReview();session.core.undo();await session.flush();
    const undone=[session.core.checkpointJson(),session.core.reviewCheckpoint()];await session.close();session=await SharedReviewPersistentSession.open(options);pairedRestores++;
    assert.deepEqual([session.core.checkpointJson(),session.core.reviewCheckpoint()],undone);session.core.redo();session.core.redoReview();assert.equal(session.core.reviewSnapshot().view.threads[0].thread.messages[0].versions[0].text,"Durable initial comment");await session.flush();
    const before=await readReviewRecord(db,key);
    IDBDatabase.prototype.transaction=function(...args){const tx=txOriginal.apply(this,args);if(abortWrites&&args[1]==="readwrite")queueMicrotask(()=>{try{tx.abort();}catch{}});return tx;};abortWrites=true;
    session.core.dispatchReview({kind:"reply",data:{thread:created.event,body:"Retained after failed paired save"}});
    await assert.rejects(session.flush());assert.equal(session.state().status,"failed");assert.deepEqual(await readReviewRecord(db,key),before);atomicAbortChecks++;
    const readable=[session.core.checkpointJson(),session.core.reviewCheckpoint()];await assert.rejects(session.close());assert.deepEqual([session.core.checkpointJson(),session.core.reviewCheckpoint()],readable);
    const exported=session.exportRecovery();assert.deepEqual([exported.documentCheckpointJson,exported.reviewCheckpointJson],readable);assert.equal("access" in exported,false);assert.equal(exported.versions.length,1);
    await assert.rejects(ReviewWriterLease.acquire("room",principal.actor),/already active/);leaseChecks++;
    abortWrites=false;await session.close();session=await SharedReviewPersistentSession.open(options);pairedRestores++;
    assert.deepEqual([session.core.checkpointJson(),session.core.reviewCheckpoint()],readable);
    await session.close();
    await assert.rejects(SharedPersistentSession.open({...options,review:undefined,create:()=>{throw Error("no fallback");},restore:()=>{throw Error("no fallback");}}),/Unknown stored/);
    await assert.rejects(SharedReviewPersistentSession.open({...options,review:{...principal,principal:"other"},create:()=>{throw Error("no fallback");},restore:()=>{throw Error("no fallback");}}),/Stored review identity/);
    const exact=await readReviewRecord(db,key);
    for(const malformed of [{...exact,extra:true},{...exact,formatVersion:2},{...exact,versions:Array.from({length:33},()=>versionPacket)},{...exact,reviewActor:"other-writer"}])await assert.rejects(writeReviewRecord(db,key,malformed));
    assert.deepEqual(await readReviewRecord(db,key),exact);
    // Storage identity validation is not a substitute for Rust causal/history admission.
    const broken={...exact,reviewCheckpointJson:JSON.stringify({...JSON.parse(exact.reviewCheckpointJson),history:[],cursor:0})};await writeReviewRecord(db,key,broken);
    await assert.rejects(SharedReviewPersistentSession.open(options),/review history/);assert.deepEqual(await readReviewRecord(db,key),broken);corruptRecoveriesRejected++;
    await writeReviewRecord(db,key,exact);
    trials++;
   }finally{abortWrites=false;await session.discardAndClose();db?.close();}
  }
  const db=await openSessionDatabase("paired-no-implicit-upgrade");try{await writeCheckpoint(db,key,"legacy bytes must remain exact");let called=false;await assert.rejects(SharedReviewPersistentSession.open({database:"paired-no-implicit-upgrade",room:"room",writer:"101",review:principal,richLanguage:3,history:"explicit",rangeEditing:"original",selectionEditing:"original",create:()=>{called=true;return profile.create(seed,"101");},restore:()=>{called=true;return profile.create(seed,"101");}}),/explicitly paired/);assert.equal(called,false);assert.equal(await readCheckpoint(db,key),"legacy bytes must remain exact");}finally{db.close();}
  assert.equal(lockHost.held.size,0);assert.equal(trials,4);assert.equal(pairedRestores,12);assert.equal(retainedVersions,4);assert.equal(atomicAbortChecks,4);assert.equal(leaseChecks,12);assert.equal(corruptRecoveriesRejected,4);
  return {format:"breditor/review-persistence-sdk-probe",formatVersion:1,sharedWasmSha256:createHash("sha256").update(bytes).digest("hex"),trials,pairedRestores,retainedVersions,atomicAbortChecks,leaseChecks,corruptRecoveriesRejected,passed:true,scope:"Actual Wasm exact document/review owners with synthetic IndexedDB and Web Locks, both history and selection policies, local version catalog, aborted atomic pair retention, failed-close exports/leases, malformed records, native corruption rejection without fallback and explicit family/identity rejection. Native browser storage/locks, authenticated review relay, shared version catalog, UI and suggestions remain unqualified."};
 }finally{IDBDatabase.prototype.transaction=txOriginal;profile.free();if(originalIndexed)Object.defineProperty(globalThis,"indexedDB",originalIndexed);else delete globalThis.indexedDB;if(originalNavigator)Object.defineProperty(globalThis,"navigator",originalNavigator);else delete globalThis.navigator;}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error("Expected actual shared Wasm directory");console.log(JSON.stringify(await probeReviewPersistenceSdk(process.argv[2]),null,2));}
