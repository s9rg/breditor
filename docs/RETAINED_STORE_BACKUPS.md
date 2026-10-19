# Offline proposal revision and version backups

The shared SDK can export and restore proposal queues, revision outboxes and
version catalog caches without overwriting an existing record. These dependent
archives preserve exact packets, publication/retry intent and retained result
metadata. Restore the corresponding native document and review history first;
an outbox archive does not contain that source history, asset bytes or current
server authority.

## Capture exact dependent state

`SharedSuggestionQueue`, `SharedSuggestionRevisions` and `SharedDocumentVersions`
each expose `exportBackup({signal?})`. The returned string is a point-in-time
snapshot taken synchronously before asynchronous hashing. Subsequent edits,
retry changes or receipts do not change it. Export does not save a source journal,
flush an outbox or send a network request.

Queued publications/decisions, stopped retries, remote cached packets, retained
final receipts, revision conflicts/successors and version catalog metadata stay
in their original record families. A backup never recaptures a proposal against
newer content or converts a pending decision into a final one.

Failed local saves or failed closes do not discard the retained record. Export
while its existing readability contracts still hold. In particular, capture and
close a revision outbox before retiring its borrowed proposal queue or source
session. Exact raw `exportRecovery()` remains the rescue path if archive encoding
cannot complete. A successfully closed/discarded owner is not a backup source.

These files can contain sensitive deleted content, comments quoted by packets,
attribution, endpoint/binding identities and old decisions. They are not encrypted.
SHA-256 detects corruption, not authorship, permissions or server acceptance.
Credentials and current roles are not supplied by an archive.

## Restore in dependency order

The host authenticates the account and reacquires or fences the original writers
on other devices. `writerRecovery: 'host-reacquired'` acknowledges that host work;
it is not a fencing implementation. Same-origin Web Locks and existing attachment
guards still exclude live conflicting owners.

First restore the exact [document and paired histories](SHARED_SESSION_BACKUPS.md)
with the original schema/profile, language, history, selection/range, review and
owned/search policies. Then restore dependent state using the original nonsecret
identities and the restored source:

```ts
const queue = await SharedSuggestionQueue.restoreBackup({
  database: 'recovered-proposals', identity: proposalIdentity,
  storage: session, backupJson: proposalBackup,
  writerRecovery: 'host-reacquired'
  // Explicitly supply ownedHistory: 'reviewed-v1' for an owned queue.
});
const revisions = await SharedSuggestionRevisions.restoreBackup({
  database: 'recovered-revisions', binding: revisionBinding,
  queue, storage: session, transport,
  backupJson: revisionBackup, writerRecovery: 'host-reacquired'
});
const versions = await SharedDocumentVersions.restoreBackup({
  database: 'recovered-versions', identity: versionIdentity,
  storage: session, getToken,
  backupJson: versionBackup, writerRecovery: 'host-reacquired'
});
```

Revision synchronization and version-catalog connection do not start during
restore. `autoStart: true` and `autoConnect: true` respectively refuse; explicitly
connect only after reconciling server suffixes, authority and all other stores.
A file cannot select a different account, writer, endpoint, binding or owned
history family. Endpoint/writer migration requires a separate contract, not
editing an archive to bypass its identity checks.

Restore verifies the closed envelope, checksum and exact selected record policy
before opening a destination. It then acquires existing ownership guards and
checks destination-key presence without parsing an occupied value. Even an
unrecognized existing record refuses with `backup_destination_exists`.

The original native admission runs against the supplied source before insertion.
Local proposal/version source must be verified; owned review history and retained
effect proofs must match. Revisions retain their original source, intent, lineage
and result-proof checks. A malformed native packet refuses with a fixed
`backup_native_admission` diagnostic rather than exposing its text.

Remote snapshots/proposals retain their original admission semantics: unavailable
historical source can remain Pending without dropping the cached packet. This is
not a complete asset-reference closure. In particular, a missing remote proposal
source keeps [selected-source capture](RETAINED_ASSET_REFERENCES.md) Pending; an
admitted version snapshot inventories its content without endorsing its source.

The source journal is saved and flushed before the dependent record. Source
replacement and cancellation are checked across awaited work. The initial commit
uses insert-only IndexedDB `add`, not `put`. A competing record wins without being
merged or overwritten. A transaction abort leaves no partial dependent record;
the original archive supports an exact retry into an absent key.

Cancellation is checked between asynchronous steps and can abort initial
insertion. It cannot immediately interrupt every callback or digest. If commit
completed before a later cancellation/error was observed, inspect and reopen the
destination through ordinary `open`; do not overwrite to force a retry. A newly
created database schema may remain after failure. After successful restoration,
its cancellation signal no longer governs ordinary later saves.

Successful restore/reopen preserves exact exported records and native future
history. Normal subsequent queue/cache edits retain their existing save behavior;
insert-only semantics apply to the recovery's initial insertion.

## Independent format and bounds

The separate canonical JSON envelope has exact keys `format`, `formatVersion`,
`kind`, `recordJson` and `sha256`. Its family is
`breditor/shared-retained-store-backup`, version one. Kinds are `suggestions`,
`suggestion-revisions` and `version-catalog`. SHA-256 covers the canonical framing
of format/version/kind and the exact opaque record JSON string. Unknown fields,
duplicate or noncanonical field spellings, wrong kinds, invalid Unicode,
checksum mismatch and policy mismatch reject completely.

The transport ceiling is 65 MiB, accommodating JSON escaping of an unchanged
32 MiB record ceiling. Existing packet, row-count, native journal and storage
limits are not expanded. Original persisted record, checkpoint and operation
families and ordinary startup defaults are unchanged.

## Remaining room recovery work

Each initial insertion is atomic in its own store; restoration of several
databases is not one transaction. These archives make the explicitly captured
dependent records restorable, not a coordinated whole-room backup. Asset byte
resolution, complete participant/server capture, resumable room-wide restore and
current writer/provider authority still need their coordinated contract. No
garbage collection or generation rollover is introduced. The approved
[long-session requirement](COMPATIBILITY.md#current-bounded-lifetime) continues to
preserve Undo/Redo and outstanding offline edits across generations.

The [retained-store checkpoint](qualification/2026-10-19-retained-store-backups.json)
records one corrected frozen 26-check selection: 558 script tests, 382 editor
tests, fresh installed public consumers and the actual-Wasm recovery probe. The
probe covers 90 restores and 90 reopens across 30 configurations and 120 exact future
document/comment checkpoints, with extra receipt/conflict and remote-Pending
cases. An earlier broad pass missed a receiver-dependence regression introduced
by this refactor; its valid native failure witness, correction and same-input
passing check are retained. Permanent source and installed probes now call the
queue/revision/version factories unbound. The existing installed Chromium
document/paired regression remains separate from new store-API browser
qualification. Three existing script checks remain skipped. Rust/build inputs
and rebuilt Wasm hashes match the prior native-tested checkpoint; its native
test counts are carried forward as earlier evidence, not counted as newly run.
All 13 V1 gates remain open.
