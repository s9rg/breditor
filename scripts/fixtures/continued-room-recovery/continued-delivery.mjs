import assert from 'node:assert/strict';
import {IDBDatabase} from 'fake-indexeddb';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {deliveryDraft} from '../independent-delivery/session.mjs';
import {pixel,secondPixel,secondAsset} from '../review-assets/pixels.mjs';

/** Seed a delivery archive with accepted native prefixes and still-queued local records. */
export async function continuedDeliveryParticipant(api,{entry,fixture,metadata,wasm,endpoint='ws://127.0.0.1:1/ws',tag}){
 const {SharedContinuedPairSession:Session,SharedContinuedParticipantBackup:Backup,createSharedContinuedRelaySync}=api;
 const source=entry.record.live,{native,review}=source.identity;
 const transport=fixture.atomic?{writerTransport:'atomic-v2'}:{};
 const common={endpoint,principal:review.principal,room:native.room,...transport};
 const binding={document:{...common,writer:native.writer},review:{...common,actor:review.actor,documentWriter:native.writer,binding:metadata.review.binding}};
 const retained={
  suggestions:fixture.atomic?{identity:{endpoint,principal:review.principal,room:native.room,binding:metadata.suggestionsBinding,documentWriter:native.writer,
   effectWriter:metadata.serverAuthors.find(row=>row.kind==='suggestionEffect').clock.writer,...transport},ownedHistory:null}:null,
  revisions:fixture.atomic?{binding:metadata.revisionsBinding}:null,
  versions:{endpoint,principal:review.principal,room:native.room,binding:metadata.versionsBinding,documentWriter:native.writer,...transport},
 };
 const options={...entry.options,database:tag+'-offline',binding,retained};
 const registered=metadata.writers.find(row=>row.clock.writer===native.writer),comment=metadata.review.writers.find(row=>row.clock.actor===review.actor);
 const recovery={format:'breditor/shared-continued-delivery-recovery',formatVersion:1,source,
  relay:{binding,document:{accepted:registered.clock,receipt:null},review:{accepted:comment.clock,cursor:null,sequence:null},reviewReceipt:null},
  retainedBinding:retained,retained:{
   suggestions:retained.suggestions?{format:'breditor/shared-suggestion-queue',formatVersion:1,identity:retained.suggestions.identity,retained:[]}:null,
   revisions:retained.revisions?{format:'breditor/shared-suggestion-revisions',formatVersion:1,identity:retained.suggestions.identity,binding:retained.revisions.binding,retained:[]}:null,
   versions:{format:'breditor/shared-version-catalog-cache',formatVersion:1,identity:retained.versions,catalog:null,packets:[]},
  },
 };
 let session,uploads,transportOwner;
 const noToken=()=>assert.fail('Offline archive operations must not acquire credentials');
 try{
  session=await Session.restoreDelivery(options,recovery,'host-reacquired');
  const versions=await session.openVersionCatalog({getToken:noToken});
  const version=versions.saveVersion('Offline continued room version','1');
  if(fixture.atomic){
   const queue=await session.openSuggestionQueue();
   transportOwner=createSharedContinuedRelaySync(session,{
    identity:{...binding.document,credential:'e'.repeat(64)},getToken:noToken,autoConnect:false,
    suggestions:{binding:retained.suggestions.identity.binding,effectWriter:retained.suggestions.identity.effectWriter},
    suggestionRevisions:retained.revisions,
   });
   const revisions=await session.openSuggestionRevisions({transport:transportOwner});
   const proposal=queue.propose('Offline continued room suggestion','2',deliveryDraft('Offline suggestion '));
   revisions.revise({previousSuggestionId:proposal.id,title:'Offline continued room revision',createdAtMs:'3',draft:deliveryDraft('Offline revision ')});
   await revisions.flush();
  }
  await versions.flush();
  assert.equal(versions.versionStatus(version.id).queued,true);
  await session.flush();
  uploads=await RichAssetStore.open(tag+'-original-uploads');
  await uploads.ingest(new Blob([pixel],{type:'image/png'}));
  await uploads.ingest(new Blob([secondPixel],{type:'image/png'}));
  await uploads.cancel(secondAsset);
  const captured=await Backup.captureDelivery({participant:tag,principal:review.principal,session,uploads,wasm,checkAuthority(){},
   resolveAsset:async reference=>({...reference,identity:'host-verified',blob:new Blob([pixel],{type:'image/png'}),check(){}})});
  assert.equal(captured.kind,'ready');
  const {backup}=captured,expected=backup.selection(),id=tag;
  return {id,options,backup,row:{id,family:'continued-delivery',file:backup.file(),expected},
   policy:{id,expected,restoreDocument:entry.restoreDocument}};
 }finally{transportOwner?.dispose();await session?.discardAndClose();uploads?.close();}
}

export async function verifyContinuedDeliveryRoomRecovery(api,{entry,fixture,metadata,wasm,initial,observer}){
 const {SharedContinuedRoomCatalog:Catalog,SharedContinuedRoomCatalogStore:Store,SharedContinuedPairSession:Session}=api;
 const tag='whole-continued-delivery';
 const delivery=await continuedDeliveryParticipant(api,{entry,fixture,metadata,wasm,tag});
 let archive,store,source,uploads;
 try{
  const policies=[delivery.policy,{id:observer.id,expected:observer.expected,restoreDocument:observer.restoreDocument}];
  archive=await Catalog.capture({...initial,policies,participants:[delivery.row,{id:observer.id,file:observer.file,expected:observer.expected}]});
  assert.equal(archive.metadata().participants.find(row=>row.id===tag).family,'continued-delivery');
  assert.deepEqual(archive.participantDeliveryRecords(tag),delivery.backup.records());
  assert.throws(()=>archive.participantRecords(tag),error=>error.code==='catalog_missing');
  const prefix=archive.inspectPrefixes();
  assert.equal(prefix.coverage.missing.some(row=>row.kind==='unbound_review'&&row.actor===entry.client.actor),false);
  const open={wasm,policies,checkAuthority(){},database:tag+'-catalog',expected:archive.selection()};
  store=await Store.begin({...open,archive});
  await store.close();store=await Store.resume(open);
  assert.deepEqual(store.participantDeliveryRecords(tag),delivery.backup.records());
  const destinations=[observer.id,tag].map(id=>({id,source:tag+'-'+id+'-restored',uploads:tag+'-'+id+'-restored-uploads'}));
  const target=destinations[1];
  const plan={database:tag+'-journal',expected:archive.selection(),destinations,writerRecovery:'host-reacquired',checkAuthority(){}};
  const transaction=IDBDatabase.prototype.transaction;
  let lostAcknowledgement=false;
  IDBDatabase.prototype.transaction=function(...args){
   const tx=transaction.apply(this,args);
   if(this.name===target.source&&args[1]==='readwrite'&&!lostAcknowledgement){
    lostAcknowledgement=true;
    Object.defineProperty(tx,'oncomplete',{configurable:true,set(){tx.addEventListener('complete',event=>tx.onabort?.(event));}});
   }
   return tx;
  };
  try{await assert.rejects(api.beginContinuedRoomRecovery({...plan,catalog:store}));assert.equal(lostAcknowledgement,true);}
  finally{IDBDatabase.prototype.transaction=transaction;}
  await store.close();store=await Store.resume(open);
  const resumed={...plan,catalog:store};
  const completed=await api.resumeContinuedRoomRecovery(resumed);
  assert.deepEqual(completed,await api.resumeContinuedRoomRecovery(resumed));
  source=await Session.openDelivery({...delivery.options,database:target.source});
  const exact=delivery.backup.records().live;
  assert.deepEqual(source.exportDeliveryRecovery(),exact);
  assert.equal(source.core.redo(),true);
  assert.equal(source.core.redoReview().kind,'committed');
  assert.match(source.core.documentJson(),/Local offline document/);
  assert.match(JSON.stringify(source.core.reviewSnapshot().view),/Local offline comment/);
  await source.close();source=undefined;
  await assert.rejects(api.resumeContinuedRoomRecovery(resumed),error=>error.code==='continued_room_recovery_diverged');
  uploads=await RichAssetStore.openRetained(target.uploads);
  assert.deepEqual(await (await uploads.exportBackup()).arrayBuffer(),await delivery.backup.uploadBackup().arrayBuffer());
  const pendingPackets=exact.retained.versions.packets.length+(exact.retained.suggestions?.retained.length??0)+
   (exact.retained.revisions?.retained.length??0);
  return {continuedDeliveryCatalogRestores:1,continuedDeliveryInterruptedResumes:1,
   continuedDeliveryDivergedRefusals:1,continuedDeliveryPendingPackets:pendingPackets};
 }finally{
  uploads?.close();await source?.discardAndClose();await store?.close();archive?.dispose();delivery.backup.dispose();
 }
}
