/** Real local release Wasm through the facade and source storage; IndexedDB is a test fixture. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {IDBFactory,IDBDatabase} from "fake-indexeddb";
import {compileStandardRichProfileV1,compileStandardStructuralRichProfileV2,compileStandardLayoutRichProfileV3,RichLocalSessionStore,RichDocumentSessionStore} from "../packages/breditor-experimental-rich-content/index.js";
import {coverageSeed,paragraph,range} from "./fixtures/editor-consumer/coverage-seed.mjs";
async function runtime(directory){const bytes=readFileSync(resolve(directory,"breditor_wasm_bg.wasm")),module=await import(pathToFileURL(resolve(directory,"breditor_wasm.js")));await module.default({module_or_path:bytes});return {module,sha256:createHash("sha256").update(bytes).digest("hex")};}
const profile=(module,language)=>[compileStandardRichProfileV1,compileStandardStructuralRichProfileV2,compileStandardLayoutRichProfileV3][language-1](module,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:language+5,schema:{name:"example/local-document-session",version:language},extensions:[]}));
function simpleSeed(binding){return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("a","Seed 🙂"),paragraph("b","Tail")]}});}
export async function probeLocalDocumentSession(directory,previousDirectory){
 const current=await runtime(directory),previous=await runtime(previousDirectory),savedDb=Object.getOwnPropertyDescriptor(globalThis,"indexedDB");Object.defineProperty(globalThis,"indexedDB",{value:new IDBFactory(),configurable:true});
 const cases=[];for(const language of [1,2,3])for(const natural of [false,true])cases.push({language,natural,kind:"simple"});for(const kind of ["mixed","hidden"])for(const natural of [false,true])cases.push({language:3,natural,kind});
 let trials=0,restores=0,future=0,failedSaveRetries=0,legacyKeysPreserved=0,pureCopies=0,guardedRefusals=0,previousRuntimeRefusals=0;
 try{
  for(const {language,natural,kind} of cases){
   const p=profile(current.module,language),database=`local-document-${trials}`,history=natural?"typing-v1":"explicit";let legacy,core,recovered,oldStore,store,reader;
   try{
    let source=kind==="simple"?simpleSeed(p.descriptor()):coverageSeed(p.descriptor());if(kind==="hidden"){const v=JSON.parse(source);v.root.children=v.root.children.filter(n=>n.properties["breditor/block-id"]==="hidden");source=JSON.stringify(v);}
    assert.equal(p.supportsDocumentSelection(),true);legacy=p.createEditor(source);if(natural)legacy.enableTypingHistory();
    if(kind!=="hidden"){legacy.execute({kind:"setSelection",selection:range(kind==="mixed"?"q2":"a",1)});legacy.execute({kind:"insertPlainText",text:"old"});legacy.execute({kind:"undo"});}
    const oldBytes=legacy.checkpointJson(),undoDepth=legacy.view().undoDepth,redoDepth=legacy.view().redoDepth;assert.throws(()=>legacy.selectDocument());
    oldStore=await RichLocalSessionStore.open(database);await oldStore.save(oldBytes);legacy.dispose();legacy=undefined;
    store=await RichDocumentSessionStore.open(database,{richLanguage:language,history});assert.equal(await store.load(),null);assert.equal(await store.loadLegacy(),oldBytes);
    core=p.restoreOriginalAsDocumentEditor(await store.loadLegacy(),history);assert.equal(core.selectionPolicy(),"document-v1");assert.equal(core.view().format,"breditor/rich-document-view");assert.equal(core.view().undoDepth,undoDepth);assert.equal(core.view().redoDepth,redoDepth);
    const before=core.documentJson(),restore=(bytes)=>natural?p.restoreDocumentTypingEditor(bytes):p.restoreDocumentEditor(bytes);
    assert.throws(()=>restore(oldBytes));assert.throws(()=>p.restoreOriginalAsDocumentEditor(core.checkpointJson(),history));guardedRefusals+=2;
    const stale=core.view().revision;core.selectDocument();const selected=core.checkpointJson(),copy=core.copyDocument();assert.ok(copy);assert.equal(copy.kind,"flow");if(kind==="hidden")assert.equal(copy.plainText,"");assert.equal(core.checkpointJson(),selected);pureCopies++;
    assert.throws(()=>core.replaceDocumentPlainText("unused","X",stale));assert.equal(core.checkpointJson(),selected);guardedRefusals++;
    if(natural){assert.throws(()=>core.replaceDocumentTypingText("unused","X","01"));assert.equal(core.checkpointJson(),selected);guardedRefusals++;}
    core.setReadOnly(true);const locked=core.checkpointJson();assert.throws(()=>core.replaceDocumentPlainText("unused","X"));assert.equal(core.checkpointJson(),locked);assert.equal(core.selectDocument(),"unchanged");core.setReadOnly(false);guardedRefusals++;
    if(natural){core.replaceDocumentTypingText("whole","Q","9007199254740993");core.execute({kind:"insertTypingText",data:{text:"🙂",clockMs:"9007199254741043"}});}else core.replaceDocumentPlainText("whole","Q");
    assert.equal(core.view().undoDepth,undoDepth+1);const edited=core.documentJson();assert.notEqual(edited,before);await store.save(core.checkpointJson());await store.flush();const durable=await store.load();
    assert.equal(await oldStore.load(),oldBytes);legacyKeysPreserved++;
    // A failed write retains both recovery keys and the native owner; retry writes its newest state.
    core.execute({kind:"undo"});assert.equal(core.documentJson(),before);assert.deepEqual(core.view().selection,{kind:"document"});const latest=core.checkpointJson(),original=IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(args[1]==="readwrite")queueMicrotask(()=>tx.abort());return tx;};
    try{await assert.rejects(store.save(latest));assert.equal(core.checkpointJson(),latest);}finally{IDBDatabase.prototype.transaction=original;}
    reader=await RichDocumentSessionStore.open(database,{richLanguage:language,history});assert.equal(await reader.load(),durable);reader.close();reader=undefined;assert.equal(await oldStore.load(),oldBytes);
    await store.save(latest);await store.flush();assert.equal(await store.load(),latest);failedSaveRetries++;
    store.close();store=undefined;store=await RichDocumentSessionStore.open(database,{richLanguage:language,history});recovered=restore(await store.load());assert.equal(recovered.checkpointJson(),latest);restores++;
    for(const command of ["redo","undo","redo","undo"]){assert.equal(core.execute({kind:command}),recovered.execute({kind:command}));assert.equal(core.checkpointJson(),recovered.checkpointJson());future++;}
    await store.save(core.checkpointJson());await store.flush();assert.equal(await store.load(),core.checkpointJson());assert.equal(await oldStore.load(),oldBytes);legacyKeysPreserved++;
    assert.throws(()=>p.restoreEditor(core.checkpointJson()));assert.throws(()=>p.restoreTypingEditor(core.checkpointJson()));guardedRefusals+=2;
    trials++;
   }catch(error){throw new Error(`Local document case ${trials}: ${kind}, language ${language}, ${history}`,{cause:error});}
   finally{legacy?.dispose();core?.dispose();recovered?.dispose();oldStore?.close();store?.close();reader?.close();p.dispose();}
  }
  // Older paired modules remain usable for ordinary editors, but never pretend to provide new scope.
  const p=profile(previous.module,3);let old;try{assert.equal(p.supportsDocumentSelection(),false);assert.throws(()=>p.createDocumentEditor(simpleSeed(p.descriptor())),/matching native document-selection recovery/);previousRuntimeRefusals++;old=p.createEditor(simpleSeed(p.descriptor()));assert.equal(old.selectionPolicy(),"original");assert.equal(old.supportsDocumentSelection(),false);assert.equal(old.view().format,"breditor/rich-view");}finally{old?.dispose();p.dispose();}
  assert.equal(trials,10);assert.equal(restores,10);assert.equal(future,40);assert.equal(failedSaveRetries,10);assert.equal(legacyKeysPreserved,20);assert.equal(pureCopies,10);assert.equal(guardedRefusals,65);assert.equal(previousRuntimeRefusals,1);
  return {format:"breditor/local-document-session-functional-probe",formatVersion:1,localWasmSha256:current.sha256,previousLocalWasmSha256:previous.sha256,trials,exactRestores:restores,exactFutureCheckpoints:future,failedSaveRetries,legacyKeysPreserved,pureCopies,guardedRefusals,previousRuntimeRefusals,passed:true,scope:"Actual local release Wasm through explicit facade and source persistence: three languages, both history families, original Redo upgrade, mixed/hidden-only whole selection, first-key typing, exact reload/future Undo/Redo, aborted writes and separate legacy/document keys. fake-indexeddb; not installed/browser storage, DOM, clipboard or whole-document rich-paste acceptance."};
 }finally{if(savedDb)Object.defineProperty(globalThis,"indexedDB",savedDb);else delete globalThis.indexedDB;}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected current/previous local release Wasm directories");console.log(JSON.stringify(await probeLocalDocumentSession(...args),null,2));}
