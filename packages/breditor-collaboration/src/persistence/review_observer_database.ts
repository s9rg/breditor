import {settleOwnedTransaction} from "./settle_owned_transaction.js";
/** Explicit non-authoring paired recovery; old writer records are never silently demoted/promoted. */
import {SharedEditorError} from "../core.js";
import {checkReviewRelayRecord,type ReviewRelayCheckpointRecord} from "./review_relay_database.js";
import type {SharedReviewRelayStorageIdentity} from "../relay/review_types.js";
export interface ReviewObserverCheckpointRecord extends Omit<ReviewRelayCheckpointRecord,"format"|"relay"> {
 format:"breditor/shared-review-observer-checkpoint-record";
 relay:SharedReviewRelayStorageIdentity&{reviewEditing:"read_only"};
}
export function checkReviewObserverRecord(input:unknown,key:readonly[string,string]):asserts input is ReviewObserverCheckpointRecord{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new SharedEditorError("review_observer_record","Expected an explicit read-only review record");
 const record=input as ReviewObserverCheckpointRecord;
 if(record.format!=="breditor/shared-review-observer-checkpoint-record"||record.relay?.reviewEditing!=="read_only")throw new SharedEditorError("review_observer_record","Wrong read-only storage family");
 const {reviewEditing,...relay}=record.relay;void reviewEditing;
 checkReviewRelayRecord({...record,format:"breditor/shared-review-relay-checkpoint-record",relay},key);
 if(record.progress.sequence!==null||record.progress.accepted&&record.progress.accepted.through!=="0"||new TextEncoder().encode(JSON.stringify(record)).length>32*1024*1024)throw new SharedEditorError("review_observer_record","An observer cannot have an accepted authored prefix");
}
export function readReviewObserverRecord(db:IDBDatabase,key:readonly[string,string]):Promise<ReviewObserverCheckpointRecord|null>{return new Promise((resolve,reject)=>{const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").get([...key]);let result:ReviewObserverCheckpointRecord|null=null,failure:unknown;request.onsuccess=()=>{try{if(request.result!==undefined){checkReviewObserverRecord(request.result,key);result=request.result;}}catch(error){failure=error;tx.abort();}};settleOwnedTransaction(tx,()=>result,()=>failure??tx.error??new SharedEditorError("review_observer_read","Read-only paired recovery failed"),resolve,reject);});}
export function writeReviewObserverRecord(db:IDBDatabase,key:readonly[string,string],record:ReviewObserverCheckpointRecord,insertOnly=false):Promise<void>{try{checkReviewObserverRecord(record,key);}catch(error){return Promise.reject(error);}return new Promise((resolve,reject)=>{const tx=db.transaction("journals","readwrite");tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedEditorError("review_observer_write","Read-only paired transaction did not complete"));try{tx.objectStore("journals")[insertOnly?"add":"put"](record,[...key]);}catch(error){tx.abort();reject(error);}});}
