/** Reconcile one durably selected, exact future comment event across owner lifetimes. */
import {SharedRichEditor} from '../core.js';
import {independentDeliverySessionPort} from '../independent_delivery/admission.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import {reviewStorageIdentity} from '../relay/review_validation.js';
import {clock} from '../relay/validation.js';
import {withRecoveredReviewMessage} from './recover_review_message.js';
import {reviewIntentRecord} from './review_intent_record.js';
import type {
  SharedPreparedRecoveredBranchReviewIntent,
  SharedRecoveredBranchReviewIntent, SharedRecoveredBranchReviewIntentState,
  SharedRecoveredBranchReviewMessageOptions,
} from './review_contract.js';

const {dispatchReviewWithClock, localReviewClock, previewReviewActionClock, reviewWriterClock, writerClockV2} = SharedRichEditor.prototype;

export async function prepareSharedRecoveredBranchReviewIntent(
  options: SharedRecoveredBranchReviewMessageOptions,
  expected?: SharedRecoveredBranchReviewIntent,
): Promise<SharedPreparedRecoveredBranchReviewIntent> {
  const prior = expected === undefined ? undefined : reviewIntentRecord(expected);
  return withRecoveredReviewMessage(options, context => {
    const owned = independentDeliverySessionPort(context.targetSession);
    const target = owned.binding.review;
    if (!target || owned.core !== context.core) throw new Error('Select the exact original review intent owner');
    context.checkTarget();
    const later = previewReviewActionClock.call(context.core, context.request, context.guard);
    if (!later) throw new Error('The native intent must author one review event');
    const intent = reviewIntentRecord({
      format: 'breditor/recovered-branch-review-intent', formatVersion: 1,
      source: context.source, target,
      seed: writerClockV2.call(context.core, '1'),
      before: localReviewClock.call(context.core), after: later,
    });
    if (prior && JSON.stringify(prior) !== JSON.stringify(intent)) {
      throw new Error('The original archived comment recovery intent differs');
    }
    return Object.freeze({
      intent, source: intent.source, principal: context.principal, body: context.body,
      commit() {
        context.checkTarget();
        return dispatchReviewWithClock.call(context.core, context.request, intent.after, context.guard);
      },
    });
  });
}

/** Compare the retained event with the real local review history and saved relay progress. */
export function inspectSharedRecoveredBranchReviewIntent(
  target: SharedIndependentDeliverySession,
  input: SharedRecoveredBranchReviewIntent,
): SharedRecoveredBranchReviewIntentState {
  const intent = reviewIntentRecord(input);
  const port = independentDeliverySessionPort(target);
  const binding = port.binding.review;
  const seed = clock(writerClockV2.call(port.core, '1'), '1');
  if (!binding || JSON.stringify(reviewStorageIdentity(binding)) !== JSON.stringify(intent.target) ||
      seed.through !== intent.seed.through || seed.prefixDigest !== intent.seed.prefixDigest) {
    throw new Error('Select the original review intent identity and native document');
  }
  const head = localReviewClock.call(port.core);
  const {actor, principal} = intent.target;
  const through = (position: string) => reviewWriterClock.call(port.core, actor, principal, position).prefixDigest;
  if (BigInt(head.through) < BigInt(intent.before.through) ||
      through(intent.before.through) !== intent.before.prefixDigest) {
    return {kind: 'conflict', reason: 'before'};
  }
  if (head.through === intent.before.through) return {kind: 'unapplied'};
  if (through(intent.after.through) !== intent.after.prefixDigest) return {kind: 'conflict', reason: 'event'};

  const accepted = port.durable().review?.accepted;
  const acknowledged = accepted?.actor === actor && BigInt(accepted.through) >= BigInt(intent.after.through) &&
    through(accepted.through) === accepted.prefixDigest;
  return {kind: acknowledged ? 'acknowledged' : 'local', event: {actor, counter: intent.after.through}};
}
