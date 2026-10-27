# Inspect completed rooms without continuing recovery

An interrupted replacement build must inspect its original room before trusting
an old preparation. That inspection must not finish an incomplete original,
acknowledge a pending edit or create a missing component. The private completed
room entry provides this stricter admission path. Ordinary recovery remains a
separate, deliberately repair-capable operation with unchanged defaults.

## Separate inspection from repair

The ordinary physical root resume reads its saved catalog and intent. Its
finish method then continues each selected child, publishes parent completion
and finishes restored graph replay where needed. This is correct for building
or recovering a selected target. It is unsuitable for checking whether an
original still matches a previously approved execution.

The SDK-only reopenCompletedPhysicalRoot admits an actual root under its normal
exclusive reservation. It requires an operational root, complete child rows and
every component namespace before opening a child. Each family also checks its
own completed parent or acknowledged journal before opening a native source.
The restored graph path requires complete upload and source stages, complete
native replay and no pending source cut. It does not call the graph finish or
source flush operations.

These are separate intrinsic functions, not a serialized completeOnly option.
A completion-shaped object cannot become a root or graph owner.

Strict original document and paired-session constructors compare their complete
native and retained records with the existing store, then initialize their saved
state without a startup autosave. A mismatch is refused rather than normalized.
Suggestion, revision and version adapters also admit their existing complete
records and initialize durability bookkeeping without startup rewrites. Future
edits still persist normally.

The original record formats, public package exports and ordinary begin, resume,
startup-save and finish defaults remain unchanged.

## Hold real ownership during inspection

The private beginCompletedRoomRecovery uses the existing cold attempt lifetime
with this stricter root admission. Construction snapshots inputs synchronously
without I/O. The attempt admits the independently selected complete basis and
actor identities, acquires actual fresh document and comment locks, and owns
every returned source before the next asynchronous check can reject. Neither
saved completion rows nor an old retirement journal grants those locks.

Preview still verifies the complete actual native histories, dependent packets
and selected upload queues. Newer acknowledged work is preserved. Refusal keeps
actual partial owners reachable until Close has finished; it never deletes or
repairs the source. The existing decision, common ownership barrier and one-shot
take remain available after successful complete admission.

## Retain sources whose admission fails

A restored participant owns its source-opening object before the first request.
That object retains the actual journal and every returned native source before
another callback can reject admission. Only successful admission permits a
synchronous take into the parent. An unreturned source is not discarded from
bookkeeping merely because its opening Promise rejected.

Both ordinary restored-graph construction and strict inspection use this owner.
Close waits for the actual opening, discards its native source, then closes its
journal. Each reference is cleared only after that cleanup succeeds. A rejected
cleanup leaves the same handles reachable for another Close, without requiring
renewed read permission or deleting source data.

## Handle pending saves explicitly

A prepared native cut can be durable in its journal while its source write is
still incomplete. Inspection refuses that state without acknowledging it. Close
the inspection attempt, then use deliberate ordinary recovery to finish that
same cut under fresh authority. Retry inspection after recovery. Do not discard
the pending cut, reconstruct from only its AST or reset to the older baseline.

The strict path is a prerequisite for checking an original against an immutable
execution plan. It does not itself implement cold continuation of a partial
replacement build. That continuation must also retain original asset custody,
compare the whole current source cut before and after approval, and keep every
partial target and cleanup obligation reachable through promotion.

## Qualification scope

Controlled tests inject incomplete real parent records and interrupt actual
native source writes after journal preparation. They check that strict
inspection preserves stored bytes and that deliberate ordinary recovery still
recovers the prepared work with native Undo and Redo. These are SDK functional
contracts, not a physical process-crash durability claim.

Provider and client reconciliation, authenticated whole-room activation,
independent comment and server-log generations and sustainable retention remain
on the V1 parity goal. This inspection path does not grant serving activation.
