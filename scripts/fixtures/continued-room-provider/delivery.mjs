/** Check normal client transport against the published, test-owned relay. */
import assert from 'node:assert/strict';
import {WebSocket as NativeWebSocket} from 'undici';

function resumeIdentity(binding,rows,key){
 const row=rows.find(row=>row[key]===binding[key]&&row.principal===binding.principal);
 assert.ok(row,'Original registration for the recovered client is required');
 return {...binding,credential:row.credential};
}

function receiptCut(record){
 return {document:record.relay.document,review:record.relay.reviewReceipt,
  versions:record.retained.versions.packets.filter(row=>row.origin==='local')};
}

export async function deliverPublishedCohort(api,sessions,listener,delivery){
 assert.ok(delivery);
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
   assert.equal(binding.document.endpoint,endpoint);
   assert.equal(binding.review.endpoint,endpoint);
   const document=api.createSharedContinuedRelaySync(session,{...common,
    identity:resumeIdentity(binding.document,delivery.documents,'writer')});
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

   const versions=await session.openVersionCatalog(common);
   await versions.connect();
   await versions.flushShared();
   await session.flush();
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
   acknowledged.set(id,accepted);
  }
  return acknowledged;
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

export async function verifyColdDelivery(api,cohort,destinations,acknowledged){
 const names=new Map(destinations.map(row=>[row.id,row.source]));
 for(const {id,options} of cohort){
  const session=await api.SharedContinuedPairSession.openDelivery({...options,database:names.get(id)});
  try{
   assert.deepEqual(receiptCut(session.exportDeliveryRecovery()),acknowledged.get(id));
   assert.match(session.core.documentJson(),/Local offline document/);
   assert.match(JSON.stringify(session.core.reviewSnapshot().view),/Local offline comment/);
  }finally{await session.close();}
 }
}
