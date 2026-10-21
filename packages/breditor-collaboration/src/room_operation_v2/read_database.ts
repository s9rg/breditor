/** Read the complete closed source cut. No original-generation store is auto-detected. */
import {existingDatabase} from "../participant_recovery/journal.js";
import {parseCatalogV2Manifest} from "../room_recovery_catalog_v2/manifest.js";
import {v2Failure} from "./errors.js";
import {checkRoomOperationV2,roomOperationV2Schema,roomOperationV2Store,V2_OPERATION_STORE,V2_OPERATION_FILES,type RoomOperationV2Record} from "./record.js";
export async function existingRoomOperationV2Database(name:string,opened:(db:IDBDatabase)=>void):Promise<IDBDatabase>{const db=await existingDatabase(name);if(!db)throw v2Failure("room_v2_missing");try{opened(db);roomOperationV2Schema(db);return db;}catch(error){db.close();throw error;}}
export function readRoomOperationV2Database(db:IDBDatabase,expected?:RoomOperationV2Record):Promise<{record:RoomOperationV2Record;files:Map<string,Blob>}>{
 roomOperationV2Schema(db);return new Promise((resolve,reject)=>{
  const tx=db.transaction([V2_OPERATION_STORE,V2_OPERATION_FILES],"readonly"),store=tx.objectStore(V2_OPERATION_STORE),files=tx.objectStore(V2_OPERATION_FILES);let record:RoomOperationV2Record,keys:IDBValidKey[],values:Blob[],reason:unknown;
  const fail=(error:unknown)=>{reason=error;try{tx.abort();}catch{}};tx.onabort=()=>reject(reason??v2Failure());tx.oncomplete=()=>{try{if(keys.length!==values.length||keys.some(k=>typeof k!=="string")||values.some(v=>!(v instanceof Blob)))throw v2Failure("room_v2_diverged");resolve({record,files:new Map(keys.map((key,index)=>[key as string,values[index]!]))});}catch(error){reject(error);}};
  try{roomOperationV2Store(store);roomOperationV2Store(files);}catch(error){fail(error);return;}store.count().onsuccess=e=>{if((e.target as IDBRequest<number>).result!==1)fail(v2Failure("room_v2_diverged"));};
  store.get("state").onsuccess=e=>{try{record=checkRoomOperationV2((e.target as IDBRequest).result,expected);const expectedKeys=["server","inventory",...parseCatalogV2Manifest(record.catalog.manifest).participants.map(row=>`participant:${row.id}`)].sort();files.count().onsuccess=e=>{if((e.target as IDBRequest<number>).result!==expectedKeys.length){fail(v2Failure("room_v2_diverged"));return;}files.getAllKeys().onsuccess=e=>{keys=(e.target as IDBRequest<IDBValidKey[]>).result;if(JSON.stringify([...keys].sort())!==JSON.stringify(expectedKeys))fail(v2Failure("room_v2_diverged"));};files.getAll().onsuccess=e=>{values=(e.target as IDBRequest<Blob[]>).result;};};}catch(error){fail(error);}};
 });
}
