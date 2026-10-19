import {recoveryFailure} from "./errors.js";
import type {SharedParticipantRecoveryProgress} from "./types.js";
export interface RecoveryRecord extends SharedParticipantRecoveryProgress {readonly format:"breditor/shared-participant-recovery";readonly formatVersion:1;readonly plan:string}
const store="attempts",key="attempt";
export function checkRecoveryRecord(raw:unknown,expected:RecoveryRecord):RecoveryRecord{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw recoveryFailure("recovery_diverged");
 const r=raw as RecoveryRecord;if(Object.keys(r).sort().join(",")!=="format,formatVersion,phase,plan,steps"||r.format!==expected.format||r.formatVersion!==1||r.plan!==expected.plan||(r.phase!=="preparing"&&r.phase!=="ready")||!Array.isArray(r.steps)||r.steps.length!==expected.steps.length)throw recoveryFailure("recovery_diverged");
 let tail=false;for(let i=0;i<r.steps.length;i++){const row=r.steps[i]!;if(!row||Object.keys(row).sort().join(",")!=="state,step"||row.step!==expected.steps[i]!.step||!["reserved","started","complete"].includes(row.state)||tail&&row.state!=="reserved")throw recoveryFailure("recovery_diverged");if(row.state!=="complete")tail=true;}
 if(r.phase==="ready"&&r.steps.some(s=>s.state!=="complete"))throw recoveryFailure("recovery_diverged");return structuredClone(r);
}
/** The initial attempt marker and schema commit in one upgrade transaction, never separately. */
export function createRecoveryJournal(name:string,record:RecoveryRecord):Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);let created=false,failed=false;r.onupgradeneeded=event=>{if(event.oldVersion!==0){r.transaction!.abort();return;}created=true;r.result.createObjectStore(store).add(record,key);};r.onerror=()=>reject(recoveryFailure("recovery_storage"));r.onblocked=()=>{failed=true;reject(recoveryFailure("recovery_exists"));};r.onsuccess=()=>{if(failed||!created){r.result.close();reject(recoveryFailure("recovery_exists"));}else resolve(r.result);};});
}
/** Opening a missing name aborts its creation; no empty recovery database is manufactured. */
export function existingDatabase(name:string):Promise<IDBDatabase|undefined>{
 return new Promise((resolve,reject)=>{const r=indexedDB.open(name);let missing=false,blocked=false;r.onupgradeneeded=()=>{missing=true;r.transaction!.abort();};r.onerror=()=>missing?resolve(undefined):reject(recoveryFailure("recovery_storage"));r.onblocked=()=>{blocked=true;reject(recoveryFailure("recovery_in_use"));};r.onsuccess=()=>{if(blocked)r.result.close();else resolve(r.result);};});
}
export function journalSchema(db:IDBDatabase):void{if(db.version!==1||db.objectStoreNames.length!==1||!db.objectStoreNames.contains(store))throw recoveryFailure("recovery_diverged");}
export function readRecoveryJournal(db:IDBDatabase,expected:RecoveryRecord):Promise<RecoveryRecord>{
 journalSchema(db);return new Promise((resolve,reject)=>{let value:RecoveryRecord,failure:unknown;const tx=db.transaction(store,"readonly"),s=tx.objectStore(store);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length){tx.abort();reject(recoveryFailure("recovery_diverged"));return;}const r=s.get(key),count=s.count();r.onsuccess=()=>{try{value=checkRecoveryRecord(r.result,expected);}catch(e){failure=e;tx.abort();}};count.onsuccess=()=>{if(count.result!==1){failure=recoveryFailure("recovery_diverged");tx.abort();}};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(failure??recoveryFailure());});
}
/** Compare-and-update the same selected attempt. Abort/cancel ambiguity is resolved by resume. */
export function writeRecoveryJournal(db:IDBDatabase,before:RecoveryRecord,next:RecoveryRecord,signal?:AbortSignal):Promise<void>{
 if(signal?.aborted)return Promise.reject(recoveryFailure("recovery_aborted"));
 return new Promise((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction(store,"readwrite",{durability:"strict"});}catch{reject(recoveryFailure());return;}let failure:unknown;const abort=()=>{failure=recoveryFailure("recovery_aborted");try{tx.abort();}catch{/* A committed update is resolved through exact resume. */}};signal?.addEventListener("abort",abort,{once:true});
  tx.oncomplete=()=>{signal?.removeEventListener("abort",abort);resolve();};tx.onabort=()=>{signal?.removeEventListener("abort",abort);reject(failure??recoveryFailure());};
  const s=tx.objectStore(store),r=s.get(key);r.onsuccess=()=>{try{if(signal?.aborted)throw recoveryFailure("recovery_aborted");if(JSON.stringify(checkRecoveryRecord(r.result,before))!==JSON.stringify(before))throw recoveryFailure("recovery_diverged");checkRecoveryRecord(next,before);s.put(next,key);}catch(e){failure=e;try{tx.abort();}catch{}}};
 });
}
