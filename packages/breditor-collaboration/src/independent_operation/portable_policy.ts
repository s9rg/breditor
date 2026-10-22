/** Independent host read authorization and explicitly selected read-only native factories.
 * No stored plan or expired write signal supplies these choices. No database is opened here. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import type {SharedIndependentDeliveryRecoveryFactory} from '../independent_delivery_recovery/contract.js';
import {snapshotIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import type {AssetLimits} from '@breditor/experimental-rich-content';
export interface IndependentOperationReadOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly session:SharedIndependentDeliveryRecoveryFactory<P>;readonly checkAuthority:()=>void;readonly signal?:AbortSignal;readonly limits?:Partial<AssetLimits>}
export function portableReadPolicy<P extends SharedSelectionPolicy>(expected:SharedIndependentDeliveryParticipantSelection,input:IndependentOperationReadOptions<P>){
 return snapshotIndependentDeliveryRecovery({database:'operation-file-validation',destinations:{source:'operation-file-validation-source',uploads:'operation-file-validation-uploads'},expected,session:input.session,checkAuthority:input.checkAuthority,...(input.signal?{signal:input.signal}:{}),...(input.limits?{limits:input.limits}:{})},false);
}
