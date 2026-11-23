/** Development only: delivery, restored graphs and three distinct local families
 * share the existing kernel, without converting protocols or starting a relay. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {SharedIndependentDeliverySession as Session} from '../packages/breditor-collaboration/dist/independent_delivery/session.js';
import * as rich from '@breditor/experimental-rich-content';
import {readFileSync} from 'node:fs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {pixel,secondAsset} from './fixtures/review-assets/pixels.mjs';
import {internalFailureChain} from '../packages/breditor-collaboration/dist/internal_failure_cause.js';
// Observe the genuine native sessions while loading the private source openers.
const opened=new Map();
const open=Session.open;
let Delivery,Restored,reserveDelivery,reserveRestored;
Session.open=async function(options){
 const owner=await open.call(this,options);
 opened.set(options.database,owner);
 return owner;
};
try{
 ({OperationalIndependentDeliveryParticipant:Delivery,reserveOperationalIndependentDeliveryGroup:reserveDelivery}=await import('../packages/breditor-collaboration/dist/independent_operation/participant.js'));
 ({RestoredOperationParticipant:Restored,reserveRestoredOperationGroup:reserveRestored}=await import('../packages/breditor-collaboration/dist/restored_participant/participant.js'));
}finally{
 Session.open=open;
}
const api=await import('../packages/breditor-collaboration/dist/index.js');
const {localParticipantUnitHost}=await import('./fixtures/independent-local-operation/participant.mjs');
const {portableFixture}=await import('./fixtures/independent-operation/portable.mjs');
const {restoredLocalFixture}=await import('./fixtures/restored-local-operation/session.mjs');
const {flatLocalFixture}=await import('./fixtures/flat-local-operation/session.mjs');
const {attachDelivery,deliveryDraft}=await import('./fixtures/independent-delivery/session.mjs');
const {recoveryFactory}=await import('./fixtures/independent-delivery-recovery/session.mjs');
const {captureIndependentOperationBackup:captureDelivery}=await import('../packages/breditor-collaboration/dist/independent_operation/portable_capture.js');
const {IndependentOperationLineageBackup:Lineage}=await import('../packages/breditor-collaboration/dist/independent_operation/lineage_archive.js');
const {restoredOperationJournalBinding}=await import('../packages/breditor-collaboration/dist/restored_operation/journal.js');
const {OperationalIndependentLocalParticipant:Legacy}=await import('../packages/breditor-collaboration/dist/independent_local_operation/participant.js');
const {OperationalRestoredLocalParticipant:Snapshot}=await import('../packages/breditor-collaboration/dist/restored_local_operation/participant.js');
const {OperationalFlatLocalParticipant:Flat}=await import('../packages/breditor-collaboration/dist/flat_local_operation/participant.js');
const {captureLocalOperationBackup:capture}=await import('../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js');
const {reserveLocalOperationCohort:reserveLocal}=await import('../packages/breditor-collaboration/dist/local_operation_cohort/cohort.js');
const {prepareOperationalCohort}=await import('../packages/breditor-collaboration/dist/operation_cohort/cohort.js');
const {handoffDeliveryOperationParticipants:handoffFive}=await import('../packages/breditor-collaboration/dist/delivery_operation_cohort/cohort.js');
const bytes=async file=>Buffer.from(await file.arrayBuffer()),runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname,seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));
let host,sequence=0,networkCalls=0;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:Legacy,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});
after(()=>{opened.clear();host?.free();assert.equal(networkCalls,0);});
export async function fixture({documentSegmented=true,reviewSegmented=true,restoredKind='snapshot-v1',policy=()=>{},signals=[]}={}){
 const rows=[];let restore=()=>{},parts,queues,restoredQueues;
 try{
  const reset=environment();let f;
  try{f=await portableFixture({api,rich,Participant:Delivery,profile:host.profile,seed,tag:'delivery-cohort-seed-'+sequence++,selection:{documentSegmented,reviewSegmented},onToken(){networkCalls++;}});rows.push({id:'delivery',family:'independent-delivery',Class:Delivery,file:f.backup.file(),expected:f.backup.selection(),options:{...f.options,recovery:{...f.options.recovery,...(signals[0]?{signal:signals[0]}:{}),checkAuthority(){policy(0);}}},uploads:await bytes(f.backup.uploadBackup()),selected:f.selected});}
  finally{await f?.close();reset();}
  const resetRestored=environment();let restoredSeed,input,graph;
  try{const tag='restored-cohort-seed-'+sequence++;restoredSeed=await portableFixture({api,rich,Participant:Delivery,profile:host.profile,seed,tag,selection:{writer:'606',actor:'restored-cohort-comments',documentSegmented,reviewSegmented},onToken(){networkCalls++;}});insertCleanupText(restoredSeed.source.core,'Restored cohort seed LIVE ');await restoredSeed.source.flush();
   const captured=await captureDelivery({source:restoredSeed.source,assets:restoredSeed.uploads,...restoredSeed.readOptions});assert.equal(captured.kind,'ready');input=captured.backup;if(restoredKind==='lineage-v1')graph=await Lineage.append(input,input,restoredSeed.readOptions);const selected=graph??input;
   rows.push({id:'restored',family:'restored-graph',Class:Restored,file:selected.file(),options:{kind:restoredKind,expected:selected.selection(),database:tag+'-parent',journalDatabase:tag+'-journal',sourceDatabase:tag+'-source',uploadsDatabase:tag+'-uploads',writerRecovery:'host-reacquired',session:recoveryFactory(restoredSeed.selected.options,{readOnly:false,access:'moderate'}),...(signals[1]?{signal:signals[1]}:{}),checkAuthority(){policy(1);}},uploads:await bytes(input.uploadBackup()),selected:restoredSeed.selected});
  }finally{graph?.dispose();input?.dispose();await restoredSeed?.close();resetRestored();}
  for(const[index,family,Class]of [[1,'independent-local',Legacy],[2,'local-operation-snapshot',Snapshot],[3,'local-operation-flat',Flat]]){
   const extra={writer:String([101,303,404,505][index]),actor:'delivery-local-'+index,documentSegmented,reviewSegmented},policyIndex=index+1;
   const f=family==='independent-local'?await host.fixture(extra):family==='local-operation-snapshot'?await restoredLocalFixture(host,capture,extra):await flatLocalFixture(host,extra);
   try{if(family==='independent-local')rows.push({id:'local-'+index,family,Class,file:f.file,expected:f.selection,options:{...f.options,recovery:{...f.options.recovery,...(signals[policyIndex]?{signal:signals[policyIndex]}:{}),checkAuthority(){policy(policyIndex);}}},uploads:f.uploadBytes,reference:f.reference});
    else{const value=family==='local-operation-snapshot'?f.value:f.original.value;rows.push({id:'local-'+index,family,Class,file:f.file,options:{...f.options,...(signals[policyIndex]?{signal:signals[policyIndex]}:{}),cohort:{parentDatabase:value.f.tag+'-delivery-local-parent',uploadsDatabase:value.f.tag+'-delivery-local-uploads'},checkAuthority(){policy(policyIndex);}},uploads:family==='local-operation-snapshot'?f.value.uploads:await bytes(f.whole),reference:value.f.reference});}
   }finally{await f.close();}
  }
  restore=environment();
  for(const row of rows){if(row.family==='independent-delivery'||row.family==='independent-local'){
    const Backup=row.family==='independent-delivery'?api.SharedIndependentDeliveryParticipantBackup:api.SharedIndependentParticipantBackup,Recovery=row.family==='independent-delivery'?api.SharedIndependentDeliveryParticipantRecovery:api.SharedIndependentParticipantRecovery;
    row.backup=await Backup.read(row.file,row.expected);row.attempt=await Recovery.begin({...row.options.recovery,...(row.family==='independent-delivery'?{session:recoveryFactory(row.selected.options)}:{}),backup:row.backup});row.ready=await row.attempt.finish();row.parent=await row.Class.begin({...row.options,recovered:row.ready});
   }else{row.parent=await row.Class.begin(row.file,row.options);if(row.family==='restored-graph')await row.parent.finish();}row.before=row.parent.readableSource();row.foreign=await rich.RichAssetStore.openRetained(row.options.cohort?.uploadsDatabase??row.options.uploadsDatabase??row.options.recovery.destinations.uploads);}
  rows[0].native=opened.get(rows[0].options.sourceDatabase);assert.ok(rows[0].native);queues=await attachDelivery(api,rows[0].native,rows[0].selected.options,{onToken(){networkCalls++;}});
  rows[1].native=opened.get(rows[1].options.sourceDatabase);assert.ok(rows[1].native);restoredQueues=await attachDelivery(api,rows[1].native,rows[1].selected.options,{onToken(){networkCalls++;}});
  return{rows,queues,restoredQueues,async take(split=false){if(!split){parts=(await handoffFive(rows.map(r=>({id:r.id,family:r.family,operation:r.parent})))).participants;return parts;}const groups=[];try{const delivery=reserveDelivery([rows[0].parent]);groups.push(delivery);const restored=reserveRestored([rows[1].parent]);groups.push(restored);const local=reserveLocal(rows.slice(2).map(r=>({id:r.id,family:r.family,operation:r.parent})));groups.push(local);const h=await prepareOperationalCohort(groups,async()=>Object.freeze({participants:Object.freeze([{id:rows[0].id,family:rows[0].family,parts:delivery.states[0]},{id:rows[1].id,family:rows[1].family,parts:restored.states[0]},...local.states.map(r=>({id:r.id,family:r.family,parts:r.parts}))])}),()=>{},()=>{},()=>Error('Closed delivery/restored/local cohort'));parts=h.commit().participants;return parts;}finally{for(const g of groups)g.abandon();}},async retryable(){for(const row of rows){await row.parent.check();await assert.rejects(row.foreign.retry(secondAsset),e=>e.code==='asset_custody_busy');}},async close(){try{for(const row of parts??[]){await row.parts.source.session.discardAndClose();row.parts.uploads.close();}for(const row of rows.toReversed()){row.foreign?.close();await row.parent?.discardAndClose();await row.ready?.discardAndClose();await row.attempt?.close();row.backup?.dispose();}}finally{restore();}}};
 }catch(error){try{for(const row of rows.toReversed()){row.foreign?.close();await row.parent?.discardAndClose();await row.ready?.discardAndClose();await row.attempt?.close();row.backup?.dispose();}}finally{restore();}throw error;}
}
for(const restoredKind of ['snapshot-v1','lineage-v1'])for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test(`all five delivery/local families preserve complete native/packet state and cold continuation, ${restoredKind}/${documentSegmented}/${reviewSegmented}`,async()=>{
 const f=await fixture({documentSegmented,reviewSegmented,restoredKind});let parts;
 try{parts=await f.take();for(const[index,row]of f.rows.entries()){
   const p=parts[index].parts,source=p.source.session;assert.deepEqual(await bytes(await p.uploads.exportBackup()),row.uploads);await row.parent.close();
   if(index<2){const {independentDeliverySource}=await import('../packages/breditor-collaboration/dist/independent_delivery_source/admission.js');const port=independentDeliverySource(source);assert.deepEqual(port.read(),row.before);assert.ok(row.before.retained.suggestions);assert.ok(row.before.retained.revisions);assert.ok(row.before.retained.versions);if(index===1)assert.deepEqual(await bytes(restoredOperationJournalBinding(port.operation).inputFile()),await bytes(row.file));}
   else{assert.deepEqual(source.exportRecovery(),row.before);const provider=row.family==='independent-local'?p.original:p.input;assert.deepEqual(await bytes(provider.file()),await bytes(row.file));assert.deepEqual(await bytes(provider.blob(row.reference.asset,row.reference.generation)),pixel);}
   const document=source.core.documentJson();assert.equal(source.core.undo(),true,row.family+' Undo');assert.equal(source.core.redo(),true,row.family+' Redo');assert.equal(source.core.documentJson(),document);assert.equal(source.core.undoReview().kind,'committed');assert.equal(source.core.redoReview().kind,'committed');insertCleanupText(source.core,'Four-family continuation ');await source.flush();
   const later=index<2?(await import('../packages/breditor-collaboration/dist/independent_delivery_source/admission.js')).independentDeliverySource(source).read():source.exportRecovery();await source.close();p.uploads.close();row.parent=await row.Class.resume(row.options);if(row.family==='restored-graph')await row.parent.finish();assert.deepEqual(row.parent.readableSource(),later);}
  await f.take();
 }finally{await f.close();}
});
for(const lane of ['document','review','suggestion','version'])test(`last local authority cannot transfer an earlier changed restored-graph ${lane}`,async()=>{
 let f,armed=false,changed=false,last=0;const freeze=Object.freeze;
 f=await fixture({policy(index){if(armed&&index===4&&++last===2){changed=true;const source=f.rows[1].native;if(lane==='document')insertCleanupText(source.core,'Late restored document ');else if(lane==='review')source.core.dispatchReview({kind:'create_thread',data:{anchorJson:source.core.captureReviewAnchor({kind:'document'}),body:'Late restored review'}});else if(lane==='suggestion')f.restoredQueues.queue.propose('Late offline proposal','81',deliveryDraft('Not accepted text '));else f.restoredQueues.versions.saveVersion('Late offline version','82');}}});
 try{const accepted=f.rows[1].native.core.documentJson();Object.freeze=function(value){if(value&&Array.isArray(value.participants)&&value.participants.length===5)armed=true;return freeze(value);};await assert.rejects(f.take(),e=>e.code==='restored_participant_source_changed');Object.freeze=freeze;armed=false;assert.equal(changed,true);if(lane==='suggestion'||lane==='version')assert.equal(f.rows[1].native.core.documentJson(),accepted);await f.restoredQueues.queue.flush();await f.restoredQueues.versions.flush();await f.rows[1].native.flush();await f.retryable();await f.take();}
 finally{Object.freeze=freeze;armed=false;await f.close();}
});
test('unreturned delivery parents cannot expose their source or issue a group',async()=>{
 const freeze=Object.freeze;let f,hits=0;
 try{Object.freeze=function(value){if(value instanceof Delivery){hits++;assert.throws(()=>value.readableSource(),e=>e.code==='independent_operation_closed');assert.throws(()=>reserveDelivery([value]),e=>e.code==='independent_operation_closed');}return freeze(value);};f=await fixture();Object.freeze=freeze;assert.ok(hits>=2);await f.take();}
 finally{Object.freeze=freeze;await f?.close();}
});
test('delivery and restored parts remain closed during every result construction',async()=>{
 const f=await fixture(),freeze=Object.freeze;let hits=0;
 try{Object.freeze=function(value){if(value&&Reflect.ownKeys(value).sort().join(',')==='source,uploads'){hits++;assert.throws(()=>value.source,e=>['independent_operation_closed','restored_participant_closed'].includes(e.code));assert.throws(()=>value.uploads,e=>['independent_operation_closed','restored_participant_closed'].includes(e.code));}return freeze(value);};await f.take();Object.freeze=freeze;assert.ok(hits>=4);}
 finally{Object.freeze=freeze;await f.close();}
});
test('five-family router refuses fake, duplicate, wrong-family, empty and sparse members without consuming real custody',async()=>{
 const f=await fixture();
 try{const rows=f.rows.map(r=>({id:r.id,family:r.family,operation:r.parent}));for(const values of [[],Array(2),[rows[0],{...rows[1],operation:{ready:true}}],[rows[0],{...rows[1],operation:rows[0].operation}],[rows[0],{...rows[1],id:rows[0].id}],[{...rows[0],family:'independent-local'}]]){await assert.rejects(handoffFive(values));await f.retryable();}await f.take(true);}
 finally{await f.close();}
});
for(const firstIndex of [0,1,2,3])test(`overridden signal getters cannot run after an earlier member has passed its final native fence, family=${firstIndex}`,async()=>{
 let f,armed=false,firstFinalRead=false,changed=false,last=0;const freeze=Object.freeze,aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get,first=new AbortController(),final=new AbortController();
 Object.defineProperty(first.signal,'aborted',{configurable:true,get(){if(armed&&last>=2)firstFinalRead=true;return aborted.call(first.signal);}});
 Object.defineProperty(final.signal,'aborted',{configurable:true,get(){if(armed&&firstFinalRead&&!changed){changed=true;insertCleanupText(f.rows[0].native.core,'Getter changed an already checked member ');}return aborted.call(final.signal);}});
 const signals=Array(5);signals[firstIndex]=first.signal;signals[4]=final.signal;f=await fixture({signals,policy(index){if(armed&&index===4)last++;}});
 try{Object.freeze=function(value){if(value&&Array.isArray(value.participants)&&value.participants.length===5)armed=true;return freeze(value);};const parts=await f.take();Object.freeze=freeze;armed=false;assert.equal(changed,false,'No caller getter may enter the final callback-free pass');assert.equal(firstFinalRead,false);const {independentDeliverySource}=await import('../packages/breditor-collaboration/dist/independent_delivery_source/admission.js');assert.deepEqual(independentDeliverySource(parts[0].parts.source.session).read(),f.rows[0].before);}
 finally{Object.freeze=freeze;armed=false;await f.close();}
});
for(const cancelledIndex of [0,1,2,3,4])test(`real late cancellation refuses the whole cohort without transferring any upload owner, family=${cancelledIndex}`,async()=>{
 let armed=false,last=0;const freeze=Object.freeze,controller=new AbortController(),signals=Array(5);signals[cancelledIndex]=controller.signal;
 const f=await fixture({signals,policy(index){if(armed&&index===4&&++last===2)controller.abort();}});
 try{
  Object.freeze=function(value){if(value&&Array.isArray(value.participants)&&value.participants.length===5)armed=true;return freeze(value);};
  // Cancelling the currently executing family's guard retains its established
  // authority-error wrappers. Require the exact cancellation cause chain rather
  // than accepting an arbitrary refusal or changing the existing error contract.
  const expected=cancelledIndex===4?['participant_authority','participant_authority','asset_bytes_aborted']:['asset_bytes_aborted'];
  await assert.rejects(f.take(),error=>{assert.deepEqual(internalFailureChain(error).map(e=>e.code),expected);return true;});Object.freeze=freeze;armed=false;assert.equal(controller.signal.aborted,true);
  for(const[index,row]of f.rows.entries()){await assert.rejects(row.foreign.retry(secondAsset),error=>error.code==='asset_custody_busy');if(index!==cancelledIndex)await row.parent.check();}
 }finally{Object.freeze=freeze;armed=false;await f.close();}
});
