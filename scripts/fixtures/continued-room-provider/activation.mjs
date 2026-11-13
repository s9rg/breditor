import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IDBDatabase} from 'fake-indexeddb';

const exists=async database=>(await indexedDB.databases()).some(row=>row.name===database);

export async function verifyActivationIntent(api,{original,replacement,offer,requests}){
 const {prepareContinuedRoomActivation:prepare,verifyContinuedRoomActivation:verify,commitContinuedRoomActivation:commit,
  SharedDurableNativeActivationHost:Host}=api;
 const configure=selected=>Host.configure({endpoint:offer.endpoint,expected:selected,principal:'operator',
  getToken(){assert.fail('Preparation cannot commit Native activation');},checkAuthority(){}});
 const activation=configure(offer.selection);
 const database='continued-room-activation',options={database,activation};
 const before=requests.length;
 let reopened;
 try{
  // A complete local restore at an older cut still has unapplied accepted input.
  await assert.rejects(prepare(original,{...options,retainChoice(){assert.fail('Incomplete cut');}}),
   error=>error.code==='activation_intent_incomplete');
  assert.equal(await exists(database),false);
  await assert.rejects(prepare(replacement,{...options,database:replacement.recovery.database,
   retainChoice(){assert.fail('Activation journal cannot alias a recovery journal');}}),error=>error.code==='activation_intent_stale');

  const stopped=new Error('Independent storage declined the selection');
  await assert.rejects(prepare(replacement,{...options,retainChoice(){throw stopped;}}),error=>error===stopped);
  assert.equal(await exists(database),false);
  let selected;
  const expected=await prepare(replacement,{...options,async retainChoice(value){
   assert.ok(Object.isFrozen(value));
   assert.equal(await exists(database),false);
   selected=structuredClone(value);
  }});
  assert.deepEqual(expected,selected);
  activation.close();
  reopened=configure(offer.selection);
  const transaction=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(...args){
   if(this.name===database)assert.equal(args[1],'readonly');
   return transaction.apply(this,args);
  };
  try{
   const plan=await verify(replacement,{expected:selected,activation:reopened});
   assert.deepEqual(plan.activation,offer.selection);
   assert.deepEqual(plan.server.source,offer.selection.current);
   assert.equal(plan.recoveryDatabase,replacement.recovery.database);
   assert.deepEqual(plan.recovery.catalog,replacement.recovery.expected);
   const bytes=Buffer.from(JSON.stringify(plan));
   assert.equal(bytes.length,selected.graph.bytes);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),selected.graph.sha256);
   await assert.rejects(verify(replacement,{expected:{...selected,graph:{...selected.graph,sha256:'0'.repeat(64)}},activation:reopened}),
    error=>error.code==='activation_intent_stale');
   await assert.rejects(verify(replacement,{expected:{...selected,database:'missing-intent'},activation:reopened}),
    error=>error.code==='activation_intent_missing');
   assert.equal(await exists('missing-intent'),false);
  }finally{IDBDatabase.prototype.transaction=transaction;}
  assert.ok(requests.length>before);
  await assert.rejects(commit(replacement,{expected:selected,activation:reopened,approve(){assert.fail('Unbound review must refuse before approval');}}),
   error=>error.code==='activation_intent_incomplete');
  assert.equal(requests.filter(row=>row.activation).length,0);
  return 1;
 }finally{reopened?.close();activation.close();}
}

async function activationState(database){
 const connection=await new Promise((resolve,reject)=>{
  const request=indexedDB.open(database);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
 try{
  return await new Promise((resolve,reject)=>{
   const tx=connection.transaction('activation','readonly'),request=tx.objectStore('activation').get('state');
   tx.oncomplete=()=>resolve(JSON.parse(request.result));tx.onabort=()=>reject(tx.error);
  });
 }finally{connection.close();}
}

export async function verifyActivationCommit(api,{input,offer,requests,getToken}){
 const {prepareContinuedRoomActivation:prepare,verifyContinuedRoomActivation:verify,commitContinuedRoomActivation:commit,
  SharedDurableNativeActivationHost:Host}=api;
 const database='continued-covered-activation';
 const configure=()=>Host.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken,checkAuthority(){}});
 const activation=configure(),fetch=globalThis.fetch,before=requests.filter(row=>row.activation).length;
 let expected,lostReceipt,reopened,commitCount=0;
 globalThis.fetch=async (url,options)=>{
  const response=await fetch(url,options);
  if(String(url)!==offer.endpoint)return response;
  if(++commitCount===1){
   assert.equal(response.status,200,'The Native relay must actually commit before losing its response');
   lostReceipt=JSON.parse(await response.text());
   throw Error('Controlled loss of the actual activation response');
  }
  return response;
 };
 try{
  const prepared=await prepare(input,{database,activation,retainChoice(value){expected=structuredClone(value);}});
  assert.deepEqual(prepared,expected);
  assert.equal((await activationState(database)).phase,'prepared');
  await assert.rejects(commit(input,{expected,activation,approve:()=>false}),error=>error.code==='activation_intent_policy');
  assert.equal(commitCount,0);
  assert.equal((await activationState(database)).phase,'prepared');
  await assert.rejects(commit(input,{expected,activation,approve:()=>true}),error=>error.code==='activation_outcome_unknown');
  assert.ok(lostReceipt,'A real Native commit must precede the lost reply');
  assert.equal((await activationState(database)).phase,'request-started');
  activation.close();
  reopened=configure();
  await verify(input,{expected,activation:reopened});
  const confirmed=await commit(input,{expected,activation:reopened,approve(plan){
   assert.deepEqual(plan.recovery.catalog,input.recovery.expected);
   return true;
  }});
  assert.deepEqual(confirmed,{choice:expected,receipt:lostReceipt});
  assert.equal(BigInt(confirmed.receipt.selection.planned.generation),BigInt(offer.selection.previous.generation)+1n);
  const saved=await activationState(database);
  assert.equal(saved.phase,'receipt-observed');
  assert.deepEqual(saved.receipt,lostReceipt);
  assert.deepEqual(await commit(input,{expected,activation:reopened,approve:()=>true}),confirmed);
  assert.deepEqual(await activationState(database),saved);
  assert.equal(requests.filter(row=>row.activation).length-before,3);
  return 1;
 }finally{globalThis.fetch=fetch;reopened?.close();activation.close();}
}
