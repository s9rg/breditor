/** Explicit private local-native opener. It does not create a delivery companion,
 * retain operation intent or change ordinary independent-history defaults. */
import {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistorySessionOptions,SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {IndependentLocalNativeOperationOrigin} from './native_origin.js';
import {withIndependentLocalNativeOrigin} from './source_policy.js';
const open=SharedIndependentHistoryPersistentSession.open,restore=SharedIndependentHistoryPersistentSession.restoreRecovery;
export function openLocalNativeOriginVerifiedHistory<P extends SharedSelectionPolicy>(options:SharedIndependentHistorySessionOptions<P>,origin:IndependentLocalNativeOperationOrigin):Promise<SharedIndependentHistoryPersistentSession<P>>{return open.call(SharedIndependentHistoryPersistentSession,withIndependentLocalNativeOrigin(options,origin)) as Promise<SharedIndependentHistoryPersistentSession<P>>;}
export function restoreLocalNativeOriginVerifiedHistory<P extends SharedSelectionPolicy>(options:SharedIndependentHistorySessionOptions<P>,recovery:SharedIndependentHistoryRecovery,writerRecovery:'host-reacquired',origin:IndependentLocalNativeOperationOrigin):Promise<SharedIndependentHistoryPersistentSession<P>>{return restore.call(SharedIndependentHistoryPersistentSession,withIndependentLocalNativeOrigin(options,origin),recovery,writerRecovery) as Promise<SharedIndependentHistoryPersistentSession<P>>;}
