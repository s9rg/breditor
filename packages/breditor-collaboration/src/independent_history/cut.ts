/** Closed metadata admission and exact native file custody. Rust still replays both complete lanes. */
import {SharedEditorError} from '../core.js';
import {canonicalSegmentedIdentity} from '../persistence/segmented_head.js';
import {checkSegmentedRoot,splitSegmentedCheckpoint,object,familyFor} from '../persistence/segmented_checkpoint.js';
import {MAX_INDEPENDENT_HISTORY_HEAD_BYTES,type IndependentHistoryIdentity,type IndependentHistoryHead,type IndependentHistoryStoredLane,type IndependentHistoryFile,type IndependentHistoryCut,type IndependentHistoryLane} from './contract.js';
import {checkOriginalReview,joinReviewArchive,splitReviewArchive} from './review_archive.js';
const bytes=(input:string)=>new TextEncoder().encode(input).byteLength;
const fail=()=>new SharedEditorError('independent_history_cut','Native histories differ from their explicitly selected paired-storage identity or bounds');
const generation=(input:unknown):input is string=>typeof input==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input);
const keys=(value:unknown,expected:string)=>object(value,expected);
export function canonicalIndependentHistoryIdentity(input:IndependentHistoryIdentity):IndependentHistoryIdentity {
 keys(input,'documentHistory,native,review,reviewHistory');keys(input.review,'actor,principal');
 if(!['original','segmented-v1'].includes(input.documentHistory)||!['original','segmented-v1'].includes(input.reviewHistory)||!generation(input.review.actor)||typeof input.review.principal!=='string'||!input.review.principal.trim()||bytes(input.review.principal)>256||/[\u0000-\u001f\u007f-\u009f]/u.test(input.review.principal)||input.native.reviewedHistory&&input.native.reviewedHistory.principal!==input.review.principal)throw fail();
 return{native:canonicalSegmentedIdentity(input.native),documentHistory:input.documentHistory,reviewHistory:input.reviewHistory,review:{actor:input.review.actor,principal:input.review.principal}};
}
function checkStoredLane(input:IndependentHistoryStoredLane,kind:'original'|'segmented-v1',identity:IndependentHistoryIdentity,lane:IndependentHistoryLane):void {
 keys(input,kind==='original'?'checkpoint,kind':'active,kind,root,sealed');if(input.kind!==kind)throw fail();
 if(input.kind==='original'){if(lane==='document')checkSegmentedRoot(input.checkpoint,identity.native);else checkOriginalReview(input.checkpoint,identity);return;}
 if(typeof input.active!=='string'||bytes(input.active)>16*1024*1024||!Array.isArray(input.sealed)||input.sealed.length>62)throw fail();
 const ids=new Set<string>();for(const reference of [input.root,...input.sealed]){keys(reference,'generation,sha256');if(typeof reference.generation!=='string'||!reference.generation||bytes(reference.generation)>1024||lane==='review'&&!generation(reference.generation)||ids.has(reference.generation)||typeof reference.sha256!=='string'||!(lane==='review'?/^sha256:[a-f0-9]{64}$/:/^[a-f0-9]{64}$/).test(reference.sha256))throw fail();ids.add(reference.generation);}
}
export function readIndependentHistoryHead(input:string):IndependentHistoryHead {
 if(typeof input!=='string'||bytes(input)>MAX_INDEPENDENT_HISTORY_HEAD_BYTES)throw fail();const h=keys(JSON.parse(input),'document,format,formatVersion,identity,review,versions') as unknown as IndependentHistoryHead;
 if(h.format!=='breditor/shared-independent-history-head'||h.formatVersion!==1)throw fail();const identity=canonicalIndependentHistoryIdentity(h.identity);if(JSON.stringify(identity)!==JSON.stringify(h.identity))throw fail();
 checkStoredLane(h.document,identity.documentHistory,identity,'document');checkStoredLane(h.review,identity.reviewHistory,identity,'review');
 if(!Array.isArray(h.versions)||h.versions.length>32||h.versions.some(packet=>typeof packet!=='string'||bytes(packet)>4*1024*1024)||JSON.stringify(h)!==input)throw fail();return h;
}
export async function makeIndependentHistoryCut(documentCheckpoint:string,reviewCheckpoint:string,inputIdentity:IndependentHistoryIdentity,versions:readonly string[]):Promise<IndependentHistoryCut>{
 const identity=canonicalIndependentHistoryIdentity(inputIdentity);let document:IndependentHistoryStoredLane,review:IndependentHistoryStoredLane;const files:IndependentHistoryFile[]=[];
 if(identity.documentHistory==='original'){checkSegmentedRoot(documentCheckpoint,identity.native);document={kind:'original',checkpoint:documentCheckpoint};}
 else{const split=await splitSegmentedCheckpoint(documentCheckpoint,identity.native);files.push(...split.files.map(file=>({lane:'document' as const,...file})));const refs=split.files.map(({generation,sha256})=>({generation,sha256}));document={kind:'segmented-v1',root:refs[0]!,sealed:refs.slice(1),active:split.archive.active};}
 if(identity.reviewHistory==='original'){checkOriginalReview(reviewCheckpoint,identity);review={kind:'original',checkpoint:reviewCheckpoint};}
 else{const split=await splitReviewArchive(reviewCheckpoint,identity,1);review={kind:'segmented-v1',root:split.root,sealed:split.sealed,active:split.active};files.push(...split.files);}
 const head=JSON.stringify({format:'breditor/shared-independent-history-head',formatVersion:1,identity,document,review,versions:[...versions]});readIndependentHistoryHead(head);return{head,files};
}
/** Rebuild only outer records from exact strings after one-transaction head/file reads. */
export function joinIndependentHistoryLane(head:IndependentHistoryHead,lane:IndependentHistoryLane,files:readonly IndependentHistoryFile[]):string {
 const selected=head[lane];if(selected.kind==='original')return selected.checkpoint;
 const byId=new Map(files.filter(file=>file.lane===lane).map(file=>[file.generation,file])),root=byId.get(selected.root.generation);if(!root||root.kind!=='root'||root.sha256!==selected.root.sha256)throw fail();
 const sealed=selected.sealed.map(reference=>{const file=byId.get(reference.generation);if(!file||file.kind!=='sealed'||file.sha256!==reference.sha256)throw fail();return file.json;});
 return lane==='document'?JSON.stringify({format:'breditor/shared-segmented-history-session',formatVersion:1,family:familyFor(head.identity.native),rootGeneration:root.generation,rootCheckpoint:root.json,sealed,active:selected.active}):joinReviewArchive(1,root.generation,root.json,sealed,selected.active);
}
