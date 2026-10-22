/** Pure current source-factory snapshot. No host callback or private capability
 * is selected here, so opening custody can be reserved before authorization. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {independentRecoveryName} from '../independent_recovery/policy.js';
import {SharedEditorError} from '../core.js';
export function snapshotLocalOperationFactory<P extends SharedSelectionPolicy>(expected:SharedIndependentParticipantSelection,provided:SharedIndependentHistorySessionOptions<P>):SharedIndependentHistorySessionOptions<P>{
 if(!provided||typeof provided!=='object')throw new SharedEditorError('independent_local_operation_policy','Select explicit local source factories and permissions');const input={...provided},database=independentRecoveryName(input.database),{create,readOnly,review,...rest}=input,{database:_database,...factories}=rest;
 if(typeof create!=='function'||typeof readOnly!=='boolean'||!review||!['read_only','comment','moderate'].includes(review.access))throw new SharedEditorError('independent_local_operation_policy','Select explicit local source factories and permissions');const access=review.access;
 const session=snapshotIndependentRecoveryFactory(expected,{...factories,readOnly:true,review:{...review,access:'read_only'}});return{...session,database,create,readOnly,review:{...session.review,access}};
}
