/** Strict monotonic CAS changes intent only, never a file or catalog record. */
import {v2Failure,v2Signal} from "./errors.js";
import {checkRoomOperationV2,roomOperationV2Schema,roomOperationV2Store,roomOperationV2Transition,V2_OPERATION_STORE,type RoomOperationV2Record} from "./record.js";
export function updateRoomOperationV2(db:IDBDatabase,before:RoomOperationV2Record,next:RoomOperationV2Record,guard:()=>void,signal?:AbortSignal):Promise<void>{
 v2Signal(signal);guard();v2Signal(signal);roomOperationV2Schema(db);roomOperationV2Transition(before,next);return new Promise((resolve,reject)=>{
  let tx:IDBTransaction;try{tx=db.transaction(V2_OPERATION_STORE,"readwrite",{durability:"strict"});}catch{reject(v2Failure());return;}let reason:unknown;const fail=(error:unknown)=>{reason=error;try{tx.abort();}catch{}},cancel=()=>fail(v2Failure("room_v2_aborted"));signal?.addEventListener("abort",cancel,{once:true});tx.onabort=()=>{signal?.removeEventListener("abort",cancel);reject(reason??v2Failure());};tx.oncomplete=()=>{signal?.removeEventListener("abort",cancel);resolve();};
  const store=tx.objectStore(V2_OPERATION_STORE);try{roomOperationV2Store(store);}catch(error){fail(error);return;}store.count().onsuccess=e=>{if((e.target as IDBRequest<number>).result!==1)fail(v2Failure("room_v2_diverged"));};store.get("state").onsuccess=e=>{try{guard();v2Signal(signal);if(JSON.stringify(checkRoomOperationV2((e.target as IDBRequest).result,before))!==JSON.stringify(before))throw v2Failure("room_v2_diverged");store.put(next,"state");}catch(error){fail(error);}};
 });
}
