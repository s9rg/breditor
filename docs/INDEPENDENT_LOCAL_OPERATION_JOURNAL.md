# Local operation save journal

The local operation journal retains a complete immutable local participant and
one acknowledged and one pending native cut. A live independently selected native
source owns that journal and its actual original/native-origin resources until
source release. It is separate from delivery and restored-delivery operation
families; no binding, relay receipt or outbox is manufactured.

## Explicit identity and storage families

The host independently selects the original complete local identity/digest,
fresh native factories/current permissions, distinct journal/source namespaces,
current synchronous authority, optional actual signal and host-reacquired writer
authority. Files and progress records select neither factories nor permissions.
Inputs are snapshotted and actual storage/lock context is pinned before callbacks.
Runtime opening custody reserves the actual namespaces before authority callbacks.

The new plan, cut-intent and native-head formats are explicitly tagged
`breditor/shared-independent-local-operation-plan`,
`breditor/shared-independent-local-operation-cut-intent` and
`breditor/shared-independent-local-operation-head`, each version 1. Their identity
binds both destination names and the exact original selection. No old format is
upgraded or reinterpreted.

The journal uses only `local_operation_intent`, `local_operation_original` and
`local_operation_cuts` at schema version 1. The native source uses only
`local_operation_history_files` and `local_operation_history_heads`. Ordinary
local, delivery and older operation openers refuse those schemas. Ordinary
local-only capture must not silently export an operational source as if its
native pair were complete operational provenance.

## Prepare publish and acknowledge

A source save first retains the exact pending native head and immutable files
in the journal. It then publishes that same pair in the source's existing atomic
head/file transaction. Only an exact readback permits journal acknowledgement.
The native pair includes the local version catalog; no dependent outbox is hidden
outside that commit in this local-only family.

Intent advances by exactly one prepare or one acknowledgement. A pending cut is
never replaced by a newer one before acknowledgement. Acknowledgement retains the
new current cut and retires only the superseded save-cut row; native history,
original bytes and outstanding offline work are not pruned. Reads check bounded
row counts before cloning values, exact keys/schema, canonical cut hashes and the
actual complete source table.

Cold selection reconciles the acknowledged/pending journal with actual source
bytes. It may finish a prepared write or acknowledge a published write whose
acknowledgement was interrupted. It never silently repairs a missing acknowledged
source or immutable file. Both native lanes replay under the genuine original
ancestry guard before constructor autosave. A ready-shaped row is not an owner.

Actual transaction cancellation subscribes to the selected signal while each
journal write is active. Native first-save bootstrap and lifetime scopes retain
their separate subscriptions. Revocation after a transaction commits preserves
its exact unacknowledged state for retry; it is not a cross-database rollback.

## Actual ownership and readable work

An opening reservation is issued by the genuine journal before native open. Only
the actual source registered with that same driver can claim it after successful
constructor autosave. Serialized fields, structural fake journals and public
facade replacements cannot issue custody. A journal has at most one opening or
live source owner.

The journal owns its separately admitted original archive and read-only native
origin. The source retains that real custody through later saves, cold native
replay and source handoff. Disposing a retired coordinator must not dispose those
source-owned resources. Source release settles actual persistence and native
writer leases before releasing the journal. Failed cleanup remains reachable
for explicit retry without deleting durable data.

Loss of write authority does not hide the source's readable native recovery.
Separately authorized read scopes retain the original/provider and journal while
actual reads settle; they cannot select a persistence path or grant writes.
Exporting the raw native pair is data, not a complete portable operation archive.

## Remaining participant and room work

This source journal does not own the complete upload store. The operational
participant parent must join it with actual whole-upload custody, original-only
provider bytes, complete retained recovery and final source-stamp barriers.
Five-family native staging/adoption, historic-copy disposition, provider/client
reconciliation and authenticated activation remain required. Existing native
history/byte limits stay unchanged; this contract does not lift the retained-Undo
ceiling or provide unlimited operational lifetime.

## Required functional verification

Both candidate profiles require the local journal contracts, strict private API
fences and fixed source/fresh-installed matrices. The native domain is five
compiler profiles, three selection scopes, all eight capability masks and four
independent history pairs: 480 cases. Each case owns its original and native
source, receives later peer document/comment work and compares future Undo/Redo
with a reference writer that is never live at the same time.

Every case appends a version, interrupts an explicitly scheduled save boundary,
reopens under fresh policy and finishes read-only with the same original bytes.
All six prepare/native/acknowledge abort/lost-ack boundaries run 80 cases each.
The 80 failed prepares are explicitly retried in the live source before discard;
they are not counted as crash-durable unsaved work. The other 400 interruptions
exercise actual cold recovery from retained pending or committed cuts.

Focused laws separately cover actual native fork refusal before autosave,
non-overwriting schema/row admission, missing acknowledged data, bounded reads,
cancellation at request success, source/read reservations, final callback
freshness and explicit cleanup retry. One retained development regression proves
that a fresh read scope must not default to an expired write signal. Controlled
IndexedDB, locks and PNG presentation are functional fixtures, not platform
durability or performance qualification.

The [2026-10-22 selected qualification](qualification/2026-10-22-independent-local-operation-journal.json)
retains frozen-source and fresh-installed results, matching archives and the
unchanged development regression/control. It covers 47 selected checks from the
312-check plan, not the full candidate plan or V1 approval.
