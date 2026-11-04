/** Actual service death between the Native and publication barriers. These
 * tests cover the Native half; they do not claim local client reconciliation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {selectedDeliveryNativeHost,reopenSelectedDeliveryJointNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativeJointProcessRoot} from './fixtures/native-publication/process-root.mjs';
import {SharedDurableNativeActivationHost as Activation,SharedServerLogGenerationRecoveryHost as Inspection,SharedRelayAssets} from '../packages/breditor-collaboration/dist/index.js';
import {SharedNativeRoomPublicationHost as Publication} from '../packages/breditor-collaboration/dist/native_publication_control/host.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
function immutableCheckpoint(root,offer){
 const reference=JSON.parse(readFileSync(join(root,'native-joint-selected-checkpoint-'+offer.case.sequence+'.json'),'utf8'));
 return ['activation.json','target.backup'].map(name=>{const file=join(root,reference.checkpointName,name);return{file,bytes:readFileSync(file)};});
}
function compareFiles(files){for(const row of files)assert.deepEqual(readFileSync(row.file),row.bytes,'Original checkpoint bytes are immutable');}
function publicationBinding(value){const bytes=Buffer.from(JSON.stringify(value));return{bytes:bytes.length,sha256:[...createHash('sha256').update(bytes).digest()]};}
function activation(host,offer,token=()=>host.activationToken(offer)){return Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:token,checkAuthority(){},requestTimeoutMs:1500});}
function publication(host,offer,token=()=>host.publicationToken(offer.publication)){return Publication.configure({endpoint:offer.publication.endpoint,expected:offer.publication.selection,principal:'operator',getToken:token,checkAuthority(){},requestTimeoutMs:1500});}
async function readAsset(host,first,client,auth,asset){
 const transport=new SharedRelayAssets({endpoint:first.clientEndpoint,principal:client.principal,getToken:auth.getToken,store:{resolve(){throw Error('No cache read');},cacheRemote(){throw Error('No cache insertion');}}});
 try{return await transport.readBytes(asset);}finally{transport.dispose();}
}
async function normalUnavailable(first,auth,asset,fetch){
 const endpoint=new URL(first.clientEndpoint);endpoint.protocol='http:';endpoint.pathname='/assets/'+asset;
 try{const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+auth.getToken(),'X-Breditor-Principal':'alice',Origin:'http://127.0.0.1:4187'},signal:AbortSignal.timeout(120)});assert.notEqual(response.status,200);await response.body?.cancel();}catch(error){if(error?.name==='AssertionError')throw error;assert.ok(error instanceof Error);}
}
for(const initialStage of ['prepared','committed','published'])test('joint Native recovery repeatedly reopens '+initialStage+' with fresh independent barriers',{timeout:300000},async()=>{
 const root=nativeJointProcessRoot(resolve(new URL('../',import.meta.url).pathname)),originalFetch=globalThis.fetch;
 let host,offer,dead=false,losePath,discarded;const opened=[],observations=[];
 globalThis.fetch=async(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');const response=await originalFetch(url,{...options,headers});if(losePath&&String(url).endsWith(losePath)){losePath=undefined;assert.equal(response.status,200);discarded=JSON.parse(await response.text());throw Error('Controlled reply loss after actual Native success');}return response;};
 try{
  host=await selectedDeliveryNativeHost(root,{nativeActivation:true,nativePublication:true,jointProcessRecovery:true});
  const first=host.initial,clients=host.fixture(first).clients,client=clients[0],initialAuth=await host.authentication(client);
  const initialAuths=new Map();for(const c of clients)initialAuths.set(c.writer,await host.authentication(c));
  const asset='sha256:'+sha(readFileSync(join(host.directory,'seed-a.png')));
  // Select the original complete predecessor after an intervening observation.
  const latest=await host.refresh();offer=await host.prepareJointActivationAfter(latest.selection.source,first);
  assert.equal(offer.case.previousSequence,first.sequence);
  console.log('NATIVE_JOINT_PHASE '+initialStage+' provisioned-original');
  const originalIntent={format:'breditor/test-original-joint-intent',formatVersion:1,activation:offer.selection,publication:offer.publication.selection},intentBytes=Buffer.from(JSON.stringify(originalIntent)),intentFile=join(host.directory,'original-joint-intent.json');writeFileSync(intentFile,intentBytes,{flag:'wx'});
  const initialBackup=readFileSync(join(dirname(offer.case.path),'server-after.backup')),nativeRoot=join(host.directory,'language-3-standard-true-atomic-true'),preserved=[];
  let sourceAuth=await host.authentication(client);
  for(let round=0;round<3;round++){
   const stage=round===0?initialStage:round===1?'prepared':'committed',committed=stage!=='prepared',old=host,oldOffer=offer,oldPid=host.processId;
   const oldActivation=activation(host,offer),oldPublication=publication(host,offer);opened.push(oldActivation,oldPublication);
   const oldToken=host.activationToken(offer),oldPublicationToken=host.publicationToken(offer.publication);
   const oldInspection=await Inspection.open({endpoint:offer.case.endpoint,expected:offer.case.selection,principal:'operator',getToken:()=>old.operatorToken(oldOffer.case),checkAuthority(){}});opened.push(oldInspection);
   const joint=publicationBinding({original:sha(intentBytes),activation:offer.selection,publication:offer.publication.selection});
   await assert.rejects(host.refreshAfter(first),/finish-the-actual-activation-first/);
   await assert.rejects(host.observePublication(offer),/actual-native-publication-not-observed/);
   await assert.rejects(host.finishActivation(offer),/no finish IPC/);
   await assert.rejects(oldPublication.publish(joint),e=>e.code==='publication_outcome_unknown');
   await normalUnavailable(first,sourceAuth,asset,originalFetch);
   if(committed){losePath='/recovery/native-activation/v1/commit';await assert.rejects(oldActivation.commit(),e=>e.code==='activation_outcome_unknown');assert.deepEqual(discarded.selection,offer.selection);}
   if(stage==='published'){losePath='/recovery/native-publication/v1/publish';await assert.rejects(oldPublication.publish(joint),e=>e.code==='publication_outcome_unknown');assert.deepEqual(discarded.selection,offer.publication.selection);assert.ok(await readAsset(host,first,client,sourceAuth,asset));}
   preserved.push(...immutableCheckpoint(nativeRoot,offer));
   const capsule=await host.prepareProcessRecovery(offer),crash=await host.crashForRecovery(capsule);dead=true;
   assert.equal(crash.signal,'SIGKILL');host=await reopenSelectedDeliveryJointNativeHost(root,capsule);dead=false;offer=host.reopenedOffer;assert.ok(offer);
   assert.notEqual(host.processId,oldPid);assert.notEqual(offer.selection.instance,oldOffer.selection.instance);assert.notEqual(offer.publication.selection.instance,oldOffer.publication.selection.instance);
   assert.deepEqual(offer.selection.current,oldOffer.selection.current);assert.deepEqual(offer.selection.previous,committed?oldOffer.selection.planned:oldOffer.selection.previous);
   assert.equal(offer.case.previousSequence,first.sequence,'An extra observation must not replace the selected complete predecessor');
   assert.equal(JSON.stringify(offer.selection.checkpointSha256)===JSON.stringify(oldOffer.selection.checkpointSha256),!committed);
   assert.deepEqual(readFileSync(join(dirname(offer.case.path),'server-after.backup')),initialBackup);compareFiles(preserved);assert.deepEqual(readFileSync(intentFile),intentBytes);
   await assert.rejects(reopenSelectedDeliveryJointNativeHost(root,capsule),/Actual terminated process/);
   await assert.rejects(oldInspection.check());await assert.rejects(oldActivation.commit());await assert.rejects(oldPublication.publish(joint));
   const staleActivation=activation(host,offer,()=>oldToken),stalePublication=publication(host,offer,()=>oldPublicationToken);opened.push(staleActivation,stalePublication);
   await assert.rejects(staleActivation.commit(),e=>e.code==='activation_outcome_unknown');await assert.rejects(stalePublication.publish(joint),e=>e.code==='publication_outcome_unknown');
   const oldAccount=sourceAuth.getToken();for(const c of clients){const auth=await host.authentication(c),before=initialAuths.get(c.writer);assert.notEqual(auth.getToken(),oldAccount);assert.equal(auth.document.credential,before.document.credential);assert.equal(auth.review.credential,before.review.credential);if(c===client)sourceAuth=auth;}
   // Every protected document/comment registration was proved by the real fresh
   // Rust host; the original selected native backup independently pins all 14.
   const reader=await Inspection.open({endpoint:offer.case.endpoint,expected:offer.case.selection,principal:'operator',getToken:()=>host.operatorToken(offer.case),checkAuthority(){}});opened.push(reader);const raster=await reader.readRaster(asset);assert.equal(raster.raster.info.asset,asset);
   await normalUnavailable(first,sourceAuth,asset,originalFetch);await assert.rejects(host.refreshAfter(first),/finish-the-actual-activation-first/);await assert.rejects(host.observePublication(offer),/actual-native-publication-not-observed/);
   const observed=JSON.parse(readFileSync(join(nativeRoot,'native-joint-process-reopen-'+offer.case.sequence+'.json'),'utf8'));assert.equal(observed.previousCheckpointStatus,committed?'committed':'prepared');assert.equal(observed.nativeServiceStillInactive,true);assert.equal(observed.checkpointParentVerifiedInRust,true);assert.equal(observed.wholeRoomActivated,false);
   console.log('NATIVE_JOINT_PHASE '+initialStage+' reopened-'+round+'-'+stage);
   observations.push({round,stage,signal:crash.signal,oldPid,newPid:host.processId,protectedStreams:14,selectedPredecessorPreserved:true,originalCheckpointBytesUnchanged:true});
  }
  const finalActivation=activation(host,offer),finalPublication=publication(host,offer);opened.push(finalActivation,finalPublication);
  const binding=publicationBinding({original:sha(intentBytes),activation:offer.selection,publication:offer.publication.selection});
  const receipt=await finalActivation.commit();assert.deepEqual(receipt.selection,offer.selection);await normalUnavailable(first,sourceAuth,asset,originalFetch);
  losePath='/recovery/native-publication/v1/publish';await assert.rejects(finalPublication.publish(binding),e=>e.code==='publication_outcome_unknown');const publicationReceipt=await finalPublication.publish(binding);assert.deepEqual(publicationReceipt,discarded);assert.deepEqual(await finalPublication.publish(binding),publicationReceipt);
  await assert.rejects(finalPublication.publish(publicationBinding({different:true})),e=>e.code==='publication_outcome_unknown');assert.deepEqual(await finalPublication.publish(binding),publicationReceipt);
  const serving=await host.observePublication(offer);assert.deepEqual(serving.selection.source,offer.selection.current);assert.deepEqual(readFileSync(join(dirname(serving.path),'server-after.backup')),initialBackup);
  const bytes=await readAsset(host,first,client,sourceAuth,asset);assert.deepEqual(Buffer.from(await bytes.blob.arrayBuffer()),readFileSync(join(host.directory,'seed-a.png')));await assert.rejects(readAsset(host,first,client,initialAuth,asset));
  compareFiles(preserved);assert.deepEqual(readFileSync(intentFile),intentBytes);
  console.log('NATIVE_JOINT_PROCESS '+JSON.stringify({initialStage,restarts:observations,exactNativeBackupSha256:sha(initialBackup),originalIntentSha256:sha(intentBytes),lostReplyRetriedAgainstSameOwner:true,freshAuthentication:true,oldReceiptsDidNotGrantServing:true,wholeRoomActivated:false}));
 }finally{for(const owner of opened)owner.close();if(host&&!dead)await host.stop();globalThis.fetch=originalFetch;}
});
