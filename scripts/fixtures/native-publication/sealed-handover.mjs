/** Exercise the real publication transport after a sealed Native handover. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SharedNativeRoomPublicationHost as Publication} from '../../../packages/breditor-collaboration/dist/native_publication_control/host.js';

const digest=bytes=>createHash('sha256').update(bytes).digest();
const health=offer=>new URL('/health',offer.case.clientEndpoint.replace('ws:','http:'));

export async function assertHandoverPublicationWaiting(host,offer){
 await assert.rejects(host.observePublication(offer),/actual-native-publication-not-observed/);
 await assert.rejects(host.finishActivation(offer),/authenticated-publication-required/);
 await assert.rejects(fetch(health(offer),{signal:AbortSignal.timeout(500)}),{name:'TimeoutError'});
}

export function handoverPublicationRequester(host,offer,checkAuthority,signal){
 return Publication.configure({
  endpoint:offer.publication.endpoint,
  expected:offer.publication.selection,
  principal:'operator',
  getToken:()=>host.publicationToken(offer.publication),
  checkAuthority,
  ...(signal?{signal}:{}),
 });
}

export function retainHandoverPublicationAssociation(host,offer,selected){
 const bytes=Buffer.from(JSON.stringify({
  format:'breditor/test-sealed-handover-publication-association',
  formatVersion:1,
  selected,
  publication:offer.publication.selection,
 }));
 const file=join(host.directory,'sdk-sealed-handover-publication-association-'+offer.case.sequence+'.json');
 writeFileSync(file,bytes,{flag:'wx',mode:0o600});
 assert.ok(readFileSync(file).equals(bytes));
 const sha256=digest(bytes);
 return {pin:{bytes:bytes.length,sha256:[...sha256]},file,sha256:sha256.toString('hex')};
}

export async function publishHandoverService(host,offer,publication,association,check){
 await assertHandoverPublicationWaiting(host,offer);
 const request=globalThis.fetch;
 let lostReceipt;
 let requests=0;
 globalThis.fetch=async(url,options)=>{
  const response=await request(url,options);
  if(String(url)===offer.publication.endpoint&&++requests===1){
   assert.equal(response.status,200);
   lostReceipt=await response.json();
   throw Error('Controlled lost reply after actual handover publication');
  }
  return response;
 };
 try{
  await assert.rejects(publication.publish(association.pin),{code:'publication_outcome_unknown'});
  assert.ok(lostReceipt);
  check();
  // The ordinary route already serves before the fixture observes publication.
  const response=await fetch(health(offer),{signal:AbortSignal.timeout(5000)});
  assert.equal(response.status,200);
  assert.equal(await response.text(),'breditor-relay-v1');
  const receipt=await publication.publish(association.pin);
  assert.deepEqual(receipt,lostReceipt);
  assert.deepEqual(receipt.joint,association.pin);
  const other=structuredClone(association.pin);
  other.sha256[0]^=1;
  await assert.rejects(publication.publish(other),{code:'publication_outcome_unknown'});
  assert.equal(requests,3);
  check();
  const served=await host.observePublication(offer);
  check();
  assert.deepEqual(served.selection.source,offer.selection.current);
  assert.equal(served.clientEndpoint,offer.case.clientEndpoint);
  const file=join(host.directory,'language-3-standard-true-atomic-true',`sdk-native-publication-${served.previousSequence}-observed.json`);
  const bytes=readFileSync(file);
  const observed=JSON.parse(bytes);
  assert.equal(observed.normalServingStartedByAuthenticatedHttp,true);
  assert.equal(observed.observerStartedNormalServing,false);
  assert.deepEqual(observed.receipt,receipt);
  assert.deepEqual(observed.actualDeployment,offer.selection.planned);
  assert.equal(observed.wholeRoomActivated,false);
  return {served,receipt,requests,nativeObservation:{file,bytes:bytes.length,sha256:digest(bytes).toString('hex')}};
 }finally{
  globalThis.fetch=request;
 }
}
