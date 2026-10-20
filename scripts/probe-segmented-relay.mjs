/** Actual native Wasm + public generation SDK + authenticated durable loopback host.
 * IDB and Web Locks are fixtures; transport, native history and server admission are real. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,realpathSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {WebSocket as NativeWebSocket} from 'undici';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {SharedSegmentedRelaySession,SharedSegmentedPersistentSession,SharedRelaySync,SharedReviewRelaySync,createSharedSegmentedRelaySync,createSharedSegmentedReviewRelaySync,registerSharedRelayWriter,registerSharedReviewWriter} from '../packages/breditor-collaboration/dist/index.js';
import {startReviewHost} from './fixtures/relay-host.mjs';
const origin='http://127.0.0.1:49785',pause=ms=>new Promise(r=>setTimeout(r,ms));
const hash=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const binding=({credential,observerCredential,...v})=>v;
const insert=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
const comment=(core,body)=>core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body}});
async function eventually(check,label){const deadline=Date.now()+20000;while(!check()){if(Date.now()>deadline)throw Error('Timed out: '+label);await pause(15);}}
function locks(){const held=new Set();return{held,request(name,_options,callback){return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};}

export async function probeSegmentedRelay(directory,executable,{smoke=false}={}){
 const wasmBytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm')),wasm=await import(pathToFileURL(resolve(directory,'breditor_shared.js')));await wasm.default({module_or_path:wasmBytes});
 const configuration=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/segmented-relay',version:1},extensions:[]}),profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(configuration),descriptor=JSON.parse(profile.descriptor_json());
 const source=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')))});
 const saved=new Map(),lockHost=locks(),requests=[];let fault=null;
 const originalPut=IDBObjectStore.prototype.put,originalAdd=IDBObjectStore.prototype.add;
 for(const [key,value]of Object.entries({indexedDB:new IDBFactory(),navigator:{locks:lockHost},WebSocket:class extends NativeWebSocket{constructor(url){super(url,{headers:{Origin:origin}});}send(raw){requests.push(JSON.parse(raw).request.kind);assert.ok(requests.length<10000,'No unchanged-progress spin');return super.send(raw);}}})){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 }
 function write(original,args){const result=original.apply(this,args);if(fault&&this.transaction.db.name===fault.database&&this.name==='generation_heads'){
  const head=JSON.parse(args[0]),relay=head.relay;
  if(fault.lane==='document'?BigInt(relay.document.accepted?.through??'0')>BigInt(fault.through):BigInt(relay.review?.accepted?.through??'0')>BigInt(fault.through))queueMicrotask(()=>{try{this.transaction.abort();}catch{}});
 }return result;}
 IDBObjectStore.prototype.put=function(...args){return write.call(this,originalPut,args);};IDBObjectStore.prototype.add=function(...args){return write.call(this,originalAdd,args);};
 let cases=0,coldReopens=0,oldAdapterRefusals=0,saveRefusals=0,offlineReconnects=0,retainedReceipts=0,rollbackRefusals=0,futureHistorySteps=0;
 try{
  for(const wire of smoke?[2]:[1,2])for(const scope of smoke?[2]:(wire===1?[0,1]:[0,1,2]))for(const natural of smoke?[true]:[false,true]){
   const temporary=mkdtempSync(join(tmpdir(),'breditor-segmented-relay-')),paths=['room.log','profile.json','document.json','auth.json'].map(p=>join(temporary,p)),tokens=Object.fromEntries(['alice','bob','functional-owner'].map(p=>[p,randomBytes(32).toString('hex')]));
   writeFileSync(paths[1],configuration);writeFileSync(paths[2],source);writeFileSync(paths[3],JSON.stringify({format:'breditor/relay-auth',formatVersion:1,origins:[origin],accounts:Object.entries(tokens).map(([principal,token])=>({principal,tokenHash:[...createHash('sha256').update(token).digest()]}))}));
   const sessions={},documents={},reviews={},identities={},options={},errors=[];let server;
   const detach=p=>{reviews[p]?.dispose();documents[p]?.dispose();delete reviews[p];delete documents[p];};
   const attach=p=>{const session=sessions[p],common={getToken:()=>tokens[p],autoConnect:false,requestTimeoutMs:5000,reconnectMinimumMs:50,reconnectMaximumMs:200,onError:e=>errors.push(e)};
    documents[p]=createSharedSegmentedRelaySync(session,{...common,identity:identities[p].document});reviews[p]=createSharedSegmentedReviewRelaySync(session,{...common,identity:identities[p].review,flushDocument:()=>documents[p].flush()});
   };
   const equal=label=>eventually(()=>sessions.alice.core.documentJson()===sessions.bob.core.documentJson()&&JSON.stringify(sessions.alice.core.reviewSnapshot().view.threads)===JSON.stringify(sessions.bob.core.reviewSnapshot().view.threads),label);
   try{
    const mode=wire===1?'original-v1':'atomic-v2',start=address=>startReviewHost(executable,[...paths,address,mode]);server=await start('127.0.0.1:0');const endpoint=`ws://${server.address}/ws`;
    for(const p of ['alice','bob']){
     const transport=wire===2?{writerTransport:'atomic-v2'}:{};
     const document=(await registerSharedRelayWriter({endpoint,principal:p,room:'room',...transport,getToken:()=>tokens[p],saveIdentity:id=>writeFileSync(join(temporary,p+'.document.identity.json'),JSON.stringify(id),{mode:0o600})})).identity;
     const registered=await registerSharedReviewWriter({endpoint,principal:p,room:'room',actor:`generation-${cases}-${p}`,...transport,documentWriter:document.writer,getToken:()=>tokens[p],saveIdentity:id=>writeFileSync(join(temporary,p+'.review.identity.json'),JSON.stringify(id),{mode:0o600})});identities[p]={document,review:registered.identity};
     options[p]={database:`segmented-relay-${cases}-${p}`,room:'room',writer:document.writer,richLanguage:3,history:natural?'typing-v1':'explicit',rangeEditing:scope?'general-v1':'original',selectionEditing:scope===2?'document-v1':'original',searchHistory:'search-v1',reviewedHistory:null,readOnly:false,initialGenerations:{root:'root',active:'one'},review:{actor:registered.identity.actor,principal:p,access:'comment'},binding:{document:binding(document),review:binding(registered.identity)},create:()=>profile.join_frame('room',document.writer,registered.frame),restoreSegmented:s=>profile.restore_segmented('room',s),onError:e=>errors.push(e)};
     sessions[p]=await SharedSegmentedRelaySession.open(options[p]);attach(p);await documents[p].connect();await reviews[p].connect();
    }
    const originalLog=readFileSync(paths[0]);
    const a=sessions.alice.core;insert(a,'SAVED_REDO ');await documents.alice.flush();assert.equal(a.undo(),true);await documents.alice.flush();comment(a,'Retained original discussion');await reviews.alice.flush();await equal('initial paired state');
    documents.bob.disconnect();reviews.bob.disconnect();insert(sessions.bob.core,'OFFLINE_B ');comment(sessions.bob.core,'Offline discussion before peer seals');await sessions.bob.flush();
    await sessions.alice.sealGeneration('two');const redoDepth=a.segmentedHistoryInfo().redoItems;assert.ok(redoDepth>0);
    const original=sessions.alice.exportRecovery();detach('alice');await sessions.alice.close();sessions.alice=await SharedSegmentedRelaySession.open(options.alice);assert.deepEqual(sessions.alice.exportRecovery(),original);coldReopens++;assert.equal(sessions.alice.core.segmentedHistoryInfo().redoItems,redoDepth);
    assert.throws(()=>new SharedRelaySync(sessions.alice.core,{identity:identities.alice.document,getToken:()=>tokens.alice,autoConnect:false}));
    assert.throws(()=>new SharedReviewRelaySync({identity:identities.alice.review,storage:sessions.alice,getToken:()=>tokens.alice,autoConnect:false}));oldAdapterRefusals+=2;
    assert.throws(()=>createSharedSegmentedRelaySync({core:sessions.alice.core},{identity:identities.alice.document,getToken:()=>tokens.alice}));
    attach('alice');assert.equal(documents.alice.state().serverThrough,null,'Stored counters are not live authentication');await documents.alice.connect();await reviews.alice.connect();
    assert.equal(sessions.alice.core.redo(),true);await documents.alice.flush();assert.ok(sessions.alice.core.documentJson().includes('SAVED_REDO'));
    insert(sessions.alice.core,'ACTIVE_A ');await documents.alice.flush();await sessions.alice.sealGeneration('three');sessions.alice.saveVersion('Across generations','1792450000000');await sessions.alice.flush();
    const pending=sessions.bob.exportRecovery();detach('bob');await sessions.bob.close();sessions.bob=await SharedSegmentedRelaySession.open(options.bob);assert.deepEqual(sessions.bob.exportRecovery(),pending);coldReopens++;attach('bob');await documents.bob.connect();await documents.bob.flush();await reviews.bob.connect();await reviews.bob.flush();await equal('offline writer reconnects across two peer generation boundaries');offlineReconnects++;
    for(const p of ['alice','bob']){await documents[p].flush();await reviews[p].flush();await sessions[p].flush();const meta=sessions[p].relayProgress();assert.ok(meta.document.receipt);assert.ok(meta.reviewReceipt);retainedReceipts+=2;for(const secret of [identities[p].document.credential,identities[p].review.credential])assert.ok(!JSON.stringify(sessions[p].exportRecovery()).includes(secret));}
    // A committed server acknowledgement must not get ahead of its atomic local head.
    if(cases===0){
     for(const p of ['alice','bob']){documents[p].disconnect();reviews[p].disconnect();}
     insert(sessions.alice.core,'ACK_ONCE ');await sessions.alice.flush();const before=sessions.alice.relayProgress();fault={database:options.alice.database,lane:'document',through:before.document.accepted.through};
     await assert.rejects(async()=>{await documents.alice.connect();await documents.alice.flush();});await eventually(()=>documents.alice.state().status==='local-save-failed','document acknowledgement local save failure');assert.deepEqual(sessions.alice.relayProgress(),before);assert.ok(BigInt(sessions.alice.exportRecovery().relay.document.accepted.through)>BigInt(before.document.accepted.through));saveRefusals++;
     fault=null;await sessions.alice.retry();await documents.alice.connect();await documents.alice.flush();assert.equal(sessions.alice.core.documentJson().split('ACK_ONCE').length-1,1);
     comment(sessions.alice.core,'REVIEW_ACK_ONCE');await sessions.alice.flush();const beforeReview=sessions.alice.relayProgress();fault={database:options.alice.database,lane:'review',through:beforeReview.review.accepted.through};
     await assert.rejects(async()=>{await reviews.alice.connect();await reviews.alice.flush();});assert.deepEqual(sessions.alice.relayProgress(),beforeReview);assert.ok(BigInt(sessions.alice.exportRecovery().relay.review.accepted.through)>BigInt(beforeReview.review.accepted.through));saveRefusals++;
     fault=null;await sessions.alice.retry();await reviews.alice.connect();await reviews.alice.flush();await documents.bob.connect();await reviews.bob.connect();await equal('exact uncertain acknowledgement retries');
     for(const p of ['alice','bob']){documents[p].disconnect();reviews[p].disconnect();}
     const address=server.address;await server.crash();const currentLog=readFileSync(paths[0]),exact=sessions.alice.exportRecovery();writeFileSync(paths[0],originalLog);server=await start(address);
     const resumes=requests.filter(k=>k==='resume').length,reviewResumes=requests.filter(k=>k==='reviewResume').length;
     await assert.rejects(documents.alice.connect(),e=>e.code==='server_rollback');await assert.rejects(reviews.alice.connect(),e=>e.code==='server_rollback');rollbackRefusals+=2;
     assert.equal(requests.filter(k=>k==='resume').length,resumes,'Refuse the old document prefix before taking its author lease');assert.equal(requests.filter(k=>k==='reviewResume').length,reviewResumes);assert.deepEqual(sessions.alice.exportRecovery(),exact);
     await server.crash();writeFileSync(paths[0],currentLog);server=await start(address);for(const p of ['alice','bob']){await documents[p].connect();await reviews[p].connect();}await equal('return to the retained valid native host');
    }
    const final=sessions.alice.exportRecovery();detach('alice');await sessions.alice.close();
    let called=false;const {binding:ignored,...local}=options.alice;await assert.rejects(SharedSegmentedPersistentSession.open({...local,restoreSegmented:()=>{called=true;throw Error('No family fallback');}}));assert.equal(called,false);oldAdapterRefusals++;
    sessions.alice=await SharedSegmentedRelaySession.open(options.alice);assert.deepEqual(sessions.alice.exportRecovery(),final);coldReopens++;
    assert.equal(sessions.alice.versions().length,1);assert.equal(sessions.alice.core.segmentedHistoryInfo().activeGeneration,'three');
    attach('alice');await documents.alice.connect();await reviews.alice.connect();
    if(cases===0){assert.equal(sessions.alice.core.undo(),true);await documents.alice.flush();await equal('future Undo after cold generation replay');assert.ok(sessions.alice.core.documentJson().includes('OFFLINE_B'));assert.ok(sessions.alice.core.documentJson().includes('ACTIVE_A'));assert.equal(sessions.alice.core.redo(),true);await documents.alice.flush();await equal('future Redo after cold generation replay');futureHistorySteps+=2;}
    else{assert.equal(sessions.alice.core.undo(),true);await documents.alice.flush();await equal('cross-generation selective Undo');assert.ok(sessions.alice.core.documentJson().includes('OFFLINE_B'));assert.ok(!sessions.alice.core.documentJson().includes('ACTIVE_A'));assert.equal(sessions.alice.core.redo(),true);await documents.alice.flush();await equal('cross-generation selective Redo');assert.ok(sessions.alice.core.documentJson().includes('ACTIVE_A'));futureHistorySteps+=2;}
    assert.ok(errors.every(e=>['local_save_failed','segmented_storage','server_rollback'].includes(e.code)||e.name==='AbortError'),errors.map(String).join('\n'));
    cases++;
   }catch(error){throw new Error(`Generation relay case ${cases}, wire ${wire}, scope ${scope}, natural ${natural}`,{cause:error});}
   finally{fault=null;for(const p of ['alice','bob']){detach(p);await sessions[p]?.discardAndClose();}await server?.stop();}
  }
 }finally{IDBObjectStore.prototype.put=originalPut;IDBObjectStore.prototype.add=originalAdd;profile.free();for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
 assert.equal(lockHost.held.size,0);assert.equal(cases,smoke?1:10);assert.equal(saveRefusals,2);assert.equal(rollbackRefusals,2);
 return {format:'breditor/segmented-relay-functional-probe',passed:true,smoke,cases,coldReopens,oldAdapterRefusals,offlineReconnects,retainedReceipts,acknowledgementSaveRefusals:saveRefusals,serverRollbackRefusals:rollbackRefusals,futureHistorySteps,wireRequests:requests.length,sharedWasmSha256:hash(wasmBytes),nativeHostSha256:hash(readFileSync(executable)),scope:'Actual current Wasm, public document/comment relay adapters and native authenticated durable host. Synthetic IDB/locks; not whole-room activation, server log rotation, independent comment generations or production/browser approval.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length<2||args.length>3||args[2]!==undefined&&args[2]!=='--smoke')throw Error('Expected shared runtime directory, isolated review host, optional --smoke');console.log(JSON.stringify(await probeSegmentedRelay(args[0],args[1],{smoke:args[2]==='--smoke'}),null,2));}
