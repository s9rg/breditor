/** The transport owner is a real test-owned native relay. No responses are fabricated. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SharedRichEditor,SharedIndependentHistoryPersistentSession,SharedIndependentDeliverySession,captureSharedIndependentParticipant,captureSharedIndependentDeliveryParticipant,SharedContinuedRoomCatalog,SharedContinuedRoomCatalogStore,SharedServerLogGenerationRecoveryHost,readContinuedRoomReconciliation} from '../packages/breditor-collaboration/dist/index.js';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {continuedParticipantFixture} from './probe-continued-room-catalog.mjs';
import {unavailableUpload,UnavailableUploadImage,unavailableAsset} from './fixtures/physical-recovery-control/unavailable-upload.mjs';

export async function probeContinuedRoomProvider(runtime,caseInfo,getToken,requests){
 const native=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')).href);
 await native.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const fixture=JSON.parse(readFileSync(caseInfo.path,'utf8')),server=fixture.generationRecoveryState;
 const inventory=JSON.parse(fixture.inventoryJson),folder=dirname(caseInfo.path),reset=environment();
 const method=fixture.language===1?'from_configuration_json':fixture.standard?
  `from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`;
 const profile=native.SharedRichProfile[method](fixture.configuration);
 const entries=[];
 let archive,store,host,tokenAllowed=true,onToken;
 const counts={authorPrefixes:0,reviewPrefixes:0,localSuffixes:0,missingUploads:0,providerReads:0,rejected:0,foreignForks:0,mixedPending:0,mixedProviderReads:0,mixedForeignForks:0,mixedDeliveryProviderReads:0,mixedDeliveryAheadRefusals:0};
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
  onToken=()=>store.close();
  await assert.rejects(readContinuedRoomReconciliation(input),error=>['catalog_closed','archive_authority','control_authority'].includes(error.code));
  counts.rejected++;
  return {passed:true,language:fixture.language,atomic:fixture.atomic,...counts};
 }finally{
  host?.close();
  await store?.close();
  archive?.dispose();
  for(const entry of entries)entry.backup.dispose();
  profile.free();reset();
 }
}
