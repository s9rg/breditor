/** Complete local-only recovery. No relay binding, receipt or activation grant
 * can be inferred from these archives or supplied as a readiness-shaped flag. */
import type {AssetLimits,RichAssetStore} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import type {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import type {SharedIndependentParticipantBackup} from '../independent_participant/backup.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedReviewPolicy} from '../review_types.js';
export type SharedIndependentRecoveryFactory<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedIndependentHistorySessionOptions<P>,'database'|'create'|'readOnly'|'review'>&{readonly readOnly:true;readonly review:Omit<SharedReviewPolicy,'access'>&{readonly access:'read_only'}};
export interface SharedIndependentParticipantResumeOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly database:string;readonly expected:SharedIndependentParticipantSelection;
 readonly destinations:Readonly<{source:string;uploads:string}>;
 /** The first real native owner is read-only in both lanes. */
 readonly session:SharedIndependentRecoveryFactory<P>;
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;readonly limits?:Partial<AssetLimits>;
}
export interface SharedIndependentParticipantRecoveryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedIndependentParticipantResumeOptions<P>{readonly backup:SharedIndependentParticipantBackup}
export interface SharedIndependentParticipantRecoveryProgress{readonly phase:'preparing'|'ready';readonly source:'reserved'|'started'|'complete';readonly uploads:'reserved'|'started'|'complete'}
/** All three actual owners transfer. Original pixels may not be in uploads.
 * The caller must retain/dispose the original archive along with its provider. */
export interface RecoveredSharedIndependentParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly source:Readonly<{session:SharedIndependentHistoryPersistentSession<P>}>;
 readonly uploads:RichAssetStore;readonly original:SharedIndependentParticipantBackup;
}
