import assert from 'node:assert/strict';
import {IDBDatabase} from 'fake-indexeddb';
import {RichAssetStore} from '@breditor/experimental-rich-content';

const bytes=blob=>blob.arrayBuffer();
const exists=async database=>(await indexedDB.databases()).some(row=>row.name===database);

export async function verifyContinuedRoomReplacement(api,{probe,preview,continuedArchive,options,cohort}){
 const {retainRecoveredContinuedRoomCatchUp:retain,SharedContinuedRoomCatalogStore:Store}=api;
 const database='provider-catch-up-catalog',catalog='provider-catch-up-room';
 const refused=new Error('Local choice could not be saved');
 await assert.rejects(retain(probe,{database,catalog,retainChoice(){throw refused;}}),error=>error===refused);
 assert.equal(await exists(database),false);

 let retained;
 const choice=await retain(probe,{database,catalog,async retainChoice(value){
  assert.equal(await exists(database),false,'Persist the exact choice before creating the catalog');
  assert.ok(Object.isFrozen(value));
  retained=structuredClone(value);
 }});
 assert.deepEqual(choice,retained);
 assert.deepEqual(choice.source,preview.catalog);
 assert.deepEqual(choice.server,preview.server);
 assert.deepEqual(choice.advanced.map(row=>row.id),preview.participants.map(row=>row.id));
 assert.equal(choice.replacement.catalog,catalog);
 assert.notEqual(choice.replacement.sha256,preview.catalog.sha256);
 await assert.rejects(retain(probe,{database,catalog:'occupied-catalog',retainChoice(){
  assert.fail('Occupied databases must be refused before retaining a new choice');
 }}),error=>error.code==='continued_reconciliation_exists');

 const advanced=new Map(retained.advanced.map(row=>[row.id,row.expected]));
 const open={...options,database:retained.database,expected:retained.replacement,
  policies:options.policies.map(row=>({...row,expected:advanced.get(row.id)??row.expected}))};
 const destinations=probe.recovery.destinations.map(row=>({...row,source:row.source+'-catch-up',uploads:row.uploads+'-catch-up'}));
 const plan={...probe.recovery,expected:retained.replacement,database:'provider-catch-up-journal',destinations};
 let replacement=await Store.resume(open);
 try{
  const before=continuedArchive.metadata(),after=replacement.metadata();
  assert.deepEqual(after.origin,before.origin);
  assert.deepEqual(after.current,before.current);
  assert.deepEqual(after.participants.map(row=>[row.id,row.family]),before.participants.map(row=>[row.id,row.family]));
  for(const row of after.participants){
   const candidate=preview.participants.find(entry=>entry.id===row.id);
   if(!candidate){
    assert.deepEqual(await bytes(replacement.participantFile(row.id)),await bytes(continuedArchive.participantFile(row.id)));
    continue;
   }
   assert.deepEqual(row.selection,advanced.get(row.id));
   assert.deepEqual(replacement.participantDeliveryRecords(row.id),{
    ...continuedArchive.participantDeliveryRecords(row.id),live:candidate.recovery,
   });
   assert.deepEqual(await bytes(replacement.participantUploads(row.id)),await bytes(continuedArchive.participantUploads(row.id)));
  }

  const transaction=IDBDatabase.prototype.transaction;
  const interrupted=destinations.find(row=>row.id===cohort.at(-1).id);
  let lost=false;
  IDBDatabase.prototype.transaction=function(...args){
   const tx=transaction.apply(this,args);
   if(this.name===interrupted.source&&args[1]==='readwrite'&&!lost){
    lost=true;
    Object.defineProperty(tx,'oncomplete',{configurable:true,set(){tx.addEventListener('complete',event=>tx.onabort?.(event));}});
   }
   return tx;
  };
  try{
   await assert.rejects(api.beginContinuedRoomRecovery({...plan,catalog:replacement}));
   assert.equal(lost,true,'Lose the acknowledgement after the later participant commits');
  }finally{IDBDatabase.prototype.transaction=transaction;}
  await replacement.close();
  replacement=await Store.resume(open);
  const resumed={...plan,catalog:replacement};
  const recovered=await api.resumeContinuedRoomRecovery(resumed);
  assert.deepEqual(recovered.participants,destinations.toSorted((a,b)=>a.id<b.id?-1:a.id>b.id?1:0));
  assert.deepEqual(await api.resumeContinuedRoomRecovery(resumed),recovered);
  for(const participant of cohort){
   const target=destinations.find(row=>row.id===participant.id);
   const session=await api.SharedContinuedPairSession.openDelivery({...participant.options,database:target.source});
   try{
    assert.deepEqual(session.exportDeliveryRecovery(),preview.participants.find(row=>row.id===participant.id).recovery);
    assert.equal(session.core.redo(),true);
    assert.equal(session.core.redoReview().kind,'committed');
    assert.match(session.core.documentJson(),/Local offline document/);
    assert.match(JSON.stringify(session.core.reviewSnapshot().view),/Local offline comment/);
    assert.equal(session.core.undo(),true);
    assert.equal(session.core.undoReview().kind,'committed');
   }finally{await session.discardAndClose();}
   const uploads=await RichAssetStore.openRetained(target.uploads);
   try{assert.deepEqual(await bytes(await uploads.exportBackup()),await bytes(participant.backup.uploadBackup()));}
   finally{uploads.close();}
  }
 }finally{await replacement.close();}
 return cohort.length;
}
