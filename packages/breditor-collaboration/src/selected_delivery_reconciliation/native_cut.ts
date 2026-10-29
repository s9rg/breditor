/** Inspect the actual retained native clients inside the SAME complete record
 * reservation. Never construct editors from a DTO, borrow another source cut,
 * donate upload custody, reconnect, flush or alter either native Undo lane. */
import type {PhysicalOperationV3Custody} from '../physical_room_operation_v3/operation.js';
import type {PhysicalRecordCutVisit} from '../physical_room_operation_v3/record_cut.js';
import type {RetainedNativeClient} from '../complete_operation_cohort/retained_native_read.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {nativeHistoryIntrinsics as native} from '../native_history_read/intrinsics.js';
import {sourceCoreMethods} from '../source_native_read.js';
import {registerCapturedNativeHistory,capturedNativeHistoryRead,releaseCapturedNativeHistory} from '../native_history_read/registry.js';
import {inspectPhysicalOperationV3NativeAtInventory} from '../physical_room_operation_v3/native_read.js';
import {clock,prefixAt} from '../relay/validation.js';
import {reviewClock} from '../relay/review_validation.js';
import {frozen,SharedRoomParticipantInventoryError} from '../room_participant_inventory/policy.js';
import {SharedEditorError} from '../core.js';
import {checkSelectedDeliveryInventory,type SelectedDeliveryInventory} from './inventory.js';
import {checkSelectedRetainedStores} from '../selected_room_reconciliation/retained_stores.js';
import type {SelectedNativeCutParticipant} from '../selected_room_reconciliation/contract.js';
import type {SelectedDeliveryNativeCutWitness,SelectedDeliveryNativeCutRead} from './contract.js';
const fail=()=>new SharedRoomParticipantInventoryError('inventory_source','The actual retained native clients differ from the same complete selected cut');
const fork=()=>new SharedRoomParticipantInventoryError('inventory_fork','A native accepted-author prefix differs from the independently selected server cut');
export async function captureSelectedDeliveryNativeCut(state:PhysicalOperationV3Custody,clients:readonly RetainedNativeClient[],scope:PhysicalRecordCutVisit,rootCurrent:()=>void,inventory:SelectedDeliveryInventory):Promise<SelectedDeliveryNativeCutWitness>{
 rootCurrent();scope.assets.check();checkSelectedDeliveryInventory(inventory);const metadata=inventory.metadata,wire=metadata.room.writerTransportVersion;
 if(scope.assets.source.operationDatabase!==state.database||scope.assets.source.catalogDatabase!==state.held.database||JSON.stringify(scope.assets.source.catalog)!==JSON.stringify(state.held.state.selection)||clients.length!==scope.assets.participants.length||clients.length!==state.children.length)throw fail();
 const chosen=new Set<string>(),snapshots=clients.map(row=>{const pin=scope.assets.participants.find(value=>value.id===row.id);if(!pin||pin.family!==row.family||chosen.has(row.id))throw fail();chosen.add(row.id);
  const documentKind=native.documentKind.call(row.core)??'original',reviewKind=native.reviewKind.call(row.core),document=native.checkpointJson.call(row.core),review=reviewKind===null?null:(reviewKind==='segmented-v1'?native.reviewSegmentedCheckpoint:native.reviewCheckpoint).call(row.core),stamp=coreReadStamp(row.core),readOnly=sourceCoreMethods.view.call(row.core).readOnly;
  if(pin.native.document.kind!==documentKind||(pin.native.review.kind==='absent'?reviewKind!==null:pin.native.review.kind==='unselected'||pin.native.review.kind!==reviewKind))throw fail();
  if(!native.supportsWriterPrefixRead.call(row.core))throw new SharedEditorError('writer_prefix_unavailable','Complete selected-room reconciliation requires the matching native author-prefix capability');
  return{row,pin,documentKind:pin.native.document.kind,reviewKind,document,review,stamp,readOnly};
 });
 // Routine I/O fences use genuine facade epochs. Full native serialization is
 // reserved for actual cut/lineage/final-return boundaries, not every hash chunk.
 const nativeCurrent=()=>{rootCurrent();inventory.check();for(const value of snapshots){const stamp=coreReadStamp(value.row.core);if(stamp.document!==value.stamp.document||stamp.review!==value.stamp.review||(native.documentKind.call(value.row.core)??'original')!==value.documentKind||native.reviewKind.call(value.row.core)!==value.reviewKind)throw fail();}rootCurrent();inventory.check();};
 const finalCheck=()=>{nativeCurrent();for(const value of snapshots){if(native.checkpointJson.call(value.row.core)!==value.document||sourceCoreMethods.view.call(value.row.core).readOnly!==value.readOnly||(value.reviewKind===null?null:(value.reviewKind==='segmented-v1'?native.reviewSegmentedCheckpoint:native.reviewCheckpoint).call(value.row.core))!==value.review)throw fail();}nativeCurrent();};
 const current=()=>{nativeCurrent();scope.assets.check();nativeCurrent();},tokens:object[]=[];
 try{
  for(const value of snapshots){if(await scope.assets.digest(new Blob([value.document]))!==value.pin.native.document.sha256)throw fail();current();if(value.review!==null){const pin=value.pin.native.review;if(pin.kind==='absent'||pin.kind==='unselected'||await scope.assets.digest(new Blob([value.review]))!==pin.sha256)throw fail();current();}}
  finalCheck();const members=snapshots.map(value=>{const token=Object.freeze({});registerCapturedNativeHistory(token,value.row.core,{document:{kind:value.documentKind,checkpoint:value.document},review:value.reviewKind===null?null:{kind:value.reviewKind,checkpoint:value.review!}},current);tokens.push(token);return Object.freeze({id:value.row.id,family:value.row.family,native:capturedNativeHistoryRead(token)});});
  const prepared=state.children.map(row=>row.selected),ownStreams=inspectPhysicalOperationV3NativeAtInventory(state.held.state,prepared,{participants:members,checkCurrent:current},metadata),payloads=scope.recordPayloads(),participants:SelectedNativeCutParticipant[]=[],authors=[...metadata.writers.map(row=>({kind:'registered' as const,principal:row.principal,clock:row.clock})),...metadata.serverAuthors.map(row=>({...row,principal:null}))];let everyPrefix=true;
  if(payloads.length!==members.length)throw fail();
  for(const member of members){const identity=prepared.find(value=>value.target.id===member.id)?.identity;if(!identity)throw fail();const document=member.native.document,documentHeads=authors.map(row=>{const accepted=row.clock,local=clock(wire===2?document.writerClockV2(accepted.writer):document.writerClock(accepted.writer),accepted.writer),behind=BigInt(local.through)<BigInt(accepted.through);if(behind)everyPrefix=false;else if(prefixAt(document,accepted.writer,accepted.through,wire)!==accepted.prefixDigest)throw fork();return local.through;});
   const selectedReview=ownStreams.participants.find(row=>row.id===member.id)?.review,review=member.native.review,heads:string[]=[];
   if(selectedReview?.binding!==null&&selectedReview?.binding!==undefined){if(review.kind==='absent'||review.kind==='unselected')throw fail();for(const row of metadata.review?.writers??[]){const accepted=row.clock,head=reviewClock(review.reviewWriterClock(accepted.actor,row.principal),accepted.actor),behind=BigInt(head.through)<BigInt(accepted.through);if(behind)everyPrefix=false;else{const at=reviewClock(review.reviewWriterClock(accepted.actor,row.principal,accepted.through),accepted.actor);if(at.through!==accepted.through||at.prefixDigest!==accepted.prefixDigest)throw fork();}heads.push(head.through);}}
   const payload=payloads.find(row=>row.id===member.id);if(!payload||payload.family!==member.family)throw fail();const retainedStores=checkSelectedRetainedStores(payload,metadata,identity.principal,identity.writer);
   participants.push({id:member.id,family:member.family,documentHeads,review:{kind:selectedReview===null||selectedReview===undefined?'absent':selectedReview.binding===null?'unbound':'bound',binding:selectedReview?.binding??null,heads},retainedStores});current();
  }
  const complete=ownStreams.kind==='covered'&&everyPrefix&&participants.every(row=>row.review.kind!=='unbound');
  const data:SelectedDeliveryNativeCutRead=frozen({format:'breditor/selected-delivery-native-cut-read',formatVersion:1,scope:'retained-native-clients-against-authenticated-current-inventory',catalog:state.held.state.selection,control:inventory.selection,inventory:inventory.identity,kind:complete?'covered':'pending',ownStreams:{kind:ownStreams.kind,registeredStreamsCovered:ownStreams.registeredStreamsCovered,participants:ownStreams.participants,missing:ownStreams.missing,unreconciledParticipants:ownStreams.unreconciledParticipants},documentAuthors:authors.map(row=>({kind:row.kind,writer:row.clock.writer,principal:row.principal,acceptedThrough:row.clock.through})),reviewAuthors:(metadata.review?.writers??[]).map(row=>({actor:row.clock.actor,principal:row.principal,acceptedThrough:row.clock.through})),participants});current();finalCheck();return Object.freeze({data,finalCheck});
 }finally{for(const token of tokens.reverse())releaseCapturedNativeHistory(token);}
}
