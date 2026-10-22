/** Two closed stores retain the whole immutable input before any component mutation. */
import {existingDatabase} from '../participant_recovery/journal.js';
import {readBoundedStore} from '../persistence/read_bounded_store.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
import {readRestoredParticipantRecord,checkRestoredParticipantTransition,type RestoredParticipantRecord} from './record.js';
const state='restored_participant_state',input='restored_participant_input',names=[state,input];
function schema(db:IDBDatabase){if(db.version!==1||[...db.objectStoreNames].sort().join(',')!==[...names].sort().join(','))throw fail('restored_participant_schema');}
function inside(tx:IDBTransaction,accept:(value:{record:unknown;file:Blob})=>void,abort:(e:unknown)=>void){
 const tables=new Map<string,{keys:IDBValidKey[];values:unknown[]}>();let left=2;const ready=()=>{if(--left)return;try{const s=tables.get(state)!,i=tables.get(input)!;if(s.keys.length!==1||s.keys[0]!=='state'||i.keys.length!==1||i.keys[0]!=='input'||!(i.values[0] instanceof Blob))throw fail('restored_participant_schema');accept({record:s.values[0],file:i.values[0]});}catch(e){abort(e);}};
 try{for(const name of names){const s=tx.objectStore(name);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail('restored_participant_schema');readBoundedStore(s,1,t=>{tables.set(name,t);ready();},abort,()=>fail('restored_participant_schema'));}}catch(e){abort(e);}
}
export function createRestoredParticipantDatabase(name:string,record:RestoredParticipantRecord,file:Blob,check:()=>void):Promise<IDBDatabase>{
 check();return new Promise((resolve,reject)=>{let created=false,blocked=false,reason:unknown;const q=indexedDB.open(name,1);q.onupgradeneeded=e=>{try{check();if(e.oldVersion!==0)throw fail('restored_participant_exists');created=true;q.result.createObjectStore(state).add(record,'state');q.result.createObjectStore(input).add(file,'input');}catch(e){reason=e;q.transaction!.abort();}};q.onblocked=()=>{blocked=true;reject(fail('restored_participant_blocked'));};q.onerror=()=>reject(reason??q.error??fail());q.onsuccess=()=>{try{check();if(!created||blocked)throw fail('restored_participant_exists');schema(q.result);resolve(q.result);}catch(e){q.result.close();reject(e);}};});
}
export async function existingRestoredParticipantDatabase(name:string){const db=await existingDatabase(name);if(!db)throw fail('restored_participant_missing');try{schema(db);return db;}catch(e){db.close();throw e;}}
export function readRestoredParticipantDatabase(db:IDBDatabase):Promise<{record:unknown;file:Blob}>{schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(names,'readonly');let result:{record:unknown;file:Blob},reason:unknown;const abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(reason??tx.error??fail());inside(tx,v=>{result=v;},abort);});}
export function writeRestoredParticipantDatabase(db:IDBDatabase,before:RestoredParticipantRecord,next:RestoredParticipantRecord,check:()=>void):Promise<void>{
 schema(db);checkRestoredParticipantTransition(before,next);check();return new Promise((resolve,reject)=>{const tx=db.transaction(names,'readwrite',{durability:'strict'});let reason:unknown;const abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(reason??tx.error??fail());inside(tx,actual=>{check();if(JSON.stringify(readRestoredParticipantRecord(actual.record,before.plan))!==JSON.stringify(before))throw fail('restored_participant_changed');tx.objectStore(state).put(next,'state');},abort);});
}
