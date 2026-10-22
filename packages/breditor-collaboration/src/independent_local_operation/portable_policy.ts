/** Read permission and native factories are supplied afresh. Selecting a file
 * does not open storage or retain an ended writer's grant or abort scope. */
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {snapshotIndependentRecovery} from '../independent_recovery/prepare.js';
import {localJournalFailure as fail} from './journal_failure.js';
export interface LocalOperationReadOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly session:SharedIndependentRecoveryFactory<P>;readonly checkAuthority:()=>void;readonly signal?:AbortSignal;readonly limits?:Partial<AssetLimits>}
export function localPortableReadPolicy<P extends SharedSelectionPolicy>(expected:SharedIndependentParticipantSelection,provided:LocalOperationReadOptions<P>){
 if(!provided||typeof provided!=='object')throw fail('independent_local_operation_backup_policy');const input={...provided};if(!Object.hasOwn(input,'session')||!Object.hasOwn(input,'checkAuthority')||Object.keys(input).some(key=>!['session','checkAuthority','signal','limits'].includes(key)))throw fail('independent_local_operation_backup_policy');
 if(input.limits!==undefined&&(!input.limits||typeof input.limits!=='object'||Array.isArray(input.limits)))throw fail('independent_local_operation_backup_policy');
 return snapshotIndependentRecovery({database:'local-operation-file-validation',destinations:{source:'local-operation-file-validation-source',uploads:'local-operation-file-validation-uploads'},expected,session:input.session,checkAuthority:input.checkAuthority,...(input.signal===undefined?{}:{signal:input.signal}),...(input.limits===undefined?{}:{limits:input.limits})},false);
}
