/** Actual native source continuity for catalog startup/live/awaited writes; IDB/locks are fixtures. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {IDBFactory} from "fake-indexeddb";
import {SharedRichEditor} from "../packages/breditor-collaboration/dist/core.js";
import {VersionCatalogStore} from "../packages/breditor-collaboration/dist/versions/store.js";
import {openCatalogDatabase,readCatalogRecord} from "../packages/breditor-collaboration/dist/versions/database.js";
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export async function probeVersionSourceOwnership(directory){
 const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 const originals=new Map(),held=new Set();for(const [name,value]of Object.entries({indexedDB:new IDBFactory(),navigator:{locks:{request(name,_options,run){return Promise.resolve().then(async()=>{if(held.has(name))return run(null);held.add(name);try{return await run({name});}finally{held.delete(name);}});}}}})){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true});}
 const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/version-source",version:1},extensions:[]})),binding=JSON.parse(profile.descriptor_json()),root=JSON.parse(readFileSync(new URL("../crates/breditor-core/tests/fixtures/rich-local-root.json",import.meta.url),"utf8")),seed=JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)});let a,b,store;
 try{
  a=new SharedRichEditor(profile.create(seed,"101"));b=new SharedRichEditor(profile.join_frame("room","202",a.updateFrame()));let journal=a.checkpointJson();const storage={core:a,save(){journal=a.checkpointJson();},async flush(){}};
  store=await VersionCatalogStore.open({database:"version-source-live",identity:{endpoint:"ws://127.0.0.1:1",principal:"alice",room:"room",binding:"a".repeat(64),documentWriter:"101"},storage,getToken:()=>"unused",autoConnect:false});
  b.dispatch({commands:[{kind:"replace_image",data:{block:"image-block",asset:"foreign-source",generation:"foreign-generation"}}]});storage.core=b;let failure,accepted;
  try{accepted=store.saveVersion("Must stay on the original owner","0");await store.flush();}catch(error){failure=error;}
  if(accepted){const packet=store.packet(accepted.id),recovered=new SharedRichEditor(profile.restore("room",journal));try{console.log(JSON.stringify({reproduced:true,acceptedForeignSource:true,savedDocumentWriter:"101",sourceProofAfterExactReopen:recovered.verifyVersionSource(packet).kind,retainedCatalogEntries:store.exportRecovery().packets.length}));}finally{recovered.dispose();}}
  assert.equal(failure?.code,"version_source_replaced","A version catalog accepted a replacement core while saving the original owner's journal");
  // Raw old recovery bytes must remain exportable even after source continuity fails.
  assert.equal(store.exportRecovery().packets.length,0);
  storage.core=a;await store.close();store=undefined;assert.equal(held.size,0);
  const identity={endpoint:"ws://127.0.0.1:1",principal:"alice",room:"room",binding:"a".repeat(64),documentWriter:"101"},startupStorage={core:a,save(){},async flush(){}},startup={database:"version-source-startup",identity,storage:startupStorage,getToken:()=>"unused",autoConnect:false};
  const opening=VersionCatalogStore.open(startup);startupStorage.core=b;await assert.rejects(opening,e=>e.code==="version_source_replaced");assert.equal(held.size,0);assert.equal((await indexedDB.databases()).some(db=>db.name===startup.database),false);startupStorage.core=a;store=await VersionCatalogStore.open(startup);assert.ok(Object.isFrozen(store.options)&&Object.isFrozen(store.options.identity)&&Object.isFrozen(store.options.storage));await store.close();store=undefined;
  let hold=false,enter,release;const entered=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;}),awaitedStorage={core:a,save(){journal=a.checkpointJson();},async flush(){if(hold){enter();await gate;}}},awaited={database:"version-source-awaited",identity,storage:awaitedStorage,getToken:()=>"unused",autoConnect:false};
  store=await VersionCatalogStore.open(awaited);hold=true;const pending=store.saveVersion("Retain the failed-save intent","1"),work=store.flush();await entered;awaitedStorage.core=b;release();await assert.rejects(work,e=>e.code==="version_source_replaced");const recovery=store.exportRecovery();assert.equal(recovery.packets.length,1);assert.equal(store.state().failed,true);
  const db=await openCatalogDatabase(awaited.database);try{assert.equal((await readCatalogRecord(db,store.options.identity)).packets.length,0);}finally{db.close();}
  awaitedStorage.core=a;hold=false;await store.retry();assert.deepEqual(store.exportRecovery(),recovery);assert.equal(store.versionStatus(pending.id).localSaved,true);await store.close();store=undefined;assert.equal(held.size,0);
  return{format:"breditor/version-source-ownership-probe",formatVersion:1,passed:true,liveSourceRefusals:1,startupSourceRefusals:1,awaitedSourceRefusals:1,failedSaveRowsRetained:1,exactRetryRows:1,immutableConfiguration:true,heldLeases:held.size,scope:"Actual Wasm/catalog continuity before startup publication, before live capture and across awaited native saves. The failed intent remains exportable, no catalog row is committed under the swapped source, exact retry preserves it and every lease is released. Storage/lock scheduling are fixtures; no server, crash, cross-device fencing or V1 approval."};
 }finally{await store?.discardAndClose();a?.dispose();b?.dispose();profile.free();for(const [name,value]of originals)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error("Expected actual shared runtime directory");console.log(JSON.stringify(await probeVersionSourceOwnership(process.argv[2]),null,2));}
