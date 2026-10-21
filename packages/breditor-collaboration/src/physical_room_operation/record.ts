/** Closed client-operation intent. Retains an exact immutable source-stage pin, not copied files. */
import {checkPhysicalStageRecord,type PhysicalStageRecord} from "../physical_room_stage/record.js";
import {parsePhysicalCatalogManifest} from "../physical_room_catalog/manifest.js";
import {databaseName,id,object} from "../room_recovery_catalog/policy.js";
import type {SharedPhysicalRoomOperationTarget} from "./contract.js";
import {physicalOperationFailure as fail} from "./policy.js";
export interface PhysicalRoomOperationRecord {
 readonly format:"breditor/shared-physical-room-client-operation";readonly formatVersion:1;
 readonly database:string;readonly stageDatabase:string;readonly stage:PhysicalStageRecord;
 readonly phase:"prepared"|"operational";
 readonly participants:readonly Readonly<SharedPhysicalRoomOperationTarget&{state:"reserved"|"started"|"complete"}>[];
}
export function initialPhysicalRoomOperation(database:string,stageDatabase:string,stage:PhysicalStageRecord,targets:readonly SharedPhysicalRoomOperationTarget[]):PhysicalRoomOperationRecord{return checkPhysicalRoomOperation({format:"breditor/shared-physical-room-client-operation",formatVersion:1,database,stageDatabase,stage,phase:"prepared",participants:targets.map(row=>({...row,state:"reserved"}))});}
export function checkPhysicalRoomOperation(input:unknown,expected?:PhysicalRoomOperationRecord):PhysicalRoomOperationRecord {
 try{
  const r=object(input,"database,format,formatVersion,participants,phase,stage,stageDatabase") as unknown as PhysicalRoomOperationRecord,stage=checkPhysicalStageRecord(r.stage),manifest=parsePhysicalCatalogManifest(stage.manifest);
  const database=databaseName(r.database),stageDatabase=databaseName(r.stageDatabase),names=new Set([database,stageDatabase,stage.catalogDatabase]);
  if(r.format!=="breditor/shared-physical-room-client-operation"||r.formatVersion!==1||stage.phase!=="staged"||names.size!==3||!Array.isArray(r.participants)||r.participants.length!==stage.participants.length||!["prepared","operational"].includes(r.phase))throw fail("physical_operation_diverged");
  let tail=false;
  const participants=r.participants.map((value,index)=>{
   const row=object(value,"family,id,operationDatabase,state"),entry=id(row["id"]),family=row["family"],operationDatabase=databaseName(row["operationDatabase"]),state=row["state"],selected=manifest.participants.find(p=>p.id===entry);
   if(entry!==stage.participants[index]!.id||!selected||family!==selected.family||names.has(operationDatabase)||typeof state!=="string"||!["reserved","started","complete"].includes(state)||tail&&state!=="reserved")throw fail("physical_operation_diverged");
   names.add(operationDatabase);if(state!=="complete")tail=true;
   return{id:entry,family:family as "original"|"generation",operationDatabase,state:state as "reserved"|"started"|"complete"};
  });
  if(r.phase==="operational"&&participants.some(row=>row.state!=="complete"))throw fail("physical_operation_diverged");
  const result:PhysicalRoomOperationRecord={format:r.format,formatVersion:1,database,stageDatabase,stage,phase:r.phase,participants};
  if(expected&&(database!==expected.database||stageDatabase!==expected.stageDatabase||JSON.stringify(stage)!==JSON.stringify(expected.stage)||participants.length!==expected.participants.length||participants.some((row,index)=>{const old=expected.participants[index];return!old||row.id!==old.id||row.family!==old.family||row.operationDatabase!==old.operationDatabase;})))throw fail("physical_operation_diverged");
  return result;
 }catch{throw fail("physical_operation_diverged");}
}
/** One ordered child step or the final publication barrier. No backwards or no-op writes. */
export function checkPhysicalRoomOperationTransition(before:PhysicalRoomOperationRecord,next:PhysicalRoomOperationRecord):void {
 checkPhysicalRoomOperation(before);checkPhysicalRoomOperation(next,before);
 if(before.phase!=="prepared")throw fail("physical_operation_diverged");
 if(next.phase!==before.phase){if(next.phase!=="operational"||JSON.stringify(before.participants)!==JSON.stringify(next.participants))throw fail("physical_operation_diverged");return;}
 const at=before.participants.findIndex(row=>row.state!=="complete");if(at<0)throw fail("physical_operation_diverged");
 for(const[index,row]of before.participants.entries()){const after=next.participants[index]!;if(index!==at&&row.state!==after.state||index===at&&(row.state==="reserved"?after.state!=="started":row.state!=="started"||after.state!=="complete"))throw fail("physical_operation_diverged");}
}
