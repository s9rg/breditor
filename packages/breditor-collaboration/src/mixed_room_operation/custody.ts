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
import {captureSharedAssetReferences} from "../asset_references_capture.js";
import {captureSharedGenerationSource} from "../generation_source/capture.js";
import {releaseRoomCustody} from "../room_operation/custody.js";
import {roomFailure} from "../room_operation/errors.js";
import type {OperationalSharedParticipantParts} from "../participant_operation/types.js";
import type {OperationalSharedGenerationParticipantParts} from "../generation_operation/contract.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRichEditor} from "../core.js";
import type {RecoveryLease} from "../participant_recovery/lease.js";

export type MixedRoomParticipant =
 | {readonly id:string;readonly family:"original";readonly operation:OperationalSharedParticipant<SharedSelectionPolicy>}
 | {readonly id:string;readonly family:"generation";readonly operation:OperationalSharedGenerationParticipant<SharedSelectionPolicy>};
export type MixedRoomParticipantParts =
 | {readonly id:string;readonly family:"original";readonly parts:OperationalSharedParticipantParts<SharedSelectionPolicy>}
 | {readonly id:string;readonly family:"generation";readonly parts:OperationalSharedGenerationParticipantParts<SharedSelectionPolicy>};
export interface MixedRoomOperationParts{readonly participants:readonly Readonly<MixedRoomParticipantParts>[]}

export async function prepareMixedRoomParticipants(input:readonly MixedRoomParticipant[],databases:readonly IDBDatabase[],leases:readonly RecoveryLease[],beforeRelease:()=>Promise<void>,afterRelease:()=>void,released:()=>void):Promise<OperationalCohortHandoff<MixedRoomOperationParts>>{
 if(!Array.isArray(input)||input.length>1024)throw roomFailure("room_operation_policy");
 const values=input.map(value=>{if(!value||typeof value!=="object"||typeof value.id!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value.id)||(value.family!=="original"&&value.family!=="generation"))throw roomFailure("room_operation_policy");return{...value};});
 if(new Set(values.map(value=>value.id)).size!==values.length)throw roomFailure("room_operation_policy");
 const groups:OperationalCohortReservation<unknown>[]=[],captures:{check():void;dispose():void}[]=[];
 let offered=false;
 const dispose=()=>{for(const capture of captures)capture.dispose();};
 try{
  // No await or application callback until both genuine families are reserved.
  const original=reserveOperationalParticipantGroup(values.filter(value=>value.family==="original").map(value=>value.operation));groups.push(original);
  const generation=reserveOperationalGenerationGroup(values.filter(value=>value.family==="generation").map(value=>value.operation));groups.push(generation);
  const handoff=await prepareOperationalCohort(groups,async markReleased=>{
   await beforeRelease();
   const originals=original.states.map(s=>{const sources=Object.freeze(ownerSources(s.p,s.owners));captures.push(captureSharedAssetReferences(sources));return Object.freeze({sources,session:s.owners.session!,uploads:s.owners.uploads!});});
   const generations=generation.states.map(s=>{const source=generationOwnerSource(s.p,s.owners);captures.push(captureSharedGenerationSource(source));return Object.freeze({source,uploads:s.owners.uploads!});});
   let oi=0,gi=0;
   const parts=Object.freeze({participants:Object.freeze(values.map(value=>value.family==="original"?Object.freeze({id:value.id,family:"original" as const,parts:originals[oi++]!}):Object.freeze({id:value.id,family:"generation" as const,parts:generations[gi++]!})))});
   const states=[...original.states,...generation.states];
   await releaseRoomCustody([...databases,...states.flatMap(s=>[s.db,s.recoveryDb])],[...leases,...states.flatMap(s=>s.leases)]);markReleased();released();return parts;
  },()=>{
   afterRelease();
   for(const s of original.states){s.p.guard();s.origin.verify(managedSourceCore(s.owners.session!) as SharedRichEditor<SharedSelectionPolicy>);}
   for(const s of generation.states){s.p.guard();s.origin.verifySource(generationOwnerSource(s.p,s.owners));}
   afterRelease();
  },()=>{for(const capture of captures)capture.check();},()=>roomFailure("room_operation_closed"));
  const result=Object.freeze({commit(){try{return handoff.commit();}finally{dispose();}},abandon(){try{handoff.abandon();}finally{dispose();}}});offered=true;return result;
 }finally{if(!offered){for(const group of groups)group.abandon();dispose();}}
}
