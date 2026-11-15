/** Exact portable intent record. Reading it never installs a writer or resumes authority. */
import {independentDeliveryParticipantSelection} from '../independent_delivery_participant/policy.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {recordCutJson} from '../physical_room_record_cut/json.js';
import {reviewClock, reviewStorageIdentity} from '../relay/review_validation.js';
import {clock} from '../relay/validation.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {archivedReviewEvent} from './read_review_thread.js';
import type {SharedRecoveredBranchReviewIntent} from './review_contract.js';

export function reviewIntentRecord(input: unknown): SharedRecoveredBranchReviewIntent {
  const value = fields(input, ['format', 'formatVersion', 'source', 'target', 'seed', 'before', 'after']);
  const source = fields(value['source'], ['selection', 'event']);
  const target = fields(value['target'], ['endpoint', 'principal', 'room', 'actor', 'binding', 'documentWriter'],
    ['writerTransport', 'reviewEditing']);
  const identity = reviewStorageIdentity(target as unknown as SharedRecoveredBranchReviewIntent['target']);
  const seed = clock(fields(value['seed'], ['writer', 'through', 'prefixDigest']), '1');
  const before = reviewClock(fields(value['before'], ['actor', 'through', 'prefixDigest']), identity.actor);
  const after = reviewClock(fields(value['after'], ['actor', 'through', 'prefixDigest']), identity.actor);
  const selection = independentDeliveryParticipantSelection(JSON.parse(recordCutJson(source['selection'], 1024 * 1024)));
  const original = selection.identity.source.binding.review;
  if (value['format'] !== 'breditor/recovered-branch-review-intent' || value['formatVersion'] !== 1 ||
      seed.through === '0' || BigInt(after.through) !== BigInt(before.through) + 1n ||
      original.room !== identity.room || original.endpoint !== identity.endpoint || original.binding !== identity.binding) {
    throw new Error('Invalid archived comment recovery intent');
  }
  return frozen({
    format: 'breditor/recovered-branch-review-intent', formatVersion: 1,
    source: {selection, event: archivedReviewEvent(source['event'])}, target: identity, seed, before, after,
  });
}
