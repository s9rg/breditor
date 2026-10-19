import {operationFailure,operationSignal} from "./errors.js";
import {checkOperationRecord,operationSchema,operationStore,type OperationRecord} from "./record.js";
/** Strict one-way compare-and-update. Retained source bytes are never rewritten. */
export async function publishParticipantOperation(db:IDBDatabase,before:OperationRecord,guard:()=>void,signal?:AbortSignal):Promise<OperationRecord>{
 operationSignal(signal);guard();operationSignal(signal);operationSchema(db);const next=checkOperationRecord({...before,phase:"operational"},before);
 return new Promise((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction(["operation","origin"],"readwrite",{durability:"strict"});}catch{reject(operationFailure());return;}let reason:unknown;
  const fail=(error:unknown)=>{reason=error;try{tx.abort();}catch{}};const cancel=()=>fail(operationFailure("operation_aborted"));signal?.addEventListener("abort",cancel,{once:true});
  tx.onabort=()=>{signal?.removeEventListener("abort",cancel);reject(reason??operationFailure());};tx.oncomplete=()=>{signal?.removeEventListener("abort",cancel);resolve(next);};
  const s=tx.objectStore("operation"),o=tx.objectStore("origin");try{operationStore(s);operationStore(o);}catch(error){fail(error);return;}
  for(const store of [s,o]){const c=store.count();c.onsuccess=()=>{if(c.result!==1)fail(operationFailure("operation_diverged"));};}
  const r=s.get("state");r.onsuccess=()=>{try{guard();operationSignal(signal);if(JSON.stringify(checkOperationRecord(r.result,before))!==JSON.stringify(before))throw operationFailure("operation_diverged");s.put(next,"state");}catch(error){fail(error);}};
  const f=o.get("participant");f.onsuccess=()=>{if(!(f.result instanceof Blob))fail(operationFailure("operation_diverged"));};
 });
}
