/** Genuine mixed native parents, not fake readiness or substituted operations. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {SharedIndependentHistoryPersistentSession as Session} from '../packages/breditor-collaboration/dist/independent_history/session.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as OldParent} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {captureLocalOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {pixel,secondAsset} from './fixtures/review-assets/pixels.mjs';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
// Load both private openers while the observer is installed. They capture the
// native method at initialization, and the public barrel also loads them.
const opened=new Map();
const open=Session.open;
let Snapshot,Flat;
Session.open=async function(options){
 const owner=await open.call(this,options);
 opened.set(options.database,owner);
 return owner;
};
try{
 ({OperationalRestoredLocalParticipant:Snapshot}=await import('../packages/breditor-collaboration/dist/restored_local_operation/participant.js'));
 ({OperationalFlatLocalParticipant:Flat}=await import('../packages/breditor-collaboration/dist/flat_local_operation/participant.js'));
}finally{
 Session.open=open;
}
const api=await import('../packages/breditor-collaboration/dist/index.js');
const {handoffNativeInputParticipants:handoff,reserveNativeInputParticipantGroup:reserveGroup}=await import('../packages/breditor-collaboration/dist/native_input_operation/cohort.js');
const {prepareOperationalCohort}=await import('../packages/breditor-collaboration/dist/operation_cohort/cohort.js');
const {RestoredLocalParticipantWitness}=await import('../packages/breditor-collaboration/dist/restored_local_operation/participant_witness.js');
const {RestoredLocalParticipantUploads}=await import('../packages/breditor-collaboration/dist/restored_local_operation/participant_assets.js');
const {restoredLocalFixture}=await import('./fixtures/restored-local-operation/session.mjs');
const {flatLocalFixture}=await import('./fixtures/flat-local-operation/session.mjs');
const runtime=process.env.BREDITOR_NATIVE_INPUT_COHORT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;
const bytes=async file=>Buffer.from(await file.arrayBuffer());
let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});
after(()=>{opened.clear();host?.free();});
async function fixture(order=['snapshot','flat'],policy=()=>{}){
 const rows=[];let parts,restore=()=>{};
 try{
  for(const [index,family] of order.entries()){
   const extra={writer:index===0?'101':'303',actor:'cohort-comments-'+index};
   const f=family==='snapshot'?await restoredLocalFixture(host,capture,extra):await flatLocalFixture(host,extra);
   const tag=family==='snapshot'?f.value.f.tag:f.original.value.f.tag;
   const options={...f.options,cohort:{parentDatabase:tag+'-cohort-parent',uploadsDatabase:tag+'-cohort-uploads'},checkAuthority(){policy(index);}};
   const Parent=family==='snapshot'?Snapshot:Flat;
   // These older single-owner fixtures temporarily install their own origin.
   // Retain the caller-owned file and fresh factories, then retire that origin
   // BEFORE opening any cohort member. Both real parents use ONE new context.
   const expectedUploads=family==='snapshot'?f.value.uploads:await bytes(f.whole);
   rows.push({id:'member-'+index,family:'local-operation-'+family,f,options,Parent,expectedUploads});
   await f.close();
  }
  restore=environment();
  for(const row of rows){
   row.parent=await row.Parent.begin(row.f.file,row.options);row.native=opened.get(row.options.sourceDatabase);assert.ok(row.native);
   row.foreign=await rich.RichAssetStore.openRetained(row.options.cohort.uploadsDatabase);
  }
  const input=()=>rows.map(row=>({id:row.id,family:row.family,operation:row.parent}));
  return{rows,input,async take(split=false){
   if(!split){parts=await handoff(input());return parts;}
   const groups=[];try{for(const row of input())groups.push(reserveGroup([row]));const ready=await prepareOperationalCohort(groups,async()=>Object.freeze({participants:Object.freeze(groups.flatMap(g=>g.states.map(row=>Object.freeze({id:row.id,family:row.family,parts:row.parts}))))}),()=>{},()=>{},()=>Error('Closed split fixture'));parts=ready.commit();return parts;}finally{for(const g of groups)g.abandon();}
  },async retryable(){for(const row of rows){await row.parent.check();await assert.rejects(row.foreign.cancel(secondAsset),error=>error.code==='asset_custody_busy');}},async close(){try{for(const value of parts?.participants??[]){await value.parts.source.session.discardAndClose();value.parts.uploads.close();}for(const row of rows.toReversed()){row.foreign?.close();await row.parent?.discardAndClose();}}finally{restore();}}};
 }catch(error){try{for(const row of rows.toReversed()){row.foreign?.close();await row.parent?.discardAndClose();}}finally{restore();}throw error;}
}
for(const order of [['snapshot','flat'],['flat','snapshot'],['snapshot','snapshot'],['flat','flat']])test(`actual ${order.join('/')} handoff preserves native records, uploads and independent cold continuation`,async()=>{
 const f=await fixture(order);
 try{
  const before=f.rows.map(row=>row.parent.readableSource()),out=await f.take();assert.deepEqual(out.participants.map(row=>row.family),f.rows.map(row=>row.family));
  for(const [index,row] of f.rows.entries()){
   const parts=out.participants[index].parts;assert.equal(parts.source.session,row.native);assert.deepEqual(parts.source.session.exportRecovery(),before[index]);assert.deepEqual(await bytes(parts.input.file()),await bytes(row.f.file));assert.deepEqual(await bytes(await parts.uploads.exportBackup()),row.expectedUploads);
   const seed=row.family==='local-operation-snapshot'?row.f.value:row.f.original.value;
   assert.deepEqual(await bytes(parts.input.blob(seed.f.reference.asset,seed.f.reference.generation)),pixel);
   await row.parent.close();insertCleanupText(parts.source.session.core,'After cohort handoff ');await parts.source.session.flush();const later=parts.source.session.exportRecovery();assert.notDeepEqual(later,before[index]);
   await parts.source.session.close();parts.uploads.close();row.parent=await row.Parent.resume(row.options);assert.deepEqual(row.parent.readableSource(),later);await row.parent.check();
  }
  const again=await f.take();for(const [index,row] of f.rows.entries()){assert.equal(again.participants[index].parts.source.session,opened.get(row.options.sourceDatabase));await again.participants[index].parts.uploads.cancel(secondAsset);await row.foreign.retry(secondAsset);}
 }finally{await f.close();}
});
for(const split of [false,true])for(const lane of ['document','review','seal-document','seal-review'])test(`last member's policy cannot publish an earlier stale ${lane} source, split groups=${split}`,async()=>{
 let armed=false,changed=false,f,lastGrants=0;const freeze=Object.freeze;
 // The established room kernel performs two final authorized passes. Mutate
 // only in the LAST callback of its second pass, so another policy pass cannot
 // accidentally satisfy this law in place of the final callback-free fence.
 f=await fixture(undefined,index=>{if(armed&&index===1&&++lastGrants===2&&!changed){changed=true;const core=f.rows[0].native.core;if(lane==='document')insertCleanupText(core,'Cross-member late edit ');else if(lane==='seal-document')core.sealHistoryGeneration('cohort-final-seal');else if(lane==='seal-review')core.sealReviewHistoryGeneration('cohort-final-seal');else core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Cross-member late review'}});}});
 try{
  // Arm only AFTER all actual result rows are built. The first member has then
  // already completed its asynchronous verification and cleanup.
  Object.freeze=function(value){if(value&&Array.isArray(value.participants)&&value.participants.length===2)armed=true;return freeze(value);};
  await assert.rejects(f.take(split),error=>String(error.code).endsWith('handoff_changed'));Object.freeze=freeze;armed=false;assert.equal(changed,true);
  await f.rows[0].native.flush();await f.retryable();const out=await f.take(split);assert.equal(out.participants.length,2);
 }finally{Object.freeze=freeze;armed=false;await f.close();}
});
test('a later authority refusal consumes neither earlier writer nor either upload lease',async()=>{
 let deny=false;const f=await fixture(undefined,index=>{if(deny&&index===1)throw Error('Second authority ended');});
 try{deny=true;await assert.rejects(f.take(),error=>error.code==='participant_authority');deny=false;await f.retryable();assert.equal((await f.take()).participants.length,2);}
 finally{deny=false;await f.close();}
});
test('all actual parents are synchronously reserved before the first authority callback',async()=>{
 let armed=false,hit=false,f;const nested=[];
 f=await fixture(undefined,()=>{if(armed&&!hit){hit=true;for(const row of f.rows)nested.push(row.parent.intoParts().then(()=>assert.fail('Reentrant handoff escaped'),error=>assert.match(error.code,/participant_busy$/)));}});
 try{armed=true;await f.take();await Promise.all(nested);assert.equal(hit,true);assert.equal(nested.length,2);}
 finally{armed=false;await f.close();}
});
test('late outer-wrapper interruption leaves every actual parent retryable',async()=>{
 const f=await fixture(),freeze=Object.freeze;let hit=false;
 try{Object.freeze=function(value){if(value&&Array.isArray(value.participants)&&value.participants.length===2){hit=true;throw Error('Outer result construction interrupted');}return freeze(value);};await assert.rejects(f.take(),/Outer result construction interrupted/);Object.freeze=freeze;assert.equal(hit,true);await f.retryable();await f.take();}
 finally{Object.freeze=freeze;await f.close();}
});
test('asynchronous namespace-release failure retains both native/upload owners for retry',async()=>{
 const f=await fixture(),close=RecoveryLease.prototype.close;let hit=false;
 try{RecoveryLease.prototype.close=async function(){if(!hit){hit=true;throw Error('Namespace callback failed');}return close.call(this);};await assert.rejects(f.take());RecoveryLease.prototype.close=close;assert.equal(hit,true);await f.retryable();await f.take();}
 finally{RecoveryLease.prototype.close=close;await f.close();}
});
test('duplicate actual parent, forged parent, wrong family and duplicate IDs cannot consume a genuine member',async()=>{
 const f=await fixture();
 try{
  const input=f.input();for(const rows of [[input[0],{...input[0],id:'alias'}],[input[0],{...input[1],operation:{ready:true}}],[input[0],{...input[1],operation:input[0].operation}],[input[0],{...input[1],id:input[0].id}]]){await assert.rejects(handoff(rows));await f.retryable();}
  await f.take();
 }finally{await f.close();}
});
for(const [label,Type,check] of [
 ['parent',Snapshot,value=>{assert.throws(()=>value.readableSource(),e=>e.code==='restored_local_participant_closed');assert.throws(()=>reserveGroup([{id:'unreturned',family:'local-operation-snapshot',operation:value}]),e=>e.code==='restored_local_participant_closed');}],
 ['witness',RestoredLocalParticipantWitness,value=>{assert.throws(()=>value.check(),e=>e.code==='restored_local_handoff_closed');assert.throws(()=>value.release(),e=>e.code==='restored_local_handoff_closed');}],
 ['uploads',RestoredLocalParticipantUploads,value=>{assert.throws(()=>value.check(),e=>e.code==='restored_local_uploads_closed');assert.throws(()=>value.release(),e=>e.code==='restored_local_uploads_closed');assert.throws(()=>value.close(),e=>e.code==='restored_local_uploads_closed');}],
])test(`unreturned snapshot ${label} constructor cannot issue operational custody`,async()=>{
 const f=await restoredLocalFixture(host,capture),freeze=Object.freeze;let parent,hits=0;
 try{Object.freeze=function(value){if(value instanceof Type){hits++;check(value);}return freeze(value);};parent=await Snapshot.begin(f.file,{...f.options,cohort:{parentDatabase:f.value.f.tag+'-publication-parent',uploadsDatabase:f.value.f.tag+'-publication-uploads'}});Object.freeze=freeze;assert.ok(hits>0);await parent.check();}
 finally{Object.freeze=freeze;await parent?.discardAndClose();await f.close();}
});
test('snapshot parent constructor rechecks its current grant before publication',async()=>{
 const f=await restoredLocalFixture(host,capture),freeze=Object.freeze;let parent,allowed=true,hits=0;
 const options={...f.options,cohort:{parentDatabase:f.value.f.tag+'-constructor-grant-parent',uploadsDatabase:f.value.f.tag+'-constructor-grant-uploads'},checkAuthority(){if(!allowed)throw Error('Constructor grant ended');}};
 try{Object.freeze=function(value){if(value instanceof Snapshot){hits++;allowed=false;}return freeze(value);};await assert.rejects(async()=>{parent=await Snapshot.begin(f.file,options);},e=>e.code==='participant_authority');Object.freeze=freeze;allowed=true;assert.equal(hits,1);parent=await Snapshot.resume(options);await parent.check();}
 finally{Object.freeze=freeze;allowed=true;await parent?.discardAndClose();await f.close();}
});
