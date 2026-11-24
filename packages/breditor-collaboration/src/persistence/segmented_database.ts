import {inspectHistoryRows} from '../independent_history/exact_destination.js';
import {onIndependentBootstrapAbort} from '../independent_history/bootstrap_policy.js';
import type {GenerationRecoveryBootstrap} from './generation_recovery_bootstrap.js';
import {settleOwnedTransaction} from "./settle_owned_transaction.js";
/** Separate schema. Immutable root/sealed files and the latest complete native pair commit together. */
import {SharedEditorError} from "../core.js";
import {readSegmentedHead} from "./segmented_head.js";
import {splitSegmentedCheckpoint} from "./segmented_checkpoint.js";
import type {SegmentedCut,SegmentedStoredCut,SegmentedFile,GenerationHead} from "./segmented_contract.js";
const fail=(message:string)=>new SharedEditorError("segmented_storage",message);
function schema(db:IDBDatabase):void{
 if(db.version!==1||[...db.objectStoreNames].sort().join(",")!=="generation_files,generation_heads")throw fail("Unknown generation schema; nothing was migrated or removed");
 const tx=db.transaction(["generation_files","generation_heads"],"readonly");for(const name of ["generation_files","generation_heads"]){const s=tx.objectStore(name);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail("Changed generation store schema");}
}
export const generationStoreNames=["generation_files","generation_heads"] as const;
export function openSegmentedDatabase(name:string,existingOnly?:()=>Error,check?:()=>void):Promise<IDBDatabase>{
 if(typeof name!=="string"||!name||name.length>200)return Promise.reject(fail("Use a dedicated generation database name"));
 return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);let failed=false,refused:unknown;
  r.onupgradeneeded=()=>{
   try{check?.();if(existingOnly)throw existingOnly();r.result.createObjectStore("generation_files");r.result.createObjectStore("generation_heads");}
   catch(error){refused=error;r.transaction!.abort();}
  };
  r.onerror=()=>reject(refused??r.error??fail("Cannot open generation storage"));r.onblocked=()=>{failed=true;reject(fail("Generation storage open is blocked"));};
  r.onsuccess=()=>{if(failed){r.result.close();return;}try{check?.();schema(r.result);resolve(r.result);}catch(error){r.result.close();reject(error);}};
 });
}
/** Read exact referenced files in the same transaction as their head; no missing-file repair. */
export function readSegmentedCut(db:IDBDatabase,key:readonly[string,string],readHead?:typeof readSegmentedHead):Promise<SegmentedStoredCut|null>{
 return readGenerationCut(db,key,readHead??readSegmentedHead);
}
type StoredGenerationFiles={head:string;files:SegmentedFile[]};
type CutReader={readHead:(input:string)=>GenerationHead;predecessor:boolean};
function readStoredCuts(
 db:IDBDatabase,key:readonly [string,string],readers:readonly CutReader[],
):Promise<readonly (StoredGenerationFiles|null)[]>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(["generation_files","generation_heads"],"readonly");
  const heads=tx.objectStore("generation_heads"),files=tx.objectStore("generation_files");
  const result=readers.map<StoredGenerationFiles|null>(()=>null);
  let failure:unknown;
  const abort=(error:unknown)=>{if(failure!==undefined)return;failure=error;tx.abort();};
  settleOwnedTransaction(tx,()=>result,()=>failure??tx.error??fail("Generation read aborted"),resolve,reject);
  for(const store of [heads,files]){
   if(store.keyPath!==null||store.autoIncrement||store.indexNames.length){abort(fail("Changed generation store schema"));return;}
  }
  for(const [index,{readHead,predecessor}] of readers.entries()){
   // A structured-cloned undefined occupies the exact key and must fail as malformed.
   const request=heads.getAll(predecessor?[...key,"continued-from"]:[...key],1);
   request.onsuccess=()=>{
    try{
     if(request.result.length===0)return;
     const head:unknown=request.result[0];
     if(typeof head!=="string")throw fail("Unknown generation head");
     const parsed=readHead(head);
     if(parsed.identity.room!==key[0]||parsed.identity.writer!==key[1])throw fail("Generation head belongs to a different writer");
     const record:StoredGenerationFiles={head,files:[]};
     result[index]=record;
     for(const ref of [parsed.root,...parsed.sealed]){
      const file=files.get([...key,ref.generation]);
      file.onsuccess=()=>{
       try{
        if(typeof file.result!=="string")throw fail("Referenced generation file is absent");
        const stored=JSON.parse(file.result) as SegmentedFile;
        if(JSON.stringify(stored)!==file.result||Object.keys(stored).sort().join(",")!=="generation,json,kind,sha256"||
           stored.generation!==ref.generation||stored.sha256!==ref.sha256||typeof stored.json!=="string"){
         throw fail("Referenced generation file differs");
        }
        record.files.push(stored);
       }catch(error){abort(error);}
      };
     }
    }catch(error){abort(error);}
   };
  }
 });
}
export async function readGenerationCut<H extends GenerationHead>(
 db:IDBDatabase,key:readonly [string,string],readHead:(input:string)=>H,predecessor=false,
):Promise<SegmentedStoredCut<H>|null>{
 const [stored]=await readStoredCuts(db,key,[{readHead,predecessor}]);
 return decodeGenerationCut(stored??null,readHead);
}
/** Capture the active and predecessor heads and every referenced file in one read transaction. */
export async function readGenerationPair<H extends GenerationHead>(
 db:IDBDatabase,key:readonly [string,string],readCurrent:(input:string)=>H,
){
 const [current,predecessor]=await readStoredCuts(db,key,[
  {readHead:readCurrent,predecessor:false},{readHead:readSegmentedHead,predecessor:true},
 ]);
 return {
  current:await decodeGenerationCut(current??null,readCurrent),
  predecessor:await decodeGenerationCut(predecessor??null,readSegmentedHead),
 };
}
async function decodeGenerationCut<H extends GenerationHead>(
 stored:StoredGenerationFiles|null,readHead:(input:string)=>H,
):Promise<SegmentedStoredCut<H>|null>{
 if(!stored)return null;const h=readHead(stored.head),byId=new Map(stored.files.map(f=>[f.generation,f]));
 const root=byId.get(h.root.generation)!;if(root.kind!=="root")throw fail("Original generation file role differs");
 const sealed=h.sealed.map(r=>{const f=byId.get(r.generation)!;if(f.kind!=="sealed")throw fail("Sealed generation file role differs");return f.json;});
 const checkpoint=JSON.stringify({format:"breditor/shared-segmented-history-session",formatVersion:h.formatVersion,family:h.family,rootGeneration:root.generation,rootCheckpoint:root.json,sealed,active:h.active,...(h.formatVersion===2?{continuedAfter:h.continuedAfter}:{})});
 const checked=await splitSegmentedCheckpoint(checkpoint,h.identity,h.formatVersion);if(JSON.stringify(checked.files)!==JSON.stringify([root,...h.sealed.map(r=>byId.get(r.generation)!)]))throw fail("Native generation files or hashes differ");
 return {...stored,checkpoint,record:h};
}
/** Exact CAS and idempotent acknowledgement retry. Never replace an immutable file or a foreign cut. */
export interface ContinuedWrite {
 readonly predecessor:string;
 readonly migrating?:readonly SegmentedFile[];
}
export function writeSegmentedCut(
 db:IDBDatabase,key:readonly[string,string],expected:string|null,cut:SegmentedCut,
 readHead:(input:string)=>GenerationHead=readSegmentedHead,continued?:ContinuedWrite,bootstrap?:GenerationRecoveryBootstrap,
):Promise<void>{
 try{
  const h=readHead(cut.head),refs=[h.root,...h.sealed];
  if(h.identity.room!==key[0]||h.identity.writer!==key[1]||cut.files.length!==refs.length||
     cut.files.some((f,index)=>f.generation!==refs[index]!.generation||f.sha256!==refs[index]!.sha256||f.kind!==(index===0?"root":"sealed")||typeof f.json!=="string"))
   throw fail("Wrong generation writer or files");
  bootstrap?.check();
  if(bootstrap&&(continued||bootstrap.rows.heads.length!==1||bootstrap.rows.heads[0]!.value!==cut.head||
    bootstrap.rows.files.length!==cut.files.length||cut.files.some((file,index)=>JSON.stringify(file)!==bootstrap.rows.files[index]!.value)||
    expected!==null&&expected!==cut.head))throw bootstrap.rows.fail();
 }catch(error){return Promise.reject(error);}
 return new Promise((resolve,reject)=>{
  const tx=continued||bootstrap?db.transaction([...generationStoreNames],"readwrite",{durability:"strict"}):
   db.transaction([...generationStoreNames],"readwrite");
  let failure:unknown,off=()=>{};
  const abort=(error:unknown)=>{failure??=error;try{tx.abort();}catch{}};
  settleOwnedTransaction(tx,()=>{off();},()=>{off();return failure??tx.error??fail("Generation write aborted");},resolve,reject);
  try{
   off=onIndependentBootstrapAbort(bootstrap?.signal,()=>abort(bootstrap!.rows.fail()));
   bootstrap?.check();
   const [filesName,headsName]=generationStoreNames;
   const heads=tx.objectStore(headsName),files=tx.objectStore(filesName);
   const write=()=>{
    const read=heads.getAll([...key],1);
    if(continued){
     const prior=heads.getAll([...key,"continued-from"],1);
     prior.onsuccess=()=>{try{
      if(prior.result.length===0&&continued.migrating)heads.add(continued.predecessor,[...key,"continued-from"]);
      else if(prior.result[0]!==continued.predecessor)throw fail("Continued history predecessor differs");
     }catch(error){abort(error);}};
    }
    const originalFiles=continued?.migrating?new Set(continued.migrating.map(file=>file.generation)):undefined;
    read.onsuccess=()=>{
     try{
      bootstrap?.check();
      const actual:unknown=read.result.length===0?null:read.result[0];
      if(read.result.length&&typeof actual!=="string")throw fail("Unknown generation head");
      const already=actual===cut.head;
      if(!already&&actual!==expected)throw fail("Generation head changed since the last acknowledged cut");
      let left=cut.files.length;
      for(const file of cut.files){
       const fileKey=[...key,file.generation],json=JSON.stringify(file),request=files.get(fileKey);
       request.onsuccess=()=>{
        try{
         bootstrap?.check();
         if(request.result!==undefined&&request.result!==json)throw fail("Immutable generation identity already contains different bytes");
         if(request.result===undefined){
          if(already||originalFiles?.has(file.generation))throw fail("An acknowledged cut lost its immutable file; refusing repair");
          files.add(json,fileKey);
         }
         if(--left===0&&!already){
          if(expected===null)heads.add(cut.head,[...key]);
          else heads.put(cut.head,[...key]);
         }
         bootstrap?.check();
        }catch(error){abort(error);}
       };
      }
     }catch(error){abort(error);}
    };
   };
   if(bootstrap)inspectHistoryRows(tx,generationStoreNames,bootstrap.rows,status=>{
    bootstrap.check();
    if(expected===null){if(status!=='empty')throw bootstrap.rows.fail();write();}
    else if(status!=='exact')throw bootstrap.rows.fail();
   },abort);
   else write();
  }catch(error){abort(error);}
 });
}
