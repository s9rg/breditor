/** Parent intent and every V2 source Blob commit before a genuine catalog is consumed. */
import type {CatalogV2ArchiveState} from "../room_recovery_catalog_v2/archive.js";
import {v2Failure,v2Signal} from "./errors.js";
import {checkRoomOperationV2,V2_OPERATION_STORE,V2_OPERATION_FILES,type RoomOperationV2Record} from "./record.js";
export function createRoomOperationV2Database(name:string,record:RoomOperationV2Record,source:CatalogV2ArchiveState,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 v2Signal(signal);guard();v2Signal(signal);checkRoomOperationV2(record);return new Promise((resolve,reject)=>{
  const r=indexedDB.open(name,1);let created=false,blocked=false,reason:unknown;const cancel=()=>{reason=v2Failure("room_v2_aborted");try{r.transaction?.abort();}catch{}};
  r.onupgradeneeded=event=>{try{guard();v2Signal(signal);if(event.oldVersion!==0)throw v2Failure("room_v2_exists");created=true;signal?.addEventListener("abort",cancel,{once:true});const db=r.result;db.createObjectStore(V2_OPERATION_STORE).add(record,"state");const files=db.createObjectStore(V2_OPERATION_FILES);for(const[key,file]of source.files)files.add(file,key);}catch(error){reason=error;r.transaction!.abort();}};
  r.onerror=()=>{signal?.removeEventListener("abort",cancel);reject(reason??v2Failure(r.error?.name==="VersionError"?"room_v2_exists":"room_v2_storage"));};r.onblocked=()=>{blocked=true;reject(v2Failure("room_v2_exists"));};r.onsuccess=()=>{signal?.removeEventListener("abort",cancel);if(blocked||!created){r.result.close();reject(v2Failure("room_v2_exists"));}else resolve(r.result);};
 });
}
