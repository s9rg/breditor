# Independent document and comment participant backup

`SharedIndependentParticipantBackup` preserves a local participant whose document
and comments independently select original or segmented native history. One
portable file retains both exact histories, local version packets, every selected
image payload and the complete asset upload store, including unreferenced and
cancelled uploads. It never substitutes visible text or comment projections for
native history.

This opt-in family closes local capture and portable recovery for
`SharedIndependentHistoryPersistentSession`. It does not attach a relay, transfer
ownership to a room coordinator or activate a server. Original and generation
participant formats remain unchanged and refuse this family.

The separate [complete delivery participant](INDEPENDENT_DELIVERY_PARTICIPANT.md)
also retains independently selected receipts and proposal/revision/version outboxes.
This local-only family never adopts that larger scope by payload shape. Both
participant captures pin canonical internal read/verify operations; public facade
overrides cannot substitute fake Ready archives.

## Capture an actual paired source

`captureSharedIndependentSource({session})` requires the genuine independently
selected session. Internal registration retains its constructor-owned core,
document and review leases, exact family selection and local version catalog.
A copied recovery object, public `core` replacement or metadata/check lookalike
cannot register source custody. Replacement getters are not invoked.

Runtime-only constructor keys also guard the actual shared, paired, document
generation, independent and relay sessions, proposal queue, revision outbox and
version catalog/store. TypeScript `private` alone does not prevent JavaScript
construction. Direct calls, missing keys and copied objects refuse before reading
supplied stores, leases or cores. The genuine open/recovery factories alone hold
the matching keys; no key is exported or serialized. This is ownership admission
inside the SDK, not an arbitrary application-JavaScript sandbox.

The capture retains separate immutable records in this order: document checkpoint,
review checkpoint, then local versions in catalog order. Each original checkpoint
or native segmented envelope remains byte-exact. Comment history is not relabeled
as the original review family. Public facade checkpoint/reference overrides do
not replace canonical native reads.

Native retained-image reads include the current document and retained document
history. Every retained local version is also queried through native packet
readers. Missing native packet dependencies produce explicit Pending, not a
partial Ready reference set. A private change identity invalidates the capture
after document, comment, generation-boundary or version-catalog changes.
Unchanged checks do not serialize either complete checkpoint. Capture does not
flush, publish, seal a generation, edit, upload or clear work.

Readable retired history may still be backed up while the genuine session retains
its leases. Closing/discarding the session invalidates its source captures. The
detached archive can outlive it; readable bytes alone grant no new live custody.

## Preserve selected bytes and complete uploads together

`captureSharedIndependentParticipant` requires participant/principal labels, the
actual paired source, `RichAssetStore` and a synchronous current host authority
check. The declared principal must match the historical comment principal; that
equality is not authentication.

The source is captured inside the complete upload-store snapshot callback. The
result is one coherent local cut, not merely a list of current visible images.
Cancelled/failed/pending records, epochs and unreferenced raster bytes remain in
the original whole-store upload file. A later store write does not rewrite that
immutable snapshot or imply the later queue has been settled.

Content-addressed references can resolve from that retained store. Other bytes
require an explicit resolver binding the exact opaque asset ID and generation to
one immutable content digest. Ordinary raster admission checks actual PNG, JPEG
or WebP bytes, MIME, dimensions and limits. All provider checks and the original
source are checked again after asynchronous work, including before Pending is
returned. Cancellation, source change/close, a changed mapping or revoked authority
refuses capture. Missing bytes remain Pending without deleting any source work.

## Select and read the separate archive family

The MIME type is `application/vnd.breditor.independent-participant-backup`.
The binary magic is `BREDITOR-INDEPENDENT-PARTICIPANT1` followed by a newline,
then a four-byte big-endian header length. The canonical UTF-8 JSON header has
format `breditor/shared-independent-participant-backup`, version 1. Body sections
are exact native/version records, selected raster payloads and the complete
original upload file, with contiguous offsets and declared lengths and hashes.

`selection()` returns the historical participant/source identity and complete-file
SHA-256. `readSharedIndependentParticipant(file, expected)` requires that selection
explicitly. Closed field sets, canonical bytes, section hashes, lane metadata,
native generation hash links and raster/upload admission precede any recovery.
Unknown fields/families, duplicate or reordered records, gaps, truncation and
trailing data refuse. SHA-256 detects changed bytes; it establishes neither
provenance nor permissions.

An admitted file is transport data, not native semantic proof. `verifySource`
requires a genuine current capture with the same exact records and complete native
references. `verifyRecovered` also compares the recovered complete upload file,
including queue states and epochs, not just image content. A correctly rehashed
but false reference declaration still fails genuine source verification. A
structurally admissible but semantically invalid native history still fails cold
Rust replay.

## Restore without overwriting or inheriting permissions

Read the archive with its selected identity/hash. Supply fresh document read-only
and comment-access policy and matching native factories to
`SharedIndependentHistoryPersistentSession.restoreRecovery`. Separately reacquire
and fence document/comment writers, then use an absent destination. Recovery
cannot merge with or overwrite an existing paired head.

Restore `uploadBackup()` through `RichAssetStore.restoreBackup` with explicit
`uploadState: 'preserve'` and a separate empty asset destination. Capture the
restored independent session and call `verifyRecovered` before handing either
owner to application code. Both actual native histories and future Undo/Redo
remain authoritative. Do not unlock editing to perform validation.

These component restores are not an atomic multi-store coordinator. On a partial
failure, retain the archive and already restored destination; inspect/reopen it
explicitly rather than overwriting it or treating a saved flag as ownership.
This API does not grant provider permission, settle uploads, authenticate remote
clients, adopt proposal/revision/version outboxes, choose historical-copy
dispositions or activate a room. Those require matching independently selected
transport and whole-room recovery contracts.

## Bounds and functional qualification

Native original checkpoints remain bounded to 16 MiB per lane; segmented native
envelopes remain bounded to 64 MiB per lane. Up to 32 local version records retain
their original 4 MiB per-packet limit. Complete source records have a separate
256 MiB envelope and 34-record ceiling. Admission still applies the existing
128 MiB paired-head budget; the archive does not enlarge persisted/native limits.
Selected references remain bounded to 100,000 and the header to 64 MiB. Existing
raster/store and upload-backup limits remain unchanged. Refusal never prunes data.

Capture and reads currently hash whole bounded Blob sections with Web Crypto;
they are not streaming, unlimited-lifetime or approved memory/latency guarantees.
The native document Undo ceiling remains 1,000 items even across seals.

The functional matrix uses actual normal Rust/Wasm across five grammar/inline
profiles, original/document selection, explicit and typing/search/reviewed
history, and all four independent lane combinations. It compares cold native
pairs, future document/comment Undo/Redo after offline peer changes, versions and
complete upload bytes. Source and fresh offline public packages run the same
assertions and focused corruption/callback/custody laws. Synthetic IndexedDB,
locks and fixture image decoding qualify local functionality, not physical crash
durability, cross-device fencing, browser behavior or V1 approval.

The [2026-10-21 qualification](qualification/2026-10-21-independent-participant-backup.json)
passes all 24 selected stages and 1,642 script tests, with three existing opt-in
skips. Source and fresh offline packages each repeat 80 configurations, 160 cold
pairs, 240 future history comparisons and 30 focused laws. The exact constructor
regression fails on the preserved pre-key archive and passes on the repaired
source and installed package. The 379 server-enabled and 267 no-server relay
Cargo tests are carried only across unchanged native inputs and shared runtime,
not claimed as freshly reexecuted in this SDK checkpoint. All 13 V1 gates remain
open.
