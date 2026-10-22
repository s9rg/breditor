/** Private lifetime policy, separate from the delivery/storage companion. Local
 * sources keep their native schema, source family and readable export contract. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {independentRecoveryName} from '../independent_recovery/policy.js';
import {SharedEditorError} from '../core.js';
import {independentDeliveryCompanion} from '../independent_history/driver.js';
import {forwardIndependentBootstrapPolicy} from '../independent_history/bootstrap_policy.js';
import {independentLocalNativeOriginPolicy,independentLocalNativeOriginGuard,type IndependentLocalNativeOperationOrigin} from './native_origin.js';
type Guard=ReturnType<typeof independentLocalNativeOriginGuard>;
const selected=new WeakMap<object,Guard>(),fail=()=>new SharedEditorError('independent_local_operation_policy','Select actual local native origin and fresh explicit source policy');
export function withIndependentLocalNativeOrigin<P extends SharedSelectionPolicy>(provided:SharedIndependentHistorySessionOptions<P>,origin:IndependentLocalNativeOperationOrigin):SharedIndependentHistorySessionOptions<P>{
 const {selection}=independentLocalNativeOriginPolicy(origin);if(!provided||typeof provided!=='object'||independentDeliveryCompanion(provided))throw fail();const input={...provided},database=independentRecoveryName(input.database),{create,readOnly,review,...rest}=input,{database:_database,...factories}=rest;
 if(typeof create!=='function'||typeof readOnly!=='boolean'||!review||!['read_only','comment','moderate'].includes(review.access))throw fail();const access=review.access;
 const session=snapshotIndependentRecoveryFactory(selection,{...factories,readOnly:true,review:{...review,access:'read_only'}}),options={...session,database,create,readOnly,review:{...session.review,access}};
 const guard=independentLocalNativeOriginGuard(origin);selected.set(options,guard);return forwardIndependentBootstrapPolicy(provided,options);
}
export const independentLocalHistoryCapturePolicy=(input:object):Guard|undefined=>selected.get(input);
