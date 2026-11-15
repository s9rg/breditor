/** Bootstrap a new Reader from the serving relay and reopen its durable local copy. */
import assert from 'node:assert/strict';
import {recoveredPixel} from './review-assets/pixels.mjs';
import {assertRecoveredRich} from './relay-segment-recovered-rich.mjs';

export async function checkColdReviewReader({
  api, options, origin, database, profile, assetUrl, recovered, threads, delivered, originalVersion,
}) {
  const originalFetch = globalThis.fetch;
  const endpoint = new URL(options.endpoint);
  globalThis.fetch = (input, request) => {
    if (new URL(input).host !== endpoint.host) return originalFetch(input, request);
    const headers = new Headers(request?.headers);
    headers.set('Origin', origin);
    return originalFetch(input, {...request, headers});
  };
  let session, observer, comments, sync, revisions, versions, queue;
  try {
    const observerRegistration = await api.registerSharedSuggestionObserver(options);
    assert.equal(observerRegistration.permissions.canAccept, false);
    const writer = observerRegistration.identity.documentWriter;
    const {credential, observerCredential, ...reviewBinding} = (await api.registerSharedReviewObserver({
      ...options, documentWriter: writer, actor: 'fresh-review-reader',
    })).identity;
    const reviewIdentity = {...reviewBinding, credential, ...(observerCredential ? {observerCredential} : {})};
    const suggestionIdentity = api.sharedSuggestionObserverQueueIdentity(observerRegistration.identity);
    const revisionsBinding = await api.discoverSharedSuggestionRevisions({...options, identity: suggestionIdentity});
    await assert.rejects(api.discoverSharedSuggestionRevisions({
      ...options, identity: {...suggestionIdentity, binding: '0'.repeat(64)},
    }), {code: 'suggestion_lane_mismatch'});
    const versionDiscovery = await api.discoverSharedDocumentVersions({...options, documentWriter: writer});
    assert.equal(versionDiscovery.canPublish, false);
    const {endpoint, principal, room, writerTransport, getToken} = options;
    const open = {
      database, room, writer, review: {actor: reviewBinding.actor, principal, access: 'read_only'},
      richLanguage: 3, history: 'explicit', rangeEditing: 'original', selectionEditing: 'original',
      searchHistory: null, reviewedHistory: null, readOnly: true,
      create: () => profile.join_frame(room, writer, observerRegistration.frame),
      documentHistory: {kind: 'segmented-v1', initialGenerations: {root: 'root', active: 'one'},
        restoreSegmented: value => profile.restore_segmented(room, value)},
      reviewHistory: {kind: 'segmented-v1', initialGenerations: {root: 'root', active: 'one'}},
      binding: {document: {endpoint, principal, room, writer, writerTransport}, review: reviewBinding},
      retained: {
        suggestions: {identity: suggestionIdentity, ownedHistory: null},
        revisions: revisionsBinding,
        versions: versionDiscovery.identity,
      },
    };
    session = await api.SharedIndependentDeliverySession.open(open);
    assert.equal(session.recovered, false);
    queue = await session.openSuggestionQueue();
    observer = api.createSharedIndependentSuggestionObserverRelay(session, {
      identity: observerRegistration.identity, getToken, autoConnect: false, suggestionRevisions: revisionsBinding,
    });
    comments = api.createSharedIndependentReviewRelaySync(session, {
      identity: reviewIdentity, getToken, autoConnect: false, flushDocument: () => observer.flush(),
    });
    sync = new api.SharedSuggestionSync(queue, observer, {autoStart: false});
    revisions = await session.openSuggestionRevisions({transport: observer});
    versions = await session.openVersionCatalog({getToken});
    await sync.connect();
    await sync.flushShared();
    await comments.connect();
    await comments.flush();
    await revisions.connect();
    await versions.connect();

    assertRecoveredRich(session.core.documentJson(), recovered.generation);
    assert.deepEqual(session.core.reviewSnapshot().view.threads, threads);
    for (const [id, packet, decision] of [
      [recovered.id, recovered.packet, recovered.decision],
      [delivered.pending.decision, delivered.pending.packets[1], delivered.decision],
    ]) {
      assert.deepEqual(sync.entries().find(entry => entry.publication.suggestion.id === id)?.decision, decision);
      assert.equal(await sync.loadSuggestion(id), packet);
      assert.deepEqual(queue.status(id).decision, decision);
      assert.equal(queue.status(id).localSaved, true);
    }
    assert.deepEqual(revisions.entries().find(entry => entry.revision.id === delivered.pending.revision), delivered.revision);
    const revision = await revisions.loadRevision(delivered.pending.revision);
    assert.equal(revision.packet, delivered.pending.packets[2]);
    assert.equal(revision.previousPacket, delivered.pending.packets[0]);
    assert.equal(revision.source.kind, 'verified');
    assert.equal(await versions.loadVersion(originalVersion.id), originalVersion.packet);
    assert.equal(await versions.loadVersion(delivered.pending.version), delivered.pending.packets[3]);
    const image = await fetch(assetUrl, {headers: {
      Authorization: 'Bearer ' + await getToken(new AbortController().signal), 'X-Breditor-Principal': principal,
    }});
    assert.equal(image.status, 200);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), recoveredPixel);
    assert.equal(session.relayProgress().document.accepted.through, '0');
    assert.equal(session.relayProgress().document.receipt, null);
    assert.equal(comments.state().localThrough, '0');
    assert.equal(comments.state().pending, false);
    assert.equal(comments.state().lastReceipt, null);

    await session.flush();
    sync.dispose();
    observer.dispose();
    comments.dispose();
    await Promise.all([observer.waitForDisconnected(), comments.waitForDisconnected()]);
    await revisions.close();
    await versions.close();
    await queue.close();
    const exact = session.exportRecovery();
    await session.close();
    session = await api.SharedIndependentDeliverySession.open({
      ...open, create() { throw new Error('A cold Reader must reopen the stored native history'); },
    });
    assert.equal(session.recovered, true);
    assert.deepEqual(session.exportRecovery(), exact);
    assertRecoveredRich(session.core.documentJson(), recovered.generation);
    assert.deepEqual(session.core.reviewSnapshot().view.threads, threads);
    queue = await session.openSuggestionQueue();
    assert.deepEqual(queue.status(recovered.id).decision, recovered.decision);
    assert.equal(queue.packet(recovered.id), recovered.packet);
    await queue.close();
    return {coldReaderReopens: 1, coldReaderThreads: threads.length, coldReaderReviewReceipts: 3,
      coldReaderVersionPackets: 2, coldReaderRevisionPackets: 1};
  } finally {
    sync?.dispose();
    observer?.dispose();
    comments?.dispose();
    await Promise.allSettled([
      observer?.waitForDisconnected(), comments?.waitForDisconnected(), revisions?.discardAndClose(), versions?.discardAndClose(),
    ]);
    try {
      await queue?.discardAndClose();
    } finally {
      try {
        await session?.discardAndClose();
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  }
}
