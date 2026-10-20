# Back up native generations with image bytes and upload state

Generation-aware local, relay and retained sessions now have explicit source,
asset and participant backup APIs. They preserve the original native checkpoints,
sealed history, Undo and Redo, optional comments and local versions, selected
relay records, pending review packets and the complete upload store. They do not
turn saved metadata into current permission or activate a shared room.

## Select an actual source session

Use `captureSharedGenerationSource({kind, session})` with `kind: "local"`,
`"relay"` or `"retained"` matching the actual opened session. A retained source
includes all selected suggestion, revision and version records, even when their
component adapters have not been opened. A relay source includes its delivery
progress. A local source cannot be used to omit a relay session's companion data.

```ts
const source = captureSharedGenerationSource({kind: 'retained', session});
try {
  const result = await captureSharedGenerationAssets({
    source,
    resolveAsset: resolveCurrentAssetBytes,
  });
  if (result.kind === 'ready') {
    try {
      const file = await exportSharedGenerationAssetBackup(result.capture);
      // Save file using the host's chosen storage or download UI.
    } finally {
      result.capture.dispose();
    }
  }
} finally {
  source.dispose();
}
```

Reference discovery uses the actual native owner's complete retained history and
packet readers, not just the visible document. It includes Redo-only images,
local versions, proposal and revision alternatives, and cached shared versions.
An uncached version or missing packet dependency produces a pending result;
missing image bytes do not produce a partial ready archive.

Captures hold private source custody and change identities. A document, comment,
version, queue or delivery-progress change invalidates the source. Repeated
checks do not copy the native history again, and a no-op save acknowledgement
does not invalidate an unchanged cut. Capture performs no source saves, uploads
or network requests. Dispose the capture when finished.

The original `captureSharedAssetReferences()` now refuses generation owners
instead of incorrectly describing their data as the original bounded family.
Its original-family behavior remains unchanged. Copied options, public exporter
overrides, parsed metadata and prototype lookalikes cannot replace a live source.

## Keep the file families and nested limits distinct

The new selected-byte file is `breditor/shared-generation-asset-backup` version
one, with MIME type `application/vnd.breditor.generation-asset-backup`. Each native
or retained record occupies a separately hashed contiguous byte range. Native
JSON strings stay exact; they are not parsed into an AST and rewritten or
escaped inside one larger original journal record.

The existing nested limits still apply: 64 MiB for native generation history,
16 MiB for paired review history, up to 32 local versions of 4 MiB each, 16 KiB
for relay progress, and 32 MiB for each selected retained-store record. The source
has at most 39 records. `MAX_GENERATION_SOURCE_BYTES` includes those complete
records and bounded framing allowance. `MAX_GENERATION_ASSET_HEADER_BYTES` and
`MAX_GENERATION_ASSET_BACKUP_BYTES` bound the separate manifest and full file.
Raster admission and the original stored-image byte limit remain unchanged.

`readSharedGenerationAssetBackup()` checks closed metadata, exact offsets,
canonical framing, full-body length, hashes, source-record shape and ordinary
raster admission. It supplies detached recovery data and local image resolution;
reading a file is not native provenance or writer authority. Native replay and
exact reference comparison occur during actual source recovery. The old
selected-byte reader rejects the new family rather than silently migrating it.

## Capture every upload state with the source

`captureSharedGenerationParticipant()` takes the source inside the complete
`RichAssetStore` snapshot transaction. Its file includes both the generation
selected-byte archive and the original whole-store upload backup. Pending,
uploaded, failed and cancelled entries retain their exact epochs, attempt counts,
opaque provider receipts and unreferenced immutable payloads. Capturing does not
restart uploads or discard records that are absent from the visible document.

These files contain deleted and pending content, historical images and opaque
provider receipts. Treat them as private backups; framing and hashes do not add
encryption. Dispose the backup handle after saving it or handing its file to
recovery.

```ts
const result = await captureSharedGenerationParticipant({
  participant: 'desktop',
  principal: currentPrincipal,
  source: {kind: 'retained', session},
  assets: uploadStore,
  checkAuthority() {
    assertCurrentPrincipalAndReacquiredWriterLease();
  },
  resolveAsset: resolveCurrentAssetBytes,
});
if (result.kind === 'ready') {
  const backup = result.backup;
  const selection = backup.selection();
  const file = backup.file();
  // Retain the independently selected identity and digest as well as file.
}
```

Content-addressed bytes are resolved from the captured upload store first. The
host resolver must supply any remaining historical or opaque assets and a live
provider check. Provider revocation, cancellation or a source change refuses the
capture. Host authority checks must be synchronous and return no value.

The participant format is `breditor/shared-generation-participant-backup`
version one, with its own MIME type and exported size limits. Reading it requires
the independently retained `selection`, including the complete file digest. It
does not create databases or call a native recovery factory.

## Resume recovery without replacing acknowledged data

`SharedGenerationParticipantRecovery.begin()` requires the genuine backup,
independent selection, three distinct database names, an explicitly matching
local, relay or retained native factory, and a current host authority callback.
The host must reacquire the selected writer's authority before supplying that
callback. Current read-only and review-access policies come from the host, not
the file. Credentials, account grants and token callbacks are not portable data.

The coordinator reserves dedicated source and upload destinations. It retains
the original file and progress record in its own database before recovering
components. `finish()` records each started step, inspects actual destination
data, replays the original native sources and verifies the complete upload file
before marking ready. Concurrent `finish()` calls share one operation. No room
connection or upload starts automatically.

```ts
const attempt = await SharedGenerationParticipantRecovery.begin({
  database: recoveryDatabase,
  destinations: {source: recoveredSourceDatabase, uploads: recoveredUploadDatabase},
  expected: independentlyRetainedSelection,
  backup,
  session: {kind: 'retained', options: currentNativeAndRetainedSourceOptions},
  checkAuthority: assertCurrentPrincipalAndReacquiredWriterLease,
});
const recovered = await attempt.finish();
const parts = await recovered.intoParts();
// parts.source retains its actual native/source leases; parts.uploads is open.
```

After interruption, close the attempt and call `resume()` with the same names,
selection, explicit factories and fresh authority checks. Resume reads the stored
original file; it has no replacement-backup argument. It accepts an existing
destination only when its full native files, head, selected records and upload
bytes match the selected cut. A committed step whose acknowledgement was lost
can be resumed. Missing acknowledged generation files, changed upload epochs,
foreign state, altered original bytes and changed coordinator markers are not
overwritten or repaired. A failed attempt keeps its original file readable until
explicit close.

Ready is still an exact recovery cut, not operational activation. Once
`intoParts()` transfers the owners and the host permits edits or upload changes,
this coordinator must not be used as a general reopen API for that evolved
participant. Operational generation continuation, participant and room catalogs,
complete provider closure, independent comment/server generations and whole-room
activation remain release work. All 13 V1 gates remain open.

## Functional verification

The [2026-10-20 qualification](qualification/2026-10-20-generation-asset-recovery.json)
passes 59 selected checks, 911 script tests and 385 editor tests, with three
existing opt-in script checks skipped. The installed-backup check rebuilds the
runtime pair; its hashes match the qualified binaries. The unchanged Rust inputs
carry the earlier 653 shared and 216 relay tests, not a fresh native suite run.

The same 86 assertions pass against the workspace SDK and freshly installed
public archives with the actual canonical Wasm owner. They cover 36 paired source
configurations, 18 document-only native restore configurations, six paired cold
participant recoveries, original-wire version-only retention, all four upload
states, interrupted and uncertain commits, revocation, corrupted framing and
exact refusal of changed destinations. Strict public types and a production
bundle also pass without workspace links. IndexedDB, locks and raster decoding in
these checks are explicit fixtures, not browser durability or accessibility
qualification. The historical WebKit fault remains unconfirmed.
