/** Live native boundaries and physical maintenance on the portable replacement process. */
import assert from 'node:assert/strict';

const native = (lane, boundary) => ({kind: 'boundary', lane, boundary});
const describe = {kind: 'describe'};
const capacity = {kind: 'capacity'};
const rotate = {kind: 'rotate', next: 'portable-maintenance-wal'};
const checkpoint = {kind: 'checkpoint'};
const pack = {kind: 'pack', generation: 'relocated-one'};
const archive = {kind: 'archive', generation: pack.generation};

async function accepted(host, token, action, principal = 'owner') {
  const row = await host.maintenance(principal, token, action);
  assert.ok('result' in row, row.error);
  return row.result;
}

export async function advanceRelocatedHistories(host, token, readerToken) {
  const before = await accepted(host, token, capacity);
  const intents = [
    native('document', {kind: 'continueDocument', next: 'portable-doc-two'}),
    native('review', {kind: 'continueReview', next: 'portable-review-two'}),
  ];
  const denied = {kind: 'maintenance', error: 'room permission denied'};
  assert.deepEqual(await host.maintenance('owner', readerToken, intents[0]), denied);
  assert.deepEqual(await host.maintenance('reader', readerToken, intents[0]), denied);
  assert.deepEqual(await host.maintenance('reader', readerToken, rotate), denied);
  assert.deepEqual(await host.maintenance('reader', readerToken, capacity), denied);
  const descriptor = await accepted(host, readerToken, describe, 'reader');
  assert.equal(descriptor.document, 'segmented-v1');
  assert.equal(descriptor.review, 'segmented-v1');
  assert.deepEqual(await accepted(host, token, capacity), before);
  const expectedFamilies = [
    ['continued-v2', 'segmented-v1'],
    ['continued-v2', 'continued-v2'],
  ];
  const receipts = [];
  for (const [index, intent] of intents.entries()) {
    const receipt = await accepted(host, token, intent);
    assert.equal(receipt.sequence, String(BigInt(before.log.nextSequence) + BigInt(index)));
    assert.equal(receipt.duplicate, false);
    assert.deepEqual(receipt.boundary, intent.boundary);
    assert.equal(receipt.lane, intent.lane);
    const families = await accepted(host, token, describe);
    assert.deepEqual([families.document, families.review], expectedFamilies[index]);
    receipts.push(receipt);
  }
  const continued = await accepted(host, token, capacity);
  assert.equal(continued.log.nextSequence, String(BigInt(before.log.nextSequence) + BigInt(intents.length)));
  assert.equal(continued.log.rotation.continuationFilesRemaining, before.log.rotation.continuationFilesRemaining);
  assert.equal(continued.log.rotation.canRotate, true);
  const rotation = await accepted(host, token, rotate);
  assert.equal(rotation.generation, rotate.next);
  assert.equal(rotation.duplicate, false);
  const rotated = await accepted(host, token, capacity);
  assert.equal(rotated.log.nextSequence, continued.log.nextSequence);
  assert.deepEqual(rotated.log.terminalDigest, continued.log.terminalDigest);
  assert.equal(rotated.log.rotation.continuationFilesRemaining, continued.log.rotation.continuationFilesRemaining - 1);
  assert.deepEqual(await host.maintenance('reader', readerToken, checkpoint), denied);
  assert.deepEqual(await host.maintenance('reader', readerToken, pack), denied);
  const selected = await accepted(host, token, checkpoint);
  assert.equal(String(selected.source.records), rotated.log.nextSequence);
  assert.deepEqual(selected.source.terminalLogDigest, rotated.log.terminalDigest);
  assert.deepEqual(await host.maintenance('reader', readerToken, archive), denied);
  const packed = await accepted(host, token, pack);
  assert.equal(packed.packed, true);
  assert.equal(packed.generation, pack.generation);
  assert.ok(packed.storedBytes < packed.originalBytes);
  const archived = await accepted(host, token, archive);
  assert.deepEqual(archived, {generation: pack.generation, storedBytes: packed.storedBytes, duplicate: false});
  assert.deepEqual(await accepted(host, token, capacity), rotated);
  return {intents, receipts, rotation, packed, archived};
}

export async function verifyRelocatedMaintenanceRetries(host, token, state) {
  const before = await accepted(host, token, capacity);
  const descriptor = await accepted(host, token, describe);
  assert.equal(descriptor.formatVersion, 2);
  assert.equal(descriptor.document, 'continued-v2');
  assert.equal(descriptor.review, 'continued-v2');
  for (const [index, intent] of state.intents.entries()) {
    assert.deepEqual(await accepted(host, token, intent), {...state.receipts[index], duplicate: true});
  }
  assert.deepEqual(await accepted(host, token, rotate), {...state.rotation, duplicate: true});
  assert.deepEqual(await accepted(host, token, pack), state.packed);
  assert.deepEqual(await accepted(host, token, archive), {...state.archived, duplicate: true});
  assert.deepEqual(await accepted(host, token, capacity), before);
  return {
    liveNativeHistoryBoundaries: state.intents.length,
    nativeHistoryColdRetries: state.intents.length,
    physicalWalRotations: 1,
    physicalWalColdRetries: 1,
    deniedMaintenanceRequests: 7,
    retainedLiveClientSockets: 2,
    relocatedSealedWalPacks: 1,
    relocatedSealedWalArchives: 1,
    sealedWalColdRetries: 2,
    walPhysicalBytesReclaimed: state.packed.originalBytes - state.packed.storedBytes,
  };
}
