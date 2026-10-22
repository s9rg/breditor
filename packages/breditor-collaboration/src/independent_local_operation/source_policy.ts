/** Private lifetime policy, separate from the delivery/storage companion. Local
 * sources keep their native schema, source family and readable export contract. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions} from '../independent_history/contract.js';
import {snapshotLocalOperationFactory} from './factory_policy.js';
import {SharedEditorError} from '../core.js';
import {independentDeliveryCompanion} from '../independent_history/driver.js';
import {forwardIndependentBootstrapPolicy} from '../independent_history/bootstrap_policy.js';
import {selectedLocalOperationDriver} from '../independent_history/local_driver.js';
import {independentLocalNativeOriginPolicy,independentLocalNativeOriginGuard,type IndependentLocalNativeOperationOrigin} from './native_origin.js';
type Guard=ReturnType<typeof independentLocalNativeOriginGuard>;
const selected=new WeakMap<object,Guard>(),fail=()=>new SharedEditorError('independent_local_operation_policy','Select actual local native origin and fresh explicit source policy');
export function withIndependentLocalNativeOrigin<P extends SharedSelectionPolicy>(provided:SharedIndependentHistorySessionOptions<P>,origin:IndependentLocalNativeOperationOrigin):SharedIndependentHistorySessionOptions<P>{
 const {selection}=independentLocalNativeOriginPolicy(origin);if(!provided||typeof provided!=='object'||independentDeliveryCompanion(provided)||selectedLocalOperationDriver(provided))throw fail();const options=snapshotLocalOperationFactory(selection,provided);
 const guard=independentLocalNativeOriginGuard(origin);selected.set(options,guard);return forwardIndependentBootstrapPolicy(provided,options);
}
export const independentLocalHistoryCapturePolicy=(input:object):Guard|undefined=>selected.get(input);
