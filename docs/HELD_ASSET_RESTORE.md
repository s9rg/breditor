# Held whole-upload restore

`RichAssetStore.restoreBackupHeld` imports an admitted asset archive while keeping
actual cooperative store custody held through the return to its caller. The
result is a readonly pair containing the real store and `RichAssetStoreCustody`.
Ordinary cooperating handles cannot ingest, cancel, retry, reconcile or upload
through that held scope. Reads remain available.

The host explicitly selects the destination, `uploadState: "preserve"`, current
synchronous `checkAuthority`, optional cancellation and asset limits. Unknown
fields and asynchronous authority callbacks refuse. Current IndexedDB and lock
hosts are pinned. Serialized statuses and receipts are retained data, never a
permission or newly authenticated server receipt.

`checkAuthority` must throw to refuse work. Its return value is not a Boolean
permission flag. The callback can run repeatedly and must finish synchronously.

Raster/archive admission precedes destination creation. Empty schema creation is
guarded inside its actual upgrade callback. The factory then acquires a real
exclusive custody owner before inserting any archive row. Exact schema, empty
asset count and the sole zero-valued byte counter are checked in the insertion
transaction. Current policy and actual custody are checked around every row and
the byte-counter write; refusal aborts the whole transaction. No existing rows
are merged, reset, overwritten or deleted. Ordinary `restoreBackup` is unchanged.

After commit, a lost grant refuses success while preserving the committed data
for explicit retry. Failure cleanup awaits the genuine lock callback and closes
the actual store, without dispatching through replaceable public cleanup methods.
No upload, notification or network activation starts automatically.

The returned custody is exclusion, not permission. A higher-level coordinator
must retain the complete incoming archive, recheck fresh authority at every
subsequent source/handoff boundary, and keep both real source and asset owners
held through its final synchronous barrier. It may synchronously release custody
at that handoff; normal mutations then wait for actual callback release. This
primitive does not implement portable operation restore or room activation.

Twenty focused laws cover exact whole records, cancelled/uploaded state, competing
writers, occupied/foreign schemas, cancellation, synchronous policy, schema and
insertion rollback, post-commit revocation and canonical cleanup. Source and fresh
offline installed packages also repeat 58 unchanged backup/reconciliation/custody
laws and a strict public type fence. These are controlled IndexedDB/lock/raster
fixtures, not physical durability, browser, memory/latency or V1 qualification.

The [selected functional qualification](qualification/2026-10-22-held-asset-restore.json)
pins 21 passing checks, matching archives from three fresh consumers and both
complete 640-case journal matrices. It does not execute the entire 277-check plan
or qualify the still-unimplemented portable operation restore coordinator.
