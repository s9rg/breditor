/** Actual Rust/Wasm lanes; internal readers never acquire native or writer ownership. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {capturedNativeHistoryRead,checkCapturedNativeHistoryRead} from '../packages/breditor-collaboration/dist/native_history_read/registry.js';
import {cleanupEnvironment} from './fixtures/owned-core-cleanup/environment.mjs';
import {cleanupFamilies,nativeProfile,cleanupSession,insertCleanupText,cleanupNativePair} from './fixtures/owned-core-cleanup/session.mjs';
import {captureHistorySession,borrowedHistoryOperations} from './fixtures/native-history-read/capture.mjs';

const runtime=process.env.BREDITOR_NATIVE_HISTORY_READ_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;
let native,profile,sequence=0;
before(async()=>{native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native);});
after(()=>profile?.free());
const captureSession=(session,selected)=>captureHistorySession(api,session,selected),operations=reader=>borrowedHistoryOperations(reader,checkCapturedNativeHistoryRead);

for(const family of cleanupFamilies)test('genuine explicitly selected native lane reads and borrowed disposal: '+family,async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family,database:'native-history-read-'+sequence++});let session,source;
 try{
  session=await selected.open();const core=session.core;insertCleanupText(core,'Native first ');insertCleanupText(core,'Native Redo ');core.undo();
  if(selected.paired){core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Native comments'}});core.undoReview();}
  await session.flush();const exact=cleanupNativePair(core,selected);source=captureSession(session,selected);const reader=capturedNativeHistoryRead(source);
  checkCapturedNativeHistoryRead(reader);assert.equal(capturedNativeHistoryRead(source),reader);assert.ok(Object.isFrozen(reader)&&Object.isFrozen(reader.document)&&Object.isFrozen(reader.review));
  assert.equal(reader.document.kind,selected.segmentedDocument?'segmented-v1':'original');assert.equal(reader.document.checkpointJson(),exact[0]);assert.deepEqual(reader.document.descriptor(),core.descriptor());
  for(const name of ['writerClock','writerClockV2'])assert.deepEqual(reader.document[name]('101'),core[name]('101'));
  for(const name of ['writerGroups','writerGroupsV2'])assert.deepEqual(reader.document[name]('0'),core[name]('0'));
  if(selected.paired){assert.equal(reader.review.kind,selected.segmentedReview?'segmented-v1':'original');assert.equal(reader.review.checkpointJson(),exact[1]);assert.deepEqual(reader.review.localReviewClock(),core.localReviewClock());assert.deepEqual(reader.review.reviewWriterClock('comments','alice'),core.reviewWriterClock('comments','alice'));if(selected.segmentedReview)assert.throws(()=>core.reviewCheckpoint());}
  else{assert.deepEqual(reader.review,{kind:'absent'});assert.equal('checkpointJson' in reader.review,false);}
  for(const target of [reader,reader.document,reader.review])for(const name of ['core','dispose','retire','receiveFrame','dispatch','close','save','flush','setReadOnly','connect'])assert.equal(name in target,false,name);
  for(const fake of [{...source},Object.create(Object.getPrototypeOf(source)),source.metadata(),{check(){},records:()=>source.records()}])assert.throws(()=>capturedNativeHistoryRead(fake));assert.throws(()=>checkCapturedNativeHistoryRead({...reader}));assert.throws(()=>checkCapturedNativeHistoryRead(JSON.parse(JSON.stringify(reader))));
  const borrowed=operations(reader);source.dispose();for(const read of borrowed)assert.throws(read);assert.throws(()=>capturedNativeHistoryRead(source));assert.deepEqual(cleanupNativePair(core,selected),exact);assert.equal(environment.held.size,selected.paired?2:1);
 }finally{source?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

for(const family of cleanupFamilies)test('actual document publication invalidates every borrowed native read: '+family,async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family,database:'native-history-stale-'+sequence++});let session,source;
 try{session=await selected.open();source=captureSession(session,selected);const reader=capturedNativeHistoryRead(source),borrowed=operations(reader);insertCleanupText(session.core,'Actual mutation ');for(const read of borrowed)assert.throws(read);assert.throws(()=>capturedNativeHistoryRead(source));}
 finally{source?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

for(const family of ['paired','generation-paired','independent-original','independent-document','independent-review','independent-both'])test('selected comment publications invalidate document and comment reads: '+family,async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family,database:'native-history-comment-'+sequence++});let session,source;
 try{session=await selected.open();source=captureSession(session,selected);const reader=capturedNativeHistoryRead(source);session.core.dispatchReview({kind:'create_thread',data:{anchorJson:session.core.captureReviewAnchor({kind:'document'}),body:'Changed selected comments'}});for(const read of operations(reader))assert.throws(read);}
 finally{source?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

for(const family of ['paired','independent-review'])test('omitted comment history is unselected, not absent or implicitly readable: '+family,async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family,database:'native-history-unselected-'+sequence++});let session,source;
 try{session=await selected.open();source=api.captureSharedAssetReferences({core:session.core});const reader=capturedNativeHistoryRead(source),checkpoint=reader.document.checkpointJson();assert.deepEqual(reader.review,{kind:'unselected',nativeKind:selected.segmentedReview?'segmented-v1':'original'});assert.equal('checkpointJson' in reader.review,false);session.core.dispatchReview({kind:'create_thread',data:{anchorJson:session.core.captureReviewAnchor({kind:'document'}),body:'Unselected comments'}});reader.check();assert.equal(reader.document.checkpointJson(),checkpoint);}
 finally{source?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

test('absent review cannot be reinterpreted when a new native review lane is enabled',async()=>{
 const selected=cleanupSession(api,profile),core=new api.SharedRichEditor(profile.create(selected.document,'101'));let source;
 try{source=api.captureSharedAssetReferences({core});const reader=capturedNativeHistoryRead(source);assert.equal(reader.review.kind,'absent');core.enableReview({actor:'comments',principal:'alice',access:'comment'});for(const read of operations(reader))assert.throws(read);}
 finally{source?.dispose();core.dispose();}
});

for(const family of ['original','paired','generation-paired','independent-both'])test('terminal retirement leaves borrowed native reads, not authoring custody: '+family,async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family,database:'native-history-retired-'+sequence++});let session,source;
 try{session=await selected.open();source=captureSession(session,selected);const reader=capturedNativeHistoryRead(source),exact=cleanupNativePair(session.core,selected);session.core.retire();for(const read of operations(reader))assert.doesNotThrow(read);assert.equal(reader.document.checkpointJson(),exact[0]);if(selected.paired)assert.equal(reader.review.checkpointJson(),exact[1]);assert.throws(()=>insertCleanupText(session.core,'Not allowed '),error=>error.code==='retired');}
 finally{source?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

for(const lane of ['document','review'])test('actual native generation boundary invalidates the captured cut: '+lane,async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family:'independent-both',database:'native-history-boundary-'+sequence++});let session,source;
 try{session=await selected.open();insertCleanupText(session.core,'Nonempty segment ');session.core.dispatchReview({kind:'create_thread',data:{anchorJson:session.core.captureReviewAnchor({kind:'document'}),body:'Nonempty review segment'}});source=captureSession(session,selected);const reader=capturedNativeHistoryRead(source);if(lane==='document')session.core.sealHistoryGeneration('next');else session.core.sealReviewHistoryGeneration('next');for(const read of operations(reader))assert.throws(read);}
 finally{source?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

test('a replaced public record reader cannot hide a selected native comment publication',async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family:'paired',database:'native-history-record-'+sequence++});let session,source;
 try{session=await selected.open();source=captureSession(session,selected);const reader=capturedNativeHistoryRead(source),record=session.exportRecovery();Object.defineProperty(session,'exportRecovery',{configurable:true,value:()=>record});session.core.dispatchReview({kind:'create_thread',data:{anchorJson:session.core.captureReviewAnchor({kind:'document'}),body:'Actual changed comments'}});for(const read of operations(reader))assert.throws(read);}
 finally{source?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

for(const family of ['original','generation','independent-original','independent-both'])test('typing boundaries invalidate changed native history and preserve exact no-op captures: '+family,async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family,mask:1,database:'native-history-typing-'+sequence++});let session,source,current;
 try{session=await selected.open();const point={block:'p',offset:'0',affinity:'after'};session.core.select({kind:'text',anchor:point,focus:point});session.core.typeUser('Grouped','1');source=captureSession(session,selected);const reader=capturedNativeHistoryRead(source),before=reader.document.checkpointJson();assert.equal(session.core.closeTypingGroup(),true);assert.notEqual(session.core.checkpointJson(),before);for(const read of operations(reader))assert.throws(read);current=captureSession(session,selected);const now=capturedNativeHistoryRead(current),exact=now.document.checkpointJson();assert.equal(session.core.closeTypingGroup(),false);now.check();assert.equal(now.document.checkpointJson(),exact);}
 finally{source?.dispose();current?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

test('repeated live guards do not materialize review views or complete native history strings',async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family:'independent-both',database:'native-history-lightweight-'+sequence++}),create=selected.options.create;let session,source,reads=0;
 selected.options.create=()=>{const raw=create();for(const name of ['review_view_json','review_segmented_checkpoint','segmented_checkpoint']){const read=raw[name];raw[name]=function(...args){reads++;return read.apply(this,args);};}return raw;};
 try{session=await selected.open();source=captureSession(session,selected);const reader=capturedNativeHistoryRead(source);reads=0;for(let i=0;i<1000;i++){reader.check();checkCapturedNativeHistoryRead(reader);}assert.equal(reads,0);reader.document.writerClockV2('101');reader.review.localReviewClock();assert.equal(reads,0);}
 finally{source?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

test('native prefix reads do not repeatedly export original complete paired records',async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family:'paired',database:'native-history-original-budget-'+sequence++});let session,source,calls=0;
 try{session=await selected.open();const read=session.exportRecovery.bind(session);Object.defineProperty(session,'exportRecovery',{configurable:true,value:()=>{calls++;return read();}});source=captureSession(session,selected);const reader=capturedNativeHistoryRead(source);calls=0;for(let i=0;i<1000;i++){reader.document.writerClockV2('101');reader.review.localReviewClock();}assert.equal(calls,0);reader.check();assert.ok(calls>0,'Complete source validation still exports the selected original record');}
 finally{source?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

test('unchanged native reads do not certify a changed selected retained catalog',async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family:'paired',database:'native-history-retained-change-'+sequence++});let session,source;
 try{session=await selected.open();source=captureSession(session,selected);const reader=capturedNativeHistoryRead(source),before=reader.document.checkpointJson();await session.retainVersion(session.core.captureVersion('New retained version','alice','1'));assert.equal(reader.document.checkpointJson(),before);assert.throws(()=>reader.check());assert.throws(()=>checkCapturedNativeHistoryRead(reader));assert.throws(()=>capturedNativeHistoryRead(source));}
 finally{source?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

for(const family of ['original','generation','independent-both'])test('canonical reads and native lifetime do not follow public facade/capture overrides: '+family,async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family,database:'native-history-canonical-'+sequence++});let session,source;const target=api.SharedRichEditor.prototype,names=['checkpointJson','descriptor','writerClock','writerClockV2','writerGroups','writerGroupsV2','reviewCheckpoint','reviewSegmentedCheckpoint','localReviewClock','reviewWriterClock'],saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(target,name)]));let calls=0;
 try{session=await selected.open();const exact=cleanupNativePair(session.core,selected);source=captureSession(session,selected);const reader=capturedNativeHistoryRead(source);for(const name of names)Object.defineProperty(target,name,{configurable:true,writable:true,value(){calls++;throw Error('Public override');}});assert.equal(reader.document.checkpointJson(),exact[0]);if(selected.paired)assert.equal(reader.review.checkpointJson(),exact[1]);for(const read of operations(reader))assert.doesNotThrow(read);assert.equal(calls,0);session.core.dispose();for(const read of operations(reader))assert.throws(read);assert.equal(calls,0);}
 finally{for(const[name,descriptor]of saved)Object.defineProperty(target,name,descriptor);source?.dispose();try{await session?.discardAndClose();}finally{environment.restore();}}
});

test('borrowed histories and registry helpers remain absent from the public package root',()=>{for(const name of ['capturedNativeHistoryRead','registerCapturedNativeHistory','checkCapturedNativeHistoryRead','releaseCapturedNativeHistory','nativeHistoryIntrinsics','coreReadStamp','registerCoreReadStamp'])assert.equal(name in api,false);});
