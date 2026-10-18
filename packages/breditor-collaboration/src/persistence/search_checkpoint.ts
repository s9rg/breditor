/** Closed storage identity for the explicitly selected search replay family; Rust proves exact replay. */
import {SharedEditorError} from "../core.js";
import {MAX_CHECKPOINT_BYTES} from "./session_database.js";
import {reviewedHistoryIdentity} from "../reviewed_history_validation.js";
import type {SharedReviewedHistoryIdentity} from "../reviewed_history_types.js";
import type {SharedHistoryPolicy,SharedRangePolicy,SharedSelectionPolicy} from "../types.js";
export function checkSearchCheckpoint(input:string,room:string,writer:string,language:1|2|3,history:SharedHistoryPolicy,ranges:SharedRangePolicy,selection:SharedSelectionPolicy,reviewed:SharedReviewedHistoryIdentity|null=null):void{
 const fail=()=>new SharedEditorError("search_checkpoint_identity","Search checkpoint differs from the explicitly selected leased source policy");
 if(typeof input!=="string"||new TextEncoder().encode(input).length>MAX_CHECKPOINT_BYTES)throw new SharedEditorError("session_budget","Shared journal exceeds its 16 MiB storage budget");
 if(reviewed&&reviewedHistoryIdentity(reviewed).effectWriter===writer)throw fail();
 let decoded:unknown;try{decoded=JSON.parse(input);}catch{throw fail();}
 if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))throw fail();
 const r=decoded as Record<string,unknown>,j=r["journal"] as Record<string,unknown>|null;
 const grouped=history==="typing-v1",document=selection==="document-v1",general=ranges==="general-v1";
 const model=language===3?13:language===2?12:11,version=language===3?14:language===2?13:12,scope=document?"document-v1":general?"general-v1":"original";
 const format=`breditor/rich-replica${document?"-document":general?"-general":""}-search${grouped?"-typing":""}-journal`;
 if(![1,2,3].includes(language)||(history!=="explicit"&&!grouped)||(ranges!=="original"&&!general)||(selection!=="original"&&!document)||(document&&!general)||Object.keys(r).sort().join(",")!=="format,formatVersion,joins,journal,journalVersion,modelVersion,reviewed,scope"||r["format"]!=="breditor/shared-search-session"||r["formatVersion"]!==1||r["modelVersion"]!==model||r["journalVersion"]!==version||r["scope"]!==scope||r["reviewed"]!==(reviewed!==null)||!j||typeof j!=="object"||Array.isArray(j)||Object.keys(j).sort().join(",")!=="document,entries,format,origin,publication,ui,version,writer"||j["format"]!==format||j["version"]!==1||j["document"]!==room||j["writer"]!==writer||!Array.isArray(j["entries"])||j["entries"].length>1000)throw fail();
 const joins=r["joins"];if(grouped?(!Array.isArray(joins)||joins.length>1000||joins.some(v=>!Number.isInteger(v)||v<0||v>0xffffffff)):joins!==null)throw fail();
}
