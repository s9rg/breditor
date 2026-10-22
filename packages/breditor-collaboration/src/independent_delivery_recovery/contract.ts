/** Explicit complete-delivery recovery; stored bytes never choose a factory or current grant. */
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryOptions} from '../independent_delivery/contract.js';
import type {SharedIndependentDeliveryParticipantBackup} from '../independent_delivery_participant/backup.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
export type SharedIndependentDeliveryRecoveryFactory<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedIndependentDeliveryOptions<P>,'database'|'create'>;
export interface SharedIndependentDeliveryParticipantResumeOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly database:string;readonly expected:SharedIndependentDeliveryParticipantSelection;
 readonly destinations:Readonly<{source:string;uploads:string}>;
 /** First staged ownership is read-only in both lanes. Native factories remain explicit. */
 readonly session:SharedIndependentDeliveryRecoveryFactory<P>;
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;readonly limits?:Partial<AssetLimits>;
}
export interface SharedIndependentDeliveryParticipantRecoveryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedIndependentDeliveryParticipantResumeOptions<P>{readonly backup:SharedIndependentDeliveryParticipantBackup}
export interface SharedIndependentDeliveryParticipantRecoveryProgress{readonly phase:'preparing'|'ready';readonly source:'reserved'|'started'|'complete';readonly uploads:'reserved'|'started'|'complete'}
