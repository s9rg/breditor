/** New atomic head with exact native string payloads; no JS reconstruction of native effects. */
import {SharedEditorError} from "../core.js";
import {object,checkSegmentedIdentity,checkSegmentedCheckpoint,familyFor,splitSegmentedCheckpoint} from "./segmented_checkpoint.js";
import {MAX_SEGMENTED_HEAD_BYTES,type SegmentedSessionIdentity,type SegmentedReview,type SegmentedCut,type SegmentedHead,type ContinuedHead,type GenerationHead} from "./segmented_contract.js";
const bytes=(s:string)=>new TextEncoder().encode(s).byteLength;
const fail=()=>new SharedEditorError("segmented_head","Invalid generation head or paired recovery identity");
export function canonicalSegmentedIdentity(i:SegmentedSessionIdentity):SegmentedSessionIdentity{
 checkSegmentedIdentity(i);const r=i.reviewedHistory;
 return {room:i.room,writer:i.writer,richLanguage:i.richLanguage,history:i.history,rangeEditing:i.rangeEditing,selectionEditing:i.selectionEditing,searchHistory:i.searchHistory,reviewedHistory:r?{binding:r.binding,principal:r.principal,effectWriter:r.effectWriter}:null};
}
export function readSegmentedHead(input:string):SegmentedHead {
 return readGenerationHead(input,1) as SegmentedHead;
}
export function readContinuedHead(input:string):ContinuedHead {
 return readGenerationHead(input,2) as ContinuedHead;
}
function readGenerationHead(input:string,version:1|2):GenerationHead {
 if(typeof input!=="string"||bytes(input)>MAX_SEGMENTED_HEAD_BYTES)throw fail();
 const keys=version===2?"active,continuedAfter,family,format,formatVersion,identity,review,root,sealed,versions":"active,family,format,formatVersion,identity,review,root,sealed,versions";
 const h=object(JSON.parse(input),keys) as unknown as GenerationHead;
 if(h.format!=="breditor/shared-generation-head"||h.formatVersion!==version||typeof h.active!=="string"||!Array.isArray(h.sealed)||h.sealed.length>(version===2?254:62)||!Array.isArray(h.versions)||h.versions.length>32||h.versions.some(p=>typeof p!=="string"||bytes(p)>4*1024*1024))throw fail();
 if(h.formatVersion===2&&(!Number.isSafeInteger(h.continuedAfter)||h.continuedAfter<1||h.continuedAfter>63||h.continuedAfter>h.sealed.length))throw fail();
 canonicalSegmentedIdentity(h.identity);if(JSON.stringify(h.family)!==JSON.stringify(familyFor(h.identity)))throw fail();
 const ids=new Set<string>();for(const r of [h.root,...h.sealed]){object(r,"generation,sha256");if(typeof r.generation!=="string"||!r.generation||ids.has(r.generation)||typeof r.sha256!=="string"||!/^[a-f0-9]{64}$/.test(r.sha256))throw fail();ids.add(r.generation);}
 if(h.review!==null){object(h.review,"actor,checkpoint,principal");const r=h.review;if(typeof r.actor!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(r.actor)||typeof r.principal!=="string"||!r.principal.trim()||bytes(r.principal)>256||/[\u0000-\u001f\u007f-\u009f]/u.test(r.principal)||typeof r.checkpoint!=="string"||bytes(r.checkpoint)>16*1024*1024)throw fail();
  const header=JSON.parse(r.checkpoint) as {format?:unknown;formatVersion?:unknown;actor?:unknown;principal?:unknown;binding?:{document?:unknown}}|null;
  if(!header||header.format!=="breditor/review-session"||header.formatVersion!==1||header.actor!==r.actor||header.principal!==r.principal||header.binding?.document!==h.identity.room||h.identity.reviewedHistory&&h.identity.reviewedHistory.principal!==r.principal)throw fail();
 }
 if(JSON.stringify(h)!==input)throw fail();return h;
}
export async function makeSegmentedCut(checkpoint:string,identity:SegmentedSessionIdentity,review:SegmentedReview|null,versions:readonly string[]):Promise<SegmentedCut>{
 return makeGenerationCut(checkpoint,identity,review,versions,1);
}
export async function makeGenerationCut(checkpoint:string,identity:SegmentedSessionIdentity,review:SegmentedReview|null,versions:readonly string[],version:1|2):Promise<SegmentedCut>{
 const {archive,files}=await splitSegmentedCheckpoint(checkpoint,identity,version);
 const refs=files.map(({generation,sha256})=>({generation,sha256}));
 const h={format:"breditor/shared-generation-head",formatVersion:version,identity:canonicalSegmentedIdentity(identity),family:archive.family,root:refs[0]!,sealed:refs.slice(1),active:archive.active,review:review?{...review}:null,versions:[...versions],...(version===2?{continuedAfter:archive.continuedAfter}:{})};
 const head=JSON.stringify(h);readGenerationHead(head,version);return {head,files};
}
/** Exact encoded-head budget before a local catalog mutation; hash placeholders have equal byte width. */
export function checkSegmentedCapture(checkpoint:string,identity:SegmentedSessionIdentity,review:SegmentedReview|null,versions:readonly string[],version:1|2=1):void{
 readGenerationHead(previewSegmentedHead(checkpoint,identity,review,versions,version),version);
}
/** Native strings remain opaque; only bounded metadata and equal-width hash placeholders are built. */
export function previewSegmentedHead(checkpoint:string,identity:SegmentedSessionIdentity,review:SegmentedReview|null,versions:readonly string[],version:1|2=1):string{
 const a=checkSegmentedCheckpoint(checkpoint,identity,version),sha256="0".repeat(64),root={generation:a.rootGeneration,sha256},sealed=a.sealed.map(json=>({generation:(JSON.parse(json) as {generation:string}).generation,sha256}));
 return JSON.stringify({format:"breditor/shared-generation-head",formatVersion:version,identity:canonicalSegmentedIdentity(identity),family:a.family,root,sealed,active:a.active,review,versions,...(version===2?{continuedAfter:a.continuedAfter}:{})});
}
