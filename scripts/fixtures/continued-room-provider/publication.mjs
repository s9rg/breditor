import assert from 'node:assert/strict';

export async function verifyPublication(api,{input,expected,activation,offer,requests,getToken}){
 const {prepareContinuedRoomPublication:prepare,publishContinuedRoom:publish,SharedNativeRoomPublicationHost:Host}=api;
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
  await assert.rejects(publish(input,{expected:retained,activation,publication,approve:()=>true}),
   error=>error.code==='publication_outcome_unknown');
  assert.ok(lostReceipt);
  await serving();
  publication.close();
  reopened=configure();
  const result=await publish(input,{expected:retained,activation,publication:reopened,approve(plan){
   assert.deepEqual(plan.publication,offer.selection);
   return true;
  }});
  assert.deepEqual(result,{choice:retained,receipt:lostReceipt});
  assert.equal(result.receipt.joint.bytes,retained.graph.bytes);
  assert.equal(Buffer.from(result.receipt.joint.sha256).toString('hex'),retained.graph.sha256);
  assert.equal(requests.filter(row=>row.publication).length-before,2);
  await serving();
  return 1;
 }finally{globalThis.fetch=fetch;reopened?.close();publication.close();}
}
