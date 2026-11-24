/** Real seven-family room recovery and prepared delivery, with the original
 * retained catalog. No copied source, replacement record or forged receipt. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';import {WebSocket as Socket} from 'undici';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';import {generationSelectedSession} from './fixtures/selected-generation-reconciliation/session.mjs';
import {withSelectedNativeDeliverySources} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {withNativeRelayDelivery} from '../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {previewSelectedNativeDeliveryPreparation,prepareSelectedNativeDelivery,createPreparedSelectedNativeRelayDelivery} from '../packages/breditor-collaboration/dist/selected_delivery_preparation/coordinator.js';
import {createNativeVersionDelivery} from '../packages/breditor-collaboration/dist/versions/native_delivery.js';
import {prepareCompoundMetadata} from '../packages/breditor-collaboration/dist/metadata/compound_preparation.js';
import {createSelectedNativeRelayDelivery} from '../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {pendingDelivery} from './fixtures/independent-delivery/session.mjs';
import {dormantMetadataTransport} from '../packages/breditor-collaboration/dist/metadata/dormant_transport.js';
async function seedMetadata(session,options){const queue=await session.openSuggestionQueue(),transport=dormantMetadataTransport(session.core,options.retained.suggestions.identity,options.retained.revisions.binding,()=>{}),revisions=await session.openSuggestionRevisions({transport,autoStart:false}),versions=await session.openVersionCatalog({getToken:()=>{throw Error('Fixture must stay offline');},autoConnect:false});await pendingDelivery(session,{queue,revisions,versions});}
import {NORMAL_SHARED_WASM_SHA256} from './fixtures/native-runtime/normal-shared-identity.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('prepared whole-room recovery prepares all bound metadata and publishes four original version records before cold native recovery',{timeout:1200000},async()=>{
 const root=resolve(new URL('../',import.meta.url).pathname),normal=readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url));
 assert.equal(sha(normal),NORMAL_SHARED_WASM_SHA256);await native.default({module_or_path:normal});
 const host=await selectedDeliveryNativeHost(root),first=host.initial,fixture=host.fixture(first),originalFetch=globalThis.fetch,saved=new Map(),requests=[],adapters=[],contexts=[];let session,gate,basis;const expected=[];
 for(const [name,value]of Object.entries({fetch:(url,options={})=>{requests.push(new URL(url).pathname);const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return originalFetch(url,{...options,headers});},WebSocket:class extends Socket{constructor(url){super(url,{headers:{Origin:'http://127.0.0.1:4187'}});}}})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true});}
 const fixtures={native,manifest:{cases:[first]},controls:{token:path=>host.operatorToken({path})},fixture(item){const value=host.fixture(item),source=value.generationRecoveryState;return {...value,selected:source.participants,afterSelected:source.participants,afterRecoveryState:{origin:source.origin,server:source.server,participants:source.participants}};},profile:value=>native.SharedRichProfile.from_standard_configuration_json_v3(value.configuration)};
 try{
  session=await generationSelectedSession(fixtures,'native-version-selected-room',{generationKind:'retained',documentSegmented:true,reviewSegmented:true,clientEndpoint:first.clientEndpoint,async prepareOriginal({source,versions,suggestions,revisions}){await pendingDelivery(source,{queue:suggestions,revisions,versions});},prepareDelivery:seedMetadata,prepareGraph:seedMetadata});const oldCalls=session.f.oldCalls;console.log('NATIVE_VERSION_SELECTED_PHASE retained-seven-family-owner');
  await withSelectedNativeDeliverySources(session.owner,session.input(),async(scope,sources,check)=>{
   assert.equal(sources.length,7);for(const row of sources)assert.throws(()=>row.source.core.select(null),e=>e.code==='native_recovery_busy');
   const preview=await previewSelectedNativeDeliveryPreparation(scope,session.host,'native-version-selected-room-prepared');gate=await prepareSelectedNativeDelivery(scope,session.host,preview.choice,()=>true);
   const bound=sources.filter(row=>row.source.parent.kind!=='independent-local');assert.deepEqual(bound.map(row=>row.id).sort(),['original','generation','independent-delivery','restored-graph'].sort());
   for(const row of bound){
    const parent=row.source.parent,source=parent.kind==='generation'?parent.source.session:parent.session,auth=await host.authentication(fixture.clients.find(value=>value.writer===source.reviewRelayIdentity().documentWriter)),context=createPreparedSelectedNativeRelayDelivery(gate,scope,row.source,'comment');contexts.push(context);
    const metadata=parent.kind==='original'?parent.packets:await prepareCompoundMetadata(source,context),catalog=metadata.versions;assert.ok(catalog);assert.ok(metadata.suggestions);assert.ok(metadata.revisions);
    const before=catalog.exportRecovery(),named=before.packets.find(value=>value.publish);assert.ok(named,'Original pending publication intent must survive every source family');const packet=named.packet,version=row.source.core.readVersion(packet),suggestions=metadata.suggestions.exportRecovery(),revisions=metadata.revisions.exportRecovery();
    const common={getToken:auth.getToken,autoConnect:false,requestTimeoutMs:5000};let doc,review;
    if(parent.kind==='original'){doc=new api.SharedRelaySync(row.source.core,withNativeRelayDelivery({...common,identity:auth.document},context));review=new api.SharedReviewRelaySync(withNativeRelayDelivery({...common,identity:auth.review,storage:source,flushDocument:()=>doc.flush()},context));}
    else{const independent=parent.kind==='independent-delivery';doc=(independent?api.createSharedIndependentRelaySync:api.createSharedSegmentedRelaySync)(source,withNativeRelayDelivery({...common,identity:auth.document},context));review=(independent?api.createSharedIndependentReviewRelaySync:api.createSharedSegmentedReviewRelaySync)(source,withNativeRelayDelivery({...common,identity:auth.review,flushDocument:()=>doc.flush()},context));}
    adapters.push(doc,review);const versions=createNativeVersionDelivery(catalog,context,{getToken:auth.getToken,flushDocument:()=>doc.flush(),requestTimeoutMs:5000});
    await doc.connect();await doc.flush();await review.connect();await review.flush();await versions.connect();await versions.flushShared();
    assert.equal(catalog.versionPacket(version.id),packet);const status=catalog.versionStatus(version.id);assert.ok(status.accepted);assert.equal(status.localSaved,true);assert.equal(status.queued,false);assert.deepEqual(metadata.suggestions.exportRecovery(),suggestions);assert.deepEqual(metadata.revisions.exportRecovery(),revisions);
    expected.push({id:row.id,record:catalog.exportRecovery(),packet,version:version.id,suggestions,revisions});console.log('HELD_METADATA_SELECTED_PHASE '+row.id+'-version-durably-accepted');
    await context.close();assert.equal(versions.state().status,'closed');for(const item of sources)assert.throws(()=>item.source.core.select(null),e=>e.code==='native_recovery_busy');
   }
   basis=await scope.retainCurrent();check();console.log('HELD_METADATA_SELECTED_PHASE complete-current-room-retained');
  });
  assert.equal(session.f.oldCalls,oldCalls,'An ended original whole-room job must never be revived');assert.ok(requests.some(path=>path.endsWith('/publish')));await gate.close();
  await session.cold(basis.current);console.log('NATIVE_VERSION_SELECTED_PHASE all-seven-families-cold-reopened');await withSelectedNativeDeliverySources(session.owner,session.input(),async(scope,sources,check)=>{
   for(const row of sources.filter(row=>expected.some(value=>value.id===row.id))){const parent=row.source.parent,source=parent.kind==='generation'?parent.source.session:parent.session,context=createSelectedNativeRelayDelivery(scope,row.source,'comment');contexts.push(context);const metadata=parent.kind==='original'?parent.packets:await prepareCompoundMetadata(source,context),saved=expected.find(value=>value.id===row.id);assert.deepEqual(metadata.versions.exportRecovery(),saved.record);assert.equal(metadata.versions.versionPacket(saved.version),saved.packet);assert.deepEqual(metadata.suggestions.exportRecovery(),saved.suggestions);assert.deepEqual(metadata.revisions.exportRecovery(),saved.revisions);await context.close();}check();
  });
  for(const {core}of session.owner.clients){const text=core.documentJson();assert.equal(core.undo(),true);assert.equal(core.redo(),true);assert.equal(core.documentJson(),text);assert.equal(core.undoReview().kind,'committed');assert.equal(core.redoReview().kind,'committed');}
  const files=[];for(const [name,bytes]of [['current-room.archive',Buffer.from(await basis.current.file.arrayBuffer())],['catalogs.recovery.json',Buffer.from(JSON.stringify(expected)+'\n')]]){writeFileSync(join(host.directory,name),bytes,{mode:0o600});files.push({name,bytes:bytes.length,sha256:sha(bytes)});}console.log('HELD_METADATA_SELECTED_EVIDENCE '+JSON.stringify({directory:host.directory,files,participants:7,metadataSources:4}));
 }finally{for(const context of contexts)await context.close();await gate?.close();for(const adapter of adapters)adapter.dispose();await Promise.all(adapters.map(adapter=>adapter.waitForDisconnected()));await session?.close();for(const [name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];await host.stop();}
});
