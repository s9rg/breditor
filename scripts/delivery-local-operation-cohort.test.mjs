/** Development only: actual delivery packets and three distinct local families
 * share the existing kernel, without converting protocols or starting a relay. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {readFileSync} from 'node:fs';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {portableFixture} from './fixtures/independent-operation/portable.mjs';
import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {flatLocalFixture} from './fixtures/flat-local-operation/session.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {attachDelivery,deliveryDraft} from './fixtures/independent-delivery/session.mjs';
import {recoveryFactory} from './fixtures/independent-delivery-recovery/session.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {pixel,secondAsset} from './fixtures/review-assets/pixels.mjs';
const opened=new Map(),open=api.SharedIndependentDeliverySession.open;
api.SharedIndependentDeliverySession.open=async function(options){const source=await open.call(this,options);opened.set(options.database,source);return source;};
const {OperationalIndependentDeliveryParticipant:Delivery,reserveOperationalIndependentDeliveryGroup:reserveDelivery}=await import('../packages/breditor-collaboration/dist/independent_operation/participant.js');
api.SharedIndependentDeliverySession.open=open;
const {OperationalIndependentLocalParticipant:Legacy}=await import('../packages/breditor-collaboration/dist/independent_local_operation/participant.js');
const {OperationalRestoredLocalParticipant:Snapshot}=await import('../packages/breditor-collaboration/dist/restored_local_operation/participant.js');
const {OperationalFlatLocalParticipant:Flat}=await import('../packages/breditor-collaboration/dist/flat_local_operation/participant.js');
const {captureLocalOperationBackup:capture}=await import('../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js');
const {reserveLocalOperationCohort:reserveLocal}=await import('../packages/breditor-collaboration/dist/local_operation_cohort/cohort.js');
const {prepareOperationalCohort}=await import('../packages/breditor-collaboration/dist/operation_cohort/cohort.js');
const bytes=async file=>Buffer.from(await file.arrayBuffer()),runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname,seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));
let host,sequence=0,networkCalls=0;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:Legacy,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});
after(()=>{opened.clear();host?.free();assert.equal(networkCalls,0);});
async function fixture({documentSegmented=true,reviewSegmented=true,policy=()=>{}}={}){
 const rows=[];let restore=()=>{},parts,queues;
 try{
  const reset=environment();let f;
  try{f=await portableFixture({api,rich,Participant:Delivery,profile:host.profile,seed,tag:'delivery-cohort-seed-'+sequence++,selection:{documentSegmented,reviewSegmented},onToken(){networkCalls++;}});rows.push({id:'delivery',family:'independent-delivery',Class:Delivery,file:f.backup.file(),expected:f.backup.selection(),options:{...f.options,recovery:{...f.options.recovery,checkAuthority(){policy(0);}}},uploads:await bytes(f.backup.uploadBackup()),selected:f.selected});}
  finally{await f?.close();reset();}
  for(const[index,family,Class]of [[1,'independent-local',Legacy],[2,'local-operation-snapshot',Snapshot],[3,'local-operation-flat',Flat]]){
   const extra={writer:String([101,303,404,505][index]),actor:'delivery-local-'+index,documentSegmented,reviewSegmented};
   const f=family==='independent-local'?await host.fixture(extra):family==='local-operation-snapshot'?await restoredLocalFixture(host,capture,extra):await flatLocalFixture(host,extra);
   try{if(family==='independent-local')rows.push({id:'local-'+index,family,Class,file:f.file,expected:f.selection,options:{...f.options,recovery:{...f.options.recovery,checkAuthority(){policy(index);}}},uploads:f.uploadBytes,reference:f.reference});
    else{const value=family==='local-operation-snapshot'?f.value:f.original.value;rows.push({id:'local-'+index,family,Class,file:f.file,options:{...f.options,cohort:{parentDatabase:value.f.tag+'-delivery-local-parent',uploadsDatabase:value.f.tag+'-delivery-local-uploads'},checkAuthority(){policy(index);}},uploads:family==='local-operation-snapshot'?f.value.uploads:await bytes(f.whole),reference:value.f.reference});}
   }finally{await f.close();}
  }
  restore=environment();
  for(const row of rows){if(row.family==='independent-delivery'||row.family==='independent-local'){
    const Backup=row.family==='independent-delivery'?api.SharedIndependentDeliveryParticipantBackup:api.SharedIndependentParticipantBackup,Recovery=row.family==='independent-delivery'?api.SharedIndependentDeliveryParticipantRecovery:api.SharedIndependentParticipantRecovery;
    row.backup=await Backup.read(row.file,row.expected);row.attempt=await Recovery.begin({...row.options.recovery,...(row.family==='independent-delivery'?{session:recoveryFactory(row.selected.options)}:{}),backup:row.backup});row.ready=await row.attempt.finish();row.parent=await row.Class.begin({...row.options,recovered:row.ready});
   }else row.parent=await row.Class.begin(row.file,row.options);row.before=row.parent.readableSource();row.foreign=await rich.RichAssetStore.openRetained(row.options.cohort?.uploadsDatabase??row.options.recovery.destinations.uploads);}
  rows[0].native=opened.get(rows[0].options.sourceDatabase);assert.ok(rows[0].native);queues=await attachDelivery(api,rows[0].native,rows[0].selected.options,{onToken(){networkCalls++;}});
  return{rows,queues,async take(){const groups=[];try{const delivery=reserveDelivery([rows[0].parent]);groups.push(delivery);const local=reserveLocal(rows.slice(1).map(r=>({id:r.id,family:r.family,operation:r.parent})));groups.push(local);const h=await prepareOperationalCohort(groups,async()=>Object.freeze({participants:Object.freeze([{id:rows[0].id,family:rows[0].family,parts:delivery.states[0]},...local.states.map(r=>({id:r.id,family:r.family,parts:r.parts}))])}),()=>{},()=>{},()=>Error('Closed delivery/local cohort'));parts=h.commit().participants;return parts;}finally{for(const g of groups)g.abandon();}},async retryable(){for(const row of rows){await row.parent.check();await assert.rejects(row.foreign.retry(secondAsset),e=>e.code==='asset_custody_busy');}},async close(){try{for(const row of parts??[]){await row.parts.source.session.discardAndClose();row.parts.uploads.close();}for(const row of rows.toReversed()){row.foreign?.close();await row.parent?.discardAndClose();await row.ready?.discardAndClose();await row.attempt?.close();row.backup?.dispose();}}finally{restore();}}};
 }catch(error){try{for(const row of rows.toReversed()){row.foreign?.close();await row.parent?.discardAndClose();await row.ready?.discardAndClose();await row.attempt?.close();row.backup?.dispose();}}finally{restore();}throw error;}
}
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test(`delivery plus all three local families preserve complete native/packet state and cold continuation, ${documentSegmented}/${reviewSegmented}`,async()=>{
 const f=await fixture({documentSegmented,reviewSegmented});let parts;
 try{parts=await f.take();for(const[index,row]of f.rows.entries()){
   const p=parts[index].parts,source=p.source.session;assert.deepEqual(await bytes(await p.uploads.exportBackup()),row.uploads);await row.parent.close();
   if(index===0){const {independentDeliverySource}=await import('../packages/breditor-collaboration/dist/independent_delivery_source/admission.js');assert.deepEqual(independentDeliverySource(source).read(),row.before);assert.ok(row.before.retained.suggestions);assert.ok(row.before.retained.revisions);assert.ok(row.before.retained.versions);}
   else{assert.deepEqual(source.exportRecovery(),row.before);const provider=row.family==='independent-local'?p.original:p.input;assert.deepEqual(await bytes(provider.file()),await bytes(row.file));assert.deepEqual(await bytes(provider.blob(row.reference.asset,row.reference.generation)),pixel);}
   const document=source.core.documentJson();assert.equal(source.core.undo(),true,row.family+' Undo');assert.equal(source.core.redo(),true,row.family+' Redo');assert.equal(source.core.documentJson(),document);assert.equal(source.core.undoReview().kind,'committed');assert.equal(source.core.redoReview().kind,'committed');insertCleanupText(source.core,'Four-family continuation ');await source.flush();
   const later=index===0?(await import('../packages/breditor-collaboration/dist/independent_delivery_source/admission.js')).independentDeliverySource(source).read():source.exportRecovery();await source.close();p.uploads.close();row.parent=await row.Class.resume(row.options);assert.deepEqual(row.parent.readableSource(),later);}
  await f.take();
 }finally{await f.close();}
});
for(const lane of ['document','review','suggestion','version'])test(`last local authority cannot transfer an earlier changed delivery ${lane}`,async()=>{
 let f,armed=false,changed=false,last=0;const freeze=Object.freeze;
 f=await fixture({policy(index){if(armed&&index===3&&++last===2){changed=true;const source=f.rows[0].native;if(lane==='document')insertCleanupText(source.core,'Late delivery document ');else if(lane==='review')source.core.dispatchReview({kind:'create_thread',data:{anchorJson:source.core.captureReviewAnchor({kind:'document'}),body:'Late delivery review'}});else if(lane==='suggestion')f.queues.queue.propose('Late offline proposal','81',deliveryDraft('Not accepted text '));else f.queues.versions.saveVersion('Late offline version','82');}}});
 try{const accepted=f.rows[0].native.core.documentJson();Object.freeze=function(value){if(value&&Array.isArray(value.participants)&&value.participants.length===4)armed=true;return freeze(value);};await assert.rejects(f.take(),e=>e.code==='independent_operation_source_changed');Object.freeze=freeze;armed=false;assert.equal(changed,true);if(lane==='suggestion'||lane==='version')assert.equal(f.rows[0].native.core.documentJson(),accepted);await f.queues.queue.flush();await f.queues.versions.flush();await f.rows[0].native.flush();await f.retryable();await f.take();}
 finally{Object.freeze=freeze;armed=false;await f.close();}
});
test('unreturned delivery parents cannot expose their source or issue a group',async()=>{
 const freeze=Object.freeze;let f,hits=0;
 try{Object.freeze=function(value){if(value instanceof Delivery){hits++;assert.throws(()=>value.readableSource(),e=>e.code==='independent_operation_closed');assert.throws(()=>reserveDelivery([value]),e=>e.code==='independent_operation_closed');}return freeze(value);};f=await fixture();Object.freeze=freeze;assert.ok(hits>=2);await f.take();}
 finally{Object.freeze=freeze;await f?.close();}
});
test('delivery parts remain closed during every result construction',async()=>{
 const f=await fixture(),freeze=Object.freeze;let hits=0;
 try{Object.freeze=function(value){if(value&&Reflect.ownKeys(value).sort().join(',')==='source,uploads'){hits++;assert.throws(()=>value.source,e=>e.code==='independent_operation_closed');assert.throws(()=>value.uploads,e=>e.code==='independent_operation_closed');}return freeze(value);};await f.take();Object.freeze=freeze;assert.ok(hits>=2);}
 finally{Object.freeze=freeze;await f.close();}
});
