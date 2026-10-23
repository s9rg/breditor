/** Closed dispatch for complete delivery/restored owners and three local-only
 * families. Every actual parent reserves before host policy callbacks; all use
 * the existing room kernel. No wire-family conversion or room activation. */
import {SharedEditorError} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {archiveFields} from '../archive_integrity/policy.js';
import {physicalCatalogName} from '../physical_room_catalog/policy.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {OperationalIndependentDeliveryParticipant,reserveOperationalIndependentDeliveryGroup} from '../independent_operation/participant.js';
import type {IndependentOperationParticipantParts} from '../independent_operation/participant_contract.js';
import {RestoredOperationParticipant,reserveRestoredOperationGroup} from '../restored_participant/participant.js';
import type {RestoredOperationParticipantParts} from '../restored_participant/parts.js';
import {reserveLocalOperationCohort,type LocalOperationCohortParticipant,type LocalOperationCohortMember} from '../local_operation_cohort/cohort.js';
import {prepareOperationalCohort,type OperationalCohortReservation} from '../operation_cohort/cohort.js';
export type DeliveryOperationParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |Readonly<{id:string;family:'independent-delivery';operation:OperationalIndependentDeliveryParticipant<P>}>
 |Readonly<{id:string;family:'restored-graph';operation:RestoredOperationParticipant<P>}>
 |LocalOperationCohortParticipant<P>;
export type DeliveryOperationCohortMember<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |Readonly<{id:string;family:'independent-delivery';parts:Readonly<IndependentOperationParticipantParts<P>>}>
 |Readonly<{id:string;family:'restored-graph';parts:Readonly<RestoredOperationParticipantParts<P>>}>
 |LocalOperationCohortMember<P>;
export interface DeliveryOperationCohortParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly participants:readonly DeliveryOperationCohortMember<P>[]}
const fail=()=>new SharedEditorError('delivery_operation_cohort_policy','Use distinct IDs and genuine delivery or local operational parents');
/** Actual complete packet sources stay distinct from original/input providers.
 * Empty, sparse, fake, aliased and wrong-family owners refuse without transfer. */
export function reserveDeliveryOperationCohort<P extends SharedSelectionPolicy>(provided:readonly DeliveryOperationParticipant<P>[]):OperationalCohortReservation<DeliveryOperationCohortMember<P>>{
 const input=snapshotInventoryInputs(provided,fail,value=>{const row=archiveFields(value,'id,family,operation'),id=physicalCatalogName(row['id']);if(!['independent-delivery','restored-graph','independent-local','local-operation-snapshot','local-operation-flat'].includes(row['family'] as string))throw fail();return{id,family:row['family'],operation:row['operation']} as DeliveryOperationParticipant<P>;});
 if(!input.length||new Set(input.map(row=>row.id)).size!==input.length)throw fail();
 const delivery=input.filter((r):r is Extract<DeliveryOperationParticipant<P>,{family:'independent-delivery'}>=>r.family==='independent-delivery'),restored=input.filter((r):r is Extract<DeliveryOperationParticipant<P>,{family:'restored-graph'}>=>r.family==='restored-graph'),local=input.filter((r):r is LocalOperationCohortParticipant<P>=>r.family!=='independent-delivery'&&r.family!=='restored-graph'),groups:OperationalCohortReservation<unknown>[]=[];
 try{
  const d=delivery.length?reserveOperationalIndependentDeliveryGroup(delivery.map(r=>r.operation)):undefined;if(d)groups.push(d);
  const r=restored.length?reserveRestoredOperationGroup(restored.map(r=>r.operation)):undefined;if(r)groups.push(r);
  const l=local.length?reserveLocalOperationCohort(local):undefined;if(l)groups.push(l);
  const states=Object.freeze(input.map(row=>{
   if(row.family==='independent-delivery'){const i=delivery.indexOf(row);return Object.freeze({id:row.id,family:row.family,get parts(){return d!.states[i]!;}});}
   if(row.family==='restored-graph'){const i=restored.indexOf(row);return Object.freeze({id:row.id,family:row.family,get parts(){return r!.states[i]!;}});}
   // Keep the existing discriminated local state: reconstructing family and
   // parts independently would erase their static correlation.
   const i=local.indexOf(row);return l!.states[i]!;
  }));
  return{states,assetStores:[],async verify(){for(const g of groups)await g.verify();},markReleased(){for(const g of groups)g.markReleased();},checkBindings(){for(const g of groups)g.checkBindings();},checkCurrent(){for(const g of groups)g.checkCurrent();},disposeAuxiliaries(){for(const g of groups)g.disposeAuxiliaries();},checkManaged(){for(const g of groups)g.checkManaged();},consume(){for(const g of groups)g.consume();},abandon(){for(const g of groups)g.abandon();}};
 }catch(error){for(const group of groups)group.abandon();throw error;}
}
export async function handoffDeliveryOperationParticipants<P extends SharedSelectionPolicy>(provided:readonly DeliveryOperationParticipant<P>[]):Promise<Readonly<DeliveryOperationCohortParts<P>>>{
 const group=reserveDeliveryOperationCohort(provided),handoff=await prepareOperationalCohort([group],async()=>Object.freeze({participants:Object.freeze(group.states.map(row=>Object.freeze({id:row.id,family:row.family,parts:row.parts}) as DeliveryOperationCohortMember<P>))}),()=>{},()=>{},fail);return handoff.commit();
}
