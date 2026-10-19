import {roomFailure,roomSignal} from "./errors.js";
import {checkRoomOperation,roomSchema,roomStore,roomTransition,type RoomOperationRecord} from "./record.js";
/** Monotonic strict CAS. No source file or original catalog marker is rewritten. */
export async function updateRoomOperation(db:IDBDatabase,before:RoomOperationRecord,next:RoomOperationRecord,guard:()=>void,signal?:AbortSignal):Promise<void>{
 roomSignal(signal);guard();roomSignal(signal);roomSchema(db);roomTransition(before,next);return new Promise((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction("operation","readwrite",{durability:"strict"});}catch{reject(roomFailure());return;}let reason:unknown;
  const fail=(error:unknown)=>{reason=error;try{tx.abort();}catch{}},cancel=()=>fail(roomFailure("room_operation_aborted"));signal?.addEventListener("abort",cancel,{once:true});tx.onabort=()=>{signal?.removeEventListener("abort",cancel);reject(reason??roomFailure());};tx.oncomplete=()=>{signal?.removeEventListener("abort",cancel);resolve();};const store=tx.objectStore("operation");try{roomStore(store);}catch(error){fail(error);return;}const n=store.count();n.onsuccess=()=>{if(n.result!==1)fail(roomFailure("room_operation_diverged"));};const r=store.get("state");r.onsuccess=()=>{try{guard();roomSignal(signal);if(JSON.stringify(checkRoomOperation(r.result,before))!==JSON.stringify(before))throw roomFailure("room_operation_diverged");store.put(next,"state");}catch(error){fail(error);}};
 });
}
