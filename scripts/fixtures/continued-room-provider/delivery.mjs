/** Check normal client transport against the published, test-owned relay. */
import assert from 'node:assert/strict';
import {WebSocket as NativeWebSocket} from 'undici';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {unavailableAsset,unavailableUpload} from '../physical-recovery-control/unavailable-upload.mjs';
import {secondAsset} from '../review-assets/pixels.mjs';

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
 const originalSocket=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');
 Object.defineProperty(globalThis,'WebSocket',{configurable:true,writable:true,value:class extends NativeWebSocket{
  constructor(url){
   assert.equal(String(url),endpoint,'Client delivery must use the owned serving endpoint');
   super(url,{headers:{Origin:'http://127.0.0.1:4187'}});
  }
 }});
 const acknowledged=new Map(),adapters=[];
 const common={autoConnect:false,getToken:()=>delivery.accountToken,requestTimeoutMs:6000};
 try{
  for(const [id,session] of sessions){
   const original=session.exportDeliveryRecovery(),{binding}=original.relay;
   const {binding:suggestionsBinding,effectWriter}=original.retainedBinding.suggestions.identity;
   assert.equal(binding.document.endpoint,endpoint);
   assert.equal(binding.review.endpoint,endpoint);
   const document=api.createSharedContinuedRelaySync(session,{...common,
    identity:resumeIdentity(binding.document,delivery.documents,'writer'),
    suggestions:{binding:suggestionsBinding,effectWriter},suggestionRevisions:original.retainedBinding.revisions});
   adapters.push(document);
   const review=api.createSharedContinuedReviewRelaySync(session,{...common,
    identity:resumeIdentity(binding.review,delivery.reviews,'actor'),flushDocument:()=>document.flush()});
   adapters.push(review);
   await document.connect();
   await document.flush();
   assert.equal(document.state().pending,false);
   await review.connect();
   await review.flush();
   assert.equal(review.state().pending,false);

   await session.openSuggestionQueue();
   const revisions=await session.openSuggestionRevisions({transport:document});
   await revisions.connect();
   await revisions.synchronize();
   await revisions.close();
   const versions=await session.openVersionCatalog(common);
   await versions.connect();
   await versions.flushShared();
   await versions.close();
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
  const upload=await deliverUpload(api,uploads,{endpoint,getToken:common.getToken,principal:'alice'});
  return {acknowledged,upload,uploads};
 }finally{
  try{
   for(const adapter of adapters)adapter.dispose();
   await Promise.all(adapters.map(adapter=>adapter.waitForDisconnected()));
  }finally{
   if(originalSocket)Object.defineProperty(globalThis,'WebSocket',originalSocket);
   else delete globalThis.WebSocket;
  }
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
