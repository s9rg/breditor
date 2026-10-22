/** Full live ownership uses the existing recovery selection plus explicit operational storage.
 * Current native factories, read/write policy and authority must be selected again on every open.
 * This private contract is not a room activation or an old participant backup format. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {SharedIndependentDeliveryParticipantResumeOptions} from '../independent_delivery_recovery/contract.js';
import type {RecoveredSharedIndependentDeliveryParticipant} from '../independent_delivery_recovery/recovery.js';
import type {RichAssetStore} from '@breditor/experimental-rich-content';
export interface IndependentOperationParticipantOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly database:string;readonly sourceDatabase:string;
 readonly recovery:SharedIndependentDeliveryParticipantResumeOptions<P>;
 readonly writerRecovery:'host-reacquired';
}
export interface IndependentOperationParticipantBeginOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends IndependentOperationParticipantOptions<P>{readonly recovered:RecoveredSharedIndependentDeliveryParticipant<P>}
export interface IndependentOperationParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly source:Readonly<{session:SharedIndependentDeliverySession<P>}>;readonly uploads:RichAssetStore}
