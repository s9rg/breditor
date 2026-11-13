import type {SharedReviewPolicy} from '../review_types.js';
import type {SharedEditorOptions,SharedRustOwner,SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryPolicy,IndependentHistoryReference,IndependentHistoryStoredLane} from '../independent_history/contract.js';
import type {SegmentedSessionIdentity} from '../persistence/segmented_contract.js';

/** Select each native archive independently. A continued store requires at least one continued lane. */
export type ContinuedPairHistoryKind=IndependentHistoryPolicy|'continued-v2';
export interface ContinuedPairIdentity {
 native:SegmentedSessionIdentity;
 documentHistory:ContinuedPairHistoryKind;
 reviewHistory:ContinuedPairHistoryKind;
 review:{actor:string;principal:string};
}
export type ContinuedPairStoredLane=IndependentHistoryStoredLane|{
 kind:'continued-v2';
 root:IndependentHistoryReference;
 sealed:IndependentHistoryReference[];
 active:string;
 continuedAfter:number;
};
export interface ContinuedPairHead {
 format:'breditor/shared-independent-history-head';
 formatVersion:2;
 identity:ContinuedPairIdentity;
 document:ContinuedPairStoredLane;
 review:ContinuedPairStoredLane;
 versions:string[];
}

/** Restore from an exact archive using the factory for the explicitly named document family. */
export interface SharedContinuedPairOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 database:string;
 native:Omit<SegmentedSessionIdentity,'selectionEditing'>&{selectionEditing:P};
 documentHistory:ContinuedPairHistoryKind;
 reviewHistory:ContinuedPairHistoryKind;
 readOnly:boolean;
 review:SharedReviewPolicy;
 restoreDocument:(checkpoint:string)=>SharedRustOwner|Promise<SharedRustOwner>;
 editor?:Omit<SharedEditorOptions<P>,'selectionEditing'|'reviewedHistory'|'searchHistory'|'segmentedHistory'>;
 onError?:(error:unknown)=>void;
}
export interface SharedContinuedPairRecovery {
 format:'breditor/shared-independent-history-recovery';
 formatVersion:2;
 identity:ContinuedPairIdentity;
 documentCheckpoint:string;
 reviewCheckpoint:string;
 versions:readonly string[];
}
