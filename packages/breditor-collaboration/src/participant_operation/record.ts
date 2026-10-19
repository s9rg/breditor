import {operationFailure,operationName} from "./errors.js";
export interface OperationRecord{readonly format:"breditor/shared-participant-operation";readonly formatVersion:1;readonly recoveryDatabase:string;readonly plan:string;readonly phase:"prepared"|"operational"}
export function operationRecord(recoveryDatabase:string,plan:string):OperationRecord{operationName(recoveryDatabase);return checkOperationRecord({format:"breditor/shared-participant-operation",formatVersion:1,recoveryDatabase,plan,phase:"prepared"});}
/** A phase records durable intent, never native continuity, account or activation proof. */
export function checkOperationRecord(raw:unknown,expected?:OperationRecord):OperationRecord{
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).sort().join(",")!=="format,formatVersion,phase,plan,recoveryDatabase")throw operationFailure("operation_diverged");
 const r=raw as OperationRecord;operationName(r.recoveryDatabase);
 if(r.format!=="breditor/shared-participant-operation"||r.formatVersion!==1||typeof r.plan!=="string"||r.plan.length>64*1024||new TextEncoder().encode(r.plan).length>64*1024||!["prepared","operational"].includes(r.phase))throw operationFailure("operation_diverged");
 if(expected&&(r.recoveryDatabase!==expected.recoveryDatabase||r.plan!==expected.plan))throw operationFailure("operation_diverged");
 return {format:r.format,formatVersion:1,recoveryDatabase:r.recoveryDatabase,plan:r.plan,phase:r.phase};
}
export function operationSchema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(",")!=="operation,origin")throw operationFailure("operation_diverged");}
export function operationStore(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw operationFailure("operation_diverged");}
