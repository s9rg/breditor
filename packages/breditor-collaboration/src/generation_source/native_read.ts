/** Canonical borrowed reads for a genuine captured generation owner. No mutable
 * core, storage, lease, edit or transport capability escapes through this view. */
import {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedCapturedRecoveryRead} from "../asset_references_capture.js";

export function generationNativeRead(core:SharedRichEditor<SharedSelectionPolicy>):SharedCapturedRecoveryRead {
 const {descriptor,checkpointJson,writerClock,writerClockV2,writerGroups,writerGroupsV2,reviewWriterClock,reviewCheckpoint,localReviewClock}=SharedRichEditor.prototype;
 return Object.freeze({
  descriptor:()=>descriptor.call(core),checkpointJson:()=>checkpointJson.call(core),
  writerClock:(writer:string)=>writerClock.call(core,writer),writerClockV2:(writer:string)=>writerClockV2.call(core,writer),
  writerGroups:(after:string)=>writerGroups.call(core,after),writerGroupsV2:(after:string)=>writerGroupsV2.call(core,after),
  reviewWriterClock:(actor:string,principal:string,through?:string)=>reviewWriterClock.call(core,actor,principal,through),
  reviewCheckpoint:()=>reviewCheckpoint.call(core),localReviewClock:()=>localReviewClock.call(core),
 });
}
