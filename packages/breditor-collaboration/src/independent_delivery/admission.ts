/** Only the actual new delivery session registers; old generation source maps stay separate. */
import type {DurableRelaySourcePort} from '../relay/durable_source_port.js';
import {SharedRelayError} from '../relay/validation.js';
const sessions=new WeakMap<object,DurableRelaySourcePort>(),documents=new WeakMap<object,DurableRelaySourcePort>(),reviews=new WeakMap<object,DurableRelaySourcePort>(),observers=new WeakMap<object,DurableRelaySourcePort>();
export function registerIndependentDeliverySession(session:object,port:DurableRelaySourcePort):void{if(sessions.has(session))throw new SharedRelayError('independent_delivery_reused');sessions.set(session,port);}
export function independentDeliverySessionPort(session:object):DurableRelaySourcePort{const port=sessions.get(session);if(!port)throw new SharedRelayError('independent_delivery_required');port.check();return port;}
export function withIndependentDocumentPort<T extends object>(input:T,port:DurableRelaySourcePort):T{const copy={...input};documents.set(copy,port);return copy;}
export function withIndependentReviewPort<T extends object>(input:T,port:DurableRelaySourcePort):T{const copy={...input};reviews.set(copy,port);return copy;}
export function withIndependentObserverPort<T extends object>(input:T,port:DurableRelaySourcePort):T{const copy={...input};observers.set(copy,port);return copy;}
export const independentDocumentPort=(input:object)=>documents.get(input);
export const independentReviewPort=(input:object)=>reviews.get(input);
export const independentObserverPort=(input:object)=>observers.get(input);
