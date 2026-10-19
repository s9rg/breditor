import {prepareRecovery} from "../participant_recovery/prepare.js";
import {prepareStage,snapshotCatalogParticipant,type StagedPolicy} from "../room_recovery_catalog/prepare_stage.js";
import type {CatalogCustody} from "../room_recovery_catalog/catalog.js";
import type {CatalogArchiveState} from "../room_recovery_catalog/archive.js";
import {databaseName,id,object} from "../room_recovery_catalog/policy.js";
import {operationPolicy} from "../participant_operation/components.js";
import {roomFailure} from "./errors.js";
import type {SharedRoomOperationTarget,SharedRoomOperationParticipant} from "./types.js";
import type {RoomOperationRecord} from "./record.js";
export function roomTargets(input:readonly SharedRoomOperationTarget[]):SharedRoomOperationTarget[]{if(!Array.isArray(input)||input.length>1024)throw roomFailure("room_operation_policy");return input.map(value=>{const row=object(value,"id,operationDatabase");return{id:id(row["id"]),operationDatabase:databaseName(row["operationDatabase"])};}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
/** Snapshot mutable input before the first await; no factory comes from persisted metadata. */
export function roomParticipants(input:readonly SharedRoomOperationParticipant[]):SharedRoomOperationParticipant[]{if(!Array.isArray(input)||input.length>1024)throw roomFailure("room_operation_policy");return input.map(value=>{object(value,"currentPolicy,id,operationDatabase,recovery");const row=snapshotCatalogParticipant({id:value.id,recovery:value.recovery});return{...row,operationDatabase:databaseName(value.operationDatabase),currentPolicy:operationPolicy(value.currentPolicy,value.recovery.session.kind.includes("paired"))};}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
/** Every parent, coordinator, component and child-operation name has a distinct owner. */
export function roomNames(database:string,catalogDatabase:string,targets:readonly SharedRoomOperationTarget[],policies:readonly StagedPolicy[]):void{
 const names=new Set<string>();for(const name of [database,catalogDatabase,...policies.flatMap(row=>[row.options.database,...Object.values(row.options.destinations)]),...targets.map(row=>row.operationDatabase)]){databaseName(name);if(names.has(name))throw roomFailure("room_operation_policy");names.add(name);}
 if(targets.length!==policies.length||targets.some((row,index)=>row.id!==policies[index]!.id))throw roomFailure("room_operation_policy");
}
/** Rebind cancellation/authority only at the genuine source's atomic custody commit. */
export async function prepareRoomTransfer(source:CatalogCustody,guard:()=>void,signal?:AbortSignal):Promise<StagedPolicy[]>{
 const policies:StagedPolicy[]=[];for(const owner of source.owners){const {signal:_oldSignal,checkAuthority:_oldAuthority,...rest}=owner.policy.options,options={...rest,checkAuthority:guard,...(signal?{signal}:{})};guard();const prepared=await prepareRecovery(options);guard();if(prepared.record.plan!==owner.policy.prepared.record.plan)throw roomFailure("room_operation_diverged");policies.push({id:owner.policy.id,options,prepared});}return policies;
}
export async function prepareRoomResume(input:readonly SharedRoomOperationParticipant[],source:CatalogArchiveState,record:RoomOperationRecord,guard:()=>void,signal?:AbortSignal):Promise<StagedPolicy[]>{
 const prepared=await prepareStage(input.map(row=>({id:row.id,recovery:row.recovery})),source,record.catalogDatabase,guard,signal);guard();if(prepared.plan!==record.catalog.plan||input.length!==record.participants.length||input.some((row,index)=>row.id!==record.participants[index]!.id||row.operationDatabase!==record.participants[index]!.operationDatabase))throw roomFailure("room_operation_diverged");return prepared.policies;
}
