/** One complete nonsecret identity for actual storage, portable records and explicit selection. */
import {canonicalIndependentHistoryIdentity} from '../independent_history/cut.js';
import type {IndependentHistoryIdentity} from '../independent_history/contract.js';
import {closed,relayBinding} from '../segmented_relay/validation.js';
import {SharedRelayError,transportVersion} from '../relay/validation.js';
import {deliveryRetainedBinding} from '../delivery_state/retained.js';
import {freezeGeneration} from '../generation_source/identity.js';
import type {SharedIndependentDeliveryIdentity,SharedIndependentDeliveryBinding} from './contract.js';
export function independentDeliveryIdentity(historyInput:IndependentHistoryIdentity,bindingInput:unknown,retainedInput:unknown):SharedIndependentDeliveryIdentity{
 const history=canonicalIndependentHistoryIdentity(historyInput),binding=relayBinding(bindingInput as SharedIndependentDeliveryBinding),d=binding.document,r=binding.review,id=history;
 if(!r||d.room!==id.native.room||d.writer!==id.native.writer||d.principal!==id.review.principal||r.actor!==id.review.actor||r.principal!==id.review.principal||(id.native.selectionEditing==='document-v1'||id.native.reviewedHistory!==null)&&transportVersion(d.writerTransport)!==2)throw new SharedRelayError('independent_delivery_binding');
 const retained=deliveryRetainedBinding(retainedInput as Parameters<typeof deliveryRetainedBinding>[0],binding,id.native.reviewedHistory);
 return freezeGeneration({history,binding:binding as SharedIndependentDeliveryBinding,retained});
}
export function readIndependentDeliveryIdentity(input:unknown):SharedIndependentDeliveryIdentity{
 const value=closed(input,'binding,history,retained');return independentDeliveryIdentity(value['history'] as IndependentHistoryIdentity,value['binding'],value['retained']);
}
