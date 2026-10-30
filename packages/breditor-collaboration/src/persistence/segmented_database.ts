import {settleOwnedTransaction} from "./settle_owned_transaction.js";
/** Separate schema. Immutable root/sealed files and the latest complete native pair commit together. */
import {SharedEditorError} from "../core.js";
import {readSegmentedHead} from "./segmented_head.js";
import {splitSegmentedCheckpoint} from "./segmented_checkpoint.js";
import type {SegmentedCut,SegmentedStoredCut,SegmentedFile} from "./segmented_contract.js";
const fail=(message:string)=>new SharedEditorError("segmented_storage",message);
function schema(db:IDBDatabase):void{
 if(db.version!==1||[...db.objectStoreNames].sort().join(",")!=="generation_files,generation_heads")throw fail("Unknown generation schema; nothing was migrated or removed");
 const tx=db.transaction(["generation_files","generation_heads"],"readonly");for(const name of ["generation_files","generation_heads"]){const s=tx.objectStore(name);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail("Changed generation store schema");}
}
export function openSegmentedDatabase(name:string):Promise<IDBDatabase>{
 if(typeof name!=="string"||!name||name.length>200)return Promise.reject(fail("Use a dedicated generation database name"));
 return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);let failed=false;
  r.onupgradeneeded=()=>{r.result.createObjectStore("generation_files");r.result.createObjectStore("generation_heads");};
  r.onerror=()=>reject(r.error??fail("Cannot open generation storage"));r.onblocked=()=>{failed=true;reject(fail("Generation storage open is blocked"));};
  r.onsuccess=()=>{if(failed){r.result.close();return;}try{schema(r.result);resolve(r.result);}catch(error){r.result.close();reject(error);}};
 });
}
/** Read exact referenced files in the same transaction as their head; no missing-file repair. */
export async function readSegmentedCut(db:IDBDatabase,key:readonly[string,string],readHead:typeof readSegmentedHead=readSegmentedHead):Promise<SegmentedStoredCut|null>{
 const stored=await new Promise<{head:string;files:SegmentedFile[]}|null>((resolve,reject)=>{
  const tx=db.transaction(["generation_files","generation_heads"],"readonly"),r=tx.objectStore("generation_heads").get([...key]);let result:{head:string;files:SegmentedFile[]}|null=null,failure:unknown;
  const abort=(error:unknown)=>{failure=error;tx.abort();};
  r.onsuccess=()=>{try{if(r.result===undefined)return;if(typeof r.result!=="string")throw fail("Unknown generation head");const h=readHead(r.result);if(h.identity.room!==key[0]||h.identity.writer!==key[1])throw fail("Generation head belongs to a different writer");const files:SegmentedFile[]=[];result={head:r.result,files};for(const ref of [h.root,...h.sealed]){const q=tx.objectStore("generation_files").get([...key,ref.generation]);q.onsuccess=()=>{try{if(typeof q.result!=="string")throw fail("Referenced generation file is absent");const f=JSON.parse(q.result) as SegmentedFile;if(JSON.stringify(f)!==q.result||Object.keys(f).sort().join(",")!=="generation,json,kind,sha256"||f.generation!==ref.generation||f.sha256!==ref.sha256||typeof f.json!=="string")throw fail("Referenced generation file differs");files.push(f);}catch(error){abort(error);}};}}catch(error){abort(error);}};
  settleOwnedTransaction(tx,()=>result,()=>failure??tx.error??fail("Generation read aborted"),resolve,reject);
 });
 if(!stored)return null;const h=readHead(stored.head),byId=new Map(stored.files.map(f=>[f.generation,f]));
 const root=byId.get(h.root.generation)!;if(root.kind!=="root")throw fail("Original generation file role differs");
 const sealed=h.sealed.map(r=>{const f=byId.get(r.generation)!;if(f.kind!=="sealed")throw fail("Sealed generation file role differs");return f.json;});
 const checkpoint=JSON.stringify({format:"breditor/shared-segmented-history-session",formatVersion:1,family:h.family,rootGeneration:root.generation,rootCheckpoint:root.json,sealed,active:h.active});
 const checked=await splitSegmentedCheckpoint(checkpoint,h.identity);if(JSON.stringify(checked.files)!==JSON.stringify([root,...h.sealed.map(r=>byId.get(r.generation)!)]))throw fail("Native generation files or hashes differ");
 return {...stored,checkpoint,record:h};
}
/** Exact CAS and idempotent acknowledgement retry. Never replace an immutable file or a foreign cut. */
export function writeSegmentedCut(db:IDBDatabase,key:readonly[string,string],expected:string|null,cut:SegmentedCut,readHead:typeof readSegmentedHead=readSegmentedHead):Promise<void>{
 try{const h=readHead(cut.head),refs=[h.root,...h.sealed];if(h.identity.room!==key[0]||h.identity.writer!==key[1]||cut.files.length!==refs.length||cut.files.some((f,index)=>f.generation!==refs[index]!.generation||f.sha256!==refs[index]!.sha256||f.kind!==(index===0?"root":"sealed")||typeof f.json!=="string"))throw fail("Wrong generation writer or files");}catch(error){return Promise.reject(error);}
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(["generation_files","generation_heads"],"readwrite"),heads=tx.objectStore("generation_heads"),files=tx.objectStore("generation_files"),r=heads.get([...key]);let failure:unknown;
  const abort=(error:unknown)=>{failure=error;tx.abort();};
  r.onsuccess=()=>{try{const actual=r.result===undefined?null:r.result,already=actual===cut.head;if(!already&&actual!==expected)throw fail("Generation head changed since the last acknowledged cut");let left=cut.files.length;for(const file of cut.files){const fileKey=[...key,file.generation],json=JSON.stringify(file),q=files.get(fileKey);q.onsuccess=()=>{try{if(q.result!==undefined&&q.result!==json)throw fail("Immutable generation identity already contains different bytes");if(q.result===undefined){if(already)throw fail("An acknowledged cut lost its immutable file; refusing repair");files.add(json,fileKey);}if(--left===0&&!already){if(expected===null)heads.add(cut.head,[...key]);else heads.put(cut.head,[...key]);}}catch(error){abort(error);}};}}catch(error){abort(error);}};
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure??tx.error??fail("Generation write aborted"));
 });
}
