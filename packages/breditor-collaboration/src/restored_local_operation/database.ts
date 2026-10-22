/** Distinct restored-local intent/incoming/two-cut schema. Count before value cloning;
 * each transition is exact CAS, and cancellation aborts the actual transaction. */
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import {copyOperationCut,sameOperationCut} from '../independent_operation/cut_codec.js';
import {readBoundedStore} from '../persistence/read_bounded_store.js';
import {onIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {readRestoredLocalIntent,checkRestoredLocalTransition,type RestoredLocalCutIntent} from './intent.js';
import type {RestoredLocalIdentity} from './head.js';
import {restoredLocalFailure as fail} from './failure.js';
const intent='restored_local_operation_intent',original='restored_local_operation_input',cuts='restored_local_operation_cuts',names=[intent,original,cuts],stateKey='state',fileKey='incoming';
export interface RestoredLocalJournalStored{readonly record:RestoredLocalCutIntent;readonly file:Blob;readonly rows:ReadonlyMap<string,unknown>}
export interface RestoredLocalJournalChecked extends Omit<RestoredLocalJournalStored,'rows'>{readonly rows:ReadonlyMap<string,IndependentHistoryCut>}
function schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(',')!==[...names].sort().join(','))throw fail();}
function readInside(tx:IDBTransaction,id:RestoredLocalIdentity,accept:(value:RestoredLocalJournalStored)=>void,abort:(error:unknown)=>void,guard:()=>void):void{
 const tables=new Map<string,{keys:IDBValidKey[];values:unknown[]}>();let left=3;
 const ready=()=>{if(--left)return;try{guard();const i=tables.get(intent)!,o=tables.get(original)!,c=tables.get(cuts)!;if(i.keys.length!==1||i.keys[0]!==stateKey||o.keys.length!==1||o.keys[0]!==fileKey||!(o.values[0] instanceof Blob))throw fail();const record=readRestoredLocalIntent(i.values[0],id),refs=new Set([record.current,record.pending].filter((v):v is string=>v!==null));if(c.keys.length!==refs.size||c.keys.some(key=>typeof key!=='string'||!refs.has(key)))throw fail();accept({record,file:o.values[0],rows:new Map(c.keys.map((key,index)=>[key as string,c.values[index]]))});}catch(error){abort(error);}};
 try{for(const name of names){guard();const s=tx.objectStore(name);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail();readBoundedStore(s,name===cuts?2:1,row=>{tables.set(name,row);ready();},abort,()=>fail());}}catch(error){abort(error);}
}
export function createRestoredLocalJournalDatabase(factory:IDBFactory,name:string,record:RestoredLocalCutIntent,file:Blob,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 guard();return new Promise((resolve,reject)=>{let tx:IDBTransaction|null=null,created=false,abandoned=false,reason:unknown,off=()=>{};const abort=(error:unknown)=>{reason??=error;try{tx?.abort();}catch{/* Completed bytes require explicit resume. */}};
  try{off=onIndependentRecoveryAbort(signal,()=>abort(fail('restored_local_operation_aborted')));guard();if(signal?.aborted||reason)throw reason??fail('restored_local_operation_aborted');const request=factory.open(name,1);
   request.onupgradeneeded=e=>{tx=request.transaction;try{guard();if(e.oldVersion!==0||reason)throw reason??fail();created=true;request.result.createObjectStore(intent).add(record,stateKey);request.result.createObjectStore(original).add(file,fileKey);request.result.createObjectStore(cuts);guard();}catch(error){abort(error);}};
   request.onerror=()=>{off();reject(reason??request.error??fail());};request.onblocked=()=>{abandoned=true;off();reject(fail('restored_local_operation_busy'));};request.onsuccess=()=>{off();try{guard();if(!created||abandoned||reason)throw reason??fail('restored_local_operation_exists');schema(request.result);resolve(request.result);}catch(error){request.result.close();reject(error);}};
  }catch(error){off();reject(error);}
 });
}
export async function existingRestoredLocalJournalDatabase(name:string,guard:()=>void):Promise<IDBDatabase>{guard();const db=await existingDatabase(name);try{guard();if(!db)throw fail('restored_local_operation_missing');schema(db);return db;}catch(error){db?.close();throw error;}}
/** Read the literal incoming file before deriving its selected plan. This is a
 * bounded read, not permission to reconstruct missing acknowledged inputs. */
export function readRestoredLocalJournalInput(db:IDBDatabase,guard:()=>void):Promise<Blob>{
 guard();schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(original,'readonly');let file:Blob,reason:unknown;const abort=(error:unknown)=>{reason=error;try{tx.abort();}catch{/* Preserve terminal outcome. */}};tx.oncomplete=()=>{try{guard();resolve(file);}catch(error){reject(error);}};tx.onabort=()=>reject(reason??tx.error??fail());try{const store=tx.objectStore(original);if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail();readBoundedStore(store,1,row=>{try{guard();if(row.keys.length!==1||row.keys[0]!==fileKey||!(row.values[0] instanceof Blob))throw fail();file=row.values[0];}catch(error){abort(error);}},abort,()=>fail());}catch(error){abort(error);}});
}
export function readRestoredLocalJournalDatabase(db:IDBDatabase,id:RestoredLocalIdentity,guard:()=>void):Promise<RestoredLocalJournalStored>{
 guard();schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(names,'readonly');let value:RestoredLocalJournalStored,reason:unknown;const abort=(error:unknown)=>{reason=error;try{tx.abort();}catch{/* Keep the terminal read outcome. */}};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(reason??tx.error??fail());readInside(tx,id,row=>{value=row;},abort,guard);});
}
export function writeRestoredLocalJournalDatabase(db:IDBDatabase,id:RestoredLocalIdentity,before:RestoredLocalJournalChecked,next:RestoredLocalCutIntent,candidate:Readonly<{id:string;cut:IndependentHistoryCut}>|undefined,guard:()=>void,signal?:AbortSignal):Promise<void>{
 guard();schema(db);checkRestoredLocalTransition(before.record,next,id);return new Promise((resolve,reject)=>{let tx:IDBTransaction|undefined,reason:unknown,off=()=>{};const abort=(error:unknown)=>{reason??=error;try{tx?.abort();}catch{/* A completed commit is retained for exact readback. */}};
  try{off=onIndependentRecoveryAbort(signal,()=>abort(fail('restored_local_operation_aborted')));guard();if(signal?.aborted||reason)throw reason??fail('restored_local_operation_aborted');const active=db.transaction(names,'readwrite',{durability:'strict'});tx=active;active.oncomplete=()=>{off();resolve();};active.onabort=()=>{off();reject(reason??active.error??fail());};
   readInside(active,id,actual=>{guard();if(JSON.stringify(actual.record)!==JSON.stringify(before.record)||actual.file.size!==before.file.size||actual.file.type!==before.file.type||actual.rows.size!==before.rows.size)throw fail();for(const[key,cut]of before.rows)if(!sameOperationCut(actual.rows.get(key),cut))throw fail();const keep=new Set([next.current,next.pending].filter((v):v is string=>v!==null)),available=new Map(before.rows);if(candidate){const old=available.get(candidate.id);if(old&&!sameOperationCut(candidate.cut,old))throw fail();available.set(candidate.id,candidate.cut);}if(keep.size>2||[...keep].some(key=>!available.has(key)))throw fail();guard();const store=active.objectStore(cuts);for(const key of before.rows.keys())if(!keep.has(key))store.delete(key);for(const key of keep)if(!before.rows.has(key))store.add(copyOperationCut(available.get(key)!),key);active.objectStore(intent).put(next,stateKey);guard();},abort,guard);
  }catch(error){if(tx)abort(error);else{off();reject(error);}}
 });
}
