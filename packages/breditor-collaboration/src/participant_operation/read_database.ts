import {existingDatabase} from "../participant_recovery/journal.js";
import {operationFailure} from "./errors.js";
import {checkOperationRecord,operationSchema,operationStore,type OperationRecord} from "./record.js";
/** Install the caller's live fence before the first asynchronous record/file inspection. */
export async function existingOperationDatabase(name:string,opened:(db:IDBDatabase)=>void):Promise<IDBDatabase>{const db=await existingDatabase(name);if(!db)throw operationFailure("operation_missing");try{opened(db);operationSchema(db);return db;}catch(error){db.close();throw error;}}
export async function readOperationDatabase(db:IDBDatabase,expected?:OperationRecord):Promise<{record:OperationRecord;file:Blob}>{
 operationSchema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(["operation","origin"],"readonly"),s=tx.objectStore("operation"),o=tx.objectStore("origin");let record:OperationRecord,file:Blob,reason:unknown;
  const fail=(error:unknown)=>{reason=error;try{tx.abort();}catch{}};
  tx.onabort=()=>reject(reason??operationFailure());tx.oncomplete=()=>resolve({record,file});
  try{operationStore(s);operationStore(o);}catch(error){fail(error);return;}
  for(const store of [s,o]){const c=store.count();c.onsuccess=()=>{if(c.result!==1)fail(operationFailure("operation_diverged"));};}
  const r=s.get("state");r.onsuccess=()=>{try{record=checkOperationRecord(r.result,expected);}catch(error){fail(error);}};
  const f=o.get("participant");f.onsuccess=()=>{if(!(f.result instanceof Blob))fail(operationFailure("operation_diverged"));else file=f.result;};
 });
}
