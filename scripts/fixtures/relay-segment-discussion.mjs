/** Author under separate relay accounts and attach one thread selected from the retained fork. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const peer = 'discussion-peer';
const peerReply = 'Peer discussion reply';
const peerEdited = 'Peer discussion edit';
const archivedReply = 'Alternate branch discussion reply';
const unrelated = 'Competing branch comment';
const liveBody = 'Continue this archived discussion';

export async function authorPeerReply({api, options, persisted, profile, thread, token, writer}) {
  const identity = await api.registerSharedReviewWriter({
    ...options, principal: peer, actor: peer, documentWriter: writer, getToken: () => token,
  });
  assert.equal(identity.role, 'comment');
  const {credential, observerCredential, ...binding} = identity.identity;
  const session = await api.SharedReviewPersistentSession.open({
    ...persisted, database: persisted.database + '-discussion-peer', writer: binding.documentWriter,
    review: {actor: binding.actor, principal: peer, access: 'comment'}, relay: binding,
    create: () => profile.join_frame('room', binding.documentWriter, identity.frame),
  });
  const sync = new api.SharedReviewRelaySync({
    ...options, identity: {...binding, credential, observerCredential}, storage: session, getToken: () => token,
  });
  try {
    await sync.connect();
    const reply = session.core.dispatchReview({kind: 'reply', data: {thread, body: peerReply}});
    assert.equal(reply.kind, 'committed');
    const edit = session.core.dispatchReview({kind: 'edit_message', data: {message: reply.event, body: peerEdited}});
    assert.equal(edit.kind, 'committed');
    assert.equal(session.core.undoReview().kind, 'committed');
    assert.equal(session.core.redoReview().kind, 'committed');
    await sync.flush();
    assert.equal(sync.state().lastReceipt.through, session.core.localReviewClock().through);
    return {actor: binding.actor, credential, archive: await session.exportBackup()};
  } finally {
    sync.dispose();
    try { await sync.waitForDisconnected(); } finally { await session.close(); }
  }
}

export function authorAlternateDiscussionReply(session, thread) {
  assert.equal(session.core.dispatchReview({kind: 'reply', data: {thread, body: archivedReply}}).kind, 'committed');
}

export async function openAttachedDiscussion({api, target, wasm, directory, link, original}) {
  const file = readFileSync(join(directory, 'recovered-discussion.json'));
  const selection = JSON.parse(readFileSync(join(directory, 'recovered-discussion.selection')));
  const record = await api.readSharedRecoveredDiscussion(new Blob([file]), selection, {wasm, target, checkAuthority() {}});
  assert.doesNotMatch(file.toString(), new RegExp(unrelated));
  return assertAttachedDiscussion(record, target, link, original);
}

function assertAttachedDiscussion(record, target, link, original) {
  assert.deepEqual(record.thread.id, original);
  assert.deepEqual(record.link.id, link);
  assert.equal(record.link.principal, 'owner');
  assert.deepEqual([...new Set(record.events.map(event => event.principal))].sort(), [peer, 'owner']);
  assert.equal(record.events.length, 6);
  assert.deepEqual(record.events.filter(event => event.principal === peer && event.payload.kind === 'visibility')
    .map(event => event.payload.data.visible), [false, true]);
  assert.ok(record.events.some(event => event.principal === peer && event.payload.kind === 'action' &&
    event.payload.data.data.body === peerReply));
  const peerMessage = record.thread.messages.find(message => message.author === peer);
  assert.equal(peerMessage?.versions[0].text, peerEdited);
  assert.ok(record.thread.messages.some(message => message.versions[0]?.text === archivedReply));

  const live = target.core.reviewSnapshot().view.threads.find(({thread}) =>
    thread.id.actor === link.actor && thread.id.counter === link.counter);
  assert.equal(live.thread.messages[0].versions[0].text, liveBody);
  assert.equal(live.thread.messages.length, 1);
  return record;
}

export async function attachArchivedDiscussion({api, session, review, policy, source, original, directory}) {
  const before = session.exportRecovery();
  const prepared = await api.prepareSharedRecoveredDiscussion({
    ...policy, source, thread: original, target: session, guard: session.core.reviewSnapshot(),
    anchor: {kind: 'document'}, body: liveBody,
  });
  writeFileSync(join(directory, 'recovered-discussion.json'), Buffer.from(await prepared.file.arrayBuffer()),
    {flag: 'wx', mode: 0o600, flush: true});
  writeFileSync(join(directory, 'recovered-discussion.selection'), JSON.stringify(prepared.selection),
    {flag: 'wx', mode: 0o600, flush: true});
  await assert.rejects(api.readSharedRecoveredDiscussion(prepared.file, prepared.selection, {
    wasm: policy.wasm, target: session, checkAuthority() {},
  }));
  assert.deepEqual(session.exportRecovery().source, before.source);
  assert.deepEqual(session.exportRecovery().relay.review.accepted, before.relay.review.accepted);
  const result = prepared.commit();
  assert.equal(result.kind, 'committed');
  const link = result.event;
  await review.flush();
  assert.deepEqual(api.inspectSharedRecoveredBranchReviewIntent(session, prepared.intent), {kind: 'acknowledged', event: link});
  assert.deepEqual(session.exportRecovery().source.documentCheckpoint, before.source.documentCheckpoint);
  await openAttachedDiscussion({api, target: session, wasm: policy.wasm, directory, link, original});
  return {directory, link, original};
}


export async function publishAttachedDiscussion({
  api, session, review, policy, source, original, directory, origin, headers, binding, endpoint, archiveSha256, readerToken,
}) {
  const attached = await attachArchivedDiscussion({api, session, review, policy, source, original, directory});
  const {link} = attached;
  const url = new URL(`/recovered-discussions/v1/threads/${link.actor}/${link.counter}`, endpoint);
  const mime = 'application/vnd.breditor.recovered-discussion+json';
  const body = readFileSync(join(directory, 'recovered-discussion.json'));
  const selection = JSON.parse(readFileSync(join(directory, 'recovered-discussion.selection')));
  const file = new Blob([body], {type: mime});
  const reviewHeaders = {...headers, 'X-Breditor-Review': binding};
  const postHeaders = {...reviewHeaders, 'X-Breditor-Archive': archiveSha256, 'Content-Type': mime};
  const refused = async (expected, headers, packet) => {
    const response = await fetch(url, {method: 'POST', headers, body: packet});
    assert.equal(response.status, expected, await response.text());
  };
  const deniedReader = {...postHeaders, Authorization: 'Bearer ' + readerToken, 'X-Breditor-Principal': 'reader'};
  await refused(403, deniedReader, file);
  await refused(400, {...postHeaders, 'X-Breditor-Archive': '0'.repeat(64)}, file);
  const forged = JSON.parse(body);
  forged.events[1].principal = 'owner';
  await refused(400, postHeaders, JSON.stringify(forged));
  const truncated = JSON.parse(body);
  truncated.events.pop();
  await refused(400, postHeaders, JSON.stringify(truncated));
  assert.equal((await fetch(url, {headers: reviewHeaders})).status, 404);
  const preflight = await fetch(url, {method: 'OPTIONS', headers: {Origin: origin,
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': Object.keys(postHeaders)
      .filter(name => name !== 'Origin').join(','),
  }});
  assert.equal(preflight.status, 204);

  const originalFetch = globalThis.fetch;
  const getToken = () => headers.Authorization.slice('Bearer '.length);
  globalThis.fetch = (input, request) => {
    const headers = new Headers(request?.headers);
    headers.set('Origin', origin);
    return originalFetch(input, {...request, headers});
  };
  let entry;
  try {
    const options = {target: session, wasm: policy.wasm, getToken, checkAuthority() {}};
    entry = await api.publishSharedRecoveredDiscussion(file, selection, archiveSha256, options);
    assert.deepEqual(await api.publishSharedRecoveredDiscussion(file, selection, archiveSha256, options), entry);
    assert.deepEqual(await api.discoverSharedRecoveredDiscussion(link, options), entry);
    assert.equal(entry.sha256, createHash('sha256').update(body).digest('hex'));
  } finally {
    globalThis.fetch = originalFetch;
  }
  await refused(400, postHeaders, body.toString() + '\n');
  const readerHeaders = {...reviewHeaders, Authorization: 'Bearer ' + readerToken, 'X-Breditor-Principal': 'reader'};
  assert.equal((await fetch(url, {headers: {...readerHeaders, Authorization: 'Bearer ' + '0'.repeat(64)}})).status, 403);
  assert.equal((await fetch(url, {headers: {...readerHeaders, Origin: 'https://unexpected.invalid'}})).status, 403);
  assert.equal((await fetch(url, {headers: {...readerHeaders, 'X-Breditor-Review': '0'.repeat(64)}})).status, 400);
  unlinkSync(join(directory, 'recovered-discussion.json'));
  unlinkSync(join(directory, 'recovered-discussion.selection'));
  return {link, original, entry};
}

export async function openRelayDiscussion({api, target, wasm, getToken, link, original, entry}) {
  const options = {target, wasm, getToken, checkAuthority() {}};
  const selected = await api.discoverSharedRecoveredDiscussion(link, options);
  assert.deepEqual(selected, entry);
  await assert.rejects(api.loadSharedRecoveredDiscussion({...selected, sha256: '0'.repeat(64)}, options));
  const record = await api.loadSharedRecoveredDiscussion(selected, options);
  assert.doesNotMatch(JSON.stringify(record), new RegExp(unrelated));
  return assertAttachedDiscussion(record, target, link, original);
}
