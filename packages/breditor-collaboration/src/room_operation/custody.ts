import {transferOperationalParticipant,type OperationalSharedParticipant,type OperationalParticipantCustody} from "../participant_operation/operation.js";
import {ownerSources} from "../participant_recovery/components.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {RecoveryLease} from "../participant_recovery/lease.js";
import {roomFailure} from "./errors.js";
import type {SharedRoomOperationParts} from "./types.js";
/** Close DB handles only after every retryable cooperative release completed. Native author leases stay. */
export async function releaseRoomCustody(databases:readonly IDBDatabase[],leases:readonly RecoveryLease[]):Promise<void>{const results=await Promise.allSettled([...new Set(leases)].reverse().map(lease=>lease.close()));if(results.some(result=>result.status==="rejected"))throw roomFailure();for(const db of new Set(databases))db.close();}
/** Keep all genuine child handles busy until one verified aggregate release succeeds. */
export async function transferRoomParticipants(values:readonly {id:string;operation:OperationalSharedParticipant<SharedSelectionPolicy>}[],databases:readonly IDBDatabase[],leases:readonly RecoveryLease[],guard:()=>Promise<void>):Promise<SharedRoomOperationParts>{
 const held:{id:string;state:OperationalParticipantCustody<SharedSelectionPolicy>}[]=[];
 const next=async(index:number):Promise<SharedRoomOperationParts>=>{
  if(index<values.length){const value=values[index]!;return transferOperationalParticipant(value.operation,async state=>{held.push({id:value.id,state});return next(index+1);});}
  await guard();const parts=Object.freeze({participants:Object.freeze(held.map(({id,state:s})=>Object.freeze({id,parts:Object.freeze({sources:Object.freeze(ownerSources(s.p,s.owners)),session:s.owners.session!,uploads:s.owners.uploads!})})))});
  await releaseRoomCustody([...databases,...held.flatMap(({state:s})=>[s.db,s.recoveryDb])],[...leases,...held.flatMap(({state:s})=>s.leases)]);return parts;
 };return next(0);
}
