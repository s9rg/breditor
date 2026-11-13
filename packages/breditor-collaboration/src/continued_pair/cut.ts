/** Store opaque native strings under lane-specific file hashes and one closed paired head. */
import {SharedEditorError} from '../core.js';
import {checkSegmentedRoot,familyFor,object,splitSegmentedCheckpoint} from '../persistence/segmented_checkpoint.js';
import {canonicalSegmentedIdentity} from '../persistence/segmented_head.js';
import {checkOriginalReview,joinReviewArchive,splitReviewArchive} from '../independent_history/review_archive.js';
import type {IndependentHistoryCut,IndependentHistoryFile,IndependentHistoryLane} from '../independent_history/contract.js';
import type {PairedHistoryStore} from '../independent_history/database.js';
import type {ContinuedPairHead,ContinuedPairHistoryKind,ContinuedPairIdentity,ContinuedPairStoredLane} from './contract.js';

const bytes=(value:string)=>new TextEncoder().encode(value).byteLength;
const maxHeadBytes=320*1024*1024; // Two escaped active files and up to 32 escaped version packets.
const fail=()=>new SharedEditorError('continued_pair_cut','Invalid continued paired history or storage identity');
const historyKind=(kind:unknown):kind is ContinuedPairHistoryKind=>kind==='original'||kind==='segmented-v1'||kind==='continued-v2';
const reviewId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);

export function canonicalContinuedPairIdentity(input:ContinuedPairIdentity):ContinuedPairIdentity{
 object(input,'documentHistory,native,review,reviewHistory');
 object(input.review,'actor,principal');
 const {documentHistory,reviewHistory,review:{actor,principal}}=input;
 if(!historyKind(documentHistory)||!historyKind(reviewHistory)||documentHistory!=='continued-v2'&&reviewHistory!=='continued-v2'||
    !reviewId(actor)||typeof principal!=='string'||!principal.trim()||bytes(principal)>256||/[\u0000-\u001f\u007f-\u009f]/u.test(principal))throw fail();
 const native=canonicalSegmentedIdentity(input.native);
 if(native.reviewedHistory&&native.reviewedHistory.principal!==principal)throw fail();
 return {native,documentHistory,reviewHistory,review:{actor,principal}};
}

function checkLane(lane:ContinuedPairStoredLane,kind:ContinuedPairHistoryKind,identity:ContinuedPairIdentity,name:IndependentHistoryLane):void{
 const continued=kind==='continued-v2';
 object(lane,kind==='original'?'checkpoint,kind':continued?'active,continuedAfter,kind,root,sealed':'active,kind,root,sealed');
 if(lane.kind!==kind)throw fail();
 if(lane.kind==='original'){
  if(name==='document')checkSegmentedRoot(lane.checkpoint,identity.native);
  else checkOriginalReview(lane.checkpoint,identity);
  return;
 }
 if(typeof lane.active!=='string'||bytes(lane.active)>16*1024*1024||!Array.isArray(lane.sealed)||lane.sealed.length>(continued?254:62))throw fail();
 if(lane.kind==='continued-v2'&&(!Number.isSafeInteger(lane.continuedAfter)||lane.continuedAfter<1||lane.continuedAfter>63||lane.continuedAfter>lane.sealed.length))throw fail();
 const ids=new Set<string>();
 for(const ref of [lane.root,...lane.sealed]){
  object(ref,'generation,sha256');
  const validId=name==='review'?reviewId(ref.generation):typeof ref.generation==='string'&&ref.generation.length>0&&bytes(ref.generation)<=1024;
  const hashPattern=name==='review'?/^sha256:[a-f0-9]{64}$/:/^[a-f0-9]{64}$/;
  if(!validId||ids.has(ref.generation)||typeof ref.sha256!=='string'||!hashPattern.test(ref.sha256))throw fail();
  ids.add(ref.generation);
 }
}
function readContinuedPairHead(input:string):ContinuedPairHead{
 if(typeof input!=='string'||bytes(input)>maxHeadBytes)throw fail();
 const head=object(JSON.parse(input),'document,format,formatVersion,identity,review,versions') as unknown as ContinuedPairHead;
 if(head.format!=='breditor/shared-independent-history-head'||head.formatVersion!==2)throw fail();
 if(JSON.stringify(canonicalContinuedPairIdentity(head.identity))!==JSON.stringify(head.identity))throw fail();
 checkLane(head.document,head.identity.documentHistory,head.identity,'document');
 checkLane(head.review,head.identity.reviewHistory,head.identity,'review');
 if(!Array.isArray(head.versions)||head.versions.length>32||head.versions.some(packet=>typeof packet!=='string'||bytes(packet)>4*1024*1024)||JSON.stringify(head)!==input)throw fail();
 return head;
}
export async function makeContinuedPairCut(documentCheckpoint:string,reviewCheckpoint:string,input:ContinuedPairIdentity,versions:readonly string[]):Promise<IndependentHistoryCut>{
 const identity=canonicalContinuedPairIdentity(input);
 const files:IndependentHistoryFile[]=[];
 let document:ContinuedPairStoredLane,review:ContinuedPairStoredLane;
 if(identity.documentHistory==='original'){
  checkSegmentedRoot(documentCheckpoint,identity.native);
  document={kind:'original',checkpoint:documentCheckpoint};
 }else{
  const version=identity.documentHistory==='continued-v2'?2:1;
  const result=await splitSegmentedCheckpoint(documentCheckpoint,identity.native,version);
  files.push(...result.files.map(file=>({lane:'document' as const,...file})));
  const refs=result.files.map(({generation,sha256})=>({generation,sha256}));
  const fields={root:refs[0]!,sealed:refs.slice(1),active:result.archive.active};
  document=version===2?{kind:'continued-v2',...fields,continuedAfter:result.archive.continuedAfter!}:{kind:'segmented-v1',...fields};
 }
 if(identity.reviewHistory==='original'){
  checkOriginalReview(reviewCheckpoint,identity);
  review={kind:'original',checkpoint:reviewCheckpoint};
 }else{
  const version=identity.reviewHistory==='continued-v2'?2:1;
  const result=await splitReviewArchive(reviewCheckpoint,identity,version);
  files.push(...result.files);
  const fields={root:result.root,sealed:result.sealed,active:result.active};
  review=version===2?{kind:'continued-v2',...fields,continuedAfter:result.continuedAfter!}:{kind:'segmented-v1',...fields};
 }
 const head=JSON.stringify({format:'breditor/shared-independent-history-head',formatVersion:2,identity,document,review,versions:[...versions]});
 readContinuedPairHead(head);
 return {head,files};
}
function joinContinuedPairLane(head:ContinuedPairHead,lane:IndependentHistoryLane,files:readonly IndependentHistoryFile[]):string{
 const selected=head[lane];
 if(selected.kind==='original')return selected.checkpoint;
 const byId=new Map(files.filter(file=>file.lane===lane).map(file=>[file.generation,file]));
 const root=byId.get(selected.root.generation);
 if(!root||root.kind!=='root'||root.sha256!==selected.root.sha256)throw fail();
 const sealed=selected.sealed.map(ref=>{
  const file=byId.get(ref.generation);
  if(!file||file.kind!=='sealed'||file.sha256!==ref.sha256)throw fail();
  return file.json;
 });
 const boundary=selected.kind==='continued-v2'?selected.continuedAfter:undefined;
 const version=boundary===undefined?1:2;
 if(lane==='review')return joinReviewArchive(version,root.generation,root.json,sealed,selected.active,boundary);
 return JSON.stringify({
  format:'breditor/shared-segmented-history-session',formatVersion:version,family:familyFor(head.identity.native),
  rootGeneration:root.generation,rootCheckpoint:root.json,sealed,active:selected.active,
  ...(boundary===undefined?{}:{continuedAfter:boundary}),
 });
}
export const continuedPairStore:PairedHistoryStore<ContinuedPairHead>=Object.freeze({
 names:['continued_pair_files','continued_pair_heads'] as const,
 readHead:readContinuedPairHead,
 join:joinContinuedPairLane,
 makeCut:(document:string,review:string,head:ContinuedPairHead)=>makeContinuedPairCut(document,review,head.identity,head.versions),
 wrapped:false,
});
