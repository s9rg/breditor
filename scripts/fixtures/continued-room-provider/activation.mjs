import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IDBDatabase} from 'fake-indexeddb';

const exists=async database=>(await indexedDB.databases()).some(row=>row.name===database);

export async function verifyActivationIntent(api,{original,replacement,offer,requests}){
 const {prepareContinuedRoomActivation:prepare,verifyContinuedRoomActivation:verify,SharedDurableNativeActivationHost:Host}=api;
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
  return 1;
 }finally{reopened?.close();activation.close();}
}
