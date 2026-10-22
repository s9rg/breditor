/** Actual upload leases inside cohort phase laws. Native ownership has separate genuine regressions. */
import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {RichAssetStore,RichAssetStoreCustody} from '@breditor/experimental-rich-content';
import {holdOperationalAssets} from '../packages/breditor-collaboration/dist/operation_cohort/assets.js';
import {prepareOperationalCohort} from '../packages/breditor-collaboration/dist/operation_cohort/cohort.js';
import {pixel,pixelAsset,ReviewFixtureImage} from './fixtures/review-assets/pixels.mjs';
import {assetLockHost} from './fixtures/asset-custody/locks.mjs';
let saved,host;
beforeEach(()=>{saved=new Map();host=assetLockHost();for(const[name,value]of Object.entries({indexedDB:new IDBFactory(),navigator:{locks:host.locks},Image:ReviewFixtureImage})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true});}});
afterEach(async()=>{await new Promise(resolve=>setImmediate(resolve));assert.equal(host.held.size,0);assert.equal(host.queues.size,0);for(const[name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];});
const denied=error=>error.code==='asset_custody_busy',blob=()=>new Blob([pixel],{type:'image/png'});
async function stores(){const a=await RichAssetStore.open('a'),b=await RichAssetStore.open('b');for(const store of [a,b]){await store.ingest(blob());await store.cancel(pixelAsset);}return[a,b];}
function group(stores,hooks={}){const state={busy:true,released:false,consumed:false};return{state,states:[state],assetStores:stores,async verify(){await hooks.verify?.();},markReleased(){state.released=true;},checkBindings(){hooks.bindings?.();},checkCurrent(){assert.ok(state.busy&&state.released&&!state.consumed);hooks.current?.();},disposeAuxiliaries(){hooks.dispose?.();},checkManaged(){hooks.managed?.();},consume(){state.consumed=true;},abandon(){state.busy=false;}};}
const prepare=(groups,take=async()=>{},verify=()=>{})=>prepareOperationalCohort(groups,async released=>{await take();released();return groups;},verify,()=>{},()=>Error('Closed'));
test('all selected whole stores remain read-accessible and write-excluded until synchronous release',async()=>{
 const selected=await stores(),foreign=await Promise.all(['a','b'].map(name=>RichAssetStore.openRetained(name)));let held;
 try{held=await holdOperationalAssets(selected);for(const store of [...selected,...foreign]){assert.equal((await store.get(pixelAsset)).status,'cancelled');await assert.rejects(store.retry(pixelAsset),denied);}held.check();held.release();await Promise.all(selected.map(store=>store.retry(pixelAsset)));for(const store of selected)assert.equal((await store.get(pixelAsset)).status,'pending');await held.close();}
 finally{await held?.close();for(const store of [...selected,...foreign])store.close();}
});
test('a later busy store releases every earlier actual acquisition before refusing',async()=>{
 const selected=await stores(),foreign=await RichAssetStore.openRetained('b');let prior;
 try{prior=await foreign.acquireRecoveryCustody();await assert.rejects(holdOperationalAssets(selected),denied);await selected[0].retry(pixelAsset);assert.equal((await selected[0].get(pixelAsset)).status,'pending');prior.check();}
 finally{await prior?.close();for(const store of [...selected,foreign])store.close();}
});
test('an in-flight foreign provider prevents a whole cohort without settling its queue',async()=>{
 const selected=await stores(),foreign=await RichAssetStore.openRetained('b');let finish,started,flushing;
 const gate=new Promise(resolve=>finish=resolve),entered=new Promise(resolve=>started=resolve);
 try{await foreign.retry(pixelAsset);flushing=foreign.flush(async()=>{started();await gate;return'late-receipt';});await entered;const g=group(selected);await assert.rejects(prepare([g]),denied);assert.equal(g.state.consumed,false);assert.equal(g.state.busy,false);await selected[0].retry(pixelAsset);await foreign.cancel(pixelAsset);finish();await flushing;assert.equal((await foreign.get(pixelAsset)).status,'cancelled');}
 finally{finish();await flushing;for(const store of [...selected,foreign])store.close();}
});
test('all cohort stores are excluded before the first asynchronous verification callback',async()=>{
 const selected=await stores(),foreign=await RichAssetStore.openRetained('b');let cap;
 try{const a=group([selected[0]],{async verify(){await assert.rejects(foreign.retry(pixelAsset),denied);}}),b=group([selected[1]]);cap=await prepare([a,b]);cap.commit();assert.ok(a.state.consumed&&b.state.consumed);await selected[1].retry(pixelAsset);}
 finally{cap?.abandon();for(const store of [...selected,foreign])store.close();}
});
test('verification refusal releases stores and reservations without consuming any child',async()=>{
 const selected=await stores(),a=group([selected[0]]),b=group([selected[1]],{verify(){throw Error('refused');}});
 try{await assert.rejects(prepare([a,b]),/refused/);assert.ok([a,b].every(g=>!g.state.busy&&!g.state.consumed));await Promise.all(selected.map(store=>store.retry(pixelAsset)));}
 finally{for(const store of selected)store.close();}
});
test('an asynchronous take failure releases actual stores and consumes no owner',async()=>{
 const selected=await stores(),a=group(selected);
 try{await assert.rejects(prepare([a],async()=>{throw Error('release failed');}),/release failed/);assert.equal(a.state.consumed,false);assert.equal(a.state.busy,false);await selected[0].retry(pixelAsset);}
 finally{for(const store of selected)store.close();}
});
test('late policy refusal after auxiliary destruction releases all stores but no children',async()=>{
 const selected=await stores();let allowed=true,cap;
 const a=group([selected[0]],{current(){if(!allowed)throw Error('revoked');}}),b=group([selected[1]],{dispose(){allowed=false;}});
 try{cap=await prepare([a,b]);assert.throws(()=>cap.commit(),/revoked/);assert.ok([a,b].every(g=>!g.state.consumed&&!g.state.busy));await selected[0].retry(pixelAsset);await selected[1].retry(pixelAsset);}
 finally{cap?.abandon();for(const store of selected)store.close();}
});
test('actual versionchange of a later store refuses the entire prepared cohort',async()=>{
 const selected=await stores(),a=group([selected[0]]),b=group([selected[1]]);let cap,db;
 try{cap=await prepare([a,b]);db=await new Promise((resolve,reject)=>{const r=indexedDB.open('b',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});assert.throws(()=>cap.commit());assert.ok([a,b].every(g=>!g.state.consumed&&!g.state.busy));await selected[0].retry(pixelAsset);}
 finally{cap?.abandon();db?.close();for(const store of selected)store.close();}
});
test('abandonment is single-use and the same returned stores can reacquire immediately',async()=>{
 const selected=await stores(),a=group(selected);let cap,next;
 try{cap=await prepare([a]);cap.abandon();cap.abandon();assert.throws(()=>cap.commit());assert.equal(a.state.consumed,false);next=await holdOperationalAssets(selected);next.check();await next.close();await selected[0].retry(pixelAsset);}
 finally{cap?.abandon();await next?.close();for(const store of selected)store.close();}
});
test('duplicate, fake, oversized and closed selections cannot manufacture store custody',async()=>{
 const selected=await stores();
 try{for(const value of [[selected[0],selected[0]],[{}],Array(2049).fill(selected[0])])await assert.rejects(holdOperationalAssets(value));selected[1].close();await assert.rejects(holdOperationalAssets(selected));await selected[0].retry(pixelAsset);}
 finally{for(const store of selected)store.close();}
});
test('two distinct handles to one database are refused without deduplicating the requested owners',async()=>{
 const selected=await stores(),foreign=await RichAssetStore.openRetained('a');
 try{await assert.rejects(holdOperationalAssets([selected[0],foreign]),denied);await selected[0].retry(pixelAsset);await foreign.cancel(pixelAsset);}
 finally{for(const store of [...selected,foreign])store.close();}
});
test('cohort lease checks release and cleanup use canonical methods rather than public facades',async()=>{
 const selected=await stores(),names=['check','release','close'],before=new Map(names.map(name=>[name,RichAssetStoreCustody.prototype[name]]));let held,calls=0;
 try{held=await holdOperationalAssets(selected);for(const name of names)RichAssetStoreCustody.prototype[name]=()=>{calls++;throw Error('mutable facade');};held.check();held.release();await held.close();assert.equal(calls,0);await selected[0].retry(pixelAsset);}
 finally{for(const[name,value]of before)RichAssetStoreCustody.prototype[name]=value;await held?.close();for(const store of selected)store.close();}
});
test('legacy no-lock writes remain available but cannot issue whole-handoff custody',async()=>{
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});const store=await RichAssetStore.open('legacy');
 try{await store.ingest(blob());await assert.rejects(holdOperationalAssets([store]),error=>error.code==='asset_custody_policy');await store.cancel(pixelAsset);assert.equal((await store.get(pixelAsset)).status,'cancelled');}
 finally{store.close();}
});
