/** Actual admitted whole upload files. No synthetic receipt is authenticated. */
import test from 'node:test';import assert from 'node:assert/strict';
import {RichAssetArchive,RichAssetStore,defaultAssetLimits} from '@breditor/experimental-rich-content';
import {verifySelectedUploadContinuation as verify} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/asset_continuation.js';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {pixel,pixelAsset,secondPixel} from './fixtures/review-assets/pixels.mjs';
test('a later baseline retains newly earned uploaded receipts, not only initial selected pending state',async()=>{const reset=environment();let store,other;try{store=await RichAssetStore.open('later-receipt');await store.ingest(new Blob([pixel],{type:'image/png'}));const pending=await store.exportBackup();await store.flush(async()=> 'first-earned-receipt');const uploaded=await store.exportBackup();await verify(pending,uploaded,defaultAssetLimits,()=>{});await assert.rejects(verify(uploaded,pending,defaultAssetLimits,()=>{}));other=await RichAssetStore.open('changed-receipt');await other.ingest(new Blob([pixel],{type:'image/png'}));await other.flush(async()=> 'different-receipt');await assert.rejects(verify(uploaded,await other.exportBackup(),defaultAssetLimits,()=>{}));}finally{other?.close();store?.close();reset();}});
test('later cuts may add actual retained bytes and advance cancellation/retry epochs',async()=>{const reset=environment();let store;try{store=await RichAssetStore.open('queue-progress');await store.ingest(new Blob([pixel],{type:'image/png'}));await store.cancel(pixelAsset);const cancelled=await store.exportBackup();await store.retry(pixelAsset);await store.ingest(new Blob([secondPixel],{type:'image/png'}));await verify(cancelled,await store.exportBackup(),defaultAssetLimits,()=>{});await assert.rejects(verify(await store.exportBackup(),cancelled,defaultAssetLimits,()=>{}));}finally{store?.close();reset();}});
test('the same retained cut requires complete reads and fresh authority', async () => {
  const reset = environment();
  const assetBlob = RichAssetArchive.prototype.blob;
  const arrayBuffer = Blob.prototype.arrayBuffer;
  const compared = new WeakSet();
  let store;
  try {
    store = await RichAssetStore.open('queue-short-read');
    await store.ingest(new Blob([pixel], {type: 'image/png'}));
    const file = await store.exportBackup();
    await verify(file, file, defaultAssetLimits, () => {});
    const revoked = Error('fresh scope revoked');
    await assert.rejects(verify(file, file, defaultAssetLimits, () => { throw revoked; }), value => value === revoked);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(verify(file, file, defaultAssetLimits, () => {}, controller.signal));

    let verifyFault;
    try {
      RichAssetArchive.prototype.blob = function(asset) {
        const blob = assetBlob.call(this, asset);
        assert.ok(blob);
        assert.equal(blob.size, pixel.length);
        compared.add(blob);
        return blob;
      };
      ({verifySelectedUploadContinuation: verifyFault} = await import(
        '../packages/breditor-collaboration/dist/physical_room_asset_successor/asset_continuation.js?short-read'
      ));
    } finally {
      RichAssetArchive.prototype.blob = assetBlob;
    }
    const acceptedCounts = [];
    for (const count of [0, pixel.length - 1, pixel.length + 1]) {
      let reads = 0;
      Blob.prototype.arrayBuffer = function() {
        if (!compared.has(this)) return arrayBuffer.call(this);
        reads++;
        return Promise.resolve(new ArrayBuffer(count));
      };
      try {
        await verifyFault(file, file, defaultAssetLimits, () => {});
        acceptedCounts.push(count);
      } catch (error) {
        assert.equal(error.code, 'asset_adoption_diverged');
      }
      assert.equal(reads, 2);
    }
    assert.deepEqual(acceptedCounts, []);
  } finally {
    Blob.prototype.arrayBuffer = arrayBuffer;
    store?.close();
    reset();
  }
});
