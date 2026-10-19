import {operationFailure,operationSignal} from "./errors.js";
import {checkOperationRecord,type OperationRecord} from "./record.js";
/** Immutable original bytes and prepared intent commit atomically; existing names never upgrade. */
export async function createOperationDatabase(name:string,record:OperationRecord,file:Blob,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 guard();operationSignal(signal);checkOperationRecord(record);
 return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);let created=false,blocked=false,reason:unknown;
  r.onupgradeneeded=event=>{try{guard();operationSignal(signal);if(event.oldVersion!==0)throw operationFailure("operation_exists");created=true;const db=r.result;db.createObjectStore("operation").add(record,"state");db.createObjectStore("origin").add(file,"participant");}catch(error){reason=error;r.transaction!.abort();}};
  r.onerror=()=>reject(reason??operationFailure(r.error?.name==="VersionError"?"operation_exists":"operation_storage"));r.onblocked=()=>{blocked=true;reject(operationFailure("operation_in_use"));};
  r.onsuccess=()=>{if(blocked||!created){r.result.close();reject(operationFailure("operation_exists"));}else resolve(r.result);};
 });
}
