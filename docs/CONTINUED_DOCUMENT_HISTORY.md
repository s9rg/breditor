# Continued native document history

An application can explicitly continue a segmented V1 document under the same
writer with `continue_history_guarded`. The action verifies the current
observation, seals the exact active V1 file, and starts a new generation.
It preserves the original root, previous seals, the writer counter, pending
imports, and both Undo stacks. The active V1 file can be empty if the host
already sealed just before requesting continuation. Ordinary seals still require
new history entries.

Use `continued_history_checkpoint` and `restore_continued_history` with this
profile. The archive uses format version 2 and records the number of sealed
files before the new history begins in `continuedAfter`. Restoration checks
the retained V1 archive budget and replays its original entries under the V1
Undo limit before selecting the continued limit. The V1 save and restore
methods still select version 1.

This bounded profile admits up to 16,000 distinct Undo groups, 256 generations
and 256 MiB of archive JSON. Each native file still admits 1,000 inputs and
16 MiB. An excess refuses atomically. All native operations and offline
receipt positions keep their original meanings. The archive still grows with
retained work and recovery still replays its history.

## SDK storage

Flush the local segmented session, export its V1 recovery cut, and close it.
Call `SharedSegmentedPersistentSession.continueHistory` with that exact export,
the existing database and identity, the native profile, and a fresh generation
ID. The SDK reacquires the document and paired review leases. It replays the
selected document and review, verifies the retained version packets, and writes
the V2 head, the sealed V1 active file, and the exact old head in one strict
IndexedDB transaction. A failed transaction leaves the old cut available.

An exact retry after a lost acknowledgement can reopen the committed V2 cut
while it still matches the requested conversion. Use `openContinued` after
later edits and `exportContinuedRecovery` to capture V2 data. Both open paths
use fresh host policy. An ordinary V1 open refuses a V2 head. The archived V1
head and referenced files remain readable to the migration verifier.

## Backup and restore

Call `flush()` then `exportContinuedBackup()` on a live continued session.
The backup contains the complete committed V2 cut and the retained V1
predecessor, including the original review checkpoint and named versions for
each cut. Asset blobs and provider receipts belong to the enclosing room backup.
The export reads both heads and their referenced files in one IndexedDB
transaction. It refuses while a write is pending or the session changes during
the read.

Use `restoreContinuedRecovery` with both cuts, fresh host editing policy, and
`writerRecovery: "host-reacquired"` after fencing the old writer. The SDK
acquires both local leases, checks the exact sealed V1 document prefix, replays
the two native owners, and checks comment continuity and retained version
packets. It creates a dedicated, previously absent database and commits the
schema, files and both heads in one upgrade transaction. If restore is
interrupted after commit, reopen that destination with `openContinued` and
compare its exported backup to the selected pair.

## Participant and room recovery

Capture a flushed continued session as `{kind: "continued-local", session}`
with `captureSharedGenerationParticipant`. The participant file retains both
native checkpoints, the current version packets and the predecessor's exact
packet prefix, the referenced rasters, and the complete upload store with its
receipts. Existing generation source kinds keep their original record budgets
and layouts.

Use the existing generation participant slot in
`SharedRoomRecoveryCatalogArchiveV2` and supply a `continued-local` recovery
factory with the native profile when staging. The catalog checks the document
prefix against the selected native inventory. A local comment lane without a
relay binding remains explicitly unresolved. Cold staging verifies both
stored heads before reusing the destination.

After participant recovery finishes, call
`OperationalSharedGenerationParticipant.begin` with the recovered owner and
the selected archive. The returned operation retains the original file.
`intoParts()` transfers the local session and upload store for use.
On a cold `resume`, supply the same recovery and operation databases and fresh
host policy. The SDK verifies the exact V1 predecessor, replays the current
document and comment histories against the archived V2 origin, and checks
that the original version packets and upload receipts are still present.
Later edits, seals, version packets and upload acknowledgements survive
reopen. A fork or a replaced predecessor is refused before the session opens.

An independently permitted operational history read verifies both archived
origins and replays the committed, attempted, pending and live document and
review records. It pins the exact V1 predecessor across the entire read.
A failed save and a newer pending edit stay visible as distinct states,
including their retained raster references. The reader holds the current
owner for the duration of the read and does not retry a failed save.

Whole-room record reconstruction, relay bindings for continued history,
independent comment and server-log continuation, and physical browser
durability still require qualification.
