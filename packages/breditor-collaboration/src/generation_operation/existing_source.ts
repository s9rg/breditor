/** Noncreating exact dedicated schema read. Missing heads/files are never backfilled by open. */
import {existingDatabase} from "../participant_recovery/journal.js";
import {fenceOpeningDatabase} from "../persistence/opening_database.js";
import type {SegmentedHead} from "../persistence/segmented_contract.js";
import {generationOperationFailure as fail} from "./policy.js";
export async function existingGenerationOperationSource(name:string,key:readonly[string,string],readHead:(json:string)=>SegmentedHead){
 const db=await existingDatabase(name);if(!db)throw fail("generation_operation_missing");const opening=fenceOpeningDatabase(db,"session_open_versionchange");try{
  if(db.version!==1||db.objectStoreNames.length!==2||!["generation_files","generation_heads"].every(n=>db.objectStoreNames.contains(n)))throw fail("generation_operation_diverged");
  const head=await new Promise<string>((resolve,reject)=>{const tx=db.transaction(["generation_heads","generation_files"],"readonly"),heads=tx.objectStore("generation_heads"),files=tx.objectStore("generation_files");let h:string|undefined,hc:number|undefined,fc:number|undefined,reason:unknown;const abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};tx.onabort=()=>reject(reason??fail());tx.oncomplete=()=>resolve(h!);
   for(const s of [heads,files])if(s.keyPath!==null||s.autoIncrement||s.indexNames.length){abort(fail("generation_operation_diverged"));return;}
   const check=()=>{if(h===undefined||hc===undefined||fc===undefined)return;try{const selected=readHead(h);if(hc!==1||fc!==selected.sealed.length+1||selected.identity.room!==key[0]||selected.identity.writer!==key[1])throw fail("generation_operation_diverged");}catch(e){abort(e);}};
   heads.get([...key]).onsuccess=e=>{const value=(e.target as IDBRequest).result;if(typeof value!=="string"){abort(fail("generation_operation_missing"));return;}h=value;check();};heads.count().onsuccess=e=>{hc=(e.target as IDBRequest<number>).result;check();};files.count().onsuccess=e=>{fc=(e.target as IDBRequest<number>).result;check();};
  });opening.assertCurrent();return {db,opening,head};
 }catch(e){db.close();throw e;}
}
