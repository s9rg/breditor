/** Closed nonsecret policy metadata. A parsed identity is not a factory, lease or permission. */
import {canonicalSegmentedIdentity} from "../persistence/segmented_head.js";
import {SegmentedRelayCompanion} from "../segmented_relay/companion.js";
import {SegmentedRetainedCompanion} from "../segmented_relay/retained_companion.js";
import {relayBinding} from "../segmented_relay/validation.js";
import type {SharedSegmentedRetainedSessionOptions} from "../segmented_relay/retained_contract.js";
import type {SharedGenerationSourceIdentity} from "./contract.js";
import {MAX_GENERATION_SOURCE_IDENTITY_BYTES} from "./contract.js";
export class SharedGenerationSourceError extends Error {
 constructor(readonly code:"generation_source_policy"|"generation_source_changed"|"generation_source_budget"|"generation_source_closed",message:string){super(message);this.name="SharedGenerationSourceError";}
}
export const sourceFailure=()=>new SharedGenerationSourceError("generation_source_policy","Select the complete exact generation source policy");
/** Exact enumerable JSON field names; commas inside a name cannot stand for missing fields. */
export function generationFields(value:unknown,fields:string):value is Record<string,unknown>{const names=fields.split(",");return !!value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name));}
/** Bounded closed source identity plus historical review account, never current editing policy. */
export function generationIdentity(input:unknown):Readonly<SharedGenerationSourceIdentity>{
 try{
  if(!generationFields(input,"kind,native,relay,retained,review"))throw sourceFailure();const v=input as unknown as SharedGenerationSourceIdentity;
  if(!["local","relay","retained","continued-local"].includes(v.kind)||new TextEncoder().encode(JSON.stringify(v)).length>MAX_GENERATION_SOURCE_IDENTITY_BYTES)throw sourceFailure();
  const native=canonicalSegmentedIdentity(v.native);let review=null;
  if(v.review!==null){if(!generationFields(v.review,"actor,principal"))throw sourceFailure();const {actor,principal}=v.review;if(typeof actor!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(actor)||typeof principal!=="string"||!principal.trim()||new TextEncoder().encode(principal).length>256||/[\u0000-\u001f\u007f-\u009f]/u.test(principal)||new TextDecoder("utf-8",{fatal:true}).decode(new TextEncoder().encode(principal))!==principal)throw sourceFailure();review={actor,principal};}
  if(native.reviewedHistory&&native.reviewedHistory.principal!==review?.principal)throw sourceFailure();
  if(v.kind==="local"||v.kind==="continued-local"){if(v.relay!==null||v.retained!==null)throw sourceFailure();return freezeGeneration({kind:v.kind,native,review,relay:null,retained:null});}
  if(v.relay===null||v.kind==="retained"&&v.retained===null||v.kind==="relay"&&v.retained!==null)throw sourceFailure();const relay=relayBinding(v.relay),options={...native,review:review?{...review,access:"read_only"}:undefined,binding:relay,retained:v.retained} as unknown as SharedSegmentedRetainedSessionOptions;
  const companion=v.kind==="retained"?new SegmentedRetainedCompanion(options):new SegmentedRelayCompanion(options);
  return freezeGeneration({kind:v.kind,native,review,relay,retained:companion instanceof SegmentedRetainedCompanion?companion.retainedBinding:null});
 }catch{throw sourceFailure();}
}
/** Metadata contains only closed JSON data. Freeze a detached copy, not a source's live state. */
export function freezeGeneration<T>(input:T):Readonly<T>{const value=structuredClone(input);const freeze=(v:unknown):void=>{if(v&&typeof v==="object"){for(const item of Object.values(v))freeze(item);Object.freeze(v);}};freeze(value);return value;}
