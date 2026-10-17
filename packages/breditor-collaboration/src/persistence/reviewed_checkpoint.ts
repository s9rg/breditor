/** Closed storage identity only. Exact replay/owned semantics are proved by the Rust factory. */
import {SharedEditorError} from "../core.js";
import {MAX_CHECKPOINT_BYTES} from "./session_database.js";
import {reviewedHistoryIdentity} from "../reviewed_history_validation.js";
import type {SharedReviewedHistoryIdentity} from "../reviewed_history_types.js";
import type {SharedHistoryPolicy,SharedRangePolicy,SharedSelectionPolicy} from "../types.js";
export function checkReviewedCheckpoint(input:string,room:string,writer:string,identity:SharedReviewedHistoryIdentity,language:1|2|3,history:SharedHistoryPolicy,ranges:SharedRangePolicy,selection:SharedSelectionPolicy):void {
 const pinned=reviewedHistoryIdentity(identity);
 if(pinned.effectWriter===writer||typeof input!=="string"||new TextEncoder().encode(input).length>MAX_CHECKPOINT_BYTES)throw new SharedEditorError("reviewed_checkpoint_budget","Invalid reviewed source identity/budget");
 const r=JSON.parse(input) as Record<string,unknown>|null;
 if(!r||typeof r!=="object"||Array.isArray(r)||Object.keys(r).sort().join(",")!=="format,formatVersion,joins,journal,journalVersion,modelVersion,replay")throw new SharedEditorError("reviewed_checkpoint_family","Expected explicit reviewed checkpoint");
 const grouped=history==="typing-v1",document=selection==="document-v1",general=ranges==="general-v1",model=language===3?13:language===2?12:11,version=language===3?14:language===2?13:12;
 const j=r["journal"] as Record<string,unknown>|null;
 const format=document?`breditor/rich-replica-document${grouped?"-typing":""}-journal`:general?`breditor/rich-replica-general${grouped?"-typing":""}-journal`:`breditor/rich-replica${grouped?"-typing":""}-journal`;
 if(![1,2,3].includes(language)||(history!=="explicit"&&!grouped)||(ranges!=="original"&&!general)||(selection!=="original"&&!document)||(document&&!general)||r["format"]!=="breditor/shared-reviewed-history-session"||r["formatVersion"]!==1||r["modelVersion"]!==model||r["journalVersion"]!==version||r["replay"]!==(document?"document-v1":general?"general-v1":"original")||!j||typeof j!=="object"||Array.isArray(j)||Object.keys(j).sort().join(",")!=="document,entries,format,origin,publication,ui,version,writer"||j["format"]!==format||j["version"]!==((document||general||grouped)?1:version)||j["document"]!==room||j["writer"]!==writer||!Array.isArray(j["entries"])||j["entries"].length>1000)throw new SharedEditorError("reviewed_checkpoint_identity","Reviewed checkpoint differs from selected source policy");
 const joins=r["joins"];if(grouped?(!Array.isArray(joins)||joins.length>1000||joins.some(v=>!Number.isSafeInteger(v)||v<0)):joins!==null)throw new SharedEditorError("reviewed_checkpoint_partition","Invalid explicit reviewed typing partition");
}
