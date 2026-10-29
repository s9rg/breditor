/** Constructor-owned authenticated transport for private recovery composition.
 * DTOs, copied methods and matching bindings never select this registry. */
import type {SharedSelectionPolicy} from '../types.js';import type {SharedSuggestionTransport} from '../suggestions/transport_port.js';import type {NativeRelayDeliveryPort} from './native_delivery.js';import {SharedRelayError} from './validation.js';
interface Registration{port:NativeRelayDeliveryPort;transport:SharedSuggestionTransport<SharedSelectionPolicy>}
const transports=new WeakMap<object,Registration>();
export function registerNativeSuggestionTransport<P extends SharedSelectionPolicy>(owner:object,port:NativeRelayDeliveryPort|undefined,methods:SharedSuggestionTransport<P>):void{
 if(!port)return;if(transports.has(owner))throw new SharedRelayError('native_suggestion_transport');port.check();
 const check=<T>(call:()=>T):T=>{port.check();const value=call();port.check();return value;},run=async<T>(call:()=>Promise<T>):Promise<T>=>{port.check();const value=await call();port.check();return value;};
 // State is detached DATA and stays readable after close. Every action uses
 // fresh held authority and the genuine constructor-captured transport method.
 const methodsView:SharedSuggestionTransport<P>={...(methods.suggestionDecisionMode?{suggestionDecisionMode:methods.suggestionDecisionMode}:{}),state:()=>methods.state(),suggestionState:()=>methods.suggestionState(),subscribe:(listener:()=>void)=>check(()=>methods.subscribe(listener)),checkSuggestionQueue:(core,identity)=>check(()=>methods.checkSuggestionQueue(core,identity)),connect:()=>run(()=>methods.connect()),flush:()=>run(()=>methods.flush()),refreshDocument:()=>run(()=>methods.refreshDocument()),requestSuggestion:request=>run(()=>methods.requestSuggestion(request)),...(methods.checkSuggestionRevisions?{checkSuggestionRevisions:(core:Parameters<NonNullable<SharedSuggestionTransport<P>['checkSuggestionRevisions']>>[0],identity:Parameters<NonNullable<SharedSuggestionTransport<P>['checkSuggestionRevisions']>>[1],binding:string)=>check(()=>methods.checkSuggestionRevisions!(core,identity,binding))}:{}),...(methods.suggestionRevisionsReady?{suggestionRevisionsReady:()=>methods.suggestionRevisionsReady!()}:{}),...(methods.requestSuggestionRevision?{requestSuggestionRevision:(request:Parameters<NonNullable<SharedSuggestionTransport<P>['requestSuggestionRevision']>>[0])=>run(()=>methods.requestSuggestionRevision!(request))}:{})};
 const transport=Object.freeze(methodsView);
 transports.set(owner,{port,transport:transport as SharedSuggestionTransport<SharedSelectionPolicy>});
}
export function nativeSuggestionTransportFor<P extends SharedSelectionPolicy>(owner:object,port:NativeRelayDeliveryPort):SharedSuggestionTransport<P>{const actual=transports.get(owner);if(!actual||actual.port!==port)throw new SharedRelayError('native_suggestion_transport');port.check();return actual.transport as SharedSuggestionTransport<P>;}
