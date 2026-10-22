/** Actual RichAssetStore writes and provider epochs behind a shared/exclusive LockManager fixture. */
import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {RichAssetStore,RichAssetStoreCustody} from '@breditor/experimental-rich-content';
import {pixel,pixelAsset,secondPixel,secondAsset,ReviewFixtureImage} from './fixtures/review-assets/pixels.mjs';
import {assetLockHost} from './fixtures/asset-custody/locks.mjs';
const saved=new Map(['indexedDB','Image','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),blob=value=>new Blob([value],{type:'image/png'}),bytes=async value=>Buffer.from(await value.arrayBuffer());let host;
beforeEach(()=>{host=assetLockHost();for(const[name,value]of Object.entries({indexedDB:new IDBFactory(),Image:ReviewFixtureImage,navigator:{locks:host.locks}}))Object.defineProperty(globalThis,name,{configurable:true,value});});
afterEach(()=>{assert.equal(host.held.size,0);assert.equal(host.queues.size,0);for(const[name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];});
async function two(){const owner=await RichAssetStore.open('target'),other=await RichAssetStore.open('target');await owner.ingest(blob(pixel));await owner.ingest(blob(secondPixel));await owner.cancel(secondAsset);return{owner,other};}
test('only a genuine store issues a lease and constructor/copy admission reads no supplied fake fields',async()=>{
 let calls=0;const fake=new Proxy({}, {get(){calls++;throw Error('not a store');}});assert.throws(()=>Reflect.construct(RichAssetStoreCustody,[fake,fake,fake,fake,fake]));await assert.rejects(RichAssetStore.prototype.acquireRecoveryCustody.call(fake));assert.throws(()=>RichAssetStoreCustody.prototype.check.call(fake));assert.equal(calls,0);
 const owner=await RichAssetStore.open('real');let custody;try{custody=await owner.acquireRecoveryCustody();assert.equal(custody.check(),undefined);await assert.rejects(owner.acquireRecoveryCustody(),error=>error.code==='asset_custody_busy');}finally{await custody?.close();owner.close();}
});
test('retained reads remain available but mutations, upload and close cannot cross held custody',async()=>{
 const {owner,other}=await two();let custody,providers=0;
 try{const before=await bytes(await owner.exportBackup());custody=await owner.acquireRecoveryCustody();assert.deepEqual(await bytes(await owner.exportBackup()),before);assert.equal((await other.get(secondAsset)).status,'cancelled');
  for(const store of [owner,other])for(const run of [()=>store.ingest(blob(pixel)),()=>store.cancel(pixelAsset),()=>store.retry(secondAsset),()=>store.cacheRemote(pixelAsset,blob(pixel),'receipt'),()=>store.flush(async()=>{providers++;return'receipt';})])await assert.rejects(Promise.resolve().then(run),error=>error.code==='asset_custody_busy');
  assert.throws(()=>owner.close(),error=>error.code==='asset_custody_busy');assert.equal(providers,0);assert.deepEqual(await bytes(await other.exportBackup()),before);custody.release();custody.release();await custody.close();assert.throws(()=>custody.check(),error=>error.code==='asset_custody_closed');await other.retry(secondAsset);assert.equal((await owner.get(secondAsset)).status,'pending');
 }finally{await custody?.close();owner.close();other.close();}
});
test('a foreign in-flight ingest refuses custody until its real shared callback has settled',async()=>{
 const {owner,other}=await two();let release,entered,custody,writing;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 class Slow extends ReviewFixtureImage{async decode(){await super.decode();entered();await gate;}}
 try{Object.defineProperty(globalThis,'Image',{value:Slow,configurable:true});writing=other.ingest(blob(pixel));await started;await assert.rejects(owner.acquireRecoveryCustody(),error=>error.code==='asset_custody_busy');release();await writing;custody=await owner.acquireRecoveryCustody();custody.check();}
 finally{release();await writing;await custody?.close();owner.close();other.close();}
});
for(const selected of [true,false])test('Cancel still fences late provider completion while shared upload runs selected='+selected,async()=>{
 const {owner,other}=await two(),uploading=selected?owner:other;let release,entered,flushing,custody;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 try{flushing=uploading.flush(async()=>{entered();await gate;return'late-receipt';});await started;await assert.rejects(owner.acquireRecoveryCustody(),error=>error.code==='asset_custody_busy');await owner.cancel(pixelAsset);assert.equal((await owner.get(pixelAsset)).status,'cancelled');release();await flushing;assert.equal((await owner.get(pixelAsset)).status,'cancelled');custody=await owner.acquireRecoveryCustody();custody.check();}
 finally{release();await flushing;await custody?.close();owner.close();other.close();}
});
test('foreign empty-destination restore does not cross custody or manufacture imported payloads',async()=>{
 const source=await RichAssetStore.open('source'),owner=await RichAssetStore.open('empty');let custody,restored;
 try{await source.ingest(blob(pixel));const original=await source.exportBackup();custody=await owner.acquireRecoveryCustody();await assert.rejects(RichAssetStore.restoreBackup('empty',original,{uploadState:'preserve'}));assert.deepEqual(await owner.list(),[]);await custody.close();restored=await RichAssetStore.restoreBackup('empty',original,{uploadState:'preserve'});assert.equal((await owner.list()).length,1);}
 finally{await custody?.close();source.close();owner.close();restored?.close();}
});
test('whole-store reconciliation excludes an ordinary foreign writer during decoding and admission',async()=>{
 const {owner,other}=await two(),source=await RichAssetStore.open('source');let attempt,pending,arm=true;
 try{await source.ingest(blob(pixel));const original=await source.exportBackup();attempt=await owner.beginReconciliation(original,{database:'reconciliation',checkSource(){if(arm){arm=false;pending=assert.rejects(other.retry(secondAsset),error=>error.code==='asset_custody_busy');}}});await pending;assert.equal((await other.get(secondAsset)).status,'cancelled');await other.retry(secondAsset);assert.equal((await other.get(secondAsset)).status,'pending');}
 finally{await attempt?.close();source.close();owner.close();other.close();}
});
test('custody and reconciliation cannot borrow the same selected or foreign store concurrently',async()=>{
 const {owner,other}=await two();let custody;
 try{const original=await owner.exportBackup();custody=await owner.acquireRecoveryCustody();for(const store of [owner,other])await assert.rejects(store.beginReconciliation(original,{database:'reconciliation-'+(store===owner?'same':'other'),checkSource(){}}),error=>error.code==='asset_reconciliation_busy');custody.check();}
 finally{await custody?.close();owner.close();other.close();}
});
test('a genuine version change retires both the store and its actual lock without deleting retained bytes',async()=>{
 const owner=await RichAssetStore.open('versioned');let custody,upgraded;
 try{await owner.ingest(blob(pixel));custody=await owner.acquireRecoveryCustody();upgraded=await new Promise((resolve,reject)=>{const q=indexedDB.open('versioned',2);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});assert.throws(()=>custody.check(),error=>error.code==='asset_custody_closed');await custody.close();assert.throws(()=>owner.checkOpen());const count=await new Promise((resolve,reject)=>{const tx=upgraded.transaction('assets','readonly'),q=tx.objectStore('assets').count();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});assert.equal(count,1);}
 finally{await custody?.close();upgraded?.close();owner.close();}
});
test('legacy no-lock writes still work but cannot claim exclusive recovery custody',async()=>{
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});const owner=await RichAssetStore.open('no-locks');try{await owner.ingest(blob(pixel));await assert.rejects(owner.acquireRecoveryCustody(),error=>error.code==='asset_custody_policy');await owner.cancel(pixelAsset);assert.equal((await owner.get(pixelAsset)).status,'cancelled');}finally{owner.close();}
});
test('a malformed lock host cannot report a successful mutation or custody without running its callback',async()=>{
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async()=>{}}}});const owner=await RichAssetStore.open('bad-host');try{await assert.rejects(owner.ingest(blob(pixel)),error=>error.code==='asset_custody_policy');await assert.rejects(owner.acquireRecoveryCustody(),error=>error.code==='asset_custody_policy');assert.deepEqual(await owner.list(),[]);}finally{owner.close();}
});
test('distinct stores have independent actual leases and release is idempotent',async()=>{
 const first=await RichAssetStore.open('first'),second=await RichAssetStore.open('second');let a,b;try{a=await first.acquireRecoveryCustody();b=await second.acquireRecoveryCustody();a.check();b.check();a.release();a.release();await a.close();await first.ingest(blob(pixel));b.check();assert.deepEqual(await second.list(),[]);}finally{await a?.close();await b?.close();first.close();second.close();}
});
test('canonical asset-custody cleanup closes the actual lease without a mutable public release facade',async()=>{
 const owner=await RichAssetStore.open('canonical-close'),original=RichAssetStoreCustody.prototype.release;let custody,closing,calls=0;
 try{custody=await owner.acquireRecoveryCustody();RichAssetStoreCustody.prototype.release=()=>{calls++;};closing=custody.close();assert.equal(calls,0,'Close must not call a mutable public release facade');await closing;assert.throws(()=>custody.check(),error=>error.code==='asset_custody_closed');}
 finally{RichAssetStoreCustody.prototype.release=original;await custody?.close();await closing;owner.close();}
});
test('canonical asset-custody cleanup on version change releases the original lease without public dispatch',async()=>{
 const owner=await RichAssetStore.open('canonical-version'),original=RichAssetStoreCustody.prototype.release;let custody,upgraded,calls=0;
 try{await owner.ingest(blob(pixel));custody=await owner.acquireRecoveryCustody();RichAssetStoreCustody.prototype.release=()=>{calls++;};upgraded=await new Promise((resolve,reject)=>{const q=indexedDB.open('canonical-version',2);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});assert.equal(calls,0,'Version-change cleanup must not call a mutable public release facade');assert.throws(()=>custody.check(),error=>error.code==='asset_custody_closed');}
 finally{RichAssetStoreCustody.prototype.release=original;await custody?.close();upgraded?.close();owner.close();}
});
test('canonical asset-custody cleanup lets the returned handle immediately reacquire mutate reconcile and upload',async()=>{
 const owner=await RichAssetStore.open('canonical-recipient');let custody,next,attempt;
 const handoff=async held=>{held.check();held.release();return owner;};
 try{custody=await owner.acquireRecoveryCustody();const returned=await handoff(custody);next=await returned.acquireRecoveryCustody();await handoff(next);await returned.ingest(blob(pixel));custody=await returned.acquireRecoveryCustody();await handoff(custody);const original=await returned.exportBackup();attempt=await returned.beginReconciliation(original,{database:'canonical-recipient-reconcile',checkSource(){}});await attempt.close();attempt=undefined;custody=await returned.acquireRecoveryCustody();await handoff(custody);await returned.flush(async()=>'recipient-receipt');assert.equal((await returned.get(pixelAsset)).storageRef,'recipient-receipt');}
 finally{await attempt?.close();await custody?.close();await next?.close();owner.close();}
});
