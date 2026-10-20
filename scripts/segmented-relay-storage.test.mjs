/** Actual native owners and explicit family boundaries; synthetic storage is not browser crash certification. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IDBFactory,IDBDatabase} from 'fake-indexeddb';
import {SharedSegmentedRelaySession,SharedSegmentedPersistentSession,createSharedSegmentedRelaySync,createSharedSegmentedReviewRelaySync} from '../packages/breditor-collaboration/dist/index.js';
import {openSegmentedDatabase} from '../packages/breditor-collaboration/dist/persistence/segmented_database.js';
const globals=new Map(['indexedDB','navigator'].map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)])),held=new Set();
const locks={request(name,_options,callback){return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};
let wasm,counter=0,abortName,lostAckName;const originalTransaction=IDBDatabase.prototype.transaction;
before(async()=>{
 Object.defineProperty(globalThis,'indexedDB',{value:new IDBFactory(),configurable:true});Object.defineProperty(globalThis,'navigator',{value:{locks},configurable:true});
 wasm=await import('../target/promoted-shared-web/breditor_shared.js');await wasm.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});
 IDBDatabase.prototype.transaction=function(...args){const tx=originalTransaction.apply(this,args);if(this.name===abortName&&args[1]==='readwrite')queueMicrotask(()=>{try{tx.abort();}catch{}});if(this.name===lostAckName&&args[1]==='readwrite'){lostAckName=undefined;Object.defineProperty(tx,'oncomplete',{configurable:true,set(){tx.addEventListener('complete',event=>tx.onabort?.(event));}});}return tx;};
});
after(()=>{IDBDatabase.prototype.transaction=originalTransaction;for(const[k,v]of globals){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}assert.equal(held.size,0);});
async function setup(t,{writer='101'}={}){
 const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/generation-relay-storage',version:1},extensions:[]})),d=JSON.parse(profile.descriptor_json());
 const document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:d.schema,schemaFingerprint:d.schemaFingerprint,root:{kind:'element',type:'breditor/document',entityId:null,properties:{'breditor/document-id':'room'},children:[{kind:'element',type:'breditor/paragraph',entityId:null,properties:{'breditor/block-id':'p'},children:[{kind:'text',text:'seed',formats:[]}]}]}}),endpoint='ws://127.0.0.1:49999/ws';
 const options={database:'relay-generation-contract-'+counter++,room:'room',writer,richLanguage:3,history:'explicit',rangeEditing:'general-v1',selectionEditing:'document-v1',searchHistory:'search-v1',reviewedHistory:null,readOnly:false,initialGenerations:{root:'root',active:'one'},review:{actor:'alice-review',principal:'alice',access:'comment'},binding:{document:{endpoint,principal:'alice',room:'room',writer,writerTransport:'atomic-v2'},review:{endpoint,principal:'alice',room:'room',actor:'alice-review',binding:'b'.repeat(64),documentWriter:writer,writerTransport:'atomic-v2'}},create:()=>profile.create(document,writer),restoreSegmented:s=>profile.restore_segmented('room',s),onError:()=>{}};
 const h={profile,document,options,session:await SharedSegmentedRelaySession.open(options),db:await openSegmentedDatabase(options.database),key:['room',writer]};
 t.after(async()=>{abortName=undefined;lostAckName=undefined;await h.session.discardAndClose();h.db.close();profile.free();});return h;
}
function read(h){return new Promise((resolve,reject)=>{const tx=h.db.transaction('generation_heads','readonly'),q=tx.objectStore('generation_heads').get(h.key);let value;q.onsuccess=()=>{value=q.result;};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error);});}
function put(h,value){return new Promise((resolve,reject)=>{const tx=h.db.transaction('generation_heads','readwrite');tx.objectStore('generation_heads').put(value,h.key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
const insert=(c,text)=>c.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
function discussion(c){c.dispatchReview({kind:'create_thread',data:{anchorJson:c.captureReviewAnchor({kind:'document'}),body:'Retained discussion'}});}

test('new atomic outer head preserves the original native source while the old local factory refuses the new family',async t=>{
 const h=await setup(t);insert(h.session.core,'native ');discussion(h.session.core);await h.session.sealGeneration('two');const recovery=h.session.exportRecovery(),head=JSON.parse(await read(h));
 assert.equal(head.format,'breditor/shared-relay-generation-head');assert.equal(head.source.format,'breditor/shared-generation-head');assert.equal(head.source.sealed.length,1);assert.equal(head.source.review.checkpoint,recovery.source.reviewCheckpoint);assert.deepEqual(head.relay,recovery.relay);
 await h.session.close();let called=false;const {binding,...local}=h.options;
 await assert.rejects(SharedSegmentedPersistentSession.open({...local,restoreSegmented:()=>{called=true;throw Error('no fallback');}}));assert.equal(called,false);
 h.session=await SharedSegmentedRelaySession.open(h.options);assert.deepEqual(h.session.exportRecovery(),recovery);
});
test('an existing local generation head is not silently upgraded into relay custody',async t=>{
 const h=await setup(t);await h.session.close();const {binding,...options}=h.options,database='old-local-generation-'+counter++,local=await SharedSegmentedPersistentSession.open({...options,database});await local.close();const db=await openSegmentedDatabase(database);t.after(()=>db.close());
 let called=false;await assert.rejects(SharedSegmentedRelaySession.open({...h.options,database,restoreSegmented:()=>{called=true;throw Error('no upgrade');}}));assert.equal(called,false);
 const request=db.transaction('generation_heads','readonly').objectStore('generation_heads').get(h.key),value=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});assert.equal(JSON.parse(value).format,'breditor/shared-generation-head');
 h.session=await SharedSegmentedRelaySession.open(h.options);
});
test('nonsecret bindings refuse credentials, stale principals and unknown policies before touching retained data',async t=>{
 const h=await setup(t),before=await read(h);await h.session.close();
 for(const binding of [{...h.options.binding,document:{...h.options.binding.document,credential:'never portable'}},{...h.options.binding,review:{...h.options.binding.review,credential:'not portable either'}},{...h.options.binding,document:{...h.options.binding.document,principal:'bob'}},{...h.options.binding,document:{...h.options.binding.document,writerTransport:undefined},review:{...h.options.binding.review,writerTransport:undefined}}]){
  await assert.rejects(SharedSegmentedRelaySession.open({...h.options,binding}));assert.equal(await read(h),before);assert.equal(held.size,0);
 }
 h.session=await SharedSegmentedRelaySession.open(h.options);
});
test('native receipt and ahead-of-source forgeries refuse cold adoption, free the owner once and never repair the head',async t=>{
 const h=await setup(t);insert(h.session.core,'receipt source ');await h.session.flush();const original=await read(h),own=h.session.core.writerClockV2(h.options.writer),g=JSON.parse(h.session.core.writerGroupsV2('0').groups[0]);await h.session.close();
 for(const kind of ['ahead','different-effect']){
  const head=JSON.parse(original);head.relay.document=kind==='ahead'?{accepted:{writer:h.options.writer,through:'999999',prefixDigest:'sha256:'+'0'.repeat(64)},receipt:null}:{accepted:own,receipt:{sequence:'1',receipt:{writer:h.options.writer,from:g.from,through:g.through,groupDigest:'sha256:'+'0'.repeat(64),prefixDigest:own.prefixDigest}}};const changed=JSON.stringify(head);await put(h,changed);let frees=0;
  await assert.rejects(SharedSegmentedRelaySession.open({...h.options,restoreSegmented:s=>{const raw=h.profile.restore_segmented('room',s),free=raw.free.bind(raw);raw.free=()=>{frees++;return free();};return raw;}}));
  assert.equal(frees,1);assert.equal(held.size,0);assert.equal(await read(h),changed);
 }
 await put(h,original);h.session=await SharedSegmentedRelaySession.open(h.options);
});
test('failed metadata persistence keeps acknowledged progress separate from exact pending native recovery',async t=>{
 const h=await setup(t);discussion(h.session.core);await h.session.flush();const before=await read(h),progress=h.session.relayProgress(),next={cursor:null,accepted:h.session.core.localReviewClock(),sequence:null};abortName=h.options.database;
 await assert.rejects(h.session.persistReviewRelayProgress(next));assert.equal(await read(h),before);assert.deepEqual(h.session.relayProgress(),progress);assert.deepEqual(h.session.exportRecovery().relay.review,next);
 await assert.rejects(h.session.close());await assert.rejects(SharedSegmentedRelaySession.open({...h.options,database:'held-'+counter++}),/already active/);
 abortName=undefined;await h.session.retry();assert.deepEqual(h.session.relayProgress().review,next);const exact=h.session.exportRecovery();await h.session.close();h.session=await SharedSegmentedRelaySession.open(h.options);assert.deepEqual(h.session.exportRecovery(),exact);
});
test('recovery import requires an absent destination, current policies and host reacquisition; no old DTO fallback',async t=>{
 const h=await setup(t);insert(h.session.core,'recovery ');discussion(h.session.core);await h.session.sealGeneration('two');const recovery=h.session.exportRecovery();await h.session.close();const database='relay-recovered-'+counter++;
 await assert.rejects(SharedSegmentedRelaySession.restoreRecovery({...h.options,database,recovery,writerRecovery:'not-fenced'}));
 h.session=await SharedSegmentedRelaySession.restoreRecovery({...h.options,database,recovery,writerRecovery:'host-reacquired',readOnly:true,review:{...h.options.review,access:'read_only'}});assert.equal(h.session.recovered,true);assert.deepEqual(h.session.exportRecovery(),recovery);assert.equal(h.session.core.view().readOnly,true);assert.throws(()=>insert(h.session.core,'forbidden'));await h.session.close();
 let called=false;await assert.rejects(SharedSegmentedRelaySession.restoreRecovery({...h.options,database,recovery,writerRecovery:'host-reacquired',restoreSegmented:()=>{called=true;throw Error('never overwrite');}}));assert.equal(called,false);
 await assert.rejects(SharedSegmentedPersistentSession.restoreRecovery({...h.options,database:'old-recovery-'+counter++,recovery,writerRecovery:'host-reacquired'}));
 h.session=await SharedSegmentedRelaySession.open({...h.options,database});assert.deepEqual(h.session.exportRecovery(),recovery);
});
test('a lost commit acknowledgement retains the exact relay cut ahead of newer native work',async t=>{
 const h=await setup(t);discussion(h.session.core);await h.session.flush();const prior=h.session.relayProgress(),next={cursor:null,accepted:h.session.core.localReviewClock(),sequence:null};lostAckName=h.options.database;
 await assert.rejects(h.session.persistReviewRelayProgress(next));const committed=await read(h);assert.deepEqual(JSON.parse(committed).relay.review,next);assert.deepEqual(h.session.relayProgress(),prior);
 abortName=h.options.database;discussion(h.session.core);await assert.rejects(h.session.flush());assert.equal(await read(h),committed);const pending=h.session.exportRecovery();abortName=undefined;await h.session.retry();assert.deepEqual(h.session.exportRecovery(),pending);assert.deepEqual(h.session.relayProgress().review,next);
 await h.session.close();h.session=await SharedSegmentedRelaySession.open(h.options);assert.deepEqual(h.session.exportRecovery(),pending);
});
test('actual adapter custody refuses DTOs and mismatched identities, and synchronous close stops both borrowed transports',async t=>{
 const h=await setup(t),doc={...h.options.binding.document,credential:'a'.repeat(64)},review={...h.options.binding.review,credential:'c'.repeat(64)},common={getToken:()=> 'host token',autoConnect:false};
 for(const fake of [{core:h.session.core},Object.create(SharedSegmentedRelaySession.prototype),{}])assert.throws(()=>createSharedSegmentedRelaySync(fake,{...common,identity:doc}));
 assert.throws(()=>createSharedSegmentedRelaySync(h.session,{...common,identity:{...doc,principal:'bob'}}));assert.throws(()=>createSharedSegmentedRelaySync(h.session,{...common,identity:doc,persistLocal:async()=>{}}));
 const d=createSharedSegmentedRelaySync(h.session,{...common,identity:doc}),r=createSharedSegmentedReviewRelaySync(h.session,{...common,identity:review});assert.equal(d.state().serverThrough,null);assert.equal(r.state().serverThrough,null);
 const closing=h.session.close();assert.equal(d.state().status,'closed');assert.equal(r.state().status,'closed');assert.throws(()=>createSharedSegmentedRelaySync(h.session,{...common,identity:doc}));await closing;
 h.session=await SharedSegmentedRelaySession.open(h.options);
});
test('storage version change immediately stops transport, retains readable recovery and holds both writers until discard',async t=>{
 const h=await setup(t),identity={...h.options.binding.document,credential:'a'.repeat(64)},sync=createSharedSegmentedRelaySync(h.session,{identity,getToken:()=> 'token',autoConnect:false}),before=h.session.exportRecovery();h.db.close();
 const request=indexedDB.open(h.options.database,2);request.onupgradeneeded=()=>{};await new Promise((resolve,reject)=>{request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
 assert.equal(sync.state().status,'closed');assert.equal(h.session.state().status,'failed');assert.deepEqual(h.session.exportRecovery(),before);await assert.rejects(h.session.close());await assert.rejects(SharedSegmentedRelaySession.open({...h.options,database:'still-held-'+counter++}),/already active/);
});
test('Promise-returning factories and lifecycle methods reject forged receivers without releasing a real source',async t=>{
 const h=await setup(t),before=h.session.exportRecovery(),count=held.size;
 const calls=[()=>SharedSegmentedRelaySession.open.call({},h.options),()=>SharedSegmentedRelaySession.restoreRecovery.call({},{...h.options,recovery:before,writerRecovery:'host-reacquired'}),...['flush','retry','sealGeneration','close','discardAndClose','persistReviewRelayProgress'].map(name=>()=>SharedSegmentedRelaySession.prototype[name].call({},'next'))];
 for(const call of calls){let promise;assert.doesNotThrow(()=>{promise=call();});assert.ok(promise instanceof Promise);await assert.rejects(promise);}assert.equal(held.size,count);assert.deepEqual(h.session.exportRecovery(),before);
});
test('native identifiers beyond JS safe integers remain exact through relay heads and cold generation replay',async t=>{
 const h=await setup(t,{writer:'18446744073709551614'});insert(h.session.core,'large native writer 🙂 ');await h.session.sealGeneration('two');const before=h.session.exportRecovery();await h.session.close();h.session=await SharedSegmentedRelaySession.open(h.options);assert.deepEqual(h.session.exportRecovery(),before);assert.equal(h.session.relayProgress().binding.document.writer,h.options.writer);
});
test('a review acknowledgement sequence cannot contradict or replace its retained exact native receipt',async t=>{
 const h=await setup(t);discussion(h.session.core);await h.session.flush();const original=await read(h),accepted=h.session.core.localReviewClock(),receipt=h.session.core.retainedReviewReceipt(h.session.core.exportReviewThrough('0',accepted.through),{...h.options.review,access:'read_only'});await h.session.close();
 const head=JSON.parse(original);head.relay.review={cursor:null,accepted,sequence:'7'};head.relay.reviewReceipt={sequence:'6',receipt};const changed=JSON.stringify(head);await put(h,changed);let called=false;
 await assert.rejects(SharedSegmentedRelaySession.open({...h.options,restoreSegmented:()=>{called=true;throw Error('Metadata must refuse before native adoption');}}));assert.equal(called,false);assert.equal(await read(h),changed);assert.equal(held.size,0);
 await put(h,original);h.session=await SharedSegmentedRelaySession.open(h.options);
});
test('successful final close reports the last acknowledged relay cut even when saving and close overlap',async t=>{
 const h=await setup(t);discussion(h.session.core);await h.session.flush();const next={cursor:null,accepted:h.session.core.localReviewClock(),sequence:null};
 const saving=h.session.persistReviewRelayProgress(next),closing=h.session.close();assert.equal(h.session.close(),closing);await Promise.all([saving,closing]);assert.equal(h.session.state().status,'closed');assert.deepEqual(h.session.relayProgress().review,next);
 h.session=await SharedSegmentedRelaySession.open(h.options);assert.deepEqual(h.session.relayProgress().review,next);
});
