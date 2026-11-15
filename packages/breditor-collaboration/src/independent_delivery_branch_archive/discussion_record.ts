/** Closed, independently pinned display data for one native archived discussion. */
import {fields, hash, integer, rows, MAX_ROOM_RECORD_CUT_JSON_BYTES} from '../physical_room_record_cut/policy.js';
import {clock, digest, endpoint} from '../relay/validation.js';
import {reviewBinding} from '../relay/review_validation.js';
import type {SharedReviewAction, SharedReviewThread, SharedReviewThreadHistoryEntry} from '../review_types.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedRecoveredDiscussionAttachment} from './discussion_types.js';
import {archivedReviewId} from './read_review_thread.js';

export const DISCUSSION_BYTES = MAX_ROOM_RECORD_CUT_JSON_BYTES;
export const DISCUSSION_MIME = 'application/vnd.breditor.recovered-discussion+json';
// A participant archive admits the original or segmented native review family.
const eventLimit = 65_536;

export const reviewIdKey = (id: {actor: string; counter: string}) => JSON.stringify([id.actor, id.counter]);
const fail = () => new Error('Invalid recovered discussion record');

function plain(input: unknown, maximum: number): string {
  if (typeof input !== 'string' || !input.trim() || new TextEncoder().encode(input).length > maximum) throw fail();
  return input;
}
function principal(input: unknown): string {
  const value = plain(input, 256);
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw fail();
  return value;
}
const anchor = (input: unknown) => plain(input, 256 * 1024);
const body = (input: unknown) => plain(input, 16 * 1024);
function bool(input: unknown): boolean {
  if (typeof input !== 'boolean') throw fail();
  return input;
}

function action(input: unknown): SharedReviewAction {
  const record = fields(input, ['kind', 'data']);
  const kind = record['kind'];
  const data = record['data'];
  switch (kind) {
    case 'create_thread': {
      const row = fields(data, ['anchorJson', 'body']);
      return {kind, data: {anchorJson: anchor(row['anchorJson']), body: body(row['body'])}};
    }
    case 'reply': {
      const row = fields(data, ['thread', 'body']);
      return {kind, data: {thread: archivedReviewId(row['thread']), body: body(row['body'])}};
    }
    case 'edit_message': {
      const row = fields(data, ['message', 'body']);
      return {kind, data: {message: archivedReviewId(row['message']), body: body(row['body'])}};
    }
    case 'retract_message': {
      const row = fields(data, ['message']);
      return {kind, data: {message: archivedReviewId(row['message'])}};
    }
    case 'set_thread_state': {
      const row = fields(data, ['thread', 'resolved']);
      return {kind, data: {thread: archivedReviewId(row['thread']), resolved: bool(row['resolved'])}};
    }
    case 'reanchor_thread': {
      const row = fields(data, ['thread', 'anchorJson']);
      return {kind, data: {thread: archivedReviewId(row['thread']), anchorJson: anchor(row['anchorJson'])}};
    }
    default: throw fail();
  }
}

function entry(input: unknown, index: number): SharedReviewThreadHistoryEntry {
  const row = fields(input, ['index', 'id', 'principal', 'digest', 'payload']);
  if (integer(row['index'], eventLimit - 1) !== index) throw fail();
  const base = {index, id: archivedReviewId(row['id']), principal: principal(row['principal']), digest: digest(row['digest'])};
  const payload = fields(row['payload'], ['kind', 'data']);
  if (payload['kind'] === 'action') return {...base, payload: {kind: 'action', data: action(payload['data'])}};
  if (payload['kind'] !== 'visibility') throw fail();
  const visibility = fields(payload['data'], ['target', 'visible']);
  return {...base, payload: {kind: 'visibility', data: {
    target: archivedReviewId(visibility['target']), visible: bool(visibility['visible']),
  }}};
}

function materialized(input: unknown): SharedReviewThread {
  const row = fields(input, ['id', 'author', 'anchors', 'state', 'messages', 'hidden']);
  const state = row['state'];
  if (state !== 'open' && state !== 'resolved' && state !== 'conflicted') throw fail();
  return {
    id: archivedReviewId(row['id']), author: principal(row['author']),
    anchors: rows(row['anchors'], eventLimit).map(anchor), state,
    messages: rows(row['messages'], eventLimit).map(message => {
      const row = fields(message, ['id', 'author', 'versions']);
      return {id: archivedReviewId(row['id']), author: principal(row['author']),
        versions: rows(row['versions'], eventLimit).map(version => {
          const row = fields(version, ['event', 'principal', 'text']);
          return {event: archivedReviewId(row['event']), principal: principal(row['principal']),
            text: row['text'] === null ? null : body(row['text'])};
        })};
    }),
    hidden: bool(row['hidden']),
  };
}

function checkThread(thread: SharedReviewThread, events: readonly SharedReviewThreadHistoryEntry[], birthDigest: string): void {
  const [birth] = events;
  const id = reviewIdKey(thread.id);
  if (!birth || reviewIdKey(birth.id) !== id || birth.digest !== birthDigest || birth.principal !== thread.author ||
      birth.payload.kind !== 'action' || birth.payload.data.kind !== 'create_thread') throw fail();
  const births = new Map<string, string>();
  const actions = new Set<string>();
  const seen = new Map<string, SharedReviewThreadHistoryEntry>();
  for (const event of events) {
    const key = reviewIdKey(event.id);
    if (seen.has(key)) throw fail();
    const payload = event.payload;
    if (payload.kind === 'visibility') {
      if (!actions.has(reviewIdKey(payload.data.target))) throw fail();
    } else {
      const action = payload.data;
      if (action.kind === 'create_thread' && event.index !== 0) throw fail();
      if ('thread' in action.data && reviewIdKey(action.data.thread) !== id) throw fail();
      if ('message' in action.data && !births.has(reviewIdKey(action.data.message))) throw fail();
      if (action.kind === 'create_thread' || action.kind === 'reply') births.set(key, event.principal);
      actions.add(key);
    }
    seen.set(key, event);
  }
  for (const message of thread.messages) {
    const messageId = reviewIdKey(message.id);
    if (births.get(messageId) !== message.author) throw fail();
    for (const version of message.versions) {
      const original = seen.get(reviewIdKey(version.event));
      if (!original || original.principal !== version.principal || original.payload.kind !== 'action') throw fail();
      const action = original.payload.data;
      if (action.kind === 'create_thread' || action.kind === 'reply') {
        if (reviewIdKey(original.id) !== messageId || version.text !== action.data.body) throw fail();
      } else if (action.kind === 'edit_message' || action.kind === 'retract_message') {
        const text = action.kind === 'edit_message' ? action.data.body : null;
        if (reviewIdKey(action.data.message) !== messageId || version.text !== text) throw fail();
      } else throw fail();
    }
  }
}

export function discussionRecord(input: unknown): SharedRecoveredDiscussionAttachment {
  const value = fields(input, ['format', 'formatVersion', 'room', 'seed', 'original', 'link', 'thread', 'events']);
  if (value['format'] !== 'breditor/recovered-discussion' || value['formatVersion'] !== 1) throw fail();
  const room = fields(value['room'], ['endpoint', 'room', 'binding']);
  const seed = clock(fields(value['seed'], ['writer', 'through', 'prefixDigest']), '1');
  if (seed.through === '0') throw fail();
  const original = fields(value['original'], ['archiveSha256', 'birthDigest']);
  const link = fields(value['link'], ['id', 'principal', 'digest']);
  const thread = materialized(value['thread']);
  const events = rows(value['events'], eventLimit).map(entry);
  const birthDigest = digest(original['birthDigest']);
  checkThread(thread, events, birthDigest);
  return frozen({
    format: 'breditor/recovered-discussion', formatVersion: 1,
    room: {endpoint: endpoint(plain(room['endpoint'], 4096)), room: plain(room['room'], 200), binding: reviewBinding(room['binding'])},
    seed, original: {archiveSha256: hash(original['archiveSha256']), birthDigest},
    link: {id: archivedReviewId(link['id']), principal: principal(link['principal']), digest: digest(link['digest'])},
    thread, events,
  });
}
