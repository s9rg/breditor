import {settleOwnedTransaction} from "../persistence/settle_owned_transaction.js";
/** Separate IndexedDB family. Both lane files and their exact paired head commit in one transaction. */
import {SharedEditorError} from '../core.js';
import {readIndependentHistoryHead,joinIndependentHistoryLane,makeIndependentHistoryCut} from './cut.js';
import type {IndependentHistoryCut,IndependentHistoryStoredCut,IndependentHistoryFile,IndependentHistoryHead,IndependentHistoryReference} from './contract.js';
import type {IndependentHistoryCompanion} from './driver.js';
import type {IndependentLocalOperationDriver} from './local_driver.js';
import {inspectPairedDestination,type ExactHistoryDestination} from './exact_destination.js';
import {onIndependentBootstrapAbort} from './bootstrap_policy.js';
const fail=(message:string)=>new SharedEditorError('independent_history_storage',message);
type FileLane={kind:'original'}|{kind:'segmented-v1'|'continued-v2';root:IndependentHistoryReference;sealed:readonly IndependentHistoryReference[]};
interface PairedHead {
 readonly identity:{native:{room:string;writer:string}};
 readonly document:FileLane;
 readonly review:FileLane;
 readonly versions:readonly string[];
}
export type PairedStoreNames=readonly [files:string,heads:string];
export interface PairedHistoryStore<Head extends PairedHead> {
 names:PairedStoreNames;
 readHead(input:string):Head;
 join(head:Head,lane:'document'|'review',files:readonly IndependentHistoryFile[]):string;
 makeCut(document:string,review:string,head:Head):Promise<IndependentHistoryCut>;
 wrapped:boolean;
}
const references=(head:PairedHead)=>(['document','review'] as const).flatMap(lane=>{const selected=head[lane];return selected.kind==='original'?[]:[selected.root,...selected.sealed].map((reference,index)=>({lane,...reference,kind:index===0?'root' as const:'sealed' as const}));});
type StorageProfile=IndependentHistoryCompanion|IndependentLocalOperationDriver;
export const independentHistoryStores=(profile?:StorageProfile)=>profile?.storage==='local-operation-v1'?['local_operation_history_files','local_operation_history_heads'] as const:profile?.storage==='restored-operation-v1'?['restored_operation_history_files','restored_operation_history_heads'] as const:profile?.storage==='operation-v1'?['operation_history_files','operation_history_heads'] as const:profile?['delivery_history_files','delivery_history_heads'] as const:['history_files','history_heads'] as const;
export function openIndependentHistoryDatabase(name:string,profile?:StorageProfile,checkCurrent?:()=>void):Promise<IDBDatabase>{
 return openPairedHistoryDatabase(name,independentHistoryStores(profile),checkCurrent);
}
export function openPairedHistoryDatabase(name:string,names:PairedStoreNames,checkCurrent?:()=>void):Promise<IDBDatabase>{
 if(typeof name!=='string'||!name||name.length>200)return Promise.reject(fail('Use a dedicated paired-history database'));
 checkCurrent?.();
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(name,1);let abandoned=false,failure:unknown;
  request.onupgradeneeded=()=>{try{checkCurrent?.();for(const name of names){checkCurrent?.();request.result.createObjectStore(name);}checkCurrent?.();}catch(error){failure=error;request.transaction!.abort();}};
  request.onerror=()=>reject(failure??request.error??fail('Cannot open paired histories'));
  request.onblocked=()=>{abandoned=true;reject(fail('Paired-history storage is blocked'));};
  request.onsuccess=()=>{
   const db=request.result;if(abandoned){db.close();return;}
   try{
    checkCurrent?.();if(db.version!==1||[...db.objectStoreNames].sort().join(',')!==[...names].sort().join(','))throw fail('Unknown paired-history schema; nothing was migrated');
    const tx=db.transaction([...names],'readonly');for(const name of names){const store=tx.objectStore(name);if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail('Changed paired-history store definition');}
    checkCurrent?.();resolve(db);
   }catch(error){db.close();reject(error);}
  };
 });
}
export function readIndependentHistoryCut(db:IDBDatabase,key:readonly[string,string],profile?:StorageProfile):Promise<IndependentHistoryStoredCut|null>{
 return readPairedHistoryCut(db,key,{
  names:independentHistoryStores(profile),readHead:profile?.readHead??readIndependentHistoryHead,join:joinIndependentHistoryLane,
  makeCut:(document,review,head)=>makeIndependentHistoryCut(document,review,head.identity,head.versions),
  wrapped:profile!==undefined,
 });
}
export async function readPairedHistoryCut<Head extends PairedHead>(
 db:IDBDatabase,key:readonly[string,string],store:PairedHistoryStore<Head>,
):Promise<(IndependentHistoryCut&{documentCheckpoint:string;reviewCheckpoint:string;record:Head})|null>{
 const {names:[filesName,headsName],readHead}=store;
 const stored=await new Promise<IndependentHistoryCut|null>((resolve,reject)=>{
  const tx=db.transaction([filesName,headsName],'readonly'),request=tx.objectStore(headsName).get([...key]);let result:{head:string;files:IndependentHistoryFile[]}|null=null,failure:unknown;
  const abort=(error:unknown)=>{failure=error;tx.abort();};
  request.onsuccess=()=>{try{if(request.result===undefined)return;const head=readHead(request.result);if(head.identity.native.room!==key[0]||head.identity.native.writer!==key[1])throw fail('Stored paired head belongs to another writer');const files:IndependentHistoryFile[]=[];result={head:request.result,files};for(const reference of references(head)){const file=tx.objectStore(filesName).get([...key,reference.lane,reference.generation]);file.onsuccess=()=>{try{if(typeof file.result!=='string')throw fail('Referenced native history file is absent');const decoded=JSON.parse(file.result) as IndependentHistoryFile;if(!decoded||Object.keys(decoded).sort().join(',')!=='generation,json,kind,lane,sha256'||JSON.stringify(decoded)!==file.result||decoded.lane!==reference.lane||decoded.generation!==reference.generation||decoded.sha256!==reference.sha256||decoded.kind!==reference.kind||typeof decoded.json!=='string')throw fail('Referenced native file identity differs');files.push(decoded);}catch(error){abort(error);}};}}catch(error){abort(error);}};
  settleOwnedTransaction(tx,()=>result,()=>failure??tx.error??fail('Paired-history read aborted'),resolve,reject);
 });
 if(!stored)return null;const record=readHead(stored.head),documentCheckpoint=store.join(record,'document',stored.files),reviewCheckpoint=store.join(record,'review',stored.files),checked=await store.makeCut(documentCheckpoint,reviewCheckpoint,record);
 if(checked.head!==(store.wrapped?JSON.stringify(record):stored.head))throw fail('Native paired envelope differs');const byKey=new Map(stored.files.map(file=>[JSON.stringify([file.lane,file.generation]),file]));if(checked.files.length!==stored.files.length||checked.files.some(file=>JSON.stringify(file)!==JSON.stringify(byKey.get(JSON.stringify([file.lane,file.generation])))))throw fail('Native history file hashes or exact bytes differ');
 return{...checked,head:stored.head,documentCheckpoint,reviewCheckpoint,record};
}
/** Lost acknowledgements retry exactly, before newer cuts. An acknowledged missing file is never repaired. */
export function writeIndependentHistoryCut(db:IDBDatabase,key:readonly[string,string],expected:string|null,cut:IndependentHistoryCut,profile?:StorageProfile,checkCurrent?:()=>void,signal?:AbortSignal,lifetimeSignal?:AbortSignal,destination?:ExactHistoryDestination):Promise<void>{
 return writePairedHistoryCut(db,key,expected,cut,independentHistoryStores(profile),profile?.readHead??readIndependentHistoryHead,checkCurrent,signal,lifetimeSignal,destination);
}
export function writePairedHistoryCut(
 db:IDBDatabase,key:readonly[string,string],expected:string|null,cut:IndependentHistoryCut,
 names:PairedStoreNames,readHead:(input:string)=>PairedHead,checkCurrent?:()=>void,signal?:AbortSignal,lifetimeSignal?:AbortSignal,
 destination?:ExactHistoryDestination,
):Promise<void>{
 try{checkCurrent?.();const head=readHead(cut.head),refs=references(head);if(head.identity.native.room!==key[0]||head.identity.native.writer!==key[1]||cut.files.length!==refs.length||cut.files.some((file,index)=>{const ref=refs[index]!;return file.lane!==ref.lane||file.generation!==ref.generation||file.sha256!==ref.sha256||file.kind!==ref.kind||typeof file.json!=='string';}))throw fail('Wrong paired head or native file set');checkCurrent?.();}catch(error){return Promise.reject(error);}
 return new Promise((resolve,reject)=>{
  let tx:IDBTransaction|undefined,failure:unknown,bootstrapSettled=()=>{},lifetimeSettled=()=>{};const settled=()=>{bootstrapSettled();lifetimeSettled();},aborted=()=>new SharedEditorError('independent_history_aborted','The guarded native save was cancelled before it committed'),abort=(error:unknown)=>{failure??=error;try{tx?.abort();}catch{/* A completed commit is retained for exact readback. */}};
  try{
   bootstrapSettled=onIndependentBootstrapAbort(signal,()=>abort(aborted()));if(lifetimeSignal!==signal)lifetimeSettled=onIndependentBootstrapAbort(lifetimeSignal,()=>abort(aborted()));checkCurrent?.();if(signal?.aborted||lifetimeSignal?.aborted||failure)throw failure??aborted();
   const [filesName,headsName]=names,active=db.transaction([filesName,headsName],'readwrite');tx=active;
   active.oncomplete=()=>{settled();resolve();};active.onabort=()=>{settled();reject(failure??active.error??fail('Paired-history commit aborted'));};
   checkCurrent?.();if(signal?.aborted||lifetimeSignal?.aborted||failure)throw failure??aborted();
   const write=()=>{
    const heads=active.objectStore(headsName),files=active.objectStore(filesName),request=heads.get([...key]);
    request.onsuccess=()=>{
     try{
      checkCurrent?.();
      const actual=request.result===undefined?null:request.result,already=actual===cut.head;
      if(!already&&actual!==expected)throw fail('Paired head changed since its last acknowledgement');
      let left=cut.files.length;
      const publish=()=>{
       checkCurrent?.();
       if(!already){
        if(expected===null)heads.add(cut.head,[...key]);
        else heads.put(cut.head,[...key]);
       }
       checkCurrent?.();
      };
      if(left===0){publish();return;}
      for(const file of cut.files){
       const fileKey=[...key,file.lane,file.generation],json=JSON.stringify(file),read=files.get(fileKey);
       read.onsuccess=()=>{
        try{
         checkCurrent?.();
         if(read.result!==undefined&&read.result!==json)throw fail('Immutable native file already has different bytes in this lane');
         if(read.result===undefined){
          if(already)throw fail('An acknowledged cut lost a native file; refusing silent repair');
          files.add(json,fileKey);
         }
         if(--left===0)publish();
        }catch(error){abort(error);}
       };
      }
     }catch(error){abort(error);}
    };
   };
   if(destination){
    if(cut.head!==destination.cut.head||JSON.stringify(cut.files)!==JSON.stringify(destination.cut.files)||
       expected!==null&&expected!==destination.cut.head)throw destination.fail();
    inspectPairedDestination(active,names,key,destination,status=>{
     checkCurrent?.();
     if(expected===null){
      if(status!=='empty')throw destination.fail();
      write();
     }else if(status!=='exact')throw destination.fail();
    },abort);
   }else write();
  }catch(error){if(tx)abort(error);else{settled();reject(error);}}
 });
}
