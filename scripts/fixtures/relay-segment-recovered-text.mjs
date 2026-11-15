/** Publish selected text from the retained alternate through the actual review lane. */
import assert from 'node:assert/strict';

export const recoveredText = 'Competing branch text 🙂 ';

export async function reviewRecoveredText({api, session, queue, transport, source, policy}) {
  const point = offset => ({block: 'p', offset: String(offset), affinity: 'after'});
  const range = end => ({kind: 'text', anchor: point(0), focus: point(end)});
  const before = session.core.documentJson();
  const prepared = await api.prepareSharedRecoveredBranchTextSuggestion({
    ...policy, source, sourceRange: range(recoveredText.length),
    target: session, targetRange: range(0), targetRevision: session.core.view().revision,
    namespace: 'retained-offline-text', title: 'Recover selected offline text', createdAtMs: '80',
  });
  assert.equal(prepared.plainText, recoveredText);
  assert.deepEqual(prepared.source.selection, source.selection);
  const info = queue.queuePacket(prepared.packet);
  assert.equal(queue.queuePacket(prepared.packet).id, info.id);
  await queue.flush();
  assert.equal(session.core.documentJson(), before);
  assert.equal(queue.status(info.id).publication, null);

  const sync = new api.SharedSuggestionSync(queue, transport, {autoStart: false});
  try {
    await sync.connect();
    await sync.flushShared();
    assert.ok(queue.status(info.id).publication);
    assert.equal(queue.status(info.id).decision, null);
    assert.equal(session.core.documentJson(), before);
    const preview = session.core.prepareSuggestion(prepared.packet);
    assert.equal(preview.kind, 'ready');
    try {
      assert.ok(preview.preview.documentJson().includes(recoveredText));
      assert.equal(queue.queueDecision(info.id, 'accept', '81', preview.preview), true);
      assert.equal(session.core.documentJson(), before);
    } finally {
      preview.preview.dispose();
    }
    await sync.flushShared();
    assert.equal(queue.status(info.id).decision.decision, 'accept');
    assert.equal(session.core.documentJson().split(recoveredText).length, 2);
    await session.flush();
  } finally {
    sync.dispose();
  }
}
