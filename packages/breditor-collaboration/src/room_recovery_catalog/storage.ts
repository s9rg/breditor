import {failure,known,signalCheck,object,id,MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES} from "./policy.js";
import {parseManifest} from "./manifest.js";
import type {CatalogArchiveState} from "./archive.js";
import type {SharedRoomRecoveryCatalogProgress} from "./types.js";
export interface CatalogRecord extends SharedRoomRecoveryCatalogProgress {readonly format:"breditor/shared-room-recovery-state";readonly formatVersion:1;readonly manifest:string;readonly plan:string|null}
// 1024 original <=64-KiB plans, including worst-case JSON-string escaping and ID overhead.
export const MAX_CATALOG_PLAN_BYTES=129*1024*1024;
export function initialRecord(manifest:string):CatalogRecord{return{format:"breditor/shared-room-recovery-state",formatVersion:1,manifest,plan:null,phase:"retained",participants:[]};}
export function checkRecord(value:unknown,manifest?:string):CatalogRecord{
 try{
  const r=object(value,"format,formatVersion,manifest,participants,phase,plan") as unknown as CatalogRecord,m=parseManifest(r.manifest);
  if(r.format!=="breditor/shared-room-recovery-state"||r.formatVersion!==1||manifest!==undefined&&r.manifest!==manifest||!Array.isArray(r.participants)||r.participants.length>1024||!["retained","staging","checked"].includes(r.phase))throw failure("catalog_diverged");
  if(r.plan===null){if(r.phase!=="retained"||r.participants.length)throw failure("catalog_diverged");}
  else{
   if(typeof r.plan!=="string"||r.plan.length>MAX_CATALOG_PLAN_BYTES||new TextEncoder().encode(r.plan).length>MAX_CATALOG_PLAN_BYTES||r.phase==="retained")throw failure("catalog_diverged");
   const p=object(JSON.parse(r.plan),"participants");if(!Array.isArray(p["participants"])||p["participants"].length!==r.participants.length)throw failure("catalog_diverged");
   let tail=false,previous="";for(let i=0;i<r.participants.length;i++){
    const row=object(r.participants[i],"id,state"),chosen=object(p["participants"][i],"id,plan"),entry=id(row["id"]),state=row["state"];
    if(entry<=previous||!m.participants.some(v=>v.id===entry)||chosen["id"]!==entry||typeof chosen["plan"]!=="string"||new TextEncoder().encode(chosen["plan"]).length>64*1024||typeof state!=="string"||!["reserved","started","complete"].includes(state)||tail&&state!=="reserved")throw failure("catalog_diverged");
    previous=entry;if(state!=="complete")tail=true;
   }
   if(r.phase==="checked"&&r.participants.some(row=>row.state!=="complete"))throw failure("catalog_diverged");
  }
  return structuredClone(r);
 }catch{throw failure("catalog_diverged");}
}
function schema(db:IDBDatabase):void{
 if(db.version!==1||JSON.stringify([...db.objectStoreNames])!==JSON.stringify(["catalog","files"]))throw failure("catalog_diverged");
}
function storeShape(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw failure("catalog_diverged");}
/** All selected files and the first marker commit in the same version-change transaction. */
export function createCatalogDatabase(name:string,state:CatalogArchiveState,guard:()=>void):Promise<IDBDatabase>{
 guard();return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);let created=false,failed=false,reason:unknown;
  r.onupgradeneeded=event=>{try{guard();if(event.oldVersion!==0)throw failure("catalog_exists");created=true;const db=r.result;db.createObjectStore("catalog").add(initialRecord(state.manifest),"state");const files=db.createObjectStore("files");for(const [key,file]of state.files)files.add(file,key);}catch(error){reason=known(error);r.transaction!.abort();}};
  r.onerror=()=>reject(reason??failure(r.error?.name==="VersionError"?"catalog_exists":"catalog_storage"));r.onblocked=()=>{failed=true;reject(failure("catalog_exists"));};
  r.onsuccess=()=>{if(failed||!created){r.result.close();reject(failure("catalog_exists"));}else resolve(r.result);};
 });
}
/** A missing inspection aborts creation; it never leaves a placeholder catalog behind. */
export function existingCatalogDatabase(name:string):Promise<IDBDatabase|undefined>{return new Promise((resolve,reject)=>{const r=indexedDB.open(name);let missing=false,blocked=false;r.onupgradeneeded=()=>{missing=true;r.transaction!.abort();};r.onerror=()=>missing?resolve(undefined):reject(failure());r.onblocked=()=>{blocked=true;reject(failure("catalog_in_use"));};r.onsuccess=()=>{if(blocked)r.result.close();else resolve(r.result);};});}
/** One atomic read observes the complete closed catalog and file set before async byte admission. */
export function readCatalogDatabase(db:IDBDatabase,manifest?:string):Promise<{record:CatalogRecord;files:Map<string,Blob>}>{
 schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(["catalog","files"],"readonly"),catalog=tx.objectStore("catalog"),files=tx.objectStore("files");let reason:unknown,record:CatalogRecord,values:Blob[],keys:IDBValidKey[];
  const fail=(error:unknown)=>{reason=known(error,"catalog_diverged");try{tx.abort();}catch{}};
  // Invalid store shape can abort before requests exist. Settle that path too.
  tx.onabort=()=>reject(reason??failure());tx.oncomplete=()=>{try{if(keys.length!==values.length||keys.some(k=>typeof k!=="string")||values.some(v=>!(v instanceof Blob)))throw failure("catalog_diverged");resolve({record,files:new Map(keys.map((key,index)=>[key as string,values[index]!]))});}catch(error){reject(known(error,"catalog_diverged"));}};
  try{storeShape(catalog);storeShape(files);}catch(error){fail(error);return;}
  const count=catalog.count();count.onsuccess=()=>{if(count.result!==1)fail(failure("catalog_diverged"));};
  const get=catalog.get("state");get.onsuccess=()=>{try{record=checkRecord(get.result,manifest);const n=parseManifest(record.manifest).participants.length+2,c=files.count();c.onsuccess=()=>{if(c.result!==n||c.result>MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES){fail(failure("catalog_diverged"));return;}const ks=files.getAllKeys(),vs=files.getAll();ks.onsuccess=()=>{keys=ks.result;};vs.onsuccess=()=>{values=vs.result;};};}catch(error){fail(error);}};
 });
}
/** Strict compare-and-update. A lost acknowledgement is resolved from actual retained state. */
export function updateCatalogRecord(db:IDBDatabase,before:CatalogRecord,next:CatalogRecord,guard:()=>void,signal?:AbortSignal):Promise<void>{
 signalCheck(signal);guard();signalCheck(signal);checkRecord(next,before.manifest);schema(db);return new Promise((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction("catalog","readwrite",{durability:"strict"});}catch{reject(failure());return;}let reason:unknown;
  const fail=(error:unknown)=>{reason=known(error);try{tx.abort();}catch{}};const cancel=()=>fail(failure("catalog_aborted"));signal?.addEventListener("abort",cancel,{once:true});
  tx.onabort=()=>{signal?.removeEventListener("abort",cancel);reject(reason??failure());};tx.oncomplete=()=>{signal?.removeEventListener("abort",cancel);resolve();};
  const store=tx.objectStore("catalog");try{storeShape(store);}catch(error){fail(error);return;}const count=store.count();count.onsuccess=()=>{if(count.result!==1)fail(failure("catalog_diverged"));};const r=store.get("state");r.onsuccess=()=>{try{signalCheck(signal);guard();signalCheck(signal);if(JSON.stringify(checkRecord(r.result,before.manifest))!==JSON.stringify(before))throw failure("catalog_diverged");store.put(next,"state");}catch(error){fail(error);}};
 });
}
