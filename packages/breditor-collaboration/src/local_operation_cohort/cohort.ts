/** Closed dispatch for the three genuinely local operational families. A local
 * original remains original, not a snapshot input or server delivery binding.
 * All parents reserve synchronously before callbacks, then use the existing
 * room kernel for one native/upload ownership barrier. No durable activation. */
import {SharedEditorError} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {archiveFields} from '../archive_integrity/policy.js';
import {physicalCatalogName} from '../physical_room_catalog/policy.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {OperationalIndependentLocalParticipant,reserveOperationalIndependentLocalGroup} from '../independent_local_operation/participant.js';
import type {LocalOperationParticipantParts} from '../independent_local_operation/participant_contract.js';
import {reserveNativeInputParticipantGroup,type NativeInputParticipant,type NativeInputCohortParts} from '../native_input_operation/cohort.js';
import {prepareOperationalCohort,type OperationalCohortReservation} from '../operation_cohort/cohort.js';

export type LocalOperationCohortParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |Readonly<{id:string;family:'independent-local';operation:OperationalIndependentLocalParticipant<P>}>
 |NativeInputParticipant<P>;
export type LocalOperationCohortMember<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |Readonly<{id:string;family:'independent-local';parts:Readonly<LocalOperationParticipantParts<P>>}>
 |NativeInputCohortParts<P>['participants'][number];
export interface LocalOperationCohortParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly participants:readonly LocalOperationCohortMember<P>[]}
const fail=()=>new SharedEditorError('local_operation_cohort_policy','Use distinct IDs and genuine local operational parents');

/** Caller markers, wrong-family parents and empty/sparse collections refuse.
 * Existing preheld upload leases are verified by each actual owner, not acquired
 * a second time. A failed reservation or final fence consumes no parent. */
export function reserveLocalOperationCohort<P extends SharedSelectionPolicy>(provided:readonly LocalOperationCohortParticipant<P>[]):OperationalCohortReservation<LocalOperationCohortMember<P>>{
 const input=snapshotInventoryInputs(provided,fail,value=>{const row=archiveFields(value,'id,family,operation'),id=physicalCatalogName(row['id']);if(!['independent-local','local-operation-snapshot','local-operation-flat'].includes(row['family'] as string))throw fail();return{id,family:row['family'],operation:row['operation']} as LocalOperationCohortParticipant<P>;});
 if(!input.length||new Set(input.map(row=>row.id)).size!==input.length)throw fail();
 const legacy=input.filter((row):row is Extract<LocalOperationCohortParticipant<P>,{family:'independent-local'}>=>row.family==='independent-local');
 const incoming=input.filter((row):row is NativeInputParticipant<P>=>row.family!=='independent-local');
 const groups:OperationalCohortReservation<unknown>[]=[];
 try{
  const old=legacy.length?reserveOperationalIndependentLocalGroup(legacy.map(row=>row.operation)):undefined;if(old)groups.push(old);
  const next=incoming.length?reserveNativeInputParticipantGroup(incoming):undefined;if(next)groups.push(next);
  const states=Object.freeze(input.map(row=>{
   if(row.family==='independent-local'){const index=legacy.indexOf(row);return Object.freeze({id:row.id,family:row.family,get parts(){return old!.states[index]!;}});}
   const index=incoming.indexOf(row);return Object.freeze({id:row.id,family:row.family,get parts(){return next!.states[index]!.parts;}});
  }));
  return{states,assetStores:[],
   async verify(){for(const g of groups)await g.verify();},
   markReleased(){for(const g of groups)g.markReleased();},
   checkBindings(){for(const g of groups)g.checkBindings();},
   checkCurrent(){for(const g of groups)g.checkCurrent();},
   disposeAuxiliaries(){for(const g of groups)g.disposeAuxiliaries();},
   checkManaged(){for(const g of groups)g.checkManaged();},
   consume(){for(const g of groups)g.consume();},
   abandon(){for(const g of groups)g.abandon();},
  };
 }catch(error){for(const group of groups)group.abandon();throw error;}
}
export async function handoffLocalOperationCohort<P extends SharedSelectionPolicy>(provided:readonly LocalOperationCohortParticipant<P>[]):Promise<Readonly<LocalOperationCohortParts<P>>>{
 const group=reserveLocalOperationCohort(provided);
 const handoff=await prepareOperationalCohort([group],async()=>Object.freeze({participants:Object.freeze(group.states.map(row=>Object.freeze({id:row.id,family:row.family,parts:row.parts}) as LocalOperationCohortMember<P>))}),()=>{},()=>{},fail);
 return handoff.commit();
}
