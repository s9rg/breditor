import type {SharedRichEditor} from '../core.js';
import type {SharedContinuedPairSession} from '../continued_pair/session.js';
import type {SharedIndependentRelaySyncOptions,SharedIndependentReviewSyncOptions} from '../independent_delivery/factories.js';
import {forwardNativeRelayDelivery} from '../relay/native_delivery.js';
import {SharedReviewRelaySync} from '../relay/review_sync.js';
import {SharedRelaySync} from '../relay/sync.js';
import {SharedRelayError} from '../relay/validation.js';
import type {SharedSelectionPolicy} from '../types.js';
import {continuedDeliveryPort,withContinuedDocumentPort,withContinuedReviewPort} from './binding.js';

export function createSharedContinuedRelaySync<P extends SharedSelectionPolicy>(
 session:SharedContinuedPairSession<P>,input:SharedIndependentRelaySyncOptions<P>,
):SharedRelaySync<P>{
 if('persistLocal' in input||'selectionEditing' in input)throw new SharedRelayError('continued_delivery_policy');
 const port=continuedDeliveryPort(session),core=port.core as SharedRichEditor<P>;
 const options=withContinuedDocumentPort({...input,selectionEditing:core.selectionPolicy(),persistLocal:()=>port.flush()},port);
 forwardNativeRelayDelivery(input,options);
 const sync=new SharedRelaySync<P>(core,options as never);
 try{port.track(sync);return sync;}catch(error){sync.dispose();throw error;}
}

export function createSharedContinuedReviewRelaySync<P extends SharedSelectionPolicy>(
 session:SharedContinuedPairSession<P>,input:SharedIndependentReviewSyncOptions<P>,
):SharedReviewRelaySync<P>{
 if('storage' in input)throw new SharedRelayError('continued_delivery_policy');
 const port=continuedDeliveryPort(session),core=port.core as SharedRichEditor<P>;
 const storage=Object.freeze({
  core,flush:()=>port.flush(),reviewRelayIdentity:()=>structuredClone(port.binding.review),
  reviewRelayProgress:()=>port.durable().review!,persistReviewRelayProgress:(progress:NonNullable<ReturnType<typeof port.durable>['review']>)=>port.persistReview(progress),
 });
 const options=withContinuedReviewPort({...input,storage},port);
 forwardNativeRelayDelivery(input,options);
 const sync=new SharedReviewRelaySync<P>(options);
 try{port.track(sync);return sync;}catch(error){sync.dispose();throw error;}
}
