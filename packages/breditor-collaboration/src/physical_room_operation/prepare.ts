/** Explicit fresh factories/current policy. Neither a saved record nor physical inventory chooses code. */
import {v2Targets,v2Participants} from "../room_operation_v2/prepare.js";
import {databaseName} from "../room_recovery_catalog/policy.js";
import {prepareMixedCatalogStage,type MixedCatalogStagePolicy} from "../mixed_catalog_stage/prepare.js";
import type {PhysicalCatalogArchiveState} from "../physical_room_catalog/archive.js";
import {MAX_PHYSICAL_ROOM_STAGE_PLAN_BYTES} from "../physical_room_stage/policy.js";
import type {SharedPhysicalRoomOperationTarget,SharedPhysicalRoomOperationParticipant} from "./contract.js";
import type {PhysicalRoomOperationRecord} from "./record.js";
import {physicalOperationFailure as fail} from "./policy.js";
/** These pure snapshots reuse component factory choices, not either older catalog/parent protocol. */
export const physicalOperationTargets=(input:readonly SharedPhysicalRoomOperationTarget[])=>v2Targets(input);
export const physicalOperationParticipants=(input:readonly SharedPhysicalRoomOperationParticipant[])=>v2Participants(input);
export const physicalPolicyOptions=(p:MixedCatalogStagePolicy)=>p.family==="original"?p.value.options:p.options;
export function physicalOperationNames(database:string,stageDatabase:string,catalogDatabase:string,targets:readonly SharedPhysicalRoomOperationTarget[],policies:readonly MixedCatalogStagePolicy[]):void {
 const names=new Set<string>();
 for(const name of [database,stageDatabase,catalogDatabase,...targets.map(row=>row.operationDatabase),...policies.flatMap(row=>{const o=physicalPolicyOptions(row);return[o.database,...Object.values(o.destinations)];})]){databaseName(name);if(names.has(name))throw fail("physical_operation_policy");names.add(name);}
 if(targets.length!==policies.length||targets.some((row,index)=>row.id!==policies[index]!.id||row.family!==policies[index]!.family))throw fail("physical_operation_policy");
}
export async function preparePhysicalOperationResume(input:readonly SharedPhysicalRoomOperationParticipant[],source:PhysicalCatalogArchiveState,record:PhysicalRoomOperationRecord,guard:()=>void,signal?:AbortSignal):Promise<MixedCatalogStagePolicy[]> {
 const prepared=await prepareMixedCatalogStage(input.map(row=>row.family==="original"?{id:row.id,family:row.family,recovery:row.recovery}:{id:row.id,family:row.family,recovery:row.recovery}),source.clients,source.inventory.metadata().native,[record.database,record.stageDatabase,record.stage.catalogDatabase],MAX_PHYSICAL_ROOM_STAGE_PLAN_BYTES,guard,signal,true);guard();
 if(prepared.plan!==record.stage.plan||input.length!==record.participants.length||input.some((row,index)=>{const old=record.participants[index];return!old||old.id!==row.id||old.family!==row.family||old.operationDatabase!==row.operationDatabase;}))throw fail("physical_operation_diverged");
 // An original permanently read-only review transport is not a mutable host role.
 // Refuse the entire cohort before any component opens, not after earlier clients do.
 for(const[index,policy]of prepared.policies.entries())if(policy.family==="generation"&&policy.options.expected.identity.source.relay?.review?.reviewEditing==="read_only"&&input[index]!.currentPolicy.reviewAccess!=="read_only")throw fail("physical_operation_policy");
 physicalOperationNames(record.database,record.stageDatabase,record.stage.catalogDatabase,input,prepared.policies);return prepared.policies;
}
