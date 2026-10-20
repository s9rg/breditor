/** Admission of outer record shapes/bounds only. Actual native replay still precedes recovery. */
import {checkSegmentedCapture} from "../persistence/segmented_head.js";
import {MAX_SEGMENTED_ARCHIVE_BYTES} from "../persistence/segmented_contract.js";
import {SegmentedRelayCompanion} from "../segmented_relay/companion.js";
import {SegmentedRetainedCompanion} from "../segmented_relay/retained_companion.js";
import {relayProgress} from "../segmented_relay/validation.js";
import type {SharedSegmentedRetainedRecovery,SharedSegmentedRetainedSessionOptions,SegmentedRetainedRecords} from "../segmented_relay/retained_contract.js";
import type {SharedSegmentedRelayRecovery} from "../segmented_relay/contract.js";
import type {SharedSegmentedRecovery} from "../persistence/segmented_session.js";
import {MAX_GENERATION_SOURCE_BYTES,MAX_GENERATION_SOURCE_RECORDS,type SharedGenerationSourceIdentity,type SharedGenerationSourceRecord,type SharedGenerationSourceRecordKind} from "./contract.js";
import {sourceFailure,generationFields,SharedGenerationSourceError} from "./identity.js";
export type SharedGenerationRecovery=SharedSegmentedRecovery|SharedSegmentedRelayRecovery|SharedSegmentedRetainedRecovery;
export const generationRecordLimit=(kind:SharedGenerationSourceRecordKind):number=>kind==="document"?MAX_SEGMENTED_ARCHIVE_BYTES:kind==="review"?16*1024*1024:kind==="local-version"?4*1024*1024:kind==="relay"?16*1024:32*1024*1024;
export function checkGenerationRecords(identity:SharedGenerationSourceIdentity,input:readonly SharedGenerationSourceRecord[]):{source:SharedSegmentedRecovery;companion:SegmentedRelayCompanion|undefined;recovery:SharedGenerationRecovery}{
 if(!Array.isArray(input)||input.length<1||input.length>MAX_GENERATION_SOURCE_RECORDS)throw sourceFailure();let at=0,total=0;
 const take=(kind:SharedGenerationSourceRecordKind,index=0):string=>{const r=input[at++];if(!generationFields(r,"index,json,kind")||r["kind"]!==kind||r["index"]!==index||typeof r["json"]!=="string"||!r["json"])throw sourceFailure();const json=r["json"],bytes=new TextEncoder().encode(json);if(bytes.length>generationRecordLimit(kind)||new TextDecoder("utf-8",{fatal:true}).decode(bytes)!==json)throw new SharedGenerationSourceError("generation_source_budget","Generation source record exceeds its unchanged nested budget");total+=bytes.length;if(total>MAX_GENERATION_SOURCE_BYTES)throw sourceFailure();return json;};
 const checkpoint=take("document"),reviewCheckpoint=identity.review?take("review"):null,versions:string[]=[];
 while(input[at]?.kind==="local-version"){if(versions.length>=32)throw sourceFailure();versions.push(take("local-version",versions.length));}
 checkSegmentedCapture(checkpoint,identity.native,identity.review?{...identity.review,checkpoint:reviewCheckpoint!}:null,versions);
 const source:SharedSegmentedRecovery={format:"breditor/shared-generation-recovery",formatVersion:1,checkpoint,reviewCheckpoint,versions};
 if(identity.kind==="local"){if(at!==input.length)throw sourceFailure();return {source,companion:undefined,recovery:source};}
 const relay=relayProgress(JSON.parse(take("relay")),identity.relay!),options={...identity.native,review:identity.review?{...identity.review,access:"read_only"}:undefined,binding:identity.relay,retained:identity.retained} as unknown as SharedSegmentedRetainedSessionOptions;
 if(identity.kind==="relay"){if(at!==input.length)throw sourceFailure();return {source,companion:new SegmentedRelayCompanion(options,relay),recovery:{format:"breditor/shared-relay-generation-recovery",formatVersion:1,source,relay}};}
 const retained:SegmentedRetainedRecords={suggestions:null,revisions:null,versions:null};
 for(const kind of ["suggestions","revisions","versions"] as const)if(identity.retained![kind]!==null)retained[kind]=JSON.parse(take(kind));
 if(at!==input.length)throw sourceFailure();const companion=new SegmentedRetainedCompanion(options,{relay,retainedBinding:identity.retained!,retained}),admitted=companion.records();
 for(const kind of ["suggestions","revisions","versions"] as const)if(retained[kind]!==null&&JSON.stringify(retained[kind])!==JSON.stringify(admitted[kind]))throw sourceFailure();
 return {source,companion,recovery:{format:"breditor/shared-relay-generation-retained-recovery",formatVersion:1,source,relay,retainedBinding:identity.retained!,retained:admitted}};
}
