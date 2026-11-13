/** Closed, separately bounded records for the two native continued-history cuts. */
import {MAX_CONTINUED_ARCHIVE_BYTES,MAX_SEGMENTED_ARCHIVE_BYTES} from "../persistence/segmented_contract.js";
import {checkSegmentedCapture} from "../persistence/segmented_head.js";
import {checkSegmentedCheckpoint} from "../persistence/segmented_checkpoint.js";
import type {SharedSegmentedRecovery} from "../persistence/segmented_session.js";
import type {SharedContinuedHistoryBackup} from "../persistence/continue_document_history.js";
import type {SharedGenerationSourceIdentity,SharedGenerationSourceRecord,SharedGenerationSourceRecordKind} from "./contract.js";
import {sourceFailure} from "./identity.js";

// Native document, predecessor, two reviews and the current version catalog.
// The predecessor's versions are the exact initial prefix of that catalog.
export const MAX_CONTINUED_SOURCE_BYTES=480*1024*1024+2;
export const MAX_CONTINUED_SOURCE_RECORDS=37;
export const continuedRecordLimits={
 document:MAX_CONTINUED_ARCHIVE_BYTES,
 review:16*1024*1024,
 "local-version":4*1024*1024,
 "predecessor-document":MAX_SEGMENTED_ARCHIVE_BYTES,
 "predecessor-review":16*1024*1024,
 "predecessor-versions":2,
} as const;
export function continuedRecords(backup:SharedContinuedHistoryBackup):readonly SharedGenerationSourceRecord[]{
 const {current,predecessor}=backup;
 const rows:SharedGenerationSourceRecord[]=[{kind:"document",index:0,json:current.checkpoint}];
 if(current.reviewCheckpoint!==null)rows.push({kind:"review",index:0,json:current.reviewCheckpoint});
 current.versions.forEach((json,index)=>rows.push({kind:"local-version",index,json}));
 rows.push({kind:"predecessor-document",index:0,json:predecessor.checkpoint});
 if(predecessor.reviewCheckpoint!==null)rows.push({kind:"predecessor-review",index:0,json:predecessor.reviewCheckpoint});
 rows.push({kind:"predecessor-versions",index:0,json:String(predecessor.versions.length)});
 return Object.freeze(rows.map(row=>Object.freeze(row)));
}
export function readContinuedRecords(
 identity:SharedGenerationSourceIdentity,input:readonly SharedGenerationSourceRecord[],
 take:(kind:SharedGenerationSourceRecordKind,index?:number)=>string,
 position:()=>number,
):SharedContinuedHistoryBackup{
 const checkpoint=take("document"),reviewCheckpoint=identity.review?take("review"):null,versions:string[]=[];
 while(input[position()]?.kind==="local-version"){
  if(versions.length>=32)throw sourceFailure();
  versions.push(take("local-version",versions.length));
 }
 const previousDocument=take("predecessor-document"),previousReview=identity.review?take("predecessor-review"):null;
 const count=take("predecessor-versions");
 if(!/^(0|[1-9][0-9]?)$/.test(count)||Number(count)>versions.length||position()!==input.length)throw sourceFailure();
 const previousVersions=versions.slice(0,Number(count)),account=identity.review;
 checkSegmentedCapture(checkpoint,identity.native,account?{...account,checkpoint:reviewCheckpoint!}:null,versions,2);
 checkSegmentedCapture(previousDocument,identity.native,account?{...account,checkpoint:previousReview!}:null,previousVersions);
 const current=checkSegmentedCheckpoint(checkpoint,identity.native,2),predecessor=checkSegmentedCheckpoint(previousDocument,identity.native);
 if(current.rootGeneration!==predecessor.rootGeneration||current.rootCheckpoint!==predecessor.rootCheckpoint||
    current.continuedAfter!==predecessor.sealed.length+1||
    predecessor.sealed.some((file,i)=>current.sealed[i]!==file)||
    current.sealed[predecessor.sealed.length]!==predecessor.active)throw sourceFailure();
 return {format:"breditor/shared-continued-history-backup",formatVersion:1,
  current:{format:"breditor/shared-generation-recovery",formatVersion:2,checkpoint,reviewCheckpoint,versions},
  predecessor:{format:"breditor/shared-generation-recovery",formatVersion:1,
   checkpoint:previousDocument,reviewCheckpoint:previousReview,versions:previousVersions}};
}

/** Compare exact native strings, including the historical comment and version cuts. */
export function samePredecessor(a:SharedSegmentedRecovery,b:SharedSegmentedRecovery):boolean{
 return a.checkpoint===b.checkpoint&&a.reviewCheckpoint===b.reviewCheckpoint&&
  a.versions.length===b.versions.length&&a.versions.every((packet,index)=>packet===b.versions[index]);
}
