/** Actual packaged Wasm/SDK + opt-in authenticated durable loopback review host.
 * This explicitly drives wire requests; it does NOT claim an automatic SDK sync adapter. */
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {readFileSync,writeFileSync,mkdtempSync,realpathSync} from "node:fs";
import {startReviewHost} from "./fixtures/relay-host.mjs";
export {startReviewHost} from "./fixtures/relay-host.mjs";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {WebSocket} from "undici";

const root=resolve(fileURLToPath(new URL("..",import.meta.url))),origin="http://127.0.0.1:49785";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const save=(path,value)=>writeFileSync(path,value,{mode:0o600});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const create=(anchorJson,body)=>({kind:"create_thread",data:{anchorJson,body}});
const reply=(thread,body)=>({kind:"reply",data:{thread,body}});
const nodeTarget={kind:"selection",selection:{kind:"node",block:"image-block"}};
export class ReviewWireFixture {
 constructor(endpoint){this.socket=new WebSocket(endpoint,{headers:{Origin:origin}});this.pending=new Map();this.events=[];this.serial=0;this.opened=new Promise((resolve,reject)=>{this.socket.addEventListener("open",resolve,{once:true});this.socket.addEventListener("error",()=>reject(Error("Socket failed")),{once:true});});this.socket.addEventListener("message",event=>{const envelope=JSON.parse(event.data);assert.equal(envelope.format,"breditor/relay");assert.equal(envelope.formatVersion,1);if(envelope.id===null){this.events.push(envelope.result);assert.ok(this.events.length<512);return;}const pending=this.pending.get(envelope.id);assert.ok(pending,"Only requested responses are accepted");this.pending.delete(envelope.id);clearTimeout(pending.timer);pending.resolve(envelope.result);});this.socket.addEventListener("close",()=>{for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(Error("Socket closed"));}this.pending.clear();});}
 async request(request){await this.opened;const id=String(++this.serial);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("Request timed out")),15000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({format:"breditor/relay",formatVersion:1,id,request}));});}
 close(){this.socket.close();}
}
export async function probeReviewRelay(directory,executable){
 const {SharedRichEditor,createSharedDocumentEditor}=await import("../packages/breditor-collaboration/dist/core.js");
 const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 const configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/review-network-functional",version:1},extensions:[]});
 const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(configuration),descriptor=JSON.parse(profile.descriptor_json());
 const source=JSON.stringify({format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(JSON.parse(readFileSync(join(root,"crates/breditor-core/tests/fixtures/rich-local-root.json"),"utf8")))});
 let trials=0,restores=0,future=0,pending=0,receipts=0,moderations=0,versions=0,observerRefusals=0,modeRefusals=0,saveRefusals=0;
 try{for(const natural of [false,true]){
  const temporary=mkdtempSync(join(tmpdir(),"breditor-review-relay-")),paths=["room.log","profile.json","document.json","auth.json"].map(name=>join(temporary,name)),tokens=Object.fromEntries(["alice","bob","carol","functional-owner"].map(name=>[name,randomBytes(32).toString("hex")]));
  save(paths[1],configuration);save(paths[2],source);save(paths[3],JSON.stringify({format:"breditor/relay-auth",formatVersion:1,origins:[origin],accounts:Object.entries(tokens).map(([principal,token])=>({principal,tokenHash:[...createHash("sha256").update(token).digest()]}))}));
  const policies=Object.fromEntries(["alice","bob","carol"].map(principal=>[principal,{actor:`${principal}.review`,principal,access:principal==="carol"?"moderate":"comment"}]));
  const cores={},channels={},identities={},cursors={},errors=[];let server,legacy,owner;
  const facade=raw=>natural?createSharedDocumentEditor(raw,{onError:error=>errors.push(error)}):new SharedRichEditor(raw,{onError:error=>errors.push(error)});
  const connect=async(principal,review=true)=>{const channel=new ReviewWireFixture(`ws://${server.address}/ws`);const authenticated=await channel.request({kind:"authenticate",principal,token:tokens[principal],capabilities:["writerTransportV2",...(review?["reviewV1"]:[])]});assert.equal(authenticated.kind,"authenticated");assert.deepEqual(authenticated.capabilities,["writerTransportV2",...(review?["reviewV1"]:[])]);if(review)assert.equal(authenticated.reviewDescriptor.format,"breditor/relay-review");else assert.equal(authenticated.reviewDescriptor,undefined);return {channel,authenticated};};
  const syncDocument=async principal=>{const result=await channels[principal].request({kind:"sync"});assert.equal(result.kind,"catchup");await cores[principal].receiveFrame(result.frame);};
  const syncReview=async(principal,persist=async()=>{})=>{let more;do{const response=await channels[principal].request({kind:"reviewSync",cursor:cursors[principal]??null});assert.equal(response.kind,"reviewCatchup");const page=response.page;assert.ok(Buffer.byteLength(JSON.stringify(page))<=4*1024*1024);for(const batch of page.batches){const verified={actor:batch.source.actor,principal:batch.source.principal,access:batch.source.role==="moderator"?"moderate":"comment"};assert.notEqual(cores[principal].receiveReview(batch.frame,verified).kind,"pending");}await persist();cursors[principal]=page.cursor;more=page.more;}while(more);};
  const submit=async(principal,after="0")=>{const result=await channels[principal].request({kind:"reviewSubmit",frame:cores[principal].exportReview(after)});assert.equal(result.kind,"reviewAdmission");assert.equal(result.admission.kind,"durable");receipts++;return result.admission;};
  const submitDocument=async(principal,after="0")=>{for(const group of cores[principal].writerGroupsV2(after).groups){const outcome=await channels[principal].request({kind:"submit",group});assert.equal(outcome.kind,"durable");}};
  try{
   server=await startReviewHost(executable,[...paths,"127.0.0.1:0"]);
   ({channel:legacy}=await connect("carol",false));assert.equal((await legacy.request({kind:"reviewSync",cursor:null})).code,"invalid_request");modeRefusals++;
   ({channel:owner}=await connect("functional-owner"));const oldPage=await owner.request({kind:"reviewSync",cursor:null});assert.equal(oldPage.page.currentRole,undefined);assert.equal((await owner.request({kind:"reviewCursorProof",cursor:oldPage.page.cursor})).code,"invalid_request");
   for(const principal of ["alice","bob","carol"]){
    const {channel,authenticated}=await connect(principal);channels[principal]=channel;
    const doc=await channel.request({kind:principal==="carol"?"registerObserver":"register"});assert.equal(doc.kind,principal==="carol"?"observerRegistered":"registered");
    const metadata=await channel.request({kind:"reviewRegister",actor:policies[principal].actor});assert.equal(metadata.kind,"reviewRegistered");
    identities[principal]={document:doc.registration,review:metadata.registration,binding:authenticated.reviewDescriptor.binding};save(join(temporary,`${principal}.identity.json`),JSON.stringify(identities[principal]));
    const core=facade(profile.join_frame("room",doc.registration.lease.writer,authenticated.frame));if(natural)core.enableTypingHistory();core.enableReview(policies[principal]);if(principal==="carol")core.setReadOnly(true);cores[principal]=core;
   }
   const a=cores.alice,b=cores.bob,c=cores.carol,initial=a.documentJson();
   const version=a.captureVersion("Before review edits","alice","1792200000000");
   const created=a.dispatchReview(create(a.captureReviewAnchor(nodeTarget),"Offline <b>literal</b> 日本 🙂"));assert.equal(created.kind,"committed");const thread=created.event;
   // A peer has the original offline frame, but the authoritative relay has not accepted it.
   b.receiveReview(a.exportReview(),policies.alice);b.dispatchReview(reply(thread,"Offline dependent reply"));
   const missing=await channels.bob.request({kind:"reviewSubmit",frame:b.exportReview()});assert.equal(missing.admission.kind,"pending");pending++;
   const first=await submit("alice");await submit("bob");
   const cursorBefore=cursors.carol;await assert.rejects(syncReview("carol",async()=>{throw Error("Disk unavailable");}),/Disk unavailable/);assert.equal(cursors.carol,cursorBefore);saveRefusals++;await syncReview("carol");
   c.dispatchReview({kind:"edit_message",data:{message:thread,body:"Moderator correction"}});await submit("carol");moderations++;
   for(const principal of ["alice","bob"])await syncReview(principal);
   assert.equal(a.reviewSnapshot().view.threads[0].thread.messages[0].versions[0].text,"Moderator correction");assert.equal(a.documentJson(),initial);assert.equal(b.documentJson(),initial);
   assert.equal((await channels.carol.request({kind:"submit",group:a.writerGroupsV2("0").groups[0]??"not a document group"})).code,"lease_rejected");observerRefusals++;
   a.undoReview();await submit("alice","1");await syncReview("bob");assert.equal(b.reviewSnapshot().view.threads[0].thread.messages[1].versions[0].text,"Offline dependent reply");
   a.redoReview();await submit("alice","2");
   a.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Accepted later "}}]});a.dispatchReview(create(a.captureReviewAnchor(nodeTarget),"Depends on this document edit"));
   const deferred=await channels.alice.request({kind:"reviewSubmit",frame:a.exportReview("3")});assert.equal(deferred.admission.kind,"pendingDocument");pending++;
   await submitDocument("alice");await submit("alice","3");for(const principal of ["bob","carol"]){await syncDocument(principal);await syncReview(principal);}
   const docThrough=a.writerClockV2(identities.alice.document.lease.writer).through;
   const preview=a.prepareVersionRestore(version,`network-version-${natural}`);assert.equal(a.applyVersionRestore(preview),true);preview.dispose();await submitDocument("alice",docThrough);versions++;
   for(const principal of ["bob","carol"]){await syncDocument(principal);await syncReview(principal);assert.equal(cores[principal].documentJson(),a.documentJson());assert.equal(cores[principal].reviewSnapshot().view.threads[0].targets[0].resolution.kind,"orphaned");}
   // An old channel never receives an unnegotiated review event family.
   await legacy.request({kind:"sync"});assert.ok(!legacy.events.some(event=>event.kind==="reviewChanged"));assert.ok(channels.bob.events.some(event=>event.kind==="reviewChanged"));
   const saved={};for(const principal of ["alice","bob","carol"]){const core=cores[principal];saved[principal]={document:core.checkpointJson(),review:core.reviewCheckpoint()};save(join(temporary,`${principal}.paired.json`),JSON.stringify(saved[principal]));channels[principal].close();core.dispose();}
   legacy.close();owner.close();await server.stop();server=await startReviewHost(executable,[...paths,"127.0.0.1:0"]);
   for(const principal of ["alice","bob","carol"]){const {channel}=await connect(principal);channels[principal]=channel;const identity=identities[principal];const resumed=await channel.request({kind:principal==="carol"?"resumeObserver":"resume",writer:identity.document.lease.writer,credential:identity.document.credential});assert.equal(resumed.kind,principal==="carol"?"observerResumed":"resumed");assert.equal((await channel.request({kind:"reviewResume",actor:policies[principal].actor,credential:identity.review.credential})).kind,"reviewResumed");
    const restore=natural?profile.restore_document_typing.bind(profile):profile.restore.bind(profile);const core=facade(restore("room",saved[principal].document));core.enableReview(policies[principal],saved[principal].review);cores[principal]=core;assert.equal(core.checkpointJson(),saved[principal].document);assert.equal(core.reviewCheckpoint(),saved[principal].review);restores++;await syncDocument(principal);await syncReview(principal);
   }
   const exact=await channels.alice.request({kind:"reviewSubmit",frame:cores.alice.exportReview("0")});assert.equal(exact.admission.kind,"durable");assert.equal(exact.admission.duplicate,true);
   const prefixFrame=JSON.parse(cores.alice.exportReview("0"));prefixFrame.events=prefixFrame.events.slice(0,1);const retry=await channels.alice.request({kind:"reviewSubmit",frame:JSON.stringify(prefixFrame,null,2)});assert.equal(retry.admission.sequence,first.sequence);assert.deepEqual(retry.admission.receipt,first.receipt);assert.equal(retry.admission.duplicate,true);
   // Future original local history survives exact paired recovery plus original authenticated replay.
   for(const method of ["undoReview","redoReview","undo","redo"]){const core=cores.alice;const oldDoc=core.writerClockV2(identities.alice.document.lease.writer).through,oldReview=(await channels.alice.request({kind:"reviewClock",actor:policies.alice.actor})).clock.through;const outcome=core[method]();if(method.endsWith("Review")){assert.equal(outcome.kind,"committed");await submit("alice",oldReview);}else{assert.equal(outcome,true);await submitDocument("alice",oldDoc);}for(const principal of ["bob","carol"]){await syncDocument(principal);await syncReview(principal);assert.equal(cores[principal].documentJson(),core.documentJson());}future++;}
   ({channel:owner}=await connect("functional-owner"));assert.equal((await owner.request({kind:"reviewGrant",principal:"carol",role:"comment"})).kind,"reviewGranted");
   // Accepted moderator edits replay under their ORIGINAL grant after current-role downgrade.
   const fresh=await connect("bob");try{const observer=await fresh.channel.request({kind:"registerObserver"});const view=facade(profile.join_frame("room",observer.registration.lease.writer,fresh.authenticated.frame));try{view.enableReview({actor:"fresh.viewer",principal:"bob",access:"read_only"});const page=await fresh.channel.request({kind:"reviewSync",cursor:null});for(const batch of page.page.batches){const source=batch.source;assert.notEqual(view.receiveReview(batch.frame,{actor:source.actor,principal:source.principal,access:source.role==="moderator"?"moderate":"comment"}).kind,"pending");}assert.equal(view.reviewSnapshot().view.threads[0].thread.messages[0].versions[0].text,"Moderator correction");}finally{view.dispose();}}finally{fresh.channel.close();}
   assert.deepEqual(errors,[]);trials++;
  }finally{legacy?.close();owner?.close();for(const channel of Object.values(channels))channel.close();for(const core of Object.values(cores))core.dispose();if(server)await server.stop();}
 }}finally{profile.free();}
 assert.equal(trials,2);assert.equal(restores,6);assert.equal(future,8);assert.equal(pending,4);assert.equal(moderations,2);assert.equal(versions,2);assert.equal(observerRefusals,2);assert.equal(modeRefusals,2);assert.equal(saveRefusals,2);
 return {format:"breditor/review-relay-functional-probe",formatVersion:1,sharedWasmSha256:hash(bytes),nativeRelaySha256:hash(readFileSync(executable)),trials,exactPairedRestores:restores,futureHistorySteps:future,pendingWithoutAck:pending,durableReceipts:receipts,moderatorEdits:moderations,guardedVersionRestores:versions,observerWriteRefusals:observerRefusals,unnegotiatedLaneRefusals:modeRefusals,saveBeforeCursorRefusals:saveRefusals,passed:true,scope:"Actual packaged Wasm/compiled SDK and durable native authenticated socket host. Original explicit and document natural history: editor/comment-only identities, offline document/review dependencies, exact/repacked retries, original historical moderator grants, independent history, guarded version restore, host restart and exact paired manual recovery. Wire driving and paired checkpoint storage are explicit fixture orchestration; automatic review SDK sync, paired IDB cursor storage, shared version catalog, suggestions, physical browsers and production deployment are NOT qualified."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error("Expected actual shared Wasm directory and isolated review host executable");console.log(JSON.stringify(await probeReviewRelay(...process.argv.slice(2)),null,2));}
