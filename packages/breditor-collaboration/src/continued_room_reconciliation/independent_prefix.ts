import {continuedCatalogIndependentBackup,continuedCatalogInventory,type SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import {inspectLocalNativePrefix} from '../continued_participant/inventory.js';
import {localPortableReferences} from '../independent_local_operation/portable_references.js';
import {replayLocalOperationRecovery} from '../independent_local_operation/portable_replay.js';
import {independentRecoveryArchive as source} from '../independent_recovery/archive.js';
import type {ContinuedRoomIndependentRecoveryPolicy} from '../continued_room_recovery/contract.js';
import type {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {continuedReconciliationFailure} from './asset_pins.js';

/** Check an independent archive using a temporary native replica without opening local storage. */
export async function inspectIndependentRoomPrefix(
 archive:SharedContinuedRoomCatalog,policy:ContinuedRoomIndependentRecoveryPolicy,waits:NativeReconstructionWaits,
){
 const backup=continuedCatalogIndependentBackup(archive,policy.id),inventory=continuedCatalogInventory(archive);
 const metadata=source.metadata.call(backup),recovery=source.recovery.call(backup);
 const history=policy.session.documentHistory;
 const documentHistory=history.kind==='original'?
  {...history,restoreOriginal:waits.restore(history.restoreOriginal,history)}:
  {...history,restoreSegmented:waits.restore(history.restoreSegmented,history)};
 const replica=await replayLocalOperationRecovery(policy.expected,{...policy.session,documentHistory},recovery,waits.check);
 try{
  const {references,pending}=localPortableReferences(replica.core,replica.recovery,replica.check);
  if(pending.length||native.view.call(replica.core).revision!==metadata.revision||
     JSON.stringify(references)!==JSON.stringify(metadata.bindings.map(({asset,generation})=>({asset,generation}))))
   throw continuedReconciliationFailure('diverged');
  const {participant,principal,source:selected}=policy.expected.identity;
  return inspectLocalNativePrefix(replica.core,inventory,participant,principal,selected,()=>{
   replica.checkCurrent();waits.check();replica.checkCurrent();
  });
 }finally{replica.dispose();}
}
