/** Real source-owned image upload, then fresh authenticated Native resume.
 * No ACK, accepted clock, metadata packet, or server control is synthesized. */
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import {withSelectedNativeDeliverySources as held} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {withNativeRelayDelivery} from '../../../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {SelectedLocalReviewDelivery as Review} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/coordinator.js';
import {previewSelectedLocalReviewResume} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/resume_admission.js';
import {SelectedLocalMetadataDelivery as Metadata,previewSelectedLocalMetadataResume} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {createNativeVersionDelivery} from '../../../packages/breditor-collaboration/dist/versions/native_delivery.js';
import {createNativeSuggestionDelivery} from '../../../packages/breditor-collaboration/dist/suggestions/native_delivery.js';
import {createNativeRevisionDelivery} from '../../../packages/breditor-collaboration/dist/suggestion_revisions/native_delivery.js';
import {prepareCompoundMetadata} from '../../../packages/breditor-collaboration/dist/metadata/compound_preparation.js';
import {independentHistoryNative} from '../../../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {controls} from '../selected-delivery/cold-continuation.mjs';
import {testReconciledCold} from './reconciled-cold.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Drain only selected managed queues after releasing the finite Native read.
 * The real store commits each actual uploader response under its own epoch. */
async function uploadPendingImage({session,assetTransport,remoteAsset}) {
 const rows=[];
 for(const client of session.owner.clients) {
  const port=session.owner.assets(client.id),before=await port.get(remoteAsset);
  if(!before)continue;
  assert.equal(before.status,'pending');assert.equal(before.storageRef,null);
  let calls=0;
  await port.flush((...args)=>{calls++;return assetTransport.uploader(...args);});
  const after=await port.get(remoteAsset);
  assert.equal(after.status,'uploaded');assert.equal(typeof after.storageRef,'string');
  assert.ok(after.storageRef.length>0);assert.ok(calls>0);
  rows.push({id:client.id,before,after,actualUploaderCalls:calls});
 }
 assert.equal(rows.length,3);
 console.log('PROVIDER_RECONCILIATION_STEP actual-three-managed-queues-acknowledged');
 return rows;
}

/** Connect each family's original adapters through the genuine metadata-owned
 * native context. A second pass obtains authors accepted later in pass one. */
async function deliverRoom({scope,sources,metadata,review,host,fixture,deliveryChoice,adapters,contexts}) {
 const delivered=[];
 for(let pass=0;pass<2;pass++)for(const row of sources) {
  const parent=row.source.parent,storage=parent.kind==='generation'?parent.source.session:parent.session;
  const local=parent.kind==='independent-local';
  const writer=local?independentHistoryNative(storage).identity.native.writer:storage.reviewRelayIdentity().documentWriter;
  const client=fixture.clients.find(value=>value.writer===writer);assert.ok(client);
  const auth=await host.authentication(client),context=metadata.createDelivery(row.source,'comment');
  contexts.push(context);
  const common={getToken:auth.getToken,autoConnect:false,requestTimeoutMs:10000};
  let doc,comments;
  const children=local?await metadata.prepare(row.source,context):parent.kind==='original'?parent.packets:await prepareCompoundMetadata(storage,context);
  const proposalIdentity=children.suggestions?.identity(),documentOptions={...common,identity:auth.document,...(proposalIdentity?{suggestions:{binding:proposalIdentity.binding,effectWriter:proposalIdentity.effectWriter}}:{}),...(children.revisions?{suggestionRevisions:{binding:children.revisions.exportRecovery().binding}}:{})};
  if(local) {
   doc=new api.SharedRelaySync(row.source.core,withNativeRelayDelivery(documentOptions,context));
   comments=review.createReviewSync(context,{...common,identity:auth.review,flushDocument:()=>doc.flush()});
  }else if(parent.kind==='original') {
   doc=new api.SharedRelaySync(row.source.core,withNativeRelayDelivery(documentOptions,context));
   comments=new api.SharedReviewRelaySync(withNativeRelayDelivery({...common,identity:auth.review,storage,flushDocument:()=>doc.flush()},context));
  }else {
   const independent=parent.kind==='independent-delivery';
   doc=(independent?api.createSharedIndependentRelaySync:api.createSharedSegmentedRelaySync)(storage,withNativeRelayDelivery(documentOptions,context));
   comments=(independent?api.createSharedIndependentReviewRelaySync:api.createSharedSegmentedReviewRelaySync)(storage,withNativeRelayDelivery({...common,identity:auth.review,flushDocument:()=>doc.flush()},context));
  }
  adapters.push(doc,comments);
  await doc.connect();await doc.flush();await comments.connect();await comments.flush();
  assert.equal(doc.state().pending,false);assert.equal(comments.state().pending,false);
  assert.equal(doc.state().serverThrough,row.source.core.writerClockV2(writer).through);
  assert.equal(comments.state().serverThrough,row.source.core.localReviewClock().through);
  const versions=children.versions?createNativeVersionDelivery(children.versions,context,{getToken:auth.getToken,flushDocument:()=>doc.flush(),requestTimeoutMs:10000}):null;
  if(versions){await versions.connect();await versions.flushShared();}
  if(children.suggestions){
   const proposals=createNativeSuggestionDelivery(children.suggestions,doc,context),revisions=children.revisions?createNativeRevisionDelivery(children.revisions,proposals):null;
   if(revisions)await revisions.connect();await proposals.connect();await proposals.flushShared();
   if(revisions)for(const revision of children.revisions.revisions())assert.ok(revisions.status(revision.id).receipt);
  }
  if(versions){
   // A catalog can contain other authors' versions. Cache their actual packets
   // before asking a complete dependency reader to cover the entire catalog.
   await versions.refresh();
   for(const version of children.versions.versions())await versions.loadVersion(version.id);
  }
  await context.close();row.source.save();await row.source.flush();scope.check();
  delivered.push({pass,id:row.id});
  console.log('PROVIDER_RECONCILIATION_STEP delivered-pass-'+pass+'-'+row.id);
 }
 return delivered;
}

export async function testProviderReconciliation(input) {
 const {session,host,first,fixture,bundle,deliveryChoice,parentChoice,assetTransport,remoteAsset,adapters,contexts}=input;
 assert.ok(bundle);assert.equal(input.availabilityRead.kind,'pending');
 const oldMetadata=bundle.references.parent,oldMetadataText=await oldMetadata.metadata.file.text();
 const uploads=await uploadPendingImage(input);
 await assert.rejects(session.host.check(),'The old server cut cannot bless actual upload changes');
 let result,retainedBundle;
 await held(session.owner,session.input(),async(scope,sources,check)=>{
  let review,metadata,fresh;
  try {
   fresh=await controls(host,first,scope);
   const parentInput={choice:parentChoice,bundle:oldMetadata.parent,baseline:fresh.baseline,path:fresh.path,server:fresh.server,inventory:fresh.inventory,checkAuthority:check};
   const expected=await previewSelectedLocalReviewResume(scope,parentInput);
   review=await Review.resume(scope,{...parentInput,expected,approve:()=>true});
   const metadataInput={choice:deliveryChoice,bundle:oldMetadata,checkAuthority:check};
   const metadataExpected=await previewSelectedLocalMetadataResume(review,metadataInput);
   metadata=await Metadata.reopen(review,{...metadataInput,expected:metadataExpected,approve:()=>true});
   assert.equal(await oldMetadata.metadata.file.text(),oldMetadataText);
   const available=await metadata.captureAssetAvailability(fresh.previous);
   assert.equal(available.availability.kind,'checked');
   assert.equal(available.availability.provider.assets.length,3);
   assert.deepEqual(available.availability.provider.missing,[]);
   console.log('PROVIDER_RECONCILIATION_STEP fresh-native-resume-after-real-asset-ack');
   const pending=await metadata.captureReconciliation({host:fresh.previous,inventory:fresh.inventory});
   assert.equal(pending.kind,'pending');
   assert.equal(pending.reviews.length,3);
   assert.ok(pending.pending.some(row=>row.kind==='metadata'));
   assert.equal(pending.legacy.native.participants.filter(row=>row.review.kind==='unbound').length,3);
   const delivered=await deliverRoom({scope,sources,metadata,review,host,fixture,deliveryChoice,adapters,contexts});
   fresh.close();fresh=await controls(host,first,scope);
   const after=await metadata.captureAssetAvailability(fresh.previous);
   assert.equal(after.availability.kind,'checked');
   assert.equal(after.availability.provider.assets.length,3);
   const reconciled=await metadata.captureReconciliation({host:fresh.previous,inventory:fresh.inventory});
   assert.equal(reconciled.kind,'checked',JSON.stringify(reconciled.pending));
   assert.deepEqual(reconciled.pending,[]);
   assert.equal(reconciled.reviews.length,3);
   assert.ok(reconciled.reviews.every(row=>row.receiptVerified));
   const native=reconciled.legacy;
   assert.equal(native.kind,'pending','Original unbound-local diagnostics remain unchanged');
   const saved=retainedBundle=await metadata.capture();
   assert.equal(await oldMetadata.metadata.file.text(),oldMetadataText);
   const current=JSON.parse(await saved.metadata.file.text());
   assert.deepEqual(current.before,JSON.parse(oldMetadataText).before);
   for(const lane of current.current.lanes) {
    assert.ok(lane.relay.reviewReceipt);
    for(const revision of lane.records.revisions.retained)assert.ok(revision.receipt);
    assert.ok(lane.records.versions.packets.some(version=>version.accepted));
   }
   result={uploads,delivered,availability:after.availability,reconciled,native,metadata:current,originalMetadataUnchanged:true};
   const files=[];
   for(const [name,file]of [['provider-reconciled-metadata.json',saved.metadata.file],['provider-reconciled-review.json',saved.parent.delivery.file],['provider-reconciled-current.archive',saved.parent.current.file],['provider-reconciliation.json',new Blob([JSON.stringify(result)])]]) {
    const bytes=Buffer.from(await file.arrayBuffer());writeFileSync(join(host.directory,name),bytes,{mode:0o600,flag:'wx'});
    const actual=readFileSync(join(host.directory,name));assert.deepEqual(actual,bytes);files.push({name,bytes:bytes.length,sha256:sha(bytes)});
   }
   console.log('PROVIDER_RECONCILIATION_NATIVE '+JSON.stringify({directory:host.directory,files,nativeParticipants:7,metadataSources:3,actualManagedUploads:3,authenticatedDeliveryPasses:2,providerMissing:0,legacyNativeKind:native.kind,legacyUnboundReviewPreserved:true,wholeRoomActivated:false}));
  }finally{await metadata?.close();await review?.close();fresh?.close();}
 });
 if(input.reconcileCold)await testReconciledCold({...input,bundle:retainedBundle,settle:deliverRoom});
 return result;
}
