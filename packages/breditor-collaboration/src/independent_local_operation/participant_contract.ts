/** Private complete local ownership. Fresh current source permissions are
 * separate from readonly original replay; no stored phase grants either. */
import type {RichAssetStore} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import type {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import type {SharedIndependentParticipantResumeOptions} from '../independent_recovery/contract.js';
import type {RecoveredSharedIndependentParticipant} from '../independent_recovery/recovery.js';
export interface LocalOperationParticipantOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly database:string;readonly journalDatabase:string;readonly sourceDatabase:string;
 readonly recovery:SharedIndependentParticipantResumeOptions<P>;
 readonly session:SharedIndependentHistorySessionOptions<P>;
 readonly writerRecovery:'host-reacquired';
}
export interface LocalOperationParticipantBeginOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends LocalOperationParticipantOptions<P>{readonly recovered:RecoveredSharedIndependentParticipant<P>}
/** Source-owned readable provider. It grants no writes and has no independent
 * dispose; closing the genuine source ends this borrowed provider lifetime. */
export interface LocalOperationOriginalProvider{file():Blob;blob(asset:string,generation:string):Blob|undefined}
export interface LocalOperationParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly source:Readonly<{session:SharedIndependentHistoryPersistentSession<P>}>;readonly uploads:RichAssetStore;readonly original:LocalOperationOriginalProvider}
