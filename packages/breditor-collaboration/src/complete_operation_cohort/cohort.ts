/** Closed seven-family native custody, not a serialized catalog adoption marker,
 * reconciliation result, room activation grant or replacement wire protocol. */
import {prepareMixedRoomWithDelivery} from '../mixed_room_operation/custody.js';
import {reserveDeliveryOperationCohort,type DeliveryOperationParticipant,type DeliveryOperationCohortMember} from '../delivery_operation_cohort/cohort.js';
import type {OperationalCohortHandoff,OperationalCohortReservation} from '../operation_cohort/cohort.js';
import type {RecoveryLease} from '../participant_recovery/lease.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {archiveFields} from '../archive_integrity/policy.js';
import {physicalCatalogName} from '../physical_room_catalog/policy.js';
import {roomFailure} from '../room_operation/errors.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {OperationalSharedParticipant} from '../participant_operation/operation.js';
import type {OperationalSharedParticipantParts} from '../participant_operation/types.js';
import type {OperationalSharedGenerationParticipant} from '../generation_operation/operation.js';
import type {OperationalSharedGenerationParticipantParts} from '../generation_operation/contract.js';
export type CompleteOperationParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |Readonly<{id:string;family:'original';operation:OperationalSharedParticipant<P>}>
 |Readonly<{id:string;family:'generation';operation:OperationalSharedGenerationParticipant<P>}>
 |DeliveryOperationParticipant<P>;
export type CompleteOperationMember<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |Readonly<{id:string;family:'original';parts:OperationalSharedParticipantParts<P>}>
 |Readonly<{id:string;family:'generation';parts:OperationalSharedGenerationParticipantParts<P>}>
 |DeliveryOperationCohortMember<P>;
export interface CompleteOperationParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly participants:readonly Readonly<CompleteOperationMember<P>>[]}
const failure=()=>roomFailure('room_operation_policy');
/** Reserve every actual owner synchronously, preserve its exact family/provider,
 * then use the same native/companion/upload barrier as the old mixed room path.
 * Original/generation release refusal still requires their established cold
 * resume; this function never clears their irreversible released state. */
export async function prepareCompleteOperationParticipants<P extends SharedSelectionPolicy>(provided:readonly CompleteOperationParticipant<P>[],databases:readonly IDBDatabase[],leases:readonly RecoveryLease[],beforeRelease:()=>Promise<void>,afterRelease:()=>void,released:()=>void,parent?:OperationalCohortReservation<never>):Promise<OperationalCohortHandoff<CompleteOperationParts<P>>>{
 const rows=snapshotInventoryInputs(provided,failure,value=>{const row=archiveFields(value,'id,family,operation'),id=physicalCatalogName(row['id']);if(!['original','generation','independent-delivery','restored-graph','independent-local','local-operation-snapshot','local-operation-flat'].includes(row['family'] as string))throw failure();return{id,family:row['family'],operation:row['operation']} as CompleteOperationParticipant<P>;});
 if(!rows.length||new Set(rows.map(row=>row.id)).size!==rows.length)throw failure();
 const mixed=rows.filter((row):row is Extract<CompleteOperationParticipant<P>,{family:'original'|'generation'}>=>row.family==='original'||row.family==='generation'),delivery=rows.filter((row):row is DeliveryOperationParticipant<P>=>row.family!=='original'&&row.family!=='generation');
 return prepareMixedRoomWithDelivery(mixed,()=>delivery.length?reserveDeliveryOperationCohort(delivery):undefined,(old,current)=>{
  const byId=new Map<string,CompleteOperationMember<P>>();for(const row of old.participants)byId.set(row.id,row);for(const row of current)byId.set(row.id,Object.freeze({id:row.id,family:row.family,parts:row.parts}) as CompleteOperationMember<P>);
  return Object.freeze({participants:Object.freeze(rows.map(row=>{const selected=byId.get(row.id);if(!selected||selected.family!==row.family)throw failure();return selected;}))});
 },databases,leases,beforeRelease,afterRelease,released,parent);
}
