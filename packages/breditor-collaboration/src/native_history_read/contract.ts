/** Internal borrowed native history, never writable custody or a serialized grant. */
import type {SharedRichEditor} from '../core.js';

export type CapturedNativeHistoryKind='original'|'segmented-v1'|'continued-v2';
export type CapturedDocumentHistoryKind=CapturedNativeHistoryKind;
/** Native-only reads; enclosing check() validates the complete selected stores. */
export type CapturedDocumentHistoryRead=Readonly<
 Pick<SharedRichEditor,'descriptor'|'checkpointJson'|'writerClock'|'writerClockV2'|'writerGroups'|'writerGroupsV2'|'supportsWriterPrefixRead'|'writerClockAt'>
 &{kind:CapturedDocumentHistoryKind}>;
export type CapturedReviewHistoryRead=Readonly<
 Pick<SharedRichEditor,'reviewWriterClock'|'localReviewClock'>
 &{kind:CapturedNativeHistoryKind;checkpointJson():string}>;
export type CapturedReviewHistorySelection=
 |Readonly<{kind:'absent'}>
 |Readonly<{kind:'unselected';nativeKind:CapturedNativeHistoryKind}>
 |CapturedReviewHistoryRead;
declare const capturedNativeHistoryBrand:unique symbol;
export interface CapturedNativeHistoryRead {
 readonly [capturedNativeHistoryBrand]:true;
 readonly document:CapturedDocumentHistoryRead;
 readonly review:CapturedReviewHistorySelection;
 /** Validate the complete selected source before/after multi-store work and async gaps.
  * Native-only lane reads cannot certify unchanged retained queues/catalogs or authority. */
 check():void;
}
/** Exact captured native strings; null means review was not selected, not absent. */
export interface CapturedNativeHistorySelection {
 readonly document:Readonly<{kind:CapturedDocumentHistoryKind;checkpoint:string}>;
 readonly review:Readonly<{kind:CapturedNativeHistoryKind;checkpoint:string}>|null;
}
