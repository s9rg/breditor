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
 const readOnly=entry.options.readOnly,withSuggestions=fixture.atomic&&!readOnly;
 const binding={document:{...common,writer:native.writer},review:{...common,actor:review.actor,documentWriter:native.writer,
  binding:metadata.review.binding,...(readOnly?{reviewEditing:'read_only'}:{})}};
 const retained={
  suggestions:withSuggestions?{identity:{endpoint,principal:review.principal,room:native.room,binding:metadata.suggestionsBinding,documentWriter:native.writer,
   effectWriter:metadata.serverAuthors.find(row=>row.kind==='suggestionEffect').clock.writer,...transport},ownedHistory:null}:null,
  revisions:withSuggestions?{binding:metadata.revisionsBinding}:null,
  versions:readOnly?null:{endpoint,principal:review.principal,room:native.room,binding:metadata.versionsBinding,documentWriter:native.writer,...transport},
 };
 const options={...entry.options,database:tag+'-offline',binding,retained};
 const registered=metadata.writers.find(row=>row.clock.writer===native.writer),comment=metadata.review.writers.find(row=>row.clock.actor===review.actor);
 const recovery={format:'breditor/shared-continued-delivery-recovery',formatVersion:1,source,
  relay:{binding,document:{accepted:registered.clock,receipt:null},review:{accepted:comment.clock,cursor:null,sequence:null},reviewReceipt:null},
  retainedBinding:retained,retained:{
   suggestions:retained.suggestions?{format:'breditor/shared-suggestion-queue',formatVersion:1,identity:retained.suggestions.identity,retained:[]}:null,
   revisions:retained.revisions?{format:'breditor/shared-suggestion-revisions',formatVersion:1,identity:retained.suggestions.identity,binding:retained.revisions.binding,retained:[]}:null,
   versions:retained.versions?{format:'breditor/shared-version-catalog-cache',formatVersion:1,identity:retained.versions,catalog:null,packets:[]}:null,
  },
 };
 let session,uploads,transportOwner;
 const noToken=()=>assert.fail('Offline archive operations must not acquire credentials');
 try{
  session=await Session.restoreDelivery(options,recovery,'host-reacquired');
  const versions=readOnly?null:await session.openVersionCatalog({getToken:noToken});
  const version=versions?.saveVersion('Offline continued room version','1');
  if(withSuggestions){
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
  if(versions){
   await versions.flush();
   assert.equal(versions.versionStatus(version.id).queued,true);
  }
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
 let second,archive,store,source,uploads;
 try{
  second=await continuedDeliveryParticipant(api,{entry:observer,fixture,metadata,wasm,tag:'z-continued-observer'});
  const cohort=[delivery,second],policies=cohort.map(row=>row.policy);
  archive=await Catalog.capture({...initial,policies,participants:cohort.map(row=>row.row)});
  assert.equal(archive.metadata().participants.find(row=>row.id===tag).family,'continued-delivery');
  assert.deepEqual(archive.participantDeliveryRecords(tag),delivery.backup.records());
  assert.throws(()=>archive.participantRecords(tag),error=>error.code==='catalog_missing');
  const prefix=archive.inspectPrefixes();
  assert.equal(prefix.coverage.missing.some(row=>row.kind==='unbound_review'&&row.actor===entry.client.actor),false);
  const open={wasm,policies,checkAuthority(){},database:tag+'-catalog',expected:archive.selection()};
  store=await Store.begin({...open,archive});
  await store.close();store=await Store.resume(open);
  assert.deepEqual(store.participantDeliveryRecords(tag),delivery.backup.records());
  const destinations=cohort.map(({id})=>({id,source:tag+'-'+id+'-restored',uploads:tag+'-'+id+'-restored-uploads'}));
  const [target,observerTarget]=destinations;
  const plan={database:tag+'-journal',expected:archive.selection(),destinations,writerRecovery:'host-reacquired',checkAuthority(){}};
  const writerLocks=cohort.flatMap(({options:{native:{room,writer},review:{actor}}})=>[
   `breditor:shared-writer:${JSON.stringify([room,writer])}`,
   `breditor:review-writer:${JSON.stringify([room,actor])}`,
  ]);
  const lockHost=navigator.locks,request=lockHost.request;
  const acquired=new Set(),counts=new Map();
  const expectCohort=()=>assert.deepEqual([...acquired].sort(),[...writerLocks].sort());
  lockHost.request=function(name,options,run){
   if(!writerLocks.includes(name))return request.call(this,name,options,run);
   return request.call(this,name,options,async lock=>{
    if(!lock)return run(null);
    counts.set(name,(counts.get(name)??0)+1);acquired.add(name);
    try{return await run(lock);}finally{acquired.delete(name);}
   });
  };
  try{
   let release,ready;
   const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{ready=resolve;});
   const competing=request.call(lockHost,writerLocks.at(-1),{mode:'exclusive',ifAvailable:true},async lock=>{
    ready(lock);await held;
   });
   try{
    assert.ok(await started);
    await assert.rejects(api.beginContinuedRoomRecovery({...plan,catalog:store}),error=>error.code==='review_writer_in_use');
    const databases=new Set((await indexedDB.databases()).map(row=>row.name));
    for(const name of [plan.database,...destinations.flatMap(row=>[row.source,row.uploads])])assert.equal(databases.has(name),false);
    assert.equal(acquired.size,0);
   }finally{release();await competing;}
   counts.clear();
   const transaction=IDBDatabase.prototype.transaction;
   let lostAcknowledgement=false;
   IDBDatabase.prototype.transaction=function(...args){
    if(destinations.some(row=>this.name===row.source||this.name===row.uploads)&&args[1]==='readwrite')expectCohort();
    const tx=transaction.apply(this,args);
    if(this.name===observerTarget.source&&args[1]==='readwrite'&&!lostAcknowledgement){
     lostAcknowledgement=true;
     Object.defineProperty(tx,'oncomplete',{configurable:true,set(){tx.addEventListener('complete',event=>tx.onabort?.(event));}});
    }
    return tx;
   };
   try{
    await assert.rejects(api.beginContinuedRoomRecovery({...plan,catalog:store}));
    assert.equal(lostAcknowledgement,true);
    assert.equal(acquired.size,0,'Interrupted recovery releases the whole cohort');
    await store.close();store=await Store.resume(open);
    const resumed={...plan,catalog:store};
    const completed=await api.resumeContinuedRoomRecovery(resumed);
    assert.deepEqual(completed,await api.resumeContinuedRoomRecovery(resumed));
   }finally{IDBDatabase.prototype.transaction=transaction;}
   assert.deepEqual([...counts.values()],writerLocks.map(()=>3),'Each recovery attempts each writer lock once');
   assert.equal(acquired.size,0);
  }finally{lockHost.request=request;}
  const resumed={...plan,catalog:store};
  source=await Session.openDelivery({...second.options,database:observerTarget.source});
  assert.deepEqual(source.exportDeliveryRecovery(),second.backup.records().live);
  assert.equal(source.core.view().readOnly,true);
  await source.discardAndClose();source=undefined;
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
   continuedDeliveryDivergedRefusals:1,continuedDeliveryCohortRefusals:1,continuedDeliveryPendingPackets:pendingPackets};
 }finally{
  uploads?.close();await source?.discardAndClose();await store?.close();archive?.dispose();delivery.backup.dispose();second?.backup.dispose();
 }
}
