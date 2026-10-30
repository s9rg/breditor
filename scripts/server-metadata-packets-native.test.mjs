import {metadataNativeRoot} from './fixtures/server-metadata/native-root.mjs';
/** Real original server publications, revisions and exact bytes across every catalog lane. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {WebSocket as Socket} from 'undici';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {SharedServerLogGenerationRecoveryHost as Host,generationRecoveryHostPort} from '../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {captureSelectedServerMetadata,withCheckedServerMetadataCatalog} from '../packages/breditor-collaboration/dist/server_metadata_read/collect.js';
import {SharedRichEditor} from '../packages/breditor-collaboration/dist/core.js';
import {SharedRelaySync} from '../packages/breditor-collaboration/dist/relay/sync.js';
import {VersionCatalogHttp} from '../packages/breditor-collaboration/dist/versions/http.js';
import * as wasm from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';

const root=new URL('../',import.meta.url).pathname,origin='http://127.0.0.1:4187';
const query={versions:{kind:'start'},suggestions:{kind:'start'},revisions:{kind:'start'}};
const fingerprint=(id,text)=>({id,bytes:Buffer.byteLength(text),sha256:'sha256:'+createHash('sha256').update(text).digest('hex')});
await wasm.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});

test('65 original versions and65 committed revisions collect with exact cross-lane receipts and first packet bytes',{timeout:240000},async()=>{
 const evidence=mkdtempSync(new URL('../target/metadata-packet-evidence-',import.meta.url).pathname);
 const originalFetch=globalThis.fetch,originalSocket=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');
 let native,initialReader,reader,profile,core,relay,http,discovery,allowed=true,tokens=0,fetches=0,authority=0;
 globalThis.fetch=(url,options={})=>{fetches++;const headers=new Headers(options.headers);headers.set('Origin',origin);return originalFetch(url,{...options,headers});};
 Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:class extends Socket{constructor(url){super(url,{headers:{Origin:origin}});}}});
 try{
  native=await selectedDeliveryNativeHost(metadataNativeRoot(root),{suggestionGrants:true});const initial=native.initial,fixture=native.fixture(initial),client=fixture.clients.find(row=>row.principal==='alice'&&!row.observer),auth=await native.authentication(client),signal=new AbortController().signal;
  initialReader=await Host.open({endpoint:initial.endpoint,expected:initial.selection,principal:'operator',getToken:()=>native.operatorToken(initial),checkAuthority(){}});
  const initialPage=await initialReader.readMetadata(query);
  const suggestionBinding=initialPage.metadata.suggestions.catalog.descriptor,revisionBinding=initialPage.metadata.revisions.catalog.descriptor;
  profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(fixture.configuration);core=new SharedRichEditor(profile.restore('room',client.documentCheckpoint),{richLanguage:3});
  relay=new SharedRelaySync(core,{identity:auth.document,getToken:auth.getToken,autoConnect:false,persistLocal:async()=>{},suggestions:{binding:suggestionBinding.binding,effectWriter:suggestionBinding.effectWriter},suggestionRevisions:{binding:revisionBinding.binding},requestTimeoutMs:10000});
  await relay.connect();await relay.flush();
  // Preserve the actual owned checkpoint and deliver its genuine offline group
  // through the original relay. A remote frame must never extend an owned writer.
  initialReader.close();const baseline=await native.refreshAfter(initial);
  initialReader=await Host.open({endpoint:baseline.endpoint,expected:baseline.selection,principal:'operator',getToken:()=>native.operatorToken(baseline),checkAuthority(){}});
  const acceptedBefore=await initialReader.readAcceptedNative({document:'include',review:{kind:'start'}});
  discovery=new VersionCatalogHttp({endpoint:initial.clientEndpoint,principal:client.principal,room:'room',getToken:auth.getToken});const descriptor=await discovery.describe(signal);
  http=new VersionCatalogHttp({endpoint:initial.clientEndpoint,principal:client.principal,room:'room',binding:descriptor.descriptor.binding,getToken:auth.getToken});
  const packets={versions:[],suggestions:[],revisions:[]},versions=[],publications=[],decisions=[],revisions=[];
  for(let i=0;i<65;i++){
   const text=core.captureVersion('Original version '+i,client.principal,String(100+i)),received=await http.publish(text,signal);assert.equal(received.kind,'durable');assert.equal(received.duplicate,false);versions.push(received.entry);packets.versions.push({kind:'version',fingerprint:fingerprint(received.entry.version.id,text),text});
  }
  const draft=text=>({scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text}}]}});
  let previous=core.captureSuggestion('Original proposal',client.principal,'200',draft('Proposed only '));
  const published=await relay.requestSuggestion({kind:'suggestionPublish',packet:previous});assert.equal(published.kind,'suggestionAdmission');assert.equal(published.admission.kind,'durable');publications.push(published.admission.publication);packets.suggestions.push({kind:'suggestion',fingerprint:fingerprint(core.readSuggestion(previous).id,previous),text:previous});
  for(let i=0;i<65;i++){
   const text=core.captureSuggestionRevision(previous,'Original revision '+i,String(300+i),draft('Revised proposed only '+i+' ')),info=core.readSuggestionRevision(previous,text),child=core.revisionSuggestionPacket(previous,text);
   const received=await relay.requestSuggestionRevision({kind:'suggestionRevisionPublish',previousSuggestionId:info.previousSuggestionId,revisionPacket:text});assert.equal(received.kind,'suggestionRevisionAdmission');assert.equal(received.admission.kind,'durable');assert.equal(received.admission.duplicate,false);
   const receipt=received.admission.revision;revisions.push(receipt);decisions.push(receipt.previousDecision);publications.push(receipt.publication);packets.revisions.push({kind:'revision',fingerprint:fingerprint(info.id,text),text});packets.suggestions.push({kind:'suggestion',fingerprint:fingerprint(info.suggestion.id,child),text:child});previous=child;
  }
  await assert.rejects(initialReader.readMetadata(query));const selected=await native.refreshAfter(baseline);
  reader=await Host.open({endpoint:selected.endpoint,expected:selected.selection,principal:'operator',getToken:()=>{tokens++;return native.operatorToken(selected);},checkAuthority(){authority++;if(!allowed)throw Error('Current authority revoked');}});
  const acceptedAfter=await reader.readAcceptedNative({document:'include',review:{kind:'start'}});assert.equal(acceptedAfter.documentFrame,acceptedBefore.documentFrame);assert.deepEqual(acceptedAfter.review.batches,acceptedBefore.review.batches);
  const catalog=await captureSelectedServerMetadata(reader,query),index=await withCheckedServerMetadataCatalog(catalog,async value=>value);
  assert.equal(catalog.pages.length,3);assert.deepEqual(index.versions,versions);assert.deepEqual(index.publications,publications);assert.deepEqual(index.decisions,decisions);assert.deepEqual(index.revisions,revisions);
  for(const name of ['versions','suggestions','revisions']){assert.deepEqual(index.fingerprints[name],packets[name].map(row=>row.fingerprint));assert.equal(catalog.terminal[name].after,catalog.terminal[name].through);}
  const reads=[];
  for(const name of ['versions','suggestions','revisions'])for(const row of [packets[name][0],packets[name].at(-1)]){
   const read=await reader.readMetadataPacket({kind:row.kind,expected:row.fingerprint});assert.deepEqual(read.packet,row);reads.push(read);
  }
  const original=packets.versions[0],variant=JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(original.text)).reverse()),null,2);assert.notEqual(variant,original.text);assert.equal(core.readVersion(variant).id,original.fingerprint.id);
  const duplicate=await http.publish(variant,signal);assert.equal(duplicate.kind,'durable');assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.entry,versions[0]);await reader.check();
  assert.equal((await reader.readMetadataPacket({kind:'version',expected:original.fingerprint})).packet.text,original.text);
  await assert.rejects(reader.readMetadataPacket({kind:'version',expected:fingerprint(original.fingerprint.id,variant)}));
  const counts={tokens,fetches,authority};let getters=0;await assert.rejects(reader.readMetadataPacket({kind:'version',get expected(){getters++;return original.fingerprint;}}),error=>error.code==='control_policy');assert.equal(getters,0);assert.deepEqual({tokens,fetches,authority},counts);
  const port=generationRecoveryHostPort(reader),method=Host.prototype.readMetadataPacket;try{Host.prototype.readMetadataPacket=()=>Promise.resolve({forged:true});assert.deepEqual((await port.readMetadataPacket({kind:'version',expected:original.fingerprint})).packet,original);}finally{Host.prototype.readMetadataPacket=method;}
  allowed=false;await assert.rejects(port.readMetadataPacket({kind:'version',expected:original.fingerprint}),error=>error.code==='control_authority');allowed=true;
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(port.readMetadataPacket({kind:'version',expected:original.fingerprint},cancelled.signal),error=>error.code==='control_cancelled');await reader.check();
  // Hold only the real SHA-256 completion, after the genuine authenticated
  // response. Cancellation and exclusive request ownership must still hold.
  const subtle=crypto.subtle,digestDescriptor=Object.getOwnPropertyDescriptor(subtle,'digest'),digestOriginal=subtle.digest;
  let releaseDigest,enteredDigest;const entered=new Promise(resolve=>{enteredDigest=resolve;}),release=new Promise(resolve=>{releaseDigest=resolve;});
  try{
   Object.defineProperty(subtle,'digest',{configurable:true,value:async function(algorithm,data){const result=await digestOriginal.call(this,algorithm,data);if(Buffer.from(data).equals(Buffer.from(original.text))){enteredDigest();await release;}return result;}});
   const during=new AbortController(),reading=port.readMetadataPacket({kind:'version',expected:original.fingerprint},during.signal);
   await entered;await assert.rejects(reader.check(),error=>error.code==='control_busy');during.abort();releaseDigest();await assert.rejects(reading,error=>error.code==='control_cancelled');
  }finally{releaseDigest?.();if(digestDescriptor)Object.defineProperty(subtle,'digest',digestDescriptor);else delete subtle.digest;}
  await reader.check();
  try{
   Object.defineProperty(subtle,'digest',{configurable:true,value:async function(algorithm,data){const result=await digestOriginal.call(this,algorithm,data);if(Buffer.from(data).equals(Buffer.from(original.text)))allowed=false;return result;}});
   await assert.rejects(port.readMetadataPacket({kind:'version',expected:original.fingerprint}),error=>error.code==='control_authority');
  }finally{allowed=true;if(digestDescriptor)Object.defineProperty(subtle,'digest',digestDescriptor);else delete subtle.digest;}
  await reader.check();
  writeFileSync(evidence+'/result.json',JSON.stringify({catalog,index,reads,originalVersion:original,duplicateVariant:variant,duplicate,metadataOnlyChangeRefused:true,nativeDocumentAndReviewUnchanged:true,privatePortIgnoresPublicPrototype:true},null,2)+'\n',{flag:'wx'});
  reader.close();await assert.rejects(port.readMetadataPacket({kind:'version',expected:original.fingerprint}),error=>error.code==='control_closed');
  console.log('NATIVE_METADATA_PACKETS_EVIDENCE '+evidence);
 }finally{
  relay?.dispose();if(relay)await relay.waitForDisconnected().catch(()=>{});http?.dispose();discovery?.dispose();core?.dispose();profile?.free();initialReader?.close();reader?.close();globalThis.fetch=originalFetch;
  if(originalSocket)Object.defineProperty(globalThis,'WebSocket',originalSocket);else delete globalThis.WebSocket;await native?.stop();
 }
});
