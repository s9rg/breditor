import {continuedCatalogGenerationBackup,continuedCatalogInventory,type SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {inspectLocalNativePrefix} from '../continued_participant/inventory.js';
import type {ContinuedRoomGenerationRecoveryPolicy} from '../continued_room_recovery/contract.js';
import {SharedRichEditor} from '../core.js';
import {SharedGenerationParticipantBackup,generationParticipantAssetMetadata} from '../generation_participant/backup.js';
import {replayGenerationReferenceRecords} from '../generation_source/record_reference_capture.js';
import {recordedGenerationReferences} from '../generation_source/recorded_references.js';
import {generationRecords} from '../generation_source/records.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {transportVersion} from '../relay/validation.js';
import type {SharedAssetCaptureRecord} from '../asset_references_capture.js';
import {checkInventoryStores} from '../room_participant_inventory/stores.js';
import type {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {continuedReconciliationFailure as fail} from './asset_pins.js';

const {records,sourceRecovery}=SharedGenerationParticipantBackup.prototype;
const {verifySegmentedRecoveryOrigin}=SharedRichEditor.prototype;
const inventoryMetadata=SharedServerLogGenerationParticipantInventory.prototype.metadata;

/** Admit the original generation records and check their prefixes at the selected room cut. */
export async function inspectGenerationRoomPrefix(
 archive:SharedContinuedRoomCatalog,policy:ContinuedRoomGenerationRecoveryPolicy,waits:NativeReconstructionWaits,
){
 const backup=continuedCatalogGenerationBackup(archive,policy.id),inventory=continuedCatalogInventory(archive);
 const {participant,principal,source}=policy.expected.identity;
 const selected=records.call(backup),metadata=generationParticipantAssetMetadata(backup);
 const recovery=sourceRecovery.call(backup),room=inventoryMetadata.call(inventory).native;
 const writer=source.native.writer;
 if(source.relay){
  const registered=room.writers.find(row=>row.clock.writer===writer);
  const review=source.relay.review;
  const registeredReview=room.review?.writers.find(row=>row.clock.actor===review?.actor);
  if(!registered||registered.principal!==principal||
     transportVersion(source.relay.document.writerTransport)!==room.room.writerTransportVersion||
     review&&(!registeredReview||registeredReview.principal!==principal||
      registeredReview.observer!==(review.reviewEditing==='read_only')||review.binding!==room.review?.binding))throw fail('policy');
  if('relay'in recovery){
   // Replay admits the saved digest against native history. The selected room also bounds the saved counters.
   const documentAck=recovery.relay.document.accepted,reviewAck=recovery.relay.review?.accepted;
   if(documentAck&&BigInt(documentAck.through)>BigInt(registered.clock.through)||
      reviewAck&&(!registeredReview||BigInt(reviewAck.through)>BigInt(registeredReview.clock.through)))throw fail('diverged');
  }
 }
 if('retained'in recovery){
  const rows:SharedAssetCaptureRecord[]=[];
  if(recovery.retained.suggestions)rows.push({kind:'suggestions',json:JSON.stringify(recovery.retained.suggestions)});
  if(recovery.retained.revisions)rows.push({kind:'suggestion-revisions',json:JSON.stringify(recovery.retained.revisions)});
  if(recovery.retained.versions)rows.push({kind:'version-catalog',json:JSON.stringify(recovery.retained.versions)});
  checkInventoryStores(room,rows,principal,writer);
 }
 const factory=policy.session;
 let restoreSegmented,restoreContinued;
 if(factory.kind==='continued-local'){
  const profile=factory.options.profile,room=source.native.room;
  const segmented=waits.restore(profile.restore_segmented!,profile);
  const continued=waits.restore(profile.restore_continued_history!,profile);
  restoreSegmented=(checkpoint:string)=>segmented(room,checkpoint);
  restoreContinued=(checkpoint:string)=>continued(room,checkpoint);
 }else restoreSegmented=waits.restore(factory.options.restoreSegmented,factory.options);
 const binding=nativeRestoreBinding(restoreSegmented,factory.options),editor=factory.options.editor;
 const replica=await replayGenerationReferenceRecords(source,selected,binding,editor,undefined,waits.check,restoreContinued);
 try{
  if(replica.recovery.format==='breditor/shared-continued-history-backup'){
   const predecessor=await replayGenerationReferenceRecords({...source,kind:'local'},
    generationRecords(replica.recovery.predecessor),binding,editor,undefined,waits.check);
   try{verifySegmentedRecoveryOrigin.call(replica.core,predecessor.core);waits.check();}
   finally{predecessor.dispose();}
  }
  const {references,pending}=recordedGenerationReferences(replica.core,source,selected,replica.check);
  if(pending.length||native.view.call(replica.core).revision!==metadata.revision||
     JSON.stringify(references)!==JSON.stringify(metadata.bindings.map(({asset,generation})=>({asset,generation}))))
   throw fail('diverged');
  const prefix=inspectLocalNativePrefix(replica.core,inventory,participant,principal,source,replica.check);
  return {prefix,boundActor:source.relay?.review?.actor};
 }finally{replica.dispose();}
}
