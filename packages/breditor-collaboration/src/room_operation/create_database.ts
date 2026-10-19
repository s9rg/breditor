import type {CatalogArchiveState} from "../room_recovery_catalog/archive.js";
import {roomFailure,roomSignal} from "./errors.js";
import {checkRoomOperation,type RoomOperationRecord} from "./record.js";
/** Original server, inventory, every client copy and prepared intent commit atomically. */
export async function createRoomOperationDatabase(name:string,record:RoomOperationRecord,source:CatalogArchiveState,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 roomSignal(signal);guard();checkRoomOperation(record);return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);let created=false,blocked=false,reason:unknown;const cancel=()=>{reason=roomFailure("room_operation_aborted");try{r.transaction?.abort();}catch{}};
  r.onupgradeneeded=event=>{try{guard();roomSignal(signal);if(event.oldVersion!==0)throw roomFailure("room_operation_exists");created=true;signal?.addEventListener("abort",cancel,{once:true});const db=r.result;db.createObjectStore("operation").add(record,"state");const files=db.createObjectStore("files");for(const[key,file]of source.files)files.add(file,key);}catch(error){reason=error;r.transaction!.abort();}};
  r.onerror=()=>{signal?.removeEventListener("abort",cancel);reject(reason??roomFailure(r.error?.name==="VersionError"?"room_operation_exists":"room_operation_storage"));};r.onblocked=()=>{blocked=true;reject(roomFailure("room_operation_exists"));};
  r.onsuccess=()=>{signal?.removeEventListener("abort",cancel);if(blocked||!created){r.result.close();reject(roomFailure("room_operation_exists"));}else resolve(r.result);};
 });
}
