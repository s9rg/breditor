/** Internal mixed-family custody prerequisite, not durable room activation.
 * Genuine owners are reserved before any host callback. Both storage families
 * release together, then share one synchronous validation/consumption barrier.
 * Original protocols remain original; generations are never flattened or reset. */
import {managedSourceCore} from "../managed_custody.js";
import {reserveOperationalParticipantGroup,type OperationalSharedParticipant} from "../participant_operation/operation.js";
import {reserveOperationalGenerationGroup,type OperationalSharedGenerationParticipant} from "../generation_operation/operation.js";
import {prepareOperationalCohort,type OperationalCohortReservation,type OperationalCohortHandoff} from "../operation_cohort/cohort.js";
import {ownerSources} from "../participant_recovery/components.js";
import {generationOwnerSource} from "../generation_participant/recovery_components.js";
import {captureSharedAssetReferences,SharedAssetReferenceCapture} from "../asset_references_capture.js";
import {captureSharedGenerationSource,SharedGenerationSourceCapture} from "../generation_source/capture.js";
import {releaseRoomCustody} from "../room_operation/custody.js";
import {roomFailure} from "../room_operation/errors.js";
import type {OperationalSharedParticipantParts} from "../participant_operation/types.js";
import type {OperationalSharedGenerationParticipantParts} from "../generation_operation/contract.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRichEditor} from "../core.js";
import type {RecoveryLease} from "../participant_recovery/lease.js";
import type {DeliveryOperationCohortMember} from '../delivery_operation_cohort/cohort.js';

export type MixedRoomParticipant<P extends SharedSelectionPolicy=SharedSelectionPolicy> =
 | {readonly id:string;readonly family:"original";readonly operation:OperationalSharedParticipant<P>}
 | {readonly id:string;readonly family:"generation";readonly operation:OperationalSharedGenerationParticipant<P>};
export type MixedRoomParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy> =
 | {readonly id:string;readonly family:"original";readonly parts:OperationalSharedParticipantParts<P>}
 | {readonly id:string;readonly family:"generation";readonly parts:OperationalSharedGenerationParticipantParts<P>};
export interface MixedRoomOperationParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly participants:readonly Readonly<MixedRoomParticipantParts<P>>[]}
const checkOriginal=SharedAssetReferenceCapture.prototype.check,disposeOriginal=SharedAssetReferenceCapture.prototype.dispose,checkGeneration=SharedGenerationSourceCapture.prototype.check,disposeGeneration=SharedGenerationSourceCapture.prototype.dispose;

export function prepareMixedRoomParticipants<P extends SharedSelectionPolicy>(input:readonly MixedRoomParticipant<P>[],databases:readonly IDBDatabase[],leases:readonly RecoveryLease[],beforeRelease:()=>Promise<void>,afterRelease:()=>void,released:()=>void):Promise<OperationalCohortHandoff<MixedRoomOperationParts<P>>>{
 return prepareMixedRoomWithDelivery(input,()=>undefined,parts=>parts,databases,leases,beforeRelease,afterRelease,released);
}
/** Internal composition of the existing two-family and five-family reservations.
 * The result builder cannot manufacture or consume a reservation. Every genuine
 * owner is busy before any factory/authority callback; the original release and
 * final witness sequence is shared, never copied into another transfer engine. */
export async function prepareMixedRoomWithDelivery<P extends SharedSelectionPolicy,T>(input:readonly MixedRoomParticipant<P>[],reserveDelivery:()=>OperationalCohortReservation<DeliveryOperationCohortMember<P>>|undefined,combine:(mixed:MixedRoomOperationParts<P>,delivery:readonly DeliveryOperationCohortMember<P>[])=>T,databases:readonly IDBDatabase[],leases:readonly RecoveryLease[],beforeRelease:()=>Promise<void>,afterRelease:()=>void,released:()=>void,parent?:OperationalCohortReservation<never>):Promise<OperationalCohortHandoff<T>>{
 if(!Array.isArray(input)||input.length>1024)throw roomFailure("room_operation_policy");
 // The old private reservations erase their invariant factory parameter. They
 // verify the actual owner and invoke only its stored P policy; no factory is
 // substituted or called with a different selection policy by this adapter.
 const values=input.map(value=>{if(!value||typeof value!=="object"||typeof value.id!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value.id)||(value.family!=="original"&&value.family!=="generation"))throw roomFailure("room_operation_policy");return{...value} as unknown as MixedRoomParticipant;});
 if(new Set(values.map(value=>value.id)).size!==values.length)throw roomFailure("room_operation_policy");
 const groups:OperationalCohortReservation<unknown>[]=[],captures:{check():void;dispose():void}[]=[];
 let offered=false;
 const dispose=()=>{for(const capture of captures)capture.dispose();};
 try{
  // No await or application callback until both genuine families are reserved.
  const original=reserveOperationalParticipantGroup(values.filter(value=>value.family==="original").map(value=>value.operation));groups.push(original);
  const generation=reserveOperationalGenerationGroup(values.filter(value=>value.family==="generation").map(value=>value.operation));groups.push(generation);
  // The closed seven-family entry point supplies the genuine reservation. The
  // original two-family path does not eagerly load unrelated native factories.
  const delivery=reserveDelivery();if(delivery)groups.push(delivery);
  // The genuine coordinator has already reserved itself. Its temporary-reader
  // disposal and last private job/lifetime check share this same barrier; no
  // parent callback or native destruction may follow child consumption.
  if(parent)groups.push(parent);
  const handoff=await prepareOperationalCohort(groups,async markReleased=>{
   await beforeRelease();
   const originals=original.states.map(s=>{const sources=Object.freeze(ownerSources(s.p,s.owners)),capture=captureSharedAssetReferences(sources);captures.push({check:()=>checkOriginal.call(capture),dispose:()=>disposeOriginal.call(capture)});return Object.freeze({sources,session:s.owners.session!,uploads:s.owners.uploads!});});
   const generations=generation.states.map(s=>{const source=generationOwnerSource(s.p,s.owners),capture=captureSharedGenerationSource(source);captures.push({check:()=>checkGeneration.call(capture),dispose:()=>disposeGeneration.call(capture)});return Object.freeze({source,uploads:s.owners.uploads!});});
   let oi=0,gi=0;
   const parts=combine(Object.freeze({participants:Object.freeze(values.map(value=>value.family==="original"?Object.freeze({id:value.id,family:"original" as const,parts:originals[oi++]!}):Object.freeze({id:value.id,family:"generation" as const,parts:generations[gi++]!})))}) as unknown as MixedRoomOperationParts<P>,delivery?.states??[]);
   const states=[...original.states,...generation.states];
   await releaseRoomCustody([...databases,...states.flatMap(s=>[s.db,s.recoveryDb])],[...leases,...states.flatMap(s=>s.leases)],()=>{markReleased();released();});return parts;
  },()=>{
   afterRelease();
   for(const s of original.states){s.p.guard();s.origin.verify(managedSourceCore(s.owners.session!) as SharedRichEditor<SharedSelectionPolicy>);}
   for(const s of generation.states){s.p.guard();s.origin.verifySource(generationOwnerSource(s.p,s.owners));}
   afterRelease();
  },()=>{for(const capture of captures)capture.check();},()=>roomFailure("room_operation_closed"));
  const result=Object.freeze({commit(){try{return handoff.commit();}finally{dispose();}},abandon(){try{handoff.abandon();}finally{dispose();}}});offered=true;return result;
 }finally{if(!offered){for(const group of groups)group.abandon();dispose();}}
}
