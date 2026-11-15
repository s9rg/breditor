/** Author under separate relay accounts and attach one thread selected from the retained fork. */
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const peer = 'discussion-peer';
const peerReply = 'Peer discussion reply';
const peerEdited = 'Peer discussion edit';
const archivedReply = 'Alternate branch discussion reply';
const unrelated = 'Competing branch comment';
const liveBody = 'Continue this archived discussion';

export async function authorPeerReply({api, options, persisted, profile, thread, token}) {
  const identity = await api.registerSharedReviewWriter({
    ...options, principal: peer, actor: peer, getToken: () => token,
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
  assert.doesNotMatch(file.toString(), new RegExp(unrelated));

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
  assert.deepEqual(session.exportRecovery(), before);
  const result = prepared.commit();
  assert.equal(result.kind, 'committed');
  const link = result.event;
  await review.flush();
  assert.deepEqual(api.inspectSharedRecoveredBranchReviewIntent(session, prepared.intent), {kind: 'acknowledged', event: link});
  assert.deepEqual(session.exportRecovery().source.documentCheckpoint, before.source.documentCheckpoint);
  await openAttachedDiscussion({api, target: session, wasm: policy.wasm, directory, link, original});
  return {directory, link, original};
}
