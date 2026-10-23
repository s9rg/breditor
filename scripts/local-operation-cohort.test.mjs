/** Actual three-family prerequisite: genuine legacy native owners use the same
 * shared kernel without relabelling their original file/provider as a snapshot. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {pixel,secondAsset} from './fixtures/review-assets/pixels.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
const opened=new Map(),open=api.SharedIndependentHistoryPersistentSession.open;
api.SharedIndependentHistoryPersistentSession.open=async function(o){const s=await open.call(this,o);opened.set(o.database,s);return s;};
const {OperationalIndependentLocalParticipant:Parent,reserveOperationalIndependentLocalGroup:reserve}=await import('../packages/breditor-collaboration/dist/independent_local_operation/participant.js');
api.SharedIndependentHistoryPersistentSession.open=open;
const {prepareOperationalCohort}=await import('../packages/breditor-collaboration/dist/operation_cohort/cohort.js');
const {OperationalRestoredLocalParticipant:Snapshot}=await import('../packages/breditor-collaboration/dist/restored_local_operation/participant.js');
const {OperationalFlatLocalParticipant:Flat}=await import('../packages/breditor-collaboration/dist/flat_local_operation/participant.js');
const {reserveNativeInputParticipantGroup:reserveIncoming}=await import('../packages/breditor-collaboration/dist/native_input_operation/cohort.js');
const {handoffLocalOperationCohort,reserveLocalOperationCohort}=await import('../packages/breditor-collaboration/dist/local_operation_cohort/cohort.js');
const {captureLocalOperationBackup:capture}=await import('../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js');
const {restoredLocalFixture}=await import('./fixtures/restored-local-operation/session.mjs');
const {flatLocalFixture}=await import('./fixtures/flat-local-operation/session.mjs');
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname,bytes=async file=>Buffer.from(await file.arrayBuffer());
let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:Parent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});
after(()=>{opened.clear();host?.free();});
async function fixture(policy=()=>{}){
 const rows=[];let restore=()=>{},parts;
 try{
  for(const index of [0,1]){const f=await host.fixture({writer:index?'303':'101',actor:'legacy-cohort-'+index});try{rows.push({file:f.file,expected:f.selection,options:{...f.options,recovery:{...f.options.recovery,checkAuthority(){policy(index);}}},uploads:f.uploadBytes,reference:f.reference});}finally{await f.close();}}
  restore=environment();
  for(const row of rows){row.backup=await api.SharedIndependentParticipantBackup.read(row.file,row.expected);row.attempt=await api.SharedIndependentParticipantRecovery.begin({...row.options.recovery,backup:row.backup});row.ready=await row.attempt.finish();row.parent=await Parent.begin({...row.options,recovered:row.ready});row.native=opened.get(row.options.sourceDatabase);assert.ok(row.native);row.foreign=await rich.RichAssetStore.openRetained(row.options.recovery.destinations.uploads);}
  return{rows,async take(split=false){const groups=[];try{if(split)for(const row of rows)groups.push(reserve([row.parent]));else groups.push(reserve(rows.map(r=>r.parent)));const h=await prepareOperationalCohort(groups,async()=>Object.freeze({participants:Object.freeze(groups.flatMap(g=>[...g.states]))}),()=>{},()=>{},()=>Error('Closed legacy cohort'));parts=h.commit().participants;return parts;}finally{for(const g of groups)g.abandon();}},async retryable(){for(const row of rows){await row.parent.check();await assert.rejects(row.foreign.cancel(secondAsset),e=>e.code==='asset_custody_busy');}},async close(){try{for(const p of parts??[]){await p.source.session.discardAndClose();p.uploads.close();}for(const row of rows.toReversed()){row.foreign?.close();await row.parent?.discardAndClose();await row.ready?.discardAndClose();await row.attempt?.close();row.backup?.dispose();}}finally{restore();}}};
 }catch(error){try{for(const row of rows.toReversed()){row.foreign?.close();await row.parent?.discardAndClose();await row.ready?.discardAndClose();await row.attempt?.close();row.backup?.dispose();}}finally{restore();}throw error;}
}
for(const split of [false,true])test(`legacy actual writers preserve original providers and cold continuation, split=${split}`,async()=>{
 const f=await fixture();
 try{const before=f.rows.map(r=>r.parent.readableSource()),parts=await f.take(split);
  for(const [index,row] of f.rows.entries()){const p=parts[index],source=p.source.session;assert.equal(source,row.native);assert.deepEqual(source.exportRecovery(),before[index]);assert.deepEqual(await bytes(await p.uploads.exportBackup()),row.uploads);assert.deepEqual(await bytes(p.original.file()),await bytes(row.file));assert.deepEqual(await bytes(p.original.blob(row.reference.asset,row.reference.generation)),pixel);assert.equal(Object.hasOwn(p,'input'),false);
   await row.parent.close();const doc=source.core.documentJson();assert.equal(source.core.undo(),true);assert.equal(source.core.redo(),true);assert.equal(source.core.documentJson(),doc);assert.equal(source.core.undoReview().kind,'committed');assert.equal(source.core.redoReview().kind,'committed');insertCleanupText(source.core,'Legacy grouped continuation ');await source.flush();row.later=source.exportRecovery();await source.close();p.uploads.close();row.parent=await Parent.resume(row.options);assert.deepEqual(row.parent.readableSource(),row.later);}
  const again=await f.take(split);for(const [index,row] of f.rows.entries()){assert.deepEqual(again[index].source.session.exportRecovery(),row.later);assert.deepEqual(await bytes(again[index].original.file()),await bytes(row.file));}
 }finally{await f.close();}
});
for(const split of [false,true])for(const lane of ['document','review','seal-document','seal-review'])test(`legacy last callback changing an earlier ${lane} consumes no member, split=${split}`,async()=>{
 let armed=false,changed=false,grants=0,f;const freeze=Object.freeze;
 f=await fixture(index=>{if(armed&&index===1&&++grants===2){changed=true;const core=f.rows[0].native.core;if(lane==='document')insertCleanupText(core,'Legacy late cross-member edit ');else if(lane==='review')core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Legacy cross-member review'}});else if(lane==='seal-document')core.sealHistoryGeneration('legacy-final-seal');else core.sealReviewHistoryGeneration('legacy-final-seal');}});
 try{
  // A legal generation seal needs a nonempty active segment. Populate it
  // BEFORE witness capture; only the final callback changes its generation.
  if(lane==='seal-document')insertCleanupText(f.rows[0].native.core,'Nonempty generation before capture ');
  if(lane==='seal-review'){const core=f.rows[0].native.core;core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Nonempty review generation before capture'}});}
  if(lane.startsWith('seal-'))await f.rows[0].native.flush();
  Object.freeze=function(v){if(v&&Array.isArray(v.participants)&&v.participants.length===2)armed=true;return freeze(v);};await assert.rejects(f.take(split),e=>e.code==='independent_local_participant_source_changed');Object.freeze=freeze;armed=false;assert.equal(changed,true);await f.rows[0].native.flush();await f.retryable();await f.take(split);}
 finally{Object.freeze=freeze;armed=false;await f.close();}
});
test('a late result construction failure preserves legacy owners and upload leases',async()=>{
 const f=await fixture(),freeze=Object.freeze;
 try{Object.freeze=function(v){if(v&&Array.isArray(v.participants)&&v.participants.length===2)throw Error('Legacy result construction failed');return freeze(v);};await assert.rejects(f.take(),/Legacy result construction failed/);Object.freeze=freeze;await f.retryable();await f.take();}
 finally{Object.freeze=freeze;await f.close();}
});
test('duplicate and fake legacy parents issue no intrinsic group',async()=>{
 const f=await fixture();
 try{assert.throws(()=>reserve([f.rows[0].parent,f.rows[0].parent]));assert.throws(()=>reserve([f.rows[0].parent,{ready:true}]));await f.retryable();await f.take();}
 finally{await f.close();}
});
test('closed three-family router refuses fake, duplicate, wrong-family, empty and sparse members without consuming genuine owners',async()=>{
 const f=await fixture();
 try{const rows=f.rows.map((r,i)=>({id:'legacy-'+i,family:'independent-local',operation:r.parent}));for(const input of [[],Array(2),[rows[0],{...rows[1],operation:{ready:true}}],[rows[0],{...rows[1],operation:rows[0].operation}],[rows[0],{...rows[1],id:rows[0].id}],[rows[0],{...rows[1],family:'local-operation-flat'}]]){await assert.rejects(handoffLocalOperationCohort(input));await f.retryable();}const overridden=[rows[0],{...rows[1],operation:{ready:true}}];overridden.map=()=>[];assert.throws(()=>reserveLocalOperationCohort(overridden));await f.retryable();await f.take();}
 finally{await f.close();}
});
test('unreturned legacy parents cannot reserve a group during construction',async()=>{
 const freeze=Object.freeze;let hits=0,f;
 try{Object.freeze=function(value){if(value instanceof Parent){hits++;assert.throws(()=>value.readableSource(),e=>e.code==='independent_local_participant_closed');assert.throws(()=>reserve([value]),e=>e.code==='independent_local_participant_closed');}return freeze(value);};f=await fixture();Object.freeze=freeze;assert.equal(hits,2);await f.take();}
 finally{Object.freeze=freeze;await f?.close();}
});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test(`one actual kernel transfers all three local families, document=${documentSegmented}, review=${reviewSegmented}`,async()=>{
 const rows=[];let restore=()=>{},parts,groupLegacy,groupIncoming;
 try{
  const old=await host.fixture({writer:'101',actor:'three-legacy',documentSegmented,reviewSegmented});try{rows.push({family:'independent-local',file:old.file,expected:old.selection,options:old.options,reference:old.reference,uploads:old.uploadBytes});}finally{await old.close();}
  for(const [family,writer,Class] of [['local-operation-snapshot','303',Snapshot],['local-operation-flat','404',Flat]]){
   const extra={writer,actor:'three-'+writer,documentSegmented,reviewSegmented},f=Class===Snapshot?await restoredLocalFixture(host,capture,extra):await flatLocalFixture(host,extra);
   try{const seed=Class===Snapshot?f.value:f.original.value;rows.push({family,Class,file:f.file,options:{...f.options,cohort:{parentDatabase:seed.f.tag+'-three-parent',uploadsDatabase:seed.f.tag+'-three-uploads'}},reference:seed.f.reference,uploads:Class===Snapshot?f.value.uploads:await bytes(f.whole)});}finally{await f.close();}
  }
  restore=environment();
  const oldRow=rows[0];oldRow.backup=await api.SharedIndependentParticipantBackup.read(oldRow.file,oldRow.expected);oldRow.attempt=await api.SharedIndependentParticipantRecovery.begin({...oldRow.options.recovery,backup:oldRow.backup});oldRow.ready=await oldRow.attempt.finish();oldRow.parent=await Parent.begin({...oldRow.options,recovered:oldRow.ready});
  for(const row of rows.slice(1))row.parent=await row.Class.begin(row.file,row.options);
  for(const row of rows)row.before=row.parent.readableSource();assert.equal(new Set(rows.map(row=>row.before.identity.native.writer)).size,3);
  groupLegacy=reserve([oldRow.parent]);groupIncoming=reserveIncoming(rows.slice(1).map((row,index)=>({id:'incoming-'+index,family:row.family,operation:row.parent})));
  const h=await prepareOperationalCohort([groupLegacy,groupIncoming],async()=>Object.freeze({participants:Object.freeze([{family:'independent-local',parts:groupLegacy.states[0]},...groupIncoming.states.map(row=>({family:row.family,parts:row.parts}))])}),()=>{},()=>{},()=>Error('Closed three-family group'));
  parts=h.commit().participants;assert.deepEqual(parts.map(row=>row.family),rows.map(row=>row.family));
  for(const [index,row] of rows.entries()){const p=parts[index].parts,provider=row.family==='independent-local'?p.original:p.input;assert.deepEqual(p.source.session.exportRecovery(),row.before);assert.deepEqual(await bytes(await p.uploads.exportBackup()),row.uploads);assert.deepEqual(await bytes(provider.file()),await bytes(row.file));assert.deepEqual(await bytes(provider.blob(row.reference.asset,row.reference.generation)),pixel);await row.parent.close();insertCleanupText(p.source.session.core,'All three families continue ');await p.source.session.flush();assert.notEqual(p.source.session.exportRecovery().documentCheckpoint,row.before.documentCheckpoint);}
 }finally{try{groupLegacy?.abandon();groupIncoming?.abandon();for(const row of parts??[]){await row.parts.source.session.discardAndClose();row.parts.uploads.close();}for(const row of rows.toReversed()){await row.parent?.discardAndClose();await row.ready?.discardAndClose();await row.attempt?.close();row.backup?.dispose();}}finally{restore();}}
});
