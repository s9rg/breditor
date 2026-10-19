# Native recovery origin continuity

Breditor can check whether a live shared editor retains a selected original
native document and comment history. This is a pure continuity check: it neither
imports history nor grants editing, writer, account or room activation authority.
It supplies native admission for [operational participant recovery](OPERATIONAL_PARTICIPANT_RECOVERY.md).
Parent room catalog transfer and authenticated activation remain unfinished.

## Compare actual native owners

`SharedRichEditor.supportsRecoveryOrigin()` requires the complete version-one
native capability. `current.verifyRecoveryOrigin(origin)` checks the two actual
Rust owners with their current opaque observations. It returns no proof object,
publishes no change and throws on mismatch. Older runtimes retain their ordinary
editing APIs; continuity is unavailable without the matching native methods.

The Rust document check requires the same compiled schema, protocol, room,
writer, replay scope, search and reviewed-history contracts, and grouping mode.
The original seed or join and every retained original journal entry must match
exactly, in order. Publication cannot roll back, and typing joins within the
original entries cannot be regrouped. Later genuine edits, remote imports and
Undo/Redo entries may extend that journal. Selection and live read-only policy
do not grant or invalidate history provenance by themselves.

For paired review, both native owners must have a review lane with the same
binding, actor and principal. Every original event ID and its exact native event
must remain present. Concurrent new events may change canonical event order;
an array prefix is therefore not the review contract. Native replay still
derives both histories from their admitted records. Matching final text, AST,
event counts, causal counters or saved readiness flags cannot replace these
checks. A stale or foreign observation refuses without modifying either owner.

## Check before operational autosave

The internal participant admission builds a private, read-only native origin
from the independently selected participant file. The host supplies the explicit
original factory for document, document-selection, search-document, paired,
reviewed-paired or search-paired recovery. Native initial read-only policy runs
before SDK adoption; paired comment access is separately read-only. Factories
receive their selected options as `this`, matching ordinary reopening. The source
checkpoints must remain byte-exact and the backup and authority guards remain
live. The internal origin cannot be constructed from a detached metadata object.

An internal per-call admission can bind that origin to ordinary session opening.
It requires an existing version-one database with the original single `journals`
store, no foreign indexes or key settings, and exactly the selected writer key.
Missing inspection creates nothing. A different schema, extra key or implicit
history-family upgrade refuses rather than being overwritten or initialized.
The version-change fence is installed before the preliminary asynchronous key
read and remains the same guard through native adoption and the first save.

Before the first autosave, the restored native checkpoint must exactly match the
current stored checkpoint, and both document and review checkpoints must match
for paired storage. The native origin check then verifies retained original
history. These are separate requirements: a buggy restore callback returning an
older valid origin must not overwrite a later saved journal merely because it
passes the original-history check. Failed admission closes its private owners
and leaves the stored record unchanged.

These admission helpers stay internal. The public `OperationalSharedParticipant`
combines them with durable origin retention and explicit custody transfer. The
original `SharedParticipantRecovery` and room catalog still require their exact
selected cuts. They refuse later operational edits; the operational path does
not weaken those non-overwrite guards.

## Retry failed coordinator cleanup

`RecoveredSharedParticipant.intoParts()` marks ownership transferred only after
coordinator release succeeds. A failed release leaves the completion handle
available for retry instead of permanently refusing a second transfer while
native owners remain live.
Coordinator database closure also follows successful lease release. Already
released leases support repeated close through their existing idempotent contract.

Graceful close, explicit discard and attempt close mark themselves closed only
after their cleanup succeeds. Discard excludes concurrent close or transfer and
can retry a failed native-owner cleanup. These paths never delete a committed
recovery marker, editor journal, packet store or upload record. Closing owners
is still distinct from transferring them for continued editing.

## Functional checks and remaining work

The native tests cover six compiled profiles, three scopes and all combinations
of typing, reviewed and search history, including valid forks with identical
final documents, stale observations and rewritten typing groups. The actual
Wasm probe exercises all 66 existing document and paired recovery configurations,
two operational cold reopens per configuration, subsequent document/comment
Undo/Redo, and failures before autosave. It retains the earlier participant,
archive and whole-upload assertions. Fault fixtures exercise retry after handoff,
close, discard and attempt-release failures, plus concurrent cleanup exclusion.
Both release-verifier profiles require these checks and the public type fence.

The storage and lock tests use explicit Node fixtures. Browser/process/power-loss
durability remains separate. History comparisons scan bounded native journals;
this is not compaction, streaming replay, a performance improvement or an
increase in existing limits. Original files and policies still need retention.

Parent catalog ownership transfer, current
authenticated writer/account fences, reconciliation of all retained offline
copies and complete provider reference closure remain required before room
activation. The approved cross-generation Undo/Redo and outstanding offline-edit
bridge also remains required. Original protocols, checkpoint formats, defaults,
dependencies and package versions are unchanged. All 13 V1 release gates remain
open; the historical WebKit fault is not confirmed fixed.

The [checkpoint qualification](qualification/2026-10-19-native-participant-origin.json)
records the fixed source hashes, 24 selected stages, fresh installed archives and
the separation between functional checks and release approval.
