# Independent operation save journal

The private operation journal preserves one acknowledged source cut and at most
one exact pending cut alongside the immutable original participant file. A cut
contains both native histories, local versions, relay receipts and all selected
suggestion, revision and version records. A pending cut retains its native files,
not merely hashes that cannot reconstruct an interrupted save.

This implements durable source intent on the actual editor persistence path.
The private [operational participant owner](INDEPENDENT_OPERATION_PARTICIPANT.md)
now joins genuine completed recovery, this source and whole-upload custody.
Portable operational export and room adoption remain the next integration
boundary. No new operation API is exported from the package root.

## Explicit storage and factory selection

`IndependentOperationCutJournal.begin` and `resume` require the prepared genuine
participant, fresh host writer-recovery acknowledgement and separately selected
journal/source database names. Those names cannot alias the recovery coordinator
or its source/upload destinations. The operation plan pins the original recovery
plan and both new names. The host supplies native factories and current policy;
stored bytes never choose them or authenticate a writer.

The journal uses a distinct version-one schema: `operation_intent`,
`operation_original` and `operation_cuts`. It never upgrades an existing database.
The source uses separate `operation_history_files` and `operation_history_heads`
stores. Old source readers refuse this schema. Neither old source schemas nor
existing head formats are migrated implicitly.

The closed `breditor/shared-independent-operation-head` envelope binds the exact
operation and original-file digests to the complete existing delivery head.
Original native checkpoints, packets, relay transports and their bounds keep
their existing meanings. Factory-only private selection, not an envelope marker
or a public `ready` property, chooses this new storage driver.

## Prepare publish and acknowledge

The source keeps its existing single pending attempt and compare-and-update
transaction. The journal adds three ordered persistence steps:

1. Validate and hash the complete captured cut. Atomically retain it as the
   journal's pending cut before publishing any source head or native file.
2. Commit the actual source cut. Both histories and the selected delivery records
   still share the original source transaction; native files remain immutable.
3. Atomically advance the journal to that exact acknowledged cut, clear pending
   intent and remove only an unreferenced older journal cut.

The immutable original is never deleted by these transitions. The journal keeps
at most two complete cuts, with checked monotonic revision counters. Initial,
prepared and acknowledged records have distinct valid counter/slot combinations.
Unknown fields, extra rows, missing referenced cuts, changed original bytes and
unexpected plans refuse. Cut hashes cover exact ordered head/file strings with
separate domains.

These are separate IndexedDB transactions, not a cross-database atomic commit.
A crash or lost acknowledgement can leave the source at the acknowledged cut or
at the exact pending cut. No other source state may be adopted automatically.

## Cold pending replay

Source selection happens under the actual document and comment writer leases,
before a native factory or constructor autosave can publish new state. The journal
reads and validates its retained original and complete current/pending cuts. The
actual source must match one of those exact states.

When a pending cut exists, both native lanes replay that pending pair through
the host-selected original/segmented factories. The observed source head remains
the compare-and-update expectation; selecting newer native data does not relabel
the older stored head. Genuine native-origin and packet admission run before
initial autosave. The normal save path then finishes the exact attempt.

If the source already committed that pending cut, retry does not rewrite its
native files. If journal acknowledgement also committed before its response was
lost, both source publication and journal acknowledgement are no-ops. A failed
constructor releases its actual native leases while keeping the unclaimed
journal available for an explicit retry.

An acknowledged missing or foreign source is not silently reconstructed. The
retained complete cut remains recovery data for a later explicit recovery path.
Unknown source state or a valid native branch with missing queued records is
refused before autosave.

## Legitimate pending work changes

The journal records cuts produced by the actual owned source and retained-store
APIs. It does not replay old outbox rows over a newer acknowledged state. New
offline proposals, revisions, decisions, version packets and local versions stay
in the same cut as their native source.

Existing Stop retrying and Forget actions keep their existing checks. Several
actions may coalesce into one save; a later cold open preserves their final
state rather than resurrecting cancelled work from the original participant.
Conversely, removing queued records directly from an otherwise valid stored
source does not match the retained journal cut and cannot be autosaved as if it
were a legitimate action.

## Ownership and readable work

A journal is claimed only by the actual source constructed with that exact
private journal binding. Shared historical identity is insufficient to adopt
another genuine source. A source owns its origin replay, retained original and
journal lease after the factory returns. Closing another recovery wrapper must
not dispose those live resources.

Ordinary source close saves first. Explicit discard abandons in-memory unsaved
work but does not delete original, pending or committed data. The source settles
its existing save attempt and native leases before releasing journal ownership.
Journal close also waits for real outstanding snapshot reads before disposing
its original replay or releasing its cooperative lease.

Read-only progress snapshots do not occupy the save serializer. At most eight
such reads may be outstanding; additional readers fail without failing a writer.
An actual paused-read regression reproduces autosave failure under the previous
serializer path and passes with the same assertions after this separation.

Current host checks fence writes before and after asynchronous work and inside
transaction callbacks. Storage and lock contexts are captured before any await;
a factory cannot retarget the open across a changed context. Losing write
authority does not hide the live source's readable native/outbox data from its
genuine internal owner.

## Export and remaining participant integration

Old complete-source and participant exporters refuse this source family: they
would omit its operation journal. Individual native/packet reads and the private
source-data reader are data, not complete portable operational backups. The new
[portable operation capture](INDEPENDENT_OPERATION_PORTABLE.md) retains original,
acknowledged, pending and newer readable work together with the real upload store;
its restore coordinator remains required.

The existing public recovery coordinator still hands off a read-only source and
held whole uploads. The private operational participant joins its genuine
transfer, the new source and continued upload custody under a fresh host policy;
its live source lifetime is separate from the retired recovery wrapper. Portable
operation restore is still required before this family can be promoted. Room
adoption, historical-copy decisions,
provider/client closure, independently segmented server comment logs and fresh
authenticated room activation remain required.

## Required checks and limits

Both candidate profiles require journal contracts, strict public type fences,
the complete source matrix and a fresh installed-package consumer. The same 50
focused laws cover save/startup interruption windows, exact retries, cold
history, offline packets, intentional forgetting, invalid stored state, current
authority, source identity and delayed reads. Installed assertions change only
reversible module/fixture locations; the full matrix probe is copied byte for
byte.

The matrix covers all 640 legal existing native-policy combinations, including
both transports where supported. Every case interrupts a pending version save,
cold-replays it and compares future document/comment Undo/Redo. IndexedDB, locks
and raster presentation are controlled fixtures; the actual histories run in
the normal Rust/Wasm runtime.

Existing native/store bounds remain, including the 1,000-item client Undo
ceiling. Complete bounded cuts are hashed and replayed; storage quota, memory,
latency and physical crash durability still require qualification. Cooperative
Web Locks are not cross-device author fencing. This private source journal is
not full V1 or feature-parity approval.

The [selected functional qualification](qualification/2026-10-22-independent-operation-journal.json)
passes 21 checks from the 258-check plan, including 50 journal laws and the
640-case matrix in both source and fresh installed packages. Six independent
consumers pin matching package archives. The evidence retains an actual failing
previous read serializer and the passing repair under unchanged assertions.
Workspace/diagnostic tests pass 2,647 checks, editor integration passes 385, and
the script suite passes 2,003 with three existing opt-in skips. All thirteen V1
gates remain open; the whole candidate plan was not executed.
