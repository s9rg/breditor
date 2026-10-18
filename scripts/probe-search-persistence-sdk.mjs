/** Actual application Wasm with synthetic IndexedDB/Web Locks; no native-storage qualification. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {IDBFactory,IDBDatabase} from "fake-indexeddb";
import {SharedPersistentSession} from "../packages/breditor-collaboration/dist/persistence/shared_session.js";
import {SharedReviewPersistentSession} from "../packages/breditor-collaboration/dist/persistence/review_session.js";
import {SharedRichEditor,createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {openSessionDatabase,readCheckpoint,writeCheckpoint} from "../packages/breditor-collaboration/dist/persistence/session_database.js";
import {readSearchRecord,writeSearchRecord} from "../packages/breditor-collaboration/dist/persistence/search_database.js";
import {readSearchReviewRecord,writeSearchReviewRecord} from "../packages/breditor-collaboration/dist/persistence/search_review_database.js";
import {checkSourceCheckpoint} from "../packages/breditor-collaboration/dist/persistence/source_checkpoint.js";
import {paragraph} from "./fixtures/editor-consumer/coverage-seed.mjs";
const key=["room","101"],query={pattern:"(?P<word>cat)",mode:"regex",caseSensitive:true,wholeWords:false},replacement={text:"${word}!",mode:"captures"};
const review={actor:"search-alice",principal:"alice",access:"comment"},identity={binding:"a".repeat(64),principal:"alice",effectWriter:"303"};
function locks(){const held=new Set();return{held,request(name,options,callback){assert.deepEqual(options,{mode:"exclusive",ifAvailable:true});return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};}
function seed(binding){return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("body","cat🙂cat")]}});}
/** Isolated counterfactual owner for exact history comparison only; never leased or transported. */
function reference(profile,checkpoint,policy,reviewedHistory){const options={searchHistory:"search-v1",...(reviewedHistory?{reviewedHistory}:{})};return policy.selectionEditing==="document-v1"?createSharedDocumentEditor(profile.restore_search("room",checkpoint),options):new SharedRichEditor(profile.restore_search("room",checkpoint),options);}
export async function probeSearchPersistenceSdk(directory){
 const savedGlobals=new Map(["indexedDB","navigator"].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),host=locks();
 Object.defineProperty(globalThis,"indexedDB",{value:new IDBFactory(),configurable:true});Object.defineProperty(globalThis,"navigator",{value:{locks:host},configurable:true});
 const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 let documentCases=0,pairedCases=0,exactRestores=0,exactFutureCheckpoints=0,atomicAborts=0,leaseChecks=0,oldReaderRefusals=0,corruptRecoveryRefusals=0,retainedVersions=0,relayBindings=0;
 const originalTransaction=IDBDatabase.prototype.transaction;let abortWrites=false;
 IDBDatabase.prototype.transaction=function(...args){const tx=originalTransaction.apply(this,args);if(abortWrites&&args[1]==="readwrite")queueMicrotask(()=>{try{tx.abort();}catch{}});return tx;};
 try{
  for(const language of [1,2,3]){
   const method=["from_standard_configuration_json_v1","from_standard_configuration_json_v2","from_standard_configuration_json_v3"][language-1],profile=wasm.SharedRichProfile[method](JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema:{name:`example/search-persistence-${language}`,version:1},extensions:[]})),source=seed(JSON.parse(profile.descriptor_json()));
   try{for(const scope of ["original","general-v1","document-v1"])for(const natural of [false,true]){
    const database=`search-${language}-${scope}-${natural}`,policy={richLanguage:language,history:natural?"typing-v1":"explicit",rangeEditing:scope==="original"?"original":"general-v1",selectionEditing:scope==="document-v1"?"document-v1":"original"},options={database,room:"room",writer:"101",...policy,create:()=>profile.create(source,"101"),restoreSearch:saved=>profile.restore_search("room",saved),onError:()=>{}};
    let session=await SharedPersistentSession.openSearch(options),db;
    try{
     assert.equal(session.recovered,false);await assert.rejects(SharedPersistentSession.openSearch({...options,database:`${database}-other`}),/already active/);leaseChecks++;
     const before=session.core.documentJson(),r=session.core.findText(query);session.core.replaceSearchAll(r,replacement);r.dispose();assert.equal(session.core.view().undoDepth,1);checkSourceCheckpoint(session.core,...key);await session.flush();
     db=await openSessionDatabase(database);const exact=session.core.checkpointJson(),record=await readSearchRecord(db,key);assert.equal(record.checkpointJson,exact);await session.close();
     let restored=false;await assert.rejects(SharedPersistentSession.open({...options,create:()=>{restored=true;throw Error("no fallback");},restore:()=>{restored=true;throw Error("no fallback");}}),/Unknown stored/);assert.equal(restored,false);assert.deepEqual(await readSearchRecord(db,key),record);oldReaderRefusals++;
     await assert.rejects(SharedPersistentSession.openSearch({...options,history:natural?"explicit":"typing-v1",restoreSearch:()=>{restored=true;throw Error("no fallback");}}),/Stored search policy/);assert.equal(restored,false);
     const twin=reference(profile,exact,policy);let future;try{twin.undo();twin.redo();future=twin.checkpointJson();}finally{twin.dispose();}
     session=await SharedPersistentSession.openSearch(options);assert.equal(session.recovered,true);assert.equal(session.core.checkpointJson(),exact);exactRestores++;session.core.undo();assert.equal(session.core.documentJson(),before);await session.flush();const undone=session.core.checkpointJson();await session.close();session=await SharedPersistentSession.openSearch(options);assert.equal(session.core.checkpointJson(),undone);exactRestores++;session.core.redo();assert.equal(session.core.checkpointJson(),future);exactFutureCheckpoints++;await session.flush();
     const stable=await readSearchRecord(db,key);for(const patch of [{extra:true},{formatVersion:2},{selectionEditing:"future"},{history:"future"},{richLanguage:0},{checkpointJson:JSON.stringify({...JSON.parse(exact),scope:scope==="document-v1"?"original":"document-v1"})}])await assert.rejects(writeSearchRecord(db,key,{...stable,...patch}));assert.deepEqual(await readSearchRecord(db,key),stable);
     // Admission must not confuse a valid storage header with valid native history.
     await session.close();const broken=structuredClone(stable),journal=JSON.parse(broken.checkpointJson);journal.journal.entries[0].action.sourceDigest="0".repeat(64);broken.checkpointJson=JSON.stringify(journal);await writeSearchRecord(db,key,broken);await assert.rejects(SharedPersistentSession.openSearch(options));assert.deepEqual(await readSearchRecord(db,key),broken);corruptRecoveryRefusals++;await writeSearchRecord(db,key,stable);
     session=await SharedPersistentSession.openSearch(options);
     if(language===3&&natural&&scope==="document-v1"){
      const durable=await readSearchRecord(db,key);abortWrites=true;session.core.selectSearchMatch(session.core.findText({...query,pattern:"cat!",mode:"literal"}),"0");await assert.rejects(session.flush());await assert.rejects(session.close());assert.equal(session.state().status,"failed");assert.ok(session.core.checkpointJson());assert.deepEqual(await readSearchRecord(db,key),durable);await assert.rejects(SharedPersistentSession.openSearch({...options,database:`${database}-conflict`}),/already active/);leaseChecks++;atomicAborts++;abortWrites=false;await session.close();session=await SharedPersistentSession.openSearch(options);exactRestores++;
     }
     documentCases++;
    }finally{abortWrites=false;await session.discardAndClose();db?.close();}
   }
   if(language===3){for(const scope of ["original","general-v1","document-v1"])for(const natural of [false,true])for(const owned of [false,true]){
    const database=`search-paired-${scope}-${natural}-${owned}`,policy={richLanguage:3,history:natural?"typing-v1":"explicit",rangeEditing:scope==="original"?"original":"general-v1",selectionEditing:scope==="document-v1"?"document-v1":"original"},relay=owned?{endpoint:"ws://127.0.0.1:49799/",principal:"alice",room:"room",actor:review.actor,binding:"b".repeat(64),documentWriter:"101",writerTransport:"atomic-v2"}:undefined,options={database,room:"room",writer:"101",review,...policy,...(owned?{reviewedHistory:identity,relay}:{}),create:()=>profile.create(source,"101"),restoreSearch:saved=>profile.restore_search("room",saved),onError:()=>{}};
    let session=await SharedReviewPersistentSession.openSearch(options),db;
    try{
     db=await openSessionDatabase(database);const anchor=session.core.captureReviewAnchor({kind:"selection",selection:{kind:"node",block:"body"}}),created=session.core.dispatchReview({kind:"create_thread",data:{anchorJson:anchor,body:"Retain the comment"}});assert.equal(created.kind,"committed");
     const version=session.saveVersion("Before search","1792200000000"),packet=session.versionPacket(version.id);retainedVersions++;
     const r=session.core.findText(query);session.core.replaceSearchAll(r,replacement);r.dispose();checkSourceCheckpoint(session.core,...key);await session.flush();
     const exact=[session.core.checkpointJson(),session.core.reviewCheckpoint()],record=await readSearchReviewRecord(db,key);assert.deepEqual([record.documentCheckpointJson,record.reviewCheckpointJson],exact);assert.equal(record.versions[0],packet);if(owned){assert.deepEqual(record.relay,relay);relayBindings++;}await session.close();
     let restored=false;const forbidden={...options,restore:()=>{restored=true;throw Error("no fallback");},restoreReviewed:()=>{restored=true;throw Error("no fallback");}};await assert.rejects(owned?SharedReviewPersistentSession.openReviewed(forbidden):SharedReviewPersistentSession.open(forbidden));assert.equal(restored,false);assert.deepEqual(await readSearchReviewRecord(db,key),record);oldReaderRefusals++;
     const twin=reference(profile,exact[0],policy,owned?identity:undefined);let future;try{twin.enableReview(review,exact[1]);twin.undo();twin.undoReview();twin.redo();twin.redoReview();future=[twin.checkpointJson(),twin.reviewCheckpoint()];}finally{twin.dispose();}
     session=await SharedReviewPersistentSession.openSearch(options);assert.equal(session.recovered,true);assert.deepEqual([session.core.checkpointJson(),session.core.reviewCheckpoint()],exact);assert.equal(session.versionPacket(version.id),packet);exactRestores++;
     session.core.undo();session.core.undoReview();await session.flush();const undone=[session.core.checkpointJson(),session.core.reviewCheckpoint()];await session.close();session=await SharedReviewPersistentSession.openSearch(options);assert.deepEqual([session.core.checkpointJson(),session.core.reviewCheckpoint()],undone);exactRestores++;session.core.redo();session.core.redoReview();assert.deepEqual([session.core.checkpointJson(),session.core.reviewCheckpoint()],future);exactFutureCheckpoints++;
     await session.flush();const durable=await readSearchReviewRecord(db,key);abortWrites=true;session.core.dispatchReview({kind:"reply",data:{thread:created.event,body:"Must survive failed close"}});await assert.rejects(session.flush());await assert.rejects(session.close());assert.deepEqual(await readSearchReviewRecord(db,key),durable);const readable=session.exportRecovery();assert.equal(readable.format,"breditor/shared-search-review-checkpoint-record");assert.ok(readable.reviewCheckpointJson.includes("Must survive failed close"));await assert.rejects(SharedReviewPersistentSession.openSearch({...options,database:`${database}-other`}),/already active/);leaseChecks++;atomicAborts++;abortWrites=false;await session.close();session=await SharedReviewPersistentSession.openSearch(options);assert.deepEqual([session.core.checkpointJson(),session.core.reviewCheckpoint()],[readable.documentCheckpointJson,readable.reviewCheckpointJson]);exactRestores++;
     const stable=await readSearchReviewRecord(db,key);for(const patch of [{extra:true},{formatVersion:2},{reviewedHistory:owned?null:identity},{principal:"another-account"},{relay:owned?null:relay,progress:{cursor:null,accepted:null,sequence:null}}])await assert.rejects(writeSearchReviewRecord(db,key,{...stable,...patch}));assert.deepEqual(await readSearchReviewRecord(db,key),stable);pairedCases++;
    }finally{abortWrites=false;await session.discardAndClose();db?.close();}
   }}
   }finally{profile.free();}
  }
  // Never open an old record with a search factory, restore a fresh AST, or overwrite its bytes.
  const db=await openSessionDatabase("search-no-implicit-migration");try{await writeCheckpoint(db,key,"retained legacy bytes");let called=false;await assert.rejects(SharedPersistentSession.openSearch({database:"search-no-implicit-migration",room:"room",writer:"101",richLanguage:3,history:"explicit",rangeEditing:"original",selectionEditing:"original",create:()=>{called=true;throw Error("no fallback");},restoreSearch:()=>{called=true;throw Error("no fallback");}}),/explicitly selected search record/);assert.equal(called,false);assert.equal(await readCheckpoint(db,key),"retained legacy bytes");oldReaderRefusals++;}finally{db.close();}
  assert.equal(host.held.size,0);assert.equal(documentCases,18);assert.equal(pairedCases,12);assert.equal(exactRestores,73);assert.equal(atomicAborts,13);assert.equal(corruptRecoveryRefusals,18);assert.equal(retainedVersions,12);assert.equal(relayBindings,6);
  return{format:"breditor/search-persistence-sdk-probe",formatVersion:1,sharedWasmSha256:createHash("sha256").update(bytes).digest("hex"),documentCases,pairedCases,exactRestores,exactFutureCheckpoints,atomicAborts,leaseChecks,oldReaderRefusals,corruptRecoveryRefusals,retainedVersions,relayBindings,passed:true,scope:"Actual application shared Wasm, synthetic IndexedDB/Web Locks, all three grammars and original/general/document scopes, explicit/natural and optional reviewed histories; exact document/comment/version recovery, aborted writes and failed-close retained ownership, old/new-family refusal, corrupt native recovery without overwrite, optional relay binding retention. No native browser storage, live relay transport, installed archive or UI qualification."};
 }finally{abortWrites=false;IDBDatabase.prototype.transaction=originalTransaction;for(const [name,descriptor]of savedGlobals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error("Expected actual application shared Wasm directory");console.log(JSON.stringify(await probeSearchPersistenceSdk(process.argv[2]),null,2));}
