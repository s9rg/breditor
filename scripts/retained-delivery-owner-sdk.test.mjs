import{sessionDeliveryIO}from'../packages/breditor-collaboration/dist/delivery_source/io.js';
/** Isolated-development prototype: actual seven-family retained parents and
 * constructor-owned source/packet resources. No publication or ACK claim. */
import test,{before,after}from'node:test';import assert from'node:assert/strict';
import * as api from'../packages/breditor-collaboration/dist/index.js';
import{withSelectedNativeDeliverySources as held}from'../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import{nativeDeliverySource}from'../packages/breditor-collaboration/dist/operation_read/delivery_retention.js';
import{createSelectedNativeRelayDelivery,withNativeRelayDelivery}from'../packages/breditor-collaboration/dist/relay/native_delivery.js';
import{reserveNativeRecovery}from'../packages/breditor-collaboration/dist/core.js';
import{generationCompleteControlFixtures}from'./fixtures/generation-recovery-control/complete-fixtures.mjs';
import{acceptedControlTransport}from'./fixtures/selected-generation-reconciliation/accepted-transport.mjs';
import{generationSelectedSession,selectStart}from'./fixtures/selected-generation-reconciliation/session.mjs';
let fixtures,transport;before(async()=>{fixtures=await generationCompleteControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});after(async()=>{transport?.restore();await fixtures?.close();});
test('source resources are not public root exports or constructible from copied DATA',async()=>{assert.equal(api.withSelectedNativeDeliverySources,undefined);assert.equal(api.nativeDeliverySource,undefined);assert.equal(api.sessionDeliveryIO,undefined);assert.throws(()=>sessionDeliveryIO({core:{},save(){},flush:async()=>{}},{}),error=>error.code==='delivery_source_unavailable');assert.throws(()=>nativeDeliverySource({core:{},capture(){}}),/genuine/);let reflected=0;const bad=new Proxy({},{ownKeys(){reflected++;throw Error('No input reflection');}});await assert.rejects(held({},bad,async()=>{}),error=>error.code==='asset_adoption_policy');assert.equal(reflected,0);});
test('all seven genuine parents retain the exact same native and source owners after original job ends',async()=>{
 const s=await generationSelectedSession(fixtures,'delivery-owned-sources',{documentSegmented:true,reviewSegmented:true});let resources;
 try{const clients=s.owner.clients,oldCalls=s.f.oldCalls,before=clients.map(({core})=>[core.checkpointJson(),core.reviewHistoryPolicy()==='segmented-v1'?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()]);
  await held(s.owner,s.input(),async(scope,sources,check)=>{resources=sources;assert.ok(Object.isFrozen(sources));assert.deepEqual(sources.map(({id,family})=>[id,family]),clients.map(({id,family})=>[id,family]));
   for(const row of sources){const client=clients.find(client=>client.id===row.id);assert.equal(row.source.core,client.core);const parent=row.source.parent,session=parent.kind==='generation'?parent.source.session:parent.session;assert.equal(session.core,client.core);row.source.check();const another=clients.find(client=>client.core!==row.source.core);assert.throws(()=>sessionDeliveryIO(session,another.core),error=>error.code==='delivery_source_unavailable');
    let shadowed=0;const ownSave=Object.getOwnPropertyDescriptor(session,'save'),ownFlush=Object.getOwnPropertyDescriptor(session,'flush'),canShadow=Object.isExtensible(session);
    try{if(canShadow){Object.defineProperty(session,'save',{configurable:true,value(){shadowed++;throw Error('Public save must not supply custody');}});Object.defineProperty(session,'flush',{configurable:true,value:async()=>{shadowed++;throw Error('Public flush must not supply custody');}});}row.source.save();await row.source.flush();check();assert.equal(shadowed,0);}
    finally{if(canShadow){if(ownSave)Object.defineProperty(session,'save',ownSave);else delete session.save;if(ownFlush)Object.defineProperty(session,'flush',ownFlush);else delete session.flush;}}assert.throws(()=>client.core.dispatch({commands:[]}),error=>error.code==='native_recovery_busy');}
   const current=await scope.retainCurrent();assert.ok(current.current.file.size>0);check();
  });assert.equal(s.f.oldCalls,oldCalls,'No ended whole-room job guard is revived');assert.deepEqual(clients.map(({core})=>[core.checkpointJson(),core.reviewHistoryPolicy()==='segmented-v1'?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()]),before);
  for(const client of clients){selectStart(client.core);client.core.type('Still pending '+client.id+' 🙂 ');client.core.dispatchReview({kind:'create_thread',data:{anchorJson:client.core.captureReviewAnchor({kind:'document'}),body:'Pending original comment '+client.id}});}
  await held(s.owner,s.input(),async(scope,sources,check)=>{for(const row of sources){row.source.save();await row.source.flush();check();}scope.check();});
  const saved=clients.map(({id,core})=>({id,document:core.documentJson(),checkpoint:core.checkpointJson(),review:core.reviewHistoryPolicy()==='segmented-v1'?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()})),basis=await s.retain();await s.cold(basis);
  for(const row of resources)assert.throws(()=>row.source.check(),'An old port cannot adopt a cold replacement with matching writer metadata');
  await held(s.owner,s.input(),async(scope,sources,check)=>{for(const row of sources){const client=scope.clients.find(client=>client.id===row.id),prior=saved.find(client=>client.id===row.id);assert.notEqual(client.core,clients.find(client=>client.id===row.id).core);assert.equal(row.source.core,client.core);assert.equal(client.core.checkpointJson(),prior.checkpoint);assert.equal(client.core.reviewHistoryPolicy()==='segmented-v1'?client.core.reviewSegmentedCheckpoint():client.core.reviewCheckpoint(),prior.review);row.source.save();await row.source.flush();check();}});
  for(const client of s.owner.clients){const prior=saved.find(row=>row.id===client.id);assert.equal(client.core.undo(),true);assert.equal(client.core.redo(),true);assert.equal(client.core.documentJson(),prior.document);assert.equal(client.core.undoReview().kind,'committed');assert.equal(client.core.redoReview().kind,'committed');}
  assert.equal((await s.read()).kind,'pending','Actual local offline suffixes must not be promoted to server ACKs');
  await s.owner.close();
 }finally{await s.close();}
});
test('actual selected owner drains every bound source adapter on successful AND failed visitor exits',async()=>{
 for(const generationKind of ['relay','retained']){const s=await generationSelectedSession(fixtures,'delivery-source-scope-drain-'+generationKind,{documentSegmented:true,reviewSegmented:true,generationKind});let staleScope,staleSource;
 try{assert.equal(api.createSelectedNativeRelayDelivery,undefined);assert.equal(api.createNativeRelayDelivery,undefined);
  const before=s.owner.clients.map(({core})=>[core.checkpointJson(),core.reviewHistoryPolicy()==='segmented-v1'?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()]);
  for(const mode of ['returned','thrown']){const adapters=[],contexts=[],pending=[],late=[],families=new Set(),failure=Error('Visitor deliberately failed after actual adapters started');
   const task=held(s.owner,s.input(),async(scope,sources,check)=>{staleScope=scope;staleSource=sources[0].source;assert.throws(()=>createSelectedNativeRelayDelivery({...scope},staleSource,'comment'),error=>error.code==='native_delivery_closed');assert.throws(()=>createSelectedNativeRelayDelivery(scope,{...staleSource},'comment'),error=>error.code==='native_delivery_source');
    for(const row of sources){const source=row.source,parent=source.parent,session=parent.kind==='generation'?parent.source.session:parent.session,context=createSelectedNativeRelayDelivery(scope,source,'read_only');contexts.push(context);assert.throws(()=>source.core.select(null),error=>error.code==='native_recovery_busy');
     const named=parent.kind==='independent-delivery'?'independent':parent.kind==='generation'&&parent.source.kind!=='local'?'generation':null;if(!named)continue;families.add(named==='generation'?parent.source.kind:parent.kind);const binding=session.relayProgress().binding,entered=[];
     const token=()=>{let resolve,started;const promise=new Promise(done=>{resolve=done;}),ready=new Promise(done=>{started=done;});late.push(resolve);entered.push(ready);return()=>{started();return promise;};},common={autoConnect:true,requestTimeoutMs:5000},documentFactory=named==='independent'?api.createSharedIndependentRelaySync:api.createSharedSegmentedRelaySync,reviewFactory=named==='independent'?api.createSharedIndependentReviewRelaySync:api.createSharedSegmentedReviewRelaySync;
     // Keep the fixture's actual stored endpoint/binding. No token or author
     // credential is sent, and no endpoint is rewritten into a serving grant.
     const doc=documentFactory(session,withNativeRelayDelivery({...common,identity:{...binding.document,credential:'a'.repeat(64)},getToken:token()},context)),review=reviewFactory(session,withNativeRelayDelivery({...common,identity:{...binding.review,credential:'b'.repeat(64)},getToken:token()},context));adapters.push(doc,review);for(const adapter of [doc,review]){const work=adapter.connect();void work.catch(()=>{});pending.push(work);}await Promise.all(entered);check();
    }
    assert.ok(families.has(generationKind));assert.ok(families.has('independent-delivery'));if(mode==='thrown')throw failure;
   });
   if(mode==='thrown')await assert.rejects(task,error=>error===failure);else await task;
   for(const adapter of adapters)assert.equal(adapter.state().status,'closed');for(const context of contexts)assert.throws(()=>context.check(),error=>error.code==='native_delivery_closed');for(const resolve of late)resolve('c'.repeat(64));await Promise.allSettled(pending);const released=reserveNativeRecovery(s.owner.clients.map(client=>client.core));released.check();released.close();
   assert.deepEqual(s.owner.clients.map(({core})=>[core.checkpointJson(),core.reviewHistoryPolicy()==='segmented-v1'?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()]),before);
  }
  assert.throws(()=>createSelectedNativeRelayDelivery(staleScope,staleSource,'comment'));await s.owner.close();
 }finally{await s.close();}}
});
