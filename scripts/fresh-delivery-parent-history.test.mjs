/** New fresh parent paths, not legacy handoff or current-source-only reads. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshDeliveryFixture,freshDeliveryFamilies,freshDeliveryReserve} from './fixtures/original-operational-read/fresh_delivery_session.mjs';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {change} from './fixtures/independent-delivery-recovery/storage.mjs';
const seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));let profile,sequence=0;
before(async()=>{const native=await import('../target/promoted-shared-web/breditor_shared.js');await native.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
for(const family of freshDeliveryFamilies)test(`fresh ${family} parent read works after the old grant and cancellation end`,async()=>{
 const f=await freshDeliveryFixture({profile,seed,tag:'fresh-delivery-parent-'+sequence++,family});let read;
 try{f.endOldJob({abort:true});const before=await snapshotReadDatabases(),calls=f.oldCalls;read=freshDeliveryReserve[family](f.owner,f.readOptions,()=>{});await read.prepare();const metadata=read.metadata();assert.equal(metadata.family,family);assert.equal(metadata.kind,'ready');assert.ok(metadata.references.length);assert.equal('source'in read,false);assert.equal('parts'in read,false);assert.equal('core'in read,false);await read.verify();read.check();read.checkCurrent();assert.equal(f.oldCalls,calls);assert.deepEqual(await snapshotReadDatabases(),before);read.close();await assert.rejects(f.owner.progress());}
 finally{read?.close();await f.close();}
});
for(const family of freshDeliveryFamilies)test(`fresh ${family} permission, reentry, factory failure and cancellation release read custody`,async()=>{
 const f=await freshDeliveryFixture({profile,seed,tag:'fresh-delivery-lifetime-'+sequence++,family});let read,allowed=true,reenter=false;const grant=()=>{if(!allowed)throw Error('Read grant ended');if(reenter)read.check();};
 try{const before=JSON.stringify(f.owner.readableSource()),stored=await snapshotReadDatabases();allowed=false;read=freshDeliveryReserve[family](f.owner,f.readOptions,grant);await assert.rejects(read.prepare());read.close();allowed=true;read=freshDeliveryReserve[family](f.owner,f.readOptions,grant);await read.prepare();reenter=true;assert.throws(()=>read.check());await assert.rejects(read.verify());reenter=false;allowed=false;assert.throws(()=>read.check());await assert.rejects(read.verify());read.checkCurrent();allowed=true;await read.verify();const metadata=read.metadata();read.close();assert.equal(read.metadata(),metadata);assert.throws(()=>read.checkCurrent());
  for(const guard of[async()=>{},()=>42]){read=freshDeliveryReserve[family](f.owner,f.readOptions,guard);await assert.rejects(read.prepare());read.close();}const abort=new AbortController();read=freshDeliveryReserve[family](f.owner,f.readOptions,()=>{},abort.signal);await read.prepare();abort.abort();assert.throws(()=>read.checkCurrent());read.close();
  const copied={...f.readOptions.session,documentHistory:{...f.readOptions.session.documentHistory}},key=copied.documentHistory.kind==='original'?'restoreOriginal':'restoreSegmented',restore=copied.documentHistory[key];copied.documentHistory[key]=()=>{throw Error('Late selected native factory failed');};read=freshDeliveryReserve[family](f.owner,{session:copied},()=>{});await assert.rejects(read.prepare());read.close();copied.documentHistory[key]=restore;
  read=freshDeliveryReserve[family](f.owner,f.readOptions,()=>{});await read.prepare();await read.verify();read.close();await f.owner.check();assert.equal(JSON.stringify(f.owner.readableSource()),before);assert.deepEqual(await snapshotReadDatabases(),stored);
 }finally{allowed=true;reenter=false;read?.close();await f.close();}
});
async function actualTarget(f,what){
 const name=f.family==='independent-local'?(what==='file'?f.options.recovery.database:f.options.database):f.family==='independent-delivery'?f.options.recovery.database:f.family==='restored-graph'?f.options.database:f.options.cohort.parentDatabase;
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name);q.onupgradeneeded=()=>q.transaction.abort();q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});
 try{for(const store of db.objectStoreNames){const rows=await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),s=tx.objectStore(store),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>resolve(keys.result.map((key,i)=>({key,value:values.result[i]})));tx.onabort=()=>reject(tx.error);});for(const row of rows)if(what==='file'?row.value instanceof Blob:row.value&&typeof row.value==='object'&&typeof row.value.format==='string'&&('phase'in row.value||'source'in row.value&&'uploads'in row.value))return{name,store,...row};}throw Error('No actual '+what+' in '+name);}
 finally{db.close();}
}
for(const family of freshDeliveryFamilies)test(`fresh ${family} verifies actual parent markers and protected bytes, not cached readiness`,async()=>{
 const f=await freshDeliveryFixture({profile,seed,tag:'fresh-delivery-bytes-'+sequence++,family});let read,changed;
 try{const stored=await snapshotReadDatabases();read=freshDeliveryReserve[family](f.owner,f.readOptions,()=>{});await read.prepare();for(const what of['phase','file']){const row=await actualTarget(f,what);changed=row;await change(row.name,row.store,s=>s.put(what==='file'?new Blob(['changed protected parent bytes']):'phase'in row.value?{...row.value,phase:row.value.phase==='ready'?'preparing':'prepared'}:{...row.value,source:'started'},row.key));read.checkCurrent();await assert.rejects(read.verify());await change(row.name,row.store,s=>s.put(row.value,row.key));changed=undefined;await read.verify();}read.close();await f.owner.check();assert.deepEqual(await snapshotReadDatabases(),stored);}
 finally{if(changed)await change(changed.name,changed.store,s=>s.put(changed.value,changed.key));read?.close();await f.close();}
});
for(const family of freshDeliveryFamilies)test(`fresh ${family} preserves both native history lanes before handoff`,async()=>{
 const f=await freshDeliveryFixture({profile,seed,tag:'fresh-delivery-future-'+sequence++,family});let read;
 try{const before=JSON.stringify(f.owner.readableSource());f.endOldJob();read=freshDeliveryReserve[family](f.owner,f.readOptions,()=>{});await read.prepare();await read.verify();read.close();f.restoreOldGrant();assert.equal(JSON.stringify(f.owner.readableSource()),before);const parts=await f.take(),core=parts.source.session.core,document=core.documentJson();assert.equal(core.undo(),true);assert.equal(core.redo(),true);assert.equal(core.documentJson(),document);assert.equal(core.undoReview().kind,'committed');assert.equal(core.redoReview().kind,'committed');await parts.source.session.flush();}
 finally{read?.close();await f.close();}
});
test('fresh family reads reject owner lookalikes, wrong family tags, getters and child selectors before grant callbacks',async()=>{
 const f=await freshDeliveryFixture({profile,seed,tag:'fresh-delivery-policy-'+sequence++,family:'independent-local'});let calls=0,read;
 try{for(const family of freshDeliveryFamilies)for(const fake of[{},Object.create(Object.getPrototypeOf(f.owner))]){if(family==='independent-local'&&fake===f.owner)continue;assert.throws(()=>freshDeliveryReserve[family](fake,f.readOptions,()=>{calls++;}));}for(const family of freshDeliveryFamilies.filter(v=>v!=='independent-local'))assert.throws(()=>freshDeliveryReserve[family](f.owner,f.readOptions,()=>{calls++;}));
  for(const key of['source','versions','suggestions','revisions'])assert.throws(()=>freshDeliveryReserve['independent-local'](f.owner,{...f.readOptions,[key]:{}},()=>{calls++;}));for(const key of['session','limits']){const o={...f.readOptions};Object.defineProperty(o,key,{enumerable:true,get(){calls++;throw Error('Getter');}});assert.throws(()=>freshDeliveryReserve['independent-local'](f.owner,o,()=>{calls++;}));}const session={...f.readOptions.session};Object.defineProperty(session,'review',{enumerable:true,get(){calls++;throw Error('Nested getter');}});assert.throws(()=>freshDeliveryReserve['independent-local'](f.owner,{session},()=>{calls++;}));assert.equal(calls,0);read=freshDeliveryReserve['independent-local'](f.owner,f.readOptions,()=>{});await read.prepare();read.close();await f.owner.check();
 }finally{read?.close();await f.close();}
});
