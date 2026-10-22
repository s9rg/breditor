/** Actual Rust histories through bounded write-ahead cuts. Synthetic IDB/locks are not OS durability. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {IDBObjectStore,IDBDatabase,IDBFactory} from 'fake-indexeddb';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {IndependentOperationCutJournal,operationJournalBinding} from '../packages/breditor-collaboration/dist/independent_operation/cut_journal.js';
import {openJournaledIndependentDelivery,readJournaledSourceData} from '../packages/breditor-collaboration/dist/independent_operation/open_journaled_source.js';
import {prepareIndependentDeliveryRecovery,snapshotIndependentDeliveryRecovery} from '../packages/breditor-collaboration/dist/independent_delivery_recovery/prepare.js';
import {IndependentDeliveryCompanion} from '../packages/breditor-collaboration/dist/independent_delivery/companion.js';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {deliveryParticipantSession} from './fixtures/independent-delivery-participant/session.mjs';
import {attachDelivery,pendingDelivery,deliveryDraft} from './fixtures/independent-delivery/session.mjs';
import {recoveryOptions} from './fixtures/independent-delivery-recovery/session.mjs';
import {databaseValues,recoveryFaults,change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {pixel,secondPixel,secondAsset} from './fixtures/review-assets/pixels.mjs';
const runtime=process.env.BREDITOR_OPERATION_JOURNAL_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname,seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8'));
let profile,sequence=0;
before(async()=>{const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
const bytes=async blob=>Buffer.from(await blob.arrayBuffer());
const pair=(source,segmented)=>[source.core.checkpointJson(),segmented?source.core.reviewSegmentedCheckpoint():source.core.reviewCheckpoint()];
function observeWrites(databases){const original=new Map(['add','put','delete'].map(name=>[name,IDBObjectStore.prototype[name]]));let writes=0;for(const[name,method]of original)IDBObjectStore.prototype[name]=function(...args){if(databases.includes(this.transaction.db.name))writes++;return method.apply(this,args);};return{get writes(){return writes;},restore(){for(const[name,method]of original)IDBObjectStore.prototype[name]=method;}};}
async function fixture({documentSegmented=true,reviewSegmented=true,keepOriginal=false}={}){
 const restore=environment(),tag='operation-journal-'+sequence++,selected=deliveryParticipantSession(api,profile,seed,{language:3,documentSegmented,reviewSegmented,retained:'all',database:tag+'-original'}),journals=[],prepared=[],sources=[];let original,uploads,backup,allowed=true;
 try{
  original=await selected.open();insertCleanupText(original.core,'Retained native Undo ');insertCleanupText(original.core,'Retained native Redo ');assert.equal(original.core.undo(),true);
  const thread=original.core.dispatchReview({kind:'create_thread',data:{anchorJson:original.core.captureReviewAnchor({kind:'document'}),body:'Retained comment'}}).event;original.core.dispatchReview({kind:'reply',data:{thread,body:'Retained comment Redo'}});assert.equal(original.core.undoReview().kind,'committed');
  const parts=await attachDelivery(api,original,selected.options),ids=await pendingDelivery(original,parts);await original.retainVersion(original.core.captureVersion('Retained local version','alice','5'));
  if(documentSegmented)await original.sealDocumentGeneration('two');if(reviewSegmented)await original.sealReviewGeneration('two');await original.flush();const baseline=original.exportRecovery();
  uploads=await rich.RichAssetStore.open(tag+'-assets');await uploads.ingest(new Blob([pixel],{type:'image/png'}));await uploads.ingest(new Blob([secondPixel],{type:'image/png'}));await uploads.cancel(secondAsset);
  const captured=await api.captureSharedIndependentDeliveryParticipant({participant:tag,principal:'alice',source:{session:original},assets:uploads,checkAuthority(){}});assert.equal(captured.kind,'ready');backup=captured.backup;
  const recovery=recoveryOptions(selected.options,backup,tag+'-recovery',{checkAuthority(){if(!allowed)throw Error('revoked');}}),database=tag+'-journal',sourceDatabase=tag+'-source',options={...selected.options,database:sourceDatabase};
  if(!keepOriginal)await original.close();
  const makeJournal=async(resume=false,suffix='')=>{const p=await prepareIndependentDeliveryRecovery(snapshotIndependentDeliveryRecovery(recovery,false),backup.file());prepared.push(p);const j=await IndependentOperationCutJournal[resume?'resume':'begin']({database:database+suffix,sourceDatabase:sourceDatabase+suffix,prepared:p,writerRecovery:'host-reacquired'});journals.push(j);return j;};
  const open=async journal=>{const source=await openJournaledIndependentDelivery(options,journal);sources.push(source);return source;};
  return{tag,selected,original,baseline,backup,uploads,thread,ids,database,sourceDatabase,options,documentSegmented,reviewSegmented,makeJournal,open,setAllowed(value){allowed=value;},async close(){allowed=true;for(const source of sources.toReversed())await source.discardAndClose();for(const journal of journals.toReversed())await journal.close();for(const p of prepared)p.backup.dispose();await original.discardAndClose();backup.dispose();uploads.close();restore();}};
 }catch(error){allowed=true;for(const source of sources.toReversed())await source.discardAndClose();for(const journal of journals.toReversed())await journal.close();for(const p of prepared)p.backup.dispose();await original?.discardAndClose();backup?.dispose();uploads?.close();restore();throw error;}
}
test('private construction, one real source owner, closed old exports and old source schemas',async()=>{
 for(const name of ['IndependentOperationCutJournal','openJournaledIndependentDelivery','withOperationCutJournal'])assert.equal(name in api,false);assert.throws(()=>Reflect.construct(IndependentOperationCutJournal,[]));
 const f=await fixture({keepOriginal:true});let spy;
 try{const journal=await f.makeJournal();await assert.rejects(f.open(journal));assert.equal((await journal.snapshot()).record.current,null);await f.original.close();const source=await f.open(journal);assert.deepEqual(readJournaledSourceData(source,journal),f.baseline);assert.throws(()=>source.exportRecovery(),e=>e.code==='independent_operation_export_required');assert.throws(()=>api.captureSharedIndependentDeliverySource({session:source}),e=>e.code==='independent_operation_export_required');await assert.rejects(api.captureSharedIndependentDeliveryParticipant({participant:'not-an-operation-backup',principal:'alice',source:{session:source},assets:f.uploads,checkAuthority(){}}),e=>e.name==='RichAssetBackupError'&&e.code==='asset_backup_source');await assert.rejects(f.open(journal),e=>e.code==='independent_operation_in_use');await assert.rejects(journal.close(),e=>e.code==='independent_operation_in_use');await source.close();
  const before=await databaseValues(f.sourceDatabase);spy=observeWrites([f.sourceDatabase]);await assert.rejects(api.SharedIndependentDeliverySession.open(f.options));assert.equal(spy.writes,0);assert.deepEqual(await databaseValues(f.sourceDatabase),before);spy.restore();spy=undefined;
  const cold=await f.makeJournal(true),reopened=await f.open(cold);assert.deepEqual(readJournaledSourceData(reopened,cold),f.baseline);await reopened.close();
 }finally{spy?.restore();await f.close();}
});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test(`cold continuation keeps native future history and new offline packets document=${documentSegmented} review=${reviewSegmented}`,async()=>{
 const f=await fixture({documentSegmented,reviewSegmented});let peer,reference;
 try{let journal=await f.makeJournal(),source=await f.open(journal);assert.deepEqual(readJournaledSourceData(source,journal),f.baseline);
  peer=new api.SharedRichEditor(profile.join_frame('room','202',source.core.updateFrame()));peer.enableReview({actor:'peer-comments',principal:'bob',access:'comment'});peer.receiveReview(source.core.exportReview(),f.selected.review);insertCleanupText(peer,'Preserved offline peer ');await source.core.receiveFrame(peer.updateFrame());peer.dispatchReview({kind:'reply',data:{thread:f.thread,body:'Preserved offline peer comment'}});source.core.receiveReview(peer.exportReview(),{actor:'peer-comments',principal:'bob',access:'comment'});
  const parts=await attachDelivery(api,source,f.selected.options),proposal=parts.queue.propose('New offline packet','7',deliveryDraft('New pending text '));await parts.queue.flush();await source.retainVersion(source.core.captureVersion('New local version','alice','8'));await source.flush();const saved=readJournaledSourceData(source,journal),packet=parts.queue.packet(proposal.id);await source.close();
  reference=await api.SharedIndependentDeliverySession.restoreRecovery({...f.options,database:f.tag+'-reference',recovery:saved,writerRecovery:'host-reacquired'});const expected=[];for(const method of ['redo','undo','redo']){assert.equal(reference.core[method](),true);assert.equal(reference.core[method==='redo'?'redoReview':'undoReview']().kind,'committed');expected.push(pair(reference,reviewSegmented));}await reference.close();reference=undefined;
  journal=await f.makeJournal(true);source=await f.open(journal);assert.deepEqual(readJournaledSourceData(source,journal),saved);const restored=await attachDelivery(api,source,f.selected.options);assert.equal(restored.queue.packet(proposal.id),packet);
  for(const[index,method]of ['redo','undo','redo'].entries()){assert.equal(source.core[method](),true);assert.equal(source.core[method==='redo'?'redoReview':'undoReview']().kind,'committed');assert.deepEqual(pair(source,reviewSegmented),expected[index]);assert.match(source.core.documentJson(),/Preserved offline peer/);assert.match(JSON.stringify(source.core.reviewSnapshot().view),/Preserved offline peer comment/);}await source.flush();const after=readJournaledSourceData(source,journal);assert.deepEqual(after.retained,saved.retained);assert.deepEqual(after.source.versions,saved.source.versions);await source.close();journal=await f.makeJournal(true);source=await f.open(journal);assert.deepEqual(readJournaledSourceData(source,journal),after);
 }finally{peer?.dispose();await reference?.discardAndClose();await f.close();}
});
const windows=[['prepare-abort','journal',1,'abort'],['prepare-lost-ack','journal',1,'lost-ack'],['source-abort','source',1,'abort'],['source-lost-ack','source',1,'lost-ack'],['ack-abort','journal',2,'abort'],['ack-lost-ack','journal',2,'lost-ack']];
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])for(const[label,lane,number,kind]of windows)test(`actual save window ${label} document=${documentSegmented} review=${reviewSegmented}`,async()=>{
 const f=await fixture({documentSegmented,reviewSegmented}),faults=recoveryFaults();let spy;
 try{let journal=await f.makeJournal(),source=await f.open(journal);
  // Seal a real new immutable file where available, not merely inline text or an empty generation.
  if(documentSegmented)insertCleanupText(source.core,'Before pending document seal ');else if(reviewSegmented)source.core.dispatchReview({kind:'reply',data:{thread:f.thread,body:'Before pending review seal'}});await source.flush();const before=await journal.snapshot();
  faults.select(lane==='journal'?f.database:f.sourceDatabase,lane==='journal'?'operation_intent':'operation_history_heads',number,kind);
  const edit=documentSegmented?()=>source.sealDocumentGeneration('pending-three'):reviewSegmented?()=>source.sealReviewGeneration('pending-three'):async()=>{insertCleanupText(source.core,'Pending inline native cut ');await source.flush();};await assert.rejects(edit());faults.clear();assert.equal(source.state().status,'failed');const live=readJournaledSourceData(source,journal),pending=await journal.snapshot();
  if(label==='prepare-abort'){assert.deepEqual(pending,before);await source.retry();assert.deepEqual(readJournaledSourceData(source,journal),live);}
  else if(label==='ack-lost-ack'){assert.equal(pending.record.pending,null);spy=observeWrites([f.database,f.sourceDatabase]);await source.retry();assert.equal(spy.writes,0);spy.restore();spy=undefined;assert.deepEqual(readJournaledSourceData(source,journal),live);}
  else{assert.notEqual(pending.pending,null);if(documentSegmented||reviewSegmented)assert.ok(pending.pending.files.length>before.current.files.length);await source.discardAndClose();journal=await f.makeJournal(true);spy=observeWrites(label==='source-lost-ack'||label==='ack-abort'?[f.sourceDatabase]:[]);source=await f.open(journal);assert.equal(spy.writes,0);spy.restore();spy=undefined;assert.deepEqual(readJournaledSourceData(source,journal),live);}
  await source.flush();const committed=await journal.snapshot();assert.equal(committed.pending,null);assert.notDeepEqual(committed.current,before.current);assert.deepEqual((await databaseValues(f.database)).operation_cuts.values.length,1);const original=(await databaseValues(f.database)).operation_original.values[0];assert.deepEqual(await bytes(original),await bytes(f.backup.file()));
  await source.close();journal=await f.makeJournal(true);source=await f.open(journal);assert.deepEqual(readJournaledSourceData(source,journal),live);
 }finally{spy?.restore();faults.restore();await f.close();}
});
test('coalesced explicit stop/forget actions are not resurrected on a cold open',async()=>{
 const f=await fixture();
 try{let journal=await f.makeJournal(),source=await f.open(journal),parts=await attachDelivery(api,source,f.selected.options);parts.queue.stopRetryingPublication(f.ids.proposal.id);parts.queue.stopRetryingDecision(f.ids.proposal.id);parts.queue.forget(f.ids.proposal.id);parts.revisions.stopRetrying(f.ids.revision.id);parts.revisions.forget(f.ids.revision.id);await parts.versions.stopRetryingVersion(f.ids.version.id);await parts.versions.forgetCachedVersion(f.ids.version.id);await parts.queue.flush();await parts.revisions.flush();await source.flush();const expected=readJournaledSourceData(source,journal);assert.equal(expected.retained.suggestions.retained.length,0);assert.equal(expected.retained.revisions.retained.length,0);assert.equal(expected.retained.versions.packets.length,0);assert.deepEqual(expected.source.versions,f.baseline.source.versions);await source.close();journal=await f.makeJournal(true);source=await f.open(journal);assert.deepEqual(readJournaledSourceData(source,journal),expected);parts=await attachDelivery(api,source,f.selected.options);assert.equal(parts.queue.proposals().length,0);assert.equal(parts.revisions.revisions().length,0);assert.deepEqual(parts.versions.exportRecovery().packets,[]);
 }finally{await f.close();}
});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test(`valid native cut with missing queued work refuses before autosave document=${documentSegmented} review=${reviewSegmented}`,async()=>{
 const f=await fixture({documentSegmented,reviewSegmented});let spy;
 try{const journal=await f.makeJournal(),source=await f.open(journal);await source.close();await change(f.sourceDatabase,'operation_history_heads',store=>{const q=store.get(['room','101']);q.onsuccess=()=>{const head=JSON.parse(q.result);assert.ok(head.source.retained.suggestions.retained.length);head.source.retained.suggestions.retained=[];new IndependentDeliveryCompanion(f.options).readHead(JSON.stringify(head.source));store.put(JSON.stringify(head),['room','101']);};});const before=await databaseValues(f.sourceDatabase),cold=await f.makeJournal(true);spy=observeWrites([f.sourceDatabase,f.database]);await assert.rejects(f.open(cold),e=>e.code==='independent_operation_source_diverged');assert.equal(spy.writes,0);assert.deepEqual(await databaseValues(f.sourceDatabase),before);
 }finally{spy?.restore();await f.close();}
});
test('loss of write authority keeps readable unsaved data and the exact durable attempt',async()=>{
 const f=await fixture(),faults=recoveryFaults();
 try{let journal=await f.makeJournal(),source=await f.open(journal);faults.select(f.database,'operation_intent',1,'cancel',()=>f.setAllowed(false));insertCleanupText(source.core,'Readable after revoked authority ');await assert.rejects(source.flush());const live=readJournaledSourceData(source,journal);assert.match(live.source.documentCheckpoint,/Readable after revoked authority/);assert.deepEqual(live.retained,f.baseline.retained);assert.notEqual((await databaseValues(f.database)).operation_intent.values[0].pending,null);await assert.rejects(source.close());await source.discardAndClose();f.setAllowed(true);faults.clear();journal=await f.makeJournal(true);source=await f.open(journal);assert.deepEqual(readJournaledSourceData(source,journal),live);
 }finally{faults.restore();f.setAllowed(true);await f.close();}
});
test('acknowledged cuts stay bounded and the immutable original survives repeated saves',async()=>{
 const f=await fixture();
 try{const journal=await f.makeJournal(),source=await f.open(journal),original=await bytes(f.backup.file());for(let i=0;i<16;i++){insertCleanupText(source.core,'Save '+i+' ');await source.flush();const values=await databaseValues(f.database);assert.equal(values.operation_cuts.values.length,1);assert.equal(values.operation_intent.values[0].pending,null);assert.deepEqual(await bytes(values.operation_original.values[0]),original);}const expected=readJournaledSourceData(source,journal);await source.close();const cold=await f.makeJournal(true),reopened=await f.open(cold);assert.deepEqual(readJournaledSourceData(reopened,cold),expected);
 }finally{await f.close();}
});
for(const[label,lane,number,kind]of windows)test('failed constructor remains exactly resumable: '+label,async()=>{
 const f=await fixture(),faults=recoveryFaults();let spy;
 try{let journal=await f.makeJournal();faults.select(lane==='journal'?f.database:f.sourceDatabase,lane==='journal'?'operation_intent':'operation_history_heads',number,kind);await assert.rejects(f.open(journal));faults.clear();const state=await journal.snapshot();
  if(label==='ack-lost-ack'){assert.equal(state.pending,null);spy=observeWrites([f.database,f.sourceDatabase]);}
  // The failed constructor has relinquished real native author leases, but not the journal.
  const source=await f.open(journal);if(spy){assert.equal(spy.writes,0);spy.restore();spy=undefined;}assert.deepEqual(readJournaledSourceData(source,journal),f.baseline);await source.close();journal=await f.makeJournal(true);const cold=await f.open(journal);assert.deepEqual(readJournaledSourceData(cold,journal),f.baseline);
 }finally{spy?.restore();faults.restore();await f.close();}
});
test('new native and outbox changes cannot replace an older prepared attempt while commit acknowledgement waits',async()=>{
 const f=await fixture(),transaction=IDBDatabase.prototype.transaction,put=IDBObjectStore.prototype.put;let release,arrived,armed=true;const reached=new Promise(resolve=>{arrived=resolve;}),gate=new Promise(resolve=>{release=resolve;}),transitions=[];
 try{const journal=await f.makeJournal(),source=await f.open(journal),parts=await attachDelivery(api,source,f.selected.options);await source.flush();
  IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(armed&&this.name===f.database&&args[1]==='readwrite'&&[...tx.objectStoreNames].includes('operation_intent')){armed=false;Object.defineProperty(tx,'oncomplete',{configurable:true,set(handler){tx.addEventListener('complete',event=>{arrived();void gate.then(()=>handler?.(event));});}});}return tx;};
  IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name===f.database&&this.name==='operation_intent')transitions.push(structuredClone(args[0]));return put.apply(this,args);};
  insertCleanupText(source.core,'First durable attempt ');await reached;const prepared=(await databaseValues(f.database)).operation_intent.values[0];assert.notEqual(prepared.pending,null);
  insertCleanupText(source.core,'Later native change ');const proposal=parts.queue.propose('Later queued change','12',deliveryDraft('Later pending text '));parts.queue.queueDecision(proposal.id,'reject','13');const live=readJournaledSourceData(source,journal);assert.match(live.source.documentCheckpoint,/First durable attempt/);assert.match(live.source.documentCheckpoint,/Later native change/);const packet=parts.queue.packet(proposal.id);
  assert.equal((await databaseValues(f.database)).operation_intent.values[0].pending,prepared.pending);release();await parts.queue.flush();await source.flush();assert.deepEqual(readJournaledSourceData(source,journal),live);
  for(let i=1;i<transitions.length;i++){assert.equal(BigInt(transitions[i].sequence),BigInt(transitions[i-1].sequence)+1n);if(transitions[i-1].pending!==null){assert.equal(transitions[i].current,transitions[i-1].pending);assert.equal(transitions[i].pending,null);}else{assert.equal(transitions[i].current,transitions[i-1].current);assert.notEqual(transitions[i].pending,null);}}assert.ok(transitions.length>=4);assert.equal((await databaseValues(f.database)).operation_cuts.values.length,1);
  IDBDatabase.prototype.transaction=transaction;IDBObjectStore.prototype.put=put;await source.close();const cold=await f.makeJournal(true),restored=await f.open(cold);assert.deepEqual(readJournaledSourceData(restored,cold),live);const queues=await attachDelivery(api,restored,f.selected.options);assert.equal(queues.queue.packet(proposal.id),packet);assert.deepEqual(queues.queue.status(proposal.id).intent,{requested:'reject',queuedAtMs:'13',retry:true});
 }finally{release?.();IDBDatabase.prototype.transaction=transaction;IDBObjectStore.prototype.put=put;await f.close();}
});
for(const kind of ['original','cut','intent'])test('missing or replaced journal '+kind+' refuses without rewriting either store',async()=>{
 const f=await fixture();let spy;
 try{const journal=await f.makeJournal(),source=await f.open(journal);await source.close();const values=await databaseValues(f.database);
  if(kind==='original')await change(f.database,'operation_original',store=>store.put(new Blob(['Different original']),'participant'));
  else if(kind==='cut')await change(f.database,'operation_cuts',store=>store.delete(values.operation_intent.values[0].current));
  else await change(f.database,'operation_intent',store=>store.put({...values.operation_intent.values[0],current:null,pending:null},'state'));
  const beforeJournal=await databaseValues(f.database),beforeSource=await databaseValues(f.sourceDatabase);spy=observeWrites([f.database,f.sourceDatabase]);await assert.rejects(f.makeJournal(true));assert.equal(spy.writes,0);assert.deepEqual(await databaseValues(f.database),beforeJournal);assert.deepEqual(await databaseValues(f.sourceDatabase),beforeSource);
 }finally{spy?.restore();await f.close();}
});
for(const key of ['indexedDB','navigator'])test('opening cannot retarget storage or locks across an asynchronous native factory: '+key,async()=>{
 const f=await fixture(),descriptor=Object.getOwnPropertyDescriptor(globalThis,key),history=f.selected.options.documentHistory,restore=history.restoreSegmented;let freed=0;
 try{history.restoreSegmented=async checkpoint=>{const raw=restore(checkpoint),free=raw.free.bind(raw);raw.free=()=>{freed++;free();};Object.defineProperty(globalThis,key,{value:key==='indexedDB'?new IDBFactory():{locks:{...navigator.locks}},configurable:true});await Promise.resolve();return raw;};await assert.rejects(f.makeJournal(),e=>e.code==='independent_operation_storage_changed');assert.equal(freed,1);Object.defineProperty(globalThis,key,descriptor);history.restoreSegmented=restore;assert.equal((await indexedDB.databases()).some(row=>row.name===f.database),false);const journal=await f.makeJournal(),source=await f.open(journal);assert.deepEqual(readJournaledSourceData(source,journal),f.baseline);
 }finally{Object.defineProperty(globalThis,key,descriptor);history.restoreSegmented=restore;await f.close();}
});
test('a genuine source cannot be claimed by another genuine journal with the same historical identity',async()=>{
 const f=await fixture();let reservation;
 try{const journal=await f.makeJournal(),source=await f.open(journal),other=await f.makeJournal(false,'-other');reservation=operationJournalBinding(other).reserve();assert.throws(()=>reservation.claim(source),e=>e.code==='independent_operation_source');reservation.abandon();assert.equal((await other.snapshot()).current,null);assert.deepEqual(readJournaledSourceData(source,journal),f.baseline);insertCleanupText(source.core,'Still owned by its actual journal ');await source.flush();assert.match(readJournaledSourceData(source,journal).source.documentCheckpoint,/Still owned by its actual journal/);assert.equal((await other.snapshot()).current,null);
 }finally{reservation?.abandon();await f.close();}
});
test('slow progress reads neither fail autosave nor release journal custody before their real completion',async()=>{
 const f=await fixture(),transaction=IDBDatabase.prototype.transaction;let release,arrived,armed=false;const gates=[],reads=[];
 const pause=()=>{let done,reached;const gate=new Promise(resolve=>{done=resolve;}),ready=new Promise(resolve=>{reached=resolve;});gates.push(done);release=done;arrived=reached;armed=true;return{ready,gate};};let waiting;
 try{const journal=await f.makeJournal(),source=await f.open(journal);IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(armed&&this.name===f.database&&args[1]==='readonly'&&[...tx.objectStoreNames].includes('operation_intent')){armed=false;const gate=waiting.gate,notify=arrived;Object.defineProperty(tx,'oncomplete',{configurable:true,set(handler){tx.addEventListener('complete',event=>{notify();void gate.then(()=>handler?.(event));});}});}return tx;};
  waiting=pause();const progress=journal.snapshot();reads.push(progress);await waiting.ready;insertCleanupText(source.core,'Autosave while progress is paused ');await source.flush();assert.equal(source.state().status,'saved');release();await progress;
  waiting=pause();const lastRead=journal.snapshot();reads.push(lastRead);await waiting.ready;let closed=false;const closing=source.close().then(()=>{closed=true;});reads.push(closing);await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,false);await assert.rejects(f.makeJournal(true),e=>e.code==='recovery_in_use');release();await lastRead;await closing;assert.equal(closed,true);
  IDBDatabase.prototype.transaction=transaction;const cold=await f.makeJournal(true),reopened=await f.open(cold);assert.match(readJournaledSourceData(reopened,cold).source.documentCheckpoint,/Autosave while progress is paused/);
 }finally{for(const done of gates)done();IDBDatabase.prototype.transaction=transaction;await Promise.allSettled(reads);await f.close();}
});
