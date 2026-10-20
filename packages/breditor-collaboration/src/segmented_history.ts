/** Explicit new native recovery capability. Metadata never supplies writer/storage authority. */
import {SharedEditorError} from "./core.js";
export interface SharedSegmentedHistoryInfo {
 readonly rootGeneration:string;readonly activeGeneration:string;readonly sealedGenerations:number;
 readonly retainedEntries:number;readonly activeEntries:number;readonly undoItems:number;readonly redoItems:number;
}
export interface SharedSegmentedRustCapability {
 segmented_history_version?():string;segmented_history_enabled?():boolean;
 segmented_history_info_json?():string;segmented_checkpoint?():string;
 enable_segmented_history?(observation:unknown,root:string,active:string):void;
 seal_history_segment?(observation:unknown,next:string):void;
 verify_segmented_recovery_origin?(observation:unknown,origin:SharedSegmentedRustCapability,originObservation:unknown):void;
}
/** A detached bounded native read, not a serialized admission proof or lease. */
export function parseSegmentedHistoryInfo(input:string):Readonly<SharedSegmentedHistoryInfo>|null {
 const fail=()=>new SharedEditorError("segmented_history_read","Invalid native generation information");
 if(typeof input!=="string"||input.length>8192)throw fail();
 const value:unknown=JSON.parse(input);if(value===null)return null;
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!=="activeEntries,activeGeneration,redoItems,retainedEntries,rootGeneration,sealedGenerations,undoItems")throw fail();
 const v=value as SharedSegmentedHistoryInfo;
 if(typeof v.rootGeneration!=="string"||!v.rootGeneration||typeof v.activeGeneration!=="string"||!v.activeGeneration||v.rootGeneration===v.activeGeneration||![v.sealedGenerations,v.retainedEntries,v.activeEntries,v.undoItems,v.redoItems].every(n=>Number.isSafeInteger(n)&&n>=0)||v.sealedGenerations<1||v.sealedGenerations>63||v.retainedEntries>64000||v.activeEntries>1000||v.activeEntries>v.retainedEntries||v.undoItems>1000||v.redoItems>1000)throw fail();
 return Object.freeze({...v});
}
