/** Fast component coverage with real Native packets and actual server ACKs.
 * Local record envelopes are comparison DATA, never a constructed owner. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {WebSocket as Socket} from 'undici';
import {metadataNativeRoot} from './fixtures/server-metadata/native-root.mjs';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {createHash} from 'node:crypto';
import {packetPixel,packetImageDraft} from './fixtures/local-metadata/packet-raster.mjs';
import {SharedRelayAssets} from '../packages/breditor-collaboration/dist/relay/assets.js';
import {testPacketArchiveComponents} from './fixtures/local-metadata/packet-archive-component.mjs';
import {testOriginalReceiptComparison} from './fixtures/local-metadata/receipt-comparison.mjs';
import {omitFirstOriginalVersion} from './fixtures/local-metadata/receipt-omission.mjs';
import {OriginalReceiptComparison} from '../packages/breditor-collaboration/dist/metadata_receipt_containment/compare.js';
import {SharedServerLogGenerationRecoveryHost as Host} from '../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {SharedRichEditor} from '../packages/breditor-collaboration/dist/core.js';
import {coreReadStamp} from '../packages/breditor-collaboration/dist/core_read_stamp.js';
import {SharedRelaySync} from '../packages/breditor-collaboration/dist/relay/sync.js';
import {VersionCatalogHttp} from '../packages/breditor-collaboration/dist/versions/http.js';
import {emptyDeliveryRetainedRecords} from '../packages/breditor-collaboration/dist/delivery_state/retained.js';
import {captureSelectedServerMetadata,withCheckedServerMetadataCatalog} from '../packages/breditor-collaboration/dist/server_metadata_read/collect.js';
import * as wasm from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
const root=new URL('../',import.meta.url).pathname,origin='http://127.0.0.1:4187',query={versions:{kind:'start'},suggestions:{kind:'start'},revisions:{kind:'start'}};
await wasm.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
test('exact first server bodies and local variants round-trip through genuine Native-checked packet archives',{timeout:180000},async()=>{
 const fetchOriginal=globalThis.fetch,socketOriginal=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');let host,initial,reader,profile,core,relay,discovery,http;
 globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin',origin);return fetchOriginal(url,{...options,headers});};
 Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:class extends Socket{constructor(url){super(url,{headers:{Origin:origin}});}}});
 try{
  host=await selectedDeliveryNativeHost(metadataNativeRoot(root),{suggestionGrants:true});const first=host.initial,fixture=host.fixture(first),client=fixture.clients.find(row=>row.principal==='alice'&&!row.observer),auth=await host.authentication(client),signal=new AbortController().signal;
  initial=await Host.open({endpoint:first.endpoint,expected:first.selection,principal:'operator',getToken:()=>host.operatorToken(first),checkAuthority(){}});
  const page=(await initial.readMetadata(query)).metadata,suggestion=page.suggestions.catalog.descriptor,revision=page.revisions.catalog.descriptor;initial.close();
  profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(fixture.configuration);core=new SharedRichEditor(profile.restore('room',client.documentCheckpoint),{richLanguage:3});
  relay=new SharedRelaySync(core,{identity:auth.document,getToken:auth.getToken,autoConnect:false,persistLocal:async()=>{},suggestions:{binding:suggestion.binding,effectWriter:suggestion.effectWriter},suggestionRevisions:{binding:revision.binding},requestTimeoutMs:10000});await relay.connect();await relay.flush();
  discovery=new VersionCatalogHttp({endpoint:first.clientEndpoint,principal:client.principal,room:'room',getToken:auth.getToken});const descriptor=await discovery.describe(signal);http=new VersionCatalogHttp({endpoint:first.clientEndpoint,principal:client.principal,room:'room',binding:descriptor.descriptor.binding,getToken:auth.getToken});
  const version=core.captureVersion('Original acknowledged comparison version',client.principal,'100'),admission=await http.publish(version,signal);assert.equal(admission.kind,'durable');
  assert.equal((await http.publish(core.captureVersion('Second actual version retains terminal cursor',client.principal,'101'),signal)).kind,'durable');
  const draft=text=>({scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text}}]}}),parent=core.captureSuggestion('Original acknowledged comparison proposal',client.principal,'200',draft('Original only ')),publication=await relay.requestSuggestion({kind:'suggestionPublish',packet:parent});assert.equal(publication.admission.kind,'durable');
  const packet=core.captureSuggestionRevision(parent,'Original acknowledged comparison revision','201',draft('Revision only ')),info=core.readSuggestionRevision(parent,packet),revised=await relay.requestSuggestionRevision({kind:'suggestionRevisionPublish',previousSuggestionId:info.previousSuggestionId,revisionPacket:packet});assert.equal(revised.admission.kind,'durable');const receipt=revised.admission.revision,child=core.revisionSuggestionPacket(parent,packet);
  const packetAsset='sha256:'+createHash('sha256').update(packetPixel).digest('hex'),assetTransport=new SharedRelayAssets({endpoint:first.clientEndpoint,principal:client.principal,getToken:auth.getToken,store:{}});
  try{await assetTransport.uploader({asset:packetAsset,mime:'image/png',bytes:packetPixel.length,width:1,height:1},new Blob([packetPixel],{type:'image/png'}),signal);}finally{assetTransport.dispose();}
  const remote=core.captureSuggestion('Remote intermediate-only image packet',client.principal,'300',packetImageDraft(core,packetAsset));assert.equal((await relay.requestSuggestion({kind:'suggestionPublish',packet:remote})).admission.kind,'durable');assert.equal(core.documentJson().includes(packetAsset),false);
  const selected=await host.refreshAfter(first);reader=await Host.open({endpoint:selected.endpoint,expected:selected.selection,principal:'operator',getToken:()=>host.operatorToken(selected),checkAuthority(){}});
  const catalog=await captureSelectedServerMetadata(reader,query),index=await withCheckedServerMetadataCatalog(catalog,async value=>value);
  const common={endpoint:first.clientEndpoint,principal:client.principal,room:'room',documentWriter:client.writer,writerTransport:'atomic-v2'},records=emptyDeliveryRetainedRecords({versions:{...common,binding:descriptor.descriptor.binding},suggestions:{identity:{...common,binding:suggestion.binding,effectWriter:suggestion.effectWriter},ownedHistory:null},revisions:{binding:revision.binding}});
  records.versions.catalog={through:catalog.terminal.versions.through,entries:index.versions};records.versions.packets=[{packet:version,origin:'local',publish:true,accepted:admission.entry}];
  records.suggestions.retained=[{packet:parent,origin:'local',publish:true,publication:publication.admission.publication,intent:null,decision:receipt.previousDecision},{packet:child,origin:'local',publish:true,publication:receipt.publication,intent:null,decision:null}];
  records.revisions.retained=[{previousPacket:parent,packet,retry:false,receipt,conflict:null}];
  const before=coreReadStamp(core),cases=await testOriginalReceiptComparison({contained:{catalog},lane:{id:'actual-comparison-client',records},core,check(){}});assert.equal(cases.length,12);
  const beforeFault=globalThis.fetch;let omittedId,pages=0;
  globalThis.fetch=async(url,options)=>{const response=await beforeFault(url,options);if(!String(url).endsWith('/metadata/read')||!response.ok)return response;const omitted=await omitFirstOriginalVersion(response);omittedId=omitted.id;pages++;return omitted.response;};
  try{const missing=await captureSelectedServerMetadata(reader,query),view=await withCheckedServerMetadataCatalog(missing,async value=>value),comparison=new OriginalReceiptComparison(view,missing.pages[0].metadata,missing.terminal,'room',()=>{});comparison.inspect('actual-comparison-client','controlled-valid-http-omission',core,records);assert.ok(pages>0);assert.equal(omittedId,admission.entry.version.id);assert.ok(comparison.result().pending.some(row=>row.id===omittedId&&row.relation==='missing'));await reader.check();console.log('RECEIPT_OMISSION_NATIVE '+JSON.stringify({validHttpFraming:true,actualServerUnchanged:true,missingOriginalReceiptDetected:true}));}finally{globalThis.fetch=beforeFault;}
  await testPacketArchiveComponents({host,selected,reader,core,records,catalog,wasm,http,signal});
  const after=coreReadStamp(core);assert.equal(after.document,before.document);assert.equal(after.review,before.review);
 }finally{http?.dispose();discovery?.dispose();relay?.dispose();await relay?.waitForDisconnected();core?.dispose();profile?.free();initial?.close();reader?.close();globalThis.fetch=fetchOriginal;if(socketOriginal)Object.defineProperty(globalThis,'WebSocket',socketOriginal);else delete globalThis.WebSocket;await host?.stop();}
});
