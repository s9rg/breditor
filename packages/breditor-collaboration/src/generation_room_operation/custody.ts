/** Internal generation-aware room handoff. Retained source stamps, native ancestry,
 * fresh host guards and every actual upload owner precede one synchronous commit.
 * This capsule grants no room authority and implements no durable catalog by itself. */
import {prepareOperationalGenerationHandoff,type OperationalSharedGenerationParticipant,type OperationalGenerationHandoff} from "../generation_operation/operation.js";
import {generationOwnerSource} from "../generation_participant/recovery_components.js";
import {captureSharedGenerationSource,type SharedGenerationSourceCapture} from "../generation_source/capture.js";
import {releaseGenerationRoomCustody} from "./release.js";
import {generationOperationFailure as fail} from "../generation_operation/policy.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {RecoveryLease} from "../participant_recovery/lease.js";
import type {OperationalSharedGenerationParticipantParts} from "../generation_operation/contract.js";

export interface GenerationRoomParticipantParts {readonly participants:readonly Readonly<{id:string;parts:OperationalSharedGenerationParticipantParts<SharedSelectionPolicy>}>[]}
export async function prepareGenerationRoomParticipants(input:readonly {id:string;operation:OperationalSharedGenerationParticipant<SharedSelectionPolicy>}[],databases:readonly IDBDatabase[],leases:readonly RecoveryLease[],beforeRelease:()=>Promise<void>,afterRelease:()=>void,released:()=>void):Promise<OperationalGenerationHandoff<GenerationRoomParticipantParts>>{
 if(!Array.isArray(input)||input.length>1024)throw fail("generation_operation_policy");const values=input.map(value=>({id:value.id,operation:value.operation}));
 if(values.some(value=>typeof value.id!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value.id))||new Set(values.map(value=>value.id)).size!==values.length)throw fail("generation_operation_policy");
 const captures:SharedGenerationSourceCapture[]=[],dispose=()=>{for(const capture of captures)capture.dispose();};let offered=false;
 try{
  const handoff=await prepareOperationalGenerationHandoff(values.map(value=>value.operation),async(states,markReleased)=>{
   await beforeRelease();for(const s of states)captures.push(captureSharedGenerationSource(generationOwnerSource(s.p,s.owners)));
   const parts=Object.freeze({participants:Object.freeze(states.map((s,index)=>Object.freeze({id:values[index]!.id,parts:Object.freeze({source:generationOwnerSource(s.p,s.owners),uploads:s.owners.uploads!})})))});
   await releaseGenerationRoomCustody([...databases,...states.flatMap(s=>[s.db,s.recoveryDb])],[...leases,...states.flatMap(s=>s.leases)]);markReleased();released();return parts;
  },states=>{afterRelease();for(const s of states){s.p.guard();s.origin.verifySource(generationOwnerSource(s.p,s.owners));}afterRelease();for(const capture of captures)capture.check();});
  const result=Object.freeze({commit(){try{return handoff.commit();}finally{dispose();}},abandon(){try{handoff.abandon();}finally{dispose();}}});offered=true;return result;
 }finally{if(!offered)dispose();}
}
