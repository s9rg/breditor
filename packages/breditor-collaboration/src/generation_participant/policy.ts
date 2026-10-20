import {generationIdentity,generationFields,freezeGeneration} from "../generation_source/identity.js";
import type {SharedGenerationParticipantIdentity,SharedGenerationParticipantSelection} from "./contract.js";
export class SharedGenerationParticipantError extends Error {
 constructor(readonly code:"generation_participant_policy"|"generation_participant_format"|"generation_participant_integrity"|"generation_participant_budget"|"generation_participant_closed"|"generation_participant_storage"|"generation_participant_exists"|"generation_participant_missing"|"generation_participant_diverged"|"generation_participant_busy",message:string){super(message);this.name="SharedGenerationParticipantError";}
}
export function generationParticipantFailure(code:SharedGenerationParticipantError["code"]="generation_participant_storage"):SharedGenerationParticipantError{return new SharedGenerationParticipantError(code,"Generation participant recovery requires exact selected source, file and destination state");}
const text=(v:unknown,max:number):v is string=>typeof v==="string"&&!!v.trim()&&new TextEncoder().encode(v).length<=max&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v)&&new TextDecoder("utf-8",{fatal:true}).decode(new TextEncoder().encode(v))===v;
export function generationParticipantIdentity(input:unknown):Readonly<SharedGenerationParticipantIdentity>{
 if(!generationFields(input,"assets,participant,principal,source"))throw generationParticipantFailure("generation_participant_policy");
 const r=input as unknown as SharedGenerationParticipantIdentity;if(!text(r.participant,200)||!text(r.principal,256)||r.assets!=="whole-store")throw generationParticipantFailure("generation_participant_policy");const source=generationIdentity(r.source);
 if(source.review&&source.review.principal!==r.principal||source.relay&&source.relay.document.principal!==r.principal)throw generationParticipantFailure("generation_participant_policy");return freezeGeneration({participant:r.participant,principal:r.principal,source,assets:"whole-store" as const});
}
export function generationParticipantSelection(input:unknown):Readonly<SharedGenerationParticipantSelection>{
 if(!generationFields(input,"identity,sha256"))throw generationParticipantFailure("generation_participant_policy");const r=input as unknown as SharedGenerationParticipantSelection;if(typeof r.sha256!=="string"||!/^[a-f0-9]{64}$/.test(r.sha256))throw generationParticipantFailure("generation_participant_policy");return freezeGeneration({identity:generationParticipantIdentity(r.identity),sha256:r.sha256});
}
