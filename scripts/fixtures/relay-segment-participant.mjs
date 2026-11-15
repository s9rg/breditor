/** Capture and reopen the unchanged SDK binary in the real relay handover fixture. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {restoreParticipantThroughRecovery} from './independent-delivery-recovery/session.mjs';
import {proposalAsset, proposalPixel} from './review-assets/pixels.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const proposalAlias = 'sha256:opaque-proposal';
const magic = Buffer.from('BREDITOR-INDEPENDENT-DELIVERY-PARTICIPANT1\n');

export async function captureParticipant(api, rich, session, upload, assetKey, database = 'handover-participant-assets') {
  const uploadBackup = readFileSync(upload.path);
  const store = await rich.RichAssetStore.restoreBackup(
    database, new Blob([uploadBackup]), {uploadState: 'preserve'},
  );
  try {
    const result = await api.captureSharedIndependentDeliveryParticipant({
      participant: 'archived-writer', principal: 'owner', source: {session},
      assets: store, checkAuthority() {},
      resolveAsset(reference) {
        if (reference.asset !== assetKey) return undefined;
        return {
          ...reference, identity: assetKey === proposalAsset ? 'content-addressed' : 'host-verified',
          blob: new Blob([proposalPixel], {type: 'image/png'}), check() {},
        };
      },
    });
    assert.equal(result.kind, 'ready', JSON.stringify(result.pending));
    const backup = result.backup;
    try {
      assert.deepEqual(backup.uploadEntries(), upload.rows);
      assert.deepEqual(Buffer.from(await backup.uploadBackup().arrayBuffer()), uploadBackup);
      if (assetKey !== undefined) {
        assert.ok(backup.metadata().assets.some(asset => asset.contentAsset === proposalAsset));
        const binding = backup.metadata().bindings.find(({asset}) => asset === assetKey);
        assert.equal(binding.contentAsset, proposalAsset);
        assert.equal(binding.identity, assetKey === proposalAsset ? 'content-addressed' : 'host-verified');
        assert.equal(backup.uploadBlob(proposalAsset), undefined);
      }
      return {
        archive: Buffer.from(await backup.file().arrayBuffer()),
        selection: backup.selection(),
      };
    } finally {
      backup.dispose();
    }
  } finally {
    store.close();
  }
}

export async function reopenParticipant(api, options, bytes, selection, upload, assetKey) {
  const backup = await api.readSharedIndependentDeliveryParticipant(new Blob([bytes]), selection);
  try {
    assert.deepEqual(backup.uploadEntries(), upload.rows);
    assert.equal(sha(Buffer.from(await backup.uploadBackup().arrayBuffer())), upload.pin.sha256);
    const image = backup.blob(assetKey, 'queued-proposal-image');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), proposalPixel);
    return await restoreParticipantThroughRecovery({
      api, options, backup, uploadsDatabase: options.database + '-participant-uploads',
    });
  } finally {
    backup.dispose();
  }
}

/** Recover the retained fork offline, under the original native writer and actor. */
export async function checkRecoveredAlternate(api, options, bytes, selection, expected) {
  const backup = await api.readSharedIndependentDeliveryParticipant(new Blob([bytes]), selection);
  try {
    assert.deepEqual(backup.sourceRecovery(), expected);
    const {session, uploads} = await restoreParticipantThroughRecovery({
      api, options, backup, uploadsDatabase: options.database + '-uploads',
    });
    try {
      assert.deepEqual(session.exportRecovery(), expected);
      const text = () => session.core.documentJson();
      const review = () => session.core.reviewSnapshot().view.threads
        .filter(({thread}) => !thread.hidden).length;
      const visible = review();
      assert.match(text(), /Competing branch text/);
      assert.equal(session.core.undo(), true);
      assert.equal(session.core.undoReview().kind, 'committed');
      assert.doesNotMatch(text(), /Competing branch text/);
      assert.equal(review(), visible - 1);
      assert.equal(session.core.redo(), true);
      assert.equal(session.core.redoReview().kind, 'committed');
      assert.match(text(), /Competing branch text/);
      assert.equal(review(), visible);
      return 2;
    } finally {
      try { await session.close(); } finally { uploads.close(); }
    }
  } finally {
    backup.dispose();
  }
}

// Reseal the outer envelope so the test exercises native receipt admission.
export function withWrongReviewReceipt(archive, review) {
  assert.deepEqual(archive.subarray(0, magic.length), magic);
  const start = magic.length + 4;
  const bodyOffset = start + archive.readUInt32BE(magic.length);
  const header = JSON.parse(archive.subarray(start, bodyOffset));
  const body = archive.subarray(bodyOffset);
  const row = header.records.find(row => row.kind === 'relay');
  const relay = JSON.parse(body.subarray(row.offset, row.offset + row.bytes));
  const changed = Buffer.from(JSON.stringify({...relay, review}));
  const tail = row.offset + row.bytes;
  const delta = changed.length - row.bytes;
  for (const record of [...header.records, ...header.assets, header.uploads]) {
    if (record.offset >= tail) record.offset += delta;
  }
  row.bytes = changed.length;
  row.sha256 = sha(changed);
  header.metadata.sourceBytes += delta;
  delete header.sha256;
  header.sha256 = sha(JSON.stringify(header));
  const encoded = Buffer.from(JSON.stringify(header));
  const prefix = Buffer.alloc(start);
  magic.copy(prefix);
  prefix.writeUInt32BE(encoded.length, magic.length);
  return Buffer.concat([prefix, encoded, body.subarray(0, row.offset), changed, body.subarray(tail)]);
}
