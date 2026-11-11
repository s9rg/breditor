/** Restart a previously published sealed room after the real relay accepted new data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {WebSocket as Socket} from 'undici';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {acknowledgePublishedEdits,publishedCommentText,publishedDocumentText,withPublishedEditor} from './fixtures/native-publication/published-edits.mjs';
import {
 SharedDurableNativeActivationHost as Activation,
 SharedRelayAssets,
 SharedServerLogGenerationRecoveryHost as Inspection,
} from '../packages/breditor-collaboration/dist/index.js';
import {assertHandoverPathContinuation} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/capture_binding.js';
import {inspectSelectedDeliverySealedNativeHost,selectedDeliveryNativeHost,reopenSelectedDeliverySealedNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativeHandoverActivationRoot} from './fixtures/native-activation/handover-root.mjs';
import {thirdAsset,thirdPixel} from './fixtures/review-assets/participant-pixels.mjs';
import {
 assertHandoverPublicationWaiting,handoverPublicationRequester,
 retainHandoverPublicationAssociation,publishHandoverService,
} from './fixtures/native-publication/sealed-handover.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const archive=cut=>readFileSync(join(dirname(cut.path),'server-after.backup'));

async function publish(host,offer){
 const activation=Activation.configure({
  endpoint:offer.endpoint,expected:offer.selection,principal:'operator',
  getToken:()=>host.activationToken(offer),checkAuthority(){},
 });
 const publication=handoverPublicationRequester(host,offer,()=>{});
 try{
  assert.deepEqual((await activation.commit()).selection,offer.selection);
  const association=retainHandoverPublicationAssociation(host,offer,offer.case.handoverSelection);
  return await publishHandoverService(host,offer,publication,association,()=>{});
 }finally{publication.close();activation.close();}
}

function assetClient(endpoint,client,authentication){
 return new SharedRelayAssets({
  endpoint,principal:client.principal,getToken:authentication.getToken,store:{},
 });
}

test('a published sealed room restarts from the exact cut with later acknowledged edits and upload',{timeout:600000},async()=>{
 const root=nativeHandoverActivationRoot(new URL('../',import.meta.url).pathname),request=globalThis.fetch;
 const socket=Object.getOwnPropertyDescriptor(globalThis,'WebSocket'),origin='http://127.0.0.1:4187';
 await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:class extends Socket{
  constructor(url){super(url,{headers:{Origin:origin}});}
 }});
 let host,transport,reader,processExited=false;
 globalThis.fetch=(url,options={})=>{
  const headers=new Headers(options.headers);
  headers.set('Origin',origin);
  return request(url,{...options,headers});
 };
 try{
  host=await selectedDeliveryNativeHost(root,{
   nativeActivation:true,nativeHandoverActivation:true,nativeHandoverPublication:true,
   sealedProcessRecovery:true,suggestionGrants:true,
  });
  const fixture=host.fixture(host.initial),clients=fixture.clients;
  const client=clients.find(row=>row.principal==='alice'&&!row.observer);
  assert.ok(client);
  await host.handover();
  const offer=host.handoverActivationOffer(),originalPid=host.processId;
  await assert.rejects(host.preparePublishedProcessRecovery(offer,offer.case),/Observe actual authenticated publication first/);
  const oldAuth=await host.authentication(client);
  const published=await publish(host,offer);
  const accepted=await acknowledgePublishedEdits(fixture,client,oldAuth);
  transport=assetClient(offer.case.clientEndpoint,client,oldAuth);
  assert.equal(await transport.readBytes(thirdAsset),undefined);
  const info={asset:thirdAsset,mime:'image/png',bytes:thirdPixel.length,width:1,height:1};
  const upload=await transport.uploader(info,new Blob([thirdPixel],{type:info.mime}),AbortSignal.timeout(10_000));
  assert.equal(upload,'breditor:relay-asset:1:'+thirdAsset);
  transport.dispose();
  transport=undefined;

  const advanced=await host.refreshAfter(published.served);
  const retained=archive(advanced),activationCut=archive(offer.case);
  assert.notDeepEqual(advanced.selection.source,offer.selection.current);
  assert.notDeepEqual(retained,activationCut);
  await assert.rejects(host.prepareProcessRecovery(offer),{name:'AssertionError'});
  console.log('SEALED_PUBLISHED_STEP exact-checkpoint-reopen-refuses-acknowledged-advance');
  await assert.rejects(host.preparePublishedProcessRecovery(offer,published.served),/exact latest observed cut/);
  await assert.rejects(host.preparePublishedProcessRecovery(offer,{...advanced}),/exact latest observed cut/);
  const sealed=join(host.directory,'language-3-standard-true-atomic-true','sdk-handover');
  const reference=JSON.parse(readFileSync(join(sealed,'selected-checkpoint-'+offer.case.sequence+'.json'),'utf8'));
  const originalCheckpoint=['activation.json','target.backup'].map(name=>{
   const file=join(sealed,reference.checkpointName,name);
   return {file,bytes:readFileSync(file)};
  });
  const capsule=await host.preparePublishedProcessRecovery(offer,advanced);
  const exited=await host.crashForRecovery(capsule);
  processExited=true;
  assert.deepEqual(exited,{processId:originalPid,signal:'SIGKILL'});
  const observed=inspectSelectedDeliverySealedNativeHost(root,capsule);
  assert.deepEqual(observed.selection,advanced.selection.source);
  assert.equal(Buffer.from(observed.selection.server.archiveSha256).toString('hex'),digest(retained));
  for(const {file,bytes} of originalCheckpoint)assert.deepEqual(readFileSync(file),bytes);
  host=await reopenSelectedDeliverySealedNativeHost(root,capsule);
  processExited=false;
  const fresh=host.reopenedOffer;
  assert.notEqual(host.processId,originalPid);
  assert.deepEqual(fresh.selection.current,advanced.selection.source);
  assert.deepEqual(fresh.selection.previous,offer.selection.planned);
  assert.notDeepEqual(fresh.selection.checkpointSha256,offer.selection.checkpointSha256);
  assert.equal(fresh.case.previousSequence,advanced.sequence);
  assert.equal(fresh.case.nativeProtectedStreamsVerified,true);
  assertHandoverPathContinuation(advanced.handoverSelection,fresh.case.handoverSelection);
  assert.deepEqual(archive(fresh.case),retained);
  assert.deepEqual(archive(offer.case),activationCut);
  for(const {file,bytes} of originalCheckpoint)assert.deepEqual(readFileSync(file),bytes);
  await assertHandoverPublicationWaiting(host,fresh);
  const auth=await host.authentication(client);
  assert.notEqual(auth.getToken(),oldAuth.getToken());
  assert.equal(auth.document.credential,oldAuth.document.credential);
  assert.equal(auth.review.credential,oldAuth.review.credential);
  reader=await Inspection.open({
   endpoint:fresh.case.endpoint,expected:fresh.case.selection,principal:'operator',
   getToken:()=>host.operatorToken(fresh.case),checkAuthority(){},
  });
  const {raster}=await reader.readRaster(thirdAsset);
  assert.ok(raster);
  assert.equal(raster.info.asset,thirdAsset);
  assert.deepEqual(Buffer.from(await raster.blob.arrayBuffer()),thirdPixel);
  reader.close();
  reader=undefined;

  const republished=await publish(host,fresh);
  assert.deepEqual(archive(republished.served),retained);
  transport=assetClient(fresh.case.clientEndpoint,client,auth);
  const restored=await transport.readBytes(thirdAsset);
  assert.ok(restored);
  assert.deepEqual(Buffer.from(await restored.blob.arrayBuffer()),thirdPixel);
  const stale=assetClient(fresh.case.clientEndpoint,client,oldAuth);
  try{await assert.rejects(stale.readBytes(thirdAsset));}
  finally{stale.dispose();}
  const peer=clients.find(row=>row!==client&&row.principal==='alice'&&!row.observer);
  assert.ok(peer);
  await withPublishedEditor(fixture,peer,await host.authentication(peer),async({core})=>{
   assert.ok(core.documentJson().includes(publishedDocumentText),'A different protected writer receives the recovered document edit');
   assert.ok(JSON.stringify(core.reviewSnapshot().view).includes(publishedCommentText),'A different protected actor receives the recovered comment');
  });
  await withPublishedEditor(fixture,client,auth,async({core,document,commentProgress,disconnect})=>{
   assert.equal(document.state().serverThrough,accepted.documentClock);
   assert.equal(document.state().serverPrefixDigest,accepted.documentPrefix);
   assert.deepEqual(commentProgress().accepted,accepted.commentClock);
   disconnect();
   const documentAfter=core.documentJson(),withoutEdit=JSON.parse(documentAfter);
   const paragraph=withoutEdit.root.children.find(row=>row.properties?.['breditor/block-id']==='p');
   const run=paragraph.children.find(row=>row.kind==='text'&&row.text.includes(publishedDocumentText));
   assert.ok(run);
   run.text=run.text.replace(publishedDocumentText,'');
   const visible=()=>core.reviewSnapshot().view.threads.map(row=>row.thread).filter(thread=>!thread.hidden);
   const reviewAfter=visible(),own=reviewAfter.find(thread=>JSON.stringify(thread).includes(publishedCommentText));
   assert.ok(own);
   assert.equal(core.undo(),true);
   assert.deepEqual(JSON.parse(core.documentJson()),withoutEdit);
   assert.equal(core.redo(),true);
   assert.equal(core.documentJson(),documentAfter);
   assert.equal(core.undoReview().kind,'committed');
   assert.deepEqual(visible(),reviewAfter.filter(thread=>thread.id!==own.id));
   assert.equal(core.redoReview().kind,'committed');
   assert.deepEqual(visible(),reviewAfter);
  },accepted);
  console.log('SEALED_PUBLISHED_PROCESS_RECOVERY '+JSON.stringify({
   oldPid:originalPid,inspectionPid:observed.processId,newPid:host.processId,exitSignal:exited.signal,protectedStreams:14,
   acknowledgedUpload:thirdAsset,archiveSha256:digest(retained),freshPublication:true,
   documentAndCommentReceiptsPreserved:true,peerCatchUp:true,localUndoRedo:true,
  }));
 }finally{
  reader?.close();
  transport?.dispose();
  globalThis.fetch=request;
  if(socket)Object.defineProperty(globalThis,'WebSocket',socket);else delete globalThis.WebSocket;
  if(!processExited)await host?.stop();
 }
});
