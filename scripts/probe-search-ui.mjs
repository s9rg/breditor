/** Actual Wasm + borrowed DOM/React search. Synthetic DOM/layout/storage is not browser qualification. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath,pathToFileURL} from "node:url";
import {JSDOM} from "jsdom";
import {createElement,createRef,StrictMode,act} from "react";
import {createRoot} from "react-dom/client";
import {compileStandardRichProfileV1,compileStandardStructuralRichProfileV2,compileStandardLayoutRichProfileV3,createStandardRichInlinePresentationV1,mountRichEditor,mountDocumentRichEditor,mountRichSearchPanel} from "../packages/breditor-experimental-rich-content/index.js";
import {SharedRichEditor,createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {mountSharedEditor,mountSharedDocumentEditor} from "../packages/breditor-collaboration/dist/controller.js";
import {BreditorSearchPanel} from "../packages/breditor-editor/dist/search_react.js";
import {paragraph,range,coverageSeed} from "./fixtures/editor-consumer/coverage-seed.mjs";
const query={pattern:"cat",mode:"literal",caseSensitive:true,wholeWords:false},replacement={text:"dog",mode:"literal"};
const reviewed={binding:"a".repeat(64),principal:"alice",effectWriter:"303"};
const tick=()=>new Promise(resolve=>setTimeout(resolve,35));
const turns=async()=>{await Promise.resolve();await Promise.resolve();};
function body(core){return JSON.parse(core.documentJson()).root.children[0].children.map(n=>n.text).join("");}
function intro(core){return JSON.parse(core.documentJson()).root.children.find(n=>n.properties["breditor/block-id"]==="z-intro").children.map(n=>n.text).join("");}
function seed(binding){return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("body","cat🙂cat"),paragraph("tail","Tail")]}});}
async function load(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return{module,sha256:createHash("sha256").update(bytes).digest("hex")};}
export async function probeSearchUi(localDirectory,sharedDirectory){
 const local=await load(localDirectory,"breditor_wasm"),shared=await load(sharedDirectory,"breditor_shared"),realm=new JSDOM("<!doctype html><body></body>",{pretendToBeVisual:true}),{window}=realm,saved=new Map();
 const globals={window,document:window.document,navigator:window.navigator,IS_REACT_ACT_ENVIRONMENT:true};for(const name of ["Node","Element","HTMLElement","HTMLInputElement","HTMLButtonElement","HTMLSelectElement","AbortController","MutationObserver"])globals[name]=window[name];
 for(const [name,value]of Object.entries(globals)){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});}
 const profiles=[];let localCases=0,sharedCases=0,readonlyCases=0,queuedSuccesses=0,staleCompositionRefusals=0,policyCancellations=0,disposeCancellations=0,boundedQueues=0,notificationRefusals=0,reactDrafts=0,reactBorrowedCloses=0,mixedDomainCases=0,offlinePeerConvergence=0,heldPeerPublications=0,independentReviewVersions=0;
 const host=()=>{const node=window.document.createElement("div");window.document.body.append(node);return node;};
 const field=(node,name)=>{const value=node.querySelector(`[data-search-field="${name}"]`);assert.ok(value);return value;};
 const select=(f,selection)=>f.kind==="local"?f.dom.execute({kind:"setSelection",selection}):f.dom.select(selection);
 const history=(f,method)=>f.kind==="local"?f.dom.execute({kind:method}):f.core[method]();
 const fixture=(kind,language,natural,scope,owned=false,mixed=false)=>{
  const profile=kind==="local"?[compileStandardRichProfileV1,compileStandardStructuralRichProfileV2,compileStandardLayoutRichProfileV3][language-1](local.module,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:language+5,schema:{name:`example/search-ui-${kind}-${language}`,version:1},extensions:[]})):shared.module.SharedRichProfile[["from_standard_configuration_json_v1","from_standard_configuration_json_v2","from_standard_configuration_json_v3"][language-1]](JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema:{name:`example/search-ui-${kind}-${language}`,version:1},extensions:[]}));
  profiles.push({profile,kind});const document=scope==="document-v1",binding=kind==="local"?profile.descriptor():JSON.parse(profile.descriptor_json()),initial=mixed?coverageSeed(binding):seed(binding),options={searchHistory:"search-v1",...(owned?{reviewedHistory:reviewed}:{})};
  const core=kind==="local"?(document?profile.createDocumentEditor(initial):profile.createEditor(initial)):(document?createSharedDocumentEditor(profile.create(initial,"101"),options):new SharedRichEditor(profile.create(initial,"101"),options));
  if(natural)core.enableTypingHistory();if(kind==="shared"&&scope==="general-v1")core.enableGeneralRanges();
  const presentation=createStandardRichInlinePresentationV1(kind==="local"?profile.inlineCatalogJson():profile.inline_catalog_json()),root=host(),errors=[],domOptions={core,toolbar:[],inlinePresentation:presentation,onError:e=>errors.push(e),...(document?{selectionEditing:"document-v1"}:{}),...(kind==="shared"?{coreOwnership:"borrow"}:{})};
  const dom=kind==="local"?(document?mountDocumentRichEditor(root,domOptions):mountRichEditor(root,domOptions)):(document?mountSharedDocumentEditor(root,domOptions):mountSharedEditor(root,domOptions));
  return{kind,profile,core,dom,root,errors,dispose(){dom.dispose();if(kind==="shared")core.dispose();root.remove();}};
 };
 try{
  for(const language of [1,2,3])for(const natural of [false,true])for(const kind of ["local","shared"])for(const scope of kind==="local"?["original","document-v1"]:["original","general-v1","document-v1"])for(const owned of kind==="shared"?[false,true]:[false]){
   const f=fixture(kind,language,natural,scope,owned),root=host();let panel;
   try{
    select(f,range("body",8,"body",0));const before=f.core.checkpointJson(),html=f.dom.surface.innerHTML;panel=mountRichSearchPanel(root,f.dom,{initialQuery:query,initialReplacement:replacement,debounceMs:0});assert.equal(panel.state().count,"2");assert.equal(f.core.checkpointJson(),before);await tick();assert.equal(f.dom.surface.innerHTML,html);assert.ok(window.document.querySelector("[data-rich-search-overlay]"));
    assert.throws(()=>mountRichSearchPanel(f.dom.surface,f.dom),/separate host/);assert.equal(f.dom.surface.innerHTML,html);assert.throws(()=>mountRichSearchPanel(root,f.dom),/unused separate host/);
    await panel.next();assert.equal(panel.state().active,"0");await panel.next();assert.equal(panel.state().active,"1");assert.equal(f.core.view().undoDepth,0);await panel.replaceOne();await turns();assert.equal(body(f.core),"cat🙂dog");assert.equal(panel.state().count,"1");assert.equal(f.core.view().undoDepth,1);
    history(f,"undo");await turns();panel.refresh();assert.equal(body(f.core),"cat🙂cat");assert.equal(panel.state().count,"2");history(f,"redo");await turns();panel.refresh();assert.equal(body(f.core),"cat🙂dog");await panel.replaceAll();assert.equal(body(f.core),"dog🙂dog");assert.equal(panel.state().count,"0");assert.equal(f.core.view().undoDepth,2);
    history(f,"undo");await turns();panel.refresh();f.dom.setReadOnly(true);await turns();panel.refresh();assert.equal(root.querySelector("[data-search-action=replaceAll]").disabled,true);await panel.next();const readonly=f.core.checkpointJson();await assert.rejects(panel.replaceAll(),/editable search-enabled/);assert.equal(f.core.checkpointJson(),readonly);readonlyCases++;f.dom.setReadOnly(false);await turns();
    const exact=f.core.checkpointJson(),draft=panel.state().query;panel.close();assert.equal(panel.state().open,false);assert.deepEqual(panel.state().query,draft);assert.equal(f.core.checkpointJson(),exact);panel.focus();assert.equal(panel.state().open,true);assert.deepEqual(panel.state().query,draft);
    panel.dispose();assert.ok(f.dom.surface.isConnected);assert.equal(f.core.checkpointJson(),exact);select(f,range("body",0));if(kind==="local")f.dom.execute({kind:"insertPlainText",text:"A"});else f.dom.execute({commands:[{kind:"insert_text",data:{block:"body",offset:0,text:"A"}}]});assert.ok(body(f.core).startsWith("A"));
    if(kind==="local")localCases++;else sharedCases++;
   }finally{panel?.dispose();root.remove();f.dispose();}
  }
  for(const kind of ["local","shared"])for(const natural of [false,true]){
   const f=fixture(kind,3,natural,"document-v1",kind==="shared",true),root=host(),pattern={...query,pattern:"a🙂b"};let panel,peer;
   try{
    const original=f.core.documentJson();let version;
    if(kind==="shared"){
     peer=new SharedRichEditor(f.profile.join_frame("room","202",f.core.updateFrame()));peer.dispatch({commands:[{kind:"insert_text",data:{block:"z-intro",offset:0,text:"PEER"}}]});
     f.core.enableReview({actor:"search-ui-review",principal:"alice",access:"comment"});const anchor=f.core.captureReviewAnchor({kind:"selection",selection:{kind:"node",block:"image"}});assert.equal(f.core.dispatchReview({kind:"create_thread",data:{anchorJson:anchor,body:"a🙂b stays in comment metadata"}}).kind,"committed");version=f.core.captureVersion("Before mixed search","alice","1792200000000");assert.equal(f.core.readVersion(version).name,"Before mixed search");independentReviewVersions++;
    }
    panel=mountRichSearchPanel(root,f.dom,{initialQuery:pattern,initialReplacement:{text:"MATCH",mode:"literal"},debounceMs:0});assert.equal(panel.state().count,"13");const read=f.dom.findText(pattern),blocks=new Map([...f.dom.surface.querySelectorAll("[data-rich-text]")].map(n=>[n.dataset.richText,n]));for(const match of read.metadata().matches)assert.equal(blocks.get(match.block)?.textContent.slice(Number(match.start),Number(match.end)),"a🙂b");read.dispose();await panel.next("previous");assert.equal(f.core.view().selection.kind,"text");await panel.replaceAll();assert.equal(panel.state().count,"0");assert.equal(f.core.view().undoDepth,1);
    field(root,"pattern").value="xy🙂";field(root,"replacement").value="caption ✓";panel.refresh();assert.equal(panel.state().count,"1");await panel.replaceAll();assert.equal(f.dom.surface.querySelector("[data-rich-text=caption]").textContent,"caption ✓");assert.equal(f.core.view().undoDepth,2);
    history(f,"undo");history(f,"undo");await turns();assert.equal(f.core.documentJson(),original);history(f,"redo");history(f,"redo");await turns();assert.equal(f.dom.surface.querySelector("[data-rich-text=caption]").textContent,"caption ✓");
    if(kind==="shared"){
     field(root,"pattern").value="MATCH";field(root,"replacement").value="DONE";panel.refresh();assert.equal(panel.state().count,"13");select(f,range("z-intro",0));f.dom.focus();f.dom.surface.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));const r=f.dom.findText({...query,pattern:"MATCH"}),pending=f.core.receiveFrame(peer.updateFrame());assert.equal(f.core.pendingRemote().frames,1);const selection=f.dom.selectSearchMatch(r,"0");f.dom.surface.dispatchEvent(new window.CompositionEvent("compositionend",{bubbles:true,data:""}));await tick();await selection;await pending;assert.throws(()=>f.dom.checkSearchResults(r));r.dispose();heldPeerPublications++;
     panel.refresh();assert.equal(panel.state().count,"13");const admittedIntro=intro(f.core);assert.equal(admittedIntro.replace("PEER",""),"MATCH");await panel.replaceAll();assert.equal(intro(f.core),admittedIntro.replace("MATCH","DONE"));await peer.receiveFrame(f.core.updateFrame());assert.equal(peer.documentJson(),f.core.documentJson());offlinePeerConvergence++;
     // Prior concurrent tombstones/Undo can place an intact peer chunk on either side;
     // search must preserve the admitted placement, and selective Undo must preserve its text.
     for(let n=0;n<3;n++){history(f,"undo");await peer.receiveFrame(f.core.updateFrame());assert.equal(peer.documentJson(),f.core.documentJson());offlinePeerConvergence++;}assert.equal(intro(f.core).replace("PEER",""),"a🙂b");assert.equal(f.core.reviewSnapshot().view.threads.length,1);assert.equal(f.core.readVersion(version).name,"Before mixed search");
    }
    mixedDomainCases++;
   }finally{panel?.dispose();peer?.dispose();f.dispose();root.remove();}
  }
  for(const kind of ["local","shared"])for(const natural of [false,true]){
   // Unchanged/cancelled composition allows queued work; its replacement object was detached, not its native result.
   let f=fixture(kind,3,natural,"document-v1");try{
    select(f,range("body",0));f.dom.focus();f.dom.surface.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));assert.equal(f.dom.searchState().composing,true);const r=f.dom.findText(query),replacementDraft={...replacement},pending=f.dom.replaceSearchAll(r,replacementDraft);replacementDraft.text="MUTATED";let settled=false;void pending.then(()=>{settled=true;});await turns();assert.equal(settled,false);f.dom.surface.dispatchEvent(new window.CompositionEvent("compositionend",{bubbles:true,data:""}));await tick();await pending;assert.equal(body(f.core),"dog🙂dog");r.dispose();queuedSuccesses++;
   }finally{f.dispose();}
   // A real accepted composition must invalidate the earlier source rather than replay a query or overwrite it.
   f=fixture(kind,3,natural,"document-v1");try{
    select(f,range("body",8));f.dom.focus();f.dom.surface.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));const r=f.dom.findText(query),pending=f.dom.replaceSearchAll(r,replacement),refused=assert.rejects(pending);f.dom.surface.querySelector("[data-rich-text=body]").textContent="cat🙂catZ";f.dom.surface.dispatchEvent(new window.CompositionEvent("compositionend",{bubbles:true,data:"Z"}));await tick();await refused;assert.equal(body(f.core),"cat🙂catZ");assert.equal(f.core.view().undoDepth,1);r.dispose();staleCompositionRefusals++;
   }finally{f.dispose();}
   f=fixture(kind,3,natural,"original");try{
    select(f,range("body",0));f.dom.focus();f.dom.surface.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));const r=f.dom.findText(query),pending=f.dom.replaceSearchAll(r,replacement),refused=assert.rejects(pending,/policy/);f.dom.setReadOnly(true);await refused;assert.equal(body(f.core),"cat🙂cat");assert.equal(f.dom.searchState().composing,false);assert.equal(f.core.view().undoDepth,0);r.dispose();policyCancellations++;
   }finally{f.dispose();}
   f=fixture(kind,3,natural,"original");try{
    select(f,range("body",0));f.dom.focus();f.dom.surface.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));const r=f.dom.findText(query),pending=f.dom.selectSearchMatch(r,"1"),refused=assert.rejects(pending,/disposed/);f.dom.dispose();await refused;r.dispose();disposeCancellations++;
   }finally{f.dispose();}
   f=fixture(kind,3,natural,"original");try{
    select(f,range("body",0));f.dom.focus();f.dom.surface.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));const r=f.dom.findText(query),pending=Array.from({length:128},()=>f.dom.selectSearchMatch(r,"0")),all=Promise.allSettled(pending);await assert.rejects(f.dom.selectSearchMatch(r,"0"),/queue is full/);f.dom.setReadOnly(true);assert.ok((await all).every(v=>v.status==="rejected"));assert.equal(f.core.view().undoDepth,0);r.dispose();boundedQueues++;
   }finally{f.dispose();}
   f=fixture(kind,3,natural,"original");try{
    const unsubscribe=f.dom.subscribeSearch(()=>{if(kind==="local")assert.throws(()=>f.dom.execute({kind:"insertPlainText",text:"BAD"}),/notifications/);else assert.throws(()=>f.dom.execute({commands:[]}),/notifications/);});select(f,range("body",0));unsubscribe();assert.equal(body(f.core),"cat🙂cat");assert.equal(f.core.view().undoDepth,0);notificationRefusals++;
   }finally{f.dispose();}
  }
  for(const kind of ["local","shared"]){
   const f=fixture(kind,3,true,"document-v1"),root=host(),react=createRoot(root),ref=createRef();let second;
   try{
    const exact=f.core.checkpointJson();await act(async()=>react.render(createElement(StrictMode,null,createElement(BreditorSearchPanel,{ref,editor:f.dom,initialOptions:{initialQuery:query,initialReplacement:replacement,decorations:false,debounceMs:0}}))));assert.ok(ref.current?.getPanel());
    const input=field(root,"pattern");input.value="draft";input.dispatchEvent(new window.Event("input",{bubbles:true}));await act(async()=>{await tick();});assert.equal(ref.current.getPanel().state().query.pattern,"draft");
    await act(async()=>react.render(createElement(StrictMode,null,createElement(BreditorSearchPanel,{ref,editor:f.dom,className:"rerender",initialOptions:{initialQuery:{...query,pattern:"not-the-draft"},decorations:false,debounceMs:0}}))));assert.equal(field(root,"pattern"),input);assert.equal(ref.current.getPanel().state().query.pattern,"draft");reactDrafts++;
    ref.current.close();assert.equal(ref.current.getPanel().state().query.pattern,"draft");ref.current.focus();assert.equal(ref.current.getPanel().state().query.pattern,"draft");assert.equal(f.core.checkpointJson(),exact);
    second=fixture(kind,3,true,"document-v1");await act(async()=>react.render(createElement(BreditorSearchPanel,{ref,editor:second.dom,initialOptions:{initialQuery:query,decorations:false}})));assert.equal(ref.current.getPanel().state().query.pattern,"cat");assert.equal(f.core.checkpointJson(),exact);await act(async()=>react.unmount());assert.equal(f.dom.searchState().closed,false);assert.equal(second.dom.searchState().closed,false);const reads=Array.from({length:8},()=>f.dom.findText(query));reads.forEach(r=>r.dispose());reactBorrowedCloses++;
   }finally{await act(async()=>react.unmount());second?.dispose();f.dispose();root.remove();}
  }
  assert.equal(localCases,12);assert.equal(sharedCases,36);assert.equal(readonlyCases,48);for(const count of [queuedSuccesses,staleCompositionRefusals,policyCancellations,disposeCancellations,boundedQueues,notificationRefusals])assert.equal(count,4);assert.equal(reactDrafts,2);assert.equal(reactBorrowedCloses,2);assert.equal(mixedDomainCases,4);assert.equal(offlinePeerConvergence,8);assert.equal(heldPeerPublications,2);assert.equal(independentReviewVersions,2);
  return{format:"breditor/search-borrowed-ui-probe",formatVersion:1,localWasmSha256:local.sha256,sharedWasmSha256:shared.sha256,localCases,sharedCases,readonlyCases,queuedSuccesses,staleCompositionRefusals,policyCancellations,disposeCancellations,boundedQueues,notificationRefusals,reactDrafts,reactBorrowedCloses,mixedDomainCases,offlinePeerConvergence,heldPeerPublications,independentReviewVersions,passed:true,scope:"Actual local/application shared Wasm with synthetic DOM: all grammars, explicit/natural and reviewed histories, local/document and shared original/general/document scopes; borrowed controls, Replace One/All, live Undo/Redo, readonly navigation, out-of-tree decoration setup, queue completion, stale composition refusals, policy/disposal cancellation, 128-entry admission, argument snapshots and read-only notifications. Mixed merged-source tables, caption edits, hidden tables, independent comments/named versions, offline peer edits, held publications and selective-history convergence. Borrowed React StrictMode, rerenders, source changes and closure retain drafts/history/owners and release result handles. Layout geometry, native browser input/storage/clipboard, installed packages and top-level search-aware startup are not qualified here."};
 }finally{for(const {profile,kind}of profiles.reverse()){if(kind==="local")profile.dispose();else profile.free();}for(const [name,value]of saved){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}window.close();}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error("Expected actual local/shared Wasm directories");console.log(JSON.stringify(await probeSearchUi(process.argv[2],process.argv[3]),null,2));}
