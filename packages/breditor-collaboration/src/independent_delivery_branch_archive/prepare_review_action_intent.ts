/** Reuse exact native review event staging for both recovered messages and discussion links. */
import {SharedRichEditor} from '../core.js';
import {independentDeliverySessionPort} from '../independent_delivery/admission.js';
import type {SharedReviewAction} from '../review_types.js';
import type {SharedRecoveredBranchReviewIntent, SharedRecoveredBranchReviewMessage} from './review_contract.js';
import {reviewIntentRecord} from './review_intent_record.js';
import type {currentReviewTarget} from './review_target.js';

const {dispatchReviewWithClock, localReviewClock, previewReviewActionClock, writerClockV2} = SharedRichEditor.prototype;

export function prepareReviewActionIntent(
  context: ReturnType<typeof currentReviewTarget>,
  source: SharedRecoveredBranchReviewMessage['source'],
  request: SharedReviewAction,
  expected: SharedRecoveredBranchReviewIntent | undefined,
) {
  const owned = independentDeliverySessionPort(context.targetSession);
  const target = owned.binding.review;
  if (!target || owned.core !== context.core) throw new Error('Select the exact original review intent owner');
  context.checkTarget();
  const later = previewReviewActionClock.call(context.core, request, context.guard);
  if (!later) throw new Error('The native intent must author one review event');
  const intent = reviewIntentRecord({
    format: 'breditor/recovered-branch-review-intent', formatVersion: 1,
    source, target,
    seed: writerClockV2.call(context.core, '1'),
    before: localReviewClock.call(context.core), after: later,
  });
  if (expected && JSON.stringify(expected) !== JSON.stringify(intent)) {
    throw new Error('The original archived comment recovery intent differs');
  }
  return Object.freeze({
    intent,
    commit() {
      context.checkTarget();
      return dispatchReviewWithClock.call(context.core, request, intent.after, context.guard);
    },
  });
}
