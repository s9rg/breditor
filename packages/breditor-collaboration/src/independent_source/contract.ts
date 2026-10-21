/** Explicit independent document/comment sources. No original or generation-family adoption. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryIdentity,SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
export interface SharedIndependentSourceSelection<P extends SharedSelectionPolicy=SharedSelectionPolicy> {readonly session:SharedIndependentHistoryPersistentSession<P>}
export interface SharedIndependentSourceRecord {readonly kind:'document'|'review'|'version';readonly index:number;readonly json:string}
export const MAX_INDEPENDENT_SOURCE_BYTES=256*1024*1024;
export const MAX_INDEPENDENT_SOURCE_RECORDS=34;
/** Internal registration; a readable history is not writable or operational custody. */
export interface IndependentSourcePort {
 readonly identity:IndependentHistoryIdentity;readonly core:SharedRichEditor<SharedSelectionPolicy>;
 check():void;stamp():object;read():SharedIndependentHistoryRecovery;
}
