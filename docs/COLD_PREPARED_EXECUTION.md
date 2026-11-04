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

`JointRoomReassociationAttempt.beginPrepared` composes this explicit action with
the original joint intent. It does not infer a mode from stored phases. The
ordinary `begin`/`resume` paths retain their existing-only execution semantics.
Complete original Native/provider/packet/raster checks and independent Native,
metadata and publication barriers remain required.

## Qualification

`scripts/cold-room-prepared-start.test.mjs` checks the original missing-journal
refusal and no writes, constructor laziness, a fresh initial event, namespace
competition/refusal, declined execution, seven genuine reconstructed clients,
exact original document/comment checkpoints and future Undo/Redo, and refusal
to overwrite the journal after its first owner releases it. The corrected source case passes (410,320 ms), including all seven future
document/comment Undo/Redo comparisons. Full SDK and strict private API types
pass. Independent installation and the full pending/repeated Native workflow
remain separate qualification.

No original serialized format or default is changed. The implementation remains
isolated until source, independent installation and composed workflow checks
prove its scope. No V1 or historical archive/WebKit repair is claimed.

Run `npm run test:collaboration:prepared-cold-start` for the source case and
`npm run test:collaboration:prepared-cold-start:installed` for the separate
independently packed/offline-installed case. The latter preserves the exact
assertions and only reverses their installed module/resource locations.
