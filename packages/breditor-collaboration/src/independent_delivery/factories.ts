import {forwardNativeRelayDelivery} from '../relay/native_delivery.js';
/** Named adapters pin actual delivery custody. Ordinary constructors cannot infer this family. */
import {SharedRelaySync} from '../relay/sync.js';
import {SharedReviewRelaySync} from '../relay/review_sync.js';
import {SharedSuggestionObserverRelay} from '../suggestions/observer_relay.js';
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedRelayIdentity,SharedRelayOptions} from '../relay/types.js';
import type {SharedReviewRelayIdentity,SharedReviewRelayOptions} from '../relay/review_types.js';
import type {SharedSuggestionObserverOptions} from '../suggestions/observer_types.js';
import {SharedRelayError} from '../relay/validation.js';
import type {SharedIndependentDeliverySession} from './session.js';
import {independentDeliverySessionPort,withIndependentDocumentPort,withIndependentReviewPort,withIndependentObserverPort} from './admission.js';
export type SharedIndependentRelaySyncOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedRelayOptions<P>,'selectionEditing'|'persistLocal'|'identity'>&{identity:P extends 'document-v1'?SharedRelayIdentity&{writerTransport:'atomic-v2'}:SharedRelayIdentity};
export type SharedIndependentReviewSyncOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedReviewRelayOptions<P>,'storage'|'identity'>&{identity:P extends 'document-v1'?SharedReviewRelayIdentity&{writerTransport:'atomic-v2'}:SharedReviewRelayIdentity};
export type SharedIndependentSuggestionObserverOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedSuggestionObserverOptions<P>,'storage'>;
export function createSharedIndependentRelaySync<P extends SharedSelectionPolicy>(session:SharedIndependentDeliverySession<P>,input:SharedIndependentRelaySyncOptions<P>):SharedRelaySync<P>{
 const port=independentDeliverySessionPort(session),core=port.core as SharedRichEditor<P>;if('persistLocal'in input||'selectionEditing'in input)throw new SharedRelayError('independent_delivery_factory_policy');
 const options=withIndependentDocumentPort({...input,selectionEditing:core.selectionPolicy(),persistLocal:()=>port.flush()},port);forwardNativeRelayDelivery(input,options);const sync=new SharedRelaySync<P>(core,options as never);try{port.track(sync);return sync;}catch(error){sync.dispose();throw error;}
}
export function createSharedIndependentReviewRelaySync<P extends SharedSelectionPolicy>(session:SharedIndependentDeliverySession<P>,input:SharedIndependentReviewSyncOptions<P>):SharedReviewRelaySync<P>{
 const port=independentDeliverySessionPort(session),core=port.core as SharedRichEditor<P>;if('storage'in input||!port.binding.review)throw new SharedRelayError('independent_delivery_factory_policy');
 const storage=Object.freeze({core,flush:()=>port.flush(),reviewRelayIdentity:()=>structuredClone(port.binding.review),reviewRelayProgress:()=>{const progress=port.durable().review;if(!progress)throw new SharedRelayError('independent_delivery_binding');return progress;},persistReviewRelayProgress:(progress:Parameters<typeof port.persistReview>[0])=>port.persistReview(progress)});
 const options=withIndependentReviewPort({...input,storage},port);forwardNativeRelayDelivery(input,options);const sync=new SharedReviewRelaySync<P>(options);try{port.track(sync);return sync;}catch(error){sync.dispose();throw error;}
}
export function createSharedIndependentSuggestionObserverRelay<P extends SharedSelectionPolicy>(session:SharedIndependentDeliverySession<P>,input:SharedIndependentSuggestionObserverOptions<P>):SharedSuggestionObserverRelay<P>{
 const port=independentDeliverySessionPort(session),core=port.core as SharedRichEditor<P>;for(const key of ['storage','persistLocal','selectionEditing'])if(key in input)throw new SharedRelayError('independent_delivery_factory_policy');
 const storage=Object.freeze({core,save:()=>port.save(),flush:()=>port.flush()}),options=withIndependentObserverPort({...input,storage},port);forwardNativeRelayDelivery(input,options);const observer=new SharedSuggestionObserverRelay<P>(options);try{port.track(observer);return observer;}catch(error){observer.dispose();throw error;}
}
