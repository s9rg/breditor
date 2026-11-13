import assert from 'node:assert/strict';
import {deliverPublishedCohort,verifyColdDelivery} from './delivery.mjs';

export async function verifyPublication(api,{input,expected,activation,offer,requests,getToken,cohort,delivery}){
 const {prepareContinuedRoomPublication:prepare,publishContinuedRoom:publish,SharedNativeRoomPublicationHost:Host}=api;
 const handoff=new api.ContinuedRoomSessionHandoff();
 const database='continued-covered-publication';
 const configure=()=>Host.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken,checkAuthority(){}});
 const publication=configure(),before=requests.filter(row=>row.publication).length;
 const health='http://'+offer.selection.listener+'/health';
 const waiting=()=>assert.rejects(fetch(health,{signal:AbortSignal.timeout(400)}),{name:'TimeoutError'});
 const serving=async()=>{
  const response=await fetch(health,{signal:AbortSignal.timeout(4000)});
  assert.equal(response.status,200);
  assert.equal(await response.text(),'breditor-relay-v1');
 };
 let reopened,retained,lostReceipt,attempts=0;
 const fetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  const response=await fetch(url,options);
  if(String(url)===offer.endpoint&&++attempts===1){
   assert.equal(response.status,200);
   lostReceipt=await response.json();
   throw Error('Controlled loss of the actual publication response');
  }
  return response;
 };
 try{
  await waiting();
  const selection=await prepare(input,{database,expected,activation,publication,retainChoice(value){retained=structuredClone(value);}});
  assert.deepEqual(selection,retained);
  assert.deepEqual(selection.activationIntent,expected);
  await assert.rejects(publish(input,{expected:retained,activation,publication,approve:()=>false}),
   error=>error.code==='activation_intent_policy');
  assert.equal(requests.filter(row=>row.publication).length,before);
  await waiting();
  assert.throws(()=>handoff.sessions(),{code:'activation_intent_incomplete'});
  await assert.rejects(handoff.publish(input,{expected:retained,activation,publication,approve(){
   assert.throws(()=>handoff.sessions(),{code:'activation_intent_incomplete'});
   return true;
  }}),
   error=>error.code==='publication_outcome_unknown');
  assert.ok(lostReceipt);
  assert.throws(()=>handoff.sessions(),{code:'activation_intent_incomplete'});
  await serving();
  publication.close();
  reopened=configure();
  const result=await handoff.publish(input,{expected:retained,activation,publication:reopened,approve(plan){
   assert.deepEqual(plan.publication,offer.selection);
   return true;
  }});
  assert.deepEqual(result,{choice:retained,receipt:lostReceipt});
  assert.equal(result.receipt.joint.bytes,retained.graph.bytes);
  assert.equal(Buffer.from(result.receipt.joint.sha256).toString('hex'),retained.graph.sha256);
  assert.equal(requests.filter(row=>row.publication).length-before,2);
  await serving();
  const sessions=handoff.sessions();
  assert.deepEqual([...sessions.keys()].sort(),input.recovery.destinations.map(row=>row.id).sort());
  for(const [id,session] of sessions){
   assert.deepEqual(session.exportDeliveryRecovery(),input.recovery.catalog.participantDeliveryRecords(id).live);
   assert.notEqual(session.core.view().readOnly,true);
   assert.equal(session.core.redo(),true);
   assert.equal(session.core.redoReview().kind,'committed');
   assert.match(session.core.documentJson(),/Local offline document/);
   assert.match(JSON.stringify(session.core.reviewSnapshot().view),/Local offline comment/);
   await session.flush();
  }
  const destinations=input.recovery.destinations;
  const delivered=await deliverPublishedCohort(api,sessions,offer.selection.listener,delivery,destinations,cohort[0].id);
  await handoff.close();
  assert.throws(()=>handoff.sessions(),{code:'activation_intent_incomplete'});
  await verifyColdDelivery(api,cohort,destinations,delivered);
  return {publications:1,writableSessions:sessions.size,deliveredSessions:delivered.acknowledged.size,deliveredUploads:1};
 }finally{globalThis.fetch=fetch;await handoff.close();reopened?.close();publication.close();}
}
