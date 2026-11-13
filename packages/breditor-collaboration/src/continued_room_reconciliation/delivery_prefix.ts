import {continuedCatalogDeliveryBackup,continuedCatalogInventory,type SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {inspectLocalNativePrefix} from '../continued_participant/inventory.js';
import {deliveryRecoveryArchive as source} from '../independent_delivery_recovery/archive.js';
import {replayPortableRecovery} from '../independent_operation/portable_replay.js';
import {portableRecoveryReferences} from '../independent_operation/portable_references.js';
import {transportVersion} from '../relay/validation.js';
import {checkInventoryStores} from '../room_participant_inventory/stores.js';
import type {SharedAssetCaptureRecord} from '../asset_references_capture.js';
import {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import type {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import type {ContinuedRoomDeliveryRecoveryPolicy} from '../continued_room_recovery/contract.js';
import {continuedReconciliationFailure as fail} from './asset_pins.js';

const inventoryMetadata=SharedServerLogGenerationParticipantInventory.prototype.metadata;

/** Compare native prefixes and exact retained stores without treating a saved receipt as current authorization. */
export async function inspectDeliveryRoomPrefix(
 archive:SharedContinuedRoomCatalog,policy:ContinuedRoomDeliveryRecoveryPolicy,waits:NativeReconstructionWaits,
){
 const backup=continuedCatalogDeliveryBackup(archive,policy.id),inventory=continuedCatalogInventory(archive);
 const metadata=source.metadata.call(backup),recovery=source.recovery.call(backup),room=inventoryMetadata.call(inventory).native;
 const {participant,principal,source:selected}=policy.expected.identity;
 const writer=selected.history.native.writer,actor=selected.history.review.actor;
 const document=selected.binding.document,review=selected.binding.review;
 const registered=room.review?.writers.find(row=>row.clock.actor===actor);
 if(!registered||registered.principal!==principal||registered.observer!==(review.reviewEditing==='read_only')||
    review.binding!==room.review?.binding||transportVersion(document.writerTransport)!==room.room.writerTransportVersion)
  throw fail('policy');
 const rows:SharedAssetCaptureRecord[]=[];
 if(recovery.retained.suggestions)rows.push({kind:'suggestions',json:JSON.stringify(recovery.retained.suggestions)});
 if(recovery.retained.revisions)rows.push({kind:'suggestion-revisions',json:JSON.stringify(recovery.retained.revisions)});
 if(recovery.retained.versions)rows.push({kind:'version-catalog',json:JSON.stringify(recovery.retained.versions)});
 checkInventoryStores(room,rows,principal,writer);
 const history=policy.session.documentHistory;
 const documentHistory=history.kind==='original'?
  {...history,restoreOriginal:waits.restore(history.restoreOriginal,history)}:
  {...history,restoreSegmented:waits.restore(history.restoreSegmented,history)};
 const replica=await replayPortableRecovery({...policy.session,documentHistory,database:'continued-provider-read',
  create(){throw fail('policy');},
 },recovery,waits.check);
 try{
  const {references,pending}=portableRecoveryReferences(replica.core,recovery,replica.check);
  if(pending.length||native.view.call(replica.core).revision!==metadata.revision||
     JSON.stringify(references)!==JSON.stringify(metadata.bindings.map(({asset,generation})=>({asset,generation}))))
   throw fail('diverged');
  return inspectLocalNativePrefix(replica.core,inventory,participant,principal,selected.history,()=>{
   replica.checkCurrent();waits.check();replica.checkCurrent();
  });
 }finally{replica.dispose();}
}
