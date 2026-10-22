/** Absent-only retention in distinct V2 stores. Count before value cloning in
 * one coherent transaction; neither old nor occupied data is migrated/repaired. */
import {physicalCatalogFailure,physicalCatalogKnown,physicalParticipantKey,MAX_PHYSICAL_ROOM_CATALOG_FILES} from '../physical_room_catalog/policy.js';
import {parsePhysicalCatalogV2Manifest} from './manifest.js';
import {physicalCatalogV2Record,checkPhysicalCatalogV2Record,type PhysicalCatalogV2Record} from './record.js';
const stateStore='physical_room_v2_state',fileStore='physical_room_v2_files';
function schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(',')!=='physical_room_v2_files,physical_room_v2_state')throw physicalCatalogFailure('catalog_diverged');}
function shape(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw physicalCatalogFailure('catalog_diverged');}
export function createPhysicalCatalogV2Database(factory:IDBFactory,name:string,input:Readonly<{manifest:string;files:ReadonlyMap<string,Blob>}>,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 const record=physicalCatalogV2Record(input.manifest),files=new Map(input.files);guard();
 return new Promise((resolve,reject)=>{const request=factory.open(name,1);let created=false,blocked=false,reason:unknown;
  const abort=(error:unknown)=>{reason=physicalCatalogKnown(error,'catalog_storage');try{request.transaction?.abort();}catch{}};
  const cancel=()=>{try{guard();}catch(error){abort(error);}},done=()=>signal?.removeEventListener('abort',cancel);signal?.addEventListener('abort',cancel,{once:true});
  request.onupgradeneeded=event=>{try{guard();if(blocked||event.oldVersion!==0)throw physicalCatalogFailure('catalog_exists');created=true;request.result.createObjectStore(stateStore).add(record,'state');const filesStore=request.result.createObjectStore(fileStore);for(const[key,file]of files){guard();filesStore.add(file,key);}}catch(error){abort(error);}};
  request.onerror=()=>{done();reject(reason??physicalCatalogFailure(request.error?.name==='VersionError'?'catalog_exists':'catalog_storage'));};request.onblocked=()=>{blocked=true;done();reject(physicalCatalogFailure('catalog_exists'));};
  request.onsuccess=()=>{done();try{if(blocked||!created)throw physicalCatalogFailure('catalog_exists');guard();resolve(request.result);}catch(error){request.result.close();reject(physicalCatalogKnown(error,'catalog_storage'));}};
 });
}
export function existingPhysicalCatalogV2Database(factory:IDBFactory,name:string,guard:()=>void):Promise<IDBDatabase|undefined>{
 guard();return new Promise((resolve,reject)=>{const request=factory.open(name);let missing=false,blocked=false;
  request.onupgradeneeded=()=>{missing=true;request.transaction!.abort();};request.onerror=()=>missing?resolve(undefined):reject(physicalCatalogFailure('catalog_storage'));request.onblocked=()=>{blocked=true;reject(physicalCatalogFailure('catalog_in_use'));};
  request.onsuccess=()=>{try{if(blocked)throw physicalCatalogFailure('catalog_in_use');guard();resolve(request.result);}catch(error){request.result.close();reject(physicalCatalogKnown(error,'catalog_storage'));}};
 });
}
export function readPhysicalCatalogV2Database(db:IDBDatabase,guard:()=>void,expected?:string):Promise<{record:PhysicalCatalogV2Record;files:Map<string,Blob>} >{
 guard();schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction([stateStore,fileStore],'readonly'),state=tx.objectStore(stateStore),files=tx.objectStore(fileStore);let record:PhysicalCatalogV2Record|undefined,keys:IDBValidKey[]|undefined,values:Blob[]|undefined,reason:unknown;
  const abort=(error:unknown)=>{reason=physicalCatalogKnown(error,'catalog_diverged');try{tx.abort();}catch{}};
  tx.onabort=()=>reject(reason??physicalCatalogFailure('catalog_storage'));
  tx.oncomplete=()=>{try{guard();if(!record||!keys||!values||keys.length!==values.length||keys.some(key=>typeof key!=='string')||values.some(value=>!(value instanceof Blob)))throw physicalCatalogFailure('catalog_diverged');const selected=new Set(['origin-server','current-server','inventory',...parsePhysicalCatalogV2Manifest(record.manifest).participants.map(row=>physicalParticipantKey(row.id))]);if(keys.length!==selected.size||keys.some(key=>!selected.has(key as string)))throw physicalCatalogFailure('catalog_diverged');resolve({record,files:new Map(keys.map((key,index)=>[key as string,values![index]!]))});}catch(error){reject(physicalCatalogKnown(error,'catalog_diverged'));}};
  try{shape(state);shape(files);const count=state.count();count.onsuccess=()=>{try{guard();if(count.result!==1)throw physicalCatalogFailure('catalog_diverged');const read=state.get('state');read.onsuccess=()=>{try{guard();record=checkPhysicalCatalogV2Record(read.result,expected);const selected=parsePhysicalCatalogV2Manifest(record.manifest).participants.length+3,number=files.count();number.onsuccess=()=>{try{guard();if(number.result!==selected||selected>MAX_PHYSICAL_ROOM_CATALOG_FILES)throw physicalCatalogFailure('catalog_diverged');files.getAllKeys().onsuccess=event=>{keys=(event.target as IDBRequest<IDBValidKey[]>).result;};files.getAll().onsuccess=event=>{values=(event.target as IDBRequest<Blob[]>).result;};}catch(error){abort(error);}};}catch(error){abort(error);}};}catch(error){abort(error);}};}catch(error){abort(error);}
 });
}
