/** Cold whole-room recovery law shared unchanged by source, installed-package
 * and production-bundle tests. Seven distinct native registrations, not seven
 * labels on a duplicated client. This does not activate a network provider. */
import assert from 'node:assert/strict';
import {sevenFamilyRoomFixture} from './seven-room.mjs';
import {verifyV3RecoveredParticipant} from './participants.mjs';
import {PhysicalRoomCatalogV3 as Catalog} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v3/catalog.js';
import {PhysicalRoomClientOperationV3 as Operation} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {insertCleanupText} from '../owned-core-cleanup/session.mjs';
import {internalFailureChain} from '../../../packages/breditor-collaboration/dist/internal_failure_cause.js';

async function retire(parts) {
  for (const row of parts?.participants ?? []) {
    if (row.family === 'original') {
      await row.parts.sources.revisions?.close();
      await row.parts.sources.suggestions?.close();
      await row.parts.sources.versions?.close();
      await row.parts.session.discardAndClose();
    } else await row.parts.source.session.discardAndClose();
    row.parts.uploads.close();
  }
}

export async function sevenRoomProbe({fixtures, item, documentSegmented, reviewSegmented, tag}) {
  const f = await sevenFamilyRoomFixture({fixtures, item, documentSegmented, reviewSegmented, tag});
  let catalog, owner, parts, jobOpen = true;
  const controller = new AbortController();
  const options = {
    ...f.options, database: tag + '-intent', expected: f.archive.selection(),
    participants: f.participants, signal: controller.signal,
    checkAuthority() { assert.equal(jobOpen, true); },
  };
  try {
    await f.closeWriters();
    catalog = await Catalog.begin({...f.options, database: tag + '-catalog', archive: f.archive, expected: f.archive.selection()});
    owner = await Operation.begin({...options, catalog});
    const ready = await owner.finish();
    assert.equal(ready.participants.length, 7);
    assert.deepEqual(ready.unreconciledParticipants, []);
    await owner.close();
    owner = await Operation.resume({...options, catalogDatabase: tag + '-catalog'});
    await owner.finish();
    parts = await owner.intoParts();
    assert.equal(parts.participants.length, 7);
    assert.equal(new Set(parts.participants.map(row => row.family)).size, 7);
    for (const selected of f.participants) {
      const row = parts.participants.find(row => row.id === selected.id);
      assert.equal(row.family, selected.family);
      await verifyV3RecoveredParticipant(selected, f.source, row.parts);
      assert.equal((await row.parts.uploads.list()).length, 2, 'Whole nonempty upload store survives each family');
    }
    // The recovery job is over. Leaf current-policy owners must remain usable;
    // their lifetime is not the coordinator's AbortSignal or authority callback.
    jobOpen = false;
    controller.abort();
    for (const row of parts.participants) {
      const session = row.family === 'original' ? row.parts.session : row.parts.source.session;
      const core = session.core;
      assert.equal(core.view().readOnly === true, false);
      const before = core.documentJson();
      assert.equal(core.redo(), true);
      assert.notEqual(core.documentJson(), before);
      assert.equal(core.undo(), true);
      assert.equal(core.documentJson(), before);
      assert.equal(core.redoReview().kind, 'committed');
      assert.equal(core.undoReview().kind, 'committed');
      insertCleanupText(core, 'Seven-writer independent continuation ');
      await session.flush();
      assert.match(core.documentJson(), /Seven-writer independent continuation/);
    }
    assert.equal(f.counts.networkCalls, 0);
    return {participants: 7, coldParticipants: 7, historyPairs: 7, uploadStores: 7, postJobContinuations: 7};
  } catch (error) {
    console.error('Actual seven-room failure chain', internalFailureChain(error).map(value => ({name: value.name, code: value.code, message: value.message, stack: value.stack})));
    throw error;
  } finally {
    try { await retire(parts); }
    finally {
      try { await owner?.discardAndClose(); }
      finally { try { await catalog?.close(); } finally { await f.close(); } }
    }
  }
}
