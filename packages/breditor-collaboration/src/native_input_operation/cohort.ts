/** Actual snapshot/flat writers and whole uploads transfer together. Reserve all
 * genuine parents before policy callbacks; construct every closed result before
 * final policy checks; check every native/storage stamp after the last callback.
 * No member is consumed on verification, wrapper or asynchronous cleanup failure.
 * This is an in-process handoff, not durable whole-room activation/reconciliation. */
import {SharedEditorError} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {OperationalRestoredLocalParticipant,reserveRestoredLocalParticipant} from '../restored_local_operation/participant.js';
import {OperationalFlatLocalParticipant,reserveFlatLocalParticipant} from '../flat_local_operation/participant.js';
import {archiveFields} from '../archive_integrity/policy.js';
import {physicalCatalogName} from '../physical_room_catalog/policy.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import type {NativeInputParticipantReservation} from './cohort_member.js';
import type {NativeInputHandoff,NativeInputHandoffParts} from './handoff.js';
import {prepareOperationalCohort,type OperationalCohortReservation} from '../operation_cohort/cohort.js';

export type NativeInputParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |Readonly<{id:string;family:'local-operation-snapshot';operation:OperationalRestoredLocalParticipant<P>}>
 |Readonly<{id:string;family:'local-operation-flat';operation:OperationalFlatLocalParticipant<P>}>;
export interface NativeInputCohortParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly participants:readonly Readonly<{id:string;family:NativeInputParticipant<P>['family'];parts:Readonly<NativeInputHandoffParts<P>>}>[];
}
const fail=()=>new SharedEditorError('native_input_cohort_policy','Use distinct genuine live local-operation parents');
type Member<P extends SharedSelectionPolicy>=NativeInputCohortParts<P>['participants'][number];
/** An intrinsic group for the EXISTING room handoff kernel. Real local upload
 * leases are already held: requesting them again would deadlock or refuse the
 * rightful owner. Final member checks still prove those exact held leases.
 * There is no new serialized readiness, protocol or caller adapter registry. */
export function reserveNativeInputParticipantGroup<P extends SharedSelectionPolicy>(provided:readonly NativeInputParticipant<P>[]):OperationalCohortReservation<Member<P>>{
 const input=snapshotInventoryInputs(provided,fail,value=>{const row=archiveFields(value,'id,family,operation'),id=physicalCatalogName(row['id']);if(row['family']!=='local-operation-snapshot'&&row['family']!=='local-operation-flat')throw fail();return{id,family:row['family'],operation:row['operation']} as NativeInputParticipant<P>;});
 if(!input.length||new Set(input.map(row=>row.id)).size!==input.length)throw fail();
 const reservations:NativeInputParticipantReservation<P>[]=[],handoffs:NativeInputHandoff<P>[]=[];
 let finished=false,preparing=false;
 const abandon=()=>{if(finished)return;finished=true;try{for(const h of handoffs)h.abandon();}finally{for(const r of reservations)r.abandon();}};
 const current=()=>{if(finished||handoffs.length!==input.length)throw fail();};
 try{
  // No await or policy callback before BOTH actual parent families are busy.
  for(const row of input)reservations.push(row.family==='local-operation-snapshot'?reserveRestoredLocalParticipant(row.operation):reserveFlatLocalParticipant(row.operation));
  const states=Object.freeze(input.map((row,index)=>Object.freeze({id:row.id,family:row.family,get parts(){current();return handoffs[index]!.value;}})));
  return{states,assetStores:[],
   async verify(){if(finished||preparing)throw fail();preparing=true;for(const reservation of reservations)handoffs.push(await reservation.prepare());},
   // Concrete reservations already close/reopen coordinator handles and dispose
   // temporary input wrappers while their native/upload witnesses stay held.
   markReleased(){current();},checkBindings(){current();},disposeAuxiliaries(){current();},
   checkCurrent(){current();for(const h of handoffs)h.check();},
   checkManaged(){current();for(const h of handoffs)h.checkCurrent();},
   consume(){for(const h of handoffs)h.consume();for(const r of reservations)r.consume();finished=true;},
   abandon,
  };
 }catch(error){abandon();throw error;}
}
export async function handoffNativeInputParticipants<P extends SharedSelectionPolicy>(provided:readonly NativeInputParticipant<P>[]):Promise<Readonly<NativeInputCohortParts<P>>>{
 const group=reserveNativeInputParticipantGroup(provided);
 const handoff=await prepareOperationalCohort([group],async()=>Object.freeze({participants:Object.freeze(group.states.map(row=>Object.freeze({id:row.id,family:row.family,parts:row.parts})))}),()=>{},()=>{},fail);
 return handoff.commit();
}
