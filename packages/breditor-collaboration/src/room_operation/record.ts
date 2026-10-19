import {checkRecord,type CatalogRecord} from "../room_recovery_catalog/storage.js";
import {databaseName,id,object} from "../room_recovery_catalog/policy.js";
import {roomFailure} from "./errors.js";
import type {SharedRoomOperationTarget} from "./types.js";
export interface RoomOperationRecord{readonly format:"breditor/shared-room-operation";readonly formatVersion:1;readonly catalogDatabase:string;readonly catalog:CatalogRecord;readonly phase:"prepared"|"operational";readonly participants:readonly Readonly<{id:string;operationDatabase:string;state:"reserved"|"started"|"complete"}>[]}
export function initialRoomOperation(catalogDatabase:string,catalog:CatalogRecord,targets:readonly SharedRoomOperationTarget[]):RoomOperationRecord{return checkRoomOperation({format:"breditor/shared-room-operation",formatVersion:1,catalogDatabase,catalog,phase:"prepared",participants:targets.map(row=>({...row,state:"reserved"}))});}
/** Original catalog state is pinned independently of mutable child progress. */
export function checkRoomOperation(value:unknown,expected?:RoomOperationRecord):RoomOperationRecord{
 try{const r=object(value,"catalog,catalogDatabase,format,formatVersion,participants,phase") as unknown as RoomOperationRecord,catalog=checkRecord(r.catalog);databaseName(r.catalogDatabase);
  if(r.format!=="breditor/shared-room-operation"||r.formatVersion!==1||catalog.phase!=="checked"||!Array.isArray(r.participants)||r.participants.length!==catalog.participants.length||!["prepared","operational"].includes(r.phase))throw roomFailure("room_operation_diverged");
  const names=new Set([r.catalogDatabase]);let tail=false;const participants=r.participants.map((input,index)=>{const row=object(input,"id,operationDatabase,state"),entry=id(row["id"]),name=databaseName(row["operationDatabase"]),state=row["state"];if(entry!==catalog.participants[index]!.id||names.has(name)||typeof state!=="string"||!["reserved","started","complete"].includes(state)||tail&&state!=="reserved")throw roomFailure("room_operation_diverged");names.add(name);if(state!=="complete")tail=true;return{id:entry,operationDatabase:name,state:state as "reserved"|"started"|"complete"};});
  if(r.phase==="operational"&&participants.some(row=>row.state!=="complete"))throw roomFailure("room_operation_diverged");
  const result:RoomOperationRecord={format:r.format,formatVersion:1,catalogDatabase:r.catalogDatabase,catalog,phase:r.phase,participants};
  if(expected&&(result.catalogDatabase!==expected.catalogDatabase||JSON.stringify(catalog)!==JSON.stringify(expected.catalog)||participants.some((row,index)=>row.id!==expected.participants[index]?.id||row.operationDatabase!==expected.participants[index]?.operationDatabase)||participants.length!==expected.participants.length))throw roomFailure("room_operation_diverged");return result;
 }catch{throw roomFailure("room_operation_diverged");}
}
export function roomTransition(before:RoomOperationRecord,next:RoomOperationRecord):void{
 checkRoomOperation(next,before);if(JSON.stringify(before)===JSON.stringify(next))return;if(before.phase!=="prepared")throw roomFailure("room_operation_diverged");
 const rank={reserved:0,started:1,complete:2},changes=next.participants.map((row,index)=>rank[row.state]-rank[before.participants[index]!.state]);
 if(next.phase==="operational"?changes.some(n=>n!==0):changes.filter(n=>n===1).length!==1||changes.some(n=>n<0||n>1))throw roomFailure("room_operation_diverged");
}
export function roomSchema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(",")!=="files,operation")throw roomFailure("room_operation_diverged");}
export function roomStore(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw roomFailure("room_operation_diverged");}
