/** SAME actual retained owners against a genuinely epoch-activated native
 * service, not replacement endpoints or a simulated accepted-prefix response. */
import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{resolve}from'node:path';import{WebSocket as Socket}from'undici';
import*as api from'../packages/breditor-collaboration/dist/index.js';import*as native from'../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import{selectedDeliveryNativeHost}from'./fixtures/selected-delivery/native-host.mjs';import{generationSelectedSession}from'./fixtures/selected-generation-reconciliation/session.mjs';
import{withSelectedNativeDeliverySources}from'../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';import{withNativeRelayDelivery}from'../packages/breditor-collaboration/dist/relay/native_delivery.js';
import{previewSelectedNativeDeliveryPreparation,prepareSelectedNativeDelivery,createPreparedSelectedNativeRelayDelivery}from'../packages/breditor-collaboration/dist/selected_delivery_preparation/coordinator.js';
import {openAndForceCloseJournal} from './fixtures/local-metadata/unexpected-close.mjs';
import{DeliveryPreparationIntentStore}from'../packages/breditor-collaboration/dist/selected_delivery_preparation/intent_store.js';
import{DeliveryPreparationResources}from'../packages/breditor-collaboration/dist/selected_delivery_preparation/resources.js';
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
test('durable complete before-cut and readback precede actual retained-owner authentication and delivery',{timeout:600000},async()=>{
 const root=resolve(new URL('../',import.meta.url).pathname),host=await selectedDeliveryNativeHost(root),first=host.initial,fixture=host.fixture(first),saved=new Map(),originalFetch=globalThis.fetch,requests=[];let session;
 for(const[name,value]of Object.entries({fetch:(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return originalFetch(url,{...options,headers});},WebSocket:class extends Socket{constructor(url){super(url,{headers:{Origin:'http://127.0.0.1:4187'}});}send(raw){requests.push(JSON.parse(raw).request.kind);assert.ok(requests.length<20000);return super.send(raw);}}})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true});}
 const fixtures={native,manifest:{cases:[first]},controls:{token:path=>host.operatorToken({path})},fixture(item){const value=host.fixture(item),source=value.generationRecoveryState;return{...value,selected:source.participants,afterSelected:source.participants,afterRecoveryState:{origin:source.origin,server:source.server,participants:source.participants}};},profile:value=>native.SharedRichProfile.from_standard_configuration_json_v3(value.configuration)};
 const contexts=[],adapters=[];let current,prepared;let tokens=0,approvals=0;
 try{session=await generationSelectedSession(fixtures,'selected-owner-real-delivery',{generationKind:'retained',documentSegmented:true,reviewSegmented:true,clientEndpoint:first.clientEndpoint});const oldCalls=session.f.oldCalls,bound=[],unbound=[];
  await withSelectedNativeDeliverySources(session.owner,session.input(),async(scope,sources,check)=>{
   const database='real-selected-owner-prepared',preview=await previewSelectedNativeDeliveryPreparation(scope,session.host,database),before={current:preview.current};assert.ok(before.current.file.size>0);
   await assert.rejects(previewSelectedNativeDeliveryPreparation({...scope},session.host,database));
   await assert.rejects(prepareSelectedNativeDelivery(scope,session.host,preview.choice,()=>false));assert.equal(tokens,0);assert.equal((await indexedDB.databases()).some(row=>row.name===database),false);
   prepared=await prepareSelectedNativeDelivery(scope,session.host,preview.choice,choice=>{approvals++;assert.deepEqual(choice,preview.choice);return true;});assert.equal(approvals,1);assert.equal(tokens,0);assert.deepEqual(prepared.prepared.choice,preview.choice);
   assert.deepEqual(Buffer.from(await prepared.prepared.file.arrayBuffer()),Buffer.from(await preview.current.file.arrayBuffer()));
   const firstSource=sources.find(row=>row.id==='original').source;assert.throws(()=>createPreparedSelectedNativeRelayDelivery({...prepared},scope,firstSource,'comment'),error=>error.code==='delivery_preparation_policy');
   const integrity={wasm:native,checkAuthority:()=>scope.check(),signal:scope.signal},missing={...preview.choice,database:'real-selected-owner-prepared-missing'},absent=new DeliveryPreparationIntentStore(indexedDB,missing,integrity);try{await assert.rejects(absent.open(),error=>error.code==='delivery_preparation_missing');}finally{await absent.close();}assert.equal((await indexedDB.databases()).some(row=>row.name===missing.database),false);
   const duplicate=new DeliveryPreparationIntentStore(indexedDB,preview.choice,integrity);try{await assert.rejects(duplicate.open(preview.current.file),error=>error.code==='delivery_preparation_exists');}finally{await duplicate.close();}assert.equal(tokens,0);

   const retained={...preview.choice,database:'real-selected-owner-prepared-revocation'};
   const revoked=new DeliveryPreparationIntentStore(indexedDB,retained,integrity);
   try{
    const saved=await openAndForceCloseJournal(revoked,retained.database,()=>revoked.open(preview.current.file));
    assert.equal(revoked.revoked.aborted,true);
    assert.throws(revoked.checkCurrent,{code:'delivery_preparation_closed'});
    assert.deepEqual(Buffer.from(await saved.file.arrayBuffer()),Buffer.from(await preview.current.file.arrayBuffer()));
   }finally{await revoked.close();}

   for(const row of sources){const parent=row.source.parent,source=parent.kind==='generation'?parent.source.session:parent.session,isBound=parent.kind==='original'||parent.kind==='independent-delivery'||parent.kind==='generation'&&parent.source.kind!=='local';assert.throws(()=>row.source.core.select(null),error=>error.code==='native_recovery_busy');if(!isBound){unbound.push(row.id);continue;}
    const client=fixture.clients.find(value=>value.writer===row.source.core.writerClockV2(source.reviewRelayIdentity().documentWriter).writer),auth=await host.authentication(client),context=createPreparedSelectedNativeRelayDelivery(prepared,scope,row.source,'comment');contexts.push(context);const common={getToken:()=>{prepared.check();tokens++;return auth.getToken();},autoConnect:false,requestTimeoutMs:5000};let doc,review;
    if(parent.kind==='original'){doc=new api.SharedRelaySync(row.source.core,withNativeRelayDelivery({...common,identity:auth.document},context));review=new api.SharedReviewRelaySync(withNativeRelayDelivery({...common,identity:auth.review,storage:source,flushDocument:()=>doc.flush()},context));}
    else{const independent=parent.kind==='independent-delivery';doc=(independent?api.createSharedIndependentRelaySync:api.createSharedSegmentedRelaySync)(source,withNativeRelayDelivery({...common,identity:auth.document},context));review=(independent?api.createSharedIndependentReviewRelaySync:api.createSharedSegmentedReviewRelaySync)(source,withNativeRelayDelivery({...common,identity:auth.review,flushDocument:()=>doc.flush()},context));}
    adapters.push(doc,review);await doc.connect();await doc.flush();await review.connect();await review.flush();assert.equal(doc.state().pending,false);assert.equal(review.state().pending,false);assert.equal(doc.state().serverThrough,row.source.core.writerClockV2(client.writer).through);assert.equal(review.state().serverThrough,row.source.core.localReviewClock().through);assert.ok(row.source.core.documentJson().includes('Native offline retained'));bound.push(row.id);await context.close();row.source.save();await row.source.flush();check();
   }
   assert.deepEqual(bound.sort(),['original','generation','independent-delivery','restored-graph'].sort());assert.deepEqual(unbound.sort(),['independent-local','local-operation-snapshot','local-operation-flat'].sort());current=await scope.retainCurrent();assert.ok(current.current.file.size>0);check();assert.ok(tokens>0);await prepared.close();assert.throws(()=>createPreparedSelectedNativeRelayDelivery(prepared,scope,firstSource,'comment'),error=>error.code==='delivery_preparation_closed');
   const reopened=new DeliveryPreparationResources();try{const recovered=await reopened.open(preview.choice,integrity);assert.deepEqual(recovered.choice,preview.choice);assert.deepEqual(Buffer.from(await recovered.file.arrayBuffer()),Buffer.from(await preview.current.file.arrayBuffer()));}finally{await reopened.close();}

  });assert.equal(session.f.oldCalls,oldCalls,'No ended original job guard may be revived for delivery');for(const adapter of adapters)assert.equal(adapter.state().status,'closed');await assert.rejects(session.host.check(),'The old exact native cut cannot bless changed server state');const after=await host.refresh();assert.equal(after.clientEndpoint,first.clientEndpoint);assert.notDeepEqual(after.selection.source.server,first.selection.source.server);assert.ok(current.current.file.size>0);
  // This deliberately does NOT claim the three unbound lanes, metadata
  // outboxes or newly advanced server cut have been jointly adopted.
 }finally{await prepared?.close();for(const context of contexts)await context.close();for(const adapter of adapters)adapter.dispose();await Promise.all(adapters.map(adapter=>adapter.waitForDisconnected()));await session?.close();for(const[name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];await host.stop();}
});
