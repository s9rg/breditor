/** Actual Native replay into a freshly authenticated, operator-only server.
 * The component comparisons do not claim full portable client inspection. */
import {WebSocket as Socket} from 'undici';
import {SharedRelaySync} from '../packages/breditor-collaboration/dist/relay/sync.js';
import {packetImageDraft} from './fixtures/local-metadata/packet-raster.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';import {dirname,join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {inspectionNativeRoot} from './fixtures/server-packet-inspection/native-root.mjs';
import {captureServerOnlyPackets} from './fixtures/server-packet-inspection/packets.mjs';
import {SharedServerLogGenerationRecoveryHost as Host} from '../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {captureSelectedServerNativeDependencies} from '../packages/breditor-collaboration/dist/server_native_dependencies/collect.js';
import {countPacketReads} from './fixtures/local-metadata/count-packet-reads.mjs';
import {withInspectedServerPacketSource} from '../packages/breditor-collaboration/dist/server_packet_recovery/inspect_source.js';
import {inspectMetadataPacketIdentities} from '../packages/breditor-collaboration/dist/server_packet_recovery/inspect_packet_identities.js';
import {inspectOriginalServerPacketCatalog} from '../packages/breditor-collaboration/dist/server_packet_recovery/inspect_server_packets.js';
import {MetadataPacketArchive} from '../packages/breditor-collaboration/dist/metadata_packet_retention/archive.js';
import {SharedRichEditor} from '../packages/breditor-collaboration/dist/core.js';
import {coreReadStamp} from '../packages/breditor-collaboration/dist/core_read_stamp.js';
import * as wasm from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
const root=resolve(new URL('../',import.meta.url).pathname),sha=b=>createHash('sha256').update(b).digest('hex');
await wasm.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
test('inactive reconstructed server verifies complete Native inventory, original receipts and first packet strings; rehashed omissions and historical authority refuse',{timeout:240000},async()=>{
 const socket=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:class extends Socket{constructor(url){super(url,{headers:{Origin:'http://127.0.0.1:4187'}});}}});
 const originalFetch=globalThis.fetch;globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return originalFetch(url,{...options,headers});};
 let fixture,original,restored,archive,profile,core,author,sync;const opened=[];
 try{
  fixture=await selectedDeliveryNativeHost(inspectionNativeRoot(root),{suggestionGrants:true});const first=fixture.initial,data=fixture.fixture(first),options={wasm,checkAuthority(){}};
  const open=async item=>{const value=await Host.open({endpoint:item.endpoint,expected:item.selection,principal:'operator',getToken:()=>fixture.operatorToken(item),checkAuthority(){}});opened.push(value);return value;};
  const firstReader=await open(first),page=await firstReader.readMetadata({versions:{kind:'start'},suggestions:{kind:'start'},revisions:{kind:'start'}}),binding=page.metadata.suggestions.catalog.descriptor;firstReader.close();
  const client=data.clients.find(row=>row.principal==='alice'&&!row.observer),auth=await fixture.authentication(client);profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(data.configuration);author=new SharedRichEditor(profile.restore('room',client.documentCheckpoint),{richLanguage:3});
  sync=new SharedRelaySync(author,{identity:auth.document,getToken:auth.getToken,autoConnect:false,persistLocal:async()=>{},requestTimeoutMs:10000,suggestions:{binding:binding.binding,effectWriter:binding.effectWriter}});await sync.connect();await sync.flush();
  author.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Actual accepted source before inactive reconstruction. '}}]});await sync.flush();
  let image;const visit=n=>{if(!image&&n.type==='breditor/image')image=n;for(const child of n.children??[])visit(child);};visit(JSON.parse(author.documentJson()).root);assert.ok(image);
  const packet=author.captureSuggestion('Original pending proposal with retained raster source',client.principal,'1000000',packetImageDraft(author,image.properties['breditor/asset-id']));assert.equal((await sync.requestSuggestion({kind:'suggestionPublish',packet})).admission.kind,'durable');
  const selected=await fixture.refreshAfter(first);original=await open(selected);const native=await captureSelectedServerNativeDependencies(original);assert.equal(native.native.outcome.kind,'ready');assert.ok(native.native.sources.length>0);const dependenciesFile=new Blob([JSON.stringify(native)],{type:'application/vnd.breditor.server-native-dependencies+json'}),serverFile=new Blob([readFileSync(join(dirname(selected.path),'server-after.backup'))]),inventoryFile=new Blob([readFileSync(join(dirname(selected.path),'inventory.json'))]);
  const files={server:{file:serverFile,bytes:serverFile.size,sha256:sha(Buffer.from(await serverFile.arrayBuffer())),identity:selected.selection.source.server},inventory:{file:inventoryFile,bytes:inventoryFile.size,sha256:sha(Buffer.from(await inventoryFile.arrayBuffer())),identity:selected.selection.source.participants},dependencies:{file:dependenciesFile,bytes:dependenciesFile.size,sha256:sha(await dependenciesFile.text())}};
  await assert.rejects(fixture.reconstruct({...selected}));const replay=await fixture.reconstruct(selected);restored=await open(replay);assert.deepEqual(replay.selection.source.origin,selected.selection.source.server);assert.deepEqual(replay.selection.source.server,selected.selection.source.server);assert.notDeepEqual(replay.selection,selected.selection);
  await assert.rejects(Host.open({endpoint:replay.endpoint,expected:replay.selection,principal:'operator',getToken:()=>fixture.operatorToken(selected),checkAuthority(){}}));
  const ws=new URL(replay.endpoint);ws.pathname='/ws';assert.equal((await fetch(ws)).status,404,'Inactive recovery listener exposes no editor websocket route');
  let visits=0;const inspect=(value=files,host=restored,callback=async facts=>{visits++;return facts;},opts=options)=>withInspectedServerPacketSource(value,selected.selection,host,opts,callback);
  const dependencyRead=await countPacketReads(dependenciesFile,()=>inspect());
  const facts=dependencyRead.value;assert.equal(dependencyRead.reads,1,"Decode dependencies from their verified bytes");assert.deepEqual(facts.native,native.native);assert.equal(facts.scope,'selected-files-and-complete-genuine-server-native-equality');assert.equal('activate'in facts,false);
  const count=visits;await assert.rejects(inspect(files,{...restored}));assert.equal(visits,count);await assert.rejects(inspect({...files,grants:[]}));assert.equal(visits,count);
  assert.notDeepEqual(selected.selection.source.origin,selected.selection.source.server);await assert.rejects(inspect(files,original));assert.equal(visits,count,'An advanced original controller is not the replayed selected origin');
  const altered=fn=>{const value=structuredClone(native);fn(value);const file=new Blob([JSON.stringify(value)]);return{...files,dependencies:{file,bytes:file.size,sha256:sha(JSON.stringify(value))}};};
  await assert.rejects(inspect(altered(value=>{value.native.sources=value.native.sources.slice(1);})));assert.equal(visits,count,'Validly rehashed source omission must not reach inspection');
  assert.ok(native.native.outcome.references.length>0);await assert.rejects(inspect(altered(value=>{value.native.outcome.references=value.native.outcome.references.slice(1);})));assert.equal(visits,count);
  await assert.rejects(inspect(altered(value=>{value.requestSha256='f'.repeat(64);})));assert.equal(visits,count);
  const oldFile=new Blob([readFileSync(join(dirname(selected.path),'server.backup'))]);await assert.rejects(inspect({...files,server:{...files.server,file:oldFile,bytes:oldFile.size,sha256:sha(Buffer.from(await oldFile.arrayBuffer()))}}));assert.equal(visits,count);
  await assert.rejects(inspect(files,restored,async()=>{throw Error('controlled inspection callback failure');}),/controlled inspection callback failure/);await inspect();
  const controller=new AbortController();await assert.rejects(inspect(files,restored,async()=>{controller.abort();return true;},{...options,signal:controller.signal}));await inspect();
  const shadow=Host.prototype.readNativeDependencies;try{Host.prototype.readNativeDependencies=()=>{throw Error('Public Native shadow must be ignored');};await inspect();}finally{Host.prototype.readNativeDependencies=shadow;}
  core=new SharedRichEditor(profile.restore('room',data.clients[0].documentCheckpoint),{richLanguage:3});core.setReadOnly(true);const stamp=coreReadStamp(core),packets=await captureServerOnlyPackets(original,core,options);archive=await MetadataPacketArchive.read(packets.files,packets.parent,options);
  assert.equal(await inspectMetadataPacketIdentities(archive,core,options.checkAuthority),archive.header().bodies.length);
  const compared=await inspect(files,restored,async()=>inspectOriginalServerPacketCatalog(archive,restored,undefined,options.checkAuthority));assert.equal(compared.serverBodies,archive.header().server.length);assert.ok(compared.serverBodies>0);assert.deepEqual(coreReadStamp(core),stamp);assert.equal(core.view().readOnly,true);
  let allowed=true,afterVisit=false;const fetchBeforeFinal=globalThis.fetch;
  globalThis.fetch=async(...args)=>{const response=await fetchBeforeFinal(...args);if(afterVisit)allowed=false;return response;};
  try{await assert.rejects(inspect(files,restored,async()=>{afterVisit=true;return true;},{wasm,checkAuthority(){if(!allowed)throw Error('Current client authority ended during final server IO');}}));}finally{globalThis.fetch=fetchBeforeFinal;}
  await inspect();
  author.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Later original edit must not enter the inactive restored source. '}}]});await sync.flush();await assert.rejects(original.check());await inspect();
  const finalReader=await open(replay);await assert.rejects(inspect(files,finalReader,async()=>{finalReader.close();return true;}));await inspect();
  const report={format:'breditor/server-packet-inspection-component-observation',formatVersion:1,recordedSelection:selected.selection,reconstructedSelection:replay.selection,nativeSources:facts.native.sources.length,nativeReferences:facts.native.outcome.references.length,serverPacketBodies:compared.serverBodies,pages:compared.pages,sourceOmissionRefused:true,referenceOmissionRefused:true,requestHashRecomputed:true,oldTokenRefused:true,editorRouteAbsent:true,originalAdvancedControllerRefused:true,abortAndCloseRefused:true,readonlyNativeUnchanged:true,clientHistoryInspected:false,wholeRoomActivated:false};const path=join(fixture.directory,'server-packet-inspection-observation.json');writeFileSync(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log('SERVER_PACKET_INSPECTION_COMPONENT '+JSON.stringify({path,sha256:sha(readFileSync(path)),...compared}));
 }finally{archive?.dispose();core?.dispose();sync?.dispose();await sync?.waitForDisconnected();author?.dispose();profile?.free();for(const reader of opened.toReversed())reader.close();globalThis.fetch=originalFetch;if(socket)Object.defineProperty(globalThis,'WebSocket',socket);else delete globalThis.WebSocket;await fixture?.stop();}
});
