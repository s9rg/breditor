import {settleOwnedTransaction} from "./settle_owned_transaction.js";
/** Separate declared records. Old durable readers keep rejecting search history instead of guessing. */
import {SharedEditorError} from "../core.js";
import {checkSearchCheckpoint} from "./search_checkpoint.js";
import type {SharedHistoryPolicy,SharedRangePolicy,SharedSelectionPolicy} from "../types.js";
export interface SearchCheckpointRecord {
 format:"breditor/shared-search-checkpoint-record";formatVersion:1;history:SharedHistoryPolicy;
 rangeEditing:SharedRangePolicy;selectionEditing:SharedSelectionPolicy;richLanguage:1|2|3|4;checkpointJson:string;
}
export function checkSearchRecord(input:unknown,key:readonly[string,string]):asserts input is SearchCheckpointRecord{
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="checkpointJson,format,formatVersion,history,rangeEditing,richLanguage,selectionEditing")throw new SharedEditorError("search_record","Expected an explicitly selected search record; old records require explicit migration");
 const r=input as SearchCheckpointRecord;if(r.format!=="breditor/shared-search-checkpoint-record"||r.formatVersion!==1)throw new SharedEditorError("search_record","Unknown search storage family");
 checkSearchCheckpoint(r.checkpointJson,...key,r.richLanguage,r.history,r.rangeEditing,r.selectionEditing);
}
export function readSearchRecord(db:IDBDatabase,key:readonly[string,string]):Promise<SearchCheckpointRecord|null>{return new Promise((resolve,reject)=>{const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").getAll([...key],1);let result:SearchCheckpointRecord|null=null,failure:unknown;request.onsuccess=()=>{try{if(request.result.length){const value:unknown=request.result[0];checkSearchRecord(value,key);result=value;}}catch(error){failure=error;tx.abort();}};settleOwnedTransaction(tx,()=>result,()=>failure??tx.error??new SharedEditorError("search_record_read","Search recovery failed"),resolve,reject);});}
export function writeSearchRecord(db:IDBDatabase,key:readonly[string,string],record:SearchCheckpointRecord):Promise<void>{try{checkSearchRecord(record,key);}catch(error){return Promise.reject(error);}return new Promise((resolve,reject)=>{const tx=db.transaction("journals","readwrite");tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedEditorError("search_record_write","Search transaction did not complete"));try{tx.objectStore("journals").put(record,[...key]);}catch(error){tx.abort();reject(error);}});}
