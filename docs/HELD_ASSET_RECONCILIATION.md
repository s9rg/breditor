# Reconcile upload state while retaining store custody

`RichAssetStore.beginHeldReconciliation(custody, original, options)` and
`resumeHeldReconciliation(custody, options)` apply explicit local upload-state
choices without releasing and reacquiring the caller's existing store lease.
They retain both complete input files and reuse the existing atomic union and
retry protocol. They do not upload files or authenticate retained receipts.

## Ownership and current checks

Pass the exact `RichAssetStoreCustody` issued for this store instance. A lease
from another handle, including a handle for the same database, is not accepted.
Copied metadata, forged objects, released leases and absent custody refuse
before a source callback or ledger creation. Closing the attempt releases its
ledger lease, not the caller's store custody.

The store remembers the IndexedDB factory selected before its asynchronous open
and the lock manager associated with its actual custody. Held reconciliation
checks both throughout admission, retained-file validation and target commit.
A callback cannot switch the operation to another storage host. Releasing and
reacquiring custody creates a new lease; an old attempt cannot adopt it.

The host supplies a dedicated `database`, synchronous `checkSource` and optional
`signal`. `checkSource` must throw when authority or the selected source is no
longer valid and must return void. The host must bind that check to its actual
source and current policy. This local storage API does not authenticate native
writers or derive permission from an archive.

## Decisions and durable retry

The attempt first admits both complete raster archives and retains their exact
bytes before accepting decisions. The union preserves every asset from either
input. One content identity with different immutable bytes or raster metadata
refuses; it is never resolved by a queue-state choice.

Each differing queue record requires exactly one explicit `current` or `original`
choice. Epochs and attempt counters are local state, not an ordering between
copies. A cancelled state is not silently retried, and available provider bytes
do not promote a record to uploaded. Both input files retain the losing state.

The unchanged ledger records `prepared`, `decided` and `applied`. Choices are
durable before target mutation. The target transaction compares every actual
record and its byte budget before applying the complete selected union. Changed
target data or retained files refuse without being repaired or overwritten.
An aborted transaction preserves the old target. If a target or ledger commit
finishes before acknowledgement is lost, retry reads the actual durable state
and recognizes the exact already-applied union without another asset write.

Loss of custody, policy or storage context can therefore leave a committed
target with a `decided` ledger. Retain the attempt and input files; restore valid
policy and use explicit resume. A returned error does not prove that an earlier
transaction failed to commit. An applied marker never permits missing target
records to be silently recreated.

The saved ledger contains bytes and choices, not a permission or ownership mode.
Explicit resume may use the ordinary or held entry point after acquiring its
required current ownership and policy. Ordinary reconciliation still refuses
while any real custody lease owns the store; its default behavior is unchanged.

## Integration boundary

This grows the opt-in store API without changing asset archives, ledger versions,
native histories or ordinary store methods. No notification, upload, source
retarget, lease handoff or room activation starts automatically.

The enclosing participant's continuity rules remain authoritative. In particular,
this primitive cannot override an original uploaded receipt baseline or make an
arbitrary chosen rollback admissible to every existing recovery family. A room
coordinator must reconcile retained client copies, retain the selected new base
and whole upload files, and bind current provider/native authority before its
final writer transition. Sustainable history and V1 qualification remain separate.

## Functional qualification

The [2026-10-24 qualification](qualification/2026-10-24-held-asset-reconciliation.json)
passes fifteen selected normal candidate stages. Source, fresh offline packages
and the actual production bundle each pass the same 67 laws: 26 new held laws,
37 existing custody/reconciliation laws and four native integration cases.
All three strict consumer fixtures pass as well.

Each integration path reconciles real queue states for 28 recovered client
instances and cold-reopens all 28 across every independent document/comment
history pair. Exact native checkpoints remain unchanged; future document and
comment Undo/Redo still work. Ten native profile/wire inputs are freshly
produced, while the SDK mutation cases select language 3 standard with atomic
wire. The four recovered cohorts reuse that selected native room with different
history policies; they are not 28 distinct server registrations. These counts do
not claim the full profile-by-history matrix.

The installed regression control keeps its two assertions unchanged: the
retained before-fix modules fail both context-switch laws, and the actual fixed
package passes both before substitution and after restoration. Abort, lost
acknowledgement, post-commit context loss and explicit cold resume preserve the
complete retained files and real custody.

The storage, lock and raster hosts are controlled functional fixtures. Physical
browser durability, full provider/client reconciliation, activation, sustainable
history, remaining feature parity and all thirteen V1 gates remain required.
