/** Real optional Wasm/SDK, durable revision outbox and authenticated peer edits; synthetic DOM. */
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {ReviewWireFixture} from "./probe-review-relay.mjs";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label){for(let n=0;n<1500;n++){if(predicate())return;await pause(5);}throw Error(`Timed out: ${label}`);}
const nodes=node=>node.kind==="element"?[node,...node.children.flatMap(nodes)]:[];
const node=(document,id)=>nodes(JSON.parse(document).root).find(n=>n.properties["breditor/block-id"]===id);
const text=(document,id)=>node(document,id).children.map(n=>n.text??"").join("");
const characters=(document,id)=>node(document,id).children.flatMap(run=>[...(run.text??"")].map(value=>({value,formats:run.formats})));
const has=(character,kind)=>character.formats.some(format=>format.type===kind);
const command=(offset,length,kind,enabled)=>({kind:"set_format",data:{block:"caption",offset,length,format:{type:kind,properties:{}},enabled}});
const insertion=(offset,value)=>({kind:"insert_text",data:{block:"caption",offset,text:value}});
function button(host,label){const value=[...host.querySelectorAll("button")].find(n=>n.textContent===label);assert.ok(value,label);return value;}
function field(host,label){const value=[...host.querySelectorAll("label")].find(n=>n.firstChild?.textContent===label)?.querySelector("textarea,select");assert.ok(value,label);return value;}
function select(host,id,window){const value=field(host,"Suggestion");value.value=id;value.dispatchEvent(new window.Event("change",{bubbles:true}));}

export async function exerciseReaderFormattingRebase({reader,queue,revisions,transport,trial}){
 revisions.disconnect();const core=reader.core,offset=text(core.documentJson(),"caption").indexOf("x");assert.ok(offset>=0);assert.equal(core.view().readOnly,true);
 const root=queue.propose(`Reader formatting ${trial}`,"60",{scope:"commands",edit:{kind:"commands",data:[command(offset,1,"breditor/strong",true)]}}),before=reader.exportRecovery(),beforeDocument=core.documentJson();
 const result=revisions.rebaseFormat({previousSuggestionId:root.id,title:"Reader formatting revision",createdAtMs:"61",revision:core.view().revision});assert.equal(result.kind,"queued");assert.deepEqual(reader.exportRecovery(),before);assert.throws(()=>queue.packet(result.revision.suggestion.id),error=>error.code==="suggestion_unknown");
 await revisions.flush();await revisions.connect();assert.ok(revisions.status(result.revision.id).receipt);assert.equal(core.documentJson(),beforeDocument);
 assert.equal(core.writerClockV2(queue.identity().documentWriter).through,"0");assert.equal(transport.suggestionState().permissions.canAccept,false);await assert.rejects(transport.requestSuggestion({kind:"suggestionDecide",suggestionId:result.revision.suggestion.id,decision:"accept"}),error=>error.code==="suggestion_observer_accept");
 return {pureNativeCapture:true,authenticatedCreatorSupersession:true,documentAuthoredThrough:"0",acceptRefused:true,passed:true};
}

export async function exerciseFormattingRebase({sdk,profile,endpoint,token,getState,reopen,trial,reactModule=new URL("../packages/breditor-editor/dist/shared_suggestion_react.js",import.meta.url),reactRuntime,reactDomRuntime}){
 const peerWire=new ReviewWireFixture(endpoint),errors=[],reports=[];let peer,peerThrough="0";
 async function submitPeer(commands){const {relay}=getState();relay.disconnect();peer.dispatch({commands});for(const group of peer.writerGroupsV2(peerThrough).groups)assert.equal((await peerWire.request({kind:"submit",group})).kind,"durable");peerThrough=peer.writerClockV2(registration.lease.writer).through;const response=await peerWire.request({kind:"sync"});assert.equal(response.kind,"catchup");await getState().session.core.receiveFrame(response.frame);}
 const initial=getState();initial.sync.disconnect();initial.revisions.disconnect();await initial.relay.connect();await initial.relay.flush();initial.relay.disconnect();
 const authenticated=await peerWire.request({kind:"authenticate",principal:"alice",token,capabilities:["writerTransportV2"]});assert.equal(authenticated.kind,"authenticated");const registration=(await peerWire.request({kind:"register"})).registration;
 peer=new sdk.SharedRichEditor(profile.join_frame("room",registration.lease.writer,authenticated.frame));
 // No accepted edit or inferred JS range is used for rebasing: offsets below select only the
 // known fixture's original lower-case x/y when creating each ordinary proposal.
 const reviewBefore=initial.session.core.reviewCheckpoint();
 try{for(const react of [false,true]){
  let {session,queue,relay,sync,revisions}=getState();sync.disconnect();revisions.disconnect();await relay.connect();await relay.flush();relay.disconnect();await peer.receiveFrame((await peerWire.request({kind:"sync"})).frame);
  const sourceText=text(session.core.documentJson(),"caption"),x=sourceText.indexOf("x"),y=sourceText.indexOf("y"),enabled=!react;assert.ok(x>=0&&y>x);
  const actions=react?[command(x,1,"breditor/strong",enabled),command(y,1,"breditor/strong",enabled),command(x,1,"breditor-inline/italic",enabled)]:[command(x,2,"breditor/strong",enabled),command(x,1,"breditor-inline/italic",enabled)];
  const root=queue.propose(`Formatting ${react?"React":"vanilla"} ${trial}`,String(30+Number(react)),{scope:"commands",edit:{kind:"commands",data:actions}}),previous=queue.packet(root.id);
  await submitPeer([insertion(0,react?"Q":"P"),insertion(x+2,react?"Z":"X"),command(y+2,1,react?"breditor-inline/strike":"breditor-inline/underline",true)]);
  assert.equal(session.core.prepareSuggestion(previous).kind,"conflict");
  if(!react){
   const position=text(session.core.documentJson(),"caption").indexOf("🙂"),conflictRoot=queue.propose("Changed touched value","32",{scope:"commands",edit:{kind:"commands",data:[command(position,2,"breditor/strong",true)]}});
   await submitPeer([command(position,2,"breditor/strong",true)]);
   const retained=revisions.revisions().length,conflict=revisions.rebaseFormat({previousSuggestionId:conflictRoot.id,title:"Must stay conflict",createdAtMs:"33"});assert.deepEqual(conflict,{kind:"conflict",reason:{kind:"format_changed"}});assert.equal(revisions.revisions().length,retained);
   const unsupported=queue.propose("Non-formatting intent","34",{scope:"commands",edit:{kind:"commands",data:[insertion(0,"Never accepted unsupported ")]}});
   assert.deepEqual(revisions.rebaseFormat({previousSuggestionId:unsupported.id,title:"No fallback",createdAtMs:"35"}),{kind:"unsupported"});assert.equal(revisions.revisions().length,retained);
  }
  const before=session.core.documentJson(),beforeSource=session.exportRecovery(),beforeReview=session.core.reviewCheckpoint(),dom=new JSDOM("<!doctype html><main><strong>Host content</strong></main>"),host=dom.window.document.querySelector("main"),originals=new Map();let panel,reactRoot,React,act=work=>work();
  const options={source:sdk.createSharedSuggestionPanelSource(queue,sync,revisions),policy:()=>({canPropose:true,canAccept:true,canReject:true}),nowMs:()=>String(40+Number(react)),onError:error=>errors.push(error)};
  try{
   if(react){
    for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,navigator:{...globalThis.navigator,userAgent:"format-rebase-probe"},IS_REACT_ACT_ENVIRONMENT:true})){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
    React=await(reactRuntime?import(reactRuntime):import("react"));const ReactDom=await(reactDomRuntime?import(reactDomRuntime):import("react-dom/client")),{BreditorSharedSuggestionPanel}=await import(reactModule),ref=React.createRef();reactRoot=ReactDom.createRoot(host);act=work=>React.act(work);await act(async()=>reactRoot.render(React.createElement(React.StrictMode,null,React.createElement(BreditorSharedSuggestionPanel,{ref,core:session.core,initialOptions:options}))));panel=ref.current.getPanel();
   }else panel=sdk.mountSharedSuggestionPanel(host,session.core,options);
   select(host,root.id,dom.window);assert.equal(button(host,"Rebase formatting suggestion").disabled,false);await act(async()=>button(host,"Rebase formatting suggestion").click());
   await until(()=>host.textContent.includes("Formatting revision saved locally"),"native formatting revision saved by borrowed controls");
   const revision=revisions.revisions().find(row=>row.previousSuggestionId===root.id);assert.ok(revision);const packet=revisions.packet(revision.id);assert.deepEqual(session.exportRecovery(),beforeSource);assert.equal(session.core.documentJson(),before);assert.equal(session.core.reviewCheckpoint(),beforeReview);assert.throws(()=>queue.packet(revision.suggestion.id),error=>error.code==="suggestion_unknown");assert.equal(button(host,"Queue Accept").disabled,true);assert.equal(button(host,"Queue Reject").disabled,true);
   const candidate=session.core.prepareSuggestion(revisions.suggestionPacket(revision.id));assert.equal(candidate.kind,"ready");const proposed=characters(candidate.preview.documentJson(),"caption"),current=characters(before,"caption");candidate.preview.dispose();
   for(const value of proposed){const prior=current.find(c=>c.value===value.value);if(value.value==="x"||value.value==="y")assert.equal(has(value,"breditor/strong"),enabled);else assert.deepEqual(value.formats,prior.formats,"No new or unselected character is reformatted");}
   assert.equal(has(proposed.find(c=>c.value==="x"),"breditor-inline/italic"),enabled);assert.equal(has(proposed.find(c=>c.value==="y"),"breditor-inline/underline"),true);if(react)assert.equal(has(proposed.find(c=>c.value==="y"),"breditor-inline/strike"),true);
   if(react){await act(async()=>reactRoot.unmount());reactRoot=undefined;}else panel.dispose();panel=undefined;
   const exactOutbox=revisions.exportRecovery(),exactQueue=queue.exportRecovery();await reopen();({session,queue,relay,sync,revisions}=getState());assert.deepEqual(session.exportRecovery(),beforeSource);assert.deepEqual(revisions.exportRecovery(),exactOutbox);assert.deepEqual(queue.exportRecovery(),exactQueue);assert.equal(revisions.packet(revision.id),packet);assert.equal(revisions.status(revision.id).receipt,null);assert.throws(()=>queue.packet(revision.suggestion.id),error=>error.code==="suggestion_unknown");
   const nativeRebase=session.core.rebaseSuggestionFormat;session.core.rebaseSuggestionFormat=()=>{throw Error("Retries must never recapture a formatting revision");};try{await revisions.connect();await until(()=>queue.proposals().some(row=>row.id===revision.suggestion.id),"committed formatting child bridge");}finally{session.core.rebaseSuggestionFormat=nativeRebase;}
   assert.ok(revisions.status(revision.id).receipt);assert.equal(queue.status(root.id).decision.decision,"reject");assert.equal(session.core.documentJson(),before);
   const prepared=session.core.prepareSuggestion(queue.packet(revision.suggestion.id));assert.equal(prepared.kind,"ready");const expected=prepared.preview.documentJson();queue.queueDecision(revision.suggestion.id,"accept",String(50+Number(react)),prepared.preview);prepared.preview.dispose();assert.equal(session.core.documentJson(),before);await sync.connect();await sync.flushShared();assert.equal(queue.status(revision.suggestion.id).decision.acceptingWriter,queue.identity().documentWriter);assert.ok(session.core.adoptedSuggestion(revision.suggestion.id));assert.equal(session.core.documentJson(),expected);
   assert.equal(session.core.undo(),true);assert.equal(session.core.documentJson(),before);assert.equal(session.core.redo(),true);assert.equal(session.core.documentJson(),expected);await relay.flush();assert.equal(session.core.reviewCheckpoint(),beforeReview);
   reports.push({react,pureNativeControlCapture:true,exactOfflineReopen:true,uncommittedChildDecisionRefusal:true,originalRevisionBytesRetried:true,peerTextAndUnrelatedMarksPreserved:true,authenticatedSupersession:true,ownedAcceptUndoRedo:true});
  }finally{if(reactRoot)await React.act(async()=>reactRoot.unmount());else panel?.dispose();dom.window.close();for(const [key,value]of originals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
 }
 assert.equal(getState().session.core.reviewCheckpoint(),reviewBefore);assert.deepEqual(errors,[]);return {trial,controls:reports,formatValueConflictRefusal:true,unsupportedWithoutFallback:true,pairedCommentHistoryUnchanged:true,passed:true};
 }finally{peer?.dispose();peerWire.close();}
}
