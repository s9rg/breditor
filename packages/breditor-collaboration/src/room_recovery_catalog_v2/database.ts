/** Independent V2 stores. Original catalog databases are neither upgraded nor reinterpreted. */
import {failure,known,signalCheck,MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES} from "../room_recovery_catalog/policy.js";
import {parseCatalogV2Manifest} from "./manifest.js";
import {initialCatalogV2Record,checkCatalogV2Record,type CatalogV2Record} from "./record.js";
import type {CatalogV2ArchiveState} from "./archive.js";
const stateStore="room_v2_state",fileStore="room_v2_files";
function schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(",")!=="room_v2_files,room_v2_state")throw failure("catalog_diverged");}
function shape(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw failure("catalog_diverged");}
export function createCatalogV2Database(name:string,state:CatalogV2ArchiveState,guard:()=>void):Promise<IDBDatabase>{
 guard();return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);let created=false,blocked=false,reason:unknown;
  r.onupgradeneeded=event=>{try{guard();if(event.oldVersion!==0)throw failure("catalog_exists");created=true;const db=r.result;db.createObjectStore(stateStore).add(initialCatalogV2Record(state.manifest),"state");const files=db.createObjectStore(fileStore);for(const[key,file]of state.files)files.add(file,key);}catch(error){reason=known(error);r.transaction!.abort();}};
  r.onerror=()=>reject(reason??failure(r.error?.name==="VersionError"?"catalog_exists":"catalog_storage"));r.onblocked=()=>{blocked=true;reject(failure("catalog_exists"));};r.onsuccess=()=>{if(blocked||!created){r.result.close();reject(failure("catalog_exists"));}else resolve(r.result);};
 });
}
export function existingCatalogV2Database(name:string):Promise<IDBDatabase|undefined>{return new Promise((resolve,reject)=>{const r=indexedDB.open(name);let missing=false,blocked=false;r.onupgradeneeded=()=>{missing=true;r.transaction!.abort();};r.onerror=()=>missing?resolve(undefined):reject(failure());r.onblocked=()=>{blocked=true;reject(failure("catalog_in_use"));};r.onsuccess=()=>{if(blocked)r.result.close();else resolve(r.result);};});}
export function readCatalogV2Database(db:IDBDatabase,manifest?:string):Promise<{record:CatalogV2Record;files:Map<string,Blob>}>{
 schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction([stateStore,fileStore],"readonly"),state=tx.objectStore(stateStore),files=tx.objectStore(fileStore);let record:CatalogV2Record,keys:IDBValidKey[],values:Blob[],reason:unknown;
  const abort=(error:unknown)=>{reason=known(error,"catalog_diverged");try{tx.abort();}catch{}};
  tx.onabort=()=>reject(reason??failure());tx.oncomplete=()=>{try{if(keys.length!==values.length||keys.some(k=>typeof k!=="string")||values.some(v=>!(v instanceof Blob)))throw failure("catalog_diverged");resolve({record,files:new Map(keys.map((key,at)=>[key as string,values[at]!]))});}catch(error){reject(known(error,"catalog_diverged"));}};
  try{shape(state);shape(files);}catch(error){abort(error);return;}state.count().onsuccess=e=>{if((e.target as IDBRequest<number>).result!==1)abort(failure("catalog_diverged"));};
  state.get("state").onsuccess=e=>{try{record=checkCatalogV2Record((e.target as IDBRequest).result,manifest);const count=files.count();count.onsuccess=()=>{if(count.result!==parseCatalogV2Manifest(record.manifest).participants.length+2||count.result>MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES){abort(failure("catalog_diverged"));return;}files.getAllKeys().onsuccess=e=>{keys=(e.target as IDBRequest<IDBValidKey[]>).result;};files.getAll().onsuccess=e=>{values=(e.target as IDBRequest<Blob[]>).result;};};}catch(error){abort(error);}};
 });
}
export function updateCatalogV2Record(db:IDBDatabase,before:CatalogV2Record,next:CatalogV2Record,guard:()=>void,signal?:AbortSignal):Promise<void>{
 signalCheck(signal);guard();signalCheck(signal);checkCatalogV2Record(next,before.manifest);schema(db);return new Promise((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction(stateStore,"readwrite",{durability:"strict"});}catch{reject(failure());return;}let reason:unknown;
  const abort=(error:unknown)=>{reason=known(error);try{tx.abort();}catch{}},cancel=()=>abort(failure("catalog_aborted"));signal?.addEventListener("abort",cancel,{once:true});tx.onabort=()=>{signal?.removeEventListener("abort",cancel);reject(reason??failure());};tx.oncomplete=()=>{signal?.removeEventListener("abort",cancel);resolve();};
  const store=tx.objectStore(stateStore);try{shape(store);}catch(error){abort(error);return;}store.count().onsuccess=e=>{if((e.target as IDBRequest<number>).result!==1)abort(failure("catalog_diverged"));};store.get("state").onsuccess=e=>{try{signalCheck(signal);guard();signalCheck(signal);if(JSON.stringify(checkCatalogV2Record((e.target as IDBRequest).result,before.manifest))!==JSON.stringify(before))throw failure("catalog_diverged");store.put(next,"state");}catch(error){abort(error);}};
 });
}
