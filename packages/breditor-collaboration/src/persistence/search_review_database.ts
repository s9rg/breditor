import {settleOwnedTransaction} from "./settle_owned_transaction.js";
/** New atomic paired family composing search, comments, optional reviewed ownership and relay progress. */
import {SharedEditorError} from "../core.js";
import {checkReviewRecordFields} from "./review_database.js";
import type {ReviewedReviewCheckpointRecord} from "./reviewed_review_database.js";
import {checkSearchCheckpoint} from "./search_checkpoint.js";
import {reviewedHistoryIdentity} from "../reviewed_history_validation.js";
import type {SharedReviewedHistoryIdentity} from "../reviewed_history_types.js";
import {reviewProgress,reviewStorageIdentity} from "../relay/review_validation.js";
export interface SearchReviewCheckpointRecord extends Omit<ReviewedReviewCheckpointRecord,"format"|"reviewedHistory"> {
 format:"breditor/shared-search-review-checkpoint-record";reviewedHistory:SharedReviewedHistoryIdentity|null;
}
export function checkSearchReviewRecord(input:unknown,key:readonly[string,string]):asserts input is SearchReviewCheckpointRecord {
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="documentCheckpointJson,format,formatVersion,history,principal,progress,rangeEditing,relay,reviewActor,reviewCheckpointJson,reviewedHistory,richLanguage,selectionEditing,versions")throw new SharedEditorError("search_review_record","Expected a closed search-aware paired record");
 const r=input as SearchReviewCheckpointRecord,identity=r.reviewedHistory===null?null:reviewedHistoryIdentity(r.reviewedHistory);
 if(r.format!=="breditor/shared-search-review-checkpoint-record"||identity&&identity.principal!==r.principal)throw new SharedEditorError("search_review_identity","Search reviewed ownership must match the paired account");
 checkReviewRecordFields(r,key,()=>checkSearchCheckpoint(r.documentCheckpointJson,...key,r.richLanguage,r.history,r.rangeEditing,r.selectionEditing,identity));
 if(r.relay===null){if(r.progress!==null)throw new SharedEditorError("search_review_relay","Local paired record cannot carry relay progress");return;}
 if(!r.relay||!r.progress)throw new SharedEditorError("search_review_relay","Explicit paired relay progress is required");
 const relay=reviewStorageIdentity(r.relay);
 if(Object.keys(relay).sort().join(",")!==Object.keys(r.relay).sort().join(",")||Object.entries(relay).some(([k,v])=>(r.relay as unknown as Record<string,unknown>)[k]!==v)||relay.room!==key[0]||relay.documentWriter!==key[1]||relay.actor!==r.reviewActor||relay.principal!==r.principal)throw new SharedEditorError("search_review_relay","Wrong paired relay binding");
 const progress=reviewProgress(r.progress,relay);
 if(relay.reviewEditing==="read_only"&&(progress.sequence!==null||progress.accepted&&progress.accepted.through!=="0"))throw new SharedEditorError("search_review_observer","Observer recovery cannot contain accepted authored metadata");
}
export function readSearchReviewRecord(db:IDBDatabase,key:readonly[string,string]):Promise<SearchReviewCheckpointRecord|null>{return new Promise((resolve,reject)=>{const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").get([...key]);let result:SearchReviewCheckpointRecord|null=null,failure:unknown;request.onsuccess=()=>{try{if(request.result!==undefined){checkSearchReviewRecord(request.result,key);result=request.result;}}catch(error){failure=error;tx.abort();}};settleOwnedTransaction(tx,()=>result,()=>failure??tx.error??new SharedEditorError("search_review_read","Search paired recovery failed"),resolve,reject);});}
export function writeSearchReviewRecord(db:IDBDatabase,key:readonly[string,string],record:SearchReviewCheckpointRecord):Promise<void>{try{checkSearchReviewRecord(record,key);}catch(error){return Promise.reject(error);}return new Promise((resolve,reject)=>{const tx=db.transaction("journals","readwrite");tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedEditorError("search_review_write","Search paired transaction did not complete"));try{tx.objectStore("journals").put(record,[...key]);}catch(error){tx.abort();reject(error);}});}
