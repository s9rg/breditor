import {settleOwnedTransaction} from "./settle_owned_transaction.js";
/** Separate closed family: adding transport progress never changes existing paired V1 records. */
import {SharedEditorError} from "../core.js";
import {checkReviewRecord,type ReviewCheckpointRecord} from "./review_database.js";
import {reviewProgress,reviewStorageIdentity} from "../relay/review_validation.js";
import type {SharedReviewRelayStorageIdentity,SharedReviewRelayProgress} from "../relay/review_types.js";
export interface ReviewRelayCheckpointRecord extends Omit<ReviewCheckpointRecord,"format"> {
 format:"breditor/shared-review-relay-checkpoint-record";
 relay:SharedReviewRelayStorageIdentity;progress:SharedReviewRelayProgress;
}
export function checkReviewRelayRecord(input:unknown,key:readonly[string,string]):asserts input is ReviewRelayCheckpointRecord {
 if(!input||typeof input!=="object"||Array.isArray(input))throw new SharedEditorError("review_relay_record","Expected an explicitly paired relay record");
 const record=input as ReviewRelayCheckpointRecord,{relay,progress,...base}=record;
 if(base.format!=="breditor/shared-review-relay-checkpoint-record"||!relay||!progress)throw new SharedEditorError("review_relay_record","Wrong paired storage family");
 checkReviewRecord({...base,format:"breditor/shared-review-checkpoint-record"},key);
 if(Object.keys(relay).sort().join(",")!==(relay.writerTransport===undefined?"actor,binding,documentWriter,endpoint,principal,room":"actor,binding,documentWriter,endpoint,principal,room,writerTransport"))throw new SharedEditorError("review_relay_record","Unknown relay identity fields");
 const admitted=reviewStorageIdentity(relay);reviewProgress(progress,admitted);
 if(Object.entries(admitted).some(([field,value])=>(relay as unknown as Record<string,unknown>)[field]!==value)||relay.room!==key[0]||relay.documentWriter!==key[1]||relay.actor!==base.reviewActor||relay.principal!==base.principal||new TextEncoder().encode(JSON.stringify(record)).length>32*1024*1024)throw new SharedEditorError("review_relay_record","Relay identity/canonical storage budget mismatch");
}
export function readReviewRelayRecord(db:IDBDatabase,key:readonly[string,string]):Promise<ReviewRelayCheckpointRecord|null>{return new Promise((resolve,reject)=>{const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").get([...key]);let result:ReviewRelayCheckpointRecord|null=null,failure:unknown;request.onsuccess=()=>{try{if(request.result!==undefined){checkReviewRelayRecord(request.result,key);result=request.result;}}catch(error){failure=error;tx.abort();}};settleOwnedTransaction(tx,()=>result,()=>failure??tx.error??new SharedEditorError("review_relay_record_read","Paired relay recovery failed"),resolve,reject);});}
export function writeReviewRelayRecord(db:IDBDatabase,key:readonly[string,string],record:ReviewRelayCheckpointRecord):Promise<void>{try{checkReviewRelayRecord(record,key);}catch(error){return Promise.reject(error);}return new Promise((resolve,reject)=>{const tx=db.transaction("journals","readwrite");tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedEditorError("review_relay_record_write","Paired relay transaction did not complete"));try{tx.objectStore("journals").put(record,[...key]);}catch(error){tx.abort();reject(error);}});}
