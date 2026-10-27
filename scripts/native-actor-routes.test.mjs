/** Real normal-Wasm factories under a controlled IDB/lock host. Staging closes
 * must return actual handles before a final editor can borrow them. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {takeNativeActorCohort} from '../packages/breditor-collaboration/dist/persistence/native_actor_cohort.js';
import {DeferredActorLeaseInput} from '../packages/breditor-collaboration/dist/persistence/deferred_actor_input.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {beginPhysicalRootKeepingActors,resumePhysicalRootKeepingActors} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {cleanupEnvironment} from './fixtures/owned-core-cleanup/environment.mjs';
import {cleanupFamilies,nativeProfile,cleanupSession,insertCleanupText,cleanupNativePair} from './fixtures/owned-core-cleanup/session.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname;
let profile;
before(async()=>{const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native);});
after(()=>profile?.free());
async function recovery(family,source,selected){
 if(family==='original'||family==='paired'){const backupJson=await source.exportBackup();return database=>({options:{...selected.options,database,backupJson,writerRecovery:'host-reacquired'},open:options=>(family==='original'?api.SharedPersistentSession:api.SharedReviewPersistentSession).restoreBackup(options)});}
 if(family.startsWith('independent-')){const saved=source.exportRecovery();return database=>({options:{...selected.options,database},open:options=>api.SharedIndependentHistoryPersistentSession.restoreRecovery(options,saved,'host-reacquired')});}
 if(family==='relay'||family==='retained'){const saved=family==='relay'?source.exportRecovery():source.exportRetainedRecovery();return database=>({options:{...selected.options,database,binding:saved.relay.binding,...(family==='retained'?{retained:saved.retainedBinding}:{}),recovery:saved,writerRecovery:'host-reacquired'},open:options=>api.SharedSegmentedRelaySession[family==='relay'?'restoreRecovery':'restoreRetainedRecovery'](options)});}
 const saved=source.exportRecovery();return database=>({options:{...selected.options,database,recovery:saved,writerRecovery:'host-reacquired'},open:options=>api.SharedSegmentedPersistentSession.restoreRecovery(options)});
}
for(const family of cleanupFamilies)test('deferred actual actor route: staging, final and both-lane future history '+family,async()=>{
 const host=cleanupEnvironment(),tag='native-route-'+family,selected=cleanupSession(api,profile,{family,database:tag+'-old'});
 let old,stage,final,actors,route;
 try{
  old=await selected.open();insertCleanupText(old.core,'Retained ');insertCleanupText(old.core,'Redo ');old.core.undo();
  if(selected.paired){old.core.dispatchReview({kind:'create_thread',data:{anchorJson:old.core.captureReviewAnchor({kind:'document'}),body:'Redo comment'}});old.core.undoReview();await old.retainVersion(old.core.captureVersion('Keep version','alice','1'));}
  await old.flush();const pair=cleanupNativePair(old.core,selected),make=await recovery(family,old,selected),document=old.core.documentJson();
  api.SharedRichEditor.prototype.retire.call(old.core);actors=takeNativeActorCohort([{id:'member',core:old.core}]);await old.discardAndClose();old=undefined;
  route=actors.route('member',{databases:[tag+'-stage',tag+'-final'],finalDatabase:tag+'-final'});
  const first=make(tag+'-stage');stage=await first.open(route.select(first.options));assert.deepEqual(cleanupNativePair(stage.core,selected),pair);
  assert.throws(()=>route.checkFinal(stage.core),error=>error.code==='actor_route_final');
  assert.throws(()=>route.markPromoted());assert.throws(()=>actors.commit());
  const blocked=make(tag+'-final');await assert.rejects(blocked.open(route.select(blocked.options)),error=>error.code==='actor_lease_input_in_use');
  assert.deepEqual(cleanupNativePair(stage.core,selected),pair);assert.equal(host.held.size,selected.paired?2:1);
  await stage.close();stage=undefined;const second=make(tag+'-final');final=await second.open(route.select(second.options));
  assert.deepEqual(cleanupNativePair(final.core,selected),pair);route.checkFinal(final.core);actors.commit();await actors.close();await route.close();
  await assert.rejects(SharedWriterLease.acquire('room','101'),error=>error.code==='writer_in_use');
  assert.equal(final.core.redo(),true);assert.notEqual(final.core.documentJson(),document);assert.equal(final.core.undo(),true);assert.equal(final.core.documentJson(),document);
  if(selected.paired){assert.equal(final.core.redoReview().kind,'committed');assert.equal(final.core.undoReview().kind,'committed');assert.equal(final.versions().length,1);}
  await final.flush();await final.close();final=undefined;assert.equal(host.held.size,0);
 }finally{await final?.discardAndClose();await stage?.discardAndClose();await route?.close();await actors?.close();await old?.discardAndClose();assert.equal(host.held.size,0);host.restore();}
});
test('keeping-actors root cannot fall back to ordinary host reacquisition for missing/forged custody',async()=>{
 let reads=0;const input=Object.defineProperty({},'wasm',{get(){reads++;throw Error('Not reached');}}),fake=Object.defineProperty({},'bindings',{get(){reads++;throw Error('Not reached');}});
 for(const open of[beginPhysicalRootKeepingActors,resumePhysicalRootKeepingActors])for(const actors of[undefined,null,{},fake,Object.create(null)])await assert.rejects(open(input,actors));
 assert.equal(reads,0);
});
test('a caller cannot construct a genuine deferred actor route using a phase object',()=>{
 assert.throws(()=>new DeferredActorLeaseInput({},'shared','room','101',null,{state:'held'},{databases:['x'],finalDatabase:'x'}),error=>error.code==='actor_route_policy');
});

for(const family of ['original','paired','generation-paired','independent-both'])test('deferred constructor failure returns actual slots for same-route retry '+family,async()=>{
 const host=cleanupEnvironment(),tag='native-route-failure-'+family,selected=cleanupSession(api,profile,{family,database:tag+'-old'});
 let old,target,actors,route;
 try{
  old=await selected.open();await old.flush();api.SharedRichEditor.prototype.retire.call(old.core);actors=takeNativeActorCohort([{id:'member',core:old.core}]);await old.discardAndClose();old=undefined;
  route=actors.route('member',{databases:[tag+'-final'],finalDatabase:tag+'-final'});
  const open=input=>family==='original'?api.SharedPersistentSession.open(input):family==='paired'?api.SharedReviewPersistentSession.open(input):family==='generation-paired'?api.SharedSegmentedPersistentSession.open(input):api.SharedIndependentHistoryPersistentSession.open(input);
  await assert.rejects(open(route.select({...selected.options,database:tag+'-final',create(){throw Error('Actual native construction failure');}})),/Actual native construction failure/);
  assert.equal(host.held.size,selected.paired?2:1);await assert.rejects(SharedWriterLease.acquire('room','101'),error=>error.code==='writer_in_use');
  target=await open(route.select({...selected.options,database:tag+'-final'}));route.checkFinal(target.core);actors.commit();await route.close();insertCleanupText(target.core,'Retry retained author ');await target.flush();assert.match(target.core.documentJson(),/Retry retained author/);
 }finally{await target?.discardAndClose();await route?.close();await actors?.close();await old?.discardAndClose();assert.equal(host.held.size,0);host.restore();}
});
test('a stalled actual native constructor excludes later borrowers and cannot be released by cleanup labels',async()=>{
 const host=cleanupEnvironment(),selected=cleanupSession(api,profile,{family:'paired',database:'native-route-stalled-old'});
 let old,target,actors,route,resolve,opening;let reached,supplied=false;
 const started=new Promise(done=>{reached=done;}),native=new Promise(done=>{resolve=done;});
 try{
  old=await selected.open();await old.flush();api.SharedRichEditor.prototype.retire.call(old.core);actors=takeNativeActorCohort([{id:'member',core:old.core}]);await old.discardAndClose();old=undefined;
  route=actors.route('member',{databases:['native-route-stalled-final'],finalDatabase:'native-route-stalled-final'});
  opening=api.SharedReviewPersistentSession.open(route.select({...selected.options,database:'native-route-stalled-final',create(){reached();return native;}}));await started;
  await assert.rejects(api.SharedReviewPersistentSession.open(route.select({...selected.options,database:'native-route-stalled-final'})),error=>error.code==='actor_lease_input_in_use');
  assert.throws(()=>route.markPromoted());assert.throws(()=>actors.commit());await assert.rejects(actors.close());assert.equal(host.held.size,2);
  supplied=true;resolve(profile.create(selected.document,'101'));target=await opening;route.checkFinal(target.core);actors.commit();await route.close();insertCleanupText(target.core,'Late actual owner ');await target.flush();
 }finally{if(!supplied)resolve(profile.create(selected.document,'101'));if(opening&&!target)target=await opening;await target?.discardAndClose();await route?.close();await actors?.close();await old?.discardAndClose();assert.equal(host.held.size,0);host.restore();}
});
test('a native-valid readonly replay is not the final actor borrower',async()=>{
 const host=cleanupEnvironment(),selected=cleanupSession(api,profile,{family:'original',database:'native-route-replay-old'});let old,target,actors,route,replay;
 try{old=await selected.open();await old.flush();const checkpoint=old.core.checkpointJson(),make=await recovery('original',old,selected);api.SharedRichEditor.prototype.retire.call(old.core);actors=takeNativeActorCohort([{id:'member',core:old.core}]);await old.discardAndClose();old=undefined;route=actors.route('member',{databases:['native-route-replay-final'],finalDatabase:'native-route-replay-final'});const next=make('native-route-replay-final');target=await next.open(route.select(next.options));replay=new api.SharedRichEditor(profile.restore('room',checkpoint));assert.equal(replay.checkpointJson(),target.core.checkpointJson());replay.setReadOnly(true);assert.equal(replay.documentJson(),target.core.documentJson());assert.throws(()=>route.checkFinal(replay),error=>error.code==='native_actor_source');assert.throws(()=>actors.commit(),error=>error.code==='actor_route_final');route.checkFinal(target.core);actors.commit();}
 finally{replay?.dispose();await target?.discardAndClose();await route?.close();await actors?.close();await old?.discardAndClose();assert.equal(host.held.size,0);host.restore();}
});

test('whole-cohort final admission ignores a replaced public route checker and refuses a retired actual source',async()=>{
 const host=cleanupEnvironment(),selected=cleanupSession(api,profile,{family:'original',database:'native-route-final-canonical-old'}),checkFinal=DeferredActorLeaseInput.prototype.checkFinal;
 let old,target,actors,route,calls=0;
 try{old=await selected.open();await old.flush();const make=await recovery('original',old,selected);api.SharedRichEditor.prototype.retire.call(old.core);actors=takeNativeActorCohort([{id:'member',core:old.core}]);await old.discardAndClose();old=undefined;route=actors.route('member',{databases:['native-route-final-canonical'],finalDatabase:'native-route-final-canonical'});const next=make('native-route-final-canonical');target=await next.open(route.select(next.options));route.checkFinal(target.core);api.SharedRichEditor.prototype.retire.call(target.core);DeferredActorLeaseInput.prototype.checkFinal=()=>{calls++;};assert.throws(()=>actors.commit(),error=>error.code==='retired');assert.equal(calls,0);await assert.rejects(SharedWriterLease.acquire('room','101'),error=>error.code==='writer_in_use');}
 finally{DeferredActorLeaseInput.prototype.checkFinal=checkFinal;await target?.discardAndClose();await route?.close();await actors?.close();await old?.discardAndClose();assert.equal(host.held.size,0);host.restore();}
});
