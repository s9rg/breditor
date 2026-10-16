/** Actual local release Wasm with the compiled DOM coordinator and synthetic jsdom events.
 * This proves integrated native content/history, not OS clipboard, IME or browser acceptance. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {JSDOM} from "jsdom";
import {compileStandardLayoutRichProfileV3,mountDocumentRichEditor,createStandardRichInlinePresentationV1,createLayoutRichToolbarV3} from "../packages/breditor-experimental-rich-content/index.js";
import {createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedDocumentEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {coverageSeed} from "./fixtures/editor-consumer/coverage-seed.mjs";
async function runtime(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return{module,sha256:createHash("sha256").update(bytes).digest("hex")};}
function clip(window,surface,kind,values=new Map(),retainRich=true){const event=new window.Event(kind,{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{files:[],get types(){return [...values.keys()];},getData:type=>values.get(type)??"",setData:(type,value)=>{if(type==="text/plain"||retainRich)values.set(type,value);}}});surface.dispatchEvent(event);assert.equal(event.defaultPrevented,true);return values;}
function key(window,surface,key,extra={}){const event=new window.KeyboardEvent("keydown",{key,bubbles:true,cancelable:true,...extra});surface.dispatchEvent(event);assert.equal(event.defaultPrevented,true);}
function input(window,surface,inputType,data){const event=new window.InputEvent("beforeinput",{inputType,data,bubbles:true,cancelable:true});surface.dispatchEvent(event);assert.equal(event.defaultPrevented,true);}
export async function probeDocumentDom(localDirectory,sharedDirectory){
 const local=await runtime(localDirectory,"breditor_wasm"),shared=await runtime(sharedDirectory,"breditor_shared"),schema={name:"example/document-dom-native",version:1};
 const lp=compileStandardLayoutRichProfileV3(local.module,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema,extensions:[]})),sp=shared.module.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema,extensions:[]}));
 const realm=new JSDOM("<!doctype html><body></body>",{pretendToBeVisual:true}),{window}=realm,saved=new Map();
 for(const name of ["window","document","HTMLElement","HTMLInputElement","HTMLSelectElement","Node","Element","AbortController"]){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value:name==="window"?window:name==="document"?window.document:window[name],configurable:true,writable:true});}
 let trials=0,restores=0,future=0,refusedCuts=0,compositions=0,cancelledCompositions=0,toolbarPublications=0,sharedEdges=0,nativeRootSelectAll=0;
 const frames=[];window.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};
 const restore=(bytes,natural)=>natural?lp.restoreDocumentTypingEditor(bytes):lp.restoreDocumentEditor(bytes),allErrors=[];
 try{
  const seed=coverageSeed(lp.descriptor()),presentation=createStandardRichInlinePresentationV1(lp.inlineCatalogJson());
  for(const natural of [false,true])for(const onlyHidden of [false,true]){
   const value=JSON.parse(seed);if(onlyHidden)value.root.children=value.root.children.filter(n=>n.properties["breditor/block-id"]==="hidden");
   const core=lp.createDocumentEditor(JSON.stringify(value));if(natural)core.enableTypingHistory();const host=window.document.createElement("div");window.document.body.append(host);const errors=[];
   const dom=mountDocumentRichEditor(host,{core,selectionEditing:"document-v1",toolbar:createLayoutRichToolbarV3(core,presentation),inlinePresentation:presentation,onError:e=>errors.push(e)});
   try{
    // jsdom does not make contentEditable IDL assignment focusable like a browser; supply a fixture tabindex.
    const before=core.documentJson();dom.surface.tabIndex=0;dom.focus();assert.equal(window.document.activeElement,dom.surface);window.document.getSelection().selectAllChildren(dom.surface);clip(window,dom.surface,"copy");assert.deepEqual(dom.view().selection,{kind:"document"});nativeRootSelectAll++;
    key(window,dom.surface,"a",{metaKey:true});assert.deepEqual(dom.view().selection,{kind:"document"});assert.equal(dom.surface.hasAttribute("data-document-selected"),true);
    const native=window.document.getSelection().getRangeAt(0);assert.equal(native.startContainer,dom.surface);assert.equal(native.endContainer,dom.surface);assert.equal(native.endOffset,dom.surface.childNodes.length);
    const selected=core.checkpointJson(),copied=clip(window,dom.surface,"copy");assert.equal(core.checkpointJson(),selected);assert.ok(copied.get("application/x-breditor-rich+json"));if(onlyHidden)assert.equal(copied.get("text/plain"),"");
    clip(window,dom.surface,"cut",new Map(),false);assert.equal(core.checkpointJson(),selected);assert.equal(errors.length,1);assert.match(String(errors.pop()),/complete rich document/);refusedCuts++;
    clip(window,dom.surface,"cut");assert.equal(JSON.parse(core.documentJson()).root.children.length,1);assert.equal(dom.view().undoDepth,1);dom.execute({kind:"undo"});assert.equal(core.documentJson(),before);assert.deepEqual(dom.view().selection,{kind:"document"});
    clip(window,dom.surface,"paste",copied);assert.notEqual(core.documentJson(),before);assert.equal(dom.view().undoDepth,1);
    let bytes=core.checkpointJson(),recovered=restore(bytes,natural);assert.equal(recovered.checkpointJson(),bytes);restores++;
    try{for(const command of ["undo","redo","undo","redo"]){dom.execute({kind:command});recovered.execute({kind:command});assert.equal(core.checkpointJson(),recovered.checkpointJson());future++;}}finally{recovered.dispose();}
    dom.execute({kind:"undo"});assert.equal(core.documentJson(),before);
    // First key has no invented text endpoint. Following native caret input joins only in natural mode.
    key(window,dom.surface,"Q");input(window,dom.surface,"insertText","🙂");assert.equal(JSON.parse(core.documentJson()).root.children[0].children.map(n=>n.text??"").join(""),"Q🙂");assert.equal(dom.view().undoDepth,natural?1:2);dom.execute({kind:"undo"});if(!natural)dom.execute({kind:"undo"});assert.equal(core.documentJson(),before);assert.deepEqual(dom.view().selection,{kind:"document"});
    // Native outer collapse must preserve content/Redo; a hidden-only document has no visible stop.
    const depth=dom.view().redoDepth;dom.collapseDocumentSelection("after");assert.equal(core.documentJson(),before);assert.equal(dom.view().redoDepth,depth);assert.deepEqual(dom.view().selection,onlyHidden?{kind:"document"}:{kind:"node",block:"tail"});dom.selectDocument();
    for(const data of ["日本🙂",""]){const exact=core.checkpointJson();dom.surface.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));dom.surface.textContent="provisional DOM must not become native content";dom.surface.dispatchEvent(new window.CompositionEvent("compositionend",{bubbles:true,data}));assert.equal(core.checkpointJson(),exact);assert.equal(frames.length,1);frames.shift()(0);if(data){assert.equal(JSON.parse(core.documentJson()).root.children[0].children.map(n=>n.text??"").join(""),data);compositions++;bytes=core.checkpointJson();recovered=restore(bytes,natural);try{assert.equal(recovered.checkpointJson(),bytes);restores++;for(const command of ["undo","redo","undo","redo"]){dom.execute({kind:command});recovered.execute({kind:command});assert.equal(core.checkpointJson(),recovered.checkpointJson());future++;}}finally{recovered.dispose();}dom.execute({kind:"undo"});assert.equal(core.documentJson(),before);}else{assert.equal(core.checkpointJson(),exact);cancelledCompositions++;}}
    // Whole-document layout uses the actual extended view and one existing native coverage command.
    const alignment=dom.toolbar.querySelector('[data-rich-field="block-alignment-value"]');if(!onlyHidden){alignment.value="center";alignment.dispatchEvent(new window.Event("change",{bubbles:true}));dom.toolbar.querySelector('[data-rich-action="block-alignment"]').click();assert.notEqual(core.documentJson(),before);toolbarPublications++;dom.execute({kind:"undo"});assert.equal(core.documentJson(),before);assert.deepEqual(dom.view().selection,{kind:"document"});}
    assert.deepEqual(errors,[]);trials++;
   }finally{allErrors.push(...errors);dom.dispose();host.remove();}
  }
  // The same release Core edge plan crosses the real shared SDK/Wasm boundary without any content edit.
  for(const natural of [false,true])for(const onlyHidden of [false,true]){const value=JSON.parse(seed);if(onlyHidden)value.root.children=value.root.children.filter(n=>n.properties["breditor/block-id"]==="hidden");const core=createSharedDocumentEditor(sp.create(JSON.stringify(value),"101"));try{if(natural)core.enableTypingHistory();core.selectDocument();core.setReadOnly(true);const source=core.documentJson();for(const side of ["before","after"]){core.selectDocument();const before=core.checkpointJson();assert.equal(core.collapseDocumentSelection(side),!onlyHidden);assert.equal(core.documentJson(),source);if(onlyHidden)assert.equal(core.checkpointJson(),before);const exact=core.checkpointJson(),recovered=createSharedDocumentEditor(restoreSharedDocumentEditor(sp,"room",exact,natural?"typing-v1":"explicit"));try{assert.equal(recovered.checkpointJson(),exact);restores++;}finally{recovered.dispose();}sharedEdges++;}}finally{core.dispose();}}
 }finally{lp.dispose();sp.free();window.close();for(const [name,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
 assert.equal(trials,4);assert.equal(restores,16);assert.equal(future,32);assert.equal(refusedCuts,4);assert.equal(compositions,4);assert.equal(cancelledCompositions,4);assert.equal(toolbarPublications,2);assert.equal(sharedEdges,8);assert.equal(nativeRootSelectAll,4);assert.deepEqual(allErrors,[]);
 return{format:"breditor/document-dom-functional-probe",formatVersion:1,localWasmSha256:local.sha256,sharedWasmSha256:shared.sha256,trials,exactRestores:restores,exactFutureCheckpoints:future,refusedUnretainedRichCuts:refusedCuts,compositionCommits:compositions,compositionCancellations:cancelledCompositions,nativeWholeDocumentToolbarPublications:toolbarPublications,sharedNativeEdgeCases:sharedEdges,nativeRootSelectAllCases:nativeRootSelectAll,passed:true,scope:"Compiled local document DOM coordinator and actual release Wasm under synthetic jsdom events: whole-root selection, rich/empty-text Copy/Cut retention, rich paste, first-key input, native collapse, composition commit/cancel, layout toolbar and exact explicit/natural recovery. Shared native edge API tested through release Wasm/SDK; shared DOM/React/relay and OS clipboard/IME/browser/accessibility acceptance remain separate."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected current local/shared release Wasm directories");console.log(JSON.stringify(await probeDocumentDom(...args),null,2));}
