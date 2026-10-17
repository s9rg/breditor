/** Actual native/Wasm controls with synthetic DOM/storage/locks. Not a physical browser qualification. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {JSDOM} from "jsdom";
import {IDBFactory,IDBDatabase} from "fake-indexeddb";
import {StrictMode,act,createElement,createRef} from "react";
import {createRoot} from "react-dom/client";
import {SharedReviewPersistentSession} from "../packages/breditor-collaboration/dist/persistence/review_session.js";
import {SharedRichEditor} from "../packages/breditor-collaboration/dist/core.js";
import {mountSharedReviewPanel} from "../packages/breditor-collaboration/dist/review_panel/mount.js";
import {BreditorSharedReviewPanel} from "../packages/breditor-editor/dist/shared_review_react.js";
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
function button(host,text){const found=[...host.querySelectorAll("button")].find(b=>b.textContent===text);assert.ok(found,`Missing button: ${text}`);return found;}
function input(host,label){const found=[...host.querySelectorAll("label")].find(l=>l.firstChild?.textContent===label)?.querySelector("textarea");assert.ok(found,`Missing field: ${label}`);return found;}
function type(field,value,window){field.value=value;field.dispatchEvent(new window.Event("input",{bubbles:true}));}
async function until(read){for(let i=0;i<1000;i++){if(read())return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error("Timed out waiting for local UI completion");}
export async function probeReviewControlsSdk(directory){
 const dom=new JSDOM("<!doctype html><html><body><main></main></body></html>",{url:"http://review.test/"}),held=new Set(),originals=new Map();
 const locks={request(name,_options,callback){return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,Event:dom.window.Event,navigator:{locks,userAgent:"review-node-probe"},indexedDB:new IDBFactory(),IS_REACT_ACT_ENVIRONMENT:true})){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/review-controls",version:1},extensions:[]}));
 const descriptor=JSON.parse(profile.descriptor_json()),seed=JSON.stringify({format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(JSON.parse(readFileSync(new URL("../crates/breditor-core/tests/fixtures/rich-local-root.json",import.meta.url),"utf8")))});
 const policy={actor:"ui-alice",principal:"alice",access:"comment"},errors=[];let session,panel,peer,reactRoot,abortWrites=false;
 const txOriginal=IDBDatabase.prototype.transaction;
 try{
  session=await SharedReviewPersistentSession.open({database:"review-controls",room:"room",writer:"101",review:policy,history:"typing-v1",rangeEditing:"general-v1",selectionEditing:"document-v1",richLanguage:3,create:()=>profile.create(seed,"101"),restore:s=>profile.restore_document_typing("room",s),onError:e=>errors.push(e)});
  const core=session.core,host=document.querySelector("main"),existing=document.createElement("strong");existing.textContent="Host content retained";host.append(existing);let next=0,quoteReads=0;const originalQuoteRead=core.readReviewQuote.bind(core);core.readReviewQuote=packet=>{quoteReads++;return originalQuoteRead(packet);};
  const options={policy:()=>policy,versions:session,allocatePrefix:()=>`ui-restore-${++next}`,nowMs:()=>"1792200000000",onError:e=>errors.push(e)};
  panel=mountSharedReviewPanel(host,core,options);assert.equal(button(host,"Use editor selection").disabled,true);
  const compose=input(host,"New comment");type(compose,"Literal <img src=x onerror=alert(1)> 日本 🙂",dom.window);button(host,"Use document").click();button(host,"Post comment").click();
  assert.equal(core.reviewSnapshot().view.threads.length,1);assert.equal(host.querySelectorAll("img").length,0);assert.ok(host.textContent.includes("Literal <img"));
  const original=core.reviewSnapshot().view.threads[0].thread.id;
  core.select({kind:"node",block:"image-block"});type(compose,"Diagram comment",dom.window);button(host,"Use editor selection").click();button(host,"Post comment").click();assert.equal(core.reviewSnapshot().view.threads.length,2);
  assert.equal(quoteReads,0);const imageThread=[...host.querySelectorAll("article")][1];button(imageThread,"Show original quotes").click();const displayedQuote=[...imageThread.querySelectorAll("p")].find(p=>p.textContent.startsWith("Original quote:"))?.textContent;assert.ok(displayedQuote?.includes("xy🙂"));assert.equal(imageThread.querySelectorAll("img").length,0);assert.equal(quoteReads,1);
  const first=host.querySelector("article"),reply=input(first,"Reply");type(reply,"Draft reply retained",dom.window);reply.focus();
  core.dispatchReview({kind:"reply",data:{thread:original,body:"Other reply"}});assert.equal(input(first,"Reply"),reply);assert.equal(reply.value,"Draft reply retained");assert.equal(document.activeElement,reply);button(first,"Post reply").click();assert.equal(reply.value,"");
  button(first,"Edit").click();const edit=input(first,"Edit comment");type(edit,"Explicit combined edit",dom.window);
  const peerPolicy={actor:"ui-second-device",principal:"alice",access:"comment"};peer=new SharedRichEditor(profile.join_frame("room","202",core.updateFrame()));peer.enableReview(peerPolicy);peer.receiveReview(core.exportReview(),policy);
  peer.dispatchReview({kind:"edit_message",data:{message:original,body:"Peer message edit"}});core.receiveReview(peer.exportReview(),peerPolicy);
  assert.equal(input(first,"Edit comment"),edit);assert.equal(edit.value,"Explicit combined edit");assert.equal(button(first,"Save edit").disabled,true);
  button(first,"Use current discussion").click();button(first,"Save edit").click();assert.equal(core.reviewSnapshot().view.threads[0].thread.messages[0].versions[0].text,"Explicit combined edit");
  peer.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Peer's accepted work "}}]});peer.dispatchReview({kind:"create_thread",data:{anchorJson:peer.captureReviewAnchor({kind:"selection",selection:{kind:"node",block:"image-block"}}),body:"Waiting for document source"}});core.receiveReview(peer.exportReview(),peerPolicy);
  const pendingThread=[...host.querySelectorAll("article")].at(-1);button(pendingThread,"Show original quotes").click();assert.ok(pendingThread.textContent.includes("waiting for document history"));assert.equal(quoteReads,2);panel.refresh();assert.ok(pendingThread.textContent.includes("waiting for document history"));assert.equal(quoteReads,2);
  await core.receiveFrame(peer.updateFrame());assert.equal(quoteReads,2);button(pendingThread,"Show original quotes").click();assert.ok(pendingThread.textContent.includes("Original quote:"));assert.ok(pendingThread.textContent.includes("xy🙂"));assert.equal(quoteReads,3);
  button(first,"Resolve").click();assert.equal(core.reviewSnapshot().view.threads[0].thread.state,"resolved");button(first,"Reopen").click();assert.equal(core.reviewSnapshot().view.threads[0].thread.state,"open");
  await session.flush();
  IDBDatabase.prototype.transaction=function(...args){const tx=txOriginal.apply(this,args);if(abortWrites&&args[1]==="readwrite")queueMicrotask(()=>{try{tx.abort();}catch{}});return tx;};abortWrites=true;
  type(input(host,"Version name"),"UI saved version",dom.window);button(host,"Save named version").click();await until(()=>host.textContent.includes("Version save failed."));assert.equal(session.versions().length,1);
  abortWrites=false;button(host,"Retry version persistence").click();await until(()=>host.textContent.includes("Version catalog and both histories saved locally."));assert.equal(session.versions().length,1);
  core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"CHANGED "}}]});button(host,"Compare version").click();assert.ok(host.textContent.includes('"identical": false'));
  const documentBefore=core.documentJson();button(host,"Preview restore").click();assert.equal(core.documentJson(),documentBefore);assert.equal(button(host,"Apply restore").disabled,false);
  core.select({kind:"text",anchor:{block:"p",offset:"0",affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}});assert.equal(button(host,"Apply restore").disabled,true);button(host,"Preview restore").click();const reviewBefore=core.reviewCheckpoint();button(host,"Apply restore").click();assert.equal(core.reviewCheckpoint(),reviewBefore);assert.ok(!core.documentJson().includes("CHANGED "));assert.ok(host.textContent.includes("Orphaned: target_deleted"));
  assert.ok(imageThread.textContent.includes(displayedQuote));button(imageThread,"Show original quotes").click();assert.ok(imageThread.textContent.includes(displayedQuote));assert.equal(quoteReads,3);
  core.undo();assert.ok(core.documentJson().includes("CHANGED "));assert.ok(host.textContent.includes("Attached to original target"));
  // UI affordances never grant rights. A stale host display claim still gets a native refusal.
  core.setReviewAccess("read_only");type(reply,"Must not be published",dom.window);const denied=core.reviewCheckpoint();button(first,"Post reply").click();assert.equal(core.reviewCheckpoint(),denied);assert.equal(reply.value,"Must not be published");assert.ok(errors.some(e=>String(e).includes("not permitted")));
  policy.access="read_only";panel.refresh();assert.equal(button(first,"Post reply").disabled,true);policy.access="comment";core.setReviewAccess("comment");
  panel.dispose();panel=undefined;assert.equal(host.firstChild,existing);assert.equal(host.children.length,1);assert.ok(core.reviewSnapshot().view.threads.length>0);
  const reactHost=document.createElement("div");host.append(reactHost);reactRoot=createRoot(reactHost);const ref=createRef();
  await act(async()=>reactRoot.render(createElement(StrictMode,null,createElement(BreditorSharedReviewPanel,{ref,core,initialOptions:options}))));
  assert.ok(ref.current.getPanel());const reactCompose=input(reactHost,"New comment");await act(async()=>type(reactCompose,"React draft survives parent render",dom.window));
  const beforeReact=core.reviewCheckpoint();await act(async()=>reactRoot.render(createElement(StrictMode,null,createElement(BreditorSharedReviewPanel,{ref,core,initialOptions:{...options},className:"updated"}))));
  assert.equal(input(reactHost,"New comment"),reactCompose);assert.equal(reactCompose.value,"React draft survives parent render");assert.equal(core.reviewCheckpoint(),beforeReact);
  await act(async()=>{button(reactHost,"Use document").click();button(reactHost,"Post comment").click();});assert.ok(core.reviewSnapshot().view.threads.some(t=>t.thread.messages.some(m=>m.versions.some(v=>v.text==="React draft survives parent render"))));
  await act(async()=>reactRoot.unmount());reactRoot=undefined;assert.ok(core.reviewSnapshot().view.threads.length>0);await session.flush();await session.close();assert.equal(held.size,0);
  return {format:"breditor/review-controls-sdk-probe",formatVersion:1,sharedWasmSha256:createHash("sha256").update(bytes).digest("hex"),passed:true,checks:["plain literal comment text, explicit document/selection targets","keyed draft/focus retention through native updates","guarded edits after a peer message change","resolve/reopen and separate comment history","lazy original quotes without per-keystroke historical reads","pending quote status survives refresh, then retries explicitly after native document catchup","original quotes remain readable after target removal by version restore","failed version save retry without duplicate capture","pure native restore preview, stale rejection and explicit apply","current comments retained/orphaned/reattached through restore Undo","native policy still rejects a stale UI claim without losing drafts","borrowed DOM disposal preserves host and native owner","React StrictMode and parent rerenders preserve native ownership and drafts"],scope:"Actual packaged Wasm, vanilla/React review controls and paired native persistence with synthetic DOM/IndexedDB/Web Locks. Physical browsers, shared catalog and suggestions remain outside this probe; authenticated comment transport has separate native/SDK acceptance."};
 }finally{abortWrites=false;IDBDatabase.prototype.transaction=txOriginal;if(reactRoot)await act(async()=>reactRoot.unmount());panel?.dispose();peer?.dispose();await session?.discardAndClose();profile.free();dom.window.close();for(const[key,old]of originals){if(old)Object.defineProperty(globalThis,key,old);else delete globalThis[key];}}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error("Expected actual shared Wasm directory");console.log(JSON.stringify(await probeReviewControlsSdk(process.argv[2]),null,2));}
