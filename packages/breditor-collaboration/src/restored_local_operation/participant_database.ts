/** Distinct two-store retained parent state and literal incoming input. Creation
 * is absent-only. Missing acknowledged input never becomes an empty archive. */
import {readBoundedStore} from '../persistence/read_bounded_store.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {onIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {readRestoredLocalParentRecord,checkRestoredLocalParentTransition,type RestoredLocalParentRecord} from './participant_record.js';
import {restoredLocalFailure as fail} from './failure.js';
const state='restored_local_participant',input='restored_local_participant_input',names=[state,input],key='state',fileKey='incoming';
function schema(db:IDBDatabase){if(db.version!==1||[...db.objectStoreNames].sort().join(',')!==[...names].sort().join(','))throw fail('restored_local_participant_schema');}
function store(s:IDBObjectStore){if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail('restored_local_participant_schema');}
export function createRestoredLocalParentDatabase(context:IDBFactory,name:string,record:RestoredLocalParentRecord,file:Blob,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 guard();return new Promise((resolve,reject)=>{let tx:IDBTransaction|null=null,created=false,abandoned=false,reason:unknown,off=()=>{};const abort=(error:unknown)=>{reason??=error;try{tx?.abort();}catch{/* Exact committed input remains for explicit resume. */}};
  try{off=onIndependentRecoveryAbort(signal,()=>abort(fail('restored_local_participant_aborted')));guard();if(signal?.aborted||reason)throw reason??fail('restored_local_participant_aborted');const request=context.open(name,1);
   request.onupgradeneeded=e=>{tx=request.transaction;try{guard();if(e.oldVersion!==0||reason||abandoned)throw reason??fail('restored_local_participant_exists');created=true;request.result.createObjectStore(state).add(record,key);request.result.createObjectStore(input).add(file,fileKey);guard();}catch(error){abort(error);}};
   request.onerror=()=>{off();reject(reason??request.error??fail());};request.onblocked=()=>{abandoned=true;off();reject(fail('restored_local_participant_busy'));};request.onsuccess=()=>{off();try{guard();if(!created||abandoned||reason)throw reason??fail('restored_local_participant_exists');schema(request.result);resolve(request.result);}catch(error){request.result.close();reject(error);}};
  }catch(error){off();reject(error);}
 });
}
export async function existingRestoredLocalParentDatabase(name:string,guard:()=>void){guard();const db=await existingDatabase(name);try{guard();if(!db)throw fail('restored_local_participant_missing');schema(db);return db;}catch(error){db?.close();throw error;}}
function inside(tx:IDBTransaction,accept:(value:{record:unknown;file:Blob})=>void,abort:(error:unknown)=>void,guard:()=>void){
 const rows=new Map<string,{keys:IDBValidKey[];values:unknown[]}>();let left=2;
 const ready=()=>{if(--left)return;try{guard();const r=rows.get(state)!,f=rows.get(input)!;if(r.keys.length!==1||r.keys[0]!==key||f.keys.length!==1||f.keys[0]!==fileKey||!(f.values[0] instanceof Blob))throw fail('restored_local_participant_record');accept({record:r.values[0],file:f.values[0]});}catch(error){abort(error);}};
 try{for(const name of names){guard();const s=tx.objectStore(name);store(s);readBoundedStore(s,1,row=>{rows.set(name,row);ready();},abort,()=>fail('restored_local_participant_record'));}}catch(error){abort(error);}
}
export function readRestoredLocalParentDatabase(db:IDBDatabase,guard:()=>void):Promise<{record:unknown;file:Blob}>{
 guard();schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(names,'readonly');let value:{record:unknown;file:Blob},reason:unknown;const abort=(error:unknown)=>{reason??=error;try{tx.abort();}catch{/* Preserve terminal outcome. */}};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(reason??tx.error??fail());inside(tx,row=>{value=row;},abort,guard);});
}
export function writeRestoredLocalParentRecord(db:IDBDatabase,before:RestoredLocalParentRecord,next:RestoredLocalParentRecord,file:Blob,guard:()=>void,signal?:AbortSignal):Promise<void>{
 guard();schema(db);checkRestoredLocalParentTransition(before,next);return new Promise((resolve,reject)=>{let tx:IDBTransaction|undefined,reason:unknown,off=()=>{};const abort=(error:unknown)=>{reason??=error;try{tx?.abort();}catch{/* Explicit resume reads the actual phase. */}};
  try{off=onIndependentRecoveryAbort(signal,()=>abort(fail('restored_local_participant_aborted')));guard();if(signal?.aborted||reason)throw reason??fail('restored_local_participant_aborted');const active=db.transaction(names,'readwrite',{durability:'strict'});tx=active;active.oncomplete=()=>{off();resolve();};active.onabort=()=>{off();reject(reason??active.error??fail());};inside(active,actual=>{guard();if(JSON.stringify(readRestoredLocalParentRecord(actual.record,before))!==JSON.stringify(before)||actual.file.size!==file.size||actual.file.type!==file.type)throw fail('restored_local_participant_record');active.objectStore(state).put(next,key);guard();},abort,guard);
  }catch(error){if(tx)abort(error);else{off();reject(error);}}
 });
}
