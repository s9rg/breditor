/** Insert the original file and initial attempt together; exact CAS resolves interrupted updates. */
import {checkIndependentDeliveryRecoveryRecord,checkIndependentDeliveryRecoveryTransition,type IndependentDeliveryRecoveryRecord} from './record.js';
import {independentDeliveryRecoveryFailure as fail} from './policy.js';
const attempts='delivery_attempts',files='delivery_originals',key='attempt',fileKey='participant';
function schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(',')!=='delivery_attempts,delivery_originals')throw fail('independent_delivery_recovery_diverged');}
function store(s:IDBObjectStore):void{if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail('independent_delivery_recovery_diverged');}
export function createIndependentDeliveryRecoveryDatabase(name:string,record:IndependentDeliveryRecoveryRecord,file:Blob,guard:()=>void):Promise<IDBDatabase>{
 guard();return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);let created=false,blocked=false,reason:unknown;
  r.onupgradeneeded=e=>{try{guard();if(e.oldVersion!==0)throw fail('independent_delivery_recovery_exists');created=true;r.result.createObjectStore(attempts).add(record,key);r.result.createObjectStore(files).add(file,fileKey);}catch(error){reason=error;r.transaction!.abort();}};
  r.onerror=()=>reject(reason??fail());r.onblocked=()=>{blocked=true;reject(fail('independent_delivery_recovery_exists'));};r.onsuccess=()=>{try{guard();if(!created||blocked)throw fail('independent_delivery_recovery_exists');resolve(r.result);}catch(error){r.result.close();reject(error);}};
 });
}
export function readIndependentDeliveryRecoveryDatabase(db:IDBDatabase,expected:IndependentDeliveryRecoveryRecord):Promise<{record:IndependentDeliveryRecoveryRecord;file:Blob}>{
 schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction([attempts,files],'readonly');let record:IndependentDeliveryRecoveryRecord,file:Blob,reason:unknown;const abort=(error:unknown)=>{reason=error;try{tx.abort();}catch{/* Retain the actual transaction outcome. */}};
  tx.oncomplete=()=>resolve({record,file});tx.onabort=()=>reject(reason??fail());const a=tx.objectStore(attempts),f=tx.objectStore(files);try{store(a);store(f);}catch(error){abort(error);return;}
  a.get(key).onsuccess=e=>{try{record=checkIndependentDeliveryRecoveryRecord((e.target as IDBRequest).result,expected);}catch(error){abort(error);}};
  f.get(fileKey).onsuccess=e=>{const value=(e.target as IDBRequest).result;if(!(value instanceof Blob))abort(fail('independent_delivery_recovery_missing'));else file=value;};
  for(const s of [a,f])s.count().onsuccess=e=>{if((e.target as IDBRequest<number>).result!==1)abort(fail('independent_delivery_recovery_diverged'));};
 });
}
export function writeIndependentDeliveryRecoveryRecord(db:IDBDatabase,before:IndependentDeliveryRecoveryRecord,next:IndependentDeliveryRecoveryRecord,guard:()=>void):Promise<void>{
 schema(db);checkIndependentDeliveryRecoveryTransition(before,next);guard();return new Promise((resolve,reject)=>{const tx=db.transaction([attempts,files],'readwrite',{durability:'strict'});let reason:unknown;const abort=(error:unknown)=>{reason=error;try{tx.abort();}catch{/* A commit-before-ack is resolved by exact readback. */}};
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(reason??fail());const s=tx.objectStore(attempts),f=tx.objectStore(files);try{store(s);store(f);}catch(error){abort(error);return;}
  s.get(key).onsuccess=e=>{try{guard();if(JSON.stringify(checkIndependentDeliveryRecoveryRecord((e.target as IDBRequest).result,before))!==JSON.stringify(before))throw fail('independent_delivery_recovery_diverged');s.put(next,key);}catch(error){abort(error);}};
  f.get(fileKey).onsuccess=e=>{if(!((e.target as IDBRequest).result instanceof Blob))abort(fail('independent_delivery_recovery_missing'));};
  for(const v of [s,f])v.count().onsuccess=e=>{if((e.target as IDBRequest<number>).result!==1)abort(fail('independent_delivery_recovery_diverged'));};
 });
}
