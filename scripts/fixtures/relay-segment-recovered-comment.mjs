/** Restore one original author's archived comment after the alternate survived both handovers. */
import assert from 'node:assert/strict';

const body = 'Competing branch comment';

export function assertRecoveredComment(threads, recovered) {
  const matches = threads.filter(({thread}) =>
    !thread.hidden && thread.messages.some(message => message.versions.some(version => version.text === body)));
  assert.equal(matches.length, 1);
  const {thread, targets} = matches[0];
  assert.deepEqual(thread.id, recovered);
  assert.equal(thread.author, 'owner');
  assert.equal(thread.messages[0].author, 'owner');
  assert.equal(targets[0].resolution.kind, 'resolved');
  assert.equal(targets[0].resolution.target.kind, 'selection');
}

export async function recoverArchivedComment({api, session, review, policy, source, thread}) {
  const accepted = session.core.documentJson();
  const before = session.exportRecovery();
  const {page} = await api.readSharedRecoveredBranchReviewThread({...policy, source, thread});
  const [original] = page.events;
  assert.equal(original.principal, 'owner');
  assert.equal(original.payload.data.data.body, body);
  const paragraph = JSON.parse(accepted).root.children.find(node => node.type === 'breditor/paragraph' &&
    node.children.some(run => run.kind === 'text' && run.text.startsWith('Competing branch text')));
  assert.ok(paragraph, 'The accepted recovered paragraph is available to anchor the comment');
  const block = paragraph.properties['breditor/block-id'];
  const point = offset => ({block, offset, affinity: 'after'});
  const context = await api.prepareSharedRecoveredBranchReviewMessage({
    ...policy, source, event: {thread, index: original.index, id: original.id, digest: original.digest},
    target: session, guard: session.core.reviewSnapshot(),
    destination: {kind: 'new_thread', target: {
      kind: 'selection', selection: {kind: 'text', anchor: point('0'), focus: point('1')},
    }},
  });
  assert.deepEqual(session.exportRecovery(), before);
  const outcome = context.commit();
  assert.equal(outcome.kind, 'committed');
  assert.notDeepEqual(outcome.event, original.id);
  assert.throws(() => context.commit(), /already committed/);
  await review.flush();
  assert.equal(review.state().pending, false);
  assert.equal(review.state().lastReceipt.through, outcome.event.counter);
  assertRecoveredComment(session.core.reviewSnapshot().view.threads, outcome.event);
  assert.equal(session.core.documentJson(), accepted);
  await session.flush();
  return outcome.event;
}
