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
import {pixel, proposalAsset, proposalPixel, secondAsset, secondPixel} from './fixtures/review-assets/pixels.mjs';
import {startSegmentHandoverHost} from './fixtures/relay-segment-handover-host.mjs';
import {captureParticipant, checkRecoveredAlternate, proposalAlias, reopenParticipant, withWrongReviewReceipt} from './fixtures/relay-segment-participant.mjs';
import {captureClientRaster, resumeClientRaster} from './fixtures/relay-segment-client-raster.mjs';
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

function selectClientJournals(parent, identity, pairedBackup, peerWriter, peerCheckpoint, kind) {
  const paired = {kind, writer: identity.documentWriter, actor: identity.actor};
  const peer = {kind: 'document', writer: peerWriter, family: 'original'};
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

async function run(mode, {distribution, rich}, executable, parent, journalKind, terminalReceipts, opaque, competing, carryForward) {
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
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: class extends Socket {
      constructor(url) { super(url, {headers: {Origin: origin}}); }
    },
  });
  const token = randomBytes(32).toString('hex');
  writeFileSync(join(parent, 'auth.json'), JSON.stringify({
    format: 'breditor/relay-auth', formatVersion: 1, origins: [origin],
    accounts: [{principal: 'owner', tokenHash: [...createHash('sha256').update(token).digest()]}],
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
    const peer = await api.registerSharedRelayWriter(options);
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
    const post = body => assert.equal(session.core.dispatchReview({
      kind: 'create_thread', data: {
        anchorJson: session.core.captureReviewAnchor({kind: 'document'}), body,
      },
    }).kind, 'committed');
    session = await open();
    await attach();
    edit('Accepted before segment ');
    post('Accepted comment before segment');
    await document.flush();
    await review.flush();
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
      peer.identity.writer, peerDocument.checkpoint(), journalKind);
    let incomingBranch, retainedBranches, recoveredAlternateHistoryLanes;
    if (competingSeed) {
      await session.close();
      session = await api.SharedIndependentDeliverySession.restoreRecovery({
        ...deliveryOptions, database: deliveryOptions.database + '-competing', recovery: competingSeed,
        writerRecovery: 'host-reacquired',
      });
      edit('Competing branch text ');
      post('Competing branch comment');
      await session.flush();
      const competingRecovery = session.exportRecovery();
      const competingFile = await captureParticipant(
        api, richApi, session, uploads[0], undefined, 'handover-competing-assets',
      );
      await session.close();
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
        incomingSelection: competingFile.selection, competingRecovery,
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
      selectedUploads.map(upload => upload.pin), journalPins, wrongReceipt, assetMapping, incomingBranch);
    if (competing) {
      assert.equal(captured.branchAdmissions, 2);
      assert.equal(captured.branchCutRefusals, 3);
      assert.equal(captured.incomingBranchRefusals, 1);
      assert.equal(captured.preservedAlternateArchives, 1);
      assert.equal(captured.alteredAlternateRefusals, 1);
    }
    assert.equal(captured.participantUnmapped, opaque ? 1 : 0);
    assert.equal(captured.participantMappingRefusals, opaque ? 2 : 0);
    assert.equal(captured.registrationRefusals, 3);
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
    let carryEvidence;
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
        uploads[1].pin, updatedPins, incomingBranch);
      assert.equal(result.alternateOmissionRefusals, 1);
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
      for (const name of [restoredRoot, 'exported-alternates', 'retained-branches.bin',
        'carry-journal-0.json', 'carry-journal-1.json', 'carry-peer.uploads']) {
        renameSync(join(parent, name), join(parent, 'retired-' + name));
      }
      restoredRoot = 'carried';
      host = await startSegmentHandoverHost(executable, [parent, restoredRoot, address], token);
      const [alternate] = readRetainedClientJournals(parent, [incomingBranch], 'client-alternatives', restoredRoot);
      assert.deepEqual(alternate, retainedBranches.incoming);
      const alternateHistoryLanes = await checkRecoveredAlternate(
        api, {...deliveryOptions, database: deliveryOptions.database + '-carried-alternate'},
        alternate, retainedBranches.incomingSelection, retainedBranches.competingRecovery,
      );
      const [currentBytes] = readRetainedClientJournals(parent, updatedPins, 'client-journals', restoredRoot);
      assert.deepEqual(currentBytes, current.archive);
      const restored = await reopenParticipant(api, {...deliveryOptions, database: database + '-carried'},
        currentBytes, current.selection, uploads[0], archiveImage);
      session = restored.session;
      portableUploads = restored.uploads;
      assert.deepEqual(session.exportRecovery(), recovery);
      await attach();
      assert.equal(document.state().pending, false);
      assert.equal(review.state().pending, false);
      assert.equal(visibleThreads().length, 4);
      assert.doesNotMatch(session.core.documentJson(), /Competing branch text/);
      carryEvidence = {alternateOmissionRefusals: result.alternateOmissionRefusals,
        carriedAlternateArchives: 1, carriedAlternateHistoryLanes: alternateHistoryLanes,
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
    assert.equal(visibleThreads().length, 3);
    assert.equal(session.core.redo(), true);
    assert.equal(session.core.redoReview().kind, 'committed');
    await document.flush();
    await review.flush();
    assert.equal(session.core.documentJson(), accepted);
    assert.equal(visibleThreads().length, 4);
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
    if (pending) await deliverWork(pending);
    const extra = Number(carryForward);
    return {mode, handoffs: 2, portableRestores: 1 + extra, restoredOfflineLanes: 6, undoRedoLanes: 2, rasterReads: 2,
      processExits: 4 + extra, authenticatedTakeovers: 1 + extra, oldServingRefusals: 1 + extra, coldResumes: 2 + extra,
      ...carryEvidence,
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
const carryForward = option === '--participant-carried-alternate';
const competing = carryForward || option === '--participant-accepted-branch';
assert.ok(process.argv.length === 3 || process.argv.length === 4 &&
  ['--independent-delivery', '--participant-archive', '--participant-terminal-receipts', '--participant-opaque',
    '--participant-accepted-branch', '--participant-carried-alternate'].includes(option));
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
      ...await run(mode, distribution, executable, path, journalKind, terminalReceipts, opaque, competing, carryForward),
      proof: distribution.proof,
    };
  }
  assert.equal(reports.source.runtimeSha256, reports.installed.runtimeSha256);
  assert.deepEqual(sourceEvidence(root), source);
  const report = {
    format: 'breditor/writable-relay-segment-qualification', formatVersion: 1,
    source, relaySha256: sha(readFileSync(executable)), reports,
  };
  const reportFile = carryForward ? 'qualified-carried-participant-alternate.json'
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
