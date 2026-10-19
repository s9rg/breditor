# Retained raster asset backups

`RichAssetStore` can export its retained raster bytes and upload state, then
restore them atomically into an empty asset store. The archive includes assets
used only by Undo, saved versions or offline work. It is separate from native
document and [shared session archives](SHARED_SESSION_BACKUPS.md), and does not
make those independent captures a coordinated room backup.

## Capture and restore

Import `RichAssetStore` from `@breditor/experimental-rich-content` or
`@breditor/editor`. Its new methods use the existing store and admission policy:

```ts
const backup = await assets.exportBackup({signal}); // Blob, not document JSON
const recovered = await RichAssetStore.restoreBackup('restored-assets', backup, {
  uploadState: 'preserve',
  signal,
  limits: {maxStoredBytes: 50 * 1024 * 1024}
});
// Borrow recovered.resolve(assetId) for rendering; close the store explicitly.
```

Export captures every asset and the byte counter in one consistent readonly
IndexedDB transaction. It then verifies the retained raster payloads and encodes
the archive asynchronously. Later ingestion, cancellation or upload completion
does not rewrite the captured records. It neither flushes uploads nor publishes
a document action or `onChange` event.

Each record retains its exact bytes, content identity, MIME, dimensions, pending/
failed/cancelled/uploaded state, attempts, cancellation epoch, storage reference
and fixed failure classification. Both export and import reuse ordinary raster
admission: byte/header/dimension checks, browser decoding and SHA-256 identity.
Unknown fields, wrong framing, duplicate assets, gaps/overlaps, trailing bytes,
inconsistent durable counters and corrupt payloads reject; nothing is truncated
or silently repaired.

Import verifies the complete archive before opening a destination. One write
transaction checks that its asset count and byte counter are both zero, then
inserts every record using `add` and updates the byte counter. It never clears,
merges or overwrites an occupied store. Concurrent nonempty imports have one
winner. An aborted transaction retains neither partial records nor a partial
counter; an exact retry into the empty store remains possible. An empty archive
is valid and leaves an empty store empty.

`uploadState: 'preserve'` is an explicit host choice. Import does not retry a
cancelled/failed upload, mark pending work uploaded or start a provider. The host
must still call `flush` explicitly with current upload authority. Restored epoch
guards retain late-completion protection; providers remain idempotent by asset ID
because a server write may precede a captured local acknowledgement.

## Store scope and sensitive metadata

The scope is the whole asset store, not the currently visible document or a
particular room. A cache shared between documents can contain other documents'
retained files. Use an appropriately scoped store and review that scope before
sharing an archive. No automatic garbage collection or reference pruning occurs.

This exports bytes already retained locally; it does not scan every native Undo,
version or offline reference or fetch missing remote/custom assets. A complete
room coordinator must establish that reference closure before claiming every
restorable state has its required bytes. Ordinary rendering resolution is not a
history-wide completeness proof.

The archive is not encrypted. It includes original raster bytes and opaque host
receipt strings, which can themselves contain sensitive provider information.
Their existing opaque JavaScript-string contract is retained exactly: JSON
escapes preserve individual UTF-16 code units, including a lone surrogate, without
UTF-8 replacement. The JSON header bytes themselves must still be valid UTF-8.
Hashes detect corruption, not ownership, provenance or permission. Preserving an
uploaded status does not authenticate it against a new server or provider; the
host must reconcile that binding and any missing remote bytes before relying on
the recorded state. Importing a file never supplies an uploader or credentials.

## File format and bounds

The binary MIME is `application/vnd.breditor.raster-assets`. Framing consists of
the 16 ASCII bytes `BREDITOR-ASSETS1` followed by LF, a four-byte unsigned big-endian
header length, the UTF-8 JSON header and contiguous original raster bytes.

The closed header has `format: "breditor/raster-asset-archive"`, `formatVersion: 1`,
`records` and lowercase hexadecimal `sha256`. Each record contains the existing
asset-info fields plus `epoch` and its body-relative `offset`. Records are sorted
by content ID, unique and contiguous. The header must use the canonical compact
UTF-8 JSON and declared field order; alternate whitespace, duplicate fields and
number spellings reject rather than being normalized. A manifest SHA-256 covers the JSON framing
of format, version and records; each bound content ID independently verifies
the payload's exact bytes against accidental corruption. Neither digest grants
authority. Unknown or incompatible versions do not fall back to another format.

The UTF-8 header ceiling is 16 MiB. Raster and store defaults remain unchanged:
10 MiB per file, 32 million pixels, 16,384 pixels per dimension and 100 MiB retained
payloads. Thus the absolute framed ceiling is 116 MiB plus the 21-byte prefix.
Target limits can only tighten those defaults. A smaller selected policy can
reject an older archive without modifying its bytes or destination. Archive
overflow rejects rather than dropping retained files or increasing store limits.

`signal` is optional. Cancellation is checked between asynchronous reads, digest
and decode steps and can abort the insertion transaction; it cannot promise
immediate interruption of a browser decoder. A database schema may have been
created before a later insertion failure. If interruption makes the commit
outcome uncertain, inspect the destination with ordinary `open`; never overwrite
it to force a retry. Successful insertion is acknowledged only after transaction
completion. Close returned stores to stop owned work and revoke their object URLs.

## Remaining room recovery work

The [native retained-reference reads](RETAINED_ASSET_REFERENCES.md) now inventory
current and retained local/shared image bindings, including invisible Redo and
losing causal contributions. Optional Wasm/SDK reads add immutable owner/source
guards, including a recheck after asynchronous capture. They can over-retain and
refuse completeness for unsupported histories or metadata forms. They neither
resolve missing bytes or extension-owned assets, and never authorize deletion of
an unlisted file. The separate selected-source capture now includes explicitly
supplied native, paired-session version, catalog, proposal and revision records;
missing source or an uncached catalog packet remains Pending. It does not turn
this whole-store byte archive into a room-consistent backup.

The [SDK checkpoint](qualification/2026-10-19-retained-asset-references-sdk.json)
also verifies that a fresh installed managed owner inventories invisible native
Redo images without including unrelated raster-store files. After a real reload,
the new owner derives its own read; old serialized provenance remains invalid.

Asset archives do not coordinate the document, comment/version history,
suggestion/revision/version outboxes, relay/server state or credentials. Those
must be captured under a host-level consistency and authority contract before a
complete room restore is claimed. History/asset retention and generation rotation
remain separate release work. Crash/quota/eviction, long-session memory, supported
platform and final V1 qualification remain open.

The [verified raster checkpoint](qualification/2026-10-18-raster-asset-backups.json)
records portable admission/rollback tests, exact shared image-history recovery and
a fresh installed native-browser reload drill. The approved
[long-session target](COMPATIBILITY.md#current-bounded-lifetime) preserves Undo/Redo
and outstanding offline edits across generations; these archives do not implement
that bridge or a history-resetting rollover.
