import {queueIdentity} from '../suggestions/validation.js';
/** A disconnected local dependency for recovered outbox construction. It never
 * impersonates an authenticated connection, grant, accepted prefix or receipt. */
import type {SharedSuggestionTransport} from '../suggestions/transport_port.js';import type {SharedSuggestionQueueIdentity} from '../suggestions/types.js';import type {SharedRichEditor} from '../core.js';import type {SharedSelectionPolicy} from '../types.js';import {SharedRelayError} from '../relay/validation.js';
export const metadataTransportUnavailable=()=>new SharedRelayError('metadata_transport_unconfigured');
/** Module-owned callback: no expired preparation context is retained. */
export function unconfiguredMetadataToken():never{throw metadataTransportUnavailable();}
export function dormantMetadataTransport<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,identity:SharedSuggestionQueueIdentity,binding:string,current:()=>void):SharedSuggestionTransport<P>{
 const expected=JSON.stringify(queueIdentity(identity)),check=(provided:SharedRichEditor<P>,value:SharedSuggestionQueueIdentity)=>{current();if(provided!==core||JSON.stringify(queueIdentity(value))!==expected)throw new SharedRelayError('metadata_preparation_source');},unavailable=async()=>{throw metadataTransportUnavailable();};
 return Object.freeze({checkSuggestionQueue:check,checkSuggestionRevisions(provided:SharedRichEditor<P>,value:SharedSuggestionQueueIdentity,selected:string){check(provided,value);if(selected!==binding)throw new SharedRelayError('metadata_preparation_source');},suggestionRevisionsReady:()=>false,suggestionState:()=>({ready:false,revision:0,documentRevision:0,permissions:null}),state(){throw metadataTransportUnavailable();},subscribe(){current();return()=>{};},connect:unavailable,flush:unavailable,refreshDocument:unavailable,requestSuggestion:unavailable,requestSuggestionRevision:unavailable});
}
