/** Genuine owned independent histories, separate from local-only capture or delivery admission. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryIdentity,SharedIndependentHistoryRecovery} from './contract.js';
export interface IndependentHistoryNativePort {
 readonly core:SharedRichEditor<SharedSelectionPolicy>;readonly identity:IndependentHistoryIdentity;
 readonly companion:boolean;
 /** A distinct actual local operation owner, never a delivery binding or stored DTO. */
 readonly localOperation?:object;
 check():void;checkManaged():void;stamp():object;read():SharedIndependentHistoryRecovery;
 checkBorrowed(core:object):void;savedCompanion():string|null;
 /** Exact committed pair, only when the current constructor-owned save has settled. */
 persisted():SharedIndependentHistoryRecovery;
}
const sessions=new WeakMap<object,IndependentHistoryNativePort>(),cores=new WeakSet<object>();
const unavailable=()=>Object.assign(new Error('Use the actual independently owned native session'),{code:'independent_history_source'});
export function registerIndependentHistoryNative(session:object,port:IndependentHistoryNativePort):void{if(sessions.has(session))throw unavailable();sessions.set(session,port);cores.add(port.core);}
export function independentHistoryNative(session:object):IndependentHistoryNativePort{const port=sessions.get(session);if(!port)throw unavailable();port.check();return port;}
/** Family exclusion only, never a liveness check, writer lease or permission grant. */
export const usesIndependentHistoryStorage=(core:object):boolean=>cores.has(core);
