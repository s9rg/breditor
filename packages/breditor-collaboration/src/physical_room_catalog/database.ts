/** Absent-only atomic retention in distinct stores. Never upgrades, repairs, deletes or rewrites files. */
import {parsePhysicalCatalogManifest} from "./manifest.js";
import {checkPhysicalCatalogRecord,physicalCatalogRecord,type PhysicalCatalogRecord} from "./record.js";
import {physicalCatalogFailure,physicalCatalogKnown,physicalParticipantKey,MAX_PHYSICAL_ROOM_CATALOG_FILES} from "./policy.js";
import type {PhysicalCatalogArchiveState} from "./archive.js";
const stateStore="physical_room_state",fileStore="physical_room_files";
function schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(",")!=="physical_room_files,physical_room_state")throw physicalCatalogFailure("catalog_diverged");}
function shape(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw physicalCatalogFailure("catalog_diverged");}
/** The caller captures the actual storage factory before its first await. A blocked request cannot later write. */
export function createPhysicalCatalogDatabase(factory:IDBFactory,name:string,state:Pick<PhysicalCatalogArchiveState,"manifest"|"files">,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 guard();const record=physicalCatalogRecord(state.manifest),files=new Map(state.files);
 return new Promise((resolve,reject)=>{
  const request=factory.open(name,1);let created=false,blocked=false,reason:unknown;
  const abort=(error:unknown)=>{reason=physicalCatalogKnown(error,"catalog_storage");try{request.transaction?.abort();}catch{}};
  const cancel=()=>{try{guard();}catch(error){abort(error);}};signal?.addEventListener("abort",cancel,{once:true});
  const done=()=>signal?.removeEventListener("abort",cancel);
  request.onupgradeneeded=event=>{try{guard();if(blocked||event.oldVersion!==0)throw physicalCatalogFailure("catalog_exists");created=true;const db=request.result;db.createObjectStore(stateStore).add(record,"state");const store=db.createObjectStore(fileStore);for(const[key,file]of files){guard();store.add(file,key);}}catch(error){abort(error);}};
  request.onerror=()=>{done();reject(reason??physicalCatalogFailure(request.error?.name==="VersionError"?"catalog_exists":"catalog_storage"));};
  request.onblocked=()=>{blocked=true;done();reject(physicalCatalogFailure("catalog_exists"));};
  request.onsuccess=()=>{done();try{if(blocked||!created)throw physicalCatalogFailure("catalog_exists");guard();resolve(request.result);}catch(error){request.result.close();reject(physicalCatalogKnown(error,"catalog_storage"));}};
 });
}
/** Missing inspection aborts the version-zero creation transaction; it creates no ready placeholder. */
export function existingPhysicalCatalogDatabase(factory:IDBFactory,name:string,guard:()=>void):Promise<IDBDatabase|undefined>{
 guard();return new Promise((resolve,reject)=>{const r=factory.open(name);let missing=false,blocked=false;
  r.onupgradeneeded=()=>{missing=true;r.transaction!.abort();};r.onerror=()=>missing?resolve(undefined):reject(physicalCatalogFailure("catalog_storage"));
  r.onblocked=()=>{blocked=true;reject(physicalCatalogFailure("catalog_in_use"));};r.onsuccess=()=>{try{if(blocked)throw physicalCatalogFailure("catalog_in_use");guard();resolve(r.result);}catch(error){r.result.close();reject(physicalCatalogKnown(error,"catalog_storage"));}};
 });
}
/** Reads one coherent transaction. Schema, intent and Blob values are necessary, not byte-integrity proof. */
export function readPhysicalCatalogDatabase(db:IDBDatabase,guard:()=>void,manifest?:string):Promise<{record:PhysicalCatalogRecord;files:Map<string,Blob>}>{
 guard();schema(db);return new Promise((resolve,reject)=>{
  const tx=db.transaction([stateStore,fileStore],"readonly"),state=tx.objectStore(stateStore),files=tx.objectStore(fileStore);let record:PhysicalCatalogRecord|undefined,keys:IDBValidKey[]|undefined,values:Blob[]|undefined,reason:unknown;
  const abort=(error:unknown)=>{reason=physicalCatalogKnown(error,"catalog_diverged");try{tx.abort();}catch{}};
  tx.onabort=()=>reject(reason??physicalCatalogFailure("catalog_storage"));
  tx.oncomplete=()=>{try{guard();if(!record||!keys||!values||keys.length!==values.length||keys.some(key=>typeof key!=="string")||values.some(value=>!(value instanceof Blob)))throw physicalCatalogFailure("catalog_diverged");const expected=new Set(["origin-server","current-server","inventory",...parsePhysicalCatalogManifest(record.manifest).participants.map(row=>physicalParticipantKey(row.id))]);if(keys.length!==expected.size||keys.some(key=>!expected.has(key as string)))throw physicalCatalogFailure("catalog_diverged");resolve({record,files:new Map(keys.map((key,at)=>[key as string,values![at]!]))});}catch(error){reject(physicalCatalogKnown(error,"catalog_diverged"));}};
  try{shape(state);shape(files);}catch(error){abort(error);return;}
  state.count().onsuccess=e=>{try{guard();if((e.target as IDBRequest<number>).result!==1)throw physicalCatalogFailure("catalog_diverged");}catch(error){abort(error);}};
  state.get("state").onsuccess=e=>{try{guard();record=checkPhysicalCatalogRecord((e.target as IDBRequest).result,manifest);const expected=parsePhysicalCatalogManifest(record.manifest).participants.length+3,count=files.count();count.onsuccess=()=>{try{guard();if(count.result!==expected||count.result>MAX_PHYSICAL_ROOM_CATALOG_FILES)throw physicalCatalogFailure("catalog_diverged");files.getAllKeys().onsuccess=e=>{keys=(e.target as IDBRequest<IDBValidKey[]>).result;};files.getAll().onsuccess=e=>{values=(e.target as IDBRequest<Blob[]>).result;};}catch(error){abort(error);}};}catch(error){abort(error);}};
 });
}
