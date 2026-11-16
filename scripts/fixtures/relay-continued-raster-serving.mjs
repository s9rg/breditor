/** Exercise original SDK traffic on two lifetimes of the authenticated continued raster relay. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync, cpSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pixel, pixelAsset, proposalAsset, proposalPixel, secondAsset, secondPixel} from './review-assets/pixels.mjs';
import {unavailableAsset} from './physical-recovery-control/unavailable-upload.mjs';
import {startSegmentHandoverHost} from './relay-segment-handover-host.mjs';

export async function verifyContinuedRasterServing(api, rich, wasm, executable, root, token, origin, queued) {
  const parent = join(root, 'continued-raster-serving');
  mkdirSync(parent, {mode: 0o700});
  for (const name of ['auth.json', 'asset.png']) {
    const out = openSync(join(parent, name), 'wx', 0o600);
    try { writeFileSync(out, readFileSync(join(root, name))); } finally { closeSync(out); }
  }
  let host, profile, client, sync, provider, store;
  const fetch = globalThis.fetch;
  try {
    host = await startSegmentHandoverHost(executable, [parent, 'continued-raster-start', '127.0.0.1:0']);
    const address = host.address;
    const base = 'http://' + address + '/assets/';
    const endpoint = 'ws://' + address + '/ws';
    globalThis.fetch = async (input, options) => {
      if (typeof input !== 'string' || !input.startsWith(base)) return fetch(input, options);
      const headers = new Headers(options?.headers);
      headers.set('Origin', origin);
      return fetch(input, {...options, headers});
    };
    const options = {endpoint, principal: 'owner', room: 'room', writerTransport: 'atomic-v2',
      getToken: () => token, saveIdentity() {}, autoConnect: false};
    const registration = await api.registerSharedRelayWriter(options);
    profile = wasm.SharedRichProfile.from_standard_configuration_json_v3(readFileSync(join(parent, 'profile.json'), 'utf8'));
    client = new api.SharedRichEditor(profile.join_frame('room', registration.identity.writer, registration.frame));
    const journal = join(parent, 'client-journal.json');
    const persistLocal = async () => {
      const temp = journal + '.pending';
      const out = openSync(temp, 'wx', 0o600);
      try {
        writeFileSync(out, client.checkpointJson());
        fsyncSync(out);
      } finally {
        closeSync(out);
      }
      renameSync(temp, journal);
      const directory = openSync(parent, 'r');
      try { fsyncSync(directory); } finally { closeSync(directory); }
    };
    let assetHints = 0;
    const connect = async () => {
      sync = new api.SharedRelaySync(client, {...options, identity: registration.identity, persistLocal,
        onAssetsChanged: () => { assetHints++; }});
      await sync.connect();
      await sync.flush();
      assert.equal(sync.state().pending, false);
    };
    const disconnect = async () => {
      sync.dispose();
      await sync.waitForDisconnected();
      sync = undefined;
    };
    await connect();

    store = await rich.RichAssetStore.open('continued-raster-writer');
    provider = new api.SharedRelayAssets({...options, store});
    assert.deepEqual(Buffer.from(await (await provider.readBytes(pixelAsset)).blob.arrayBuffer()), pixel);
    const pending = await store.ingest(new Blob([queued], {type: 'image/png'}));
    assert.equal(pending.asset, unavailableAsset);
    await provider.flush();
    assert.ok(assetHints > 0, 'The continued relay negotiated the original asset capability');
    const receipt = await store.get(unavailableAsset);
    assert.equal(receipt.status, 'uploaded');
    assert.equal(receipt.storageRef, 'breditor:relay-asset:1:' + unavailableAsset);
    client.dispatch({commands: [{kind: 'replace_image', data: {
      block: 'image-block', asset: unavailableAsset, generation: 'continued-uploaded',
    }}]});
    await sync.flush();
    const accepted = client.documentJson();
    const before = await host.maintenance('owner', token, {kind: 'capture'});
    assert.equal(before.kind, 'maintenance');
    assert.ok(before.result, before.error);
    assert.equal(before.result.rasters.active.assets, 1);
    await disconnect();
    provider.dispose();
    provider = undefined;
    const pendingQueue = await store.ingest(new Blob([secondPixel], {type: 'image/png'}));
    assert.equal(pendingQueue.asset, secondAsset);
    assert.equal(pendingQueue.status, 'pending');
    const deferred = await store.ingest(new Blob([proposalPixel], {type: 'image/png'}));
    assert.equal(deferred.asset, proposalAsset);
    assert.equal(deferred.status, 'pending');
    const queue = Buffer.from(await (await store.exportBackup()).arrayBuffer());
    store.close();
    store = undefined;
    await host.crash();
    host = undefined;

    assert.equal(client.undo(), true);
    assert.ok(client.documentJson().includes(pixelAsset));
    await persistLocal();
    const portableRestore = await verifyPortableCapture({
      api, rich, profile, executable, root, parent, accepted,
      acceptedRasters: [pixel, queued], capture: before.result,
      identity: registration.identity, token, offline: client.documentJson(),
      journal: readFileSync(journal), queue,
    });
    client.dispose();
    client = new api.SharedRichEditor(profile.restore('room', readFileSync(journal, 'utf8')));
    host = await startSegmentHandoverHost(executable, [parent, 'continued-raster-resume', address]);
    await connect();
    assert.equal(client.redo(), true);
    await sync.flush();
    assert.equal(client.documentJson(), accepted);
    store = await rich.RichAssetStore.open('continued-raster-reader-after-restart');
    provider = new api.SharedRelayAssets({...options, store});
    assert.deepEqual(Buffer.from(await (await provider.readBytes(pixelAsset)).blob.arrayBuffer()), pixel);
    assert.deepEqual(Buffer.from(await (await provider.readBytes(unavailableAsset)).blob.arrayBuffer()), queued);
    const next = JSON.parse(readFileSync(join(parent, 'continued-reopened-selection.json'), 'utf8'));
    assert.ok(BigInt(next.generation) > BigInt(before.result.sourceEpoch.generation));
    await disconnect();
    provider.dispose();
    provider = undefined;
    store.close();
    store = undefined;
    const captured = await host.maintenance('owner', token, {kind: 'captureActivation'});
    assert.ok(captured.result, captured.error);
    assert.deepEqual(captured.result.sourceEpoch, next);
    client.dispatch({commands: [{kind: 'replace_image', data: {
      block: 'image-block', asset: secondAsset, generation: 'approved-continuation-redo',
    }}]});
    assert.equal(client.undo(), true);
    assert.equal(client.documentJson(), accepted);
    await persistLocal();
    const activation = join(parent, 'activation');
    prepareContinuedCapture({
      directory: activation, source: join(parent, 'activation-capture'), parent,
      capture: captured.result, writer: registration.identity.writer, credential: registration.identity.credential,
      token, original: readFileSync(journal), queue, staged: [secondAsset], approve: true,
    });
    const approved = JSON.parse(execFileSync(executable, [activation, 'continued-raster-restore', '127.0.0.1:0'], {
      encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    }));
    assert.equal(approved.reconciliation.inputsComplete, true);
    assert.deepEqual(approved.reconciliation.stagedRasters, [secondAsset]);
    const prohibited = await host.maintenance('owner', 'wrong-owner-token', {kind: 'sealActivation'});
    assert.ok(prohibited.error);
    const headers = {Origin: origin, Authorization: 'Bearer ' + token, 'X-Breditor-Principal': 'owner'};
    const get = id => fetch(base + id, {headers});
    const upload = (id, bytes) => fetch(base + id, {method: 'PUT',
      headers: {...headers, 'Content-Type': 'image/png'}, body: bytes});
    const beforeActivation = await get(pixelAsset);
    assert.equal(beforeActivation.status, 200);
    await beforeActivation.arrayBuffer();
    const sealed = await host.maintenance('owner', token, {kind: 'sealActivation'});
    assert.ok(sealed.result, sealed.error);
    assert.equal(BigInt(sealed.result.generation), BigInt(next.generation) + 1n);
    for (const denied of [await get(pixelAsset), await upload(proposalAsset, proposalPixel)]) {
      assert.equal(denied.status, 403);
      await denied.arrayBuffer();
    }
    await host.crash();
    host = undefined;
    const preflight = join(parent, 'sealed-preflight');
    renameSync(activation, preflight);
    renameSync(join(parent, 'source-native'), join(parent, 'sealed-native'));
    renameSync(join(parent, 'continued'), join(parent, 'sealed-rasters'));
    prepareContinuedCapture({
      directory: activation, source: join(preflight, 'capture'), parent,
      capture: captured.result, writer: registration.identity.writer, credential: registration.identity.credential,
      token, original: readFileSync(journal), queue, staged: [secondAsset], approve: true,
      generation: 'relocated-continued-raster', seal: readFileSync(join(preflight, 'seal.json')),
    });
    const invoke = (directory, mode) => JSON.parse(execFileSync(executable, [directory, mode, '127.0.0.1:0'], {
      encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }));
    const changedOriginal = new api.SharedRichEditor(profile.restore('room', readFileSync(journal, 'utf8')));
    const incompatible = join(parent, 'different-portable-original');
    try {
      assert.equal(changedOriginal.redo(), true);
      prepareContinuedCapture({
        directory: incompatible, source: join(preflight, 'capture'), parent, capture: captured.result,
        writer: registration.identity.writer, credential: registration.identity.credential, token,
        original: Buffer.from(changedOriginal.checkpointJson()), queue, staged: [secondAsset], approve: true,
        seal: readFileSync(join(preflight, 'seal.json')),
      });
      assert.throws(() => invoke(incompatible, 'continued-raster-restore'),
        error => error.status === 1 && error.stderr.includes('continued raster sealed inputs differ'));
    } finally {
      changedOriginal.dispose();
    }
    assert.equal(invoke(activation, 'continued-raster-restore').reconciliation.inputsComplete, true);
    const localPin = directory => JSON.parse(readFileSync(join(directory, 'prepared-selection.json'), 'utf8'));
    assert.notDeepEqual(localPin(activation), localPin(preflight));
    const saveExpected = selection => writeFileSync(join(activation, 'expected.json'), JSON.stringify(selection), {mode: 0o600});
    const startApproved = () => startSegmentHandoverHost(executable, [parent, 'continued-raster-activated', address]);
    const newEpoch = selection => JSON.parse(readFileSync(join(activation, 'started-after-' + selection.generation + '.json'), 'utf8'));
    saveExpected(sealed.result);
    const committed = invoke(parent, 'continued-raster-portable-commit');
    assert.equal(BigInt(committed.generation), BigInt(sealed.result.generation) + 1n);
    saveExpected(committed);
    host = await startApproved();
    const firstServing = newEpoch(committed);
    assert.equal(BigInt(firstServing.generation), BigInt(committed.generation) + 1n);
    await connect();
    assert.equal(client.redo(), true);
    await sync.flush();
    const edited = client.documentJson();
    assert.ok(edited.includes(secondAsset));
    const saved = await upload(proposalAsset, proposalPixel);
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).duplicate, false);
    const floor = await host.maintenance('owner', token, {kind: 'captureRepairFloor'});
    assert.ok(floor.result, floor.error);
    assert.deepEqual(floor.result.sourceEpoch, firstServing);
    const floorPath = join(parent, 'repair-floor.json');
    writeFileSync(floorPath, JSON.stringify(floor.result), {flag: 'wx', mode: 0o600});
    await disconnect();
    await host.crash();
    host = undefined;

    saveExpected(firstServing);
    verifyNativeTailRepair({parent, activation, invoke, floor: floor.result, floorPath});
    host = await startApproved();
    assert.equal(BigInt(newEpoch(firstServing).generation), BigInt(firstServing.generation) + 1n);
    const coldReader = await api.registerSharedRelayWriter(options);
    const coldDocument = new api.SharedRichEditor(profile.join_frame('room', coldReader.identity.writer, coldReader.frame));
    try {
      assert.equal(coldDocument.documentJson(), edited);
    } finally {
      coldDocument.dispose();
    }
    await connect();
    assert.equal(client.documentJson(), edited);
    for (const [id, bytes] of [[pixelAsset, pixel], [unavailableAsset, queued], [secondAsset, secondPixel], [proposalAsset, proposalPixel]]) {
      const response = await get(id);
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    }
    return {
      httpRastersRecovered: 2, stagedUploadReceipts: 1, offlineUndoAndRedo: true, combinedCapture: true, portableRestore,
      authenticatedTakeover: {staleRelayReadsAndWritesRefused: true, coldStarts: 2, offlineRedoDelivered: true,
        postActivationRasterAndEditSurvived: true, exactRastersRead: 4, portableSealAndRelocation: true, changedClientOriginalRefused: true},
      explicitTailRepair: {preservedIncompleteBytes: 9, acceptedFloorGuarded: true,
        changedSuffixRefused: true, coldRepairRetrySucceeded: true, pendingRasterEvidencePreserved: true},
    };
  } finally {
    if (sync) {
      sync.dispose();
      await sync.waitForDisconnected();
    }
    provider?.dispose();
    store?.close();
    client?.dispose();
    profile?.free();
    globalThis.fetch = fetch;
    await host?.stop();
  }
}

async function verifyPortableCapture({
  api, rich, profile, executable, root, parent, accepted, acceptedRasters,
  capture, identity: {writer, credential}, token, offline, journal, queue,
}) {
  const load = (directory, original, operation) => {
    const observed = JSON.parse(execFileSync(executable, [directory, 'continued-raster-' + operation, '127.0.0.1:0'], {
      encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    }));
    assert.equal(observed.kind, 'prepared');
    assert.deepEqual(observed.rasters.map(bytes => Buffer.from(bytes)), acceptedRasters);
    assert.deepEqual(Buffer.from(observed.journal), original);
    assert.deepEqual(Buffer.from(observed.queue), queue);
    return observed;
  };
  const prepareCapture = (name, original, staged = []) => {
    const portable = join(root, name);
    prepareContinuedCapture({
      directory: portable, source: join(parent, 'captured'), parent, capture,
      writer, credential, token, original, queue, staged,
    });
    return portable;
  };
  const portable = prepareCapture('continued-raster-portable', journal);
  const exact = load(portable, journal, 'restore');
  assert.deepEqual(load(portable, journal, 'reopen'), exact);
  const matchedAssets = [pixelAsset, unavailableAsset].sort();
  assert.deepEqual(exact.reconciliation, {inputsComplete: true, matchedAssets, missingAssets: [], stagedRasters: []});
  const inspectionWriter = (BigInt(writer) + 1n).toString();
  const restored = new api.SharedRichEditor(profile.join_frame('room', inspectionWriter, exact.frame));
  const retained = new api.SharedRichEditor(profile.restore('room', exact.journal));
  const archive = await rich.RichAssetArchive.read(new Blob([Buffer.from(exact.queue)]));
  try {
    assert.equal(restored.documentJson(), accepted);
    assert.equal(retained.documentJson(), offline);
    assert.equal(retained.redo(), true);
    assert.equal(retained.documentJson(), accepted);
    const pending = archive.entries().find(row => row.asset === secondAsset);
    assert.equal(pending.status, 'pending');
    assert.equal(pending.storageRef, null);
    assert.deepEqual(Buffer.from(await archive.blob(secondAsset).arrayBuffer()), secondPixel);
    const deferred = archive.entries().find(row => row.asset === proposalAsset);
    assert.equal(deferred.status, 'pending');
    assert.equal(deferred.storageRef, null);
    const acknowledged = archive.entries().find(row => row.asset === unavailableAsset);
    assert.equal(acknowledged.status, 'uploaded');
    assert.equal(acknowledged.storageRef, 'breditor:relay-asset:1:' + unavailableAsset);
    retained.dispatch({commands: [{kind: 'replace_image', data: {
      block: 'image-block', asset: secondAsset, generation: 'portable-pending-redo-image',
    }}]});
    assert.equal(retained.undo(), true);
    assert.equal(retained.documentJson(), accepted);
    const missingJournal = Buffer.from(retained.checkpointJson());
    const missing = prepareCapture('continued-raster-pending-redo', missingJournal);
    const pendingInputs = load(missing, missingJournal, 'restore');
    assert.deepEqual(load(missing, missingJournal, 'reopen'), pendingInputs);
    assert.deepEqual(pendingInputs.reconciliation, {
      inputsComplete: false, matchedAssets, stagedRasters: [], missingAssets: [{
        kind: 'bytes',
        reference: {asset: secondAsset, generation: 'portable-pending-redo-image'},
        content_asset: secondAsset,
      }],
    });
    const staged = prepareCapture('continued-raster-staged-redo', missingJournal, [secondAsset]);
    const stagedInputs = load(staged, missingJournal, 'restore');
    assert.deepEqual(load(staged, missingJournal, 'reopen'), stagedInputs);
    assert.deepEqual(Buffer.from(stagedInputs.stagedBytes), secondPixel);
    assert.deepEqual(stagedInputs.reconciliation, {
      inputsComplete: true,
      matchedAssets: [...matchedAssets, secondAsset].sort(),
      missingAssets: [],
      stagedRasters: [secondAsset],
    });
    const restoredRedo = new api.SharedRichEditor(profile.restore('room', stagedInputs.journal));
    try {
      assert.equal(restoredRedo.redo(), true);
      assert.ok(restoredRedo.documentJson().includes(secondAsset));
    } finally {
      restoredRedo.dispose();
    }
    return {
      coldReopens: 3, exactImages: 2, retainedOfflineRedo: true, pendingQueueAndReceipt: true,
      verifiedInputsFromBothGenerations: true, queuedBytesNeededForRedoReportedMissing: true,
      selectedRasterStagedAfterReopen: true, unrelatedUploadDeferred: true,
    };
  } finally {
    archive.dispose();
    retained.dispose();
    restored.dispose();
  }
}

function prepareContinuedCapture({
  directory, source, parent, capture, writer, credential, token, original, queue, staged, approve = false,
  generation, seal,
}) {
  mkdirSync(directory, {mode: 0o700});
  cpSync(source, join(directory, 'capture'), {recursive: true});
  const write = (name, bytes) => writeFileSync(join(directory, name), bytes, {flag: 'wx', mode: 0o600});
  const hash = bytes => createHash('sha256').update(bytes).digest();
  write('auth.json', readFileSync(join(parent, 'auth.json')));
  write('protected.json', JSON.stringify({token, writer, documentCredential: credential}));
  write('capture-selection.json', JSON.stringify(capture));
  if (seal) write('seal.json', seal);
  write('original.journal', original);
  write('original.uploads', queue);
  write('originals.json', JSON.stringify({
    journal: {owner: {kind: 'document', writer, family: 'original'}, bytes: original.length, sha256: [...hash(original)]},
    uploads: {writer, bytes: queue.length, sha256: hash(queue).toString('hex')},
    rasters: [pixelAsset, unavailableAsset],
    queued: secondAsset, deferred: proposalAsset, staged, approve, generation,
  }));
}

function verifyNativeTailRepair({parent, activation, invoke, floor, floorPath}) {
  const native = join(activation, 'prepared', 'native');
  const logs = readdirSync(native).filter(name => name.endsWith('.wal'));
  assert.equal(logs.length, 1);
  const wal = join(native, logs[0]);
  const accepted = readFileSync(wal);
  assert.ok(accepted.length > 9);
  const suffix = accepted.subarray(0, 9);
  const torn = Buffer.concat([accepted, suffix]);
  const write = bytes => {
    const file = openSync(wal, 'w');
    try { writeFileSync(file, bytes); fsyncSync(file); } finally { closeSync(file); }
  };
  const refused = (mode, reason) => assert.throws(() => invoke(parent, mode),
    error => error.status === 1 && error.stderr.includes(reason));
  write(torn);
  refused('continued-raster-activated', 'continued raster room requires an exact native WAL');
  assert.deepEqual(readFileSync(wal), torn);

  write(Buffer.alloc(0));
  refused('continued-raster-inspect-tail', 'continued native recovery floor is outside retained history');
  assert.deepEqual(readFileSync(wal), Buffer.alloc(0));
  write(torn);
  const interruptedUpload = join(activation, 'prepared', 'rasters', 'active', '.pending-' + 'a'.repeat(64));
  const uploadBytes = Buffer.from('interrupted upload witness');
  writeFileSync(interruptedUpload, uploadBytes, {flag: 'wx', mode: 0o600});
  refused('continued-raster-inspect-tail', 'operational asset has pending work');
  assert.deepEqual(readFileSync(interruptedUpload), uploadBytes);
  assert.deepEqual(readFileSync(wal), torn);
  unlinkSync(interruptedUpload);
  const observed = invoke(parent, 'continued-raster-inspect-tail');
  assert.deepEqual(observed, {nextSequence: floor.native.predecessor.source.records, incompleteBytes: suffix.length});
  const evidence = join(parent, 'repair-evidence', 'suffix.bin');
  assert.deepEqual(readFileSync(evidence), suffix);
  assert.deepEqual(readFileSync(wal), torn);

  const changed = Buffer.from(torn);
  changed[changed.length - 1] ^= 1;
  write(changed);
  refused('continued-raster-repair-tail', 'continued native tail changed after inspection');
  assert.deepEqual(readFileSync(wal), changed);
  write(torn);
  assert.equal(invoke(parent, 'continued-raster-repair-tail'), 'repaired');
  assert.deepEqual(readFileSync(wal), accepted);
  assert.equal(invoke(parent, 'continued-raster-repair-tail'), 'alreadyComplete');
  assert.deepEqual(readFileSync(evidence), suffix);
  assert.deepEqual(JSON.parse(readFileSync(floorPath, 'utf8')), floor);
}
