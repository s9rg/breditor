/** Separate four-store schema. Full incoming bytes precede source mutation and stay
 * immutable for cold replay/export. Legacy three-store readers must refuse it. */
import {existingDatabase} from '../participant_recovery/journal.js';
import {readBoundedStore} from '../persistence/read_bounded_store.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import type {IndependentOperationJournalIdentity} from '../independent_operation/cut_intent.js';
import {copyOperationCut,sameOperationCut} from '../independent_operation/cut_codec.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
import {readRestoredOperationStage,checkRestoredOperationTransition,type RestoredOperationStage} from './stage.js';
const stage='restored_operation_stage',original='restored_operation_original',input='restored_operation_input',cuts='restored_operation_cuts',names=[stage,original,input,cuts];
export interface RestoredOperationStored {readonly record:RestoredOperationStage;readonly original:Blob;readonly input:Blob;readonly rows:ReadonlyMap<string,unknown>}
export interface RestoredOperationChecked extends Omit<RestoredOperationStored,'rows'>{readonly rows:ReadonlyMap<string,IndependentHistoryCut>}
function schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(',')!==[...names].sort().join(','))throw fail('restored_operation_schema');}
function inside(tx:IDBTransaction,id:IndependentOperationJournalIdentity,targets:readonly string[],accept:(s:RestoredOperationStored)=>void,abort:(e:unknown)=>void){
 const tables=new Map<string,{keys:IDBValidKey[];values:unknown[]}>();let left=names.length;
 const ready=()=>{if(--left)return;try{
  const s=tables.get(stage)!,o=tables.get(original)!,i=tables.get(input)!,c=tables.get(cuts)!;
  if(s.keys.length!==1||s.keys[0]!=='state'||o.keys.length!==1||o.keys[0]!=='original'||!(o.values[0] instanceof Blob)||i.keys.length!==1||i.keys[0]!=='input'||!(i.values[0] instanceof Blob))throw fail('restored_operation_schema');
  const record=readRestoredOperationStage(s.values[0],id,targets.length),refs=new Set([record.intent.current,record.intent.pending].filter((v):v is string=>v!==null));
  if(c.keys.length!==refs.size||c.keys.some(k=>typeof k!=='string'||!refs.has(k))||record.completed<targets.length&&(record.intent.current!==(record.completed===0?null:targets[record.completed-1])||record.intent.pending!==null&&record.intent.pending!==targets[record.completed]))throw fail('restored_operation_stage');
  accept({record,original:o.values[0],input:i.values[0],rows:new Map(c.keys.map((k,n)=>[k as string,c.values[n]]))});
 }catch(e){abort(e);}};
 try{for(const name of names){const store=tx.objectStore(name);if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail('restored_operation_schema');readBoundedStore(store,name===cuts?2:1,table=>{tables.set(name,table);ready();},abort,()=>fail('restored_operation_schema'));}}catch(e){abort(e);}
}
export function createRestoredOperationDatabase(name:string,record:RestoredOperationStage,originalFile:Blob,inputFile:Blob,check:()=>void):Promise<IDBDatabase>{
 check();return new Promise((resolve,reject)=>{let created=false,blocked=false,reason:unknown;const request=indexedDB.open(name,1);
  request.onupgradeneeded=e=>{try{check();if(e.oldVersion!==0)throw fail('restored_operation_exists');created=true;request.result.createObjectStore(stage).add(record,'state');request.result.createObjectStore(original).add(originalFile,'original');request.result.createObjectStore(input).add(inputFile,'input');request.result.createObjectStore(cuts);}catch(e){reason=e;request.transaction!.abort();}};
  request.onblocked=()=>{blocked=true;reject(fail('restored_operation_blocked'));};request.onerror=()=>reject(reason??request.error??fail());request.onsuccess=()=>{try{check();if(!created||blocked)throw fail('restored_operation_exists');schema(request.result);resolve(request.result);}catch(e){request.result.close();reject(e);}};
 });
}
export async function existingRestoredOperationDatabase(name:string):Promise<IDBDatabase>{const db=await existingDatabase(name);if(!db)throw fail('restored_operation_missing');try{schema(db);return db;}catch(e){db.close();throw e;}}
/** Preliminary cold read admits only the one input row. Full schema/content admission
 * follows under the same actual journal lease before any source opens. */
export function readRestoredOperationInputFile(db:IDBDatabase):Promise<Blob>{
 schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(input,'readonly');let value:Blob,reason:unknown;const abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(reason??tx.error??fail());const store=tx.objectStore(input);if(store.keyPath!==null||store.autoIncrement||store.indexNames.length){abort(fail('restored_operation_schema'));return;}readBoundedStore(store,1,table=>{if(table.keys.length!==1||table.keys[0]!=='input'||!(table.values[0] instanceof Blob)){abort(fail('restored_operation_schema'));return;}value=table.values[0];},abort,()=>fail('restored_operation_schema'));});
}
export function readRestoredOperationDatabase(db:IDBDatabase,id:IndependentOperationJournalIdentity,targets:readonly string[]):Promise<RestoredOperationStored>{
 schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(names,'readonly');let value:RestoredOperationStored,reason:unknown;const abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(reason??tx.error??fail());inside(tx,id,targets,v=>{value=v;},abort);});
}
/** Atomic compare-and-swap includes the cursor, both cuts and immutable input handles.
 * Blob content digests are admitted by the owner outside this IDB transaction. */
export function writeRestoredOperationDatabase(db:IDBDatabase,id:IndependentOperationJournalIdentity,targets:readonly string[],before:RestoredOperationChecked,next:RestoredOperationStage,candidate:Readonly<{id:string;cut:IndependentHistoryCut}>|undefined,check:()=>void):Promise<void>{
 schema(db);checkRestoredOperationTransition(before.record,next,id,targets);check();
 return new Promise((resolve,reject)=>{const tx=db.transaction(names,'readwrite',{durability:'strict'});let reason:unknown;const abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(reason??tx.error??fail());inside(tx,id,targets,actual=>{
  check();if(JSON.stringify(actual.record)!==JSON.stringify(before.record)||actual.original.size!==before.original.size||actual.original.type!==before.original.type||actual.input.size!==before.input.size||actual.input.type!==before.input.type||actual.rows.size!==before.rows.size)throw fail('restored_operation_changed');
  for(const[k,v]of before.rows)if(!sameOperationCut(actual.rows.get(k),v))throw fail('restored_operation_changed');
  const refs=new Set([next.intent.current,next.intent.pending].filter((v):v is string=>v!==null)),available=new Map(before.rows);
  if(candidate){const old=available.get(candidate.id);if(old&&!sameOperationCut(old,candidate.cut))throw fail();available.set(candidate.id,candidate.cut);}if([...refs].some(k=>!available.has(k)))throw fail();
  const store=tx.objectStore(cuts);for(const k of before.rows.keys())if(!refs.has(k))store.delete(k);for(const k of refs)if(!before.rows.has(k))store.add(copyOperationCut(available.get(k)!),k);check();tx.objectStore(stage).put(next,'state');
 },abort);});
}
