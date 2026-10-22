/** Only the real full-delivery owner registers. This grants a readable capture, not activation. */
import {SharedEditorError} from '../core.js';
import type {IndependentDeliverySourcePort} from './contract.js';
const sources=new WeakMap<object,IndependentDeliverySourcePort>();
export const independentDeliverySourceFailure=(code='independent_delivery_source_policy')=>new SharedEditorError(code,'Select the actual complete independent delivery source and all of its retained work');
export function registerIndependentDeliverySource(session:object,port:IndependentDeliverySourcePort):void{if(sources.has(session))throw independentDeliverySourceFailure();sources.set(session,port);}
export function independentDeliverySource(session:object):IndependentDeliverySourcePort{const port=sources.get(session);if(!port)throw independentDeliverySourceFailure();port.check();return port;}
