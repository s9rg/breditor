/** Actual native prefixes and exact batch receipts; no AST/counter-only admission. */
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedSegmentedRelayProgress} from '../segmented_relay/contract.js';
import {sameReceipt} from '../relay/review_validation.js';
import {fail} from './policy.js';
const clock=SharedRichEditor.prototype.reviewWriterClock,exportBatch=SharedRichEditor.prototype.exportReviewThrough,receipt=SharedRichEditor.prototype.retainedReviewReceipt;
export function verifyLocalReviewProgress<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,state:SharedSegmentedRelayProgress):void{
 const binding=state.binding.review,accepted=state.review?.accepted;if(!binding||!state.review||state.document.accepted||state.document.receipt)throw fail();
 if(accepted){const local=clock.call(core,binding.actor,binding.principal);if(BigInt(accepted.through)>BigInt(local.through)||clock.call(core,binding.actor,binding.principal,accepted.through).prefixDigest!==accepted.prefixDigest)throw fail();}
 if(state.reviewReceipt){const r=state.reviewReceipt.receipt,frame=exportBatch.call(core,(BigInt(r.from)-1n).toString(),r.through),actual=receipt.call(core,frame,{actor:binding.actor,principal:binding.principal,access:'read_only'});if(!sameReceipt(actual,r))throw fail();}
}
