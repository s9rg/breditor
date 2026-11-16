/** Exercise original SDK traffic on two lifetimes of the authenticated continued raster relay. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync, cpSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pixel, pixelAsset, secondAsset, secondPixel} from './review-assets/pixels.mjs';
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
      writer: registration.identity.writer, offline: client.documentJson(),
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
    return {httpRastersRecovered: 2, stagedUploadReceipts: 1, offlineUndoAndRedo: true, combinedCapture: true, portableRestore};
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
  capture, writer, offline, journal, queue,
}) {
  const portable = join(root, 'continued-raster-portable');
  mkdirSync(portable, {mode: 0o700});
  cpSync(join(parent, 'captured'), join(portable, 'capture'), {recursive: true});
  const write = (name, bytes) => writeFileSync(join(portable, name), bytes, {flag: 'wx', mode: 0o600});
  const hash = bytes => createHash('sha256').update(bytes).digest();
  write('capture-selection.json', JSON.stringify(capture));
  write('original.journal', journal);
  write('original.uploads', queue);
  write('originals.json', JSON.stringify({
    journal: {owner: {kind: 'document', writer, family: 'original'}, bytes: journal.length, sha256: [...hash(journal)]},
    uploads: {writer, bytes: queue.length, sha256: hash(queue).toString('hex')},
    rasters: [pixelAsset, unavailableAsset],
    queued: secondAsset,
  }));
  let exact = null;
  for (const operation of ['restore', 'reopen']) {
    const observed = JSON.parse(execFileSync(executable, [portable, 'continued-raster-' + operation, '127.0.0.1:0'], {
      encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    }));
    assert.equal(observed.kind, 'prepared');
    assert.deepEqual(observed.rasters.map(bytes => Buffer.from(bytes)), acceptedRasters);
    assert.deepEqual(Buffer.from(observed.journal), journal);
    assert.deepEqual(Buffer.from(observed.queue), queue);
    if (exact) assert.deepEqual(observed, exact);
    exact = observed;
  }
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
    const acknowledged = archive.entries().find(row => row.asset === unavailableAsset);
    assert.equal(acknowledged.status, 'uploaded');
    assert.equal(acknowledged.storageRef, 'breditor:relay-asset:1:' + unavailableAsset);
    return {coldReopens: 1, exactImages: 2, retainedOfflineRedo: true, pendingQueueAndReceipt: true};
  } finally {
    archive.dispose();
    retained.dispose();
    restored.dispose();
  }
}
