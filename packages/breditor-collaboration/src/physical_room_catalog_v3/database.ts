/** Absent-only retention in distinct V3 stores. Count before value cloning in
 * one coherent transaction; neither old nor occupied data is migrated/repaired. */
import {physicalCatalogFailure,physicalCatalogKnown,physicalParticipantKey,MAX_PHYSICAL_ROOM_CATALOG_FILES} from '../physical_room_catalog/policy.js';
import {parsePhysicalCatalogV3Manifest} from './manifest.js';
import {physicalCatalogV3Record,checkPhysicalCatalogV3Record,type PhysicalCatalogV3Record} from './record.js';
interface PhysicalCatalogStorage<Record extends {manifest:string}> {
 readonly stateStore:string;
 readonly fileStore:string;
 readonly encode:(manifest:string)=>Record;
 readonly check:(value:unknown,expected?:string)=>Record;
 readonly participants:(manifest:string)=>readonly {id:string}[];
}
const v3={
 stateStore:'physical_room_v3_state',fileStore:'physical_room_v3_files',
 encode:physicalCatalogV3Record,check:checkPhysicalCatalogV3Record,
 participants:(manifest:string)=>parsePhysicalCatalogV3Manifest(manifest).participants,
};
function schema(db:IDBDatabase,files:string,state:string):void{
 if(db.version!==1||db.objectStoreNames.length!==2||!db.objectStoreNames.contains(files)||!db.objectStoreNames.contains(state))
  throw physicalCatalogFailure('catalog_diverged');
}
function shape(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw physicalCatalogFailure('catalog_diverged');}
export function createPhysicalCatalogV3Database(factory:IDBFactory,name:string,input:Readonly<{manifest:string;files:ReadonlyMap<string,Blob>}>,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 return createPhysicalCatalogDatabase(factory,name,input,guard,signal,v3);
}
export function createPhysicalCatalogDatabase<Record extends {manifest:string}>(
 factory:IDBFactory,name:string,input:Readonly<{manifest:string;files:ReadonlyMap<string,Blob>}>,
 guard:()=>void,signal:AbortSignal|undefined,storage:PhysicalCatalogStorage<Record>,
):Promise<IDBDatabase>{
 const {stateStore,fileStore}=storage,record=storage.encode(input.manifest),files=new Map(input.files);guard();
 return new Promise((resolve,reject)=>{const request=factory.open(name,1);let created=false,blocked=false,reason:unknown;
  const abort=(error:unknown)=>{reason=physicalCatalogKnown(error,'catalog_storage');try{request.transaction?.abort();}catch{}};
  const cancel=()=>{try{guard();}catch(error){abort(error);}},done=()=>signal?.removeEventListener('abort',cancel);signal?.addEventListener('abort',cancel,{once:true});
  request.onupgradeneeded=event=>{try{guard();if(blocked||event.oldVersion!==0)throw physicalCatalogFailure('catalog_exists');created=true;request.result.createObjectStore(stateStore).add(record,'state');const filesStore=request.result.createObjectStore(fileStore);for(const[key,file]of files){guard();filesStore.add(file,key);}}catch(error){abort(error);}};
  request.onerror=()=>{done();reject(reason??physicalCatalogFailure(request.error?.name==='VersionError'?'catalog_exists':'catalog_storage'));};request.onblocked=()=>{blocked=true;done();reject(physicalCatalogFailure('catalog_exists'));};
  request.onsuccess=()=>{done();try{if(blocked||!created)throw physicalCatalogFailure('catalog_exists');guard();resolve(request.result);}catch(error){request.result.close();reject(physicalCatalogKnown(error,'catalog_storage'));}};
 });
}
export function existingPhysicalCatalogV3Database(factory:IDBFactory,name:string,guard:()=>void):Promise<IDBDatabase|undefined>{
 guard();return new Promise((resolve,reject)=>{const request=factory.open(name);let missing=false,blocked=false;
  request.onupgradeneeded=()=>{missing=true;request.transaction!.abort();};request.onerror=()=>missing?resolve(undefined):reject(physicalCatalogFailure('catalog_storage'));request.onblocked=()=>{blocked=true;reject(physicalCatalogFailure('catalog_in_use'));};
  request.onsuccess=()=>{try{if(blocked)throw physicalCatalogFailure('catalog_in_use');guard();resolve(request.result);}catch(error){request.result.close();reject(physicalCatalogKnown(error,'catalog_storage'));}};
 });
}
export function readPhysicalCatalogV3Database(db:IDBDatabase,guard:()=>void,expected?:string):Promise<{record:PhysicalCatalogV3Record;files:Map<string,Blob>} >{
 return readPhysicalCatalogDatabase(db,guard,expected,v3);
}
export function readPhysicalCatalogDatabase<Record extends {manifest:string}>(
 db:IDBDatabase,guard:()=>void,expected:string|undefined,storage:PhysicalCatalogStorage<Record>,
):Promise<{record:Record;files:Map<string,Blob>}>{
 const {stateStore,fileStore}=storage;
 guard();schema(db,fileStore,stateStore);return new Promise((resolve,reject)=>{const tx=db.transaction([stateStore,fileStore],'readonly'),state=tx.objectStore(stateStore),files=tx.objectStore(fileStore);let record:Record|undefined,keys:IDBValidKey[]|undefined,values:Blob[]|undefined,reason:unknown;
  const abort=(error:unknown)=>{reason=physicalCatalogKnown(error,'catalog_diverged');try{tx.abort();}catch{}};
  tx.onabort=()=>reject(reason??physicalCatalogFailure('catalog_storage'));
  tx.oncomplete=()=>{try{guard();if(!record||!keys||!values||keys.length!==values.length||keys.some(key=>typeof key!=='string')||values.some(value=>!(value instanceof Blob)))throw physicalCatalogFailure('catalog_diverged');const selected=new Set(['origin-server','current-server','inventory',...storage.participants(record.manifest).map(row=>physicalParticipantKey(row.id))]);if(keys.length!==selected.size||keys.some(key=>!selected.has(key as string)))throw physicalCatalogFailure('catalog_diverged');resolve({record,files:new Map(keys.map((key,index)=>[key as string,values![index]!]))});}catch(error){reject(physicalCatalogKnown(error,'catalog_diverged'));}};
  try{shape(state);shape(files);const count=state.count();count.onsuccess=()=>{try{guard();if(count.result!==1)throw physicalCatalogFailure('catalog_diverged');const read=state.get('state');read.onsuccess=()=>{try{guard();record=storage.check(read.result,expected);const selected=storage.participants(record.manifest).length+3,number=files.count();number.onsuccess=()=>{try{guard();if(number.result!==selected||selected>MAX_PHYSICAL_ROOM_CATALOG_FILES)throw physicalCatalogFailure('catalog_diverged');files.getAllKeys().onsuccess=event=>{keys=(event.target as IDBRequest<IDBValidKey[]>).result;};files.getAll().onsuccess=event=>{values=(event.target as IDBRequest<Blob[]>).result;};}catch(error){abort(error);}};}catch(error){abort(error);}};}catch(error){abort(error);}};}catch(error){abort(error);}
 });
}
