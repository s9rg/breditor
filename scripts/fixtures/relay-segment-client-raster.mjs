/** Retain a real queue, including its upload epoch, across an exact-cut handover. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {closeSync, fsyncSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pixel, pixelAsset, secondAsset, secondPixel} from './review-assets/pixels.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function captureClientRaster(api, parent, writer, status, deferredRaster) {
  const store = await api.RichAssetStore.open('handover-original-uploads-' + writer);
  let custody;
  try {
    const item = await store.ingest(new Blob([secondPixel], {type: 'image/png'}));
    assert.equal(item.asset, secondAsset);
    assert.equal(item.status, 'pending');
    if (status === 'cancelled') await store.cancel(secondAsset);
    await store.cacheRemote(pixelAsset, new Blob([pixel], {type: 'image/png'}), 'original-\ud800');
    const deferred = deferredRaster
      ? await store.ingest(new Blob([deferredRaster.bytes], {type: 'image/png'})) : undefined;
    if (deferred) {
      assert.equal(deferred.asset, deferredRaster.asset);
      assert.equal(deferred.status, 'pending');
    }
    custody = await store.acquireRecoveryCustody();
    const backup = await store.exportBackup();
    const archive = await api.RichAssetArchive.read(backup);
    try {
      const rows = archive.entries();
      assert.equal(rows.length, 2 + Number(deferredRaster !== undefined));
      const queued = rows.find(row => row.asset === secondAsset);
      assert.equal(queued.status, status);
      assert.equal(queued.storageRef, null);
      const payload = Buffer.from(await archive.blob(secondAsset).arrayBuffer());
      assert.deepEqual(payload, secondPixel);
      const path = join(parent, 'client-' + writer + '.backup');
      const bytes = Buffer.from(await backup.arrayBuffer());
      const file = openSync(path, 'wx', 0o600);
      try {
        writeFileSync(file, bytes);
        fsyncSync(file);
      } finally {
        closeSync(file);
      }
      const directory = openSync(parent, 'r');
      try { fsyncSync(directory); } finally { closeSync(directory); }
      custody.check();
      return {path, rows, queued, deferred, pin: {writer, bytes: bytes.length, sha256: digest(bytes)}};
    } finally {
      archive.dispose();
    }
  } finally {
    try { await custody?.close(); } finally { store.close(); }
  }
}

export async function resumeClientRaster(rich, sdk, parent, address, origin, token, retained, recoveredStore, restoredRoot = 'restored') {
  const bytes = readFileSync(join(parent, restoredRoot, 'client-uploads', retained.pin.writer + '.uploads'));
  assert.equal(digest(bytes), retained.pin.sha256);
  const backup = new Blob([bytes]);
  const store = recoveredStore ?? await rich.RichAssetStore.restoreBackup('handover-restored-uploads-' + retained.pin.writer, backup, {
    uploadState: 'preserve',
  });
  const provider = new sdk.SharedRelayAssets({
    endpoint: 'ws://' + address + '/ws', principal: 'owner', getToken: () => token, store,
  });
  const fetch = globalThis.fetch;
  const url = 'http://' + address + '/assets/' + encodeURIComponent(secondAsset);
  const deferredUrl = retained.deferred
    ? 'http://' + address + '/assets/' + encodeURIComponent(retained.deferred.asset) : undefined;
  let duplicate, deferredDuplicate;
  globalThis.fetch = async (input, options) => {
    if (input !== url && input !== deferredUrl) return fetch(input, options);
    const headers = new Headers(options?.headers);
    headers.set('Origin', origin);
    const response = await fetch(input, {...options, headers});
    if (options?.method === 'PUT' && response.ok) {
      const receipt = await response.clone().json();
      if (input === url) duplicate = receipt.duplicate;
      else deferredDuplicate = receipt.duplicate;
    }
    return response;
  };
  try {
    const archive = await rich.RichAssetArchive.read(await store.exportBackup());
    try {
      assert.deepEqual(archive.entries(), retained.rows);
    } finally {
      archive.dispose();
    }
    const bytes = await provider.readBytes(secondAsset);
    assert.deepEqual(Buffer.from(await bytes.blob.arrayBuffer()), secondPixel);
    const before = await store.get(secondAsset);
    assert.equal(before.status, retained.queued.status);
    await provider.flush();
    const receipt = await store.get(secondAsset);
    if (before.status === 'cancelled') {
      assert.equal(duplicate, undefined);
      assert.deepEqual(receipt, before);
      return 0;
    }
    assert.equal(duplicate, true);
    assert.equal(receipt.status, 'uploaded');
    assert.equal(receipt.storageRef, 'breditor:relay-asset:1:' + secondAsset);
    if (retained.deferred) {
      const uploaded = await store.get(retained.deferred.asset);
      assert.equal(uploaded.status, 'uploaded');
      assert.equal(uploaded.storageRef, 'breditor:relay-asset:1:' + retained.deferred.asset);
      assert.equal(deferredDuplicate, false);
    }
    await provider.flush();
    assert.deepEqual(await store.get(secondAsset), receipt);
    return 1;
  } finally {
    globalThis.fetch = fetch;
    provider.dispose();
    store.close();
  }
}
