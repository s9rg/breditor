/** Actual native-origin admission before any normal delivery-source autosave.
 * The future durable operation parent must additionally retain original intent,
 * account for outbox retirement, hold uploads and coordinate room activation. */
import {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecoveryOptions} from '../independent_delivery/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentNativeOperationOrigin} from './native_origin.js';
import {withIndependentNativeOrigin} from './native_capture_guard.js';
const open=SharedIndependentDeliverySession.open,restore=SharedIndependentDeliverySession.restoreRecovery;
export function openNativeOriginVerifiedIndependentDelivery<P extends SharedSelectionPolicy>(options:SharedIndependentDeliveryOptions<P>,origin:IndependentNativeOperationOrigin):Promise<SharedIndependentDeliverySession<P>>{return open.call(SharedIndependentDeliverySession,withIndependentNativeOrigin(options,origin)) as Promise<SharedIndependentDeliverySession<P>>;}
/** Insert-only recovery retains the existing explicit host writer-reacquisition requirement. */
export function restoreNativeOriginVerifiedIndependentDelivery<P extends SharedSelectionPolicy>(options:SharedIndependentDeliveryRecoveryOptions<P>,origin:IndependentNativeOperationOrigin):Promise<SharedIndependentDeliverySession<P>>{return restore.call(SharedIndependentDeliverySession,withIndependentNativeOrigin(options,origin)) as Promise<SharedIndependentDeliverySession<P>>;}
