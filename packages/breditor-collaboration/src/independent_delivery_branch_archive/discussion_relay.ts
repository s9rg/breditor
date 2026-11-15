/** The live review binding selects the relay catalog. The native birth and file pin select its data. */
import type {SharedArchiveFileDigest} from '../archive_integrity/contract.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {independentDeliverySessionPort} from '../independent_delivery/admission.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {fields, hash, integer, text} from '../physical_room_record_cut/policy.js';
import {accountToken} from '../relay/registration.js';
import {SharedRelayError, decimal, digest, timeout} from '../relay/validation.js';
import type {SharedReviewId} from '../review_types.js';
import {DISCUSSION_MIME, reviewIdKey} from './discussion_record.js';
import type {
  SharedRecoveredDiscussionAttachment, SharedRecoveredDiscussionRelayEntry, SharedRecoveredDiscussionRelayOptions,
} from './discussion_types.js';
import {readSharedRecoveredDiscussion} from './read_discussion.js';
import {archivedReviewId} from './read_review_thread.js';

const relayBytes = 8 * 1024 * 1024;
const entryBytes = 4096;
const fail = () => new SharedRelayError('recovered_discussion_protocol');

function entry(input: unknown): SharedRecoveredDiscussionRelayEntry {
  const row = fields(input, ['link', 'sequence', 'sha256', 'bytes']);
  const link = fields(row['link'], ['id', 'principal', 'digest']);
  const sequence = decimal(row['sequence']);
  if (sequence === '0') throw fail();
  return Object.freeze({
    link: Object.freeze({
      id: Object.freeze(archivedReviewId(link['id'])), principal: text(link['principal'], 128), digest: digest(link['digest']),
    }),
    sequence, sha256: hash(row['sha256']), bytes: integer(row['bytes'], relayBytes, 1),
  });
}

async function request(
  options: SharedRecoveredDiscussionRelayOptions, thread: SharedReviewId,
  path: '' | '/file', contentType: string, maximum: number,
  publication?: {file: Blob; archiveSha256: string},
): Promise<Blob | null> {
  const port = independentDeliverySessionPort(options.target);
  const authority = participantAuthority(options.checkAuthority);
  const identity = port.binding.review;
  if (!identity) throw fail();
  const abort = new AbortController();
  const cancel = () => abort.abort();
  const milliseconds = timeout(options.requestTimeoutMs);
  const timer = setTimeout(cancel, milliseconds);
  const signal = options.signal;
  const check = () => {
    if (abort.signal.aborted) throw new SharedRelayError('disconnected');
    authority();
    port.check();
  };
  signal?.addEventListener('abort', cancel, {once: true});
  if (signal?.aborted) cancel();
  let response: Response | undefined;
  try {
    check();
    const token = await accountToken(options.getToken, abort.signal, milliseconds);
    check();
    const url = new URL(identity.endpoint);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = url.pathname.replace(/\/[^/]*\/?$/, '/') +
      'recovered-discussions/v1/threads/' + encodeURIComponent(thread.actor) + '/' + thread.counter + path;
    const principal = identity.principal;
    const headers = new Headers({
      Authorization: 'Bearer ' + token, 'X-Breditor-Review': identity.binding,
      ...(/^[\x20-\x7e]+$/.test(principal) ? {'X-Breditor-Principal': principal}
        : {'X-Breditor-Principal-Utf8': encodeURIComponent(principal)}),
    });
    if (publication) {
      headers.set('X-Breditor-Archive', publication.archiveSha256);
      headers.set('Content-Type', DISCUSSION_MIME);
    }
    response = await fetch(url, {
      method: publication ? 'POST' : 'GET', headers, signal: abort.signal,
      credentials: 'omit', redirect: 'error', cache: 'no-store',
      ...(publication ? {body: publication.file} : {}),
    });
    check();
    if (!publication && response.status === 404) return null;
    if (response.status === 403) throw new SharedRelayError('permission_denied');
    if (response.status === 503) throw new SharedRelayError('storage_unavailable');
    if (!response.ok) throw new SharedRelayError('recovered_discussion_rejected');
    if (response.headers.get('content-type') !== contentType || !response.body) throw fail();
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d{1,10}$/.test(length) || Number(length) > maximum)) throw fail();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const stream = response.body.getReader();
    try {
      let total = 0;
      while (true) {
        const next = await stream.read();
        check();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > maximum) throw fail();
        chunks.push(next.value);
      }
      if (total === 0 || (length !== null && total !== Number(length))) throw fail();
    } finally {
      stream.releaseLock();
    }
    return new Blob(chunks, {type: contentType});
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    abort.abort();
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
  }
}

function localRead(options: SharedRecoveredDiscussionRelayOptions) {
  return {target: options.target, checkAuthority: options.checkAuthority, wasm: options.wasm,
    ...(options.signal ? {signal: options.signal} : {})};
}

async function catalogEntry(file: Blob, thread: SharedReviewId): Promise<SharedRecoveredDiscussionRelayEntry> {
  const envelope = fields(JSON.parse(await file.text()), ['format', 'formatVersion', 'entry']);
  if (envelope['format'] !== 'breditor/relay-recovered-discussion' || envelope['formatVersion'] !== 1) throw fail();
  const value = entry(envelope['entry']);
  if (reviewIdKey(value.link.id) !== reviewIdKey(thread)) throw fail();
  return value;
}

/** Publish exact prepared bytes after the owner has flushed the new native review thread. */
export async function publishSharedRecoveredDiscussion(
  file: Blob, selection: SharedArchiveFileDigest, archiveSha256: string,
  options: SharedRecoveredDiscussionRelayOptions,
): Promise<SharedRecoveredDiscussionRelayEntry> {
  const packet = archiveBlob(file, relayBytes);
  const source = hash(archiveSha256);
  const attached = await readSharedRecoveredDiscussion(packet, selection, localRead(options));
  const response = await request(options, attached.link.id, '', 'application/json', entryBytes,
    {file: packet, archiveSha256: source});
  if (!response) throw fail();
  const saved = await catalogEntry(response, attached.link.id);
  if (saved.sha256 !== selection.sha256 || saved.bytes !== packet.size ||
      saved.link.digest !== attached.link.digest || saved.link.principal !== attached.link.principal) throw fail();
  return saved;
}

/** Discover the immutable file pin for one known live review thread. */
export async function discoverSharedRecoveredDiscussion(
  thread: SharedReviewId, options: SharedRecoveredDiscussionRelayOptions,
): Promise<SharedRecoveredDiscussionRelayEntry | null> {
  const id = archivedReviewId(thread);
  const response = await request(options, id, '', 'application/json', entryBytes);
  return response ? catalogEntry(response, id) : null;
}

/** Download the exact selected file and verify its live link against the reader's native state. */
export async function loadSharedRecoveredDiscussion(
  selected: SharedRecoveredDiscussionRelayEntry, options: SharedRecoveredDiscussionRelayOptions,
): Promise<SharedRecoveredDiscussionAttachment> {
  const expected = entry(selected);
  const response = await request(options, expected.link.id, '/file', DISCUSSION_MIME, expected.bytes);
  if (!response) throw new SharedRelayError('recovered_discussion_missing');
  const result = await readSharedRecoveredDiscussion(response, {
    bytes: expected.bytes, sha256: expected.sha256,
  }, localRead(options));
  if (reviewIdKey(result.link.id) !== reviewIdKey(expected.link.id) ||
      result.link.digest !== expected.link.digest || result.link.principal !== expected.link.principal) throw fail();
  return result;
}
