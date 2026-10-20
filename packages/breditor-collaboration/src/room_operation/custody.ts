import {prepareOperationalParticipantHandoff,type OperationalSharedParticipant,type OperationalParticipantHandoff} from "../participant_operation/operation.js";
import {ownerSources} from "../participant_recovery/components.js";
import {captureSharedAssetReferences,type SharedAssetReferenceCapture} from "../asset_references_capture.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRichEditor} from "../core.js";
import type {RecoveryLease} from "../participant_recovery/lease.js";
import {roomFailure} from "./errors.js";
import type {SharedRoomOperationParts} from "./types.js";
/** Close DB handles only after every retryable cooperative release completed. Native author leases stay. */
export async function releaseRoomCustody(databases:readonly IDBDatabase[],leases:readonly RecoveryLease[]):Promise<void>{const results=await Promise.allSettled([...new Set(leases)].reverse().map(lease=>lease.close()));if(results.some(result=>result.status==="rejected"))throw roomFailure();for(const db of new Set(databases))db.close();}
/** Keep all genuine child handles busy until one verified aggregate release succeeds. */
export async function prepareRoomParticipants(values:readonly {id:string;operation:OperationalSharedParticipant<SharedSelectionPolicy>}[],databases:readonly IDBDatabase[],leases:readonly RecoveryLease[],beforeRelease:()=>Promise<void>,afterRelease:()=>void,released:()=>void):Promise<OperationalParticipantHandoff<SharedRoomOperationParts>>{
 const captures:SharedAssetReferenceCapture[]=[];
 const dispose=()=>{for(const capture of captures)capture.dispose();};let offered=false;
 try{const handoff=await prepareOperationalParticipantHandoff(values.map(value=>value.operation),async(states,markReleased)=>{
  await beforeRelease();for(const s of states)captures.push(captureSharedAssetReferences(ownerSources(s.p,s.owners)));
  const parts=Object.freeze({participants:Object.freeze(states.map((s,index)=>Object.freeze({id:values[index]!.id,parts:Object.freeze({sources:Object.freeze(ownerSources(s.p,s.owners)),session:s.owners.session!,uploads:s.owners.uploads!})})))});
  await releaseRoomCustody([...databases,...states.flatMap(s=>[s.db,s.recoveryDb])],[...leases,...states.flatMap(s=>s.leases)]);markReleased();released();return parts;
 },states=>{afterRelease();for(const s of states){s.p.guard();s.origin.verify(s.owners.session!.core as unknown as SharedRichEditor<SharedSelectionPolicy>);}afterRelease();},()=>{for(const capture of captures)capture.check();});const value=Object.freeze({commit(){try{return handoff.commit();}finally{dispose();}},abandon(){try{handoff.abandon();}finally{dispose();}}});offered=true;return value;}finally{if(!offered)dispose();}
}
