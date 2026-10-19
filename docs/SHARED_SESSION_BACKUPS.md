# Shared session backups

Shared session archives retain exact accepted native history, including Redo,
without replacing an existing durable session. They are separate from the
[default package backups](SESSION_BACKUPS.md). They do not implement generation
rotation or provide a complete room backup.

## Capture a session

`SharedPersistentSession.exportBackup()` returns a bounded JSON archive. It
captures the checkpoint and immutable source policy synchronously before
calculating SHA-256. Editing while the digest is pending does not change that
capture. Export does not flush storage, advance history, acknowledge relay work
or capture unfinished IME composition.

`SharedReviewPersistentSession.exportBackup()` captures the exact atomic paired
record: document history, independent comment history, retained local immutable
version packets and any explicitly selected nonsecret review relay progress.
Reviewed accepting-user and search histories remain distinct families. The file
does not grant the permissions of its original author or reviewer.

Both methods remain available after a failed save or failed close while the
readable native owner and writer leases are retained, not after successful close
or discard. If bounded archive encoding fails, preserve the existing raw native
checkpoint or paired `exportRecovery()` rather than discarding the owner.

Archives can contain sensitive deleted text, comments and version history.
SHA-256 detects accidental changes; it is neither encryption nor proof of
provenance. Web Crypto is required, with no weaker fallback. The
[Web Crypto digest contract](https://w3c.github.io/webcrypto/#SubtleCrypto-method-digest)
defines the underlying operation.

## Restore explicitly

The host authenticates the account, reacquires or fences its writer on other
devices, and chooses the original schema/profile, language, history and range/
selection policies. It supplies `writerRecovery: "host-reacquired"`. This is the
host's acknowledgement, not a fencing implementation or authority token. Web
Locks exclude matching live writers only within this origin.

Choose the factory matching the source:

- `SharedPersistentSession.restoreBackup()` for original or general ranges.
- `SharedPersistentSession.restoreDocumentBackup()` for document selections.
- `SharedPersistentSession.restoreSearchBackup()` for explicitly selected search
  history and selection scope.
- `SharedReviewPersistentSession.restoreBackup()` for local, relay-aware or fixed
  observer paired records, with the matching review/relay options.
- `SharedReviewPersistentSession.restoreReviewedBackup()` for reviewed ownership.
- `SharedReviewPersistentSession.restoreSearchBackup()` for search-aware paired
  records, with explicitly selected reviewed ownership when applicable.

All require `backupJson`, explicit source policies and the matching native restore
callback. Paired factories additionally require the original review actor/account
and any relay/reviewed binding. A file cannot select a factory, infer an upgrade
or supply credentials. The `encodeSharedSessionBackup` / `decodeSharedSessionBackup`
codecs and their `Paired` counterparts validate the file envelope and existing
storage headers; decoding alone does not prove native replay.

Restore checks the envelope, identity and checksum, acquires the writer lease or
both paired leases, then checks that the destination key is absent. The chosen
Rust factory must admit the opaque history. Before insertion its recovered
canonical checkpoint or complete paired record must equal the captured bytes
exactly. There is no visible-AST fallback or history normalization.

The final write uses insert-only IndexedDB `add`, never overwriting `put`.
A competing record inserted during native admission wins. Saved state follows
transaction completion, as defined by
[IndexedDB](https://w3c.github.io/IndexedDB/#dom-idbobjectstore-add).
The destination schema may already exist when a later step fails. An interrupted
operation may also commit before its caller receives a result: inspect and reopen
an existing key with the ordinary matching factory, never an overwrite retry.
Ordinary startup still prefers durable history over its initial seed and never
automatically imports an archive.

Restore does not connect to a relay. Fencing authority alone does not make an old
checkpoint current: reconcile retained server suffixes and separate pending
outboxes before reconnecting. An older writer checkpoint can fail the relay's
causal-history checks; do not bypass them to force an archive online.

## Closed formats and bounds

The document format is `breditor/shared-session-backup`, version 1, with exact
keys `format`, `formatVersion`, `identity`, `checkpointJson` and `sha256`. Its
UTF-8 transport ceiling is 33 MiB; the opaque checkpoint retains its existing
16 MiB ceiling.

The paired format is `breditor/shared-paired-session-backup`, version 1, using
`recordJson` instead of `checkpointJson`. Its transport ceiling is 65 MiB. The
unchanged paired storage record remains bounded to 32 MiB, including existing
16 MiB document/comment ceilings and at most 32 local version packets of at most
4 MiB each. Transport budgets allow JSON escaping; they do not raise native,
storage or version limits.

Identity contains room, decimal-string writer, rich language, history, range
policy, selection policy and nullable search policy. SHA-256 covers canonical
framing of those fields and the exact opaque payload string. Unknown fields,
incompatible policies, malformed Unicode, excessive budgets or a wrong checksum
reject without echoing history. Native backup admission errors use a fixed
payload-redacted message.

## Database upgrades during startup

A database `versionchange` closes an unpublished opening immediately, including
while an asynchronous native factory is pending. It unblocks the upgrade and
rejects the opening with `session_open_versionchange` or
`review_open_versionchange`; a returned unpublished native owner is freed and
writer leases release. No old-database editor is published afterward. Once live,
the existing path instead retires the readable owner and retains recovery
responsibility until explicit closure.

## Remaining release work

Asset bytes/caches, document relay state and credentials, suggestion/revision
outboxes, shared version-catalog outboxes and server logs are separate stores.
Session archives neither back them up nor acknowledge their pending work. A
complete-room backup needs a coordinated host-level contract covering those
stores, authority and asset references.

The separate [raster asset archive](RICH_ASSET_BACKUPS.md) now preserves a whole
asset store's bytes and upload state with verified empty-destination recovery.
It does not automatically make document/asset/outbox captures atomic or room-scoped.

The approved [long-session target](COMPATIBILITY.md#current-bounded-lifetime)
preserves cross-generation Undo/Redo and outstanding offline edits. Its native
bridge, rotation, receipts, final review decisions and retention still require
implementation and tests. Native process-crash,
quota/eviction, supported-platform and long-session restore drills remain release
qualification, not guarantees supplied by the codec.

The [functional checkpoint](qualification/2026-10-18-shared-session-backups.json)
retains exact portable replay and failed-close checks, an independently pinned
pre-repair SDK reproduction, and native IndexedDB/Web Crypto/Web Locks plus real
reload acceptance in one installed headless Chromium production artifact.
