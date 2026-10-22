/** Read the whole dedicated operational source without creating or upgrading a database.
 * Every head/file key and exact stored byte is checked in one read transaction.
 * This is data admission only, not a factory, source owner or author grant. */
import {existingDatabase} from '../participant_recovery/journal.js';
import type {IndependentHistoryHead,IndependentHistoryFile,IndependentHistoryStoredCut} from '../independent_history/contract.js';
import {readOperationCut} from './cut_codec.js';
import {operationJournalFailure as fail} from './journal_failure.js';
import {readBoundedStore} from '../persistence/read_bounded_store.js';
export async function readOperationSourceDatabase(name:string,key:readonly[string,string],readHead:(head:string)=>IndependentHistoryHead,check:()=>void):Promise<IndependentHistoryStoredCut|null>{
 return readDedicatedOperationSourceDatabase(name,key,readHead,check,'operation-v1');
}
/** Private explicit family selection; no stored field auto-detects or migrates a schema. */
export async function readDedicatedOperationSourceDatabase(name:string,key:readonly[string,string],readHead:(head:string)=>IndependentHistoryHead,check:()=>void,family:'operation-v1'|'restored-operation-v1'):Promise<IndependentHistoryStoredCut|null>{
 const filesName=family==='operation-v1'?'operation_history_files':'restored_operation_history_files',headsName=family==='operation-v1'?'operation_history_heads':'restored_operation_history_heads';
 check();const db=await existingDatabase(name);if(!db){check();return null;}let changed=false;db.onversionchange=()=>{changed=true;db.close();};
 const current=()=>{check();if(changed)throw fail('independent_operation_storage_changed');};
 try{
  current();
  if(db.version!==1||[...db.objectStoreNames].sort().join(',')!==[filesName,headsName].sort().join(','))throw fail('independent_operation_source_diverged');
  const stored=await new Promise<{head:string;files:IndependentHistoryFile[]}|null>((resolve,reject)=>{
   const tx=db.transaction([filesName,headsName],'readonly'),rows=new Map<string,{keys:IDBValidKey[];values:unknown[]}>();let left=2,value:{head:string;files:IndependentHistoryFile[]}|null=null,reason:unknown;
   const abort=(error:unknown)=>{reason=error;try{tx.abort();}catch{/* Preserve the terminal read outcome. */}};
   const ready=()=>{if(--left)return;try{current();const heads=rows.get(headsName)!,files=rows.get(filesName)!;
    if(heads.keys.length===0){if(files.keys.length!==0)throw fail('independent_operation_source_diverged');return;}
    if(heads.keys.length!==1||JSON.stringify(heads.keys[0])!==JSON.stringify(key)||typeof heads.values[0]!=='string'||files.keys.length>126)throw fail('independent_operation_source_diverged');
    const head=readHead(heads.values[0]),expected=(['document','review'] as const).flatMap(lane=>{const s=head[lane];return s.kind==='original'?[]:[s.root,...s.sealed].map(r=>JSON.stringify([...key,lane,r.generation]));}),map=new Map<string,IndependentHistoryFile>();
    if(expected.length!==files.keys.length)throw fail('independent_operation_source_diverged');for(const[i,k]of files.keys.entries()){const raw=files.values[i];if(typeof raw!=='string'||new TextEncoder().encode(raw).length>32*1024*1024+8192)throw fail();const file=JSON.parse(raw) as IndependentHistoryFile;if(JSON.stringify(file)!==raw||JSON.stringify(k)!==JSON.stringify([...key,file.lane,file.generation]))throw fail();map.set(JSON.stringify(k),file);}
    if(map.size!==expected.length||expected.some(k=>!map.has(k)))throw fail('independent_operation_source_diverged');value={head:heads.values[0],files:expected.map(k=>map.get(k)!)};
   }catch(error){abort(error);}};
   tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(reason??tx.error??fail());
   try{for(const name of [filesName,headsName]){const s=tx.objectStore(name);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail();readBoundedStore(s,name===headsName?1:126,row=>{rows.set(name,row);ready();},abort,()=>fail('independent_operation_source_diverged'));}}catch(error){abort(error);}
  });current();if(stored===null)return null;const cut=await readOperationCut(stored,readHead);current();return cut;
 }finally{db.close();}
}
