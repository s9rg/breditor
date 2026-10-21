/** Explicit new paired-storage family. Existing generation heads and database schemas remain closed. */
import type {SegmentedSessionIdentity} from '../persistence/segmented_contract.js';
import type {SharedEditorOptions,SharedRustOwner,SharedSelectionPolicy} from '../types.js';
import type {SharedReviewPolicy} from '../review_types.js';
export type IndependentHistoryLane='document'|'review';
export type IndependentHistoryPolicy='original'|'segmented-v1';
export interface IndependentHistoryIdentity {
 native:SegmentedSessionIdentity;
 documentHistory:IndependentHistoryPolicy;
 reviewHistory:IndependentHistoryPolicy;
 review:{actor:string;principal:string};
}
export interface IndependentHistoryReference {generation:string;sha256:string}
export interface IndependentHistoryFile extends IndependentHistoryReference {lane:IndependentHistoryLane;kind:'root'|'sealed';json:string}
export type IndependentHistoryStoredLane={kind:'original';checkpoint:string}|{kind:'segmented-v1';root:IndependentHistoryReference;sealed:IndependentHistoryReference[];active:string};
export interface IndependentHistoryHead {
 format:'breditor/shared-independent-history-head';formatVersion:1;
 identity:IndependentHistoryIdentity;
 document:IndependentHistoryStoredLane;review:IndependentHistoryStoredLane;versions:string[];
}
export interface IndependentHistoryCut {head:string;files:readonly IndependentHistoryFile[]}
export interface IndependentHistoryStoredCut extends IndependentHistoryCut {documentCheckpoint:string;reviewCheckpoint:string;record:IndependentHistoryHead}
export const MAX_INDEPENDENT_HISTORY_HEAD_BYTES=128*1024*1024;
/** Factories are selected by the host, never discovered by decoding stored native data. */
export type IndependentDocumentHistoryOptions=
 |{kind:'original';restoreOriginal:(checkpoint:string)=>SharedRustOwner|Promise<SharedRustOwner>}
 |{kind:'segmented-v1';initialGenerations:{root:string;active:string};restoreSegmented:(checkpoint:string)=>SharedRustOwner|Promise<SharedRustOwner>};
export type IndependentReviewHistoryOptions={kind:'original'}|{kind:'segmented-v1';initialGenerations:{root:string;active:string}};
export interface SharedIndependentHistorySessionOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SegmentedSessionIdentity,'selectionEditing'> {
 database:string;selectionEditing:P;readOnly:boolean;review:SharedReviewPolicy;
 documentHistory:IndependentDocumentHistoryOptions;reviewHistory:IndependentReviewHistoryOptions;
 create:()=>SharedRustOwner|Promise<SharedRustOwner>;
 editor?:Omit<SharedEditorOptions<'document-v1'>,'selectionEditing'|'reviewedHistory'|'searchHistory'|'segmentedHistory'>;
 onError?:(error:unknown)=>void;onState?:(state:SharedIndependentHistorySaveState)=>void;
}
export interface SharedIndependentHistorySaveState {status:'saved'|'pending'|'failed'|'closed';documentRevision:string|null;reviewRevision:string|null;error:string|null}
/** Exact native recovery only. Fresh policy, leases and host writer fencing remain separate. */
export interface SharedIndependentHistoryRecovery {format:'breditor/shared-independent-history-recovery';formatVersion:1;identity:IndependentHistoryIdentity;documentCheckpoint:string;reviewCheckpoint:string;versions:readonly string[]}
