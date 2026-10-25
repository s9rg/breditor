# Selected owner recovery

The SDK-private selected owner keeps the actual native clients, their source
and delivery journals, and explicitly selected upload stores together. Cold
resume reopens those real sources and preserves work accepted after the last
retained snapshot. It never rebuilds an editable client from a document AST or
treats a saved approval as permission.

## Complete data and actual ownership

A selected current file contains the full immutable approved baseline, a current
complete room record cut, and every selected upload snapshot. The approved
baseline retains both losing upload inputs and the original selection. New
captures do not rewrite that baseline or swap a participant's original upload
pointer. Native checkpoints alone do not replace packet, journal, uncertain-save
or literal-input records.

The warm transfer consumes the genuine room wrapper and asset stage in one
private barrier. The native parents remain the same SDK instances. Original and
generation origin-store custody is donated by the genuine retained reader; the
other five families retain their existing custody. Current reads borrow only
those actual origin stores, rather than reacquiring their locks.

Managed asset ports expose explicit ingest, cache, queue and upload operations,
not raw stores or reconciliation ownership. Their write policy has a separate
lifetime from the finite recovery job. Capture waits for already-running native
and asset work without starting a save, retry or upload. It conserves receipts
from the last successful capture and refuses an independently changed queue
that would roll them back. A result is published only after actual read and
store-lock release acknowledgements, with cancellation checked again afterward.

## Fresh cold resume

The caller supplies an independently pinned selected current archive, a genuinely
reopened room owner, explicit read factories, and current participant policies.
A preview reserves the actual room first, then existing stage and selected-store
namespaces. It opens only existing storage and does not create an intent database.
Its returned choice is data, not a transferable owner or writer grant.

Resume requires the exact outside choice and a new affirmative decision for
that attempt. While the real parents and selected stores remain reserved, it
re-admits the complete files in the actual room's native runtime. Existing native
replay contracts establish the order from the approved cut through the retained
cut to current work, including both document and comment histories. JSON document
equality cannot substitute for native continuity. Selected queues must extend
both the approved base and the latest independently retained upload snapshots.

The new intent atomically retains two complete files: the independently selected
basis and the newly observed current snapshot. Its closed choice binds their
byte lengths, hashes and a separate intent database. Creation is absent-only;
an exact retry reads the existing record without writing it. A changed current
cut needs a new preview, outside choice and intent namespace, not an overwrite.
An existing intent still requires a fresh decision and current writer policies.

Temporary native readers close before final ownership transfer. Retained stage,
intent and selected-store data are then checked with fresh reads, not with a
disposed reader's authority. Participant writer callbacks precede the last native
and source checks. After the first ownership flag changes, the common barrier
contains no await, host callback, reader disposal or native destructor.

The returned owner keeps independently supplied participant and asset-write
policies. Ending or cancelling the finite resume job does not revoke an otherwise
authorized writer, and a fresh read grant cannot renew a revoked writer policy.

## Failure and terminal cleanup

Stale, denied and cancelled decisions leave the original root unconsumed. A late
dialog response cannot resume a cancelled attempt. If intent creation succeeded
before a final writer refusal, the complete record remains available for an
independently reapproved retry; it does not authorize that retry itself. Failed
opening cleanup retains its actual requests, handles and leases for retry.

Closing retires every actual native client synchronously, before fallible native
snapshot reads. A disposed member therefore cannot leave a sibling writable
through a saved reference. Durable close still reports a save or snapshot failure
and does not silently choose discard. A complete readable native snapshot remains
available after a later cleanup failure when it was successfully captured.

The separate `discardAndClose` operation explicitly abandons unsaved native memory
and releases actual parent and store custody. It preserves existing recovery
records, packets, journals, upload bytes and receipts. Different in-flight close
modes refuse rather than silently changing the requested mode. Repeating the
same mode shares its actual cleanup promise. Previously disposed unsaved memory
cannot be reconstructed by cleanup; retained durable records remain the recovery
source.

## Bounds and remaining architecture

Selected current files have a 1 GiB total ceiling and a 16 MiB manifest ceiling.
The two full files in one cold intent share a 1 GiB combined ceiling. Nested
source protocols and asset stores retain their own limits. No existing journal
family, persisted meaning, read default, public package-root API or Wasm contract
is widened by this private coordinator.

The [selected room provider check](SELECTED_ROOM_PROVIDER_CHECK.md) holds the
same live resources across authenticated point-in-time availability reads. These
local ownership contracts do not establish complete provider availability,
reconciliation of every retained copy or registered stream, authenticated server
activation, cross-device stale-writer fencing or sustainable history rotation.
Those remain prerequisites for the corresponding V1 claims; all thirteen release
gates remain open.

## Checkpoint validation

Private functional checks pass the original and flat-family editable cold
lifecycle and all seven actual client families with independent segmented
document/comment histories where supported. These include later edits and receipts,
a second reopen, exact native
histories before future edits, and future Undo/Redo. Separate checks pass stale,
denied and cancelled decisions, refusal after durable intent creation and a
readonly reapproved retry. Both first-member and last-member disposal cases pass
retirement, explicit cleanup, byte-preserving storage and subsequent native
recovery. The existing 92 boundary laws also pass on the shutdown repair.
An actual final writer callback that changes an earlier native client refuses
handoff while preserving that accepted edit. The old intent cannot be reused for
the changed cut; a newly selected intent resumes it successfully.

Routine currentness checks on a held private readonly native-input anchor use
genuine facade epochs and its live policy, rather than repeatedly serializing
and validating both complete native journals during file hashing. Full byte and
native ancestry checks remain at read, admission and lineage boundaries. This
private sentinel is not an authority grant or an incoming byte proof. Actual
native tests cover all four document/comment policy pairs, raw native changes,
facade mutation, disposal and final-callback self-disposal. A controlled seven-family
warm/reopen diagnostic passes both before and after this narrow change; its
timings are diagnostic, not a product performance benchmark.

Wait-only native work distinguishes failure from its payload, including a thrown
`undefined`. A failed current/watch check refuses the read; a failed native save
still belongs to the actual session and is not silently retried or discarded.
Both synchronous notification and watch-installation regressions reproduce the
old false-success path and are included in the cumulative functional laws.

The delivery replay also checks its actual native owner after the last host callback.
A callback that disposes that reader cannot return a successful check. Restored
operation journals use private held-readonly facade epochs for routine liveness,
while full byte and native checks fence actual persisted reads and lineage
capture. An out-of-band raw native mutation still fails the full check.

Both independent native-origin families also use genuine held facade epochs for
routine liveness. Full native bytes remain checked before and after persisted
reads and at lineage boundaries. Failed operational read cleanup retains actual
release closures and child handles for retry;
[operational read cleanup](OPERATIONAL_READ_CLEANUP.md) defines the retirement and
unpublished-opening behavior.

The [selected normal qualification](qualification/2026-10-25-selected-owner-recovery.json)
passes twenty stages. Source, fresh offline-installed packages and the actual
production bundle each pass the same 1,958 cumulative assertions, with 23 strict
type fixtures and no failures, cancellations or skips. Both fresh source-matched
native producers supply 100 verified public input files. Nine actual localhost
control runs finish, and all 90 test-owned endpoints are confirmed closed.

The native queue repair also passes a separate fresh offline-installed control:
the same assertions pass with the fixed package, fail when only the captured old
queue module is substituted, then pass after restoring the fixed module. The
assertions and other product files stay unchanged. A second fresh installed
control reproduces all four final-callback reader failures with the captured
pre-repair replay module; the same assertions pass before and after restoring
the fixed module. A third offline-installed control reproduces cleanup ownership
failures: the old modules fail 30 of the same 34 assertions, the repaired modules
pass all 34, and restoring the old modules reproduces the 30 failures. The
assertions and other product modules stay unchanged. The normal candidate also
checks the held selected-owner provider composition, all origin/selected whole
uploads, pending partial history and storage changes during authenticated I/O.
A fourth installed control verifies the five newer families and fresh reservation
lifetime with 19 unchanged assertions: all fail on the old modules, all pass with
the six repaired modules, and all fail again after restoring the old modules.
The isolated regression also passes 108 laws, including genuine parent custody,
callback release and future native Undo/Redo. The superseded 1,668-body run remains a failed aggregate due
to its off-by-one expected-count metadata; it is not counted as qualification.

Rust sources, normal Wasm bytes, public-root exports and package versions remain
unchanged. This is a scoped functional checkpoint, not the full candidate profile
or V1/parity readiness. Controlled storage, locks and raster fixtures do not
certify physical crash durability or platform behavior. Complete provider/client
reconciliation, authenticated activation/fencing, sustainable history and all
thirteen release gates remain open.
