/** A new closed V2 parent record. Original parent/catalog generations never upgrade. */
import {checkCatalogV2Record,type CatalogV2Record} from "../room_recovery_catalog_v2/record.js";
import {parseCatalogV2Manifest} from "../room_recovery_catalog_v2/manifest.js";
import {databaseName,id,object} from "../room_recovery_catalog/policy.js";
import type {SharedRoomOperationV2Target} from "./contract.js";
import {v2Failure} from "./errors.js";
export const V2_OPERATION_STORE="room_v2_operation",V2_OPERATION_FILES="room_v2_operation_files";
export interface RoomOperationV2Record{
 readonly format:"breditor/shared-room-operation";readonly formatVersion:2;readonly catalogDatabase:string;readonly catalog:CatalogV2Record;
 readonly phase:"prepared"|"operational";readonly participants:readonly Readonly<SharedRoomOperationV2Target&{state:"reserved"|"started"|"complete"}>[];
}
export function initialRoomOperationV2(catalogDatabase:string,catalog:CatalogV2Record,targets:readonly SharedRoomOperationV2Target[]):RoomOperationV2Record{return checkRoomOperationV2({format:"breditor/shared-room-operation",formatVersion:2,catalogDatabase,catalog,phase:"prepared",participants:targets.map(row=>({...row,state:"reserved"}))});}
export function checkRoomOperationV2(input:unknown,expected?:RoomOperationV2Record):RoomOperationV2Record{
 try{
  const r=object(input,"catalog,catalogDatabase,format,formatVersion,participants,phase") as unknown as RoomOperationV2Record,catalog=checkCatalogV2Record(r.catalog),manifest=parseCatalogV2Manifest(catalog.manifest);databaseName(r.catalogDatabase);
  if(r.format!=="breditor/shared-room-operation"||r.formatVersion!==2||catalog.phase!=="checked"||!Array.isArray(r.participants)||r.participants.length!==catalog.participants.length||!["prepared","operational"].includes(r.phase))throw v2Failure("room_v2_diverged");
  const names=new Set([r.catalogDatabase]);let tail=false;const participants=r.participants.map((value,index)=>{
   const row=object(value,"family,id,operationDatabase,state"),entry=id(row["id"]),family=row["family"],name=databaseName(row["operationDatabase"]),state=row["state"],selected=manifest.participants.find(row=>row.id===entry);
   if(entry!==catalog.participants[index]!.id||!selected||family!==selected.family||names.has(name)||typeof state!=="string"||!["reserved","started","complete"].includes(state)||tail&&state!=="reserved")throw v2Failure("room_v2_diverged");names.add(name);if(state!=="complete")tail=true;
   return{id:entry,family:family as "original"|"generation",operationDatabase:name,state:state as "reserved"|"started"|"complete"};
  });
  if(r.phase==="operational"&&participants.some(row=>row.state!=="complete"))throw v2Failure("room_v2_diverged");
  const result:RoomOperationV2Record={format:r.format,formatVersion:2,catalogDatabase:r.catalogDatabase,catalog,phase:r.phase,participants};
  if(expected&&(result.catalogDatabase!==expected.catalogDatabase||JSON.stringify(catalog)!==JSON.stringify(expected.catalog)||participants.length!==expected.participants.length||participants.some((row,index)=>{const old=expected.participants[index];return!old||row.id!==old.id||row.family!==old.family||row.operationDatabase!==old.operationDatabase;})))throw v2Failure("room_v2_diverged");return result;
 }catch{throw v2Failure("room_v2_diverged");}
}
/** Only one ordered child intent advances; operational publication changes no child. */
export function roomOperationV2Transition(before:RoomOperationV2Record,next:RoomOperationV2Record):void{
 checkRoomOperationV2(next,before);if(JSON.stringify(before)===JSON.stringify(next))return;if(before.phase!=="prepared")throw v2Failure("room_v2_diverged");
 const ranks={reserved:0,started:1,complete:2},changes=next.participants.map((row,index)=>ranks[row.state]-ranks[before.participants[index]!.state]);
 if(next.phase==="operational"?changes.some(n=>n!==0):changes.filter(n=>n===1).length!==1||changes.some(n=>n<0||n>1))throw v2Failure("room_v2_diverged");
}
export function roomOperationV2Schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(",")!==[V2_OPERATION_STORE,V2_OPERATION_FILES].sort().join(","))throw v2Failure("room_v2_diverged");}
export function roomOperationV2Store(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw v2Failure("room_v2_diverged");}
