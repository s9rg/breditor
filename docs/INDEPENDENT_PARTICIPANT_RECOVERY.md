# Complete local participant recovery

`SharedIndependentParticipantRecovery` restores a complete local-only participant
into actual native, original-archive and upload owners. Both independently
selected document/comment histories, local versions, offline peer changes and
selected raster bytes survive. No delivery companion, relay binding, receipt or
room activation is invented to make the participant ready.

## Explicit read only staging

Begin requires the genuine `SharedIndependentParticipantBackup`, its separately
selected identity/hash, three distinct database names, explicit matching native
factories and a current synchronous authority callback. The first native owner
requires document `readOnly: true` and comment access `read_only` in both runtime
validation and public types. Recovery never selects a factory or current grant
from stored content. Its factory excludes `database`, `create`, delivery bindings
and retained delivery stores.

Inputs, nested history generations and the complete native reviewed identity are
snapshotted before awaits. The supplied backup is read once through its canonical
method; recovery separately admits its own copy. Disposing that supplied handle
does not dispose recovery's copy. Actual namespaces are reserved before the first
authority callback, and storage/lock context cannot be retargeted across awaits.

## Actual files and resumable commits

The dedicated attempt database uses schema version 1 with only
`independent_attempts` and `independent_originals`. One upgrade transaction stores
the exact immutable original file and initial record. Its closed plan selects
`breditor/shared-independent-participant-plan` version 1; the record selects
`breditor/shared-independent-participant-recovery` version 1. Neither contains
native ownership, ready capabilities, executable factories or current grants.

Source and uploads advance separately from reserved through started to complete;
only then can the attempt become ready. Compare-and-update accepts only the exact
last acknowledged record or that live attempt's exact pending update. Reads
count stores before cloning their values. Unknown schemas, extra rows, altered
originals and unrelated markers refuse without overwrite or migration.

Before any autosaving source open, recovery inspects the entire dedicated local
`history_files` and `history_heads` stores. The exact native file count, paired
head, both checkpoint families and local versions must agree with the original.
A completed component with missing bytes is not silently reconstructed. A
started empty component can resume insertion; a complete retained cut is opened
only after exact admission. No delivery schema is used for a local participant.

The source, upload and attempt databases remain separate transactions. Closing or
denying recovery never deletes an already committed cut. Resume re-admits actual
bytes after interrupted acknowledgement instead of trusting completion flags.
This is not atomic rollback across databases or physical crash qualification.

## Current policy and actual cancellation

The private bootstrap policy guards native schema creation, replay and first
paired save. The original document/comment files and their head still commit
atomically through the existing native storage family. An explicit bootstrap
signal subscribes that actual transaction to Abort: cancellation after its last
head request succeeds but before commit aborts the entire file/head cut.
The subscription and temporary policy detach after successful bootstrap; ordinary
native ownership and operation guards remain. Delivery recovery forwards the
same optional signal without changing its old formats or default behavior.

Uploads use canonical held restore, with current policy checked during schema
creation and insertion. Actual cooperative upload custody precedes insertion and
survives verification through final handoff. No upload starts and no archived
status, cancellation epoch or whole-store byte counter is rewritten.

If a commit already completed before cancellation or later grant loss, its exact
bytes remain available for fresh explicit retry. An approved empty source schema
can also remain after a later refusal. Neither case permits a returned owner
without fresh current checks. Web Locks are cooperative origin-wide exclusion,
not cross-device authentication or a JavaScript sandbox.

## Three owners transfer together

`RecoveredSharedIndependentParticipant.intoParts()` returns the actual
`source.session`, `uploads` and `original` archive. Selected pixels can exist only
in that original file, deliberately absent from the complete upload queue.
Discarding the archive during handoff or ingesting those pixels into uploads
would respectively lose provider bytes or alter archived upload state.

The caller owns all three lifetimes after handoff. Use
`original.blob(asset, generation)` for exact archived bindings and retain the
original file durably before disposing its provider. Unknown asset/generation
pairs remain unresolved rather than reusing stale pixels. The original archive
is an immutable input, not proof that a later edited source still equals it.

The coordinator rechecks the genuine source stamp after its last authority
callback, then synchronously releases upload custody and transfers ownership.
Close on the retired coordinator cannot destroy those resources. Close during
an in-flight handoff waits and prevents a partial transfer. A private parent
transfer also retains the actual attempt leases and original provider, with a
final source-stamp barrier after callbacks; a serialized ready flag is never an
adoption hook.

Cleanup retains actual closures after failure, can be retried, and is bound to
the original database context and namespaces. An unreturned failed opening is
drained there before retry. Native, upload or coordinator failures never imply
permission to delete retained originals or rewrite a changed source.

## Functional boundary

The fixed local matrix spans five native compilers, three selection/range scopes,
original/full capability masks, four independent history pairs and two pixel
layouts. It exercises exact cold resume, original-only pixel ownership, local
versions and future native Undo/Redo after offline peer edits. Focused laws cover
interrupted commits, policy/cancellation, bounded reads, callback reentry and
actual cleanup/transfer ownership. The original native and child archive bounds
remain unchanged; recovery does not remove the retained-Undo ceiling.

Actual five-family room adoption, local operation provenance after later edits,
complete provider/client/outbox reconciliation and authenticated room activation
remain separate work. Read-only participant readiness is not a V1 release gate.

## Selected functional qualification

The [2026-10-22 qualification](qualification/2026-10-22-independent-participant-recovery.json)
passes 38 selected checks from the 304-check plan. Source and fresh offline
packages each pass 128 focused laws and all 240 cases in the fixed native matrix.
Each matrix performs 480 actual source/original/upload handoffs, 240 cold resumes,
720 future document/comment history comparisons and 240 archive-only pixel
comparisons. Local versions, old-grant closure and both real read-only refusals
are checked at every handoff. Local recovery starts zero network requests.

The same four native cancellation assertions first reproduce one committed head
each, then pass with zero heads and zero native files. An isolated build of the
final participant code with the recorded prior bootstrap implementation also
reproduces all four failures, identifying the missing transaction subscription
as the cause. It is a controlled comparison, not a reconstruction of the entire
earlier dirty tree. Both local and delivery paths exercise that final request
boundary; no regression assertion is replaced with a readiness-shaped shortcut.

Six actual consumers pin matching archives. The unchanged capture source/installed
matrices each pass 80 cases; delivery source/installed each complete 256 recovery
cuts and 512 handoffs with 131 focused laws. Held-upload, native-owner and genuine
native-origin compatibility checks pass too. Delivery polling totals remain raw
telemetry while all other semantic results match exactly.

Workspace/diagnostic tests pass 2,647, editor tests 385 and script tests 2,482,
with three existing opt-in browser skips. Twelve normal runtime files and 2,857
Rust/manifest inputs match the previous checkpoint; full Rust suites are carried,
not freshly executed. Catalog contracts pass freshly, while its two full
480-cohort matrices are carried across nine unchanged data-reader files rather
than relabeled as fresh runs for this source. These are functional results under
controlled storage/lock/raster fixtures, not physical durability, browser or V1
qualification.
