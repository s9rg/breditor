/** Actual Wasm + permanent Reader observer, exported queue/sync SDKs and isolated Rust host.
 * Browser storage/locks/lost replies are fixtures; no document-author lease is acquired by readers. */
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {mkdtempSync,readFileSync,writeFileSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {WebSocket as NativeWebSocket} from "undici";
import {IDBFactory,IDBDatabase} from "fake-indexeddb";
import {ReviewWireFixture,startReviewHost} from "./probe-review-relay.mjs";
const origin="http://127.0.0.1:49785",pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const save=(path,value)=>writeFileSync(path,value,{mode:0o600}),code=expected=>error=>error.code===expected;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function locks(){const held=new Set();return {held,request(name,_options,callback){return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};}
async function until(test,label){for(let n=0;n<1500;n++){if(test())return;await pause(5);}throw Error(`Timed out: ${label}`);}
const insert=text=>({kind:"insert_text",data:{block:"p",offset:0,text}}),draft=commands=>({scope:"commands",edit:{kind:"commands",data:commands}});
export async function probeSuggestionObserverSdk(directory,executable,{controls=false,sdkDirectory=new URL("../packages/breditor-collaboration/dist/",import.meta.url),sdkModule=new URL("index.js",sdkDirectory)}={}){
 const {SharedReviewPersistentSession,SharedSuggestionQueue,SharedSuggestionSync,SharedRelaySync,createSharedDocumentRelaySync,registerSharedSuggestionObserver,sharedSuggestionObserverQueueIdentity,SharedSuggestionObserverRelay}=await import(sdkModule);
 const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 const configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/suggestion-observer",version:1},extensions:[]}),profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(configuration),descriptor=JSON.parse(profile.descriptor_json()),source=JSON.stringify({format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(JSON.parse(readFileSync(new URL("../crates/breditor-core/tests/fixtures/rich-local-root.json",import.meta.url),"utf8")))});
 const originals=new Map(),lockHost=locks(),transaction=IDBDatabase.prototype.transaction;
 let abortDatabase,dropReject=false,requests=0,currentReader;
 const readerRequests=new Map(),readerSockets=new WeakMap();
 for(const [key,value] of Object.entries({indexedDB:new IDBFactory(),navigator:{locks:lockHost},WebSocket:class extends NativeWebSocket{
  constructor(url){super(url,{headers:{Origin:origin}});this.principal=null;super.addEventListener("close",()=>{
   const reader=readerSockets.get(this);
   if(reader)reader.closed=true;
  });}
  send(value){requests++;assert.ok(requests<10000,"An unchanged observer must not spin");const request=JSON.parse(value).request;if(request.kind==="authenticate")this.principal=request.principal;if(this.principal==="carol"){readerRequests.set(request.kind,(readerRequests.get(request.kind)??0)+1);assert.ok(!["register","resume","submit"].includes(request.kind),"Reader networking must never acquire/resume an author or submit document groups");if(request.kind==="suggestionDecide")assert.equal(request.decision.decision,"reject");}return super.send(value);}
  addEventListener(type,listener,options){if(type!=="message")return super.addEventListener(type,listener,options);return super.addEventListener(type,event=>{
   const {result}=JSON.parse(String(event.data));
   if(this.principal==="carol"){
    if(result.kind==="observerResumed"){
     currentReader={socket:this,lease:result.lease,closed:false,rejected:false};
     readerSockets.set(this,currentReader);
    }
    const reader=readerSockets.get(this);
    if(reader&&result.kind==="error"&&result.code==="lease_rejected")reader.rejected=true;
    if(dropReject&&result.kind==="suggestionDecisionAdmission"&&result.admission.kind==="durable"){dropReject=false;this.close();return;}
   }
   if(typeof listener==="function")listener.call(this,event);else listener.handleEvent(event);
  },options);}
 }})){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(this.name===abortDatabase&&args[1]==="readwrite")queueMicrotask(()=>{try{tx.abort();}catch{}});return tx;};
 const counts={trials:0,exactOfflineReopens:0,readerProposalRejects:0,foreignAcceptImports:0,pendingPeerSources:0,grantTransitions:0,acceptRefusalsAfterEditorGrant:0,lostRejectReplies:0,sourceSaveRefusals:0,hostRestarts:0,idleWithoutPolling:0},readerControlWorkflows=[];
 try{for(const scope of ["original","general-v1","document-v1"])for(const natural of [false,true]){
  const trial=counts.trials,document=scope==="document-v1",general=scope!=="original",temporary=mkdtempSync(join(tmpdir(),"breditor-suggestion-observer-")),paths=["room.log","profile.json","document.json","auth.json"].map(name=>join(temporary,name)),tokens=Object.fromEntries(["alice","carol","functional-owner"].map(principal=>[principal,randomBytes(32).toString("hex")]));
  save(paths[1],configuration);save(paths[2],source);save(paths[3],JSON.stringify({format:"breditor/relay-auth",formatVersion:1,origins:[origin],accounts:Object.entries(tokens).map(([principal,token])=>({principal,tokenHash:[...createHash("sha256").update(token).digest()]}))}));
  const sessions={},queues={},relays={},syncs={},options={},queueOptions={},errors=[];let server,admin,readerIdentity,authorIdentity,phase="setup";
  const restore=(checkpoint,policy)=>document?(policy.history==="typing-v1"?profile.restore_document_typing("room",checkpoint):profile.restore_document("room",checkpoint)):general?(policy.history==="typing-v1"?profile.restore_general_typing("room",checkpoint):profile.restore_general("room",checkpoint)):(policy.history==="typing-v1"?profile.restore_typing("room",checkpoint):profile.restore("room",checkpoint));
  const attach=principal=>{const storage=sessions[principal],common={getToken:()=>tokens[principal],autoConnect:false,requestTimeoutMs:3000,reconnectMinimumMs:50,reconnectMaximumMs:200,onError:error=>errors.push(error)};
   if(principal==="carol")relays.carol=new SharedSuggestionObserverRelay({...common,identity:readerIdentity,storage});else{const argument={...common,identity:authorIdentity,suggestions:{binding:readerIdentity.binding,effectWriter:readerIdentity.effectWriter},persistLocal:async()=>{storage.save();await storage.flush();}};relays.alice=document?createSharedDocumentRelaySync(storage.core,{...argument,selectionEditing:"document-v1"}):new SharedRelaySync(storage.core,argument);}syncs[principal]=new SharedSuggestionSync(queues[principal],relays[principal],{onError:error=>errors.push(error)});
  };
  const observeGrant=async role=>{
   const prior=currentReader;
   assert.ok(prior&&!prior.closed&&!prior.rejected);
   assert.equal(prior.lease.writer,readerIdentity.documentWriter);
   assert.equal((await admin.request({kind:"grant",principal:"carol",role})).kind,"granted");
   // The server can close after an unsolicited lease error. A transport loss
   // may start an automatic resume before the observer reports a fenced state.
   await until(()=>prior.rejected||prior.closed,`${role} grant terminates the prior Reader lease`);
   await relays.carol.connect();
   await syncs.carol.connect();
   assert.ok(currentReader.socket!==prior.socket,"Resume must use a distinct observer connection");
   assert.ok(typeof currentReader.lease.token==="string"&&currentReader.lease.token!==prior.lease.token,
    "Resume must replace the prior observer lease");
   assert.equal(currentReader.lease.writer,readerIdentity.documentWriter);
   assert.equal(relays.carol.state().status,"ready");
   const core=sessions.carol.core;
   assert.equal(core.view().readOnly,true);
   assert.equal(core.writerClockV2(readerIdentity.documentWriter).through,"0");
   assert.equal(syncs.carol.state().permissions.canAccept,false);
  };
  const propose=(principal,title,commands,choice)=>{const queue=queues[principal],info=queue.propose(title,"1792200000000",draft(commands));if(choice){const prepared=choice==="accept"?sessions[principal].core.prepareSuggestion(queue.packet(info.id)):undefined;if(prepared)assert.equal(prepared.kind,"ready");try{queue.queueDecision(info.id,choice,"1792200000001",prepared?.preview);}finally{prepared?.preview.dispose();}}return info;};
  try{
   server=await startReviewHost(executable,[...paths,"127.0.0.1:0"]);const endpoint=`ws://${server.address}/ws`;admin=new ReviewWireFixture(endpoint);const auth=await admin.request({kind:"authenticate",principal:"alice",token:tokens.alice,capabilities:["writerTransportV2","documentSuggestionsV1"]}),registered=(await admin.request({kind:"register"})).registration;admin.close();admin=undefined;
   authorIdentity={endpoint,principal:"alice",room:"room",writer:registered.lease.writer,credential:registered.credential,writerTransport:"atomic-v2"};let pinned;
   const observed=await registerSharedSuggestionObserver({endpoint,principal:"carol",room:"room",writerTransport:"atomic-v2",getToken:()=>tokens.carol,saveIdentity:identity=>{pinned=identity;save(join(temporary,"reader-secret.json"),JSON.stringify(identity));}});readerIdentity=observed.identity;assert.deepEqual(readerIdentity,pinned);assert.deepEqual(observed.permissions,{role:"review",canPropose:true,canAccept:false,canReject:true});
   for(const principal of ["alice","carol"]){const writer=principal==="alice"?authorIdentity.writer:readerIdentity.documentWriter,initial=principal==="alice"?auth.frame:observed.frame;
    options[principal]={database:`observer-${trial}-source-${principal}`,room:"room",writer,review:{actor:`observer-${trial}-${principal}`,principal,access:"read_only"},richLanguage:3,history:natural?"typing-v1":"explicit",rangeEditing:general?"general-v1":"original",selectionEditing:document?"document-v1":"original",create:()=>profile.join_frame("room",writer,initial),restore,onError:error=>errors.push(error)};
    sessions[principal]=await SharedReviewPersistentSession.open(options[principal]);queueOptions[principal]={database:`observer-${trial}-queue-${principal}`,identity:principal==="carol"?sharedSuggestionObserverQueueIdentity(readerIdentity):{...sharedSuggestionObserverQueueIdentity(readerIdentity),principal:"alice",documentWriter:writer}};queues[principal]=await SharedSuggestionQueue.open({...queueOptions[principal],storage:sessions[principal]});attach(principal);
   }
   let c=sessions.carol.core;assert.equal(c.view().readOnly,true);assert.throws(()=>c.dispatch({commands:[insert("Must not author")]}),code("read_only"));const before=c.documentJson(),info=propose("carol","Offline Reader proposal 日本 🙂",[insert("Reader proposed text ")],"reject");await queues.carol.flush();assert.equal(c.documentJson(),before);
   phase="exact offline Reader recovery";const pair=sessions.carol.exportRecovery(),queue=queues.carol.exportRecovery();syncs.carol.dispose();relays.carol.dispose();await queues.carol.close();await sessions.carol.close();sessions.carol=await SharedReviewPersistentSession.open(options.carol);assert.deepEqual(sessions.carol.exportRecovery(),pair);queues.carol=await SharedSuggestionQueue.open({...queueOptions.carol,storage:sessions.carol});assert.deepEqual(queues.carol.exportRecovery(),queue);attach("carol");c=sessions.carol.core;counts.exactOfflineReopens++;
   await relays.alice.connect();await relays.carol.connect();await syncs.carol.flushShared();assert.equal(queues.carol.status(info.id).decision.decision,"reject");assert.equal(c.documentJson(),before);assert.equal(c.writerClockV2(readerIdentity.documentWriter).through,"0");counts.readerProposalRejects++;
   phase="accepted foreign effect import";const accepted=propose("alice","Author accepts an image field",[{kind:"set_image_alt",data:{block:"image-block",text:"Accepted by an actual author",decorative:false}}],"accept");await syncs.alice.flushShared();await until(()=>syncs.carol.entries().some(entry=>entry.publication.suggestion.id===accepted.id),"Reader discovers accepted proposal");await syncs.carol.loadSuggestion(accepted.id);assert.equal(queues.carol.status(accepted.id).decision.acceptingWriter,authorIdentity.writer);assert.match(c.documentJson(),/Accepted by an actual author/);assert.equal(c.view().undoDepth,0);counts.foreignAcceptImports++;
   phase="already retained peer source becomes host durable";relays.alice.disconnect();sessions.alice.core.dispatch({commands:[insert("Peer source ")]});await c.receiveFrame(sessions.alice.core.updateFrame());const dependent=propose("carol","Reader waits for peer source",[{kind:"set_heading",data:{block:"p",level:2}}]);await queues.carol.flush();await syncs.carol.refresh();await until(()=>syncs.carol.state().waitingForDocument,"pending Reader proposal");assert.equal(queues.carol.status(dependent.id).publication,null);await relays.alice.connect();await relays.alice.flush();await syncs.carol.flushShared();assert.ok(queues.carol.status(dependent.id).publication);counts.pendingPeerSources++;
   phase="live independent proposal grant";admin=new ReviewWireFixture(endpoint);assert.equal((await admin.request({kind:"authenticate",principal:"functional-owner",token:tokens["functional-owner"],capabilities:["writerTransportV2","documentSuggestionsV1"]})).kind,"authenticated");assert.equal((await admin.request({kind:"suggestionGrant",principal:"carol",role:null})).kind,"suggestionGranted");await until(()=>syncs.carol.state().permissions?.canPropose===false,"revoked proposal grant");const held=propose("carol","Preserve denied offline intent",[{kind:"set_heading",data:{block:"p",level:3}}]);await queues.carol.flush();await assert.rejects(syncs.carol.flushShared(),code("permission_denied"));assert.equal(queues.carol.status(held.id).publication,null);assert.equal((await admin.request({kind:"suggestionGrant",principal:"carol",role:"review"})).kind,"suggestionGranted");await until(()=>queues.carol.status(held.id).publication&&queues.carol.status(held.id).localSaved,"restored proposal grant resumes Reader intent");counts.grantTransitions++;
   phase="an Editor grant cannot promote a permanent observer";await observeGrant("editor");const plan=c.prepareSuggestion(queues.carol.packet(dependent.id));assert.equal(plan.kind,"ready");queues.carol.queueDecision(dependent.id,"accept","1792200000002",plan.preview);plan.preview.dispose();await queues.carol.flush();const sent=readerRequests.get("suggestionDecide")??0;await assert.rejects(syncs.carol.flushShared(),code("permission_denied"));await assert.rejects(relays.carol.requestSuggestion({kind:"suggestionDecide",suggestionId:dependent.id,decision:"accept"}),code("suggestion_observer_accept"));assert.equal(readerRequests.get("suggestionDecide")??0,sent);queues.carol.stopRetryingDecision(dependent.id);queues.carol.queueDecision(dependent.id,"reject","1792200000003");await syncs.carol.flushShared();assert.equal(queues.carol.status(dependent.id).decision.decision,"reject");await observeGrant("reader");counts.acceptRefusalsAfterEditorGrant++;
   phase="lost final Reject reply";dropReject=true;const lost=propose("carol","Recover one rejected decision",[{kind:"set_heading",data:{block:"p",level:4}}],"reject");await assert.rejects(syncs.carol.flushShared());await until(()=>queues.carol.status(lost.id).decision&&queues.carol.status(lost.id).localSaved,"automatic Reader original Reject recovery");assert.equal(queues.carol.status(lost.id).decision.decision,"reject");counts.lostRejectReplies++;
   phase="source save failure retains the borrowed owner";syncs.carol.disconnect();relays.carol.disconnect();sessions.alice.core.dispatch({commands:[insert("New source before failure ")]});await relays.alice.flush();abortDatabase=options.carol.database;await assert.rejects(relays.carol.connect(),code("local_save_failed"));assert.equal(relays.carol.state().status,"local-save-failed");assert.equal(c.writerClockV2(readerIdentity.documentWriter).through,"0");c.documentJson();abortDatabase=undefined;await sessions.carol.retry();await queues.carol.retry();await syncs.carol.connect();counts.sourceSaveRefusals++;
   phase="automatic Reader host restart";admin.close();admin=undefined;const address=server.address,old=queues.carol.status(lost.id).decision;await server.crash();server=await startReviewHost(executable,[...paths,address]);await until(()=>syncs.carol.state().status==="ready"&&syncs.alice.state().status==="ready","automatic observer reconnect");assert.deepEqual(queues.carol.status(lost.id).decision,old);assert.equal(c.writerClockV2(readerIdentity.documentWriter).through,"0");counts.hostRestarts++;
   phase="idle without polling";await pause(100);const idle=requests;await pause(150);assert.equal(requests,idle);counts.idleWithoutPolling++;
   if(controls){const {exerciseReaderSuggestionControls}=await import("./probe-suggestion-controls-workflow.mjs");readerControlWorkflows.push(await exerciseReaderSuggestionControls({sdkModule,core:c,queue:queues.carol,sync:syncs.carol,relay:relays.carol,trial}));}
   assert.ok(errors.every(error=>["connection_lost","local_save_failed","lease_rejected","review_record_write"].includes(error.code)),errors.map(String).join("\n"));counts.trials++;
  }catch(error){throw Error(`trial ${trial}, ${scope}, natural=${natural}, ${phase}: ${error.message}; observer=${JSON.stringify(relays.carol?.state())}; reported=${errors.map(e=>e.code??String(e)).join(",")}`,{cause:error});}
  finally{abortDatabase=undefined;dropReject=false;admin?.close();for(const principal of ["alice","carol"]){syncs[principal]?.dispose();relays[principal]?.dispose();await queues[principal]?.discardAndClose();await sessions[principal]?.discardAndClose();}await server?.stop();}
 }}finally{IDBDatabase.prototype.transaction=transaction;profile.free();for(const [key,value] of originals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
 assert.equal(lockHost.held.size,0);for(const [key,value] of Object.entries(counts))assert.equal(value,6,key);assert.equal(readerRequests.get("registerObserver"),6);assert.ok((readerRequests.get("resumeObserver")??0)>=18);
 if(controls)assert.equal(readerControlWorkflows.length,6);
 return {format:"breditor/suggestion-observer-sdk-probe",formatVersion:1,sharedWasmSha256:hash(bytes),nativeRelaySha256:hash(readFileSync(executable)),...counts,...(controls?{readerControlWorkflows}:{}),readerAuthorRegistrations:readerRequests.get("register")??0,readerAuthorResumes:readerRequests.get("resume")??0,readerDocumentSubmissions:readerRequests.get("submit")??0,readerObserverRegistrations:readerRequests.get("registerObserver"),readerObserverResumes:readerRequests.get("resumeObserver"),wireRequests:requests,passed:true,scope:`Actual application Wasm and exported SDKs beside an authenticated durable native host. Reader-only discovery/proposals/Reject, exact offline recovery, foreign Accept catchup, pending peer sources, live grants, permanent refusal to Accept after Editor grant, lost final replies, source-save failures and automatic host restart across all six scope/grouping policies. Reader authored prefixes remain zero and no author registration/resume/submission is sent. ${controls?"Borrowed native Reader panels additionally capture/preview offline proposals and queue/finalize Reject without enabling Accept.":"This transport-only probe does not exercise UI controls."} IndexedDB/Web Locks and lost replies are fixtures; rebasing and production/browser qualification remain open.`};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error("Expected actual application Wasm directory and isolated suggestion host");console.log(JSON.stringify(await probeSuggestionObserverSdk(...process.argv.slice(2)),null,2));}
