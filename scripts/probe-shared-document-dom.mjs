/** Release Wasm and compiled shared DOM under synthetic events. No OS/IME/browser claim. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {JSDOM} from "jsdom";
import {SharedRichEditor,createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedDocumentEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {mountSharedDocumentEditor} from "../packages/breditor-collaboration/dist/controller.js";
import {createLayoutSharedToolbarV3} from "../packages/breditor-collaboration/dist/layout_toolbar_v3.js";
import {createStandardRichInlinePresentationV1} from "../packages/breditor-experimental-rich-content/index.js";
import {coverageSeed,paragraph,range} from "./fixtures/editor-consumer/coverage-seed.mjs";

async function runtime(directory){const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),module=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await module.default({module_or_path:bytes});return{module,sha256:createHash("sha256").update(bytes).digest("hex")};}
function clipboard(window,surface,kind,values=new Map(),retainRich=true){const event=new window.Event(kind,{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{files:[],get types(){return [...values.keys()];},getData:type=>values.get(type)??"",setData:(type,value)=>{if(type==="text/plain"||retainRich)values.set(type,value);}}});surface.dispatchEvent(event);assert.equal(event.defaultPrevented,true);return values;}
function key(window,surface,key,extra={}){const event=new window.KeyboardEvent("keydown",{key,bubbles:true,cancelable:true,...extra});surface.dispatchEvent(event);assert.equal(event.defaultPrevented,true);}
function input(window,surface,inputType,data){const event=new window.InputEvent("beforeinput",{inputType,data,bubbles:true,cancelable:true});surface.dispatchEvent(event);assert.equal(event.defaultPrevented,true);}
function find(source,id){function visit(n){if(n.properties?.["breditor/block-id"]===id)return n;for(const c of n.children??[]){const found=visit(c);if(found)return found;}}return visit(JSON.parse(source).root);}
function text(source,id){return find(source,id)?.children?.map(n=>n.text??"").join("");}

export async function probeSharedDocumentDom(directory,previousDirectory){
 const current=await runtime(directory),previous=await runtime(previousDirectory),schema={name:"example/shared-document-dom",version:1};
 const configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema,extensions:[]});
 const profile=current.module.SharedRichProfile.from_standard_configuration_json_v3(configuration),oldProfile=previous.module.SharedRichProfile.from_standard_configuration_json_v3(configuration);
 const realm=new JSDOM("<!doctype html><body></body>",{pretendToBeVisual:true}),{window}=realm,saved=new Map(),frames=[];
 // This is a semantic burst test, not a wall-clock/performance test. Heavy parallel
 // native renders may legitimately exceed the unchanged typing continuation window.
 let inputClock=1000;Object.defineProperty(window.performance,"now",{value:()=>inputClock++,configurable:true});
 for(const name of ["window","document","HTMLElement","HTMLInputElement","HTMLSelectElement","Node","Element","AbortController"]){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value:name==="window"?window:name==="document"?window.document:window[name],configurable:true,writable:true});}
 window.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};
 const seed=coverageSeed(JSON.parse(profile.descriptor_json())),presentation=createStandardRichInlinePresentationV1(profile.inline_catalog_json());
 const hidden=JSON.parse(seed);hidden.root.children=hidden.root.children.filter(n=>n.properties["breditor/block-id"]==="hidden");
 const source=onlyHidden=>onlyHidden?JSON.stringify(hidden):seed;
 let cases=0,compositions=0,cancellations=0,lifecycle=0,restores=0,future=0,peerDocuments=0,toolbarPublications=0,oldGetterRefusals=0,oldJournalRefusals=0,rootSelections=0,typingWindowCases=0;
 const restored=(core,natural)=>{const bytes=core.checkpointJson(),copy=createSharedDocumentEditor(restoreSharedDocumentEditor(profile,"room",bytes,natural?"typing-v1":"explicit"));assert.equal(copy.checkpointJson(),bytes);restores++;return copy;};
 const history=async(core,copy,commands,peer,peerCopy)=>{for(const command of commands){core[command]();copy[command]();assert.equal(copy.checkpointJson(),core.checkpointJson());future++;if(peer){await peer.receiveFrame(core.updateFrame());assert.equal(peer.documentJson(),core.documentJson());peerDocuments++;}if(peerCopy){await peerCopy.receiveFrame(core.updateFrame());assert.equal(peerCopy.checkpointJson(),peer.checkpointJson());future++;}}};
 const mount=(core,withToolbar=true)=>{const host=window.document.createElement("div"),errors=[];window.document.body.append(host);const dom=mountSharedDocumentEditor(host,{core,selectionEditing:"document-v1",coreOwnership:"borrow",toolbar:withToolbar?createLayoutSharedToolbarV3(core,presentation):[],inlinePresentation:presentation,onError:error=>errors.push(error)});return{dom,host,errors,dispose(){dom.dispose();host.remove();core.dispose();}};};
 try{
  // Prior runtime really has the old native getter gap, not just a simulated missing flag.
  const old=createSharedDocumentEditor(oldProfile.create(seed,"101"));
  try{old.selectDocument();assert.equal(old.supportsDocumentTools(),false);const exact=old.checkpointJson();for(const read of [()=>old.blockLayoutState(),()=>old.selectionFormatState("breditor/strong")]){assert.throws(read);assert.equal(old.checkpointJson(),exact);oldGetterRefusals++;}const host=window.document.createElement("div");host.textContent="preserve";assert.throws(()=>mountSharedDocumentEditor(host,{core:old,selectionEditing:"document-v1"}),/complete explicitly selected/);assert.equal(host.textContent,"preserve");}finally{old.dispose();}
  for(const natural of [false,true])for(const onlyHidden of [false,true]){
   const core=createSharedDocumentEditor(profile.create(source(onlyHidden),"101"));if(natural)core.enableTypingHistory();const t=mount(core),{dom}=t;
   try{
    const before=core.documentJson();dom.surface.tabIndex=0;dom.focus();window.document.getSelection().selectAllChildren(dom.surface);clipboard(window,dom.surface,"copy");assert.deepEqual(core.view().selection,{kind:"document"});rootSelections++;
    key(window,dom.surface,"a",{metaKey:true});assert.deepEqual(dom.view().selection,{kind:"document"});const exact=core.checkpointJson(),copied=clipboard(window,dom.surface,"copy");assert.equal(core.checkpointJson(),exact);assert.ok(copied.get("application/x-breditor-rich+json"));if(onlyHidden)assert.equal(copied.get("text/plain"),"");
    clipboard(window,dom.surface,"cut",new Map(),false);assert.equal(core.checkpointJson(),exact);assert.equal(t.errors.length,1);assert.match(String(t.errors.pop()),/complete rich document/);
    clipboard(window,dom.surface,"cut");assert.equal(JSON.parse(core.documentJson()).root.children.length,1);assert.equal(core.view().undoDepth,1);core.undo();assert.equal(core.documentJson(),before);
    clipboard(window,dom.surface,"paste",copied);assert.equal(core.view().undoDepth,1);let copy=restored(core,natural);try{await history(core,copy,["undo","redo","undo","redo"]);}finally{copy.dispose();}core.undo();assert.equal(core.documentJson(),before);
    key(window,dom.surface,"Q");input(window,dom.surface,"insertText","🙂");const first=JSON.parse(core.documentJson()).root.children[0];assert.equal(text(core.documentJson(),first.properties["breditor/block-id"]),"Q🙂");assert.equal(core.view().undoDepth,natural?1:2);core.undo();if(!natural)core.undo();assert.equal(core.documentJson(),before);
    const redo=core.view().redoDepth;dom.collapseDocumentSelection("after");assert.equal(core.documentJson(),before);assert.equal(core.view().redoDepth,redo);assert.deepEqual(core.view().selection,onlyHidden?{kind:"document"}:{kind:"node",block:"tail"});dom.selectDocument();
    if(!onlyHidden){const alignment=dom.toolbar.querySelector('[data-shared-field="block-alignment-value"]');assert.ok(alignment);alignment.value="center";alignment.dispatchEvent(new window.Event("change",{bubbles:true}));const button=dom.toolbar.querySelector('[data-shared-action="block-alignment"]');assert.equal(button.disabled,false);button.click();assert.equal(core.view().undoDepth,1);toolbarPublications++;copy=restored(core,natural);try{await history(core,copy,["undo","redo"]);}finally{copy.dispose();}core.undo();assert.equal(core.documentJson(),before);}
    // Native beforeinput and keyboard structural replacement are each one group.
    for(const kind of ["insertParagraph","deleteContentBackward"]){input(window,dom.surface,kind,null);assert.equal(core.view().undoDepth,1);assert.equal(JSON.parse(core.documentJson()).root.children.length,1);core.undo();assert.equal(core.documentJson(),before);}
    if(natural)for(const gap of [1,751]){dom.selectDocument();const start=inputClock+1000;inputClock=start;key(window,dom.surface,"Q");inputClock=start+gap;input(window,dom.surface,"insertText","🙂");assert.equal(core.view().undoDepth,gap>750?2:1);core.undo();if(gap>750)core.undo();assert.equal(core.documentJson(),before);typingWindowCases++;}
    assert.deepEqual(t.errors,[]);cases++;
   }finally{t.dispose();}
  }
  for(const natural of [false,true])for(const onlyHidden of [false,true])for(const commit of [false,true]){
   const core=createSharedDocumentEditor(profile.create(source(onlyHidden),"101")),peer=new SharedRichEditor(oldProfile.join_frame("room","202",core.updateFrame()));if(natural)core.enableTypingHistory();core.selectDocument();const t=mount(core,false);let copy,peerCopy;
   try{
    const before=core.documentJson();for(let i=0;i<2;i++)t.dom.surface.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));
    const commands=[{kind:"insert_blocks",data:{parent:null,before:null,nodes:[paragraph("peer-root","OFFLINE")]}}];if(!onlyHidden)commands.push({kind:"insert_text",data:{block:"q1",offset:1,text:"PEER"}});peer.dispatch({commands});
    const pending=core.receiveFrame(peer.updateFrame());pending.catch(()=>{});assert.equal(core.pendingRemote().frames,1);assert.equal(core.documentJson(),before);t.dom.surface.textContent="provisional DOM is not authoritative";
    t.dom.surface.dispatchEvent(new window.CompositionEvent("compositionend",{bubbles:true,data:commit?"Committed 🙂":""}));assert.equal(frames.length,1);assert.equal(core.documentJson(),before);frames.shift()(0);assert.equal(core.pendingRemote().frames,0);await pending;
    assert.equal(text(core.documentJson(),"peer-root"),"OFFLINE");assert.equal(core.view().undoDepth,commit?1:0);if(commit){assert.ok(core.documentJson().includes("Committed 🙂"));compositions++;}else{assert.deepEqual(core.view().selection,{kind:"document"});assert.equal(t.dom.surface.textContent.includes("provisional"),false);cancellations++;}
    await peer.receiveFrame(core.updateFrame());assert.equal(peer.documentJson(),core.documentJson());peerDocuments++;copy=restored(core,natural);peerCopy=new SharedRichEditor(oldProfile.restore("room",peer.checkpointJson()));assert.equal(peerCopy.checkpointJson(),peer.checkpointJson());restores++;
    if(commit){await history(core,copy,["undo","redo","undo","redo"],peer,peerCopy);core.undo();assert.equal(text(core.documentJson(),"peer-root"),"OFFLINE");if(!onlyHidden)assert.ok(text(core.documentJson(),"q1").includes("PEER"));}
    assert.deepEqual(t.errors,[]);
   }finally{copy?.dispose();peerCopy?.dispose();peer.dispose();t.dispose();}
  }
  for(const natural of [false,true])for(const onlyHidden of [false,true])for(const cancel of ["policy","dispose"]){
   const core=createSharedDocumentEditor(profile.create(source(onlyHidden),"101")),peer=new SharedRichEditor(oldProfile.join_frame("room","202",core.updateFrame()));if(natural)core.enableTypingHistory();core.selectDocument();const t=mount(core,false);
   try{t.dom.surface.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));peer.dispatch({commands:[{kind:"insert_blocks",data:{parent:null,before:null,nodes:[paragraph("peer-root","OFFLINE")]}}]});const pending=core.receiveFrame(peer.updateFrame());pending.catch(()=>{});assert.equal(core.pendingRemote().frames,1);if(cancel==="policy"){t.dom.setReadOnly(true);t.dom.surface.dispatchEvent(new window.CompositionEvent("compositionend",{bubbles:true,data:"must not commit"}));assert.equal(frames.length,0);}else{t.dom.dispose();assert.equal(t.host.childNodes.length,0);}assert.equal(core.pendingRemote().frames,0);await pending;assert.equal(text(core.documentJson(),"peer-root"),"OFFLINE");assert.equal(core.view().undoDepth,0);assert.deepEqual(core.view().selection,{kind:"document"});const copy=restored(core,natural);copy.dispose();assert.deepEqual(t.errors,[]);lifecycle++;}finally{peer.dispose();t.dispose();}
  }
  // More than the old per-dispatch 64-step ceiling, without changing that old contract.
  for(const natural of [false,true]){
   const value=JSON.parse(seed);value.root.children=Array.from({length:70},(_,i)=>paragraph(`p${i}`,"x"));const core=createSharedDocumentEditor(profile.create(JSON.stringify(value),"101")),peer=new SharedRichEditor(oldProfile.join_frame("room","202",core.updateFrame()));if(natural)core.enableTypingHistory();core.selectDocument();let copy;
   try{const before=core.documentJson();for(const change of [()=>core.changeSelectionFormats([{kind:"set",formatsJson:'[{"type":"breditor/strong","properties":{}}]'}]),()=>core.changeSelectionLayout({alignment:"center"})]){assert.equal(change(),true);assert.deepEqual(core.view().selection,{kind:"document"});const checkpoint=core.checkpointJson();assert.throws(()=>restoreSharedDocumentEditor(oldProfile,"room",checkpoint,natural?"typing-v1":"explicit"));oldJournalRefusals++;await peer.receiveFrame(core.updateFrame());assert.equal(core.documentJson(),peer.documentJson());peerDocuments++;copy=restored(core,natural);try{await history(core,copy,["undo","redo"],peer);}finally{copy.dispose();copy=undefined;}}assert.equal(core.view().undoDepth,2);core.undo();core.undo();assert.equal(core.documentJson(),before);}finally{copy?.dispose();core.dispose();peer.dispose();}
  }
 }finally{profile.free();oldProfile.free();window.close();for(const [name,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
 assert.equal(cases,4);assert.equal(rootSelections,4);assert.equal(compositions,4);assert.equal(cancellations,4);assert.equal(lifecycle,8);assert.equal(toolbarPublications,2);assert.equal(oldGetterRefusals,2);assert.equal(oldJournalRefusals,4);assert.equal(restores,34);assert.equal(future,60);assert.equal(peerDocuments,36);assert.equal(frames.length,0);assert.equal(typingWindowCases,4);
 return{format:"breditor/shared-document-dom-functional-probe",formatVersion:1,sharedWasmSha256:current.sha256,previousSharedWasmSha256:previous.sha256,documentCases:cases,nativeRootSelectionCases:rootSelections,compositionCommits:compositions,compositionCancellations:cancellations,policyOrDisposalCancellations:lifecycle,exactRestores:restores,exactFutureCheckpoints:future,exactPreviousPeerDocuments:peerDocuments,nativeToolbarPublications:toolbarPublications,previousGetterGapReproductions:oldGetterRefusals,previousUnknownJournalTagRefusals:oldJournalRefusals,largeDocumentBlocks:70,inputClock:"controlled monotonic fixture; no wall-clock/performance claim",typingWindowCases,passed:true,scope:"Actual release shared Wasm and compiled explicit document DOM: whole-root Copy/Cut/paste/first-key/Enter/Delete/collapse/layout; commit/cancel/duplicate-start and remote release; read-only/dispose cancellation; offline original previous-runtime peer recovery; 70-block atomic document formatting/layout. Synthetic events and controlled input clock only; no native clipboard/IME/browser/accessibility/relay/React/release acceptance."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected current and preserved previous shared release Wasm directories");console.log(JSON.stringify(await probeSharedDocumentDom(...args),null,2));}
