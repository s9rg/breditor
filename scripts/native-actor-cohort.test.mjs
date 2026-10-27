/** Actual normal-Wasm multi-owner resource handoff. Controlled IDB/Web Locks
 * are not whole-room data admission, process-crash durability or server fences. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {StoppedActorCohort} from '../packages/breditor-collaboration/dist/persistence/stopped_actor_cohort.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {cleanupEnvironment} from './fixtures/owned-core-cleanup/environment.mjs';
import {nativeProfile,cleanupSession,insertCleanupText,cleanupNativePair} from './fixtures/owned-core-cleanup/session.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname,code=value=>error=>error?.code===value;
let profile,sequence=0;
before(async()=>{const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native);});
after(()=>profile?.free());
const sourceFamily=family=>family==='original'?'shared':family==='paired'?'review':family==='relay'||family==='retained'?'segmented-relay':family.startsWith('independent-')?'independent':'segmented';
async function members(families){const tag='actor-cohort-'+sequence++,rows=[];for(const[ordinal,family]of families.entries()){const writer=String(201+ordinal),actor='comments-'+ordinal,selected=cleanupSession(api,profile,{family,writer,actor,database:tag+'-old-'+ordinal});rows.push({id:'member-'+ordinal,family:sourceFamily(family),selected,source:await selected.open(),writer,actor});}return rows;}
const selection=rows=>rows.map(({id,family,source})=>({id,family,source}));
function reference(pair,selected){const raw=selected.segmentedDocument?profile.restore_segmented('room',pair[0]):profile.restore('room',pair[0]),core=new api.SharedRichEditor(raw,selected.segmentedDocument?{segmentedHistory:'segmented-v1'}:{});if(selected.paired){if(selected.segmentedReview)core.enableSegmentedReview(selected.review,pair[1]);else core.enableReview(selected.review,pair[1]);}if(selected.independent)core.sealIndependentHistoryPolicies(selected.segmentedDocument?'segmented-v1':'original',selected.segmentedReview?'segmented-v1':'original','explicit','original');else if(selected.segmentedDocument)core.sealSegmentedPolicies('explicit','original');else if(selected.paired)core.sealReviewPolicies('explicit','original');return core;}
const stop=rows=>{for(const row of rows)api.SharedRichEditor.prototype.retire.call(row.source.core);};
async function dispose(rows){for(const row of rows)await row.source.discardAndClose();}
async function recovery(row){const{source,selected}=row,database=selected.database+'-target';
 if(selected.family==='original')return{database,input:{...selected.options,database,backupJson:await source.exportBackup(),writerRecovery:'host-reacquired'},open:input=>api.SharedPersistentSession.restoreBackup(input)};
 if(selected.family==='paired')return{database,input:{...selected.options,database,backupJson:await source.exportBackup(),writerRecovery:'host-reacquired'},open:input=>api.SharedReviewPersistentSession.restoreBackup(input)};
 if(selected.independent){const recovery=source.exportRecovery();return{database,input:{...selected.options,database},open:input=>api.SharedIndependentHistoryPersistentSession.restoreRecovery(input,recovery,'host-reacquired')};}
 if(selected.family==='relay'){const recovery=source.exportRecovery();return{database,input:{...selected.options,database,binding:recovery.relay.binding,recovery,writerRecovery:'host-reacquired'},open:input=>api.SharedSegmentedRelaySession.restoreRecovery(input)};}
 if(selected.family==='retained'){const recovery=source.exportRetainedRecovery();return{database,input:{...selected.options,database,binding:recovery.relay.binding,retained:recovery.retainedBinding,recovery,writerRecovery:'host-reacquired'},open:input=>api.SharedSegmentedRelaySession.restoreRetainedRecovery(input)};}
 return{database,input:{...selected.options,database,recovery:source.exportRecovery(),writerRecovery:'host-reacquired'},open:input=>api.SharedSegmentedPersistentSession.restoreRecovery(input)};
}

test('a later active source refuses before moving any earlier stopped native owner',async()=>{
 const host=cleanupEnvironment();let rows=[],cohort;try{rows=await members(['paired','independent-both']);api.SharedRichEditor.prototype.retire.call(rows[0].source.core);assert.throws(()=>{cohort=StoppedActorCohort.take(selection(rows));},code('actor_source_live'));await dispose(rows);assert.equal(host.held.size,0);}finally{await dispose(rows);await cohort?.close();assert.equal(host.held.size,0);host.restore();}
});
test('duplicate member IDs refuse before moving any actual source author',async()=>{
 const host=cleanupEnvironment();let rows=[],cohort;try{rows=await members(['original','paired']);stop(rows);assert.throws(()=>{cohort=StoppedActorCohort.take(selection(rows).map(row=>({...row,id:'same'})));},code('actor_cohort_duplicate'));await dispose(rows);assert.equal(host.held.size,0);}finally{await dispose(rows);await cohort?.close();assert.equal(host.held.size,0);host.restore();}
});
test('a repeated actual owner under different names is not a second source',async()=>{
 const host=cleanupEnvironment();let rows=[],cohort;try{rows=await members(['paired']);stop(rows);const first=selection(rows)[0];assert.throws(()=>{cohort=StoppedActorCohort.take([first,{...first,id:'alias'}]);},code('actor_cohort_duplicate'));await dispose(rows);assert.equal(host.held.size,0);}finally{await dispose(rows);await cohort?.close();assert.equal(host.held.size,0);host.restore();}
});
test('accessor-shaped selection cannot execute application code between source checks',async()=>{
 const host=cleanupEnvironment();let rows=[],cohort,reads=0;try{rows=await members(['paired']);stop(rows);const row={id:'member',family:'review',get source(){reads++;return rows[0].source;}};assert.throws(()=>{cohort=StoppedActorCohort.take([row]);},code('actor_cohort_policy'));assert.equal(reads,0);await dispose(rows);assert.equal(host.held.size,0);}finally{await dispose(rows);await cohort?.close();assert.equal(host.held.size,0);host.restore();}
});
test('JavaScript direct cohort construction cannot mint source custody',()=>{assert.throws(()=>Reflect.construct(StoppedActorCohort,[{},[]]),code('actor_cohort_policy'));});
test('later missing target refuses promotion and live later target refuses all-member cleanup without releasing the first member',async()=>{
 const host=cleanupEnvironment();let rows=[],cohort,first,second,firstToken,secondToken,committed=false;
 try{rows=await members(['original','paired']);const restores=await Promise.all(rows.map(recovery));stop(rows);cohort=StoppedActorCohort.take(selection(rows));await dispose(rows);assert.equal(host.held.size,3);
  firstToken=cohort.bind(rows[0].id,restores[0].input,restores[0].database);first=await restores[0].open(firstToken.input);assert.throws(()=>cohort.commit(),code('writer_escrow_borrower'));assert.equal(host.held.size,3);
  await first.discardAndClose();first=undefined;await firstToken.rollbackAfterFailure();secondToken=cohort.bind(rows[1].id,restores[1].input,restores[1].database);second=await restores[1].open(secondToken.input);await assert.rejects(cohort.close(),error=>/escrow_in_use/.test(error?.code??''));assert.equal(host.held.size,3);await assert.rejects(SharedWriterLease.acquire('room',rows[0].writer),code('writer_in_use'));await assert.rejects(ReviewWriterLease.acquire('room',rows[1].actor),code('review_writer_in_use'));
  await second.discardAndClose();second=undefined;await secondToken.rollbackAfterFailure();await cohort.close();assert.equal(host.held.size,0);
 }finally{await first?.discardAndClose();await second?.discardAndClose();if(!committed){await firstToken?.rollbackAfterFailure();await secondToken?.rollbackAfterFailure();}await dispose(rows);await cohort?.close();assert.equal(host.held.size,0);host.restore();}
});
test('seven actual mixed native owners hand off together with exact histories and future document/comment Undo/Redo',async()=>{
 const host=cleanupEnvironment();let rows=[],cohort,committed=false;const targets=[],tokens=[],references=[];
 try{rows=await members(['original','paired','generation','generation-paired','independent-both','relay','retained']);
  for(const row of rows){insertCleanupText(row.source.core,'Keep offline work '+row.id+' ');insertCleanupText(row.source.core,'Future redo ');row.source.core.undo();if(row.selected.paired){row.source.core.dispatchReview({kind:'create_thread',data:{anchorJson:row.source.core.captureReviewAnchor({kind:'document'}),body:'Future comment redo'}});row.source.core.undoReview();await row.source.retainVersion(row.source.core.captureVersion('Immutable version','alice','1'));}await row.source.flush();}
  const histories=rows.map(row=>cleanupNativePair(row.source.core,row.selected)),documents=rows.map(row=>row.source.core.documentJson()),restores=await Promise.all(rows.map(recovery));
  references.push(...rows.map((row,index)=>reference(histories[index],row.selected)));
  stop(rows);cohort=StoppedActorCohort.take(selection(rows));await dispose(rows);assert.equal(host.held.size,12);
  for(const[rowIndex,row]of rows.entries()){await assert.rejects(row.selected.open(),code('writer_in_use'));const r=restores[rowIndex],token=cohort.bind(row.id,r.input,r.database);tokens.push(token);const target=await r.open(token.input);targets.push(target);assert.deepEqual(cleanupNativePair(target.core,row.selected),histories[rowIndex]);assert.equal(target.core.documentJson(),documents[rowIndex]);if(row.selected.paired)assert.equal(target.versions().length,1);}
  cohort.commit();committed=true;await cohort.close();await dispose(rows);assert.equal(host.held.size,12);
  for(const[index,target]of targets.entries()){const row=rows[index],expected=references[index];await assert.rejects(row.selected.open(),code('writer_in_use'));assert.deepEqual(target.core.redo(),expected.redo());assert.deepEqual(target.core.undo(),expected.undo());if(row.selected.paired){assert.deepEqual(target.core.redoReview(),expected.redoReview());assert.deepEqual(target.core.undoReview(),expected.undoReview());}assert.deepEqual(cleanupNativePair(target.core,row.selected),cleanupNativePair(expected,row.selected));await target.flush();}
 }finally{for(const expected of references)expected.dispose();for(const target of targets)await target.discardAndClose();if(!committed)for(const token of tokens)await token.rollbackAfterFailure();await dispose(rows);await cohort?.close();assert.equal(host.held.size,0);host.restore();}
});
