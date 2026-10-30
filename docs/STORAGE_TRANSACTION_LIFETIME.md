# Recovery transaction lifetime

Recovery readers must retain exact durable records and native histories without
retaining each temporary clone after its transaction finishes. The internal
`persistence/settle_owned_transaction.ts` helper owns a transaction's
`oncomplete`, `onabort` and `onerror` properties and clears them after the actual
terminal event. It preserves the caller's result or original refusal. It does
not delete records, change schemas, clear requests, bypass validation, cache
permissions or reduce the accepted history.

The reproduction uses the actual normal Rust/Wasm runtime and operational source
reader, its genuine decoder and its original database identity. Across 120 exact
reads of a 179,827-byte stored cut, the original implementation retained
16,917,768 additional heap bytes after collection. The repaired reader retained
450,712 bytes. Originally all 120 finished transactions retained completion,
abort and temporary connection version-change callbacks; the repaired reader
retained none. Both runs preserve the original stored cut and future document
and review Undo/Redo. The diagnostic observes fake-indexeddb's retained
transactions; it never prunes its private state. These are retained-memory
measurements on Node 22.14.0, not a browser speed benchmark or a whole-room memory
bound. Explicit GC is used only for this diagnostic, never by the SDK.

## Commit and permission ordering

Completion work runs only after IndexedDB's actual completion event. Metadata
stores first retain the known committed state, then check current authority,
then return success. A late permission refusal therefore leaves the durable
receipt observable as data and does not grant permission or fabricate an ACK.
Original compare-and-swap checks, cardinality limits, native admission and
transaction-local acceptance callbacks retain their original timing.

Database version-change watchers belong to a different lifetime. An active
owner keeps its watcher so a real upgrade can invalidate the owner. Temporary
source readers release their watcher in `finally` before closing their own
connection. Receipt stores release their watcher only on actual owner close.
Transaction cleanup must never remove another owner's watcher.

## Verification and remaining work

`scripts/storage-terminal-lifecycle.test.mjs` exercises terminal outcomes,
unchanged bytes after abort, exact large reads, late refusal after commit and
actual version-change invalidation. `scripts/native-storage-lifecycle.test.mjs`
uses real native source histories, preserves future Undo/Redo, and checks actual
metadata stores under late permission loss. The installed-consumer check runs
the same assertions from fresh offline archives with reversible module-location
rewrites, strict public types and a production bundle check. Both candidate
plans require these checks.

The full seven-owner post-ACK cold workflow remains a separate qualification.
These component regressions do not establish complete server catalog coverage,
whole-room activation, platform crash durability or V1 readiness. The original
short Blob-read observation also remains separate until reliably explained.
