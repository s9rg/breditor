/** Deliberately reissue one archived author's message through ordinary live comment admission. */
import {SharedRichEditor} from '../core.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import {fields} from '../physical_room_record_cut/policy.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedReviewAction, SharedReviewGuard, SharedReviewTarget} from '../review_types.js';
import type {SharedIndependentDeliveryBranchArchiveReadOptions} from './contract.js';
import {sameBranchDocumentOrigin} from './document_origin.js';
import {branchFile} from './framing.js';
import {withArchivedBranch} from './read_native.js';
import {archivedReviewEvent, archivedReviewId, archivedReviewOptionalFields, archivedReviewReadFields} from './read_review_thread.js';
import type {SharedRecoveredBranchReviewMessage, SharedRecoveredBranchReviewMessageOptions} from './review_contract.js';

const {captureReviewAnchor, dispatchReview, readReviewThreadHistory, reviewSnapshot} = SharedRichEditor.prototype;

export function prepareSharedRecoveredBranchReviewMessage(
  options: SharedRecoveredBranchReviewMessageOptions,
): Promise<SharedRecoveredBranchReviewMessage> {
  return withRecoveredReviewMessage(options, ({source, principal, body, request, core, guard, checkTarget}) => {
    let committed = false;
    return Object.freeze({
      source, principal, body,
      commit() {
        if (committed) throw new Error('The recovered message was already committed');
        checkTarget();
        const result = dispatchReview.call(core, request, guard);
        committed = result.kind === 'committed';
        return result;
      },
    });
  });
}

interface RecoveredReviewMessageContext {
  readonly source: SharedRecoveredBranchReviewMessage['source'];
  readonly principal: string;
  readonly body: string;
  readonly request: SharedReviewAction;
  readonly core: SharedRichEditor<SharedSelectionPolicy>;
  readonly targetSession: SharedIndependentDeliverySession;
  readonly guard: SharedReviewGuard;
  readonly checkTarget: () => void;
}

export async function withRecoveredReviewMessage<T>(
  options: SharedRecoveredBranchReviewMessageOptions,
  prepare: (context: RecoveredReviewMessageContext) => T,
): Promise<T> {
  const value = fields(options, [...archivedReviewReadFields, 'source', 'event', 'target', 'guard', 'destination'], archivedReviewOptionalFields);
  const source = branchFile(value['source']);
  const event = archivedReviewEvent(value['event']);
  const targetSession = value['target'] as SharedIndependentDeliverySession;
  const target = independentDeliverySource(targetSession);
  const original = source.selection.identity.source.binding.review;
  const destination = target.identity.binding.review;
  if (original.room !== destination.room || original.endpoint !== destination.endpoint || original.binding !== destination.binding) {
    throw new Error('Select a target in the original relay review room');
  }
  const observed = fields(value['guard'], ['owner', 'documentRevision', 'reviewRevision'], ['view']);
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
  const choice = fields(value['destination'], ['kind'], ['target', 'thread']);
  let action: (body: string) => SharedReviewAction;
  if (choice['kind'] === 'new_thread' && Object.hasOwn(choice, 'target') && !Object.hasOwn(choice, 'thread')) {
    const selectedTarget = structuredClone(choice['target']) as SharedReviewTarget;
    action = body => ({kind: 'create_thread', data: {
      anchorJson: captureReviewAnchor.call(target.core, selectedTarget, guard.documentRevision), body,
    }});
  } else if (choice['kind'] === 'reply' && Object.hasOwn(choice, 'thread') && !Object.hasOwn(choice, 'target')) {
    const selectedThread = archivedReviewId(choice['thread']);
    action = body => ({kind: 'reply', data: {thread: selectedThread, body}});
  } else {
    throw new Error('Choose a new comment target or a live thread');
  }
  return withArchivedBranch(source, value as unknown as SharedIndependentDeliveryBranchArchiveReadOptions, core => {
    if (!sameBranchDocumentOrigin(core, target.core)) {
      throw new Error('Recovered comment belongs to a different native document');
    }
    const [entry] = readReviewThreadHistory.call(core, event.thread, event.index).events;
    if (!entry || entry.index !== event.index || entry.id.actor !== event.id.actor ||
        entry.id.counter !== event.id.counter || entry.digest !== event.digest) {
      throw new Error('The selected review event differs from the original archive');
    }
    const {principal, payload} = entry;
    if (principal !== destination.principal) {
      throw new Error('Recover your own authored comment under the same account');
    }
    if (payload.kind !== 'action' ||
        (payload.data.kind !== 'create_thread' && payload.data.kind !== 'reply' && payload.data.kind !== 'edit_message')) {
      throw new Error('Select an original review message body');
    }
    const body = payload.data.data.body;
    return prepare({
      source: Object.freeze({selection: source.selection, event}), principal, body,
      request: action(body), core: target.core, targetSession, guard, checkTarget,
    });
  }, checkTarget);
}
