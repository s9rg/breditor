/** Exercise original SDK traffic on two lifetimes of the authenticated continued raster relay. */
import assert from 'node:assert/strict';
import {closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pixel, pixelAsset} from './review-assets/pixels.mjs';
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
    store.close();
    store = undefined;
    await host.crash();
    host = undefined;

    assert.equal(client.undo(), true);
    assert.ok(client.documentJson().includes(pixelAsset));
    await persistLocal();
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
    return {httpRastersRecovered: 2, stagedUploadReceipts: 1, offlineUndoAndRedo: true, combinedCapture: true};
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
