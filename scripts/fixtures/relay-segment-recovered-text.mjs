/** Publish selected text from the retained alternate through the actual review lane. */
import assert from 'node:assert/strict';

export const recoveredText = 'Competing branch text 🙂 ';

export async function reviewRecoveredText({api, session, queue, transport, source, policy}) {
  const point = offset => ({block: 'p', offset: String(offset), affinity: 'after'});
  const range = end => ({kind: 'text', anchor: point(0), focus: point(end)});
  const prepared = await api.prepareSharedRecoveredBranchTextSuggestion({
    ...policy, source, sourceRange: range(recoveredText.length),
    target: session, targetRange: range(0), targetRevision: session.core.view().revision,
    namespace: 'retained-offline-text', title: 'Recover selected offline text', createdAtMs: '80',
  });
  assert.equal(prepared.plainText, recoveredText);
  assert.deepEqual(prepared.source.selection, source.selection);
  await publishRecoveredSuggestion({api,session,queue,transport,prepared,verify:document=>{
    assert.equal(document.split(recoveredText).length,2);
  }});
}

export async function publishRecoveredSuggestion({api,session,queue,transport,prepared,verify}) {
  const before=session.core.documentJson();
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
      verify(preview.preview.documentJson());
      assert.equal(queue.queueDecision(info.id, 'accept', '81', preview.preview), true);
      assert.equal(session.core.documentJson(), before);
    } finally {
      preview.preview.dispose();
    }
    await sync.flushShared();
    assert.equal(queue.status(info.id).decision.decision, 'accept');
    verify(session.core.documentJson());
    await session.flush();
    return {id: info.id, packet: queue.packet(info.id), decision: queue.status(info.id).decision};
  } finally {
    sync.dispose();
  }
}
