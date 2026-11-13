import {physicalCatalogV2Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {independentRecoverySignal} from '../independent_recovery/signal.js';
import {visitCompletedContinuedRoomRecovery} from '../continued_room_recovery/recovery.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import type {RecoveredContinuedRoomReconciliationOptions,RecoveredContinuedRoomReconciliationRead} from './contract.js';
import {readContinuedRoomReconciliation} from './read.js';
import {continuedReconciliationFailure as fail} from './asset_pins.js';

/** Hold the actual completed recovery destinations while a fresh operator
 * checks the same catalog's accepted prefixes and provider requirements. */
export async function readRecoveredContinuedRoomReconciliation(
 input:RecoveredContinuedRoomReconciliationOptions,
):Promise<RecoveredContinuedRoomReconciliationRead>{
 physicalCatalogV2Options(input,['recovery','reconciliation'],[]);
 const {recovery,reconciliation}=input;
 physicalCatalogV2Options(reconciliation,['host','checkAuthority'],
  ['signal','independentPolicies','deliveryPolicies','generationPolicies','originalPolicies','includeOperationArchives']);
 const policy={...reconciliation},selected={...recovery};
 const authority=participantAuthority(policy.checkAuthority);
 const waits=new NativeReconstructionWaits(authority,[
  independentRecoverySignal(selected.signal),independentRecoverySignal(policy.signal),
 ]);
 try{
  return await visitCompletedContinuedRoomRecovery({...selected,signal:waits.signal},async held=>{
   const check=()=>{held.check();waits.check();held.check();};
   const result=await readContinuedRoomReconciliation({...policy,catalog:selected.catalog,expected:held.recovery.catalog,
    checkAuthority:check,signal:waits.signal});
   check();
   // The recovered-destination observation requires the authenticated provider
   // to check every participant. Missing provider assets remain explicit.
   if(result.unreconciledParticipants.length||!result.provider||result.uploads.length!==held.recovery.participants.length)
    throw fail('incomplete');
   return Object.freeze({format:'breditor/recovered-continued-room-reconciliation-read',formatVersion:1,
    recovery:held.recovery,reconciliation:result});
  });
 }finally{waits.close();}
}
