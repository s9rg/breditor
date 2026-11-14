/** Retain a real queue, including its upload epoch, across an exact-cut handover. */
import assert from 'node:assert/strict';
import {closeSync, fsyncSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {secondAsset, secondPixel} from './review-assets/pixels.mjs';

export async function captureClientRaster(api, parent) {
  const store = await api.RichAssetStore.open('handover-original-uploads');
  let custody;
  try {
    const item = await store.ingest(new Blob([secondPixel], {type: 'image/png'}));
    assert.equal(item.asset, secondAsset);
    assert.equal(item.status, 'pending');
    custody = await store.acquireRecoveryCustody();
    const backup = await store.exportBackup();
    const archive = await api.RichAssetArchive.read(backup);
    try {
      const [row] = archive.entries();
      assert.equal(archive.entries().length, 1);
      assert.equal(row.status, 'pending');
      assert.equal(row.storageRef, null);
      const {asset, mime, bytes, width, height} = row;
      const payload = Buffer.from(await archive.blob(asset).arrayBuffer());
      assert.deepEqual(payload, secondPixel);
      writeFileSync(join(parent, 'client-raster.png'), payload, {flag: 'wx', mode: 0o600});
      const path = join(parent, 'client-uploads.backup');
      const file = openSync(path, 'wx', 0o600);
      try {
        writeFileSync(file, Buffer.from(await backup.arrayBuffer()));
        fsyncSync(file);
      } finally {
        closeSync(file);
      }
      const directory = openSync(parent, 'r');
      try { fsyncSync(directory); } finally { closeSync(directory); }
      custody.check();
      return {path, row, selection: {asset, mime, bytes, width, height}};
    } finally {
      archive.dispose();
    }
  } finally {
    try { await custody?.close(); } finally { store.close(); }
  }
}

export async function resumeClientRaster(rich, sdk, address, origin, token, retained) {
  const backup = new Blob([readFileSync(retained.path)]);
  const store = await rich.RichAssetStore.restoreBackup('handover-restored-uploads', backup, {
    uploadState: 'preserve',
  });
  const provider = new sdk.SharedRelayAssets({
    endpoint: 'ws://' + address + '/ws', principal: 'owner', getToken: () => token, store,
  });
  const fetch = globalThis.fetch;
  const url = 'http://' + address + '/assets/' + encodeURIComponent(secondAsset);
  let duplicate;
  globalThis.fetch = async (input, options) => {
    if (input !== url) return fetch(input, options);
    const headers = new Headers(options?.headers);
    headers.set('Origin', origin);
    const response = await fetch(input, {...options, headers});
    if (options?.method === 'PUT' && response.ok) duplicate = (await response.clone().json()).duplicate;
    return response;
  };
  try {
    const archive = await rich.RichAssetArchive.read(await store.exportBackup());
    try {
      assert.deepEqual(archive.entries(), [retained.row]);
    } finally {
      archive.dispose();
    }
    const bytes = await provider.readBytes(secondAsset);
    assert.deepEqual(Buffer.from(await bytes.blob.arrayBuffer()), secondPixel);
    assert.equal((await store.get(secondAsset)).status, 'pending');
    await provider.flush();
    const receipt = await store.get(secondAsset);
    assert.equal(duplicate, true);
    assert.equal(receipt.status, 'uploaded');
    assert.equal(receipt.storageRef, 'breditor:relay-asset:1:' + secondAsset);
    await provider.flush();
    assert.deepEqual(await store.get(secondAsset), receipt);
    return 1;
  } finally {
    globalThis.fetch = fetch;
    provider.dispose();
    store.close();
  }
}
