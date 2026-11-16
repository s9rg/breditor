/** Live native boundaries and physical maintenance on the portable replacement process. */
import assert from 'node:assert/strict';

const native = (lane, boundary) => ({kind: 'boundary', lane, boundary});
const preview = intent => ({...intent, kind: 'prepareBoundary'});
const apply = selection => ({kind: 'applyPreparedBoundary', selection});
const resolve = selection => ({kind: 'resolveBoundary', selection});
const describe = {kind: 'describe'};
const capacity = {kind: 'capacity'};
const nativeCapacity = {kind: 'nativeCapacity'};
const rotate = {kind: 'rotate', next: 'portable-maintenance-wal'};
const checkpoint = {kind: 'checkpoint'};
const pack = {kind: 'pack', generation: 'relocated-one'};
const archive = {kind: 'archive', generation: pack.generation};

async function accepted(host, token, action, principal = 'owner') {
  const row = await host.maintenance(principal, token, action);
  assert.ok('result' in row, row.error);
  return row.result;
}

export async function readNativeHistoryCapacity(host, token) {
  const report = await accepted(host, token, nativeCapacity);
  assert.equal(report.format, 'breditor/relay-native-history-capacity');
  assert.equal(report.formatVersion, 1);
  for (const lane of [report.document, report.review, report.suggestionEffect]) {
    assert.ok(lane);
    for (const charge of [lane.checkpointBytes, lane.activeBytes, lane.generationFiles]) {
      assert.ok(Number.isSafeInteger(charge.used) && charge.used > 0 && charge.used <= charge.limit);
    }
  }
  return report;
}

function advancedLane(before, after) {
  assert.equal(before.family, 'segmented-v1');
  assert.equal(after.family, 'continued-v2');
  assert.equal(before.checkpointBytes.limit, 64 * 1024 * 1024);
  assert.equal(after.checkpointBytes.limit, 256 * 1024 * 1024);
  assert.deepEqual(after.generationFiles, {used: before.generationFiles.used + 1, limit: 256});
  assert.equal(after.activeBytes.limit, before.activeBytes.limit);
  assert.equal(after.undoItems, before.undoItems);
  assert.equal(after.redoItems, before.redoItems);
}

export async function advanceRelocatedHistories(host, token, readerToken) {
  const before = await accepted(host, token, capacity);
  const beforeNative = await readNativeHistoryCapacity(host, token);
  const intents = [
    native('document', {kind: 'continueDocument', next: 'portable-doc-two'}),
    native('review', {kind: 'continueReview', next: 'portable-review-two'}),
  ];
  const denied = {kind: 'maintenance', error: 'room permission denied'};
  assert.deepEqual(await host.maintenance('owner', readerToken, intents[0]), denied);
  assert.deepEqual(await host.maintenance('reader', readerToken, intents[0]), denied);
  assert.deepEqual(await host.maintenance('reader', readerToken, rotate), denied);
  assert.deepEqual(await host.maintenance('reader', readerToken, capacity), denied);
  assert.deepEqual(await host.maintenance('reader', readerToken, nativeCapacity), denied);
  assert.deepEqual(await host.maintenance('owner', readerToken, nativeCapacity), denied);
  assert.deepEqual(await host.maintenance('reader', readerToken, preview(intents[0])), denied);
  const descriptor = await accepted(host, readerToken, describe, 'reader');
  assert.equal(descriptor.document, 'segmented-v1');
  assert.equal(descriptor.review, 'segmented-v1');
  assert.deepEqual(await accepted(host, token, capacity), before);
  const expectedFamilies = [
    ['continued-v2', 'segmented-v1'],
    ['continued-v2', 'continued-v2'],
  ];
  const receipts = [];
  const selections = [];
  const staleReview = await accepted(host, token, preview(intents[1]));
  assert.deepEqual(staleReview.capacityBefore, beforeNative);
  let expectedNative = beforeNative;
  for (const [index, intent] of intents.entries()) {
    const beforeAppend = await accepted(host, token, capacity);
    const plan = await accepted(host, token, preview(intent));
    assert.deepEqual(plan.capacityBefore, expectedNative);
    assert.deepEqual(plan.selection.source.terminalLogDigest, beforeAppend.log.terminalDigest);
    assert.equal(String(plan.selection.source.records), beforeAppend.log.nextSequence);
    assert.equal(plan.selection.append.rotatesWal, false);
    assert.ok(plan.selection.append.framedBytes > 72);
    assert.equal(await accepted(host, token, resolve(plan.selection)), null);
    assert.deepEqual(await accepted(host, token, capacity), beforeAppend);
    if (index === 0) {
      assert.deepEqual(await host.maintenance('owner', readerToken, apply(plan.selection)), denied);
      assert.deepEqual(await host.maintenance('reader', readerToken, resolve(plan.selection)), denied);
    }
    const receipt = await accepted(host, token, apply(plan.selection));
    assert.equal(receipt.sequence, String(BigInt(before.log.nextSequence) + BigInt(index)));
    assert.deepEqual([receipt.before, receipt.after], [plan.selection.before, plan.selection.after]);
    assert.equal(receipt.duplicate, false);
    assert.deepEqual(receipt.boundary, intent.boundary);
    assert.equal(receipt.lane, intent.lane);
    const families = await accepted(host, token, describe);
    assert.deepEqual([families.document, families.review], expectedFamilies[index]);
    const observedNative = await readNativeHistoryCapacity(host, token);
    assert.deepEqual(observedNative, plan.capacityAfter);
    const afterAppend = await accepted(host, token, capacity);
    assert.equal(afterAppend.log.active.framedBytesRemaining,
      beforeAppend.log.active.framedBytesRemaining - plan.selection.append.framedBytes);
    if (index === 0) {
      assert.deepEqual(await host.maintenance('owner', token, apply(staleReview.selection)), {
        kind: 'maintenance', error: 'relay contract: native history selection is stale',
      });
      assert.deepEqual(await accepted(host, token, capacity), afterAppend);
      advancedLane(beforeNative.document, observedNative.document);
      advancedLane(beforeNative.suggestionEffect, observedNative.suggestionEffect);
      assert.equal(observedNative.document.retainedEntries, beforeNative.document.retainedEntries);
      assert.equal(observedNative.suggestionEffect.retainedEntries,
        beforeNative.suggestionEffect.retainedEntries);
      assert.equal(observedNative.document.activeEntries.used, 0);
      assert.equal(observedNative.document.undoItemLimit, 16000);
      assert.deepEqual(observedNative.review, beforeNative.review);
    } else {
      advancedLane(beforeNative.review, observedNative.review);
      assert.equal(observedNative.review.retainedEvents.used, beforeNative.review.retainedEvents.used);
      assert.equal(observedNative.review.retainedEvents.limit, 262144);
      assert.equal(observedNative.review.activeEvents.used, 0);
      assert.deepEqual(observedNative.document, expectedNative.document);
      assert.deepEqual(observedNative.suggestionEffect, expectedNative.suggestionEffect);
    }
    assert.deepEqual(observedNative.boundaryRecords, {
      used: beforeNative.boundaryRecords.used + index + 1,
      limit: 128 + 192 * (index + 1),
    });
    expectedNative = observedNative;
    receipts.push(receipt);
    selections.push(plan.selection);
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
  assert.deepEqual(await readNativeHistoryCapacity(host, token), expectedNative);
  return {intents, selections, receipts, rotation, packed, archived,
    nativeAfterMaintenance: expectedNative};
}

export async function verifyRelocatedMaintenanceRetries(host, token, state, nativeBeforeCrash) {
  const before = await accepted(host, token, capacity);
  assert.deepEqual(await readNativeHistoryCapacity(host, token), nativeBeforeCrash);
  const descriptor = await accepted(host, token, describe);
  assert.equal(descriptor.formatVersion, 2);
  assert.equal(descriptor.document, 'continued-v2');
  assert.equal(descriptor.review, 'continued-v2');
  for (const [index, intent] of state.intents.entries()) {
    assert.deepEqual(await accepted(host, token, resolve(state.selections[index])),
      {...state.receipts[index], duplicate: true});
    assert.deepEqual(await accepted(host, token, intent), {...state.receipts[index], duplicate: true});
  }
  assert.deepEqual(await accepted(host, token, rotate), {...state.rotation, duplicate: true});
  assert.deepEqual(await accepted(host, token, pack), state.packed);
  assert.deepEqual(await accepted(host, token, archive), {...state.archived, duplicate: true});
  assert.deepEqual(await accepted(host, token, capacity), before);
  assert.deepEqual(await readNativeHistoryCapacity(host, token), nativeBeforeCrash);
  return {
    liveNativeHistoryBoundaries: state.intents.length,
    nativeHistoryColdRetries: state.intents.length,
    physicalWalRotations: 1,
    physicalWalColdRetries: 1,
    deniedMaintenanceRequests: 7,
    deniedNativeCapacityRequests: 2,
    nativeCapacityMatchesColdRestart: true,
    reportedNativeCapacityLanes: 3,
    guardedNativeBoundaries: state.selections.length,
    preparedNativeBoundariesResolvedAfterRestart: state.selections.length,
    stalePreparedBoundaryRefusals: 1,
    deniedPreparedBoundaryRequests: 3,
    retainedLiveClientSockets: 2,
    relocatedSealedWalPacks: 1,
    relocatedSealedWalArchives: 1,
    sealedWalColdRetries: 2,
    walPhysicalBytesReclaimed: state.packed.originalBytes - state.packed.storedBytes,
  };
}
