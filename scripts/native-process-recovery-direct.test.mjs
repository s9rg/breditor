/** Direct real child death: both prepared and committed checkpoint floors. */
import assert from 'node:assert/strict';import test from 'node:test';import {resolve} from 'node:path';import {readFileSync} from 'node:fs';
import {selectedDeliveryNativeHost,reopenSelectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativeProcessRoot} from './fixtures/native-process/native-root.mjs';
import {SharedDurableNativeActivationHost as Activation,SharedServerLogGenerationRecoveryHost as Host,SharedRelayAssets} from '../packages/breditor-collaboration/dist/index.js';
for(const committed of [false,true])test('real process death cold-opens '+(committed?'committed':'prepared')+' checkpoint with fresh auth and inactive owner',{timeout:180000},async()=>{
 const root=nativeProcessRoot(resolve(new URL('../',import.meta.url).pathname)),saved=globalThis.fetch;let warm,cold,oldReader,newReader,activation,oldActivation,ended=false;
 globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return saved(url,{...options,headers});};
 try{
  warm=await selectedDeliveryNativeHost(root,{suggestionGrants:true,nativeActivation:true,inactiveRasters:true,processRecovery:true});
  const original=warm.initial,client=warm.fixture(original).clients[0],oldAuth=await warm.authentication(client),offer=await warm.prepareActivation(original.selection.source);
  oldReader=await Host.open({endpoint:offer.case.endpoint,expected:offer.case.selection,principal:'operator',getToken:()=>warm.operatorToken(offer.case),checkAuthority(){}});
  oldActivation=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=>warm.activationToken(offer),checkAuthority(){}});
  const capsule=await warm.prepareProcessRecovery(offer);if(committed)await oldActivation.commit();
  const priorId=warm.processId,killed=await warm.crashForRecovery(capsule);ended=true;assert.equal(killed.signal,'SIGKILL');cold=await reopenSelectedDeliveryNativeHost(root,capsule);assert.notEqual(cold.processId,priorId);
  const recovered=cold.reopenedOffer;assert.ok(recovered);assert.notEqual(recovered.selection.instance,offer.selection.instance);assert.deepEqual(recovered.selection.previous,committed?offer.selection.planned:offer.selection.previous);
  await assert.rejects(oldReader.check());await assert.rejects(cold.finishActivation(recovered),/actual-native-service-not-committed/);
  newReader=await Host.open({endpoint:recovered.case.endpoint,expected:recovered.case.selection,principal:'operator',getToken:()=>cold.operatorToken(recovered.case),checkAuthority(){}});
  const asset='sha256:'+await(await import('node:crypto')).createHash('sha256').update(readFileSync(warm.directory+'/seed-a.png')).digest('hex');
  const raster=await newReader.readRaster(asset);assert.ok(raster.raster);assert.equal(raster.raster.info.asset,asset);
  const freshAuth=await cold.authentication(client);assert.notEqual(freshAuth.getToken(),oldAuth.getToken());assert.equal(freshAuth.document.credential,oldAuth.document.credential);assert.equal(freshAuth.review.credential,oldAuth.review.credential);
  activation=Activation.configure({endpoint:recovered.endpoint,expected:recovered.selection,principal:'operator',getToken:()=>cold.activationToken(recovered),checkAuthority(){}});const receipt=await activation.commit();assert.deepEqual(receipt.selection,recovered.selection);await cold.finishActivation(recovered);
  const cache={resolve(){throw Error('No cache lookup');},cacheRemote(){throw Error('No cache mutation');}},transport=new SharedRelayAssets({endpoint:original.clientEndpoint,principal:client.principal,getToken:freshAuth.getToken,store:cache}),oldTransport=new SharedRelayAssets({endpoint:original.clientEndpoint,principal:client.principal,getToken:oldAuth.getToken,store:cache});
  try{assert.ok(await transport.readBytes(asset));await assert.rejects(oldTransport.readBytes(asset));}finally{transport.dispose();oldTransport.dispose();}
  console.log('NATIVE_PROCESS_DIRECT '+JSON.stringify({committed,oldProcessId:priorId,newProcessId:cold.processId,actualExitSignal:killed.signal,newInactiveControlVerified:true,rasterReadBeforeActivation:true,freshAccountVerified:true,oldAccountRefused:true,protectedCredentialsUnchanged:true,actualNextServiceActivated:true}));
 }finally{oldReader?.close();newReader?.close();activation?.close();oldActivation?.close();if(cold)await cold.stop();else if(warm&&!ended)await warm.stop();globalThis.fetch=saved;}
});
