/** Original SDK transport against a real saturated predecessor and its selected successor. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {WebSocket as Socket} from 'undici';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {pixel, secondAsset} from './fixtures/review-assets/pixels.mjs';
import {startSegmentHandoverHost} from './fixtures/relay-segment-handover-host.mjs';
import {captureClientRaster, resumeClientRaster} from './fixtures/relay-segment-client-raster.mjs';
import {searchConsumerLock, verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
import {sourceEvidence, saveEvidence} from './candidate-release/evidence.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const origin = 'http://127.0.0.1:49785';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const collaboration = '@breditor/collaboration';

function installed(directory) {
  const consumer = join(directory, 'consumer');
  const output = join(directory, 'archives');
  mkdirSync(consumer);
  mkdirSync(output);
  const npm = process.env.BREDITOR_NPM ?? 'npm';
  const names = ['@breditor/browser', '@breditor/experimental-rich-content', collaboration];
  const packs = JSON.parse(execFileSync(npm, [
    'pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', output,
    ...names.flatMap(name => ['--workspace', name]),
  ], {cwd: root, encoding: 'utf8'}));
  const archives = packs.map(pack => ({name: pack.name, path: join(output, pack.filename)}));
  const producer = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const locked = searchConsumerLock(producer, archives);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify(locked.manifest));
  writeFileSync(join(consumer, 'package-lock.json'), JSON.stringify(locked.lock));
  execFileSync(npm, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumer, stdio: 'inherit',
  });
  const installedRoot = realpathSync(join(consumer, 'node_modules', collaboration));
  assert.ok(installedRoot.startsWith(realpathSync(consumer) + '/'));
  const registryArtifacts = verifySearchConsumerRegistry(
    producer, JSON.parse(readFileSync(join(consumer, 'package-lock.json'), 'utf8')),
  );
  return {
    distribution: join(installedRoot, 'dist'),
    rich: join(consumer, 'node_modules/@breditor/experimental-rich-content/index.js'),
    proof: {registryArtifacts, archives: archives.map(({name, path}) => ({name, sha256: sha(readFileSync(path))}))},
  };
}

function selectClientJournals(parent, record, peerWriter, peerCheckpoint) {
  const originals = [
    [{kind: 'document', writer: record.relay.documentWriter}, record.documentCheckpointJson],
    [{kind: 'document', writer: peerWriter}, peerCheckpoint],
    [{kind: 'review', actor: record.relay.actor, documentWriter: record.relay.documentWriter},
      record.reviewCheckpointJson],
  ];
  return originals.map(([owner, journal], index) => {
    const bytes = Buffer.from(journal);
    writeFileSync(join(parent, `journal-${index}.json`), bytes, {flag: 'wx', mode: 0o600});
    return {owner: {...owner, family: 'original'}, bytes: bytes.length, sha256: [...Buffer.from(sha(bytes), 'hex')]};
  });
}

function readRetainedClientJournals(parent, expected) {
  const root = join(parent, 'restored', 'client-journals');
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest, expected);
  const stream = readFileSync(join(root, 'journals.bin'));
  let offset = 0;
  const originals = manifest.map(pin => {
    const part = stream.subarray(offset, offset + pin.bytes);
    offset += pin.bytes;
    assert.equal(part.length, pin.bytes);
    assert.equal(sha(part), Buffer.from(pin.sha256).toString('hex'));
    return part.toString('utf8');
  });
  assert.equal(offset, stream.length);
  return originals;
}

async function run(mode, {distribution, rich}, executable, parent) {
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
  let host, profile, session, document, review;
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
    const attach = async () => {
      document = new api.SharedRelaySync(session.core, {
        ...connect, identity: registered.identity, persistLocal: () => session.flush(),
      });
      review = new api.SharedReviewRelaySync({
        ...connect, identity: comment.identity, storage: session, flushDocument: () => document.flush(),
      });
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
    session = await api.SharedReviewPersistentSession.open(persisted);
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
    session = await api.SharedReviewPersistentSession.open(persisted);
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
    edit('Offline before portable restore ');
    post('Offline comment before portable restore');
    await session.flush();
    const queuedAcrossTakeover = session.exportRecovery();
    const peerDocument = profile.join_frame('room', peer.identity.writer, peer.frame);
    const journalPins = selectClientJournals(parent, queuedAcrossTakeover,
      peer.identity.writer, peerDocument.checkpoint());
    peerDocument.free();
    const uploads = [
      await captureClientRaster(richApi, parent, registered.identity.writer, 'pending'),
      await captureClientRaster(richApi, parent, peer.identity.writer, 'cancelled'),
    ];
    const localUrl = 'http://' + address + '/assets/' + encodeURIComponent(secondAsset);
    const absent = await fetch(localUrl, {headers});
    assert.equal(absent.status, 404);
    await absent.arrayBuffer();
    const captured = await host.handover(token, registered.identity, comment.identity, peer.identity,
      uploads.map(upload => upload.pin), journalPins);
    assert.equal(captured.registrationRefusals, 3);
    assert.equal(captured.providerRasters, 1);
    assert.equal(captured.retainedPackets, 1);
    assert.equal(captured.clientRasters, 2);
    assert.equal(captured.clientArchives, 2);
    assert.equal(captured.missingArchiveRefusals, 1);
    assert.equal(captured.nativeJournals, 3);
    assert.equal(captured.missingJournalRefusals, 2);
    assert.deepEqual(session.exportRecovery(), queuedAcrossTakeover);
    const old = await fetch(rasterUrl, {headers});
    assert.equal(old.status, 403);
    await old.arrayBuffer();
    await host.crash();
    host = undefined;
    for (const directory of ['source-native', 'successor', 'final', 'rasters',
      ...uploads.map(upload => 'client-' + upload.pin.writer + '.backup'),
      ...journalPins.map((_, index) => `journal-${index}.json`)]) {
      renameSync(join(parent, directory), join(parent, 'offline-' + directory));
    }
    await session.close();
    session = undefined;
    host = await startSegmentHandoverHost(executable, [parent, 'restore', address], token);
    const [documentCheckpointJson, , reviewCheckpointJson] = readRetainedClientJournals(parent, journalPins);
    const record = {...queuedAcrossTakeover, documentCheckpointJson, reviewCheckpointJson};
    const backupJson = await api.encodeSharedPairedSessionBackup({
      room: persisted.room, writer: persisted.writer, history: persisted.history,
      richLanguage: persisted.richLanguage, rangeEditing: persisted.rangeEditing,
      selectionEditing: persisted.selectionEditing, searchHistory: null,
    }, record);
    session = await api.SharedReviewPersistentSession.restoreBackup({
      ...persisted, database: persisted.database + '-retained-journals',
      backupJson, writerRecovery: 'host-reacquired',
    });
    assert.deepEqual(session.exportRecovery(), queuedAcrossTakeover);
    await attach();
    assert.equal(document.state().pending, false);
    assert.equal(review.state().pending, false);
    assert.ok(BigInt(document.state().serverReceiptSequence) >= BigInt(captured.records));
    assert.equal(visibleThreads().length, 4);
    const accepted = session.core.documentJson();
    assert.equal(session.core.undo(), true);
    assert.equal(session.core.undoReview().kind, 'committed');
    await document.flush();
    await review.flush();
    await stopClients();
    await host.crash();
    host = await startSegmentHandoverHost(executable, [parent, 'restored', address], token);
    const clientUploadReceipts = await resumeClientRaster(richApi, api, parent, address, origin, token, uploads[0]);
    const cancelledUploadReceipts = await resumeClientRaster(richApi, api, parent, address, origin, token, uploads[1]);
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
    const raster = await fetch(rasterUrl, {headers});
    assert.equal(raster.status, 200);
    assert.deepEqual(Buffer.from(await raster.arrayBuffer()), pixel);
    const retainedPacket = await fetch(packetUrl, {headers: catalogHeaders});
    assert.equal(retainedPacket.status, 200);
    assert.equal(await retainedPacket.text(), packet);
    return {mode, handoffs: 2, portableRestores: 1, restoredOfflineLanes: 6, undoRedoLanes: 2, rasterReads: 2,
      processExits: 4, authenticatedTakeovers: 1, oldServingRefusals: 1, coldResumes: 2,
      registrationRefusals: captured.registrationRefusals, providerRasters: captured.providerRasters,
      retainedPackets: captured.retainedPackets, stagedClientRasters: captured.clientRasters, clientUploadReceipts,
      clientUploadArchives: captured.clientArchives, missingArchiveRefusals: captured.missingArchiveRefusals,
      preservedCancelledUploads: 1, nativeJournals: captured.nativeJournals,
      missingJournalRefusals: captured.missingJournalRefusals, coldJournalPairs: 1,
      retainedAbsolutePositions: true, runtimeSha256: sha(wasmBytes)};
  } finally {
    await stopClients();
    await session?.discardAndClose();
    profile?.free();
    await host?.stop();
    if (previousSocket) Object.defineProperty(globalThis, 'WebSocket', previousSocket);
    else delete globalThis.WebSocket;
    reset();
  }
}

const executable = resolve(process.argv[2]);
const source = sourceEvidence(root);
assert.equal(source.dirty, false);
const sandbox = mkdtempSync(join(tmpdir(), 'breditor-writable-segment-'));
try {
  const reports = {};
  for (const mode of ['source', 'installed']) {
    const distribution = mode === 'source'
      ? {distribution: join(root, 'packages/breditor-collaboration/dist'),
        rich: join(root, 'packages/breditor-experimental-rich-content/index.js'), proof: null}
      : installed(sandbox);
    const path = join(sandbox, mode);
    mkdirSync(path, {mode: 0o700});
    reports[mode] = {
      ...await run(mode, distribution, executable, path), proof: distribution.proof,
    };
  }
  assert.equal(reports.source.runtimeSha256, reports.installed.runtimeSha256);
  assert.deepEqual(sourceEvidence(root), source);
  const report = {
    format: 'breditor/writable-relay-segment-qualification', formatVersion: 1,
    source, relaySha256: sha(readFileSync(executable)), reports,
  };
  saveEvidence(join(root, 'target/qualified-writable-relay-segment.json'), report);
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(sandbox, {recursive: true, force: true});
}
