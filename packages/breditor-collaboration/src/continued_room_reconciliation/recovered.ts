import {physicalCatalogV2Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {independentRecoverySignal} from '../independent_recovery/signal.js';
import {visitCompletedContinuedRoomRecovery,type CompletedContinuedRoomRead,type ContinuedRoomDeliveryHandoff} from '../continued_room_recovery/recovery.js';
import {generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import type {RecoveredContinuedRoomReconciliationOptions,RecoveredContinuedRoomReconciliationRead} from './contract.js';
import {readContinuedRoomReconciliation} from './read.js';
import {continuedReconciliationFailure as fail} from './asset_pins.js';

/** Hold the actual completed recovery destinations while a fresh operator
 * checks the same catalog's accepted prefixes and provider requirements. */
export function readRecoveredContinuedRoomReconciliation(
 input:RecoveredContinuedRoomReconciliationOptions,
):Promise<RecoveredContinuedRoomReconciliationRead>{
 return withRecoveredContinuedRoomReconciliation(input,async read=>read);
}

/** The SDK consumer runs within the completed journal's read scope. */
export async function withRecoveredContinuedRoomReconciliation<T>(
 input:RecoveredContinuedRoomReconciliationOptions,
 visit:(read:RecoveredContinuedRoomReconciliationRead,held:CompletedContinuedRoomRead,
  host:ReturnType<typeof generationRecoveryHostPort>,check:()=>void,signal:AbortSignal,
  reread:()=>Promise<RecoveredContinuedRoomReconciliationRead['reconciliation']>)=>Promise<T>,
 handoff?:ContinuedRoomDeliveryHandoff,
):Promise<T>{
 physicalCatalogV2Options(input,['recovery','reconciliation'],[]);
 const {recovery,reconciliation}=input;
 physicalCatalogV2Options(reconciliation,['host','checkAuthority'],
  ['signal','independentPolicies','deliveryPolicies','generationPolicies','originalPolicies','includeOperationArchives']);
 const policy={...reconciliation},selected={...recovery};
 const authority=participantAuthority(policy.checkAuthority),host=generationRecoveryHostPort(policy.host);
 const waits=new NativeReconstructionWaits(authority,[
  independentRecoverySignal(selected.signal),independentRecoverySignal(policy.signal),...host.signals,
 ]);
 try{
  return await visitCompletedContinuedRoomRecovery({...selected,signal:waits.signal},async held=>{
   const check=()=>{held.check();waits.check();held.check();};
   const reread=()=>readContinuedRoomReconciliation({...policy,catalog:selected.catalog,expected:held.recovery.catalog,
    checkAuthority:check,signal:waits.signal});
   const result=await reread();
   check();
   // The recovered-destination observation requires the authenticated provider
   // to check every participant. Missing provider assets remain explicit.
   if(result.unreconciledParticipants.length||!result.provider||result.uploads.length!==held.recovery.participants.length)
    throw fail('incomplete');
   const read=Object.freeze({format:'breditor/recovered-continued-room-reconciliation-read' as const,formatVersion:1 as const,
    recovery:held.recovery,reconciliation:result});
   const value=await visit(read,held,host,check,waits.signal,reread);
   check();
   return value;
  },handoff);
 }finally{waits.close();}
}
