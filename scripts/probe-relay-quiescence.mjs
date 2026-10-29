/** Real native Wasm, actual paired persistence and authenticated native host.
 * Only IDB/Web Locks and the deliberately held save callback are controlled.
 * The same public-only workflow runs from fresh installed and bundled code. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {WebSocket as Socket} from 'undici';
import {IDBFactory} from 'fake-indexeddb';
import {startReviewHost} from './fixtures/relay-host.mjs';
const origin='http://127.0.0.1:49785',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(key=>[key,canonical(v[key])])):v;
export async function probeRelayQuiescence(directory,executable,{sdkModule=new URL('../packages/breditor-collaboration/dist/index.js',import.meta.url),rootFixture=new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)}={}){
 const api=await import(sdkModule),wasmBytes=readFileSync(join(directory,'breditor_shared_bg.wasm')),native=await import(pathToFileURL(resolve(directory,'breditor_shared.js')));await native.default({module_or_path:wasmBytes});
 const configuration=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/relay-quiescence-functional',version:1},extensions:[]}),profile=native.SharedRichProfile.from_standard_configuration_json_v3(configuration),descriptor=JSON.parse(profile.descriptor_json()),document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(JSON.parse(readFileSync(rootFixture,'utf8')))});
 const globals=new Map(['indexedDB','navigator','WebSocket'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),held=new Set(),locks={request(name,_options,visit){return Promise.resolve().then(async()=>{if(held.has(name))return visit(null);held.add(name);try{return await visit({name});}finally{held.delete(name);}});}};
 let requests=0;for(const[name,value]of Object.entries({indexedDB:new IDBFactory(),navigator:{locks},WebSocket:class extends Socket{constructor(url){super(url,{headers:{Origin:origin}});}send(raw){assert.ok(++requests<20000);return super.send(raw);}}}))Object.defineProperty(globalThis,name,{configurable:true,value});
 let cases=0,retainedOfflineEnds=0,heldSaveDrains=0,earlyReattachmentRefusals=0,duplicateReviewRecoveries=0,futureHistorySteps=0,closedEndpoints=0;
 try{for(const selection of ['original','document-v1'])for(const lane of ['document','review']){
  const temporary=mkdtempSync(join(tmpdir(),'breditor-relay-quiescence-fixture-')),paths=['room.log','profile.json','document.json','auth.json'].map(name=>join(temporary,name)),token=randomBytes(32).toString('hex');
  for(const[path,value]of [[paths[1],configuration],[paths[2],document],[paths[3],JSON.stringify({format:'breditor/relay-auth',formatVersion:1,origins:[origin],accounts:['alice','functional-owner'].map(principal=>({principal,tokenHash:[...createHash('sha256').update(principal==='alice'?token:randomBytes(32).toString('hex')).digest()]}))})]])writeFileSync(path,value,{mode:0o600});
  let host,session,doc,review,pending,gate,entered,block=false,savedProgress;
  const common={getToken:()=>token,autoConnect:false,requestTimeoutMs:5000};
  try{
   host=await startReviewHost(executable,[...paths,'127.0.0.1:0']);const endpoint='ws://'+host.address+'/ws';
   const documentRegistration=await api.registerSharedRelayWriter({...common,endpoint,principal:'alice',room:'room',writerTransport:'atomic-v2',saveIdentity(){}}),reviewRegistration=await api.registerSharedReviewWriter({...common,endpoint,principal:'alice',room:'room',actor:'quiescence-alice',documentWriter:documentRegistration.identity.writer,writerTransport:'atomic-v2',saveIdentity(){}}),{credential,observerCredential,...binding}=reviewRegistration.identity;
   const options={database:'quiescence-'+cases,room:'room',writer:binding.documentWriter,review:{actor:binding.actor,principal:'alice',access:'comment'},relay:binding,richLanguage:3,history:'explicit',rangeEditing:selection==='document-v1'?'general-v1':'original',selectionEditing:selection,create:()=>profile.join_frame('room',binding.documentWriter,reviewRegistration.frame),restore:input=>selection==='document-v1'?profile.restore_document('room',input):profile.restore('room',input)};
   session=await api.SharedReviewPersistentSession.open(options);
   const storage={core:session.core,reviewRelayIdentity:()=>session.reviewRelayIdentity(),reviewRelayProgress:()=>session.reviewRelayProgress(),flush:()=>session.flush(),persistReviewRelayProgress:async progress=>{if(block&&lane==='review'&&BigInt(progress.accepted?.through??'0')>BigInt(savedProgress.accepted?.through??'0')){entered.resolve();await gate.promise;}await session.persistReviewRelayProgress(progress);}};
   const documentOptions={...common,selectionEditing:selection,identity:documentRegistration.identity,persistLocal:async()=>{if(block&&lane==='document'){entered.resolve();await gate.promise;}await session.flush();}};
   const attachDocument=()=>selection==='document-v1'?api.createSharedDocumentRelaySync(session.core,documentOptions):new api.SharedRelaySync(session.core,documentOptions),attachReview=()=>new api.SharedReviewRelaySync({...common,identity:reviewRegistration.identity,storage,flushDocument:()=>doc.flush()});
   doc=attachDocument();review=attachReview();await doc.connect();await review.connect();savedProgress=session.reviewRelayProgress();gate=deferred();entered=deferred();block=true;
   if(lane==='document')session.core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Offline retained text '}}]});
   else session.core.dispatchReview({kind:'create_thread',data:{anchorJson:session.core.captureReviewAnchor({kind:'document'}),body:'Retained comment once'}});
   const old=lane==='document'?doc:review;pending=old.flush();void pending.catch(()=>{});await Promise.race([entered.promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Held save was not reached')),15000);timer.unref();})]);await session.flush();
   const nativeBefore=session.core.checkpointJson(),reviewBefore=session.core.reviewCheckpoint();assert.equal(old.state().pending,true);old.dispose();assert.equal(old.state().status,'closed');
   assert.throws(lane==='document'?attachDocument:attachReview,error=>error.code===(lane==='document'?'relay_already_attached':'review_relay_already_attached'));earlyReattachmentRefusals++;
   let drained=false;const drain=old.waitForDisconnected().then(()=>{drained=true;});await Promise.resolve();await Promise.resolve();assert.equal(drained,false,'A visible Closed status cannot finish a held real save');
   block=false;gate.resolve();await drain;await Promise.allSettled([pending]);heldSaveDrains++;
   assert.equal(session.core.checkpointJson(),nativeBefore);assert.equal(session.core.reviewCheckpoint(),reviewBefore);retainedOfflineEnds++;
   if(lane==='document')doc=attachDocument();else review=attachReview();await doc.connect();await doc.flush();await review.connect();await review.flush();await session.flush();
   assert.equal(doc.state().pending,false);assert.equal(review.state().pending,false);assert.equal(session.core.reviewSnapshot().view.threads.length,lane==='review'?1:0);
   if(lane==='review'){assert.deepEqual(session.reviewRelayProgress().accepted,session.core.localReviewClock());duplicateReviewRecoveries++;}
   for(const method of lane==='document'?['undo','redo']:['undoReview','redoReview']){const result=session.core[method]();assert.equal(typeof result==='boolean'?result:result.kind==='committed',true);await doc.flush();await review.flush();futureHistorySteps++;}
   doc.dispose();review.dispose();await Promise.all([doc.waitForDisconnected(),review.waitForDisconnected()]);await session.flush();const saved=session.exportRecovery();await session.close();session=await api.SharedReviewPersistentSession.open(options);assert.deepEqual(session.exportRecovery(),saved);cases++;
  }finally{block=false;gate?.resolve();doc?.dispose();review?.dispose();await Promise.allSettled([pending,doc?.waitForDisconnected?.(),review?.waitForDisconnected?.()]);await session?.discardAndClose();if(host){await host.stop();let code;try{await fetch('http://'+host.address,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}assert.equal(code,'ECONNREFUSED');closedEndpoints++;}}
 }}finally{profile.free();for(const[name,value]of globals){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}}
 assert.equal(held.size,0);assert.equal(cases,4);assert.equal(heldSaveDrains,4);assert.equal(earlyReattachmentRefusals,4);assert.equal(retainedOfflineEnds,4);assert.equal(duplicateReviewRecoveries,2);assert.equal(futureHistorySteps,8);assert.equal(closedEndpoints,4);
 return{format:'breditor/relay-recovery-quiescence-probe',formatVersion:1,passed:true,cases,heldSaveDrains,earlyReattachmentRefusals,retainedOfflineEnds,duplicateReviewRecoveries,futureHistorySteps,closedEndpoints,requests,normalWasmSha256:sha(wasmBytes),nativeHostSha256:sha(readFileSync(executable)),scope:'Public document/comment drains, real paired persistent source, actual authenticated native server, late saves, exact cold reopens and future native Undo/Redo. Synthetic IDB/locks; not whole-room/provider activation or all packet-lane reconciliation.'};
}
