/** One bounded explicit parent state, absent-only creation and exact CAS.
 * The parent writes no retired recovery/source/upload rows. */
import {onIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {readLocalParticipantRecord,checkLocalParticipantTransition,type LocalParticipantRecord} from './participant_record.js';
import {localJournalFailure as fail} from './journal_failure.js';
const table='local_operation_participant',key='state';
function schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].join(',')!==table)throw fail('independent_local_participant_schema');}
function store(s:IDBObjectStore):void{if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail('independent_local_participant_schema');}
export function createLocalParticipantDatabase(context:IDBFactory,name:string,record:LocalParticipantRecord,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 guard();return new Promise((resolve,reject)=>{let tx:IDBTransaction|null=null,created=false,abandoned=false,reason:unknown,off=()=>{};const abort=(error:unknown)=>{reason??=error;try{tx?.abort();}catch{/* Explicit cold resume resolves committed publication. */}};
  try{off=onIndependentRecoveryAbort(signal,()=>abort(fail('independent_local_participant_aborted')));guard();if(signal?.aborted||reason)throw reason??fail('independent_local_participant_aborted');const request=context.open(name,1);
   request.onupgradeneeded=e=>{tx=request.transaction;try{guard();if(e.oldVersion!==0||reason)throw reason??fail('independent_local_participant_exists');created=true;request.result.createObjectStore(table).add(record,key);guard();}catch(error){abort(error);}};
   request.onerror=()=>{off();reject(reason??request.error??fail());};request.onblocked=()=>{abandoned=true;off();reject(fail('independent_local_participant_busy'));};request.onsuccess=()=>{off();try{guard();if(!created||abandoned||reason)throw reason??fail('independent_local_participant_exists');schema(request.result);resolve(request.result);}catch(error){request.result.close();reject(error);}};
  }catch(error){off();reject(error);}
 });
}
function readInside(tx:IDBTransaction,expected:LocalParticipantRecord,accept:(record:LocalParticipantRecord)=>void,abort:(error:unknown)=>void,guard:()=>void):void{
 try{guard();const s=tx.objectStore(table);store(s);s.count().onsuccess=e=>{try{guard();if((e.target as IDBRequest<number>).result!==1)throw fail('independent_local_participant_record');s.get(key).onsuccess=e=>{try{guard();accept(readLocalParticipantRecord((e.target as IDBRequest).result,expected));}catch(error){abort(error);}};}catch(error){abort(error);}};}catch(error){abort(error);}
}
export function readLocalParticipantDatabase(db:IDBDatabase,expected:LocalParticipantRecord,guard:()=>void):Promise<LocalParticipantRecord>{
 guard();schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(table,'readonly');let value:LocalParticipantRecord,reason:unknown;const abort=(error:unknown)=>{reason??=error;try{tx.abort();}catch{/* Keep actual terminal outcome. */}};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(reason??tx.error??fail());readInside(tx,expected,row=>{value=row;},abort,guard);});
}
export function writeLocalParticipantRecord(db:IDBDatabase,before:LocalParticipantRecord,next:LocalParticipantRecord,guard:()=>void,signal?:AbortSignal):Promise<void>{
 guard();schema(db);checkLocalParticipantTransition(before,next);return new Promise((resolve,reject)=>{let tx:IDBTransaction|undefined,reason:unknown,off=()=>{};const abort=(error:unknown)=>{reason??=error;try{tx?.abort();}catch{/* Read exact committed phase on retry. */}};
  try{off=onIndependentRecoveryAbort(signal,()=>abort(fail('independent_local_participant_aborted')));guard();if(signal?.aborted||reason)throw reason??fail('independent_local_participant_aborted');const active=db.transaction(table,'readwrite',{durability:'strict'});tx=active;active.oncomplete=()=>{off();resolve();};active.onabort=()=>{off();reject(reason??active.error??fail());};
   readInside(active,before,actual=>{guard();if(JSON.stringify(actual)!==JSON.stringify(before))throw fail('independent_local_participant_record');active.objectStore(table).put(next,key);guard();},abort,guard);
  }catch(error){if(tx)abort(error);else{off();reject(error);}}
 });
}
