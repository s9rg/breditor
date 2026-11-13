import assert from 'node:assert/strict';
import {IDBDatabase} from 'fake-indexeddb';
import {RichAssetStore} from '@breditor/experimental-rich-content';

const bytes=blob=>blob.arrayBuffer();
const exists=async database=>(await indexedDB.databases()).some(row=>row.name===database);

export async function verifyContinuedRoomReplacement(api,{probe,preview,continuedArchive,options,cohort,local,replacementRaster,requests}){
 const {retainRecoveredContinuedRoomCatchUp:retain,SharedContinuedRoomCatalogStore:Store}=api;
 const database='provider-catch-up-catalog',catalog='provider-catch-up-room';
 const refused=new Error('Local choice could not be saved');
 await assert.rejects(retain(probe,{database,catalog,retainChoice(){throw refused;}}),error=>error===refused);
 assert.equal(await exists(database),false);

 let retained;
 const beforeRetain=requests.length;
 const choice=await retain(probe,{database,catalog,async retainChoice(value){
  assert.equal(await exists(database),false,'Persist the exact choice before creating the catalog');
  assert.ok(Object.isFrozen(value));
  retained=structuredClone(value);
 }});
 assert.deepEqual(requests.slice(beforeRetain).flatMap(row=>row.raster?[row.raster]:[]),replacementRaster?[replacementRaster.asset]:[]);
 assert.deepEqual(choice,retained);
 assert.deepEqual(choice.source,preview.catalog);
 assert.deepEqual(choice.server,preview.server);
 assert.deepEqual(choice.advanced.map(row=>row.id),[...preview.participants,...preview.localParticipants].map(row=>row.id).sort());
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
 let rasters=0;
 const candidates=new Map([...preview.participants,...preview.localParticipants].map(row=>[row.id,row.recovery]));
 try{
  const before=continuedArchive.metadata(),after=replacement.metadata();
  assert.deepEqual(after.origin,before.origin);
  assert.deepEqual(after.current,before.current);
  assert.deepEqual(after.participants.map(row=>[row.id,row.family]),before.participants.map(row=>[row.id,row.family]));
  for(const row of after.participants){
   const candidate=candidates.get(row.id);
   if(!candidate){
    assert.deepEqual(await bytes(replacement.participantFile(row.id)),await bytes(continuedArchive.participantFile(row.id)));
    continue;
   }
   assert.deepEqual(row.selection,advanced.get(row.id));
   const record=row.family==='continued-delivery'?'participantDeliveryRecords':'participantRecords';
   assert.deepEqual(replacement[record](row.id),{...continuedArchive[record](row.id),live:candidate});
   assert.deepEqual(await bytes(replacement.participantUploads(row.id)),await bytes(continuedArchive.participantUploads(row.id)));
   if(replacementRaster){
    const {asset,generation,payload}=replacementRaster;
    assert.equal(continuedArchive.participantAsset(row.id,asset,generation),undefined);
    const raster=replacement.participantAsset(row.id,asset,generation);
    assert.ok(raster,'The resumed catalog must own bytes for the accepted image');
    assert.deepEqual(Buffer.from(await bytes(raster)),payload);
    rasters++;
   }
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
  const report=await api.readRecoveredContinuedRoomReconciliation({recovery:resumed,reconciliation:probe.reconciliation});
  assert.ok(report.reconciliation.participants.every(({prefix})=>
   [...prefix.acceptedDocuments,...prefix.acceptedReviews].every(row=>row.relation!=='server_ahead')));
  for(const participant of local)assert.ok(report.reconciliation.coverage.missing.some(
   row=>row.kind==='unbound_review'&&row.actor===participant.options.review.actor));
  for(const participant of [...cohort,...local]){
   const target=destinations.find(row=>row.id===participant.id);
   const delivery=cohort.includes(participant),open=delivery?'openDelivery':'open',read=delivery?'exportDeliveryRecovery':'exportRecovery';
   const session=await api.SharedContinuedPairSession[open]({...participant.options,database:target.source});
   try{
    assert.deepEqual(session[read](),candidates.get(participant.id));
    if(replacementRaster)assert.ok(session.core.documentJson().includes(replacementRaster.generation));
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
 return {clients:cohort.length,local:local.length,rasters};
}
