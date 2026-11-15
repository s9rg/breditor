/** Pin the actual live review placement before any archive IO or host callback. */
import {SharedRichEditor} from '../core.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import {fields} from '../physical_room_record_cut/policy.js';
import type {SharedReviewGuard} from '../review_types.js';
import type {SharedIndependentDeliveryBranchFile} from './contract.js';

const {reviewSnapshot} = SharedRichEditor.prototype;

export function currentReviewTarget(source: SharedIndependentDeliveryBranchFile,
  session: SharedIndependentDeliverySession, observation: unknown) {
  const target = independentDeliverySource(session);
  const original = source.selection.identity.source.binding.review;
  const destination = target.identity.binding.review;
  if (original.room !== destination.room || original.endpoint !== destination.endpoint || original.binding !== destination.binding) {
    throw new Error('Select a target in the original relay review room');
  }
  const observed = fields(observation, ['owner', 'documentRevision', 'reviewRevision'], ['view']);
  const {owner, documentRevision, reviewRevision} = reviewSnapshot.call(target.core);
  if (observed['owner'] !== owner || observed['documentRevision'] !== documentRevision || observed['reviewRevision'] !== reviewRevision) {
    throw new Error('Select the current live review publication');
  }
  const guard: SharedReviewGuard = {owner, documentRevision, reviewRevision};
  const stamp = coreReadStamp(target.core);
  const checkTarget = () => {
    target.check();
    const current = coreReadStamp(target.core);
    if (current.document !== stamp.document || current.review !== stamp.review) {
      throw new Error('Live document or review changed during recovery');
    }
  };
  return {core: target.core, guard, checkTarget, principal: destination.principal, targetSession: session};
}
