/** The transport owner is a real test-owned native relay. No responses are fabricated. */
import assert from 'node:assert/strict';
import {IDBDatabase} from 'fake-indexeddb';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as continuedApi from '../packages/breditor-collaboration/dist/index.js';
const {SharedRichEditor,SharedIndependentHistoryPersistentSession,SharedIndependentDeliverySession,captureSharedIndependentParticipant,captureSharedIndependentDeliveryParticipant,SharedSegmentedPersistentSession,SharedSegmentedRelaySession,captureSharedGenerationParticipant,SharedReviewPersistentSession,captureSharedParticipantBackup,encodeSharedPairedSessionBackup,SharedContinuedRoomCatalog,SharedContinuedRoomCatalogStore,SharedServerLogGenerationRecoveryHost,readContinuedRoomReconciliation,readRecoveredContinuedRoomReconciliation,beginContinuedRoomRecovery}=continuedApi;
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {continuedParticipantFixture} from './probe-continued-room-catalog.mjs';
import {unavailableUpload,UnavailableUploadImage,unavailableAsset} from './fixtures/physical-recovery-control/unavailable-upload.mjs';
import {continuedDeliveryParticipant} from './fixtures/continued-room-recovery/continued-delivery.mjs';
import {probeOperationArchives} from './fixtures/continued-room-provider/operation-archives.mjs';
import {verifyContinuedRoomReplacement} from './fixtures/continued-room-provider/replacement.mjs';
import {verifyCoveredActivation} from './fixtures/continued-room-provider/covered.mjs';
import {secondAsset,secondPixel} from './fixtures/review-assets/pixels.mjs';

export async function probeContinuedRoomProvider(runtime,caseInfo,getToken,requests,deliveryCredentials,restart){
 const native=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')).href);
 await native.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const fixture=JSON.parse(readFileSync(caseInfo.path,'utf8')),server=fixture.generationRecoveryState;
 const inventory=JSON.parse(fixture.inventoryJson),folder=dirname(caseInfo.path),reset=environment();
 const method=fixture.language===1?'from_configuration_json':fixture.standard?
  `from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`;
 const profile=native.SharedRichProfile[method](fixture.configuration);
 const entries=[];
 let archive,store,host,tokenAllowed=true,onToken;
 const counts={authorPrefixes:0,reviewPrefixes:0,localSuffixes:0,missingUploads:0,providerReads:0,rejected:0,foreignForks:0,mixedPending:0,mixedProviderReads:0,mixedForeignForks:0,mixedDeliveryProviderReads:0,mixedDeliveryAheadRefusals:0,continuedDeliveryProviderReads:0,generationProviderReads:0,generationDocumentOnlyReads:0,generationAheadRefusals:0,generationForkRefusals:0,generationPredecessorChecks:0,originalProviderReads:0,originalPolicyRefusals:0};
 let recoveredRoomReads=0,recoveredRoomRefusals=0,serverOnlyPacketAssets=0,recoveredClientCatchUps=0,recoveredReplacementClients=0;
 let recoveredReplacementRasters=0,recoveredReplacementLocalClients=0,recoveredActivationIntents=0;
 const room=inventory.room.document;
 const initial={
  catalog:'continued-native-provider',wasm:native,checkAuthority(){},
  origin:{file:new Blob([readFileSync(resolve(folder,'server.backup'))]),expected:server.origin},
  current:{
   server:{file:new Blob([readFileSync(resolve(folder,'server-after.backup'))]),expected:server.server},
   participants:{file:new Blob([readFileSync(resolve(folder,'inventory-after.json'))]),expected:server.participants},
  },
 };
 const upload=(session,uploads)=>uploads?.ingest(new Blob([unavailableUpload],{type:'image/png'}));
 try{
  Object.defineProperty(globalThis,'Image',{value:UnavailableUploadImage,configurable:true});
  for(const [index,client] of fixture.clients.entries()){
   const document=index%3===0?'original':'continued-v2',review=index%3===1?'original':'continued-v2';
   entries.push(await continuedParticipantFixture(profile,fixture,inventory,client,native,'provider-'+index,document,review,'current',
    index===0?upload:undefined));
  }
  const openOptions={wasm:native,checkAuthority(){},policies:entries.map(({id,expected,restoreDocument})=>({id,expected,restoreDocument}))};
  archive=await SharedContinuedRoomCatalog.capture({...initial,policies:openOptions.policies,
   participants:entries.map(({id,file,expected})=>({id,file,expected}))});
  const persisted={...openOptions,expected:archive.selection(),database:'continued-provider-catalog'};
  store=await SharedContinuedRoomCatalogStore.begin({...persisted,archive});
  await store.close();
  store=await SharedContinuedRoomCatalogStore.resume(persisted);
  host=await SharedServerLogGenerationRecoveryHost.open({
   endpoint:caseInfo.endpoint,expected:caseInfo.selection,principal:'operator',
   async getToken(){const action=onToken;onToken=undefined;await action?.();return tokenAllowed?getToken():'0'.repeat(64);},
   checkAuthority(){},
  });
  const input={catalog:store,expected:archive.selection(),host,checkAuthority(){}};
  const before=store.inspectPrefixes(),start=requests.length;
  const report=await readContinuedRoomReconciliation(input);
  assert.equal(report.kind,'pending');
  assert.equal(report.participants.length,7);
  assert.deepEqual(report.participants,before.participants);
  assert.equal(report.provider.missing.some(row=>row.kind==='uploadBytes'&&row.contentAsset===unavailableAsset),true);
  assert.equal(report.uploads.find(row=>row.id==='provider-0').entries.some(row=>row.asset===unavailableAsset),true);
  assert.equal(requests.slice(start).filter(row=>row.assets).length,1);
  assert.equal(requests.at(-1).uploads,3);
  assert.equal(requests.slice(start).filter(row=>row.dependencies).length,1);
  const serverOnly=report.provider.resolutions.filter(row=>row.reference.generation==='server-packet-only');
  assert.equal(serverOnly.length,fixture.atomic?1:0);
  for(const row of serverOnly){
   assert.equal(row.reference.asset,row.contentAsset);
   assert.ok(!entries.some(entry=>entry.record.live.documentCheckpoint.includes(row.contentAsset)));
   assert.ok(report.provider.assets.some(asset=>asset.asset===row.contentAsset));
   assert.ok(entries.every(entry=>!entry.backup.assetReferences().references.some(ref=>ref.generation===row.reference.generation)));
   serverOnlyPacketAssets++;
  }
  counts.missingUploads++;
  counts.providerReads++;
  for(const {prefix} of report.participants){
   assert.equal(prefix.acceptedDocuments.length,inventory.writers.length+inventory.serverAuthors.length);
   assert.equal(prefix.acceptedReviews.length,inventory.review.writers.length);
   assert.equal(prefix.acceptedDocuments.find(row=>row.author===prefix.document.writer).relation,'local_ahead');
   assert.equal(prefix.acceptedReviews.find(row=>row.author===prefix.review.actor).relation,'local_ahead');
   assert.ok(prefix.acceptedReviews.some(row=>row.relation==='server_ahead'));
   counts.authorPrefixes+=prefix.acceptedDocuments.length;
   counts.reviewPrefixes+=prefix.acceptedReviews.length;
   counts.localSuffixes+=2;
  }
  assert.deepEqual(store.inspectPrefixes(),before);
  const beforeInvalid=requests.length;
  await assert.rejects(readContinuedRoomReconciliation({...input,expected:{...input.expected,sha256:'0'.repeat(64)}}));
  await assert.rejects(readContinuedRoomReconciliation({...input,host:{checkAssets(){assert.fail('Fabricated port');}}}));
  assert.equal(requests.length,beforeInvalid);
  counts.rejected+=2;
  tokenAllowed=false;
  await assert.rejects(readContinuedRoomReconciliation(input),error=>error.code==='control_permission');
  tokenAllowed=true;
  counts.rejected++;
  const controller=new AbortController();
  onToken=()=>controller.abort();
  await assert.rejects(readContinuedRoomReconciliation({...input,signal:controller.signal}));
  assert.deepEqual(store.inspectPrefixes(),before);
  counts.rejected++;
  const editor=fixture.clients[0],peer=fixture.clients[1];
  for(const lane of ['document','review']){
   const selected=await continuedParticipantFixture(profile,fixture,inventory,editor,native,`foreign-${lane}`,
    'continued-v2','continued-v2','peer',async(session,uploads)=>{
     if(uploads)return;
     const branch=new SharedRichEditor(profile.join_frame(room,peer.writer,session.core.updateFrame()));
     try{
      if(lane==='document'){
       assert.equal(branch.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Conflicting peer document history '.repeat(3)}}]}),true);
       await session.core.receiveFrame(branch.updateFrame());
      }else{
       const review={actor:peer.actor,principal:peer.principal,access:'comment'};
       branch.enableReview(review);
       branch.dispatchReview({kind:'create_thread',data:{anchorJson:branch.captureReviewAnchor({kind:'document'}),body:'Conflicting peer comment history'}});
       session.core.receiveReview(branch.exportReview(),review);
      }
     }finally{branch.dispose();}
    });
   entries.push(selected);
   const beforeFork=requests.length;
   await assert.rejects(SharedContinuedRoomCatalog.capture({...initial,
    policies:[{id:selected.id,expected:selected.expected,restoreDocument:selected.restoreDocument}],
    participants:[{id:selected.id,file:selected.file,expected:selected.expected}],
   }),error=>error.code==='inventory_fork');
   assert.equal(requests.length,beforeFork);
   counts.foreignForks++;
  }
  const retained=entries[0],exact=retained.record.live;
  const continued=await continuedDeliveryParticipant(continuedApi,{
   entry:retained,fixture,metadata:inventory,wasm:native,endpoint:caseInfo.endpoint.replace(/^http/,'ws'),tag:'provider-continued-delivery',
  });
  let continuedArchive,continuedStore,secondDelivery;
  try{
   secondDelivery=await continuedDeliveryParticipant(continuedApi,{
    entry:entries[2],fixture,metadata:inventory,wasm:native,endpoint:caseInfo.endpoint.replace(/^http/,'ws'),tag:'provider-continued-delivery-second',
   });
   const local=entries.slice(1,7).filter(row=>row!==entries[2]);
   const rows=[continued.row,secondDelivery.row,...local.map(({id,file,expected})=>({id,family:'continued-local',file,expected}))];
   const options={...openOptions,policies:[continued.policy,secondDelivery.policy,...openOptions.policies.filter(row=>local.some(entry=>entry.id===row.id))]};
   continuedArchive=await SharedContinuedRoomCatalog.capture({...initial,...options,participants:rows});
   continuedStore=await SharedContinuedRoomCatalogStore.begin({
    ...options,database:'provider-continued-delivery-catalog',archive:continuedArchive,expected:continuedArchive.selection(),
   });
   const before=requests.length;
   const read=await readContinuedRoomReconciliation({...input,catalog:continuedStore,expected:continuedArchive.selection()});
   assert.deepEqual(read.unreconciledParticipants,[]);
   assert.equal(read.participants.length,7);
   assert.ok(!read.coverage.missing.some(row=>(row.kind==='unbound_review'||row.kind==='review')&&row.actor===retained.client.actor));
   assert.ok(read.uploads.find(row=>row.id===continued.id).entries.length>=2);
   assert.equal(requests.slice(before).filter(row=>row.assets).length,1);
   counts.continuedDeliveryProviderReads++;

   const destinations=rows.map(({id})=>({id,source:id+'-provider-restored',uploads:id+'-provider-restored-uploads'}));
   const recovery={catalog:continuedStore,expected:continuedArchive.selection(),database:'provider-recovery-journal',
    destinations,writerRecovery:'host-reacquired',checkAuthority(){}};
   const probe={recovery,reconciliation:{host,checkAuthority(){}}};
   const destination=destinations.find(row=>row.id===continued.id);
   const {room,writer}=continued.options.native,key=[room,writer];
   const heads='continued_delivery_heads';
   const beforeMissing=requests.length;
   await assert.rejects(readRecoveredContinuedRoomReconciliation(probe),error=>error.code==='continued_room_recovery_missing');
   assert.equal(requests.length,beforeMissing);
   recoveredRoomRefusals++;

   const transaction=IDBDatabase.prototype.transaction;
   let lost=false;
   IDBDatabase.prototype.transaction=function(...args){
    const tx=transaction.apply(this,args);
    if(this.name===destination.source&&args[1]==='readwrite'&&!lost){
     lost=true;
     Object.defineProperty(tx,'oncomplete',{configurable:true,set(){tx.addEventListener('complete',event=>tx.onabort?.(event));}});
    }
    return tx;
   };
   try{await assert.rejects(beginContinuedRoomRecovery(recovery));assert.equal(lost,true);}
   finally{IDBDatabase.prototype.transaction=transaction;}
   await assert.rejects(readRecoveredContinuedRoomReconciliation(probe),error=>error.code==='continued_room_recovery_incomplete');
   assert.equal(requests.length,beforeMissing);
   recoveredRoomRefusals++;

   const completed=await continuedApi.resumeContinuedRoomRecovery(recovery);
   const observed=new Set([recovery.database,...destinations.flatMap(row=>[row.source,row.uploads])]);
   const withNoWrites=async action=>{
    IDBDatabase.prototype.transaction=function(...args){
     if(observed.has(this.name))assert.notEqual(args[1],'readwrite','Inspection never writes recovery data');
     return transaction.apply(this,args);
    };
    try{return await action();}finally{IDBDatabase.prototype.transaction=transaction;}
   };
   const beforeRead=requests.length;
   const recovered=await withNoWrites(()=>readRecoveredContinuedRoomReconciliation(probe));
   assert.deepEqual(recovered.recovery,completed);
   assert.deepEqual(recovered.reconciliation,read);
   assert.equal(recovered.reconciliation.provider.resolutions.some(row=>row.reference.generation==='server-packet-only'),fixture.atomic);
   assert.equal(requests.slice(beforeRead).filter(row=>row.assets).length,1);
   assert.equal(requests.slice(beforeRead).filter(row=>row.dependencies).length,1);
   recoveredRoomReads++;

   const beforeCatchUp=requests.length;
   const preview=await withNoWrites(()=>continuedApi.previewRecoveredContinuedRoomCatchUp(probe));
   assert.deepEqual(preview.catalog,recovery.expected);
   assert.deepEqual(preview.server,caseInfo.selection);
   assert.deepEqual(preview.participants.map(row=>row.id),[continued.id,secondDelivery.id]);
   assert.deepEqual(preview.localParticipants.map(row=>row.id),local.map(row=>row.id));
   for(const {id,prefix,recovery} of preview.localParticipants){
    const previous=continuedArchive.participantRecords(id).live;
    assert.deepEqual(recovery.identity,previous.identity);
    assert.deepEqual(recovery.versions,previous.versions);
    assert.ok([...prefix.acceptedDocuments,...prefix.acceptedReviews].every(row=>row.relation!=='server_ahead'));
   }
   assert.ok(requests.slice(beforeCatchUp).some(row=>row.accepted));
   for(const target of preview.participants){
    const origin=target.id===continued.id?continued:secondDelivery,before=origin.backup.records().live;
    const prior=read.participants.find(row=>row.id===target.id).prefix;
    assert.ok(prior.acceptedDocuments.some(row=>row.relation==='server_ahead'));
    assert.ok(prior.acceptedReviews.some(row=>row.relation==='server_ahead'));
    assert.ok([...target.prefix.acceptedDocuments,...target.prefix.acceptedReviews].every(row=>row.relation!=='server_ahead'));
    assert.equal(target.prefix.document.localThrough,prior.document.localThrough);
    assert.equal(target.prefix.review.localThrough,prior.review.localThrough);
    assert.deepEqual(target.recovery.relay,before.relay);
    assert.deepEqual(target.recovery.retainedBinding,before.retainedBinding);
    assert.deepEqual(target.recovery.retained,before.retained);
    assert.deepEqual(target.recovery.source.versions,before.source.versions);
    const candidateOptions={...origin.options,database:target.id+'-candidate'};
    let candidate=await continuedApi.SharedContinuedPairSession.restoreDelivery(candidateOptions,target.recovery,'host-reacquired');
    try{
     await candidate.discardAndClose();
     candidate=await continuedApi.SharedContinuedPairSession.openDelivery(candidateOptions);
     assert.deepEqual(candidate.exportDeliveryRecovery(),target.recovery);
     assert.equal(candidate.core.redo(),true);
     assert.equal(candidate.core.redoReview().kind,'committed');
     assert.match(candidate.core.documentJson(),/Local offline document/);
     assert.match(JSON.stringify(candidate.core.reviewSnapshot().view),/Local offline comment/);
     assert.equal(candidate.core.undo(),true);
     assert.equal(candidate.core.undoReview().kind,'committed');
     recoveredClientCatchUps++;
    }finally{await candidate.discardAndClose();}
   }
   const replacementRaster=fixture.atomic?{asset:secondAsset,generation:'server-accepted-after-clients',payload:secondPixel}:undefined;
   const replacement=await withNoWrites(()=>verifyContinuedRoomReplacement(continuedApi,{
    probe,preview,continuedArchive,options,cohort:[continued,secondDelivery],local,replacementRaster,requests,activation:caseInfo.activation,
   }));
   ({clients:recoveredReplacementClients,local:recoveredReplacementLocalClients,rasters:recoveredReplacementRasters,
    activationIntents:recoveredActivationIntents}=replacement);
   assert.deepEqual(await withNoWrites(()=>readRecoveredContinuedRoomReconciliation(probe)),recovered);

   // Even a write which ignores the SDK's cooperative locks must be detected
   // before returning the observation. Simulate it during account lookup.
   const changed=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(destination.source);
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
   });
   try{
    const change=()=>new Promise((resolve,reject)=>{
     const tx=changed.transaction(heads,'readwrite');
     tx.objectStore(heads).delete(key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
    });
    onToken=()=>{onToken=change;};
    const beforeChanged=requests.length;
    await assert.rejects(readRecoveredContinuedRoomReconciliation(probe),error=>
     ['continued_pair_read_changed','continued_room_recovery_diverged'].includes(error.code));
    assert.equal(requests.slice(beforeChanged).filter(row=>row.assets).length,1);
    recoveredRoomRefusals++;
   }finally{changed.close();}
  }finally{await continuedStore?.close();continuedArchive?.dispose();continued.backup.dispose();secondDelivery?.backup.dispose();}

  const independentFactory={
   ...exact.identity.native,readOnly:true,review:{...exact.identity.review,access:'read_only'},
   documentHistory:{kind:'original',restoreOriginal:retained.restoreDocument},reviewHistory:{kind:'original'},
  };
  const independent=await SharedIndependentHistoryPersistentSession.restoreRecovery({
   ...independentFactory,database:'provider-independent-source',create(){throw Error('An exact recovery factory is required');},
  },{
   format:'breditor/shared-independent-history-recovery',formatVersion:1,
   identity:{...exact.identity,reviewHistory:'original'},documentCheckpoint:exact.documentCheckpoint,
   reviewCheckpoint:fixture.clients[0].reviewCheckpoint,versions:[],
  },'host-reacquired');
  let uploads,mixed,independentBackup,mixedStore;
  try{
   uploads=await RichAssetStore.restoreBackup('provider-independent-uploads',retained.backup.uploadBackup(),{uploadState:'preserve'});
   const saved=await captureSharedIndependentParticipant({participant:retained.id,principal:exact.identity.review.principal,
    source:{session:independent},assets:uploads,checkAuthority(){}});
   assert.equal(saved.kind,'ready');
   independentBackup=saved.backup;
   const rows=[{id:retained.id,family:'independent-local',file:independentBackup.file(),expected:independentBackup.selection()},
    ...entries.slice(1,7).map(({id,file,expected})=>({id,family:'continued-local',file,expected}))];
   const options={...openOptions,policies:openOptions.policies.slice(1)};
   mixed=await SharedContinuedRoomCatalog.capture({...initial,...options,participants:rows});
   mixedStore=await SharedContinuedRoomCatalogStore.begin({...options,database:'provider-mixed-catalog',archive:mixed,expected:mixed.selection()});
   const calls=requests.length;
   const pending=await readContinuedRoomReconciliation({...input,catalog:mixedStore,expected:mixed.selection()});
   assert.equal(pending.kind,'pending');
   assert.deepEqual(pending.unreconciledParticipants,[retained.id]);
   assert.equal(pending.provider,null);
   assert.deepEqual(requests.slice(calls).map(row=>row.assets),[false]);
   counts.mixedPending++;
   const independentPolicy={id:retained.id,expected:independentBackup.selection(),session:independentFactory};
   const selected={...input,catalog:mixedStore,expected:mixed.selection(),independentPolicies:[independentPolicy]};
   const beforeMixed=requests.length;
   await assert.rejects(readContinuedRoomReconciliation({...selected,independentPolicies:[
    {...independentPolicy,expected:{...independentPolicy.expected,sha256:'0'.repeat(64)}},
   ]}),error=>error.code==='continued_reconciliation_policy');
   assert.equal(requests.length,beforeMixed);
   const complete=await readContinuedRoomReconciliation(selected);
   assert.equal(complete.kind,'pending');
   assert.deepEqual(complete.unreconciledParticipants,[]);
   assert.equal(complete.participants.length,7);
   const legacy=complete.participants.find(row=>row.id===retained.id).prefix;
   assert.equal(legacy.acceptedDocuments.length,inventory.writers.length+inventory.serverAuthors.length);
   assert.equal(legacy.acceptedReviews.length,inventory.review.writers.length);
   assert.equal(legacy.acceptedDocuments.find(row=>row.author===legacy.document.writer).relation,'local_ahead');
   assert.ok(complete.coverage.missing.some(row=>row.kind==='unbound_review'&&row.actor===legacy.review.actor));
   assert.equal(complete.provider.missing.some(row=>row.kind==='uploadBytes'&&row.contentAsset===unavailableAsset),true);
   assert.equal(complete.uploads.find(row=>row.id===retained.id).entries.some(row=>row.asset===unavailableAsset),true);
   assert.equal(requests.slice(beforeMixed).filter(row=>row.assets).length,1);
   assert.equal(requests.at(-1).uploads,3);
   assert.deepEqual(mixedStore.inspectPrefixes().unreconciledParticipants,[retained.id]);
   counts.mixedProviderReads++;
   // Build a second, genuine native archive with a foreign comment branch.
   const branch=new SharedRichEditor(profile.join_frame(room,peer.writer,independent.core.updateFrame()));
   let forked,mixedFork,mixedForkStore;
   try{
    const review={actor:peer.actor,principal:peer.principal,access:'comment'};
    branch.enableReview(review);
    assert.equal(branch.dispatchReview({kind:'create_thread',data:{
     anchorJson:branch.captureReviewAnchor({kind:'document'}),body:'Conflicting independent comment history',
    }}).kind,'committed');
    independent.core.receiveReview(branch.exportReview(),review);
    await independent.flush();
    const captured=await captureSharedIndependentParticipant({participant:retained.id,principal:exact.identity.review.principal,
     source:{session:independent},assets:uploads,checkAuthority(){}});
    assert.equal(captured.kind,'ready');forked=captured.backup;
    const forkedRows=[{id:retained.id,family:'independent-local',file:forked.file(),expected:forked.selection()},...rows.slice(1)];
    mixedFork=await SharedContinuedRoomCatalog.capture({...initial,...options,participants:forkedRows});
    mixedForkStore=await SharedContinuedRoomCatalogStore.begin({...options,database:'provider-mixed-fork',
     archive:mixedFork,expected:mixedFork.selection()});
    const beforeForeign=requests.length;
    await assert.rejects(readContinuedRoomReconciliation({...selected,catalog:mixedForkStore,expected:mixedFork.selection(),
     independentPolicies:[{...independentPolicy,expected:forked.selection()}],
    }),error=>error.code==='inventory_fork');
    assert.equal(requests.length,beforeForeign);
    counts.mixedForeignForks++;
   }finally{await mixedForkStore?.close();mixedFork?.dispose();forked?.dispose();branch.dispose();}
  }finally{await mixedStore?.close();mixed?.dispose();independentBackup?.dispose();uploads?.close();await independent.close();}
  const deliveryTransport=fixture.atomic?{writerTransport:'atomic-v2'}:{};
  const deliveryEndpoint='ws://127.0.0.1:1/ws';
  const deliveryWriter=editor.writer,deliveryPrincipal=editor.principal,deliveryActor=editor.actor;
  const relay={endpoint:deliveryEndpoint,room,principal:deliveryPrincipal,...deliveryTransport};
  const factory={
   ...independentFactory,
   binding:{document:{...relay,writer:deliveryWriter},review:{...relay,actor:deliveryActor,documentWriter:deliveryWriter,binding:inventory.review.binding}},
   retained:{suggestions:null,revisions:null,versions:{...relay,documentWriter:deliveryWriter,binding:inventory.versionsBinding}},
  };
  const create=()=>retained.restoreDocument(exact.documentCheckpoint);
  let delivery,deliveryBackup,deliveryUploads,deliveryCatalog,deliveryStore,aheadBackup,aheadCatalog,aheadStore;
  try{
   delivery=await SharedIndependentDeliverySession.open({...factory,database:'provider-delivery-seed',create});
   const original=delivery.exportRecovery();
   await delivery.close();delivery=undefined;
   delivery=await SharedIndependentDeliverySession.restoreRecovery({...factory,database:'provider-delivery-source',create,
    recovery:{...original,source:{...original.source,reviewCheckpoint:editor.reviewCheckpoint}},writerRecovery:'host-reacquired',
   });
   deliveryUploads=await RichAssetStore.restoreBackup('provider-delivery-uploads',retained.backup.uploadBackup(),{uploadState:'preserve'});
   const captured=await captureSharedIndependentDeliveryParticipant({participant:retained.id,principal:deliveryPrincipal,
    source:{session:delivery},assets:deliveryUploads,checkAuthority(){}});
   assert.equal(captured.kind,'ready');deliveryBackup=captured.backup;
   const rows=[{id:retained.id,family:'independent-delivery',file:deliveryBackup.file(),expected:deliveryBackup.selection()},
    ...entries.slice(1,7).map(({id,file,expected})=>({id,family:'continued-local',file,expected}))];
   const options={...openOptions,policies:openOptions.policies.slice(1)};
   deliveryCatalog=await SharedContinuedRoomCatalog.capture({...initial,...options,participants:rows});
   deliveryStore=await SharedContinuedRoomCatalogStore.begin({...options,database:'provider-delivery-catalog',archive:deliveryCatalog,expected:deliveryCatalog.selection()});
   const beforeDelivery=requests.length;
   const selected={...input,catalog:deliveryStore,expected:deliveryCatalog.selection(),
    deliveryPolicies:[{id:retained.id,expected:deliveryBackup.selection(),session:factory}],
   };
   const report=await readContinuedRoomReconciliation(selected);
   assert.equal(report.kind,'pending');
   assert.deepEqual(report.unreconciledParticipants,[]);
   assert.equal(report.participants.length,7);
   assert.equal(report.participants.find(row=>row.id===retained.id).prefix.review.status,'matches');
   assert.ok(!report.coverage.missing.some(row=>(row.kind==='unbound_review'||row.kind==='review')&&row.actor===deliveryActor));
   assert.equal(report.provider.missing.some(row=>row.kind==='uploadBytes'&&row.contentAsset===unavailableAsset),true);
   assert.equal(requests.slice(beforeDelivery).filter(row=>row.assets).length,1);
   counts.mixedDeliveryProviderReads++;
   const snapshot=delivery.exportRecovery();
   const ahead=fixture.atomic?delivery.core.writerClockV2(deliveryWriter):delivery.core.writerClock(deliveryWriter);
   assert.ok(BigInt(ahead.through)>BigInt(inventory.writers.find(row=>row.clock.writer===deliveryWriter).clock.through));
   await delivery.close();delivery=undefined;
   delivery=await SharedIndependentDeliverySession.restoreRecovery({...factory,database:'provider-delivery-ahead-source',create,
    recovery:{...snapshot,relay:{...snapshot.relay,document:{accepted:ahead,receipt:null}}},writerRecovery:'host-reacquired',
   });
   const aheadCapture=await captureSharedIndependentDeliveryParticipant({participant:retained.id,principal:deliveryPrincipal,
    source:{session:delivery},assets:deliveryUploads,checkAuthority(){}});
   assert.equal(aheadCapture.kind,'ready');aheadBackup=aheadCapture.backup;
   const aheadRows=[{id:retained.id,family:'independent-delivery',file:aheadBackup.file(),expected:aheadBackup.selection()},...rows.slice(1)];
   aheadCatalog=await SharedContinuedRoomCatalog.capture({...initial,...options,participants:aheadRows});
   aheadStore=await SharedContinuedRoomCatalogStore.begin({...options,database:'provider-delivery-ahead-catalog',archive:aheadCatalog,expected:aheadCatalog.selection()});
   const beforeAhead=requests.length;
   await assert.rejects(readContinuedRoomReconciliation({...selected,catalog:aheadStore,expected:aheadCatalog.selection(),
    deliveryPolicies:[{id:retained.id,expected:aheadBackup.selection(),session:factory}],
   }),error=>error.code==='continued_reconciliation_diverged');
   assert.equal(requests.length,beforeAhead);
   counts.mixedDeliveryAheadRefusals++;
  }finally{
   await aheadStore?.close();aheadCatalog?.dispose();aheadBackup?.dispose();
   await deliveryStore?.close();deliveryCatalog?.dispose();deliveryBackup?.dispose();deliveryUploads?.close();await delivery?.discardAndClose();
  }
  for(const variant of ['local','continued-local','relay','retained','document-only','relay-ahead','local-fork']){
   const kind=variant==='document-only'||variant==='relay-ahead'?'relay':variant==='local-fork'?'local':variant;
   const tag='provider-generation-'+variant;
   const {native:identity}=exact.identity;
   const restoreSegmented=checkpoint=>profile.restore_segmented(room,checkpoint);
   const review=variant==='document-only'?undefined:{actor:editor.actor,principal:editor.principal,access:'comment'};
   const writing={...identity,readOnly:false,...(review?{review}:{})};
   const binding={...factory.binding,review:review?factory.binding.review:null};
   const seed={...writing,database:tag+'-source',restoreSegmented,initialGenerations:{root:'provider-root',active:'provider-first'},
    create:()=>profile.restore(room,editor.documentCheckpoint),...(review?{initialReviewCheckpoint:editor.reviewCheckpoint}:{})};
   const options={...openOptions,policies:openOptions.policies.slice(1)};
   let session,uploads,backup,generationCatalog,generationStore;
   try{
    session=kind==='retained'?await SharedSegmentedRelaySession.openRetained({...seed,binding,retained:factory.retained}):
     kind==='relay'?await SharedSegmentedRelaySession.open({...seed,binding}):await SharedSegmentedPersistentSession.open(seed);
    assert.equal(session.core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Offline generation provider edit'}}]}),true);
    assert.equal(session.core.undo(),true);
    if(review){
     assert.equal(session.core.dispatchReview({kind:'create_thread',data:{
      anchorJson:session.core.captureReviewAnchor({kind:'document'}),body:'Offline generation provider comment',
     }}).kind,'committed');
     assert.equal(session.core.undoReview().kind,'committed');
    }
    if(variant==='local-fork'){
     const branch=new SharedRichEditor(profile.join_frame(room,peer.writer,session.core.updateFrame()));
     try{
      const review={actor:peer.actor,principal:peer.principal,access:'comment'};
      branch.enableReview(review);
      assert.equal(branch.dispatchReview({kind:'create_thread',data:{
       anchorJson:branch.captureReviewAnchor({kind:'document'}),body:'Forked foreign comment in generation history',
      }}).kind,'committed');
      session.core.receiveReview(branch.exportReview(),review);
     }finally{branch.dispose();}
    }
    await session.retainVersion(session.core.captureVersion('Generation provider retained version',editor.principal,'20'));
    await session.sealGeneration('provider-next');
    if(kind==='continued-local'){
     const predecessor=session.exportRecovery();
     await session.close();session=undefined;
     session=await SharedSegmentedPersistentSession.continueHistory({...writing,database:seed.database,profile,
      expected:predecessor,nextGeneration:'provider-continued'});
    }
    if(variant==='relay-ahead'){
     const recovery=session.exportRecovery(),ahead=fixture.atomic?session.core.writerClockV2(editor.writer):session.core.writerClock(editor.writer);
     assert.ok(BigInt(ahead.through)>BigInt(inventory.writers.find(row=>row.clock.writer===editor.writer).clock.through));
     await session.close();session=undefined;
     session=await SharedSegmentedRelaySession.restoreRecovery({...writing,binding,restoreSegmented,database:tag+'-ahead',
      recovery:{...recovery,relay:{...recovery.relay,document:{accepted:ahead,receipt:null}}},writerRecovery:'host-reacquired'});
    }
    uploads=await RichAssetStore.restoreBackup(tag+'-uploads',retained.backup.uploadBackup(),{uploadState:'preserve'});
    const captured=await captureSharedGenerationParticipant({participant:retained.id,principal:editor.principal,
     source:{kind,session},assets:uploads,checkAuthority(){}});
    assert.equal(captured.kind,'ready');backup=captured.backup;
    const generationExpected=backup.selection();
    generationCatalog=await SharedContinuedRoomCatalog.capture({...initial,...options,participants:[
     {id:retained.id,family:'generation',file:backup.file(),expected:generationExpected},
     ...entries.slice(1,7).map(({id,file,expected})=>({id,file,expected})),
    ]});
    generationStore=await SharedContinuedRoomCatalogStore.begin({...options,database:tag+'-catalog',archive:generationCatalog,expected:generationCatalog.selection()});
    const readOnly={...identity,readOnly:true,...(review?{review:{...review,access:'read_only'}}:{})};
    const factories={segmented:0,continued:0};
    const selectedFactory=kind==='continued-local'?{...readOnly,profile:{
     restore_segmented(room,checkpoint){factories.segmented++;return profile.restore_segmented(room,checkpoint);},
     restore_continued_history(room,checkpoint){factories.continued++;return profile.restore_continued_history(room,checkpoint);},
    }}:{...readOnly,restoreSegmented,...(kind==='relay'||kind==='retained'?{binding}:{}),...(kind==='retained'?{retained:factory.retained}:{})};
    const selected={...input,catalog:generationStore,expected:generationCatalog.selection(),
     generationPolicies:[{id:retained.id,expected:generationExpected,session:{kind,options:selectedFactory}}]};
    const beforeGeneration=requests.length;
    if(variant==='relay-ahead'||variant==='local-fork'){
     await assert.rejects(readContinuedRoomReconciliation(selected),error=>
      error.code===(variant==='relay-ahead'?'continued_reconciliation_diverged':'inventory_fork'));
     assert.equal(requests.length,beforeGeneration);
     if(variant==='relay-ahead')counts.generationAheadRefusals++;
     else counts.generationForkRefusals++;
     continue;
    }
    const beforeDatabases=await indexedDB.databases();
    const compared=await readContinuedRoomReconciliation(selected);
    assert.deepEqual(await indexedDB.databases(),beforeDatabases);
    assert.deepEqual(compared.unreconciledParticipants,[]);
    const rows=review?compared.participants:compared.documentOnlyParticipants;
    const prefix=rows.find(row=>row.id===retained.id).prefix;
    assert.equal(prefix.acceptedDocuments.length,inventory.writers.length+inventory.serverAuthors.length);
    assert.equal(prefix.acceptedDocuments.find(row=>row.author===editor.writer).relation,'local_ahead');
    assert.ok(compared.coverage.checkedParticipants.some(row=>row.participant===retained.id));
    if(review){
     assert.equal(prefix.acceptedReviews.length,inventory.review.writers.length);
     assert.equal(prefix.acceptedReviews.find(row=>row.author===editor.actor).relation,'local_ahead');
     assert.equal(compared.coverage.missing.some(row=>row.kind==='unbound_review'&&row.actor===editor.actor),kind==='local'||kind==='continued-local');
    }else{
     assert.equal(prefix.review,null);assert.deepEqual(prefix.acceptedReviews,[]);
     assert.ok(compared.coverage.missing.some(row=>row.kind==='review'&&row.actor===editor.actor));
     assert.ok(!compared.coverage.missing.some(row=>row.kind==='unbound_review'&&row.participant===retained.id));
     counts.generationDocumentOnlyReads++;
    }
    if(kind==='continued-local'){
     assert.deepEqual(factories,{segmented:1,continued:1});
     counts.generationPredecessorChecks++;
    }
    assert.ok(compared.provider.missing.some(row=>row.kind==='uploadBytes'&&row.contentAsset===unavailableAsset));
    assert.ok(compared.uploads.find(row=>row.id===retained.id).entries.some(row=>row.asset===unavailableAsset));
    assert.equal(requests.slice(beforeGeneration).filter(row=>row.assets).length,1);
    counts.generationProviderReads++;
   }finally{
    await generationStore?.close();generationCatalog?.dispose();backup?.dispose();uploads?.close();await session?.discardAndClose();
   }
  }
  {
   const options={...openOptions,policies:openOptions.policies.slice(1)};
   const source=exact.identity.native;
   const backupIdentity={room,writer:source.writer,richLanguage:source.richLanguage,
    history:source.history,rangeEditing:source.rangeEditing,selectionEditing:source.selectionEditing,searchHistory:source.searchHistory};
   const restore=checkpoint=>profile.restore(room,checkpoint),review={actor:editor.actor,principal:editor.principal,access:'comment'};
   const {searchHistory,...originalIdentity}=backupIdentity;
   const reviewBinding={endpoint:deliveryEndpoint,principal:editor.principal,room,actor:editor.actor,
    binding:inventory.review.binding,documentWriter:editor.writer,...deliveryTransport};
   const originalOptions={...originalIdentity,database:'provider-original-source',restore,review,relay:reviewBinding};
   const backupJson=await encodeSharedPairedSessionBackup(backupIdentity,{
    format:'breditor/shared-review-relay-checkpoint-record',formatVersion:1,history:source.history,
    rangeEditing:source.rangeEditing,selectionEditing:source.selectionEditing,richLanguage:source.richLanguage,
    reviewActor:editor.actor,principal:editor.principal,documentCheckpointJson:editor.documentCheckpoint,
    reviewCheckpointJson:editor.reviewCheckpoint,versions:[],relay:reviewBinding,
    progress:{cursor:null,accepted:null,sequence:null},
   });
   const session=await SharedReviewPersistentSession.restoreBackup({...originalOptions,backupJson,writerRecovery:'host-reacquired'});
   let uploads,backup,originalCatalog,originalStore;
   try{
    assert.equal(session.core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Original provider offline edit'}}]}),true);
    assert.equal(session.core.undo(),true);
    assert.equal(session.core.dispatchReview({kind:'create_thread',data:{
     anchorJson:session.core.captureReviewAnchor({kind:'document'}),body:'Original provider offline comment',
    }}).kind,'committed');
    assert.equal(session.core.undoReview().kind,'committed');
    session.saveVersion('Original provider retained version','21');
    await session.flush();
    uploads=await RichAssetStore.restoreBackup('provider-original-uploads',retained.backup.uploadBackup(),{uploadState:'preserve'});
    const captured=await captureSharedParticipantBackup({identity:{
     participant:retained.id,principal:editor.principal,source:backupIdentity,stores:['document','paired-session'],assets:'whole-store',
    },source:{core:session.core,session},assets:uploads,checkAuthority(){}});
    assert.equal(captured.kind,'ready');backup=captured.backup;
    const expected=backup.selection();
    originalCatalog=await SharedContinuedRoomCatalog.capture({...initial,...options,participants:[
     {id:retained.id,family:'original',file:backup.file(),expected},
     ...entries.slice(1,7).map(({id,file,expected})=>({id,file,expected})),
    ]});
    originalStore=await SharedContinuedRoomCatalogStore.begin({...options,database:'provider-original-catalog',archive:originalCatalog,expected:originalCatalog.selection()});
    const selected={...input,catalog:originalStore,expected:originalCatalog.selection(),originalPolicies:[{id:retained.id,expected,restore}]};
    const beforeOriginal=requests.length;
    await assert.rejects(readContinuedRoomReconciliation({...selected,originalPolicies:[{id:retained.id,
     expected:{...expected,sha256:'0'.repeat(64)},restore(){assert.fail('Unselected original factory invoked');},
    }]}),error=>error.code==='continued_reconciliation_policy');
    assert.equal(requests.length,beforeOriginal);counts.originalPolicyRefusals++;
    const beforeDatabases=await indexedDB.databases(),compared=await readContinuedRoomReconciliation(selected);
    assert.deepEqual(await indexedDB.databases(),beforeDatabases);
    assert.deepEqual(compared.unreconciledParticipants,[]);
    const prefix=compared.participants.find(row=>row.id===retained.id).prefix;
    assert.equal(prefix.acceptedDocuments.length,inventory.writers.length+inventory.serverAuthors.length);
    assert.equal(prefix.acceptedReviews.length,inventory.review.writers.length);
    assert.equal(prefix.acceptedDocuments.find(row=>row.author===editor.writer).relation,'local_ahead');
    assert.equal(prefix.acceptedReviews.find(row=>row.author===editor.actor).relation,'local_ahead');
    assert.ok(!compared.coverage.missing.some(row=>(row.kind==='unbound_review'||row.kind==='review')&&row.actor===editor.actor));
    assert.ok(compared.provider.missing.some(row=>row.kind==='uploadBytes'&&row.contentAsset===unavailableAsset));
    assert.equal(requests.slice(beforeOriginal).filter(row=>row.assets).length,1);
    counts.originalProviderReads++;
   }finally{
    await originalStore?.close();originalCatalog?.dispose();backup?.dispose();uploads?.close();await session.discardAndClose();
   }
  }
  const operations=await probeOperationArchives({profile,fixture,inventory,initial,openOptions,entries,input,requests,
   setTokenAction(action){onToken=action;}});
  onToken=()=>store.close();
  await assert.rejects(readContinuedRoomReconciliation(input),error=>['catalog_closed','archive_authority','control_authority'].includes(error.code));
  counts.rejected++;
  const activation=caseInfo.activation?await verifyCoveredActivation(continuedApi,{
   initial,entries:entries.slice(0,7),fixture,inventory,wasm:native,caseInfo,host,getToken,requests,delivery:deliveryCredentials,restart,
  }):{commits:0,publications:0,writableSessions:0,deliveredSessions:0,deliveredUploads:0,restartedSessions:0};
  return {recoveredRoomReads,recoveredRoomRefusals,serverOnlyPacketAssets,recoveredClientCatchUps,recoveredReplacementClients,
   recoveredActivationCommits:activation.commits,recoveredPublications:activation.publications,recoveredWritableSessions:activation.writableSessions,
   recoveredDeliveredSessions:activation.deliveredSessions,recoveredDeliveredUploads:activation.deliveredUploads,
   restartedSessions:activation.restartedSessions,
   recoveredReplacementLocalClients,recoveredReplacementRasters,recoveredActivationIntents,passed:true,language:fixture.language,atomic:fixture.atomic,...counts,...operations};
 }finally{
  host?.close();
  await store?.close();
  archive?.dispose();
  for(const entry of entries)entry.backup.dispose();
  profile.free();reset();
 }
}
