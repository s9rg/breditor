import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {WebSocket as Socket} from 'undici';
import {IDBObjectStore} from 'fake-indexeddb';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {pixel,secondPixel,secondAsset,ReviewFixtureImage} from './fixtures/review-assets/pixels.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {ReviewWireFixture} from './fixtures/relay-wire.mjs';
import {deliveryDraft} from './fixtures/independent-delivery/session.mjs';
import {verifyContinuedDeliveryActorHandoff} from './fixtures/continued-room-recovery/actor-handoff.mjs';
import {startReviewHost} from './fixtures/relay-host.mjs';
import * as api from '../packages/breditor-collaboration/dist/index.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const root=canonical(JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')));
const strip=({credential,observerCredential,...binding})=>binding;
const origin='http://127.0.0.1:49785';
const own=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});

export async function probeContinuedDelivery(runtime,binary,revisionBinary){
 const bytes=readFileSync(resolve(runtime,'breditor_shared_bg.wasm'));
 const wasm=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')).href);
 await wasm.default({module_or_path:bytes});
 const configuration=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/continued-delivery',version:1},extensions:[]});
 const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(configuration),descriptor=JSON.parse(profile.descriptor_json());
 const counts={nativeRooms:0,coldReads:0,packetsRetained:0,lostAcknowledgements:0,reviewReceipts:0,documentReceipts:0,undoRedo:0,ceilingChecks:0,duplicateRefusals:0,recoveryImports:0,deliveredPackets:0,verifiedRecordReads:0,unacknowledgedRecordReads:0,archiveRoundTrips:0,archiveMissingAssets:0,packetAssets:0,archivedUnacknowledgedSaves:0,uploadRestores:0,actorHandoffs:0,postHandoffDeliveries:0};
 try{
  for(const [wire,documentHistory,reviewHistory] of [[1,'original','continued-v2'],[2,'continued-v2','original'],[2,'continued-v2','continued-v2']]){
   const directory=mkdtempSync(join(tmpdir(),'breditor-continued-delivery-test-')),paths=['room.log','profile.json','document.json','auth.json'].map(name=>join(directory,name));
   const tokens=Object.fromEntries(['alice','bob','functional-owner'].map(name=>[name,randomBytes(32).toString('hex')]));
   writeFileSync(paths[1],configuration,{mode:0o600});
   writeFileSync(paths[2],JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root}),{mode:0o600});
   writeFileSync(paths[3],JSON.stringify({format:'breditor/relay-auth',formatVersion:1,origins:[origin],
    accounts:Object.entries(tokens).map(([principal,token])=>({principal,tokenHash:[...createHash('sha256').update(token).digest()]}))}),{mode:0o600});
   const reset=environment(),originalSocket=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');
   const originalImage=Object.getOwnPropertyDescriptor(globalThis,'Image');
   Object.defineProperty(globalThis,'Image',{configurable:true,value:ReviewFixtureImage});
   const put=IDBObjectStore.prototype.put,fetch=globalThis.fetch;
   let host,session,doc,comments,suggestionSync,staging,wireClient,uploads,inject=false,interrupted=false;
   Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:class extends Socket{constructor(url){super(url,{headers:{Origin:origin}});}}});
   globalThis.fetch=(url,options={})=>{
    if(String(url).startsWith('blob:'))return fetch(url,options);
    const headers=new Headers(options.headers);headers.set('Origin',origin);
    return fetch(url,{...options,headers});
   };
   // Observe an actual native receipt saved in the paired head, then lose the
   // local acknowledgement after the transaction commits.
   IDBObjectStore.prototype.put=function(value,...args){
    if(inject&&this.name==='continued_delivery_heads'&&JSON.parse(value).relay.reviewReceipt){
     inject=false;interrupted=true;
     const tx=this.transaction,original=tx.oncomplete;
     tx.oncomplete=event=>{assert.equal(typeof original,'function');tx.onabort?.(event);};
    }
    return put.call(this,value,...args);
   };
   try{
    const allPackets=wire===2&&reviewHistory==='continued-v2';
    host=await startReviewHost(allPackets?revisionBinary:binary,allPackets?[...paths,'127.0.0.1:0']:
     [...paths,'127.0.0.1:0',wire===1?'original-v1':'atomic-v2']);
    const endpoint='ws://'+host.address+'/ws',transport=wire===2?{writerTransport:'atomic-v2'}:{};
    const auth={endpoint,principal:'alice',room:'room',getToken:()=>tokens.alice,saveIdentity(){},...transport};
    let descriptors;
    if(allPackets){
     const capabilities=['writerTransportV2','documentSuggestionsV1','reviewV1','documentSuggestionRevisionsV1'];
     wireClient=new ReviewWireFixture(endpoint);
     assert.equal((await wireClient.request({kind:'authenticate',principal:'functional-owner',token:tokens['functional-owner'],capabilities})).kind,'authenticated');
     assert.equal((await wireClient.request({kind:'reviewGrant',principal:'alice',role:'comment'})).kind,'reviewGranted');
     wireClient.close();wireClient=new ReviewWireFixture(endpoint);
     descriptors=await wireClient.request({kind:'authenticate',principal:'alice',token:tokens.alice,capabilities});
     assert.equal(descriptors.kind,'authenticated');wireClient.close();wireClient=undefined;
    }
    const writer=await api.registerSharedRelayWriter(auth);
    const comment=await api.registerSharedReviewWriter({...auth,actor:'alice-comments',documentWriter:writer.identity.writer});
    const version=(await api.discoverSharedDocumentVersions({...auth,documentWriter:writer.identity.writer})).identity;
    const native={room:auth.room,writer:writer.identity.writer,richLanguage:3,history:'explicit',rangeEditing:'original',
     selectionEditing:'original',searchHistory:null,reviewedHistory:null};
    const review={actor:comment.identity.actor,principal:auth.principal,access:'comment'};
    const binding={document:strip(writer.identity),review:strip(comment.identity)};
    const retainedBinding={
     suggestions:allPackets?{identity:{endpoint,principal:auth.principal,room:auth.room,binding:descriptors.documentSuggestionsDescriptor.binding,
      documentWriter:native.writer,effectWriter:descriptors.documentSuggestionsDescriptor.effectWriter,...transport},ownedHistory:null}:null,
     revisions:allPackets?{binding:descriptors.documentSuggestionRevisionsDescriptor.binding}:null,
     versions:version,
    };
    const suggestionOptions=allPackets?{
     suggestions:{binding:retainedBinding.suggestions.identity.binding,effectWriter:retainedBinding.suggestions.identity.effectWriter},
     suggestionRevisions:retainedBinding.revisions,
    }:{};
    const raw=profile.join_frame(auth.room,native.writer,comment.frame);
    if(documentHistory==='continued-v2'){
     for(const action of [o=>raw.enable_segmented_history(o,'document-root','document-first'),o=>raw.continue_history(o,'document-next')]){
      const observation=raw.observe();try{action(observation);}finally{observation.free();}
     }
    }
    staging=new api.SharedRichEditor(raw,documentHistory==='continued-v2'?{segmentedHistory:'continued-v2'}:{});
    staging.enableReview(review);
    if(reviewHistory==='continued-v2'){
     staging.enableReviewHistoryGenerations('comments-root','comments-first');staging.continueReviewHistory('comments-next');
    }
    const source={format:'breditor/shared-independent-history-recovery',formatVersion:2,
     identity:{native,documentHistory,reviewHistory,review:{actor:review.actor,principal:review.principal}},
     documentCheckpoint:staging.checkpointJson(),reviewCheckpoint:reviewHistory==='continued-v2'?staging.reviewContinuedCheckpoint():staging.reviewCheckpoint(),versions:[]};
    staging.dispose();staging=undefined;
    const options={database:'continued-delivery',native,documentHistory,reviewHistory,readOnly:false,review,binding,retained:retainedBinding,
     restoreDocument:checkpoint=>documentHistory==='continued-v2'?profile.restore_continued_history(auth.room,checkpoint):profile.restore(auth.room,checkpoint)};
    const recovery={format:'breditor/shared-continued-delivery-recovery',formatVersion:1,source,relay:{
     binding,document:{accepted:null,receipt:null},review:{cursor:null,accepted:null,sequence:null},reviewReceipt:null,
    },retainedBinding,retained:{
     suggestions:allPackets?{format:'breditor/shared-suggestion-queue',formatVersion:1,identity:retainedBinding.suggestions.identity,retained:[]}:null,
     revisions:allPackets?{format:'breditor/shared-suggestion-revisions',formatVersion:1,identity:retainedBinding.suggestions.identity,
      binding:retainedBinding.revisions.binding,retained:[]}:null,
     versions:{format:'breditor/shared-version-catalog-cache',formatVersion:1,identity:version,catalog:null,packets:[]},
    }};
    await assert.rejects(api.SharedContinuedPairSession.openDelivery(options),error=>error.code==='continued_pair_missing');
    assert.deepEqual(await indexedDB.databases(),[]);
    session=await api.SharedContinuedPairSession.restoreDelivery(options,recovery,'host-reacquired');
    assert.throws(()=>session.exportRecovery(),error=>error.code==='continued_delivery_export_required');
    await assert.rejects(api.SharedContinuedPairSession.restoreDelivery(options,recovery,'host-reacquired'));
    counts.duplicateRefusals++;
    assert.equal(own(session.core,'Continued offline text '),true);
    assert.equal(session.core.undo(),true);
    const created=session.core.dispatchReview({kind:'create_thread',data:{
     anchorJson:session.core.captureReviewAnchor({kind:'document'}),body:'Continued offline comment',
    }});
    assert.equal(created.kind,'committed');
    assert.equal(session.core.undoReview().kind,'committed');
    const versions=await session.openVersionCatalog({getToken:auth.getToken});
    let pending;
    if(allPackets){
     doc=api.createSharedContinuedRelaySync(session,{identity:writer.identity,getToken:auth.getToken,autoConnect:false,...suggestionOptions});
     const queue=await session.openSuggestionQueue(),revisions=await session.openSuggestionRevisions({transport:doc});
     const before=session.core.documentJson();
     const draft=deliveryDraft('Pending original ');
     draft.edit.data.push({kind:'replace_image',data:{block:'image-block',asset:'only-in-packet',generation:'packet-generation'}});
     const predecessor=queue.propose('Revision predecessor','1',draft);
     const revision=revisions.revise({previousSuggestionId:predecessor.id,title:'Queued revision',createdAtMs:'2',
      draft:deliveryDraft('Pending child ')});
     const version=versions.saveVersion('Queued version','3');
     const proposal=queue.propose('Independent decision','4',deliveryDraft('Pending rejection '));
     queue.queueDecision(proposal.id,'reject','5');
     await Promise.all([revisions.flush(),versions.flush(),queue.flush()]);
     assert.equal(session.core.documentJson(),before);
     pending={predecessor,proposal,revision,version};
    }else{pending={version:versions.saveVersion('Queued across continued replay','1')};await versions.flush();}
    const offline=session.exportDeliveryRecovery();
    const held=await session.readDeliveryRecords(()=>{});
    assert.deepEqual(held.metadata().committed.recovery,offline);
    assert.deepEqual(held.metadata().live,offline);
    assert.equal(held.metadata().attempt,null);
    assert.equal(held.metadata().pending,null);
    await assert.rejects(session.close(),error=>error.code==='continued_pair_read_busy');
    await held.verify();held.dispose();
    assert.throws(()=>held.check(),error=>error.code==='continued_pair_read_closed');
    counts.verifiedRecordReads++;
    uploads=await RichAssetStore.open('continued-delivery-uploads');
    await uploads.ingest(new Blob([secondPixel],{type:'image/png'}));
    await uploads.cancel(secondAsset);
    const participant={session,uploads,wasm,checkAuthority(){},participant:'local-device',principal:'alice'};
    const backupPolicy={wasm,checkAuthority(){},restoreDocument:options.restoreDocument};
    const missing=await api.SharedContinuedParticipantBackup.captureDelivery(participant);
    assert.equal(missing.kind,'pending');
    assert.ok(missing.pending.length>0);
    counts.archiveMissingAssets++;
    const resolveAsset=async reference=>({...reference,identity:'host-verified',blob:new Blob([pixel],{type:'image/png'}),check(){}});
    const result=await api.SharedContinuedParticipantBackup.captureDelivery({...participant,resolveAsset});
    assert.equal(result.kind,'ready');
    const archive=result.backup;
    const reopened=await api.SharedContinuedParticipantBackup.readDelivery(archive.file(),archive.selection(),backupPolicy);
    let imported,restoredUploads;
    try{
     assert.deepEqual(reopened.records(),archive.records());
     assert.deepEqual(reopened.records().live,offline);
     assert.deepEqual(reopened.assetReferences(),archive.assetReferences());
     const uploadBackup=reopened.uploadBackup();
     assert.deepEqual(await uploadBackup.arrayBuffer(),await (await uploads.exportBackup()).arrayBuffer());
     restoredUploads=await RichAssetStore.restoreBackup('continued-delivery-portable-uploads',uploadBackup,{uploadState:'preserve'});
     assert.deepEqual(await (await restoredUploads.exportBackup()).arrayBuffer(),await uploadBackup.arrayBuffer());
     counts.uploadRestores++;
     if(allPackets){
      assert.ok(reopened.blob('only-in-packet','packet-generation'));
      assert.ok(!session.core.documentJson().includes('only-in-packet'));
      counts.packetAssets++;
     }
     const {identity,sha256}=archive.selection();
     await assert.rejects(api.SharedContinuedParticipantBackup.read(archive.file(),{identity,sha256},backupPolicy));
     const invalid=new Blob([archive.file().slice(0,-1),Uint8Array.of(255)]);
     await assert.rejects(api.SharedContinuedParticipantBackup.readDelivery(invalid,archive.selection(),backupPolicy));
     await session.close();session=undefined;
     imported=await api.SharedContinuedPairSession.restoreDelivery({...options,database:'portable-continued-delivery'},
      reopened.records().live,'host-reacquired');
     assert.deepEqual(imported.exportDeliveryRecovery(),offline);
     assert.equal(imported.core.redo(),true);
     assert.equal(imported.core.redoReview().kind,'committed');
     counts.archiveRoundTrips++;
    }finally{restoredUploads?.close();await imported?.discardAndClose();reopened.dispose();archive.dispose();}
    await assert.rejects(api.SharedContinuedPairSession.open(options));
    session=await api.SharedContinuedPairSession.openDelivery(options);
    assert.deepEqual(session.exportDeliveryRecovery(),offline);
    counts.coldReads++;
    counts.packetsRetained+=offline.retained.versions.packets.length+(offline.retained.suggestions?.retained.length??0)+(offline.retained.revisions?.retained.length??0);
    const connect=()=>{
     doc=api.createSharedContinuedRelaySync(session,{identity:writer.identity,getToken:auth.getToken,autoConnect:false,...suggestionOptions});
     comments=api.createSharedContinuedReviewRelaySync(session,{identity:comment.identity,getToken:auth.getToken,autoConnect:false,flushDocument:()=>doc.flush()});
    };
    connect();await doc.connect();await doc.flush();
    if(wire===2)inject=true;
    if(inject){
     await assert.rejects(comments.connect(),error=>error.code==='local_save_failed');
     assert.equal(interrupted,true);
     const held=await session.readDeliveryRecords(()=>{});
     const records=held.metadata();
     assert.ok(records.committed.recovery.relay.reviewReceipt);
     assert.equal(records.attempt?.preparedHead,records.committed.head);
     assert.deepEqual(records.attempt.capture,records.committed.recovery);
     await held.verify();held.dispose();
     counts.unacknowledgedRecordReads++;
     const saved=await api.SharedContinuedParticipantBackup.captureDelivery({...participant,session,resolveAsset});
     assert.equal(saved.kind,'ready');
     const restored=await api.SharedContinuedParticipantBackup.readDelivery(saved.backup.file(),saved.backup.selection(),backupPolicy);
     try{assert.deepEqual(restored.records(),records);counts.archivedUnacknowledgedSaves++;}
     finally{restored.dispose();saved.backup.dispose();}
     await session.discardAndClose();session=undefined;
     session=await api.SharedContinuedPairSession.openDelivery(options);connect();
     await doc.connect();await doc.flush();
     assert.ok(session.exportDeliveryRecovery().relay.reviewReceipt);
     counts.lostAcknowledgements++;
    }
    await comments.connect();await comments.flush();await session.flush();
    const delivered=session.exportDeliveryRecovery();
    assert.equal(delivered.relay.document.accepted.through,session.core.writerClock(native.writer).through);
    assert.equal(delivered.relay.review.accepted.through,session.core.localReviewClock().through);
    assert.ok(delivered.relay.document.receipt);
    assert.ok(delivered.relay.reviewReceipt);
    assert.deepEqual(delivered.retained,offline.retained);
    counts.documentReceipts++;counts.reviewReceipts++;
    const liveVersions=await session.openVersionCatalog({getToken:auth.getToken,flushDocument:()=>doc.flush()});
    await liveVersions.connect();await liveVersions.flushShared();
    assert.ok(liveVersions.versionStatus(pending.version.id).accepted);
    counts.deliveredPackets++;
    if(allPackets){
     const queue=await session.openSuggestionQueue(),revisions=await session.openSuggestionRevisions({transport:doc});
     suggestionSync=new api.SharedSuggestionSync(queue,doc,{autoStart:false});
     await revisions.connect();
     await revisions.synchronize();
     assert.ok(revisions.status(pending.revision.id).receipt);
     assert.equal(queue.status(pending.predecessor.id).decision.decision,'reject');
     await suggestionSync.connect();await suggestionSync.flushShared();
     assert.equal(queue.status(pending.proposal.id).decision.decision,'reject');
     suggestionSync.dispose();suggestionSync=undefined;
     counts.deliveredPackets+=2;
    }
    await session.flush();
    const committed=session.exportDeliveryRecovery();
    await session.close();session=undefined;
    session=await api.SharedContinuedPairSession.openDelivery({...options,review:{...review,access:'read_only'}});
    assert.deepEqual(session.exportDeliveryRecovery(),committed);
    connect();await comments.connect();
    assert.throws(()=>session.core.redoReview(),error=>String(error).includes('not permitted'));
    counts.ceilingChecks++;
    await session.close();session=undefined;
    session=await api.SharedContinuedPairSession.openDelivery(options);
    const sdkRuntime=fileURLToPath(new URL('../packages/breditor-collaboration/dist/runtime',import.meta.url));
    await verifyContinuedDeliveryActorHandoff(sdkRuntime,api.SharedContinuedPairSession,session,options,async reopened=>{
     const transport=api.createSharedContinuedRelaySync(reopened,{identity:writer.identity,getToken:auth.getToken,
      autoConnect:false,...suggestionOptions});
     const reviewTransport=api.createSharedContinuedReviewRelaySync(reopened,{identity:comment.identity,getToken:auth.getToken,
      autoConnect:false,flushDocument:()=>transport.flush()});
     try{
      await transport.connect();await transport.flush();
      await reviewTransport.connect();await reviewTransport.flush();
      const exact=reopened.exportDeliveryRecovery().relay;
      assert.equal(exact.document.accepted.through,reopened.core.writerClock(native.writer).through);
      assert.equal(exact.review.accepted.through,reopened.core.localReviewClock().through);
      assert.ok(exact.document.receipt);assert.ok(exact.reviewReceipt);
      counts.postHandoffDeliveries++;
     }finally{reviewTransport.dispose();transport.dispose();}
    });
    session=undefined;counts.actorHandoffs++;
    session=await api.SharedContinuedPairSession.restoreDelivery({...options,database:'continued-delivery-import'},committed,'host-reacquired');
    assert.deepEqual(session.exportDeliveryRecovery(),committed);
    counts.recoveryImports++;
    assert.equal(session.core.redo(),true);
    assert.match(session.core.documentJson(),/Continued offline text/);
    assert.equal(session.core.redoReview().kind,'committed');
    assert.match(JSON.stringify(session.core.reviewSnapshot().view),/Continued offline comment/);
    assert.equal(session.core.undo(),true);
    assert.equal(session.core.undoReview().kind,'committed');
    counts.undoRedo++;counts.nativeRooms++;
   }finally{
    globalThis.fetch=fetch;IDBObjectStore.prototype.put=put;uploads?.close();
    if(originalImage)Object.defineProperty(globalThis,'Image',originalImage);else delete globalThis.Image;
    wireClient?.close();suggestionSync?.dispose();doc?.dispose();comments?.dispose();await session?.discardAndClose();staging?.dispose();await host?.stop();
    if(originalSocket)Object.defineProperty(globalThis,'WebSocket',originalSocket);else delete globalThis.WebSocket;
    reset();rmSync(directory,{recursive:true,force:true});
   }
  }
 }finally{profile.free();}
 return {passed:true,...counts,sharedWasmSha256:hash(bytes)};
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==5)throw Error('Supply the shared Wasm directory and the local document/comment and suggestion relay fixtures');
 console.log(JSON.stringify(await probeContinuedDelivery(process.argv[2],resolve(process.argv[3]),resolve(process.argv[4])),null,2));
}
