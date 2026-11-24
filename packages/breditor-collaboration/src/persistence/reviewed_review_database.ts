import {settleOwnedTransaction} from "./settle_owned_transaction.js";
/** New exact paired family. Old document/comment/relay readers continue to reject it. */
import {SharedEditorError} from "../core.js";
import {checkReviewRecordFields,type ReviewCheckpointRecord} from "./review_database.js";
import {checkReviewedCheckpoint} from "./reviewed_checkpoint.js";
import {reviewedHistoryIdentity} from "../reviewed_history_validation.js";
import {reviewProgress,reviewStorageIdentity} from "../relay/review_validation.js";
import type {SharedReviewedHistoryIdentity} from "../reviewed_history_types.js";
import type {SharedReviewRelayStorageIdentity,SharedReviewRelayProgress} from "../relay/review_types.js";
export interface ReviewedReviewCheckpointRecord extends Omit<ReviewCheckpointRecord,"format"> {
 format:"breditor/shared-reviewed-review-checkpoint-record";reviewedHistory:SharedReviewedHistoryIdentity;
 relay:SharedReviewRelayStorageIdentity|null;progress:SharedReviewRelayProgress|null;
}
export function checkReviewedReviewRecord(input:unknown,key:readonly[string,string]):asserts input is ReviewedReviewCheckpointRecord {
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="documentCheckpointJson,format,formatVersion,history,principal,progress,rangeEditing,relay,reviewActor,reviewCheckpointJson,reviewedHistory,richLanguage,selectionEditing,versions")throw new SharedEditorError("reviewed_record","Expected closed reviewed paired record");
 const r=input as ReviewedReviewCheckpointRecord,identity=reviewedHistoryIdentity(r.reviewedHistory);
 if(r.format!=="breditor/shared-reviewed-review-checkpoint-record"||identity.principal!==r.principal)throw new SharedEditorError("reviewed_record_identity","Reviewed history must match the paired account");
 checkReviewRecordFields(r,key,()=>checkReviewedCheckpoint(r.documentCheckpointJson,...key,identity,r.richLanguage,r.history,r.rangeEditing,r.selectionEditing));
 if(r.relay===null){if(r.progress!==null)throw new SharedEditorError("reviewed_record_relay","Local record cannot carry relay progress");return;}
 if(!r.relay||!r.progress)throw new SharedEditorError("reviewed_record_relay","Explicit relay progress is required");
 const relay=reviewStorageIdentity(r.relay);
 if(Object.keys(relay).sort().join(",")!==Object.keys(r.relay).sort().join(",")||Object.entries(relay).some(([k,v])=>(r.relay as unknown as Record<string,unknown>)[k]!==v)||relay.room!==key[0]||relay.documentWriter!==key[1]||relay.actor!==r.reviewActor||relay.principal!==r.principal)throw new SharedEditorError("reviewed_record_relay","Wrong paired relay binding");
 const progress=reviewProgress(r.progress,relay);
 if(relay.reviewEditing==="read_only"&&(progress.sequence!==null||progress.accepted&&progress.accepted.through!=="0"))throw new SharedEditorError("reviewed_record_observer","Observer recovery cannot contain accepted authored metadata");
}
export function readReviewedReviewRecord(db:IDBDatabase,key:readonly[string,string]):Promise<ReviewedReviewCheckpointRecord|null>{return new Promise((resolve,reject)=>{const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").getAll([...key],1);let result:ReviewedReviewCheckpointRecord|null=null,failure:unknown;request.onsuccess=()=>{try{if(request.result.length){const value:unknown=request.result[0];checkReviewedReviewRecord(value,key);result=value;}}catch(error){failure=error;tx.abort();}};settleOwnedTransaction(tx,()=>result,()=>failure??tx.error??new SharedEditorError("reviewed_record_read","Reviewed paired recovery failed"),resolve,reject);});}
export function writeReviewedReviewRecord(db:IDBDatabase,key:readonly[string,string],record:ReviewedReviewCheckpointRecord,insertOnly=false):Promise<void>{try{checkReviewedReviewRecord(record,key);}catch(error){return Promise.reject(error);}return new Promise((resolve,reject)=>{const tx=db.transaction("journals","readwrite");tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedEditorError("reviewed_record_write","Reviewed paired transaction did not complete"));try{tx.objectStore("journals")[insertOnly?"add":"put"](record,[...key]);}catch(error){tx.abort();reject(error);}});}
