import {existingDatabase} from "../participant_recovery/journal.js";
import {parseManifest} from "../room_recovery_catalog/manifest.js";
import {roomFailure} from "./errors.js";
import {checkRoomOperation,roomSchema,roomStore,type RoomOperationRecord} from "./record.js";
export async function existingRoomOperationDatabase(name:string,opened:(db:IDBDatabase)=>void):Promise<IDBDatabase>{const db=await existingDatabase(name);if(!db)throw roomFailure("room_operation_missing");try{opened(db);roomSchema(db);return db;}catch(error){db.close();throw error;}}
/** Settle malformed shapes before requests exist; read the complete closed source in one cut. */
export async function readRoomOperationDatabase(db:IDBDatabase,expected?:RoomOperationRecord):Promise<{record:RoomOperationRecord;files:Map<string,Blob>}>{
 roomSchema(db);return new Promise((resolve,reject)=>{const tx=db.transaction(["operation","files"],"readonly"),store=tx.objectStore("operation"),files=tx.objectStore("files");let record:RoomOperationRecord,keys:IDBValidKey[],values:Blob[],reason:unknown;
  const fail=(error:unknown)=>{reason=error;try{tx.abort();}catch{}};tx.onabort=()=>reject(reason??roomFailure());tx.oncomplete=()=>{try{if(keys.length!==values.length||keys.some(key=>typeof key!=="string")||values.some(file=>!(file instanceof Blob)))throw roomFailure("room_operation_diverged");resolve({record,files:new Map(keys.map((key,index)=>[key as string,values[index]!]))});}catch(error){reject(error);}};
  try{roomStore(store);roomStore(files);}catch(error){fail(error);return;}const n=store.count();n.onsuccess=()=>{if(n.result!==1)fail(roomFailure("room_operation_diverged"));};const r=store.get("state");r.onsuccess=()=>{try{record=checkRoomOperation(r.result,expected);const expectedKeys=["inventory","server",...parseManifest(record.catalog.manifest).participants.map(row=>`participant:${row.id}`)].sort(),count=files.count();count.onsuccess=()=>{if(count.result!==expectedKeys.length){fail(roomFailure("room_operation_diverged"));return;}const k=files.getAllKeys(),v=files.getAll();k.onsuccess=()=>{keys=k.result;if(JSON.stringify([...keys].sort())!==JSON.stringify(expectedKeys))fail(roomFailure("room_operation_diverged"));};v.onsuccess=()=>{values=v.result;};};}catch(error){fail(error);}};
 });
}
