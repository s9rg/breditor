/** Genuine constructor-owned version store bridges; no DTO grants custody. */
import type {SharedSelectionPolicy} from '../types.js';
import type {NativeRelayDelivery,NativeRelayDeliveryPort} from '../relay/native_delivery.js';
import {nativeRelayDeliveryForSource} from '../relay/native_delivery.js';
import {SharedRelayError} from '../relay/validation.js';
import type {VersionSyncStore} from './sync_store.js';
import type {SharedDocumentVersionsOptions} from './types.js';
export type NativeVersionDeliveryOptions=Pick<SharedDocumentVersionsOptions,'getToken'|'flushDocument'|'requestTimeoutMs'|'reconnectMinimumMs'|'reconnectMaximumMs'|'onState'|'onError'>;
export interface NativeVersionJob{
 readonly port:NativeRelayDeliveryPort;
 check():void;persistSource():Promise<void>;
}
export interface NativeVersionStoreLoan<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly port:NativeRelayDeliveryPort;readonly store:VersionSyncStore<P>;
 retryLocal():Promise<void>;
 /** Stop this loan, then await actual writes without retrying or erasing failures. */
 close():Promise<void>;
}
interface Registration{core:object;source:object|undefined;open(port:NativeRelayDeliveryPort,options:NativeVersionDeliveryOptions):NativeVersionStoreLoan}
const stores=new WeakMap<object,Registration>(),nativeViews=new WeakMap<object,NativeRelayDeliveryPort>();
const fail=()=>new SharedRelayError('version_native_delivery_source');
export function registerVersionNativeStore(owner:object,registration:Registration):void{if(stores.has(owner))throw fail();stores.set(owner,registration);}
export function lendVersionNativeStore<P extends SharedSelectionPolicy>(owner:object,delivery:NativeRelayDelivery,options:NativeVersionDeliveryOptions):NativeVersionStoreLoan<P>{
 const actual=stores.get(owner);if(!actual?.source)throw fail();
 const port=nativeRelayDeliveryForSource(delivery,actual.source,actual.core);port.check();
 return actual.open(port,options) as NativeVersionStoreLoan<P>;
}
/** Called only for the actual private view created by a registered store. */
export function registerNativeVersionView(view:object,port:NativeRelayDeliveryPort):void{if(nativeViews.has(view))throw fail();port.check();nativeViews.set(view,port);}
export function nativeVersionView(view:object):NativeRelayDeliveryPort|undefined{const port=nativeViews.get(view);port?.check();return port;}
