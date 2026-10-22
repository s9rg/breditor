/** Select native-origin verification on the real before-autosave path.
 * This is a private operation-coordinator prerequisite, not durable outbox intent. */
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import type {IndependentHistoryCompanion} from '../independent_history/driver.js';
import {independentNativeOriginGuard,type IndependentNativeOperationOrigin} from './native_origin.js';
const p=IndependentDeliveryCompanion.prototype,load=p.load,capture=p.capture,admit=p.admit,wrap=p.wrap,acknowledged=p.acknowledged,retire=p.retire;
const selected=new WeakMap<object,IndependentNativeOperationOrigin>();
/** Kept separate from public options; spread/serialized markers cannot select it. */
export function withIndependentNativeOrigin<T extends object>(input:T,origin:IndependentNativeOperationOrigin):T{independentNativeOriginGuard(origin);const copy={...input};selected.set(copy,origin);return copy;}
export function guardedIndependentCompanion(input:object,base:IndependentDeliveryCompanion):IndependentHistoryCompanion{
 const origin=selected.get(input);if(!origin)return base;const nativeCaptureGuard=independentNativeOriginGuard(origin);
 return Object.freeze({readHead:base.readHead,nativeCaptureGuard,load:(head:string)=>load.call(base,head),capture:()=>capture.call(base),admit:(core:Parameters<IndependentHistoryCompanion['admit']>[0])=>admit.call(base,core),wrap:(head:Parameters<IndependentHistoryCompanion['wrap']>[0],cut:string)=>wrap.call(base,head,cut),acknowledged:(cut:string)=>acknowledged.call(base,cut),retire:()=>retire.call(base)});
}
