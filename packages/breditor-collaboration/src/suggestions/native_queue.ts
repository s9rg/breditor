/** Genuine original queue/source bindings and opaque held transport views. */
import type {SharedSelectionPolicy} from '../types.js';import type {SharedSuggestionQueue} from './queue.js';import type {SuggestionSyncQueue} from './sync_queue.js';import type {NativeRelayDelivery,NativeRelayDeliveryPort} from '../relay/native_delivery.js';import {nativeRelayDeliveryForSource} from '../relay/native_delivery.js';import {SharedRelayError} from '../relay/validation.js';
export interface NativeSuggestionJob{readonly port:NativeRelayDeliveryPort;check():void;persistSource():Promise<void>}
export interface NativeSuggestionQueueLoan<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly port:NativeRelayDeliveryPort;readonly queue:SuggestionSyncQueue<P>;close():Promise<void>}
interface Registration{core:object;source:object|undefined;open(port:NativeRelayDeliveryPort):NativeSuggestionQueueLoan}
const owners=new WeakMap<object,Registration>(),views=new WeakMap<object,NativeRelayDeliveryPort>();
export function registerSuggestionNativeQueue(owner:object,registration:Registration):void{if(owners.has(owner))throw new SharedRelayError('native_suggestion_queue');owners.set(owner,registration);}
export function lendSuggestionNativeQueue<P extends SharedSelectionPolicy>(owner:SharedSuggestionQueue<P>,delivery:NativeRelayDelivery):NativeSuggestionQueueLoan<P>{const actual=owners.get(owner);if(!actual?.source)throw new SharedRelayError('native_suggestion_queue');const port=nativeRelayDeliveryForSource(delivery,actual.source,actual.core);port.check();return actual.open(port) as NativeSuggestionQueueLoan<P>;}
export function registerNativeSuggestionQueueView(view:object,port:NativeRelayDeliveryPort):void{if(views.has(view))throw new SharedRelayError('native_suggestion_queue');port.check();views.set(view,port);}
export function nativeSuggestionQueueView(view:object):NativeRelayDeliveryPort|undefined{const port=views.get(view);port?.check();return port;}
