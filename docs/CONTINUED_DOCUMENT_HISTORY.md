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

The Rust and application Wasm methods require host writer custody. The host
must arrange exclusive access and durably retain the selected checkpoint
before exposing the replacement. The existing V1 SDK session and room catalog
do not open version 2. Durable SDK admission, comment and server-log
continuation, and room-wide qualification are separate work.
