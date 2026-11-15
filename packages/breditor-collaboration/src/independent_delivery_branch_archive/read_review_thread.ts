/** Read exact attributed events from the independently selected archive. */
import {SharedRichEditor} from '../core.js';
import {fields, integer} from '../physical_room_record_cut/policy.js';
import {reviewActor} from '../relay/review_validation.js';
import {decimal} from '../relay/validation.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedReviewId} from '../review_types.js';
import type {SharedIndependentDeliveryBranchArchiveReadOptions} from './contract.js';
import {branchFile} from './framing.js';
import {withArchivedBranch} from './read_native.js';
import type {SharedRecoveredBranchReviewThread, SharedRecoveredBranchReviewThreadOptions} from './review_contract.js';

const {readReviewThreadHistory} = SharedRichEditor.prototype;
export const archivedReviewReadFields = ['session', 'wasm', 'checkAuthority'] as const;
export const archivedReviewOptionalFields = ['signal', 'limits'] as const;
export const reviewThreadOffset = (input: unknown): number => integer(input, 0xffffffff);

export function archivedReviewId(input: unknown): SharedReviewId {
  const value = fields(input, ['actor', 'counter']);
  const counter = decimal(value['counter']);
  if (counter === '0') throw new Error('Select a positive original review event');
  return Object.freeze({actor: reviewActor(value['actor']), counter});
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
