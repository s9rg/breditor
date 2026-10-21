/** Fresh host policy and native factories are separate from every stored intent. */
import {databaseName,id,object} from "../room_recovery_catalog/policy.js";
import {operationPolicy} from "../participant_operation/components.js";
import {prepareRecovery} from "../participant_recovery/prepare.js";
import {snapshotGenerationRecovery} from "../generation_participant/prepare_recovery.js";
import {prepareCatalogV2Stage,snapshotCatalogV2Participant,type V2StagedPolicy} from "../room_recovery_catalog_v2/prepare_stage.js";
import type {CatalogV2Custody} from "../room_recovery_catalog_v2/catalog.js";
import type {CatalogV2ArchiveState} from "../room_recovery_catalog_v2/archive.js";
import type {SharedRoomOperationV2Target,SharedRoomOperationV2Participant} from "./contract.js";
import type {RoomOperationV2Record} from "./record.js";
import {v2Failure} from "./errors.js";
export const v2PolicyOptions=(p:V2StagedPolicy)=>p.family==="generation"?p.options:p.value.options;
export function v2Targets(input:readonly SharedRoomOperationV2Target[]):SharedRoomOperationV2Target[]{
 if(!Array.isArray(input)||input.length>1024)throw v2Failure("room_v2_policy");return input.map((value):SharedRoomOperationV2Target=>{const row=object(value,"family,id,operationDatabase"),family=row["family"];if(family!=="original"&&family!=="generation")throw v2Failure("room_v2_policy");return{id:id(row["id"]),family,operationDatabase:databaseName(row["operationDatabase"])};}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
/** Snapshot before awaiting. Both local/relay generation sessions can be paired;
 * the presence of a declared review identity, not transport kind, selects that contract. */
export function v2Participants(input:readonly SharedRoomOperationV2Participant[]):SharedRoomOperationV2Participant[]{
 if(!Array.isArray(input)||input.length>1024)throw v2Failure("room_v2_policy");return input.map(value=>{
  object(value,"currentPolicy,family,id,operationDatabase,recovery");const row=snapshotCatalogV2Participant(value.family==="original"?{id:value.id,family:value.family,recovery:value.recovery}:{id:value.id,family:value.family,recovery:value.recovery});
  const paired=row.family==="original"?row.recovery.session.kind.includes("paired"):!!row.recovery.session.options.review;return{...row,operationDatabase:databaseName(value.operationDatabase),currentPolicy:operationPolicy(value.currentPolicy,paired)};
 }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
export function v2Names(database:string,catalogDatabase:string,targets:readonly SharedRoomOperationV2Target[],policies:readonly V2StagedPolicy[]):void{
 const names=new Set<string>();for(const name of [database,catalogDatabase,...targets.map(row=>row.operationDatabase),...policies.flatMap(row=>{const o=v2PolicyOptions(row);return[o.database,...Object.values(o.destinations)];})]){databaseName(name);if(names.has(name))throw v2Failure("room_v2_policy");names.add(name);}
 if(targets.length!==policies.length||targets.some((row,index)=>row.id!==policies[index]!.id||row.family!==policies[index]!.family))throw v2Failure("room_v2_policy");
}
/** Preserve factories, original source identity and exact plan while rebinding only the parent. */
export async function prepareV2Transfer(source:CatalogV2Custody,guard:()=>void,signal?:AbortSignal):Promise<V2StagedPolicy[]>{
 const policies:V2StagedPolicy[]=[];for(const owner of source.owners){
  if(owner.family==="original"){
   const old=owner.value.policy,{signal:_oldSignal,checkAuthority:_oldAuthority,...rest}=old.options,options={...rest,checkAuthority:guard,...(signal?{signal}:{})},prepared=await prepareRecovery(options);guard();if(prepared.record.plan!==old.prepared.record.plan)throw v2Failure("room_v2_diverged");policies.push({id:owner.id,family:"original",value:{id:owner.id,options,prepared}});
  }else{
   const {backup,signal:_oldSignal,checkAuthority:_oldAuthority,...rest}=owner.policy.options,base=snapshotGenerationRecovery({...rest,checkAuthority:guard,...(signal?{signal}:{})},false);guard();if(base.record.plan!==owner.policy.plan)throw v2Failure("room_v2_diverged");policies.push({id:owner.id,family:"generation",options:{...base.options,backup},plan:base.record.plan});
  }
 }return policies;
}
export async function prepareV2Resume(input:readonly SharedRoomOperationV2Participant[],source:CatalogV2ArchiveState,record:RoomOperationV2Record,guard:()=>void,signal?:AbortSignal):Promise<V2StagedPolicy[]>{
 const prepared=await prepareCatalogV2Stage(input.map(row=>row.family==="original"?{id:row.id,family:row.family,recovery:row.recovery}:{id:row.id,family:row.family,recovery:row.recovery}),source,record.catalogDatabase,guard,signal);guard();
 if(prepared.plan!==record.catalog.plan||input.length!==record.participants.length||input.some((row,index)=>{const before=record.participants[index];return!before||row.id!==before.id||row.family!==before.family||row.operationDatabase!==before.operationDatabase;}))throw v2Failure("room_v2_diverged");return prepared.policies;
}
