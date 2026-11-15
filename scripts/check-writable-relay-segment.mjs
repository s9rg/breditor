/** Original SDK transport against a real saturated predecessor and its selected successor. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {WebSocket as Socket} from 'undici';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {pixel, proposalAsset, proposalPixel, secondAsset, secondPixel, recoveredAsset, recoveredPixel} from './fixtures/review-assets/pixels.mjs';
import {startSegmentHandoverHost} from './fixtures/relay-segment-handover-host.mjs';
import {captureParticipant, checkRecoveredAlternate, checkRetainedSelected, proposalAlias, reopenParticipant, withWrongReviewReceipt} from './fixtures/relay-segment-participant.mjs';
import {captureClientRaster, resumeClientRaster} from './fixtures/relay-segment-client-raster.mjs';
import {recoveredText, reviewRecoveredText} from './fixtures/relay-segment-recovered-text.mjs';
import {assertRecoveredRich, authorRecoveredRich, reviewRecoveredRich} from './fixtures/relay-segment-recovered-rich.mjs';
import {checkColdReviewReader} from './fixtures/relay-segment-cold-review-reader.mjs';
import {recoverArchivedComment} from './fixtures/relay-segment-recovered-comment.mjs';
import {recoveryReviewReplySocket} from './fixtures/recovery-review-reply-loss.mjs';
import {attachArchivedDiscussion, authorAlternateDiscussionReply, authorPeerReply, checkDiscussionReadPaths, longDiscussionEdits, publishAttachedDiscussion} from './fixtures/relay-segment-discussion.mjs';
import {recoveryFactory} from './fixtures/independent-delivery-recovery/session.mjs';
import {installCollaborationConsumer} from './fixtures/installed-collaboration-consumer.mjs';
import {sourceEvidence, saveEvidence} from './candidate-release/evidence.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const origin = 'http://127.0.0.1:49785';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function writeJournal(parent, name, owner, journal) {
  const bytes = Buffer.from(journal);
  writeFileSync(join(parent, name), bytes, {flag: 'wx', mode: 0o600});
  return {owner, bytes: bytes.length, sha256: [...Buffer.from(sha(bytes), 'hex')]};
}

function selectClientJournals(parent, identity, pairedBackup, peerWriter, peerCheckpoint, kind, peerDiscussion) {
  const paired = {kind, writer: identity.documentWriter, actor: identity.actor};
  const peer = peerDiscussion ? {kind: 'pairedSession', writer: peerWriter, actor: peerDiscussion.actor}
    : {kind: 'document', writer: peerWriter, family: 'original'};
  return [
    writeJournal(parent, 'journal-0.json', paired, pairedBackup),
    writeJournal(parent, 'journal-1.json', peer, peerCheckpoint),
  ];
}

function readRetainedClientJournals(parent, expected, directory = 'client-journals', restoredRoot = 'restored') {
  const root = join(parent, restoredRoot, directory);
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest, expected);
  const stream = readFileSync(join(root, 'journals.bin'));
  let offset = 0;
  const originals = manifest.map(pin => {
    const part = stream.subarray(offset, offset + pin.bytes);
    offset += pin.bytes;
    assert.equal(part.length, pin.bytes);
    assert.equal(sha(part), Buffer.from(pin.sha256).toString('hex'));
    return pin.owner.kind === 'independentParticipant' ? part : part.toString('utf8');
  });
  assert.equal(offset, stream.length);
  return originals;
}

async function run(mode, {distribution, rich}, executable, parent, journalKind, terminalReceipts, opaque, competing, carryForward, multipleAlternates, reviewRecovered, richRecovered, coldReviewReader, recoverComment, recoverCommentIntent, recoverDiscussion, relayDiscussion, portableSeal) {
  const participant = journalKind === 'independentParticipant';
  const archiveImage = opaque ? proposalAlias : proposalAsset;
  const independentDelivery = journalKind !== 'pairedSession';
  const runtime = join(distribution, 'runtime');
  const api = await import(pathToFileURL(join(distribution, 'index.js')).href);
  const richApi = await import(pathToFileURL(rich).href);
  const wasm = await import(pathToFileURL(join(runtime, 'breditor_shared.js')).href);
  const wasmBytes = readFileSync(join(runtime, 'breditor_shared_bg.wasm'));
  await wasm.default({module_or_path: wasmBytes});
  const reset = environment();
  const previousSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  const loss = recoverCommentIntent ? {armed: false, durable: null, submissions: 0} : null;
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: loss ? recoveryReviewReplySocket(Socket, origin, loss) : class extends Socket {
      constructor(url) { super(url, {headers: {Origin: origin}}); }
    },
  });
  const token = randomBytes(32).toString('hex');
  const readerToken = coldReviewReader ? randomBytes(32).toString('hex') : undefined;
  const peerDiscussionToken = recoverDiscussion ? randomBytes(32).toString('hex') : undefined;
  if (peerDiscussionToken) writeFileSync(join(parent, 'fixture-discussion-peer'), '', {flag: 'wx'});
  writeFileSync(join(parent, 'auth.json'), JSON.stringify({
    format: 'breditor/relay-auth', formatVersion: 1, origins: [origin],
    accounts: [{principal: 'owner', tokenHash: [...createHash('sha256').update(token).digest()]},
      ...(readerToken ? [{principal: 'reader', tokenHash: [...createHash('sha256').update(readerToken).digest()]}] : []),
      ...(peerDiscussionToken ? [{principal: 'discussion-peer', tokenHash: [...createHash('sha256').update(peerDiscussionToken).digest()]}] : [])],
  }), {mode: 0o600});
  writeFileSync(join(parent, 'asset.png'), pixel, {mode: 0o600});
  let host, profile, session, document, review, portableUploads, failure;
  const connect = {getToken: () => token, autoConnect: false, requestTimeoutMs: 15_000};
  const stopClients = async () => {
    document?.dispose();
    review?.dispose();
    await Promise.all([document?.waitForDisconnected(), review?.waitForDisconnected()]);
    document = undefined;
    review = undefined;
  };
  try {
    host = await startSegmentHandoverHost(executable, [parent, 'start', '127.0.0.1:0']);
    const address = host.address;
    const options = {...connect, endpoint: 'ws://' + address + '/ws', principal: 'owner',
      room: 'room', writerTransport: 'atomic-v2', saveIdentity() {}};
    const registered = await api.registerSharedRelayWriter(options);
    const peer = await api.registerSharedRelayWriter(peerDiscussionToken
      ? {...options, principal: 'discussion-peer', getToken: () => peerDiscussionToken} : options);
    const comment = await api.registerSharedReviewWriter({
      ...options, actor: 'segment-author', documentWriter: registered.identity.writer,
    });
    const {credential: _credential, observerCredential: _observer, ...binding} = comment.identity;
    const configuration = readFileSync(join(parent, 'profile.json'), 'utf8');
    profile = wasm.SharedRichProfile.from_standard_configuration_json_v3(configuration);
    const persisted = {
      database: 'writable-segment-' + mode, room: 'room', writer: binding.documentWriter,
      review: {actor: binding.actor, principal: 'owner', access: 'moderate'},
      relay: binding, richLanguage: 3, history: 'explicit',
      rangeEditing: 'original', selectionEditing: 'original',
      create: () => profile.join_frame('room', binding.documentWriter, comment.frame),
      restore: input => profile.restore('room', input),
    };
    const {credential: _documentSecret, ...documentBinding} = registered.identity;
    const lanes = JSON.parse(readFileSync(join(parent, 'delivery-lanes.json'), 'utf8'));
    const {writer: _writer, ...retainedIdentity} = documentBinding;
    const deliveryOptions = {
      database: persisted.database, room: persisted.room, writer: persisted.writer,
      review: persisted.review, richLanguage: 3, history: 'explicit', rangeEditing: 'original',
      selectionEditing: 'original', searchHistory: null, reviewedHistory: null, readOnly: false,
      create: persisted.create,
      documentHistory: {kind: 'segmented-v1', initialGenerations: {root: 'root', active: 'one'},
        restoreSegmented: input => profile.restore_segmented('room', input)},
      reviewHistory: {kind: 'segmented-v1', initialGenerations: {root: 'root', active: 'one'}},
      binding: {document: documentBinding, review: binding},
      retained: {
        suggestions: {identity: {...retainedIdentity, documentWriter: persisted.writer,
          binding: lanes.suggestions.binding, effectWriter: lanes.suggestions.effectWriter}, ownedHistory: null},
        revisions: {binding: lanes.revisions.binding},
        versions: {...retainedIdentity, documentWriter: persisted.writer, binding: lanes.versions.binding},
      },
    };
    const open = () => independentDelivery
      ? api.SharedIndependentDeliverySession.open(deliveryOptions)
      : api.SharedReviewPersistentSession.open(persisted);
    const attachOutboxes = async (owner, getToken = () => { throw new Error('Outbox inspection must stay offline'); }) => {
      const queue = await owner.openSuggestionQueue();
      const transport = api.createSharedIndependentRelaySync(owner, {
        identity: registered.identity, autoConnect: false, getToken,
        suggestions: {binding: lanes.suggestions.binding, effectWriter: lanes.suggestions.effectWriter},
        suggestionRevisions: {binding: lanes.revisions.binding},
      });
      const revisions = await owner.openSuggestionRevisions({transport});
      const versions = await owner.openVersionCatalog({getToken});
      return {queue, revisions, versions, transport};
    };
    const closeOutboxes = async ({queue, revisions, versions, transport}) => {
      try {
        await revisions.close();
        await versions.close();
        await queue.close();
      } finally {
        transport.dispose();
        await transport.waitForDisconnected();
      }
    };
    const queueWork = async (label, image, generation) => {
      const {queue, revisions, versions, transport} = await attachOutboxes(session);
      try {
        const draft = text => ({scope: 'commands', edit: {kind: 'commands', data: [
          {kind: 'insert_text', data: {block: 'p', offset: 0, text}},
        ]}});
        const before = session.core.documentJson();
        const proposal = queue.propose(label + ' original', '1', {scope: 'commands',
          edit: {kind: 'commands', data: [{kind: 'replace_image', data: {
            block: 'image-block', asset: image, generation,
          }}]}});

        const revision = revisions.revise({previousSuggestionId: proposal.id,
          title: label + ' revision', createdAtMs: '2', draft: draft(label + ' revised ')});
        const decision = queue.propose(label + ' decision', '3', draft(label + ' must stay unaccepted '));
        queue.queueDecision(decision.id, 'reject', '4');
        const version = versions.saveVersion(label + ' catalog version', '5');
        await revisions.flush();
        await versions.flush();
        await queue.flush();
        assert.equal(session.core.documentJson(), before);
        return {proposal: proposal.id, decision: decision.id, revision: revision.id, version: version.id,
          packets: [queue.packet(proposal.id), queue.packet(decision.id), revisions.packet(revision.id), versions.versionPacket(version.id)]};
      } finally {
        await closeOutboxes({queue, revisions, versions, transport});
      }
    };
    const attach = async () => {
      if (independentDelivery) {
        document = api.createSharedIndependentRelaySync(session, {...connect, identity: registered.identity});
        review = api.createSharedIndependentReviewRelaySync(session, {
          ...connect, identity: comment.identity, flushDocument: () => document.flush(),
        });
      } else {
        document = new api.SharedRelaySync(session.core, {
          ...connect, identity: registered.identity, persistLocal: () => session.flush(),
        });
        review = new api.SharedReviewRelaySync({
          ...connect, identity: comment.identity, storage: session, flushDocument: () => document.flush(),
        });
      }
      await document.connect();
      await document.flush();
      await review.connect();
      await review.flush();
    };
    const edit = text => session.core.dispatch({commands: [
      {kind: 'insert_text', data: {block: 'p', offset: 0, text}},
    ]});
    const post = body => {
      const result = session.core.dispatchReview({
        kind: 'create_thread', data: {
          anchorJson: session.core.captureReviewAnchor({kind: 'document'}), body,
        },
      });
      assert.equal(result.kind, 'committed');
      return result.event;
    };
    session = await open();
    await attach();
    edit('Accepted before segment ');
    const originalDiscussion = post('Accepted comment before segment');
    await document.flush();
    await review.flush();
    let peerDiscussion, protectedPeerReview, discussionUsesNativeTranscript;
    const extraDiscussionEdits = relayDiscussion ? longDiscussionEdits : 0;
    if (peerDiscussionToken) {
      peerDiscussion = await authorPeerReply({
        api, options, persisted, profile, thread: originalDiscussion, token: peerDiscussionToken, writer: peer.identity.writer,
        extraEdits: extraDiscussionEdits,
      });
      protectedPeerReview = {actor: peerDiscussion.actor, credential: peerDiscussion.credential};
      await stopClients();
      await attach();
      const {paged, native} = checkDiscussionReadPaths(session.core, originalDiscussion, 5 + extraDiscussionEdits,
        process.env.BREDITOR_EXPECT_DISCUSSION_TRANSCRIPT);
      assert.equal(paged.filter(event => event.principal === 'discussion-peer').length, 4 + extraDiscussionEdits);
      discussionUsesNativeTranscript = native;
    }
    const rasterUrl = 'http://' + address + '/assets/sha256:' + sha(pixel);
    const headers = {Origin: origin, Authorization: 'Bearer ' + token, 'X-Breditor-Principal': 'owner'};
    const catalog = 'http://' + address + '/document-versions/v1/';
    const described = await fetch(catalog + 'descriptor', {headers});
    assert.equal(described.status, 200);
    const {descriptor} = await described.json();
    const catalogHeaders = {...headers, 'X-Breditor-Catalog': descriptor.binding};
    const packet = session.core.captureVersion('Before linked handoffs', 'owner', '1794680000000');
    const published = await fetch(catalog + 'publish', {
      method: 'POST', headers: {...catalogHeaders, 'Content-Type': 'application/json'}, body: packet,
    });
    assert.equal(published.status, 200);
    const {admission} = await published.json();
    assert.equal(admission.kind, 'durable');
    const packetUrl = catalog + 'packets/' + encodeURIComponent(admission.entry.version.id);
    const deliverWork = async (pending, cacheOlderVersion) => {
      let mayDeliverOutboxes = false;
      const {queue, revisions, versions, transport} = await attachOutboxes(session, () => {
        if (!mayDeliverOutboxes) throw new Error('Outbox recovery must stay offline');
        return token;
      });
      assert.deepEqual([queue.packet(pending.proposal), queue.packet(pending.decision),
        revisions.packet(pending.revision), versions.versionPacket(pending.version)], pending.packets);
      assert.equal(queue.status(pending.proposal).publish, true);
      assert.equal(queue.status(pending.decision).intent.retry, true);
      assert.equal(revisions.status(pending.revision).retry, true);
      assert.equal(versions.versionStatus(pending.version).queued, true);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (input, options) => {
        if (!String(input).startsWith(catalog)) return originalFetch(input, options);
        const headers = new Headers(options?.headers);
        headers.set('Origin', origin);
        return originalFetch(input, {...options, headers});
      };
      const before = session.core.documentJson();
      const suggestions = new api.SharedSuggestionSync(queue, transport, {autoStart: false});
      try {
        mayDeliverOutboxes = true;
        await suggestions.connect();
        await suggestions.flushShared();
        assert.ok(queue.status(pending.proposal).publication);
        assert.equal(queue.status(pending.decision).decision?.decision, 'reject');
        await revisions.connect();
        assert.ok(revisions.status(pending.revision).receipt);
        await versions.connect();
        await versions.flushShared();
        assert.ok(versions.versionStatus(pending.version).accepted);
        if (cacheOlderVersion) {
          assert.equal(await versions.loadVersion(cacheOlderVersion), packet);
        }
        assert.equal(session.core.documentJson(), before);
        await session.flush();
        return {
          pending,
          publication: queue.status(pending.proposal).publication,
          decision: queue.status(pending.decision).decision,
          revision: revisions.status(pending.revision).receipt,
          version: versions.versionStatus(pending.version).accepted,
        };
      } finally {
        suggestions.dispose();
        try {
          await closeOutboxes({queue, revisions, versions, transport});
        } finally {
          globalThis.fetch = originalFetch;
        }
      }
    };
    const first = document.state().serverReceiptSequence;
    assert.ok(BigInt(first) > 64n);
    await stopClients();
    await host.crash();
    host = undefined;
    edit('Offline over handoff ');
    post('Offline comment over handoff');
    await session.flush();
    const offline = session.exportRecovery();
    await session.close();
    session = await open();
    assert.deepEqual(session.exportRecovery(), offline);

    const handoff = command => {
      const result = JSON.parse(execFileSync(executable, [parent, command, address], {
        encoding: 'utf8', timeout: 90_000,
      }).trim());
      assert.equal(result.kind, 'handedOff');
      return BigInt(result.records);
    };
    const switched = handoff('handoff');
    host = await startSegmentHandoverHost(executable, [parent, 'successor', address]);
    await attach();
    assert.equal(document.state().pending, false);
    assert.equal(review.state().pending, false);
    assert.ok(BigInt(document.state().serverReceiptSequence) >= switched);
    assert.match(session.core.documentJson(), /Offline over handoff/);
    assert.equal(session.core.reviewSnapshot().view.threads.length, 2);
    const visibleThreads = () => session.core.reviewSnapshot().view.threads.filter(({thread}) => !thread.hidden);
    await stopClients();
    await host.crash();
    host = undefined;
    edit('Offline over second handoff ');
    post('Offline comment over second handoff');
    await session.flush();
    const advanced = handoff('handoff-again');
    assert.ok(advanced > switched);
    host = await startSegmentHandoverHost(executable, [parent, 'final', address]);
    await attach();
    assert.equal(document.state().pending, false);
    assert.equal(review.state().pending, false);
    assert.ok(BigInt(document.state().serverReceiptSequence) >= advanced);
    assert.equal(visibleThreads().length, 3);
    await stopClients();
    const rasterBefore = await fetch(rasterUrl, {headers});
    assert.equal(rasterBefore.status, 200);
    assert.deepEqual(Buffer.from(await rasterBefore.arrayBuffer()), pixel);
    const terminal = terminalReceipts
      ? await deliverWork(await queueWork('Already delivered', 'sha256:' + sha(pixel),
        'terminal-proposal-image'), admission.entry.version.id)
      : null;
    const competingSeed = competing ? session.exportRecovery() : null;
    if (competingSeed) {
      edit('Accepted branch text ');
      post('Accepted branch comment');
      assert.equal(session.core.undoReview().kind, 'committed');
      await attach();
      assert.equal(document.state().pending, false);
      assert.equal(review.state().pending, false);
      await stopClients();
    }
    edit('Offline before portable restore ');
    post('Offline comment before portable restore');
    session.core.dispatch({commands: [{kind: 'replace_image', data: {
      block: 'image-block', asset: secondAsset, generation: 'offline-image-replacement',
    }}]});
    assert.equal(session.core.documentJson().includes(secondAsset), true);
    if (independentDelivery) {
      await session.retainVersion(session.core.captureVersion('Offline image version', 'owner', '1794681000000'));
    } else {
      session.saveVersion('Offline image version', '1794681000000');
    }
    assert.equal(session.core.undo(), true);
    assert.equal(session.core.documentJson().includes(secondAsset), false);
    const pending = independentDelivery
      ? await queueWork('Pending', participant ? archiveImage : secondAsset, 'queued-proposal-image')
      : null;
    if (independentDelivery) {
      await session.sealDocumentGeneration('two');
      await session.sealReviewGeneration('two');
    }
    await session.flush();
    const queuedAcrossTakeover = session.exportRecovery();
    const localVersions = independentDelivery ? queuedAcrossTakeover.source.versions : queuedAcrossTakeover.versions;
    assert.equal(localVersions.length, 1);
    const peerDocument = profile.join_frame('room', peer.identity.writer, peer.frame);
    const uploads = [
      await captureClientRaster(richApi, parent, registered.identity.writer, 'pending'),
      await captureClientRaster(richApi, parent, peer.identity.writer, 'cancelled'),
    ];
    const portable = participant ? await captureParticipant(api, richApi, session, uploads[0], archiveImage) : null;
    const archive = portable?.archive ?? (independentDelivery
      ? JSON.stringify(queuedAcrossTakeover) : await session.exportBackup());
    const journalPins = selectClientJournals(parent, binding, archive,
      peer.identity.writer, peerDiscussion?.archive ?? peerDocument.checkpoint(), journalKind, peerDiscussion);
    let incomingBranch, retainedBranches, recoveredAlternateHistoryLanes, additionalAlternate;
    if (competingSeed) {
      await session.close();
      session = await api.SharedIndependentDeliverySession.restoreRecovery({
        ...deliveryOptions, database: deliveryOptions.database + '-competing', recovery: competingSeed,
        writerRecovery: 'host-reacquired',
      });
      if (richRecovered) authorRecoveredRich(session.core);
      else edit(reviewRecovered ? recoveredText : 'Competing branch text ');
      if (recoverDiscussion) authorAlternateDiscussionReply(session, originalDiscussion);
      const archivedComment = post('Competing branch comment');
      await session.flush();
      const competingRecovery = session.exportRecovery();
      const competingFile = await captureParticipant(
        api, richApi, session, uploads[0], richRecovered ? recoveredAsset : undefined,
        'handover-competing-assets', richRecovered ? recoveredPixel : undefined,
      );
      await session.close();
      if (multipleAlternates) {
        session = await api.SharedIndependentDeliverySession.restoreRecovery({
          ...deliveryOptions, database: deliveryOptions.database + '-additional-alternate',
          recovery: competingSeed, writerRecovery: 'host-reacquired',
        });
        edit('Competing branch text from another offline copy ');
        post('Another competing comment');
        await session.flush();
        const recovery = session.exportRecovery();
        const file = await captureParticipant(
          api, richApi, session, uploads[0], undefined, 'handover-additional-assets',
        );
        additionalAlternate = {
          pin: writeJournal(parent, 'additional-alternate.bin', journalPins[0].owner, file.archive),
          bytes: file.archive, selection: file.selection, recovery,
        };
        await session.close();
      }
      session = await open();
      assert.deepEqual(session.exportRecovery(), queuedAcrossTakeover);
      const readPolicy = {wasm, session: recoveryFactory(deliveryOptions), checkAuthority() {}};
      const branches = await api.buildSharedIndependentDeliveryBranchArchive({
        ...readPolicy,
        current: {file: new Blob([portable.archive]), selection: portable.selection},
        incoming: {file: new Blob([competingFile.archive]), selection: competingFile.selection},
      });
      writeFileSync(join(parent, 'retained-branches.bin'), Buffer.from(await branches.file.arrayBuffer()), {
        flag: 'wx', mode: 0o600,
      });
      retainedBranches = {
        selection: branches.selection, readPolicy, incoming: competingFile.archive,
        incomingSelection: competingFile.selection, competingRecovery, archivedComment,
      };
      const cold = await api.readSharedIndependentDeliveryBranchArchive(branches.file, branches.selection, readPolicy);
      assert.equal(cold.comparison.document.relation, 'diverged');
      assert.equal(cold.comparison.review.relation, 'diverged');
      const retained = Buffer.from(await cold.incoming.file.arrayBuffer());
      assert.deepEqual(retained, competingFile.archive);
      incomingBranch = writeJournal(parent, 'incoming-branch.bin', journalPins[0].owner, retained);
    }
    const progress = independentDelivery ? queuedAcrossTakeover.relay.review : queuedAcrossTakeover.progress;
    assert.ok(progress.sequence);
    assert.ok(progress.accepted);
    const wrongProgress = {...progress, sequence: (BigInt(progress.sequence) + 1n).toString()};
    const wrongBackup = participant
      ? withWrongReviewReceipt(archive, wrongProgress)
      : independentDelivery ? JSON.stringify({...queuedAcrossTakeover, relay: {...queuedAcrossTakeover.relay, review: wrongProgress}})
      : await api.encodeSharedPairedSessionBackup(JSON.parse(archive).identity, {...queuedAcrossTakeover, progress: wrongProgress});
    const wrongReceipt = writeJournal(parent, 'wrong-receipt.json', journalPins[0].owner, wrongBackup);
    peerDocument.free();
    const localUrl = 'http://' + address + '/assets/' + encodeURIComponent(secondAsset);
    const absent = await fetch(localUrl, {headers});
    assert.equal(absent.status, 404);
    await absent.arrayBuffer();
    const proposalRasterUrl = 'http://' + address + '/assets/' + encodeURIComponent(proposalAsset);
    if (participant) {
      const missing = await fetch(proposalRasterUrl, {headers});
      assert.equal(missing.status, 404);
      await missing.arrayBuffer();
    }
    const selectedUploads = participant ? uploads.slice(1) : uploads;
    const assetMapping = opaque ? {
      asset: archiveImage, generation: 'queued-proposal-image',
      selectedContent: proposalAsset, differentContent: 'sha256:' + sha(pixel),
    } : undefined;
    const captured = await host.handover(token, registered.identity, comment.identity, peer.identity,
      selectedUploads.map(upload => upload.pin), journalPins, wrongReceipt, assetMapping, incomingBranch, protectedPeerReview);
    if (competing) {
      assert.equal(captured.branchAdmissions, 2);
      assert.equal(captured.branchCutRefusals, 3);
      assert.equal(captured.incomingBranchRefusals, 1);
      assert.equal(captured.preservedAlternateArchives, 1);
      assert.equal(captured.alteredAlternateRefusals, 1);
    }
    assert.equal(captured.participantUnmapped, opaque ? 1 : 0);
    assert.equal(captured.participantMappingRefusals, opaque ? 2 : 0);
    assert.equal(captured.registrationRefusals, peerDiscussion ? 4 : 3);
    assert.equal(captured.providerRasters, participant ? 3 : 2);
    assert.equal(captured.clientJournalRasterBindings, terminal ? 4 : independentDelivery ? 3 : 2);
    if (terminal) assert.ok(captured.retainedPackets > 1);
    else assert.equal(captured.retainedPackets, 1);
    assert.equal(captured.clientRasters, participant ? 3 : 2);
    assert.equal(captured.clientArchives, 2);
    assert.equal(captured.missingArchiveRefusals, 1);
    assert.equal(captured.nativeJournals, 3);
    assert.equal(captured.pairedBackups, independentDelivery ? 0 : 1);
    assert.equal(captured.independentDeliveries, journalKind === 'independentDelivery' ? 1 : 0);
    assert.equal(captured.participantArchives, participant ? 1 : 0);
    assert.equal(captured.participantRasterBindings, terminal ? 4 : participant ? 3 : 0);
    assert.equal(captured.wrongReceiptRefusals, 1);
    assert.equal(captured.missingJournalRefusals, 2);
    assert.deepEqual(session.exportRecovery(), queuedAcrossTakeover);
    const old = await fetch(rasterUrl, {headers});
    assert.equal(old.status, 403);
    await old.arrayBuffer();
    await host.crash();
    host = undefined;
    for (const directory of ['source-native', 'successor', 'final', 'rasters',
      ...uploads.map(upload => 'client-' + upload.pin.writer + '.backup'),
      ...journalPins.map((_, index) => `journal-${index}.json`), 'wrong-receipt.json',
      ...(competing ? ['incoming-branch.bin'] : [])]) {
      renameSync(join(parent, directory), join(parent, 'offline-' + directory));
    }
    await session.close();
    session = undefined;
    host = await startSegmentHandoverHost(executable, [parent, 'restore', address], token, competing, carryForward);
    if (retainedBranches) {
      const surviving = await api.readSharedIndependentDeliveryBranchArchive(
        new Blob([readFileSync(join(parent, 'retained-branches.bin'))]),
        retainedBranches.selection, retainedBranches.readPolicy,
      );
      const [alternate] = readRetainedClientJournals(parent, [incomingBranch], 'client-alternatives');
      assert.deepEqual(alternate, retainedBranches.incoming);
      assert.deepEqual(JSON.parse(readFileSync(join(parent, 'exported-alternate-pins.json'), 'utf8')),
        [incomingBranch]);
      assert.deepEqual(readFileSync(join(parent, 'exported-alternates', '0.participant')), alternate);
      assert.deepEqual(Buffer.from(await surviving.incoming.file.arrayBuffer()), alternate);
      recoveredAlternateHistoryLanes = await checkRecoveredAlternate(
        api, {...deliveryOptions, database: deliveryOptions.database + '-retained-alternate'},
        alternate, retainedBranches.incomingSelection, retainedBranches.competingRecovery,
      );
    }
    const [backup, peerJournal] = readRetainedClientJournals(parent, journalPins);
    assert.deepEqual(backup, archive);
    if (portable) {
      const restored = await fetch(proposalRasterUrl, {headers});
      assert.equal(restored.status, 200);
      assert.deepEqual(Buffer.from(await restored.arrayBuffer()), proposalPixel);
    }
    const database = persisted.database + '-retained-journals';
    let liveSourceDatabase = database;
    if (portable) {
      const restored = await reopenParticipant(
        api, {...deliveryOptions, database}, backup, portable.selection, uploads[0], archiveImage,
      );
      session = restored.session;
      portableUploads = restored.uploads;
    } else if (independentDelivery) {
      session = await api.SharedIndependentDeliverySession.restoreRecovery({
        ...deliveryOptions, database, recovery: JSON.parse(backup), writerRecovery: 'host-reacquired',
      });
    } else {
      session = await api.SharedReviewPersistentSession.restoreBackup({
        ...persisted, database, backupJson: backup, writerRecovery: 'host-reacquired',
      });
    }
    assert.deepEqual(session.exportRecovery(), queuedAcrossTakeover);
    await attach();
    assert.equal(document.state().pending, false);
    assert.equal(review.state().pending, false);
    assert.ok(BigInt(document.state().serverReceiptSequence) >= BigInt(captured.records));
    assert.equal(visibleThreads().length, 4);
    if (competing) assert.doesNotMatch(session.core.documentJson(), /Competing branch text/);
    let restoredRoot = 'restored';
    let retainedAlternatePins = competing ? [incomingBranch] : [];
    let carryEvidence, relocationEvidence, attachedDiscussion;
    if (relayDiscussion) {
      const source = {file: new Blob([retainedBranches.incoming]), selection: retainedBranches.incomingSelection};
      attachedDiscussion = await publishAttachedDiscussion({
        api, session, review, policy: retainedBranches.readPolicy, source, original: originalDiscussion,
        directory: parent, origin, headers, binding: binding.binding, endpoint: 'http://' + address,
        archiveSha256: Buffer.from(incomingBranch.sha256).toString('hex'), readerToken,
        eventCount: 6 + extraDiscussionEdits,
      });
      assert.equal(visibleThreads().length, 5);
      // Replay the attachment from this active WAL before carrying it into a materialized cut.
      await stopClients();
      await host.crash();
      host = undefined;
      host = await startSegmentHandoverHost(executable, [parent, restoredRoot, address], token, false, true);
      const {actor, counter} = attachedDiscussion.link;
      const attachmentUrl = new URL(`/recovered-discussions/v1/threads/${actor}/${counter}`, rasterUrl);
      const response = await fetch(attachmentUrl, {
        headers: {...headers, 'X-Breditor-Review': binding.binding},
      });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).entry, attachedDiscussion.entry);
    }
    if (carryForward) {
      await stopClients();
      await session.flush();
      const recovery = session.exportRecovery();
      const selectedUpload = {
        ...uploads[0], path: join(parent, restoredRoot, 'client-uploads', uploads[0].pin.writer + '.uploads'),
      };
      assert.deepEqual(Buffer.from(await (await portableUploads.exportBackup()).arrayBuffer()),
        readFileSync(selectedUpload.path));
      const current = await captureParticipant(
        api, richApi, session, selectedUpload, archiveImage, 'carry-selected-assets',
      );
      const updatedPins = [
        writeJournal(parent, 'carry-journal-0.json', journalPins[0].owner, current.archive),
        writeJournal(parent, 'carry-journal-1.json', journalPins[1].owner, peerJournal),
      ];
      assert.deepEqual(updatedPins[1], journalPins[1]);
      const peerUpload = readFileSync(join(parent, restoredRoot, 'client-uploads', uploads[1].pin.writer + '.uploads'));
      assert.equal(sha(peerUpload), uploads[1].pin.sha256);
      writeFileSync(join(parent, 'carry-peer.uploads'), peerUpload, {flag: 'wx', mode: 0o600});

      const result = await host.carry(token, registered.identity, comment.identity, peer.identity,
        uploads[1].pin, updatedPins, incomingBranch, additionalAlternate?.pin, protectedPeerReview,
        relayDiscussion, portableSeal);
      assert.equal(result.alternateOmissionRefusals, 1);
      let retainedBackupHistory;
      if (relayDiscussion) {
        assert.equal(result.discussionBackup, true);
        assert.equal(result.incompleteDiscussionBackupRefusals, 2);
        assert.equal(result.publishedDiscussionSources, 1);
        assert.deepEqual(result.retainedBackup, {
          selectedJournals: 2,
          alternateJournals: 1,
          standaloneUploads: 1,
        });
        assert.equal(result.retainedBackupNativePredecessors, 3);
        assert.deepEqual(readFileSync(join(parent, 'carry-capture', 'discussion-sources', '0.participant')),
          retainedBranches.incoming);
        assert.equal(result.publishedDiscussionSourceRefusals, 2);
        assert.deepEqual(readFileSync(join(parent, 'published-discussion-sources', '0.participant')),
          retainedBranches.incoming);
      }
      assert.ok(BigInt(result.records) > BigInt(captured.records));
      const superseded = await fetch(rasterUrl, {headers});
      assert.equal(superseded.status, 403);
      await superseded.arrayBuffer();
      await host.crash();
      host = undefined;
      await session.close();
      session = undefined;
      portableUploads.close();
      portableUploads = undefined;
      if (relayDiscussion) {
        const recoveredRoot = 'retained-room-restored';
        const [selectedBytes] = readRetainedClientJournals(parent, journalPins, 'client-journals', recoveredRoot);
        assert.deepEqual(selectedBytes, portable.archive);
        const [alternateBytes] = readRetainedClientJournals(parent, [incomingBranch], 'client-alternatives', recoveredRoot);
        assert.deepEqual(alternateBytes, retainedBranches.incoming);
        const selectedHistoryLanes = await checkRetainedSelected(
          api, {...deliveryOptions, database: database + '-retained-selected'}, {
            bytes: selectedBytes, selection: portable.selection, upload: uploads[0],
            assetKey: archiveImage, redoImage: secondAsset,
          }, queuedAcrossTakeover,
        );
        const alternateHistoryLanes = await checkRecoveredAlternate(
          api, {...deliveryOptions, database: database + '-retained-alternate'},
          alternateBytes, retainedBranches.incomingSelection, retainedBranches.competingRecovery,
        );
        retainedBackupHistory = {selectedHistoryLanes, alternateHistoryLanes};
      }
      for (const name of [restoredRoot, 'exported-alternates', 'retained-branches.bin',
        'carry-journal-0.json', 'carry-journal-1.json', 'carry-peer.uploads',
        ...(additionalAlternate ? ['additional-alternate.bin'] : [])]) {
        renameSync(join(parent, name), join(parent, 'retired-' + name));
      }
      if (portableSeal) {
        assert.equal(result.portableSeal.nativePredecessors, 4);
        const originalPaths = [
          'carried', 'carry-capture', 'capture', 'base.archive', 'base.checkpoint',
          'linked.archive', 'linked.checkpoint',
        ];
        for (const name of originalPaths) {
          renameSync(join(parent, name), join(parent, 'relocation-retired-' + name));
        }
        renameSync(join(parent, 'portable-relocation-source'), join(parent, 'portable-relocation-arrived'));
        restoredRoot = 'relocated';
        const documents = [
          {principal: 'owner', writer: registered.identity.writer, credential: registered.identity.credential},
          {principal: peer.identity.principal, writer: peer.identity.writer, credential: peer.identity.credential},
        ];
        const reviews = [
          {principal: 'owner', actor: comment.identity.actor, credential: comment.identity.credential},
          {principal: peer.identity.principal, ...protectedPeerReview},
        ];
        const {selection} = await startSegmentHandoverHost(
          executable, [parent, 'relocated-before-listen', address], token,
          false, false, {kind: 'activate', documents, reviews},
        );
        host = await startSegmentHandoverHost(executable, [parent, restoredRoot, address], token,
          false, false, {kind: 'resume', expectedUnservedSelection: selection});
        relocationEvidence = {
          sealedPortableActivations: 1,
          unservedActivationExits: 1,
          unservedActivationResumes: 1,
          sealedCaptureRefusals: 1,
          sealedNativePredecessors: result.portableSeal.nativePredecessors,
          retiredOriginalPaths: originalPaths.length,
          freshlyVerifiedProtectedRegistrations: documents.length + reviews.length,
        };
      } else {
        restoredRoot = 'carried';
        host = await startSegmentHandoverHost(executable, [parent, restoredRoot, address], token);
      }
      const carriedAlternates = [{pin: incomingBranch, bytes: retainedBranches.incoming,
        selection: retainedBranches.incomingSelection, recovery: retainedBranches.competingRecovery}];
      if (additionalAlternate) carriedAlternates.push(additionalAlternate);
      carriedAlternates.sort((a, b) => Buffer.compare(Buffer.from(a.pin.sha256), Buffer.from(b.pin.sha256)));
      assert.equal(result.carriedAlternateArchives, carriedAlternates.length);
      retainedAlternatePins = carriedAlternates.map(({pin}) => pin);
      const alternateBytes = readRetainedClientJournals(parent, retainedAlternatePins,
        'client-alternatives', restoredRoot);
      let alternateHistoryLanes = 0;
      for (const [index, alternate] of carriedAlternates.entries()) {
        assert.deepEqual(alternateBytes[index], alternate.bytes);
        alternateHistoryLanes += await checkRecoveredAlternate(
          api, {...deliveryOptions, database: deliveryOptions.database + '-carried-alternate-' + index},
          alternateBytes[index], alternate.selection, alternate.recovery,
        );
      }
      const [currentBytes] = readRetainedClientJournals(parent, updatedPins, 'client-journals', restoredRoot);
      assert.deepEqual(currentBytes, current.archive);
      liveSourceDatabase = database + '-carried';
      const restored = await reopenParticipant(api, {...deliveryOptions, database: liveSourceDatabase},
        currentBytes, current.selection, uploads[0], archiveImage);
      session = restored.session;
      portableUploads = restored.uploads;
      assert.deepEqual(session.exportRecovery(), recovery);
      await attach();
      assert.equal(document.state().pending, false);
      assert.equal(review.state().pending, false);
      assert.equal(visibleThreads().length, 4 + Number(relayDiscussion));
      assert.doesNotMatch(session.core.documentJson(), /Competing branch text/);
      carryEvidence = {alternateOmissionRefusals: result.alternateOmissionRefusals,
        ...(relayDiscussion ? {
          discussionBackup: result.discussionBackup,
          incompleteDiscussionBackupRefusals: result.incompleteDiscussionBackupRefusals,
          publishedDiscussionSources: result.publishedDiscussionSources,
          publishedDiscussionSourceRefusals: result.publishedDiscussionSourceRefusals,
          retainedBackup: result.retainedBackup,
          retainedBackupHistory,
          retainedBackupNativePredecessors: result.retainedBackupNativePredecessors,
        } : {}),
        carriedAlternateArchives: result.carriedAlternateArchives, carriedAlternateHistoryLanes: alternateHistoryLanes,
        ...(additionalAlternate ? {sameOwnerSubstitutionRefusals: result.alternateOmissionRefusals} : {}),
        advancedAcceptedCut: true};
    }
    const accepted = session.core.documentJson();
    assert.equal(session.core.undo(), true);
    assert.equal(session.core.undoReview().kind, 'committed');
    await document.flush();
    await review.flush();
    await stopClients();
    await host.crash();
    host = await startSegmentHandoverHost(executable, [parent, restoredRoot, address], token);
    const clientUploadReceipts = await resumeClientRaster(
      richApi, api, parent, address, origin, token, uploads[0], portableUploads, restoredRoot,
    );
    portableUploads = undefined;
    const cancelledUploadReceipts = await resumeClientRaster(
      richApi, api, parent, address, origin, token, uploads[1], undefined, restoredRoot,
    );
    assert.equal(cancelledUploadReceipts, 0);
    await attach();
    assert.doesNotMatch(session.core.documentJson(), /Offline before portable restore/);
    assert.match(session.core.documentJson(), /Offline over second handoff/);
    assert.match(session.core.documentJson(), /Offline over handoff/);
    assert.equal(visibleThreads().length, 3 + Number(relayDiscussion));
    assert.equal(session.core.redo(), true);
    assert.equal(session.core.redoReview().kind, 'committed');
    await document.flush();
    await review.flush();
    assert.equal(session.core.documentJson(), accepted);
    assert.equal(visibleThreads().length, 4 + Number(relayDiscussion));
    assert.equal(session.core.redo(), true);
    assert.equal(session.core.documentJson().includes(secondAsset), true);
    await document.flush();
    assert.equal(document.state().pending, false);
    const redoRaster = await fetch(localUrl, {headers});
    assert.equal(redoRaster.status, 200);
    assert.deepEqual(Buffer.from(await redoRaster.arrayBuffer()), secondPixel);
    const raster = await fetch(rasterUrl, {headers});
    assert.equal(raster.status, 200);
    assert.deepEqual(Buffer.from(await raster.arrayBuffer()), pixel);
    const retainedPacket = await fetch(packetUrl, {headers: catalogHeaders});
    assert.equal(retainedPacket.status, 200);
    assert.equal(await retainedPacket.text(), packet);
    if (pending) await stopClients();
    if (terminal) {
      const {queue, revisions, versions, transport} = await attachOutboxes(session);
      try {
        assert.deepEqual(queue.status(terminal.pending.proposal).publication, terminal.publication);
        assert.deepEqual(queue.status(terminal.pending.decision).decision, terminal.decision);
        assert.deepEqual(revisions.status(terminal.pending.revision).receipt, terminal.revision);
        assert.deepEqual(versions.versionStatus(terminal.pending.version).accepted, terminal.version);
        assert.equal(queue.status(terminal.pending.proposal).publish, false);
        assert.equal(queue.status(terminal.pending.decision).intent?.retry ?? false, false);
        assert.equal(revisions.status(terminal.pending.revision).retry, false);
        assert.equal(versions.versionStatus(terminal.pending.version).queued, false);
      } finally {
        await closeOutboxes({queue, revisions, versions, transport});
      }
    }
    const delivered = pending ? await deliverWork(pending) : undefined;
    let coldReaderEvidence, recoveredComment;
    if (reviewRecovered) {
      const retained = readRetainedClientJournals(parent, retainedAlternatePins, 'client-alternatives', restoredRoot);
      const sourceIndex = retainedAlternatePins.findIndex(pin => Buffer.from(pin.sha256).equals(Buffer.from(incomingBranch.sha256)));
      assert.ok(sourceIndex >= 0);
      const source = {file: new Blob([retained[sourceIndex]]), selection: retainedBranches.incomingSelection};
      const parts = await attachOutboxes(session, () => token);
      const assetUrl = new URL('/assets/' + encodeURIComponent(recoveredAsset), rasterUrl);
      let recovered;
      try {
        const context = {api, session, queue: parts.queue, transport: parts.transport,
          source,
          policy: retainedBranches.readPolicy};
        if (richRecovered) recovered = await reviewRecoveredRich({...context, assetUrl, headers});
        else await reviewRecoveredText(context);
      } finally {
        await closeOutboxes(parts);
      }
      assert.equal(visibleThreads().length, 4 + Number(relayDiscussion));
      if (recoverDiscussion && !relayDiscussion) {
        await attach();
        attachedDiscussion = await attachArchivedDiscussion({
          api, session, review, policy: retainedBranches.readPolicy, source, original: originalDiscussion, directory: parent,
        });
        assert.equal(visibleThreads().length, 5);
        await stopClients();
      }
      const intentPath = join(parent, 'recovered-comment-intent.json');
      let recoveryRequest, durableSourceAfterLoss;
      if (recoverComment) {
        await attach();
        const result = await recoverArchivedComment({
          api, session, review, policy: retainedBranches.readPolicy, source, thread: retainedBranches.archivedComment,
          loss, intentPath,
        });
        recoveredComment = result.event;
        recoveryRequest = result.request;
        assert.equal(visibleThreads().length, 5);
        await stopClients();
        if (loss) {
          durableSourceAfterLoss = session.exportRecovery();
          await session.close();
          session = undefined;
        }
      }
      await host.crash();
      host = undefined;
      host = await startSegmentHandoverHost(executable, [parent, restoredRoot, address], token);
      if (loss) {
        session = await api.SharedIndependentDeliverySession.open({
          ...deliveryOptions, database: liveSourceDatabase,
          create() { throw new Error('Reopen the exact durable review owner after the lost reply'); },
        });
        assert.equal(session.recovered, true);
        assert.deepEqual(session.exportRecovery(), durableSourceAfterLoss);
        const intent = JSON.parse(readFileSync(intentPath, 'utf8'));
        assert.deepEqual(api.inspectSharedRecoveredBranchReviewIntent(session, intent), {kind: 'local', event: recoveredComment});
        await assert.rejects(api.prepareSharedRecoveredBranchReviewIntent(recoveryRequest(session), intent),
          /original archived comment recovery intent differs/);
        await attach();
        assert.deepEqual(api.inspectSharedRecoveredBranchReviewIntent(session, intent), {
          kind: 'acknowledged', event: recoveredComment,
        });
        assert.equal(loss.submissions, 1);
        assert.equal(visibleThreads().length, 5);
        await stopClients();
      }
      const fresh = await api.registerSharedRelayWriter(options);
      const core = new api.SharedRichEditor(profile.join_frame('room', fresh.identity.writer, fresh.frame));
      try {
        if (richRecovered) {
          assert.ok(recovered);
          assertRecoveredRich(core.documentJson(), recovered.generation);
          const raster = await fetch(assetUrl, {headers});
          assert.equal(raster.status, 200);
          assert.deepEqual(Buffer.from(await raster.arrayBuffer()), recoveredPixel);
        } else {
          assert.equal(core.documentJson().split(recoveredText).length, 2);
        }
      } finally {
        core.dispose();
      }
      if (coldReviewReader) {
        assert.ok(recovered && delivered && readerToken);
        coldReaderEvidence = await checkColdReviewReader({
          api, wasm, options: {...options, principal: 'reader', getToken: () => readerToken},
          origin, database: persisted.database + '-fresh-reader', profile, assetUrl, recovered,
          threads: session.core.reviewSnapshot().view.threads, delivered, recoveredComment, attachedDiscussion,
          originalVersion: {id: admission.entry.version.id, packet},
        });
      }
      assert.deepEqual(readRetainedClientJournals(parent, retainedAlternatePins, 'client-alternatives', restoredRoot), retained);
    }
    const extra = Number(carryForward);
    const relocated = Number(portableSeal);
    return {mode, handoffs: 2, portableRestores: 1 + extra + relocated, restoredOfflineLanes: 6, undoRedoLanes: 2, rasterReads: 2,
      processExits: 4 + extra + Number(reviewRecovered) + Number(relayDiscussion) + relocated, authenticatedTakeovers: 1 + extra + relocated,
      oldServingRefusals: 1 + extra, coldResumes: 2 + extra + Number(reviewRecovered) + Number(relayDiscussion),
      ...carryEvidence,
      ...relocationEvidence,
      ...coldReaderEvidence,
      ...(recoveredComment ? {committedRecoveredComments: 1} : {}),
      ...(attachedDiscussion ? {committedDiscussionLinks: 1} : {}),
      ...(relayDiscussion ? {relayDiscussionAttachments: 1, attachmentHandover: 1,
        attachmentPublicationRefusals: 8, idempotentAttachmentPublication: 1, attachmentWalReplays: 1,
        archivedDiscussionEvents: attachedDiscussion.eventCount, discussionUsesNativeTranscript,
        exactBytesMatchPagedFallback: attachedDiscussion.comparedLegacy} : {}),
      ...(loss ? {discardedDurableReviewReplies: 1, coldAcknowledgedReviewIntents: 1, recoveredReviewSubmissions: loss.submissions} : {}),
      registrationRefusals: captured.registrationRefusals, providerRasters: captured.providerRasters,
      retainedPackets: captured.retainedPackets, stagedClientRasters: captured.clientRasters, clientUploadReceipts,
      clientUploadArchives: captured.clientArchives, missingArchiveRefusals: captured.missingArchiveRefusals,
      preservedCancelledUploads: 1, nativeJournals: captured.nativeJournals,
      missingJournalRefusals: captured.missingJournalRefusals, coldJournalPairs: 1,
      clientJournalRasterBindings: captured.clientJournalRasterBindings, offlineImageRedo: 1,
      pairedBackups: captured.pairedBackups, wrongReceiptRefusals: captured.wrongReceiptRefusals,
      retainedLocalVersions: localVersions.length, independentDeliveries: captured.independentDeliveries,
      ...(participant ? {
        participantArchives: captured.participantArchives,
        participantRasterBindings: captured.participantRasterBindings,
        archiveOnlyRasterReads: 1,
      } : {}),
      ...(terminal ? {retainedTerminalReceipts: 4} : {}),
      ...(competing ? {
        branchAdmissions: captured.branchAdmissions,
        branchCutRefusals: captured.branchCutRefusals,
        incomingBranchRefusals: captured.incomingBranchRefusals,
        preservedAlternateArchives: captured.preservedAlternateArchives,
        alteredAlternateRefusals: captured.alteredAlternateRefusals,
        recoveredAlternateHistoryLanes,
        exportedAlternateArchives: 1,
      } : {}),
      ...(richRecovered ? {recoveredRichAccepts: 1, coldAcceptedRichReads: 1, stagedArchivedImageBytes: 1}
        : reviewRecovered ? {recoveredTextAccepts: 1, coldAcceptedTextReads: 1} : {}),
      ...(opaque ? {
        unresolvedProviderMappings: captured.participantUnmapped,
        changedProviderRefusals: captured.participantMappingRefusals,
      } : {}),
      retainedOutboxPendings: pending ? 4 : 0, deliveredOutboxEntries: pending ? 4 : 0,
      retainedAbsolutePositions: true, runtimeSha256: sha(wasmBytes)};
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await stopClients();
    portableUploads?.close();
    await session?.discardAndClose();
    profile?.free();
    await host?.stop().catch(error => {
      if (failure) throw new AggregateError([failure, error], 'Relay workflow and cleanup failed');
      throw error;
    });
    if (previousSocket) Object.defineProperty(globalThis, 'WebSocket', previousSocket);
    else delete globalThis.WebSocket;
    reset();
  }
}

const executable = resolve(process.argv[2]);
const option = process.argv[3];
const terminalReceipts = option === '--participant-terminal-receipts';
const opaque = option === '--participant-opaque';
const portableSeal = option === '--participant-portable-seal';
const relayDiscussion = portableSeal || option === '--participant-relay-discussion';
const recoverDiscussion = relayDiscussion || option === '--participant-recovered-discussion';
const recoverCommentIntent = option === '--participant-recovered-comment-intent';
const recoverComment = recoverCommentIntent || option === '--participant-recovered-comment';
const coldReviewReader = recoverDiscussion || recoverComment || option === '--participant-cold-review-reader';
const richRecovered = coldReviewReader || option === '--participant-multiple-rich-review';
const multipleReviewed = richRecovered || option === '--participant-multiple-reviewed';
const multipleAlternates = multipleReviewed || option === '--participant-multiple-alternates';
const carryForward = multipleAlternates || option === '--participant-carried-alternate';
const reviewRecovered = multipleReviewed || option === '--participant-reviewed-text';
const competing = carryForward || reviewRecovered || option === '--participant-accepted-branch';
assert.ok(process.argv.length === 3 || process.argv.length === 4 &&
  ['--independent-delivery', '--participant-archive', '--participant-terminal-receipts', '--participant-opaque',
    '--participant-accepted-branch', '--participant-carried-alternate', '--participant-multiple-alternates', '--participant-reviewed-text', '--participant-multiple-reviewed', '--participant-multiple-rich-review', '--participant-cold-review-reader', '--participant-recovered-comment', '--participant-recovered-comment-intent', '--participant-recovered-discussion', '--participant-relay-discussion', '--participant-portable-seal'].includes(option));
const journalKind = terminalReceipts || opaque || competing || option === '--participant-archive' ? 'independentParticipant'
  : option === '--independent-delivery' ? 'independentDelivery' : 'pairedSession';
const source = sourceEvidence(root);
assert.equal(source.dirty, false);
const sandbox = mkdtempSync(join(tmpdir(), 'breditor-writable-segment-'));
try {
  const reports = {};
  for (const mode of ['source', 'installed']) {
    const distribution = mode === 'source'
      ? {distribution: join(root, 'packages/breditor-collaboration/dist'),
        rich: join(root, 'packages/breditor-experimental-rich-content/index.js'), proof: null}
      : installCollaborationConsumer(root, sandbox);
    const path = join(sandbox, mode);
    mkdirSync(path, {mode: 0o700});
    reports[mode] = {
      ...await run(mode, distribution, executable, path, journalKind, terminalReceipts, opaque, competing,
        carryForward, multipleAlternates, reviewRecovered, richRecovered, coldReviewReader, recoverComment, recoverCommentIntent, recoverDiscussion, relayDiscussion, portableSeal),
      proof: distribution.proof,
    };
  }
  assert.equal(reports.source.runtimeSha256, reports.installed.runtimeSha256);
  assert.deepEqual(sourceEvidence(root), source);
  const report = {
    format: 'breditor/writable-relay-segment-qualification', formatVersion: 1,
    source, relaySha256: sha(readFileSync(executable)), reports,
  };
  const reportFile = portableSeal ? 'qualified-portable-relocation.json'
    : relayDiscussion ? 'qualified-relay-discussion.json'
    : recoverDiscussion ? 'qualified-recovered-discussion.json'
    : recoverCommentIntent ? 'qualified-recovered-comment-intent.json'
    : recoverComment ? 'qualified-recovered-comment.json'
    : coldReviewReader ? 'qualified-cold-review-reader.json'
    : richRecovered ? 'qualified-rich-review-after-multiple-handover.json'
    : multipleReviewed ? 'qualified-review-after-multiple-handover.json'
    : reviewRecovered ? 'qualified-reviewed-recovered-text.json'
    : multipleAlternates ? 'qualified-multiple-participant-alternates.json'
    : carryForward ? 'qualified-carried-participant-alternate.json'
    : competing ? 'qualified-accepted-participant-branch.json'
    : opaque ? 'qualified-participant-opaque.json'
    : terminalReceipts ? 'qualified-participant-terminal-receipts.json'
    : journalKind === 'independentParticipant' ? 'qualified-participant-archive-segment.json'
    : journalKind === 'independentDelivery' ? 'qualified-independent-delivery-segment.json'
      : 'qualified-writable-relay-segment.json';
  saveEvidence(join(root, 'target', reportFile), report);
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(sandbox, {recursive: true, force: true});
}
