/** Read the whole dedicated operational source without creating or upgrading a database.
 * Every head/file key and exact stored byte is checked in one read transaction.
 * This is data admission only, not a factory, source owner or author grant. */
import {existingDatabase} from '../participant_recovery/journal.js';
import type {IndependentHistoryHead,IndependentHistoryFile,IndependentHistoryStoredCut} from '../independent_history/contract.js';
import {readOperationCut} from './cut_codec.js';
import {operationJournalFailure as fail} from './journal_failure.js';
export async function readOperationSourceDatabase(name:string,key:readonly[string,string],readHead:(head:string)=>IndependentHistoryHead,check:()=>void):Promise<IndependentHistoryStoredCut|null>{
 check();const db=await existingDatabase(name);if(!db){check();return null;}let changed=false;db.onversionchange=()=>{changed=true;db.close();};
 const current=()=>{check();if(changed)throw fail('independent_operation_storage_changed');};
 try{
  current();
  if(db.version!==1||[...db.objectStoreNames].sort().join(',')!=='operation_history_files,operation_history_heads')throw fail('independent_operation_source_diverged');
  const stored=await new Promise<{head:string;files:IndependentHistoryFile[]}|null>((resolve,reject)=>{
   const tx=db.transaction(['operation_history_files','operation_history_heads'],'readonly'),rows=new Map<string,{keys:IDBValidKey[];values:unknown[]}>();let left=4,value:{head:string;files:IndependentHistoryFile[]}|null=null,reason:unknown;
   const abort=(error:unknown)=>{reason=error;try{tx.abort();}catch{/* Preserve the terminal read outcome. */}};
   const ready=()=>{if(--left)return;try{current();const heads=rows.get('operation_history_heads')!,files=rows.get('operation_history_files')!;
    if(heads.keys.length===0){if(files.keys.length!==0)throw fail('independent_operation_source_diverged');return;}
    if(heads.keys.length!==1||JSON.stringify(heads.keys[0])!==JSON.stringify(key)||typeof heads.values[0]!=='string'||files.keys.length>126)throw fail('independent_operation_source_diverged');
    const head=readHead(heads.values[0]),expected=(['document','review'] as const).flatMap(lane=>{const s=head[lane];return s.kind==='original'?[]:[s.root,...s.sealed].map(r=>JSON.stringify([...key,lane,r.generation]));}),map=new Map<string,IndependentHistoryFile>();
    if(expected.length!==files.keys.length)throw fail('independent_operation_source_diverged');for(const[i,k]of files.keys.entries()){const raw=files.values[i];if(typeof raw!=='string'||new TextEncoder().encode(raw).length>32*1024*1024+8192)throw fail();const file=JSON.parse(raw) as IndependentHistoryFile;if(JSON.stringify(file)!==raw||JSON.stringify(k)!==JSON.stringify([...key,file.lane,file.generation]))throw fail();map.set(JSON.stringify(k),file);}
    if(map.size!==expected.length||expected.some(k=>!map.has(k)))throw fail('independent_operation_source_diverged');value={head:heads.values[0],files:expected.map(k=>map.get(k)!)};
   }catch(error){abort(error);}};
   tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(reason??tx.error??fail());
   try{for(const name of ['operation_history_files','operation_history_heads']){const s=tx.objectStore(name);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail();const row={keys:[] as IDBValidKey[],values:[] as unknown[]};rows.set(name,row);s.getAllKeys().onsuccess=e=>{row.keys=(e.target as IDBRequest<IDBValidKey[]>).result;ready();};s.getAll().onsuccess=e=>{row.values=(e.target as IDBRequest<unknown[]>).result;ready();};}}catch(error){abort(error);}
  });current();if(stored===null)return null;const cut=await readOperationCut(stored,readHead);current();return cut;
 }finally{db.close();}
}
