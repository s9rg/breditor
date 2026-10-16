/** Actual release Wasm + source persistence. IndexedDB/Web Locks below are test doubles, not browser qualification. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {IDBFactory,IDBDatabase} from "fake-indexeddb";
import {SharedRichEditor} from "../packages/breditor-collaboration/dist/core.js";
import {SharedPersistentSession} from "../packages/breditor-collaboration/dist/persistence/shared_session.js";
import {restoreSharedGeneralEditor,restoreSharedTypingEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {openSessionDatabase,readSessionCheckpoint,writeSessionCheckpoint} from "../packages/breditor-collaboration/dist/persistence/session_database.js";
const point=(block,offset)=>({block,offset:String(offset),affinity:"after"});
const selection=(a,b=a)=>({kind:"text",anchor:a,focus:b});
const formats=[{type:"breditor/strong",properties:{}}];
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
function locksFixture(){
 const held=new Set();
 return {held,request(name,options,callback){assert.deepEqual(options,{mode:"exclusive",ifAvailable:true});const occupied=held.has(name);if(!occupied)held.add(name);return Promise.resolve().then(()=>callback(occupied?null:{name,mode:"exclusive"})).finally(()=>{if(!occupied)held.delete(name);});}};
}
function documentSeed(binding){return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:["a","b","c"].map(block=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":block},children:[{kind:"text",text:`${block} seed 🙂`,formats:[]}]}))}});}
async function replaceRecord(db,value){const tx=db.transaction("journals","readwrite");tx.objectStore("journals").put(value,["room","303"]);await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
export async function probeGeneralSession(vectorsPath,sharedDirectory){
 const bytes=readFileSync(resolve(sharedDirectory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(sharedDirectory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 const vectors=JSON.parse(readFileSync(vectorsPath,"utf8"));assert.equal(vectors.trials.length,12);
 const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,"navigator"),oldIndexedDb=Object.getOwnPropertyDescriptor(globalThis,"indexedDB"),locks=locksFixture();Object.defineProperty(globalThis,"navigator",{value:{locks},configurable:true});Object.defineProperty(globalThis,"indexedDB",{value:new IDBFactory(),configurable:true});
 const cases=[];for(const language of [1,2,3])for(const natural of [false,true])cases.push({language,natural,case:"simple-upgrade",backwards:false});for(const trial of vectors.trials)cases.push({...trial,language:3});
 let trials=0,exactRestores=0,exactFutures=0,failedCloseRetries=0,guardedReopens=0,forgedLanguageRejected=0,failedUpgrades=0;
 try{
  for(const trial of cases){
   const natural=trial.natural,history=natural?"typing-v1":"explicit",language=trial.language,configuration=trial.configuration??JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema:{name:"example/general-session-probe",version:language},extensions:[]}),profile=wasm.SharedRichProfile[`from_standard_configuration_json_v${language}`](configuration),database=`general-probe-${trials}`;
   let session,reopened,comparison,db;
   try{
    const restore=(json,storedHistory,storedRange)=>storedRange==="general-v1"?restoreSharedGeneralEditor(profile,"room",json,storedHistory):storedHistory==="typing-v1"?restoreSharedTypingEditor(profile,"room",json):profile.restore("room",json);
    const options={database,room:"room",writer:"303",richLanguage:language,history,create:()=>trial.initialFrame?profile.join_frame("room","303",trial.initialFrame):profile.create(documentSeed(JSON.parse(profile.descriptor_json())),"303"),restore};
    session=await SharedPersistentSession.open(options);const before=session.core.documentJson();
    // Preserve real legacy history, including a live Redo branch, across explicit upgrade.
    const actual=trial.initialFrame?selection(point("q2",2)):selection(point("c",2));session.core.select(actual);session.core.type("legacy");assert.equal(session.core.undo(),true);await session.flush();const legacy=session.core.checkpointJson(),oldUndo=session.core.view().undoDepth,oldRedo=session.core.view().redoDepth;await session.close();session=undefined;
    db=await openSessionDatabase(database);const legacyRecord=await readSessionCheckpoint(db,["room","303"]);assert.equal(legacyRecord.json,legacy);assert.equal(legacyRecord.rangeEditing,undefined);
    // Failed first upgrade must retain the exact legacy record and release the unannounced owner.
    if(trial.case==="simple-upgrade"){
     const transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(args[1]==="readwrite")queueMicrotask(()=>tx.abort());return tx;};
     try{await assert.rejects(SharedPersistentSession.open({...options,rangeEditing:"general-v1"}));}finally{IDBDatabase.prototype.transaction=transaction;}
     assert.deepEqual(await readSessionCheckpoint(db,["room","303"]),legacyRecord);assert.equal(locks.held.size,0);failedUpgrades++;
    }
    session=await SharedPersistentSession.open({...options,rangeEditing:"general-v1"});assert.equal(session.recovered,true);assert.equal(session.core.documentJson(),before);assert.equal(session.core.view().undoDepth,oldUndo);assert.equal(session.core.view().redoDepth,oldRedo);assert.equal(session.core.view().rangeEditing,"general-v1");
    const entry=trial.checkpoint?(()=>{const j=JSON.parse(trial.checkpoint);return(natural?j.journal.entries:j.entries).findLast(e=>e.kind==="general_range_v1");})():undefined,target=entry?{kind:"text",anchor:entry.action.range.anchor,focus:entry.action.range.focus}:selection(point("a",1),point("b",2));assert.ok(target);
    session.core.select(actual);session.core.setPendingFormats(formats);const prefix=`session-range-${trials}`;
    if(natural){session.core.replaceGeneralRangeTypingText(target,"Q🙂",prefix,"9007199254740993");session.core.typeUser("Y","9007199254741043");}else session.core.replaceGeneralRangePlainText(target,"Q🙂",prefix);
    const edited=session.core.documentJson();assert.notEqual(edited,before);assert.equal(session.core.undo(),true);assert.equal(session.core.documentJson(),before);assert.deepEqual(session.core.view().selection,actual);assert.deepEqual(JSON.parse(session.core.view().pendingFormatsJson),formats);assert.equal(session.core.redo(),true);assert.equal(session.core.documentJson(),edited);await session.flush();
    // Saving is a transaction, and a retired failed-close owner still retains readable exact history.
    if(trial.case==="simple-upgrade"){
     const durableBefore=await readSessionCheckpoint(db,["room","303"]),transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(args[1]==="readwrite")queueMicrotask(()=>tx.abort());return tx;};
     let exact;try{session.core.undo();exact=session.core.checkpointJson();await assert.rejects(session.close());assert.equal(session.core.checkpointJson(),exact);assert.throws(()=>session.core.replaceGeneralRangePlainText(target,"late",`${prefix}-late`),/retired/);await assert.rejects(SharedPersistentSession.open({...options,database:`${database}-clone`,rangeEditing:"general-v1"}),/already active/);assert.deepEqual(await readSessionCheckpoint(db,["room","303"]),durableBefore);}finally{IDBDatabase.prototype.transaction=transaction;}
     await session.close();session=undefined;assert.equal((await readSessionCheckpoint(db,["room","303"])).json,exact);session=await SharedPersistentSession.open({...options,rangeEditing:"general-v1"});assert.equal(session.core.checkpointJson(),exact);session.core.redo();failedCloseRetries++;
    }
    await session.flush();const exact=session.core.checkpointJson();await session.close();session=undefined;const saved=await readSessionCheckpoint(db,["room","303"]);assert.deepEqual(saved,{history,json:exact,rangeEditing:"general-v1",richLanguage:language});
    await assert.rejects(SharedPersistentSession.open(options),/explicit matching/);assert.deepEqual(await readSessionCheckpoint(db,["room","303"]),saved);guardedReopens++;
    if(natural){await assert.rejects(SharedPersistentSession.open({...options,history:"explicit",rangeEditing:"general-v1"}),/requires explicit typing-v1/);guardedReopens++;}
    reopened=await SharedPersistentSession.open({...options,rangeEditing:"general-v1"});assert.equal(reopened.core.checkpointJson(),exact);exactRestores++;comparison=new SharedRichEditor(restoreSharedGeneralEditor(profile,"room",exact,history));
    for(const kind of ["undo","redo","undo","redo"]){assert.equal(reopened.core[kind](),comparison[kind]());assert.equal(reopened.core.checkpointJson(),comparison.checkpointJson());exactFutures++;}await reopened.flush();await reopened.close();reopened=undefined;comparison.dispose();comparison=undefined;
    if(language===1&&!natural){
     const current=await readSessionCheckpoint(db,["room","303"]),forged={format:"breditor/shared-general-checkpoint-record",formatVersion:1,history,richLanguage:2,checkpointJson:current.json},other=wasm.SharedRichProfile.from_standard_configuration_json_v2(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:2,schema:{name:"example/general-session-probe",version:2},extensions:[]}));
     try{await replaceRecord(db,forged);await assert.rejects(SharedPersistentSession.open({...options,richLanguage:2,rangeEditing:"general-v1",restore:(json,h)=>restoreSharedGeneralEditor(other,"room",json,h)}));assert.deepEqual(await readSessionCheckpoint(db,["room","303"]),{json:current.json,history,richLanguage:2,rangeEditing:"general-v1"});assert.equal(locks.held.size,0);forgedLanguageRejected++;await writeSessionCheckpoint(db,["room","303"],current.json,history,"general-v1",1);}finally{other.free();}
    }
    trials++;
   }catch(error){throw new Error(`General durable case ${trials}: ${trial.case}, language ${language}, history ${history}, backwards ${trial.backwards}`,{cause:error});}
   finally{comparison?.dispose();await reopened?.discardAndClose();await session?.discardAndClose();db?.close();profile.free();}
  }
  assert.equal(locks.held.size,0);assert.equal(trials,18);assert.equal(exactRestores,18);assert.equal(exactFutures,72);assert.equal(failedCloseRetries,6);assert.equal(failedUpgrades,6);assert.equal(forgedLanguageRejected,1);
  return {format:"breditor/general-session-source-probe",formatVersion:1,sharedWasmSha256:sha256(bytes),vectorsSha256:sha256(readFileSync(vectorsPath)),trials,exactRestores,exactFutureCheckpointComparisons:exactFutures,failedCloseRetries,failedUpgrades,guardedReopens,forgedLanguageRejected,passed:true,scope:"Actual release shared Wasm with compiled source persistence; three languages, both history families, forward/backward partial structures, legacy Redo upgrade, exact future history, aborted IndexedDB saves and native language admission. fake-indexeddb and deterministic exclusive-lock API fixture; not installed consumer, browser Web Locks/clipboard or relay V2 acceptance."};
 }finally{if(oldNavigator)Object.defineProperty(globalThis,"navigator",oldNavigator);else delete globalThis.navigator;if(oldIndexedDb)Object.defineProperty(globalThis,"indexedDB",oldIndexedDb);else delete globalThis.indexedDB;}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected semantic vectors and candidate shared Wasm directory");console.log(JSON.stringify(await probeGeneralSession(...args),null,2));}
