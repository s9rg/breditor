/** Storage shape/identity admission only. Every cold open additionally requires exact native replay. */
import {SharedEditorError} from "../core.js";
import {checkCheckpoint,checkDocumentCheckpoint,MAX_CHECKPOINT_BYTES} from "./session_database.js";
import {checkSearchCheckpoint} from "./search_checkpoint.js";
import {checkReviewedCheckpoint} from "./reviewed_checkpoint.js";
import {reviewedHistoryIdentity} from "../reviewed_history_validation.js";
import {MAX_SEGMENTED_ARCHIVE_BYTES,MAX_CONTINUED_ARCHIVE_BYTES,type SegmentedSessionIdentity,type SegmentedFile} from "./segmented_contract.js";
const bytes=(v:string)=>new TextEncoder().encode(v).byteLength;
const fail=()=>new SharedEditorError("segmented_checkpoint","Segmented checkpoint differs from its explicit storage identity or bounds");
export function object(value:unknown,keys:string):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!==keys)throw fail();return value as Record<string,unknown>;}
export function checkSegmentedIdentity(value:SegmentedSessionIdentity):void {
 object(value,"history,rangeEditing,reviewedHistory,richLanguage,room,searchHistory,selectionEditing,writer");
 if(typeof value.room!=="string"||!value.room||bytes(value.room)>200||typeof value.writer!=="string"||!/^[1-9]\d{0,19}$/.test(value.writer)||BigInt(value.writer)>=18446744073709551615n||![1,2,3,4].includes(value.richLanguage)||(value.history!=="explicit"&&value.history!=="typing-v1")||(value.rangeEditing!=="original"&&value.rangeEditing!=="general-v1")||(value.selectionEditing!=="original"&&value.selectionEditing!=="document-v1")||value.selectionEditing==="document-v1"&&value.rangeEditing!=="general-v1"||value.searchHistory!==null&&value.searchHistory!=="search-v1")throw fail();
 if(value.reviewedHistory!==null){const v=reviewedHistoryIdentity(value.reviewedHistory);if(v.effectWriter===value.writer)throw fail();}
 if(new TextDecoder("utf-8",{fatal:true}).decode(new TextEncoder().encode(value.room))!==value.room)throw fail();
}
export function familyFor(identity:SegmentedSessionIdentity){return {scope:identity.selectionEditing==="document-v1"?"document-v1" as const:identity.rangeEditing==="general-v1"?"general-v1" as const:"original" as const,natural:identity.history==="typing-v1",reviewed:identity.reviewedHistory!==null,search:identity.searchHistory!==null};}
export function checkSegmentedRoot(input:string,i:SegmentedSessionIdentity):void {
 if(i.searchHistory)checkSearchCheckpoint(input,i.room,i.writer,i.richLanguage,i.history,i.rangeEditing,i.selectionEditing,i.reviewedHistory);
 else if(i.reviewedHistory)checkReviewedCheckpoint(input,i.room,i.writer,i.reviewedHistory,i.richLanguage,i.history,i.rangeEditing,i.selectionEditing);
 else if(i.selectionEditing==="document-v1")checkDocumentCheckpoint(input,i.room,i.writer,i.richLanguage,i.history);
 else checkCheckpoint(input,i.room,i.writer,i.richLanguage,i.history,i.rangeEditing);
}
interface Archive {format:"breditor/shared-segmented-history-session";formatVersion:1|2;family:ReturnType<typeof familyFor>;rootGeneration:string;rootCheckpoint:string;sealed:string[];active:string;continuedAfter?:number}
function id(value:unknown):asserts value is string{if(typeof value!=="string"||!value||bytes(value)>1024)throw fail();}
export function checkSegmentedCheckpoint(input:string,identity:SegmentedSessionIdentity,version:1|2=1):Archive {
 const continued=version===2;
 checkSegmentedIdentity(identity);if(typeof input!=="string"||bytes(input)>(continued?MAX_CONTINUED_ARCHIVE_BYTES:MAX_SEGMENTED_ARCHIVE_BYTES))throw fail();
 const keys=continued?"active,continuedAfter,family,format,formatVersion,rootCheckpoint,rootGeneration,sealed":"active,family,format,formatVersion,rootCheckpoint,rootGeneration,sealed";
 const a=object(JSON.parse(input),keys) as unknown as Archive;
 if(a.format!=="breditor/shared-segmented-history-session"||a.formatVersion!==version||JSON.stringify(object(a.family,"natural,reviewed,scope,search"))!==JSON.stringify(familyFor(identity))||typeof a.rootCheckpoint!=="string"||bytes(a.rootCheckpoint)>MAX_CHECKPOINT_BYTES||!Array.isArray(a.sealed)||a.sealed.length>(continued?254:62)||a.sealed.some(s=>typeof s!=="string")||typeof a.active!=="string")throw fail();
 if(continued&&(!Number.isSafeInteger(a.continuedAfter)||a.continuedAfter!<1||a.continuedAfter!>63||a.continuedAfter!>a.sealed.length))throw fail();
 id(a.rootGeneration);checkSegmentedRoot(a.rootCheckpoint,identity);
 // The outer envelope contains strings and small closed policy fields only. Do NOT stringify
 // segment bodies: their original native effect/property numbers can exceed JS safe integers.
 if(JSON.stringify({format:a.format,formatVersion:a.formatVersion,family:familyFor(identity),rootGeneration:a.rootGeneration,rootCheckpoint:a.rootCheckpoint,sealed:a.sealed,active:a.active,...(continued?{continuedAfter:a.continuedAfter}:{})})!==input)throw fail();
 let start=rootEntries(a).length;const ids=new Set([a.rootGeneration]);
 for(const [index,json]of [...a.sealed,a.active].entries()){
  const s=readSegment(json);id(s["generation"]);if(ids.has(s["generation"])||s["start"]!==start||(index<a.sealed.length&&index+1!==a.continuedAfter&&(s["entries"] as unknown[]).length===0))throw fail();ids.add(s["generation"]);start+=(s["entries"] as unknown[]).length;
 }
 return a;
}
function rootEntries(a:Archive):unknown[]{const r=JSON.parse(a.rootCheckpoint) as Record<string,unknown>,j=(a.family.natural||a.family.reviewed||a.family.search?r["journal"]:r) as Record<string,unknown>;if(!j||!Array.isArray(j["entries"])||j["entries"].length>1000)throw fail();return j["entries"];}
function readSegment(json:string):Record<string,unknown>{
 if(typeof json!=="string"||bytes(json)>MAX_CHECKPOINT_BYTES)throw fail();
 const s=object(JSON.parse(json),"entries,format,formatVersion,generation,joins,parentGeneration,parentSha256,publication,start,ui");
 if(s["format"]!=="breditor/shared-history-segment"||s["formatVersion"]!==1||!Number.isSafeInteger(s["start"])||Number(s["start"])<0||!Array.isArray(s["entries"])||s["entries"].length>1000||!Array.isArray(s["joins"])||s["joins"].length>1000||typeof s["publication"]!=="string"||!/^(0|[1-9]\d{0,19})$/.test(s["publication"])||BigInt(s["publication"])>18446744073709551615n)throw fail();
 return s;
}
export async function segmentedDigest(input:string):Promise<string>{const data=new TextEncoder().encode(input);const hash=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,"0")).join("");}
/** Verify exact byte hashes/links without rewriting a native record or inferring any old format. */
export async function splitSegmentedCheckpoint(input:string,identity:SegmentedSessionIdentity,version:1|2=1):Promise<{archive:Archive;files:SegmentedFile[]}> {
 const archive=checkSegmentedCheckpoint(input,identity,version),files:SegmentedFile[]=[{generation:archive.rootGeneration,sha256:await segmentedDigest(archive.rootCheckpoint),kind:"root",json:archive.rootCheckpoint}];
 let parent=files[0]!;
 for(const json of [...archive.sealed,archive.active]){const s=readSegment(json);if(s["parentGeneration"]!==parent.generation||s["parentSha256"]!==parent.sha256)throw fail();const next:SegmentedFile={generation:s["generation"] as string,sha256:await segmentedDigest(json),kind:"sealed",json};files.push(next);parent=next;}
 files.pop();return{archive,files}; // The active segment lives atomically in the head, not as a sealed file.
}
