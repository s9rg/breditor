/** One immutable original and one monotone attempt. Count before value cloning;
 * updates use the exact current record and never replace an original file. */
import {checkIndependentRecoveryRecord,checkIndependentRecoveryTransition,type IndependentRecoveryRecord} from './record.js';
import {independentRecoveryFailure as fail} from './policy.js';
import {onIndependentRecoveryAbort} from './signal.js';
const attempts='independent_attempts',files='independent_originals',key='attempt',fileKey='participant';
function schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(',')!=='independent_attempts,independent_originals')throw fail('independent_recovery_diverged');}
function store(s:IDBObjectStore):void{if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail('independent_recovery_diverged');}
export function createIndependentRecoveryDatabase(name:string,record:IndependentRecoveryRecord,file:Blob,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 guard();return new Promise((resolve,reject)=>{
  const r=indexedDB.open(name,1);let created=false,blocked=false,reason:unknown;const cancelled=()=>{reason??=fail('independent_recovery_aborted');try{r.transaction?.abort();}catch{/* Retain an already completed cut for resume. */}},settled=onIndependentRecoveryAbort(signal,cancelled);
  r.onupgradeneeded=e=>{try{if(blocked)throw fail('independent_recovery_exists');guard();if(e.oldVersion!==0)throw fail('independent_recovery_exists');created=true;const a=r.result.createObjectStore(attempts);guard();a.add(record,key);guard();const f=r.result.createObjectStore(files);guard();f.add(file,fileKey);guard();}catch(error){reason??=error;try{r.transaction!.abort();}catch{/* The signal may already have aborted this upgrade. */}}};
  r.onerror=()=>{settled();reject(reason??fail());};r.onblocked=()=>{blocked=true;settled();reject(fail('independent_recovery_exists'));};r.onsuccess=()=>{settled();try{guard();if(!created||blocked)throw fail('independent_recovery_exists');resolve(r.result);}catch(error){r.result.close();reject(error);}};
 });
}
export function readIndependentRecoveryDatabase(db:IDBDatabase,expected:IndependentRecoveryRecord,guard:()=>void):Promise<{record:IndependentRecoveryRecord;file:Blob}>{
 guard();schema(db);return new Promise((resolve,reject)=>{
  const tx=db.transaction([attempts,files],'readonly');let record:IndependentRecoveryRecord,file:Blob,reason:unknown;const abort=(error:unknown)=>{reason??=error;try{tx.abort();}catch{/* The actual transaction outcome remains authoritative. */}};
  tx.oncomplete=()=>resolve({record,file});tx.onabort=()=>reject(reason??fail());const a=tx.objectStore(attempts),f=tx.objectStore(files);try{store(a);store(f);}catch(error){abort(error);return;}
  a.count().onsuccess=e=>{try{guard();if((e.target as IDBRequest<number>).result!==1)throw fail('independent_recovery_diverged');a.get(key).onsuccess=v=>{try{guard();record=checkIndependentRecoveryRecord((v.target as IDBRequest).result,expected);}catch(error){abort(error);}};}catch(error){abort(error);}};
  f.count().onsuccess=e=>{try{guard();if((e.target as IDBRequest<number>).result!==1)throw fail('independent_recovery_diverged');f.get(fileKey).onsuccess=v=>{try{guard();const value=(v.target as IDBRequest).result;if(!(value instanceof Blob))throw fail('independent_recovery_missing');file=value;}catch(error){abort(error);}};}catch(error){abort(error);}};
 });
}
export function writeIndependentRecoveryRecord(db:IDBDatabase,before:IndependentRecoveryRecord,next:IndependentRecoveryRecord,guard:()=>void,signal?:AbortSignal):Promise<void>{
 guard();schema(db);checkIndependentRecoveryTransition(before,next);return new Promise((resolve,reject)=>{
  const tx=db.transaction([attempts,files],'readwrite',{durability:'strict'});let reason:unknown;const abort=(error:unknown)=>{reason??=error;try{tx.abort();}catch{/* Exact readback resolves a commit-before-acknowledgement. */}},cancelled=()=>abort(fail('independent_recovery_aborted')),settled=onIndependentRecoveryAbort(signal,cancelled);
  tx.oncomplete=()=>{settled();resolve();};tx.onabort=()=>{settled();reject(reason??fail());};const s=tx.objectStore(attempts),f=tx.objectStore(files);try{store(s);store(f);}catch(error){abort(error);return;}
  s.count().onsuccess=e=>{try{guard();if((e.target as IDBRequest<number>).result!==1)throw fail('independent_recovery_diverged');s.get(key).onsuccess=v=>{try{guard();if(JSON.stringify(checkIndependentRecoveryRecord((v.target as IDBRequest).result,before))!==JSON.stringify(before))throw fail('independent_recovery_diverged');s.put(next,key);guard();}catch(error){abort(error);}};}catch(error){abort(error);}};
  f.count().onsuccess=e=>{try{guard();if((e.target as IDBRequest<number>).result!==1)throw fail('independent_recovery_diverged');f.get(fileKey).onsuccess=v=>{try{guard();if(!((v.target as IDBRequest).result instanceof Blob))throw fail('independent_recovery_missing');}catch(error){abort(error);}};}catch(error){abort(error);}};
 });
}
