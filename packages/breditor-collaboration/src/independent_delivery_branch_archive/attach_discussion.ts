/** Attach the selected original discussion to a new ordinary live discussion by this account. */
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {SharedRichEditor} from '../core.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import {recordCutJson} from '../physical_room_record_cut/json.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import type {SharedReviewAction, SharedReviewTarget, SharedReviewThreadHistoryEntry, SharedReviewThreadHistoryPage} from '../review_types.js';
import type {SharedRecoveredBranchReviewOptions, SharedRecoveredBranchReviewIntent} from './review_contract.js';
import {sameBranchDocumentOrigin} from './document_origin.js';
import {branchFile} from './framing.js';
import {prepareReviewActionIntent} from './prepare_review_action_intent.js';
import {withArchivedBranch} from './read_native.js';
import {archivedReviewId, archivedReviewOptionalFields, archivedReviewReadFields} from './read_review_thread.js';
import {reviewIntentRecord} from './review_intent_record.js';
import {currentReviewTarget} from './review_target.js';
import {DISCUSSION_BYTES, DISCUSSION_MIME, discussionRecord, reviewIdKey} from './discussion_record.js';
import type {SharedPreparedRecoveredDiscussion, SharedRecoveredDiscussionOptions} from './discussion_types.js';

const {captureReviewAnchor, readReviewThreadHistory, reviewSnapshot} = SharedRichEditor.prototype;

export async function prepareSharedRecoveredDiscussion(
  options: SharedRecoveredDiscussionOptions,
  expected?: SharedRecoveredBranchReviewIntent,
): Promise<SharedPreparedRecoveredDiscussion> {
  const value = fields(options, [...archivedReviewReadFields, 'source', 'thread', 'target', 'guard', 'anchor', 'body'],
    archivedReviewOptionalFields);
  const saved = expected === undefined ? undefined : reviewIntentRecord(expected);
  const source = branchFile(value['source']);
  const thread = archivedReviewId(value['thread']);
  const target = currentReviewTarget(source, value['target'] as SharedIndependentDeliverySession, value['guard']);
  const anchor = structuredClone(value['anchor']) as SharedReviewTarget;
  const body = value['body'];
  if (typeof body !== 'string') throw new Error('Choose a plain live discussion message');
  const policy = value as unknown as SharedRecoveredBranchReviewOptions;
  const authority = participantAuthority(policy.checkAuthority);
  const integrity = prepareArchiveIntegrity({
    wasm: policy.wasm, checkAuthority() { authority(); target.checkTarget(); },
    ...(policy.signal ? {signal: policy.signal} : {}),
  });

  const {prepared, file} = await withArchivedBranch(source, policy, core => {
    if (!sameBranchDocumentOrigin(core, target.core)) throw new Error('Recovered discussion belongs to a different native document');
    const projection = reviewSnapshot.call(core).view.threads.find(item => reviewIdKey(item.thread.id) === reviewIdKey(thread));
    if (!projection) throw new Error('Select an original archived discussion');

    const events: SharedReviewThreadHistoryEntry[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const page: SharedReviewThreadHistoryPage = readReviewThreadHistory.call(core, thread, offset);
      events.push(...page.events);
      if (page.nextOffset !== null && page.nextOffset <= offset) throw new Error('Archived discussion history did not advance');
      offset = page.nextOffset;
    }
    const birth = events[0];
    if (!birth) throw new Error('The archived discussion birth is unavailable');
    const request: SharedReviewAction = {
      kind: 'create_thread',
      data: {body, anchorJson: captureReviewAnchor.call(target.core, anchor, target.guard.documentRevision)},
    };
    const prepared = prepareReviewActionIntent(target, {
      selection: source.selection, event: {thread, index: birth.index, id: birth.id, digest: birth.digest},
    }, request, saved);
    const {intent} = prepared;
    const {endpoint, room, binding, actor, principal} = intent.target;
    const record = discussionRecord({
      format: 'breditor/recovered-discussion', formatVersion: 1, room: {endpoint, room, binding}, seed: intent.seed,
      original: {archiveSha256: source.selection.sha256, birthDigest: birth.digest},
      link: {id: {actor, counter: intent.after.through}, principal, digest: intent.after.prefixDigest},
      thread: projection.thread, events,
    });
    const file = new Blob([recordCutJson(record, DISCUSSION_BYTES)], {type: DISCUSSION_MIME});
    return {prepared, file};
  }, target.checkTarget);

  const selection = Object.freeze({bytes: file.size, sha256: await integrity.digest(file)});
  integrity.guard();
  return Object.freeze({...prepared, file, selection});
}
