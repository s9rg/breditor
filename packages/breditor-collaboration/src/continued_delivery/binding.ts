import type {DurableRelaySourcePort} from '../relay/durable_source_port.js';
import {SharedRelayError} from '../relay/validation.js';
import type {ContinuedDeliveryCompanion} from './companion.js';

const companions=new WeakMap<object,ContinuedDeliveryCompanion>();
const ports=new WeakMap<object,DurableRelaySourcePort>();
const documents=new WeakMap<object,DurableRelaySourcePort>(),reviews=new WeakMap<object,DurableRelaySourcePort>();
export function withContinuedDelivery<T extends object>(options:T,companion:ContinuedDeliveryCompanion):T{
 companions.set(options,companion);return options;
}
export const continuedDeliveryCompanion=(options:object)=>companions.get(options);
export function registerContinuedDelivery(session:object,port:DurableRelaySourcePort):void{
 if(ports.has(session))throw new SharedRelayError('continued_delivery_reused');
 ports.set(session,port);
}
export function continuedDeliveryPort(session:object):DurableRelaySourcePort{
 const port=ports.get(session);
 if(!port)throw new SharedRelayError('continued_delivery_required');
 port.check();return port;
}
export function withContinuedDocumentPort<T extends object>(input:T,port:DurableRelaySourcePort):T{documents.set(input,port);return input;}
export function withContinuedReviewPort<T extends object>(input:T,port:DurableRelaySourcePort):T{reviews.set(input,port);return input;}
export const continuedDocumentPort=(input:object)=>documents.get(input);
export const continuedReviewPort=(input:object)=>reviews.get(input);
