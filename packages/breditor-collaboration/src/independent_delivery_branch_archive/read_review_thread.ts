/** Read exact attributed events from the independently selected archive. */
import {SharedRichEditor} from '../core.js';
import {fields, integer} from '../physical_room_record_cut/policy.js';
import {reviewActor} from '../relay/review_validation.js';
import {decimal, digest} from '../relay/validation.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedReviewId} from '../review_types.js';
import type {SharedIndependentDeliveryBranchArchiveReadOptions} from './contract.js';
import {branchFile} from './framing.js';
import {withArchivedBranch} from './read_native.js';
import type {
  SharedRecoveredBranchReview, SharedRecoveredBranchReviewOptions, SharedRecoveredBranchReviewEvent,
  SharedRecoveredBranchReviewThread, SharedRecoveredBranchReviewThreadOptions,
} from './review_contract.js';

const {readReviewThreadHistory, reviewSnapshot} = SharedRichEditor.prototype;
export const archivedReviewReadFields = ['session', 'wasm', 'checkAuthority'] as const;
export const archivedReviewOptionalFields = ['signal', 'limits'] as const;
export const reviewThreadOffset = (input: unknown): number => integer(input, 0xffffffff);

export function archivedReviewId(input: unknown): SharedReviewId {
  const value = fields(input, ['actor', 'counter']);
  const counter = decimal(value['counter']);
  if (counter === '0') throw new Error('Select a positive original review event');
  return Object.freeze({actor: reviewActor(value['actor']), counter});
}

export function archivedReviewEvent(input: unknown): SharedRecoveredBranchReviewEvent {
  const selected = fields(input, ['thread', 'index', 'id', 'digest']);
  return Object.freeze({
    thread: archivedReviewId(selected['thread']), index: reviewThreadOffset(selected['index']),
    id: archivedReviewId(selected['id']), digest: digest(selected['digest']),
  });
}

/** Inspect the archived thread inventory, including hidden births and original anchor status. */
export async function readSharedRecoveredBranchReview(
  options: SharedRecoveredBranchReviewOptions,
): Promise<SharedRecoveredBranchReview> {
  const value = fields(options, [...archivedReviewReadFields, 'source'], archivedReviewOptionalFields);
  const source = branchFile(value['source']);
  return withArchivedBranch(source, value as unknown as SharedIndependentDeliveryBranchArchiveReadOptions, core =>
    frozen({source: source.selection, view: reviewSnapshot.call(core).view}));
}

export async function readSharedRecoveredBranchReviewThread(
  options: SharedRecoveredBranchReviewThreadOptions,
): Promise<SharedRecoveredBranchReviewThread> {
  const value = fields(options, [...archivedReviewReadFields, 'source', 'thread'], [...archivedReviewOptionalFields, 'offset']);
  const source = branchFile(value['source']);
  const thread = archivedReviewId(value['thread']);
  const offset = reviewThreadOffset(value['offset'] ?? 0);
  return withArchivedBranch(source, value as unknown as SharedIndependentDeliveryBranchArchiveReadOptions, core =>
    frozen({source: source.selection, page: readReviewThreadHistory.call(core, thread, offset)}));
}
