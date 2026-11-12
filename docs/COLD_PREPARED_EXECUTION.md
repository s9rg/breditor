# Explicit cold start from a prepared execution

A service can restart while Native activation is still pending, before the
client has written its first local run event. The existing
`ColdRoomExecutionAttempt.resume` deliberately opens an existing run journal;
it refuses a missing journal. The new restart owner initially used that route
for both cases, so it could not start a prepared but unstarted execution.

The focused seven-family reproduction confirms `room_execution_missing`, no
new database and unchanged original bytes. The pre-fix test then fails because
the separate prepared-start action is absent. The failed log is retained as
`target/prepared-cold-start-before-fix.log` (154,727 ms). This establishes the
local execution gap separately from the complete Native process workflow.

## Action contract

`ColdRoomExecutionAttempt.beginPrepared` selects an absent-only start from the
existing independently selected immutable preparation/execution. Construction
still performs no storage or actor acquisition. First preview validates that
preparation and its concrete source plan, then creates the original run format's
start journal using its existing absent-only transaction. Fresh actor acquisition,
original source reconstruction and the complete preview follow. Fresh execution
and promotion decisions still precede a replacement owner.

An occupied run namespace refuses intact, including an exact matching journal.
An uncertain successful creation is retained. After closing that attempt, the
caller must explicitly select existing-only `resume`; the fresh action never
silently changes its meaning to reopen old data. Successful preview can be retried
on the same actual owner without creating another journal.

Promotion closes the journal before the final actor transfer. If transfer
fails at that point, the same attempt can reopen only the existing journal
with the head it verified before closing. A missing or changed journal
requires a new recovery decision. Retrying promotion still requires a fresh
approval and the complete source, target, asset and actor checks.

`JointRoomReassociationAttempt.beginPrepared` composes this explicit action with
the original joint intent. It does not infer a mode from stored phases. The
ordinary `begin`/`resume` paths retain their existing-only execution semantics.
Complete original Native/provider/packet/raster checks and independent Native,
metadata and publication barriers remain required.

## Inspect a run after interruption

`observeRoomRunJournal` takes the independently retained run identity and
current storage authority. It reserves the journal namespace, validates the
exact identity and full event chain, and releases the reservation before
returning DATA. An absent probe aborts the version-zero transaction. Existing
rows, source stores, target stores and actor locks remain outside this action.

After interruption during the first preview, an existing journal reports the
durable START event even when the original client never recorded the result.
Use an explicit existing-only resume with fresh approval in this case. An
absence observation supplies current evidence for considering an explicit
prepared start. Busy, corrupt, foreign and unavailable storage fail the
observation. A competing change can make either observation stale, so the next
operation still performs its ordinary admission checks.

## Qualification

`scripts/cold-room-prepared-start.test.mjs` checks the original missing-journal
refusal and no writes, constructor laziness, a fresh initial event, namespace
competition/refusal, declined execution, seven genuine reconstructed clients,
exact original document/comment checkpoints and future Undo/Redo, and refusal
to overwrite the journal after its first owner releases it. The corrected source case passes (410,320 ms), including all seven future
document/comment Undo/Redo comparisons. Full SDK and strict private API types
pass. The same case passes independently installed packages. Main source and its
standalone installed-consumer command also pass, including strict private
declarations and exact generated output (2,879 matching installed dist files).
The promotion retry case interrupts the genuine transfer just after journal
close. It checks that the journal and original stores remain byte-identical
and that a fresh promotion approval still precedes transfer.

Run `npm run test:collaboration:prepared-cold-start` for the source case and
`npm run test:collaboration:prepared-cold-start:installed` for the separate
independently packed/offline-installed case. The latter preserves the exact
assertions and only reverses their installed module/resource locations.

## Main integration boundary

The local executor and `JointRoomReassociationAttempt.beginPrepared`
composition are integrated. The repeated Native workflow passes from source
and installed packages. Its first relay crash precedes the initial Native
commit. Its second follows metadata continuation. It verifies four preserved
metadata stores, delivery of fourteen offline streams and future document and
comment Undo/Redo for all seven participants.

## Retained integration evidence

[2026-11-04-prepared-cold-start.json](qualification/2026-11-04-prepared-cold-start.json)
records the source/installed scope and limits. The local proof has 111 references
as 66 deduplicated, read-back-verified objects plus the exact executed main source
archive (all 8,306 file contents checked), totaling 69,164,465 compressed bytes.
Its immutable index SHA-256 is
`33d8fdc9d71a220a032db12be6f0f71597b6771b7a8db82b3e01df8461c431d7`.
The case did not persist its original in-memory client IDB snapshots or physical
Blob construction; it retains exact executable source and installed artifacts for
reproducing a fresh workload. All thirteen V1 gates remain open.
