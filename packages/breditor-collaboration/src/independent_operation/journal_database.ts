/** Atomic intent/original/two-cut storage. No source database or old schema is migrated. */
import {existingDatabase} from '../participant_recovery/journal.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import {copyOperationCut,sameOperationCut} from './cut_codec.js';
import {readOperationCutIntent,checkOperationCutTransition,type IndependentOperationCutIntent,type IndependentOperationJournalIdentity} from './cut_intent.js';
import {operationJournalFailure as fail} from './journal_failure.js';
const intent='operation_intent',original='operation_original',cuts='operation_cuts',stateKey='state',fileKey='participant',names=[intent,original,cuts];
export interface OperationJournalStored {
 readonly record:IndependentOperationCutIntent;readonly file:Blob;readonly rows:ReadonlyMap<string,unknown>;
}
export interface OperationJournalChecked extends Omit<OperationJournalStored,'rows'>{readonly rows:ReadonlyMap<string,IndependentHistoryCut>}
function schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(',')!==[...names].sort().join(','))throw fail();}
/** Read all keys and values in the same transaction; the callback may perform the final CAS. */
function readInside(tx:IDBTransaction,id:IndependentOperationJournalIdentity,accept:(value:OperationJournalStored)=>void,abort:(reason:unknown)=>void):void{
 const tables=new Map<string,{keys:IDBValidKey[];values:unknown[]}>();let left=names.length*2;
 const ready=()=>{if(--left)return;try{
  const i=tables.get(intent)!,o=tables.get(original)!,c=tables.get(cuts)!;
  if(i.keys.length!==1||i.keys[0]!==stateKey||o.keys.length!==1||o.keys[0]!==fileKey||!(o.values[0] instanceof Blob))throw fail();
  const record=readOperationCutIntent(i.values[0],id),references=new Set([record.current,record.pending].filter((v):v is string=>v!==null));
  if(c.keys.length!==references.size||c.keys.some(key=>typeof key!=='string'||!references.has(key)))throw fail();
  accept({record,file:o.values[0],rows:new Map(c.keys.map((key,index)=>[key as string,c.values[index]]))});
 }catch(error){abort(error);}};
 try{for(const name of names){const s=tx.objectStore(name);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail();const table={keys:[] as IDBValidKey[],values:[] as unknown[]};tables.set(name,table);
   s.getAllKeys().onsuccess=e=>{table.keys=(e.target as IDBRequest<IDBValidKey[]>).result;ready();};s.getAll().onsuccess=e=>{table.values=(e.target as IDBRequest<unknown[]>).result;ready();};
 }}catch(error){abort(error);}
}
export function createOperationJournalDatabase(name:string,record:IndependentOperationCutIntent,file:Blob,guard:()=>void):Promise<IDBDatabase>{
 guard();return new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);let created=false,blocked=false,reason:unknown;
  request.onupgradeneeded=e=>{try{guard();if(e.oldVersion!==0)throw fail();created=true;request.result.createObjectStore(intent).add(record,stateKey);request.result.createObjectStore(original).add(file,fileKey);request.result.createObjectStore(cuts);}catch(error){reason=error;request.transaction!.abort();}};
  request.onerror=()=>reject(reason??fail());request.onblocked=()=>{blocked=true;reject(fail());};request.onsuccess=()=>{try{guard();if(!created||blocked)throw fail();schema(request.result);resolve(request.result);}catch(error){request.result.close();reject(error);}};
 });
}
export async function existingOperationJournalDatabase(name:string):Promise<IDBDatabase>{const db=await existingDatabase(name);if(!db)throw fail('independent_operation_missing');try{schema(db);return db;}catch(error){db.close();throw error;}}
export function readOperationJournalDatabase(db:IDBDatabase,id:IndependentOperationJournalIdentity):Promise<OperationJournalStored>{
 schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(names,'readonly');let value:OperationJournalStored,reason:unknown;
  const abort=(error:unknown)=>{reason=error;try{tx.abort();}catch{/* Preserve the terminal transaction result. */}};
  tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(reason??tx.error??fail());readInside(tx,id,result=>{value=result;},abort);
 });
}
/** Prepare or acknowledge atomically. An exact lost-ack retry is resolved by the caller's readback. */
export function writeOperationJournalDatabase(db:IDBDatabase,id:IndependentOperationJournalIdentity,before:OperationJournalChecked,next:IndependentOperationCutIntent,candidate:Readonly<{id:string;cut:IndependentHistoryCut}>|undefined,guard:()=>void):Promise<void>{
 schema(db);checkOperationCutTransition(before.record,next,id);guard();
 return new Promise((resolve,reject)=>{const tx=db.transaction(names,'readwrite',{durability:'strict'});let reason:unknown;
  const abort=(error:unknown)=>{reason=error;try{tx.abort();}catch{/* A commit-before-ack is reconciled without rewriting. */}};
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(reason??tx.error??fail());
  readInside(tx,id,actual=>{
   guard();if(JSON.stringify(actual.record)!==JSON.stringify(before.record)||actual.file.size!==before.file.size||actual.file.type!==before.file.type||actual.rows.size!==before.rows.size)throw fail();
   for(const [key,cut]of before.rows)if(!sameOperationCut(actual.rows.get(key),cut))throw fail();
   const retained=new Set([next.current,next.pending].filter((v):v is string=>v!==null)),available=new Map(before.rows);
   if(candidate){const old=available.get(candidate.id);if(old&&!sameOperationCut(candidate.cut,old))throw fail();available.set(candidate.id,candidate.cut);}
   if(retained.size>2||[...retained].some(key=>!available.has(key)))throw fail();guard();
   const store=tx.objectStore(cuts);for(const key of before.rows.keys())if(!retained.has(key))store.delete(key);
   for(const key of retained)if(!before.rows.has(key))store.add(copyOperationCut(available.get(key)!),key);
   tx.objectStore(intent).put(next,stateKey);
  },abort);
 });
}
