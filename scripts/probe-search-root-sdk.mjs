/** Actual paired Wasm through top-level startup and borrowed controls; DOM/IDB/locks are fixtures. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {JSDOM} from "jsdom";
import {IDBFactory,IDBDatabase} from "fake-indexeddb";
import {createElement,createRef,Fragment,StrictMode,act} from "react";
import {createRoot} from "react-dom/client";
import {BreditorSearchPanel} from "../packages/breditor-editor/dist/react.js";
import {BreditorSharedSearchEditor,BreditorSharedDocumentSearchEditor} from "../packages/breditor-editor/dist/shared_react.js";
import {initializeLocalRuntime,createLocalProfile,createStructuralLocalProfileV2,createLayoutLocalProfileV3,openLocalEditor,openLocalDocumentEditor,mountSearchPanel} from "../packages/breditor-editor/dist/index.js";
import {initializeSharedRuntime,createSharedProfile,createStructuralSharedProfileV2,createLayoutSharedProfileV3,openSharedEditor,openSharedDocumentEditor,openSharedSearchEditor,openSharedDocumentSearchEditor,createSharedDocumentEditor,SharedRichEditor,restoreSharedSearchEditor} from "../packages/breditor-editor/dist/collaboration.js";
import {paragraph} from "./fixtures/editor-consumer/coverage-seed.mjs";
const query={pattern:"cat",mode:"literal",caseSensitive:true,wholeWords:false},replacement={text:"dog",mode:"literal"};
const body=editor=>JSON.parse(editor.view().documentJson).root.children[0].children.map(n=>n.text).join("");
function seed(binding){return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("body","cat🙂cat")]}});}
function locks(){const held=new Set();return{held,request(name,_options,callback){return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};}
const turns=async()=>{await Promise.resolve();await Promise.resolve();};
export async function probeSearchRootSdk(localDirectory,sharedDirectory){
 const localBytes=readFileSync(resolve(localDirectory,"breditor_wasm_bg.wasm")),sharedBytes=readFileSync(resolve(sharedDirectory,"breditor_shared_bg.wasm")),sha=bytes=>createHash("sha256").update(bytes).digest("hex");
 assert.equal(sha(localBytes),sha(readFileSync(new URL("../packages/breditor-experimental-rich-content/dist/breditor_wasm_bg.wasm",import.meta.url))));assert.equal(sha(sharedBytes),sha(readFileSync(new URL("../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm",import.meta.url))));
 const realm=new JSDOM("<!doctype html><body></body>",{pretendToBeVisual:true}),{window}=realm,lockHost=locks(),saved=new Map(),globals={window,document:window.document,indexedDB:new IDBFactory(),navigator:{locks:lockHost},IS_REACT_ACT_ENVIRONMENT:true};
 for(const name of ["Node","Element","HTMLElement","HTMLInputElement","HTMLSelectElement","HTMLButtonElement","AbortController"])globals[name]=window[name];for(const [name,value]of Object.entries(globals)){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});}
 const host=()=>{const node=window.document.createElement("div");window.document.body.append(node);return node;};
 let localCases=0,sharedCases=0,exactRestores=0,exactFutureCheckpoints=0,familyRefusals=0,policyRefusals=0,failedCloseRetries=0,oldModeReads=0,reactStartupCases=0,reactExactReopens=0;const originalTransaction=IDBDatabase.prototype.transaction;let abortWrites=false;
 IDBDatabase.prototype.transaction=function(...args){const tx=originalTransaction.apply(this,args);if(abortWrites&&args[1]==="readwrite")queueMicrotask(()=>{try{tx.abort();}catch{}});return tx;};
 try{
  await initializeLocalRuntime(localBytes);await initializeSharedRuntime(sharedBytes);
  for(const language of [1,2,3])for(const natural of [false,true])for(const document of [false,true]){
   const profile=await [createLocalProfile,createStructuralLocalProfileV2,createLayoutLocalProfileV3][language-1](),root=host(),controls=host(),recoveryHost=host(),history=natural?"typing-v1":"explicit",options={host:root,richLanguage:language,history,...(document?{selectionEditing:"document-v1"}:{})},open=document?openLocalDocumentEditor:openLocalEditor;let editor,restored,panel,twin;
   try{
    editor=await open({...options,initial:{kind:"document",documentJson:seed(profile.descriptor())}});assert.equal(editor.search(),editor.search());panel=mountSearchPanel(controls,editor.search(),{initialQuery:query,initialReplacement:replacement,decorations:false});assert.equal(panel.state().count,"2");await panel.next();await panel.replaceAll();assert.equal(body(editor),"dog🙂dog");assert.equal(editor.view().undoDepth,1);const exact=editor.checkpointJson();
    twin=document?(natural?profile.restoreDocumentTypingEditor(exact):profile.restoreDocumentEditor(exact)):(natural?profile.restoreTypingEditor(exact):profile.restoreEditor(exact));panel.dispose();editor.dispose();editor=undefined;
    restored=await open({...options,host:recoveryHost,initial:{kind:document?(natural?"documentTypingCheckpoint":"documentCheckpoint"):(natural?"typingCheckpoint":"checkpoint"),checkpointJson:exact}});assert.equal(restored.checkpointJson(),exact);exactRestores++;
    for(const method of ["undo","redo","undo","redo"]){restored.execute({kind:method});twin.execute({kind:method});assert.equal(restored.checkpointJson(),twin.checkpointJson());exactFutureCheckpoints++;}localCases++;
   }finally{panel?.dispose();editor?.dispose();restored?.dispose();twin?.dispose();profile.dispose();root.remove();controls.remove();recoveryHost.remove();}
  }
  for(const language of [1,2,3])for(const natural of [false,true])for(const scope of ["original","general-v1","document-v1"]){
   const profile=await [createSharedProfile,createStructuralSharedProfileV2,createLayoutSharedProfileV3][language-1](),root=host(),controls=host(),history=natural?"typing-v1":"explicit",document=scope==="document-v1",options={host:root,database:`root-search-${language}-${natural}-${scope}`,room:"room",writer:"101",richLanguage:language,history,rangeEditing:scope==="original"?"original":"general-v1",...(document?{selectionEditing:"document-v1"}:{}),onError:()=>{}},open=document?openSharedDocumentSearchEditor:openSharedSearchEditor;let editor,panel,twin;
   try{
    editor=await open({...options,initial:{kind:"document",documentJson:seed(JSON.parse(profile.descriptor_json()))}});assert.equal(editor.search(),editor.search());assert.equal(editor.search().searchState().canReplace,true);panel=mountSearchPanel(controls,editor.search(),{initialQuery:query,initialReplacement:replacement,decorations:false});await panel.next();await panel.replaceAll();assert.equal(body(editor),"dog🙂dog");assert.equal(editor.view().undoDepth,1);await editor.flush();const exact=editor.checkpointJson();
    twin=document?createSharedDocumentEditor(restoreSharedSearchEditor(profile,"room",exact),{searchHistory:"search-v1"}):new SharedRichEditor(restoreSharedSearchEditor(profile,"room",exact),{searchHistory:"search-v1"});const borrowed=editor.search();await editor.close();editor=undefined;await turns();assert.equal(borrowed.searchState().closed,true);panel.dispose();
    const prior=window.document.createElement("button");root.replaceChildren(prior);await assert.rejects((document?openSharedDocumentEditor:openSharedEditor)({...options,initial:{kind:"resume"}}),/Unknown stored/);assert.equal(root.firstChild,prior);familyRefusals++;
    await assert.rejects(open({...options,history:natural?"explicit":"typing-v1",initial:{kind:"resume"}}),/Stored search policy/);assert.equal(root.firstChild,prior);policyRefusals++;
    await assert.rejects(open({...options,initial:{kind:document?"documentCheckpoint":"checkpoint",checkpointJson:exact}}),/discriminator/);assert.equal(root.firstChild,prior);familyRefusals++;
    editor=await open({...options,initial:{kind:"resume"}});assert.equal(editor.recovered,true);assert.equal(editor.checkpointJson(),exact);exactRestores++;
    for(const method of ["undo","redo","undo","redo"]){editor.core[method]();twin[method]();assert.equal(editor.checkpointJson(),twin.checkpointJson());exactFutureCheckpoints++;}
    if(language===3&&document){
     const borrowed=editor.search();panel=mountSearchPanel(controls,borrowed,{initialQuery:{...query,pattern:"dog"},initialReplacement:{text:"fox",mode:"literal"},decorations:false});abortWrites=true;await panel.replaceAll();const readable=editor.checkpointJson();await assert.rejects(editor.close());assert.equal(editor.state().status,"failed");assert.equal(editor.checkpointJson(),readable);assert.equal(borrowed.searchState().closed,true);assert.throws(()=>editor.search(),/closing or closed/);assert.equal(lockHost.held.size,1);panel.dispose();abortWrites=false;await editor.close();editor=await open({...options,initial:{kind:"resume"}});assert.equal(editor.checkpointJson(),readable);assert.equal(body(editor),"fox🙂fox");failedCloseRetries++;
    }
    await editor.close();editor=undefined;assert.equal(lockHost.held.size,0);sharedCases++;
   }finally{abortWrites=false;panel?.dispose();await editor?.discardAndClose();twin?.dispose();profile.free();root.remove();controls.remove();}
  }
  // Read-only matching is additive; the old root startup does not silently enable the search replay family.
  const profile=await createSharedProfile(),root=host(),controls=host();let editor,panel;
  try{editor=await openSharedEditor({host:root,database:"old-mode-search-read",room:"room",writer:"101",initial:{kind:"document",documentJson:seed(JSON.parse(profile.descriptor_json()))}});assert.equal(editor.core.searchHistoryPolicy(),null);panel=mountSearchPanel(controls,editor.search(),{initialQuery:query,decorations:false});await panel.next();const exact=editor.checkpointJson();await assert.rejects(panel.replaceAll(),/editable search-enabled/);assert.equal(editor.checkpointJson(),exact);assert.equal(JSON.parse(exact).format,"breditor/rich-replica-journal");oldModeReads++;}
  finally{panel?.dispose();await editor?.close();profile.free();root.remove();controls.remove();}
  const wait=async check=>{for(let n=0;n<300;n++){if(check())return;await act(async()=>{await new Promise(setImmediate);});}throw Error("React search startup/retirement did not settle");};
  for(const natural of [false,true])for(const document of [false,true]){
   const profile=await createLayoutSharedProfileV3(),root=host(),react=createRoot(root),ref=createRef(),searchRef=createRef(),history=natural?"typing-v1":"explicit",errors=[],options={database:`react-search-${natural}-${document}`,room:"room",writer:"101",richLanguage:3,history,rangeEditing:document?"general-v1":"original",...(document?{selectionEditing:"document-v1"}:{}),initial:{kind:"document",documentJson:seed(JSON.parse(profile.descriptor_json()))}},Component=document?BreditorSharedDocumentSearchEditor:BreditorSharedSearchEditor;let recovered;
   try{
    const render=(controls,changed=false)=>createElement(StrictMode,null,createElement(Fragment,null,createElement(Component,{key:"editor",ref,sessionKey:"one-writer",initialOptions:{...options,...(changed?{history:natural?"explicit":"typing-v1"}:{})},onError:e=>errors.push(e),onCloseError:(e,recovery)=>errors.push({error:e,recovery})}),controls?createElement(BreditorSearchPanel,{key:"search",ref:searchRef,editor:controls,initialOptions:{initialQuery:query,initialReplacement:replacement,decorations:false}}):null));
    await act(async()=>react.render(render(null)));await wait(()=>ref.current?.getEditor());const editor=ref.current.getEditor(),borrowed=editor.search();assert.equal(editor.searchHistoryPolicy(),"search-v1");await act(async()=>react.render(render(borrowed,true)));await wait(()=>searchRef.current?.getPanel());assert.equal(ref.current.getEditor(),editor);assert.equal(editor.historyPolicy(),history);
    await act(async()=>{await searchRef.current.getPanel().replaceAll();});assert.equal(body(editor),"dog🙂dog");await editor.flush();const exact=editor.checkpointJson();await act(async()=>react.unmount());await wait(()=>lockHost.held.size===0);assert.equal(errors.length,0);assert.equal(borrowed.searchState().closed,true);
    recovered=await(document?openSharedDocumentSearchEditor:openSharedSearchEditor)({...options,host:root,initial:{kind:"resume"}});assert.equal(recovered.checkpointJson(),exact);assert.equal(recovered.searchHistoryPolicy(),"search-v1");reactExactReopens++;await recovered.close();recovered=undefined;reactStartupCases++;
   }finally{await act(async()=>react.unmount());await recovered?.discardAndClose();profile.free();root.remove();}
  }
  assert.equal(localCases,12);assert.equal(sharedCases,18);assert.equal(exactRestores,30);assert.equal(exactFutureCheckpoints,120);assert.equal(familyRefusals,36);assert.equal(policyRefusals,18);assert.equal(failedCloseRetries,2);assert.equal(oldModeReads,1);assert.equal(reactStartupCases,4);assert.equal(reactExactReopens,4);assert.equal(lockHost.held.size,0);
  return{format:"breditor/search-root-sdk-probe",formatVersion:1,localWasmSha256:sha(localBytes),sharedWasmSha256:sha(sharedBytes),localCases,sharedCases,exactRestores,exactFutureCheckpoints,familyRefusals,policyRefusals,failedCloseRetries,oldModeReads,reactStartupCases,reactExactReopens,passed:true,scope:"Actual paired runtime bytes through compiled top-level local/document and separately named shared original/general/document search startup; borrowed controls, one native replacement group, exact root reopen and future history, incompatible family/policy refusal with host rollback, failed close readable recovery/lease retention and legacy-mode read-only search without a history upgrade. Actual React search startup in both scopes/histories, StrictMode, immutable configuration, borrowed panel edits, retirement and exact reopen. DOM, IndexedDB and Web Locks are fixtures. Independent installed packages, real relay/clipboard and native-browser/platform qualification remain separate."};
 }finally{abortWrites=false;IDBDatabase.prototype.transaction=originalTransaction;for(const [name,value]of saved){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}window.close();}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error("Expected paired local/shared runtime directories");console.log(JSON.stringify(await probeSearchRootSdk(process.argv[2],process.argv[3]),null,2));}
