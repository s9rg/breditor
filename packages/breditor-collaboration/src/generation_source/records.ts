/** Separate bounded payloads retain original checkpoint/packet strings without numeric reconstruction. */
import type {SharedSegmentedRecovery} from "../persistence/segmented_session.js";
import type {SharedSegmentedRelayProgress} from "../segmented_relay/contract.js";
import type {SegmentedRetainedRecords} from "../segmented_relay/retained_contract.js";
import type {SharedGenerationSourceRecord} from "./contract.js";
export function generationRecords(source:SharedSegmentedRecovery,relay?:SharedSegmentedRelayProgress,retained?:SegmentedRetainedRecords):readonly SharedGenerationSourceRecord[]{
 const rows:SharedGenerationSourceRecord[]=[{kind:"document",index:0,json:source.checkpoint}];
 if(source.reviewCheckpoint!==null)rows.push({kind:"review",index:0,json:source.reviewCheckpoint});
 source.versions.forEach((json,index)=>rows.push({kind:"local-version",index,json}));
 if(relay)rows.push({kind:"relay",index:0,json:JSON.stringify(relay)});
 if(retained)for(const kind of ["suggestions","revisions","versions"] as const)if(retained[kind]!==null)rows.push({kind,index:0,json:JSON.stringify(retained[kind])});
 return Object.freeze(rows.map(r=>Object.freeze(r)));
}
export function sameGenerationRecords(a:readonly SharedGenerationSourceRecord[],b:readonly SharedGenerationSourceRecord[]):boolean{return a.length===b.length&&a.every((r,i)=>r.kind===b[i]!.kind&&r.index===b[i]!.index&&r.json===b[i]!.json);}
