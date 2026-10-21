/** Per-call genuine private factory selection, never a payload field or structural session cast. */
import {segmentedDocumentPort,segmentedReviewPort,segmentedObserverPort} from '../segmented_relay/admission.js';
import {independentDocumentPort,independentReviewPort,independentObserverPort} from '../independent_delivery/admission.js';
import type {DurableRelaySourcePort} from './durable_source_port.js';
import {SharedRelayError} from './validation.js';
function one(a:DurableRelaySourcePort|undefined,b:DurableRelaySourcePort|undefined):DurableRelaySourcePort|undefined{if(a&&b)throw new SharedRelayError('delivery_source_ambiguous');return a??b;}
export const selectedDocumentSource=(input:object)=>one(segmentedDocumentPort(input),independentDocumentPort(input));
export const selectedReviewSource=(input:object)=>one(segmentedReviewPort(input),independentReviewPort(input));
export const selectedObserverSource=(input:object)=>one(segmentedObserverPort(input),independentObserverPort(input));
