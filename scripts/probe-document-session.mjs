/** Actual shared release Wasm + compiled persistence; IndexedDB/Web Locks are explicit test fixtures. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {IDBFactory,IDBDatabase} from "fake-indexeddb";
import {SharedRichEditor,createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {SharedPersistentSession} from "../packages/breditor-collaboration/dist/persistence/shared_session.js";
import {restoreSharedDocumentEditor,restoreSharedGeneralEditor,restoreSharedTypingEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {openSessionDatabase,readSessionCheckpoint,readDocumentSessionCheckpoint} from "../packages/breditor-collaboration/dist/persistence/session_database.js";
import {coverageSeed,paragraph,range} from "./fixtures/editor-consumer/coverage-seed.mjs";
function locksFixture(){const held=new Set();return {held,request(name,options,callback){assert.deepEqual(options,{mode:"exclusive",ifAvailable:true});const occupied=held.has(name);if(!occupied)held.add(name);return Promise.resolve().then(()=>callback(occupied?null:{name,mode:"exclusive"})).finally(()=>{if(!occupied)held.delete(name);});}};}
function simpleSeed(binding){return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("a","a seed 🙂"),paragraph("b","b seed"),paragraph("c","c seed")]}});}
function abortWrites(){const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(args[1]==="readwrite")queueMicrotask(()=>tx.abort());return tx;};return ()=>{IDBDatabase.prototype.transaction=original;};}
export async function probeDocumentSession(directory){
 const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),module=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await module.default({module_or_path:bytes});
 const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,"navigator"),oldDb=Object.getOwnPropertyDescriptor(globalThis,"indexedDB"),locks=locksFixture();Object.defineProperty(globalThis,"navigator",{value:{locks},configurable:true});Object.defineProperty(globalThis,"indexedDB",{value:new IDBFactory(),configurable:true});
 const cases=[];for(const language of [1,2,3])for(const natural of [false,true])cases.push({language,natural,kind:"simple"});for(const kind of ["mixed","hidden","general-upgrade"])for(const natural of [false,true])cases.push({language:3,natural,kind});
 let trials=0,exactRestores=0,future=0,failedUpgrades=0,failedCloseRetries=0,blockedClones=0,oldFactoryRefusals=0,pureCopies=0,queuedRemotes=0,legacyRestores=0,documentRestores=0;
 try{
  for(const trial of cases){
   const {language,natural,kind}=trial,history=natural?"typing-v1":"explicit",profile=module.SharedRichProfile[`from_standard_configuration_json_v${language}`](JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema:{name:"example/document-session",version:language},extensions:[]}));
   const database=`document-session-${trials}`,binding=JSON.parse(profile.descriptor_json());let source=kind==="mixed"||kind==="hidden"?coverageSeed(binding):simpleSeed(binding);
   if(kind==="hidden"){const v=JSON.parse(source);v.root.children=v.root.children.filter(n=>n.properties["breditor/block-id"]==="hidden");source=JSON.stringify(v);}
   const restore=(json,h,r)=>{legacyRestores++;return r==="general-v1"?restoreSharedGeneralEditor(profile,"room",json,h):h==="typing-v1"?restoreSharedTypingEditor(profile,"room",json):profile.restore("room",json);};
   const restoreDocument=(json,h)=>{documentRestores++;return restoreSharedDocumentEditor(profile,"room",json,h);};
   const options={database,room:"room",writer:"303",richLanguage:language,history,create:()=>profile.create(source,"303"),restore,restoreDocument};
   let session,reopened,comparison,peer,db;
   try{
    session=await SharedPersistentSession.open({...options,history:"explicit",...(kind==="general-upgrade"?{rangeEditing:"general-v1"}:{})});
    if(kind!=="hidden"){session.core.select(range(kind==="mixed"?"q2":"c",1));session.core.type("legacy");session.core.undo();}
    const before=session.core.documentJson(),undoDepth=session.core.view().undoDepth,redoDepth=session.core.view().redoDepth;await session.flush();await session.close();session=undefined;
    db=await openSessionDatabase(database);const previous=await readSessionCheckpoint(db,["room","303"]);
    if(kind==="simple"){
     const recoverWrites=abortWrites();try{await assert.rejects(SharedPersistentSession.openDocument(options));}finally{recoverWrites();}
     assert.deepEqual(await readSessionCheckpoint(db,["room","303"]),previous);assert.equal(locks.held.size,0);failedUpgrades++;
    }
    session=await SharedPersistentSession.openDocument(options);assert.equal(session.recovered,true);assert.equal(session.core.selectionPolicy(),"document-v1");assert.equal(session.core.view().rangeEditing,"general-v1");assert.equal(session.core.documentJson(),before);assert.equal(session.core.view().undoDepth,undoDepth);assert.equal(session.core.view().redoDepth,redoDepth);
    await assert.rejects(SharedPersistentSession.openDocument({...options,database:`${database}-clone`}),/already active/);blockedClones++;
    session.core.selectDocument();await session.flush();const selected=session.core.checkpointJson(),copy=session.core.copyDocument();assert.ok(copy);assert.equal(JSON.parse(copy.richJson).kind,"flow");if(kind==="hidden")assert.equal(copy.plainText,"");assert.equal(session.core.checkpointJson(),selected);pureCopies++;
    // Live remotes arriving during document scope retain scope, and are observed by the following replacement.
    peer=new SharedRichEditor(profile.join_frame("room","404",session.core.updateFrame()));peer.dispatch({commands:[{kind:"insert_blocks",data:{parent:null,before:null,nodes:[paragraph("peer-root","PEER")]}}]});const release=session.core.holdRemotes(),pending=session.core.receiveFrame(peer.updateFrame());assert.equal(session.core.pendingRemote().frames,1);release();await pending;assert.deepEqual(session.core.view().selection,{kind:"document"});queuedRemotes++;
    const observed=session.core.documentJson();
    if(natural){session.core.replaceDocumentTypingText("whole","Q","9007199254740993");session.core.typeUser("🙂","9007199254741043");}else session.core.replaceDocumentPlainText("whole","Q");
    assert.equal(session.core.view().undoDepth,undoDepth+1);assert.equal(session.core.undo(),true);assert.equal(session.core.documentJson(),observed);assert.deepEqual(session.core.view().selection,{kind:"document"});session.core.redo();await session.flush();
    if(kind==="simple"){
     const durable=await readDocumentSessionCheckpoint(db,["room","303"]),recoverWrites=abortWrites();let exact;
     try{session.core.undo();exact=session.core.checkpointJson();await assert.rejects(session.close());assert.equal(session.core.checkpointJson(),exact);assert.throws(()=>session.core.selectDocument(),/retired/);await assert.rejects(SharedPersistentSession.openDocument({...options,database:`${database}-failed-close-clone`}),/already active/);blockedClones++;assert.deepEqual(await readDocumentSessionCheckpoint(db,["room","303"]),durable);}finally{recoverWrites();}
     await session.close();session=undefined;assert.equal((await readDocumentSessionCheckpoint(db,["room","303"])).json,exact);session=await SharedPersistentSession.openDocument(options);assert.equal(session.core.checkpointJson(),exact);exactRestores++;session.core.redo();failedCloseRetries++;
    }
    await session.flush();const exact=session.core.checkpointJson();await session.close();session=undefined;const stored=await readDocumentSessionCheckpoint(db,["room","303"]);assert.deepEqual(stored,{json:exact,history,rangeEditing:"general-v1",selectionEditing:"document-v1",richLanguage:language});
    await assert.rejects(SharedPersistentSession.open({...options,rangeEditing:"general-v1"}),/Unknown stored/);oldFactoryRefusals++;assert.deepEqual(await readDocumentSessionCheckpoint(db,["room","303"]),stored);
    if(natural){await assert.rejects(SharedPersistentSession.openDocument({...options,history:"explicit"}),/requires explicit typing-v1/);oldFactoryRefusals++;}
    reopened=await SharedPersistentSession.openDocument(options);assert.equal(reopened.core.checkpointJson(),exact);exactRestores++;comparison=createSharedDocumentEditor(restoreSharedDocumentEditor(profile,"room",exact,history));
    for(const command of ["undo","redo","undo","redo"]){assert.equal(reopened.core[command](),comparison[command]());assert.equal(reopened.core.checkpointJson(),comparison.checkpointJson());future++;}
    await reopened.flush();await reopened.close();reopened=undefined;comparison.dispose();comparison=undefined;assert.equal(locks.held.size,0);trials++;
   }catch(error){throw new Error(`Document storage case ${trials}: ${kind}, language ${language}, ${history}`,{cause:error});}
   finally{comparison?.dispose();peer?.dispose();await reopened?.discardAndClose();await session?.discardAndClose();db?.close();profile.free();}
  }
  assert.equal(trials,12);assert.equal(exactRestores,18);assert.equal(future,48);assert.equal(failedUpgrades,6);assert.equal(failedCloseRetries,6);assert.equal(blockedClones,18);assert.equal(oldFactoryRefusals,18);assert.equal(pureCopies,12);assert.equal(queuedRemotes,12);assert.equal(locks.held.size,0);
  return {format:"breditor/document-session-functional-probe",formatVersion:1,sharedWasmSha256:createHash("sha256").update(bytes).digest("hex"),trials,exactRestores,exactFutureCheckpoints:future,failedUpgrades,failedCloseRetries,blockedClones,oldFactoryRefusals,pureCopies,queuedRemotePublications:queuedRemotes,legacyRestoreCalls:legacyRestores,documentRestoreCalls:documentRestores,passed:true,scope:"Actual release shared Wasm with compiled source document persistence: original/general upgrades, three languages, both histories, mixed/hidden-only documents, exact restart, queued peers, aborted upgrades and failed-close retention/retry. IndexedDB and exclusive-lock API fixtures; not installed/browser storage or Web Locks qualification. Local SDK/DOM/React/rich whole-document paste remain incomplete."};
 }finally{if(oldNavigator)Object.defineProperty(globalThis,"navigator",oldNavigator);else delete globalThis.navigator;if(oldDb)Object.defineProperty(globalThis,"indexedDB",oldDb);else delete globalThis.indexedDB;}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==1)throw Error("Expected shared release Wasm directory");console.log(JSON.stringify(await probeDocumentSession(args[0]),null,2));}
