import {continuedCatalogIndependentBackup,continuedCatalogInventory,type SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {inspectLocalNativePrefix} from '../continued_participant/inventory.js';
import {localPortableReferences} from '../independent_local_operation/portable_references.js';
import {replayLocalOperationRecovery} from '../independent_local_operation/portable_replay.js';
import {independentRecoveryArchive as source} from '../independent_recovery/archive.js';
import type {ContinuedRoomIndependentRecoveryPolicy} from '../continued_room_recovery/contract.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import type {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {continuedReconciliationFailure} from './asset_pins.js';

/** Check an independent archive using a temporary native replica without opening local storage. */
export async function inspectIndependentRoomPrefix(
 archive:SharedContinuedRoomCatalog,policy:ContinuedRoomIndependentRecoveryPolicy,waits:NativeReconstructionWaits,
){
 const backup=continuedCatalogIndependentBackup(archive,policy.id),inventory=continuedCatalogInventory(archive);
 return inspectLocalArchivePrefix(inventory,policy.expected,policy.session,source.recovery.call(backup),waits,source.metadata.call(backup));
}

/** Snapshot and flat readers have already validated the asset union over their native cuts. */
export async function inspectLocalArchivePrefix(
 inventory:SharedServerLogGenerationParticipantInventory,expected:SharedIndependentParticipantSelection,
 session:SharedIndependentRecoveryFactory,recovery:SharedIndependentHistoryRecovery,waits:NativeReconstructionWaits,
 metadata?:ReturnType<typeof source.metadata>,
){
 const history=session.documentHistory;
 const documentHistory=history.kind==='original'?
  {...history,restoreOriginal:waits.restore(history.restoreOriginal,history)}:
  {...history,restoreSegmented:waits.restore(history.restoreSegmented,history)};
 const replica=await replayLocalOperationRecovery(expected,{...session,documentHistory},recovery,waits.check);
 try{
  if(metadata){
   const {references,pending}=localPortableReferences(replica.core,replica.recovery,replica.check);
   if(pending.length||native.view.call(replica.core).revision!==metadata.revision||
      JSON.stringify(references)!==JSON.stringify(metadata.bindings.map(({asset,generation})=>({asset,generation}))))
    throw continuedReconciliationFailure('diverged');
  }
  const {participant,principal,source:selected}=expected.identity;
  return inspectLocalNativePrefix(replica.core,inventory,participant,principal,selected,()=>{
   replica.checkCurrent();waits.check();replica.checkCurrent();
  });
 }finally{replica.dispose();}
}
