/** Read only the selected discussion after verifying its file and live native link. */
import type {SharedArchiveFileDigest} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {SharedRichEditor} from '../core.js';
import {independentDeliverySessionPort} from '../independent_delivery/admission.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {parseRecordCutJson} from '../physical_room_record_cut/json.js';
import {fields, hash, integer} from '../physical_room_record_cut/policy.js';
import {clock} from '../relay/validation.js';
import {DISCUSSION_BYTES, discussionRecord, reviewIdKey} from './discussion_record.js';
import type {SharedRecoveredDiscussionAttachment, SharedRecoveredDiscussionReadOptions} from './discussion_types.js';

const {readReviewThreadBirth, writerClockV2} = SharedRichEditor.prototype;

export async function readSharedRecoveredDiscussion(
  input: Blob,
  expected: SharedArchiveFileDigest,
  options: SharedRecoveredDiscussionReadOptions,
): Promise<SharedRecoveredDiscussionAttachment> {
  const pin = fields(expected, ['bytes', 'sha256']);
  const extent = integer(pin['bytes'], DISCUSSION_BYTES, 1);
  const expectedSha = hash(pin['sha256']);
  const file = archiveBlob(input, DISCUSSION_BYTES);
  if (file.size !== extent) throw new Error('Recovered discussion file has a different extent');

  const value = fields(options, ['wasm', 'checkAuthority', 'target'], ['signal']);
  const policy = value as unknown as SharedRecoveredDiscussionReadOptions;
  const port = independentDeliverySessionPort(policy.target);
  const authority = participantAuthority(policy.checkAuthority);
  const integrity = prepareArchiveIntegrity({
    wasm: policy.wasm, checkAuthority() { authority(); port.check(); },
    ...(policy.signal ? {signal: policy.signal} : {}),
  });
  const {bytes, sha256} = await integrity.readAndDigest(file, DISCUSSION_BYTES);
  if (sha256 !== expectedSha) throw new Error('Recovered discussion file differs from the retained digest');
  const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  const record = discussionRecord(parseRecordCutJson(text, DISCUSSION_BYTES));
  integrity.guard();

  const room = port.binding.review;
  const seed = clock(writerClockV2.call(port.core, '1'), '1');
  if (!room || room.endpoint !== record.room.endpoint || room.room !== record.room.room || room.binding !== record.room.binding ||
      seed.through !== record.seed.through || seed.prefixDigest !== record.seed.prefixDigest) {
    throw new Error('Use a reader in the original recovered discussion room');
  }
  const birth = readReviewThreadBirth.call(port.core, record.link.id);
  if (reviewIdKey(birth.id) !== reviewIdKey(record.link.id) || birth.principal !== record.link.principal ||
      birth.digest !== record.link.digest) {
    throw new Error('The original live discussion link is unavailable');
  }
  return record;
}
