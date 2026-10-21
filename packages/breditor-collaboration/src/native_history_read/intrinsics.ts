/** Matching facade intrinsics, captured before application read overrides. Not a JS sandbox. */
import {SharedRichEditor} from '../core.js';
const p=SharedRichEditor.prototype;
export const nativeHistoryIntrinsics=Object.freeze({
 descriptor:p.descriptor,checkpointJson:p.checkpointJson,
 documentKind:p.segmentedHistoryPolicy,reviewKind:p.reviewHistoryPolicy,
 writerClock:p.writerClock,writerClockV2:p.writerClockV2,
 writerGroups:p.writerGroups,writerGroupsV2:p.writerGroupsV2,
 reviewCheckpoint:p.reviewCheckpoint,reviewSegmentedCheckpoint:p.reviewSegmentedCheckpoint,
 reviewWriterClock:p.reviewWriterClock,localReviewClock:p.localReviewClock,
});
