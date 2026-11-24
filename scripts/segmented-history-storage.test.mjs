/** Fault injection around actual native owners; synthetic IDB/locks, not crash-durability certification. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {IDBFactory,IDBDatabase,IDBObjectStore} from 'fake-indexeddb';
import {SharedSegmentedPersistentSession,SharedRichEditor} from '../packages/breditor-collaboration/dist/index.js';
import {openSegmentedDatabase,readSegmentedCut} from '../packages/breditor-collaboration/dist/persistence/segmented_database.js';
import {makeGenerationCut} from '../packages/breditor-collaboration/dist/persistence/segmented_head.js';
import {openSessionDatabase,writeCheckpoint,readCheckpoint} from '../packages/breditor-collaboration/dist/persistence/session_database.js';
const key=['room','101'],host={held:new Set(),request(name,_options,work){return Promise.resolve().then(async()=>{if(host.held.has(name))return work(null);host.held.add(name);try{return await work({name});}finally{host.held.delete(name);}});}};
const globals=new Map(['indexedDB','navigator'].map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
let wasm,fault='none',counter=0;const originalTransaction=IDBDatabase.prototype.transaction,originalPut=IDBObjectStore.prototype.put;
before(async()=>{
 Object.defineProperty(globalThis,'indexedDB',{value:new IDBFactory(),configurable:true});Object.defineProperty(globalThis,'navigator',{value:{locks:host},configurable:true});
 wasm=await import('../target/promoted-shared-web/breditor_shared.js');await wasm.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});
 IDBDatabase.prototype.transaction=function(...args){const tx=originalTransaction.apply(this,args);if(args[1]==='readwrite'&&Array.isArray(args[0])&&args[0].includes('generation_heads')){
  if(fault==='abort')queueMicrotask(()=>{try{tx.abort();}catch{}});
  if(fault==='lost-ack'){fault='none';Object.defineProperty(tx,'oncomplete',{configurable:true,set(){tx.addEventListener('complete',event=>{tx.onabort?.(event);});}});}
 }return tx;};
 IDBObjectStore.prototype.put=function(...args){
  const request=originalPut.apply(this,args);
  if(fault==='abort-staged-head'&&this.name==='generation_heads'){
   fault='none';request.addEventListener('success',()=>this.transaction.abort(),{once:true});
  }
  return request;
 };
});
after(()=>{IDBDatabase.prototype.transaction=originalTransaction;IDBObjectStore.prototype.put=originalPut;for(const[n,v]of globals){if(v)Object.defineProperty(globalThis,n,v);else delete globalThis[n];}assert.equal(host.held.size,0);});
async function setup(t,{paired=true}={}){
 const p=wasm.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/generation-faults',version:1},extensions:[]})),d=JSON.parse(p.descriptor_json());
 const doc=JSON.stringify({format:'breditor/document',formatVersion:2,schema:d.schema,schemaFingerprint:d.schemaFingerprint,root:{kind:'element',type:'breditor/document',entityId:null,properties:{'breditor/document-id':'room'},children:[{kind:'element',type:'breditor/paragraph',entityId:null,properties:{'breditor/block-id':'p'},children:[{kind:'text',text:'seed',formats:[]}]}]}});
 const options={database:'generation-fault-'+counter++,room:'room',writer:'101',richLanguage:3,history:'explicit',rangeEditing:'original',selectionEditing:'original',searchHistory:null,reviewedHistory:null,readOnly:false,initialGenerations:{root:'root',active:'one'},...(paired?{review:{actor:'alice-comments',principal:'alice',access:'comment'}}:{}),create:()=>p.create(doc,'101'),restoreSegmented:s=>p.restore_segmented('room',s),onError:()=>{}};
 const session=await SharedSegmentedPersistentSession.open(options),db=await openSegmentedDatabase(options.database),h={p,doc,options,session,db};
 t.after(async()=>{fault='none';await h.session.discardAndClose();db.close();p.free();});return h;
}
function insert(core,text){core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});}
function get(db,store,key){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).get(key);let v;r.onsuccess=()=>{v=r.result;};tx.oncomplete=()=>resolve(v);tx.onabort=()=>reject(tx.error);});}
function put(db,store,key,value){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}

test('V1 and continued V2 hash only persisted immutable files and still check active parent links',async t=>{
 const h=await setup(t,{paired:false});
 await h.session.close();
 const raw=h.p.create(h.doc,key[1]),digest=SubtleCrypto.prototype.digest;
 const observe=action=>{const observed=raw.observe();try{return action(observed);}finally{observed.free();}};
 const add=text=>observe(observed=>raw.dispatch(observed,JSON.stringify({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]})));
 const identity={room:key[0],writer:key[1],richLanguage:3,history:'explicit',rangeEditing:'original',selectionEditing:'original',searchHistory:null,reviewedHistory:null};
 const sha=json=>createHash('sha256').update(json).digest('hex');
 const digested=[];
 const decoder=new TextDecoder();
 SubtleCrypto.prototype.digest=function(algorithm,input){digested.push(decoder.decode(input));return digest.call(this,algorithm,input);};
 try{
  observe(observed=>raw.enable_segmented_history(observed,'root','one'));
  assert.equal(add('sealed edit '),true);
  observe(observed=>raw.seal_history_segment(observed,'two'));
  assert.equal(add('active edit '),true);
  for(const version of [1,2]){
   if(version===2){observe(observed=>raw.continue_history(observed,'three'));assert.equal(add('continued edit '),true);}
   const checkpoint=version===1?raw.segmented_checkpoint():raw.continued_history_checkpoint(),archive=JSON.parse(checkpoint);
   const files=[{generation:archive.rootGeneration,sha256:sha(archive.rootCheckpoint),kind:'root',json:archive.rootCheckpoint},
    ...archive.sealed.map(json=>({generation:JSON.parse(json).generation,sha256:sha(json),kind:'sealed',json}))];
   const [root,...sealed]=files.map(({generation,sha256})=>({generation,sha256}));
   const head=JSON.stringify({format:'breditor/shared-generation-head',formatVersion:version,identity,family:archive.family,root,sealed,
    active:archive.active,review:null,versions:[],...(version===2?{continuedAfter:archive.continuedAfter}:{})});
   digested.length=0;
   assert.deepEqual(await makeGenerationCut(checkpoint,identity,null,[],version),{head,files});
   assert.equal(digested.length,files.length,'Only files retained in the head should be hashed');
   assert.deepEqual(digested,files.map(file=>file.json));
   for(const [field,value] of [['parentGeneration','wrong-parent'],['parentSha256','0'.repeat(64)]]){
    const active=JSON.stringify({...JSON.parse(archive.active),[field]:value});
    await assert.rejects(makeGenerationCut(JSON.stringify({...archive,active}),identity,null,[],version),error=>error.code==='segmented_checkpoint');
   }
  }
 }finally{SubtleCrypto.prototype.digest=digest;raw.free();}
});

test('aborted save and close retain exact durable pair, readable offline work and both leases',async t=>{
 const h=await setup(t),before=await readSegmentedCut(h.db,key);fault='abort';insert(h.session.core,'offline ');await assert.rejects(h.session.flush());await assert.rejects(h.session.close());
 assert.equal((await readSegmentedCut(h.db,key)).head,before.head);const recovery=h.session.exportRecovery();assert.ok(recovery.checkpoint.includes('offline'));assert.equal(typeof recovery.reviewCheckpoint,'string');
 await assert.rejects(SharedSegmentedPersistentSession.open({...h.options,database:'blocked-'+counter++}),/already active/);
 await assert.rejects(SharedSegmentedPersistentSession.open({...h.options,writer:'202',database:'blocked-review-'+counter++}),/comment writer is already active/);
 fault='none';await h.session.retry();await h.session.close();h.session=await SharedSegmentedPersistentSession.open(h.options);assert.equal(h.session.core.checkpointJson(),recovery.checkpoint);assert.equal(h.session.core.reviewCheckpoint(),recovery.reviewCheckpoint);
});
test('lost commit acknowledgement is reconciled before a newer pending capture',async t=>{
 const h=await setup(t);fault='lost-ack';insert(h.session.core,'first ');await assert.rejects(h.session.flush());const committed=await readSegmentedCut(h.db,key);assert.equal(committed.checkpoint,h.session.core.checkpointJson());
 fault='abort';insert(h.session.core,'newer ');await assert.rejects(h.session.flush());assert.equal((await readSegmentedCut(h.db,key)).head,committed.head);
 const exact=h.session.exportRecovery();fault='none';await h.session.retry();assert.equal((await readSegmentedCut(h.db,key)).checkpoint,exact.checkpoint);await h.session.close();h.session=await SharedSegmentedPersistentSession.open(h.options);assert.equal(h.session.core.checkpointJson(),exact.checkpoint);
});
test('generation seals roll back staged immutable files and reconcile a committed seal before newer history',async t=>{
 const h=await setup(t),core=h.session.core,original=core.documentJson();
 insert(core,'first ');const edited=core.documentJson();
 const anchor=core.captureReviewAnchor({kind:'selection',selection:{kind:'node',block:'p'}});
 assert.equal(core.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Retain this discussion'}}).kind,'committed');
 h.session.saveVersion('Before the first seal','1792450000000');
 await h.session.flush();
 const before=await readSegmentedCut(h.db,key),oneKey=[...key,'one'],twoKey=[...key,'two'];
 fault='abort-staged-head';
 await assert.rejects(h.session.sealGeneration('two'),/Generation write aborted|AbortError/);
 assert.equal(fault,'none','the new head must have been staged before aborting');
 assert.deepEqual(await readSegmentedCut(h.db,key),before);
 assert.equal(await get(h.db,'generation_files',oneKey),undefined);
 assert.equal(core.segmentedHistoryInfo().activeGeneration,'two');
 const firstSeal=h.session.exportRecovery();
 await h.session.retry();
 const recoveredSeal=await readSegmentedCut(h.db,key),one=await get(h.db,'generation_files',oneKey);
 assert.equal(recoveredSeal.checkpoint,firstSeal.checkpoint);
 assert.equal(one,JSON.stringify(recoveredSeal.files.find(file=>file.generation==='one')));
 assert.ok(one);

 assert.equal(core.undo(),true);
 assert.equal(core.documentJson(),original);
 await h.session.flush();
 fault='lost-ack';
 await assert.rejects(h.session.sealGeneration('three'),/Generation write aborted|AbortError/);
 const committed=await readSegmentedCut(h.db,key),two=await get(h.db,'generation_files',twoKey);
 assert.equal(core.segmentedHistoryInfo().activeGeneration,'three');
 assert.equal(committed.checkpoint,core.checkpointJson());
 assert.equal(two,JSON.stringify(committed.files.find(file=>file.generation==='two')));
 assert.ok(two);

 fault='abort';
 assert.equal(core.redo(),true);
 assert.equal(core.documentJson(),edited);
 await assert.rejects(h.session.flush());
 assert.deepEqual(await readSegmentedCut(h.db,key),committed);
 fault='none';
 const current=h.session.exportRecovery();
 await h.session.retry();
 const latest=await readSegmentedCut(h.db,key);
 assert.notEqual(latest.head,committed.head);
 assert.equal(latest.checkpoint,current.checkpoint);
 assert.equal(await get(h.db,'generation_files',oneKey),one);
 assert.equal(await get(h.db,'generation_files',twoKey),two);
 assert.deepEqual(current.versions,firstSeal.versions);
 assert.equal(current.reviewCheckpoint,firstSeal.reviewCheckpoint);
 await h.session.close();h.session=await SharedSegmentedPersistentSession.open(h.options);
 assert.deepEqual(h.session.exportRecovery(),current);
 assert.equal(h.session.core.undo(),true);
 assert.equal(h.session.core.documentJson(),original);
});
test('changed immutable file refuses without repair, and exact exported histories recover into a new absent destination',async t=>{
 const h=await setup(t);insert(h.session.core,'retained ');await h.session.sealGeneration('two');const before=await readSegmentedCut(h.db,key),fileKey=[...key,before.files[0].generation],original=await get(h.db,'generation_files',fileKey),file=JSON.parse(original);file.json+=' ';const changed=JSON.stringify(file);await put(h.db,'generation_files',fileKey,changed);
 insert(h.session.core,'unsaved ');await assert.rejects(h.session.flush(),/Immutable generation/);assert.equal(await get(h.db,'generation_files',fileKey),changed);const recovery=h.session.exportRecovery();await h.session.discardAndClose();
 let called=false;await assert.rejects(SharedSegmentedPersistentSession.open({...h.options,restoreSegmented:()=>{called=true;throw Error('not native');}}));assert.equal(called,false);assert.equal(await get(h.db,'generation_files',fileKey),changed);
 const {create,initialGenerations,...options}=h.options,database='recovered-'+counter++;
 await assert.rejects(SharedSegmentedPersistentSession.restoreRecovery({...options,database,recovery,writerRecovery:'not-fenced'}),/reacquire/);
 h.session=await SharedSegmentedPersistentSession.restoreRecovery({...options,database,recovery,writerRecovery:'host-reacquired'});assert.equal(h.session.recovered,true);assert.deepEqual(h.session.exportRecovery(),recovery);await h.session.close();
 called=false;await assert.rejects(SharedSegmentedPersistentSession.restoreRecovery({...options,database,recovery,writerRecovery:'host-reacquired',restoreSegmented:()=>{called=true;throw Error('no overwrite');}}),/cannot overwrite/);assert.equal(called,false);
 h.session=await SharedSegmentedPersistentSession.open({...h.options,database});assert.equal(h.session.core.checkpointJson(),recovery.checkpoint);
});
test('an existing old-format database is never upgraded, cleared or used as a fresh generation destination',async t=>{
 const h=await setup(t);await h.session.close();const name='old-schema-'+counter++,db=await openSessionDatabase(name);t.after(()=>db.close());await writeCheckpoint(db,key,'original retained bytes');let called=false;
 await assert.rejects(SharedSegmentedPersistentSession.open({...h.options,database:name,create:()=>{called=true;throw Error('no migration');}}),/Unknown generation schema/);assert.equal(called,false);assert.equal(await readCheckpoint(db,key),'original retained bytes');h.session=await SharedSegmentedPersistentSession.open(h.options);
});
test('version change retires editing and preserves readable paired recovery rather than releasing a live writer',async t=>{
 const h=await setup(t);insert(h.session.core,'before version change ');await h.session.flush();const recovery=h.session.exportRecovery();const request=indexedDB.open(h.options.database,2);request.onupgradeneeded=()=>{};h.db.close();
 await new Promise((resolve,reject)=>{request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
 assert.equal(h.session.state().status,'failed');assert.throws(()=>insert(h.session.core,'forbidden'),/retired/);assert.deepEqual(h.session.exportRecovery(),recovery);await assert.rejects(h.session.close(),/database changed/);await assert.rejects(SharedSegmentedPersistentSession.open({...h.options,database:'held-after-version-change-'+counter++}),/already active/);
});
test('real more-than-1000 native journal entries keep saved Redo across durable generation boundaries and cold replay',{timeout:600000},async t=>{
 const h=await setup(t,{paired:false});insert(h.session.core,'X');h.session.core.undo();
 for(let i=0;i<500;i++){assert.equal(h.session.core.redo(),true);assert.equal(h.session.core.undo(),true);if(i===249)await h.session.sealGeneration('two');}
 await h.session.flush();const before=h.session.exportRecovery(),info=h.session.core.segmentedHistoryInfo();assert.equal(info.retainedEntries,1002);assert.equal(info.activeEntries,500);assert.equal(info.redoItems,1);
 await h.session.close();h.session=await SharedSegmentedPersistentSession.open(h.options);assert.deepEqual(h.session.exportRecovery(),before);assert.equal(h.session.core.redo(),true);await h.session.flush();
});
test('a changed valid-looking head is a conflict, not permission to overwrite the durable generation',async t=>{
 const h=await setup(t);const before=await get(h.db,'generation_heads',key),head=JSON.parse(before),active=JSON.parse(head.active);active.generation='another-active';head.active=JSON.stringify(active);const changed=JSON.stringify(head);await put(h.db,'generation_heads',key,changed);
 insert(h.session.core,'unsaved fork ');await assert.rejects(h.session.flush(),/head changed/);assert.equal(await get(h.db,'generation_heads',key),changed);assert.ok(h.session.exportRecovery().checkpoint.includes('unsaved fork'));
});
test('the original 32-version ceiling and retirement refuse before changing the local catalog',async t=>{
 const h=await setup(t);for(let i=0;i<32;i++)h.session.saveVersion('version '+i,String(1792450000000+i));await h.session.flush();const before=h.session.exportRecovery();assert.equal(before.versions.length,32);
 assert.throws(()=>h.session.saveVersion('overflow','1792450000100'),/budget is full/);assert.deepEqual(h.session.exportRecovery(),before);assert.equal((await readSegmentedCut(h.db,key)).record.versions.length,32);
 const durable=await readSegmentedCut(h.db,key);fault='abort';insert(h.session.core,'last edit ');await assert.rejects(h.session.close());
 const readable=h.session.exportRecovery();assert.throws(()=>h.session.retainVersion(before.versions[0]),error=>error?.code==='retired');
 assert.deepEqual(h.session.exportRecovery(),readable);assert.deepEqual(readable.versions,before.versions);assert.equal((await readSegmentedCut(h.db,key)).head,durable.head);
});
test('partial or future native capability sets never enable segmentation or break original editing',async t=>{
 const h=await setup(t,{paired:false});
 for(const name of ['segmented_history_enabled','segmented_history_info_json','enable_segmented_history','seal_history_segment','segmented_checkpoint','verify_segmented_recovery_origin','segmented_history_version']){
  const raw=h.p.create(h.doc,'303');raw[name]=undefined;const core=new SharedRichEditor(raw);try{const before=core.checkpointJson();assert.equal(core.supportsSegmentedHistory(),false);assert.throws(()=>core.enableSegmentedHistory('old','active'),e=>e.code==='segmented_history_unavailable');assert.equal(core.checkpointJson(),before);insert(core,'original works ');assert.ok(core.documentJson().includes('original works'));}finally{core.dispose();}
 }
 const raw=h.p.create(h.doc,'303');raw.segmented_history_version=()=> '2';const core=new SharedRichEditor(raw);try{assert.equal(core.supportsSegmentedHistory(),false);assert.throws(()=>core.enableSegmentedHistory('old','active'));}finally{core.dispose();}
});
test('actual paired native continuity keeps the original review lane and rejects an equal-text generation fork',async t=>{
 const h=await setup(t),root=JSON.parse(h.session.core.checkpointJson()).rootCheckpoint,review=h.session.core.reviewCheckpoint(),origin=new SharedRichEditor(h.p.restore('room',root)),missing=new SharedRichEditor(h.p.restore('room',root));
 origin.enableReview(h.options.review,review);let fork;
 try{
  h.session.core.verifySegmentedRecoveryOrigin(origin);assert.throws(()=>origin.verifyRecoveryOrigin(h.session.core),e=>e.code==='recovery_origin_unavailable');
  const anchor=h.session.core.captureReviewAnchor({kind:'selection',selection:{kind:'node',block:'p'}});h.session.core.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Current comment'}});insert(h.session.core,'native suffix ');
  const saved=h.session.exportRecovery();fork=new SharedRichEditor(h.p.restore_segmented('room',saved.checkpoint),{segmentedHistory:'segmented-v1'});fork.enableReview(h.options.review,saved.reviewCheckpoint);fork.sealHistoryGeneration('other-two');await h.session.sealGeneration('two');
  assert.equal(h.session.core.documentJson(),fork.documentJson());h.session.core.verifySegmentedRecoveryOrigin(origin);const before=h.session.exportRecovery();
  assert.throws(()=>h.session.core.verifySegmentedRecoveryOrigin(missing),e=>/review lane differs/.test(String(e)));assert.throws(()=>h.session.core.verifySegmentedRecoveryOrigin(fork));assert.deepEqual(h.session.exportRecovery(),before);
 }finally{origin.dispose();missing.dispose();fork?.dispose();}
});
test('Promise-returning generation factories and lifecycle guards reject asynchronously without touching a real source',async t=>{
 const h=await setup(t),before=h.session.exportRecovery(),held=host.held.size;
 const calls=[()=>SharedSegmentedPersistentSession.open.call({},h.options),()=>SharedSegmentedPersistentSession.restoreRecovery.call({},{...h.options,recovery:before,writerRecovery:'host-reacquired'}),...['flush','retry','sealGeneration','close','discardAndClose'].map(name=>()=>SharedSegmentedPersistentSession.prototype[name].call({},'next'))];
 for(const call of calls){let promise;assert.doesNotThrow(()=>{promise=call();});assert.ok(promise instanceof Promise);await assert.rejects(promise);}
 assert.deepEqual(h.session.exportRecovery(),before);assert.equal(host.held.size,held);
});
test('refused initial policy and facade adoption free each unpublished native owner exactly once and release both leases',async t=>{
 const h=await setup(t),recovery=h.session.exportRecovery();await h.session.close();const before=await readSegmentedCut(h.db,key);
 for(const recoveryImport of [false,true])for(const mode of ['missing-policy','future-policy','native-policy-refusal','facade-refusal']){
  let frees=0;
  const options={...h.options,...(mode==='facade-refusal'?{editor:{maxPendingFrames:0}}:{}),restoreSegmented(input){
   const raw=h.p.restore_segmented('room',input),free=raw.free.bind(raw);raw.free=()=>{frees++;return free();};
   if(mode==='missing-policy')raw.initialize_read_only=undefined;
   if(mode==='future-policy')raw.initial_read_only_version=()=> '2';
   if(mode==='native-policy-refusal')raw.initialize_read_only(false);
   return raw;
  }};
  await assert.rejects(recoveryImport?SharedSegmentedPersistentSession.restoreRecovery({...options,database:'refused-owner-'+counter++,recovery,writerRecovery:'host-reacquired'}):SharedSegmentedPersistentSession.open(options));
  assert.equal(frees,1,`${recoveryImport?'import':'open'} ${mode}`);assert.equal(host.held.size,0);assert.equal((await readSegmentedCut(h.db,key)).head,before.head);
 }
 h.session=await SharedSegmentedPersistentSession.open(h.options);assert.deepEqual(h.session.exportRecovery(),recovery);
});
