/** Check normal client transport against the published, test-owned relay. */
import assert from 'node:assert/strict';
import {WebSocket as NativeWebSocket} from 'undici';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {unavailableAsset,unavailableUpload} from '../physical-recovery-control/unavailable-upload.mjs';
import {secondAsset} from '../review-assets/pixels.mjs';
import {checkOutageAcknowledgements,checkOutageConvergence,queueOutageWork} from './outage.mjs';
import {checkLostEdit,interceptSocketAcknowledgements,observeUnacknowledgedEdit} from './lost-edit-ack.mjs';
import {checkLostComment,countVersionSubmissions,observeUnacknowledgedComment,observeUnacknowledgedVersion} from './lost-metadata-ack.mjs';
import {checkLostSuggestionEffect,observeUnacknowledgedDecision,observeUnacknowledgedRevision} from './lost-suggestion-ack.mjs';
import {observeUnacknowledgedUpload,recoverUnacknowledgedUpload} from './lost-upload-ack.mjs';

function resumeIdentity(binding,rows,key){
 const row=rows.find(row=>row[key]===binding[key]&&row.principal===binding.principal);
 assert.ok(row,'Original registration for the recovered client is required');
 return {...binding,credential:row.credential};
}

function receiptCut(record){
 return {document:record.relay.document,review:record.relay.reviewReceipt,
  versions:record.retained.versions.packets.filter(row=>row.origin==='local'),
  suggestions:record.retained.suggestions.retained.filter(row=>row.origin==='local'),
  revisions:record.retained.revisions.retained};
}

function installSocket(endpoint,wrap=Base=>Base){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');
 const socket=class extends NativeWebSocket{
  constructor(url){
   assert.equal(String(url),endpoint,'Client delivery must use the owned serving endpoint');
   super(url,{headers:{Origin:'http://127.0.0.1:4187'}});
  }
 };
 Object.defineProperty(globalThis,'WebSocket',{configurable:true,writable:true,value:wrap(socket)});
 return ()=>{
  if(previous)Object.defineProperty(globalThis,'WebSocket',previous);
  else delete globalThis.WebSocket;
 };
}

function clients(api,session,delivery,endpoint,adapters){
 const original=session.exportDeliveryRecovery(),{binding}=original.relay;
 const {binding:suggestionsBinding,effectWriter}=original.retainedBinding.suggestions.identity;
 assert.equal(binding.document.endpoint,endpoint);
 assert.equal(binding.review.endpoint,endpoint);
 const common={autoConnect:false,getToken:()=>delivery.accountToken,requestTimeoutMs:6000};
 const document=api.createSharedContinuedRelaySync(session,{...common,
  identity:resumeIdentity(binding.document,delivery.documents,'writer'),
  suggestions:{binding:suggestionsBinding,effectWriter},suggestionRevisions:original.retainedBinding.revisions});
 adapters.push(document);
 const review=api.createSharedContinuedReviewRelaySync(session,{...common,
  identity:resumeIdentity(binding.review,delivery.reviews,'actor'),flushDocument:()=>document.flush()});
 adapters.push(review);
 return {original,common,document,review};
}

async function stopAdapters(adapters){
 for(const adapter of adapters)adapter.dispose();
 await Promise.all(adapters.map(adapter=>adapter.waitForDisconnected()));
}

async function syncRetained(session,document,common,checkSuggestions){
 const queue=await session.openSuggestionQueue();
 const revisions=await session.openSuggestionRevisions({transport:document});
 await revisions.connect();
 await revisions.synchronize();
 await revisions.close();
 if(checkSuggestions)await checkSuggestions(queue);
 const versions=await session.openVersionCatalog(common);
 await versions.connect();
 await versions.flushShared();
 await versions.close();
}

async function deliverUpload(api,uploads,options){
 const store=await RichAssetStore.openRetained(uploads);
 const assets=new api.SharedRelayAssets({...options,store});
 try{
  assert.equal((await store.get(unavailableAsset)).status,'pending');
  const cancelled=await store.get(secondAsset);
  assert.equal(cancelled.status,'cancelled');
  assert.equal(await assets.readBytes(unavailableAsset),undefined);
  await assets.flush();
  const accepted=await store.get(unavailableAsset);
  assert.equal(accepted.status,'uploaded',accepted.failure??'Expected an upload acknowledgement');
  assert.deepEqual(await store.get(secondAsset),cancelled);
  assert.equal(accepted.storageRef,'breditor:relay-asset:1:'+unavailableAsset);
  const remote=await assets.readBytes(unavailableAsset);
  assert.ok(remote);
  assert.deepEqual(Buffer.from(await remote.blob.arrayBuffer()),unavailableUpload);
  return accepted;
 }finally{assets.dispose();store.close();}
}

export async function deliverPublishedCohort(api,sessions,listener,delivery,destinations,uploadId){
 assert.ok(Array.isArray(delivery?.documents)&&Array.isArray(delivery.reviews),'Private client registrations are required');
 const endpoint='ws://'+listener+'/ws';
 const restoreSocket=installSocket(endpoint);
 const acknowledged=new Map(),adapters=[];
 try{
  for(const [id,session] of sessions){
   const {original,common,document,review}=clients(api,session,delivery,endpoint,adapters);
   await document.connect();
   await document.flush();
   assert.equal(document.state().pending,false);
   await review.connect();
   await review.flush();
   assert.equal(review.state().pending,false);

   await syncRetained(session,document,common);
   await session.flush();
   assert.equal(session.core.documentJson().includes('Offline revision '),false);
   const accepted=receiptCut(session.exportDeliveryRecovery());
   assert.ok(accepted.document.receipt);
   assert.ok(accepted.review);
   assert.ok(BigInt(accepted.document.accepted.through)>BigInt(original.relay.document.accepted.through));
   assert.ok(BigInt(accepted.review.receipt.through)>BigInt(original.relay.review.accepted.through));
   const queued=original.retained.versions.packets.filter(row=>row.origin==='local');
   assert.equal(queued.length,1);
   assert.equal(queued[0].accepted,null);
   assert.equal(accepted.versions.length,1);
   assert.equal(accepted.versions[0].packet,queued[0].packet);
   assert.ok(accepted.versions[0].accepted);
   const before=receiptCut(original);
   assert.equal(before.suggestions.length,1);
   assert.equal(before.suggestions[0].publish,true);
   assert.equal(accepted.suggestions.length,1);
   assert.equal(accepted.suggestions[0].packet,before.suggestions[0].packet);
   assert.ok(accepted.suggestions[0].publication);
   assert.equal(accepted.suggestions[0].decision?.decision,'reject');
   assert.equal(before.revisions.length,1);
   assert.equal(before.revisions[0].retry,true);
   assert.equal(accepted.revisions.length,1);
   assert.equal(accepted.revisions[0].packet,before.revisions[0].packet);
   assert.equal(accepted.revisions[0].retry,false);
   assert.ok(accepted.revisions[0].receipt);
   acknowledged.set(id,accepted);
  }
  const uploads=destinations.find(row=>row.id===uploadId).uploads;
  const upload=await deliverUpload(api,uploads,{endpoint,getToken:()=>delivery.accountToken,principal:'alice'});
  return {acknowledged,upload,uploads};
 }finally{
  try{await stopAdapters(adapters);}finally{restoreSocket();}
 }
}

export async function verifyRestartedDelivery(api,{restart,cohort,destinations,delivered,delivery,listener}){
 const endpoint='ws://'+listener+'/ws',health='http://'+listener+'/health';
 const names=new Map(destinations.map(row=>[row.id,row.source]));
 let queued,lost;
 const [decisionAuthor,revisionAuthor,affected,versionAuthor]=cohort.slice(-4);
 const interruptedId=affected.id,versionId=versionAuthor.id;
 const uploadOptions=accountToken=>({endpoint,principal:'alice',getToken:()=>accountToken});
 const fresh=await restart(delivery,async crash=>{
  const gate=interceptSocketAcknowledgements(),restoreSocket=installSocket(endpoint,gate.socket);
  const sessions=[];
  try{
   for(const {id,options} of [affected,versionAuthor,decisionAuthor,revisionAuthor])
    sessions.push(await api.SharedContinuedPairSession.openDelivery({...options,database:names.get(id)}));
   const [session,versionSession,decisionSession,revisionSession]=sessions;
   const adapters=[];
   try{
    const {document,review,common}=clients(api,session,delivery,endpoint,adapters);
    const decisionTransport=clients(api,decisionSession,delivery,endpoint,adapters).document;
    const revisionTransport=clients(api,revisionSession,delivery,endpoint,adapters).document;
    await document.connect();
    await review.connect();
    const version=await observeUnacknowledgedVersion(versionSession,common,endpoint);
    const upload=await observeUnacknowledgedUpload(api,delivered.uploads,uploadOptions(delivery.accountToken));
    const revision=await observeUnacknowledgedRevision(revisionSession,revisionTransport,gate);
    const comment=await observeUnacknowledgedComment(session,review,gate);
    const edit=await observeUnacknowledgedEdit(session,document,gate);
    const decision=await observeUnacknowledgedDecision(api,decisionSession,decisionTransport,gate);
    try{
     await crash();
     await Promise.all([comment.afterCrash(),edit.afterCrash(),revision.afterCrash(),decision.afterCrash()]);
     lost={comment,edit,version,upload,revision,decision};
    }finally{await decision.stop();}
   }finally{
    await stopAdapters(adapters);
   }
  }finally{
   try{await Promise.all(sessions.map(session=>session.close()));}finally{restoreSocket();}
  }
 },async()=>{queued=await queueOutageWork(api,cohort,names,health);});
 const outgoing=interceptSocketAcknowledgements({holdReply:false}),restoreSocket=installSocket(endpoint,outgoing.socket);
 const versionSubmissions=countVersionSubmissions(endpoint,lost.version.packet);
 const decisionSubmissions=outgoing.arm('suggestionDecide'),revisionSubmissions=outgoing.arm('suggestionRevisionPublish');
 let editSubmissions,commentSubmissions;
 const options=offer=>({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',
  getToken:fresh.getToken,checkAuthority(){}});
 let activation,publication;
 try{
  activation=api.SharedDurableNativeActivationHost.configure(options(fresh.activation));
  publication=api.SharedNativeRoomPublicationHost.configure(options(fresh.publication));
  const unavailable=()=>assert.rejects(fetch(health,{signal:AbortSignal.timeout(400)}),{name:'TimeoutError'});
  await unavailable();
  const commit=await activation.commit();
  assert.deepEqual(commit.selection,fresh.activation.selection);
  await unavailable();
  // Independently pin the fresh Native association. The previous publication
  // intent belongs to its old epoch and must never authorize the new listener.
  const binding=JSON.stringify({activation:commit.selection,publication:fresh.publication.selection});
  const joint={bytes:Buffer.byteLength(binding),sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',Buffer.from(binding)))]};
  const published=await publication.publish(joint);
  assert.deepEqual(published.selection,fresh.publication.selection);
  assert.deepEqual(published.joint,joint);
  const online=await fetch(health,{signal:AbortSignal.timeout(4000)});
  assert.equal(await online.text(),'breditor-relay-v1');

  const credentials={...delivery,accountToken:fresh.accountToken};
  const acknowledged=new Map();
  let confirmed=0,expectedDocument;
  for(const {id,options} of [...cohort.filter(row=>queued.has(row.id)),...cohort.filter(row=>!queued.has(row.id))]){
   const session=await api.SharedContinuedPairSession.openDelivery({...options,database:names.get(id)});
   const adapters=[];
   try{
    const {document,review,common}=clients(api,session,credentials,endpoint,adapters);
    const before=receiptCut(session.exportDeliveryRecovery());
    const previous=delivered.acknowledged.get(id),work=queued.get(id);
    if(id===versionId||work){
     const pendingPacket=work?.packet??lost.version.packet;
     const pending=before.versions.find(row=>row.packet===pendingPacket);
     assert.ok(pending?.publish);
     assert.equal(pending.accepted,null);
     assert.deepEqual({...before,versions:before.versions.filter(row=>row.packet!==pendingPacket)},previous);
    }
    else if(id===decisionAuthor.id){
     const decision=before.suggestions.find(row=>row.packet===lost.decision.packet);
     assert.equal(decision.decision,null);
     assert.equal(decision.intent.retry,true);
     assert.deepEqual({...before,suggestions:before.suggestions.filter(row=>row!==decision)},previous);
    }else if(id===revisionAuthor.id){
     const revision=before.revisions.find(row=>row.packet===lost.revision.packet);
     assert.equal(revision.receipt,null);
     assert.equal(revision.retry,true);
     assert.deepEqual({...before,revisions:before.revisions.filter(row=>row!==revision),
      suggestions:before.suggestions.filter(row=>row.packet!==lost.revision.previousPacket)},previous);
    }else assert.deepEqual(before,previous);
    if(id===interruptedId){
     editSubmissions=outgoing.arm('submit');
     commentSubmissions=outgoing.arm('reviewSubmit');
    }
    await document.connect();await document.flush();
    await review.connect();await review.flush();
    await syncRetained(session,document,common,id===decisionAuthor.id?async queue=>{
     const sync=new api.SharedSuggestionSync(queue,document,{autoStart:false});
     try{await sync.connect();await sync.flushShared();}
     finally{
      sync.disconnect();
      try{await sync.waitForDisconnected();}finally{sync.dispose();}
     }
    }:undefined);
    assert.equal(document.state().pending,false);
    assert.equal(review.state().pending,false);
    const accepted=receiptCut(session.exportDeliveryRecovery());
    if(id===interruptedId){
     assert.deepEqual(accepted,{...previous,document:{accepted:lost.edit.clock,receipt:lost.edit.before.receipt}});
     const progress=session.exportDeliveryRecovery().relay.review;
     assert.deepEqual(progress.accepted,lost.comment.clock);
     assert.equal(progress.sequence,null,'Recover the author prefix without fabricating a receipt');
    }else if(id===versionId){
     assert.deepEqual({...accepted,versions:accepted.versions.filter(row=>row.packet!==lost.version.packet)},previous);
     assert.deepEqual(accepted.versions.filter(row=>row.packet===lost.version.packet),[{
      packet:lost.version.packet,origin:'local',publish:false,accepted:lost.version.entry,
     }]);
    }else if(id===decisionAuthor.id){
     const decision=accepted.suggestions.find(row=>row.packet===lost.decision.packet);
     assert.deepEqual(decision.decision,lost.decision.decision);
     assert.equal(decision.intent.retry,false);
     assert.deepEqual({...accepted,suggestions:accepted.suggestions.filter(row=>row!==decision)},previous);
    }else if(id===revisionAuthor.id){
     const revision=accepted.revisions.find(row=>row.packet===lost.revision.packet);
     assert.deepEqual(revision.receipt,lost.revision.receipt);
     assert.equal(revision.retry,false);
     const predecessor=accepted.suggestions.find(row=>row.packet===lost.revision.previousPacket);
     assert.deepEqual(predecessor.decision,lost.revision.receipt.previousDecision);
     assert.deepEqual({...accepted,revisions:accepted.revisions.filter(row=>row!==revision),
      suggestions:accepted.suggestions.filter(row=>row!==predecessor)},previous);
    }else if(work)checkOutageAcknowledgements(session,previous,accepted,work);
    else assert.deepEqual(accepted,previous);
    acknowledged.set(id,accepted);
    if(confirmed>=1){
     checkOutageConvergence(session.core,queued);
     expectedDocument??=session.core.documentJson();
     assert.equal(session.core.documentJson(),expectedDocument);
    }
    assert.match(session.core.documentJson(),/Local offline document/);
    assert.match(JSON.stringify(session.core.reviewSnapshot().view),/Local offline comment/);
    checkLostEdit(session.core);
    checkLostComment(session.core);
    checkLostSuggestionEffect(session.core,lost.decision.decision);
    assert.deepEqual(session.core.writerClockAt(lost.edit.clock.writer,lost.edit.clock.through,2),lost.edit.clock);
    confirmed++;
   }finally{
    try{await stopAdapters(adapters);}finally{await session.close();}
   }
  }
  // The first writer was connected before its peer's upload. A second cold
  // connection verifies catch-up and exact receipts for both original writers.
  for(const {id,options} of cohort.filter(row=>acknowledged.has(row.id))){
   const session=await api.SharedContinuedPairSession.openDelivery({...options,database:names.get(id)});
   const adapters=[];
   try{
    const {document,review,common}=clients(api,session,credentials,endpoint,adapters);
    assert.deepEqual(receiptCut(session.exportDeliveryRecovery()),acknowledged.get(id));
    await document.connect();await document.flush();
    await review.connect();await review.flush();
    await syncRetained(session,document,common);
    checkOutageConvergence(session.core,queued);
    assert.equal(session.core.documentJson(),expectedDocument);
    assert.deepEqual(receiptCut(session.exportDeliveryRecovery()),acknowledged.get(id));
    if(id===interruptedId)assert.deepEqual(session.exportDeliveryRecovery().relay.review.accepted,lost.comment.clock);
   }finally{
    try{await stopAdapters(adapters);}finally{await session.close();}
   }
  }
  const store=await RichAssetStore.openRetained(delivered.uploads);
  const assets=new api.SharedRelayAssets({endpoint,principal:'alice',getToken:()=>fresh.accountToken,store});
  try{
   const remote=await assets.readBytes(unavailableAsset);
   assert.ok(remote);
   assert.deepEqual(Buffer.from(await remote.blob.arrayBuffer()),unavailableUpload);
   assert.deepEqual(await store.get(unavailableAsset),delivered.upload);
  }finally{assets.dispose();store.close();}
  assert.equal(editSubmissions.submitted.length,0);
  assert.equal(commentSubmissions.submitted.length,0);
  assert.equal(decisionSubmissions.submitted.length,0);
  assert.equal(revisionSubmissions.submitted.length,0);
  versionSubmissions.check();
  await recoverUnacknowledgedUpload(api,delivered.uploads,uploadOptions(fresh.accountToken),lost.upload);
  return {restartedSessions:confirmed,outageWriters:queued.size,recoveredLostEditAcknowledgements:1,
   recoveredLostCommentAcknowledgements:1,recoveredLostVersionAcknowledgements:1,
   recoveredLostDecisionAcknowledgements:1,recoveredLostRevisionAcknowledgements:1,recoveredLostUploadAcknowledgements:1};
 }finally{
  versionSubmissions.restore();
  restoreSocket();
  publication?.close();
  activation?.close();
  await fresh.stop();
 }
}

export async function verifyColdDelivery(api,cohort,destinations,{acknowledged,upload,uploads}){
 const names=new Map(destinations.map(row=>[row.id,row.source]));
 for(const {id,options} of cohort){
  const session=await api.SharedContinuedPairSession.openDelivery({...options,database:names.get(id)});
  try{
   assert.deepEqual(receiptCut(session.exportDeliveryRecovery()),acknowledged.get(id));
   assert.match(session.core.documentJson(),/Local offline document/);
   assert.match(JSON.stringify(session.core.reviewSnapshot().view),/Local offline comment/);
  }finally{await session.close();}
 }
 const store=await RichAssetStore.openRetained(uploads);
 try{
  assert.deepEqual(await store.get(unavailableAsset),upload);
  assert.equal((await store.get(secondAsset)).status,'cancelled');
  assert.deepEqual(Buffer.from(await(await store.blob(unavailableAsset)).arrayBuffer()),unavailableUpload);
 }finally{store.close();}
}
