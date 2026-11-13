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

This action serves local segmented sessions. Relay and room catalog admission,
independent comment and server-log continuation, and physical browser
durability still require qualification.
