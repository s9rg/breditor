# Selected source and raster byte backups

`captureSharedAssetBytes` combines a genuine selected-source capture with the
immutable raster bytes needed by its complete native asset inventory. The result
can be exported as one portable binary file without rewriting native asset IDs,
flushing sources, uploading bytes or changing the accepted document. This is an
optional shared SDK layer; native document, operation and history formats and
ordinary startup defaults are unchanged.

Its scope is `native-and-selected-retained-packets`: the native journal and the
paired session, version catalog, proposal queue and revision outbox explicitly
supplied to [source capture](RETAINED_ASSET_REFERENCES.md#selected-retained-source-capture).
Omitted participants, SDK remote queues, extension assets and server state are
not silently included.

## Capture bytes with an explicit host resolver

```js
import {
  captureSharedAssetReferences, captureSharedAssetBytes,
  exportSharedAssetBytesBackup
} from '@breditor/collaboration';

const source = captureSharedAssetReferences({
  core, session, versions, suggestions, revisions
});
try {
  const result = await captureSharedAssetBytes({source, resolveAsset, signal});
  if (result.kind === 'pending') {
    reportMissingDependencies(result.pending);
  } else {
    try {
      const file = await exportSharedAssetBytesBackup(result.capture, {signal});
      await saveBackupFile(file);
    } finally {
      result.capture.dispose();
    }
  }
} finally {
  source.dispose();
}
```

The host's `resolveAsset(reference, signal)` returns either `undefined` for missing
bytes or `{asset, generation, identity, blob, check}` for the exact requested pair.
`check()` must synchronously return nothing, throwing if the original immutable
mapping or required provider authority no longer holds. An async check, changed
identity or invalid provider result refuses the capture. Provider failures use
fixed diagnostics rather than returning private host strings.

For a native `sha256:` content ID, `identity` must be `content-addressed` and the
admitted bytes must hash to that exact ID. Other original IDs require
`identity: 'host-verified'` and the host's current mapping check. An asset ID must
keep one content digest across its binding generations. Generation distinguishes
native image bindings; it is not a mutable byte revision or a storage-generation
rollover. Identical payloads are stored once without changing the original pairs.

`inspectRichRaster(blob, {limits?, signal?})`, also exported by the local rich and
editor package roots, performs pure ordinary PNG/JPEG/WebP admission. It snapshots
the actual Blob bytes before asynchronous work and returns frozen digest, MIME,
dimensions, length and Blob metadata. It writes no cache and contacts no provider.
`checkRichAssetLimits` accepts only known positive integer policies that tighten
the existing defaults.

## Pending and live consistency

Unavailable native proposal source or an uncached known version produces a
source Pending result before any byte resolver runs. Missing raster bytes produce
an asset Pending result without a usable partial capture. Retry from a fresh
source after resolving dependencies separately.

Capture and export recheck the exact native publication, every selected producer's
raw recovery record and host mapping guards around awaited work. Producer changes
can invalidate the capture without advancing native publication. Copies and
serialized metadata are not source handles. Cancellation returns no partial Ready
result and does not retire borrowed owners or cancel their ordinary later work.

A Ready handle exposes `metadata()`, exact `records()`, `blob(asset, generation)`,
`payload(contentAsset)`, `check()` and `dispose()`. Previously captured bytes and
records remain readable after staleness for rescue, but live checking and export
refuse. Disposal releases bytes and borrowed source/provider references; it does
not close the original owners. Detached metadata remains readable after disposal.

## Read and restore with native admission

`readSharedAssetBytesBackup(file, {limits?, signal?})` returns an immutable
`SharedAssetBytesArchive` after checking canonical framing, complete byte ranges,
checksums and ordinary raster decoding. `records()` preserves the original opaque
recovery JSON, while `blob(asset, generation)` uses exact string identities.
`resolve(asset, generation)` creates local object URLs, deduplicated by content;
`dispose()` revokes them and releases the archive. No URL is a provider request.

Checksums detect corruption, not provenance, permissions or native validity. To
recover selected sources, the host must:

1. Select the original native grammar/history/selection policies independently
   and reacquire the writer's authority without cloning a live author.
2. Re-admit the exact document or paired journal through its matching existing
   native/session factory. Keep ordinary insert-only destination checks.
3. Reconstruct dependent component archives with
   `encodeSharedRetainedStoreBackup(sourcePolicy, recordJson)` and restore through
   the [existing insert-only factories](RETAINED_STORE_BACKUPS.md). The wrapper
   structurally validates the host-selected identity; it does not prove replay
   or grant authority. Paired records use `encodeSharedPairedSessionBackup`.
4. Derive a fresh genuine selected-source capture from those restored owners and
   call `archive.verifySource(capture)` before exposing the recovery as verified.

The final check compares exact document, publication, raw selected records and
complete native reference pairs. Removing a declared binding or changing source
JSON still refuses even if the file's checksum was recomputed correctly. A
serialized `host-verified` claim does not authenticate a new provider or grant
upload access. Recover provider authority separately.

## Independent framing and refusal bounds

The independent family is `breditor/shared-selected-asset-backup`, version one,
with MIME `application/vnd.breditor.selected-asset-bytes`. A 19-byte
`BREDITOR-SELECTED1\n` magic and four-byte big-endian header length precede canonical
UTF-8 JSON. Header metadata, section offsets and SHA-256 digests cover exact source
text and immutable raster payloads. Sources precede sorted unique payloads; all
ranges are contiguous with no missing, overlapping or trailing data. Unknown or
duplicate fields, alternate canonical spellings and replacement Unicode refuse.

The header ceiling is 64 MiB; total source JSON retains its separate 160 MiB
ceiling, with at most 16 MiB per document and 32 MiB per dependent record. At most
100,000 complete binding pairs are admitted. Unique payloads retain the ordinary
100 MiB total, 10 MiB per file, 16,384 maximum dimension and 32,000,000 pixel
bounds. The complete file ceiling is 324 MiB plus the 23-byte prefix. These are
refusal bounds, not an approved memory or performance envelope. Limits never
truncate recovery data or widen existing stores.

## Remaining room recovery work

This selected file does not preserve raster-store upload epochs, pending statuses,
receipts or unreferenced pending files. Preserve those separately with the
[whole-store raster archive](RICH_ASSET_BACKUPS.md). Selected source JSON can contain
private text, deleted history and review metadata; the file is not encrypted.

The separate [participant backup](SHARED_PARTICIPANT_BACKUPS.md) now coordinates
a declared native/packet source with a complete upload snapshot inside the active
asset transaction. It retains both original files and verifies recovered source
owners and uploads together, without turning several restores into one transaction.

Several restored databases are not one transaction. Complete participant/server
capture, resumable room recovery, current provider and cross-device writer
authority, and the approved cross-generation Undo/offline bridge remain separate
work. Neither the conservative native inventory nor this file grants garbage
collection permission or V1 release approval.

The [selected-byte checkpoint](qualification/2026-10-19-selected-asset-bytes.json)
records the frozen 31-check qualification, actual native/public-package source
recovery, real three-format raster/reload acceptance and the reproduced limit-key
validation repair. Its scope remains this selected backup layer, not room-wide
recovery or release readiness.
