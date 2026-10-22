/** Real paired native ancestry before autosave; this does not certify outbox conservation or activation. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {IDBObjectStore} from 'fake-indexeddb';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {IndependentNativeOperationOrigin} from '../packages/breditor-collaboration/dist/independent_operation/native_origin.js';
import {openNativeOriginVerifiedIndependentDelivery,restoreNativeOriginVerifiedIndependentDelivery} from '../packages/breditor-collaboration/dist/independent_operation/open_native_source.js';
import {prepareIndependentDeliveryRecovery,snapshotIndependentDeliveryRecovery} from '../packages/breditor-collaboration/dist/independent_delivery_recovery/prepare.js';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {deliveryParticipantSession} from './fixtures/independent-delivery-participant/session.mjs';
import {attachDelivery,pendingDelivery} from './fixtures/independent-delivery/session.mjs';
import {recoveryOptions} from './fixtures/independent-delivery-recovery/session.mjs';
import {databaseValues,recoveryFaults} from './fixtures/independent-delivery-recovery/storage.mjs';
import {pixel} from './fixtures/review-assets/pixels.mjs';
const runtime=process.env.BREDITOR_INDEPENDENT_ORIGIN_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;
const seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8'));
let profile,sequence=0;
before(async()=>{const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
const pair=(core,segmented)=>[core.checkpointJson(),segmented?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()];
function observeSourceWrites(database){const saved=new Map(['add','put'].map(name=>[name,IDBObjectStore.prototype[name]]));let calls=0;for(const[name,method]of saved)IDBObjectStore.prototype[name]=function(...args){if(this.transaction.db.name===database&&['delivery_history_heads','delivery_history_files'].includes(this.name))calls++;return method.apply(this,args);};return{get calls(){return calls;},restore(){for(const[name,method]of saved)IDBObjectStore.prototype[name]=method;}};}
async function fixture({documentSegmented=true,reviewSegmented=true,versions=true,retained='none'}={}){
 const restore=environment(),tag='independent-native-origin-'+sequence++,selected=deliveryParticipantSession(api,profile,seed,{language:3,documentSegmented,reviewSegmented,retained,database:tag});let source,uploads,backup,prepared,origin;let allowed=true;
 try{
  source=await selected.open();insertCleanupText(source.core,'Native retained Undo ');insertCleanupText(source.core,'Native retained Redo ');assert.equal(source.core.undo(),true);
  const thread=source.core.dispatchReview({kind:'create_thread',data:{anchorJson:source.core.captureReviewAnchor({kind:'document'}),body:'Native retained comment'}}).event;
  source.core.dispatchReview({kind:'reply',data:{thread,body:'Native retained comment Redo'}});assert.equal(source.core.undoReview().kind,'committed');
  const parts=await attachDelivery(api,source,selected.options);if(retained==='all')await pendingDelivery(source,parts);
  if(versions)await source.retainVersion(source.core.captureVersion('Retained local version','alice','8'));
  if(documentSegmented)await source.sealDocumentGeneration('two');if(reviewSegmented)await source.sealReviewGeneration('two');
  uploads=await rich.RichAssetStore.open(tag+'-uploads');await uploads.ingest(new Blob([pixel],{type:'image/png'}));const captured=await api.captureSharedIndependentDeliveryParticipant({participant:tag,principal:'alice',source:{session:source},assets:uploads,checkAuthority(){}});assert.equal(captured.kind,'ready');backup=captured.backup;
  const options=recoveryOptions(selected.options,backup,tag+'-recovery',{checkAuthority(){if(!allowed)throw Error('revoked');}});
  prepared=await prepareIndependentDeliveryRecovery(snapshotIndependentDeliveryRecovery(options,false),backup.file());origin=await IndependentNativeOperationOrigin.read(prepared);
  return{tag,selected,source,origin,prepared,backup,thread,documentSegmented,reviewSegmented,recovery:source.exportRecovery(),setAllowed(value){allowed=value;},async close(){allowed=true;origin.dispose();await source.discardAndClose();prepared.backup.dispose();backup.dispose();uploads.close();restore();}};
 }catch(error){origin?.dispose();await source?.discardAndClose();prepared?.backup.dispose();backup?.dispose();uploads?.close();restore();throw error;}
}
async function fork(f,lane){
 let other,copy;try{
  other=await api.SharedIndependentDeliverySession.open({...f.selected.options,database:f.tag+'-other'});insertCleanupText(other.core,'Different authored branch ');other.core.dispatchReview({kind:'create_thread',data:{anchorJson:other.core.captureReviewAnchor({kind:'document'}),body:'Different comment branch'}});await other.flush();const foreign=other.exportRecovery();await other.close();other=undefined;
  const recovery={...f.recovery,source:{...f.recovery.source,versions:[],...(lane==='document'?{documentCheckpoint:foreign.source.documentCheckpoint}:{reviewCheckpoint:foreign.source.reviewCheckpoint})}};
  copy=await api.SharedIndependentDeliverySession.restoreRecovery({...f.selected.options,database:f.tag+'-fork',recovery,writerRecovery:'host-reacquired'});await copy.close();copy=undefined;return{...f.selected.options,database:f.tag+'-fork'};
 }finally{await copy?.discardAndClose();await other?.discardAndClose();}
}
test('native-origin constructors, public markers and fake guards do not issue the private capability',async()=>{
 for(const name of ['IndependentNativeOperationOrigin','withIndependentNativeOrigin','openNativeOriginVerifiedIndependentDelivery'])assert.equal(name in api,false);
 assert.throws(()=>Reflect.construct(IndependentNativeOperationOrigin,[]));assert.throws(()=>Reflect.construct(IndependentNativeOperationOrigin,[{},{}]));
 const restore=environment();try{await assert.rejects(async()=>openNativeOriginVerifiedIndependentDelivery({database:'never-created'},{check(){},verifyCore(){}}));assert.deepEqual(await indexedDB.databases(),[]);}finally{restore();}
});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test(`both native lanes preserve cold future history document=${documentSegmented} review=${reviewSegmented}`,async()=>{
 const f=await fixture({documentSegmented,reviewSegmented,retained:'all'});let current,reference,peer;
 try{
  // The original writer is still actually held: the read-only origin has no author lease.
  f.origin.verifyCore(f.source.core,f.source.exportRecovery().source.versions);
  peer=new api.SharedRichEditor(profile.join_frame('room','202',f.source.core.updateFrame()));peer.enableReview({actor:'peer-comments',principal:'bob',access:'comment'});peer.receiveReview(f.source.core.exportReview(),{actor:'comments',principal:'alice',access:'comment'});insertCleanupText(peer,'Preserved offline peer ');await f.source.core.receiveFrame(peer.updateFrame());peer.dispatchReview({kind:'reply',data:{thread:f.thread,body:'Preserved offline peer comment'}});f.source.core.receiveReview(peer.exportReview(),{actor:'peer-comments',principal:'bob',access:'comment'});await f.source.flush();
  const before=f.source.exportRecovery();await f.source.close();current=await openNativeOriginVerifiedIndependentDelivery(f.selected.options,f.origin);assert.deepEqual(current.exportRecovery(),before);await current.close();current=undefined;
  reference=await api.SharedIndependentDeliverySession.restoreRecovery({...f.selected.options,database:f.tag+'-reference',recovery:before,writerRecovery:'host-reacquired'});const future=[];
  for(const method of ['redo','undo','redo']){assert.equal(reference.core[method](),true);assert.equal(reference.core[method==='redo'?'redoReview':'undoReview']().kind,'committed');future.push(pair(reference.core,reviewSegmented));}await reference.close();reference=undefined;
  current=await openNativeOriginVerifiedIndependentDelivery(f.selected.options,f.origin);
  for(const[index,method]of ['redo','undo','redo'].entries()){assert.equal(current.core[method](),true);assert.equal(current.core[method==='redo'?'redoReview':'undoReview']().kind,'committed');assert.deepEqual(pair(current.core,reviewSegmented),future[index]);assert.match(current.core.documentJson(),/Preserved offline peer/);assert.match(JSON.stringify(current.core.reviewSnapshot().view),/Preserved offline peer comment/);}
  await current.flush();const saved=current.exportRecovery();assert.deepEqual(saved.retained,before.retained);assert.deepEqual(saved.source.versions,before.source.versions);await current.close();current=await openNativeOriginVerifiedIndependentDelivery(f.selected.options,f.origin);assert.deepEqual(current.exportRecovery(),saved);
 }finally{peer?.dispose();await reference?.discardAndClose();await current?.discardAndClose();await f.close();}
});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])for(const lane of ['document','review'])test(`a valid stored ${lane} fork is refused before autosave document=${documentSegmented} review=${reviewSegmented}`,async()=>{
 const f=await fixture({documentSegmented,reviewSegmented,versions:false});let ordinary,verified,writes;
 try{await f.source.close();const options=await fork(f,lane),before=await databaseValues(options.database);ordinary=await api.SharedIndependentDeliverySession.open(options);await ordinary.close();ordinary=undefined;
  writes=observeSourceWrites(options.database);await assert.rejects(openNativeOriginVerifiedIndependentDelivery(options,f.origin).then(value=>{verified=value;}));assert.equal(writes.calls,0);assert.deepEqual(await databaseValues(options.database),before);
 }finally{writes?.restore();await ordinary?.discardAndClose();await verified?.discardAndClose();await f.close();}
});
test('loss of a local immutable version refuses before the constructor can autosave',async()=>{
 const f=await fixture();let seed,current;
 try{await f.source.close();seed=await api.SharedIndependentDeliverySession.restoreRecovery({...f.selected.options,database:f.tag+'-missing-version',recovery:{...f.recovery,source:{...f.recovery.source,versions:[]}},writerRecovery:'host-reacquired'});await seed.close();seed=undefined;const options={...f.selected.options,database:f.tag+'-missing-version'},before=await databaseValues(options.database);
  await assert.rejects(openNativeOriginVerifiedIndependentDelivery(options,f.origin).then(value=>{current=value;}),e=>e.code==='independent_operation_origin');assert.deepEqual(await databaseValues(options.database),before);
 }finally{await seed?.discardAndClose();await current?.discardAndClose();await f.close();}
});
test('canonical native/origin guards cannot be replaced by late public facades',async()=>{
 const f=await fixture({versions:false}),names=['verifyRecoveryOrigin','verifySegmentedRecoveryOrigin'],before=new Map(names.map(name=>[name,api.SharedRichEditor.prototype[name]])),originMethods=new Map(['check','verifyCore'].map(name=>[name,IndependentNativeOperationOrigin.prototype[name]]));let current,calls=0;
 try{await f.source.close();const options=await fork(f,'review'),data=await databaseValues(options.database);for(const name of names)api.SharedRichEditor.prototype[name]=()=>{calls++;};for(const name of originMethods.keys())IndependentNativeOperationOrigin.prototype[name]=()=>{calls++;};await assert.rejects(openNativeOriginVerifiedIndependentDelivery(options,f.origin).then(value=>{current=value;}));assert.equal(calls,0);assert.deepEqual(await databaseValues(options.database),data);}
 finally{for(const[name,value]of before)api.SharedRichEditor.prototype[name]=value;for(const[name,value]of originMethods)IndependentNativeOperationOrigin.prototype[name]=value;await current?.discardAndClose();await f.close();}
});
test('revocation inside the actual head transaction aborts all writes but keeps readable unsaved recovery',async()=>{
 const f=await fixture(),get=IDBObjectStore.prototype.get;let current,armed=false,revocations=0;
 try{await f.source.close();current=await openNativeOriginVerifiedIndependentDelivery(f.selected.options,f.origin);insertCleanupText(current.core,'Before transactional seal ');await current.flush();const before=await databaseValues(f.selected.options.database),saved=current.exportRecovery();
  IDBObjectStore.prototype.get=function(...args){const request=get.apply(this,args);if(armed&&this.name==='delivery_history_heads'&&this.transaction.mode==='readwrite'&&this.transaction.db.name===f.selected.options.database){armed=false;request.addEventListener('success',()=>{revocations++;f.setAllowed(false);},{once:true});}return request;};armed=true;
  await assert.rejects(current.sealDocumentGeneration('transaction-boundary'),e=>{assert.equal(e.code,'participant_authority',String(e));return true;});assert.equal(revocations,1);assert.deepEqual(await databaseValues(f.selected.options.database),before);const unsaved=current.exportRecovery();assert.notDeepEqual(unsaved.source,saved.source);assert.deepEqual(unsaved.retained,f.recovery.retained);assert.equal(current.state().status,'failed');
  IDBObjectStore.prototype.get=get;f.setAllowed(true);await current.retry();assert.deepEqual(current.exportRecovery(),unsaved);assert.equal(current.state().status,'saved');await current.close();current=await openNativeOriginVerifiedIndependentDelivery(f.selected.options,f.origin);assert.deepEqual(current.exportRecovery(),unsaved);
 }finally{IDBObjectStore.prototype.get=get;f.setAllowed(true);await current?.discardAndClose();await f.close();}
});
test('a closed native origin refuses writes without hiding the current readable source',async()=>{
 const f=await fixture();let current;
 try{await f.source.close();current=await openNativeOriginVerifiedIndependentDelivery(f.selected.options,f.origin);const before=await databaseValues(f.selected.options.database);f.origin.dispose();insertCleanupText(current.core,'Unsaved but exportable ');assert.throws(()=>current.save(),e=>e.code==='independent_operation_origin_closed');await assert.rejects(current.flush());assert.match(current.exportRecovery().source.documentCheckpoint,/Unsaved/);assert.deepEqual(await databaseValues(f.selected.options.database),before);}
 finally{await current?.discardAndClose();await f.close();}
});
for(const kind of ['lost-ack','authority-after-commit'])test(`an exact committed attempt survives ${kind} without rewriting acknowledged native files`,async()=>{
 const f=await fixture(),faults=recoveryFaults(),methods=['add','put'],original=new Map(methods.map(name=>[name,IDBObjectStore.prototype[name]]));let current,writes=0;
 try{await f.source.close();current=await openNativeOriginVerifiedIndependentDelivery(f.selected.options,f.origin);insertCleanupText(current.core,'Before commit boundary ');await current.flush();const before=await databaseValues(f.selected.options.database);
  faults.select(f.selected.options.database,'delivery_history_heads',1,kind==='lost-ack'?'lost-ack':'cancel',()=>f.setAllowed(false));await assert.rejects(current.sealDocumentGeneration('commit-boundary'));const committed=await databaseValues(f.selected.options.database);assert.notDeepEqual(committed,before);const readable=current.exportRecovery();assert.equal(current.state().status,'failed');
  faults.clear();f.setAllowed(true);for(const name of methods)IDBObjectStore.prototype[name]=function(...args){if(this.transaction.db.name===f.selected.options.database)writes++;return original.get(name).apply(this,args);};await current.retry();assert.equal(writes,0);assert.deepEqual(await databaseValues(f.selected.options.database),committed);assert.deepEqual(current.exportRecovery(),readable);assert.equal(current.state().status,'saved');
  for(const[name,value]of original)IDBObjectStore.prototype[name]=value;await current.close();current=await openNativeOriginVerifiedIndependentDelivery(f.selected.options,f.origin);assert.deepEqual(current.exportRecovery(),readable);
 }finally{for(const[name,value]of original)IDBObjectStore.prototype[name]=value;faults.restore();f.setAllowed(true);await current?.discardAndClose();await f.close();}
});
test('insert-only native-origin recovery refuses a missing selected version before publishing any source head',async()=>{
 const f=await fixture();let current;
 try{await f.source.close();const options={...f.selected.options,database:f.tag+'-insert-only',recovery:{...f.recovery,source:{...f.recovery.source,versions:[]}},writerRecovery:'host-reacquired'};await assert.rejects(restoreNativeOriginVerifiedIndependentDelivery(options,f.origin).then(value=>{current=value;}),e=>e.code==='independent_operation_origin');const actual=await databaseValues(options.database);assert.deepEqual(actual.delivery_history_heads.values,[]);assert.deepEqual(actual.delivery_history_files.values,[]);
  current=await restoreNativeOriginVerifiedIndependentDelivery({...options,recovery:f.recovery},f.origin);assert.deepEqual(current.exportRecovery(),f.recovery);
 }finally{await current?.discardAndClose();await f.close();}
});
test('current authority lost during an actual source factory frees its raw owner before any autosave',async()=>{
 const f=await fixture();let current,frees=0;
 try{await f.source.close();const before=await databaseValues(f.selected.options.database),original=f.selected.options.documentHistory.restoreSegmented,options={...f.selected.options,documentHistory:{...f.selected.options.documentHistory,restoreSegmented:async checkpoint=>{const raw=original(checkpoint),free=raw.free.bind(raw);raw.free=()=>{frees++;free();};await Promise.resolve();f.setAllowed(false);return raw;}}};await assert.rejects(openNativeOriginVerifiedIndependentDelivery(options,f.origin),e=>e.code==='participant_authority');assert.equal(frees,1);assert.deepEqual(await databaseValues(f.selected.options.database),before);f.setAllowed(true);current=await openNativeOriginVerifiedIndependentDelivery(f.selected.options,f.origin);assert.deepEqual(current.exportRecovery(),f.recovery);
 }finally{f.setAllowed(true);await current?.discardAndClose();await f.close();}
});
test('unreturned native-origin factory owners are freed when current authority is lost',async()=>{
 const f=await fixture();let second,frees=0;
 try{const original=f.prepared.factory.documentHistory.restoreSegmented,p={...f.prepared,factory:{...f.prepared.factory,documentHistory:{...f.prepared.factory.documentHistory,restoreSegmented:async checkpoint=>{const raw=original(checkpoint),free=raw.free.bind(raw);raw.free=()=>{frees++;free();};await Promise.resolve();f.setAllowed(false);return raw;}}}};await assert.rejects(IndependentNativeOperationOrigin.read(p).then(value=>{second=value;}),e=>e.code==='participant_authority');assert.equal(frees,1);f.setAllowed(true);f.origin.verifyCore(f.source.core,f.source.exportRecovery().source.versions);
 }finally{f.setAllowed(true);second?.dispose();await f.close();}
});
