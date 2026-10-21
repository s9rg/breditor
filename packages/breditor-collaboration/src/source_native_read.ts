/** Canonical facade intrinsics captured before application callbacks can replace public reads.
 * These borrowed functions grant no edit, storage, transport, transfer or activation capability.
 * The host still supplies the trusted matching native module; this is not a JavaScript sandbox. */
import {SharedRichEditor} from './core.js';
import type {SharedSelectionPolicy} from './types.js';
import type {SharedCapturedRecoveryRead} from './asset_references_capture.js';
const p=SharedRichEditor.prototype;
export const sourceCoreMethods=Object.freeze({
 segmentedHistoryPolicy:p.segmentedHistoryPolicy,supportsRetainedAssetReferences:p.supportsRetainedAssetReferences,supportsPacketAssetReferences:p.supportsPacketAssetReferences,
 retainedAssetReferences:p.retainedAssetReferences,checkRetainedAssetReferences:p.checkRetainedAssetReferences,
 versionAssetReferences:p.versionAssetReferences,suggestionAssetReferences:p.suggestionAssetReferences,suggestionRevisionAssetReferences:p.suggestionRevisionAssetReferences,checkPacketAssetReferences:p.checkPacketAssetReferences,
 checkpointJson:p.checkpointJson,readVersion:p.readVersion,
});
const {descriptor,checkpointJson,writerClock,writerClockV2,writerGroups,writerGroupsV2,reviewWriterClock,reviewCheckpoint,localReviewClock}=p;
export function sourceNativeRecoveryRead<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>):SharedCapturedRecoveryRead{
 return Object.freeze({
  descriptor:()=>descriptor.call(core),checkpointJson:()=>checkpointJson.call(core),
  writerClock:(writer:string)=>writerClock.call(core,writer),writerClockV2:(writer:string)=>writerClockV2.call(core,writer),
  writerGroups:(after:string)=>writerGroups.call(core,after),writerGroupsV2:(after:string)=>writerGroupsV2.call(core,after),
  reviewWriterClock:(actor:string,principal:string,through?:string)=>reviewWriterClock.call(core,actor,principal,through),
  reviewCheckpoint:()=>reviewCheckpoint.call(core),localReviewClock:()=>localReviewClock.call(core),
 });
}
