/** Closed new generation-storage family; no original journal/database budget is increased. */
import type {SharedHistoryPolicy,SharedRangePolicy,SharedSelectionPolicy} from "../types.js";
import type {SharedReviewedHistoryIdentity} from "../reviewed_history_types.js";
export const MAX_SEGMENTED_ARCHIVE_BYTES=64*1024*1024;
export const MAX_SEGMENTED_HEAD_BYTES=128*1024*1024;
export interface SegmentedSessionIdentity {
 room:string;writer:string;richLanguage:1|2|3;history:SharedHistoryPolicy;
 rangeEditing:SharedRangePolicy;selectionEditing:SharedSelectionPolicy;
 searchHistory:"search-v1"|null;reviewedHistory:SharedReviewedHistoryIdentity|null;
}
export interface SegmentedFile {generation:string;sha256:string;kind:"root"|"sealed";json:string}
export interface SegmentedReference {generation:string;sha256:string}
export interface SegmentedReview {actor:string;principal:string;checkpoint:string}
export interface SegmentedHead {
 format:"breditor/shared-generation-head";formatVersion:1;identity:SegmentedSessionIdentity;
 family:{scope:"original"|"general-v1"|"document-v1";natural:boolean;reviewed:boolean;search:boolean};
 root:SegmentedReference;sealed:SegmentedReference[];active:string;
 review:SegmentedReview|null;versions:string[];
}
export interface SegmentedCut {head:string;files:readonly SegmentedFile[]}
export interface SegmentedStoredCut extends SegmentedCut {checkpoint:string;record:SegmentedHead}
