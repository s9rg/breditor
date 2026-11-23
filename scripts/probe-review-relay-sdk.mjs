/** Actual Wasm, exported SDK auto-sync and paired native storage against the durable native host.
 * IndexedDB/Web Locks are fixtures; document and review transports are the real SDK adapters. */
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {readFileSync,writeFileSync,mkdtempSync,realpathSync} from "node:fs";
import {resolve,join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath,pathToFileURL} from "node:url";
import {WebSocket as NativeWebSocket} from "undici";
import {IDBFactory,IDBObjectStore} from "fake-indexeddb";
import {SharedReviewPersistentSession,SharedReviewRelaySync,registerSharedReviewWriter,registerSharedRelayWriter,SharedRelaySync,createSharedDocumentRelaySync} from "../packages/breditor-collaboration/dist/index.js";
import {openSessionDatabase} from "../packages/breditor-collaboration/dist/persistence/session_database.js";
import {readReviewRelayRecord,writeReviewRelayRecord} from "../packages/breditor-collaboration/dist/persistence/review_relay_database.js";
import {startReviewHost,ReviewWireFixture} from "./probe-review-relay.mjs";
const origin="http://127.0.0.1:49785",pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const save=(path,value)=>writeFileSync(path,value,{mode:0o600});
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(key=>[key,canonical(v[key])])):v;
const storageIdentity=({credential,observerCredential,...identity})=>identity;
const create=(core,body)=>core.dispatchReview({kind:"create_thread",data:{anchorJson:core.captureReviewAnchor({kind:"selection",selection:{kind:"node",block:"image-block"}}),body}});
const reply=(core,thread,body)=>core.dispatchReview({kind:"reply",data:{thread,body}});
function locks(){const held=new Set();return {held,request(name,_options,callback){return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};}
async function eventually(test,label){const deadline=Date.now()+20000;while(!test()){if(Date.now()>deadline)throw Error(`Timed out: ${label}`);await pause(15);}}
export async function probeReviewRelaySdk(directory,executable){
 const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 const configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/review-auto-sync",version:1},extensions:[]}),profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(configuration),descriptor=JSON.parse(profile.descriptor_json()),root=canonical(JSON.parse(readFileSync(new URL("../crates/breditor-core/tests/fixtures/rich-local-root.json",import.meta.url),"utf8"))),source=JSON.stringify({format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root});
 const originals=new Map(),lockHost=locks();let wireRequests=0,paginatedPages=0;
 for(const [key,value]of Object.entries({indexedDB:new IDBFactory(),navigator:{locks:lockHost},WebSocket:class extends NativeWebSocket {constructor(url){super(url,{headers:{Origin:origin}});this.addEventListener("message",event=>{const result=JSON.parse(event.data).result;if(result.kind==="reviewCatchup"&&result.page.more)paginatedPages++;});}send(input){wireRequests++;assert.ok(wireRequests<5000,"Transport must not spin on an unchanged page");return super.send(input);}}})){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const put=IDBObjectStore.prototype.put;let abortWrite;
 IDBObjectStore.prototype.put=function(record,...args){
  const request=put.call(this,record,...args);
  if(abortWrite?.(this.transaction.db.name,record))this.transaction.abort();
  return request;
 };
 let trials=0,reopens=0,saveRefusals=0,cursorRefusals=0,restarts=0,future=0,versions=0,permissionTransitions=0;
 try{for(const document of [false,true])for(const natural of [false,true]){
  const id=`auto-${trials}`,temporary=mkdtempSync(join(tmpdir(),"breditor-review-auto-")),paths=["room.log","profile.json","document.json","auth.json"].map(name=>join(temporary,name)),tokens=Object.fromEntries(["alice","bob","carol","functional-owner"].map(principal=>[principal,randomBytes(32).toString("hex")]));
  save(paths[1],configuration);save(paths[2],source);save(paths[3],JSON.stringify({format:"breditor/relay-auth",formatVersion:1,origins:[origin],accounts:Object.entries(tokens).map(([principal,token])=>({principal,tokenHash:[...createHash("sha256").update(token).digest()]}))}));
  const sessions={},syncs={},documents={},registrations={},documentIdentities={},options={},errors=[];let server,admin;
  const disconnect=principal=>{syncs[principal]?.dispose();documents[principal]?.dispose();delete syncs[principal];delete documents[principal];};
  const attach=principal=>{const session=sessions[principal],identity=registrations[principal].identity;syncs[principal]=new SharedReviewRelaySync({identity,storage:session,getToken:()=>tokens[principal],autoConnect:false,requestTimeoutMs:3000,reconnectMinimumMs:50,reconnectMaximumMs:200,onError:error=>errors.push(error)});if(principal!=="carol"){const argument={identity:documentIdentities[principal],getToken:()=>tokens[principal],persistLocal:()=>session.flush(),autoConnect:false,requestTimeoutMs:3000,reconnectMinimumMs:50,reconnectMaximumMs:200,onError:error=>errors.push(error)};documents[principal]=document?createSharedDocumentRelaySync(session.core,{...argument,selectionEditing:"document-v1"}):new SharedRelaySync(session.core,argument);}};
  const equal=async label=>eventually(()=>sessions.alice.core.documentJson()===sessions.bob.core.documentJson()&&sessions.alice.core.documentJson()===sessions.carol.core.documentJson()&&JSON.stringify(sessions.alice.core.reviewSnapshot().view.threads)===JSON.stringify(sessions.bob.core.reviewSnapshot().view.threads)&&JSON.stringify(sessions.alice.core.reviewSnapshot().view.threads)===JSON.stringify(sessions.carol.core.reviewSnapshot().view.threads),label);
  try{
   server=await startReviewHost(executable,[...paths,"127.0.0.1:0"]);const endpoint=`ws://${server.address}/ws`;
   for(const principal of ["alice","bob","carol"]){
    if(principal!=="carol")documentIdentities[principal]=(await registerSharedRelayWriter({endpoint,principal,room:"room",writerTransport:"atomic-v2",getToken:()=>tokens[principal],saveIdentity:identity=>save(join(temporary,`${principal}.document-secret.json`),JSON.stringify(identity))})).identity;
    const registered=await registerSharedReviewWriter({endpoint,principal,room:"room",actor:`${id}-${principal}`,writerTransport:"atomic-v2",getToken:()=>tokens[principal],...(principal==="carol"?{}:{documentWriter:documentIdentities[principal].writer}),saveIdentity:identity=>save(join(temporary,`${principal}.review-secret.json`),JSON.stringify(identity))});registrations[principal]=registered;
    const identity=registered.identity;options[principal]={database:`${id}-${principal}`,room:"room",writer:identity.documentWriter,review:{actor:identity.actor,principal,access:principal==="carol"?"moderate":"comment"},relay:storageIdentity(identity),richLanguage:3,history:natural?"typing-v1":"explicit",rangeEditing:document?"general-v1":"original",selectionEditing:document?"document-v1":"original",create:()=>profile.join_frame("room",identity.documentWriter,registered.frame),restore:(saved,policy)=>document?(policy.history==="typing-v1"?profile.restore_document_typing("room",saved):profile.restore_document("room",saved)):(policy.history==="typing-v1"?profile.restore_typing("room",saved):profile.restore("room",saved)),onError:error=>errors.push(error)};
    sessions[principal]=await SharedReviewPersistentSession.open(options[principal]);if(principal==="carol")sessions[principal].core.setReadOnly(true);attach(principal);
   }
   await documents.alice.connect();await documents.bob.connect();for(const principal of ["alice","bob","carol"])await syncs[principal].connect();
   const a=sessions.alice.core,thread=create(a,"Automatic initial discussion 🙂").event;await syncs.alice.flush();await equal("automatic initial comment catchup");
   sessions.alice.saveVersion("Before offline changes","1792200000000");await sessions.alice.flush();
   for(const principal of ["alice","bob","carol"]){syncs[principal].disconnect();documents[principal]?.disconnect();}
   a.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Offline accepted text "}}]});create(a,"Anchor depends on offline document work");reply(sessions.bob.core,thread,"Independent offline reply");
   await syncs.alice.connect();assert.equal(syncs.alice.state().pending,true);let flushed=false;const waiting=syncs.alice.flush().then(()=>{flushed=true;});await pause(30);assert.equal(flushed,false);await documents.alice.connect();await waiting;
   await documents.bob.connect();await syncs.bob.connect();await syncs.carol.connect();await syncs.bob.flush();await equal("independent offline document and review streams");
   // Establish a durable baseline before faulting the write of the next peer comment.
   const bob=sessions.bob,peerComment="Peer comment while local storage fails";
   const waitForBobCursor=async(sequence,label)=>{
    assert.equal(typeof sequence,"string");
    await eventually(()=>BigInt(bob.reviewRelayProgress().cursor?.after??"0")>=BigInt(sequence),label);
    await bob.flush();
   };
   await waitForBobCursor(sessions.alice.reviewRelayProgress().sequence,"Bob saved Alice's offline comment");
   await waitForBobCursor(bob.reviewRelayProgress().sequence,"Bob saved the cursor for his offline reply");
   const db=await openSessionDatabase(options.bob.database),key=["room",registrations.bob.identity.documentWriter];
   try{
    const before=await readReviewRelayRecord(db,key),cursor=bob.reviewRelayProgress();
    let aborted=false;
    abortWrite=(database,record)=>{
     if(database!==options.bob.database||record.format!=="breditor/shared-review-relay-checkpoint-record"||!record.reviewCheckpointJson.includes(peerComment))return false;
     aborted=true;
     return true;
    };
    assert.equal(reply(a,thread,peerComment).kind,"committed");
    await syncs.alice.flush();
    await eventually(()=>syncs.bob.state().status==="local-save-failed","paired save failure fences sync");
    assert.ok(aborted,"The refused write contained the peer comment");
    assert.deepEqual(bob.reviewRelayProgress(),cursor);
    assert.deepEqual(await readReviewRelayRecord(db,key),before);
    assert.ok(bob.core.reviewCheckpoint().includes(peerComment));
    saveRefusals++;
    abortWrite=undefined;
    await bob.retry();
    await syncs.bob.connect();
    await waitForBobCursor(sessions.alice.reviewRelayProgress().sequence,"Bob saved the retried peer comment and its cursor");
    await equal("retry retained native metadata without duplicate events");
    assert.deepEqual(await readReviewRelayRecord(db,key),bob.exportRecovery());
   }finally{db.close();}
   const address=server.address;await server.crash();server=await startReviewHost(executable,[...paths,address]);await eventually(()=>Object.values(syncs).every(sync=>sync.state().status==="ready")&&Object.values(documents).every(sync=>sync.state().status==="ready"),"automatic reconnect after abrupt durable host restart");await equal("server restart convergence");restarts++;
   if(trials===0){syncs.carol.disconnect();const quoted="\"".repeat(16000);for(let index=0;index<80;index++)sessions.alice.core.dispatchReview({kind:"create_thread",data:{anchorJson:sessions.alice.core.captureReviewAnchor({kind:"document"}),body:quoted}});await syncs.alice.flush();await syncs.carol.connect();await equal("bounded escaped multi-page SDK catchup");assert.ok(paginatedPages>0);}
   // Exact paired reopens retain transport progress, native history, versions and both writer leases.
   const saved={};for(const principal of ["alice","bob","carol"]){disconnect(principal);await sessions[principal].flush();saved[principal]=sessions[principal].exportRecovery();await sessions[principal].close();sessions[principal]=await SharedReviewPersistentSession.open(options[principal]);assert.equal(sessions[principal].core.checkpointJson(),saved[principal].documentCheckpointJson);assert.equal(sessions[principal].core.reviewCheckpoint(),saved[principal].reviewCheckpointJson);assert.deepEqual(sessions[principal].reviewRelayProgress(),saved[principal].progress);reopens++;attach(principal);await documents[principal]?.connect();await syncs[principal].connect();}
   await equal("exact paired reload and verified cursor resume");
   const durable=sessions.alice.reviewRelayProgress(),binding=sessions.alice.reviewRelayIdentity(),exported=sessions.alice.exportRecovery();exported.relay.binding="0".repeat(64);if(exported.progress.cursor)exported.progress.cursor.after="0";assert.deepEqual(sessions.alice.reviewRelayIdentity(),binding);assert.deepEqual(sessions.alice.reviewRelayProgress(),durable);await assert.rejects(sessions.alice.persistReviewRelayProgress({...durable,cursor:{...durable.cursor,after:"0"}}),/backwards/);assert.deepEqual(sessions.alice.reviewRelayProgress(),durable);
   for(const method of ["undoReview","redoReview","undo","redo"]){const result=sessions.alice.core[method]();if(method.endsWith("Review"))assert.equal(result.kind,"committed");else assert.equal(result,true);await documents.alice.flush();await syncs.alice.flush();await equal(`restored future ${method}`);future++;}
   const packet=sessions.alice.versionPacket(sessions.alice.versions()[0].id),plan=sessions.alice.core.prepareVersionRestore(packet,`${id}-version-restore`);assert.equal(sessions.alice.core.applyVersionRestore(plan),true);plan.dispose();await documents.alice.flush();await equal("ordinary version restore retains discussions across automatic transport");versions++;
   // A cursor cannot skip missing foreign events even when the stripped local metadata is valid.
   disconnect("carol");await sessions.carol.close();const cdb=await openSessionDatabase(options.carol.database),ckey=["room",registrations.carol.identity.documentWriter],valid=await readReviewRelayRecord(cdb,ckey);await assert.rejects(SharedReviewPersistentSession.open({...options.carol,relay:undefined}),/explicitly paired/);await assert.rejects(writeReviewRelayRecord(cdb,ckey,{...valid,relay:{...valid.relay,credential:"never store secrets"}}));await assert.rejects(writeReviewRelayRecord(cdb,ckey,{...valid,progress:{...valid.progress,cursor:{...valid.progress.cursor,binding:"0".repeat(64)}}}));assert.deepEqual(await readReviewRelayRecord(cdb,ckey),valid);const raw=profile.join_frame("room",registrations.carol.identity.documentWriter,registrations.carol.frame);const observed=raw.observe();raw.enable_review(observed,JSON.stringify(options.carol.review),null);observed.free();const token=raw.observe();const empty=raw.review_checkpoint(token);token.free();raw.free();await writeReviewRelayRecord(cdb,ckey,{...valid,reviewCheckpointJson:empty});sessions.carol=await SharedReviewPersistentSession.open(options.carol);attach("carol");await assert.rejects(syncs.carol.connect(),error=>error.code==="review_server_ahead");cursorRefusals++;assert.equal(sessions.carol.core.reviewSnapshot().view.threads.length,0);disconnect("carol");await sessions.carol.discardAndClose();await writeReviewRelayRecord(cdb,ckey,valid);cdb.close();sessions.carol=await SharedReviewPersistentSession.open(options.carol);attach("carol");await syncs.carol.connect();await equal("original valid cursor recovery retained");
   admin=new ReviewWireFixture(endpoint);assert.equal((await admin.request({kind:"authenticate",principal:"functional-owner",token:tokens["functional-owner"],capabilities:["writerTransportV2","reviewV1"]})).kind,"authenticated");assert.equal((await admin.request({kind:"reviewGrant",principal:"carol",role:null})).kind,"reviewGranted");await eventually(()=>syncs.carol.state().status==="denied","revoked review permission stops automatic resume");await syncs.carol.connect();assert.throws(()=>reply(sessions.carol.core,thread,"No current write grant"),/not permitted/);reply(sessions.alice.core,thread,"Still readable after comment rights removed");await syncs.alice.flush();await equal("read-only metadata connection still catches up");permissionTransitions++;
   assert.ok(errors.every(error=>["local_save_failed","connection_lost","review_server_ahead","lease_rejected","permission_denied"].includes(error.code)||String(error).includes("Paired relay transaction")),errors.map(error=>String(error)).join("\n"));trials++;
  }finally{abortWrite=undefined;admin?.close();for(const principal of ["alice","bob","carol"]){disconnect(principal);await sessions[principal]?.discardAndClose();}if(server)await server.stop();}
 }}finally{IDBObjectStore.prototype.put=put;profile.free();for(const [name,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
 assert.equal(lockHost.held.size,0);assert.equal(trials,4);assert.equal(reopens,12);assert.equal(saveRefusals,4);assert.equal(cursorRefusals,4);assert.equal(restarts,4);assert.equal(future,16);assert.equal(versions,4);assert.equal(permissionTransitions,4);
 return {format:"breditor/review-relay-sdk-probe",formatVersion:1,sharedWasmSha256:hash(bytes),nativeRelaySha256:hash(readFileSync(executable)),trials,exactPairedReopens:reopens,atomicSaveRefusals:saveRefusals,missingNativeCursorPrefixRefusals:cursorRefusals,automaticHostRestarts:restarts,futureHistorySteps:future,guardedVersionRestores:versions,writeToReadOnlyTransitions:permissionTransitions,paginatedPages,wireRequests,passed:true,scope:"Actual optional application Wasm, exported review registration/automatic sync and document SDK sync, paired native IndexedDB records and durable authenticated host. Both selection/history policies, comment-only identities, offline streams, failed-save cursor retention/retry, abrupt host restart, exact paired recovery, original prefix verification, future history, guarded version restore, multi-page escaped catchup and revoked-write/current-read rights. IndexedDB/Web Locks are fixtures; clean-installed review UI acceptance, shared version catalog, suggestions and production/browser qualification remain open."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error("Expected matching Wasm directory and isolated review host executable");console.log(JSON.stringify(await probeReviewRelaySdk(...process.argv.slice(2)),null,2));}
