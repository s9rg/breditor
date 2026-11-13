/** The transport owner is a real test-owned native relay. No responses are fabricated. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SharedRichEditor,SharedIndependentHistoryPersistentSession,captureSharedIndependentParticipant,SharedContinuedRoomCatalog,SharedContinuedRoomCatalogStore,SharedServerLogGenerationRecoveryHost,readContinuedRoomReconciliation} from '../packages/breditor-collaboration/dist/index.js';
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
 const counts={authorPrefixes:0,reviewPrefixes:0,localSuffixes:0,missingUploads:0,providerReads:0,rejected:0,foreignForks:0,mixedPending:0};
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
  const independent=await SharedIndependentHistoryPersistentSession.restoreRecovery({
   ...exact.identity.native,database:'provider-independent-source',readOnly:true,review:{...exact.identity.review,access:'read_only'},
   documentHistory:{kind:'original',restoreOriginal:retained.restoreDocument},reviewHistory:{kind:'original'},
   create(){throw Error('An exact recovery factory is required');},
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
  }finally{await mixedStore?.close();mixed?.dispose();independentBackup?.dispose();uploads?.close();await independent.close();}
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
